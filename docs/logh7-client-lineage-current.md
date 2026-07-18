# LOGH VII 클라이언트 계보 — current

## 현재 판정

`G7MTClient.exe`의 재현 가능한 현재 계보는 다음 다섯 단계다. 각 화살표는 입력 전체 SHA-256, 원본 바이트 guard, 출력 전체 SHA-256, 별도 backup·rollback·receipt로 닫힌다.

```text
bd19263c10decc3d58373165a82d42a9267868400d407da87d5f4f4109ab6e16
  └─ login server literal 1개: 202.8.80.179\0 → 127.0.0.1 + NUL padding
2848be76a7662e25159353463bdfd8ff2f270ac5845ef4cea62983443c155345
  └─ 현재 canonical .text 패치 6개
9c97de2ae426f011680992d6c8d88b25488b5f51555ce5784aeef677f334bb51
  └─ hardcoded-ui-ko PE resource 136개
24d79d90e1618309f05932156787e5a140d5f6d57ce008f6c09b00360da3ab3b
  └─ direct-client 고정 길이 패치 10개
5bdd64f1f9a8cca93f5b1002291d6a2c7e8f5ce555b062b8cb48337b96277d89
  └─ 로그인 이후 1080p 패치 59개
825635783a9fb663ae3b9a2ecf8d4b74df648322256c57ee32f6426c42a23f22
```

### `2848be76…` 오기 정정

`2848be76…`은 현재 증거에서 **pristine, 무수정 원본, 공식 업데이트본이라고 부를 수 없다.** 실제 `bd19263c…` 파일의 raw `0x36ee3c`에는 정확히 13바이트 `202.8.80.179\0`이 있고, 이를 `127.0.0.1` 뒤 NUL 4바이트로 같은 길이 치환하면 출력 전체 해시가 정확히 `2848be76…`이 된다. 따라서 현재 계보에서 `2848be76…`은 `loopback intermediate`다.

역사 영수증 `server/content/generated/logh7-exe-patch-manifest.json`은 당시 기록 보존을 위해 수정하지 않는다. 그 파일의 6개 바이트 patch 계약은 새 `server/content/client/logh7-canonical-client-patch.json`에 재사용했지만, “2848은 pristine이고 loopback literal은 원래부터 존재했다”는 설명은 현재 실바이트와 모순되므로 current 근거가 아니다. `2848be76…`이 별도의 공식 배포물과 우연히 동일한지 여부도 공식 updater 산출물·서명·배포 provenance가 추가로 없으면 확정하지 않는다.

## 재구성 계약

`tools/live/rebuild_logh7_client_lineage.mjs`는 다음을 fail-closed로 강제한다.

- `--source`, `--output-root`, `--python`은 모두 절대경로여야 한다.
- output root는 저장소 밖에 있어야 하고 실행 전에 존재하면 안 된다. 기존 경로 재사용, overwrite, source in-place patch는 지원하지 않는다.
- 입력은 `bd19263c…` 전체 해시와 13바이트 IP signature가 모두 맞아야 한다.
- `exe-patch.mjs`, resource patcher, 번역 map의 전체 해시를 pinned 값과 비교한다. Python interpreter도 해시해 영수증에 기록한다.
- 각 단계는 서로 다른 `output.exe`, `input-backup.exe`, `rollback.exe`, `receipt.json`을 만든다. backup과 rollback은 그 단계 입력 전체 해시로 다시 검증한다.
- canonical source copy는 `0444`, 최종 working copy는 별도 inode·별도 경로로 만든다.
- 최종 working EXE에서 PE timestamp `0x40779eb8`, image base `0x400000`, 고정 patch sentinel과 file head/tail을 추출한다. 전체 EXE 해시와 sentinel set 해시를 함께 기록한다.
- 모든 단계가 끝난 뒤에만 `LOGH7-WINE-LINEAGE-V1` `client-lineage.json`을 작성하고 staging directory를 원자적으로 승격한다. identifier 이름은 기존 Wine adapter·receipt 호환을 위한 literal이며 lineage schema와 gate 자체는 native Windows와 Wine에 공통이다. 중간 실패 시 staging을 지우며 final root를 만들지 않는다.
- EXE·backup·rollback·working copy는 proprietary artifact이므로 저장소에 쓰거나 커밋하지 않는다.

## 실행

output root의 **부모 디렉터리만** 미리 준비하고, output root 자체는 없는 상태에서 실행한다.

```bash
/Users/apple/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node \
  /Users/apple/Desktop/개인프로젝트/logh7-revival/tools/live/rebuild_logh7_client_lineage.mjs \
  --source /absolute/path/to/bd19263c/G7MTClient.exe \
  --output-root "/Users/apple/Library/Application Support/logh7-revival/lineages/<RUN_ID>" \
  --python /Users/apple/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3
```

성공 출력의 `manifestPath`와 `workingPath`는 실행 환경과 무관한 공통 P0 lineage 입력이다. native Windows에서는 검증된 `workingPath`를 `tools/logh7_ui_explorer.py` 또는 직접 시나리오 하네스에 넘기며 Wine을 요구하지 않는다. macOS/Linux에서는 `logh7-wine-live-qa`의 `--lineage-manifest`, `--client-exe`, 저장소 밖 전용 `WINEPREFIX`, exact Wine tool 절대경로 gate를 통과한다. 재구성 자체는 어느 host에서도 client runtime을 실행하지 않는 정적 패치 단계다.

## 검증 기준

- 기본 targeted suite: production manifest 계약, 합성 5단계 chain, P0 validator 소비, artifact 경로 유일성, `0444` canonical, rollback 전체 해시, 기존 output 거부, 저장소 내부 output 거부, 중간 patcher 실패의 원자적 cleanup, unknown source fail-closed.
- 실제 EXE integration은 `LOGH7_LINEAGE_INTEGRATION=1`일 때만 실행한다. 현재 checkout의 `bd19263c…` source로 `1 + 6 + 136 + 10 + 59` patch count와 최종 `825635…`을 확인하며 결과는 OS 임시 외부 root에만 만들고 테스트 종료 시 제거한다.
- 이 gate는 계보 재현 증거다. 선택된 runtime의 창 렌더, 로그인, 월드 진입, 두 클라이언트 동기화 또는 run9 회귀 성공을 대신하지 않는다. `tools/logh7_ui_explorer.py`의 EXE SHA 기록도 이 공통 lineage gate를 대신하지 않는다.

## 패치 노드 재베이스라인 (LOGH7-201 인프라)

경로 A(원본 클라 바이너리 패치)로 만든 patched 클라를 **새 계보 노드로 정식 승격**하되 fail-closed 무결성을 약화하지 않는 인프라. 설계 정본은 `docs/logh7-social-simulation-design.md` §"Lineage & Rebaselining Gate". 실제 EXE 패치·실행은 이 인프라가 아니라 인간 승인 하 별도 티켓(LOGH7-212)에서 exact RE 바이트로 수행한다 — 이 인프라는 합성 fixture로만 검증됐고 실 g7mtclient.exe를 접촉하지 않는다.

### 패치 매니페스트 스키마 (선언적·재현가능)

손으로 편집한 바이너리를 축복하지 않는다. patched 산출물은 오직 `원본 + transform_ops`로만 정의된다.

```
patch_manifest_id, parent_hash(검증된 base 전체 sha256),
transform_ops[]  = {op:"replace", offset, expect(hex 가드), bytes(hex 동일길이)}
                 | {op:"append",  bytes(hex 코드케이브)},
expected_new_hash(재생성 결과 전체 sha256), image_base, sentinel_set[{offset,hex}],
capability_profile, provenance, approval_ref
```

### 재현가능 패처 — `tools/live/lineage_patcher.py`

`apply_patch_manifest(base_bytes, manifest)`: (1) `parent_hash`가 base 해시와 일치, (2) 각 replace op의 `expect` 가드 바이트 확인, (3) 결과 해시가 `expected_new_hash`와 일치 — 셋 다 통과해야 산출물 반환, 아니면 `PatchError`(부분 산출물 없음). 같은 입력 → 같은 바이트·같은 hash(CLI `python -m tools.live.lineage_patcher --base --manifest --output`로 CI 재검증). `derive_authorized_node(manifest)`가 patch manifest를 gate용 인가 노드로 무손실 투영한다(단일 진실원).

### 게이트 확장 — 인가된 계보 노드 집합 (fail-closed 보존)

`tools/live/lineage_guard.py`의 `check_client_lineage_set(exe, nodes)`: v2 매니페스트 `authorizedNodes`(원본 + 승인된 패치 노드) 배열을 받아, **자격 있는 노드 중 하나에 sha256·image base·sentinel 전부 매치**하면 accept한다. `tools/logh7_ui_explorer.py`의 `--lineage-manifest`가 `authorizedNodes`를 감지하면 이 경로를, 없으면 기존 v1 `working` 단일 블록 경로를 쓴다(병존).

**절대 약화 금지 불변식**:
- 미상/미인가 hash는 어느 노드에도 완전 매치하지 않으므로 여전히 fail-closed 차단(`matchedNode: null`, exit 3).
- 원본 노드는 계속 인가 — 원본·패치 병존.
- 패치 노드는 `capability_profile`·`provenance`·`approval_ref`를 모두 갖춰야 인가된다. **없으면 hash가 정확히 맞아도 그 노드는 hash를 축복하지 못한다**(승인 안 된 패치가 통과 못 함).
- 실 patched 클라 승격은 여전히 인간 승인 게이트 — 인프라는 절차를 강제할 뿐 자동 승인이 아니다.
