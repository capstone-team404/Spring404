from fastapi import FastAPI
from schemas import ReviewCreate
from db import save_review
from db import get_reviews
from ai import analyze_review
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

@app.get("/")
def root():
    return {"message": "Server running"}

@app.post("/review")
def create_review(review: ReviewCreate):
    score = review.user_score   # ⭐ 변경
    save_review(review, score)
    return {"message": "saved", "score": score}

@app.get("/reviews")
def read_reviews():
    return get_reviews()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 개발용
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)