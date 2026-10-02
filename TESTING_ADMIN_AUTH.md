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

## 5. 자동 숨김·관리자 복구 확인

1. `ADMIN_EMAILS`에 설정한 계정으로 가입하고 인증합니다.
2. 일반 사용자 계정으로 리뷰를 작성합니다.
3. 서로 다른 인증 사용자 두 명이 신고합니다. 리뷰는 계속 표시됩니다.
4. 동일 사용자의 재신고는 409로 차단되고, 화면 버튼은 `신고 완료`가 됩니다.
5. 세 번째 사용자가 신고하면 리뷰가 자동 숨김되고, 지도·일반 리뷰·내 리뷰·좋아요 목록에서 제외됩니다.
6. `/safety-score`와 `/map/zones`의 해당 구역 점수에서 리뷰가 제외되는지 확인합니다.
7. 관리자 페이지에는 자동 숨김 리뷰가 리뷰당 한 항목으로 표시됩니다. 상세에서 모든 미처리 신고 사유와 사진을 확인합니다.
8. `확인함 표시` 및 해제를 확인하고, 새로고침해도 상태가 저장되는지 확인합니다. `미확인만 보기`는 확인한 리뷰를 제외합니다.
9. 확인 표시는 리뷰 노출이나 안전 점수에 영향을 주지 않습니다. 확인 여부는 관리자들이 공유합니다.
10. `리뷰 복구` 후 관리자 목록에서 빠지고, 사용자 화면과 안전 점수에 다시 반영됩니다.
11. 기존 신고자는 복구 이후에도 같은 리뷰를 재신고할 수 없습니다. 기존 신고는 resolved가 되어 재숨김 기준에서 제외됩니다.
12. 다른 신규 사용자 세 명이 신고하면 다시 자동 숨김됩니다.
13. 일반 사용자 및 미로그인 사용자의 관리자 API 접근이 각각 403, 401로 차단되는지 확인합니다.

기존 수동 숨김(`hidden`)과 작성자 삭제(`deleted_at`)는 자동 복구 대상이 아닙니다.
서버 시작 시 기존 미처리 신고가 3건 이상인 정상 리뷰에도 자동 숨김 정책이 적용됩니다.
기존 테스트용 DB는 백업 후 테스트하세요.

## 6. 자동 테스트

프로젝트 루트에서 실행합니다.

```powershell
python -m pip install -r requirements-dev.txt
python -m pytest tests/test_auth_validation.py tests/test_review_analysis.py -q
cd frontend
npm.cmd run build
```
