# LOGH VII 전체 리마스터링 마스터 로드맵 (확장판)

작성일: 2026-06-23 KST  
상태: active  
목적: 실제 `G7MTClient.exe`로 플레이 가능하고, HD 리마스터되고, 모딩 가능한 은하영웅전설 VII 부활  
원칙: **전체 문서/자료 검토**, **바이트 정합 RE 지속**, **실클 증거 필수**

> 데이터 등급: P0=클리이언트/와이어 바이너리 확정, P1=공식 anchor(manual/PDF/reference 스크린샷), P2=IV-EX/넷마블 후보, P3=절차/플레이스홀더. 추측을 원본으로 승격하지 않는다.  
> 루프 규칙: `docs/logh7-loop-engineering.md`를 따른다. maker/checker 분리, 상태 파일 주도, 실클 표면 증거 필수.  
> 커버리지 원칙: 코드 변경 시 signature 기반 drift 검사, 문서 변경 시 cross-reference 갱신, RE 진행 시 Ghidra 인덱스 + 라이브 프로브 병행.

---

## Phase 0 — Foundation: 클라이언트 부트, 핸드셰이크, 로그인, 로비

| ID | 마일스톤 | 핵심 완료 조건 | 데이터 등급 | 의존 |
|---|---|---|---|---|
| **F-001** | 핸드셰이크 바이트 정합 | 실제 클라이언트가 `0x0034`→`0x0035`→`0x0036`→`0x0030` 순서로 진행하고 서버 trace 기록 | P0 | - |
| **F-002** | Phase3 wire encoding 완결 | `0x0035` decoded payload를 child-codec으로 감싸는 정확한 방식 확정, golden hex 테스트 추가 | P0 | F-001 |
| **F-003** | CommandOK 응답 스키마 | `0x0031`/`0x0032`/`0x0033` 후보를 라이브 프로브로 검증/폐기, 실제 후속 패킷 식별 | P0/P1 | F-001 |
| **F-004** | GIN7 로그인 → 로비 리디렉션 | `0x7000` credential 파싱 → `0x7001` redirect + `0x7002` serverlist, 실클 로비 도달 | P0 | F-001 |
| **F-005** | 로비 로그인 OK | `0x2000`→`0x2001` OK(message32), `0x2003` 공지 패널, 실클 타이틀 메뉴 | P0 | F-004 |
| **F-006** | 계정/캐릭터 로스터 | `0x1000/0x1001`, `0x1004/0x1005`, `0x1200/0x120f/0x1201` 트랜잭션, 로스터 UI 활성화 | P0 | F-005 |
| **F-007** | 캐릭터 생성 플로우 | `0x1008` Create 요청 packed 파싱 → 128B OK 응답, 실클 생성 화면 진입 | P0 | F-006 |
| **F-008** | 로비 네이티브 레이아웃 | `lobby-res` + `lobby-native-layout` 패치로 1920×1080에서 버튼/텍스트 정렬, 실클 스크린샷 | P1 | F-005 |
| **F-009** | 로그인/로비 한글화 | `String.txt`, `constmsg.dat`, 타이틀 텍스처, 폰트 face(Pretendard), 실클 가독성 | P1 | F-005 |
| **F-010** | 런처/업데이터 정적 RE | `G7Start.exe`, `Gin7UpdateClient.exe`의 `SERVER.INI`/업데이트 endpoint 파싱, 불필요 시 폐기 결정 | P2 | - |

---

## Phase 1 — World Entry & Strategic Command (현재 G001~G002 영역)

| ID | 마일스톤 | 핵심 완료 조건 | 데이터 등급 | 의존 |
|---|---|---|---|---|
| **S-001** | SS 월드 진입 | `0x0200/0x0201`, `0x0205/0x0206`, `0x0f02/0x0f03`, `0x0b09/0x0b0a` 정상 송수신, 실클 전략맵 렌더 | P0 | F-005 |
| **S-002** | 월드 데이터 안착 | `0x0304/0x0305`, `0x0306/0x0307`, `0x0312/0x0313`, `0x0314/0x0315`, `0x0300/0x0301` 정상 응답 | P0 | S-001 |
| **S-003** | 플레이어 함대 시드 | `0x0325` ResponseInformationUnit가 commander/fleetCellId/own-unit을 클라 `+0x11178`에 안착, `LOGH_PLAYER_FOCUS_CELL=1` 검증 | P0 | S-002 |
| **S-004** | 함급 마스터 연결 | `0x030b` zero-stub 해체, `content/ship-stats.json` 동맹 교정 반영, 실클 함선 스탯 카드 | P0/P1 | S-002 |
| **S-005** | 전략 명령 0x0b01/0x0b07 | **자연 클릭 또는 동등 흐름**으로 `0x0b01` 송신 → 서버 `0x0b07` 응답 → 클라 수신, 선택/이동 UI 변화 실클 스크린샷 | P0 | S-003 |
| **S-006** | 함대선택 서브시스템 | unit-list 패널 위젯 0x67 생성, officer 데이터(0x24c/0x250) 정합, `catGate` 0→2 전이 | P0 | S-003 |
| **S-007** | 명령 메뉴 populate | 명령 메뉴 패널 0x65 `rowCount(+0x350)>0`, factory(0x002b/0x0041/이동형 0x19/0x3f/0x40) 채움 | P0 | S-006 |
| **S-008** | SelectGrid target/confirm | `DAT_009d2a3c`/`DAT_009d2a40` 자연 writer, `FUN_00570a10`/`FUN_00573cd0`/`FUN_005737d0` 조건 충족 | P0 | S-006 |
| **S-009** | HUD mode activation 라우팅 | `FUN_00501e30(2, …)` enqueue 조건 식별, code-2 이벤트 생성 UI 버튼/입력 확정 | P0 | S-005 |
| **S-010** | StrategySequence case0 진입 | `FUN_004f9030`/`FUN_004f96d0` task seed + event-9 enqueue 조건 확보 | P0 | S-009 |
| **S-011** | 0x0325 native 756B 레이아웃 | officer count(0x24c) 및 관련 필드(0x250) 정확 매핑, wire 빌더 수정 | P0 | S-003 |
| **S-012** | 전술맵 진입/퇴장 | 서버 push로 전술 뷰 렌더, 함대 시드 포즈, 60s 무크래시 없음, `0x42f` 수신 | P0 | S-005 |

---

## Phase 2 — Domestic Affairs, Organization, Logistics (G003/G004/G006 영역)

| ID | 마일스톤 | 핵심 완료 조건 | 데이터 등급 | 의존 |
|---|---|---|---|---|
| **D-001** | 성계/행성/요새 데이터 P0/P1 확정 | 80 systems, 281 planets, 6 fortresses 좌표/스펙트럼/소속/경제 데이터, `page101-bg.jpg`+실클 4방 검증 | P1 | S-002 |
| **D-002** | 별색/스펙트럼 클래스 매핑 | `stellarTypes[]` ↔ `galaxy.json[]` 조인 버그 수정, 실클 별색 렌더 | P1 | D-001 |
| **D-003** | 거점/기지 정보 패널 | `0x031d/0x031f` StaticBase/Base, `0x0321` Institution 시설/방, 실클 기지정보 UI | P0/P1 | S-002 |
| **D-004** | 시설 스칼라 의미 확정 | `name-catalog-id` vs `facility-kind` vs `access-state` 구분, P1 anchor로 검증 | P1 | D-003 |
| **D-005** | 창고/패키지/수송 | `0x0326/0x0327` Warehouse, `0x0328/0x0329` Package, 실클 물류 UI | P0 | S-002 |
| **D-006** | 함대 편성 상세 | `0x032a/0x032b` Outfit, `0x032e/0x032f` OutfitParty, `0x0330/0x0331` OutfitUnit | P0 | S-004 |
| **D-007** | 국가별 함대 로스터 | `power+0x2a`(≤14 fleet), `power+0x80`(≤3 leader) emitter, 실클 진영 OOB 표시 | P0/P2 | D-006 |
| **D-008** | 직무카드 발령/해임/사임 | `0x0704`~`0x070b` personnel opcodes, `0x358` NotifyChangeFlagShip, 실클 카드 UI | P0 | F-006 |
| **D-009** | 직무권한카드 UI | `0x0305/0x0307` static card/command, `card.jpg` 기반 명령/제안 탭 재현 | P1 | D-008 |
| **D-010** | 행성내 장소/시설내 장소 | `lobby.jpg`, `uu3.jpg` 기반 宇宙港, 旗艦桟橋, 航路管理センター 등 장소 이동 | P1 | D-003 |
| **D-011** | 자동생산/초기배치 | `content/auto-production.json`, `content/initial-deployment.json` 완성, 시뮬레이션 검증 | P1 | D-001 |
| **D-012** | 정치/내정 sub-action | `0x0900` sub-action(分裂行進/武力鎮圧/演説 등) opcode 확정, 실클 정치 UI | P2 | D-003 |
| **D-013** | 나이/출신/계급 데이터 | `character-roster.json`에 age/birth_year 추가, 자동진급/쿠데타 발화 조건 검증 | P1/P2 | F-007 |
| **D-014** | 특수능력/훈장 테이블 | 특수능력 id→이름, `decoration_bits[16]@char+0x6c` 128비트 MSB-first 매핑 | P1/P2 | F-007 |
| **D-015** | 함급 마스터 스탯 의미 | `0x030b` 필드 offense/defence/armor/build cost 등 정확 매핑, 라이브 RE | P0 | S-004 |
| **D-016** | 전략 물류 명령 | `0xb02` supply fuel, `0xb03/0xb0d` search, `0xb04/0xb05` load/unload troop, `0xb0b` moved base | P0 | S-005 |
| **D-017** | 편성/이송 명령 | `0xc02` reorganization, `0xc08` carrying in/out, `0xe00` institution move | P0 | D-003 |
| **D-018** | 함대 생성/삭제 | `0x0900` plan, `0x903` create outfit, `0x904/0x905` notify, `0x906` delete outfit | P0 | D-006 |

---

## Phase 3 — Tactical Combat (G002/G007 영역)

| ID | 마일스톤 | 핵심 완료 조건 | 데이터 등급 | 의존 |
|---|---|---|---|---|
| **C-001** | 전투 진입 orchestration | `0x411`→`0x42f` battle grant, `0x349`→`0x33b/0x341/0x343`→`0x42f`→`0x0f1f` 시퀀스 실클 | P0 | S-012 |
| **C-002** | 전술 함선 상태 레코드 | `0x33b` per-ship combat stats full field map, 실클 함선상태패널 | P0 | C-001 |
| **C-003** | 전투 기동 명령 | `0x401` turn, `0x403` reverse, `0x40a` stop, `0x404` warp, `0x425` warped notify | P0 | C-001 |
| **C-004** | 사격/피해 해결 | `0x405/0x406` attack/shoot, `0x40e` air battle, `0x407` fight, `0x426` NotifyAttackedShip, 피해공식 P3→P1 | P0/P3 | C-001 |
| **C-005** | 피해 공식 검증 | beam power→damage, 거리감쇄, shield mitigation, 치명타, hitSlot 0..5 매핑 실클/RE | P1/P2 | C-004 |
| **C-006** | 전투 함대/요새 작전 | `0x40f-0x422` sortie/evacuate/repair/supply/emergency, `0x429-0x442` notify | P0 | C-001 |
| **C-007** | 전투 퇴장/항복/전사 | `0x42f` teardown, 전사 판정, 전투 종료 후 전략맵 복귀 | P0 | C-004 |
| **C-008** | 2인 전투 E2E | 두 클라이언트 또는 동등 하네스에서 `0x0405/0x0406`→`0x0426` 브로드캐스트 실증 | P0 | C-004 |
| **C-009** | 전투 리더십 효과 | `LOGH_COMBAT_LEADERSHIP=1` 확장을 캐논 데이터(P1)로 교체 또는 폐기 결정 | P3 | C-004 |
| **C-010** | 무기 슬롯/연사 패턴 | `weaponType`/`aimMode` 의미, 연사 패턴, 실클 미사일일제사격/집중빔 검증 | P1 | C-004 |
| **C-011** | 전투 HUD/레이더 | `rader.jpg`, `tactics2.jpg` 기반 미니맵, 이동범위원, 커맨드그리드 | P1 | C-001 |

---

## Phase 4 — Social, Mail, Chat, Settings, Multiplayer (G008 영역)

| ID | 마일스톤 | 핵심 완료 조건 | 데이터 등급 | 의존 |
|---|---|---|---|---|
| **M-001** | 그리드 채팅 | `0x0f1c` GridChat 송수신, 한글 왕복, 실클 채팅창 | P0 | S-001 |
| **M-002** | 스팟/1:1 채팅 | `0x0f1d` SpotChat, `0x0f1e` SpotUnicastChat(≤65 UTF-16 code unit) | P0 | S-001 |
| **M-003** | 메일/메신저 | `0x0f05-0x0f15` mail/messenger, `0x0f0e` payload 확정 | P0/P1 | M-001 |
| **M-004** | 설정 동기화 | `0x0f16-0x0f1b` settings persistence, 오프라인 방향, 유언 메시지 등 | P0 | F-005 |
| **M-005** | 심플 인포 델타 | `0x1200-0x120f` TransactionSimpleData, character/outfit/base/grid/unit/card/rank 동기 | P0 | D-007 |
| **M-006** | 2인 로비/월드 동시 접속 | `LOGH_RELAY=1`, `LOGH_AUTHORITATIVE=1`, `LOGH_MP_VISIBILITY=1`, 2-client harness | P0 | S-001 |
| **M-007** | 멀티플레이 전략 가시성 | 제국·동맹 함대 상호 가시성, `0x0b07` broadcast to all in-world clients | P0 | M-006, S-005 |
| **M-008** | 계정 DB 운영 | SQLite registry, TOFU 등록/검증, `LOGH_ACCOUNT_DB`, 중복 가입 거부 | P0 | F-004 |

---

## Phase 5 — Remastering, Graphics, Sound, Localization (G005 영역)

| ID | 마일스톤 | 핵심 완료 조건 | 데이터 등급 | 의존 |
|---|---|---|---|---|
| **R-001** | HD 해상도/비율 | dgVoodoo2 D3D8, 16:9/16:10/4:3, `FullscreenAttributes=fake`, 4:3 풀스크린 필러 실클 | P1 | F-005 |
| **R-002** | 전 화면 native layout | 로비 이외 전 scene anchor table native canvas 이동, 실클 before/after | P1 | F-008 |
| **R-003** | 텍스처 업스케일/교체 | BMP/TGA/PNG/DDS 드롭인, AI 업스케일, 실클 before/after | P1 | S-001 |
| **R-004** | 3D 모델/메시 매핑 | MDX/MDS descriptor[2..9] vertex/face/UV 배열 확정, 새 함선/행성/성계 본체 추가 가능 | P0/P2 | S-012 |
| **R-005** | 사운드 교체 | ogg/wav 드롭인, BGM/SE 리마스터 | P1 | F-005 |
| **R-006** | 폰트/문구 검수 | Pretendard 글로벌 폰트, `constmsg-ko.json`, `String.txt`, CP949 왕복 | P1 | F-009 |
| **R-007** | HUD 하드코딩 라벨 한글화 | `hud-hardcoded-stat-labels-ko`, `sector-label-hardcoded-ko` 등 패치 실클 검증 | P1 | S-001 |
| **R-008** | face atlas/초상화 확장 | TCF packer, `face-atlas-expand.json`, Layer D 필요시 | P2 | F-007 |
| **R-009** | UI 컴포넌트 인벤토리 | 134장 reference 스크린샷 → component 리스트, C002~C011 UI 재현 체크리스트 | P1 | - |
| **R-010** | 캐릭터 스테이터스 = 체력 | `ddcc72_status.jpg` 기반 능력8종 중 체력(health/HP) 필드 식별 및 실클 검증 | P1 | F-007 |

---

## Phase 6 — Deployment, Modding, Operations (G008 영역)

| ID | 마일스톤 | 핵심 완료 조건 | 데이터 등급 | 의존 |
|---|---|---|---|---|
| **O-001** | Mod loader + cap validator | `mods/<mod>/{content,scenarios,localization,assets}/` JSON-schema 검증 | P0 | D-001 |
| **O-002** | 시나리오/로스터 에디터 UI | `DEFAULT_SESSIONS`, `worldBySession`, `character-roster.json`, `ship-stats.json`, `galaxy.json` 편집 | P1 | O-001 |
| **O-003** | 한국어 설치본 패키징 | `python tools/logh7_pipeline.py package-installed --overlay ...`, 이미지 없는 배포 zip | P1 | R-006 |
| **O-004** | EXE 배포 파이프라인 | playable EXE build → SHA 추적 → 설치본 교체 → 자동 smoke test | P0 | O-003 |
| **O-005** | Docker/AWS 운영 서버 | Dockerfile, 이미지 태그, 보안그룹, Windows 클라이언트 접속 캡처 문서화 | P1 | M-008 |
| **O-006** | 런처 자동 배선 | `LOGH7Launcher.exe --check`, `--server-smoke`, `--client-smoke` | P1 | O-004 |
| **O-007** | 모딩 가이드 | Layer A/B/C/D 예제, patch manifest 명세, `mods/example-add-officer/` 확장 | P1 | O-001 |
| **O-008** | 서버/클이언트 레포 분리 | 핵심 표면 고정 후 진행 | P2 | O-005 |

---

## Phase 7 — Reverse Engineering Continuous Coverage

| ID | 마일스톤 | 핵심 완료 조건 | 데이터 등급 | 의존 |
|---|---|---|---|---|
| **RE-001** | Ghidra 함수 인덱스 갱신 | `.omo/ghidra/export/G7MTClient/functions.jsonl` 주기적 재생성, 새 심볼/주석 반영 | P0 | - |
| **RE-002** | 정적 RE 커버리지 매트릭스 | message family(0x0xxx, 0x1xxx, 0x2xxx, 0x3xxx, 0x4xxx, 0x7xxx, 0x9xxx, 0xbxxx, 0xcxxx, 0xexxx, 0xfxxx)별 handler/빌더/라이브 상태 표 | P0 | RE-001 |
| **RE-003** | 동적 라이브 커버리지 | `tools/logh7_ui_explorer` + Frida probe로 message code 도달/미도달 리스트 갱신 | P0 | S-001 |
| **RE-004** | Command class 59개 매핑 | `CommandXXX` 클래스(0x401~0x43e 등)의 Input_/Output_ 레이아웃 완전 디코드 | P0 | C-001 |
| **RE-005** | MDX/MDS 메시 byte-map | `FUN_004d3bd0` + `FUN_005de500`/`FUN_005de8a0` caller-chain 디컴파일 | P2 | R-004 |
| **RE-006** | 0x0305/0x0307 packed 필드 의미 | command cost/target/cooldown/kind 정확 매핑 | P0 | D-009 |
| **RE-007** | CommandOK layout semantic | decoded field 이름 증명, `0x0031/0x0032/0x0033` 실제 사용처 | P0 | F-003 |
| **RE-008** | 메신저 0x0f0e payload | open/accept/close 레이아웃 확정 | P0 | M-003 |
| **RE-009** | `G7UPD040514.exe` 패치 획득/분석 | live-server era 프로토콜/EXE 변화 확인 | P2 | RE-001 |
| **RE-010** | 런타임 키/코덱 흔적 | keySetupWrapper, keyReadHelper, child codec encode entry 후킹 로그 지속 | P0 | F-001 |

---

## Phase 8 — Documentation & Evidence Ledger

| ID | 마일스톤 | 핵심 완료 조건 | 데이터 등급 | 의존 |
|---|---|---|---|---|
| **DOC-001** | `docs/logh7-loop-state.md` P0 큐 관리 | 매 goal 종료 시 P0 항목 `done` 처리 | P0 | - |
| **DOC-002** | 실클 스크린샷/trace 아카이브 | `.omo/ui-explorer/` 세션별 trace.jsonl + shots + probe 결과 보존 | P0 | - |
| **DOC-003** | EXE SHA 복구 검증 | 모든 세션 종료 후 `sha256sum G7MTClient.exe == canonical-playable` | P0 | - |
| **DOC-004** | 문서 cross-reference 갱신 | `docs/logh7-content-catalog.md`, `content/client/message-catalog.json`, `AGENTS.md` 동기화 | P1 | - |
| **DOC-005** | 테스트 커버리지 | `npm run test:server`, `npm run test:tools`, `npx playwright test` 통과 | P0 | - |
| **DOC-006** | Reference 이미지 인덱스 | 134장 스크린샷 → milestone 매핑표, UI 재현 체크리스트 | P1 | R-009 |

---

## 우선순위 큐 (P0만)

1. **S-005** 0x0b01/0x0b07 전략 명령 (G001) — 현재 active
2. **S-006** 함대선택 서브시스템 — G001 하위 블로커
3. **S-007** 명령 메뉴 populate — G001 하위 블로커
4. **S-011** 0x0325 native 756B 레이아웃 — G001 하위 데이터
5. **S-009** HUD mode activation 라우팅 — G001 하위 입력
6. **S-010** StrategySequence case0 진입 — G001 하위 상태
7. **F-003** CommandOK 응답 스키마 — 핸드셰이크 후행
8. **S-004** 함급 마스터 연결 — 월드 UI 풍부화
9. **M-001** 그리드 채팅 — 소셜 기반
10. **RE-002** 정적 RE 커버리지 매트릭스 — 전체 가시성

---

## G001 세부 사이클 (확장)

현재 G001은 **S-005**를 달성하는 것이 목표. 2026-06-23 사이클 3까지의 상태:

- ✅ `0x0b07` 서버 권위 푸시 관측 (`.omo/ui-explorer/g001-c002-cycle3-20260623/`)
- ❌ `0x0b01` 클라이언트 송신 미관측
- ❌ 함대선택/명령메뉴 UI 미활성화 (`catGate=0`, `rowCount=0`)
- ✅ EXE SHA 복구 확인

다음 사이클:
- **Cycle 4**: `S-011` 0x0325 native 756B officer 필드 실험 → unit-list populate 시도
- **Cycle 5**: `S-009` HUD mode activation 라우팅 추적 → `FUN_00501e30(2, …)` enqueue 조건 RE
- **Cycle 6**: `S-010` StrategySequence case0 진입 조건 실험 → task seed + event-9 enqueue
- **Cycle 7**: `S-006` unit-list 패널 0x67 생성 또는 직접 구동 → catGate 0→2
- **Cycle 8**: `S-007` 명령 메뉴 rowCount>0 → row 클릭 → `0x0b01` 송신 검증

---

## 변경 이력

- 2026-06-23: 초기 작성. 8 goal → 8 Phase / 80+ milestone 확장. `.omo/reference` 134장 스크린샷, RE 문서, 서버/툴 문서 종합.
