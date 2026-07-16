# LOGH VII Current Requirements

> **현재 권위 (2026-07-15):** 시작 문서는 이 문서, `docs/logh7-architecture-operations-current.md`, `.omo/plans/logh7-execution-plan-current.md` 세 개다. 정상 플레이어 경로는 설치 폴더의 수정된 `g7mtclient.exe` 직접 실행이며, 보조 런처·`ui_explorer`·overlay는 정상 경로가 아니다. 클라이언트 수정 도구의 언어는 Python을 포함해 제한하지 않는다. 실제 설치 `g7mtclient.exe`를 직접 in-place 패치할 때도 원본 백업, 적용 전 해시 검증, 실패 시 rollback 경로를 반드시 남긴다. 아래 날짜별 G0xx 항목은 결정 근거를 보존한 역사 기록이며, 현재 실행 상태나 로드맵 권위를 갖지 않는다.

2026-07-14 run9 직접 클라이언트 기준선: `tools/live/prepare_direct_client.mjs`가 해시 검증 후 선택한 설치 트리의 `exe/g7mtclient.exe` 최종 SHA256은 `825635783a9fb663ae3b9a2ecf8d4b74df648322256c57ee32f6426c42a23f22`다. `postlogin` 패치 59개는 `lobby-res` 8개, layout 13개, `charsel` 38개이며, 로그인 화면을 늘리던 `login-native-layout` 33개는 제거했다. 로그인 내부 화면은 원래 644×484를 유지하고 로그인 후에는 1920×1080으로 전환한다(창 캡처 1924×1084). 창 제목과 메뉴 한글은 유지하되 CP932 자산 때문에 `CreateFontA` charset `0x81`은 모지바케를 일으켜 `0x80`으로 복귀했다.

라이브 증거 `.omo/live-qa/m3-two-client-persistence-1080p-cp932-20260714-run9/`는 원본 EXE 직접 실행 5회, 두 계정 동시 월드 진입, A의 `0x0b01` 이동 요청에 대한 서버 `0x0b07` 브로드캐스트와 B 적용, cell `2587`의 재로그인·서버 재시작 후 유지, 프로세스와 포트 `47900` 정리를 기록한다. `results.json`의 8개 게이트가 모두 `pass: true`이므로 M3는 완료다.

진척률은 마일스톤 기준 M0.5/M1/M2/M3 `4/8 = 50%`다. 다만 M4~M7에 서버 권위 도메인, 전술·전투, 한글화, 운영이 집중되어 있어 전체 작업량은 보수적으로 `30~40%`, 대표값 `35%`로 본다. 전체 한글화에는 UTF-8 번역 원본, 한글 입력 경로, 그리고 M6 spike에서 선택할 CP949 자산 변환 또는 SJIS tunneling/GDI proxy 경로가 필요하다. 1080p 네이티브 레이아웃은 입증됐지만 고해상도 텍스처·업스케일을 포함한 전체 리마스터는 미완료다.

남은 서버 핵심 범위는 auth/session/audit, character/presence, galaxy/planet/base 권위 상태, fleet/location/visibility, facilities/ownership, 81개 command catalog(팩토리 확인 2개·미해결 79개)와 CP/timers/jobs, economy/warehouse/production, tactical initial state, battle formulas/results, chat/social/notice/logs/backups다. 원본 클라이언트는 UI와 의도 전송을 담당하고 서버는 validation, domain authority, persistence, broadcast를 담당한다. run9 JSON store는 QA harness일 뿐 production ORM/SQLite가 아니며 PostgreSQL skeleton도 아직 연결되지 않았다.

2026-07-15 M4 첫 production slice: `createPlayableRuntime`가 `EnterWorld`와 `MoveGrid`를 동기 CQRS/UoW로 production SQLite runtime에 주입한다. 성공한 `0x0b01`은 cell과 `GridMoved` event 1건을 같은 트랜잭션으로 영속화한다. 잘못된 account·unit, offline character, 비항법 cell `0`은 DB cell, in-memory session cell, domain event 수, session move event와 응답을 모두 바꾸지 않는다. application `MoveGrid`는 navigability policy가 없으면 fail-closed다.

현재 항법 정책은 `logh7-galaxy-placement.mjs`가 실제 `0x0315`로 내보내는 `spaceCells ∪ systemCells`와 정확히 같은 집합이다. 이는 클라이언트 표시와 서버 권위를 맞춘 것일 뿐 canonical promotion이 아니다. `galaxy-passable-cells.json`과 galaxy trust 데이터는 교차 출처 확인 전까지 provisional/blocked다.

네이티브 라이브 증거 `.omo/live-qa/m4-cqrs-two-client-20260715-run3/results.json`은 SHA256 `825635783a9fb663ae3b9a2ecf8d4b74df648322256c57ee32f6426c42a23f22`인 원본 EXE 직접 실행에서 8/8을 통과했다. `0x0b01 → 0x0b07` cell `2587`, B notification delta `1`/lookup miss `0`, 재로그인·서버 재시작 유지와 정리를 확인했다. 로그인은 644×484, 로그인 후 게임은 1920×1080(외곽 캡처 1924×1084)이다. harness 수정은 confirm `(1018,656)`을 보이는 중심 `(1018,642)`로 옮긴 것뿐이며, run1/run2는 `0x0b01`이 없었던 실패 control이다. 이 run3도 JSON store를 썼으므로 production SQLite CQRS 증거는 아니다.

fresh 검증은 movement/galaxy/world/server targeted `97/97`, 전체 server `458 total / 456 pass / 0 fail / 2 pre-existing conditional skips`, Python live harness `16/16`, changed JS LSP error `0`, diff-check clean이다. 수동 runtime probe는 `grid cell not navigable`, 응답 없음, DB/session cell `2588`, `GridMoved 0`, session move `0`을 확인했다. M4는 여전히 부분 상태다. PCP/MCP ledger·CP charge·timers/jobs·실제 command outcome이 없고 `0x0327` 미확정 stock은 zero-fill이며 disconnect의 `online=false` 영속화도 남았다. 동기 SQLite bridge는 PostgreSQL 전에 async-capable하게 바꿔야 한다. 다음은 M4 command authority/ledger/timer/job과 galaxy/fleet/facility/economy canon/data, 이어 M5, M6 전체 한글화, M7 운영·리마스터 순이다.

2026-07-04 G070 Unity 클라이언트 완전 삭제: 사용자가 "완전 삭제"를 명시적으로 선택함에 따라 `client-unity/` 작업트리를 제거했다. 삭제 직전 상태(스테이징된 2026-07-03/04 메달 리마스터 아트 포함)는 커밋 `dbf3b43`에 전량 보존했고, 커밋 `ca24dd3`(9226 files deleted)로 작업트리에서 제거했다. G069의 "RE 완료 후 Unity 재이식" 장기 목표는 유지되며, 재이식 시 `client-unity/`를 git 히스토리에서 복원하는 것부터 시작한다. 이 문서의 이후 G0xx Unity 관련 항목(픽셀 패러티, 로비/로그인 재현, StreamingAssets export 등)은 모두 과거 기록이며 현재 작업트리에서 재현할 수 없다.

2026-07-04 G069 방향 전환(사용자 명시적 재오픈): Unity 경로를 잠정 중단하고 **레거시 클라이언트(`G7MTClient.exe`) 직접 수정을 현재 주 개발 경로로 재개**한다. 계기: G066-G068에서 원본 화면 픽셀 패러티(title.tga/bg005.jpg 재현)+실서버 로그인/로비 E2E까지 시연했음에도 사용자가 "실게임과 다름/EXE가 맞지도 않음"으로 판정. 장기 계획은 유지: RE(리버스엔지니어링)가 전부 끝나면 Unity로 재이식한다. 이 문서의 "2026-07-03 Objective Reorientation"(데이터/스펙 마이닝+게임로직 재구현 우선, 레거시 클라 수정 배제)은 이 전환으로 잠정 대체된다 — 데이터/스펙 마이닝 산출물(카탈로그/매니페스트)은 계속 유효한 소스지만, 그 소비처가 Unity에서 레거시 클라 직접 패치로 바뀐다. 재개 시 우선 처리해야 할 기지 리스크: C002(마우스클릭→커맨드 미도달, 수개월 RE 미해결), cp932 한글 채팅 인코딩 손상, 단일 EXE 패치의 크래시 취약성.

2026-07-04 G068 로비 원본 재현 1파: 로비 게이트는 원본 spot 배경으로 렌더된다. 배경 근거는 P0(EXE 0x3721bc 하드코딩 기본 `../data/image/spot/bg005.jpg`, 룸 전환 포맷 문자열 `bg%03d.jpg` 0x372204), 시설 패널 구조/장소명은 P1(toshichan `80952a_lobby.jpg` 宇宙港 警戒ロビー: 旗艦桟橋/航路管理センター). `export:original-ui-images`가 JPG byte-copy 모드(provenance `original-byte-copy(R0)`)로 bg005를 StreamingAssets에 수출(fileCount 17). 로비 진입 시 `GET /api/lobby`(Bearer)로 실서버 캐릭터 슬롯을 표시하며 가짜 슬롯 데이터는 금지. 초상화 배치/직무카드/캐릭터 HUD/룸 매핑(bg%03d 인덱스↔시설)은 후속 슬라이스(풀 레퍼런스: `docs/reference/ui-catalog/cdn.gamemeca.com/b739e9_uu3.jpg`). 증거: `.omo/ulw-loop/evidence/g068-player-lobby-original-bg-20260704.png`(실로그인→로비 E2E), 전체 회귀 195/195.

2026-07-04 G067 실서버 로그인 + 부트 스플래시 오라클 반증: (1) Unity 원본 로그인 화면의 ログイン 버튼은 이제 실세션 서버(`serve:session`, 기본 `http://127.0.0.1:8047`, `LOGH7_SESSION_BASE` 환경변수로 변경)에 POST `/api/login`을 수행하고 ok+token일 때만 로비 게이트로 전진한다. 상태 문자열은 EXE 0x36bea0 로그인 상태 테이블(P0: `now connecting. please wait...`, `ログインサーバーへの接続に失敗`, `ログインサーバー認証エラー`) 그대로 사용한다. (2) 오라클 반증: 설치본 원본 클라이언트는 부팅 시 bothtec/microvision/multiterm 로고 스플래시를 표시하지 않고 곧바로 타이틀/로그인 화면으로 간다(EXE에 로고 텍스처 슬롯 [0]=title_japan,[1]=bothtec,[2]=multiterm,[3]=microvision은 존재하나 이 빌드 기동 경로에서 미표시, `FUN_0051bfa0`/`FUN_0051ca30`) — 부트 로고 시퀀스 슬라이스는 원본-따라가기 원칙에 따라 보류. (3) 오라클 확인: 원본 클라도 title.tga 배경 위에 런타임으로 텍스트/위젯을 그린다(우리 오버레이 방식과 동일 구조). 증거: `.omo/ulw-loop/evidence/g067-oracle-splash-20260704/`(12프레임), `g067-player-login-typed-20260704.png`, `g067-player-login-success-20260704.png`(실계정 parity1 로그인→`session=parity1 (token ok)`+Lobby 게이트), 전체 회귀 194/194.

2026-07-04 G066 원본 로그인 화면 픽셀 패러티 요구사항: Unity 클라이언트의 로그인 이전 게이트는 원본 `title.tga`(P0, 640x480)를 디코드한 배경 위에 원본 실측 좌표의 ID/パスワード 입력과 ログイン/オフィシャルweb/終了 버튼을 그대로 재현해야 한다. 창 캡션 `銀河英雄伝説Ⅶ`(EXE 0x3c470a)과 메뉴바 `ﾌｧｲﾙ(F)/ﾍﾙﾌﾟ(H)`(EXE 메뉴 리소스 0x3c359e), 하단 저작권 각인 `(C)2004 田中芳樹・TW (C)2004 BOTHTEC (C)2004 MiCROViSiON INC.`(title.tga)을 포함한다. `npm --prefix server run export:original-ui-images`가 TGA→PNG 디코드와 `logh7-original-ui-image-manifest.json`(provenance `original-decoded(R0-derived)`, 승격 차단 유지)을 생성한다. StreamingAssets export fileCount는 16. 계약 테스트는 `tests/server/logh7-unity-client-surface.test.mjs`가 P0 문자열로 잠근다. 개발 패널 표면은 로그인 이후 게이트로 밀려났고, 이후 씬(로비/전략맵 등)도 같은 원본-화면-재현 방식으로 순차 전환해야 한다. 증거: `.omo/ulw-loop/evidence/g066-player-legacy-login-20260704.png`(실플레이어 캡처), `g066-legacy-login-unity-build-20260704.log`(Build Success), 전체 서버 회귀 193/193.

2026-07-04 G048 Unity scene-panel manifest slice: selected-surface panel text moved out of C# hardcoding into `client-unity/Assets/StreamingAssets/logh7/logh7-unity-scene-surface-panels.json`; Unity runtime loads it through `LoadSurfacePanelManifest`, StreamingAssets export now includes 15 files, and player evidence `.omo/ulw-loop/evidence/g048-scene-panel-manifest-player-battle-20260704.png` shows `ui scene panels: surfaces=10 | promotion blocked | EXE oracle-only`.

2026-07-04 Unity scene-panel slice: Unity Windows player renders distinct selected-surface panels for all 10 `logh7-ui-scene-catalog.json` surfaces after normal session gates. Evidence: `.omo/ulw-loop/evidence/g047-scene-panel-surfaces-compact-20260704/contact-sheet.png`, `.omo/ulw-loop/evidence/g047-scene-panel-surfaces-compact-20260704/09-battle.png`, and `g047-scene-panel-compact-unity-windows-build-20260704.log`. This is still a development surface, not final 2026 UI, and keeps original EXE oracle-only plus `blocked-until-cross-source-confirmed` canonical boundaries.

2026-07-04 G065 Unity command client: `Logh7CommandClient` loads the command catalog only with a granted strategic-map flow (`strategic-map-not-granted` otherwise), parses fixed/unresolved CP kinds, and filters by category for the command-window surface. EditMode 25/25 (`.omo/ulw-loop/evidence/g065-editmode-commands-20260704.xml`).

2026-07-04 G064 command catalog serving: token-gated `GET /api/commands` serves the evidence-backed 81-command strategy catalog (7 categories, fixed CP values like ワープ航行=40, variable costs kept `variable-cost-unresolved`) directly from `logh7-strategy-command-catalog.json`; 503 fail-closed if the catalog is missing. Tests 2/2, full regression 182/182. The Unity command-window client consumes this next; duty-card availability filtering waits for the rank/duty assignment slice.

2026-07-04 G063 strategic-map session wiring: `Logh7WorldSessionContext` carries the server-approved world session across scenes; `Logh7WorldClient` sets it only on approved entry, and the galaxy prototype scene status line shows `world-session <faction>:<characterId>` versus `no world-session (validation mode)`. EditMode 23/23; server regression 180/180 (client-surface guard unaffected).

2026-07-04 G062 character persistence: the character store persists to a JSON file (`--characters-db`, default `.omo/work/logh7-characters.json`) with atomic tmp+rename writes; slots survive server restarts, and a corrupt persist file fails startup closed instead of silently dropping characters. Tests 3/3, full regression 180/180.

2026-07-04 G060/G061 world entry + full-chain E2E: server `POST /api/world/enter` (token + owned-character check, 422 `character-not-owned`) returns a world session carrying `galaxyStatus=suspect-cross-check-required`, `galaxySource=streaming-assets:generated/galaxy.json`, and the real system count; Unity `Logh7WorldClient` grants character-authority→world-session→strategic-map. Capstone: full-chain PlayMode E2E passes against the live server — boot→login→character create (real `gem:1` face, unique name)→lobby slot listing→select→world enter→strategic-map grant, all over real HTTP (`.omo/ulw-loop/evidence/g061-playmode-fullchain-20260704.xml`, 3/3 incl. login E2E). Server regression 177/177, Unity EditMode 21/21. The internal playable loop's session skeleton is now proven end to end; remaining for a playable loop: strategic-map scene runtime wiring, fleet/command surfaces, persistence (character store is in-memory).

2026-07-04 G059 Unity character client: `Logh7CharacterClient` creates via the G058 contract, refreshes lobby slots, and selects only among server-listed characters (grant `character-select`; unknown ids and validation failures grant nothing). `Logh7CharacterSlot` model extended with name/faction/faceId display fields. EditMode 18/18 (`.omo/ulw-loop/evidence/g059-editmode-character-20260704.xml`). Session-flow chain boot→login→lobby→character-select now has both server and client contracts test-locked; next: world-entry/strategic-map contract serving suspect-labeled galaxy data.

2026-07-04 G058 character creation contract: server-authoritative character store + `POST /api/characters` (token-gated; 422 with store reason on validation failure) and lobby slot listing. Evidence-backed rules: server serves one faction only (manual p8 `session-offline-rules.json`; `--server-faction empire|alliance`, wrong faction → `faction-not-served`), only decoded G-group player faces are creatable (`548` valid `archive:slot` faces loaded from the real portrait export manifest — gaf 44/gam 134/gef 69/gem 301; O-group and unknown slots → `invalid-face`), duplicate names per account rejected, name length capped. Tests: store 6/6, HTTP 3/3, full regression 175/175, live smoke (real `gem:1` face create → lobby slot). No emperor/placeholder fallback characters; slots start empty.

2026-07-04 G057 lobby contract: server `GET /api/lobby` requires a valid bearer session token (401 otherwise) and returns the account's character slots (empty until the character-create slice); Unity `Logh7LobbyClient` grants `lobby-session` only on ok+login-grant (character-select becomes enterable). Server tests 166/166; Unity EditMode 15/15 (`.omo/ulw-loop/evidence/g057-editmode-lobby2-20260704.xml`). Next: character-create/select contract with server-authoritative slots.

2026-07-04 G056 first live Unity↔server round trip: PlayMode E2E tests pass 2/2 against a live `serve:session` on 127.0.0.1:8047 — real UnityWebRequest boot summary + scrypt login issuing a token, wrong password rejected 401, responses replayed through `Logh7LoginClient` granting `login-session` (evidence `.omo/ulw-loop/evidence/g056-playmode-e2e2-20260704.xml`). `com.unity.modules.unitywebrequest` added to the Unity manifest (built-in modules must be listed explicitly in this slimmed manifest). E2E harness: generate `.omo/work/logh7-dev-accounts.json` fixture, start `serve:session`, run `-testPlatform PlayMode`, stop server.

2026-07-04 G055 Unity login client: `Logh7LoginClient` consumes the G054 HTTP contract with an injectable transport; success grants `login-session` in the session flow (lobby becomes enterable), failure and boot-skip are rejected. EditMode tests 12/12 (`.omo/ulw-loop/evidence/g055-editmode-login-20260704.xml`). Next: PlayMode E2E against a live localhost `serve:session`, then lobby contract.

2026-07-04 G054 session-server runtime reboot: the rebuilt server has its first runtime surface for the Unity client — `npm --prefix server run serve:session -- --accounts <json> [--port 8047]` serves `GET /api/boot` (export summary + promotion-blocked state) and `POST /api/login` (JSON credentials → session token). Design decision (brainstormed alternatives): new minimal HTTP/JSON transport instead of legacy 0x0030/0x7000 wire emulation or restoring the retired TCP server; legacy wire stays meaning-evidence (login→session concepts), Unity is the product client. Security posture: scrypt+salt with constant-time compare, unknown-account cost equalization, single `invalid-credentials` reason (no enumeration), crypto-random 48-hex tokens, one-session-per-account takeover, explicit account fixture file (no anonymous/registration endpoint), 4KB payload cap, binds 127.0.0.1. Known gaps recorded for later slices: session expiry, login rate-limit/lockout, TLS for non-localhost. Tests 7/7 new (service 5 + HTTP round-trip 2), full regression 164/164, live CLI smoke verified (boot fileCount=14, real token issued).

2026-07-04 G053 Unity boot-scene logic: `Logh7BootCheck` verifies every StreamingAssets export-manifest file on disk and fails closed on a missing manifest; `Logh7BootRuntime` grants the `boot-launcher` session-flow step and points to `login` only when integrity passes. EditMode tests now 9/9 (`.omo/ulw-loop/evidence/g053-editmode-boot-20260704.xml`). Next scene slice: login surface consuming `logh7-ui-scene-catalog.json` login evidence (record `0x7000`), then scene wiring/PlayMode capture.

2026-07-04 G052 manual P2 gap mining: the remaining four P2 gaps are mined into `server/content/manual/strategy-screen-layout.json` (main-view scroll/zoom/grid 100-light-year rule; unnamed screen elements kept `term:null` + `_uncertain` instead of invented names), `system-menu-chat.json` (system window 3 items, chat window two-row layout and same-spot rule), `tactical-input-bindings.json` (Ctrl+click, right-click scroll/camera/rotate, wheel zoom, `[F・4]` view toggle, Space camera-follow, radar semantics, command-panel enable gating), and `tactical-chat-routing.json` (3-channel 全体/艦隊/同陣営 routing). The manual completeness ledger status is now `manual-read-complete-all-gaps-mined` — the 매뉴얼 완독 requirement is closed with all identified gaps machine-readable. Full server regression 157/157.

2026-07-04 G051 manual P1 gap mining: all four P1 gaps are now machine-readable catalogs under `server/content/manual/`: `session-offline-rules.json` (server-per-faction exclusivity, offline persistence principle, logout-location rules incl. docked-flagship safety, undock-on-base-fall possibility, AI-proxy 未実装 note), `strategy-ui-panels.json` (galaxy-map area cursor, info view, duty-card tab command/proposal paths, captain-card daily merit 400 flagged `_uncertain` from screenshot, seven info windows), `tactical-input-selection.json` (left-click select semantics, flagship double-click command-range batch select, rubber-band select, tactical screen layout), `flagship-energy-allocation.json` (six-channel energy allocation BEAM/GUN/SHIELD/ENGINE/WARP/SENSOR; WARP-max retreat requirement; total amount value not stated in manual). First rule consumer: `server/src/server/logh7-flagship-energy-rules.mjs` gates warp-out retreat on WARP-max allocation (tests 3/3, full regression 157/157). Manual completeness ledger marks these pages `mined-2026-07-04`; remaining gaps are P2 pages 19/21/23/25.

2026-07-04 G048 manual completeness requirement: the 101-page manual is now fully read. `server/content/generated/logh7-manual-completeness-ledger.json` maps all 101 pages: 75 pages covered by the 17 existing manual catalogs' `_source` claims, and the remaining 26 pages were read page-by-page (image + text layer) against those catalogs. Confirmed mining gaps to close before tactical/session logic: P1 pages `8` (server-per-faction exclusivity, offline persistence/logout rules), `20` (captain-card daily merit 400, seven info windows, card-tab command UI paths), `22` (tactical unit-selection input semantics incl. command-range double-click), `24` (flagship energy allocation BEAM/GUN/SHIELD/ENGINE/WARP/SENSOR; WARP-max is a retreat requirement missing from combat-rules); P2 pages `19/21/23/25` (strategy screen layout, system/chat windows, tactical input bindings, tactical chat 3-channel routing). The CD 69-page manual edition has no star-chart page and no additional unique data pages found so far.

2026-07-04 G049 Unity session-flow requirement: `client-unity/Assets/Scripts/Logh7SessionFlow.cs` enforces the runtime manifest `sessionFlow` gates (boot→login→lobby→character-select→character-authority→world-session→strategic-map) with requires/grants; skipping is rejected. EditMode tests pass 7/7 (`.omo/ulw-loop/evidence/g049-editmode-sessionflow2-20260704.xml`). Assets/Scripts now compiles as the `Logh7.Runtime` assembly so EditMode tests can reference product types.

2026-07-04 G050 original-asset import wave 1: Unity now holds real original resources, not only manifests — all `1061` decoded TCF portraits exported to `client-unity/Assets/ArtSource/original/portraits/` (`npm --prefix server run export:tcf-portraits -- --all`, manifest `server/content/generated/logh7-portrait-full-export-manifest.json` with per-file sha1) and all `79` original ship thumbnail TGAs copied byte-for-byte to `client-unity/Assets/ArtSource/original/ship-thumbnails/` (manifest `logh7-ship-thumbnail-import-manifest.json`, R0 provenance). Remaining import families (UI textures, spot backgrounds, MDX geometry, sound) import on demand as their consuming Unity scene slice starts; original roots stay read-only fallback.

2026-07-04 G047 galaxy manual-axis quantitative crosscheck: `npm --prefix server run crosscheck:galaxy-manual` builds `server/content/generated/logh7-galaxy-manual-crosscheck.json` from a fresh independent star-chart extraction (`server/content/extracted/logh7-manual-starchart-detection.json`, 101-page manual PDF sha `ff9b7b63…` p101 at 300dpi; June pixel constants not reused). Result: chart labels `80` (alliance 40 / empire 39 / fezzan 1), star dots `76`, exact cell matches `68`, near misses `6`, anomalous dots `2`, faction mismatches `0`, grid pitch independently reproduced. Five galaxy systems (`アンウレガルラ`, `ケープホーン`, `コブラヴェルデ`, `ニーベルング`, `モンサルヴァール`) are absent from the chart and need another evidence axis. The manual axis now quantitatively corroborates current galaxy positions, but promotion stays `blocked-until-cross-source-confirmed` (CD/RE/live axes outstanding). CD 69-page manual contains no star-chart page; the chart exists only in the 101-page edition (P1 provenance).

2026-07-04 G045 Unity product-surface unblock: Unity 6000.5.2f1 Editor batchmode is proven working (licensing repaired, project compiles clean, EditMode manifest-loader tests 4/4, validation scene screenshot captured). Unity manual QA/build validation is no longer a standing blocker; requirements deferred on the Licensing IPC blocker are executable again. Galaxy/system data shown in the validation scene remains suspect and blocked from canonical promotion.

2026-07-03 CD-first revival rule: verified Archive BIN/CUE under `artifacts/logh7-cd/` source authority re-extraction. Existing `server/content`, `RE/content`, installed data, generated catalogs, star/system/planet positions, passable cells, and previous analysis are verification inputs until CD/manual/Ghidra/live/wire cross-check promotes them. Hidden data search in scope: raw sectors, ISO slack, InstallShield internals, PE resources, MsgDat/DAT/MDX/TCF/MDS/VIX, OCR/manual tables, strings, and every server-servable record family.

Capability harness: all LOGH VII work units must also apply `.omo/rules/logh7-capability-harness.md`. LazyCodex/OMO, Superpowers, gstack, LOGH7 domain skills, CodeGraph/LSP/Git Bash/ast-grep, and Compound Engineering capture are normal agent-work requirements; diagnostic-only tools remain outside normal player/operator runtime.

2026-07-04 G034 remaster provenance quality lock: Empire ship data must use original extracted game assets, not generated placeholders. Current lock preserves `.omo/work/logh7-installed/data/model/Ship/GE` as the Imperial MDX source root and `server/content/generated/logh7-empire-ship-reference-manifest.json` exposes six original thumbnail source hashes including `.omo/work/logh7-installed/data/image/Thumbnail/Ship/iu008.tga` SHA256 `d92982521bf4109fd770f436c366254949a555d046332d4fd23cd00ca3144106`. The Imperial double-eagle crest reference remains `client-unity/Assets/ArtSource/reference/logh7-imperial-double-eagle-reference.jpg` SHA256 `822276b190c3e83729de39c14e4e9fc06c2eb8b39a56225bdcbe16f147134e9e`; crest mask outputs must stay visible in remaster provenance as gold/silver/white output assets. Evidence: `.omo/ulw-loop/evidence/g034-crest-ship-provenance-proof-20260704.log`, `.omo/ulw-loop/evidence/g034-focused-after-provenance-export-20260704.log`, `.omo/ulw-loop/evidence/g034-server-tests-20260704.log`.

2026-07-04 G044 Unity manifest consumption lock: Unity runtime must not become a detached mock. `client-unity/Assets/Scripts/Logh7GalaxyPrototypeRuntime.cs` now reads `logh7-unity-streamingassets-export.json` and displays whether required StreamingAssets manifests are linked: source pack, runtime manifest, remaster provenance, asset-source-truth, and UI/remaster/gameplay boundary. `server/tests/server/logh7-unity-client-surface.test.mjs` parses the actual export JSON and verifies these manifest names are both referenced by the Unity script and exported. Evidence: `.omo/ulw-loop/evidence/g044-unity-manifest-consumption-focused-20260704.log`, `.omo/ulw-loop/evidence/g044-unity-manifest-consumption-proof-20260704.log`, `.omo/ulw-loop/evidence/g044-server-tests-20260704.log`.

2026-07-04 G039 archive media receipt: Original Archive BIN/CUE are present and hash-verified. `artifacts/logh7-cd/Logh7.bin` size `229070688`, MD5 `bf87c6a8cb068f05625737377a07b09d`, SHA1 `80e261e9d84c81bca622c99d9cbdc47a2154c1a8`; `Logh7.cue` size `71`, MD5 `878418e704a913f7baac67b38b10e680`, SHA1 `9bff4ea17ca6ff7b088440bd7f8a5206cd2dfe81`. `logh7-cd-media-manifest.json` remains `media.status=verified`, ISO SHA1 `fbd7e3a685802116519ae0d23006c97d383b7737`, ISO root `25` files, InstallShield root `2207` files, and canonical promotion blocked pending family-specific cross-checks. Evidence: `.omo/ulw-loop/evidence/g039-archive-bin-cue-hashes-20260704.log`, `.omo/ulw-loop/evidence/g039-verify-source-20260704.log`, `.omo/ulw-loop/evidence/g039-cd-media-manifest-proof-20260704.log`.

2026-07-04 G040 CD extraction receipt: CD filesystem and InstallShield payloads are extracted with no current blocker. Direct root inventory confirms `.omo/work/logh7-cd-extract/iso-root` present with `25` files and `199030313` bytes, and `.omo/work/logh7-cd-extract/installshield-root` present with `2207` files and `321825815` bytes. `logh7-cd-media-manifest.json` matches these counts and keeps `canonicalPromotion.status=blocked-pending-crosscheck`; extracted files remain source evidence until family-specific cross-checks promote them. Evidence: `.omo/ulw-loop/evidence/g040-cd-extraction-root-compact-20260704.log`, `.omo/ulw-loop/evidence/g040-cd-extraction-manifest-proof-20260704.log`, `.omo/ulw-loop/evidence/g040-focused-cd-media-tests-20260704.log`.

2026-07-04 G041 hidden-data receipt: hidden data candidates have been rescanned, classified, and preserved. `logh7-hidden-data-candidates.json` is `scanned` with `37047` candidates from `4` sources and policy `classification only; candidates not canonical until carved, validated, deduplicated, cross-checked`. `logh7-hidden-data-classification.json` is `classified` with `10253` validated and `26794` invalid candidates. `logh7-hidden-data-watchlist.json` is `reported` with mandatory categories `systemPositions` / `성계 위치` and `originalCharacterRoster` / `오리지널 캐릭터 로스터`; both remain `not-confirmed-new-hidden-*` and must be reported as candidates only. Evidence: `.omo/ulw-loop/evidence/g041-hidden-data-manifest-proof-20260704.log`, `.omo/ulw-loop/evidence/g041-focused-hidden-data-tests-20260704.log`, `.omo/ulw-loop/evidence/g041-server-tests-20260704.log`.

2026-07-04 G042 server-data-family receipt: all server-servable data families are listed with source manifests and suspect confidence status. `logh7-server-servable-data-family.json` now reports `15` families: systems, stars, planets, grids, characters, fleets, ships, commands, operations, tactics, economy, UI text, reports, launcher/community, and formulas. Every family remains `suspect-cross-check-required`; mandatory watch categories remain `systemPositions` / `성계 위치` and `originalCharacterRoster` / `오리지널 캐릭터 로스터`. Evidence: `.omo/ulw-loop/evidence/g042-server-data-family-manifest-proof-20260704.log`, `.omo/ulw-loop/evidence/g042-focused-data-family-tests-20260704.log`, `.omo/ulw-loop/evidence/g042-server-tests-20260704.log`.

2026-07-04 asset clarification: 제국 함선 원천은 `.omo/work/logh7-installed/data/model/Ship/GE/`와 `server/content/extracted/model-ship.json`의 `Ship/GE` MDX 117개다. 제국 문장은 `client-unity/Assets/ArtSource/reference/logh7-imperial-double-eagle-reference.jpg`와 `client-unity/Assets/ArtSource/reference/imperial-crest/`의 쌍두독수리 마스크가 현재 위치다.

2026-07-04 G043 galaxy/system/star/planet trust receipt: current galaxy/system/star/planet data remains non-canonical until cross-source proof. `server/content/generated/logh7-galaxy-trust-crosscheck.json` blocks promotion, reports `systemPositions` immediately, and confirms no new hidden system-position table.

2026-07-04 G035/G036 completion gate receipt: real Unity manual QA remains blocked by Unity Licensing IPC (`Unity-LicenseClient-Peppone Choi` mutex/channel timeout), so diagnostic shortcuts are not promoted as runtime QA. Scope fidelity audit passed across Unity 6000.5.2f1, CD authority, source families, manual/OCR, oracle-only legacy client, suspect-until-cross-check, immediate-report categories, fallback/remaster split, server data families, scene/session flow, no diagnostic runtime, and evidence/docs/dashboard requirements.

2026-07-04 ULW final status: durable loop now has `complete=39`, `pending=0`, `blocked=5`. Remaining blocked items are Unity product-surface tasks gated by Unity Licensing IPC; the revival objective is not complete until that external blocker is repaired and Unity manual QA/build validation can run.

Updated: 2026-07-15

2026-07-03 Unity scene implementation requirement: EXE/Ghidra/MsgDat scene inventory now drives Unity scene production. `npm --prefix server run catalog:scenes` emits `server/content/generated/logh7-scene-inventory.json` with 12 evidence-backed scene groups, and `npm --prefix server run export:unity-scenes` creates 12 Unity placeholder scenes under `client-unity/Assets/Scenes/` plus per-scene evidence notes. Each scene remains placeholder until its UI and logic contract is closed with CD/manual/Ghidra/live/wire evidence.

2026-07-03 record-candidate cross-check requirement: `npm --prefix server run scan:record-candidates` and `npm --prefix server run crosscheck:record-candidates` now separate byte/text record-surface candidates from canonical data. Current CD payload scan checks 62 non-media files, excludes 2150 media files, and emits `server/content/generated/logh7-record-candidate-scan.json` plus `logh7-record-candidate-crosscheck.json`. 2026-07-04 G046 follow-up: both EXE clusters are refuted by Ghidra reference analysis — offset `3732628` is a yacc parser table family (`FUN_005b75f1`, `.data` `0x0078f494`) and offset `2547614` is a monotonic integer array misread as pairs (`.rdata` `0x0066df9e`); evidence `.omo/ulw-loop/evidence/g046-exe-coordinate-cluster-ghidra-analysis-20260704.md`. Result: `G7MTClient.exe` has 2 coordinate-shaped clusters, but both have 0 overlap with current `galaxy.json` coordinate sets (`canonColRow`, `canonGameColRow`, `canonLineMarkerColRow`), so no new system-position table is promoted. `MsgDat/constmsg.dat` has a system-name text cluster matching 5 current system names. Record-surface original-character-roster candidates remain 0.

2026-07-03 hidden-data watchlist requirement: `npm --prefix server run report:hidden-data-watchlist` must report mandatory watch categories for `성계 위치` and `오리지널 캐릭터 로스터` into `server/content/generated/logh7-hidden-data-watchlist.json`. Current run reports both categories as `mustReport`: system-position path/assets `209` candidates over `44` unique paths plus current derived `server/content/galaxy.json` (`85` systems), `galaxy-raster-star-centers.json` (`80` manual/raster centers), `galaxy-passable-cells.json`, and `logh7-null-galaxy-template.json` (`79` star templates, `positionStatus=not-in-mdx`); original-character-roster path/assets `403` candidates over `8` unique Face/portrait paths plus current composite/manual/official roster and face catalogs. Neither category is promoted as newly found hidden canonical data until parsed and cross-checked.

2026-07-03 CD media/hidden-data tool slice: `npm --prefix server run extract:cd-media` now verifies local Archive BIN/CUE, converts MODE2/2352 to `.omo/work/logh7-cd-extract/Logh7_mode2_2048.iso` (`97394` sectors, `199462912` bytes, sha1 `fbd7e3a685802116519ae0d23006c97d383b7737`), records existing ISO filesystem (`25` files) and InstallShield payload (`2207` files), and writes `server/content/generated/logh7-cd-media-manifest.json`. `npm --prefix server run scan:hidden-data` writes `server/content/generated/logh7-hidden-data-candidates.json` from raw BIN, converted ISO, ISO filesystem, and InstallShield payload: `37047` unverified P0 signature candidates (`BMP=14506`, `CD001=6`, `MDX=195`, `MSCF=33`, `MZ=13258`, `OGG=8906`, `PDF=4`, `PE=80`, `PNG=23`, `RIFF=36`). These candidates are classification evidence only; no hidden-data candidate is canonical until carved, validated, deduplicated, and cross-checked.

2026-07-03 operation-state slice: `server/src/server/logh7-operation-state.mjs` starts state-changing gameplay logic by consuming `evaluateOperationPlanDraft`, appending `planned` operation records after explicit gates pass, and returning unchanged state for blocked drafts. CP formula and operation outcomes remain unresolved.

2026-07-03 operations slice: `server/content/manual/operations.json` now generates `server/content/generated/logh7-operation-catalog.json` through `npm --prefix server run catalog:operations`. `server/src/server/logh7-operation-rules.mjs` evaluates explicit manual draft gates only; scheduled-timing CP formula and operation outcome simulation remain unresolved.

2026-07-03 rank-promotion slice: `server/content/manual/ranks-promotion.json` now generates `server/content/generated/logh7-rank-promotion-catalog.json` through `npm --prefix server run catalog:ranks-promotion`. `server/src/server/logh7-rank-promotion-rules.mjs` evaluates explicit manual rank headcount caps only; cap counts remain uncertain and promotion formulas/fame costs are not inferred.

2026-07-03 logistics-allocation slice: `server/content/manual/logistics-economy.json` now generates `server/content/generated/logh7-logistics-allocation-catalog.json` through `npm --prefix server run catalog:logistics-allocation`. `server/src/server/logh7-logistics-allocation-rules.mjs` evaluates manual role/unit allocation authority as allowed, blocked, uncertain, or unknown; OCR-null cells stay uncertain.

2026-07-03 ship-stat slice: `server/content/ship-stats.json` now generates `server/content/generated/logh7-ship-stat-catalog.json` through `npm --prefix server run catalog:ship-stats`. `server/src/server/logh7-ship-stat-rules.mjs` evaluates explicit pool availability only; it preserves missing `beamPower`/`defense`/`maxShield` gaps and does not infer combat formulas.

2026-07-15 current strategic-grid slice: `server/src/server/logh7-galaxy-placement.mjs`의 `isStrategicGridCellNavigable`이 현재 `0x0315`의 `spaceCells ∪ systemCells`를 판정하고, `createPlayableRuntime`가 이를 application handler policy로 주입한다. 이 runtime consistency gate는 `galaxy-passable-cells.json`이나 galaxy trust 데이터의 정본 승격을 뜻하지 않는다.

2026-07-03 command-rule slice: `server/src/server/logh7-strategy-command-rules.mjs` consumes the generated strategy-command catalog. It implements evidence-bound fixed CP payment/insufficient-CP checks and timing specs; `cost.kind=variable` remains unresolved rather than parsing CP ranges from descriptions.

2026-07-03 strategy-command slice: `server/content/manual/strategy-commands.json` now generates `server/content/generated/logh7-strategy-command-catalog.json` through `npm --prefix server run catalog:strategy-commands`. The catalog preserves 81 manual commands, 7 manual categories, 78 fixed CP costs, 3 variable CP costs, and 1 ranged execution-time row without inferring gameplay effects from descriptions.

Cleanup note: pre-bootstrap non-material files are removed from the active path. Preserve original/source material, extracted data, RE evidence, current server catalog/test surfaces, and visual references under `docs/reference/`; route older evidence through `docs/reference/legacy-evidence/` and `docs/logh7-document-index-current.md`.

2026-07-03 cleanup follow-up removed remaining old campaign/progress/session/layout/modding-plan/tooling documents and moved the spot background contact sheet into `docs/reference/logh7-spot-bg-contact-sheet.jpg` as source visual material.

This is the current requirements authority for LOGH VII revival planning. New agents must read this document, `docs/logh7-architecture-operations-current.md`, and `.omo/plans/logh7-execution-plan-current.md` first. Older documents are evidence or historical context unless a current document points to them.

All current policies in this document apply retroactively. Existing plans, docs, patch artifacts, remaster/mod assumptions, and dashboard status that conflict with current policy must be reclassified, migrated, pruned, or marked non-compliant rather than grandfathered.

## 2026-07-03 Objective Reorientation (Historical Unity Policy; Superseded 2026-07-14)

The project objective is now asset/data mining and game-logic reimplementation, not continued legacy-client modification as product path. The original LOGH VII client, manuals, extracted resources, live traces, and current documents are evidence sources and oracle surfaces. Product work must build canonical data/spec pipelines and implement gameplay logic against that evidence.

2026-07-03 cleanup removed pre-bootstrap runtime, patch-builder, direct-client helper, cache, tool-download, obsolete test files, and the non-original `Face.bak-gfpgan-20260626-055248` install-data backup unless source/evidence data. Preserved development authorities: current docs, `server/content`, `RE/content`, `.omo/ghidra`, `.omo/work/logh7-installed/{data,fonts,doc}`, manual extraction material, current catalog source/tests/tools, and `docs/reference/legacy-evidence/` for retained pre-bootstrap evidence docs.

Authoritative original candidate: Internet Archive item `https://archive.org/download/logh-7`. Metadata verified 2026-07-03 from `logh-7_files.xml`: `Logh7.bin` size `229070688`, md5 `bf87c6a8cb068f05625737377a07b09d`, sha1 `80e261e9d84c81bca622c99d9cbdc47a2154c1a8`; `Logh7.cue` size `71`, md5 `878418e704a913f7baac67b38b10e680`, sha1 `9bff4ea17ca6ff7b088440bd7f8a5206cd2dfe81`. Local `artifacts/logh7-cd/` now hash-matches this metadata through `npm --prefix server run extract:cd-media`; keep fresh manifest evidence before promoting derived data.

Source-root registry now lives at `server/content/original-data/logh7-source-roots.json`. `npm --prefix server run inventory:sources` must report every registered evidence root before data/spec promotion. Current CD media evidence is `server/content/generated/logh7-cd-media-manifest.json`; installed-game-data remains comparison input until cross-check, not authority.

`npm --prefix server run catalog:mdx` generates `server/content/generated/logh7-mdx-catalog.json` from preserved installed MDX models. Current evidence: 406 MDX files, 8 categories, `strategy/Null_galaxy.mdx` has 85 header slot-0 nodes and 79 `star_NN_<spectralClass>` node names. This is asset catalog evidence only; star positions remain manual/PDF-derived, not MDX-derived.

`npm --prefix server run catalog:null-galaxy` generates `server/content/generated/logh7-null-galaxy-template.json` from the MDX catalog. Current evidence: `strategy/Null_galaxy.mdx` has 79 star template nodes with spectral distribution A=7, B=5, F=8, G=19, K=17, M=21, O=2 plus six non-star template nodes (`bh_01..03`, `ns_01..03`). `positionStatus` is `not-in-mdx`; do not infer star positions from this fixture.

`npm --prefix server run catalog:tcf` generates `server/content/generated/logh7-face-tcf-catalog.json` from preserved installed Face archives. Current evidence: 7 current TCF archives, archive groups G=4/O=3, all current archive magics `badacabe`, `tcf.hed` has 1355 slots with 669 used and 686 zero.

`npm --prefix server run catalog:tcf-portraits` generates `server/content/generated/logh7-face-portrait-catalog.json` by decoding TCF payloads with 18-byte header, 1024-byte BGRA palette, and bottom-up 8-bit indices. Current evidence: 7 archives, 669 used HED slots, 1061 decoded portrait payloads, archive decoded counts `gaf=44`, `gam=134`, `gef=69`, `gem=301`, `o=92`, `oam=220`, `oem=201`; failures remain categorized, not promoted to decoded portraits.

`npm --prefix server run export:tcf-portraits -- --limit-per-archive 2` exports visual BMP samples to `.omo/ulw-loop/evidence/tcf-portrait-bmp-sample/` plus manifest `.omo/ulw-loop/evidence/tcf-portrait-bmp-sample.json`. Current evidence: 14 BMP samples, representative `oam-slot0001-64x80.bmp` visually inspected as a valid portrait image. This is evidence/export tooling, not a committed full portrait asset dump.

Historical Unity-era rule: legacy live-client validation was diagnostic-only. It is retained for provenance, but the current product path is the modified install-folder `g7mtclient.exe`; `ui_explorer`, Frida, and trace harnesses remain diagnostic helpers.

## North Star

The normal product path runs the modified install-folder `g7mtclient.exe` directly against the authoritative rebuilt server, using canonical LOGH VII data/specs and evidence-backed gameplay logic.

The first internal validation milestone is for the reboot:

1. Registered source roots inventory original/install/manual/evidence locations.
2. MDX, TCF, manual, text, roster, galaxy, ship, economy, command data mined into reproducible catalogs.
3. Every generated artifact records provenance, source path, regeneration command, and confidence/limits.
4. Gameplay rules implemented against canonical fixtures, not speculative packet behavior.
5. The modified legacy client consumes verified assets, resources, and server records through the proven native protocol paths.
6. Original assets remain fallback/reference inputs; remaster/mod outputs remain optional, reversible, provenance-labeled.
7. Direct legacy-client execution is the normal player path; `ui_explorer`, Frida, preseed flags, and trace harnesses remain targeted diagnostics.

## Actors

- **Data/spec developer**: inventories source roots, extracts assets/data/manual rules, records provenance, regenerates catalogs.
- **Gameplay logic developer**: implements rules against canonical fixtures, not speculative packets or legacy shortcut behavior.
- **Modified-client developer**: applies and verifies native client resources/patches while preserving remaster/mod/canonical-source boundaries.
- **Live QA/RE worker**: validates the direct client product path and uses `ui_explorer`, Frida, or traces only for targeted diagnostics.

## Core Scope

### Run and Account

- Server first deployment target: Docker Compose service-style runtime.
- Direct Node commands are development helpers only.
- Player entry starts the modified installation-folder `g7mtclient.exe` directly; server address/config and updates must not require a helper launcher or overlay.
- Web account creation is required. Legacy client handles login only.
- Password storage, sessions, authorization, admin separation, and account persistence are security-critical.

### Character

- Character creation happens only inside the legacy game client.
- Web and launcher must not create gameplay characters.
- Character creation must cover every client creation-screen field and every downstream record field consumed for list, card, HUD, command eligibility, and session/community identity.
- Client-created characters must persist, reappear in client selection, be selectable, and drive world HUD/state.
- Client-created 0x0323 records must serialize parentage `blood`/social-class at `+0xd4`; display name/rank/title/face stay in the same parentage record so profile/HUD consumers do not fall through stale placeholder labels.
- Old forced/preseeded/placeholder character paths must not count as QA evidence.

### World and Strategic Map

- World entry must show readable Korean UI.
- Strategic map must show system/grid/fleet info, grid ship counts, celestial body data, faction ownership, selection, and movement.
- Grid/system selection panel data requires the static base/name master and dynamic base/facility sources together: default world-entry server output must preload populated `0x031d`, `0x031f`, and `0x0321` before `0x0f03`; `0x0337` remains opt-in and cannot be promoted without separate RE/live proof.
- Movement/warp must show visible effects, not silent coordinate changes only.
- Two accounts must be able to enter the same world and show visible awareness/state where the original client expects it.

### Tactical and Battle

- Tactical entry must work from the strategic route.
- Tactical units/panels/objects must render without `NO DATA`.
- Tactical selection, movement, warp/move effects, attack, hit, damage, destruction/explosion, and result display are in first internal validation.
- Every tactical-map command in the phase must actually execute.

### Jobs, Commands, and Proposals

- All jobs, duties, and authority groups must be checked.
- Job and command catalog sources: manual evidence plus actual client EXE/data-observed buttons, cards, hotkeys, and codes.
- Build a full catalog, then phase implementation.
- First command phase includes strategic commands, tactical-entry/basic combat commands, and at least one executable command per known job/duty/authority group.
- A command is not complete until action, state change, and UI/proposal/report result are visible where the client expects it.

### Official 2004 Patch Stack

The pasted 2004 official patch/update text is now a pre-closed-beta baseline, not a later community polish backlog. Use `docs/reference/legacy-evidence/logh7-2004-official-patch-stack.md` as the current reference for this stack.

- Apply official patch content top-to-bottom in chronological order. Later notices amend earlier planned behavior.
- Before closed beta readiness, each item must be implemented, proven already covered, or explicitly deferred with evidence, blocker, and owner.
- Verify older/original notices through Internet Archive Wayback/CDX where possible. Treat attachment-only items as P2 until matching official Japanese pages or another source upgrades them.
- Store Wayback crawls, decoded pages, and normalized extracts under `E:\logh7-revival` only; do not write development caches to `C:`.
- Minimum in-scope areas: command/proposal verbs and mail subjects, character deletion/lottery cooldown/cancel recovery, daily military supplies, evaluation-point merit gains, planetary occupation, strategic warp fuel/CP/range, reconnaissance persistence, tactical retreat/warp-out, tactical entry timeout, damaged-ship display, calendar display, repair/reversal commands, unit performance adjustments, and UI label/display fixes.

### Korean Localization

- First localization scope: launcher, login/lobby, first playable loop screens, command/job/order/proposal text, menus/settings, and error messages.
- Quality target: natural Korean with LOGH-appropriate military/political register.
- Maintain a glossary. Translation is not complete unless the exact screen is live-proven.

### Remastering

Remastering is a first-class product track and part of the closed-beta target, but original assets remain the canonical fallback.

Brainstorming options:

- **A. Pure preservation only**: lowest risk, but does not solve readability and modern display expectations.
- **B. Full replacement art pass**: visually ambitious, but too likely to break canon fidelity and delay playability.
- **C. Layered remaster for closed beta**: recommended. Closed beta uses approved readability/presentation remaster defaults while original assets stay canonical fallback with provenance and rollback.

Requirements:

- Remastering must be applied for closed beta where approved, but remain reversible.
- Original assets remain canonical fallback.
- Remastered assets must carry provenance: original-derived upscale, hand-cleaned, generated placeholder, or community contribution.
- Generated or AI-upscaled assets cannot be described as original/canonical.
- Closed-beta remaster scope includes 2D art, 3D assets, modeling, textures, effects, sound, images, UI, launcher presentation, font/readability, portrait/background/media upscale, cleanup, and polish.
- Remastering may include AI-assisted or tool-assisted upscaling/generation, but every output needs provenance, source reference, reviewer, hash, rollback, and original fallback.
- 3D/modeling work must record source image/page/crop or original asset reference, prompt chain when generated, mesh/texture/scale/orientation QA, and preview evidence before packaging.
- Sound/effect remaster work must record source, edited output, loudness/format constraints, in-client playback or closest tooling preview, and rollback path.
- Remaster QA must compare original vs remastered output and include live-client screenshots when the legacy client consumes the asset.
- Remaster work must start by checking installed project skills. Use `image-upscaling` for original-derived upscale experiments, `game-assets`/`game-3d-assets` only for approved placeholder/prototype experiments, and `game-engine` only for browser rendering/game-loop reference work. These skills never replace original client evidence.

### Modding

Modding is a separate first-class product track from remastering. Public modding is not required for first internal playability validation or closed beta unless a specific internal pack is approved.

Brainstorming options:

- **A. No modding until game works**: simplest, but risks hardcoding data paths that later block mod support.
- **B. Full mod platform early**: too broad before the server/client loop is stable.
- **C. Layered mod foundation**: recommended. Design data/content pack boundaries now, prove one internal mod pack later, and defer public creator tooling until after the playable loop.

Required mod layers:

- **Layer A: data/content packs** for server content, scenario data, balance tables, community replacement data, and provenance-labeled placeholders.
- **Layer B: localization/texture packs** for Korean text, optional remaster assets, UI textures, portraits, and glossary-managed strings.
- **Layer C: client patch packs** for byte-verified EXE patches only when server/data/asset routes cannot solve the behavior.

Modding requirements:

- Mods must be manifest-driven, versioned, reversible, and conflict-checked.
- Mods must not overwrite canonical source assets without backup and restoration path.
- Client patch mods require original-signature checks, target EXE hash recording, rollback, and live QA.
- Server-side mods must pass schema/provenance checks before use.
- Public mod distribution, ratings, and workshop-style UX are later scope.
- Modding work must start by checking installed project skills. Use LOGH7 `extract`, `localize`, `patch`, `re`, `wire` skills before generic game skills; use `multiplayer-game` only as a state-sync/interest-management/server-authority reference, not as approval to adopt RivetKit or replace the legacy protocol. A 2026-07-02 skills.sh search for generic `modding` returned Minecraft/Unity/DayZ-specific low-fit candidates; do not install keyword-only modding skills unless the exact work unit needs that ecosystem.

- DNT/setting-book-derived mods are allowed as optional derivative mod packs, not canonical OVA/original LOGH VII data. Each asset or record must preserve source reference, page/image id, prompt chain, generated/hand-authored status, license/rights note, reviewer, and acceptance screenshots.
- Generative AI 3D model work belongs to remaster/mod prototype scope until proven in client/tooling. Use `pdf`/`smart-ocr` to extract setting-book text/images, then `meshy-3d-generation` or `game-3d-assets` for image/text-to-3D experiments. Store outputs as R3/generated placeholders unless manually validated and explicitly promoted.
- The shared Google Drive setting-book folder is an input pointer only until files are downloaded or access is verified. If Drive redirects to login or permission wall, record the blocker and work from user-provided local PDFs/images instead.

### Native System Extensions

Native system additions are a core extension track, separate from modding and public mod packs. They add new server-authoritative gameplay or political systems to this revival while preserving original LOGH VII behavior as the fallback. They must not be described as original/canonical unless backed by P0/P1 evidence.

Feasibility ruling as of 2026-07-03:

- **Likely feasible:** systems whose state and outcomes can be represented by server data, command execution, notices, proposal/report text, board/community state, faction/session data, or existing client-consumed records.
- **Feasible with RE proof:** systems that need reused or repurposed legacy-client command, panel, lobby notice, or report surfaces. Every involved command code, parser, display consumer, and record size must be pinned by `logh7-re`/`logh7-wire` before implementation.
- **Native-client expansion foundation needed:** systems requiring new in-client windows, widgets, packet families, or control flow need a separate RE/patch foundation before feature work: candidate surface discovery, patch capacity/cave or appended-section strategy, original-signature descriptors, target hash recording, rollback, and real-client live QA.
- **Not acceptable:** speculative packets, auto-responding to unknown frames, or treating diagnostic-only hooks as normal player/operator workflow.

Example extension: Free Planets Alliance Supreme Council chair election. First implementation should define election term, eligibility, candidacy, voting window, vote ledger, tie/break rules, faction/government effects, audit log, and notice/report outputs as native server features. It can surface initially through web/community/admin plus in-game lobby/session notices and existing command/proposal/report routes. A richer in-client election panel belongs to the native-client expansion foundation, not to modding.

### Notices and Community

- Launcher/web notices are pre-login/community information.
- Server notices after login must appear in the in-game lobby/session-selection notice area.
- Web/community first development scope includes logged-in board read/write, character identity display if linked to a game-client-created character, notice management, board hide/delete, and report review/handling.

## Data Provenance

- `P0`: client-extracted/original binary asset evidence.
- `P1`: manual/original document evidence.
- `P2`: reconstructed from reliable secondary evidence.
- `P3`: development placeholder or speculative bridge.

P2/P3 data may support development, but cannot be described as canonical without explicit upgrade evidence.

## Evidence Toolchain

All tactical, binary, packet, data-mining, remaster, and modding claims must name the tool evidence used. The minimum evidence stack is:

- Packet/protocol forensics: Npcap plus Wireshark/tshark PCAP, LOGH7 Lua dissector output, Scapy or project decoder, Kaitai schema when a record family becomes stable.
- Live client state RE: Frida probes, x64dbg breakpoints or memory-map notes, ProcDump/Volatility memory-dump path when runtime state cannot be proven from traces alone.
- Binary RE automation: Ghidra remains authority; capa, FLOSS, YARA, DIE, binwalk/HexWalk outputs classify candidates but do not replace `logh7-re` parser proof.
- Data forensics/mining: Sleuth Kit/Autopsy-class filesystem inspection where image inputs exist, bulk_extractor or substitute byte-stream carving, binwalk/DIE/YARA over EXE, DLL, DAT, TCF, MDX, BMP, TGA, CAB, ISO, BIN, PDF.
- Document/image extraction: `pdf`, `smart-ocr`, Poppler/PyMuPDF/pdfplumber/OpenCV/PaddleOCR. OCR evidence must preserve bbox, confidence, page coordinates, and source crop, not just text.
- Asset/remaster/mod tooling: Blender, Noesis or Assimp-class conversion, texture upscaling, Meshy/generative 3D, and image-upscaling skills. DNT/OVA/sourcebook-derived models require legal/source/similarity/project-originality review before promotion beyond prototype.

Current toolchain artifacts live under `E:\logh7-revival\.omo\analysis\toolchain-20260703` and `E:\logh7-revival\.omo\toolchain`. C drive may be used only for unavoidable tiny user configuration or already-installed programs; development downloads, caches, scans, and generated evidence stay on E drive.

## Security

Every executable plan must have a separate Security section and must invoke gstack `/cso` before a milestone can close.

Minimum CSO scope:

- Native system extensions, voting/election ledgers, government/faction effects, audit logs, and admin overrides.
- Public signup/login password handling.
- Legacy client login/session bridge.
- Account-to-game-character identity linking for board/session surfaces.
- Web board/notice endpoints, posting, moderation, and report handling.
- Lobby/session-selection server notice delivery.
- Account DB and character registry persistence.
- Server trace/log handling and PII leakage.
- Launcher/client patch supply chain.
- Node/Python/Playwright/browser tooling supply chain.
- Codex/Superpowers/OMO/gstack/project-skill supply chain and prompt-injection risk.
- Remaster/mod pack manifests, asset provenance, upload/import path, and client patch pack safety.

- DNT/sourcebook Drive links, local PDFs/images, OCR outputs, Meshy API keys/credits, prompt logs, generated model files, and third-party model imports are security/supply-chain review inputs. Do not commit API keys or copyrighted source scans; store generated models with provenance and hash records.

## Developer Progress Dashboard

`docs/logh7-developer-dashboard.html` is the developer-facing progress dashboard. It is a derived status board, not a fourth startup authority document.

Dashboard requirements:

- It must show where development is happening now, the server-open overall development percentage, remaining development tasks, and the full development task list.
- Overall development percentage means readiness to open a server across release phases, not only current internal-validation slice progress.
- Remastering is included in the closed-beta phase. Expansion and modding remain separate tracks.
- Its progress percentage must expose the phase-weight derivation; do not change the number without changing the backing phase table and evidence.
- It must identify blocker/unknown states explicitly instead of smoothing them into progress.
- Every work unit that changes status, scope, evidence, progress, or remaining tasks must update the dashboard in the same documentation sync pass.
- Development cache/output needed for dashboard evidence, Wayback extraction, OCR, or generated assets must stay under `E:\logh7-revival`; do not write project development caches to `C:`.

## Slice Creation Brainstorming Requirement

Every new or materially changed development slice must begin with brainstorming, not implementation. The brainstorming pass must clarify player/operator outcome, release phase, normal-vs-diagnostic path, acceptance evidence, security risk, remaster/mod/extension boundary, and must-not rules before any implementation plan is written.

Remastering slices must explicitly consider the full closed-beta remaster surface: 2D, 3D, modeling, textures, effects, sound, images, UI, launcher, font/readability, media upscale, provenance, rollback, and original fallback.

## Verification

Milestone evidence requires all three:

- Automated tests for parsers, records, persistence, web/community behavior, command execution, and security-sensitive paths.
- Real-client live QA proving the legacy client consumes server data and shows expected screens/effects.
- Normal run path validation through the directly launched modified `g7mtclient.exe` plus the stable service server.

`ui_explorer` traces, screenshots, and probes are valid diagnostic evidence, but diagnostic harness proof alone is insufficient for readiness.

## Skill and CodeGraph Requirement

Agents must use matching project skills and harness features instead of relying on memory-only reasoning. This includes LOGH7 skills, LazyCodex/OMO commands and hooks, Superpowers, gstack, CodeGraph/LSP/git_bash MCP tools, and installed skills from the active Codex global skill list. Local `.agents/skills` copies were removed during cleanup.

CodeGraph is mandatory for codebase orientation when `.codegraph/` exists and the task involves code location, call paths, impact analysis, or subsystem understanding. Use CodeGraph first, then use `rg`/direct reads as the completeness backstop because CodeGraph can miss dynamic or ambiguous edges.

LazyCodex/OMO requirements:

- Use `init-deep` when the project memory/AGENTS hierarchy needs initialization or refresh.
- Use `ulw-plan` for ambiguous, multi-step, multi-module, or architectural plans.
- Use `start-work` when executing a written Prometheus-style plan.
- Use `ulw-loop` for durable goal execution that must continue until verified.
- Apply Hephaestus/ultrawork discipline to substantial work: Explore -> Plan -> Implement -> Verify -> Manual QA, RED->GREEN proof, cleanup receipt, and no completion from tests alone.
- Use available hooks, model routing, and MCP tools as runtime harness features; if unavailable or host-forbidden, record the exact blocker and fallback.

Superpowers and gstack requirements:

- Superpowers process skills are mandatory when their trigger applies: `using-superpowers`, `brainstorming`, `writing-plans`, `test-driven-development`, `systematic-debugging`, `verification-before-completion`, and review/worktree/subagent skills when host policy permits.
- gstack must be used through its router when a specialized role matches planning, QA, review, CSO/security, docs, design, deploy, learning, retrospective, or ship work.
- Completion must include Compound Engineering capture: plan, work, review, compound, repeat; record the reusable lesson, where it was stored, and the future check that enforces it.

Installed project skills that matter for this work:

- `find-skills`: search and install additional skills from skills.sh when a new capability gap appears.
- `codegraph`: code graph orientation and impact analysis.
- `protocol-reverse-engineering`: protocol and packet analysis.
- `nodejs-backend-patterns`: Node server work.
- `playwright-testing`: web/community and launcher-adjacent browser tests.
- `security-audit`: security review support, alongside mandatory gstack `/cso`.
- `docker-platform-guide`: cross-platform Docker setup.
- `orbstack-best-practices`: macOS Docker/OrbStack development.
- `github-actions-efficiency`: CI workflow review when CI is added or changed.
- `image-upscaling`: optional original-derived remaster image upscale experiments.
- `game-assets`: optional 2D asset prototyping for placeholders or remaster experiments.
- `game-3d-assets`: optional 3D asset prototyping for tooling/prototype work.
- `game-engine`: optional browser game/rendering/game-loop reference for launcher/web prototypes or visualization tooling.
- `multiplayer-game`: optional multiplayer state, tick-loop, interest-management, validation reference; RivetKit-specific guidance is not adopted architecture unless separately approved.

If a matching skill is required but missing in the active environment, the worker must attempt installation at development start:

1. Check project/global installed skills.
2. Use `find-skills` or `npx skills find <need>` to locate a suitable skill.
3. Prefer reputable, relevant, higher-install skills.
4. Run `npx skills add <owner/repo@skill> -y` for project skills unless global install is explicitly needed.
5. If install fails or the skill is unsuitable, record the exact command/output and continue with the best fallback only after documenting the blocker.

## Progress Budget and Blocker Rule

Do the best available investigation, but do not burn tokens repeating the same blocked loop. A worker must pivot or report a blocker when any of these happen:

- The same command/probe fails three times with the same root symptom.
- Two independent investigation paths produce no new evidence.
- A live-client route is blocked by missing external state, unavailable Windows UI, or a tool bootstrap still running.
- The next step would be speculative without new evidence.

The blocker report must state the exact blocker, what was tried, evidence paths, next different strategy, and smallest user/operator input needed if any.

Additional sourcebook/AI-mod skills:

- `pdf`: PDF visual rendering/extraction checks for setting books, manuals, and scanned source material.
- `smart-ocr`: OCR for scanned PDFs/images, including Japanese/Korean/English sourcebook pages; keep confidence and bounding-box evidence when used for data extraction.
- `meshy-3d-generation`: Meshy API 3D generation from text/images; requires API key, credit confirmation, generated output provenance, and post-load orientation/scale QA.

## macOS Development Requirement

Server, web/community, documentation, data extraction that does not require Windows APIs, automated tests, Docker Compose service work, and CI prep must be possible on macOS.

Windows-only scope remains:

- Running the original D3D8 legacy client.
- `ui_explorer` live QA.
- Windows PE patch deployment that needs the installed game.
- PowerShell or registry operations tied to the BOTHTEC installation.

macOS workers should use Docker Desktop or OrbStack for service runtime, keep host scripts POSIX-compatible where feasible, and avoid adding Windows-only assumptions to server/web/test code.

macOS client playability is an investigation track, not current normal-path evidence. Try CrossOver/Wineskin/PortingKit or maintained Wine builds first, then D3D8 translation options such as DXVK/D3D8 or dgVoodoo-style wrappers only in isolated bottles/prefixes. A macOS pass is complete only when launcher start, login, world entry, tactical rendering, Korean text, input, sound, network, and update/patch rollback are observed on real Mac hardware. If Wine/CrossOver cannot run the legacy 32-bit D3D8 client, document exact bottle/prefix settings, logs, and next route instead of treating macOS as supported.

## Documentation Sync Requirement

At the end of every work unit, the worker must update documentation automatically before claiming completion:

- **Add** new requirements, decisions, run commands, evidence links, risks, and doc-index entries introduced by the work.
- **Modify** current requirements, architecture/operations, validation plan steps, and entrypoint rules when behavior or scope changes.
- **Prune** stale guidance, superseded status claims, old accepted paths, and misleading references.
- **Delete or retire** entries that would cause future workers to follow invalid routes, especially forced/preseeded character flows or developer-only harnesses presented as normal operation.

This sync applies to the three current docs, `docs/logh7-document-index-current.md`, `AGENTS.md`, root `CLAUDE.md`, and `.claude/CLAUDE.md` when startup or workflow rules are affected.

## Must Not Do

- Do not restrict client-modification tools by implementation language; Python and other suitable tools are allowed.
- Do not apply a direct in-place patch to the installed `g7mtclient.exe` without an original backup, source-hash guard, and tested rollback path.
- Do not use old forced/preseeded placeholder characters as QA subjects.
- Do not move gameplay character creation into the web app or launcher.
- Do not make server notices web-only.
- Do not put a helper launcher, `ui_explorer`, or overlay in the routine player path.
- The routine player path is direct execution of the modified `g7mtclient.exe` from the installation folder.
- Do not require players/operators to use RE harnesses, preseed flags, PID cleanup scripts, or trace sessions for routine play.
- Do not hide server startup behind many bespoke flags unless packaged into one stable operator action.
- Do not label generated/upscaled assets as canonical originals.
- Do not build public mod distribution before the playable loop and pack safety model are stable.
- Do not close work after implementation review alone. Completion is implementation, verification, review, CSO/security, compound learning capture, and updated docs.

## 2026-07-03 Unity Session Entry Requirement (Historical; Superseded 2026-07-14)

- Unity client normal entry must not jump directly into StrategicMap. The required product flow is Boot/launcher -> LoginSession -> LobbySession -> CharacterSelect/CharacterCreate -> CharacterAuthority -> WorldSession -> StrategicMap.
- The original EXE remains oracle/data-mining only for this flow. `ui_explorer`, direct EXE launch, direct Node commands, preseed flags, and trace tools remain diagnostics and must not become normal player/operator runtime.
- Current implemented contract: `server/src/server/logh7-unity-session-flow.mjs`, `server/content/generated/logh7-scene-inventory.json`, and `client-unity/Assets/StreamingAssets/logh7/logh7-unity-runtime-manifest.json` expose the session gates and Unity state-model names.
- New confirmed hidden data report: no new canonical 성계 위치 table and no confirmed 오리지널 캐릭터 로스터 were promoted in this slice.

## 2026-07-03 Medal And Emblem Remaster Requirements

- The medal list is data-mined canon content, not a generated art list. Current generated evidence is `server/content/generated/logh7-medal-mining-catalog.json`.
- Original medal names must come from `server/content/client/msgdat.json` / `constmsg.dat` ids `767..818`; Korean localized names must stay tied to `server/content/extracted/dat-tables.json` ids `767..818`.
- Original medal images exist as `.omo/work/logh7-installed/data/image/Medal/m_f001..m_f015` (`png` and `tga`, 80x80). Do not generate replacement Empire or Alliance medal images while this original pool exists; use these as remaster/upscale bases.
- The exact 52-medal to 15-icon runtime mapping is not yet final canon; `asset_hint` remains hint-only until static RE or live UI proves the consumer mapping.
- The Imperial double-eagle crest must match `client-unity/Assets/ArtSource/reference/logh7-imperial-double-eagle-reference.jpg` exactly in silhouette and internal structure. Generated or simplified substitutes are invalid.

## 2026-07-04 Medal Production Split

- `server/content/generated/logh7-medal-art-brief.json` is the current production brief for medal art.
- Alliance medals: upscale/remaster the existing 15 original `m_f001..m_f015` icons first. Only create similar new variants when the UI requires distinct Alliance medals beyond those 15 source icons; those variants must use the supplied Alliance flag pentagon emblem from `client-unity/Assets/ArtSource/reference/logh7-alliance-flag-pentagon-reference.png`.
- Empire medals: create new art from the 26 original Empire medal names, not from a generic imperial style sheet. Any crest-bearing medal must use the exact supplied Imperial double-eagle reference. Any ship-bearing medal must use original Empire ship data: `server/content/extracted/model-ship.json`, `.omo/work/logh7-installed/data/model/Ship/GE/`, and decoded `Thumbnail/Ship` references. Thumbnail reliefs are proof-only; final large ship motifs require `Ship/GE` MDX render/extract.
- Korean name list and production order live in `docs/reference/remaster-art/logh7-medal-korean-list-and-production-2026-07-04.md`.
## 2026-07-04 Medal Art QA Corrections

- 제국 문장은 `client-unity/Assets/ArtSource/reference/logh7-imperial-double-eagle-reference.jpg`와 `client-unity/Assets/ArtSource/reference/imperial-crest/`의 쌍두독수리 마스크가 현재 기준 위치다. 제국 문장·훈장·UI 장식은 이 계열을 원천으로 삼고 축약/대체 생성 문장을 쓰지 않는다.
- 제국 함선 모티프는 원본 `Ship/GE` MDX 117개, 대응 텍스처, 디코딩된 함선 썸네일을 데이터 원천으로 삼는다. 훈장·UI·전투 연출에서 임의 실루엣을 만들지 말고 원본 함선 데이터를 렌더/리마스터한다.

- Direct Real-ESRGAN upscale of 80x80 medal icons is rejected as production quality; failed outputs are evidence only under `.omo/work/rejected-art/alliance-medals-ai-realesrgan-20260704-qa-fail/`.
- Alliance founder/high-honor medals `793..795` now use user-supplied Ale Heinessen, Nguyen Kim Hoa, and Alliance flag references as generated bas-relief concepts, packaged under `client-unity/Assets/ArtSource/remaster/alliance-foundation-medals-1024/` with manifest `server/content/generated/logh7-alliance-foundation-medal-redraw-manifest.json`.
- Imperial medals must use the exact supplied crest mask derived from `client-unity/Assets/ArtSource/reference/logh7-imperial-double-eagle-reference.jpg`; mask manifest is `server/content/generated/logh7-imperial-crest-mask-manifest.json`. Generated crest approximations remain invalid.
- Imperial medals with ships must use original Empire ship data (`.omo/work/logh7-installed/data/model/Ship/GE/`, `server/content/extracted/model-ship.json`, and decoded original `Thumbnail/Ship` candidates) rather than invented ship silhouettes. Current corrected prototypes are `767` exact-crest and `779` original-ship-composited under `client-unity/Assets/ArtSource/remaster/imperial-medal-prototypes-1024/`; full 26-medal Empire production remains open.
- 2026-07-04 source lock: `server/content/generated/logh7-imperial-medal-source-lock-manifest.json` records the visible crest mask, original `iu008` Empire thumbnail proof, `121` Empire model records, `120` `Ship/GE` file records, `117` `Ship/GE` MDX records, `3` `Ship/GE` MDS records, and `39` MDX render-queue hulls. The corrected QA samples are `client-unity/Assets/ArtSource/remaster/imperial-medal-prototypes-1024/779-expeditionary-campaign-source-locked-crest-ship-v2.png` and `client-unity/Assets/ArtSource/remaster/imperial-medal-prototypes-1024/767-grand-double-eagle-order-source-locked-crest-v2.png`; ship-medal concepts must use original Empire ship data and keep the exact double-eagle crest visibly legible. They remain proof-only until MDX-derived ship art replaces the low-resolution thumbnail motif.
- 2026-07-04 render-source correction: Imperial medal ship motifs must use original Empire `Ship/GE` MDX data, not generated or thumbnail-only hull silhouettes. First locked target is `data/model/Ship/GE/EH001.mdx` in `server/content/generated/logh7-mdx-render-source-manifest.json`: SHA256 `31bc4de737d411c9c78192f63709207d5a9a58d44177bb8df78fd0a993acfbb2`, `23` node names, image refs `EH001.bmp`, `meca_tile2.bmp`, `EH001_bump.tga`; Hi/Mid/Lo `EH001` and `meca_tile2` textures are present, while `EH001x.lwo` and `EH001_bump.tga` are absent in installed data. The exact Imperial crest remains required via `client-unity/Assets/ArtSource/reference/logh7-imperial-double-eagle-reference.jpg` and `client-unity/Assets/ArtSource/reference/imperial-crest/logh7-imperial-double-eagle-mask-gold.png`; current proof art with the crest small/secondary is not final art.
- 2026-07-04 server-data-family scope: `server/content/generated/logh7-server-servable-data-family.json` now lists the server-servable family set required before Unity runtime consumption: `systems`, `stars`, `planets`, `grids`, `characters`, `fleets`, `ships`, `commands`, `operations`, `tactics`, `economy`, `uiText`, `reports`, `launcherCommunity`. Every family remains `suspect-cross-check-required`; this manifest is a scope/evidence map, not canonical promotion. Mandatory report watch categories remain `systemPositions` / `성계 위치` and `originalCharacterRoster` / `오리지널 캐릭터 로스터`.
- 2026-07-04 current-content cross-check scope: `server/content/generated/logh7-current-content-crosscheck.json` now inventories `server/content`, `RE/content`, `.omo/work/logh7-installed`, generated catalogs, and Ghidra/manual/live/wire evidence-channel roots before any canonical promotion. Present roots and generated JSON files are still `suspect-cross-check-required`; missing evidence-channel roots are recorded as missing, not silently filled. Canonical promotion remains `blocked-until-cross-source-confirmed`.
- 2026-07-04 Unity source-pack manifest: `server/content/generated/logh7-unity-source-pack-manifest.json` and `client-unity/Assets/StreamingAssets/logh7/logh7-unity-source-pack-manifest.json` now separate the required `original-fallback` pack from optional reversible `remaster-hd`. `verifiedRecords` remains empty because current-content canonical promotion is still `blocked-until-cross-source-confirmed`; Unity may consume the manifest as a pack contract, not as canon data proof.
- 2026-07-04 remaster provenance: `server/content/generated/logh7-remaster-provenance-manifest.json` and `client-unity/Assets/StreamingAssets/logh7/logh7-remaster-provenance-manifest.json` now enforce remaster packs optional/reversible/provenance-labeled. `remaster-hd` disabled by default, manifest-driven, conflict-check-required, provenance-label-required, original-fallback-required; artifact inputs include `imperial-crest-mask` and original Empire ship-derived `empire-ship-reference`, and every input remains `suspect-cross-check-required`.
- 2026-07-04 G008 galaxy trust crosscheck: `server/content/generated/logh7-galaxy-trust-crosscheck.json` records existing `galaxy.json`, raster star centers, planet/model extracts, passable cells, and generated catalogs as present but still `suspect-cross-check-required`. `systemPositions` / 성계 위치 remains report-immediately, but `confirmedNewHiddenData.systemPositions` is empty; no new system coordinates are confirmed.
- 2026-07-04 G009 runtime boundary: `server/content/generated/logh7-runtime-boundary-manifest.json` keeps normal runtime limited to operator Docker Compose server and Unity 6000.5.2f1 player/launcher. `G7MTClient.exe`, Frida, `ui_explorer`, preseed flags, and patch builders are `oracle-only`/diagnostic-only with `normalRuntimeAllowed=false`.
- 2026-07-04 G010 asset overwrite guard: `server/content/generated/logh7-asset-overwrite-guard.json` makes original asset roots read-only fallback (`client-unity/Assets/ArtSource/original`, installed/CD extract/original-data roots) and keeps remaster outputs under separate remaster/reference/concept roots. Current guard `violationCount=0`; remaster provenance tracks it as `asset-overwrite-guard`.
- 2026-07-04 G011 formula provenance guard: `server/content/generated/logh7-formula-provenance-guard.json` blocks unresolved CP/combat/economy/AI formulas from canonical promotion. Domains are `commandPoint`, `combat`, `economy`, `ai`; `unresolvedFormulaCount=9`; `canonicalFormulaRecords=[]`; required evidence is manual/OCR/image, Ghidra/static RE, live oracle, and wire capture cross-check. `systemPositions` and `originalCharacterRoster` unchanged; no new confirmed watch-category data found.
- 2026-07-04 G012 Unity asset source-truth guard: `server/content/generated/logh7-unity-asset-source-truth.json` and `client-unity/Assets/StreamingAssets/logh7/logh7-unity-asset-source-truth.json` block manual Unity Project/Inspector drag-and-drop from becoming data authority. `manualDragAsSourceTruthAllowed=false`, `sourceTruthInputCount=6`, `unityRuntimeConsumerCount=5`, `violationCount=0`; current-content inventory now includes this generated catalog.
- 2026-07-04 G012 follow-up: Unity asset source-truth input count is now `9`, superseding the earlier `sourceTruthInputCount=6` note. The manifest now explicitly includes Empire ship reference, Imperial double-eagle crest mask, and Imperial medal source-lock inputs. Imperial medal/remaster work must use original `Ship/GE` MDX render/extract data for large ship motifs and the supplied Imperial crest mask for the faction mark.
- 2026-07-04 G013 test decision guard: `server/content/generated/logh7-test-decision-guard.json` fixes test policy before further data extraction/inventory/cross-check work. Node CD extraction, hidden-data scan/classification/watchlist, current-content cross-check, and Unity source-pack modules require RED then GREEN test evidence before behavior changes or catalog rule changes. Unity C# loader/scene work remains `tests-after-first-loader-scene-surface` until the first manifest-consuming runtime surface exists. Diagnostic shortcuts remain `normalRuntimeAllowed=false`.
- 2026-07-04 G014 ULW evidence inventory: `server/content/generated/logh7-ulw-evidence-20260703-inventory.json` catalogs the 2026-07-03 evidence bundle under `.omo/ulw-loop/evidence`. It records `fileCount=52`, `excludedSelfAuditFileCount=2`, `totalBytes=60234049`, and keeps `canonicalPromotion=blocked-until-cross-source-confirmed`. Category counts are CD extraction 9, hidden data 7, record candidates 10, scene inventory 3, server tests 6, Unity 5, TCF portraits 3, source/archive 3, other 6.
- 2026-07-04 G015 Unity source-pack asset correction: `server/content/generated/logh7-unity-source-pack-manifest.json` and `client-unity/Assets/StreamingAssets/logh7/logh7-unity-source-pack-manifest.json` now expose required original fallback asset families for Imperial ship and crest work: `imperialShipMdx` (`.omo/work/logh7-installed/data/model/Ship/GE`, `fileCount=117`), `fieldShipMarkSheet` (`ShipMark.tga`), `imperialDoubleEagleReference` (exact supplied reference JPG), and `imperialDoubleEagleMasks` (gold/silver/white masks). This is a Unity pack contract only; canonical promotion remains `blocked-until-cross-source-confirmed`, `verifiedRecords=0`, and generated/remastered ship silhouettes or crests remain invalid substitutes.
- 2026-07-04 G015 Unity validation scene progress: Unity scene/runtime now has source-ledger visibility and screenshot capture entrypoint. `client-unity/Assets/Scripts/Logh7GalaxyPrototypeRuntime.cs` displays `source-pack` and `asset-source-truth` lines, `client-unity/Assets/Editor/Logh7PrototypeSceneGenerator.cs` creates a source-ledger TextMesh panel, and `client-unity/Assets/Editor/Logh7ValidationSceneCapture.cs` defines `Logh7ValidationSceneCapture.CaptureEvidence` targeting `.omo/ulw-loop/evidence/g015-unity-validation-scene-screenshot-20260704.png`. Focused tests pass `7/7`, full server tests pass `139/139`, and C# LSP diagnostics are clean. Manual screenshot remains blocked by Unity Licensing IPC timeout (`LicenseClient-Peppone Choi` channel refused / `Unity-LicenseClient` mutex timeout), so G015 is not complete.
- 2026-07-04 G016 wave-0 regeneration: reran `extract:cd-media`, `scan:hidden-data`, `classify:hidden-data`, `report:hidden-data-watchlist`, `catalog:server-data-family`, and `catalog:current-content-crosscheck`. Evidence `.omo/ulw-loop/evidence/g016-pipeline-run-20260704.log`, `.omo/ulw-loop/evidence/g016-watchlist-summary-20260704.log`. Current counts: hidden candidates `37047`, server-facing families `15`, generated catalog count `38`; canonical promotion remains blocked. Immediate-report watch result: no newly confirmed `systemPositions` / 성계 위치 table and no newly confirmed `originalCharacterRoster` / 오리지널 캐릭터 로스터; roster findings are current suspect composite/manual content only.
- 2026-07-04 G017 source inventory / Unity import manifest refresh: reran `inventory:sources`, `catalog:current-content-crosscheck`, `catalog:unity-asset-source-truth`, and `catalog:unity-source-pack`. Evidence `.omo/ulw-loop/evidence/g017-pipeline-run-20260704.log` and `.omo/ulw-loop/evidence/g017-manifest-consistency-20260704.log`. Current source root registry has `8` roots; current-content canonical promotion remains blocked with generated catalog count `38`; Unity asset source-truth has `9` source inputs, `5` runtime consumers, `violationCount=0`, and StreamingAssets match; Unity source-pack has `verifiedRecords=0`, required original fallback families `imperialShipMdx`, `fieldShipMarkSheet`, `imperialDoubleEagleReference`, `imperialDoubleEagleMasks`, with `Ship/GE fileCount=117`.
- 2026-07-04 G018 UI/remaster/gameplay boundary: `npm --prefix server run catalog:ui-scene-remaster-gameplay-boundary` now emits `server/content/generated/logh7-ui-scene-remaster-gameplay-boundary.json` and matching Unity StreamingAssets copy. The boundary explicitly exposes original Empire ship and crest contracts: `Ship/GE` raw `117` MDX + `3` MDS, `Thumbnail/Ship` `79` TGA, `logh7-empire-ship-reference-manifest` `6` reference entries, and `logh7-imperial-double-eagle-mask-manifest` `3` exact-mask variants (`gold`, `silver`, `white`). Remaster/generated art must consume these original contracts first; generated substitutes remain optional overlays with original fallback. Evidence `.omo/ulw-loop/evidence/g018-ui-boundary-catalog-20260704.log`, focused tests `13/13`, full server tests `142/142`, LSP diagnostics clean.
- 2026-07-04 G019 Unity loader validation update: `client-unity/Assets/Scripts/Logh7GalaxyPrototypeRuntime.cs` now reads `logh7-ui-scene-remaster-gameplay-boundary.json` from StreamingAssets and displays a `ui-boundary` line with `Ship/GE=117`, `thumbnails=79`, and `crest variants=3`. `client-unity/Assets/Editor/Logh7PrototypeSceneGenerator.cs` adds the same G018 boundary status to the validation scene source-ledger panel. Evidence `.omo/ulw-loop/evidence/g019-unity-boundary-green-20260704.log`, `.omo/ulw-loop/evidence/g019-unity-boundary-focused-tests-20260704.log` (`6/6`), `.omo/ulw-loop/evidence/g019-unity-boundary-server-tests-20260704.log` (`142/142`), C#/.mjs LSP diagnostics clean. Unity batch screenshot remains under the existing G015 Licensing IPC blocker, not a completed G019 proof.
- 2026-07-04 G020 CD media/extract revalidation: reran `npm --prefix server run extract:cd-media`. `server/content/generated/logh7-cd-media-manifest.json` reports media `verified`, ISO `converted`, `.omo/work/logh7-cd-extract/iso-root` `25` files, InstallShield root `2207` files, and canonical promotion `blocked-pending-crosscheck`. Evidence `.omo/ulw-loop/evidence/g020-cd-media-extract-20260704.log`, focused tests `.omo/ulw-loop/evidence/g020-cd-media-tests-20260704.log` (`3/3`), full server tests `.omo/ulw-loop/evidence/g020-cd-media-server-tests-20260704.log` (`142/142`).

- 2026-07-04 G021 server data scope revalidation: reran `npm --prefix server run catalog:server-data-family` and `npm --prefix server run catalog:current-content-crosscheck`. `server/content/generated/logh7-server-servable-data-family.json` covers `15` rebuilt-server data families and keeps every family `suspect-cross-check-required`; immediate-report watches remain `systemPositions` / `성계 위치` and `originalCharacterRoster` / `오리지널 캐릭터 로스터`. Evidence `.omo/ulw-loop/evidence/g021-server-data-family-catalog-20260704.log`, focused tests `.omo/ulw-loop/evidence/g021-server-data-family-focused-tests-20260704.log` (`2/2`), crosscheck `.omo/ulw-loop/evidence/g021-current-content-crosscheck-20260704.log`, full server tests `.omo/ulw-loop/evidence/g021-server-tests-20260704.log` (`142/142`).

- 2026-07-04 G022 hidden-data scanner revalidation: reran `scan:hidden-data`, `classify:hidden-data`, and `report:hidden-data-watchlist`. Classification holds `37047` records (`10253` validated, `26794` invalid); mandatory watches report `systemPositions` `209` candidates / `44` paths and `originalCharacterRoster` `403` candidates / `8` paths, both still `not-confirmed-new-hidden-*` and not canonical. Evidence `.omo/ulw-loop/evidence/g022-hidden-data-scan-20260704.log`, `.omo/ulw-loop/evidence/g022-hidden-data-classify-20260704.log`, `.omo/ulw-loop/evidence/g022-hidden-data-watchlist-20260704.log`, focused tests `.omo/ulw-loop/evidence/g022-hidden-data-focused-tests-20260704.log` (`10/10`), full server tests `.omo/ulw-loop/evidence/g022-server-tests-20260704.log` (`142/142`).

- 2026-07-04 G023 source inventory correction: source-root registry now includes CD extraction roots `cd-extract-iso-filesystem` and `cd-extract-installshield-payload`. `inventory:sources` reports `10` roots: Archive media `2`, CD ISO filesystem `25`, CD InstallShield payload `2207`, installed game data `2185`, installed docs `2`, server content `1142`, RE content `1102`, Ghidra evidence `60`, manual extracts `173`, and installed fonts still `missing`. Evidence `.omo/ulw-loop/evidence/g023-source-inventory-20260704.log`, focused tests `.omo/ulw-loop/evidence/g023-source-corpus-focused-tests-20260704.log` (`3/3`), adjacent catalog logs `.omo/ulw-loop/evidence/g023-current-content-crosscheck-20260704.log`, `.omo/ulw-loop/evidence/g023-unity-asset-source-truth-20260704.log`, `.omo/ulw-loop/evidence/g023-unity-source-pack-20260704.log`, full server tests `.omo/ulw-loop/evidence/g023-server-tests-20260704.log` (`142/142`).
- 2026-07-04 G024 Unity source-pack checkpoint: `catalog:unity-source-pack` now writes matching server and Unity StreamingAssets manifests with CD media/source-root registry inputs and source-root inventory. Original fallback asset families explicitly require Empire `Ship/GE` MDX (`imperialShipMdx`, `117` files), original `ShipMark.tga`, `logh7-imperial-double-eagle-reference.jpg`, and gold/silver/white double-eagle masks. These are required source assets for ship/crest/remaster work, not optional generated replacements. Canonical promotion remains `blocked-until-cross-source-confirmed`, `verifiedRecords=0`; focused tests pass `3/3`, full server tests pass `142/142`.
- 2026-07-04 G025 UI scene catalog checkpoint: `catalog:ui-scenes` now writes `logh7-ui-scene-catalog.json` to server generated content and Unity StreamingAssets. The catalog maps mandatory client surfaces `launcher`, `login`, `lobby`, `character`, `world`, `strategic`, `select-grid`, `info`, `tactics`, and `battle` to evidence-backed scene IDs, keeps Unity as the main runtime, marks the original client `oracle-and-data-mining-only`, and keeps diagnostic shortcuts out of normal runtime. Generated summary: `surfaceCount=10`, `missingSceneCount=0`, `liveTraceSurfaceCount=6`, `canonicalPromotion=blocked-until-cross-source-confirmed`. Focused tests pass `3/3`; full server tests pass `145/145`.
- 2026-07-04 G026/G031 Unity StreamingAssets deterministic export checkpoint: `catalog:unity-streamingassets-export` writes `logh7-unity-streamingassets-export.json` to server generated content and Unity StreamingAssets. The export is timestamp-free/deterministic, excludes itself from its file index, records sorted StreamingAssets relative paths with bytes and SHA256, and hash-addresses original fallback assets from the Unity source-pack manifest. Current G031 proof supersedes the original G026 file count: `fileCount=14`, `originalFallbackAssetCount=4`, includes `logh7-gameplay-contract-boundary.json`, server/Unity export SHA256 `04fb0f60fd003d5b3bd90231a4449ec30f97295539fb57a9b145a2f28e7ec8dd`, `byteEqual=true`, `canonicalPromotion=blocked-until-cross-source-confirmed`. Focused export tests pass `6/6`; full server tests pass `151/151`.
- 2026-07-04 G027 Unity project/open status: `client-unity/ProjectSettings/ProjectVersion.txt` confirms Unity `6000.5.2f1`, and the editor exists at `E:/unity/hub/6000.5.2f1/Editor/Unity.exe`. Batch open of `client-unity/` was attempted, but Unity Licensing IPC repeated the known blocker: `Failed to acquire global mutex Unity-LicenseClient-Peppone Choi`, channel `LicenseClient-Peppone Choi` refused/timeouts, and one `Unity.Licensing.Client` PID remained access-denied to non-elevated cleanup. G027 is blocked on Unity Licensing Client health, not project-file absence.
- 2026-07-04 G028 Unity EditMode loader tests are blocked by G027. C# manifest/scene catalog EditMode tests require a working Unity Editor open, but Unity Licensing IPC is currently failing. Do not rerun the same Unity route until `Unity.Licensing.Client` mutex/channel health is repaired or the stale access-denied client is cleared.
## 2026-07-04 G030 Remaster Provenance Ship/Crest Lock

- `server/content/generated/logh7-remaster-provenance-manifest.json` and `client-unity/Assets/StreamingAssets/logh7/logh7-remaster-provenance-manifest.json` now expose `empire-ship-reference` source provenance from original installed game thumbnails, not invented silhouettes. Current proof records `shipSourceHashCount=6`; first source is `.omo/work/logh7-installed/data/image/Thumbnail/Ship/iu008.tga` SHA256 `d92982521bf4109fd770f436c366254949a555d046332d4fd23cd00ca3144106`.
- Imperial crest provenance remains locked to `client-unity/Assets/ArtSource/reference/logh7-imperial-double-eagle-reference.jpg` SHA256 `822276b190c3e83729de39c14e4e9fc06c2eb8b39a56225bdcbe16f147134e9e`; gold/silver/white masks remain source-locked derivatives. `remaster-hd` stays disabled by default, reversible, conflict-check-required, provenance-label-required, original-fallback-required, and `blocked-until-cross-source-confirmed`.
- Evidence: `.omo/ulw-loop/evidence/g030-remaster-provenance-ship-red-20260704.log`, `.omo/ulw-loop/evidence/g030-remaster-provenance-ship-green-20260704.log`, `.omo/ulw-loop/evidence/g030-remaster-provenance-ship-run-20260704.log`, `.omo/ulw-loop/evidence/g030-remaster-provenance-ship-proof-20260704.log`, `.omo/ulw-loop/evidence/g030-current-content-crosscheck-20260704.log`, `.omo/ulw-loop/evidence/g030-server-tests-20260704.log`. Focused tests pass `2/2`; full server tests pass `148/148`; LSP diagnostics are clean for changed `.mjs` source/test files.
## 2026-07-04 G031 Gameplay Contract Boundary

- `server/content/generated/logh7-gameplay-contract-boundary.json` and `client-unity/Assets/StreamingAssets/logh7/logh7-gameplay-contract-boundary.json` now expose the gameplay rule boundary for Unity/server consumption. The manifest shows implemented evidence-backed rules separately from unresolved formula locks: `implementedEvidenceBackedRuleCount=1` with `strategy-command-cost-table`, `unresolvedFormulaLockCount=9`, `unresolvedFormulaPromotionAllowed=false`, `canonicalPromotion=blocked-until-cross-source-confirmed`.
- The boundary reads `server/content/generated/logh7-formula-provenance-guard.json` and `server/content/generated/logh7-server-servable-data-family.json`; if formula guard input is missing or malformed it fails closed with no implemented rules promoted. Diagnostic-only evidence remains invalid as normal runtime behavior.
- `server/content/generated/logh7-unity-streamingassets-export.json` and its Unity copy were regenerated after adding the gameplay contract manifest. Current export proof: `fileCount=14`, self-index excluded, `logh7-gameplay-contract-boundary.json` included, server/Unity SHA256 `04fb0f60fd003d5b3bd90231a4449ec30f97295539fb57a9b145a2f28e7ec8dd`, byteEqual `true`.
- Evidence: `.omo/ulw-loop/evidence/g031-gameplay-contract-red-20260704.log`, `.omo/ulw-loop/evidence/g031-gameplay-contract-green-20260704.log`, `.omo/ulw-loop/evidence/g031-gameplay-contract-run-20260704.log`, `.omo/ulw-loop/evidence/g031-gameplay-contract-proof-20260704.log`, `.omo/ulw-loop/evidence/g031-focused-after-export-fix-20260704.log`, `.omo/ulw-loop/evidence/g031-streamingassets-export-rerun-20260704.log`, `.omo/ulw-loop/evidence/g031-current-content-crosscheck-final-20260704.log`, `.omo/ulw-loop/evidence/g031-server-tests-final-20260704.log`. Full server tests pass `151/151`; no new `systemPositions` or `originalCharacterRoster` values were confirmed.
## 2026-07-04 G033 Plan Compliance Audit

- G033 audited G030-G032 against the current objective and startup rules. Evidence `.omo/ulw-loop/evidence/g033-plan-compliance-audit-20260704.log` reports `status=pass`, `failed=[]`, G030/G031/G032 all `complete` with criteria `pass`, remaster pack disabled/reversible/original-fallback-backed, Empire ship source hashes present, Imperial crest locked, gameplay unresolved formulas locked, StreamingAssets export current at `fileCount=14`, canonical promotion still blocked, diagnostic shortcuts not promoted, Unity Licensing IPC blocker documented.
- Boundary receipt `.omo/ulw-loop/evidence/g033-plan-compliance-boundary-20260704.log` confirms the audit detects a missing evidence path while leaving production evidence intact. This keeps documentation receipts evidence-bound rather than trusting stale summaries.
- No new `systemPositions` / 성계 위치 or `originalCharacterRoster` / 오리지널 캐릭터 로스터 values were confirmed by this audit.
## Unity Visual Build Evidence - 2026-07-04

- Built the current Unity prototype player at `client-unity/Builds/Windows/LOGH7RevivalUnity.exe` with Unity `6000.5.2f1`.
- Visual proof exists at `.omo/ulw-loop/evidence/codex-unity-player-window-screenshot-final-20260704.png`; editor-render proof exists at `.omo/ulw-loop/evidence/codex-unity-validation-scene-screenshot-20260704.png`.
- G045 clickthrough proof exists at `.omo/ulw-loop/evidence/g045-player-clickthrough-strategic-map-20260704.png`: the built player advances Boot -> Login -> Lobby -> Character Select -> World Entry -> Strategic Map through real mouse clicks and displays `Current gate: Strategic Map`.
- G045 edge proof exists at `.omo/ulw-loop/evidence/g045-player-edge-strategic-blocked-20260704.png`: direct Strategic Map click from a fresh player remains at Boot, preserving session gating.
- G046 scene-surface proof exists at `.omo/ulw-loop/evidence/g046-player-scene-tactics-switch-20260704.png`: the built player consumes `logh7-ui-scene-catalog.json`, exposes 10 UI scene surfaces, and selects `tactics` only after Strategic Map prerequisites are met.
- G046 edge proof exists at `.omo/ulw-loop/evidence/g046-player-scene-tactics-blocked-20260704.png`: direct `tactics` selection from Boot remains locked at `launcher`.
- Current visible scope remains a prototype shell: boot/login/lobby/session-flow controls plus suspect galaxy data preview and runtime evidence panel. It is not yet the full LOGH VII game.
- The screen explicitly preserves current data status: `systemPositions` and `originalCharacterRoster` are watch categories only, not newly confirmed canonical values.
