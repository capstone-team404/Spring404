import sqlite3
import sys
from contextlib import contextmanager
from datetime import timedelta, datetime
from pathlib import Path

import pytest

BACKEND = Path(__file__).resolve().parents[1] / 'backend'
sys.path.insert(0,str(BACKEND))
import db
from collect_facilities import run_collection
from facility_collection import (Area, CollectionError, NotConfigured, SOURCES, collect_cctv,
                                 collect_kakao, collect_lights, facility, in_area, parse_light_csv)
from facility_store import FacilityStore, build_inventory, init_facility_tables, utcnow


AREA = Area(db.HONGDAE_CENTER_LAT,db.HONGDAE_CENTER_LNG)


class Response:
    def __init__(self,data=None,content=b''):
        self.data,self.content = data,content
    def json(self): return self.data
    def raise_for_status(self): pass


class Session:
    def __init__(self,responses): self.responses,self.calls = iter(responses),[]
    def request(self,method,url,**kwargs):
        self.calls.append((method,url,kwargs))
        return next(self.responses)


def point(kind='convenience',identity='1',lat=None,lng=None):
    return facility(kind,lat or AREA.lat,lng or AREA.lng,'test','test address',identity)


def test_circle_filter_and_stable_dedup():
    rows = [point(),point(),point(identity='2',lng=AREA.lng+0.009,lat=AREA.lat+0.007)]
    assert len(in_area(rows,AREA)) == 1  # bounding-square corner is outside circle
    assert len(in_area([point('police',lng=AREA.lng+0.017)],AREA,police=True)) == 1


def test_light_csv_korean_encoding_and_schema():
    csv = f'관리번호,위도,경도\n홍대-1,{AREA.lat},{AREA.lng}\n'
    rows = parse_light_csv(csv.encode('cp949'),'streetlight','2023-12-21')
    assert rows[0]['name'] == '홍대-1'
    assert rows[0]['data_date'] == '2023-12-21'
    for raw in (b'<html>error</html>',b'lat,lng\n',b'lat,lng\nnan,126\n'):
        with pytest.raises(CollectionError): parse_light_csv(raw,'security_light')
    with pytest.raises(NotConfigured): collect_lights(Session([]),AREA,'security_light',{})
    bundled = collect_lights(Session([]),AREA,'security_light',{'SECURITY_LIGHT_CSV_PATH':str(BACKEND/'data/mapo-security-lights-geocoded.csv')})
    assert len(bundled) == 1816
    assert len({item['external_id'] for item in bundled}) == 1816
    assert all(item['metadata']['coverage'] == 'partial' for item in bundled)
    assert all(item['metadata']['coordinate_accuracy'] == 'address_representative_not_lamp_location' for item in bundled)
    # A populated source with no target-area rows is unverified coverage, not zero lights.
    other=b'lat,lng\n37.1,127.1\n'
    with pytest.raises(CollectionError):
        collect_lights(Session([Response(content=other)]),AREA,'security_light',{'SECURITY_LIGHT_CSV_URL':'https://test/csv'})


def cctv_response(rows,total):
    return Response({'response':{'header':{'resultCode':'00'},'body':{'totalCount':total,'items':{'item':rows}}}})


def cctv_row(identity, purpose='생활방범'):
    return {'MNG_NO':identity,'OPN_ATMY_GRP_CD':'test','INSTL_PRPS_SE_NM':purpose,
            'WGS84_LAT':AREA.lat,'WGS84_LOT':AREA.lng,'CAM_CNTOM':'3'}


def test_cctv_paging_purpose_filter_and_installation_count():
    session = Session([cctv_response([cctv_row('1'),cctv_row('2','교통단속')],3),cctv_response([cctv_row('3')],3)])
    rows = collect_cctv(session,AREA,{'DATA_GO_KR_SERVICE_KEY':'abc%2Bxyz'})
    assert len(rows) == 2
    assert rows[0]['metadata']['camera_count'] == '3'
    assert session.calls[0][2]['params']['serviceKey'] == 'abc+xyz'
    assert session.calls[1][2]['params']['pageNo'] == 2


def test_cctv_missing_page_and_api_error_do_not_succeed():
    for responses in ([cctv_response([cctv_row('1')],2),cctv_response([],2)],
                      [Response({'response':{'header':{'resultCode':'30'}}})]):
        with pytest.raises(CollectionError):
            collect_cctv(Session(responses),AREA,{'DATA_GO_KR_SERVICE_KEY':'key'})


def kakao(rows,total=None,pageable=None,end=True):
    return Response({'meta':{'total_count':len(rows) if total is None else total,
                             'pageable_count':len(rows) if pageable is None else pageable,'is_end':end},'documents':rows})


def kakao_row(identity='1',category='가정,생활 > 편의점'):
    return {'id':identity,'y':str(AREA.lat),'x':str(AREA.lng),'place_name':'test','category_name':category}


def test_kakao_subdivides_truncated_search_and_deduplicates():
    session = Session([kakao([],50,45),*[kakao([kakao_row()]) for _ in range(4)]])
    rows = collect_kakao(session,AREA,'convenience',{'KAKAO_REST_API_KEY':'key'})
    assert len(rows) == 1
    assert len(session.calls) == 5
    assert session.calls[0][2]['params']['category_group_code'] == 'CS2'
    assert len({call[2]['params']['rect'] for call in session.calls[1:]}) == 4


def test_kakao_pagination_and_police_category_filter():
    session = Session([kakao([kakao_row('1')],2,2,False),kakao([kakao_row('2')],2,2)])
    assert len(collect_kakao(session,AREA,'convenience',{'KAKAO_REST_API_KEY':'key'})) == 2
    rows = [kakao_row('police','사회,공공기관 > 행정기관 > 경찰서'),kakao_row('cafe','음식점 > 카페')]
    session = Session([kakao(rows) for _ in range(4)])
    assert len(collect_kakao(session,AREA,'police',{'KAKAO_REST_API_KEY':'key'})) == 1


class Cursor:
    def __init__(self,raw): self.raw=raw.cursor()
    def __enter__(self): return self
    def __exit__(self,*args): self.raw.close()
    def execute(self,sql,params=()):
        sql = sql.replace('%s','?').replace('INSERT IGNORE','INSERT OR IGNORE').replace(' FOR UPDATE','')
        sql = sql.replace(', INDEX idx_facility_zone(scope_id,zone_id)','')
        self.raw.execute(sql,params)
    def executemany(self,sql,params): self.raw.executemany(sql.replace('%s','?'),params)
    def convert(self,row):
        if row is None: return None
        value=dict(row)
        for key in ('last_attempt','last_success','collected_at'):
            if isinstance(value.get(key),str): value[key]=datetime.fromisoformat(value[key])
        return value
    def fetchall(self): return [self.convert(row) for row in self.raw.fetchall()]
    def fetchone(self): return self.convert(self.raw.fetchone())


@pytest.fixture
def store():
    raw=sqlite3.connect(':memory:')
    raw.row_factory=sqlite3.Row
    class Connection:
        def cursor(self): return Cursor(raw)
    @contextmanager
    def connection():
        try:
            yield Connection()
            raw.commit()
        except Exception:
            raw.rollback()
            raise
    with connection() as conn:
        with conn.cursor() as cursor: init_facility_tables(cursor)
    raw.execute('CREATE TABLE public_safety_zone(zone_id INT,public_safety_score REAL)')
    raw.execute('INSERT INTO public_safety_zone VALUES(1,3.5)')
    raw.commit()
    value=FacilityStore(connection=connection,context=(AREA,db.build_safety_zones(),'test'))
    value.raw=raw
    yield value
    raw.close()


def test_snapshot_replacement_failure_retention_and_score_unchanged(store):
    now=utcnow()
    store.save('convenience',[point(),point(identity='2')],'success',now)
    store.save('convenience',None,'failed',now+timedelta(seconds=1),'failure')
    assert store.state()['convenience']['item_count'] == 2
    inventory=store.inventory()
    zone=next(z for z in inventory['zones'] if z['zone_id']==db.calculate_zone_id(AREA.lat,AREA.lng))
    assert zone['convenience_count'] == 2
    assert zone['cctv_count'] is None
    assert inventory['sources']['convenience']['stale']
    store.save('convenience',[point()],'success',now+timedelta(seconds=2))
    assert store.state()['convenience']['item_count'] == 1
    assert store.raw.execute('SELECT public_safety_score FROM public_safety_zone').fetchone()[0] == 3.5


def test_failed_transaction_rolls_back_delete_and_timestamp(store):
    now=utcnow()
    store.save('convenience',[point()],'success',now)
    with pytest.raises(sqlite3.IntegrityError):
        store.save('convenience',[point(),point()],'success',now+timedelta(seconds=1))
    assert store.state()['convenience']['last_attempt'] == now
    assert store.raw.execute('SELECT COUNT(*) FROM collected_facility').fetchone()[0] == 1


def test_older_run_cannot_replace_newer_snapshot_and_scope_isolation(store):
    now=utcnow()
    store.save('convenience',[point()],'success',now)
    store.save('convenience',[],'success',now-timedelta(seconds=1))
    assert store.state()['convenience']['item_count'] == 1
    store.scope='other-area'
    assert store.state() == {}
    assert all(z['convenience_count'] is None for z in store.inventory()['zones'])


def test_zero_count_is_distinct_from_uncollected_and_lights_merge(store):
    now=utcnow()
    store.save('convenience',[],'success',now)
    store.save('streetlight',[point('streetlight')],'success',now)
    zone=lambda: next(z for z in store.inventory()['zones'] if z['zone_id']==db.calculate_zone_id(AREA.lat,AREA.lng))
    assert zone()['convenience_count'] == 0
    assert zone()['cctv_count'] is None
    assert zone()['lamp_count'] is None
    assert zone()['lamp_known_count'] == 1
    store.save('security_light',[point('security_light')],'success',now)
    assert zone()['lamp_count'] == 1


def test_police_outside_circle_nearest_distance_and_outside_zones(store):
    store.save('police',[point('police',lng=AREA.lng+0.017)],'success',utcnow())
    inventory=store.inventory()
    zone=next(z for z in inventory['zones'] if z['zone_id']==db.calculate_zone_id(AREA.lat,AREA.lng))
    assert zone['police_count'] == 0
    assert zone['nearest_police_distance_m'] > 1000
    assert all(z['police_count'] is None for z in inventory['zones'] if not z['in_collection_area'])


def test_engine_failure_isolated_and_due_skips_fresh_sources(store):
    def missing(): raise NotConfigured('missing')
    def error(): raise CollectionError('provider error')
    providers={s:lambda:[] for s in SOURCES}
    providers.update(security_light=missing,cctv=error)
    result=run_collection(store,providers)
    assert result['cctv']['status']=='failed'
    assert result['security_light']['status']=='not_configured'
    assert result['convenience']['status']=='success'
    result=run_collection(store,providers,due=True)
    assert result['convenience']['status']=='not_due'
    assert result['cctv']['status']=='retry_later'


def test_engine_does_not_log_or_store_raw_exception_with_credentials(store):
    def broken(): raise RuntimeError('https://api.test/?serviceKey=SECRET')
    result=run_collection(store,{s:broken for s in SOURCES})
    assert 'SECRET' not in str(result)
    assert 'SECRET' not in str(store.state())


def test_partial_geocoded_snapshot_round_trip_and_source_isolation(store):
    rows = collect_lights(Session([]),AREA,'security_light',{'SECURITY_LIGHT_CSV_PATH':str(BACKEND/'data/mapo-security-lights-geocoded.csv')})
    store.save('convenience',[point()],'success',utcnow())
    result = run_collection(store,{'security_light':lambda:rows},sources=['security_light'])
    assert result == {'security_light':{'status':'success','count':1816}}
    inventory = store.inventory()
    assert inventory['sources']['security_light']['partial']
    assert inventory['sources']['security_light']['estimated_coordinates']
    assert inventory['sources']['convenience']['item_count'] == 1
    assert sum(z['security_light_count'] or 0 for z in inventory['zones']) == 1816
    assert all(not z['collection_complete'] and z['lamp_count'] is None for z in inventory['zones'])
    assert store.raw.execute('SELECT public_safety_score FROM public_safety_zone').fetchone()[0] == 3.5
