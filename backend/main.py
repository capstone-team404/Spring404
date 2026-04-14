from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from schemas import ReviewCreate
from db import save_review, get_reviews
import requests

AI_URL = "http://10.240.213.17:8001/analyze"


app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def call_ai(text):
    res = requests.post(AI_URL, json={"review": text})
    data = res.json()

    return data.get("danger_score") or data.get("score")


@app.post("/review")
def create_review(review: ReviewCreate):

    ai_score = call_ai(review.content)

    save_review(review, ai_score)

    return {
    "message": "saved",
    "data": {
        "content": review.content,
        "lat": review.lat,
        "lng": review.lng,
        "user_score": review.user_score,
        "ai_score": ai_score
    }
}

# 🔥 리뷰 조회
@app.get("/reviews")
def read_reviews():
    data = get_reviews()

    # 🔥 프론트 형식 맞추기
    return [
        {
            "text": r["content"],
            "lat": r["lat"],
            "lng": r["lng"],
            "rating": r["score"]
        }
        for r in data
    ]