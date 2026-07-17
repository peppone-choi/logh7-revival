---
name: logh7-wine-live-qa
description: "Run evidence-backed LOGH VII legacy-client QA natively on Windows or under isolated Wine on macOS/Linux. Use for original G7MTClient.exe launch, login/world/gameplay validation, D3D8/locale/audio/input checks, runtime observation, packet/proxy correlation, A/B tests, and cleanup/rollback proof."
---

# LOGH VII Platform-Aware Legacy Client Live QA

원본 `G7MTClient.exe`를 제품 경로이자 호환성 오라클로 유지하면서 선택한 client runtime, 런타임 RE, 패킷 관측, 서버 결과를 한 run의 증거로 묶는다. host 네트워크 성공과 실제 게임 성공을 서로 대체하지 않는다.

## 적용 경계

- 먼저 Python `sys.platform`을 기록한다. `win32`는 `RUNTIME_MODE=native-windows`, `darwin`·`linux`는 `RUNTIME_MODE=wine`이며 다른 값은 `blocked`다. shell 종류나 EXE 경로로 OS를 추측하지 않는다.
- `native-windows`에서는 Wine 도구·prefix를 요구하거나 호출하지 않는다. exact lineage를 공통 gate로 확인한 뒤 `tools/logh7_ui_explorer.py` 또는 시나리오별 direct native harness로 EXE를 직접 실행한다.
- `wine`에서는 `tools/live/logh7_wine_live_qa.py`와 아래 격리 계약을 적용한다. `--version`, `wineboot`, `wineserver`, 레지스트리 조회 같은 진단도 예외가 아니다.
- 정적 PE/Ghidra 분석만 하거나 host에서 서버 단위 테스트만 실행할 때는 client runtime을 시작하지 않는다.
- 일상 플레이 경로에 proxy, Frida, debugger, 보조 launcher를 넣지 않는다. 이들은 격리된 RE/QA run에서만 쓴다.
- `docs/harness/logh7-revival/team-spec.md`의 공통 correlation schema와 phase gate를 함께 따른다.

## 필수 입력

실행 전에 공통 값을 명시하고 evidence manifest에 기록한 뒤 선택한 runtime의 전용 입력만 추가한다.

- `REPO_ROOT`: 이 저장소의 `realpath` 절대 경로.
- `RUNTIME_MODE`: host 판별로 고정한 `native-windows` 또는 `wine`. run 시작 뒤 바꾸지 않는다.
- `RUN_ID`: UTC 시각과 짧은 무작위 suffix를 포함한 불변 ID.
- `RUN_MODE`: `regression` 또는 `recovery-baseline`. 기본값은 `regression`이며 run 시작 뒤 바꾸지 않는다.
- `CLIENT_EXE`: 정본 lineage가 확인된 작업 사본의 절대 경로와 기대 SHA-256.
- `LINEAGE_MANIFEST`: CD base → 공식/update → 1080p → localization/diagnostic patch 단계의 입력·출력 해시, PE timestamp/image base, patch receipt, sentinel bytes, backup, rollback 해시.
- `RUN9_EVIDENCE`: run9 원본 또는 검증 가능한 redacted evidence index. `regression` mode에서는 필수이고 client/patch/server/seed hash와 world entry·movement·relogin/restart 증거를 가리켜야 한다. `recovery-baseline`에서는 누락 이유와 복구 목표를 대신 명시한다.
- client-facing/server-facing 주소, 전용 포트, 서버/프록시 실행 계약, 기대 시나리오, redaction 정책.

`native-windows` 전용 입력은 Windows version/architecture, 직접 실행할 검증된 EXE, Python/Node/Frida/pywin32와 D3D8·locale·audio·input·registry 상태를 담은 native environment receipt다. `WINE_BIN`, `WINEBOOT_BIN`, `WINESERVER_BIN`, `WINEPREFIX`는 입력도 빈 placeholder도 아니다.

`wine` 전용 입력은 실행 가능한 absolute `WINE_BIN`, 같은 배포본의 absolute `WINEBOOT_BIN`·`WINESERVER_BIN`, 저장소 밖 LOGH7 전용·run 전용 absolute `WINEPREFIX`, 명시적 `PREFIX_MODE=win32|wow64`, `LOGH7-WINE-RUNTIME-SUPPORT-V1` manifest다. mode 기본값은 호환성을 위한 `win32`일 뿐 자동 탐지나 실패 후 fallback이 아니다.

## 절대 fail-closed 조건

다음 공통 조건 중 하나라도 참이면 client를 시작하지 말고 `blocked` manifest를 남긴다.

- 정본 EXE가 없거나 실제 SHA-256, PE timestamp/image base, sentinel bytes가 lineage manifest와 다르다.
- `RUN_MODE=regression`인데 run9 evidence index 또는 그 index가 요구하는 핵심 artifact가 없다.
- `RUN_MODE=recovery-baseline`인데 exact lineage/hash/PE metadata/sentinel, 기대 결과, 새 evidence receipt 경로, 승격 절차 중 하나라도 없다.
- 원본·작업 사본·backup·rollback 목적지가 구분되지 않거나 원본을 in-place 수정할 가능성이 있다.
- 필요한 포트가 이미 점유되었는데 소유 PID를 이 run이 증명하지 못한다.
- server/proxy/client 중 어느 실행 명령이 사용할 binary, config, seed, DB hash를 확정하지 못한다.

`native-windows`에서는 host가 `win32`가 아니거나 native environment receipt가 없거나, helper/overlay를 정규 플레이 경로로 오인하거나, 검증된 EXE를 직접 실행하지 못하면 차단한다. Wine 설치 여부는 판정하지 않는다.

`wine`에서는 Wine 도구 셋 중 하나가 상대 경로·미존재·실행 불가·다른 배포본이거나, prefix가 unset/상대/기본 `~/.wine`/저장소 내부/공유 경로이거나, 선택한 prefix mode와 `system.reg` header가 다르거나, V1 runtime-support manifest가 없으면 차단한다.

`blocked`는 실패를 숨기는 우회 상태가 아니다. 누락 값, 확인 명령, 관측 결과, 다음 복구 경로를 manifest에 적는다.

## `recovery-baseline` 예외

run9 artifact가 없더라도 exact client lineage와 선택한 runtime의 모든 환경 gate가 검증되면 과거 run9를 **재사용**하는 대신 새로운 baseline 후보를 만들 수 있다.

1. `request.json`에 `RUN_MODE=recovery-baseline`, run9 누락 목록, 역사 문서에서 가져온 기대 결과, 현재 server/seed/DB/client hashes를 기록한다. 역사 문서의 기대값 자체는 성공 증거가 아니다.
2. 새 `RUN_ID`에서 world entry, 두 client awareness/movement, relogin, server restart persistence를 가능한 한 동일한 시나리오로 실행한다. Wine mode만 새 전용 prefix를 쓴다.
3. client natural output, 양방향 packet/proxy, server event/DB, screenshot, cleanup/rollback을 새 receipt에 수집한다.
4. 유효한 실행이지만 필수 evidence가 덜 모였으면 verdict를 `provisional`로 둔다. 필수 evidence가 모두 있고 producer-reviewer 검증이 끝났으면 `recovered`로 둔다.
5. recovery run 자체는 절대 regression `pass`가 아니다. `recovered` artifact의 manifest/hash를 freeze하고 static lineage review, client/wire/server correlation review, live cleanup review를 모두 통과시킨다.
6. 승인된 candidate를 별도 baseline index에서 새 기준으로 명시한 뒤, **다음** `RUN_MODE=regression` run이 그 frozen index를 입력으로 사용한다. 그 후속 run만 정상 regression `pass`를 받을 수 있다.

정본 EXE lineage 자체가 없거나 불일치하면 이 예외도 사용할 수 없다.

## 실행 환경별 명령 불변식

### Native Windows

- Wine 관련 명령과 `tools/live/logh7_wine_live_qa.py`를 실행하지 않는다.
- `py -3 -m tools.logh7_ui_explorer --session <run-dir> start --exe <verified-exe> --lineage-manifest <client lineage manifest v1>`처럼 검증된 EXE를 parent directory cwd에서 직접 실행한다. `info`와 `stop`도 같은 session을 사용한다. **native launch는 반드시 `--lineage-manifest <client lineage manifest v1>`를 넘겨 launch 이전 fail-closed lineage 게이트(hash·image base·sentinel 불일치 시 실행 전 exit 3·blocked receipt)를 강제한다.**
- `ui_explorer`는 입력·스크린샷·PID 정리 어댑터이지 lineage authority가 아니다. 시작 전에 공통 hash·PE metadata·sentinel·run9 gate를 별도로 닫는다.
- 실행 PID/HWND, Windows build/architecture, Python/Node/Frida/pywin32, registry/D3D8/locale/audio/input 상태를 native environment receipt에 기록한다.

### Wine on macOS/Linux

- 모든 호출에 `WINEPREFIX`를 같은 절대 값으로 명시한다. 초기화 mode와 registry header의 대응은 `win32 → WINEARCH=win32 → #arch=win32`, `wow64 → WINEARCH=wow64 → #arch=win64`다. `#arch=win64`는 WoW64 prefix header이지 32-bit 원본 client를 64-bit로 바꿨다는 뜻이 아니다.
- 미초기화 prefix에서는 `--version`을 포함한 다른 Wine 진단보다 먼저 선택한 `WINEARCH`로 절대 `WINEBOOT_BIN`을 호출한다. `drive_c`와 `dosdevices/c:`까지 완성되고 기대 header가 확인된 뒤에만 version/client 명령을 실행한다. 기존·부분 초기화 prefix를 자동 변환하거나 `win32` 실패 뒤 `wow64`로 자동 재시도하지 않는다.
- Wine 배포본이 pure win32 prefix를 지원하지 않으면 새 run에서 `--prefix-mode wow64`를 명시한다. 기존 prefix header와 mode가 다르면 재사용하지 않는다.
- Windows 도구(`cmd.exe`, `reg.exe`)는 절대 `WINE_BIN`을 통해 실행한다. host의 Windows drive letter나 특정 설치 경로를 하네스 설정에 고정하지 않는다.
- `wine`, `wine64`, `wineboot`, `wineserver`, `winetricks`를 bare command로 호출하지 않는다. 부가 도구도 실제 절대 경로와 버전/hash를 기록한다.
- 전역 Wine 설정, 기본 prefix, 다른 bottle/CrossOver container를 읽거나 수정하지 않는다.
- `system.reg` 유무와 관계없이 첫 Wine 호출 전에 기존 `drive_c`·`dosdevices`가 symlink 아닌 prefix 내부 실제 디렉터리인지, 존재하는 `c:`가 해당 `drive_c`만 가리키는지 `lstat` 기준으로 검증한다.
- 실행 시작 drive snapshot을 baseline으로 삼아 기존 host mapping은 격리 후 exact raw target으로 복구하고, wineboot가 새로 만든 mapping은 ephemeral로 제거한다. cleanup 뒤 snapshot 불일치·새 mapping·release 예외는 `release-failed`다.

## P0 환경 영수증

게임 시작 전에 `_workspace/logh7-revival/runs/<RUN_ID>/environment.json`을 만든다.

1. `runtimeMode`, host OS/build/architecture와 선택한 runtime adapter를 기록한다.
2. Windows면 native tool/version과 직접 실행 EXE·session 경로를 기록한다. Wine이면 Wine 도구 hash/version, prefix marker/architecture/file manifest, `dosdevices` mapping을 기록한다.
3. D3D8 경로, wrapper hash/override, 화면 mode를 기록하고 wrapper를 자동 교체하지 않는다.
4. locale/code page, keyboard/IME, font hash, audio device/driver, input/focus 조건을 기록한다.
5. 게임 registry key `HKCU\Software\BOTHTEC\銀河英雄伝説VII\1.0`의 pre-run 상태를 기록한다. Wine이면 `system.reg`·`user.reg`·`userdef.reg` hash도 기록한다.
6. client/server/proxy/Frida/debugger executable·script·config·DB·seed hash와 사용할 포트를 기록한다.

## EXE·패치·레지스트리 보호

- canonical 원본은 읽기 전용으로 두고 SHA-256을 먼저 확인한다. 실제 실행은 lineage가 연결된 작업 사본만 사용한다.
- 각 patch 단계는 입력 hash, original signature/sentinel, output hash, patch count, tool/version, rollback artifact를 가진다. signature 불일치 시 적용하지 않는다.
- 실행 직전 작업 EXE와 backup을 다시 hash한다. backup이 원본과 같아야 하는지 직전 단계와 같아야 하는지 manifest에 명시한다.
- registry 변경 전 export와 file hash를 남기고, 의도된 key/value만 적용한다. run 종료 후 restore 또는 승인된 변화 보존 정책을 실행하고 post hash를 비교한다.
- 원본, installed working copy, registry와 runtime별 격리 자원(Wine prefix/drive mapping 또는 native session)의 rollback이 하나라도 증명되지 않으면 verdict를 `pass`로 만들지 않는다.

## 두 증거 면을 분리

### Host network/server 면

- host에서 PCAP/tshark/Wireshark, loopback proxy, server frame/opcode, DB/event trace를 수집한다.
- observe 모드를 기본으로 두고 client-facing input과 server-facing output의 byte count와 payload SHA-256가 양방향으로 같음을 확인한다.
- host PCAP/proxy 성공은 선택한 runtime의 게임 창, D3D8 렌더, Win32 입력, 음향, 한글 표시, 게임 FSM 성공을 증명하지 않는다.
- proxy를 우회한 direct-server control과 observe-only proxy 경로를 비교한다.

### Client runtime/game 면

- 실제 원본 클라이언트 화면에서 launcher/direct entry 계약, 로그인, 월드 진입, 입력, 렌더, 음향, 네트워크, 종료를 관측한다.
- 로그인 영역 `644×484` 보존과 로그인 뒤 게임 영역 `1920×1080` 전환을 별도 screenshot으로 남긴다.
- Frida hook, debugger breakpoint, memory scan/dump는 exact EXE hash·image base·sentinel을 통과한 뒤에만 attach한다.
- screenshot만으로 server authority나 persistence를 주장하지 않고, server/DB/event trace와 correlation한다.

## 관측과 개입 순서

1. **Observe:** client/proxy/server payload를 변경하지 않고 baseline을 만든다.
2. **Client runtime:** 함수 인자·반환값, parser/cache/root/FSM, Win32/GDI/D3D8 상태를 hook/breakpoint로 관측한다. 쓰기 hook은 별도 승인된 experiment variant로 분리한다.
3. **Wire intervention:** observe hash equality가 먼저 통과한 뒤에만 replay, delay, drop, one-field A/B mutation을 한다. hypothesis, 대상 frame, original/mutated hash, 예상 결과, rollback을 사전에 기록한다. unknown code/phase/length는 임의 수정하지 않는다.
4. **Server intervention:** authoritative validation, command ledger, cost/timer/job, domain event, persistence, response/broadcast를 instrumentation한다. client 기대에 맞추기 위한 speculative auto-response를 금지한다.
5. **Patch/localization/remaster A/B:** working copy 또는 reversible overlay만 바꾸고 원본 fallback과 hash guard를 유지한다.

한 run에서 여러 독립 변수를 동시에 바꾸지 않는다. baseline 없이 mutation부터 시작하지 않는다.

## 직렬 실행과 자원 소유

- 한 시점에 하나의 live run만 동일 runtime 자원(Wine prefix 또는 native session), install copy, DB, client-facing/server-facing port를 소유한다.
- 시작 전에 `_workspace/logh7-revival/runs/<RUN_ID>/port-lease.json`을 생성하고 주소·포트·owner PID·start time을 기록한다.
- server → observe proxy/capture → client 순서로 시작하되 각 프로세스의 실제 PID와 child PID를 기록한다.
- 기존 listener/process를 blanket kill하지 않는다. 이 run이 시작하고 기록한 PID만 종료한다.
- 병렬 에이전트는 정적 분석·로그 판독만 수행할 수 있다. client UI, runtime 자원, port, DB를 만지는 stateful 단계는 live owner에게 직렬화한다.

## Evidence manifest

원시 증거는 `_workspace/logh7-revival/runs/<RUN_ID>/`에 두고 secret/PII를 redaction한 index만 추적 가능하게 만든다.

`/_workspace/`는 gitignored scratch다. reviewer가 승인한 redacted frozen index와 synthesis만 `docs/verification/logh7/<RUN_ID>/`로 승격하고, 승격본에 scratch `evidence-manifest.json`의 SHA-256과 각 redacted artifact hash를 남겨 연결한다. raw PCAP, memory dump, 인증 payload, secret/PII는 tracked 경로로 절대 승격하지 않는다.

`evidence-manifest.json`은 최소한 다음 키를 가진다.

```json
{
  "schemaVersion": 1,
  "runId": "...",
  "mode": "regression|recovery-baseline",
  "status": "complete|failed|blocked",
  "verdict": "pass|fail|provisional|recovered|blocked",
  "scenario": "...",
  "runtime": {"mode": "native-windows|wine", "environment": "environment.json"},
  "clientLineage": {"manifest": "...", "canonicalSha256": "...", "workingSha256": "..."},
  "run9Baseline": {"index": "...", "sha256": "...", "verified": true, "missing": []},
  "recoveryPromotion": {"candidate": false, "reviews": [], "frozenIndex": null},
  "registry": {"pre": "...", "post": "...", "restored": true},
  "drives": {"pre": "...", "post": "...", "restored": true},
  "ports": {"lease": "port-lease.json", "clean": true},
  "processes": {"pidLedger": "pids.json", "clean": true},
  "hostEvidence": [],
  "clientEvidence": [],
  "correlation": {"jsonl": "correlation.jsonl", "sha256": "..."},
  "rollback": {"client": true, "registry": true, "runtimeIsolation": true},
  "gaps": []
}
```

- 모든 evidence entry에 relative path, media type, byte size, SHA-256, producer, capture time, redaction state를 둔다.
- password, session secret, 개인 식별자, 원시 인증 payload는 저장하지 않는다. 필요한 경우 redacted artifact와 full-payload SHA-256만 남긴다.
- 공통 event는 team spec의 결정적 `correlation.jsonl` schema를 사용한다.

## 종료와 rollback

1. client를 정상 종료하고, 실패하면 기록된 client PID만 종료한다.
2. proxy/capture/server를 역순으로 종료하고 각 exit status와 종료 시각을 기록한다.
3. Wine mode에서만 전용 prefix의 absolute `WINESERVER_BIN`으로 남은 Wine server를 정리한다. 부분 wineboot·예상 밖 예외·Ctrl-C에서도 안전한 layout이면 emergency registry rollback → wineserver cleanup → drive release를 시도하고, rollback 실패 시 pre-run registry export를 보존한다. Native Windows는 기록된 client PID만 종료한다.
4. client-facing/server-facing port의 listener가 0개인지 확인한다.
5. PID ledger의 프로세스와 child가 0개인지 확인한다.
6. registry, EXE, patch overlay, drive mapping을 rollback하고 post hash를 pre/expected hash와 비교한다.
7. runtime 격리 경계 밖 변경 파일이 0개인지 확인하거나 의도된 artifact를 전부 manifest에 열거한다.
8. manifest와 correlation 파일을 마지막에 hash하고 cleanup/rollback 결과를 verdict에 반영한다.

## 판정

- `pass`: host byte/server evidence와 선택한 client runtime의 natural-output evidence가 각각 통과하고 correlation, cleanup, rollback까지 닫혔다.
- `fail`: 실행은 유효했으나 관측 결과가 acceptance를 충족하지 못했다.
- `blocked`: 입력·lineage·run9·환경·자원 gate가 없어 유효한 실행을 시작할 수 없었다.
- `provisional`: `recovery-baseline` 실행은 유효했으나 run9 대체 baseline으로 승격할 evidence/review가 덜 모였다.
- `recovered`: `recovery-baseline`의 필수 evidence와 reviews가 닫혀 frozen baseline candidate가 됐다. 이 verdict도 regression `pass`가 아니다.

`pass`는 `RUN_MODE=regression`에서만 허용한다. host-only 또는 client-runtime-only 결과를 전체 `pass`로 승격하지 않는다. 자동 테스트 exit code만으로 gameplay 성공을 주장하지 않는다. 결과 보고에는 runtime mode, exact command, hash, 증거 경로, 실패/누락, cleanup 상태를 포함한다.
