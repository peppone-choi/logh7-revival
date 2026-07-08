# LOGH VII Revival Current Roadmap

작성일: 2026-07-06 (현행화: 2026-07-07)

## 현재 판정

목표는 원본 클라이언트 + 자체 서버로 은하영웅전설 VII의 온라인 기능 전체를 되살리는 것이다. 2026-07-07 기준 서버 구현(`server/src/server/`): `logh7-transport-0030.mjs`(봉투/체크섬), `logh7-frame-stream.mjs`(TCP 스트림 분할/병합), `logh7-child-codec.mjs`(P/S 테이블·64비트 블록 암복호·key expansion), `logh7-gin7-credential.mjs`(GIN7 자격증명 파싱), `logh7-login-harness-server.mjs`(0x0034→0x0035 핸드셰이크, phase1 키 셋업, 0x0030 자격증명 복호, JSONL 트레이스). 테스트 44/44 통과 (`node --test tests/*.test.mjs`, 2026-07-07).

미구현: 로그인 성공 응답(inner 0x7000 계열 login/session OK)과 실클라 라이브 로그인 증거, 그 이후 전부 — 캐릭터 작성/삭제/선택, 로비/월드, 전략맵, 전술맵, 전투, 명령, 제안, 채팅.

기존 `server/content/**/*.json`은 정본으로 신뢰하지 않는다. `tools/extract/audit_data_decode.mjs`가 현재 기준선이다.

실행 루프는 `docs/logh7-codex-harness-loop.md`를 따른다. 각 작업은 계획 및 RE, 구현, 테스트, 라이브 확인 순서로 반복한다.

감사 결과(`server/content/generated/logh7-data-decode-audit.json`):

- JSON 총 165개, parse error 0개
- provenance/evidence/hash 계열 필드가 있는 JSON 145개
- repo 기준 깨진 참조가 있는 JSON 132개
- 기능 게이트 중 서버 코드 존재: `login-transport`만 partial
- 캐릭터/전략맵/전술맵/전투/채팅/월드 데이터 게이트: 증거 문서는 있으나 서버 구현 없음

## 데이터 승격 규칙

각 데이터는 다음 조건을 통과해야 서버 입력으로 승격한다.

1. 원천 파일이 현재 트리에 존재한다.
2. 원천 파일 해시 또는 추출 방법이 기록돼 있다.
3. 재생성 스크립트가 현재 트리에서 실행된다.
4. 생성 JSON의 깨진 참조가 없다.
5. 서버 테스트 또는 라이브 클라이언트 검증이 해당 데이터를 실제 소비한다.

이 조건을 통과하지 못한 JSON은 참고 자료일 뿐이다.

## 문서/PDF 요구사항 승격 규칙

`docs/`의 모든 문서와 `docs/reference/*.pdf`의 공식 매뉴얼 요소는 구현 후보로 취급한다. 누락 방지는 `tools/extract/audit_docs_requirements.mjs`와 `server/content/generated/logh7-docs-requirements-audit.json`으로 추적한다.

완료 조건:

- 문서/PDF 요구사항이 기능 도메인별로 인덱싱돼 있다.
- 각 요구사항은 서버 코드, 데이터 원천, 테스트, 라이브 클라이언트 증거 중 맞는 표면으로 연결된다.
- 문서에 적혀 있다는 사실만으로 구현 완료를 주장하지 않는다.

## EXE 전체 기능 RE 규칙

`G7MTClient.exe`의 모든 기능은 함수/도메인 단위로 추적한다. `tools/extract/audit_exe_re_coverage.mjs`와 `server/content/generated/logh7-exe-re-coverage-audit.json`이 현재 커버리지 기준선이다.

완료 조건:

- 함수 주소와 디컴파일 또는 라이브 경로가 기록된다.
- 해당 함수가 wire/data/UI/렌더/상태 중 무엇을 소비하는지 분류된다.
- 서버 구현으로 옮긴 기능은 테스트 또는 실클라 라이브 증거를 갖는다.
- 미해석 함수는 크기/도메인별 backlog에 남긴다.

## UI 좌표 수정 규칙

UI 좌표는 신중히 수정한다. 창 위치, 클라이언트 영역, 해상도, EXE 해시, 패치 상태가 맞지 않으면 같은 숫자도 틀린 좌표다. `tools/extract/audit_ui_coordinates.mjs`와 `server/content/generated/logh7-ui-coordinate-audit.json`을 기준으로 추적한다.

좌표 승격 조건:

- EXE sha256과 실행 종류를 기록한다.
- 창 모드와 client rect를 기록한다.
- 클릭 전/후 스크린샷 또는 로그가 있다.
- 클릭 결과가 목표 UI 동작과 일치한다.
- 좌표는 중앙점과 안전 여백을 함께 기록한다.

## Phase 0: 데이터 전체 재해독 기준선

목표: 이전 JSON을 버리지 않고도 신뢰하지 않는 상태로 격리한다.

완료 조건:

- `node tools/extract/audit_data_decode.mjs`가 `server/content/generated/logh7-data-decode-audit.json`을 재생성한다.
- 감사 결과의 `reviewQueue` 상위 항목부터 원천 파일/추출기/깨진 참조를 줄인다.
- `artifacts/logh7-cd`, `artifacts/logh7-install`, `artifacts/official-patch-staging`, `docs/reference`를 소스 루트로 유지한다.

다음 작업:

- `server/content/generated/logh7-hidden-data-classification.json`
- `server/content/generated/logh7-portrait-full-export-manifest.json`
- `server/content/generated/models.json`
- `server/content/generated/logh7-mdx-catalog.json`
- `server/content/extracted/model-data.json`

위 항목부터 재해독하거나 폐기 후보로 강등한다.

## Phase 1: 로그인 transport와 암호

목표: 원본 클라이언트가 자체 서버에 연결하고 로그인 핸드셰이크를 통과한다.

현재 상태:

- 0x0030 봉투 모듈과 단위 테스트 있음.
- child-codec 정적 P/S 테이블 검증, 64비트 블록 암복호, Blowfish형 key expansion, 0x0031 GIN7 key material 추출 helper 있음.
- Ghidra `FUN_00614460` 근거로 8바이트 배수 raw buffer 암복호 helper 있음. 블록 dword는 클라이언트 x86 메모리와 리셋 전 live-validated codec에 맞춰 little-endian으로 처리한다. 패딩/프레이밍은 아직 추정하지 않는다.
- `docs/reference/legacy-evidence/logh7-0030-protocol.md` 증거 문서 있음.
- Ghidra headless 산출물: `.omo/re-targeted/child-codec-0030-java-v2`, `.omo/re-targeted/child-codec-key-schedule`.
- (2026-07-07) `logh7-login-harness-server.mjs`: 0x0034→0x0035 핸드셰이크, 0x0036/0x0030 트레이스, phase1 키 셋업 후 0x0030 GIN7 자격증명 복호까지 구현·테스트됨(44/44).
- 0x0031 이후 후속 login/session OK inner message(로그인 성공 응답)는 현재 코드 기준 미구현이다.

완료 조건:

- 0x0034/0x0035/0x0036 handshake와 0x0030 child-codec가 서버 코드에 있다.
- 실클라 로그인 화면에서 서버 연결과 로그인 응답을 라이브 증거로 남긴다.

## Phase 2: 캐릭터 작성/삭제/선택

목표: 로그인 후 오리지널 캐릭터 작성, 삭제, 기존 캐릭터 선택이 된다.

증거 후보:

- `docs/reference/legacy-evidence/logh7-character-creation-wire.md`
- `docs/reference/legacy-evidence/logh7-character-record-wire.md`
- `docs/reference/legacy-evidence/logh7-character-creation-research.md`

완료 조건:

- 캐릭터 레코드 wire codec과 서버 상태 저장 구현.
- 작성/삭제/선택을 실클라 UI로 검증.

## Phase 3: 로비와 월드 진입

목표: 캐릭터 선택 후 로비/월드 초기 상태가 원본 클라이언트에 로드된다.

완료 조건:

- 플레이어, 소속, 계급, 함대, 위치, 성계/행성 기본 상태를 서버가 권위적으로 보낸다.
- 위치가 없는 5개 성계는 조작해서 채우지 않고, 증거 등급을 유지한다.
- Obsidian 기록의 `null_galaxy.mdx` 근거는 `server/content/extracted/model-galaxy-alignment.json` 재생성 경로로 복구한다.

## Phase 4: 전략맵과 커맨드 루프

목표: 전략맵에서 이동, 명령, 제안, 배치, 인사, 생산, 보급 등 주요 커맨드가 동작한다.

증거 후보:

- `docs/reference/legacy-evidence/logh7-strategic-map-wire.md`
- `docs/reference/legacy-evidence/logh7-strategic-input-wire.md`
- `docs/reference/legacy-evidence/logh7-opcode-reference-2026-06-28.md`
- `server/content/manual/strategy-commands.json`

완료 조건:

- opcode별 codec/test가 있다.
- 각 커맨드는 서버 상태를 변경하고 클라이언트 UI에 반영된다.
- 전략맵 라이브 QA가 스크린샷/로그를 남긴다.

## Phase 5: 전술맵, 전투, 함대 작전

목표: 전술맵 진입, 함대 이동, 사격, 전투 판정, 손실/퇴각/점령이 동작한다.

증거 후보:

- `docs/reference/legacy-evidence/logh7-proto-battle-core.md`
- `docs/reference/legacy-evidence/logh7-proto-battle-fire.md`
- `docs/reference/legacy-evidence/logh7-proto-battle-fleetops.md`
- `docs/reference/legacy-evidence/logh7-tactical-seed-2026-06-26.md`

완료 조건:

- 전술 seed/state codec 구현.
- 서버 전투 엔진 최소판 구현.
- 실클라 전술 화면에서 이동/사격 결과를 확인.

## Phase 6: 채팅, 사회 기능, 한글화

목표: 원본 UI와 채팅/사회 상호작용을 사용할 수 있게 한다.

한글화는 복원 범위에 포함한다. `logh7-localize` 기준으로 바이트 계층을 분리한다.

- `.rsrc` 메뉴/대화상자 문자열은 UTF-16LE로 패치한다.
- `String.txt` 계열 인게임 문자열은 cp949/ANSI GDI 소비 경로를 검증한다.
- 폰트는 `MS UI Gothic` 전역 슬롯과 실제 `CreateFontA` 소비 경로를 확인한 뒤 바꾼다.
- 한국어 문장은 군사/전략물 톤을 유지하고, 기계번역투를 제거한다.

완료 조건:

- 채팅 입출력 wire와 인코딩 검증.
- 한글화 문자열은 실제 GDI/클라이언트 소비 경로에서 검증.
- 번역 JSON은 추출 원천과 적용 패치가 함께 있어야 승격한다.

## Phase R: 리마스터링 병렬 트랙

목표: 원본 동작 복원을 해치지 않고 UI/초상/함선/전략맵 자산을 고해상도화한다.

원칙:

- 원본 자산, 해시, 추출 경로를 먼저 고정한다.
- 리마스터 산출물은 `server/content/generated/*remaster*` 또는 별도 manifest로만 관리한다.
- 원본 정본 데이터와 리마스터 파생물은 같은 JSON에 섞지 않는다.
- 업스케일/재작화 결과는 원본과 pixel/shape/anchor를 대조해 게임 UI 좌표를 깨지 않는 경우만 적용한다.
- 원본 클라이언트 패치는 reversible patch manifest 없이는 canonical로 승격하지 않는다.

가능한 작업:

- 초상화 TCF 추출 → 업스케일 → 얼굴 ID/이름 매핑 유지
- 전략맵/UI 이미지 추출 → 해상도 개선 → hitbox/좌표 영향 검증
- 함선/효과 텍스처 개선 → 원본 파일명/크기/포맷 호환성 검증
- 한글 폰트와 고해상도 UI를 함께 live QA

완료 조건:

- 원본 asset manifest와 remaster manifest가 모두 존재한다.
- 리마스터 파일마다 원본 해시, 생성 도구, 모델/파라미터, 적용 위치가 기록된다.
- 실클라에서 렌더링이 깨지지 않는 스크린샷 증거가 있다.

## Phase 7: 전체 회귀와 라이브 운영

목표: 죽은 온라인 게임의 주요 기능을 한 세션에서 순서대로 통과한다.

최종 라이브 시나리오:

1. 클라이언트 실행
2. 로그인
3. 캐릭터 작성
4. 캐릭터 삭제
5. 오리지널 캐릭터 선택
6. 로비/월드 진입
7. 전략맵 이동과 명령
8. 제안/인사/생산/보급 상호작용
9. 전술맵 진입
10. 전투와 결과 반영
11. 채팅/사회 기능
12. 한글화 UI/채팅 표시
13. 선택한 경우 리마스터 자산 표시
14. 종료 후 서버 상태 재로드

완료 주장은 위 시나리오의 로그와 스크린샷이 있을 때만 한다.
