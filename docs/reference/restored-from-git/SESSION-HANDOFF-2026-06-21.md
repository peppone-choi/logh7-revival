# LOGH VII Revival — Session Handoff (2026-06-21)

> 다음 세션/에이전트 시작점. 이전 핸드오프 `docs/SESSION-HANDOFF-2026-06-20.md`(입력RE keybd_event·41갭 감사·갤럭시 재추출 핫스레드)에서 이어진다.
> **데이터 등급**: P0(클라/와이어 확정)·P1(매뉴얼/PDF)·P2(IV-EX)·P3(절차). 클라-대면은 라이브 검증 전 단정 금지.
> 실행=`tools/logh7_ui_explorer.py`(logh7-live 스킬). 서버 테스트 **1069 그린**(`npm run test:server`).

---

## 🔑 최신 canonical playable EXE (풀컨디션)

- **SHA256 = `7922ac365d219b3419e8c769dc4364d0cfd8a9e94578cb98f04c04bb0634ef7f`** (이전 `15ed8a35…`).
- DEFAULT_STACK 12패치 = 풀컨디션: `menufix, dlgfix, earlygrid-ringclear, strat-camera-focus, font-face, font-cleartype, login-title-ko, login-native-layout, login-commandline-bootstrap, login-blank-password-local-ok, lobby-res, lobby-native-layout`.
- 동기화 완료: 런타임 installed EXE + uiexplorer 백업, `client/vendor/logh7-installed/exe/*` + 패키지 매니페스트(SHA 4/4), `tools/logh7_client_exe.py:23` 상수 + 테스트.
- 빌드: `python -m tools.logh7_build_playable_client --deploy`.

## 🟢 2026-06-21 성과

### A. 재추출 좌표 stale 잔재 수정 (이번 루프 사이클; maker/tester/verifier 분리)
2026-06-21 09:33 page-101 별점 재추출로 `content/galaxy.json` 좌표가 갱신됐으나, 3곳에 구좌표가 남아 전파 실패 → 수정:
1. **진영 수도 좌표**: `FACTION_CAPITAL`(`src/server/logh7-login-session.mjs:230`) 제국 `(86,25)→(88,25)`(ヴァルハラ/Odin, cellId 2588), 동맹 `(12,21)→(14,20)`(バーラト/Heinessen, cellId 2014). galaxy.json canon과 정합. `export const`화.
2. **faction 폴백**: `activePlayerFactionKey()` 해석 실패 시 중립역(2550) 대신 부트스트랩 기본 `'empire'`.
3. **카메라 cave**: `tools/client_patches/strat-camera-focus.json` cave immediate `0x9f6`(2550 중립)→`0xa1c`(2588 제국 수도). 바이트검증(detour 0xc4170=e91b111100, cave fileoff 0x1d5290 originalHex=all-0xCC pristine 통과).
- 체인 정합: 서버 fleetCellId(empire)=2588 = cave 2588 = LOGH_PLAYER_FOCUS_CELL 시드.
- 테스트: 서버 1069/1069. 신규 `tests/server/logh7-faction-capital-canon.test.mjs`. oracle 정정 `logh7-login-protocol.test.mjs:793`([86,25]→[88,25] — 재추출 후 이미 깨져있던 것). 파이썬 client-exe/installed-tree 11/11.
- 적대적 검증(logh7-loop-verifier): 좌표/cave바이트/체인/과장없음 PASS. 초기 FAIL=리빌드가 SHA 상수 미갱신 → 수정 후 그린.

### B. C002(자연 0x0b01) 정적 RE 심화 (loop-state v61/v62)
- HUD mode 활성화 lifecycle이 블로커: `FUN_004fd100`의 4개 hit-test(`HUD+0x14/+0x18/+0x28/+0x24`)가 성공해야 `FUN_004fd7a0(2/4/6,1)`→`FUN_005024b0(1)` owner gate가 켜지는데, 라이브서 전부 gate05=0(자연 미활성).
- 도구: `tools/logh7_hud_mode_activation_watch.py`(v61), `tools/logh7_hud_mode_lifecycle.py`(v62 정적 anchor).

### B-live. C002 마우스 입력 라이브 진단 — 입력 정상 확정, frontier=mode 게이트 (2026-06-21, ExplorerConsume RE + main 라이브)
실클라(7c3abbad) 자동 월드진입(client **1924×1084 HD** — logh7-live의 1024×768 가정 정정) 후 `.omo/work/probe_inworld_click.py`(누적 hook: active/edge/edgeStable/b01/b02/enqueue/hit-test/StrategySequence/mouseXY)로 합성 jiggle-click + **사용자 물리 클릭** 둘 다 측정:
- 합성(activeHits=27)·물리(activeHits=131) **둘 다** 좌표 정확반영(클릭 938→게임 `DAT_00779b10`=935)·active(`DAT_02214c00`)·edge(`DAT_022142b0`)·edgeStable(b0==b4, 14958)·hit-test(`FUN_004f6f60`=507/f)·StrategySequence(`FUN_004fef90`=507/f) **전부 정상 도달.**
- **그러나 둘 다 enqueue=0·+0xb01=0·+0xb02=0**(선택확정 0). 클릭위치(빈우주/항성/HUD/미니맵) 무관.
- **결론: 마우스 입력 문제 아님** — 합성클릭=물리클릭 동등, ui_explorer 마우스 자동화 정상. 메모리 C002 verdict "마우스 입력레이어 블로커" + ExplorerConsume "active→edge 변환 부재" 가설 **둘 다 라이브 반증.**
- **진짜 frontier = 게임 mode/owner 게이트**: `FUN_00507f20`의 +0xb02 게이트 중 edge안정은 통과하나 **param_2+0xb01==0**(event-9 enqueue 미발생). `FUN_004fef90`=StrategySequence(`FUN_004b7890` pending-ring Waiting/Ready). 위 §B owner gate(`FUN_004fd7a0`→`FUN_005024b0`, gate05 자연미활성)와 정합.
- **부산물**: `+0x1117c/+0x11180`=기지패널(panelKind5 `FUN_0057bbc0`) **인물 리스트**(`FUN_004c8690`→char store), own-fleet 함대 아님·`FUN_00570a10` 참조0 → 우선순위 #1의 "own-fleet listCount" 라벨은 `root_init_watch`의 중립 측정에 입힌 추정(반박). 진짜 0x0b01 게이트=own_cell(`+0x11178`)+mode(`+0x126711`)+current(`+0x126714`), cave로 해결.
- **다음**: mode/owner gate 선결조건 정적 RE(ExplorerConsume 진행) → 다음 라이브에서 그 gate만 positive-control(`probe_inworld_click.py` 재사용). 우선순위 #3과 통합.

### B-live2. owner gate도 블로커 아님 → frontier=서버 전략시퀀스 (2026-06-21 라이브 positive-control)
`probe_inworld_click.py --force-owner`(FUN_00507f20 param_2+5=1, 18만 프레임 강제) → **+0xb02=0 / enq={} 변화 0**. 자연 상태도 valid(+8) 전부1·owner(+5) 절반1 = `FUN_005024a0`/`FUN_005025c0` 게이트 자연 통과. **owner gate(=핸드오프 #1 B gate05) 라이브 반증.** 정정: `FUN_004fd100` 위젯 = `FUN_00502780(0,0)` lookup(hud+0x14 아님; ExplorerConsume의 `DAT_007ccffc` 역참조는 라이브서 위젯=0). **진짜 블로커 최종확정 = event-9 미투입**(`FUN_005015f0(9)==0` → +0xb01=0 → +0xb02=0) = 전략시퀀스 Ready(`FUN_004b7890`→`FUN_004b8950` 수신 큐 `+0x3552b8` stride0x14 500슬롯, 실행시간 게이트 `FUN_004c53b0`). **frontier = 서버 전략 시퀀스 메시지 송신**(`FUN_004ba2b0` dispatch `+0x3552bc` opcode) — 입력·owner 전부 무관. **다음 = 전략시퀀스 opcode RE(ExplorerConsume 진행) → 서버 송신 구현 → 라이브 재검증.** 진단 3중 반증 누적: 마우스입력(B-live) → owner gate(B-live2) → 남은 단일 frontier=서버 전략시퀀스.

### C. Nest.js + Drizzle 마이그레이션 **Phase 0** 완료 (헤드라인 트랙, verifier PASS)
- **가산적 스캐폴드**: serve-auth 배선을 재사용 export **`bootServeAuthServer({argv,env})`**(`logh7-server.mjs`)로 추출 → CLI `serveAuth`와 Nest provider가 **동일 코드 경로**로 와이어 서버 start/stop(계획서 "감쌀 뿐 재작성 금지" 불변식 준수). CLI 동작·에러 prefix 5종·성공 로그 불변.
- **신규 파일**: `tsconfig.json`(`include:src/app/**`로 코어 .mjs 제외), `src/app/{main,app.module,wire-server.service}.ts`(Nest `createApplicationContext`+lifecycle, HTTP 플랫폼 없이 raw TCP를 provider로), `tools/logh7_nest_phase0_smoke.mjs`(재현 게이트). `package.json` `start:nest`=`node --import tsx src/app/main.ts` + deps(Nest 11.1.27·drizzle-orm 0.45.2·tsx·typescript 6).
- **게이트 그린**: 서버 **1069/1069** 무변경. 스모크 — Nest 로그인 응답이 `serve-auth`와 **36B 바이트 동일** + 생명주기(boot→probe→close→포트해제). `tsc --noEmit` 0, `vite build` 무회귀. logh7-loop-verifier OVERALL PASS.
- **⚠ git 상태(Phase 0 무관)**: 레포 워킹트리 git이 비어 있었음(`.git`에 `info/exclude`=`.codegraph` 한 줄만, objects/refs/HEAD 부재). **사용자 지시(2026-06-21)로 `.git` 삭제 → 레포는 현재 non-git**. 커밋·SHA 워크플로우(빌드 EXE SHA 추적 등)를 쓰려면 `git init` 신규 필요(아직 미수행).
- **Phase 1 accounts 슬라이스 ✅완료(verifier 7/7)**: drizzle-orm 0.45.2엔 node:sqlite 드라이버가 없어(better-sqlite3/libsql만) 사용자 결정 **better-sqlite3 추가·풀 Drizzle ORM**. accounts 영속성 Drizzle 백엔드(`src/app/persistence/{accounts.schema,drizzle-account-persistence}.ts`)를 가산적으로 구현하고 node:sqlite와 **byte/스키마 패리티 5/5 증명**(cross-read 양방향 + `PRAGMA table_info` 동일). 코어 `logh7-account-registry.mjs` 무수정, 라이브 경로는 node:sqlite 유지(패리티까지 폴백). `npm run test:server` **1069 불변**, `npm run test:drizzle` 5/5, `tsc --noEmit` 0, `drizzle/0000_accounts_init.sql` 생성. dep `better-sqlite3@12`·`@types/better-sqlite3`.
- **다음(Phase 1 후속)**: 라이브 레지스트리를 Drizzle로 플립(createAccountRegistry persistence 주입점) — `npm start`(plain node)는 .ts/drizzle 직접 import 불가라 빌드 스텝(.ts→js) 또는 Nest/tsx 부트로만 활성. 플립 시 라이브 serve-auth 계정 생성·영속 검증 + 1069 재확인. 이후 runtime-state/content 스키마 확장. 계획서 `docs/logh7-nest-drizzle-migration-plan.md`, 사이클 로그 `docs/logh7-loop-state.md`.

## 🔴 다음 작업 (우선순위)

0. **[헤드라인 트랙] Nest.js + Drizzle 마이그레이션** — Phase 0 ✅ + Phase 1 accounts 슬라이스 ✅(위 §C; 드라이버=better-sqlite3 풀 Drizzle ORM, 패리티 5/5, 코어 무수정). **다음 = Phase 1 후속**: 라이브 레지스트리 Drizzle 플립(빌드 스텝 또는 Nest/tsx 부트 전제) → runtime-state/content 스키마. 계획서 `docs/logh7-nest-drizzle-migration-plan.md`. (git: §C — non-git 상태, 필요 시 `git init` 신규.) 아래 게임플레이 항목과 병행 가능.

1. ✅ **신 EXE 라이브 end-to-end 검증 완료(2026-06-21)**: `tools/logh7_root_init_watch.py`로 라이브 확인 — **`currentRaw11178==2588`**(currentX=88,currentY=25=제국 수도 ヴァルハラ, byte0=1). 좌표 수정 라이브 정합 확정. **그러나 `listCount1117c==0`(own-fleet 리스트 빈 상태) 발견** → 카메라는 수도를 보지만 선택할 함대 엔티티 없음 → 0x0b01의 진짜 선결 블로커 = **전략 함대 리스트(+0x1117c/+0x11180) 채우기**(서버/와이어, 입력 무관). C002 입력 체인(키보드 mode활성화 catGate 0x1→0x2→0x6·navGate passed)은 이미 라이브 확인됨 — 남은 건 "선택할 함대가 있어야" 카테고리 다이얼로그(`FUN_00570a10`)가 진행. 상세 docs/logh7-loop-state.md.
2. **페잔 1칸 회랑 재정제** (P0 데이터): `content/galaxy-passable-cells.json` row33-48 중앙 gap(col48-57)이 전부 개방 = 1칸 회랑 아님(사용자 "회랑은 한칸"·로드맵 `[x] one-cell` 주장과 모순). `.omo/work/galaxy-extract/page101-bg-corridor-*`로 두 회랑(이제르론·페잔)을 1칸 채널로 재생성 후 `galaxy.json`+마스크 재빌드.
3. **C002 HUD mode 활성화 라이브 probe**(B): `FUN_004fc4e0/004fc4a0/004fd560/004fd7a0/005024b0` 훅으로 `HUD+0x14/+0x18/+0x24/+0x28` 자연 활성화 추적. 직접 gate forcing·broad 서버 payload 변형 금지.
4. 마우스 가두기(cursor clip)·인-월드 마우스 입력·NO DATA 패널·HD 전화면 리마스터(2026-06-20 TODO 잔여).

## 핵심 파일/도구
- 좌표: `content/galaxy.json`(canonCol/canonRow), `content/galaxy-passable-cells.json`(회랑 마스크, 페잔 광폭 stale).
- 서버: `src/server/logh7-login-session.mjs`(FACTION_CAPITAL:230, activePlayerFactionKey:701, fleetCellId:830), `logh7-login-protocol.mjs`(buildStrategicGalaxyGrid:861/strategicGalaxyCanonCell:709/0x0315:561/0x0313:638).
- cave: `tools/client_patches/strat-camera-focus.json` + `tools/logh7_encode_strat_cave.py`(--cell/--cell-mem/--scan). 빌드 `tools/logh7_build_playable_client.py`.
- C002: `tools/logh7_hud_mode_activation_watch.py`, `tools/logh7_hud_mode_lifecycle.py`, `tools/logh7_selectgrid_snapshot.py`.
- 루프 상태: `docs/logh7-loop-state.md`(2026-06-21 사이클 섹션), `docs/logh7-master-roadmap-2026-06-20.md`(Updated 2026-06-21).

## 🟣 서버 스택 결정 — Nest.js + Drizzle 마이그레이션 (2026-06-21 사용자 확정)
- 사용자가 **코어 와이어/게임 서버까지 Nest.js + Drizzle 마이그레이션**을 선택(내 "코어 vanilla 유지" 권고 반려). [[logh7-server-stack]] 2026-06-10 결정 대체.
- **계획서 = `docs/logh7-nest-drizzle-migration-plan.md`** (필독). 핵심 불변식: ①바이트 정확 순수 코덱/와이어 빌더/도메인 보존(감싸기만, 재작성 금지) ②매 단계 `node --test tests/server/*.test.mjs` **1069 그린** 유지 ③가산적·점진적(빅뱅 금지) ④Nest=합성/생명주기/HTTP, 와이어 TCP는 Nest 관리 서비스, Drizzle=영속화.
- **Phase 0(즉시 다음)**: deps(@nestjs/core·common·platform-express, reflect-metadata, rxjs, drizzle-orm, drizzle-kit, typescript, tsx) + tsconfig + `src/app` Nest 스켈레톤(기존 `createAuthServer` 래핑) + `start:nest` 스모크 + 1069 그린. → Phase 1 Drizzle accounts 스키마.
- 토큰결정: 신규 레이어=TypeScript(데코레이터), 기존 .mjs 도메인은 import로 보존. Drizzle 드라이버=node:sqlite 우선(미지원 시 better-sqlite3). 순수 골든-헥스는 node:test 유지.
- **쿠데타 반란군**: 고정 per-진영 로스터 아님. `src/server/logh7-coup.mjs`(+`logh7-intel.mjs`)가 캐논(매뉴얼 p321 정규군/반란군 분리) 기반 동적 형성: 説得로 유닛 叛乱忠誠도↑ → 임계(COUP_LOYALTY_THRESHOLD) 초과 유닛이 叛乱(Execute) 발동 시 **별 진영(런타임 생성)**으로 분리. 수치는 SERVER DESIGN(규칙만 캐논). 현재 순수 로직 완비, 클라 opcode 와이어 미확정.
