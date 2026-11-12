import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'backend'))
from facility_scoring import score_facilities


def test_unknown_and_estimated_positions_are_not_scored():
    z={'in_collection_area':True,'security_light_count':100,'streetlight_count':None}
    assert score_facilities(z,{'security_light':{'has_data':True,'estimated_coordinates':True}}) == (None,[])
    assert score_facilities({'in_collection_area':False},{}) == (None,[])


def test_partial_missing_is_not_zero_and_stale_is_not_current():
    z={'in_collection_area':True,'cctv_count':0}
    assert score_facilities(z,{'cctv':{'has_data':True,'partial':True}}) == (None,[])
    assert score_facilities(z,{'cctv':{'has_data':True,'stale':True}}) == (None,[])


def test_actual_coverage_and_diminishing_returns():
    src={'cctv':{'has_data':True,'partial':True},'convenience':{'has_data':True}}
    def score(n):return score_facilities({'in_collection_area':True,'cctv_count':n,'convenience_count':1},src)[0]
    assert score(1)<score(2)<score(4)<=5
    assert score(2)-score(1)>score(4)-score(2)


def test_valid_zero_is_not_missing_and_nearer_police_increases_index():
    assert score_facilities({'in_collection_area':True,'convenience_count':0},{'convenience':{'has_data':True}})[0] == 0
    a=score_facilities({'in_collection_area':True,'nearest_police_distance_m':100},{'police':{'has_data':True}})[0]
    b=score_facilities({'in_collection_area':True,'nearest_police_distance_m':800},{'police':{'has_data':True}})[0]
    assert a>b


def test_map_detail_use_collected_data_and_same_score(monkeypatch):
    from contextlib import contextmanager
    from types import SimpleNamespace
    import db,facility_store
    base=dict(zone_id=1,cctv_count=99,lamp_count=99,convenience_count=99,police_count=99,public_safety_score=5,
              row_index=0,col_index=0,min_lat=0,max_lat=1,min_lng=0,max_lng=1)
    class Cursor:
        def execute(self,*args):pass
        def fetchall(self):return [dict(base)]
        def __enter__(self):return self
        def __exit__(self,*args):pass
    @contextmanager
    def connection():yield SimpleNamespace(cursor=Cursor)
    monkeypatch.setattr(db,'get_connection',connection)
    monkeypatch.setattr(db,'get_review_evidence',lambda: {})
    inventory={'sources':{'convenience':{'has_data':True}},'zones':[dict(zone_id=1,in_collection_area=True,convenience_count=1)]}
    monkeypatch.setattr(facility_store,'FacilityStore',lambda:SimpleNamespace(inventory=lambda:inventory))
    result=db.get_map_zones()[0]
    assert result['legacy_cctv_count']==99
    assert result['cctv_count'] is None
    assert result['score_basis']=='facilities'
    assert result['score_policy_version']=='facility-integrated-v1'
    assert result['final_safety_score']==db.calculate_safety_score(1)['final_safety_score']
    assert result['facility_inventory']['score_status']=='integrated_reference'
