"""Public CSV upload -> cached address conversion -> isolated facility snapshot."""
import argparse
from collections import Counter
import csv
import json
import os
from pathlib import Path

import geocode_security_lights as geo
from facility_collection import CollectionError, facility, in_area
from facility_store import FacilityStore, init_facility_tables, utcnow

BASE = Path(__file__).parent


def seed_cache(cache):
    # Previously verified addresses survive even before the first DB cache exists.
    with (BASE / 'data/mapo-security-lights-geocoded.csv').open(encoding='utf-8-sig', newline='') as stream:
        for row in csv.DictReader(stream):
            cache.setdefault(geo.normalized(row['address']), {
                'status': 'estimated_address', 'lat': float(row['lat']), 'lng': float(row['lng']),
                'matched_address': row['address'], 'geocoded_at': ''})


def database_cache(connection):
    with connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute('''CREATE TABLE IF NOT EXISTS security_light_address_cache (
                address_hash CHAR(64) PRIMARY KEY, normalized_address TEXT NOT NULL,
                result_json TEXT NOT NULL)''')
            cursor.execute('SELECT normalized_address,result_json FROM security_light_address_cache')
            cache = {row['normalized_address']: json.loads(row['result_json']) for row in cursor.fetchall()}
    original = set(cache)
    seed_cache(cache)

    def persist():
        values = [(geo.hashlib.sha256(address.encode()).hexdigest(), address,
                   json.dumps(result, ensure_ascii=False)) for address, result in cache.items()
                  if address not in original and result.get('status') == 'estimated_address']
        if not values:
            return
        with connection() as conn:
            with conn.cursor() as cursor:
                cursor.executemany('''INSERT INTO security_light_address_cache
                    (address_hash,normalized_address,result_json) VALUES (%s,%s,%s)
                    ON DUPLICATE KEY UPDATE normalized_address=VALUES(normalized_address),result_json=VALUES(result_json)''', values)
        original.update(address for address, result in cache.items() if result.get('status') == 'estimated_address')
    return cache, persist


def run_update(store, input_path, directory, cache, lookup, persist):
    attempted_at = utcnow()
    rows, source_sha = geo.load_rows(input_path)
    # This pipeline is for Mapo's standard CSV. Reject a wrong source before replacing a snapshot.
    if any(not any('마포구' in (row.get(key) or '') for key in (geo.ROAD, geo.LOT)) for row in rows):
        raise CollectionError('마포구 주소가 없는 행이 있습니다. 마포구 보안등 표준 원본을 등록해 주세요.')
    if any(not (row.get('데이터기준일자') or '').strip() for row in rows):
        raise CollectionError('데이터기준일자가 없는 행이 있습니다. 기존 자료를 유지합니다.')
    # Retry previous failures on every new upload; only successful coordinates are reusable.
    for address in list(cache):
        if cache[address].get('status') != 'estimated_address':
            del cache[address]
    directory = Path(directory)
    directory.mkdir(parents=True, exist_ok=True)
    calls = 0
    def counted_lookup(query):
        nonlocal calls
        calls += 1
        return lookup(query)
    error = None
    try:
        geo.query_all([r.get(geo.ROAD) for r in rows], cache, counted_lookup, persist)
        fallback = [r.get(geo.LOT) for r in rows
                    if geo.resolve(r, cache)['status'] not in {'estimated_address', 'ambiguous', 'district_mismatch'}]
        geo.query_all(fallback, cache, counted_lookup, persist)
    except geo.ProviderError as exc:
        error = str(exc)
    finally:
        persist()
    output = geo.output_rows(rows, cache, store.area.lat, store.area.lng, store.area.radius_m)
    accepted = [r for r in output if r['geocode_status'] == 'estimated_address']
    rejected = [r for r in output if r['geocode_status'] != 'estimated_address']
    target = [r for r in accepted if r['within_collection_area']]
    for name, subset in [('all_rows.csv', output), ('geocoded.csv', accepted),
                         ('hongdae_1km.csv', target), ('needs_review.csv', rejected)]:
        geo.write_csv(directory / name, subset, list(output[0]))
    summary = {'source_sha256': source_sha, 'source_rows': len(rows), 'geocoded_rows': len(accepted),
               'within_1km_rows': len(target), 'needs_review_rows': len(rejected),
               'status_counts': dict(Counter(r['geocode_status'] for r in output)),
               'requests_this_run': calls, 'error': error, 'db_modified': False,
               'partial': True, 'coordinate_accuracy': 'address_representative_not_lamp_location'}
    def report():
        (directory / 'summary.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    report()
    if error:
        raise CollectionError(error)
    if not target:
        raise CollectionError('대상 반경의 보안등 좌표를 확인하지 못했습니다. 기존 자료를 유지합니다.')
    items = [facility('security_light', r['lat'], r['lng'], r.get('보안등위치명'), r['query_address'],
                      r['id'], r['데이터기준일자'], {
                          'coordinate_source': 'kakao_address', 'coordinate_accuracy': r['coordinate_accuracy'],
                          'coverage': 'partial', 'source_rows': len(rows), 'unresolved_rows': len(rejected),
                          'source_sha256': source_sha, 'query_address': r['query_address'],
                          'matched_address': r['matched_address'], 'geocoded_at': r['geocoded_at']}) for r in target]
    store.save('security_light', in_area(items, store.area), 'success', attempted_at)
    inventory = store.inventory()
    state = inventory['sources']['security_light']
    if state['item_count'] != len(items):
        raise CollectionError('저장 후 보안등 건수가 일치하지 않습니다. 실행 결과를 확인해 주세요.')
    summary.update(db_modified=True, stored_rows=state['item_count'],
                   zones_with_security_lights=sum(bool(z['security_light_count']) for z in inventory['zones']))
    report()
    return summary


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', default=str(BASE / 'data/security-lights-input.csv'))
    parser.add_argument('--output-dir', default='security-light-output')
    args = parser.parse_args()
    try:
        store = FacilityStore()
        with store.connection() as conn:
            with conn.cursor() as cursor:
                init_facility_tables(cursor)
        cache, persist = database_cache(store.connection)
        client = geo.Geocoder(os.environ.get('KAKAO_REST_API_KEY', '').strip().removeprefix('KakaoAK ').strip())
        def lookup(query):
            if not client.key:
                raise geo.ProviderError('KAKAO_REST_API_KEY가 설정되지 않았습니다. 기존 자료를 유지합니다.')
            return client.lookup(query)
        summary = run_update(store, args.input, args.output_dir, cache, lookup, persist)
        print(json.dumps(summary, ensure_ascii=False), flush=True)
        return 0
    except (CollectionError, geo.ProviderError, ValueError, OSError):
        print('보안등 갱신 실패: 원본 형식·주소·API 설정과 summary.json을 확인해 주세요. 이전 시설 자료를 유지합니다.', flush=True)
        return 1
    except Exception:
        # Never print DB connection strings, credentials or raw HTTP exceptions.
        print('보안등 갱신 실패: DB 연결 또는 저장 상태를 확인해 주세요.', flush=True)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
