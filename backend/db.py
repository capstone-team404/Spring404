import pymysql

conn = pymysql.connect(
    host="localhost",
    user="root",
    password="0327",  # ⭐ 너 비번 넣기
    database="safety_db"
)

def save_review(review, score):
    with conn.cursor() as cursor:
        sql = "INSERT INTO review (content, lat, lng, score) VALUES (%s, %s, %s, %s)"
        cursor.execute(sql, (review.content, review.lat, review.lng, score))
        conn.commit()

def get_reviews():
    with conn.cursor() as cursor:
        sql = "SELECT content, lat, lng, score FROM review"
        cursor.execute(sql)
        result = cursor.fetchall()

    return [
        {
            "content": r[0],
            "lat": r[1],
            "lng": r[2],
            "score": r[3]
        }
        for r in result
    ]