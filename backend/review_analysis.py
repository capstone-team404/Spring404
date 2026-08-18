import re


TAG_RULES = (
    {"code": "bright_lighting", "label": "밝은 조명", "polarity": "safe", "delta": 0.55, "keywords": ("밝", "조명이 좋", "가로등", "환하")},
    {"code": "cctv", "label": "CCTV", "polarity": "safe", "delta": 0.45, "keywords": ("cctv", "씨씨티비", "방범카메라")},
    {"code": "police_patrol", "label": "경찰·순찰", "polarity": "safe", "delta": 0.65, "keywords": ("경찰", "파출소", "지구대", "순찰")},
    {"code": "busy_area", "label": "유동인구 많음", "polarity": "safe", "delta": 0.4, "keywords": ("사람이 많", "사람 많", "유동인구", "붐비", "활기")},
    {"code": "nearby_facilities", "label": "편의시설", "polarity": "safe", "delta": 0.35, "keywords": ("편의점", "가게", "상가", "24시간")},
    {"code": "well_managed", "label": "관리 상태 양호", "polarity": "safe", "delta": 0.35, "keywords": ("깨끗", "관리 잘", "정돈", "쾌적")},
    {"code": "dark_alley", "label": "어두운 골목", "polarity": "danger", "delta": -0.65, "keywords": ("어두", "어둡", "깜깜", "조명 부족", "가로등 없", "어두운 골목")},
    {"code": "low_foot_traffic", "label": "유동인구 부족", "polarity": "danger", "delta": -0.5, "keywords": ("사람이 적", "사람 없", "인적이 드물", "한산", "외진")},
    {"code": "intoxicated_people", "label": "취객", "polarity": "danger", "delta": -0.7, "keywords": ("취객", "술취", "술 취", "주정")},
    {"code": "threat_or_violence", "label": "위협·폭행", "polarity": "danger", "delta": -1.0, "keywords": ("폭행", "위협", "범죄", "칼부림", "싸움", "시비")},
    {"code": "suspicious_person", "label": "스토킹·수상한 사람", "polarity": "danger", "delta": -0.9, "keywords": ("스토킹", "따라오", "수상한 사람", "바바리맨", "불안")},
    {"code": "poorly_managed", "label": "관리 상태 불량", "polarity": "danger", "delta": -0.4, "keywords": ("더럽", "쓰레기", "관리 안", "방치", "낙서")},
)

ALLOWED_TAGS = {rule["label"] for rule in TAG_RULES}
CONCRETE_KEYWORDS = ("밤", "야간", "새벽", "저녁", "골목", "역", "출구", "공원", "주차장", "화장실", "버스", "지하")


def clamp(value, minimum=0.0, maximum=5.0):
    return max(minimum, min(float(value), maximum))


def normalize_text(text):
    return re.sub(r"\s+", " ", str(text or "")).strip()


def meaningful_length(text):
    return len(re.findall(r"[0-9A-Za-z가-힣]", normalize_text(text)))


def looks_like_spam(text):
    compact = re.sub(r"[^0-9A-Za-z가-힣]", "", normalize_text(text).lower())
    if not compact:
        return True
    if len(compact) >= 6 and len(set(compact)) <= 2:
        return True
    return bool(re.fullmatch(r"(.{1,3})\1{2,}", compact))


def extract_tags(text):
    lowered = normalize_text(text).lower()
    return [rule["label"] for rule in TAG_RULES if any(keyword.lower() in lowered for keyword in rule["keywords"])]


def rule_score(text):
    lowered = normalize_text(text).lower()
    score = 3.0
    for rule in TAG_RULES:
        if any(keyword.lower() in lowered for keyword in rule["keywords"]):
            score += rule["delta"]
    return round(clamp(score), 2)


def normalize_tags(tags, text):
    normalized = []
    for tag in tags or []:
        label = str(tag).strip()
        if label in ALLOWED_TAGS and label not in normalized:
            normalized.append(label)
    for label in extract_tags(text):
        if label not in normalized:
            normalized.append(label)
    return normalized[:5]


def fallback_summary(tags, score, status):
    if status == "rejected":
        return "안전도를 판단하기에 리뷰 내용이 충분하지 않아요."
    if tags:
        joined = "·".join(tags[:2])
        ending = "안심 요소가 확인돼요." if score >= 3.5 else "주의가 필요한 요소가 보여요." if score < 2.5 else "안전 요소를 함께 확인해 주세요."
        return f"{joined} 관련 표현이 있어 {ending}"
    if score >= 3.5:
        return "전반적으로 안전하다고 느낀 경험이 담긴 리뷰예요."
    if score < 2.5:
        return "이동할 때 주의가 필요하다는 경험이 담긴 리뷰예요."
    return "구체적인 안전 근거가 적어 다른 리뷰와 함께 확인해 주세요."


def assess_reliability(text, tags, ai_score, user_score=None, source="rule_fallback"):
    length = meaningful_length(text)
    reasons = []
    if length < 5:
        return 0.1, "rejected", ["의미 있는 리뷰 내용이 5자 미만입니다."], 0.0
    if looks_like_spam(text):
        return 0.1, "rejected", ["반복 문자 또는 의미 없는 내용으로 판단됩니다."], 0.0

    confidence = 0.35
    if length >= 15:
        confidence += 0.15
    else:
        reasons.append("리뷰가 짧아 상황을 충분히 판단하기 어렵습니다.")
    if length >= 30:
        confidence += 0.1
    if tags:
        confidence += 0.15
    else:
        confidence -= 0.15
        reasons.append("조명·사람·시설 등 구체적인 안전 근거가 부족합니다.")
    if any(keyword in normalize_text(text).lower() for keyword in CONCRETE_KEYWORDS):
        confidence += 0.1
    if user_score is not None:
        difference = abs(float(user_score) - float(ai_score))
        if difference <= 1.5:
            confidence += 0.1
        elif difference >= 2.5:
            confidence -= 0.15
            reasons.append("사용자 별점과 텍스트 분석 점수의 차이가 큽니다.")
    if source != "openai":
        confidence -= 0.1
        reasons.append("AI 서버 대신 규칙 기반 분석을 사용했습니다.")

    confidence = round(clamp(confidence, 0.1, 0.95), 2)
    status = "normal" if confidence >= 0.55 else "low"
    weight = confidence if status == "normal" else max(0.25, round(confidence * 0.5, 2))
    return confidence, status, reasons, weight


def build_analysis(text, user_score=None, ai_payload=None, source="rule_fallback"):
    text = normalize_text(text)
    payload = ai_payload or {}
    rules_score = rule_score(text)
    supplied_score = payload.get("ai_score")
    score = rules_score if supplied_score is None else clamp((float(supplied_score) * 0.75) + (rules_score * 0.25))
    score = round(score, 2)
    tags = normalize_tags(payload.get("tags"), text)
    confidence, status, reasons, weight = assess_reliability(text, tags, score, user_score, source)
    summary = str(payload.get("summary") or "").strip()
    if not summary or len(summary) > 120:
        summary = fallback_summary(tags, score, status)
    if status == "rejected":
        summary = fallback_summary(tags, score, status)
    return {
        "ai_score": score,
        "danger_score": round(5.0 - score, 2),
        "tags": tags,
        "summary": summary,
        "confidence": confidence,
        "reliability_status": status,
        "reliability_reasons": reasons,
        "reliability_weight": weight,
        "analysis_source": source,
    }
