import logging
import math
import os
import json
from contextlib import contextmanager

import pymysql

try:
    from dotenv import load_dotenv

    load_dotenv()
except ImportError:
    pass

logger = logging.getLogger(__name__)

DB_CONFIG = {
    "host": os.getenv("DB_HOST", "localhost"),
    "user": os.getenv("DB_USER", "root"),
    "password": os.getenv("DB_PASSWORD", ""),
    "database": os.getenv("DB_NAME", "safety_db"),
    "port": int(os.getenv("DB_PORT", "3306")),
    "charset": "utf8mb4",
    "cursorclass": pymysql.cursors.DictCursor,
}

REVIEW_WEIGHT = float(os.getenv("REVIEW_WEIGHT", "0.6"))
PUBLIC_WEIGHT = float(os.getenv("PUBLIC_WEIGHT", "0.4"))
PUBLIC_SCORE_BOOST = float(os.getenv("PUBLIC_SCORE_BOOST", "2.5"))
PUBLIC_SCORE_OFFSET = float(os.getenv("PUBLIC_SCORE_OFFSET", "0.35"))

HONGDAE_CENTER_LAT = float(os.getenv("HONGDAE_CENTER_LAT", "37.5572"))
HONGDAE_CENTER_LNG = float(os.getenv("HONGDAE_CENTER_LNG", "126.9245"))
GRID_RADIUS_KM = float(os.getenv("GRID_RADIUS_KM", "1.0"))
GRID_LAT_SIZE = float(os.getenv("GRID_LAT_SIZE", "0.0009"))
GRID_LNG_SIZE = float(os.getenv("GRID_LNG_SIZE", "0.0011"))

MIN_LAT = HONGDAE_CENTER_LAT - (GRID_RADIUS_KM / 111.0)
MAX_LAT = HONGDAE_CENTER_LAT + (GRID_RADIUS_KM / 111.0)
MIN_LNG = HONGDAE_CENTER_LNG - (
    GRID_RADIUS_KM / (111.0 * math.cos(math.radians(HONGDAE_CENTER_LAT)))
)
MAX_LNG = HONGDAE_CENTER_LNG + (
    GRID_RADIUS_KM / (111.0 * math.cos(math.radians(HONGDAE_CENTER_LAT)))
)
TOTAL_ROWS = math.ceil((MAX_LAT - MIN_LAT) / GRID_LAT_SIZE)
TOTAL_COLS = math.ceil((MAX_LNG - MIN_LNG) / GRID_LNG_SIZE)


def normalize_public_safety_score(score):
    if score is None:
        return 0.0

    raw_score = float(score)

    if raw_score > 5.0 and raw_score <= 100.0:
        raw_score = raw_score / 20.0

    base_score = max(0.0, min(raw_score, 5.0))
    if base_score == 0.0:
        return 0.0

    adjusted_score = (base_score * PUBLIC_SCORE_BOOST) + PUBLIC_SCORE_OFFSET
    return round(max(0.0, min(adjusted_score, 5.0)), 2)


@contextmanager
def get_connection():
    conn = pymysql.connect(**DB_CONFIG)
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        logger.exception("Database transaction failed")
        raise
    finally:
        conn.close()


def calculate_zone_id(lat, lng):
    if lat < MIN_LAT or lat >= MAX_LAT or lng < MIN_LNG or lng >= MAX_LNG:
        return None

    row_index = int((lat - MIN_LAT) / GRID_LAT_SIZE)
    col_index = int((lng - MIN_LNG) / GRID_LNG_SIZE)
    return (row_index * TOTAL_COLS) + col_index + 1


def build_safety_zones():
    zones = []
    for row_index in range(TOTAL_ROWS):
        for col_index in range(TOTAL_COLS):
            zone_id = (row_index * TOTAL_COLS) + col_index + 1
            min_lat = MIN_LAT + (row_index * GRID_LAT_SIZE)
            max_lat = min(min_lat + GRID_LAT_SIZE, MAX_LAT)
            min_lng = MIN_LNG + (col_index * GRID_LNG_SIZE)
            max_lng = min(min_lng + GRID_LNG_SIZE, MAX_LNG)
            zones.append(
                {
                    "zone_id": zone_id,
                    "row_index": row_index,
                    "col_index": col_index,
                    "min_lat": min_lat,
                    "max_lat": max_lat,
                    "min_lng": min_lng,
                    "max_lng": max_lng,
                }
            )
    return zones


def init_tables():
    safety_zone_sql = """
    CREATE TABLE IF NOT EXISTS safety_zone (
        zone_id INT PRIMARY KEY,
        row_index INT NOT NULL,
        col_index INT NOT NULL,
        min_lat DOUBLE NOT NULL,
        max_lat DOUBLE NOT NULL,
        min_lng DOUBLE NOT NULL,
        max_lng DOUBLE NOT NULL
    )
    """
    review_sql = """
    CREATE TABLE IF NOT EXISTS review (
        id INT AUTO_INCREMENT PRIMARY KEY,
        content TEXT NOT NULL,
        zone_id INT NOT NULL,
        lat DOUBLE NOT NULL,
        lng DOUBLE NOT NULL,
        user_score INT NOT NULL,
        ai_score FLOAT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_review_zone_id (zone_id)
    )
    """
    public_safety_zone_sql = """
    CREATE TABLE IF NOT EXISTS public_safety_zone (
        zone_id INT PRIMARY KEY,
        cctv_count INT DEFAULT 0,
        lamp_count INT DEFAULT 0,
        convenience_count INT DEFAULT 0,
        police_count INT DEFAULT 0,
        public_safety_score FLOAT NOT NULL
    )
    """
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(safety_zone_sql)
            cursor.execute(review_sql)
            cursor.execute(public_safety_zone_sql)
            from auth import init_auth_tables
            init_auth_tables(cursor)
            review_columns = {
                "user_id": "INT NULL",
                "like_count": "INT NOT NULL DEFAULT 0",
                "report_count": "INT NOT NULL DEFAULT 0",
                "report_status": "VARCHAR(30) NOT NULL DEFAULT 'normal'",
                "updated_at": "DATETIME NULL",
                "deleted_at": "DATETIME NULL",
                "moderation_status": "VARCHAR(30) NOT NULL DEFAULT 'normal'",
                "moderated_by": "INT NULL",
                "moderated_at": "DATETIME NULL",
                "moderation_reason": "TEXT NULL",
                "ai_summary": "TEXT NULL",
                "ai_tags": "TEXT NULL",
                "ai_confidence": "FLOAT NOT NULL DEFAULT 1.0",
                "reliability_status": "VARCHAR(30) NOT NULL DEFAULT 'normal'",
                "reliability_reasons": "TEXT NULL",
                "reliability_weight": "FLOAT NOT NULL DEFAULT 1.0",
                "analysis_source": "VARCHAR(30) NOT NULL DEFAULT 'legacy'",
                "analyzed_at": "DATETIME NULL",
            }
            for column_name, definition in review_columns.items():
                cursor.execute(
                    """SELECT COUNT(*) AS column_count FROM information_schema.COLUMNS
                       WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='review' AND COLUMN_NAME=%s""",
                    (column_name,),
                )
                if cursor.fetchone()["column_count"] == 0:
                    cursor.execute(f"ALTER TABLE review ADD COLUMN {column_name} {definition}")
            cursor.execute("""CREATE TABLE IF NOT EXISTS review_photo (
                id INT AUTO_INCREMENT PRIMARY KEY, review_id INT NOT NULL,
                photo_data LONGTEXT NOT NULL, photo_name VARCHAR(255) NULL,
                sort_order INT NOT NULL DEFAULT 0, INDEX idx_photo_review (review_id),
                FOREIGN KEY (review_id) REFERENCES review(id) ON DELETE CASCADE)""")
            cursor.execute("""CREATE TABLE IF NOT EXISTS review_like (
                review_id INT NOT NULL, user_id INT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (review_id,user_id))""")
            cursor.execute("""CREATE TABLE IF NOT EXISTS review_report (
                review_id INT NOT NULL, user_id INT NOT NULL,
                reason VARCHAR(100) NULL, detail TEXT NULL,
                status VARCHAR(30) NOT NULL DEFAULT 'pending',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME NULL,
                PRIMARY KEY (review_id,user_id))""")
            report_columns = {
                "reason": "VARCHAR(100) NULL",
                "detail": "TEXT NULL",
                "status": "VARCHAR(30) NOT NULL DEFAULT 'pending'",
                "updated_at": "DATETIME NULL",
                "reviewed_by": "INT NULL",
                "reviewed_at": "DATETIME NULL",
            }
            for column_name, definition in report_columns.items():
                cursor.execute(
                    """SELECT COUNT(*) AS column_count FROM information_schema.COLUMNS
                       WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='review_report' AND COLUMN_NAME=%s""",
                    (column_name,),
                )
                if cursor.fetchone()["column_count"] == 0:
                    cursor.execute(f"ALTER TABLE review_report ADD COLUMN {column_name} {definition}")
            cursor.execute(
                """
                SELECT COUNT(*) AS column_count
                FROM information_schema.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE()
                  AND TABLE_NAME = 'review'
                  AND COLUMN_NAME = 'zone_id'
                """
            )
            has_zone_id = cursor.fetchone()["column_count"] > 0
            if not has_zone_id:
                cursor.execute(
                    "ALTER TABLE review ADD COLUMN zone_id INT NOT NULL DEFAULT 0 AFTER content"
                )
                cursor.execute("CREATE INDEX idx_review_zone_id ON review (zone_id)")

            cursor.execute(
                """
                SELECT COUNT(*) AS column_count
                FROM information_schema.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE()
                  AND TABLE_NAME = 'public_safety_zone'
                  AND COLUMN_NAME = 'convenience_count'
                """
            )
            has_convenience_count = cursor.fetchone()["column_count"] > 0
            if not has_convenience_count:
                cursor.execute(
                    """
                    ALTER TABLE public_safety_zone
                    ADD COLUMN convenience_count INT DEFAULT 0 AFTER lamp_count
                    """
                )

            cursor.execute(
                """
                SELECT COUNT(*) AS column_count
                FROM information_schema.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE()
                  AND TABLE_NAME = 'public_safety_zone'
                  AND COLUMN_NAME = 'police_count'
                """
            )
            has_police_count = cursor.fetchone()["column_count"] > 0
            if not has_police_count:
                cursor.execute(
                    """
                    ALTER TABLE public_safety_zone
                    ADD COLUMN police_count INT DEFAULT 0 AFTER convenience_count
                    """
                )

            zones = build_safety_zones()
            cursor.executemany(
                """
                INSERT INTO safety_zone (
                    zone_id,
                    row_index,
                    col_index,
                    min_lat,
                    max_lat,
                    min_lng,
                    max_lng
                )
                VALUES (
                    %(zone_id)s,
                    %(row_index)s,
                    %(col_index)s,
                    %(min_lat)s,
                    %(max_lat)s,
                    %(min_lng)s,
                    %(max_lng)s
                )
                ON DUPLICATE KEY UPDATE
                    row_index = VALUES(row_index),
                    col_index = VALUES(col_index),
                    min_lat = VALUES(min_lat),
                    max_lat = VALUES(max_lat),
                    min_lng = VALUES(min_lng),
                    max_lng = VALUES(max_lng)
                """,
                zones,
            )


def _review_photos(review):
    photos = [photo.model_dump() for photo in review.photos]
    if not photos and getattr(review, "photo_data", None):
        photos = [{"photo_data": review.photo_data, "photo_name": review.photo_name}]
    return photos


def _validate_photos(photos):
    if len(photos) > 5:
        raise ValueError("사진은 최대 5장까지 첨부할 수 있습니다.")
    for photo in photos:
        data = photo.get("photo_data") or ""
        if not data.startswith("data:image/"):
            raise ValueError("이미지 파일만 첨부할 수 있습니다.")
        if len(data) > 2_000_000:
            raise ValueError("사진 한 장은 1.5MB 이하로 줄여 주세요.")


def _insert_photos(cursor, review_id, photos):
    _validate_photos(photos)
    cursor.executemany(
        "INSERT INTO review_photo (review_id,photo_data,photo_name,sort_order) VALUES (%s,%s,%s,%s)",
        [(review_id, p["photo_data"], p.get("photo_name"), i) for i, p in enumerate(photos)],
    ) if photos else None


def _decode_json_list(value):
    if isinstance(value, list):
        return value
    if not value:
        return []
    try:
        decoded = json.loads(value)
        return decoded if isinstance(decoded, list) else []
    except (TypeError, ValueError):
        return []


def _attach_analysis(rows):
    for row in rows:
        row["ai_tags"] = _decode_json_list(row.get("ai_tags"))
        row["reliability_reasons"] = _decode_json_list(row.get("reliability_reasons"))
        row["ai_confidence"] = float(row.get("ai_confidence") or 0)
        row["reliability_weight"] = float(row.get("reliability_weight") or 0)
    return rows


def save_review(review, analysis, user_id):
    zone_id = calculate_zone_id(review.lat, review.lng)
    if zone_id is None:
        raise ValueError("Review location is outside the Hongdae safety map area")

    sql = """
    INSERT INTO review (
        content, zone_id, lat, lng, user_score, ai_score, user_id,
        ai_summary, ai_tags, ai_confidence, reliability_status,
        reliability_reasons, reliability_weight, analysis_source, analyzed_at
    )
    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, UTC_TIMESTAMP())
    """
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(
                sql,
                (
                    review.content,
                    zone_id,
                    review.lat,
                    review.lng,
                    review.user_score,
                    analysis["ai_score"], user_id,
                    analysis["summary"],
                    json.dumps(analysis["tags"], ensure_ascii=False),
                    analysis["confidence"],
                    analysis["reliability_status"],
                    json.dumps(analysis["reliability_reasons"], ensure_ascii=False),
                    analysis["reliability_weight"],
                    analysis["analysis_source"],
                ),
            )
            review_id = cursor.lastrowid
            _insert_photos(cursor, review_id, _review_photos(review))
    return zone_id, review_id


def get_reviews(sort="latest"):
    order = "like_count DESC, created_at DESC" if sort == "helpful" else "created_at DESC"
    sql = f"""SELECT id,content,zone_id,lat,lng,user_score,ai_score,user_id,
        ai_summary,ai_tags,ai_confidence,reliability_status,reliability_reasons,
        reliability_weight,analysis_source,analyzed_at,
        like_count,report_count,report_status,created_at,updated_at
        FROM review WHERE deleted_at IS NULL AND moderation_status <> 'hidden' ORDER BY {order}"""
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(sql)
            rows = cursor.fetchall()
            if rows:
                ids = [row["id"] for row in rows]
                placeholders = ",".join(["%s"] * len(ids))
                cursor.execute(f"SELECT review_id,photo_data,photo_name FROM review_photo WHERE review_id IN ({placeholders}) ORDER BY sort_order", ids)
                photos = {}
                for photo in cursor.fetchall():
                    photos.setdefault(photo["review_id"], []).append({"photo_data": photo["photo_data"], "photo_name": photo["photo_name"]})
                for row in rows:
                    row["photos"] = photos.get(row["id"], [])
            return _attach_analysis(rows)


def attach_review_photos(cursor, rows):
    if not rows:
        return rows

    ids = [row["id"] for row in rows]
    placeholders = ",".join(["%s"] * len(ids))
    cursor.execute(
        f"SELECT review_id,photo_data,photo_name FROM review_photo WHERE review_id IN ({placeholders}) ORDER BY sort_order",
        ids,
    )
    photos = {}
    for photo in cursor.fetchall():
        photos.setdefault(photo["review_id"], []).append(
            {"photo_data": photo["photo_data"], "photo_name": photo["photo_name"]}
        )
    for row in rows:
        row["photos"] = photos.get(row["id"], [])
    return rows


def get_user_activity(user_id):
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(
                """SELECT COUNT(*) AS review_count,
                          COALESCE(SUM(like_count), 0) AS received_like_count,
                          COALESCE(SUM(report_count), 0) AS received_report_count
                   FROM review
                   WHERE user_id=%s AND deleted_at IS NULL""",
                (user_id,),
            )
            review_summary = cursor.fetchone()
            cursor.execute("SELECT COUNT(*) AS liked_review_count FROM review_like WHERE user_id=%s", (user_id,))
            liked_summary = cursor.fetchone()
            cursor.execute("SELECT COUNT(*) AS filed_report_count FROM review_report WHERE user_id=%s", (user_id,))
            filed_summary = cursor.fetchone()

            cursor.execute(
                """SELECT id,content,zone_id,lat,lng,user_score,ai_score,user_id,
                          like_count,report_count,report_status,created_at,updated_at
                   FROM review
                   WHERE user_id=%s AND deleted_at IS NULL
                   ORDER BY created_at DESC
                   LIMIT 5""",
                (user_id,),
            )
            recent_reviews = attach_review_photos(cursor, cursor.fetchall())

    return {
        "summary": {
            "review_count": int(review_summary["review_count"] or 0),
            "received_like_count": int(review_summary["received_like_count"] or 0),
            "received_report_count": int(review_summary["received_report_count"] or 0),
            "liked_review_count": int(liked_summary["liked_review_count"] or 0),
            "filed_report_count": int(filed_summary["filed_report_count"] or 0),
        },
        "recent_reviews": recent_reviews,
    }


def get_user_reviews(user_id):
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(
                """SELECT id,content,zone_id,lat,lng,user_score,ai_score,user_id,
                          like_count,report_count,report_status,created_at,updated_at
                   FROM review
                   WHERE user_id=%s AND deleted_at IS NULL
                   ORDER BY created_at DESC""",
                (user_id,),
            )
            return attach_review_photos(cursor, cursor.fetchall())


def get_user_liked_reviews(user_id):
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(
                """SELECT r.id,r.content,r.zone_id,r.lat,r.lng,r.user_score,r.ai_score,r.user_id,
                          r.like_count,r.report_count,r.report_status,r.created_at,r.updated_at,
                          rl.created_at AS liked_at
                   FROM review_like rl
                   JOIN review r ON r.id=rl.review_id
                   WHERE rl.user_id=%s AND r.deleted_at IS NULL
                   ORDER BY rl.created_at DESC""",
                (user_id,),
            )
            return attach_review_photos(cursor, cursor.fetchall())


def get_user_report_history(user_id):
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(
                """SELECT rr.review_id,rr.reason,rr.detail,rr.status,rr.created_at AS reported_at,
                          r.content,r.user_score,r.ai_score,r.report_count,r.report_status,
                          COALESCE(rr.status, CASE WHEN r.report_status='under_review' THEN 'pending' ELSE 'completed' END) AS status
                   FROM review_report rr
                   JOIN review r ON r.id=rr.review_id
                   WHERE rr.user_id=%s
                   ORDER BY rr.created_at DESC""",
                (user_id,),
            )
            filed_reports = cursor.fetchall()

            cursor.execute(
                """SELECT id AS review_id,content,user_score,ai_score,report_count,report_status,
                          CASE WHEN report_status='under_review' THEN 'pending' ELSE 'completed' END AS status
                   FROM review
                   WHERE user_id=%s AND deleted_at IS NULL AND report_count > 0
                   ORDER BY report_count DESC, created_at DESC""",
                (user_id,),
            )
            received_reports = cursor.fetchall()

    return {
        "filed_reports": filed_reports,
        "received_reports": received_reports,
    }


def update_review(review_id, review, user_id, analysis=None):
    fields, values = [], []
    if review.content is not None:
        fields += [
            "content=%s", "ai_score=%s", "ai_summary=%s", "ai_tags=%s",
            "ai_confidence=%s", "reliability_status=%s", "reliability_reasons=%s",
            "reliability_weight=%s", "analysis_source=%s", "analyzed_at=UTC_TIMESTAMP()",
        ]
        values += [
            review.content,
            analysis["ai_score"],
            analysis["summary"],
            json.dumps(analysis["tags"], ensure_ascii=False),
            analysis["confidence"],
            analysis["reliability_status"],
            json.dumps(analysis["reliability_reasons"], ensure_ascii=False),
            analysis["reliability_weight"],
            analysis["analysis_source"],
        ]
    if review.user_score is not None:
        fields.append("user_score=%s")
        values.append(review.user_score)
    if not fields and review.photos is None:
        raise ValueError("수정할 내용이 없습니다.")
    with get_connection() as conn:
        with conn.cursor() as cursor:
            if fields:
                values += [review_id, user_id]
                cursor.execute(f"UPDATE review SET {','.join(fields)},updated_at=UTC_TIMESTAMP() WHERE id=%s AND user_id=%s AND deleted_at IS NULL", values)
                if cursor.rowcount == 0:
                    raise PermissionError("본인이 작성한 리뷰만 수정할 수 있습니다.")
            if review.photos is not None:
                cursor.execute("SELECT id FROM review WHERE id=%s AND user_id=%s AND deleted_at IS NULL", (review_id,user_id))
                if not cursor.fetchone():
                    raise PermissionError("본인이 작성한 리뷰만 수정할 수 있습니다.")
                cursor.execute("DELETE FROM review_photo WHERE review_id=%s", (review_id,))
                _insert_photos(cursor, review_id, [p.model_dump() for p in review.photos])


def delete_review(review_id, user_id):
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute("UPDATE review SET deleted_at=UTC_TIMESTAMP() WHERE id=%s AND user_id=%s AND deleted_at IS NULL", (review_id,user_id))
            if cursor.rowcount == 0:
                raise PermissionError("본인이 작성한 리뷰만 삭제할 수 있습니다.")


def like_review(review_id, user_id):
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute("SELECT id FROM review WHERE id=%s AND deleted_at IS NULL", (review_id,))
            if not cursor.fetchone():
                raise LookupError("리뷰를 찾을 수 없습니다.")
            cursor.execute("INSERT IGNORE INTO review_like (review_id,user_id) VALUES (%s,%s)", (review_id,user_id))
            if cursor.rowcount:
                cursor.execute("UPDATE review SET like_count=like_count+1 WHERE id=%s", (review_id,))
            cursor.execute("SELECT like_count FROM review WHERE id=%s", (review_id,))
            return cursor.fetchone()["like_count"]


def report_review(review_id, user_id, reason, detail=None):
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute("SELECT id FROM review WHERE id=%s AND deleted_at IS NULL", (review_id,))
            if not cursor.fetchone():
                raise LookupError("리뷰를 찾을 수 없습니다.")
            cursor.execute(
                """INSERT INTO review_report (review_id,user_id,reason,detail,status)
                   VALUES (%s,%s,%s,%s,'pending')
                   ON DUPLICATE KEY UPDATE
                       reason=VALUES(reason),
                       detail=VALUES(detail),
                       status='pending',
                       updated_at=UTC_TIMESTAMP()""",
                (review_id, user_id, reason, detail),
            )
            if cursor.rowcount:
                cursor.execute(
                    "SELECT COUNT(*) AS report_count FROM review_report WHERE review_id=%s",
                    (review_id,),
                )
                report_count = cursor.fetchone()["report_count"]
                cursor.execute(
                    "SELECT COUNT(*) AS pending_count FROM review_report WHERE review_id=%s AND status='pending'",
                    (review_id,),
                )
                pending_count = cursor.fetchone()["pending_count"]
                cursor.execute(
                    """UPDATE review SET report_count=%s,
                       report_status=CASE
                           WHEN %s>=3 THEN 'under_review'
                           WHEN %s>0 THEN 'reported'
                           ELSE 'normal'
                       END
                       WHERE id=%s""",
                    (report_count, pending_count, pending_count, review_id),
                )
            cursor.execute("SELECT report_count,report_status FROM review WHERE id=%s", (review_id,))
            result = cursor.fetchone()
            result["reason"] = reason
            result["detail"] = detail
            return result


def get_admin_reported_reviews(status="pending"):
    status_filter = ""
    params = []
    if status in {"pending", "resolved", "rejected"}:
        status_filter = "WHERE rr.status=%s"
        params.append(status)

    sql = f"""
    SELECT
        rr.review_id,
        rr.user_id AS reporter_user_id,
        reporter.email AS reporter_email,
        reporter.nickname AS reporter_nickname,
        rr.reason,
        rr.detail,
        rr.status AS report_status,
        rr.created_at AS reported_at,
        rr.reviewed_at,
        reviewer.nickname AS reviewer_nickname,
        r.content,
        r.zone_id,
        r.lat,
        r.lng,
        r.user_score,
        r.ai_score,
        r.report_count,
        r.moderation_status,
        r.created_at AS review_created_at,
        author.email AS author_email,
        author.nickname AS author_nickname
    FROM review_report rr
    JOIN review r ON r.id=rr.review_id
    LEFT JOIN users reporter ON reporter.id=rr.user_id
    LEFT JOIN users author ON author.id=r.user_id
    LEFT JOIN users reviewer ON reviewer.id=rr.reviewed_by
    {status_filter}
    ORDER BY rr.created_at DESC
    """
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(sql, params)
            rows = cursor.fetchall()
            if not rows:
                return rows

            review_ids = list({row["review_id"] for row in rows})
            placeholders = ",".join(["%s"] * len(review_ids))
            cursor.execute(
                f"""SELECT review_id,photo_data,photo_name
                    FROM review_photo
                    WHERE review_id IN ({placeholders})
                    ORDER BY sort_order""",
                review_ids,
            )
            photos = {}
            for photo in cursor.fetchall():
                photos.setdefault(photo["review_id"], []).append(
                    {
                        "photo_data": photo["photo_data"],
                        "photo_name": photo["photo_name"],
                    }
                )

            for row in rows:
                row["photos"] = photos.get(row["review_id"], [])
            return rows


def update_report_status(review_id, reporter_user_id, status, admin_user_id):
    if status not in {"pending", "resolved", "rejected"}:
        raise ValueError("Invalid report status")

    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(
                """UPDATE review_report
                   SET status=%s, reviewed_by=%s, reviewed_at=UTC_TIMESTAMP(), updated_at=UTC_TIMESTAMP()
                   WHERE review_id=%s AND user_id=%s""",
                (status, admin_user_id, review_id, reporter_user_id),
            )
            if cursor.rowcount == 0:
                raise LookupError("Report not found")
            cursor.execute(
                "SELECT COUNT(*) AS pending_count FROM review_report WHERE review_id=%s AND status='pending'",
                (review_id,),
            )
            pending_count = cursor.fetchone()["pending_count"]
            cursor.execute(
                """UPDATE review
                   SET report_status=CASE
                       WHEN %s>=3 THEN 'under_review'
                       WHEN %s>0 THEN 'reported'
                       ELSE 'normal'
                   END
                   WHERE id=%s AND moderation_status <> 'hidden'""",
                (pending_count, pending_count, review_id),
            )


def hide_review_by_admin(review_id, admin_user_id, reason=None):
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(
                """UPDATE review
                   SET moderation_status='hidden',
                       deleted_at=COALESCE(deleted_at, UTC_TIMESTAMP()),
                       moderated_by=%s,
                       moderated_at=UTC_TIMESTAMP(),
                       moderation_reason=%s
                   WHERE id=%s""",
                (admin_user_id, reason, review_id),
            )
            if cursor.rowcount == 0:
                raise LookupError("Review not found")
            cursor.execute(
                """UPDATE review_report
                   SET status='resolved', reviewed_by=%s, reviewed_at=UTC_TIMESTAMP(), updated_at=UTC_TIMESTAMP()
                   WHERE review_id=%s AND status='pending'""",
                (admin_user_id, review_id),
            )


def restore_review_by_admin(review_id, admin_user_id):
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(
                """UPDATE review
                   SET moderation_status='normal',
                       deleted_at=NULL,
                       moderated_by=%s,
                       moderated_at=UTC_TIMESTAMP(),
                       moderation_reason=NULL
                   WHERE id=%s""",
                (admin_user_id, review_id),
            )
            if cursor.rowcount == 0:
                raise LookupError("Review not found")


def upsert_public_safety_zone(zone):
    sql = """
    INSERT INTO public_safety_zone (
        zone_id,
        cctv_count,
        lamp_count,
        convenience_count,
        police_count,
        public_safety_score
    )
    VALUES (%s, %s, %s, %s, %s, %s)
    ON DUPLICATE KEY UPDATE
        cctv_count = VALUES(cctv_count),
        lamp_count = VALUES(lamp_count),
        convenience_count = VALUES(convenience_count),
        police_count = VALUES(police_count),
        public_safety_score = VALUES(public_safety_score)
    """
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(
                sql,
                (
                    zone.zone_id,
                    zone.cctv_count,
                    zone.lamp_count,
                    zone.convenience_count,
                    zone.police_count,
                    zone.public_safety_score,
                ),
            )


def get_public_safety_zone(zone_id):
    sql = """
    SELECT
        zone_id,
        cctv_count,
        lamp_count,
        convenience_count,
        police_count,
        public_safety_score
    FROM public_safety_zone
    WHERE zone_id = %s
    """
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(sql, (zone_id,))
            row = cursor.fetchone()

    if row is not None:
        row["public_safety_score"] = normalize_public_safety_score(
            row["public_safety_score"]
        )

    return row


def get_public_safety_zones():
    sql = """
    SELECT
        zone_id,
        cctv_count,
        lamp_count,
        convenience_count,
        police_count,
        public_safety_score
    FROM public_safety_zone
    ORDER BY zone_id
    """
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(sql)
            rows = cursor.fetchall()

    for row in rows:
        row["public_safety_score"] = normalize_public_safety_score(
            row["public_safety_score"]
        )

    return rows


def get_review_score_average(zone_id):
    sql = """
    SELECT
        SUM(((user_score + ai_score) / 2) * reliability_weight)
        / NULLIF(SUM(reliability_weight), 0) AS review_safety_score
    FROM review
    WHERE zone_id = %s AND deleted_at IS NULL
      AND reliability_status <> 'rejected'
    """
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(sql, (zone_id,))
            row = cursor.fetchone()
            return row["review_safety_score"] if row else None


def calculate_safety_score(zone_id):
    public_zone = get_public_safety_zone(zone_id)
    if public_zone is None:
        public_zone = {
            "zone_id": zone_id,
            "cctv_count": 0,
            "lamp_count": 0,
            "convenience_count": 0,
            "police_count": 0,
            "public_safety_score": 0.0,
        }

    review_score = get_review_score_average(zone_id)
    public_score = float(public_zone["public_safety_score"])

    if review_score is None:
        final_score = public_score
    else:
        final_score = (float(review_score) * REVIEW_WEIGHT) + (
            float(public_score) * PUBLIC_WEIGHT
        )

    return {
        "zone_id": zone_id,
        "review_safety_score": review_score,
        "public_safety_score": public_score,
        "final_safety_score": round(final_score, 2),
        "cctv_count": public_zone["cctv_count"],
        "lamp_count": public_zone["lamp_count"],
        "convenience_count": public_zone["convenience_count"],
        "police_count": public_zone["police_count"],
    }


def get_map_zones():
    sql = """
    SELECT
        sz.zone_id,
        sz.row_index,
        sz.col_index,
        sz.min_lat,
        sz.max_lat,
        sz.min_lng,
        sz.max_lng,
        COALESCE(psz.cctv_count, 0) AS cctv_count,
        COALESCE(psz.lamp_count, 0) AS lamp_count,
        COALESCE(psz.convenience_count, 0) AS convenience_count,
        COALESCE(psz.police_count, 0) AS police_count,
        COALESCE(psz.public_safety_score, 0) AS public_safety_score,
        SUM(((r.user_score + r.ai_score) / 2) * r.reliability_weight)
          / NULLIF(SUM(r.reliability_weight), 0) AS review_safety_score
    FROM safety_zone sz
    LEFT JOIN public_safety_zone psz ON sz.zone_id = psz.zone_id
    LEFT JOIN review r ON sz.zone_id = r.zone_id
      AND r.deleted_at IS NULL AND r.reliability_status <> 'rejected'
    GROUP BY
        sz.zone_id,
        sz.row_index,
        sz.col_index,
        sz.min_lat,
        sz.max_lat,
        sz.min_lng,
        sz.max_lng,
        psz.cctv_count,
        psz.lamp_count,
        psz.convenience_count,
        psz.police_count,
        psz.public_safety_score
    ORDER BY sz.zone_id
    """
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(sql)
            zones = cursor.fetchall()

    for zone in zones:
        review_score = zone["review_safety_score"]
        public_score = normalize_public_safety_score(zone["public_safety_score"])
        zone["public_safety_score"] = public_score
        if review_score is None:
            final_score = public_score
        else:
            final_score = (float(review_score) * REVIEW_WEIGHT) + (
                public_score * PUBLIC_WEIGHT
            )
        zone["final_safety_score"] = round(final_score, 2)

    return zones
