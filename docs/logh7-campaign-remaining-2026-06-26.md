# LOGH VII 캠페인 잔여 작업 전수 + 분류 + 우선순위 (2026-06-26)

사용자 캠페인 목표 = 전체 리마스터(로그인→캐릭생성→월드진입→맵전환·행성내장소·직무카드·커맨드·NPC AI·전략맵·전술맵·함대전·작전 + HUD/UI/이미지/모델 리마스터).
근거: `logh7-remaster-roadmap-2026-06-26.md`, `logh7-completion-matrix-2026-06-26.md`, `logh7-live-flow-plan-2026-06-26.md`,
`logh7-re-coverage-c002-status-2026-06-26.md`, `logh7-remaster-gap-2026-06-26.md`, `logh7-outstanding-work-2026-06-25.md`,
`logh7-operations-server-2026-06-26.md`, `logh7-npc-roster-refine-2026-06-26.md`, `logh7-galaxy-special-terrain-2026-06-26.md`, `logh7-loop-state.md`.
서버 현황: 1172 tests / 1154 pass / 0 fail / 18 skip. 분류 = **A**=autonomous(코드/RE/데이터, 라이브 불요·테스트가능) / **L**=live-gated(실클라 수동 trace/shot 필수) / **U**=user-decision.
원칙: 추측 P0 승격 금지 — 미구현 동작은 "미구성/미측정"으로만 기재.

---

## A. Autonomous 작업 (라이브 없이 진행+테스트 가능)

| # | 항목 | 분류 | 가치 | 선결조건 | 근거 |
|---|---|---|---:|---|---|
| A1 | **C002 9함수 deep-RE 웨이브** — FUN_004f6040(패널위젯 빌더, 상류근본)→FUN_004f6680/6600/58c0(unit-list populate/선택)→FUN_004f93c0/005737d0(dispatch). 6-레이어 서브시스템 구성/구동 RE | A(RE) | ★★★★★ | redex 인덱스(있음). C002 라이브 종결의 유일 잔여 경로 | re-coverage-c002 §2·§6 |
| A2 | **0x0325 네이티브 756B officer 레이아웃 RE + 서버 배선** — officer 필드(0x24c/0x250) → 직무카드/패널 선택 데이터 선결 | A(RE+wire) | ★★★★ | 0x0325 핸들러 디컴파일. A1 layer3(officer 채움)와 결합 | re-coverage-c002 §6.3 |
| A3 | **HUD 20종 2x 업스케일본 클라 배포** — `.omo/work/remaster/hud-overlay/` 완성 자산을 `client/dist/.../data/image/` 드롭인. 배포 리마스터 0%→20종 | A(데이터) | ★★★★ | 자산 존재(완성). ※라이브 UV검증(L7)은 별도 | remaster-gap §3 |
| A4 | **모델/배경 텍스처 8bpp→2x AI 업스케일** — MDX 텍스처 921종·성운/배경 jpg, 메시 불변 BMP 교체만 | A(데이터/툴) | ★★★ | 외부 업스케일러(Real-ESRGAN). MDX UV 0-1 정규화 확인 | remaster-gap §1·§2 |
| A5 | **작전 정산→功績(merit) 적립 배선** — `evaluation.bonusPoints` → personnel/rank-ladder 연결(현재 반환까지만). world-state 점령상태→outcomeFor 공급 | A(서버) | ★★★ | operation-plan 도메인(있음). rank-table 연결 | operations-server §6 |
| A+ | (차순위) NPC AI 자율행동 정제·매뉴얼 11 JSON 잔여 배선·특수지형 수동 큐레이션(galaxy.json terrain 필드)·진영 listFleets 투영 배선 | A | ★★ | server/ 무충돌, 병렬 워크플로 가능 | roadmap §5, matrix |

## L. Live-gated 작업 (실클라 수동 로그인 trace/shot 없이 닫을 수 없음)

| # | 항목 | 분류 | 가치 | 선결조건 | 근거 |
|---|---|---|---:|---|---|
| L1 | **G0 월드진입 신뢰화** — 수동 로그인→캐릭생성→0x0f02 full flow 재현 신뢰성(포그라운드 ~35s 스플래시 의존, 첫글자 씹힘) | L | ★★★★★ | 메인 직렬, SHA복원. 모든 L의 게이트 | live-flow §1, journal |
| L2 | **AXIS2 상태전환 시각 실증(G1)** — 0x0f1f/0xb09+0xb0a 서버푸시로 전략→전술 로드-arm 시각 진전. `worldbase+0x3579cc` watch로 레버 선택 | L | ★★★★★ | L1. "며칠째 전략맵 정체"의 결정적 돌파(클릭과 decoupled) | re-coverage-c002 §4·§5 |
| L3 | **별개 캐릭 렌더(G2)** — 캐릭2 distinct 이름/초상화 picker 2카드 라이브 확정(서버 RESOLVED, 라이브 미확정) | L | ★★★★ | L1. 0x1008 ×2 + 0x2004 trace | live-flow S4·S5, matrix 델타 |
| L4 | **C002 0x0b01 클릭확정 라이브** — A1 서브시스템 구현 후 함대선택 hit-test→명령row→FUN_005737d0→0x0b01 송신 라이브 측정 | L | ★★★★ | A1 완료 + L1. 입력 6종 전수 배제 완료 | re-coverage-c002 §3 |
| L5 | **한글 이름입력 신뢰성** — 첫글자 씹힘 보정·D3D8 인월드 마우스/키 입력 신뢰성(네이티브 한글 지원 확인됨, 입력 레이어 잔존) | L | ★★★ | L1. keybd_event 경로 | matrix(로그인 §), journal |
| L+ | (차순위) HUD UV 정합 검증(A3 배포물)·전술맵 렌더(placeholder→완전 데이터)·strict credential 빈값 픽스(G4, 클라 0x7000 빌드경로 RE는 A지만 검증 L) | L | ★★ | L1 | remaster-gap §4, roadmap G4 |

## U. User-decision

| # | 항목 | 분류 | 비고 |
|---|---|---|---|
| U1 | **업데이트 서버 UX** — Gin7UpdateClient→G7Start 런처 한글화 표면만 완료. 실제 업데이트 서버 운영 방식/배포 채널 | U | play-logh7.exe 빌드됨, 런처RE 22-29% |
| U2 | **리마스터 생성형 보강 범위** — 함선 헐 디테일·성운·초상화(GFPGAN)는 순수 SR 한계 초과, 생성형(img2img) 창작 정도 | U | remaster-gap §2 한계 |

---

## ★ 최종 판정 (정직)

**Autonomous로 실질 고가치 일이 아직 남아 있다 — 그러나 "플레이어 대면 시각 진전"의 유일 고가치 경로는 라이브다.** 두 축이 공존:

- **A 축은 고갈되지 않았다.** A1(C002 9함수 deep-RE)은 라이브 L4를 닫기 위한 **선결 필수 구현**이며 라이브 없이 redex로 100% 진행 가능 — 현재 C002 종결은 "단발 force/click 아닌 6-레이어 서브시스템 구현"으로 환원됐고 그 구현은 autonomous다. A2/A3/A5도 즉시 착수 가능하고 테스트로 닫힌다. 즉 **라이브 없이도 며칠치 고가치 작업이 실재**한다.
- **그러나 B기둥(플레이어 대면 ~45%)의 진짜 병목은 L1/L2다.** 서버/시뮬(A기둥 ~78%)은 대부분 done이라 "보이는 게임"으로 전환하려면 L1(월드진입 신뢰화)→L2(AXIS2 상태전환 시각 실증)가 critical path이고 이는 **오직 메인 직렬 라이브로만** 닫힌다. 수십 사이클 C002만 두드린 게 정체 원인이었다는 RE 결론(클릭≠상태전환, decoupled)이 이를 뒷받침.

**권고 운용**: 메인은 L1→L2를 직렬 라이브로 추진(최고 ROI, 정체 돌파), 병렬 워크플로/에이전트는 A1(C002 RE)·A2(0x0325)·A3(HUD 배포)·A5(작전 merit)를 server/ 무충돌로 소진. **"autonomous가 말랐으니 라이브뿐"은 거짓** — A1이 곧 L4의 선결이라 둘은 직렬 의존이며, autonomous를 멈출 이유는 없다. 단 **사용자가 체감할 시각 진전의 단기 최대가치는 L2(상태전환 실증)** 이다.
