# 1. 라이브러리 임포트 (가장 위)
import os
import json
from dotenv import load_dotenv
from openai import OpenAI
from fastapi import FastAPI
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware

# 2. 보안 설정 및 클라이언트 초기화 (임포트 바로 아래)
# [유나님이 질문한 코드의 위치!]
load_dotenv() 
api_key = os.getenv("OPENAI_API_KEY")
client = OpenAI(api_key=api_key)

# 3. FastAPI 앱 설정 및 CORS 허용
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 4. 데이터 모델 정의
class ReviewInput(BaseModel):
    review: str

# 5. 유나의 보정 엔진 로직
def yuna_engine(ai_json, text):
    try:
        data = json.loads(ai_json)
        base_score = (data['lighting'] * 0.5 + data['crowd'] * 0.3 + data['infrastructure'] * 0.2)
        
        # 키워드 리스트 (유나님이 더 추가해도 돼요!)
        danger_keywords = ["칼", "취객", "무서워", "공사", "담배", "어두워"]
        bonus = 0
        for word in danger_keywords:
            if word in text:
                bonus += 0.5
        
        return min(5.0, base_score + bonus)
    except:
        return 0.0

# 6. API 엔드포인트 (서버의 문)
@app.post("/analyze")
async def analyze_safety(input_data: ReviewInput):
    user_text = input_data.review
    
    # 실제 운영 시에는 AI 호출, 지금은 테스트용 가짜 데이터 사용
    # (결제 후에는 이 부분을 실제 API 호출 코드로 바꾸면 됩니다!)
    mock_ai = '{"lighting": 4, "crowd": 5, "infrastructure": 3}'
    
    final_score = yuna_engine(mock_ai, user_text)
    
    return {
        "status": "success",
        "review": user_text,
        "danger_score": final_score
    }