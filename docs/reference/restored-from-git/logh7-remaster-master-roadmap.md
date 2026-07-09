# LOGH VII 전체 리마스터링 마스터 로드맵

> 작성: 2026-06-24 KST  
> 상태: 초안 → 루프 상태 파일(`docs/logh7-loop-state.md`)과 함께 갱신  
> 범위: 실제 `G7MTClient.exe`를 기준으로 한 클라이언트 RE → 수신 데이터 검증 → 서버 송신 데이터 연결/생성 → 실제 소비 레코드·메소드 추적 → 자유로운 맵 전환 → 행성 내 장소 → 직무카드·커맨드 구현 → HUD/UI/이미지/모델 리마스터링.

## 마일스톤 개요

| 단계 | 마일스톤 | 핵심 완료 기준 | 우선순위 |
|---|---|---|---|
| M1 | **C002 전략 명령 게이트 종결** | 실제 클라이언트에서 함대 선택 → 명령 메뉴 출현 → 명령 row 클릭 → `0x0b01` 송신 → `0x0b07` 수신 → 화면 변화 | P0 |
| M2 | **자유로운 맵 전환 완성** | 서버 푸시 `openBattleField` 시퀀스 → 클라 mode-render 전환 → 전술 맵 진입 → 결과 화면 | P0 |
| M3 | **행성 내 장소·성계 세계관** | 성계/행성 위치 MDX/콘텐츠 전수 확인 → 행성 궤도·시설·경제 데이터 와이어링 → 클라 렌더 검증 | P0-P1 |
| M4 | **직무카드·커맨드 구현** | `0x0305/0x0307/0x0707` 등 직무/명령 카탈로그 빌더 RE → 서버 배선 → UI 오픈 라이브 | P0-P1 |
| M5 | **HUD/UI/이미지/모델 리마스터링** | 업스케일/생성형 파이프라인 → 라이브 드롭인 검증 → 폰트/모델/텍스처 일괄 처리 | P1-P2 |
| M6 | **로비·풀스크린·디스플레이** | 와이드 모니터 필러박스 · 고해상도 로비 · DPI-aware 런처 | P1 |
| M7 | **한글화·채팅 왕복** | 채팅 송신 cp932 해저드 code-cave 패치 → 라이브 한글 왕복 → UI/폰트/문서 휴게 | P0 |
| M8 | **전수 RE 커버리지 행렬** | G7MTClient/Gin7UpdateClient/G7Start/setup/BootFirst/LOGH7Launcher 함수·파일·데이터구조 RE 완결 | P1 |
| M9 | **모딩·콘텐츠 인프라 완성** | 4레이어 모딩 아키텍처 → 콘텐츠 팩 검증 → 예시 모드 → 자동화 스케줄/스킬 승격 | P2 |
| M10 | **릴리즈·루프 하드닝** | 테스트 회귀 0 → 문서 동기화 → CI-like 자동화 → 하위 goal 종료 | P2 |

## 완료로 세지 않는 것 (루프 공약)

- Vite/React 데모 화면
- `0x0f08->0x0f09` 메일/HUD 트래픽만 있는 "검증"
- P2/P3 추정 데이터를 원본 서버 데이터로 포장
- 서버 테스트만 통과하고 실제 클라이언트 화면/trace가 없는 작업
- 추측성 서버 응답의 기본값 승격

## 현재 프런티어 (2026-06-24)

1. **M1 게이트**: C002 메커니즘이 완전히 매핑됨. 0x0b01의 단일 근본 게이트는 마우스 클릭이 함대/명령 위젯 rect hit → `+0xb00` 발화 + 명령 메뉴 rowCount>0. 종결은 명령 카탈로그 빌더 트리거 + 함대선택 hit-test rect 구현 → 명령 메뉴 populate → 명령 row 클릭 라이브 0x0b01.
2. **M2 게이트**: 서버 푸시 맵전환 경로(`0x0349/0x0341/0x0343/0x042f/0x0f1f`)는 작동 확정. 클라 mode-render 게이트가 잔여.
3. **M4 게이트**: `0x1200/0x1201/0x120f` 로스터/직무 패밀리 수신은 확인. 직무 패널 시각 표시는 UI 클릭(마우스)/C002 종결에 막힘.
4. **M7 게이트**: 채팅 송신이 cp932 디코드로 손상됨을 verifier가 확정. 클라 code-cave 패치(채팅만 Korean, 비트맵폰트는 Japanese 유지) 필요.

## 루프 운영 규칙

- 매 사이클은 `AGENTS.md`, `docs/logh7-loop-state.md`, 본 문서를 먼저 읽는다.
- 선택한 항목의 RE 프리패스를 먼저 수행한 뒤 구현/패치한다.
- maker와 checker를 분리한다. 구현 측이 완료 판정을 독점하지 않는다.
- 모든 완료 주장은 실제 클라이언트 화면, trace, DB 덤프, EXE SHA 복구 여부 중 하나 이상의 증거를 갖는다.
- 50% 이상 컨텍스트가 차면 즉시 요약/압축 후 이어간다.
- 문서화는 한 행동마다: 증거 경로, 남은 blocker, 다음 항목을 `docs/logh7-loop-state.md`에 갱신.

## 하위 Goal 할당

각 마일스톤은 별도 `/goal`로 분리 운영:

- `goal:logh7-m1-c002-command` — M1
- `goal:logh7-m2-map-transition` — M2
- `goal:logh7-m3-planet-locations` — M3
- `goal:logh7-m4-duty-cards` — M4
- `goal:logh7-m5-asset-remaster` — M5
- `goal:logh7-m6-display` — M6
- `goal:logh7-m7-korean-chat` — M7
- `goal:logh7-m8-re-coverage` — M8
- `goal:logh7-m9-modding` — M9
- `goal:logh7-m10-release` — M10

## 관련 문서

- `docs/logh7-loop-engineering.md` — 루프 엔지니어링 절차
- `docs/logh7-loop-state.md` — 현재 상태, P0/P1/P2 큐
- `.debug-journal.md` — append-only RE 일지
- `.claude/skills/logh7-*` — 전문 스킬
- `.claude/workflows/logh7-*.js` — 결정론 워크플로
