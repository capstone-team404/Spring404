# 안전 시설 자동 수집

## 보안등 파일 교체 자동화

최신 보안등 원본은 `backend/data/security-lights-input.csv`로 교체합니다. main에 해당 파일이 바뀌면 주소 변환·좌표 재사용·Zone 분류·DB 갱신이 자동 실행됩니다. 이전 고정 스냅샷을 다시 저장하는 방식은 기본 경로에서 제외했습니다. 자세한 업로드와 결과 확인은 [보안등 갱신 안내](SECURITY_LIGHT_UPDATE.md)를 참고하세요. 아래 2026-10-15 연결 기록은 초기 스냅샷 반영 시점의 기록입니다.

## 2026-10-15 보안등 연결

기본 보안등 파일은 `backend/data/mapo-security-lights-geocoded.csv`입니다. 마포구 공식 원본(2025-12-09) 8,281건 중 주소가 일치한 7,331건을 담았습니다. 기본 홍대 반경 1km에는 1,816건(서로 다른 좌표 1,558개)이 있습니다. 원본: https://www.data.go.kr/data/15017320/standard.do

미매칭 950건과 서대문구 미포함 때문에 `partial=true`입니다. `estimated_coordinates=true`는 실제 등주의 실측 좌표가 아닌 주소 대표 위치임을 뜻합니다. 두 값은 API와 시설 현황 화면에 표시됩니다. 같은 주소의 개별 보안등 행은 보존하지만 `lamp_known_count`는 서로 다른 좌표 수입니다. 조명 전체 개수와 점수 산정은 보류합니다.

`python collect_facilities.py --once --sources security_light`로 보안등만 저장할 수 있습니다. 다른 수집원과 리뷰·점수 테이블은 수정하지 않으며 시설 테이블만 초기화합니다. GitHub Actions의 수동 실행은 활성화 변수 없이 사용할 수 있고 기본 선택은 security_light입니다. 정기 실행은 기존 `FACILITY_COLLECTION_ENABLED=true` 조건을 유지합니다. DB_PORT Secret이 없으면 이 프로젝트의 TiDB 기본값 4000을 사용합니다.

기본 파일은 검증된 스냅샷입니다. 재실행은 같은 파일을 DB에 다시 반영하는 것이며 공공 원본의 최신 버전을 자동 다운로드·재변환하지 않습니다. CSV URL/경로를 지정하면 기본 파일보다 우선합니다. 기본 파일은 API 키 없이 수집할 수 있습니다. 가로등은 여전히 대상 지역을 포함하는 원본 확보가 필요합니다.

변환 검증: https://github.com/capstone-team404/Spring404/actions/runs/38697575403
원본 SHA256: c624d897f81e6124fa79e3362929af2fb720e820268d7722fe5f7abaa7a332aa

이번 단계는 시설 위치 수집 → 중복 제거 → Zone 배정 → 현황 저장·표시까지입니다.
시설 개수 기준과 경찰시설 거리 기준은 아직 확정하지 않았으므로 새로운 공공 안전점수를 계산하지 않습니다.
확정된 향후 비중은 조명 30%, CCTV 30%, 편의점 20%, 경찰시설 20%입니다.
기존 `public_safety_zone` 및 리뷰·경로 점수 계산은 변경하지 않습니다.

## 수집 범위와 원본

- 중심: 기존 서버 설정 `HONGDAE_CENTER_LAT=37.5572`, `HONGDAE_CENTER_LNG=126.9245`.
- 일반 시설: `GRID_RADIUS_KM=1.0`의 원형 반경. 기존 사각 격자의 모서리 구역은 미수집으로 표시합니다.
- 경찰시설: 기본 2km까지 수집. 각 대상 Zone 중심에서 가장 가까운 시설까지 **직선거리**를 저장·조회합니다. 도보거리나 대응시간이 아닙니다.
- CCTV: [행정안전부 CCTV정보 조회서비스](https://www.data.go.kr/data/15155042/openapi.do)의 `/1741000/cctv_info/info`. 서울 주소를 대상으로 모든 페이지를 읽은 뒤 방범 관련 설치목적과 반경으로 필터링합니다. 서대문구도 배제하지 않습니다. 개수는 카메라 대수가 아닌 설치 지점 수입니다. 카메라 대수·설치목적·원본 기준일은 별도 메타데이터로 보관합니다.
- 편의점: [카카오 로컬 API](https://developers.kakao.com/docs/ko/local/dev-guide) `CS2` 카테고리.
- 경찰시설: 카카오 `PO3` + 경찰서·지구대·파출소·치안센터 키워드. 상세 카테고리로 필터링하고 장소 ID로 중복 제거합니다. 검색 결과가 제한되면 사각 영역을 재분할합니다. 분할·페이지 한도에 걸리면 불완전한 목록을 저장하지 않습니다.
- 가로등: [서울시 가로등 위치 정보 OA-22205](https://data.seoul.go.kr/dataList/OA-22205/F/1/datasetView.do)의 공식 다운로드를 지원하며 CSV URL/파일로 교체할 수 있습니다.
- 보안등: 위의 기본 좌표 변환 스냅샷을 사용하며 CSV URL/경로로 교체할 수 있습니다.

### 조명 데이터의 확인된 한계

2026-10-13에 OA-22205 CSV를 내려받아 확인했습니다. 기준일은 2023-12-21이며 서울시 도로사업소·서울시설공단 관리 대상입니다.
전체 19,316행 중 기존 중심 반경 1km 안의 지점은 **0개**였습니다. 실제 홍대의 조명이 없다는 뜻이 아니라 이 원본으로 대상 지역을 확인할 수 없다는 뜻입니다.
또한 25행은 WGS84 위·경도 범위를 벗어나므로 좌표 검증에서 제외 대상이며, 현재 수집기는 이런 원본을 성공으로 발행하지 않습니다.
따라서 해당 원본은 `failed`(포함 범위 확인 필요)로 기록하고 0개를 발행하지 않습니다.
가로등은 해당 지역을 포함하는 원본을 추가 확보해야 합니다. 보안등은 위의 마포구 부분 자료를 기본 제공합니다.
지도에는 미수집과 실제 조회 목록의 0개를 구분하며, 모든 숫자는 공개 목록 기준입니다.

## 로컬 / 서버 실행

`backend/.env.example`을 참고해 backend 실행 환경에 설정합니다. 키는 프론트엔드 `VITE_` 변수에 넣지 않습니다.

```sh
cd backend
pip install -r requirements.txt
python collect_facilities.py --once
```

- `--once`: 모든 수집원을 즉시 갱신합니다.
- `--due`: 기본 7일 주기로 갱신 시기가 된 수집원만 실행합니다. 실패한 원본은 최소 1시간 후 재시도합니다.
- `--loop`: 계속 실행되는 작업 프로세스에서 매시간 `--due`를 실행합니다. 웹 서버 시작 시 자동 실행하지 않습니다. 무료 웹 호스팅의 절전·다중 프로세스로 인한 중복 실행을 피하기 위한 독립 작업입니다.
- 정상 완료는 종료 코드 0, 일부 실패/미설정은 1입니다. 성공한 다른 수집원은 저장됩니다.

필수 연결:

```dotenv
DATA_GO_KR_SERVICE_KEY=공공데이터포털_CCTV_활용신청_인증키
KAKAO_REST_API_KEY=카카오_앱_REST_API_키
STREETLIGHT_CSV_URL=https://원본_가로등_CSV_다운로드_주소
SECURITY_LIGHT_CSV_URL=https://원본_보안등_CSV_다운로드_주소
```

CSV 대신 로컬 파일 경로를 쓸 수 있습니다. 동일 종류에서 PATH가 URL보다 우선합니다. 파일 원본은 새 파일로 교체해 두면 작업이 읽습니다. URL 방식은 실행할 때 자동 내려받습니다.
CSV는 UTF-8/CP949, WGS84 `위도/경도` 또는 `lat/lng` 열을 지원합니다. `관리번호`, `보안등위치명`, `소재지도로명주소`, `데이터기준일자`도 보관합니다. 위·경도가 없거나 좌표계가 다르면 원본을 먼저 정리해야 합니다. HTML 오류 페이지·빈 원본·좌표 누락은 실패로 처리합니다.
원본이 기준일을 제공하지 않으면 `STREETLIGHT_DATA_DATE`, `SECURITY_LIGHT_DATA_DATE`를 설정합니다. 최근 수집일과 원본 기준일은 서로 다릅니다.

## GitHub Actions 정기 실행

`.github/workflows/collect-facilities.yml`에 매주 화요일 03:17(KST) 정기 실행과 수동 실행을 준비했습니다.
GitHub의 예약 실행은 기본 브랜치에서 동작하며 큐 상태에 따라 지연될 수 있습니다.

Repository Secrets:
- `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`
- `DATA_GO_KR_SERVICE_KEY`, `KAKAO_REST_API_KEY`

Repository Variables:
- `STREETLIGHT_CSV_URL`, `SECURITY_LIGHT_CSV_URL`, 필요하면 원본 기준일 변수
- `FACILITY_COLLECTION_ENABLED=true` (설정이 끝나기 전에는 작업이 실행되지 않습니다.)
- 서버 격자 설정을 바꿨다면 `HONGDAE_CENTER_LAT`, `HONGDAE_CENTER_LNG`, `GRID_RADIUS_KM`, `GRID_LAT_SIZE`, `GRID_LNG_SIZE`를 동일하게 설정
- 선택: `POLICE_COLLECTION_RADIUS_M` (기본 2000)

TLS DB 연결을 사용합니다. GitHub 실행 환경에서 DB 접속이 허용되어야 합니다.
Actions → Collect safety facilities → Run workflow로 첫 실행을 확인한 뒤 정기 실행을 사용합니다.
이 변경만으로 API 발급·DB 인증·실제 운영 스케줄이 활성화되는 것은 아닙니다.

## 저장 및 조회

backend 시작/수집 명령에서 새 테이블 두 개를 생성합니다. 기존 점수 테이블은 변경하지 않습니다.
- `collected_facility`: 수집원별 최신 시설 위치, Zone, 원본 기준일, 메타데이터.
- `facility_source_state`: 수집원별 최근 시도·성공·실패·건수.

중심·반경·격자 설정을 해시로 구분하여 다른 설정의 과거 데이터를 현재 구역에 섞지 않습니다.
각 수집원 전체 목록이 정상 수집됐을 때만 트랜잭션으로 이전 목록을 교체합니다. 실패하면 이전 목록과 최근 성공일을 유지합니다. 늦게 끝난 오래된 실행이 최신 실행을 덮어쓰지 않도록 저장 시 상태 행을 잠그고 시도 시각을 비교합니다.
가로등·보안등은 소수점 7자리까지 같은 위치인 항목을 합산할 때 한 지점으로 처리하며, 가까운 별도 위치는 유지합니다.

- `GET /facilities/zones`: 전체 Zone 시설 현황과 수집원 상태.
- `GET /map/zones`: 각 기존 Zone에 `facility_inventory`를 추가합니다. 기존 점수 필드는 그대로입니다.
- 시설 미수집 개수는 `null`, 정상 수집 목록에 해당 Zone 시설이 없으면 `0`.
- 조명 원본이 하나만 있으면 합산 개수는 `null`, `lamp_known_count`에 확인된 개수를 제공합니다.
- 실패 후 이전 자료가 있거나 최근 성공 후 8일 이상 지났으면 `stale=true`.
- 반경 경계에 걸친 Zone은 `boundary_zone=true`로 반경 안의 부분 집계임을 표시합니다.
- `score_status=pending_criteria`: 새 시설 점수 산정 대기.

## 검증

```sh
pip install -r requirements-dev.txt
python -m pytest tests -q
cd frontend
npm install
npm run build
```

추가 테스트는 원형 반경, CSV 인코딩/오류, CCTV 페이지/목적 필터, 카카오 분할/중복/경찰 분류, 실패 격리, 재시도 주기, 트랜잭션 롤백, 오래된 실행 차단, 미수집/0 구분, 조명 합산, 경찰시설 직선거리를 다룹니다.
트랜잭션 테스트는 SQLite 어댑터를 사용하므로 실제 MySQL/TiDB의 동시 실행·TLS 연결은 운영 환경에서 추가 확인해야 합니다.
실제 CCTV·카카오 연결은 발급받은 키가 필요하고, 가로등·보안등은 대상 지역 원본이 필요합니다.
