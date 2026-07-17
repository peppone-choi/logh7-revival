# LOGH VII 플랫폼별 Legacy Client Live-QA P0 계약

원본 `G7MTClient.exe` 라이브 QA는 Python `sys.platform`으로 runtime을 먼저 고정한다.
`win32`는 `RUNTIME_MODE=native-windows`, `darwin`·`linux`는 `RUNTIME_MODE=wine`이며
그 밖의 값은 `blocked`다. shell 종류, EXE 경로, Wine 설치 여부로 host를 추측하지 않는다.

두 runtime은 exact client lineage, run9 또는 recovery-baseline, server/proxy 주소·port,
evidence, cleanup/rollback을 공통 gate로 사용한다. P0 receipt나 UI 자동화 출력 하나만으로
전체 gameplay `pass`를 판정하지 않는다.

## 런타임 라우팅과 공통 진입점

- `native-windows`에서는 `tools/live/logh7_wine_live_qa.py`와 Wine 도구·prefix를 호출하거나
  입력으로 요구하지 않는다. 공통 gate를 닫은 뒤 검증된 EXE를
  `tools/logh7_ui_explorer.py` 또는 시나리오별 direct native harness로 직접 실행한다.
- `wine`에서는 `tools/live/logh7_wine_live_qa.py`가 Wine toolchain, run 전용 prefix,
  runtime support, EXE lineage, run9 증거를 fail-closed로 검증한다. 기본 동작은 subprocess를
  시작하지 않는 preflight이며 `--execute`를 명시해도 이 receipt만으로 gameplay `pass`를 만들 수 없다.
- native Windows는 Windows build/architecture, 직접 실행 EXE, Python/Node/Frida/pywin32,
  D3D8·locale·audio·input·registry 상태를 `environment.json`에 기록한다. Wine mode는
  Wine toolchain·prefix·drive mapping·registry 상태를 기록한다.
- 공통 gate나 선택한 runtime의 environment receipt가 없으면 client를 시작하지 않고
  누락 값과 다음 복구 경로를 가진 `blocked` manifest를 남긴다.
- Codex의 `.codex/agents/live-qa.toml`과 Claude의 `.claude/agents/live-qa.md`는 모두
  `.agents/skills/logh7-wine-live-qa/SKILL.md`를 정본으로 읽는다. `.codex/skills/`와
  `.claude/skills/` 사본은 배포 mirror이며 독립 계약을 두지 않는다.

## Wine 어댑터 안전 경계 (`RUNTIME_MODE=wine` 전용)

- `WINE_BIN`, `WINEBOOT_BIN`, `WINESERVER_BIN`은 실행 가능한 절대 경로여야 하며
  lexical basename이 각각 `wine`, `wineboot`, `wineserver`여야 하고 해석된 부모
  `bin` 디렉터리가 같아야 한다. role을 바꾸어 넘기는 입력은 target이 같아도
  거부한다.
- Wine multicall symlink은 호출 파일명으로 mode를 선택한다. 따라서 실행 argv에는
  사용자가 준 절대 `wineboot`/`wineserver` 경로를 정규화해 보존하고 symlink target으로
  바꾸지 않는다. hash·실행권한·동일 배포본 판정은 resolved target으로 하며,
  receipt의 `wineToolchain.<role>.invokedPath`/`resolvedPath`에 둘 다 남긴다.
- 상대 경로, `~` 축약, broken symlink는 Wine 호출 전 blocker다.
- preflight snapshot은 각 tool의 lexical invoked path, resolved target, SHA-256, size를 가진다.
  모든 spawn 직전에 이 네 값과 실행권한을 다시 검증한다. symlink retarget,
  target 교체, 크기·hash 변경이 있으면 해당 command를 spawn하지 않고
  `launchBlocked` receipt를 남긴다. wineserver cleanup도 예외 없이 독립 재검증한다.
- `WINEPREFIX`는 저장소 밖, `~/.wine`가 아닌 전용 경로여야 한다.
  `.logh7-wine-prefix.json`의 repository·run ID가 일치하지 않으면 공유 prefix로 보고 거부한다.
- `--prepare-prefix`는 비어 있거나 없는 전용 디렉터리에 marker만 쓴다. Wine은 호출하지
  않으며, marker 없는 비어 있지 않은 디렉터리는 claim하지 않는다. marker와
  실행 lock은 `O_EXCL`로 원자적 claim하며 stale/foreign lock을 자동 삭제하지 않는다.
- prefix mode는 `--prefix-mode win32|wow64`로 명시하며 기본값 `win32`는 호환성
  기본값일 뿐 자동 탐지나 fallback이 아니다. mode와 초기화·header 대응은 다음과 같다.

  | prefix mode | 초기화 시 `WINEARCH` | 기대 `system.reg` header |
  | --- | --- | --- |
  | `win32` | `win32` | `#arch=win32` |
  | `wow64` | `wow64` | `#arch=win64` |

  `#arch=win64`는 WoW64 prefix 형식이며 PE32 원본 클라이언트가 64-bit로 바뀌었다는
  뜻이 아니다. 기존 prefix header가 선택 mode와 다르면 실행 전 차단한다.
- `system.reg`가 없는 새 prefix 또는 `drive_c`/`dosdevices/c:`가 덜 만들어진 부분
  prefix를 실행할 때는 `--initialize-prefix`가 필수다. 선택 mode의 `WINEARCH`를 넣은
  `wineboot -u`가 `wine --version`보다 먼저 실행되는 첫 Wine 호출이다. 완료 직후 header와
  실제 디렉터리 layout을 다시 확인하기 전에는 version/client를 시작하지 않는다.
  초기화 전부터 존재하는 `drive_c`·`dosdevices`는 symlink가 아닌 prefix 내부 실제
  디렉터리여야 하고, 존재하는 `c:`는 해당 `drive_c`만 가리켜야 한다. 이 검사는
  `system.reg`가 아직 없어도 wineboot보다 먼저 수행한다.
  `win32` 초기화 실패 뒤 같은 prefix를 `wow64`로 자동 재시도하거나 기존 architecture를
  변환하지 않는다.
- canonical EXE는 `readOnly: true`와 실제 파일 mode의 write bit 0을 모두 만족해야 한다.
  canonical, working, 모든 backup, 모든 rollback은 전체 조합에서 서로 다른
  path/inode를 사용해야 하며 hardlink alias도 거부한다.
- 실제 실행 시 모든 호출은 같은 명시적 `WINEPREFIX`를 받는다. 선택한 `WINEARCH`는
  `wineboot -u` 초기화 호출에만 들어간다.
- subprocess launch가 `OSError`/`FileNotFoundError`/`PermissionError`로 실패해도
  `launchError` receipt를 남기고 version/client를 건너뛴 뒤, 검증된 전용 prefix의
  wineserver cleanup을 별도로 시도한다. wineboot가 layout 생성 전이나 일부만 만든 뒤
  실패한 경우도 실제 prefix 디렉터리와 선택 mode header가 안전하면 cleanup-only 경로로
  `wineserver -k`를 시도한다. cleanup 예외도 숨기지 않고 receipt에 남긴다.
- host 환경은 allowlist로 재구성한다. `WINESERVER`, `WINELOADER`, `WINEDLLPATH`,
  `WINEDLLOVERRIDES`, `WINEDEBUG`, 모든 `DYLD_*`와 기타 미등록 key를 자식 Wine
  process에 전파하지 않는다. allowlist·제거 key·강제 key는
  `environment.wineEnvironmentPolicy`에 기록한다.
- 현재 legacy launcher 계약의 client argument allowlist는 빈 목록이다. `--client-arg`는
  deny-by-default로 차단하고 입력 값을 blocker, command plan, stdout receipt에 남기지
  않는다. 실제 baseline은 client argument 없이 실행한다.

## Wine runtime support manifest v1 (`RUNTIME_MODE=wine` 전용)

`--runtime-support-manifest`는 Wine 어댑터에만 전달한다. native Windows에서는 이 인자를
요구하지 않으며 빈 placeholder도 만들지 않는다. manifest는 project/run ID,
`LOGH7-WINE-RUNTIME-SUPPORT-V1`, profile/provenance, `installedRoot`,
`clientRelativePath`, `drive`, `dataInventory`, runtime `files`를 필수로 가진다.

- 현재 lineage는 `<installedRoot>/working/G7MTClient.exe`를 쓴다. legacy
  `<installedRoot>/exe/G7MTClient.exe`는 manifest에 명시했을 때만 허용한다.
- `profile=1080p-dgvoodoo`는 working CWD의 `GraphicConfig.txt`, `D3D8.dll`,
  `dgVoodoo.conf`를 exact path/size/SHA-256/provenance로 묶는다. `profile=native`는
  Wine runtime manifest 내부의 graphics profile 이름이며 `RUNTIME_MODE=native-windows`를
  뜻하지 않는다. 이 profile은 D3D8 pair 없이 가능하지만 config는 필수다.
- `dataInventory`는 exact manifest SHA-256과 `LOGH7-DATA-TREE-MANIFEST-V1`을
  검증한다. 현재 기준 2,185개 regular file의 sorted
  `path\0size\0sha256\n` digest/count/total bytes를 재계산하며 extra, missing,
  symlink, size/hash 변경을 모두 거부한다.
- `drive`는 예를 들어 `R:`만 external installed root에 mapping한다.
  client/data/registry Install은 이 drive만 쓴다. Wine이 자동 생성한 `D:`/`D::`/`Z:`
  같은 host-drive symlink는 client와 cleanup 동안 격리하고 exact raw target으로 복구한다.
  실행 시작 snapshot에 없고 wineboot가 새로 만든 host mapping은 복구 대상이 아니라
  ephemeral mapping으로 격리·제거한다. release 뒤 `name/state/rawTarget` snapshot이
  기대 baseline과 다르거나 cleanup 중 새 mapping이 생기면 그 entry를 임의 삭제하지 않고
  `release-failed`로 기록한다.
  비-symlink entry, prefix 밖을 가리키는 `drive_c`/`dosdevices` 디렉터리, 격리 중 target
  변경, 설치 drive 충돌은 blocker다.
- `HKCU\Software\BOTHTEC\銀河英雄伝説VII\1.0`을 변경 전 export하고
  `Install=<windowsInstallRoot>`를 검증한다. client 종료 후 key 전체를
  delete/import/export해 pre/post export SHA-256이 같아야 한다. 원래 key가
  없었다면 absent로 복구한다. registry 변경 뒤 예상 밖 예외나 Ctrl-C가 발생해도
  emergency rollback과 wineserver cleanup, drive release를 순서대로 시도해 failed receipt를
  반환한다. rollback import가 실패하면 유일한 pre-run export는 삭제하지 않고 path/hash와
  함께 보존한다.
- client spawn 직전 working/canonical/backup/rollback/lineage receipt, runtime
  sidecar, 전체 data tree를 다시 hash한다. 변경 시 client를 차단하고도
  registry restore, `wineserver -k`, drive rollback, lock release는 계속한다.

## client lineage manifest v1

경로는 manifest 기준 상대 경로 또는 절대 경로다. 모든 SHA-256은 64자 소문자 hex다.
`working.peTimestamp`, `working.imageBase`, sentinel offset은 정수 또는 `0x` 문자열을 쓸 수 있다.

```json
{
  "schemaVersion": 1,
  "project": "logh7-revival",
  "sentinel": "LOGH7-WINE-LINEAGE-V1",
  "lineageStatus": "complete",
  "canonical": {
    "path": "/absolute/read-only/G7MTClient.exe",
    "sha256": "<64 lowercase hex>",
    "readOnly": true
  },
  "working": {
    "path": "/absolute/run-copy/G7MTClient.exe",
    "sha256": "<64 lowercase hex>",
    "workingCopy": true,
    "peTimestamp": "0x00000000",
    "imageBase": "0x00400000",
    "sentinels": [
      {"offset": "0x00000100", "hex": "00112233"}
    ]
  },
  "stages": [
    {
      "id": "canonical-working-copy",
      "inputSha256": "<canonical or previous output SHA-256>",
      "outputSha256": "<this stage output SHA-256>",
      "receipt": {"path": "receipts/copy.json", "sha256": "<receipt SHA-256>"},
      "backup": {"path": "backups/before.exe", "sha256": "<input SHA-256>"},
      "rollback": {"path": "rollback/restore.exe", "sha256": "<input SHA-256>"}
    }
  ]
}
```

검증기는 stage 0 input이 canonical hash와 같고, 각 stage의 input이 직전 output을
이으며, 마지막 output이 working hash와 같은지 검증한다. `receipt`, `backup`,
`rollback`의 실제 파일 hash도 같이 검증한다.

`LOGH7-WINE-LINEAGE-V1`이라는 기존 sentinel 이름은 schema 호환성을 위해 유지하지만
lineage gate 자체는 두 runtime에 공통이다. Wine adapter는 이 검사를 내부에서 수행하고,
native Windows 진입점은 `tools/logh7_ui_explorer.py` 실행 전에 같은 hash·PE timestamp·
image base·sentinel을 별도로 확인한다. `ui_explorer`는 lineage authority가 아니다.
하나라도 다르면 선택한 client runtime을 시작하지 않는다.

## run9 evidence index v1

이 gate는 `native-windows`와 `wine` 모두에 적용한다. `regression` mode에서는 다음
8가지 kind가 각각 단 한 번 나와야 하고 모든 파일 hash가
일치해야 한다: `client`, `patch`, `server`, `seed`, `world-entry`, `movement`,
`relogin`, `restart`.

```json
{
  "schemaVersion": 1,
  "project": "logh7-revival",
  "runId": "run9-redacted",
  "verdict": "pass",
  "artifacts": [
    {"kind": "client", "path": "client.json", "sha256": "<64 lowercase hex>"},
    {"kind": "patch", "path": "patch.json", "sha256": "<64 lowercase hex>"},
    {"kind": "server", "path": "server.json", "sha256": "<64 lowercase hex>"},
    {"kind": "seed", "path": "seed.json", "sha256": "<64 lowercase hex>"},
    {"kind": "world-entry", "path": "world-entry.json", "sha256": "<64 lowercase hex>"},
    {"kind": "movement", "path": "movement.json", "sha256": "<64 lowercase hex>"},
    {"kind": "relogin", "path": "relogin.json", "sha256": "<64 lowercase hex>"},
    {"kind": "restart", "path": "restart.json", "sha256": "<64 lowercase hex>"}
  ]
}
```

각 artifact path는 단순 임의 파일이 아니라 다음 의미 계약을 가진 JSON이어야 한다.
index와 artifact 모두 `verdict` 또는 `status`가 `pass|passed`여야 한다.

```json
{
  "schemaVersion": 1,
  "project": "logh7-revival",
  "runId": "run9-redacted",
  "kind": "client",
  "verdict": "pass"
}
```

artifact의 `runId`는 index `runId`와 같아야 하고 `kind`도 index entry와 같아야 한다.
hash만 맞는 더미 JSON은 regression baseline으로 인정하지 않는다.

run9 index가 없을 때는 `recovery-baseline`만 쓸 수 있고, 이도 lineage 전체가
`complete`일 때만 `ready`가 된다. `verdictCeiling` 값은 항상
`recovery-baseline-only`이며 gameplay pass 근거가 아니다.

## 실행 예시

### Native Windows

먼저 `sys.platform`, host architecture, exact client lineage와 native environment를 run의
`environment.json`에 기록한다. 다음 명령의 `--exe`는 생략하지 않는다. 생략 시 사용하는
default overlay 선택 경로는 공통 lineage gate를 대신하지 않는다.

```powershell
py -3 -c "import json, platform, sys; print(json.dumps({'hostPlatform': sys.platform, 'hostArchitecture': platform.machine(), 'runtimeMode': 'native-windows'}))"

py -3 tools/logh7_ui_explorer.py `
  --session 'C:\absolute\repo\_workspace\logh7-revival\runs\<RUN_ID>\native-session' `
  start `
  --exe 'C:\absolute\installed-root\working\G7MTClient.exe'

py -3 tools/logh7_ui_explorer.py `
  --session 'C:\absolute\repo\_workspace\logh7-revival\runs\<RUN_ID>\native-session' `
  shot --label login

py -3 tools/logh7_ui_explorer.py `
  --session 'C:\absolute\repo\_workspace\logh7-revival\runs\<RUN_ID>\native-session' `
  info
```

`start`는 검증된 EXE를 parent directory CWD에서 직접 실행하고 PID/HWND와 초기 screenshot을
native session에 기록한다. EXE hash를 session에 기록하지만 PE metadata, sentinel, run9,
registry rollback까지 검증하는 authority는 아니므로 이 값들은 시작 전에 공통 receipt에서
별도로 닫아야 한다.

정상 종료를 먼저 시도하고, 남은 client가 있으면 이 run이 기록한 PID만 정리한다.

```powershell
py -3 tools/logh7_ui_explorer.py `
  --session 'C:\absolute\repo\_workspace\logh7-revival\runs\<RUN_ID>\native-session' `
  stop

py -3 tools/logh7_ui_explorer.py `
  --session 'C:\absolute\repo\_workspace\logh7-revival\runs\<RUN_ID>\native-session' `
  info
```

마지막 `info`의 `clientAlive: false`, 전용 port listener 0개, registry·EXE·overlay pre/post
hash 일치가 cleanup evidence에 포함되어야 한다. Native Windows에서는 `wineserver`를
실행하거나 Wine prefix를 정리하지 않는다.

### Wine on macOS/Linux

먼저 marker와 preflight receipt만 생성한다.

```bash
python3 tools/live/logh7_wine_live_qa.py \
  --wine-bin '/absolute/Wine.app/Contents/Resources/wine/bin/wine' \
  --wineboot-bin '/absolute/Wine.app/Contents/Resources/wine/bin/wineboot' \
  --wineserver-bin '/absolute/Wine.app/Contents/Resources/wine/bin/wineserver' \
  --wine-prefix '/absolute/external-prefix-root/20260716T130000Z-a1b2' \
  --run-id '20260716T130000Z-a1b2' \
  --client-exe '/absolute/working-copy/G7MTClient.exe' \
  --lineage-manifest '/absolute/client-lineage.json' \
  --runtime-support-manifest '/absolute/runtime-support.json' \
  --run9-evidence '/absolute/run9/index.json' \
  --prefix-mode wow64 \
  --prepare-prefix
```

위 예시의 `wow64`는 pure win32 prefix를 지원하지 않는 Wine Stable 11 계열용이다. 다른
배포본은 실제 runtime capability를 확인해 `win32` 또는 `wow64`를 명시하되 자동 fallback은
하지 않는다. 새 prefix의 실제 초기화에는 같은 mode와 `--initialize-prefix`를 사용한다.

실제 클라이언트 호출은 preflight가 `ready`인 같은 입력에 `--execute`를 추가한 별도
stateful run으로만 수행한다. 새 prefix를 초기화할 때만 `--initialize-prefix`를 추가한다.
이 명령과 Wine 인자는 native Windows 경로에서 사용하지 않는다.

Wine adapter는 client 종료 뒤 검증된 absolute `WINESERVER_BIN`으로 해당 전용 prefix만
정리하고 drive mapping, registry, execution lock을 복구한다. 정상 경로와 emergency 경로
모두 wineserver 결과, drive post-snapshot, registry restore 또는 보존된 backup을 receipt에
남긴다. cleanup 결과가 receipt에 닫히지 않으면 `pass`로 올리지 않는다.

## 증거 저장과 판정

raw 증거는 `_workspace/logh7-revival/runs/<RUN_ID>/`에 둔다.

- 공통 `evidence-manifest.json`은 `runtime.mode`, client lineage, run9/recovery 입력,
  host/client evidence, correlation, process·port cleanup, registry·client rollback을 가리킨다.
- native Windows는 `environment.json`, `native-session/session.json`, screenshot, PID/HWND와
  `info`·`stop` 결과를 연결한다.
- Wine mode의 기본 P0 receipt는
  `_workspace/logh7-revival/runs/<RUN_ID>/p0-wine-preflight-receipt.json`이다.
- `_workspace/`는 gitignored raw scratch다. 독립 review를 통과한 redacted index와 synthesis만
  원본 artifact SHA-256 연결을 유지해 `docs/verification/logh7/<RUN_ID>/`로 승격한다.
- 인증 payload, password, 원시 memory dump, raw PCAP은 tracked 경로에 넣지 않는다.

`pass`는 `RUN_MODE=regression`에서 host/server evidence와 선택한 client runtime의
natural-output evidence, correlation, cleanup, rollback이 모두 닫혔을 때만 허용한다.
자동 테스트, P0 receipt, screenshot 중 하나만으로 gameplay 성공을 주장하지 않는다.

## 2026-07-17 macOS fresh 관측

- Wine Stable 11에서 pure `win32` prefix 초기화는 지원되지 않았고, 명시적
  `--prefix-mode wow64` prefix는 `#arch=win64`·완성된 WoW64 layout으로 초기화됐다.
- 서버 `127.0.0.1:47900` ready와 실제 `G7MTClient.exe` 프로세스 시작을 확인했다.
  서버 trace는 `0x0034 → 0x0035 → 0x0036 → 0x0030` 로그인 흐름 뒤
  `invalid-credentials`와 login-ng 응답을 기록했다.
- 클라이언트는 exit `3`으로 종료됐고 로그인 시 runtime error는 사용자 화면에서
  관측됐다. 따라서 Wine launch·서버 도달은 확인했지만 로그인·게임플레이와
  cross-platform 전체 `pass`는 성립하지 않는다.
- registry는 absent 상태로 복구됐다. 최초 live receipt의 자동 drive mapping release는
  실패 판정이었고, 동일 target 재생성을 exact 복구로 처리하는 수정은 단위 테스트까지만
  통과했다. 수정 후 live cleanup receipt는 아직 재관측하지 않았다.

## 라이브 런 기록

### 2026-07-17 native Windows login-success

**명령 및 PID:**
- Server: `cd server && npm start` (PID 29912, 127.0.0.1:47900 ready)
- Client: native Windows direct execution (PID 31108, runtime_mode=native-windows)
- Evidence path: `_workspace/liveqa-20260717-winnative/`

**Verdict: login-success — 로비 진입까지 도달 (in-game gameplay·relogin·persistence 미종결)**
- lineage PASS: EXE sha256 `825635783a9fb663ae3b9a2ecf8d4b74df648322256c57ee32f6426c42a23f22` matches canonical, timestamp 0x40779eb8, image base 0x00400000, sentinel verified, mismatch 없음.
- 서버 trace: `0x0034→0x0035→0x0036→0x0030` 로그인 핸드셰이크 → `authOk=true reason=null` → 로비 `okCode=0x2001 characterCount=1` → roster pull(0x2003/0x2005).
- 정규 계정 `inei00/dummy` 무변경, 클라이언트 native Windows 직접 실행, 1920×1080 로비 메인 메뉴 완전 렌더 확인.
- cleanup receipt: listener 0개(`PORT-47900-CLEAN-NO-LISTENER`), g7mtclient 프로세스 0개, 기록된 2 PID 종료, prefix 밖 변경 0개, server/data/** 무변경.

**미종결:**
- in-game 월드진입·이동·relogin·restart persistence 미수행.
- run9 frozen baseline chain 없어 regression full-pass 미승격.

**하네스 수정(2026-07-17, macOS invalid-credentials 원인 해소):** 이번 런에서 재현된 첫 글자 누락(`inei00`→`nei00`, screenshot 02)의 원인은 QA 하네스 `tools/logh7_ui_explorer.py`가 포그라운드 전환 직후 활성화 확인 없이 첫 키를 보낸 레이스였다(제품 버그 아님). `_force_foreground`가 `GetForegroundWindow`로 전환을 확인(≤5회 재시도)하고 `_build_type_sequence`가 첫 실문자 앞에 필드 무해한 lone SHIFT warm-up을 prepend하도록 수정. 단위 테스트 17개 통과·독립 리뷰 PASS. 라이브 재검증(`inei00` 1회 시도 로그인 성공)은 후속 live-qa run 대기. macOS login-ng도 같은 메커니즘으로 설명된다.
