"""Replace complete facility-type snapshots for the current configured grid.
Does not modify users or reviews. Run only one importer at a time.
"""
import argparse
import csv
import hashlib
import json
import math
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from db import get_connection, calculate_zone_id, build_safety_zones

TYPES = {"cctv", "lamp", "convenience", "police"}

def validate(path, types):
    counts = Counter()
    seen = set()
    outside = 0
    with path.open(encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        if not {"type", "lat", "lng"}.issubset(reader.fieldnames or []):
            raise ValueError("Required columns: type,lat,lng")
        for index, row in enumerate(reader, 2):
            kind = row["type"].strip().lower()
            if kind not in types:
                raise ValueError(f"Row {index}: unexpected facility type")
            lat, lng = float(row["lat"]), float(row["lng"])
            if not (math.isfinite(lat) and math.isfinite(lng) and -90 <= lat <= 90 and -180 <= lng <= 180):
                raise ValueError(f"Row {index}: invalid coordinates")
            key = (kind, lat, lng)
            if key in seen:
                raise ValueError(f"Row {index}: duplicate coordinates within facility type")
            seen.add(key)
            zone = calculate_zone_id(lat, lng)
            if zone is None:
                outside += 1
            else:
                counts[kind, zone] += 1
    if not counts:
        raise ValueError("No in-grid facilities; refusing empty replacement")
    if any(not any(k[0] == kind for k in counts) for kind in types):
        raise ValueError("Each selected type must contain at least one in-grid facility")
    return counts, outside

def make_rows(existing, zones, counts, types):
    result = []
    for zone in zones:
        zid = zone["zone_id"]
        old = existing.get(zid, {})
        values = {kind: counts.get((kind, zid), 0) if kind in types else int(old.get(kind + "_count", 0)) for kind in TYPES}
        score = min(5.0, values["cctv"]*.25 + values["lamp"]*.08 + values["convenience"]*.12 + values["police"]*1.5)
        result.append((zid, values["cctv"], values["lamp"], values["convenience"], values["police"], score))
    return result

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--file", type=Path, required=True)
    parser.add_argument("--types", nargs="+", choices=sorted(TYPES), required=True)
    parser.add_argument("--source", required=True)
    parser.add_argument("--verification", choices=["unverified_legacy", "verified"], default="unverified_legacy")
    parser.add_argument("--backup-dir", type=Path, required=True)
    parser.add_argument("--apply", action="store_true", help="Without this flag only validates; no database writes")
    args = parser.parse_args()
    selected = set(args.types)
    counts, outside = validate(args.file, selected)
    zones = build_safety_zones()
    summary = {"types": sorted(selected), "in_grid_facilities": sum(counts.values()), "outside_grid": outside, "grid_zones": len(zones)}
    print(json.dumps(summary))
    if not args.apply:
        return
    digest = hashlib.sha256(args.file.read_bytes()).hexdigest()
    # Separate DDL because MySQL DDL can implicitly commit transactions.
    with get_connection() as conn:
        with conn.cursor() as c:
            c.execute("""CREATE TABLE IF NOT EXISTS public_data_import_history (
                id INT AUTO_INCREMENT PRIMARY KEY,
                imported_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                source TEXT NOT NULL, verification_status VARCHAR(40) NOT NULL,
                file_sha256 CHAR(64) NOT NULL, facility_types VARCHAR(100) NOT NULL,
                grid_definition LONGTEXT NOT NULL, summary LONGTEXT NOT NULL,
                backup_file TEXT NOT NULL)""")
    with get_connection() as conn:
        conn.begin()
        with conn.cursor() as c:
            c.execute("SELECT * FROM public_safety_zone FOR UPDATE")
            before = c.fetchall()
            args.backup_dir.mkdir(parents=True, exist_ok=True)
            name = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ") + ".json"
            backup = args.backup_dir / name
            backup.write_text(json.dumps({"rows": before, "grid": zones}, default=str), encoding="utf-8")
            c.execute("SELECT COUNT(*) AS n FROM safety_zone")
            if c.fetchone()["n"] != len(zones):
                raise ValueError("Database grid differs; migrate grid separately before import")
            c.execute("SELECT zone_id,row_index,col_index,min_lat,max_lat,min_lng,max_lng FROM safety_zone ORDER BY zone_id")
            actual = c.fetchall()
            if any(any(abs(float(a[k])-float(b[k])) > 1e-9 for k in b) for a,b in zip(actual,zones)):
                raise ValueError("Database grid coordinates differ; refusing replacement")
            rows = make_rows({r["zone_id"]: r for r in before}, zones, counts, selected)
            c.executemany("""INSERT INTO public_safety_zone
                (zone_id,cctv_count,lamp_count,convenience_count,police_count,public_safety_score)
                VALUES (%s,%s,%s,%s,%s,%s) ON DUPLICATE KEY UPDATE
                cctv_count=VALUES(cctv_count),lamp_count=VALUES(lamp_count),
                convenience_count=VALUES(convenience_count),police_count=VALUES(police_count),
                public_safety_score=VALUES(public_safety_score)""", rows)
            c.execute("""INSERT INTO public_data_import_history
                (source,verification_status,file_sha256,facility_types,grid_definition,summary,backup_file)
                VALUES (%s,%s,%s,%s,%s,%s,%s)""",
                (args.source,args.verification,digest,",".join(sorted(selected)),json.dumps(zones),json.dumps(summary),str(backup)))
    print("Replacement committed with backup and internal provenance record.")

if __name__ == "__main__":
    main()
