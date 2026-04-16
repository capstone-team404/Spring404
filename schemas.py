from pydantic import BaseModel

class ReviewCreate(BaseModel):
    content: str
    lat: float
    lng: float
    user_score: int   # ⭐ 추가