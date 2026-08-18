import json
import os
import sys
from pathlib import Path

import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from openai import OpenAI
from pydantic import BaseModel
AI_DIR = Path(__file__).resolve().parent
if str(AI_DIR) not in sys.path:
    sys.path.insert(0, str(AI_DIR))

from review_analysis import ALLOWED_TAGS, build_analysis

load_dotenv()
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY")
client = OpenAI(api_key=OPENAI_API_KEY) if OPENAI_API_KEY else None

app = FastAPI(title="HereJi AI Scoring API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ReviewInput(BaseModel):
    review: str
    user_score: float | None = None


class RoutePoint(BaseModel):
    lat: float
    lng: float


class RouteInput(BaseModel):
    id: str
    path: list[RoutePoint]
    durationValue: float = 0
    distanceValue: float = 0


class ZoneInput(BaseModel):
    zone_id: int
    min_lat: float
    max_lat: float
    min_lng: float
    max_lng: float
    final_safety_score: float
    cctv_count: int = 0
    lamp_count: int = 0
    convenience_count: int = 0
    police_count: int = 0


class RouteRankInput(BaseModel):
    routes: list[RouteInput]
    zones: list[ZoneInput]


def clamp_score(score: float) -> float:
    return max(0.0, min(float(score), 5.0))


def analyze_review_with_ai(review_text: str) -> dict:
    allowed_tags = ", ".join(sorted(ALLOWED_TAGS))
    system_instruction = (
        "You are a CPTED safety expert for a Korean women's solo travel safety map. "
        "Analyze only the safety evidence in the review and return JSON. "
        "Score safety from 0 to 5, where 5 is very safe. "
        f"Tags must be chosen only from this list: {allowed_tags}. "
        "Write one short Korean summary without claiming safety is guaranteed. "
        'Output format: {"ai_score": 3.5, "tags": ["밝은 조명"], '
        '"summary": "조명이 밝아 야간 이동에 안심 요소가 있어요."}'
    )

    try:
        if client is None:
            raise RuntimeError("OPENAI_API_KEY is not configured")
        response = client.chat.completions.create(
            model=os.getenv("OPENAI_REVIEW_MODEL", "gpt-4o-mini"),
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": system_instruction},
                {"role": "user", "content": review_text},
            ],
            temperature=0.2,
        )
        result = json.loads(response.choices[0].message.content)
        return {
            "ai_score": clamp_score(result.get("ai_score", 3.0)),
            "tags": result.get("tags") or [],
            "summary": result.get("summary") or "",
        }
    except Exception:
        raise


def apply_keyword_penalties(review_text: str, ai_score: float) -> float:
    danger_score = 5.0 - clamp_score(ai_score)
    penalty_keywords = {
        "취객": 0.5,
        "술취": 0.5,
        "폭행": 1.0,
        "범죄": 1.0,
        "칼부림": 1.5,
        "바바리맨": 1.0,
        "스토킹": 1.0,
        "어두": 0.5,
        "무서": 0.5,
    }
    bonus_keywords = {
        "깨끗": 0.5,
        "안전": 0.7,
        "좋아": 0.4,
        "추천": 0.4,
        "안심": 0.7,
        "든든": 0.6,
    }

    for keyword, penalty in penalty_keywords.items():
        if keyword in review_text:
            danger_score += penalty

    for keyword, bonus in bonus_keywords.items():
        if keyword in review_text:
            danger_score -= bonus

    return clamp_score(danger_score)


@app.post("/analyze")
async def analyze_endpoint(payload: ReviewInput):
    try:
        ai_payload = analyze_review_with_ai(payload.review)
        source = "openai"
    except Exception as e:
        print(f"OpenAI review analysis failed, using rule fallback: {e}")
        ai_payload = None
        source = "rule_fallback"
    return build_analysis(payload.review, payload.user_score, ai_payload, source)


def find_zone_id_for_point(point: RoutePoint, zones: list[ZoneInput]) -> int | None:
    for zone in zones:
        if (
            zone.min_lat <= point.lat < zone.max_lat
            and zone.min_lng <= point.lng < zone.max_lng
        ):
            return zone.zone_id

    return None


def build_fallback_explanation(route: dict, rank: int) -> dict:
    min_score = route["minSafetyScore"]
    average_score = route["averageSafetyScore"]
    coverage = route["coverageRatio"]

    if coverage < 0.5:
        return {
            "summary": "안전 데이터가 부족해 참고용으로만 확인해 주세요.",
            "reason": (
                f"전체 경로의 {coverage * 100:.0f}%만 안전 데이터로 분석되어 "
                "다른 후보와 정확히 비교하기 어렵습니다."
            ),
        }

    if rank == 1:
        summary = "가장 취약한 구간의 안전점수가 높은 경로예요."
        reason = (
            f"후보 중 위험 구간을 우선 비교한 결과, 최저 안전점수 {min_score:.2f}점과 "
            f"평균 {average_score:.2f}점으로 가장 안정적인 경로입니다."
        )
    else:
        summary = "일부 구간의 안전점수가 더 낮은 대안 경로예요."
        reason = (
            f"최저 안전점수는 {min_score:.2f}점, 평균은 {average_score:.2f}점이며 "
            "안전 취약 구간을 기준으로 추천 순위가 결정됐습니다."
        )

    return {"summary": summary, "reason": reason}


def generate_route_explanations(ranked_routes: list[dict]) -> dict[str, dict]:
    fallback = {
        route["id"]: build_fallback_explanation(route, index + 1)
        for index, route in enumerate(ranked_routes)
    }
    if client is None or not ranked_routes:
        return fallback

    facts = [
        {
            "id": route["id"],
            "rank": index + 1,
            "min_safety_score": route["minSafetyScore"],
            "average_safety_score": route["averageSafetyScore"],
            "coverage_percent": round(route["coverageRatio"] * 100),
            "low_score_zone_count": route["lowScoreZoneCount"],
            "facility_counts": route["facilityCounts"],
        }
        for index, route in enumerate(ranked_routes)
    ]
    instruction = (
        "You explain route-ranking results for a Korean safety map. Ranking is already fixed by "
        "the deterministic min-score algorithm; never change it. Return only JSON with an "
        "'explanations' array. Each item must contain id, summary, and reason. Write Korean. "
        "Summary must be one short sentence. Reason must be one concrete sentence using only the "
        "provided facts. Do not claim that safety is guaranteed and do not invent crime or facility data."
    )

    try:
        response = client.chat.completions.create(
            model=os.getenv("OPENAI_ROUTE_EXPLANATION_MODEL", "gpt-4o-mini"),
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": instruction},
                {"role": "user", "content": json.dumps(facts, ensure_ascii=False)},
            ],
            temperature=0.2,
        )
        result = json.loads(response.choices[0].message.content)
        for item in result.get("explanations", []):
            route_id = item.get("id")
            summary = str(item.get("summary") or "").strip()
            reason = str(item.get("reason") or "").strip()
            if route_id in fallback and summary and reason:
                fallback[route_id] = {"summary": summary, "reason": reason}
    except Exception as e:
        print(f"OpenAI route explanation failed, using templates: {e}")

    return fallback


@app.post("/rank-routes")
async def rank_routes(payload: RouteRankInput):
    zone_scores = {
        zone.zone_id: clamp_score(zone.final_safety_score)
        for zone in payload.zones
    }
    ranked_routes = []

    for route in payload.routes:
        zone_ids = []
        seen_zone_ids = set()

        for point in route.path:
            zone_id = find_zone_id_for_point(point, payload.zones)
            if zone_id is not None and zone_id not in seen_zone_ids:
                seen_zone_ids.add(zone_id)
                zone_ids.append(zone_id)

        scores = [zone_scores[zone_id] for zone_id in zone_ids if zone_id in zone_scores]
        total_score = sum(scores)
        average_score = total_score / len(scores) if scores else 0.0
        min_score = min(scores) if scores else 0.0
        matched_point_count = sum(
            1 for point in route.path if find_zone_id_for_point(point, payload.zones) is not None
        )
        coverage_ratio = matched_point_count / len(route.path) if route.path else 0.0
        route_zones = [zone for zone in payload.zones if zone.zone_id in seen_zone_ids]

        ranked_routes.append(
            {
                "id": route.id,
                "zoneIds": zone_ids,
                "totalSafetyScore": round(total_score, 2),
                "averageSafetyScore": round(average_score, 2),
                "minSafetyScore": round(min_score, 2),
                "safetyScore": round(min_score, 2),
                "coverageRatio": round(coverage_ratio, 3),
                "lowScoreZoneCount": sum(score < 2.5 for score in scores),
                "facilityCounts": {
                    "cctv": sum(zone.cctv_count for zone in route_zones),
                    "lamp": sum(zone.lamp_count for zone in route_zones),
                    "convenience": sum(zone.convenience_count for zone in route_zones),
                    "police": sum(zone.police_count for zone in route_zones),
                },
                "durationValue": route.durationValue,
                "distanceValue": route.distanceValue,
            }
        )

    ranked_routes.sort(
        key=lambda route: (
            route["minSafetyScore"],
            route["averageSafetyScore"],
            -route["durationValue"],
            -route["distanceValue"],
        ),
        reverse=True,
    )
    explanations = generate_route_explanations(ranked_routes)
    for route in ranked_routes:
        route.update(explanations[route["id"]])
    return {"routes": ranked_routes}


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8001)
