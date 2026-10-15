"""Facility ingestion only. No safety score is calculated by this module."""
import csv
import hashlib
import io
import json
import math
import os
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import unquote

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry


SOURCES = ("cctv", "streetlight", "security_light", "convenience", "police")
LABELS = {"cctv": "CCTV", "streetlight": "가로등", "security_light": "보안등",
          "convenience": "편의점", "police": "경찰시설"}


class CollectionError(Exception):
    """Safe message, without request URLs or credentials."""


class NotConfigured(CollectionError):
    pass


@dataclass(frozen=True)
class Area:
    lat: float
    lng: float
    radius_m: float = 1000
    police_radius_m: float = 2000

    def __post_init__(self):
        if not (math.isfinite(self.lat) and math.isfinite(self.lng)
                and -90 < self.lat < 90 and -180 <= self.lng <= 180
                and 0 < self.radius_m <= self.police_radius_m <= 20000):
            raise ValueError("Invalid collection area")

    def bounds(self, police=False):
        radius = self.police_radius_m if police else self.radius_m
        dlat = radius / 111000
        dlng = dlat / math.cos(math.radians(self.lat))
        return self.lng - dlng, self.lat - dlat, self.lng + dlng, self.lat + dlat


def distance_m(lat1, lng1, lat2, lng2):
    a, b = math.radians(lat1), math.radians(lat2)
    value = math.sin((b-a)/2)**2 + math.cos(a)*math.cos(b)*math.sin(math.radians(lng2-lng1)/2)**2
    return 6371000 * 2 * math.asin(math.sqrt(min(1, max(0, value))))


def coordinates(lat, lng):
    try:
        lat, lng = float(lat), float(lng)
    except (ValueError, TypeError):
        raise CollectionError("위도·경도가 없는 행이 있습니다. 원본 데이터 확인이 필요합니다.") from None
    if not (math.isfinite(lat) and math.isfinite(lng) and 33 <= lat <= 39 and 124 <= lng <= 132):
        raise CollectionError("WGS84 국내 위도·경도가 아닌 행이 있습니다.")
    return lat, lng


def digest(value):
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True).encode()).hexdigest()


def facility(kind, lat, lng, name="", address="", identity="", data_date=None, metadata=None):
    lat, lng = coordinates(lat, lng)
    name, address = str(name or "").strip(), str(address or "").strip()
    return {"kind": kind, "external_id": digest(identity or [name, address, lat, lng]),
            "lat": lat, "lng": lng, "name": name[:255], "address": address[:500],
            "data_date": str(data_date)[:40] if data_date else None, "metadata": metadata or {}}


def in_area(items, area, police=False):
    radius = area.police_radius_m if police else area.radius_m
    # Stable IDs deduplicate overlapping search rectangles/pages.
    return list({item["external_id"]: item for item in items
                 if distance_m(area.lat, area.lng, item["lat"], item["lng"]) <= radius}.values())


def make_session():
    session = requests.Session()
    retry = Retry(total=2, backoff_factor=0.5, status_forcelist=[429, 500, 502, 503, 504],
                  allowed_methods=["GET", "POST"], respect_retry_after_header=False)
    session.mount("https://", HTTPAdapter(max_retries=retry))
    return session


def request(session, method, url, **kwargs):
    try:
        response = session.request(method, url, timeout=(10, 30), **kwargs)
        response.raise_for_status()
        return response
    except requests.RequestException:
        raise CollectionError("외부 데이터 요청에 실패했습니다. 인증키·쿼터·연결을 확인해 주세요.") from None


def response_json(response):
    try:
        return response.json()
    except ValueError:
        raise CollectionError("외부 서비스가 올바른 JSON을 반환하지 않았습니다.") from None


def collect_cctv(session, area, env=os.environ):
    key = env.get("DATA_GO_KR_SERVICE_KEY", "")
    if not key:
        raise NotConfigured("공공데이터포털 CCTV 인증키가 설정되지 않았습니다.")
    all_items, received, expected = [], 0, None
    # Seoul-wide query includes nearby Seodaemun-gu as well as Mapo-gu.
    for page in range(1, 2001):
        body = response_json(request(session, "GET", "https://apis.data.go.kr/1741000/cctv_info/info", params={
            "serviceKey": unquote(key), "pageNo": page, "numOfRows": 100, "returnType": "json",
            "cond[LCTN_ROAD_NM_ADDR::LIKE]": "서울"}))
        try:
            response = body["response"]
            if str(response["header"]["resultCode"]) not in {"0", "00", "0000"}:
                raise CollectionError("CCTV API가 오류를 반환했습니다. 인증키와 서비스 상태를 확인해 주세요.")
            data = response["body"]
            total = int(data["totalCount"])
            rows = (data.get("items") or {}).get("item") or []
            if isinstance(rows, dict):
                rows = [rows]
            if not isinstance(rows, list) or total < 0:
                raise ValueError()
        except (KeyError, TypeError, ValueError):
            raise CollectionError("CCTV API 응답 구조가 변경됐습니다.") from None
        if expected is None:
            expected = total
            if total == 0:
                raise CollectionError("서울 CCTV 원본 목록이 비어 있습니다. 포함 범위를 확인해 주세요.")
        if total != expected or (not rows and received < expected):
            raise CollectionError("CCTV 목록이 수집 도중 변경되거나 일부 페이지가 누락됐습니다.")
        received += len(rows)
        for row in rows:
            if not isinstance(row, dict) or "INSTL_PRPS_SE_NM" not in row:
                raise CollectionError("CCTV 설치목적 필드가 없습니다. 원본 형식을 확인해 주세요.")
            if not any(word in (row.get("INSTL_PRPS_SE_NM") or "") for word in ("방범", "생활방범", "범죄")):
                continue
            item = facility("cctv", row.get("WGS84_LAT"), row.get("WGS84_LOT"),
                            row.get("MNG_INST_NM"), row.get("LCTN_ROAD_NM_ADDR") or row.get("LCTN_LOTNO_ADDR"),
                            [row.get("OPN_ATMY_GRP_CD"), row.get("MNG_NO")] if row.get("MNG_NO") else "",
                            row.get("DAT_CRTR_YMD"), {"purpose": row.get("INSTL_PRPS_SE_NM"),
                                                      "camera_count": row.get("CAM_CNTOM")})
            all_items.append(item)
        if received == expected:
            return in_area(all_items, area)
        if received > expected:
            raise CollectionError("CCTV 페이지 건수가 일치하지 않습니다.")
    raise CollectionError("CCTV 수집 페이지 한도를 초과했습니다.")


def parse_light_csv(raw, kind, data_date=None):
    for encoding in ("utf-8-sig", "cp949"):
        try:
            text = raw.decode(encoding)
            break
        except UnicodeDecodeError:
            continue
    else:
        raise CollectionError("조명 CSV 인코딩을 읽을 수 없습니다.")
    reader = csv.DictReader(io.StringIO(text))
    fields = reader.fieldnames or []
    aliases = {"lat": ("위도", "WGS84_LAT", "lat", "latitude"),
               "lng": ("경도", "WGS84_LOT", "lng", "longitude"),
               "id": ("관리번호", "관리번호표찰", "id"),
               "name": ("보안등위치명", "시설명", "name", "관리번호"),
               "address": ("소재지도로명주소", "소재지지번주소", "주소", "address"),
               "date": ("데이터기준일자", "data_date")}
    columns = {key: next((a for a in options if a in fields), None) for key, options in aliases.items()}
    if not columns["lat"] or not columns["lng"]:
        raise CollectionError("조명 CSV에 위도·경도 열이 없습니다.")
    result = []
    for row in reader:
        if not any(row.values()):
            continue
        get = lambda key: row.get(columns[key]) if columns[key] else None
        metadata = {key: row[key] for key in
                    ("coordinate_accuracy", "coordinate_source", "coverage", "source_rows", "unresolved_rows")
                    if row.get(key)}
        result.append(facility(kind, get("lat"), get("lng"), get("name"), get("address"),
                               get("id"), get("date") or data_date, metadata))
    if not result:
        raise CollectionError("조명 원본 파일이 비어 있습니다. 기존 자료를 유지합니다.")
    return result


def collect_lights(session, area, kind, env=os.environ):
    prefix = "STREETLIGHT" if kind == "streetlight" else "SECURITY_LIGHT"
    url, path = env.get(prefix + "_CSV_URL"), env.get(prefix + "_CSV_PATH")
    date = env.get(prefix + "_DATA_DATE")
    if path:
        try:
            raw = Path(path).read_bytes()
        except OSError:
            raise CollectionError("설정된 조명 CSV 파일을 읽을 수 없습니다.") from None
    elif url:
        if not url.startswith("https://"):
            raise CollectionError("조명 다운로드 URL은 HTTPS여야 합니다.")
        raw = request(session, "GET", url).content
    elif kind == "streetlight":
        raw = request(session, "POST", "https://datafile.seoul.go.kr/bigfile/iot/inf/nio_download.do?useCache=false",
                      data={"infId": "OA-22205", "seq": "1", "infSeq": "1"}).content
        date = "2023-12-21"
    else:
        raise NotConfigured("보안등 원본 파일은 update_security_lights.py로 변환·갱신해 주세요. 기존 자료를 유지합니다.")
    selected = in_area(parse_light_csv(raw, kind, date), area)
    if not selected:
        raise CollectionError("조명 원본에 대상 지역 지점이 없습니다. 지역 포함 범위를 확인한 CSV가 필요합니다.")
    return selected


def split_bounds(bounds):
    west, south, east, north = bounds
    x, y = (west+east)/2, (south+north)/2
    return [(west,south,x,y), (x,south,east,y), (west,y,x,north), (x,y,east,north)]


def collect_kakao(session, area, kind, env=os.environ):
    key = env.get("KAKAO_REST_API_KEY")
    if not key:
        raise NotConfigured("카카오 REST API 키가 설정되지 않았습니다.")
    headers = {"Authorization": "KakaoAK " + key}
    results, request_count = [], 0
    queries = [None] if kind == "convenience" else ["경찰서", "지구대", "파출소", "치안센터"]

    def search(bounds, query, depth=0):
        nonlocal request_count
        base = {"rect": ",".join(map(str,bounds)), "size": 15}
        if query is None:
            endpoint = "category"
            base["category_group_code"] = "CS2"
        else:
            endpoint = "keyword"
            base.update(query=query, category_group_code="PO3")
        rows = []
        for page in range(1, 46):
            request_count += 1
            if request_count > 1500:
                raise CollectionError("카카오 수집 요청 한도를 초과했습니다. 기존 자료를 유지합니다.")
            data = response_json(request(session, "GET", f"https://dapi.kakao.com/v2/local/search/{endpoint}.json",
                                         params={**base,"page":page}, headers=headers))
            try:
                meta, documents = data["meta"], data["documents"]
                total, pageable = int(meta["total_count"]), int(meta["pageable_count"])
                if not isinstance(documents, list) or not isinstance(meta["is_end"], bool):
                    raise ValueError()
            except (KeyError, TypeError, ValueError):
                raise CollectionError("카카오 응답 구조가 변경됐습니다.") from None
            if total > pageable:
                if depth >= 8:
                    raise CollectionError("밀집 지역의 카카오 검색 결과가 잘렸습니다. 기존 자료를 유지합니다.")
                for child in split_bounds(bounds):
                    search(child, query, depth+1)
                return
            rows.extend(documents)
            if meta["is_end"]:
                if len(rows) < pageable:
                    raise CollectionError("카카오 검색 페이지가 누락됐습니다.")
                for row in rows:
                    category = row.get("category_name") or ""
                    if kind == "police" and not any(t in category.split(" > ") for t in ("경찰서", "지구대", "파출소", "치안센터")):
                        continue
                    if not row.get("id"):
                        raise CollectionError("카카오 시설 식별자가 없습니다.")
                    results.append(facility(kind,row.get("y"),row.get("x"),row.get("place_name"),
                                            row.get("road_address_name") or row.get("address_name"),row["id"],
                                            metadata={"category":category}))
                return
        raise CollectionError("카카오 페이지 한도를 초과했습니다.")

    for query in queries:
        search(area.bounds(police=kind == "police"), query)
    return in_area(results, area, police=kind == "police")


def collectors(session, area, env=os.environ):
    return {"cctv": lambda: collect_cctv(session,area,env),
            "streetlight": lambda: collect_lights(session,area,"streetlight",env),
            "security_light": lambda: collect_lights(session,area,"security_light",env),
            "convenience": lambda: collect_kakao(session,area,"convenience",env),
            "police": lambda: collect_kakao(session,area,"police",env)}
