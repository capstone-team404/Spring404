"""Transactional, source-specific snapshots separate from public_safety_score."""
import json
from datetime import datetime, timezone

from facility_collection import Area, LABELS, SOURCES, digest, distance_m


def utcnow():
    return datetime.now(timezone.utc).replace(tzinfo=None)


def collection_context():
    import os
    import db
    area = Area(db.HONGDAE_CENTER_LAT, db.HONGDAE_CENTER_LNG, db.GRID_RADIUS_KM*1000,
                float(os.getenv("POLICE_COLLECTION_RADIUS_M", "2000")))
    zones = db.build_safety_zones()
    scope = digest([area.__dict__, zones])
    return area, zones, scope


def init_facility_tables(cursor):
    cursor.execute("""CREATE TABLE IF NOT EXISTS facility_source_state (
        scope_id CHAR(64) NOT NULL, source VARCHAR(30) NOT NULL,
        status VARCHAR(30) NOT NULL, last_attempt DATETIME(6) NULL,
        last_success DATETIME(6) NULL, item_count INT NULL, error_message VARCHAR(500) NULL,
        PRIMARY KEY(scope_id,source))""")
    cursor.execute("""CREATE TABLE IF NOT EXISTS collected_facility (
        scope_id CHAR(64) NOT NULL, source VARCHAR(30) NOT NULL, external_id CHAR(64) NOT NULL,
        kind VARCHAR(30) NOT NULL, zone_id INT NULL, lat DOUBLE NOT NULL, lng DOUBLE NOT NULL,
        name VARCHAR(255) NOT NULL, address VARCHAR(500) NOT NULL, data_date VARCHAR(40) NULL,
        metadata_json TEXT NOT NULL, collected_at DATETIME(6) NOT NULL,
        PRIMARY KEY(scope_id,source,external_id), INDEX idx_facility_zone(scope_id,zone_id))""")


class FacilityStore:
    def __init__(self, connection=None, context=None):
        import db
        self.connection = connection or db.get_connection
        self.area, self.zones, self.scope = context or collection_context()
        self.zone_for_point = db.calculate_zone_id

    def state(self):
        with self.connection() as conn:
            with conn.cursor() as cursor:
                cursor.execute("SELECT * FROM facility_source_state WHERE scope_id=%s", (self.scope,))
                return {row["source"]: row for row in cursor.fetchall()}

    def save(self, source, items, status, attempted_at, error=None):
        if source not in SOURCES or status not in {"success", "failed", "not_configured"}:
            raise ValueError("Invalid source status")
        with self.connection() as conn:
            with conn.cursor() as cursor:
                cursor.execute("INSERT IGNORE INTO facility_source_state (scope_id,source,status) VALUES (%s,%s,'uncollected')",
                               (self.scope,source))
                cursor.execute("SELECT last_attempt FROM facility_source_state WHERE scope_id=%s AND source=%s FOR UPDATE",
                               (self.scope,source))
                previous = cursor.fetchone()["last_attempt"]
                # An older concurrent run cannot overwrite a newer run's snapshot.
                if previous and previous > attempted_at:
                    return
                if status == "success":
                    cursor.execute("DELETE FROM collected_facility WHERE scope_id=%s AND source=%s", (self.scope,source))
                    values = []
                    for item in items:
                        values.append((self.scope,source,item["external_id"],item["kind"],
                                       self.zone_for_point(item["lat"],item["lng"]),item["lat"],item["lng"],
                                       item["name"],item["address"],item["data_date"],
                                       json.dumps(item["metadata"],ensure_ascii=False),attempted_at))
                    if values:
                        cursor.executemany("""INSERT INTO collected_facility
                            (scope_id,source,external_id,kind,zone_id,lat,lng,name,address,data_date,metadata_json,collected_at)
                            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""", values)
                    cursor.execute("""UPDATE facility_source_state SET status=%s,last_attempt=%s,
                        last_success=%s,item_count=%s,error_message=NULL WHERE scope_id=%s AND source=%s""",
                        (status,attempted_at,attempted_at,len(values),self.scope,source))
                else:
                    # Do not delete a previously successful snapshot on provider failure.
                    cursor.execute("""UPDATE facility_source_state SET status=%s,last_attempt=%s,error_message=%s
                        WHERE scope_id=%s AND source=%s""", (status,attempted_at,error,self.scope,source))

    def inventory(self):
        states = self.state()
        with self.connection() as conn:
            with conn.cursor() as cursor:
                cursor.execute("SELECT * FROM collected_facility WHERE scope_id=%s", (self.scope,))
                items = cursor.fetchall()
        return build_inventory(self.area,self.zones,states,items)


def build_inventory(area, zones, states, items):
    sources = {}
    now = utcnow()
    for source in SOURCES:
        state = states.get(source, {})
        success = state.get("last_success")
        status = state.get("status", "uncollected")
        stale = bool(success and (status != "success" or (now-success).total_seconds() > 8*86400))
        metadata = [json.loads(item.get("metadata_json") or "{}") for item in items if item["source"] == source]
        partial = any(m.get("coverage") == "partial" for m in metadata)
        estimated = any(m.get("coordinate_accuracy") == "address_representative_not_lamp_location" for m in metadata)
        sources[source] = {"label":LABELS[source],"status":status,"has_data":bool(success),
                           "partial":partial,"estimated_coordinates":estimated,
                           "invalid_coordinate_rows":max((int(m.get("invalid_coordinate_rows",0)) for m in metadata),default=0),
                           "stale":stale,"last_attempt":state.get("last_attempt"),"last_success":success,
                           "item_count":state.get("item_count"),"error":state.get("error_message"),
                           "data_dates":sorted({item["data_date"] for item in items
                                                if item["source"] == source and item.get("data_date")})}
    by_zone = {}
    police = [item for item in items if item["source"] == "police"]
    for item in items:
        by_zone.setdefault(item["zone_id"],[]).append(item)
    result = []
    for zone in zones:
        center_lat = (zone["min_lat"]+zone["max_lat"])/2
        center_lng = (zone["min_lng"]+zone["max_lng"])/2
        closest_lat = max(zone["min_lat"],min(area.lat,zone["max_lat"]))
        closest_lng = max(zone["min_lng"],min(area.lng,zone["max_lng"]))
        in_scope = distance_m(area.lat,area.lng,closest_lat,closest_lng) <= area.radius_m
        boundary = in_scope and any(distance_m(area.lat,area.lng,lat,lng)>area.radius_m
                                    for lat in (zone["min_lat"],zone["max_lat"])
                                    for lng in (zone["min_lng"],zone["max_lng"]))
        rows = by_zone.get(zone["zone_id"],[])
        counts = {}
        for source in SOURCES:
            # Nearby police outside the target circle support distance only, not local counts.
            counts[source] = sum(1 for item in rows if item["source"] == source
                                 and distance_m(area.lat,area.lng,item["lat"],item["lng"])<=area.radius_m) if in_scope and sources[source]["has_data"] else None
        lights = [item for item in rows if item["source"] in {"streetlight","security_light"}]
        # Exact-location duplicates across datasets count once; close but distinct poles stay distinct.
        light_sites = {(round(item["lat"],7),round(item["lng"],7)) for item in lights}
        lamp_known = len(light_sites) if in_scope and any(sources[s]["has_data"] for s in ("streetlight","security_light")) else None
        lamp_complete = in_scope and all(sources[s]["has_data"] and not sources[s]["partial"] for s in ("streetlight","security_light"))
        nearest = min(police,key=lambda p: distance_m(center_lat,center_lng,p["lat"],p["lng"])) if in_scope and police else None
        result.append({"zone_id":zone["zone_id"],"in_collection_area":in_scope,"boundary_zone":boundary,
                       "cctv_count":counts["cctv"],"streetlight_count":counts["streetlight"],
                       "security_light_count":counts["security_light"],"lamp_count":lamp_known if lamp_complete else None,
                       "lamp_known_count":lamp_known,"convenience_count":counts["convenience"],"police_count":counts["police"],
                       "nearest_police_distance_m":round(distance_m(center_lat,center_lng,nearest["lat"],nearest["lng"]),1) if nearest else None,
                       "nearest_police_name":nearest["name"] if nearest else None,
                       "collection_complete":in_scope and all(s["has_data"] and not s["stale"] and not s["partial"] for s in sources.values()),
                       "score_status":"pending_criteria"})
    return {"area":{**area.__dict__,"distance_type":"straight_line"},"sources":sources,"zones":result,
            "score_status":"pending_criteria","coverage_note":"공개된 시설 목록 기준이며 실제 모든 시설을 보장하지 않습니다."}


def attach_facility_inventory(zones):
    if all('facility_inventory' in zone for zone in zones):
        return zones
    inventory = FacilityStore().inventory()
    indexed = {row["zone_id"]:row for row in inventory["zones"]}
    for zone in zones:
        # Keep legacy score inputs separate. UI reads this nested collected snapshot.
        zone["facility_inventory"] = {**indexed[zone["zone_id"]],"sources":inventory["sources"]}
    return zones
