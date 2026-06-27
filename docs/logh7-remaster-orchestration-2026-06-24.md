# LOGH VII 전체 리마스터링 오케스트레이션 마스터플랜

> 작성일: 2026-06-24 KST  
> 목표: 실제 `G7MTClient.exe`를 켠 상태에서, 클라이언트 RE → 수신 데이터 검증 → 서버 송신 데이터 연결/생성 → 실제 소비 레코드/메소드 추적 → 자유로운 맵 전환 → 행성 내 장소 → 직무카드/커맨드 구현 → HUD/UI/이미지/모델 리마스터링까지 증거 기반으로 완성한다.  
> 방법: logh7-loop(탐사→구현→테스트→검증) + 최대 병렬 스웜 + 실클 라이브 검증.  
> 문서 정책: 한 행동/한 사이클 종료 시 증거를 이 파일에 append. 50% 컨텍스트 도달 시 압축/클리어 후 재개.

---

## 1. 현재 baseline (2026-06-24)

| 영역 | 상태 | 핵심 증거/문서 |
|------|------|----------------|
| 로그인→로비→월드 진입 | ✅ 작동 | `docs/logh7-live-world-entry-2026-06-23.md`, trace `0x7000→0x0020→0x2009→0x0200→0x0313/0x0315→0x0323/0x0325→0x0f02` |
| 0x0323/0x0325 수신 바이트 검증 | ✅ 완료 | `tools/logh7_decode_0323_verify.mjs`, 15/15 필드 정합, `tests/server/logh7-login-protocol.test.mjs` 61 pass |
| C002 전략 명령 메커니즘 | ✅ RE 100% 완결 | `docs/logh7-c002-mechanism-complete-2026-06-23.md` — 6-레이어 서브시스템, 단일 근본 = 전략 위젯 latch loop 미등록 + unit-list 데이터/위젯 미구성 |
| HUD/UI 텍스처 업스케일 드롭인 | ✅ 라이브 입증 | `tools/logh7_remaster_hud_tga.py`, 20개 TGA 4x LANCZOS, live9-remaster 208→349MB |
| 성계 좌표/타입 | 🟡 P1/P2 혼재 | `content/galaxy.json`, `docs/logh7-coordinate-provenance.md`, `docs/logh7-galaxy-page101-dot-extraction.md` |
| 직무카드/커맨드 와이어 | ✅ 서버 구현 | `server/src/server/codec/personnel-records.mjs`, `docs/logh7-planet-duty-survey-2026-06-24.md` |
| 행성 내 장소 | 🟡 일부 구현 | `server/src/server/codec/institution-record.mjs`, 40+ 執務室 한글화 미완 |
| 맵 전환(전략↔전술) | 🟡 서버푸시 작동, 렌더 미완 | `docs/logh7-live-world-entry-2026-06-23.md` live5-maptrans/live10-tactical |
| 전술 전투 | 🟡 PHASE 1 진행중 | `docs/logh7-implementation-roadmap.md` PHASE 1~5 |
| 함수 전수 RE | 🟡 10.6% deep-RE | `docs/logh7-function-re-coverage-matrix.md`, `docs/logh7-function-re-g7mtclient-wave-0001.md` |
| 한글 채팅 송신 | ⚠️ 클라 패치 필요 | `docs/logh7-loop-state.md` P0-03, cp932 디코드 손상 확인 |

**완료로 세지 않는 것(룰):** Vite/React 데모 화면, `0x0f08→0x0f09` 메일/HUD 트래픽, P2/P3 데이터를 P0로 과장, 서버 테스트만 통과한 항목.

---

## 2. 마일스톤 재정의 (전체 범위)

```
M0 오케스트레이션 기반 — 본 플랜, goal 분할, 병렬 스웜 런치
M1 실클 기반 RE/검증 완결 — 함수·구조·데이터구조 100% 커버리지, P0 태깅
M2 와이어 권위 데이터 — 모든 S→C/C→S 레코드 바이트-정확, 클라 parser 대조
M3 전략 명령 루프 — 0x0b01→0x0b07 자연 발신, 함대선택→명령메뉴→dispatch
M4 맵 전환(전략↔전술) — battle entry/setup/teardown 라이브, 전술 렌더
M5 행성 내 장소 + 직무카드/커맨드 — 시설 내 UI, 카드 패널, 권한 발령/파면 라이브
M6 콘텐츠 완성 — 80성계·행성·요새·소속·경제·시나리오 데이터 출처 등급 확정
M7 HUD/UI/이미지/모델 리마스터 — 폰트·텍스처·모델·해상도·와이드 전 화면
M8 한글화/현지화/모딩 — constmsg·rsrc·메뉴·Dialog, 모드 로더
M9 배포/운영 — 런처·어드민·Docker·테스트·문서 패키징
```

---

## 3. 분할 Goal 목록

| Goal ID | 마일스톤 | 목표 | 완료 증거 |
|---------|----------|------|-----------|
| G-M0-01 | M0 | 오케스트레이션 플랜 확정 및 스웜 런치 | 본 문서, 25개 스웜 task-id, 상태 파일 |
| G-M1-01 | M1 | 함수 전수 RE 웨이브3+ 진행 (G7MTClient 잔여 5,812함수) | `docs/logh7-function-re-g7mtclient-wave-NN.md`, ledger 100% |
| G-M1-02 | M1 | 파일/데이터구조 RE 커버리지 완결 | `docs/logh7-file-re-coverage.md`, `docs/logh7-data-structures-re.md` 최신 |
| G-M2-01 | M2 | 수신 레코드 0x0313/0x0315/0x0323/0x0325/0x031d/0x031f 라이브 디코드 정합 | 라이브 trace 디코드 vs 서버 builder diff=0 |
| G-M2-02 | M2 | 송신 레코드 0x0b01/0x0b07/0x0400/0x0405/0x0406/0x0411/0x042f 완성 | 명령 루프 trace |
| G-M3-01 | M3 | C002 6-레이어 서브시스템 구성/구동 | 자연 0x0b01→0x0b07 trace, 스크린샷 |
| G-M4-01 | M4 | 전투 진입→전투→퇴장 라이브 | `docs/logh7-implementation-roadmap.md` P1.1~P1.8 완료 |
| G-M5-01 | M5 | 직무카드 패널 라이브 | 카드 텍스처 배포 + C002 해결 후 스크린샷 |
| G-M5-02 | M5 | 행성 내 장소(시설) 라이브 | 0x0321 institution + 40+ 이름 한글화 + UI 스크린샷 |
| G-M6-01 | M6 | 성계 위치/타입/행성 MDX 하드코딩 전수 확인 | MDX node dump + galaxy.json provenance + 실클 매칭 |
| G-M6-02 | M6 | 갤럭시 인접 그래프/회랑/항행불가 보정 | `content/galaxy-passable-cells.json`, 실클 미니맵 검증 |
| G-M7-01 | M7 | HUD/UI 전 화면 리마스터 | 모든 TGA/BMP 업스케일/생성, 라이브 무손상 |
| G-M7-02 | M7 | 모델/3D 에셋 리마스터 | MDX/TCF 처리 파이프라인, 라이브 렌더 |
| G-M8-01 | M8 | 한글 채팅/메뉴 완전 현지화 | cp949 송신 패치, rsrc 메뉴, constmsg 100% |
| G-M9-01 | M9 | 런처/배포/모딩 패키지 | 런처 자동 배선, 모드 로더, Docker |

---

## 4. 1차 병렬 스웜 할당 (25개 아이템)

> AgentSwarm: `logh7-remaster-survey` 5개 분야 × 5개 아이템.  
> 각 서브에이전트는 Read/Grep/Glob/Bash로만 조사하고, 증거 경로 + 요약 + 불확실성을 산출. 코드 수정 금지.

### S1: UI/Screenshot Reference Inventory
- S1-01 로비 UI (로그인/세션/캐릭터 생성/공지)
- S1-02 전략맵 UI (HUD, 미니맵, 정보 패널, 명령 메뉴)
- S1-03 전술맵 UI (battle HUD, 함선 상태, 커맨드)
- S1-04 직무카드/시설 내 UI (uu3.jpg 기준)
- S1-05 설정/Dialog/풀스크린 필러

### S2: MDX Hardcoded Data Survey
- S2-01 Null_galaxy.mdx (79 star nodes, spectral types, transforms)
- S2-02 galaxy.mdx (nebula/backdrop)
- S2-03 base/planet .mdx (facility/landscape geometry)
- S2-04 ship .mdx (hull/fighter geometry)
- S2-05 character/portrait/face TCF/MDX

### S3: Star/Planet/Position Provenance
- S3-01 galaxy.json vs manual PDF page101 dot extraction
- S3-02 model-galaxy-stars.json spectral→galaxy.json mapping
- S3-03 constellation/msgdat group 0x18 star labels
- S3-04 planet-economy.json / facility sidecar
- S3-05 fortress/corridor passable-cell map

### S4: Implementation Gap Audit
- S4-01 C002 6-layer subsystem (widget→catGate→unit-list→selection→menu→dispatch)
- S4-02 strategic command table / factory population (FUN_004f5cb0, v3~v14 threads)
- S4-03 duty-card texture deployment + C002 unblock path
- S4-04 facility interior 40+ office name translations
- S4-05 tactical battle entry (P1.1~P1.3 builders + live path)

### S5: Remaster Asset Inventory
- S5-01 HUD TGA/BMP list (data/image/*, current remaster status)
- S5-02 Font resources (Pretendard, .rsrc, GDI face patches)
- S5-03 Portrait TCF atlas (O-group/G-group slots, face-atlas expand)
- S5-04 Background/galaxy bitmaps (BMP/TGA)
- S5-05 Ship/fighter model textures and geometry

---

## 5. 다음 단계

1. **이 턴**: 본 마스터플랜 작성 완료 (done).
2. **다음 턴**: 25개 스웜 런치 (`AgentSwarm`).
3. **스웜 결과 종합 후**: G-M1-01 / G-M3-01 / G-M6-01 / G-M5-01 등 핵심 goal을 `CreateGoal`로 개별 생성하고 `logh7-loop` 워크플로우/슬래시 커맨드로 1사이클씩 돌림.
4. **각 goal 종료 시**: `docs/logh7-loop-state.md` + 본 파일 append, 실클 라이브 증거 첨부.
5. **컨텍스트 50% 도달**: `docs/logh7-remaster-orchestration-2026-06-24.md`에 축적된 증거를 요약하고, 상세 원본은 `.omo/research/`로 offload.

---

## 6. Reference/문서 조사 결과 (2026-06-24)

### 6.1 스크린샷 레퍼런스 (`.omo/reference/`, 134장)
- `CATALOG.md`로 6소스(gamemeca·4gamer·impress·toshichan·itmedia·dengeki) 인덱싱 완료.
- 핵심 타겟 확인:
  - **전략맵**: `toshichan/strategy.jpg`, `gamemeca/en004.jpg`(한국판 MP+채팅)
  - **직무카드/행성내장소**: `toshichan/card.jpg`, `toshichan/lobby.jpg`, `gamemeca/uu3.jpg`
  - **커맨드윈도우**: `toshichan/compnel1/2/3.jpg`, `gamemeca/en004.jpg`
  - **기지/소속 정보**: `toshichan/stay.jpg` — 支配陣営名(소속 진영) 표시 확인
- **en004.jpg 한국판** = "select→커맨드윈도우 좌클릭" 명문화 → C002 타겟과 정확히 일치.
- **86성계**(기사) vs `galaxy.json` 80성계 차이 확인 — 6성계 갭(요새/회랑?) 재검토 필요.

### 6.2 MDX 하드코딩 조사 (`docs/logh7-ui-card-mdx-investigation-2026-06-23.md`)
- `Null_galaxy.mdx` = **TEMPLATE**: 79 star nodes, spectral class 인코딩, **transform/position 전부 ZERO**.
- `galaxy.mdx` = 성운(nebula) 배경만, 항성 없음.
- **실제 항성 위치는 MDX에 하드코딩되어 있지 않음** — 서버 권위(`galaxy.json` + 0x0315 와이어)로 결정.
- spectral class 불일치: MDX 템플릿(G19/O2/F8/A7/B5/M21/K17) vs galaxy.json(G32/O0/F3/A4/B8/M10/K23). 서버는 galaxy.json 기준 사용.
- 79 vs 80 누락 항성 존재, MDX node index→성계명 매핑 미확정.

### 6.3 직무카드/행성내장소 (`docs/logh7-planet-duty-survey-2026-06-24.md`)
- 와이어 0x0704-0x0709/0x070a-0x070b/0x0356/0x0358/0x034e-0x034f **서버 구현 완료**.
- 1차 블로커 = **`shokumu_card_*.tga` 텍스처 누락** — 원본 CD/설치본 `data/image/shokumu_card/`에서 복구 필요.
- 40+ 執務室(집무실) 한글화 미완 — `content/client/msgdat.json` 9338-9470에 일본어 원문 존재.
- 시설 내 장소(旗艦桟橋/航路管理センター/警戒ロビー/自由ロビー)는 클라 UI + 0x0321 institution 데이터로 구동.

### 6.4 전술 전투 와이어 (`docs/logh7-protocol-master.md`, `docs/logh7-proto-tactics-data.md`)
- battle entry sequence 확정: `0x337→0x33b→0x33f→0x341→0x343→0x349→(0x345/0x34b/0x347)→0x42f→0xf1f`.
- 0x33b UnitShip 47B/rec, 0x341 FillShield 40B, 0x343 FillBeamGun 16B, 0x349 PositionUnit 20B — 모두 byte-exact RE 완료.
- 0x30b static ship stats는 `content/ship-stats.json`으로 서버 설계.
- 남은 = battle-engine.mjs 구현 + 라이브 진입 검증.

## 7. 규칙/주의

- 모든 와이어 offset는 클라 parser VA/파일오프셋에서 RE 확인 (`logh7-re` 스킬).
- 모든 라이브 결과는 `tools/logh7_ui_explorer.py`로 캡처, 종료 시 EXE SHA 복원.
- P2/P3 데이터를 P0로 승격하지 않음. 출처 등급 명시.
- Vite/React 화면은 게임 증거로 인정하지 않음.
- 병렬 구현은 worktree 격리; 동일 파일은 단일 사이클에서만 수정.
- 컨텍스트 50% 도달 시: 상세 내용은 본 파일 + `.omo/research/`에 offload, 대화에서는 요약만 유지.


---

## Appendix A: 25-Item Parallel Survey Results (2026-06-24)

> AgentSwarm `logh7-remaster-survey` 산출물 종합.  
> 각 항목별 상태/요약/증거/불확실성/다음행동/출처등급을 아래에 기록.

### S1-01 로비 UI (로그인/세션/캐릭터 생성/공지)

| 항목 | 상태 | 핵심 증거 |
|------|------|-----------|
| 로그인→로비→세션 와이어 | ✅ 작동 | `docs/logh7-live-world-entry-2026-06-23.md`, `.omo/ui-explorer/live3-auto/`, `src/server/logh7-auth-server.mjs` |
| 수동 로그인/캐릭터 생성 UI 입력 | ⚠️ 미작동 | `docs/logh7-live-world-entry-2026-06-23.md` D3D8 입력 미반영, autologin 변종으로 우회 |
| 로비 UI 레이아웃/타이틀/폰트 | 🟡 부분 | `tools/client_patches/login-native-layout.json`, `lobby-native-layout.json`, `charsel-native-layout.json`, `login-title-ko.json`, `docs/logh7-font-remaster.md` — 바이트검증 OK, 시각 라이브 미완 |
| 캐릭터 생성 서버 핸들러 | 🟡 구현됨 | `src/server/logh7-login-session.mjs` 0x1008 handler, `docs/logh7-character-creation-wire.md`, `docs/logh7-character-creation-research.md` |
| 서버 공지 | 🟡 구현·미검증 | `src/server/logh7-auth-server.mjs` announcementText, `src/server/logh7-login-protocol.mjs` 0x2003 builder, `content/localization/constmsg-ko.json` #2437 |

**불확실성:** D3D8 입력 인젝션 미반영으로 수동 로그인·캐릭터 생성이 막혀 있고, native-layout/.rsrc/공지 패널의 실제 클라 렌더링이 아직 증거되지 않았다. 캐릭터 생성 기본값(능력치·볼너스 포인트·출신)은 원본 서버 데이터가 아닌 추론/외부 출처다.

**다음 행동:** `logh7-live`로 실제 클라이언트를 구동해 로그인 폼→로비→캐릭터 생성→공지 패널을 직접 캡처하고, D3D8 입력 미반영 원인과 0x2003 공지 소비 여부를 확인한다.

**출처 등급:** P0(와이어/RE 주소/라이브 트레이스) / P1(클 낸부 serializer·좌표·.rsrc 슬롯) / P2(외부 캐릭터 생성 디자인·스크린샷) / P3(공지 텍스트·능력치 시드·native-layout 변환).

### S1-02 전략맵 UI (HUD, 미니맵, 정보 패널, 명령 메뉴)

> 상태: **partial** (일부 완료 / C002 명령 서브시스템 미구동 / 직무카드 텍스처 누락)

**핵심 증거:**
- **라이브 전략맵 렌더**: `.omo/ui-explorer/live3-auto/shots/002-auto-state.png`에서 다색 항성 + 100×50 그리드 + HUD(좌하 초상화·중앙 미니맵·우하 한글 정보패널) 확인. trace: `0x0313/0x0315/0x0323/0x0325/0x0f02` (`docs/logh7-live-world-entry-2026-06-23.md`).
- **HUD 텍스처 업스케일**: `tools/logh7_remaster_hud_tga.py`로 20개 HUD TGA를 4x LANCZOS + 언샤프 → type-2 32bpp TGA 재인코딩. live9-remaster에서 208→349MB 로드, 월드+HUD 무손상 렌더 입증.
- **와이어/RE 확정**: `docs/logh7-strategic-map-wire.md` — 0x0313 object table(3바이트), 0x0315 RLE cell grid, fixed 5004B 사이즈, `FUN_004d3bd0` placement byte1==3 gate, `FUN_004c8c90`→constmsg group 0x18 RE 확정.
- **C002 메커니즘 RE 완결**: `docs/logh7-c002-mechanism-complete-2026-06-23.md` — 6-레이어 서브시스템 함수/주소/게이트 전수 RE. 단일 근본 = **전략 widget이 latch loop에 등록되지 않아 +0xb00 발화 불가**.
- **서버 0x0b07 소비 입증**: `tools/logh7_0b07_apply_probe.py` 4점 probe로 `FUN_004bee20` 도착 + grid-active `+0x2a58f8=1` + `FUN_00517cd0(0xb07)` dispatch + `FUN_00501e30(0x16)` scene event 1회 실측.
- **에셋/데이터**: 실제 HUD 에셋은 `.omo/work/logh7-installed/data/image/` 및 `client/vendor/logh7-installed/data/image/`에 존재. 직무카드 텍스처 `data/image/shokumu_card/*.tga`는 **누락**.

**다음 행동:**
1. C002 6-레이어 구동: unit-list 패널 위젯(0x67) 생성 트리거 RE → 0x0323 offset 0x24c officerCount 라이브 probe → catGate 자연 전이 → 명령메뉴 build → 0x0b01 발신.
2. `shokumu_card_*.tga` 원본 CD/설치본 복구.
3. 0x0305/0x0307 명령 카탈로그 런타임 정렬/타이밍 추가 라이브 트레이스.

**출처 등급:** P0(라이브 스크린샷, Ghidra RE, 실제 G7MTClient.exe trace) / P1(매뉴얼 PDF page101 좌표) / P2(웹 스크린샷) / P3(AI 생성형 리마스터 미적용).

### S1-03 전술맵 UI (battle HUD, 함선 상태, 커맨드)

> 상태: **partial** (와이어/서버 빌더/라이브 엔트리 푸시는 작동, 전술 렌더/HUD/커맨드 발화는 미완)

**핵심 증거:**
- 전술 전투 와이어 문서(P1): `docs/logh7-proto-tactics-data.md`, `docs/logh7-proto-battle-core.md`, `docs/logh7-proto-battle-fleetops.md`, `docs/logh7-proto-battle-fire.md`.
- 서버 구현(P1): `src/server/logh7-battle-engine.mjs`(`openBattleField`), `src/server/logh7-battle-ops.mjs`(`processBattleOps`), `src/server/logh7-command-engine.mjs`에서 `0x0411` 수신 시 `openBattleField`.
- 유닛 테스트(P0): `tests/server/logh7-battle-engine.test.mjs`, `tests/server/logh7-battle-ops.test.mjs` 통과.
- 라이브 서버푸시(P0): `.omo/ui-explorer/live10-tactical/`에서 `0x349→0x33b→0x341→0x343→0x42f→0x0f1f` 푸시 후 모드전환 UI 패널 출현(풀 전술 렌더는 미완).
- 원본 레퍼런스(P2): `.omo/reference/gamemeca/uu1.jpg`, `en008.jpg`, `uu2.jpg`; `.omo/reference/toshichan.my.coocan.jp/0572d0_tactics2.jpg`, `0285b9_tactics.jpg`, `c8858b_compnel1.jpg` 등.

**다음 행동:**
1. `LOGH_BATTLE_ENTRY_PROBE=1` + `LOGH_NPC_SEED=1`로 live10-tactical 재구동 → 전술 전장 스크린샷 확보.
2. Frida로 `clientBase+0x126711`(mode byte), `+0x126718`(tactical pool head), 활성 scene(`DAT_02215e2c`) 읽어 렌더 미완 원인 특정.
3. `data/image/battle/`과 `data/image/gamemenu/command*` 텍스처 리스팅.

### S1-04 직무카드/시설 내 UI (uu3.jpg 기준)

> 상태: **partial** (서버 와이어/코덱 구현 완료, 클라 UI 오픈 blocked)

**원본 레퍼런스:** `.omo/reference/gamemeca/uu3.jpg` (P0) — 방 안 인물 초상화 물리 배치 + 우측 직무카드 + 우하 施設内ロビ.

**핵심 증거:**
- 직무카드 와이어 10 opcode(`0x0704-0x0709`, `0x070a-0x070b`, `0x0356`, `0x0358`, `0x034e-0x034f`)와 시설 와이어(`0x031f`, `0x0321`, `0x031d`)가 `src/server/codec/personnel-records.mjs`, `src/server/codec/institution-record.mjs`에 byte-exact 구현됨.
- `0x0323` char record offset `0x93` officerCount 기록 → `PLAYER_INFO+0x270` 채움.
- `shokumu_card_*.tga` 6종은 `.omo/work/logh7-installed/data/image/shokumu_card/`에서 확인됨(설치본 존재, playable 배포 미확인).
- `content/client/msgdat.json` 9338-9470+에 40+개 執務室 변형 일본어 원문 존재.
- 라이브 서버푸시 `.omo/ui-explorer/live6-dutycard/`에서 `0x1200/0x1201/0x120f` 수신 확인, 그러나 직무카드 패널은 오픈되지 않음.

**블로커:** C002 6-레이어 전략-명령 서브시스템이 autologin/revival 월드에서 미구성·미초기화됨.

**다음 행동:** ① C002 layer 1 패널 위젯 구성 트리거 RE 및 직접구동 ② `shokumu_card_*.tga` playable 배포 ③ `tools/logh7_localize_facility_names.py` 실행 ④ 라이브에서 직무카드/시설내장소 UI 캡처.

### S1-05 설정/Dialog/풀스크린 필러

- **상태**: `partial`
- **요약**: 로비 '환경 설정' 다이얼로그는 1920×1080 네이티브 캔버스에서 한글 레이블과 함께 열린다. `lobby-res.json` + `lobby-native-layout.json`이 기본 playable 스택에 포함. 그러나 풀스크린 pillarbox/wide 화면 검증은 미수행(작업 PC 1440×1080), 설정 다이얼로그 값 레이블(`CUSTOM`)과 Dialog 프레임 에셋 업스케일도 미완료다.
- **핵심 증거**
  - `docs/logh7-graphics-remaster.md`: `GraphicConfig.txt` 임의값 파싱, F9 fullscreen 경로 `FUN_005123b0 → FUN_005dbf70 → FUN_005dbd10`.
  - `tools/client_patches/lobby-res.json` + `lobby-native-layout.json`: 기본 playable 스택, 1024×768 → 1920×1080.
  - `.omo/ui-explorer/session-20260620-native-layout-v1/shots/005-lobby-settings-v1.png`, `.omo/ui-explorer/session-g006-login-ok-20260620/shots/003-lobby-settings.png`: 라이브 설정 화면 1920×1080.
  - `data/image/window/dialog_parts.tga` (512×512 256색), `data/image/window/window_parts.tga`: Dialog 프레임 에셋.
- **다음 행동**: 와이드 모니터 또는 강제 해상도 2560×1440/3840×2160에서 `ui_explorer`로 로비→환경 설정 진입, Path A(`--pathA`)와 native layout 비교 스크린샷을 찍어 pillarbox 및 위젯 정렬 확인.

### S2-01 Null_galaxy.mdx (79 star nodes, spectral types, transforms)

> 상태: **partial** (파일 자체 디코딩 완료, 의미 매핑 미완)

- `Null_galaxy.mdx`는 79개 항성 노드(`star_NN_<spectralClass>`) + 3 블랙홀 + 3 중성자별 = **총 85노드** 템플릿이다.
- `tools/_inspect_null_galaxy.py`로 확인한 node record 0x10-0x80 구간에 **non-zero float가 없음** → transform matrix/3D position 모두 **ZERO**.
- 따라서 실제 항성 위치는 이 MDX가 아니라 서버 와이어(`0x0313/0x0315`)와 `content/galaxy.json` 좌표가 권위적이다.

**분광형 분포 (79 stars):** G19 / O2 / F8 / A7 / B5 / M21 / K17.

**출처 등급:** P0(MDX 바이트 직접 파싱) / P1(`tools/logh7_mdx_extract.py`) / P2(`content/galaxy.json`) / P3(`model_node_order_provisional` fallback).

**다음 행동:** `content/extracted/model-galaxy-stars.json` 인덱스 순서를 `content/galaxy.json` 시스템 순서 및 `constmsg` group `0x18` sub-id와 대조해 `docs/logh7-null-galaxy-mapping.md` 매핑表 작성; 누락된 80번째 성계 식별.

### S2-02 galaxy.mdx (nebula/backdrop)

- **파일 신원**: `content/original-data/patch-2004-05-14/strategy/galaxy.mdx`, 16,508 B, SHA-256 `cfde6e8d880eaf4ad101ecf268e6100a4e59fc7b24965d27ae7af082afc368a3`. 설치본/패치/아카이브 세 위치 동일 SHA.
- **형식**: 직렬화 D3D/LightWave-derived 모델. 헤더 10개 (ptr,count) descriptor, 노드 레코드 stride 0xE8.
- **노드**: 2개 — `galaxy:Layer1`, `galaxy:Layer2`.
- **참조 에셋**: `W:\Gin7\CG\g\galaxy_map\objects\galaxy.lwo`, `galaxy00.bmp`, `star000.bmp`, `neb000_a.bmp`.
- **트랜스폼**: ZERO.
- **역할 판정**: 전략맹 뒤편 성운/스타필드 배경 모델. 항성 위치/게임 데이터는 **없음**.
- **다음 행동**: `ui_explorer`로 배경 렌더 격리 캡처 → `galaxy00.bmp`/`neb000_a.bmp` 고해상도 후보 생성/오버레이 → 라이브 생존 및 시각 개선 검증.

### S2-03 base/planet .mdx (facility/landscape geometry)

- 상태: **부분 (partial)**
- 관련 자산: `data/model/Planets/*.mdx` 107개 (`p*`, `fs*`, `ds*`, `y*` + `_mid`/`_low` LOD), `data/model/strategy/*.mdx`는 별도 항목.
- 추출 산출물: `content/extracted/model-planets.json`, `content/extracted/model-data.json`.
- 형식/소비자: `tools/logh7_mdx_extract.py`로 header 10 descriptor + 0xE8 stride node directory 디코드; `FUN_004d3bd0`가 planet `p%03d_low.mdx`를 로드.

| 항목 | 상태 | 근거/출처 |
|---|---|---|
| 파일 인벤토리/씬그래프 노드 이름 | ✅ 완료 | 107/107 planet .mdx, 418/418 전체 mdx/mds |
| 소스 에셋 경로/텍스처 매핑 | ✅ 완료 | `.lwo` + `.bmp` 경로 추출 |
| 다각형 메쉬(vertex/face/UV) | ❌ 미시작 | `descriptor[2..9]` raw arrays 미매핑 |
| 게임 내 base/planet ID ↔ .mdx 매핑 | ❌ 미확정 | `p000`..`p102`, `fs000`..`fs006`, `ds000`, `y001`..`y003` 의미 추정 |
| 별도 시설(facility) 3D 모델 | ❌ 미발견 | `data/model/` 아래 `Base`/`Facility` 디렉터리 없음 |

**다음 행동:** 실클에서 기지/행성 패널 진입 시 `FUN_004d3bd0` 또는 파일 I/O 트레이스로 로드된 `.mdx` 경로 캡처.

### S2-04 ship .mdx (hull/fighter geometry)

**Status:** partial (scene-graph/hardpoints done; raw mesh + live render pending)

- 273 ship model files: `data/model/Ship/` 아래 121 empire (`GE/`), 130 alliance (`FP/`), 18 phezzan (`PI/`), 3 phezzan_misc (`PZ/`), 1 unknown.
- `content/extracted/model-ship.json` (7415 lines): per-file node names + embedded LightWave source paths + texture references.
- `content/extracted/model-ship-hardpoints.json` (2768 lines): 248 ships with weapon/engine mount counts.
- 12 `.mds` siblings (e.g., `FM023`, `EM027`); suspected LOD/animation data.
- `content/ship-stats.json` + `content/manual/ship-units.json`: 63 ship stat entries from manual (P2).
- 20 ship thumbnail textures: `data/image/Thumbnail/Ship/iu000..iu019.tga`.

**Next action:** deep-RE the `.mdx`/`.mds` loader chain to byte-map surface/geometry arrays, or build and verify a ship-class → model-file mapping once tactical battle render is unblocked.

### S2-05 character/portrait/face TCF/MDX

> 상태: **🟡 partial**

**핵심 판정:**
- **TCF 초상화 파이프라인은 RE 및 구현 완료**: decode(`tools/logh7_tcf_decode.py`) / encode+pack(`tools/logh7_tcf_pack.py`) / composite face-id codec(`src/server/logh7-face-codec.mjs`, `tools/logh7_face_id_decode.py`) 모두 동작.
- **MDX 성분은 존재하지 않음**: `.omo/work/logh7-installed/data/model/` 전수 검색 결과 캐릭터/초상화/얼굴 전용 MDX 파일이 없음. 게임 내 캐릭터는 `data/image/Face/*.tcf` 아틀라스의 2D 초상화로 표현됨. S2-05의 "MDX" 부분은 항목 명명이 부정확함.
- **공식 권위 앵커는 12개로 제한**: `content/roster/face-name-map.json`에 12개 이름↔face_number 앵커. 2개(Yang=206, Schenkopp=85)만 pixel-match로 이중 확인.
- **로스터 할당은 P3 중심**: `content/roster/face-assignment.json`은 97명에 대해 AI 기반 `assigned_atlas_slot` 기록, `face_number` 필드는 전부 `null`.

**다음 행동:**
1. `tools/logh7_ui_explorer.py`로 실제 클라이언트에서 12개 공식 `face_number`(특히 Yang/Schenkopp)와 G-group create face-id가 create/roster HUD에 정상 렌더되는지 라이브 검증.
2. 라이브 결과를 바탕으로 `content/roster/face-assignment.json`의 `face_number` 필드 채우기.
3. S2-05 항목에서 "MDX" 제거 또는 캐릭터 3D 모델이 없음을 명시하도록 orchestration 문서 갱신.

### S3-01 galaxy.json vs manual PDF page101 dot extraction

- **상태**: partial (추출/정규화/도구 완료, 라이브 검증 및 정적 테이블 교체 미완)
- **출처**: `gin7manualsaved.pdf` 101p `星系図` 실제 래스터 별점 중심
- **핵심 증거**:
  - `content/galaxy.json` 80 systems, `canonCol`/`canonRow` from raster star-dot centers (2026-06-21 audited)
  - `content/galaxy-raster-star-centers.json` = canonical seed; 80 unique cells
  - `tools/logh7_galaxy_star_extract.py` + `tools/tests/test_logh7_galaxy_star_extract.py` — 80 colored markers accepted, 80 black inner line markers rejected
  - `tests/server/logh7-galaxy-star-extraction.test.mjs` — unique cells, passable mask, grid-dump oracle
  - `content/galaxy-passable-cells.json` — 3627개 passable cell; 중앙 gap(col 48..57)을 row 12(이제르론)와 row 38(페잔)의 1칸 회랑만 개방
  - Projection = identity (`col=canonCol`, `row=canonRow`), Y-flip/axis-swap none (RE-confirmed, P0)
- **다음 행동**:
  1. `ui_explorer`로 `LOGH_STRAT_TERRAIN=1`/`LOGH_STRAT_GALAXY=1` 환경에서 80개 마커 전수 렌더 + Iserlohn/Fezzan 셀 클릭 target panel live 검증
  2. `tools/logh7_dump_strategic_grid.mjs --terrain`로 `markerOutsidePassable=0`, `duplicateMarkerCells=[]` 확인
  3. 병렬: `0x031d` builder offset RE + `Null_galaxy.mdx` 79→80 매핑

### S3-02 model-galaxy-stars.json spectral→galaxy.json mapping

> 상태: partial.

- `content/extracted/model-galaxy-stars.json`: `Null_galaxy.mdx`에서 79개 `star_NN_<class>` 노드로부터 분광형 추출 완료(P0). histogram: G19/O2/F8/A7/B5/M21/K17.
- `content/galaxy.json`: 80개 성계 각각에 `spectralClass`가 `page101-bg` 별 원반 색상(P1)으로 부여됨. histogram: G32/O0/F3/A4/B8/M10/K23.
- `src/server/logh7-content-adapter.mjs` 및 `src/server/logh7-login-session.mjs`은 `model-galaxy-stars.json`을 galaxy.json index에 위치 기반으로 임시 연결(fallback)하나, `chartSpectralClass`가 있을 경우 우선 사용.
- `tests/server/logh7-strategic-grid-provenance.test.mjs`에서 content pack의 spectralClass authority는 `manual_star_chart_pixel_color`로 검증.
- `docs/logh7-content-catalog.md:161-164`에 positional spectral join이 mis-assigned라는 known bug 기록.

**다음 행동:** 권위 분광형 출처를 확정(MDX 템플릿 vs PDF 색상). MDX를 사용할 경우 노드 위치/이름과 galaxy.json 좌표를 교차하여 검증된 node→system 매핑을 작성; PDF를 사용할 경우 model-galaxy-stars fallback을 문서 전용으로 전환하고 `docs/logh7-content-catalog.md` 버그 노트를 갱신. 병행하여 클라이언트 0x0313 byte2 consumer의 variant slot 의미를 RE 확인.

### S3-03 constellation/msgdat group 0x18 star labels

> 상태: **partial**

**핵심 판정:**
- 클라이언트 `constmsg.dat` group 0x18(offsetTable index 24, 레코드 1403–1491)은 전략맵 마커 라벨 테이블.
- `0x0313 ResponseStaticInformationGridType` object record의 `byte0`를 `FUN_00522010(0x18, byte0)`로 해석해 마커 이름 획득(P0).
- group 0x18은 총 89개 항목: subId 0–2는 지형 라벨, subId 3–88은 성계·기타 이름.

**데이터 매핑 현황:**
- `content/galaxy.json` 80개 성계명 전수가 group 0x18 subId 3–88 내에서 매칭됨(직접 스크립트 대조: matched=80, unmatched=0).
- 서버 `src/server/logh7-login-protocol.mjs`의 `safeMarkerContentId`가 subId 0–2(grid-type label)을 실제 성계명(subId 3)으로 redirect.
- `tests/server/logh7-strategic-grid-provenance.test.mjs` 3/3 pass.

**잔여 불확실성:** group 0x18에 `galaxy.json`에 없는 6개 항목 존재(subId 13 안우레갈라, 32 케이프혼, 34 코브라베른, 45 탄호이저 게이트, 52 니벨룽, 75 몬살륵르). 실제 클라이언트 전략맵에서 성계 라벨이 보이는지는 A0 marker render wall 해결 후 라이브 검증.

**다음 행동:** A0 marker render wall 해결 → patched/원본 클라이언트로 전략맵 진입 후 80개 성계 라벨 라이브 검증; 6개 비매칭 항목이 요새/회랑(S3-05)과 연결되는지 조사.

### S3-04 planet-economy.json / facility sidecar

> 상태: **partial**

- `content/planet-economy.json`은 80성계/281행성의 경제 수치를 procedural seed로 보유(P3).
- `src/server/logh7-content-source.mjs`에서 content DB 빌드 시 행성 레코드와 병합.
- `src/server/codec/base-record.mjs::economyBaseRecord()`가 0x031f `budget[0]=Σindustry`, `commodity[0]=#habitable`, `budgeting[0]=#planets`로 주입 — 값은 P3, 레이아웃은 P0.
- `src/server/logh7-base-economy.mjs`는 `NotifyBaseParameter` 0x0337 빌더를 구현(population@0x28, food@0x40 CONFIRMED)하나, `ResponseTacticsCharacter`와 opcode 충돌로 **라이브 발신 금지**.
- facility sidecar는 **독립 JSON 없음**. `content/client/schema.json`에 152개 시설 라벨만 존재.
- `src/server/codec/institution-record.mjs`는 `ResponseInformationInstitution` 0x0321 빌더를 0x8DE4 fixed body, 3중 nested layout(4×36×20)으로 P0 구현.

**다음 행동:** facility sidecar JSON 스키마 설계 + 40+ 執務室 한글화; 0x031f base-record 배열 주입의 실제 base 패널 반영을 라이브 A/B로 확인 후 0x0337 충돌 해결 또는 대체 와이어 결정.

### S3-05 fortress/corridor passable-cell map

> 상태: **partial**

- `content/galaxy-passable-cells.json` — 3627개 passable cell; 중앙 gap(col 48..57)을 row 12(이제르론)와 row 38(페잔)의 1칸 회랑만 개방.
- `content/galaxy.json` — 80개 성계 + 6개 요새(`system.fortresses[]`).
- `content/fortresses.json` — 6개 요새 캐논 스탯.
- `tools/logh7_galaxy_corridor_extract.py` — `page101-bg.jpg` 래스터 측정으로 회랑 행 12/38 식별.
- `src/server/logh7-login-protocol.mjs` — `buildStrategicGalaxyGrid`/`parsePassableCells`/`generatePlasmaCells`/`TERRAIN_VALUE` 구현.
- `src/server/logh7-fortress.mjs` — 요새를 class-3 전략 마커로 투영.
- `tests/server/logh7-strategic-grid-provenance.test.mjs` + `logh7-plasma-sargasso.test.mjs` — 0x0313/0x0315 와이어, 80개 마커, 지형 연결성 검증 통과.
- `docs/logh7-strategic-map-wire.md` — 클라이언트 항행성 게이트 `objectTable[V].byte1 ∈ {1,3}` RE 확정.

**다음 행동:** `docs/logh7-galaxy-page101-dot-extraction.md` 라이브 QA 체크포인트 실행: `LOGH_STRAT_TERRAIN=1 LOGH_STRAT_GRID=1 LOGH_STRAT_GALAXY=1`로 `ui_explorer` 구동 → 이제르론/페잔 회랑 단일셀 렌더, 요새 마커, `markerOutsidePassable=0` 확인; `tools/logh7_dump_strategic_grid.mjs` 오라클 수집.

### S4-01 C002 6-layer subsystem

> 상태: **partial** (RE 100% P0 완결, 자연 구동 미증명)

**현재까지 확정된 것 (P0):**
- 6-레이어 전체 지도가 `docs/logh7-c002-mechanism-complete-2026-06-23.md`에서 확정:
  1. 패널 위젯 구성 — `FUN_0054e570 → FUN_004ff3c0 → FUN_004f6040` (widget 0x67)
  2. catGate 전이 — `FUN_004fd7a0`
  3. officer 데이터 채움 — `FUN_004fc4a0/FUN_004f68f0`, `PLAYER_INFO+0x270` ← `0x0323` offset `0x24c`
  4. 함대 선택 — `FUN_004f6600`, selection latch `+0x624`
  5. 명령 메뉴 빌드 — `FUN_004f5cb0`
  6. dispatch — `FUN_004f93c0 → FUN_005737d0 → 0x0b01`, 서버 응답 `0x0b07`
- **와이어 레이아웃**은 `docs/logh7-strategic-input-wire.md`에서 `0x0b01`(36B) / `0x0b07`(580B)로 확정.
- **서버 구현**: `src/server/logh7-command-engine.mjs`에 `0x0b01` 권위 처리 및 `/grid <cell>` 채팅 fallback; 1058 PASS.
- **라이브 프로브 증거**: `.omo/ui-explorer/live13-cmdmenu`, `live15-catgate`, `live16-widget`, `live17-catforce`, `live19-drive`, `live20-fleetmove`, `live21-owncell`.

**남은 블로커:**
- **레이어 1(패널 위젯 구성)이 autologin 월드에서 미실행**: scene gate `0x358382`가 이미 `2`라 `FUN_0054e570` setup이 스킵됨.
- `/grid` 채팅 fallback은 서버 로직/테스트 완료이나, 클라이언트 채팅 UI를 여는 입력 경로가 기존 C002 마우스/키보드 레이어와 동일하게 막혀 라이브 미증명.

**다음 행동:**
1. `tools/client_patches/c002-force-scene-setup.json` 적용하여 `FUN_0054e570` scene setup 실행.
2. `tools/logh7_c002_cmdmenu_probe.py`로 unit-list populate/rowCount>0 라이브 확인.
3. 명령 row 클릭 또는 안전한 dispatch 직접 구동으로 `0x0b01 → 0x0b07` trace 최초 캡처.
4. 동시에 `0x0325` native 756B 레이아웃 추가 RE.

### S4-02 strategic command table / factory population

- **대상**: `FUN_004f5cb0`가 읽는 전략 명령 runtime table, factory id 배열, v3~v14 live thread 증거
- **상태**: `partial`
- **핵심 증거**
  - `docs/logh7-c002-mechanism-complete-2026-06-23.md`: `FUN_004f5cb0`가 `FUN_004c8700()` runtime base(`clientBase+0x3416d8`)에서 category*0x46 record의 `+0x14`(command_count u8), `+0x16`(factory ids u16[])를 읽음(P0).
  - `docs/logh7-proto-info-records.md`: 0x305 `ResponseStaticInformationCard`(0x520a), 0x307 `ResponseStaticInformationCardCommand`(0xe5b2) 레이아웃 확정.
  - `src/server/logh7-info-records.mjs`: `buildStaticInformationCardInner`/`buildStaticInformationCardCommandInner` canonical LE 빌더 구현.
  - `src/server/logh7-login-session.mjs`: `LOGH_COMMAND_TABLE_PRELOAD_PROBE=1` 게이트로 채운 0x305/0x307 응답 배치.
  - `.omo/ulw-loop/evidence/g006-c002-command-table-preload-v3-20260617.md`: v3에서 nonzero 0x305/0x307이 staging→runtime 승격 후 `commandCount14=2`, factories `0x002b/0x0041`로 관측.
  - `.omo/ulw-loop/evidence/g006-c002-d2a3c-positive-control-v14b-20260617.md`: `DAT_009d2a3c=2` 주입 시 inbound `0x0b01` 발생(목적지 invalid).
- **불확실성**
  - 자연 월드 진입 시 0x305/0x307 데이터가 `tbl+0x1e`/`+0x20`에 정확히 떨어지는가?
  - command table populate의 권위 원천이 0x305/0x307 맞는지, 아니면 다른 레코드/로컬 리소스인지 미확정.
  - 명령 row 생성 후 `commandMenu[0]+4/+5` active gate와 target/confirm 상태(`DAT_009d2a3c/0x2a40`)의 자연 writer 미확정.
- **다음 행동**: `LOGH_COMMAND_TABLE_PRELOAD_PROBE=1` 실클 세션에서 `tools/logh7_command_table_watch.py` + `tools/logh7_promote_timing_watch.py`로 staging→runtime 정렬/타이밍을 캡처; `FUN_005015f0(kind=2)` read-only hook으로 row hit 라우팅 확인.

### S4-03 duty-card texture deployment + C002 unblock path

> 상태: **partial / C002 blocked**

**요약:**
직무카드(0x0704-0x070b, 0x0356, 0x0358, 0x034e-0x034f) 와이어 코덱과 personnel 도메인 엔진은 구현·테스트 완료. 직무카드 텍스처(`data/image/shokumu_card/*.tga`)는 설치본에 이미 존재해 별도 배포는 불필요. 행성 내 장소(0x031f/0x0321/0x031d) 레코드와 89개 시설/집무실명 한글 번역도 추가됨. 그러나 실제 직무카드 패널/행성내장소 UI는 C002가 미구성이라 라이브에서 오픈되지 않음.

**핵심 증거:**
- `server/src/server/codec/personnel-records.mjs` — 10개 직무카드 관련 opcode byte-exact 빌더/파서 (P0).
- `server/src/server/logh7-personnel.mjs` — seat/계급/봉토/진급 도메인 엔진 (P0).
- `client/vendor/logh7-installed/data/image/shokumu_card/*.tga` 6종 확인 (P0).
- `docs/logh7-c002-mechanism-complete-2026-06-23.md` — C002 6-레이어 완전 RE, 단일 근본 = 전략 위젯 latch loop 미등록 + unit-list 위젯 0x67 미생성 (P0).
- `tools/client_patches/c002-force-scene-setup.json` — layer 1 위젯 강제 생성 same-length 패치 스펙 (아직 기본 스택 미포함).
- `server/src/server/logh7-command-engine.mjs` — `/grid <cell>` 채팅 폴ük으로 서버가 0x0b07 NotifyMovedGrid 푸시 (구현 완료, 라이브 미증명).
- `docs/SESSION-HANDOFF-2026-06-24.md` — 시설/집무실명 89개 한글화, 서버 테스트 1145 PASS.

**다음 행동:**
1. `c002-force-scene-setup.json`을 playable EXE에 추가해 unit-list 위젯 0x67 생성 라이브 검증.
2. Tab 키 등 채팅 포커스 오픈 경로 라이브 검증 → `/grid` end-to-end.
3. C002 6-레이어가 모두 구동된 뒤 직무카드/행성내장소 UI 라이브 스크린샷 확보.

### S4-04 facility interior 40+ office name translations

**Status correction:** The 40+ 執務室 (office) facility-interior name translations are **DONE**, contrary to `docs/logh7-planet-duty-survey-2026-06-24.md` §2.3 which records them as "NOT translated".

**Evidence:**
- `content/client/msgdat.json` constmsg.dat records contain 83 Japanese 執務室 variants at IDs 2332–2414.
- `content/localization/constmsg-ko.json` contains Korean translations for all 83 IDs.
- `tools/logh7_localize_facility_names.py` is the batch generator that maps the Japanese office names to Korean.
- Byte-exact decode of `.omo/work/logh7-ko-overlay/data/MsgDat/constmsg.dat` and `.omo/work/logh7-installed/data/MsgDat/constmsg.dat` confirms cp949 Korean text is present for IDs 2332–2414.
- `content/extracted/msgdat-full.json` (byte-exact decode of installed MsgDat) also contains Korean facility names for the full 2300–2417 range.

**Scope nuance:**
- The 83 office variants (執務室) are fully translated and deployed.
- An additional ~26 non-office facility-interior names in 2301–2309 / 2312–2328 are present as Korean in the deployed `constmsg.dat` but are **not** listed in `content/localization/constmsg-ko.json`; the JSON overlay is incomplete for non-office facility names.

**Live verification:** The facility-interior UI panel has **not** been live-verified; it remains gated by C002 and the facility render path.

**Next action:** Update `docs/logh7-planet-duty-survey-2026-06-24.md` §2.3 to reflect that the 40+ office name translations are complete, and decide whether to backfill the 26 non-office facility names into `content/localization/constmsg-ko.json` for reproducibility. Live UI verification remains pending C002 resolution.

### S4-05 tactical battle entry

> 상태: **partial**

- **P1.1 NotifyChangeMode spawn-pose seeding**: `buildNotifyChangeModeInner`가 `modeKind`, `fieldOwnerId/anchorId`, 참가 함선별 `{shipId, heading, x, z, y}`를 0x298 바디에 기록. 구현 완료.
- **P1.2 battle-setup data tables**: `src/server/logh7-battle-engine.mjs`에 0x349/0x33b/0x341/0x343/0x337/0x33f/0x345/0x347/0x34b 빌더 구현. `tests/server/logh7-battle-engine.test.mjs`에서 오프셋/순서/캡 검증 통과.
- **P1.3 battle entry orchestration**: `openBattleField()`가 `[0x349, 0x33b, 0x341, 0x343, (optional), 0x42f, 0x0f1f]` 순서로 notify 생성. `LOGH_BATTLE_ENTRY_PROBE=1` 서버-주도 probe에서도 동일 시퀀스 지연 푸시.
- **Live 검증**: `.omo/ui-explorer/live10-tactical/`에서 sequence 수신 후 전술 모드 전환 UI 패널(군수물자/NO DATA) 출현. 단, 전략맵 배경이 여전히 유지되어 완전한 전술 3D 렌더는 미완.

**미확정/잔여:**
1. **0x411 파서 오프셋**: `src/server/logh7-combat-engine.mjs:175`는 `mode@4, leader@8, count@12`로 읽지만 RE 문서와 불일치. 실제 0x411 캡처 필요.
2. **0x0b06 CommandSwitchMode**: roadmap P1.3에 명시된 0x0b06 파서/핸들러는 아직 구현되지 않음.
3. **스폰 좌표 출처**: 현재 probe는 world-state 함선 좌표를 ×8+100 스케일로 사용. 캐논 전투 배치 규칙은 P2/P3.
4. **완전 렌더 게이트**: 0x42f+0x0f1f만으로는 전술 3D 뷰가 뜨지 않음.
5. **자연 진입 경로**: 현재 라이브 결과는 서버-주도 probe. 클라이언트가 0x0b01/0x411을 자연 발신하는 경로는 C002 입력 게이트로 차단됨.

**다음 행동:**
- 0x0b06 SwitchMode 파서/핸들러 구현 및 단위테스트 추가.
- 0x411 body 오프셋을 실제 캡처 또는 Ghidra 추가 검증으로 확정 후 파서 정정.
- 라이브 probe에서 0x411 timer-stamp 선행 → deferred openBattleField 조합으로 전술 렌더 반응 테스트.
- 0x337/0x33f/0x345/0x347/0x34b 포함 시 클라 메모리/스크린샷 변화 관찰.

### S5-01 HUD TGA/BMP list

> 상태: **partial** (20/724 리마스터 완료 및 라이브 입증, 나머지 704 미시작)

**증거:**
- `client/vendor/logh7-installed/data/image`에 총 724개 TGA/BMP(TGA 652, BMP 72), 31개 하위 디렉터리.
- `tools/logh7_remaster_hud_tga.py`의 `HUD_SET` 20개를 4x Lanczos+언샤프로 업스케일, 출력 `.omo/work/remaster/hud-overlay/data/image/*`.
- 라이브 드롭인: `.omo/ui-explorer/live9-remaster/`에서 클라 메모리 208→349MB, HUD 렌더 무손상 확인.
- D3DX8 로더가 파일 헤더 치수를 그대로 사용 → 드롭인 가능.

**불확실성:**
- 나머지 704개의 HUD/Effect/3D 사용처 매핑 미완료.
- 일부 문서는 `data/image/galaxy/`, `data/image/battle/`을 언급하나 실제 설치 트리에는 존재하지 않음.

**다음 행동:**
1. `tools/logh7_upscale_textures.py`(또는 `logh7_remaster_hud_tga.py` 확장)로 `window/`, `soukan/`, `rader/`, `Field/`, `icon_*/`, `gamemenu/`, `senryaku_panel/`, `shokumu_card/` 등 HUD/UI 디렉터리를 우선순위별로 업스케일.
2. 각 아틀라스별 1개 샘플 드롭인 후 라이브로 rect/레이아웃 무손상 확인, 그 뒤 bulk 적용.
3. `data/image/galaxy/`, `data/image/battle/` 언급의 실제 경로 매핑.

### S5-02 Font resources

> 상태: **partial**

**핵심 증거:**
- `docs/logh7-font-remaster.md` RE: G7MTClient.exe의 전체 텍스트 레이어는 GDI `CreateFontA` 단 두 곳이며, `HANGEUL_CHARSET(0x81)` 전달, 전역 face 문자열은 `MS UI Gothic` @VA 0x0077402c.
- `tools/client_patches/font-face.json`: 0x0077402c → `Pretendard`.
- `tools/client_patches/font-cleartype.json`: 두 CreateFontA 품질 인자를 `ANTIALIASED_QUALITY(4)` → `CLEARTYPE_QUALITY(5)`.
- `tools/logh7_rsrc_patch.py`로 RT_MENU/RT_DIALOG/RT_STRING 전체 파싱·재직렬화.
- `content/localization/hardcoded-ui-ko.json`: 143개 패처 슬롯 중 136개 한글 번역, 다이얼로그 폰트 face → `Pretendard`. (자체 `_grade: P3`)
- `tools/logh7_build_playable_client.py` DEFAULT_STACK에 `font-face`, `font-cleartype` 포함.
- 라이브 증거: `.omo/ui-explorer/loginverify/shots/002-login-form.png` 한글 로그인 다이얼로그; `.omo/ui-explorer/g007-gdi-after-login.png` 한글 인게임 UI + Win32 메뉴 "파일(F)"/"도움말(H)"; Frida 추적으로 `ExtTextOutA`가 cp949 한글 바이트를 렌더하는 것 확인.

**불확실성:**
- 스크린샷만으로 렌더된 글꼴이 시스템 폰드(굴림/맑은 고딕)인지 진짜 Pretendard인지 식별 불가.
- `install-pretendard.ps1`의 클린 시스템 배포 종단 검증 기록 없음.

**다음 행동:** `package-installed` zip을 클린 Windows 호스트에 풀고 `install-pretendard.ps1` 실행 후 playable EXE 기동 → 로그인/인게임 스크린샷 + GDI probe 또는 레지스트리로 Pretendard 해석 여부 라이브 검증.

### S5-03 Portrait TCF atlas

> 상태: **partial**

- **P0 완료**: TCF atlas 포맷/소비자 RE; `tools/logh7_tcf_decode.py`로 7 atlas 디코드; composite face-codec RE; TCF PACKER 구축(`tools/logh7_tcf_pack.py`).
- **P1 부분**: `tools/client_patches/face-atlas-expand.json`이 gaf cap 50→51로 1슬롯 확장. 3종 EXE variant drift-verified / byte-encoded / revert self-test PASS. **단, 라이브 렌더 검증은 미시행**.
- **P1 제한**: 공식 name↔face-number anchor는 12개뿐(Yang=206, Schenkopp=85 등, 2개 pixel-confirmed). 나머지 ~585개 미복원.
- **P3 fallback**: `content/roster/face-assignment.json`에 97명 AI/사람 라벨 할당, `face_number=null`.
- **잔여 불일치**: `src/server/logh7-face-codec.mjs`의 `gaf.cap=31`이 `face-atlas-expand.json`/`logh7_tcf_pack.py`의 확장 cap(50)과 맞지 않음 — 서버 갱신 필요.

**다음 행동:**
1. `src/server/logh7-face-codec.mjs`의 gaf cap을 50으로 올리고 `tests/server/logh7-face-codec.test.mjs`에 gaf idx 50 round-trip 추가.
2. `face-atlas-expand.json` 적용 + `logh7_tcf_pack.py add --atlas gaf --slot 50` PNG 삽입 후 실제 `G7MTClient.exe` 캐릭터 생성/로스터 화면에서 렌더되는지 라이브 검증.

### S5-04 Background/galaxy bitmaps

> 상태: **pending**

- 원본 설치본 에셋: `.omo/work/logh7-installed/data/model/images/Hi/galaxy00.bmp`(2048×1024×8), `galaxy_all.bmp`, `galaxy_alpha.bmp`, `star000.bmp`, `neb000..neb006.bmp`, `fs_glow_000..006.bmp`, `fs000..fs006.bmp`
- 전략용 스프라이트: `.omo/work/logh7-installed/data/image/strategy/fs000_f..fs006_f.bmp`, `sstar.bmp`, `units.bmp`, `grid_glow.bmp`, `bh_*.bmp/tga`
- MDX 임베디드 텍스처 경로: `content/extracted/model-strategy.json` — `galaxy.mdx` → `galaxy00.bmp`/`star000.bmp`/`neb000_a.bmp`; `content/extracted/model-space.json` — `space.mdx`/`s000..s006.mdx` → `neb*.bmp`/`star000.bmp`
- EXE 문자열 경로: `content/extracted/binary-strings-G7MTClient.json` — `../data/model/images/lo/fs_glow_%03d.bmp`, `../data/image/strategy/grid_glow.bmp` 등
- 런타임 사용 매핑: `docs/logh7-strategic-map-wire.md` — `DAT_009d2934[0..6]` = `fs_glow_000..006` 마커/행성 글로우 슬롯, slot 7 = 블랙홀 오버레이
- 로더 검증: D3DX8 BMP/TGA 로더는 치수에 무관(드롭인 업스케일 가능)
- 품질 평가: 전략맵 배경 저해상도/반복 패턴(P2)

**다음 행동:**
1. `tools/logh7_mdx_extract.py`로 `galaxy.mdx`/`space.mdx` 머티리얼 슬롯을 재확인해 실제 소비되는 배경 텍스처 집합 확정
2. `tools/logh7_texture_pipeline.py extract`로 식별된 배경/성운 BMP를 PNG로 추출
3. 4x LANCZOS 업스케일 스크립트로 `.omo/work/remaster/galaxy-overlay` 생성
4. `ui_explorer` 라이브 세션에서 오버레이 드롭인 → 클라 생존/시각 개선/SHA 복원 검증

### S5-05 Ship/fighter model textures and geometry

> 상태: **pending (미시작/부분)**

**확정 증거 (P0):**
- Ship 모델 파일 273개: `.omo/work/logh7-installed/data/model/Ship/` 아래 261개 `.mdx` + 상위 12개. 디렉토리별 진영: `FP`(동맹), `GE`(제국), `PI`/`PZ`(페잔).
- `content/extracted/model-ship.json` (273 entries) — 파일명, 노드명, embedded 원본 에셋 경로 포함.
- `content/extracted/model-ship-hardpoints.json` (248 entries) — engine/laser/beam/gun/missile/flare 마운트 수.
- 전술 와이어/엔진: `src/server/logh7-battle-engine.mjs` + `logh7-battle-ops.mjs`에서 0x349/0x33b/0x341/0x343/0x42f/0x0f1f 구현; 서버푸시 맵전환은 live5/live10에서 작동 확인.
- Air-combat 규칙엔진: `src/server/logh7-air-combat.mjs`.

**미확정/미시작 (P2/P3):**
- MDX geometry binary 파싱: 정점/인덱스/UV/서피스/머티리얼 binary 레이아웃 미파싱.
- Texture 리마스터: ship 전용 외부 텍스처는 `data/image/Field/ShipMark.tga` 외 미발견.
- Fighter 모델/텍스처: Spartanian fighter 자체의 별도 3D 모델/텍스처 파일 존재 여부 미확인.
- 실제 게임 내 렌더 검증: 전술 전투 렌더가 미완성.

**다음 행동:**
1. 1개 ship mdx(예: `FP/FH001.mdx`)에서 정점/UV/서피스/텍스처 참조를 추출해 P0 구조 확보.
2. `data/model/effect/`, `data/image/`, `data/model/Ship/` 전체에서 standalone fighter 메시/텍스처 검색.
3. 라이브 렌더 해금 후 리마스터 texture drop-in 검증.

---

## Appendix B: Survey Consolidation

| 분야 | 완료 항목 | 핵심 블로커 | 다음 Goal 후보 |
|------|-----------|-------------|----------------|
| UI/Screenshot | S1-05 부분 외 모두 partial | C002 / D3D8 입력 / 라이브 렌더 | G-M1-01, G-M3-01 |
| MDX Hardcoding | S2-01/02 조사 완료, S2-03/04/05 partial/pending | polygon mesh 미파싱, MDX↔game ID 매핑 | G-M6-01, G-M7-02 |
| Star/Planet Provenance | S3-03 라벨 매핑 완료, S3-01/02/04/05 partial | 라이브 투영검증, facility sidecar, 0x031d, spectral 권위 | G-M2-01, G-M6-01 |
| Implementation Gap | S4-04 office 번역 done, 나머지 partial | C002 6-layer 구동, 0x0b01/0x0b07 자연 루프, 전술 렌더 | G-M3-01, G-M4-01, G-M5-01 |
| Remaster Asset | S5-02 font partial, 나머지 pending | bulk texture pipeline, geometry decoder | G-M7-01, G-M7-02 |

> **최우선 Goal**: `G-M3-01` C002 6-레이어 구동 (S1-02/04, S4-01/02/03 모두 이에 종속).  
> **차선**: `G-M6-01` MDX hardcoding 전수 확인 (사용자가 명시한 “성계 위치/타입/행성 위치 MDX 하드코딩” 검증).  
> **병렬 후보**: `G-M2-01` galaxy.json 라이브 검증, `G-M4-01` 전술 전투 렌더, `G-M5-01` 직무카드/행성내장소 UI.
