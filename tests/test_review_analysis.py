import importlib.util
from pathlib import Path


RULES_FILE = Path(__file__).resolve().parents[1] / "backend" / "review_analysis.py"
SPEC = importlib.util.spec_from_file_location("hereji_review_analysis", RULES_FILE)
analysis = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(analysis)


def test_concrete_danger_review_gets_tags_summary_and_normal_confidence():
    result = analysis.build_analysis(
        "밤 11시에 골목이 너무 어둡고 취객이 여러 명 있어서 혼자 걷기 불안했어요.",
        user_score=1,
    )

    assert "어두운 골목" in result["tags"]
    assert "취객" in result["tags"]
    assert result["ai_score"] < 3
    assert result["summary"]
    assert result["reliability_status"] == "normal"
    assert 0 < result["reliability_weight"] <= 1


def test_meaningless_short_review_is_rejected_and_excluded():
    result = analysis.build_analysis("ㅋㅋㅋ", user_score=5)

    assert result["reliability_status"] == "rejected"
    assert result["reliability_weight"] == 0
    assert result["reliability_reasons"]


def test_vague_review_is_low_confidence_but_keeps_minimum_weight():
    result = analysis.build_analysis("그냥 좋아요", user_score=5)

    assert result["reliability_status"] == "low"
    assert result["reliability_weight"] >= 0.25
    assert result["summary"]


def test_openai_tags_are_limited_to_fixed_vocabulary():
    result = analysis.build_analysis(
        "역 출구 주변에 경찰 순찰이 보여서 안심됐어요.",
        user_score=5,
        ai_payload={
            "ai_score": 4.8,
            "tags": ["경찰·순찰", "임의 생성 태그"],
            "summary": "경찰 순찰이 확인돼 안심 요소가 있어요.",
        },
        source="openai",
    )

    assert "경찰·순찰" in result["tags"]
    assert "임의 생성 태그" not in result["tags"]
    assert result["analysis_source"] == "openai"
