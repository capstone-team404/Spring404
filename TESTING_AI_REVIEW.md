# AI 리뷰 분석 로컬 테스트

이 기능은 AI 서버가 꺼져 있어도 백엔드의 규칙 기반 분석으로 동작합니다. 따라서 기본 확인은 VS Code 터미널 두 개만 사용하면 됩니다.

## 1. 최초 한 번만 준비

MySQL에서 데이터베이스를 만듭니다.

```sql
CREATE DATABASE IF NOT EXISTS safety_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;
```

`backend/.env.example`을 복사해 `backend/.env`를 만들고, 현재 PC의 MySQL 비밀번호를 입력합니다.

```env
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=본인의_MySQL_root_비밀번호
DB_NAME=safety_db
AI_BASE_URL=http://localhost:8001
CORS_ORIGINS=http://localhost:5173
GENDER_TEST_CODE=HEREJI404
ADMIN_EMAILS=admintest@gmail.com
```

## 2. 터미널 1 — 백엔드

```powershell
cd backend
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python -m uvicorn main:app --reload --port 8000
```

기존 `.venv`가 있으면 생성과 설치 명령은 생략하고 활성화부터 실행해도 됩니다. 서버 시작 시 기존 `review` 테이블에는 분석 결과 및 신뢰도 컬럼이 자동 추가됩니다.

## 3. 터미널 2 — 프론트엔드

```powershell
cd frontend
npm.cmd install
npm.cmd run dev
```

브라우저에서 `http://localhost:5173`을 엽니다. PowerShell 실행 정책 때문에 `npm`이 막히면 위와 같이 `npm.cmd`를 사용합니다.

## 4. 화면에서 확인

회원가입 후 테스트 코드 `HEREJI404`로 여성 인증을 완료합니다. 지도에서 리뷰를 작성하고 목록을 열어 다음 정보가 표시되는지 확인합니다.

- AI 안전 점수와 신뢰도
- 고정 안전/위험 태그
- 한 줄 요약
- 낮은 신뢰도 또는 점수 제외 안내

추천 입력 예시:

- 위험: `밤 11시에 골목이 너무 어둡고 취객이 여러 명 있어서 혼자 걷기 불안했어요.` / 평점 1점
- 안전: `밤에도 역 앞에 가로등과 CCTV가 많고 경찰 순찰을 봐서 안심됐어요.` / 평점 5점
- 낮은 신뢰도: `그냥 좋아요` / 평점 5점
- 제외 대상: `ㅋㅋㅋ` / 평점 5점

## 5. 선택 — OpenAI 서버까지 확인

규칙 기반 MVP가 아니라 OpenAI 결과도 확인하려면 세 번째 터미널을 엽니다.

```powershell
cd ai
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
$env:OPENAI_API_KEY="본인의_API_KEY"
python main.py
```

AI 서버는 `8001`, 백엔드는 `8000`, 프론트엔드는 `5173` 포트를 사용합니다. API 키를 GitHub에 올리거나 `.env` 파일을 공유하면 안 됩니다.

## 6. 자동 테스트

프로젝트 루트에서 개발 테스트 의존성을 설치한 뒤 실행합니다.

```powershell
python -m pip install -r requirements-dev.txt
python -m pytest tests/test_review_analysis.py -q
cd frontend
npm.cmd run build
```
