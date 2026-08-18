import logging
import os

import requests
from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware

try:
    from dotenv import load_dotenv

    load_dotenv()
except ImportError:
    pass

from db import (
    calculate_safety_score,
    calculate_zone_id,
    delete_review,
    get_admin_reported_reviews,
    get_user_activity,
    get_user_liked_reviews,
    get_user_report_history,
    get_user_reviews,
    get_map_zones,
    get_public_safety_zone,
    get_public_safety_zones,
    get_reviews,
    init_tables,
    like_review,
    report_review,
    save_review,
    hide_review_by_admin,
    restore_review_by_admin,
    update_report_status,
    update_review,
    upsert_public_safety_zone,
)
from auth import delete_user_account, login_user, logout_token, require_admin, require_user, require_verified_user, signup_user, update_user_profile, verify_gender
from schemas import AccountDeleteRequest, AdminReportStatusRequest, AdminReviewModerationRequest, GenderVerificationRequest, LoginRequest, ProfileUpdateRequest, PublicSafetyZoneCreate, ReviewCreate, ReviewReportRequest, ReviewUpdate, RouteSafetyRequest, SignupRequest
from review_analysis import build_analysis

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

AI_HOST = os.getenv("AI_HOST")
AI_PORT = os.getenv("AI_PORT")
AI_BASE_URL = os.getenv("AI_BASE_URL")

if not AI_BASE_URL and AI_HOST:
    AI_BASE_URL = f"http://{AI_HOST}:{AI_PORT or '10000'}"

AI_URL = os.getenv("AI_URL") or f"{AI_BASE_URL or 'http://localhost:8001'}/analyze"
AI_ROUTE_URL = (
    os.getenv("AI_ROUTE_URL")
    or f"{AI_BASE_URL or 'http://localhost:8001'}/rank-routes"
)
AI_TIMEOUT = float(os.getenv("AI_TIMEOUT", "60"))

FALLBACK_PENALTY_KEYWORDS = {
    "취객": 0.5,
    "술취": 0.5,
    "폭행": 1.0,
    "범죄": 1.0,
    "칼부림": 1.5,
    "바바리맨": 1.0,
    "스토킹": 1.0,
    "어두": 0.5,
    "무서": 0.5,
    "불안": 0.7,
    "사람이 적": 0.5,
}

FALLBACK_BONUS_KEYWORDS = {
    "깨끗": 0.5,
    "안전": 0.7,
    "좋아": 0.4,
    "추천": 0.4,
    "안심": 0.7,
    "든든": 0.6,
}

app = FastAPI(title="HereJi Safety Map API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup():
    try:
        init_tables()
    except Exception as e:
        logger.exception("Database initialization failed on startup: %s", e)


@app.get("/health")
def health_check():
    return {"status": "ok"}


@app.post("/auth/signup")
def signup(payload: SignupRequest):
    user = signup_user(payload.email, payload.password, payload.nickname)
    token, user = login_user(payload.email, payload.password)
    return {"access_token": token, "token_type": "bearer", "user": user}


@app.post("/auth/login")
def login(payload: LoginRequest):
    token, user = login_user(payload.email, payload.password)
    return {"access_token": token, "token_type": "bearer", "user": user}


@app.get("/auth/me")
def me(user=Depends(require_user)):
    return {"user": user}


@app.post("/auth/verify-gender")
def gender_verification(payload: GenderVerificationRequest, user=Depends(require_user)):
    return {"user": verify_gender(user["id"], payload.test_code)}


@app.post("/auth/logout")
def logout(authorization: str | None = Header(default=None)):
    logout_token(authorization)
    return {"message": "logged out"}


@app.patch("/me/profile")
def update_profile(payload: ProfileUpdateRequest, user=Depends(require_user)):
    return {"user": update_user_profile(user["id"], payload.nickname, payload.profile_image)}


@app.get("/me/activity")
def read_my_activity(user=Depends(require_verified_user)):
    return get_user_activity(user["id"])


@app.get("/me/reviews")
def read_my_reviews(user=Depends(require_verified_user)):
    return {"reviews": get_user_reviews(user["id"])}


@app.get("/me/liked-reviews")
def read_my_liked_reviews(user=Depends(require_verified_user)):
    return {"reviews": get_user_liked_reviews(user["id"])}


@app.get("/me/reports")
def read_my_reports(user=Depends(require_verified_user)):
    return get_user_report_history(user["id"])


@app.delete("/me/account")
def delete_my_account(payload: AccountDeleteRequest, user=Depends(require_user)):
    if not payload.confirm:
        raise HTTPException(status_code=400, detail="탈퇴 확인이 필요합니다.")
    delete_user_account(user["id"])
    return {"message": "deleted"}


@app.get("/admin/reports")
def read_admin_reports(status: str = "pending", _admin=Depends(require_admin)):
    return {"reports": get_admin_reported_reviews(status)}


@app.patch("/admin/reports/{review_id}/{reporter_user_id}")
def moderate_report(
    review_id: int,
    reporter_user_id: int,
    payload: AdminReportStatusRequest,
    admin=Depends(require_admin),
):
    try:
        update_report_status(review_id, reporter_user_id, payload.status, admin["id"])
        return {"message": "updated"}
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.patch("/admin/reviews/{review_id}/hide")
def hide_admin_review(
    review_id: int,
    payload: AdminReviewModerationRequest,
    admin=Depends(require_admin),
):
    try:
        hide_review_by_admin(review_id, admin["id"], payload.reason)
        return {"message": "hidden"}
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e))


@app.delete("/admin/reviews/{review_id}")
def delete_admin_review(
    review_id: int,
    payload: AdminReviewModerationRequest,
    admin=Depends(require_admin),
):
    """MVP 관리자 삭제는 복구 가능한 soft delete로 처리한다."""
    try:
        hide_review_by_admin(review_id, admin["id"], payload.reason or "관리자 검토 후 삭제")
        return {"message": "deleted", "recoverable": True}
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e))


@app.patch("/admin/reviews/{review_id}/restore")
def restore_admin_review(review_id: int, admin=Depends(require_admin)):
    try:
        restore_review_by_admin(review_id, admin["id"])
        return {"message": "restored"}
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e))


def call_ai(text, user_score=None):
    try:
        res = requests.post(
            AI_URL,
            json={"review": text, "user_score": user_score},
            timeout=AI_TIMEOUT,
        )
        res.raise_for_status()
        data = res.json()
        required = {
            "ai_score", "tags", "summary", "confidence", "reliability_status",
            "reliability_reasons", "reliability_weight", "analysis_source",
        }
        if required.issubset(data):
            return data
        return build_analysis(text, user_score, data, "openai")
    except Exception as e:
        logger.exception("AI review analysis failed: %s", e)
        return build_analysis(text, user_score, source="rule_fallback")


@app.post("/review")
def create_review(review: ReviewCreate, user=Depends(require_verified_user)):
    analysis = call_ai(review.content, review.user_score)

    try:
        zone_id, review_id = save_review(review, analysis, user["id"])
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.exception("Failed to save review: %s", e)
        raise HTTPException(status_code=500, detail="Failed to save review")

    safety_score = calculate_safety_score(zone_id)

    return {
        "message": "saved",
        "data": {
            "content": review.content,
            "id": review_id,
            "user_id": user["id"],
            "zone_id": zone_id,
            "lat": review.lat,
            "lng": review.lng,
            "user_score": review.user_score,
            "ai_score": analysis["ai_score"],
            "ai_summary": analysis["summary"],
            "ai_tags": analysis["tags"],
            "ai_confidence": analysis["confidence"],
            "reliability_status": analysis["reliability_status"],
            "reliability_reasons": analysis["reliability_reasons"],
            "reliability_weight": analysis["reliability_weight"],
            "analysis_source": analysis["analysis_source"],
            "photos": [photo.model_dump() for photo in review.photos],
            "public_safety_score": safety_score["public_safety_score"],
            "final_safety_score": safety_score["final_safety_score"],
        },
    }


def find_zone_id_for_point(point, zones):
    lat = point.get("lat")
    lng = point.get("lng")
    if lat is None or lng is None:
        return None

    for zone in zones:
        if (
            zone["min_lat"] <= lat < zone["max_lat"]
            and zone["min_lng"] <= lng < zone["max_lng"]
        ):
            return zone["zone_id"]

    return None


def rank_routes_locally(routes, zones):
    zone_scores = {
        zone["zone_id"]: float(zone.get("final_safety_score") or 0)
        for zone in zones
    }
    ranked = []

    for route in routes:
        zone_ids = []
        seen_zone_ids = set()

        for point in route.get("path", []):
            zone_id = find_zone_id_for_point(point, zones)
            if zone_id is not None and zone_id not in seen_zone_ids:
                seen_zone_ids.add(zone_id)
                zone_ids.append(zone_id)

        scores = [zone_scores[zone_id] for zone_id in zone_ids if zone_id in zone_scores]
        total_score = sum(scores)
        average_score = total_score / len(scores) if scores else 0.0
        min_score = min(scores) if scores else 0.0
        matched_point_count = sum(
            1 for point in route.get("path", []) if find_zone_id_for_point(point, zones) is not None
        )
        path_length = len(route.get("path", []))
        coverage_ratio = matched_point_count / path_length if path_length else 0.0

        if coverage_ratio < 0.5:
            summary = "안전 데이터가 부족해 참고용으로만 확인해 주세요."
            reason = (
                f"전체 경로의 {coverage_ratio * 100:.0f}%만 안전 데이터로 분석되어 "
                "다른 후보와 정확히 비교하기 어렵습니다."
            )
        else:
            summary = "가장 취약한 구간의 점수를 기준으로 비교한 경로예요."
            reason = (
                f"최저 안전점수 {min_score:.2f}점과 평균 {average_score:.2f}점을 "
                "기준으로 안전 취약 구간을 우선 비교했습니다."
            )

        ranked.append(
            {
                **route,
                "zoneIds": zone_ids,
                "totalSafetyScore": round(total_score, 2),
                "averageSafetyScore": round(average_score, 2),
                "minSafetyScore": round(min_score, 2),
                "safetyScore": round(min_score, 2),
                "coverageRatio": round(coverage_ratio, 3),
                "lowScoreZoneCount": sum(score < 2.5 for score in scores),
                "summary": summary,
                "reason": reason,
            }
        )

    return sorted(
        ranked,
        key=lambda route: (
            route.get("minSafetyScore") or 0,
            route.get("averageSafetyScore") or 0,
            -(route.get("durationValue") or 0),
            -(route.get("distanceValue") or 0),
        ),
        reverse=True,
    )


@app.post("/routes/safety-rank")
def rank_routes_by_safety(payload: RouteSafetyRequest, _user=Depends(require_verified_user)):
    try:
        zones = get_map_zones()
        routes = [route.model_dump() for route in payload.routes]
    except Exception as e:
        logger.exception("Failed to prepare route safety data: %s", e)
        raise HTTPException(status_code=500, detail="Failed to prepare route safety data")

    ai_payload = {
        "routes": [
            {
                "id": route["id"],
                "path": route["path"],
                "durationValue": route.get("durationValue") or 0,
                "distanceValue": route.get("distanceValue") or 0,
            }
            for route in routes
        ],
        "zones": [
            {
                "zone_id": zone["zone_id"],
                "min_lat": zone["min_lat"],
                "max_lat": zone["max_lat"],
                "min_lng": zone["min_lng"],
                "max_lng": zone["max_lng"],
                "final_safety_score": zone["final_safety_score"],
                "cctv_count": zone.get("cctv_count") or 0,
                "lamp_count": zone.get("lamp_count") or 0,
                "convenience_count": zone.get("convenience_count") or 0,
                "police_count": zone.get("police_count") or 0,
            }
            for zone in zones
        ],
    }

    try:
        res = requests.post(AI_ROUTE_URL, json=ai_payload, timeout=5)
        res.raise_for_status()
        ai_ranked = res.json().get("routes", [])
        route_by_id = {route["id"]: route for route in routes}
        ranked = []

        for ai_route in ai_ranked:
            original = route_by_id.get(ai_route.get("id"))
            if original is None:
                continue
            ranked.append({**original, **ai_route})

        missing_routes = [
            route for route in routes if route["id"] not in {item["id"] for item in ranked}
        ]
        if missing_routes:
            ranked.extend(rank_routes_locally(missing_routes, zones))

        return {"routes": ranked, "source": "ai"}
    except Exception as e:
        logger.exception("AI route ranking failed, using local fallback: %s", e)
        return {"routes": rank_routes_locally(routes, zones), "source": "backend-fallback"}


@app.get("/reviews")
def read_reviews(sort: str = "latest", _user=Depends(require_verified_user)):
    try:
        return get_reviews(sort)
    except Exception as e:
        logger.exception("Failed to read reviews: %s", e)
        raise HTTPException(status_code=500, detail="Failed to read reviews")


@app.patch("/reviews/{review_id}")
def edit_review(review_id: int, payload: ReviewUpdate, user=Depends(require_verified_user)):
    try:
        analysis = call_ai(payload.content, payload.user_score) if payload.content is not None else None
        update_review(review_id, payload, user["id"], analysis)
        return {"message": "updated", "data": analysis}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))


@app.delete("/reviews/{review_id}")
def remove_review(review_id: int, user=Depends(require_verified_user)):
    try:
        delete_review(review_id, user["id"])
        return {"message": "deleted"}
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))


@app.post("/reviews/{review_id}/like")
def like(review_id: int, user=Depends(require_verified_user)):
    try:
        return {"like_count": like_review(review_id, user["id"])}
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e))


@app.post("/reviews/{review_id}/report")
def report(review_id: int, payload: ReviewReportRequest, user=Depends(require_verified_user)):
    try:
        return report_review(review_id, user["id"], payload.reason, payload.detail)
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e))


@app.get("/zones/by-location")
def read_zone_by_location(lat: float, lng: float):
    zone_id = calculate_zone_id(lat, lng)
    if zone_id is None:
        raise HTTPException(status_code=404, detail="Location is outside the map area")
    return {"zone_id": zone_id, "lat": lat, "lng": lng}


@app.post("/public-safety-zones")
def save_public_safety_zone(zone: PublicSafetyZoneCreate):
    try:
        upsert_public_safety_zone(zone)
    except Exception as e:
        logger.exception("Failed to save public safety zone: %s", e)
        raise HTTPException(status_code=500, detail="Failed to save public safety zone")

    return {"message": "saved", "data": zone}


@app.get("/public-safety-zones")
def read_public_safety_zones():
    try:
        return get_public_safety_zones()
    except Exception as e:
        logger.exception("Failed to read public safety zones: %s", e)
        raise HTTPException(status_code=500, detail="Failed to read public safety zones")


@app.get("/public-safety-zones/{zone_id}")
def read_public_safety_zone(zone_id: int):
    try:
        zone = get_public_safety_zone(zone_id)
    except Exception as e:
        logger.exception("Failed to read public safety zone: %s", e)
        raise HTTPException(status_code=500, detail="Failed to read public safety zone")

    if zone is None:
        raise HTTPException(status_code=404, detail="Public safety zone not found")

    return zone


@app.get("/map/zones")
def read_map_zones():
    try:
        return get_map_zones()
    except Exception as e:
        logger.exception("Failed to read map zones: %s", e)
        raise HTTPException(status_code=500, detail="Failed to read map zones")


@app.get("/safety-score/{zone_id}")
def read_safety_score(zone_id: int):
    try:
        score = calculate_safety_score(zone_id)
    except Exception as e:
        logger.exception("Failed to calculate safety score: %s", e)
        raise HTTPException(status_code=500, detail="Failed to calculate safety score")

    if score is None:
        raise HTTPException(status_code=404, detail="Public safety zone not found")

    return score
