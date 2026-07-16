# LOGH VII Revival 테스트·검증 지도

> 정적 분석 기준: 2026-07-16, `HEAD == origin/main == 630b9c663040e24304028be10a4ffc62134bc27f`
>
> 이 문서는 명령과 harness를 분류한 결과다. 이번 조사에서는 사용자 지시대로 Node/Python 테스트와 `wine`, `wineboot`, `winecfg`, `winetricks`를 실행하지 않았다.

## 1. 검증 계층

| 계층 | 무엇을 증명하는가 | 원본 client/Wine | 완료 판정에 충분한가 |
|---|---|---:|---:|
| 정적 검사 | 문법, JSON, diff, LSP, patch site/순서 | 불필요 | 아니오 |
| Node unit/integration | codec, framing, authority, SQLite, loopback TCP | 불필요 | 서버 내부 계약만 |
| Python offline test | PE/RSRC 순수 로직, UI helper, probe orchestration | 일부 import는 Windows 필요 | 도구 계약만 |
| server harness | 특정 login/world 응답을 재생·캡처 | client를 붙이면 필요 | wire 후보 확인 |
| packet/Frida probe | client 함수·메모리·실제 송수신 | 필요 | 진단 증거 |
| direct real-client QA | 정상 EXE의 화면·입력·패킷·DB·재접속 | 필요 | 기능 slice의 필수 gate |
| two-client/restart QA | A 요청, B broadcast/apply, 재로그인·서버 재시작 영속성 | 필요 | 멀티플레이/영속 기능의 필수 gate |

자동 테스트 통과를 gameplay 완료로 승격하지 않는다. client-visible 변경은 정본 EXE hash, 정상 direct launch, 패킷, 서버 상태, screenshot을 같은 run에서 묶어야 한다. 진단 overlay나 강제 상태 주입만 성공한 경우도 완료가 아니다.

## 2. 권위 있는 실행 표면

### Node 서버

root에는 `package.json`, lockfile, 중앙 lint 설정, Playwright 설정이 없다. 권위 있는 package는 `server/package.json`이며 private ESM, Node `>=20`, `node:test` 기반이다.

```bash
# 전체 48개 test 파일
npm --prefix server test

# 단일 파일
node --test server/tests/world-session.test.mjs

# server 디렉터리 안에서 같은 명령
cd server && npm test
cd server && node --test tests/world-session.test.mjs
```

문서의 UnitShip `132/132`에 대응하는 명령은 저장소에 기록돼 있지 않다. 현재 선언 수로는 아래 네 파일의 합이 정확히 132이므로 유력한 재구성일 뿐, 실행 전에는 공식 명령으로 단정하지 않는다.

```bash
node --test \
  server/tests/world-records.test.mjs \
  server/tests/world-session.test.mjs \
  server/tests/cqrs-orm.test.mjs \
  server/tests/world-seed.test.mjs
```

### Python 도구

```bash
# PEP 723/uv 기반 RSRC patch test
uv run --script tools/tests/test_logh7_rsrc_patch.py

# mock Win32 UI explorer test
python -m unittest tools.tests.test_logh7_ui_explorer

# multiclient orchestration test
uv run --with frida --with pillow --with pydantic --with pytest --with typer \
  python -m pytest tools/live/test_m3_multiclient_probe.py

# 현재 import 단계부터 Windows/Wine Python 환경이 필요한 close-probe test
python -m unittest tools.live.test_m3_close_probe

# 과거 live evidence를 읽는 독립 gate script
python tools/live/tests/test_liveqa_harness_gates.py
```

마지막 gate script가 참조하는 다섯 evidence 디렉터리는 현재 tracked checkout에 없다. 따라서 fixture를 복구하거나 script를 self-contained fixture로 바꾸기 전에는 재현 가능한 gate가 아니다.

### 최소 정적 gate

중앙 lint/typecheck script가 없으므로 변경 범위에 맞춰 개별 명령을 기록한다.

```bash
git diff --check
node --check path/to/file.mjs
python -m py_compile path/to/file.py
```

LSP error `0`은 보조 증거다. 실제 Node/Python test와 Wine real-client run을 대신하지 않는다.

## 3. Node 테스트 인벤토리

`server/tests`에는 48개 `.test.mjs`, fixture 1개가 있다. top-level `test(` 선언은 정적으로 460개이며 현재 `AGENTS.md`의 `460 total / 458 pass / 0 fail / 2 conditional skips`와 총합이 일치한다.

| 파일 | 선언 수 | 주된 계약 |
|---|---:|---|
| `exe-patch.test.mjs` | 9 | PE patch·hash/guard·Windows 동작 |
| `logh7-314-emit-bytes.test.mjs` | 1 | 원본 emit byte patch |
| `account-auth.test.mjs` | 5 | account 인증 |
| `action-list.test.mjs` | 6 | action list wire |
| `authority-card-lifecycle.test.mjs` | 9 | 권위 카드 생명주기 |
| `authority-cards.test.mjs` | 9 | 카드 catalog/codec |
| `capture.test.mjs` | 4 | capture parser |
| `cd-extract.test.mjs` | 13 | MODE2/Joliet/CAB 추출·안전성 |
| `character-codec.test.mjs` | 28 | character record decode |
| `character-encode.test.mjs` | 23 | character record encode |
| `character-hangul-name.test.mjs` | 3 | 한글 이름 wire |
| `character-store.test.mjs` | 11 | character 저장소 |
| `child-codec.test.mjs` | 13 | child cipher/codec |
| `cqrs-orm.test.mjs` | 5 | SQLite CQRS/UoW 원자성 |
| `deployment-units.test.mjs` | 8 | deployment unit records |
| `envelope-0030.test.mjs` | 7 | `0x0030` envelope |
| `frame-stream.test.mjs` | 4 | split/coalesced framing |
| `galaxy-placement.test.mjs` | 7 | galaxy placement/passability |
| `gin7-credential.test.mjs` | 2 | GIN7 credential golden |
| `hangul-charset-client.test.mjs` | 1 | 한글 client patch source contract |
| `hangul-charset-patch.test.mjs` | 4 | charset patch/hash guard |
| `live-input-driver.test.mjs` | 5 | live input driver 정적 순서 |
| `lobby-harness-dispatch.test.mjs` | 1 | lobby harness dispatch |
| `lobby-login.test.mjs` | 7 | lobby login codec |
| `lobby-session.test.mjs` | 17 | lobby state machine |
| `login-harness-server.test.mjs` | 3 | login harness response |
| `login-response.test.mjs` | 5 | login response bytes |
| `manual-logistics.test.mjs` | 1 | logistics command |
| `map-position-ledger.test.mjs` | 3 | position ledger |
| `mdx-transform-catalog.test.mjs` | 7 | MDX transform catalog |
| `original-charge.test.mjs` | 7 | original CP charge |
| `playable-server.test.mjs` | 8 | production composition/network |
| `schema-migration.test.mjs` | 3 | migration order/idempotence |
| `static-base.test.mjs` | 11 | static base records |
| `strategy-command-catalog.test.mjs` | 9 | 전략 command catalog |
| `strategy-probe-order.test.mjs` | 25 | probe 안전 순서·source contract |
| `strategy-ui-label-patch.test.mjs` | 3 | UI label patch |
| `system-detail-records.test.mjs` | 3 | system detail records |
| `tactical-entry-sequence.test.mjs` | 6 | tactical entry sequence |
| `tactical-position-records.test.mjs` | 7 | tactical position records |
| `transport-0030.test.mjs` | 5 | `0x0030` transport |
| `warehouse-record.test.mjs` | 7 | warehouse record golden |
| `world-records.test.mjs` | 44 | world packet records |
| `world-seed.test.mjs` | 5 | production SQLite seed |
| `world-session.test.mjs` | 78 | world FSM·opcode·broadcast |
| `prepare-1080p-client.test.mjs` | 6 | 1080p patch preparation |
| `prepare-direct-client.test.mjs` | 4 | direct client patch preparation |
| `prepare-strategy-ui-client.test.mjs` | 8 | strategy UI patch preparation |

### Conditional skip

- `exe-patch.test.mjs`는 non-Windows에서 Windows 전용 동작 1건을 skip한다.
- `logh7-hangul-charset-patch.test.mjs`는 정본 EXE가 없으면 해당 case를 skip한다.
- `prepare-direct-client.test.mjs`도 설치 EXE 부재/불일치 때 같은 case를 skip할 수 있다.

환경에 따라 skip 조합이 달라질 수 있다. 실행 결과의 `pass`, `fail`, `skip`을 따로 기록하고 skip을 성공 수에 포함하지 않는다.

## 4. Python 테스트 인벤토리

| 파일 | 정적 test 수 | runner/환경 | 성격 |
|---|---:|---|---|
| `tools/tests/test_logh7_rsrc_patch.py` | 5 | pytest, Python `>=3.11`, `uv run --script` | RSRC patch 순수 로직 |
| `tools/tests/test_logh7_ui_explorer.py` | 14 | unittest, Win32 mock | offline 가능 |
| `tools/live/test_m3_close_probe.py` | 10 | unittest | import target가 `ctypes.windll`/Frida에 의존 |
| `tools/live/test_m3_multiclient_probe.py` | 17 | pytest, process/client mock | orchestration·gate 계약 |
| `tools/live/tests/test_liveqa_harness_gates.py` | 8개 함수/19개 check | custom `main()` | 외부 evidence directory 의존 |

current docs의 Python live baseline `16/16`은 최신 tracked multiclient test 함수 17개와 어긋난다. `16/16`을 현재 기준으로 반복 인용하지 말고, 다음 실행에서 정확한 명령·수집 시각·pass/fail/skip을 함께 갱신한다.

## 5. Fixture와 golden 구분

| 종류 | 위치/예 | 취급 |
|---|---|---|
| real-client golden | character capture hex, GIN7 live inner bytes, child cipher vector, warehouse prefix | 출처 capture/함수/EXE hash를 유지하고 exact bytes로 잠금 |
| restored fixture | `server/tests/fixtures/logh7-old-character-record.mjs` | pre-reset `5bd249c`에서 복원한 증거; provenance 유지 |
| synthetic PE fixture | patch test의 sparse PE | patch engine만 증명, 실제 EXE 호환성은 증명하지 않음 |
| synthetic media fixture | CD extract test의 MODE2/Joliet/CAB fixture | parser·경로 안전성 계약 |
| temp runtime fixture | temp DB/store/socket | 격리와 cleanup 필수 |
| live evidence fixture | `.omo/live-qa/<run>` | EXE hash, trace, packet, DB, screenshot, manifest가 한 run에 필요 |

값을 추측해 golden을 만들지 않는다. provisional 값은 이름과 문서에 provisional임을 남기고 원본 확인 뒤에만 canonical로 승격한다.

## 6. `tools/live`와 Wine 경계

tracked `tools/live`는 111개 파일이다: Python 69, Frida JavaScript 30, Node MJS 11, JSON 1.

| 군 | 대표 파일/기능 | host-only 가능 | Wine client 필수 |
|---|---|---:|---:|
| 정적 PE/FSM scanner | `_dump_1200_sites.py`, `_dump_fsm_table.py`, `_find_session_table.py` | 예, 경로 수정 필요 | 아니오 |
| patch/prep | `apply_session_picker_patch.py`, `prepare_*_client.mjs` | 예 | 실행 검증은 필요 |
| server harness/capture | `_m2_launch.mjs`, `logh7_login_harness_launch.mjs`, `logh7_capture.mjs` | 서버만은 예 | 실제 traffic에는 필요 |
| Win32 UI driver | `_m3_multiclient_probe.py`, `_m3_close_probe.py`, UI explorer 계열 | 아니오 | 예 |
| Frida hook/probe | `_frida_*.js`, 전략/baseinfo probes | 아니오 | 예 |
| offline support | `_spot_dialog_geometry.py`, `_strategy_ready_gate.py`, `m3_multiclient_support.py` | 일부 | 최종 gate에는 필요 |

현재 Wine 실행의 정적 blocker/gap은 다음과 같다.

- `m3_multiclient_support.direct_launch(exe)`는 Windows EXE 경로만 argv로 반환하고 `wine` wrapper/prefix를 받지 않는다.
- `_m3_multiclient_probe.py`는 이를 그대로 `Popen`하므로 macOS host에서 Windows EXE를 직접 실행할 수 없다.
- Win32 driver는 host Python의 `ctypes.windll`/HWND API를 사용한다. Wine prefix 안의 Windows Python으로 실행하거나 Wine-aware host bridge로 분리해야 한다.
- Frida attach 대상 PID가 Wine loader인지 Windows process인지, hook module base/offset이 정본 EXE와 일치하는지 아직 자동 검증되지 않는다.
- 여러 live script가 `E:\\logh7-revival...`을 고정 사용한다. prefix의 `dosdevices/e:` mapping과 실제 artifact 위치를 manifest에 남겨야 한다.
- D3D8 wrapper/config, 644×484 login에서 1920×1080 game 전환, loopback `47900`, 입력, 폰트/IME, 소리까지 같은 prefix에서 입증해야 한다.

offline Node/Python test를 macOS host에서 실행하는 것과 Wine real-client 검증은 서로 다른 증거다. 모든 명령을 Wine 안에서만 돌리는 정책을 채택하면 prefix에 Windows Node/Python/uv와 test dependency를 따로 설치해야 하지만, 그것만으로 live 증거가 되지는 않는다.

## 7. Real-client live gate

### 공통 run manifest

- source/installed EXE SHA-256과 patch receipt
- Wine/CrossOver 종류·버전, prefix/bottle 절대 경로, architecture, `E:` mapping
- 서버 commit/hash, exact command, port, SQLite/store path
- client별 PID, launch argv, 시작/종료 시각
- tshark/dumpcap 또는 server packet trace와 Frida script/hash
- DB before/after, server log, screenshot/video
- 성공·실패 gate와 cleanup 결과

### 두 client 기능 gate

1. 서버와 packet capture를 먼저 시작한다.
2. 서로 다른 PID의 client A/B가 login과 world 진입을 완료한다.
3. A의 실제 UI 입력으로 command request를 만든다.
4. 서버가 request를 검증하고 한 transaction으로 상태/event를 반영한다.
5. A response와 B broadcast가 wire에 보이고 B 화면/메모리에 적용된다.
6. A 재로그인 뒤 상태가 유지된다.
7. 서버 재시작 뒤 두 client가 동일 상태를 다시 읽는다.
8. 서버/client/capture process, port, temp artifact를 기록된 PID 기준으로 정리한다.

이동은 `0x0b01` request와 `0x0b07` response/broadcast, destination cell, SQLite 위치가 모두 일치해야 한다. post-warp HUD/marker/FSM이 멈추면 world 진입 성공만 보고하고 해당 기능은 실패로 남긴다.

## 8. 현재 증거와 재현성 공백

- 문서 기준선은 targeted `132/132`, 전체 server `460 total / 458 pass / 0 fail / 2 conditional skips`, Python live harness `16/16`, changed JS LSP error `0`이다. 이번 분석은 실행하지 않았으므로 재검증 결과가 아니다.
- 최신 문서는 run9 JSON-store two-client, run3 production SQLite CQRS, run5 aligned-19 ship catalog를 참조한다.
- `.gitignore`가 `.omo/live-qa/*`를 무시하며 위 최신 세 evidence directory는 현재 checkout/tracked tree에 없다. 따라서 새 clone에서 문서의 live 판정을 독립 재생할 수 없다.
- tracked live evidence는 더 오래된 run만 포함한다. 다음 run에서는 작은 sanitized manifest/index는 tracked 문서에 남기고 대용량 capture는 checksum과 보존 위치를 기록해야 한다.
- `test_liveqa_harness_gates.py`의 다섯 fixture directory도 없다. gate를 self-contained fixture로 바꾸거나 필요한 evidence snapshot을 명시적으로 복구해야 한다.
- CI workflow가 없고 runner matrix가 정의되지 않았다. Node/SQLite host test와 Wine real-client lane의 버전 pinning이 필요하다.
- `docs/logh7-developer-dashboard.html`과 `docs/logh7-loop-state.md`의 오래된 test 수/경로는 current command 근거로 사용하지 않는다.

## 9. 다음 실행 순서

실행 담당자는 아래 순서를 유지한다. 이 문서 작성 단계에서는 실행하지 않았다.

1. dirty worktree와 정본/installed EXE hash를 기록한다.
2. Node/Python 환경 버전과 optional artifact 유무를 기록한다.
3. 정적 gate와 변경 파일의 focused offline test를 실행한다.
4. 전체 Node 460 suite와 관련 Python suite를 실행하고 pass/fail/skip을 분리한다.
5. Wine prefix/drive/D3D8/Frida/PID preflight를 검증한다.
6. 단일 client direct-launch smoke를 통과시킨다.
7. 기능별 packet/Frida probe로 wire와 client FSM을 확인한다.
8. 두 client + relogin + server restart gate를 실행한다.
9. 증거 manifest와 current docs, `AGENTS.md`, Obsidian 상태/로드맵을 같은 판정으로 동기화한다.

실패 시 같은 증상 3회 또는 새 증거 없는 조사 2회에서 반복 실행을 멈추고 client, server, network/interposition 중 다른 축으로 전환한다.
