# LOGH VII 리마스터 통합 로드맵 — 2026-06-25 (재구성)

이전 `logh7-remaster-roadmap-2026-06-24.md`를 대체. 2026-06-25 전역 증거 스윕(14 도메인:
워크플로 `w62bxbk5a`+`wrom96m62`) + 레퍼런스 134장 시각검수(`wnnrff5mi`) + 사용자 5대 실게임
지시에 근거해 재정렬. 근거 요약 `.omo/re-audit/sweep-rerun-summary.txt`.

## 0. 사용자 정의 "진짜 게임" (M1 합격 기준) — [[logh7-real-game-behavior-2026-06-25]]

1. **autologin 금지** — 검증은 실클라 **수동 로그인** → 캐릭생성 → 월드.
2. **로그인만 창모드(테두리), 이후 풀스크린.** (ui_explorer는 현재 시작부터 borderless 강제 = 버그.)
3. **캐릭터 = 초상화 여러 개 + 이름 다르게 → 별개 캐릭.** ("한 캐릭터만" 버그.)
4. **캐논 NPC 시드 → 플레이어 하급사관(자동황제 금지).** O군 초상화는 **매뉴얼 문서화 인물만**.
5. 모든 테스트는 `docs/logh7-client-state-journal.md` 기록(전진/정체/회귀).

## 1. 증거 기반 현 상태 (14 도메인)

**이미 됨(놀라운 발견):**
- **NPC AI**(`logh7-npc-ai.mjs` runNpcTick) + **자율 전략 갤럭시 시뮬**(`logh7-strategic-sim.mjs`
  strategicTick) — 무유저 전쟁이 끝까지 진행. auth-server.mjs:47/1072 배선. (galaxy-sim·npc-ai P-done.)
- **duty-card/roster** 0x1200/0x1201/0x120f 파서·서버빌더 바이트정합(simple-info.mjs). 데이터 경로 완성.
- **inplanet 拠点패널**: client `FUN_0057aa90`(panelKind=3)이 0x031f 소비, **支配陣営名 표시 확정**.
- **faction-color**(채널C): 소비처 `FUN_004ef0d0` +0xa/+0xb 비교 바이트확정, 서버 변경점 정의됨.
- **wire**: 11 레코드 중 10개 바이트검증. 0x030b(함선클래스)만 빌더 부재.
- **galaxy.json** 위치 권위 확정(MDX엔 위치 없음 — 포인터추적까지 완료).
- 월드진입(autologin)·0x0323 15/15·서버테스트 ~1145 PASS.

**미해결 = 플레이어-대면 상호작용:**
- 🔴 **C002**(전략 명령 emit 0x0b01) — 모든 플레이어 상호작용의 공통 게이트(이동·전술맵 mode0·
  직무패널·拠점패널 오픈 전부 여기로 funnel). 명령카탈로그=클라정적(`+0x3416d8`), 진짜 송신
  `FUN_005737d0`←…←명령메뉴 row클릭(위젯0x65,rowCount>0). 단 re-coverage가 C002 임계경로
  23함수 중 **9개 lightdoc-only(deep-RE 미완)** 적발 → "RE 100%"는 과장. 선결=fleet-render/own-cell.
- 🔴 **로그인 입력 레이어**(창모드) — autologin 금지로 이제 **P0 1순위**. ui_explorer가 시작부터
  borderless 강제 + GetWindowRect 좌표(테두리 무시)라 창모드 로그인 클릭 미등록.
- 🔴 **자동황제/빈월드** — 캐논 인물 로스터 미시드(데이터 `content/roster/canon-character-posts.json` 존재).
- 🟡 **전술맵 렌더** — mode byte +0x126711 게이트(클라로컬, 서버 푸시 불가; C002와 동일 FSM 의존).

## 2. 마일스톤 (범위=전체)

- **M0 기반** — done(테스트 1145, SHA 992dc7e2 정정, RE 행렬 11.4%).
- **M1 실플레이 게이트(현재 집중)** — 위 "진짜 게임" 5조건. P0 게이트 ↓.
- **M2 인월드 시스템** — 직무카드/커맨드 패널·拠점패널·맵전환 시각 해금(전부 C002 종속).
- **M3 전투/전술** — 전술맵 렌더·함대전 시각(전술 mode0 + C002).
- **M4 콘텐츠/캐논** — 캐논 NPC 전수·작위/직위·특수천체(bh/ns 위치 galaxy.json 보강)·특수지형
  (0x0315 navigability + 회랑 galaxy-adjacency.json).
- **M5 리마스터** — HUD/UI 텍스처(현 6% TGA), 모델(0/406 MDX), 배경. AI 초해상 바이너리 부재 →
  Lanczos 한계, 외부 업스케일러 설치 or 생성형 도구 필요.
- **M6 전수 RE** — G7MTClient 5.7%→임계경로 우선 확장(C002 9함수 deep-RE 등).

## 3. P0 게이트 큐 (재정렬, M1)

| id | 상태 | 항목 | 다음 증거 |
|---|---|---|---|
| R0-A | **next(1순위)** | 로그인 창모드 입력 돌파 | ui_explorer 창모드 구동(borderless 강제 해제)+client-rect `ClientToScreen` 좌표 클릭 → 수동 로그인 **0x7000** 발신 trace |
| R0-B | in_progress | 캐논 NPC 시드(자동황제 픽스)+플레이어 junior+별개캐릭 | 워크플로 `w7p215slt`: NPC 0x0323 시드, 황제=NPC, 플레이어 무작위, test 무회귀. O군=매뉴얼인물만 |
| R0-C | next | 로그인 후 풀스크린 전환 | 로그인 성공 시 borderless 풀스크린 적용, 월드 렌더 유지 |
| R0-D | blocked→active | C002 명령 서브시스템 | fleet-render own-cell 선결 → 라이브 클릭 실험(g_StrategyClient +0xf4→2,+0xd4>0) → 0x0b01. 선행: C002 9함수 deep-RE 웨이브 |
| R0-E | next | faction 함대색 라이브 | unitFleetsForLocation에 listFleets 전체 투영 → 적/아 함대 distinct color |

## 4. Critical Path & 병렬 트랙

**Critical path(직렬, 메인):** R0-A(창모드 로그인) → 수동 로그인→캐릭생성(별개)→월드 → R0-D(C002).
**병렬(워크플로/에이전트):** R0-B(NPC시드, 진행중) · R0-E(faction색) · C002 9함수 deep-RE 웨이브 ·
HUD 리마스터(senryaku_panel) · 특수천체/지형 데이터 보강 · 레퍼런스 시각diff.

**"막히면 우회":** C002가 깊으면 R0-B/E·리마스터·콘텐츠로 전진(데이터 경로는 이미 동작). C002는
deep-RE 웨이브로 별도 추진하되 전체를 막지 않게.

## 5. 즉시 다음 행동

1. (진행중) `w7p215slt` NPC 시드 워크플로 결과 → O군=매뉴얼인물 한정 적용 → 병합 → 테스트.
2. ui_explorer 창모드 옵션 구현(`--display-mode windowed` + client-rect 좌표) → R0-A 라이브.
3. C002 임계경로 9함수 deep-RE 웨이브(워크플로) 착수.
4. 매 라이브 테스트 = 저널 기록.
