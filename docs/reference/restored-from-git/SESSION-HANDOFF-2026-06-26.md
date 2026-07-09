# LOGH VII 세션 핸드오프 — 2026-06-26 (클리어 전 단일 진실원)

이 세션은 클리어 예정. **이 문서 + 아래 참조 문서/메모리만 읽고 이어가면 된다.**

## ★ 클리어 후 즉시 할 일 (사용자 지시 순서)
1. **레포 전체 재구조화 (정밀 스펙, 2026-06-26 사용자 확정)**: 최상위 = **`server/` + `client/` + `docs/`** (docs 유지!). 그 외 전부 삭제대상.
   - **두 폴더 자가완결 — 두 폴더만으로 서버 실행·게임 실행 가능. 두 폴더 밖 런타임 의존성 0.**
   - **`server/`** ← `src/server` + `content`(서버데이터) + `package.json`/`package-lock` + `node_modules` + 서버 entry/start. `cd server && node ... serve-auth --port 47900`로 단독 실행. **경로 전수 갱신**(content/ 등 REPO_ROOT-상대 → server/ 상대).
   - **`client/`** ← playable EXE + **RE 대상 기존 클라 바이너리(G7MTClient.exe/Gin7UpdateClient/G7Start)** + 그 `data/`(model·image)·dgvoodoo·fonts + **`client/play-logh7.exe`(바로 아래)**. exe 자가완결(--onefile). 게임이 client/ 단독으로 실행·47900 접속. exe 경로해석 client/ 기준으로 수정/재빌드.
   - **`docs/` 유지**(루트, 런타임 의존 아님 — 참조/RE지식).
   - **나머지 전부 삭제대상**: `tools/`(빌드도구 — exe 자가완결이라 런타임 불요), 데모 SPA(`src/main.jsx` 등), `tests/`, `.omo/`(RE자산 — **이동 보존, 비가역 삭제 금지**), 스크래치(`misc/` 이미 일부 이동됨), `.codex/.claude` 등 dev.
   - **안전수칙**: 실행 전 git 체크포인트. tracked는 `git mv`(복구가능). **이동 후 검증: 서버 47900 기동+응답 + client exe 경로해석. 실패 시 전부 되돌리고 보고(반쯤 된 채 방치 금지).**
   - **주의(왜 이번 세션서 강행 안 함)**: src/·tools/·content/·tests/가 경로로 전역 결합(npm `node src/server`, 파이썬 `python -m tools.`, 테스트 `../../src`). 자가완결화는 수백 참조 갱신+검증 한 묶음이라, **rate-limit/컨텍스트 한계 중 강행 시 반쯤 끊겨 깨질 위험**. 깨끗한 컨텍스트+git체크포인트+verify-or-revert로 한 번에.
   - 1차 정리 완료분: untracked 스크래치 → `misc/`, AI툴 미러 → `misc/_ai_tool_dirs/`(`.codex`는 loop 정의 참조라 유지). 레이아웃 `docs/logh7-repo-layout.md`. 1151 PASS.
2. **한글 이름 입력** 버그: 캐릭 생성 시 성/이름 한글 입력. 입력칸 **첫 글자 씹힘**(포커스 직후 1키 소모; 자동로그인은 compensate_first로 보정). strict에서 account 빈값 거부도 이 입력칸 경로와 연관. → 이름칸 한글 입력 경로 RE+수정.
3. **캐릭 선택 버그(미수정, 재실행 필요)**: 생성 캐릭이 아니라 **옛 강제 캐릭이 월드 진입**("한 캐릭터만" 근본). 수정 에이전트 rate-limit 실패. logh7-login-session.mjs의 activeCharacterId/sessionWorldUnitId/seedPlayerCharacter → 생성 0x1008 캐릭 id가 월드진입 active로 흐르게. 테스트 추가.
4. **통제된 브루트포스 RE 전부**: 크래시-안전 경로만 — **서버푸시 레버(0x0f1f/0xb0a/0xb07)** + 읽기전용 Frida probe. **FSM raw invoke(FUN_0054e570 등)는 클라 크래시 확인**(전용 재시작 세션에서만).
5. **로드맵 진행**: 전술맵·함대전·직무카드·커맨드·리마스터 (docs/logh7-outstanding-work-2026-06-25.md W3~W11).

## ★ 라이브 테스트 단일 표준 (반드시 준수)
- **포트 47900 고정** — 클라 리다이렉트 하드코딩(`tools/logh7_ui_explorer.py:80 COMMANDLINE_BOOTSTRAP_PORT=47900`). **다른 포트=클라가 빈 47900 보고 "NO DATA"·로그인 미연결**(최근 47901~47905 실패 근본; "포그라운드 락" 오진이었음).
- 유일 경로: **`bash tools/logh7_live_env.sh start|wait|shot|trace|stop`** (세션 `.omo/ui-explorer/live`, canonical EXE 992dc7e2, 표준 env, accept-any, 창모드, 사람이 직접 로그인, node 안 죽임).
- 단일 config = `tools/logh7_launch_config.py` (PORT/ENV/EXE). 운영자 서버=`start-server.bat`, 유저=`dist/play-logh7.exe`(클라전용). 문서 `docs/logh7-live-test-standard.md`.
- 로그인: 사람이 직접(자동 클릭은 D3D8 포커스 의존 신뢰불가). accept-any라 ID/PW 무엇이든 통과. 로그인 후 게임이 자동 1920 풀스크린.

## ★ 이번 세션 확정 (불변 성과)
- **실유저 로그인→캐릭생성→월드진입 full flow 라이브 성공**(0x7000→0x0f02, 1920 풀스크린, NPC 26 위계 시드). 단 위 캐릭선택 버그 존재.
- **상태전환 메커니즘 결정적 RE** → `docs/logh7-game-state-change-re-2026-06-25.md`. **2축: 씬KIND(FUN_0054e570, invoke전용·크래시위험) / 로드트리거(0x0f1f·0xb0a·0xb07 서버푸시 가능)**. **C002 클릭과 decoupled** — 수십 사이클 C002만 두드린 게 정체 원인. 최소 데모 = 서버가 0x0f1f(byte0=1) 푸시 → +0x357e88=0x3f800000 → 전략↔전술 전환(클릭/패치/Frida 불요).
- **MDX 위치 부재 확정**(포인터추적까지) — 위치 권위=content/galaxy.json(p101). 타입(분광형)만 MDX 노드명. 특수천체=블랙홀3+중성자별3.
- **매뉴얼→데이터 11 JSON**(content/manual/: session/character/terrain/ranks/cards/operations/logistics/combat/canon-initial-cards/troops/ship-verify). 특수지형=plasma/sargasso 2종.
- **서버 NPC 위계 시드**(자동황제=클라 HUD폴백→NPC시드로 해소, LOGH_SEED_CANON_NPCS, 1151테스트).
- 레퍼런스 134장 시각카탈로그(`docs/logh7-reference-visual-catalog-2026-06-25.md`). EXE/서버분리 완료.

## 완성도 (`docs/logh7-completion-matrix-2026-06-25.md`)
서버/시뮬 로직 ~70% · **리마스터된 플레이가능 게임 ~42%**. 최대 게이트=C002(상호작용)+상태전환 실증.

## 핵심 참조
- 로드맵 `docs/logh7-remaster-roadmap-2026-06-25.md` · 미결 `docs/logh7-outstanding-work-2026-06-25.md`
- 상태전환RE `docs/logh7-game-state-change-re-2026-06-25.md` · 라이브표준 `docs/logh7-live-test-standard.md`
- 저널 `docs/logh7-client-state-journal.md`(#0~#5) · 갤럭시지형 `docs/logh7-galaxy-terrain-investigation-2026-06-25.md`
- 메모리: live-test-port-47900, real-game-behavior-2026-06-25, record-every-test-2026-06-25.
- 도구: 상태invoke `tools/logh7_state_invoke_probe.py`(+state-invoke-candidates.json).
