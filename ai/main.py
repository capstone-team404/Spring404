from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

# FastAPI 애플리케이션 객체 생성
app = FastAPI()

# [CORS 설정] 프론트엔드와 백엔드 간의 데이터 주고받기를 허용하는 보안 설정
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # 모든 도메인에서의 접근을 허용
    allow_methods=["*"], # GET, POST, PUT, DELETE 등 모든 HTTP 메서드 허용
    allow_headers=["*"], # 모든 HTTP 헤더 허용
)

# [API 경로 설정] "/analyze" 주소로 POST 요청이 오면 아래 함수를 실행함
@app.post("/analyze")
async def analyze_review(request: Request):
    try:
        # 1. 클라이언트(프론트엔드)가 보낸 JSON 데이터를 비동기로 읽어옴
        data = await request.json()
        # 2. JSON 데이터 안에서 "review"라는 키로 전달된 텍스트를 추출
        user_review = data.get("review") 
        
        # [디버깅] 서버 터미널에 수신된 데이터를 출력하여 연동 확인
        print(f"수신된 리뷰 데이터: {user_review}")

        # 만약 리뷰 내용이 비어있다면 위험 점수를 0으로 반환하고 종료
        if not user_review:
            return {"danger_score": 0.0}

        # [위험도 분석 알고리즘 시작]
        # 3. 기본 안전 점수를 5.0점으로 설정 (위험할수록 점수가 낮아짐)
        calculated_score = 5.0
        deduction_unit = 0.5

        # 4. 감지할 위험 키워드 목록 정의
        dangerous_words = ["칼", "싸움", "취객", "폭행", "무서워", "번화가"]

        # 5. 위험 단어 리스트를 하나씩 돌며 사용자의 리뷰에 포함되어 있는지 검사
        for word in dangerous_words:
            if word in user_review:
                # 위험 단어 발견 시 기본 점수에서 0.5점 감점
                # max(0.0, ...) 함수를 사용하여 점수가 0점 미만으로 내려가지 않게 방어
                calculated_score = max(0.0, calculated_score - deduction_unit)

                # [디버깅] 어떤 단어 때문에 점수가 깎였는지 로그 기록
                print(f"감지된 단어: {word} -> 현재 안전 점수: {calculated_score}")

        # 6. 최종 계산된 점수를 JSON 형태로 프론트엔드에 응답
        return {"danger_score": calculated_score}

    except Exception as e:
        # 오류 발생 시 서버가 중단되지 않도록 예외 처리 후 0점 반환
        print(f"에러 발생: {e}")
        return {"danger_score": 0.0}

# 이 파일이 메인으로 실행될 때 서버 가동
if __name__ == "__main__":
    # uvicorn 서버 실행: IP는 0.0.0.0(모든 접근), 포트는 8001번 사용
    uvicorn.run(app, host="0.0.0.0", port=8001)
