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
    try:
        res = requests.post(AI_URL, json={"review": text}, timeout=3)
        data = res.json()
        return data.get("danger_score") or 0
    except:
        return 0


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

@app.get("/reviews")
def read_reviews():
    data = get_reviews()

    return [
        {
            "content": r["content"],
            "lat": r["lat"],
            "lng": r["lng"],
            "user_score": r["user_score"],
            "ai_score": r["ai_score"]
        }
        for r in data
    ]