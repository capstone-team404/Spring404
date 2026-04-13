from pydantic import BaseModel

class ReviewCreate(BaseModel):
    text: str
    rating: int
    lat: float
    lng: float