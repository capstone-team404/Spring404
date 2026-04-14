import pymysql

conn = pymysql.connect(
    host="localhost",
    user="root",
    password="0327",  
    database="safety_db"
)

def save_review(review, ai_score):
    with conn.cursor() as cursor:
        sql = """
        INSERT INTO review (content, lat, lng, score, ai_score)
        VALUES (%s, %s, %s, %s, %s)
        """
        cursor.execute(sql, (
            review.content,
            review.lat,
            review.lng,
            review.user_score,   # 사용자 평점
            ai_score             # AI 점수
        ))
        conn.commit()

def get_reviews():
    with conn.cursor() as cursor:
        sql = "SELECT content, lat, lng, score, ai_score FROM review"
        cursor.execute(sql)
        result = cursor.fetchall()

    return [
        {
            "content": r[0],
            "lat": r[1],
            "lng": r[2],
            "user_score": r[3],      # user_score
            "ai_score": r[4]    # AI 점수
        }
        for r in result
    ]
