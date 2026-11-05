import importlib.util
import sys
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(BACKEND_DIR))
SPEC = importlib.util.spec_from_file_location("hereji_backend_main", BACKEND_DIR / "main.py")
backend_main = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(backend_main)


def test_backend_fallback_uses_min_score_and_explanation_contract():
    zones = [
        {
            "zone_id": 1,
            "min_lat": 37.0,
            "max_lat": 38.0,
            "min_lng": 126.0,
            "max_lng": 126.1,
            "final_safety_score": 4.9,
        },
        {
            "zone_id": 2,
            "min_lat": 37.0,
            "max_lat": 38.0,
            "min_lng": 126.1,
            "max_lng": 126.2,
            "final_safety_score": 1.5,
        },
        {
            "zone_id": 3,
            "min_lat": 37.0,
            "max_lat": 38.0,
            "min_lng": 126.2,
            "max_lng": 126.3,
            "final_safety_score": 3.6,
        },
    ]
    routes = [
        {
            "id": "risky",
            "path": [{"lat": 37.5, "lng": 126.05}, {"lat": 37.5, "lng": 126.15}],
            "durationValue": 500,
            "distanceValue": 900,
        },
        {
            "id": "safe",
            "path": [{"lat": 37.5, "lng": 126.25}],
            "durationValue": 700,
            "distanceValue": 1000,
        },
    ]

    ranked = backend_main.rank_routes_locally(routes, zones)

    assert [route["id"] for route in ranked] == ["safe", "risky"]
    assert ranked[0]["safetyScore"] == ranked[0]["minSafetyScore"] == 3.6
    assert ranked[0]["summary"]
    assert ranked[0]["reason"]


def test_unknown_zone_not_zero_score_or_covered_data():
    zones=[dict(zone_id=1,min_lat=0,max_lat=1,min_lng=0,max_lng=1,final_safety_score=4,score_status='available'),
           dict(zone_id=2,min_lat=0,max_lat=1,min_lng=1,max_lng=2,final_safety_score=0,score_status='insufficient_data')]
    route={'id':'mixed','path':[{'lat':.5,'lng':.5},{'lat':.5,'lng':1.5}]}
    result=backend_main.rank_routes_locally([route],zones)[0]
    assert result['minSafetyScore'] == 4
    assert result['coverageRatio'] == .5
