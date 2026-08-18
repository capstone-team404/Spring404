# 관리자 기능·Mock 여성 인증 로컬 테스트

기본 확인은 VS Code 터미널 두 개만 사용합니다. AI 서버가 꺼져 있어도 리뷰 분석은 규칙 기반으로 동작합니다.

## 1. 환경 설정

`backend/.env`에 현재 MySQL 정보와 테스트 설정을 입력합니다.

```env
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=본인의_MySQL_root_비밀번호
DB_NAME=safety_db_ai_test
AI_BASE_URL=http://localhost:8001
CORS_ORIGINS=http://localhost:5173
GENDER_TEST_CODE=HEREJI404
ADMIN_EMAILS=admin404@example.com
```

테스트 DB가 아직 없다면 MySQL에서 한 번만 생성합니다.

```sql
CREATE DATABASE IF NOT EXISTS safety_db_ai_test
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;
```

기존 DB를 사용해도 기존 데이터는 삭제되지 않습니다. 서버 시작 시 회원 인증 상태 컬럼이 자동 추가됩니다.

## 2. 터미널 1 — 백엔드

```powershell
cd backend
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python -m uvicorn main:app --reload --port 8000
```

`.venv`가 아직 없다면 활성화 전에 다음 명령을 한 번 실행합니다.

```powershell
py -3.11 -m venv .venv
```

## 3. 터미널 2 — 프론트엔드

```powershell
cd frontend
npm.cmd install
npm.cmd run dev
```

브라우저에서 `http://localhost:5173`을 엽니다.

## 4. 회원가입·Mock 인증 확인

1. 로그인 화면에서 `회원가입`을 선택합니다.
2. 이메일, 영문·숫자가 포함된 8자 이상 비밀번호, 비밀번호 확인, 2~20자 닉네임을 입력합니다.
3. 필수 약관 두 개에 동의하고 `다음: 여성 인증`을 누릅니다.
4. 여성 인증 화면에서 `데모 코드 자동 입력`을 누릅니다.
5. `여성 인증하기`를 누릅니다.
6. 인증 완료 화면을 거쳐 지도로 자동 이동하는지 확인합니다.
7. 로그아웃 후 같은 계정으로 로그인하면 인증 화면 없이 지도로 이동해야 합니다.

오류도 확인해 볼 수 있습니다.

- 같은 이메일 재가입: `이미 가입된 이메일입니다.`
- 같은 닉네임 재가입: `이미 사용 중인 닉네임입니다.`
- 다른 비밀번호 확인: 불일치 안내
- 영문 또는 숫자가 없는 비밀번호: 비밀번호 규칙 안내
- 약관 미동의: 필수 약관 안내
- 잘못된 인증 코드: 인증 실패 후 인증 화면 유지

## 5. 관리자 기능 확인

관리자 여부는 `backend/.env`의 `ADMIN_EMAILS`로 결정됩니다.

1. `admin404@example.com`으로 회원가입하고 Mock 인증을 완료합니다.
2. 일반 사용자 계정으로 리뷰 하나를 작성합니다.
3. 다른 계정으로 그 리뷰를 신고합니다.
4. 관리자 계정으로 다시 로그인합니다.
5. 지도 메뉴의 `관리자 페이지`에서 `리뷰 신고 관리`를 엽니다.
6. 검토 대기 목록에서 상세 내용, 신고 사유, 신고자, 원본 리뷰를 확인합니다.
7. 다음 조치를 각각 확인합니다.
   - `신고 기각`: 기각 탭으로 이동
   - `검토 완료`: 처리 완료 탭으로 이동
   - `리뷰 삭제`: 삭제 사유 입력 후 지도와 일반 리뷰 목록에서 숨김
   - `리뷰 복구`: 처리 완료 목록에서 다시 지도에 표시

관리자 삭제는 MVP에서 복구 가능한 soft delete입니다. 실제 DB 행을 영구 삭제하지 않습니다.

## 6. 자동 테스트

프로젝트 루트에서 실행합니다.

```powershell
python -m pip install -r requirements-dev.txt
python -m pytest tests/test_auth_validation.py tests/test_review_analysis.py -q
cd frontend
npm.cmd run build
```
