# LOGH VII Wine Live-QA P0 계약

`tools/live/logh7_wine_live_qa.py`는 원본 클라이언트를 Wine으로 실행하기 전에
toolchain, run 전용 prefix, EXE lineage, run9 증거를 fail-closed로 검증한다.
기본 동작은 subprocess를 하나도 시작하지 않는 preflight이다. `--execute`를 명시해도
이 P0 receipt 하나로 전체 gameplay `pass`를 판정하지 않는다.

## 안전 경계

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
- prefix에 `system.reg`가 있으면 파일 앞 64행에 `#arch=win32`가 단 한 번 있어야
  한다. `win64`, 누락, 중복, 미지 값은 실행 전 blocker다.
- `system.reg`가 없는 새 prefix를 실행할 때는 `--initialize-prefix`가 필수다.
  이 경우 `WINEARCH=win32 wineboot -u`가 `wine --version`보다도 먼저 실행되는 첫 Wine
  호출이다. wrapper의 `--version`도 registry를 변경할 수 있어 순서를 바꾸지 않는다.
  `wineboot -u` 완료 직후 새 `system.reg`의 `#arch=win32`를 다시 검증하기 전에는
  version/client를 시작하지 않는다. 올바른 architecture가 생성되지 않으면 두 호출을
  건너뛰고 해당 prefix의 wineserver cleanup만 수행한다. receipt의
  `prefixArchitecture.expectedArch`는 항상 `win32`이다.
- canonical EXE는 `readOnly: true`와 실제 파일 mode의 write bit 0을 모두 만족해야 한다.
  canonical, working, 모든 backup, 모든 rollback은 전체 조합에서 서로 다른
  path/inode를 사용해야 하며 hardlink alias도 거부한다.
- 실제 실행 시 모든 호출은 같은 명시적 `WINEPREFIX`를 받는다. `WINEARCH=win32`은
  `wineboot -u` 초기화 호출에만 들어간다.
- subprocess launch가 `OSError`/`FileNotFoundError`/`PermissionError`로 실패해도
  `launchError` receipt를 남기고 version/client를 건너뛴 뒤, 검증된 전용 prefix의
  wineserver cleanup을 별도로 시도한다. cleanup 예외도 숨기지 않고 receipt에 남긴다.
- host 환경은 allowlist로 재구성한다. `WINESERVER`, `WINELOADER`, `WINEDLLPATH`,
  `WINEDLLOVERRIDES`, `WINEDEBUG`, 모든 `DYLD_*`와 기타 미등록 key를 자식 Wine
  process에 전파하지 않는다. allowlist·제거 key·강제 key는
  `environment.wineEnvironmentPolicy`에 기록한다.
- 현재 legacy launcher 계약의 client argument allowlist는 빈 목록이다. `--client-arg`는
  deny-by-default로 차단하고 입력 값을 blocker, command plan, stdout receipt에 남기지
  않는다. 실제 baseline은 client argument 없이 실행한다.

## runtime support manifest v1

`--runtime-support-manifest`는 project/run ID, `LOGH7-WINE-RUNTIME-SUPPORT-V1`,
profile/provenance, `installedRoot`, `clientRelativePath`, `drive`, `dataInventory`,
runtime `files`를 필수로 가진다.

- 현재 lineage는 `<installedRoot>/working/G7MTClient.exe`를 쓴다. legacy
  `<installedRoot>/exe/G7MTClient.exe`는 manifest에 명시했을 때만 허용한다.
- `1080p-dgvoodoo`는 working CWD의 `GraphicConfig.txt`, `D3D8.dll`,
  `dgVoodoo.conf`를 exact path/size/SHA-256/provenance로 묶는다. `native`는
  D3D8 pair 없이도 가능하지만 config는 필수다.
- `dataInventory`는 exact manifest SHA-256과 `LOGH7-DATA-TREE-MANIFEST-V1`을
  검증한다. 현재 기준 2,185개 regular file의 sorted
  `path\0size\0sha256\n` digest/count/total bytes를 재계산하며 extra, missing,
  symlink, size/hash 변경을 모두 거부한다.
- `drive`는 예를 들어 `R:`만 external installed root에 mapping한다.
  client/data/registry Install은 이 drive만 쓰고, `Z:`→host root는 client·cleanup
  전체 구간에 quarantine한다. 예상 밖 mapping은 blocker다.
- `HKCU\Software\BOTHTEC\銀河英雄伝説VII\1.0`을 변경 전 export하고
  `Install=<windowsInstallRoot>`를 검증한다. client 종료 후 key 전체를
  delete/import/export해 pre/post export SHA-256이 같아야 한다. 원래 key가
  없었다면 absent로 복구한다.
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
`rollback`의 실제 파일 hash도 같이 검증한다. manifest sentinel 바이트, PE timestamp,
image base 중 하나라도 다르면 Wine을 시작하지 않는다.

## run9 evidence index v1

`regression` mode에서는 다음 8가지 kind가 각각 단 한 번 나와야 하고 모든 파일 hash가
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
  --prepare-prefix
```

실제 클라이언트 호출은 위 preflight가 `ready`인 같은 입력에 `--execute`를 추가한
별도 stateful run으로만 수행한다. 새 prefix를 초기화할 때만
`--initialize-prefix`를 추가한다.

기본 receipt 경로는
`_workspace/logh7-revival/runs/<RUN_ID>/p0-wine-preflight-receipt.json`이며 `_workspace/`는
저장소에서 ignore되는 raw scratch다. 독립 review를 통과한 redacted index와 synthesis만
원본 artifact SHA-256 연결을 유지한 채 `docs/verification/logh7/<RUN_ID>/`로 승격한다.
인증 payload, password, 원시 memory dump와 raw PCAP은 tracked 경로에 넣지 않는다.
