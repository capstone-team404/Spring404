# 시설 자동 수집 운영

## 자동 실행

- API 시설(CCTV·편의점·경찰시설): 매주 화요일 03:17(한국 시간) 수집 → 반경 필터링 → Zone 배정 → DB 저장.
- 보안등: `backend/data/security-lights-input.csv`를 교체해 main에 반영하면 주소 좌표 변환·기존 좌표 재사용·Zone 배정·DB 갱신.
- 가로등: `backend/data/streetlights-input.csv`를 실제 원본으로 교체해 main에 반영하면 같은 자동 실행에서 읽어 DB에 저장. 현재 파일은 제목만 있는 양식이며 실제 가로등 데이터가 아닙니다.
- 조명 파일 변경 시에는 조명만 실행하므로 API 시설을 불필요하게 다시 수집하지 않습니다.
- 정기 실행은 저장소 변수 `FACILITY_COLLECTION_ENABLED=true`일 때 동작하며 `false`로 중지할 수 있습니다.
- 수동 실행: Actions → Collect safety facilities → Run workflow → source를 all 또는 개별 시설로 선택.

## 가로등 원본의 조건

홍대 반경 안 지점이 포함된 WGS84 위도·경도 CSV가 필요합니다. UTF-8/CP949, 위도·경도 또는 lat/lng 열을 지원합니다. 주소만 있는 가로등 파일은 현재 자동 좌표 변환 대상이 아닙니다. 원본 좌표계를 확인해 변환해야 합니다. 준비된 파일의 경로는 `backend/data/streetlights-input.csv`이며 `STREETLIGHT_CSV_URL` 설정으로 HTTPS 원본을 연결할 수도 있습니다. 이 URL이 설정되면 등록 파일보다 우선합니다.

홍대 지점이 없는 기존 서울시 광역 도로 관리 가로등 파일을 실제 0개로 간주하지 않습니다. 원본이 없는 동안 가로등 상태는 not_configured, 개수는 null입니다. 다른 시설 수집은 계속되고 가로등은 pending_sources로 명시됩니다. 가로등만 직접 실행했는데 원본이 없으면 실패로 표시합니다.

## 실패와 결과 확인

- 수집원별 실패를 분리해 한 API 실패가 다른 시설 수집을 막지 않습니다.
- 정상적으로 읽은 수집원 목록만 트랜잭션으로 교체합니다. 실패한 수집원의 기존 시설 자료는 유지합니다.
- 필수 API 또는 보안등 갱신이 실패하면 워크플로도 실패합니다. 가로등 등록 대기는 보고서에 명시하며 전체 실행을 실패시키지는 않습니다.
- Actions 요약과 `facility-collection-results` 결과 파일(30일 보관)에 수집원별 상태·저장 건수·Zone 현황·미연결 자료가 표시됩니다.
- available_sources_healthy는 CCTV·편의점·경찰시설·보안등의 저장/갱신 상태입니다. all_facility_data_complete는 자료 범위까지 모두 충족했는지 별도로 나타냅니다. 자동 실행 성공이 실제 모든 시설의 완전한 수집을 뜻하지 않습니다.
- 보안등은 주소 대표 좌표이고 미매칭 및 서대문구 미포함이 있으므로 일부 수집 표시를 유지합니다. 시설 점수 기준은 확정 전이므로 이번 수집으로 안전점수를 새로 계산하지 않습니다.

## 인증 정보

GitHub Secrets: DATA_GO_KR_SERVICE_KEY, KAKAO_REST_API_KEY, DB_HOST, DB_USER, DB_PASSWORD, DB_NAME. DB_PORT가 없으면 TiDB 기본 4000, DB TLS 연결을 사용합니다. 키 앞뒤의 줄바꿈/공백은 제거해 사용합니다. 요청 URL이나 키 원문은 결과에 기록하지 않습니다.

CCTV 인증키는 행정안전부 CCTV정보 조회서비스 활용승인이 필요합니다. 편의점·경찰시설 및 보안등 좌표 변환에는 카카오맵/로컬 API가 활성화된 REST API 키를 사용합니다.

CCTV 원본의 좌표 오류 행은 제외 건수를 메타데이터로 남기고 정상 좌표만 수집합니다. invalid_coordinate_rows가 있으면 partial=true로 표시하며, 좌표를 확인할 수 없는 원본을 0개로 발행하지 않습니다.
