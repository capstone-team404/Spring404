import csv
import json
from pathlib import Path
import sys

import pytest

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'backend'))
import geocode_security_lights as geo
from update_security_lights import run_update, seed_cache
from update_security_lights import database_cache
from facility_collection import Area, CollectionError


class Store:
    area = Area(37.5572,126.9245)
    def __init__(self): self.items = None; self.saves = 0
    def save(self,source,items,status,attempt):
        assert source == 'security_light' and status == 'success'
        self.items = items; self.saves += 1
    def inventory(self):
        return {'sources':{'security_light':{'item_count':len(self.items)}},
                'zones':[{'security_light_count':len(self.items)}]}


def input_file(tmp_path, addresses):
    path = tmp_path/'input.csv'
    with path.open('w',encoding='utf-8-sig',newline='') as f:
        w = csv.DictWriter(f,fieldnames=['보안등위치명',geo.ROAD,geo.LOT,'데이터기준일자'])
        w.writeheader()
        for i, address in enumerate(addresses):
            w.writerow({'보안등위치명':f'lamp-{i}',geo.ROAD:address,geo.LOT:address,'데이터기준일자':'2026-10-01'})
    return path


def match(query):
    return {'status':'estimated_address','lat':37.5572,'lng':126.9245,'matched_address':query,'geocoded_at':'2026-10-15'}


def test_new_duplicate_and_unchanged_addresses_reuse_coordinates(tmp_path):
    store = Store(); cache = {}; calls = []
    def lookup(q): calls.append(q); return match(q)
    path = input_file(tmp_path,['서울 마포구 동교로 1']*2)
    result = run_update(store,path,tmp_path/'out',cache,lookup,lambda:None)
    assert result['stored_rows'] == 2 and result['requests_this_run'] == 1
    assert len({r['external_id'] for r in store.items}) == 2
    result = run_update(store,path,tmp_path/'again',cache,lookup,lambda:None)
    assert result['requests_this_run'] == 0
    path = input_file(tmp_path,['서울 마포구 동교로 1','서울 마포구 동교로 2'])
    run_update(store,path,tmp_path/'changed',cache,lookup,lambda:None)
    assert calls == ['서울 마포구 동교로 1','서울 마포구 동교로 2']


def test_provider_failure_preserves_snapshot_and_produces_review_files(tmp_path):
    store = Store(); store.items = ['previous']
    def fail(q): raise geo.ProviderError('API 실패')
    path = input_file(tmp_path,['서울 마포구 동교로 1'])
    with pytest.raises(CollectionError): run_update(store,path,tmp_path/'out',{},fail,lambda:None)
    assert store.saves == 0 and store.items == ['previous']
    summary = json.loads((tmp_path/'out/summary.json').read_text(encoding='utf-8'))
    assert not summary['db_modified'] and summary['error'] == 'API 실패'
    assert (tmp_path/'out/needs_review.csv').exists()


def test_previous_failed_matches_are_retried_and_partial_rows_quarantined(tmp_path):
    store = Store(); road='서울 마포구 동교로 1'; missing='서울 마포구 동교로 999'
    cache={geo.normalized(road):{'status':'not_found'}}
    def lookup(q): return match(q) if q==road else {'status':'ambiguous'}
    path=input_file(tmp_path,[road,missing])
    result=run_update(store,path,tmp_path/'out',cache,lookup,lambda:None)
    assert result['stored_rows']==1 and result['needs_review_rows']==1 and result['partial']
    assert store.items[0]['metadata']['unresolved_rows']==1


def test_bad_source_or_empty_csv_never_replaces_snapshot(tmp_path):
    store=Store()
    for addresses in (['서울 강남구 테헤란로 1'],[]):
        path=input_file(tmp_path,addresses)
        with pytest.raises((CollectionError,ValueError)):
            run_update(store,path,tmp_path/'out',{},match,lambda:None)
    assert store.saves==0


def test_zero_target_rows_preserve_snapshot(tmp_path):
    store=Store(); path=input_file(tmp_path,['서울 마포구 동교로 1'])
    cache={geo.normalized('서울 마포구 동교로 1'):{**match('test'),'lat':37.6}}
    with pytest.raises(CollectionError): run_update(store,path,tmp_path/'out',cache,match,lambda:None)
    assert store.saves==0


def test_verified_seed_contains_only_successful_reusable_addresses():
    cache={}; seed_cache(cache)
    assert cache
    assert all(r['status']=='estimated_address' and 33<=r['lat']<=39 for r in cache.values())


def test_database_cache_survives_process_restart_and_does_not_keep_failures(monkeypatch):
    import sqlite3
    from contextlib import contextmanager
    import update_security_lights as updater
    raw=sqlite3.connect(':memory:'); raw.row_factory=sqlite3.Row
    class Cursor:
        def __enter__(self): return self
        def __exit__(self,*args): pass
        def execute(self,sql): self.value=raw.execute(sql)
        def fetchall(self): return self.value.fetchall()
        def executemany(self,sql,values):
            sql=sql.replace('%s','?').split('ON DUPLICATE KEY UPDATE')[0]
            raw.executemany(sql,values)
    class Connection:
        def cursor(self): return Cursor()
    @contextmanager
    def connection():
        yield Connection(); raw.commit()
    monkeypatch.setattr(updater,'seed_cache',lambda cache:None)
    cache,persist=database_cache(connection)
    cache['known']=match('known'); cache['failed']={'status':'not_found'}
    persist(); persist()
    restored,_=database_cache(connection)
    assert restored=={'known':match('known')}
    raw.close()
