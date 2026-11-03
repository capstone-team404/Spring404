# Spring404 통합본

아림님의 로그인/세션/이용자 인증, 채원님의 다중 사진 리뷰·정렬·좋아요·신고·수정·삭제,
Min Score 경로 추천과 결과형 AI 설명을 하나로 합친 로컬 통합본입니다.

## 실행

1. MySQL에 `safety_db` 데이터베이스를 만들고 `backend/.env.example`을 `backend/.env`로 복사해 값을 채웁니다.
2. `backend`에서 `pip install -r requirements.txt` 후 `uvicorn main:app --reload --port 8000`을 실행합니다.
3. `ai`에서 `pip install -r requirements.txt` 후 `uvicorn main:app --reload --port 8001`을 실행합니다.
4. `frontend/.env.example`을 `frontend/.env`로 복사하고 TMAP 키를 넣습니다.
5. `frontend`에서 `npm install`, `npm run dev`를 실행합니다.

MVP 인증 기본 코드는 `HEREJI404`입니다. 운영 전에는 실제 본인인증으로 교체해야 합니다.

## 통합 기준

- 경로 추천은 경로별 최저 안전점수(Min Score)를 최우선으로 비교하고, 동점이면 평균 점수와 시간을 사용합니다.
- AI는 챗봇이 아니라 추천 결과 카드의 한 줄 요약과 구체적 이유만 제공합니다.
- AI 서버가 응답하지 않아도 백엔드의 동일한 규칙 기반 계산과 설명으로 동작합니다.
- 리뷰 수정/삭제는 서버에서 작성자 ID를 검증합니다.
- 좋아요와 신고는 사용자별 한 번만 반영됩니다.
- 키와 DB 비밀번호는 소스에 넣지 않고 환경변수로 관리합니다.
