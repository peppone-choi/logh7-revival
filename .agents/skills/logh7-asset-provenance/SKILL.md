---
name: logh7-asset-provenance
description: "Classify, review, and package LOGH VII original, decoded, remastered, hand-authored, generated, or community assets with source hashes, rights metadata, R0-R3 provenance, original fallback, default-off activation, and tested rollback. Use for extraction, localization, remaster, mod packs, engine spikes, previews, imports, or asset distribution decisions."
---

# LOGH VII Asset Provenance

모든 asset이 어디서 왔고 무엇이 바뀌었으며 어떤 권리로 사용할 수 있는지 증명한다. original은 read-only fallback이고 remaster/mod/generated output은 분리된 optional overlay다.

## 등록 전 필수 입력

다음 항목이 없으면 asset을 runtime, pack, engine PoC에 넣지 않는다.

- stable `assetId`, family, logical source locator.
- source bytes의 SHA-256, byte size, format, dimensions/duration/mesh metadata.
- source 종류: CD/install/manual/official archive/user-supplied/community/generated.
- owner/copyright holder, license 또는 rights status, acquisition source/date, redistribution 제한.
- transform 입력·도구·version·정확한 command/settings·output hash.
- R0-R3 grade와 canonical 여부.
- original fallback asset/hash, default activation, rollback 절차.
- reviewer, review evidence, known limits.

hash를 계산할 source bytes가 없거나 license/rights status를 알 수 없으면 `blocked`로 둔다. URL, 파일명, screenshot만으로 original을 확정하지 않는다.

## R0-R3 계약

| 등급 | 의미 | canonical | 배포/활성 원칙 |
| --- | --- | --- | --- |
| `R0` | original asset의 byte-identical copy | 원본 해시가 맞을 때만 true | read-only fallback; proprietary bytes는 commit 금지 |
| `R1` | original-derived remaster, upscale, cleanup, format/quality 변경 | false | optional overlay, default-off, R0 fallback 필수 |
| `R2` | 사람이 새로 제작한 replacement | false | 별도 저작권/license와 original reference 기록 |
| `R3` | generated 또는 community placeholder/prototype | false | 개발·review 전용, default-off, 명확한 placeholder 표시 |

- lossless decode/export는 `R0-derived` lineage qualifier를 쓴다. output bytes가 원본과 다르므로 `R0` canonical original로 표시하지 않는다.
- AI/tool-generated output은 항상 `R3`이며 **non-canonical**이다. review, 수정, packaging을 거쳐도 original/canonical로 승격하지 않는다.
- generated 기반 위에 사람이 손본 사실은 generation lineage를 지우지 않는다.
- P0/P1 gameplay evidence grade와 R0-R3 asset grade를 혼용하지 않는다.

## Rights와 proprietary binary 경계

- proprietary CD/ISO/BIN/CUE/CAB/EXE/DLL/DAT/model/audio/image payload를 새로 commit하거나 재배포하지 않는다. Git LFS도 예외가 아니다.
- 기존 legacy pointer나 역사적 artifact를 다른 경로로 복사·확대하지 않는다. 별도 cleanup 결정 전에는 hash/source inventory로만 다룬다.
- proprietary source와 raw extraction은 repo 밖 user-controlled storage 또는 gitignored scratch에 둔다.
- tracked repository에는 source locator, expected hash, acquisition/extraction recipe, rights status, redacted preview/index만 둔다.
- copyrighted manual/setting-book scan, user-supplied reference, community asset도 명시적 redistribution 권리 없이는 raw file을 commit하지 않는다.
- API key, account token, paid-generation receipt의 secret, 개인 식별자를 manifest에 넣지 않는다.
- license가 없다는 사실을 `public domain`으로 추정하지 않는다. `proprietary-no-redistribution|licensed|permission-required|unknown|generated-by-project`처럼 상태를 명시한다.

## 원본 보호와 overlay

- original root를 read-only로 취급하고 transform output을 같은 경로에 쓰지 않는다.
- pack의 `enabledByDefault`는 항상 `false`로 시작한다.
- pack enable 전에 target original hash, supported client/server/contract version, conflict list를 확인한다.
- fallback은 실제 존재하는 R0 또는 검증된 runtime extraction recipe를 가리킨다.
- rollback은 파일 교체 전후 hash, registry/config 변화, 삭제/복원 순서, 실패 시 복구 path를 가진다.
- fallback이나 rollback을 실제로 확인하지 못하면 pack을 `ready`로 만들지 않는다.

## Deterministic manifest

asset 하나당 최소 다음 schema를 사용한다.

```json
{
  "schemaVersion": 1,
  "assetId": "...",
  "family": "portrait|ui|texture|model|audio|font|video|other",
  "grade": "R0|R1|R2|R3",
  "lineageQualifier": "byte-identical|R0-derived|hand-authored|generated|community",
  "canonical": false,
  "source": {
    "kind": "...",
    "locator": "...",
    "sha256": "...",
    "byteSize": 0,
    "owner": "...",
    "license": "...",
    "rightsStatus": "...",
    "redistributionAllowed": false
  },
  "transform": {
    "tool": "...",
    "version": "...",
    "commandOrSettings": "...",
    "inputSha256": ["..."],
    "outputSha256": "...",
    "generated": false,
    "promptReceipt": null
  },
  "activation": {
    "enabledByDefault": false,
    "fallbackAssetId": "...",
    "fallbackSha256": "...",
    "hashGuard": "...",
    "rollback": "..."
  },
  "review": {
    "status": "blocked|prototype|approved-overlay|rejected",
    "reviewer": "...",
    "evidence": [],
    "limits": []
  }
}
```

R0만 `canonical: true`가 가능하다. R1-R3과 `R0-derived` output은 항상 false다. generated asset은 `transform.generated: true`, reproducible prompt/model/version/seed receipt를 가져야 하지만 secret은 redaction한다.

## Workflow

1. **Intake:** source locator, bytes, SHA-256, rights/license를 등록한다.
2. **Quarantine:** source와 output을 original/read-only, work, overlay root로 분리한다.
3. **Transform:** versioned tool/settings로 한 output을 만들고 모든 input/output hash를 기록한다.
4. **Classify:** R0-R3, lineage qualifier, canonical=false/true를 규칙대로 부여한다.
5. **Review:** original/reference와 output을 같은 crop/angle/volume/scene에서 비교하고 artifact defect와 canon drift를 기록한다.
6. **Package:** manifest-driven overlay로 만들고 `enabledByDefault=false`, conflict/hash guard, fallback, rollback을 포함한다.
7. **Acceptance:** legacy client가 소비하면 `$logh7-wine-live-qa`의 별도 A/B run, future candidate가 소비하면 `$logh7-engine-spike` acceptance로 확인한다. 두 verdict를 합치지 않는다.
8. **Promotion:** redacted manifest/index와 review만 tracked verification 경로로 승격한다.

## Generated asset 추가 규칙

- generated image/model/audio는 R3 prototype으로 시작한다.
- source reference/crop/page, prompt chain, generator/model/version, seed/settings, output hash, cost/license terms를 기록한다.
- 3D는 mesh topology, scale, orientation, texture/material, animation/import preview를 review한다.
- audio는 source, loudness, sample rate/codec, loop/click, in-client playback을 review한다.
- generated output에 원작 logo, portrait, ship silhouette를 임의로 발명하고 canonical이라고 표시하지 않는다.
- 권리·유사성 review가 끝나지 않은 output은 공유/배포 pack에 넣지 않는다.

## Fail-closed 조건

다음 중 하나면 `blocked` 또는 `rejected`다.

- source hash/locator/owner/license/rights status 누락.
- R1-R3 또는 decoded/generated output을 original/canonical로 표시.
- generated 사실이나 prompt/model lineage를 숨김.
- original root overwrite 또는 in-place patch.
- original fallback, default-off, hash guard, rollback 중 하나 누락.
- proprietary binary/raw scan을 commit 또는 배포하려 함.
- output hash와 packaged hash가 다름.
- reviewer가 source와 output을 같은 조건에서 비교하지 않음.

## 산출물

raw source/work/output은 gitignored `_workspace/logh7-revival/assets/<ASSET_RUN_ID>/` 또는 repo 밖 rights-controlled storage에 둔다.

```text
request.json
source-index.json
asset-manifest.json
transform-receipt.json
review.json
package-index.json
rollback-receipt.json
```

승인된 redacted manifest, review, package index만 `docs/verification/logh7/assets/<ASSET_RUN_ID>/`로 승격한다. tracked index에는 raw manifest SHA-256과 output/fallback hash를 남기되 proprietary bytes, secret, 권리 없는 source/preview는 포함하지 않는다.
