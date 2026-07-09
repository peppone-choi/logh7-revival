# LOGH VII Revival — Session Handoff (2026-06-20)

> 다음 세션/에이전트 시작점. 2026-06-19 핸드오프(docs/SESSION-HANDOFF-2026-06-19.md) 이후 방대한 작업 누적.
> **데이터 등급**: P0(클라/와이어 확정)·P1(매뉴얼/PDF)·P2(IV-EX)·P3(절차). 클라-대면은 라이브 검증 전 단정 금지.
> 실행=`tools/logh7_ui_explorer.py`(logh7-live 스킬). 서버 테스트 **1047 그린**(`npm run test:server`).

---

## 🟢 이번 세션 주요 성과 (2026-06-20)

### 1. 라이브 입력 RE — keybd_event가 인-월드 키 입력을 뚫음 (돌파구)
- **이전 결론 정정**: "ui_explorer로 인-월드 입력 불가"는 절반만 맞았다. 원인 = **클라가 키보드를 GetAsyncKeyState로
  폴링**(FUN_00500b70, 17회)하는데 ui_explorer가 **PostMessage**로 보냄(GetAsyncKeyState 미반영).
- **수정/검증**: `ui_explorer key --hw`로 **keybd_event(하드웨어)** 주입 → 라이브에서 **catGate state가 처음으로
  전이**(0x1→0x2→0x6) + **cellStatePush 발화**(이전 0). 즉 **인-월드 키보드 입력 = keybd_event로 작동**(DirectInput
  후킹 불필요). 클라가 갤럭시 뷰로 전환됨도 확인.
- **잔여**: 마우스(목적지 클릭/커서). 클라는 GetCursorPos + DirectInput8(DAT_0221a324) 혼용. SetCursorPos가
  인-월드 셀 선택에 안 닿는 건 **마우스 가두기(cursor clip)** 또는 DirectInput 레벨 주입 필요(아래 TODO).
- 도구: `tools/logh7_frida_movemode_probe.py`(17훅 + GetAsyncKeyState 훅은 Frida API 변경으로 실패 — findExportByName
  대신 Process.getModuleByName().getExportByName()로 고쳐야).

### 2. 적대적 멀티-에이전트 감사 + 12배치 구현
- 워크플로(51 에이전트) 8도메인 병렬 감사 → **검증된 갭 41개**(docs/logh7-audit-2026-06-20.md, 착수 가이드 포함).
- **닫힘 P0+7P1+15P2+11P3** (서버 1008→1047): social(프라이버시 누수 P0)·combat(canCommand 게이트)·personnel
  (merit리셋·정원캡·자동진급)·economy(정복-소유 동기·스냅샷·NaN)·strategic(evaluateEnding ≤3)·persist(별칭/rngState)·
  coup/intel/espionage(키스페이스·諜報 3종)·config(parseBool 통일). **남은 건 데이터/라이브RE/대형refactor 의존**.
- **A2 codec 추출 착수**: transport(child) codec → `src/server/codec/transport-codec.mjs` + re-export shim.

### 3. Phase B 도메인 완성 (세션 전반부)
- 쿠데타(coup) + 첩보(espionage) + 연령드리프트(age-drift) 신규 모듈. B6/B5 도메인 로직 완비(와이어는 opcode 확정 시).

---

## 🔴 진행 중 핫 스레드 — 갤럭시 성계 위치 버그 (사용자 라이브 QA)

사용자가 실클라 전략맵을 검수하며 다수 성계가 회랑 밖/검은셀/외곽에 잘못 배치됨을 지적. 조사 결과:

### 확정 사실 (해결/배제됨)
- ✅ **그리드 100×50은 RE-확정** (틀린 거 아님): 클라 셀버퍼 `0x2c03cc`=100×50=5000B, 읽기 stride 100(`row*100 in
  0..5000`), 레코드 5004=헤더4+5000셀, 디컴파일 `5000` 상수 다수. **서버가 0x0315로 width=100/height=50 전송**
  (buildStaticInformationGridInner). 인게임 1-인덱스(1..100,1..50)=서버 0-인덱스(0..99,0..49).
- ✅ **축 교환은 문제 아님** (사용자 확정). cy↔canonCol=1.0 상관은 page rotation 90° 때문 — 정상. **regrid 하지 말 것**
  (tools/logh7_galaxy_canon_regrid.py 만들었으나 **사용 금지**, 잘못된 가설).
- ✅ **검은 그리드에 행성** 원인 = 라이브 env에 **LOGH_STRAT_TERRAIN 누락** → terrain 분기 스킵 → 배경 전체 값0
  (NON_NAVIGABLE=검정) + 마커만. **PLAYABLE_ENV_DEFAULTS엔 LOGH_STRAT_TERRAIN:'1' 있음**(npm start는 정상). →
  라이브/테스트 시작 env에 `--env LOGH_STRAT_TERRAIN=1` 반드시 포함(logh7-live 스킬 start 커맨드에 추가 필요).

### 🎯 진짜 근본 원인 (사용자 발견, 미해결)
- **"점이 성계가 아니라 주석(annotation)에 박혔다"** — PDF p101 星系図 추출(.omo/work/galaxy-extract/
  canon-positions.json)이 **실제 성계 vector dot이 아니라 주석/라벨 마커 위치**를 잡음. 그 마커가 실 dot에서 몇 px
  비껴 있어 1~2칸 오배치.
- 인덱스 대조 증거: 이제르론 인게임 (52,15)=서버(51,14)=galaxy.json canonCol51/canonRow14. 사용자 ground-truth=
  **인게임 row 13(서버 12)**. 추출 raw=13.63(서버) → 서버12와 ~1.6칸 차이(반올림 아님 = 주석 오프셋).
- **회랑은 1칸 폭**(사용자 확정): "14도 회랑 아니야, 회랑은 한칸짜리". 현재 마스크는 회랑대(col48-57)에 row별 흩어진
  다중 통과셀 → 1칸 채널로 정제 필요. 룸비니(col3)도 너무 외곽.
- 추출 파이프라인: galaxy.json(cx,cy) → PDF drawing frame(flipY By=-cy+842.64, **page rotation 90°**) → dotPx →
  cell(col=round((dotPxX-95)/14), row=round((dotPxY-215)/14), grid origin[95,215] pitch14). Lumbini로 셀계산 검증됨.

### → 수정 정공법 (다음 작업)
1. **PDF p101 星系図에서 실제 성계 dot만 재추출**(주석 마커 제외). PyMuPDF drawings에서 dot 종류 구분(색/크기/타입).
2. 재추출 dot → 100×50 재투영(origin/pitch 보정) → canonDotX/Y·canonCol/Row 재계산.
3. **1칸 회랑 정렬**: 두 회랑(이제르론·페잔)을 1칸 채널로, 회랑 성계를 그 위에 정확히.
4. galaxy.json + galaxy-passable-cells.json 재생성(마스크 = 두 반쪽 + 1칸 회랑). 적대적 검증 후 커밋.

---

## 📋 사용자 요청 TODO (2026-06-20)
1. **갤럭시 재추출** (위 핫스레드) — 실 성계 dot, 1칸 회랑.
2. **마우스 가두기(cursor clip/confine)** — 커서를 게임 창에 가둠. 듀얼모니터 이슈 + 인-월드 DirectInput 마우스 입력
   도달에 필요할 수 있음(SetCursorPos가 인-월드에 안 닿는 문제).
3. **HD 해상도 / UI 리마스터** — 4:3 레터박스/필러박스 기본안은 폐기. `lobby-res` + `lobby-native-layout`로
   로비는 현재 PC 기준 실제 1920x1080 캔버스와 네이티브 좌표 재배치가 라이브 검증됨. 다른 해상도는
   `logh7_encode_lobby_res.py`와 `logh7_encode_lobby_native_layout.py`로 같은 크기의 패치를 재생성해야 한다.
   남은 일은 같은 방식으로 설정/캐릭터/세션/월드 패널의 좌표와 텍스처를 시스템 해상도 기준으로 리마스터하는 것.
4. **NO DATA 필드** — 인게임 패널 다수가 "NO DATA"(레코드 미바인딩). 어느 레코드/패널인지 식별 필요.
5. **듀얼모니터 지원** — 잘 안 됨(마우스 가두기와 연관).
6. **인-월드 마우스 입력** — 키보드는 keybd_event로 됨. 마우스(목적지 클릭)는 cursor-clip 또는 DirectInput 주입.

---

## 실행 절차 (라이브, terrain 포함)
```bash
taskkill //IM node.exe //F; taskkill //IM G7MTClient.exe //F; sleep 2
python -m tools.logh7_ui_explorer --session .omo/ui-explorer/<id> start --port 47900 \
  --env LOGH_LOBBY_OK_FORMAT=message32 --env LOGH_LOBBY_EARLY_OK=1 --env LOGH_SS_FORMAT=message32 \
  --env LOGH_STRAT_GALAXY=1 --env LOGH_STRAT_GRID_EARLY=1 --env LOGH_STRAT_TERRAIN=1 \
  --env LOGH_WORLD_PLAYER=1 --env LOGH_POSTLOAD_PLAYER_RECORD=1 --env LOGH_FULL_UNIT_LOCATION=1 --env LOGH_GRID_ENTER=1
# 스플래시 ~30초 대기 후 create-character → world. 키 입력은 `key <vk> --hw`(keybd_event). 항상 stop으로 SHA 복원.
```
- 현재 게임 켜져 있음(PID 44224, terrain ON). 작업 후 `ui_explorer stop`으로 SHA 복원 필수.

## 2026-06-20 추가 정정 — 레터박스 금지, 네이티브 로비 패치 반영

- `tools/client_patches/lobby-fullscreen-display.json` 경로는 거부한다. 라이브에서 1024x768 UI를 1920x1080으로
  강제 표시해 가로 늘어짐을 만들었다.
- 기본 playable 스택은 `menufix`, `dlgfix`, `earlygrid-ringclear`, `strat-camera-focus`, `font-face`, `font-cleartype`,
  `lobby-res`, `lobby-native-layout`이다.
- `FUN_0051a370`의 로비 1024x768 하드코딩을 `lobby-res`로 실제 1920x1080 캔버스로 바꾸고,
  `FUN_0051c980`의 scene anchor table을 `lobby-native-layout`으로 1920x1080 좌표에 맞게 재배치한다.
  다른 시스템 해상도용 EXE는 두 JSON을 같은 목표 크기로 재생성한 뒤 빌드해야 한다.
- 최신 canonical playable SHA256:
  `f69d9713b535e4cb461c60a8831b55026c7ae44ec89b025d335cda3f79a1cff9`.
- 라이브 증거:
  `.omo/ui-explorer/session-20260620-native-layout-v1/shots/002-lobby-native-layout-v1.png`,
  `.omo/ui-explorer/session-20260620-native-layout-v1/shots/003-lobby-game-start-v1.png`,
  `.omo/ui-explorer/session-20260620-native-layout-v1/shots/005-lobby-settings-v1.png`,
  `.omo/ui-explorer/session-20260620-canonical-remaster-default/shots/002-canonical-remaster-lobby.png`.
- Pretendard는 EXE face 패치만으로 충분하지 않다. 런처 또는 `tools/logh7_ui_explorer.py`가
  `install-pretendard.ps1`을 먼저 실행해 per-user 폰트를 등록해야 GDI가 굴림으로 fallback하지 않는다.
  또한 `font-cleartype`이 없으면 Pretendard face라도 작은 GDI 글자가 낡은 안티앨리어싱으로 보여
  시스템 폰트처럼 느껴질 수 있다.

## 핵심 파일/도구
- 갤럭시: content/galaxy.json(canonCol/Row), content/galaxy-passable-cells.json(rowRangesByRow 마스크),
  .omo/work/galaxy-extract/(canon-positions.json·dots.json·canon-overlay.png).
- 투영: src/server/logh7-login-protocol.mjs `buildStrategicGalaxyGrid`/`strategicGalaxyCanonCell`/
  `buildStaticInformationGridInner`(0x0315)·`buildStaticInformationGridTypeInner`(0x0313). STRATEGIC_GRID_WIDTH=100/HEIGHT=50.
- 입력: tools/logh7_ui_explorer.py(`key --hw`=keybd_event), tools/logh7_frida_movemode_probe.py(17훅).
- 감사: docs/logh7-audit-2026-06-20.md(갭 41개 + 착수 가이드).

## 2026-06-20 추가 정정 — 로그인 부트스트랩 + post-load 좌석 기본값

- **로그인 재발 조건 제거**: 최신 playable 스택은 `login-commandline-bootstrap`을 포함한다. 이 패치는
  `FUN_0051a370` case `0x6e`의 `InputFromCommandLine` 경로를 클라 내부에서 직접 타게 해서, 창 클릭/타이핑
  자동화 없이 `127.0.0.1:47900`, `ginei00`, power `1`로 로그인한다.
- 최신 canonical playable SHA256:
  `15ed8a35ea3891374096b25d43878e74a6abbf97242b32ecf357ca4c577768e0`.
- 라이브 증거: `.omo/ui-explorer/g006-commandline-bootstrap-live-20260620a`에서 conn1 `0x7000`→conn2
  `0x0020/0x2000/0x2009`→conn3 `0x0200/0x0205/.../0x0f06` 월드 진입까지 도달했다.
- **post-load 좌석 기본값**: `PLAYABLE_ENV_DEFAULTS`와 런처 env에 `LOGH_POSTLOAD_ACTION_LIST_SEATS=1`을 추가했다.
  초기 `0x0f02`의 `0x0323`은 계속 좌석 0 미니멀 레코드로 유지하고, post-load rich 경로의 `0x0323`
  `card_len@0x24c`와 `0x0356` `seatCount@0x250`만 1로 채운다. 이는 서버 데이터 기본값 보강이며,
  기존 2026-06-16 기록처럼 `LOGH_ACTION_LIST_SEATS=1` 자체가 하단 HUD/NO DATA를 해결했다는 뜻은 아니다.
- 새 기본 라이브 실행에는 아래 env가 포함되어야 한다:
  `LOGH_POSTLOAD_RICH_CHARACTER=1`, `LOGH_POSTLOAD_ACTION_LIST_SEATS=1`, `LOGH_STRAT_TERRAIN=1`.
- 잔여 P0: rich downlink(`0x0356`, `0x1200`, `0x1202`, `0x1201`)와 좌석이 내려가도 현재 스크린샷 기준
  일부 HUD는 여전히 `NO DATA`/깨진 글리프를 보인다. 다음 작업은 레코드 추가가 아니라 실제 패널별 소비 레코드와
  GDI/텍스트 렌더 경로 식별이다.

## 2026-06-20 추가 정정 — 대시보드/패키징 검증

- 개발 대시보드는 현재 `overallPercent=63`이다. 서버 오픈 판정은 계속 **아직 불가**이며, 근거는
  HUD `NO DATA`/글리프/콘텐츠 회귀 P0와 자연 `0x0b01/0x0b07` 명령 루프가 닫히지 않았기 때문이다.
- 대시보드 모바일 제목 줄바꿈을 보정했다. `h1`은 `word-break: keep-all`로 한글 단어를 유지하고,
  `max-width: 620px`에서는 폰트를 낮춰 `대시보드`가 한 글자만 떨어지지 않게 했다.
- 개발용 React 검사 오버레이는 기본 화면에서 껐다. 필요할 때만 `?inspect=1` 또는
  `localStorage['logh7.react.inspect']='1'`로 켠다.
- 시각 QA 증거:
  `.omo/visual-qa/dashboard-20260620/desktop.png`,
  `.omo/visual-qa/dashboard-20260620/mobile.png`.
  두 캡처 모두 DOM overflow 검사 `0`이며, 모바일 제목의 `대시보드` 분리 문제와 검사 오버레이 노출은 재현되지 않는다.
- 루트 전체 회귀: `npm test` 통과. Python 도구 307개, 서버 node:test 1059개, Playwright 3개 통과.
- 독립 서버 회귀: `server/`에서 `npm test` 통과(1057개). 독립 클라이언트 패키지 검사:
  `client/`에서 `npm run check:package` 통과, vendor EXE SHA256은
  `15ed8a35ea3891374096b25d43878e74a6abbf97242b32ecf357ca4c577768e0`.

## 2026-06-20 추가 정정 — SQLite 계정 DB와 자동 로그인 계정

- 런처가 `--account-db logh7-runtime/state/accounts.sqlite`로 서버를 켜면 strict registry가 적용된다.
  playable EXE의 `login-commandline-bootstrap`은 `ginei00/dummy`를 클라이언트 내부에서 전송하므로,
  이 계정이 SQLite DB에 없으면 "서버는 켜졌는데 로그인 실패"가 재발한다.
- `tools/launcher/LOGH7Launcher.cs`와 `client/tools/launcher/LOGH7Launcher.cs`가 서버 시작 전에
  `EnsureBootstrapAccount(paths)`를 호출하도록 수정했다. `ginei00`가 없으면 admin `create`를
  `--password-stdin`으로 실행해 `dummy`를 등록하고, 이미 있으면 그대로 둔다.
- 패키지 재검증: `client/`에서 `npm run check:package` 통과. 새 player-facing 런처 해시:
  `은하영웅전설7.exe` SHA256 `565ee0388f0583bba70607c195892ce870824c119a3e5d99eb0c91e883c6f567`,
  `업데이트.exe` SHA256 `b2609912d1ddff1da3f78d8d09d9d3e3db242c58b1f8cfe4e04308ad1a802b00`.
- 회귀: `python -m unittest tools.tests.test_logh7_installed_tree` 통과, `npm run test:tools` 전체
  307개 통과.

## 2026-06-20 추가 정정 — G006 C002 current cell 진전과 남은 블로커

- 최신 실클라 런 `g006-c002-focuscell-unitstream-20260620`에서
  `LOGH_POSTLOAD_UNIT_STREAM_WIRE=1` + `LOGH_PLAYER_FOCUS_CELL=1` 조합을 검증했다.
- post-load `0x0325`는 parser-stream으로 정상화됨: trace에서 `unitCountBe0=1`, `unit0IdBe2=1`.
- `logh7_root_init_watch`가 전략 root current를 확인했다:
  `.omo/ulw-loop/evidence/g006-c002-focuscell-root-watch-20260620.jsonl`에
  `currentRaw11178=2550`, `currentX=50`, `currentY=25`.
- 따라서 playable 기본값/런처 env에 아래 두 값을 추가했다:
  `LOGH_POSTLOAD_UNIT_STREAM_WIRE=1`, `LOGH_PLAYER_FOCUS_CELL=1`.
- 단, C002는 아직 실패다. current cell이 채워진 뒤에도 중앙/인접 셀 클릭, 하드웨어 `F`, 우클릭은
  `0x0b01/0x0b07`을 만들지 않았다. 잔여 블로커는 좌표/성계 색상이 아니라 action/command admission 경로다.
- 좁힌 회귀: root와 `server/` 모두에서
  `node --test ...logh7-config.test.mjs ...logh7-login-session.test.mjs` 통과(각 103개).

## 2026-06-20 추가 정정 — Pretendard 렌더 품질 패치와 패키지 동기화

- 사용자 피드백: "아직 폰트는 시스템 폰트 그대론거 같던데."
- 원인 정리: EXE 전역 face 슬롯(`0x0077402c`)은 이미 `Pretendard`였지만, 두 `CreateFontA` 호출이
  `ANTIALIASED_QUALITY`(`push 4`)를 계속 써 작은 GDI 글자가 낡은 시스템 폰트처럼 보일 수 있었다.
- `font-cleartype` 패치를 추가해 `FUN_004aec70`의 VA `0x004aeddc`와 `FUN_004b0960`의 VA `0x004b0b91`을
  각각 `6a04` -> `6a05`로 바꿨다. `font-face`는 그대로 `Pretendard` 유지.
- GDI probe 결과: `Pretendard`는 `HANGEUL_CHARSET`에서 `Pretendard`로 resolve됐다. `Pretendard JP`는 같은
  charset에서 `굴림`으로 fallback하므로 EXE face로 쓰면 안 된다.
- 최신 canonical playable/client vendor EXE SHA256:
  `15ed8a35ea3891374096b25d43878e74a6abbf97242b32ecf357ca4c577768e0`.
- 직접 반영된 경로:
  `.omo/work/logh7-ko-overlay/exe/G7MTClient.playable.exe`,
  `.omo/work/logh7-installed/exe/G7MTClient.exe`,
  `.omo/work/logh7-installed/exe/G7MTClient.exe.uiexplorer`,
  `client/vendor/logh7-installed/exe/G7MTClient.exe`,
  `client/vendor/logh7-installed/exe/G7MTClient.exe.uiexplorer`.
- 검증: 위 EXE들의 face 슬롯은 `50726574656e64617264000000000000`, quality site는 둘 다 `6a05`.
  `python -m unittest tools.tests.test_logh7_client_exe tools.tests.test_logh7_installed_tree tools.tests.test_logh7_japanese_font_patch`
  통과, `client/`에서 `npm run check:package` 통과.

## 2026-06-20 추가 정정 — G006 C002 command-admission RE

- 최신 정적 RE 결론: C002의 남은 병목은 좌표/성계 색상/root current cell이 아니라 HUD 선택목록과 명령
  category admission 경로다.
- `FUN_004f68f0(selectionList,payload)`가 `payload+0x270`을 `selectionList+0x620`으로 옮기고 payload를
  `selectionList+0x628`에 저장한다.
- `FUN_004f6600(selectionList)`는 `selectionList+(0x22+i)*4`와 `selectionList+(0x32+i)*4` row object를
  `FUN_005015f0`로 hit-test하고, 성공해야 `selectionList+0x624` (`listSelected189`)가 갱신된다.
- `FUN_004fd100(HUD)`는 `HUD+0xf4 == 2`이고 `HUD+0xab0`이 변했을 때만 `FUN_004f6b00` category resolve와
  `FUN_004f5cb0` command menu build를 호출한다.
- `FUN_004f6b00` category 공식:
  `*(u16 *)(payload + 0x26c + (listCount - selectedIndex) * 8)`.
- `FUN_004f5cb0`/`FUN_004f58c0`는 `clientBase+0x3416d8` command table에서 command row/factory를 읽고,
  row hit 시 `FUN_004f93c0(factory,category)`로 dispatch한다. `factoryIndex=0x2b`는
  `FUN_00581c80` SelectGrid이며, 여기서 `0x0b01` send / `0x0b07` receive FSM이 생성된다.
- 구현 반영: `tools/logh7_selectgrid_snapshot.py`가 이제 `hudModeF4`, `hudState14e0`, selection row
  primary/secondary object gate/rect, command row gate/rect를 단발 snapshot에 포함한다.
- 테스트: `python -m unittest tools.tests.test_logh7_selectgrid_snapshot` 통과, `py_compile` 통과.
- 새 증거 문서:
  `.omo/ulw-loop/evidence/g006-c002-command-admission-re-20260620.md`.
- 다음 라이브 라운드는 성계 projection/color 반복 금지. world 진입 후 같은 클릭 지점에서 snapshot을 떠서
  `payloadCount270`, `listCount188`, `listSelected189`, `hudModeF4`, `hudAb0`, `categoryD6`, `rowCountD4`,
  selection/command row rect를 먼저 판정한다.
