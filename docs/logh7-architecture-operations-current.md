# LOGH VII Architecture and Operations

2026-07-04 G070 Unity 클라이언트 완전 삭제: 사용자 "완전 삭제" 결정에 따라 `client-unity/` 작업트리를 제거했다(보존 커밋 `dbf3b43` → 제거 커밋 `ca24dd3`, 9226 files deleted). G069의 재이식 장기 목표는 유지되나 현재 작업트리에는 Unity 프로젝트가 없다 — 재이식 착수 시 먼저 git 히스토리에서 복원해야 한다. 이하 G0xx Unity 운영 항목(원본 UI 수출, StreamingAssets export, 로그인 실서버 연동 등)은 과거 기록으로만 유효하다.

2026-07-04 G069 아키텍처 재전환: "2026-07-03 Architecture Reorientation"(레거시 클라 수정→증거기반 재구현 이동)을 잠정 대체하고, 정규 구현 경로를 **레거시 클라이언트 직접 패치**로 되돌린다. 사용자 지시: "안되겠다. 레거시 클라 수정으로 다시 가야겠다. 나중에 이거 RE가 전부 끝나고 돌아갈때 옮겨야 겠어. EXE가 맞지도 않아." Unity(`client-unity/`)는 정규 런타임에서 제외되어 개발 정지 상태로 보류되며, RE 완료 후 재이식 대상으로만 유지한다. 서버(`server/`)의 데이터/스펙 카탈로그·마이닝 파이프라인은 계속 유효한 증거/오라클 소스로 남되, 그 1차 소비자가 Unity에서 레거시 EXE 패치 작업으로 바뀐다. Operating Model의 세 경로(Data/spec, Future game/Unity, Oracle diagnostics) 중 "Oracle diagnostics path"가 현재 정규 실행 경로로 승격된다 — `ui_explorer`/직접 EXE 실행/트레이스 도구는 더 이상 진단 전용이 아니라 정규 개발 도구다.

2026-07-04 G068 원본 UI 수출 확장: `logh7-original-ui-image-export.mjs`의 EXPORT_LIST 항목에 `mode: "copy"`를 주면 JPG 등 Unity 네이티브 포맷을 바이트 그대로 복사한다(provenance `original-byte-copy(R0)`). TGA는 기존 디코드 경로. 수출 후 `catalog:unity-streamingassets-export` 재생성 필수(fileCount 17). 로비 룸 배경은 EXE 포맷 문자열 `bg%03d.jpg` 기반이므로 룸 인덱스↔시설 매핑 마이닝 전까지 bg005(EXE 기본값)만 사용한다.

2026-07-04 G067 로그인 실서버 운영: Unity 플레이어 로그인 QA는 `npm --prefix server run serve:session -- --accounts <json> --port 8047`을 먼저 띄우고 플레이어를 실행한다(계정 파일 형식 `[{"accountId","passwordHash"}]`, 해시는 `hashPassword`). 서버 미기동 시 플레이어는 원본 문자열 `ログインサーバーへの接続に失敗`를 표시하고 로그인 게이트에 머문다 — 이는 의도된 fail-closed이며 개발 표면 QA에도 서버 기동이 전제된다. 원본 클라이언트 오라클 실행(스플래시/화면 대조용 진단)은 `.omo/work/logh7-installed/exe/G7MTClient.exe` 직접 실행+주기 캡처로 수행했고 정상 런타임으로 승격하지 않는다.

2026-07-04 G066 원본 UI 이미지 수출 운영: `server/src/server/logh7-original-ui-image-export.mjs` + `npm --prefix server run export:original-ui-images`가 원본 TGA(타입1 컬러맵/타입2 truecolor, 비압축, 그 외 fail-closed)를 의존성 없는 최소 PNG 인코더로 디코드해 `client-unity/Assets/StreamingAssets/logh7/original/` 아래로 내보내고 `server/content/generated/logh7-original-ui-image-manifest.json`을 갱신한다. 새 원본 화면을 Unity에 붙일 때는 이 수출 목록에 TGA를 추가 → `export:original-ui-images` → `catalog:unity-streamingassets-export`(fileCount 16) 순으로 재생성한다. `client-unity/Packages/manifest.json`은 `com.unity.modules.imageconversion`/`imgui`를 명시한다(슬림 매니페스트 built-in 모듈 교훈). 로그인 게이트 렌더는 `Logh7GalaxyPrototypeRuntime.DrawLegacyLoginPanel`이 640x480 가상 좌표계를 화면 스케일로 사상한다.

2026-07-04 G048 Unity scene-panel manifest operation: regenerate `npm --prefix server run catalog:unity-streamingassets-export` after editing `logh7-unity-scene-surface-panels.json`; expected export fileCount is now 15 and includes `logh7-unity-scene-surface-panels.json`. Runtime remains Unity-main, original EXE oracle-only, canonical promotion blocked.

2026-07-04 Unity scene-panel operation: `client-unity/Assets/Scripts/Logh7GalaxyPrototypeRuntime.cs` now maps each of the 10 scene catalog surfaces to a visible selected-surface panel in the built Windows player. Rebuild with Unity 6000.5.2f1 and verify with `.omo/ulw-loop/evidence/g047-scene-panel-surfaces-compact-20260704/contact-sheet.png`; the panel text preserves original EXE oracle-only and blocked canonical-promotion boundaries.

2026-07-03 CD-first architecture update: normal revival pipeline now begins with verified `artifacts/logh7-cd/Logh7.bin` + `Logh7.cue`, MODE2/2352 conversion, ISO filesystem extraction, InstallShield extraction, hidden-data scan, server-data scope catalog, and cross-check ledger before Unity import. Current content/generated catalogs and installed data are comparison inputs, not authority, until promoted by CD/manual/Ghidra/live/wire evidence.

Capability harness: use `.omo/rules/logh7-capability-harness.md` as the operational router for LazyCodex/OMO, Superpowers, gstack, LOGH7 skills, CodeGraph/LSP/Git Bash/ast-grep, and Compound Engineering evidence capture. Capability use is mandatory when matched; diagnostic-only tools remain diagnostics.

2026-07-04 G034 remaster provenance operation: `server/src/server/logh7-remaster-provenance-manifest.mjs` now exposes `outputs[]`-based manifest products as `provenance.outputAssets`, so the Imperial crest gold/silver/white masks cannot disappear behind a source-only hash. `catalog:remaster-provenance` writes the same manifest to `server/content/generated/logh7-remaster-provenance-manifest.json` and `client-unity/Assets/StreamingAssets/logh7/logh7-remaster-provenance-manifest.json`; proof hash `7af15a68b842742ea7c70c2a8e0fa11146067becc5bfae67ed1a1ca8254cd21d`. `catalog:unity-streamingassets-export` remains `fileCount=14` and recomputes the export after provenance changes.

2026-07-04 G044 Unity manifest-consumption operation: `Logh7GalaxyPrototypeRuntime` now builds a `streaming-assets export` status line from `client-unity/Assets/StreamingAssets/logh7/logh7-unity-streamingassets-export.json`, not from hardcoded completion assumptions. The server-side client-surface test checks the C# script against the actual export manifest, keeping `logh7-unity-source-pack-manifest.json`, `logh7-unity-runtime-manifest.json`, `logh7-remaster-provenance-manifest.json`, `logh7-unity-asset-source-truth.json`, and `logh7-ui-scene-remaster-gameplay-boundary.json` coupled to the Unity runtime surface.

2026-07-04 G039 archive media operation: `npm --prefix server run verify:source` and `npm --prefix server run extract:cd-media` are the current Archive BIN/CUE verification path. The manifest generated at `server/content/generated/logh7-cd-media-manifest.json` records the local original media as verified, converted ISO evidence as `converted`, and extracted ISO/InstallShield roots as present; it remains source authority evidence, not canonical game-data promotion.

2026-07-04 G040 extraction operation: the current CD extraction working roots are `.omo/work/logh7-cd-extract/iso-root` and `.omo/work/logh7-cd-extract/installshield-root`. Use `npm --prefix server run extract:cd-media` to refresh `logh7-cd-media-manifest.json`, then verify counts against direct filesystem inventory. The expected current counts are ISO root `25` files and InstallShield root `2207` files; any missing root is an exact blocker, not a prompt to infer or promote generated catalogs.

2026-07-04 G041 hidden-data operation: use `npm --prefix server run scan:hidden-data`, `classify:hidden-data`, and `report:hidden-data-watchlist` as the current hidden-data preservation chain. The chain scans raw BIN, converted ISO, ISO filesystem extract, and InstallShield extract; classification validates file-like signatures and deduplicates extracted copies; watchlist reporting isolates mandatory `systemPositions` and `originalCharacterRoster` categories. These outputs preserve candidates and must not become canonical game data until parsed and cross-checked.

2026-07-04 G042 server-data-family operation: use `npm --prefix server run catalog:server-data-family` to refresh `server/content/generated/logh7-server-servable-data-family.json`. The manifest is the current server data-surface scope ledger: `15` families, source manifest candidates per family, canonical promotion rule, and mandatory watch categories. `formulas` is now an explicit family and remains suspect until formula-specific evidence locks it.

2026-07-04 asset clarification operation: 제국 함선 렌더/리마스터 파이프라인은 `.omo/work/logh7-installed/data/model/Ship/GE/`, `server/content/extracted/model-ship.json`, `server/content/generated/logh7-imperial-medal-source-lock-manifest.json`를 사용한다. 제국 쌍두독수리 문장은 `client-unity/Assets/ArtSource/reference/logh7-imperial-double-eagle-reference.jpg`와 `client-unity/Assets/ArtSource/reference/imperial-crest/` 마스크를 사용한다.

2026-07-04 G043 galaxy trust operation: rerun `npm --prefix server run catalog:current-content-crosscheck`, `catalog:galaxy-trust-crosscheck`, `report:hidden-data-watchlist`, then `catalog:unity-streamingassets-export` whenever these source manifests change. This keeps current galaxy/system/star/planet data blocked from canonical promotion until original CD, manual chart, RE, and live/wire evidence align.

2026-07-04 G035/G036 gate operation: Unity product-surface manual QA attempted through Unity 6000.5.2f1 batchmode, but Licensing IPC blocked launch; evidence kept under `.omo/ulw-loop/evidence/g035-*`. Continue not to substitute `ui_explorer`, direct EXE, Frida, preseed, or direct Node as normal runtime QA. Scope fidelity is covered by `.omo/ulw-loop/evidence/g036-scope-fidelity-audit-20260704.log`, focused guard tests, and full server regression.

2026-07-04 G048 manual completeness operation: `server/content/generated/logh7-manual-completeness-ledger.json` is the read-to-completion ledger for the 101-page manual (catalog-claimed coverage from `_source` page ranges + workflow page-by-page reads of the 26 uncovered pages). New manual mining slices should start from its `miningGaps` list instead of rescanning pages. Page renders live under `.omo/work/manual-pages-101/`.

2026-07-04 G049 Unity session-flow operation: `Logh7SessionFlow` (in the `Logh7.Runtime` asmdef assembly) is the client-side scene-transition guard enforcing runtime-manifest gates; server responses remain the actual authority for advancing. EditMode tests reference `Logh7.Runtime` from `Logh7.EditModeTests`. Reuse `Logh7SessionRuntimeModels` types — do not redeclare manifest DTOs.

2026-07-04 G050 original-asset import operation: import original resources into `client-unity/Assets/ArtSource/original/<family>/` with a generated hash manifest per family (`logh7-portrait-full-export-manifest.json` sha1 per portrait, `logh7-ship-thumbnail-import-manifest.json` sha256 per TGA). Decoded exports (TCF→BMP) are original-derived; byte-copies are R0. Import further families only when a Unity scene slice consumes them; never write into original roots.

2026-07-04 G047 galaxy manual-crosscheck operation: regenerate with `npm --prefix server run crosscheck:galaxy-manual`; input is the committed detection evidence `server/content/extracted/logh7-manual-starchart-detection.json` (fresh 300dpi render of the 101-page manual p101 star chart with full provenance) and `server/content/galaxy.json`; output is `server/content/generated/logh7-galaxy-manual-crosscheck.json`. The ledger classifies each detected star dot as exact match, near miss, or anomaly, lists chart-absent galaxy systems needing another evidence axis, and always keeps `canonicalPromotion=blocked-until-cross-source-confirmed`. Re-running the Python detection requires re-deriving from the manual PDF; the Node ledger itself is deterministic from the committed detection JSON. After changes, rerun `catalog:current-content-crosscheck`, `catalog:galaxy-trust-crosscheck`, `report:hidden-data-watchlist`, `catalog:unity-streamingassets-export`.

2026-07-04 G045 Unity licensing repair operation: the Licensing IPC blocker root cause was a stale elevated `Unity.Licensing.Client` process holding the global mutex `Unity-LicenseClient-<user>` while refusing its IPC channel. Repair procedure: identify the stale PID (`Get-Process Unity.Licensing.Client`), terminate it with an elevated `taskkill /F /IM Unity.Licensing.Client.exe` (UAC approval required from a non-elevated agent shell), then let the next Unity launch spawn a fresh client (`Licensing is initialized` within seconds). Receipt: `.omo/ulw-loop/evidence/g045-licensing-kill-receipt-20260704.txt`, smoke log `g045-unity-license-smoke-20260704.log`. Follow-up compile fix: `client-unity/Packages/manifest.json` removed `com.unity.collab-proxy`, `com.unity.timeline`, and `com.unity.textmeshpro` because their pinned versions fail CS0619 obsolete-as-error on 6000.5.2f1 and no project code consumes them; clean batch open evidence `g045-unity-compile-retry-20260704.log` (exit 0, zero CS errors).

2026-07-04 G045 Unity validation surface state: `Logh7PrototypeSceneGenerator`/`Logh7GalaxyPrototypeRuntime` now read `StreamingAssets/logh7/generated/galaxy.json` and `generated/logh7-record-candidate-crosscheck.json` (matching the export manifest layout; the old root-level path was a mismatch that made the scene fail open). EditMode manifest-loader tests live at `client-unity/Assets/Tests/EditMode/` (4/4 pass in batchmode `-runTests`, results `g045-editmode-test-results-20260704.xml` and rerun). Validation scene screenshot `g015-unity-validation-scene-screenshot-20260704.png` shows the suspect banner, source ledgers, and the 85-system suspect galaxy. `logh7-unity-streamingassets-export.mjs` now excludes Unity `.meta` bookkeeping files from the export index (they appear once the Editor imports the project); export remains `fileCount=14` and full server tests pass 152/152.

2026-07-04 ULW final operation state: loop status is `complete=44`, `pending=0`, `blocked=0`. The former Unity Licensing IPC blocker is repaired (see G045 above); Unity Editor batchmode open, EditMode tests, and validation scene capture are all proven. Future Unity work should still avoid diagnostic-only substitutes for product-surface QA.

Updated: 2026-07-04

2026-07-03 Unity visible production surface: `server/src/server/logh7-scene-inventory.mjs`, `server/tools/logh7_build_scene_inventory.mjs`, and `server/tools/logh7_export_unity_scene_placeholders.mjs` generate scene inventory and Unity placeholders from EXE/Ghidra/MsgDat evidence. `client-unity/` is now a Unity 6000.5.2f1 project skeleton with `Packages/manifest.json`, `ProjectSettings/ProjectVersion.txt`, runtime/editor scripts, 12 generated scene placeholders, and `Assets/StreamingAssets/logh7/logh7-scene-inventory.json`. Evidence logs: `.omo/ulw-loop/evidence/scene-inventory-run-20260703.log`, `.omo/ulw-loop/evidence/unity-scene-placeholder-export-20260703.log`, `.omo/ulw-loop/evidence/server-test-scene-inventory-20260703.log`.

2026-07-03 record-candidate implementation surface: `server/src/server/logh7-record-candidate-scan.mjs`, `server/tools/logh7_scan_record_candidates.mjs`, `server/src/server/logh7-record-candidate-crosscheck.mjs`, `server/tools/logh7_crosscheck_record_candidates.mjs`, and npm scripts `scan:record-candidates` / `crosscheck:record-candidates`. The scanner looks at non-media record surfaces only; media/asset payloads remain handled by asset-specific tools. Cross-check compares coordinate clusters against existing galaxy coordinate sets and keeps all results non-canonical until a parsed structure and external evidence agree. Evidence logs: `.omo/ulw-loop/evidence/record-candidate-scan-rerun-20260703.log`, `.omo/ulw-loop/evidence/record-candidate-crosscheck-run-20260703.log`, `.omo/ulw-loop/evidence/server-test-record-crosscheck-20260703.log`.

2026-07-03 mandatory hidden-data watchlist surface: `server/src/server/logh7-hidden-data-watchlist.mjs`, `server/tools/logh7_report_hidden_data_watchlist.mjs`, and `npm --prefix server run report:hidden-data-watchlist` read the hidden classification manifest and write `server/content/generated/logh7-hidden-data-watchlist.json`. The report keeps watch categories separate from canonical promotion: `systemPositions` status `not-confirmed-new-hidden-system-position-table`, `originalCharacterRoster` status `not-confirmed-new-hidden-original-character-roster`. Evidence logs: `.omo/ulw-loop/evidence/hidden-data-watchlist-20260703.log`, `.omo/ulw-loop/evidence/hidden-data-watchlist-rerun-20260703.log`, `.omo/ulw-loop/evidence/server-test-hidden-watchlist-20260703.log`.

2026-07-03 CD media/hidden-data implementation surface: `server/src/server/logh7-cd-media.mjs`, `server/tools/logh7_extract_cd_media.mjs`, and `npm --prefix server run extract:cd-media` verify Archive BIN/CUE and reproduce MODE2/2352 conversion into `.omo/work/logh7-cd-extract/`. `server/src/server/logh7-hidden-data-scan.mjs`, `server/tools/logh7_scan_hidden_data.mjs`, and `npm --prefix server run scan:hidden-data` classify unverified signature candidates across raw BIN, converted ISO, ISO filesystem, and InstallShield payload. Generated manifests are `server/content/generated/logh7-cd-media-manifest.json` and `server/content/generated/logh7-hidden-data-candidates.json`; both are evidence ledgers, not canonical promotion by themselves.

2026-07-03 operation-state surface: `server/src/server/logh7-operation-state.mjs` is the first state-changing gameplay reducer. It derives same-card duplicate targets from state, calls `evaluateOperationPlanDraft`, appends `planned` records only when draftable, and leaves state unchanged when blocked.

2026-07-03 operations catalog/rule surface: `server/src/server/logh7-operation-catalog.mjs`, `server/src/server/logh7-operation-rules.mjs`, `server/tools/logh7_catalog_operations.mjs`, tests `server/tests/server/logh7-operation-*.test.mjs`, generated artifact `server/content/generated/logh7-operation-catalog.json`. It preserves operation purposes, planning fields, 30-day duration, result evidence, and unresolved scheduled-timing CP range while evaluating only explicit manual draft gates.

2026-07-03 rank-promotion slice: `server/content/manual/ranks-promotion.json` now generates `server/content/generated/logh7-rank-promotion-catalog.json` through `npm --prefix server run catalog:ranks-promotion`. `server/src/server/logh7-rank-promotion-rules.mjs` evaluates explicit manual rank headcount caps only; cap counts remain uncertain and promotion formulas/fame costs are not inferred.

2026-07-03 logistics-allocation catalog/rule surface: `server/src/server/logh7-logistics-allocation-catalog.mjs`, `server/src/server/logh7-logistics-allocation-rules.mjs`, `server/tools/logh7_catalog_logistics_allocation.mjs`, tests `server/tests/server/logh7-logistics-allocation-*.test.mjs`, generated artifact `server/content/generated/logh7-logistics-allocation-catalog.json`. This manual authority-table lookup preserves OCR uncertainty rather than filling missing cells.

2026-07-03 ship-stat catalog/rule surface: `server/src/server/logh7-ship-stat-catalog.mjs`, `server/tools/logh7_catalog_ship_stats.mjs`, `server/tests/server/logh7-ship-stat-*.test.mjs`, and generated artifact `server/content/generated/logh7-ship-stat-catalog.json`. This is lookup/readiness logic over normalized ship stat evidence; no combat simulation or missing-pool inference is restored.

2026-07-03 strategic-grid rule surface: `server/src/server/logh7-strategic-grid-rules.mjs` and `server/tests/server/logh7-strategic-grid-rules.test.mjs` are pure server-side gameplay logic over content evidence. They do not restore legacy live-client movement or infer warp fuel/error math absent manual numbers.

2026-07-03 command-rule surface: `server/src/server/logh7-strategy-command-rules.mjs` and `server/tests/server/logh7-strategy-command-rules.test.mjs` are the first gameplay-rule consumer of a generated catalog. They stay pure and server-side; no legacy-client runtime path is restored.

2026-07-03 strategy-command catalog surface: server data mining includes `server/src/server/logh7-strategy-command-catalog.mjs`, `server/tools/logh7_catalog_strategy_commands.mjs`, `server/tests/server/logh7-strategy-command-catalog.test.mjs`, and generated artifact `server/content/generated/logh7-strategy-command-catalog.json`. This is a canonical data/spec surface for later gameplay logic, not a restored legacy runtime.

Cleanup note: pre-bootstrap handoffs, roadmaps, patch/build notes, live-runtime notes, old tests, and tool state are not active architecture. Preserve source material, current data/catalog surfaces, and visual references under `docs/reference/`, then route any older evidence through `docs/reference/legacy-evidence/` and `docs/logh7-document-index-current.md`. Remaining old campaign/progress/session/layout/modding-plan/tooling documents were removed on 2026-07-03.

This document is the current architecture and operations authority. Read it after `docs/logh7-requirements-current.md` and before `.omo/plans/logh7-internal-validation-plan.md`.

All current architecture and operations rules apply retroactively. Existing tooling paths, EXE patch artifacts, launch flows, remaster/mod pipelines, and operational docs must be brought into compliance or marked non-compliant before they can count as readiness evidence.

## 2026-07-03 Architecture Reorientation

The canonical implementation path moves from legacy-client modification to evidence-driven reimplementation. Architecture work must treat original media, manuals, extracted assets, protocol traces, and live-client observations as inputs to a canonical data/spec pipeline. Server and future client work should consume that pipeline rather than depend on patched EXE builds.

The original client remains an oracle and diagnostic surface. `ui_explorer`, direct `G7MTClient.exe`, Frida, JSON patch descriptors, and Python playable-client builders are not normal runtime or product architecture. If legacy-client behavior must be checked, capture fresh hashes, command output, trace paths, and screenshots as evidence only.

2026-07-03 cleanup applies this retroactively: pre-bootstrap runtime, patch-builder, direct-client helper, cache, tool-download trees, and non-original install-data backups were removed unless they were source/evidence data. The `Face.bak-gfpgan-20260626-055248` GFPGAN backup is deleted; current TCF catalogs consume the original `data/image/Face` directory only. Preserved development authorities are current docs, `server/content`, `RE/content`, `.omo/ghidra`, `.omo/work/logh7-installed/{data,fonts,doc}`, manual extraction material, and the current source/catalog scripts, and `docs/reference/legacy-evidence/` for retained pre-bootstrap evidence docs.

Original media provenance starts with Internet Archive `https://archive.org/download/logh-7`: `Logh7.bin` sha1 `80e261e9d84c81bca622c99d9cbdc47a2154c1a8`, md5 `bf87c6a8cb068f05625737377a07b09d`; `Logh7.cue` sha1 `9bff4ea17ca6ff7b088440bd7f8a5206cd2dfe81`, md5 `878418e704a913f7baac67b38b10e680`. Download/import steps must verify these hashes before treating local artifacts as canonical.

Source-material inventory is the first canonical data/spec pipeline gate. `server/content/original-data/logh7-source-roots.json` names expected evidence roots; `server/src/server/logh7-source-corpus.mjs` inventories presence, counts, bytes, extensions, and optional SHA1 file records; `server/tools/logh7_inventory_source_roots.mjs` exposes it through `npm --prefix server run inventory:sources`.

`npm --prefix server run catalog:mdx` generates `server/content/generated/logh7-mdx-catalog.json` from preserved installed MDX models. Current evidence: 406 MDX files, 8 categories, `strategy/Null_galaxy.mdx` has 85 header slot-0 nodes and 79 `star_NN_<spectralClass>` node names. This is asset catalog evidence only; star positions remain manual/PDF-derived, not MDX-derived.

`npm --prefix server run catalog:null-galaxy` generates `server/content/generated/logh7-null-galaxy-template.json` from the MDX catalog. Current evidence: `strategy/Null_galaxy.mdx` has 79 star template nodes with spectral distribution A=7, B=5, F=8, G=19, K=17, M=21, O=2 plus six non-star template nodes (`bh_01..03`, `ns_01..03`). `positionStatus` is `not-in-mdx`; do not infer star positions from this fixture.

`npm --prefix server run catalog:tcf` generates `server/content/generated/logh7-face-tcf-catalog.json` from preserved installed Face archives. Current evidence: 7 current TCF archives, archive groups G=4/O=3, all current archive magics `badacabe`, `tcf.hed` has 1355 slots with 669 used and 686 zero.

`npm --prefix server run catalog:tcf-portraits` generates `server/content/generated/logh7-face-portrait-catalog.json` by decoding TCF payloads with 18-byte header, 1024-byte BGRA palette, and bottom-up 8-bit indices. Current evidence: 7 archives, 1061 decoded portrait payloads, failures categorized as non-decoded rather than inferred.

`npm --prefix server run export:tcf-portraits -- --limit-per-archive 2` writes visual BMP samples and manifest under `.omo/ulw-loop/evidence/`. Current evidence: 14 samples exported, representative `oam-slot0001-64x80.bmp` inspected as a valid portrait image. Keep this as controlled evidence export, not default full binary asset dump.

## Operating Model

Current bootstrap has one normal development path and one oracle path.

- **Data/spec path**: mine original media, installed assets, manuals, RE exports, and traces into canonical data/spec artifacts under `server/content`, `server/src/server`, and `server/tools`.
- **Future game path**: implement gameplay logic and the new client against those artifacts. `client-unity/` is the current Unity-port placeholder.
- **Oracle diagnostics path**: legacy client, `ui_explorer`, RE probes, trace scripts, direct `G7MTClient.exe`, and bypass flags may prove facts, but never become product runtime.

Server/data/tests/tooling must remain developable on macOS and Windows. Do not add Windows-only shell, registry, or process assumptions to current data/spec pipeline code.

## Components

### Data/Spec Package

Canonical bootstrap work belongs under `server/`.

Current responsibilities:

- Source provenance and source-root inventory.
- MDX cataloging from preserved installed models.
- `Null_galaxy.mdx` star-template/spectral-class extraction.
- Face TCF archive/HED slot cataloging.
- Face TCF portrait payload decode cataloging.
- Controlled Face TCF portrait BMP sample export for visual QA evidence.
- Committed/generated JSON artifacts consumed by later game-logic and Unity work.
- Focused tests proving catalog parsers and source-root behavior.

Removed pre-bootstrap responsibilities:

- Auth/gameplay TCP server runtime.
- Legacy-login/session bridge.
- `0x03xx` record emitter implementation product runtime.
- Python playable-client builders, JSON patch descriptors, direct EXE patch workflow.

### Unity Client

`client-unity/` is the current client reboot placeholder. It should consume canonical data/spec artifacts rather than clone old client modification paths.

Initial responsibilities:

- Define import boundaries for generated catalogs and later gameplay model data.
- Keep original assets as fallback/reference inputs, not overwritten runtime outputs.
- Defer visual remaster/mod pipelines until source/provenance manifests exist.

### Legacy Client Oracle

The original client remains useful for fact checking UI behavior, asset consumption, packet meaning, and data interpretation. It is not the normal runtime for new implementation work.






### Data, Remaster, and Mod Provenance

Every gameplay/content/remaster/mod record must carry provenance when ambiguity matters:

- `P0`: client-extracted/original binary asset evidence.
- `P1`: manual/original document evidence.
- `P2`: reconstructed from reliable secondary evidence.
- `P3`: development placeholder or speculative bridge.
- `R0`: original asset, unmodified fallback.
- `R1`: original-derived remaster, upscaled or cleaned.
- `R2`: hand-authored replacement.
- `R3`: generated/community placeholder.

P2/P3/R3 data may support development, but cannot be described as canonical without explicit upgrade evidence.

### Evidence and Forensics Toolchain

Tool outputs are evidence layers, not replacement authority:

- PCAP layer: Npcap and Wireshark/tshark capture raw TCP and opcode-wrapper candidates when fresh oracle tooling is explicitly reopened. Deleted `RE/tools` helpers are not current path. PCAP never proves decoded game state by itself.
- Decoder layer: Scapy/project decoders and Kaitai specs convert stable frame/record families into repeatable parsers.
- Runtime layer: Frida, x64dbg, ProcDump, and Volatility prove dispatcher/parser/cache/state consumption in the real client.
- Static RE layer: Ghidra remains the authoritative reverse-engineering surface. capa, FLOSS, YARA, DIE, and binwalk classify candidates for Ghidra follow-up.
- Data forensics layer: Sleuth Kit, bulk_extractor-class byte-stream carving, YARA, DIE, binwalk, and hash inventories classify original CD/install/data material.
- Document/asset extraction layer: Poppler/PyMuPDF/pdfplumber/OpenCV/PaddleOCR plus `pdf` and `smart-ocr` skills preserve page, bbox, confidence, crop, hash, and provenance.
- Remaster/mod asset layer: Blender, Noesis or Assimp-class converters, Meshy/generative 3D, and upscalers remain reversible and provenance-labeled.

The 2026-07-03 installed toolchain is rooted at `E:\logh7-revival\.omo\toolchain`; first scan evidence is rooted at `E:\logh7-revival\.omo\analysis\toolchain-20260703`. Autopsy GUI installation is blocked by C-drive free space, so Sleuth Kit CLI is the current filesystem-forensics substitute. binwalk v3 is built from source under E drive. LOGH7 Wireshark Lua is installed both in-repo and as the user's personal Lua plugin.

## Remastering and Modding Layers

Remastering and modding sit above the canonical preservation layer, but they are different tracks. Remastering is included in the closed-beta target; modding remains separate.

- **Base layer**: original client assets, extracted data, manual/client evidence, and byte-verified patches. This layer is the fallback and audit source.
- **Remaster layer**: closed-beta 2D art, 3D assets, modeling, texture, effect, sound, image, UI, portrait, background, media, launcher, and font/readability improvements. It must remain reversible and provenance-labeled over original fallback.
- **Mod Layer A: data/content packs**: server-side content, scenarios, balance, faction/system/fleet data, and development placeholders.
- **Mod Layer B: localization/texture packs**: Korean strings, glossary packs, UI textures, remastered portraits/backgrounds.
- **Mod Layer C: client patch packs**: guarded EXE patches with original signatures, target hash recording, rollback, and live QA.

## Native System Extension Layer

Native system additions are core project features, not mod packs. They extend revived server/client behavior while preserving original behavior as fallback. Example target: Free Planets Alliance Supreme Council chair election.

Current feasibility basis:

- Server authority path exists: `server/src/server/logh7-command-engine.mjs` is already structured as validate/apply state/emit Notify, so new systems can be added as authoritative server state machines when their outputs fit existing client-visible routes.
- Command/proposal surface exists: `server/src/server/logh7-dev-command-cards.mjs` reads manual command groups and builds command cards; `server/src/server/logh7-dev-command-executor.mjs` classifies commands including political/announcement-style commands. This is enough to prototype native systems through existing command/report/notice surfaces before new client UI work.
- Legacy client RE evidence exists for command families: `docs/reference/legacy-evidence/logh7-character-creation-wire.md` records client command codes such as `0x1008 CommandGenerateCharacterCharge`, and `logh7-re` confirms dispatcher/size-table functions such as `FUN_004ba2b0` and `FUN_004b8b00`. New client-consumed system records must get the same level of proof before emission.
- Legacy-client patch mechanics are no longer a product path. The old Python/JSON patch builder and descriptor stack is retired; any future diagnostic EXE change must be a direct patch operation with original signatures, target hash, changed bytes, rollback notes, and live QA.

Native system extension sequence:

1. Define server-domain state, invariants, audit log, and rollback for the system.
2. Map the user-visible surface to existing client/web routes first: notices, proposal/report text, board/admin, command outcomes, faction/session state.
3. Use `logh7-re`/`logh7-wire` to prove any client packet, parser, display consumer, or command surface before emitting new bytes.
4. If existing surfaces cannot express system, prefer the Unity/reimplementation path. Use `logh7-patch` only for diagnostic legacy-client evidence, and use direct patch notes rather than JSON descriptor generation.
5. Run `/cso` for voting, admin override, audit log, and client patch supply-chain surfaces.

## Official Patch Stack Layer

Official live-service patch/update content is a compatibility layer above original-disc/base restoration and below new native extensions or mods. Use `docs/reference/legacy-evidence/logh7-2004-official-patch-stack.md`.

- Apply official patch behavior chronologically and cumulatively; later official notices override earlier planned behavior.
- Implement it as core revival behavior before closed beta readiness, not optional mod content.
- Verify older notices with Wayback/CDX, using EUC-JP decoding for archived `gineiden.com` pages and recording archive URL, timestamp, original URL, Japanese excerpt, Korean interpretation, affected slice, and provenance grade.
- Keep Wayback caches/extracts on `E:\logh7-revival` paths, never `C:`. Large or generated evidence stays uncommitted unless intentionally promoted.
- Route affected work through existing components:
  - character/account: deletion eligibility, generated/original distinction, lottery cooldown/cancel recovery;
  - economy/balance: daily military supplies, unit performance, evaluation-point-linked merit;
  - strategic: warp fuel/CP/range, reconnaissance persistence, occupied-enemy visibility;
  - tactical: retreat warp-out, timeout, repair/reversal, damaged-ship display, calendar display;
  - command/proposal: promotion/demotion/appointment/dismissal/resignation/assignment, proposal mail subjects, command concurrency gates, complete supply.

Pack manifests must include:

- Pack id, version, author/source, license, target app/client/server version, and provenance.
- Files changed and owner layer.
- Dependencies and conflicts.
- Rollback instructions.
- Verification commands and live-QA evidence when client-visible.

Do not build public mod marketplace/community distribution before the normal playable loop is stable. Build pack boundaries first so the implementation does not paint itself into a corner.

Skill handling for these layers:

- Remaster work uses `image-upscaling` for original-derived upscale experiments and `game-assets`/`game-3d-assets` only for approved placeholder/prototype assets. Every output needs original fallback and provenance.
- Browser-rendered remaster previews or tactical/strategic visualization tools may use `game-engine`; this does not change legacy-client runtime requirements.
- Modding architecture may consult `multiplayer-game` for server authority, tick loops, state sync, and interest-management patterns, but LOGH7 protocol/client evidence remains authority. Do not adopt RivetKit or another runtime without separate architecture decision.
- If exact modding/editor/asset-pipeline skill support is missing, run `find-skills` at development start, install only high-fit candidates, and record command/output/fallback when install is rejected or unsuitable.

### DNT/Sourcebook AI Asset Pipeline

Sourcebook-derived mod content flows through a separate evidence pipeline:

1. Download or receive local PDF/image files from the setting-book source.
2. Render PDF pages to images with `pdf`; run `smart-ocr` where text or labels matter.
3. Record page id, crop coordinates, OCR confidence, extracted labels, and source notes.
4. Build structured asset briefs for ships, uniforms, portraits, UI motifs, scenarios, factions, systems, and tactical props.
5. Generate prototype models with `meshy-3d-generation` or `game-3d-assets`, preserving prompt chain, API task ids, costs, output hashes, and thumbnails.
6. Run 3D post-load checks: orientation, scale, polygon count, animation clips, texture maps, in-tool screenshot, and eventual client/tooling preview.
7. Package outputs as optional mod/remaster packs with R3 provenance unless a later manual art/review process promotes them.

Do not mix DNT-derived or AI-generated assets into original/canonical fallback trees. Keep them in separate mod pack overlays.

### macOS Client Compatibility Lab

macOS service development remains supported, but legacy-client playability is experimental. The lab should test CrossOver/Wineskin/PortingKit/maintained Wine builds, isolated prefixes, 32-bit client behavior, D3D8 rendering, DXVK/D3D8 or wrapper options, CP949/Korean text, audio/input, launcher handoff, and rollback. A Mac result is usable only with real-device evidence and exact bottle/prefix/install logs.

## Data Flow

Normal first validation route:

1. Operator starts Docker Compose server.
2. Player starts launcher.
3. Launcher checks config/update/remaster/mod status.
4. Launcher opens web signup/community as needed.
5. Launcher starts legacy client with the selected server config.
6. Player logs into legacy client.
7. Legacy client creates/selects a character.
8. Server persists the account-character relationship.
9. Server sends lobby/session notice data through a client-consumed route.
10. Server sends world/strategic records consumed by the real client.
11. Server sends tactical/battle records consumed by the real client.
12. Commands produce server-side state changes and client-visible responses.

## Security Boundaries

- Public web account creation is untrusted input.
- Legacy client login/session packets are untrusted input.
- Board posts, reports, and moderation targets are untrusted input.
- Admin endpoints must be separated from player endpoints.
- Launcher update/patch/remaster/mod metadata is supply-chain sensitive.
- Server logs and traces may contain account identifiers or private operational data.
- Agent skills and automation instructions are executable prompt supply chain and must be included in `/cso` review.
- Mod pack imports, remaster assets, and client patch packs are untrusted until manifest, provenance, and signature checks pass.

## Developer Progress Dashboard

The progress dashboard lives at `docs/logh7-developer-dashboard.html`. It is an HTML status surface for developers and operators, derived from the three current startup docs plus the document index. It must not replace those authority docs.

Operating rules:

- Update the dashboard whenever a work unit changes current slice, release phase, progress percentage, remaining tasks, source evidence, or blocker status.
- The dashboard must calculate overall development as server-open readiness across phases: internal playable loop, remaster-included closed beta, public operation, and separate expansion/modding tracks.
- The dashboard must keep the normal/diagnostic path split visible: Docker Compose and launcher are normal paths; `ui_explorer`, direct EXE, direct Node, and preseed flags remain diagnostics.
- Progress percentage must be source-backed and conservative. A diagnostic-only proof does not close a normal-path item.
- Keep dashboard evidence/caches on repo-local `E:\logh7-revival` paths. Do not write development caches to `C:`.

## Project Skill Routing

Use matching skills before ad hoc work:

- LazyCodex/OMO harness: use the current LazyCodex docs and installed OMO skills as executable routing. `init-deep` maintains hierarchical project memory, `ulw-plan` handles ambiguous/multi-module planning, `start-work` executes Prometheus-style plans, and `ulw-loop` runs durable evidence-bound goal loops. Hephaestus/ultrawork discipline is the default for long LOGH VII work: Explore -> Plan -> Implement -> Verify -> Manual QA, with RED->GREEN proof, cleanup receipt, and no completion from tests alone.
- Slice creation or material slice changes start with `superpowers:brainstorming`; implementation planning comes only after brainstormed alternatives, trade-offs, release phase, and acceptance evidence are explicit.

- LOGH7 protocol, wire, patch, extraction, localization, and live-client tasks: use the corresponding LOGH7 skill.
- Planning or brainstorming: use Superpowers plus OMO planning. Superpowers process skills are mandatory when triggered, including `using-superpowers`, `brainstorming`, `writing-plans`, `test-driven-development`, `systematic-debugging`, `verification-before-completion`, and review/worktree/subagent skills when host policy permits.
- Architecture/review/security/shipping/documentation: use gstack role skills through the gstack router. gstack is also the default route for QA, design, deploy, learning, and retrospective work when a matching skill exists.
- Code location, call paths, blast radius, and subsystem explanation: use CodeGraph first when `.codegraph/` exists.
- Protocol packet analysis: use `protocol-reverse-engineering`.
- Node server work: use `nodejs-backend-patterns`.
- Browser/E2E tests: use `playwright-testing`.
- Docker/macOS runtime setup: use `docker-platform-guide`; on macOS with OrbStack use `orbstack-best-practices`.
- CI workflow work: use `github-actions-efficiency`.
- Remaster image experiments: use `image-upscaling` when appropriate, but keep original asset fallback and provenance.
- 2D/3D asset prototype work: use `game-assets` or `game-3d-assets` only for placeholders or approved remaster/mod experiments.
- Browser game/rendering/game-loop reference work: use `game-engine` only for web prototypes or visualization tooling, not legacy-client behavior proof.
- Multiplayer state/tick/interest-management reference work: use `multiplayer-game` only as pattern input; LOGH7 wire/client evidence stays authoritative.
- New capability gap: use `find-skills` before inventing a workflow.

CodeGraph is an orientation accelerator, not the sole source of truth. Confirm exhaustive answers with `rg` or direct source reads.

If a matching skill, MCP tool, hook, model-routing role, or workflow command is absent, host-forbidden, not approved, or unsuitable, try the documented lookup/install route when safe and record the command/output or policy blocker plus fallback path in the work unit notes. Do not silently proceed as if the capability did not exist.

## gstack Role Hooks

Use the full gstack suite through its router when a specialized skill matches the work. During brainstorming and plan-writing, the following voices are the minimum one-sentence checks, not the full limit:

- `/office-hours`: checks whether the slice serves a real player/community need.
- `/plan-ceo-review`: challenges whether the plan reaches a 10-star player/operator experience.
- `/plan-eng-review`: checks architecture, data flow, edge cases, tests, and performance.
- `/review`: checks diffs/findings before ship decisions.
- `/cso`: mandatory security gate for threat model, OWASP/STRIDE, supply chain, and secrets.
- `/learn`: searches prior lessons before planning and stores durable learnings after review.
- `/retro`: summarizes execution/review lessons at milestone close.

## Blocked-Loop Control

Avoid token-burning loops. A worker must pivot, narrow, or report a blocker when the same approach fails three times, two independent probes add no new information, or a live route depends on unavailable external state.

The blocker report must include exact blocked surface, commands/probes already tried, evidence files/screenshots, why continuing the same path would not add information, and the next different path or precise input needed.

## Completion Gate

A work unit or milestone is not complete after code review alone. Completion requires:

1. Implementation.
2. Automated verification.
3. Real-client live QA where relevant.
4. Normal run path validation where relevant.
5. Review.
6. `/cso` security check or exact blocker.
7. Compound learning capture using the [Compound Engineering](https://every.to/guides/compound-engineering) loop: plan, work, review, compound, repeat.
8. Documentation sync.

The compound step must answer:

- What mistake or near-miss happened?
- What was the root cause?
- What reusable rule/check prevents it next time?
- Where was the learning stored?
- Which future plan/test/doc enforces it?
- Would the system catch this automatically next time?

The compound capture must also name every matching LazyCodex, Superpowers, gstack, LOGH7, project, or sourcebook/remaster skill that was used, skipped as not applicable, unavailable, or blocked by host policy.

## Documentation Automation Rule

Every work unit must end with a documentation sync pass:

- **Add** entries for new commands, evidence, risks, decisions, files, owner paths, skill requirements, remaster/mod pack rules, and provenance states.
- **Modify** entries whose behavior, scope, command, or acceptance evidence changed.
- **Prune** duplicate, stale, or misleading guidance.
- **Delete or retire** invalid instructions that would push future agents toward wrong behavior.

Sync targets:

- `docs/logh7-requirements-current.md`
- `docs/logh7-architecture-operations-current.md`
- `.omo/plans/logh7-internal-validation-plan.md`
- `docs/logh7-document-index-current.md`
- `AGENTS.md`
- `CLAUDE.md`
- `.claude/CLAUDE.md`

Do not rewrite unrelated historical evidence. Classify it in the document index instead.

## Operational Simplicity Rules

- Operator path is one stable Docker Compose service action plus documented config.
- Player path is launcher-first.
- Direct `G7MTClient.exe`, `ui_explorer`, trace tools, and preseed flags are diagnostics only.
- EXE changes are direct patch operations only. Do not use Python to indirectly regenerate, copy over, or overwrite `G7MTClient.exe` or launcher EXEs. Patch descriptors must record original signatures, target hash, changed bytes, rollback path, and live-QA evidence.
- Retroactive migration is required: existing Python-generated, copied-over, or indirectly rebuilt EXE patch outputs are non-compliant until re-expressed as direct patch descriptors and re-verified.
- Do not require manual process cleanup for normal play.
- Do not blanket-kill `node.exe`.
- Keep live diagnostics in `RE/` with `--server-root ..\server`.
- Capture the current playable EXE hash fresh before live QA; do not trust old hardcoded hashes.

## 2026-07-03 Unity Session Runtime Contract

- `server/src/server/logh7-unity-session-flow.mjs` is now the shared source for Unity entry scenes, normal session flow, and runtime state model names.
- `logh7-scene-inventory` now exports 15 scene groups. The first product path is `boot-update-launcher`, `login`, `lobby`, `character-select`, `character-create`, `world-entry`, `strategic-map`; `strategic-map` requires `world-session`.
- Unity StreamingAssets now includes `logh7-unity-runtime-manifest.json` with `normalEntryScene: boot-update-launcher`, seven normal-entry gates, and server-authoritative character/world models.
- `client-unity/Assets/Scripts/Logh7GalaxyPrototypeRuntime.cs` reads the runtime manifest and displays the entry gate count. `Logh7SessionRuntimeModels.cs` defines the first C# data shapes: Boot, LoginSession, LobbyState, CharacterSlot, PlayerCharacter, CharacterAuthority, and WorldSession.
- Use `npm --prefix server run catalog:scenes`, `npm --prefix server run build:unity-bootstrap`, `npm --prefix server run export:unity-scenes`, and `npm --prefix server run export:unity-runtime-data` to refresh the current Unity bootstrap outputs.

## 2026-07-03 Medal Mining Catalog

- `server/src/server/logh7-medal-catalog.mjs` builds the medal mining catalog from three evidence surfaces: original Japanese `constmsg.dat` records `767..818` via `server/content/client/msgdat.json`, localized Korean `dat-tables.json` records `767..818`, and original install medal images under `.omo/work/logh7-installed/data/image/Medal/`.
- `npm --prefix server run catalog:medals` writes `server/content/generated/logh7-medal-mining-catalog.json`.
- Unity remaster source assets are copied byte-for-byte to `client-unity/Assets/ArtSource/original/medals/`; generation is blocked while these original images cover the medal icon pool.
- The Imperial crest reference is `client-unity/Assets/ArtSource/reference/logh7-imperial-double-eagle-reference.jpg` with SHA256 `822276b190c3e83729de39c14e4e9fc06c2eb8b39a56225bdcbe16f147134e9e`. Remaster steps may upscale or clean it, but must preserve the exact crest shape.

## 2026-07-04 Medal Art Production Brief

- `server/src/server/logh7-medal-art-brief.mjs` derives production actions from `logh7-medal-mining-catalog`: 15 Alliance originals to upscale, 11 Alliance variants only if unique icons are needed, and 26 Empire medals to create from original names.
- `npm --prefix server run catalog:medal-art-brief` writes `server/content/generated/logh7-medal-art-brief.json`.
- Alliance reference flag copied to `client-unity/Assets/ArtSource/reference/logh7-alliance-flag-pentagon-reference.png` (SHA256 `81d5c36e3a4455214c276250e60d88e4e87f722dad8b1a5ba4ca8ef2acad7e0d`, 560x350); the central gold pentagon is the Alliance emblem for new variants.
- `npm --prefix server run remaster:alliance-medals-4x` writes 15 reproducible local 4x Alliance medal bases under `client-unity/Assets/ArtSource/remaster/alliance-medals-4x/` and `server/content/generated/logh7-alliance-medal-upscale-manifest.json`. This is a deterministic base pass, not final AI cleanup.
## 2026-07-04 Medal Art Pipeline Correction

- `belt`/Real-ESRGAN was installed and tested, but direct 80x80 icon upscale failed visual quality; keep those outputs rejected, not production.
- Alliance `793..795` individual high-honor medal candidates are generated as concept sources and packaged as 1024 transparent PNGs. Reference manifests: `server/content/generated/logh7-alliance-foundation-medal-redraw-manifest.json`.
- Imperial crest handling is now a direct-composition pipeline: `client-unity/Assets/ArtSource/reference/imperial-crest/*.png` are masks/recolors derived from the exact supplied crest, with manifest `server/content/generated/logh7-imperial-crest-mask-manifest.json`.
- Imperial ship handling must draw from decoded original resources: `server/content/extracted/model-ship.json` confirms `121` Empire ship model records under `data/model/Ship/GE/`; `client-unity/Assets/ArtSource/reference/logh7-ship-thumbnail-contact-sheet.png` and `client-unity/Assets/ArtSource/reference/empire-ships/` preserve decoded original thumbnail candidates. Current corrected prototypes are tracked in `server/content/generated/logh7-imperial-medal-corrected-prototype-manifest.json`.
- `server/content/generated/logh7-imperial-medal-source-lock-manifest.json` is the current Imperial art source lock. It requires the exact supplied crest, requires original Empire ship data, treats decoded thumbnails as proof-only, and gates final large ship medal art on `Ship/GE` MDX render/extract rather than invented silhouettes or thumbnail upscale alone. `779-expeditionary-campaign-source-locked-crest-ship-v2.png` and `767-grand-double-eagle-order-source-locked-crest-v2.png` are the current visible-crest/source-ship proof samples; generated ship silhouettes and generated crests are not allowed for Imperial medal production.
- `npm --prefix server run catalog:imperial-medal-source-lock` regenerates the source lock and render queue: `121` Empire model records, `120` `Ship/GE` file records, `117` MDX records, `3` MDS records, and `39` high/medium/low grouped MDX render hulls.
- 2026-07-04 render-source pipeline: `server/src/server/logh7-mdx-render-source.mjs` and `server/tools/logh7_catalog_mdx_render_sources.mjs` generate `server/content/generated/logh7-mdx-render-source-manifest.json`. This is a development evidence catalog only, not normal runtime. It locks Imperial medal ship-art production to original `.omo/work/logh7-installed/data/model/Ship/GE/EH001.mdx` plus the exact Imperial crest reference/mask, records discovered MDX nodes and texture assets, and fails open visually by classifying missing authoring `EH001x.lwo` / missing `EH001_bump.tga` instead of fabricating a final render. Regenerate with `npm --prefix server run catalog:mdx-render-sources`; final medal art remains blocked until MDX geometry extraction or renderer output is verified.
- 2026-07-04 G004 data-family catalog: regenerate with `npm --prefix server run catalog:server-data-family`. Output `server/content/generated/logh7-server-servable-data-family.json` inventories the server-facing data families and their source manifests while keeping all families `suspect-cross-check-required`. Boundary behavior is covered by `server/tests/server/logh7-server-servable-data-family.test.mjs`: missing or malformed sources are recorded as `missing` / `unreadable`, never canonical.
- 2026-07-04 G005 current-content cross-check: regenerate with `npm --prefix server run catalog:current-content-crosscheck`. Output `server/content/generated/logh7-current-content-crosscheck.json` inventories current source roots and every generated JSON catalog under `server/content/generated`; all entries carry `suspect-cross-check-required`, and malformed generated JSON is recorded as `unreadable` by `server/tests/server/logh7-current-content-crosscheck.test.mjs` instead of being promoted.
- 2026-07-04 G006 Unity source-pack manifest: regenerate with `npm --prefix server run catalog:unity-source-pack`. The command writes both `server/content/generated/logh7-unity-source-pack-manifest.json` and `client-unity/Assets/StreamingAssets/logh7/logh7-unity-source-pack-manifest.json`. It is a Unity pack contract: original fallback is required, remaster pack is reversible/manifest-driven/disabled by default, and `verifiedRecords` must stay empty until `logh7-current-content-crosscheck.json` reports cross-source confirmation.
- 2026-07-04 G007 remaster provenance manifest: regenerate `npm --prefix server run catalog:remaster-provenance`. command writes `server/content/generated/logh7-remaster-provenance-manifest.json` and `client-unity/Assets/StreamingAssets/logh7/logh7-remaster-provenance-manifest.json`. must keep `remaster-hd` disabled default, reversible, manifest-driven, conflict-check-required, provenance-label-required, original-fallback-required; it must track both `imperial-crest-mask` and original Empire ship-derived `empire-ship-reference`; malformed artifact manifests recorded `unreadable` never enable pack.
- 2026-07-04 G008 galaxy trust crosscheck manifest: regenerate with `npm --prefix server run catalog:galaxy-trust-crosscheck`; rerun `catalog:server-data-family` and `catalog:current-content-crosscheck` so systems source manifests and generated-catalog inventory include `server/content/generated/logh7-galaxy-trust-crosscheck.json`. Existing galaxy positions, star colors, planet lists, passable cells, and generated catalogs must remain blocked from canonical promotion until cross-source proof exists.
- 2026-07-04 G009 runtime-boundary manifest: regenerate with `npm --prefix server run catalog:runtime-boundary`; rerun `build:unity-bootstrap`, `catalog:unity-source-pack`, `catalog:server-data-family`, and `catalog:current-content-crosscheck` so server and Unity StreamingAssets consume the boundary. Normal runtime stays Docker Compose server plus Unity player/launcher; legacy EXE, Frida, `ui_explorer`, preseed flags, and patch builders remain oracle diagnostics only.
- 2026-07-04 G010 asset-overwrite guard: regenerate with `npm --prefix server run catalog:asset-overwrite-guard`, then rerun `catalog:remaster-provenance` and `catalog:current-content-crosscheck`. Original asset roots must remain read-only fallback; remaster/reference/concept outputs must never overwrite `ArtSource/original`, installed-game, CD-extract, or original-data roots.
- 2026-07-04 G011 formula guard pipeline: regenerate `npm --prefix server run catalog:formula-provenance-guard`, then `catalog:server-data-family`, `catalog:current-content-crosscheck`, `catalog:unity-source-pack`. `logh7-formula-provenance-guard.json` is development evidence only; Unity/server normal runtime must not treat unresolved CP/combat/economy/AI formulas as canonical behavior.
- 2026-07-04 G012 Unity asset source-truth pipeline: regenerate `npm --prefix server run catalog:unity-asset-source-truth`, then `catalog:current-content-crosscheck` and `catalog:unity-source-pack`. Unity may consume `Assets/StreamingAssets/logh7/logh7-unity-asset-source-truth.json`; files under `Assets/Scenes`, `Assets/Scripts`, `Assets/Editor`, and `Assets/ArtSource/*` are implementation/output/proof surfaces, not source truth.
- 2026-07-04 G012 follow-up: Unity asset source-truth now includes Empire ship reference, Imperial crest mask, and Imperial medal source-lock manifests. Imperial medal/remaster production must treat thumbnails as proof-only, final large ship motifs as original `Ship/GE` MDX render/extract output, and the double-eagle crest mask as the required faction mark.
- 2026-07-04 G013 test decision guard pipeline: regenerate `npm --prefix server run catalog:test-decision-guard`, then `catalog:current-content-crosscheck`. `logh7-test-decision-guard.json` is a development guard, not canonical game data; it makes Node extraction/inventory/cross-check behavior changes TDD-required and keeps Unity C# loader/scene tests-after only until a first real manifest-consuming loader/scene surface exists.
- 2026-07-04 G014 ULW evidence inventory pipeline: regenerate `npm --prefix server run catalog:ulw-evidence-20260703`, then `catalog:current-content-crosscheck`. The catalog intentionally excludes `g014-*` self-audit files from the target `*20260703*` bundle so the inventory is not self-referential. It is evidence tracking only, not canonical game data.
- 2026-07-04 G015 source-pack correction: `server/src/server/logh7-unity-source-pack-manifest.mjs` now adds `originalFallbackPack.requiredAssetFamilies` so Unity StreamingAssets carries the source-locked Imperial resource set: `imperialShipMdx` `.omo/work/logh7-installed/data/model/Ship/GE` (`117` MDX files), original `ShipMark.tga`, exact `logh7-imperial-double-eagle-reference.jpg`, and gold/silver/white derived double-eagle masks. Regenerate `npm --prefix server run catalog:unity-source-pack` after `catalog:current-content-crosscheck`; focused test `server/tests/server/logh7-unity-source-pack-manifest.test.mjs` protects this boundary.
- 2026-07-04 G015 Unity validation scene surface: Unity runtime/editor now separate validation display from normal runtime. `Logh7GalaxyPrototypeRuntime` reads StreamingAssets source-pack/source-truth ledgers and shows canonical-promotion blocked, `Ship/GE=117`, crest-mask status, source-truth input/consumer counts, and diagnostic-only runtime policy. `Logh7PrototypeSceneGenerator.RebuildSceneForBatch()` adds a source-ledger TextMesh panel and registers the generated prototype scene in BuildSettings. `Logh7ValidationSceneCapture.CaptureEvidence` is the batch screenshot surface. Current blocker: Unity Editor batchmode cannot reach executeMethod because local Unity Licensing IPC times out; no screenshot artifact was produced.
- 2026-07-04 G016 wave-0 data pipeline: regenerate in this order when closing the source inventory slice: `npm --prefix server run extract:cd-media`, `scan:hidden-data`, `classify:hidden-data`, `report:hidden-data-watchlist`, `catalog:server-data-family`, `catalog:current-content-crosscheck`. Current evidence keeps hidden-data candidates classification/watchlist as development evidence only; no newly confirmed system-position table or original character roster is promoted. Focused boundary tests cover CD media, hidden-data classification/watchlist, server data family, and current-content crosscheck.
- 2026-07-04 G017 source inventory / Unity import pipeline: refresh order is `npm --prefix server run inventory:sources`, `catalog:current-content-crosscheck`, `catalog:unity-asset-source-truth`, then `catalog:unity-source-pack`. The source root registry currently reports `8` roots. Unity import manifests are copied to StreamingAssets byte-equivalent JSON and keep `blocked-until-cross-source-confirmed`; `manualDragAsSourceTruthAllowed=false`, `violationCount=0`, source-pack `verifiedRecords=0`, and required original fallback families include `Ship/GE` plus exact Imperial crest reference/masks.
- 2026-07-04 G018 integrated UI/remaster/gameplay boundary: `server/src/server/logh7-ui-scene-remaster-gameplay-boundary.mjs` and `server/tools/logh7_catalog_ui_scene_remaster_gameplay_boundary.mjs` generate the server/Unity StreamingAssets contract. Architecture note: the G018 boundary now carries original asset contracts, not just generated pack names. Empire ship art must use original `.omo/work/logh7-installed/data/model/Ship/GE` (`117` MDX, `3` MDS) and original `Thumbnail/Ship` (`79` TGA) before generated overlays; Imperial crest art must use `logh7-imperial-double-eagle-mask-manifest` variants from the exact supplied reference. Generated/remaster packs stay disabled-by-default, reversible, manifest-driven, and blocked from canonical promotion until cross-source evidence.
- 2026-07-04 G019 Unity loader/validation scene integration: `Logh7GalaxyPrototypeRuntime` consumes the G018 StreamingAssets boundary manifest as a runtime evidence line, alongside source-pack/source-truth ledgers. `Logh7PrototypeSceneGenerator` adds `ui-boundary: present | promotion blocked | Ship/GE=117 | crest variants=3` to the generated validation scene source-ledger panel. This is a Unity loader/source-surface contract; it does not override the G015 Unity Licensing IPC screenshot blocker.

2026-07-04 G021 server-data scope checkpoint: `npm --prefix server run catalog:server-data-family` now revalidates `server/content/generated/logh7-server-servable-data-family.json` as the rebuilt-server data-family boundary: `15` families, all `suspect-cross-check-required`, mandatory watch categories `systemPositions` and `originalCharacterRoster`. `catalog:current-content-crosscheck` inventories the catalog and keeps canonical promotion `blocked-until-cross-source-confirmed`; focused tests pass `2/2`, full server tests pass `142/142`. Evidence lives under `.omo/ulw-loop/evidence/g021-*`.

2026-07-04 G022 hidden-data checkpoint: `scan:hidden-data`, `classify:hidden-data`, and `report:hidden-data-watchlist` remain evidence-forensics tools only. Current classification records `37047` candidates with `10253` validated and `26794` invalid; watch summaries report `systemPositions` `209`/`44` paths and `originalCharacterRoster` `403`/`8` paths, but both remain `not-confirmed-new-hidden-*` pending parser/cross-check proof. Focused tests pass `10/10`; full server tests pass `142/142`.

2026-07-04 G023 source inventory correction: `server/content/original-data/logh7-source-roots.json` now treats CD extraction output as first-class evidence roots, adding `.omo/work/logh7-cd-extract/iso-root` and `.omo/work/logh7-cd-extract/installshield-root`. `inventory:sources` root count is `10`; CD extraction roots report `25` ISO files and `2207` InstallShield payload files. Adjacent current-content/Unity source manifests remain blocked from canonical promotion and full server tests pass `142/142`.
2026-07-04 G024 Unity source-pack architecture checkpoint: `server/src/server/logh7-unity-source-pack-manifest.mjs` emits a server/Unity StreamingAssets source-pack manifest whose inputs include CD media and the source-root registry. `originalFallbackPack.sourceRootInventory` carries the CD extraction roots, and `originalFallbackPack.requiredAssetFamilies` carries source-locked Empire ship/crest inputs: `imperialShipMdx` from `.omo/work/logh7-installed/data/model/Ship/GE` (`117` MDX), `fieldShipMarkSheet`, `imperialDoubleEagleReference`, and `imperialDoubleEagleMasks`. Remaster packs remain disabled-by-default, reversible, manifest-driven, and subordinate to those original fallback inputs.
2026-07-04 G025 UI scene catalog architecture checkpoint: `server/src/server/logh7-ui-scene-catalog.mjs` builds a Unity-consumable UI surface catalog from `logh7-scene-inventory.json`. `server/tools/logh7_catalog_ui_scenes.mjs` writes matching server and Unity StreamingAssets copies. The surface contract covers launcher/login/lobby/character/world/strategic/select-grid/info/tactics/battle, attaches required evidence channels and live trace record IDs where known (`0x7000`, `0x0020`, `0x2005`, `0x2006`, `0x1008`, `0x0f02`, `0x0313`, `0x0315`, `0x0b01`), and keeps original-client use as oracle/data-mining only.
2026-07-04 G026 Unity StreamingAssets export architecture checkpoint: `server/src/server/logh7-unity-streamingassets-export.mjs` produces a deterministic export index for `client-unity/Assets/StreamingAssets/logh7`. `server/tools/logh7_catalog_unity_streamingassets_export.mjs` writes matching server and Unity copies, excludes `logh7-unity-streamingassets-export.json` from self-indexing, and derives hash-addressed original fallback assets from `logh7-unity-source-pack-manifest.json`. Directory fallback paths such as `.omo/work/logh7-installed/data/model/Ship/GE` use `directory-tree-sha256`; file and mask-set fallbacks use file/file-set SHA256.
2026-07-04 G027 Unity project/open blocker: the Unity project is present under `client-unity/` and declares editor `6000.5.2f1`; the installed editor path is `E:/unity/hub/6000.5.2f1/Editor/Unity.exe`. The batch open path reaches engine initialization but does not complete because the Unity Licensing Client mutex/channel fails repeatedly. Until the licensing client is repaired or manually cleared with sufficient permissions, Unity batch/manual QA remains blocked; server/data manifest work can continue.
2026-07-04 G028 Unity EditMode tests (blocker resolved by G045): C# manifest-loader EditMode tests exist at `client-unity/Assets/Tests/EditMode/Logh7ManifestLoaderTests.cs` and pass 4/4 in batchmode after the licensing repair. They remain a Unity-Editor validation step, not a Node/server substitute.
## 2026-07-04 G030 Remaster Provenance Operations

- Regenerate with `npm --prefix server run catalog:remaster-provenance`; this writes both `server/content/generated/logh7-remaster-provenance-manifest.json` and `client-unity/Assets/StreamingAssets/logh7/logh7-remaster-provenance-manifest.json`.
- The collector now reads artifact manifests that expose original asset lists as `entries[].source` plus `entries[].sourceSha256`. This is required for `empire-ship-reference`: current output has `shipSourceHashCount=6`, first source `.omo/work/logh7-installed/data/image/Thumbnail/Ship/iu008.tga`, SHA256 `d92982521bf4109fd770f436c366254949a555d046332d4fd23cd00ca3144106`.
- The Imperial crest must stay source-locked to `client-unity/Assets/ArtSource/reference/logh7-imperial-double-eagle-reference.jpg` SHA256 `822276b190c3e83729de39c14e4e9fc06c2eb8b39a56225bdcbe16f147134e9e`. Generated crests and invented ship silhouettes are invalid substitutes; remaster outputs remain optional reversible overlays with original fallback.
- Verification evidence: `.omo/ulw-loop/evidence/g030-remaster-provenance-ship-red-20260704.log`, `.omo/ulw-loop/evidence/g030-remaster-provenance-ship-green-20260704.log`, `.omo/ulw-loop/evidence/g030-remaster-provenance-ship-proof-20260704.log`, `.omo/ulw-loop/evidence/g030-server-tests-20260704.log`. Current full server tests pass `148/148`.
## 2026-07-04 G031 Gameplay Contract Boundary Operations

- Regenerate gameplay boundary with `npm --prefix server run catalog:gameplay-contract-boundary`. The command writes `server/content/generated/logh7-gameplay-contract-boundary.json` and `client-unity/Assets/StreamingAssets/logh7/logh7-gameplay-contract-boundary.json`.
- The manifest is a projection of `logh7-formula-provenance-guard.json` plus `logh7-server-servable-data-family.json`. Verified formula records become `implementedEvidenceBackedRules`; unresolved formulas become `unresolvedFormulaLocks` with `promotionAllowed=false`. Current output has `strategy-command-cost-table` as the only implemented evidence-backed rule and `9` unresolved formula locks.
- Missing or unreadable formula guard input must fail closed: no implemented rules, no formula promotion, normal runtime still Docker Compose server plus Unity player/launcher. Legacy EXE/live/Frida/UI explorer evidence remains oracle-only and cannot become a runtime shortcut.
- After adding this StreamingAssets file, rerun `npm --prefix server run catalog:unity-streamingassets-export`; current export has `fileCount=14`, includes `logh7-gameplay-contract-boundary.json`, excludes `logh7-unity-streamingassets-export.json`, and server/Unity copies are byte-equal.
## 2026-07-04 G033 Plan Compliance Audit Operations

- Run `node` receipt checks captured in `.omo/ulw-loop/evidence/g033-plan-compliance-audit-20260704.log` after documentation or manifest slices. Required assertions: recent goals complete with passed criteria, remaster/gameplay/StreamingAssets manifests remain `blocked-until-cross-source-confirmed`, diagnostic-only tooling is not normal runtime, immediate-report watch categories have no newly confirmed values, Unity Licensing IPC blocker remains visible, and required evidence files exist.
- Boundary audit `.omo/ulw-loop/evidence/g033-plan-compliance-boundary-20260704.log` intentionally includes a missing synthetic evidence file and must detect it. Use this pattern when a receipt slice might otherwise pass by failing to check evidence existence.
## Unity Visual Build Receipt - 2026-07-04

- Unity editor path used: `E:/unity/hub/6000.5.2f1/Editor/Unity.exe`.
- Build command produced `client-unity/Builds/Windows/LOGH7RevivalUnity.exe`; build log: `.omo/ulw-loop/evidence/codex-unity-windows-build-final2-20260704.log`.
- Runtime player was launched with `-force-d3d11 -screen-width 1280 -screen-height 720 -screen-fullscreen 0`; player log: `.omo/ulw-loop/evidence/codex-unity-player-run-final-20260704.log`.
- G045 player clickthrough launched the same built player and used OS mouse clicks for CONNECT, LOBBY, SELECT CHARACTER, ENTER WORLD, and STRATEGIC MAP. Evidence: `.omo/ulw-loop/evidence/g045-player-clickthrough-strategic-map-20260704.png`, `.omo/ulw-loop/evidence/g045-player-clickthrough-20260704.log`.
- G045 edge click launched a fresh player and clicked STRATEGIC MAP first; the screen stayed at Boot. Evidence: `.omo/ulw-loop/evidence/g045-player-edge-strategic-blocked-20260704.png`, `.omo/ulw-loop/evidence/g045-player-edge-strategic-blocked-20260704.log`.
- G046 player clickthrough launched the same built player, advanced to Strategic Map, then selected the `tactics` scene surface from `logh7-ui-scene-catalog.json`. Evidence: `.omo/ulw-loop/evidence/g046-player-scene-tactics-switch-20260704.png`, `.omo/ulw-loop/evidence/g046-player-scene-tactics-switch-20260704.log`.
- G046 edge click launched a fresh player and clicked `tactics`; the scene surface remained `launcher`. Evidence: `.omo/ulw-loop/evidence/g046-player-scene-tactics-blocked-20260704.png`, `.omo/ulw-loop/evidence/g046-player-scene-tactics-blocked-20260704.log`.
- Visual QA evidence: `.omo/ulw-loop/evidence/codex-unity-player-window-screenshot-final-20260704.png` and nonblank pixel check (`1296x759`, `unique=2284`). Batch scene capture evidence: `.omo/ulw-loop/evidence/codex-unity-validation-scene-screenshot-20260704.png` (`1920x1080`, `unique=2822`).
- Runtime boundary remains unchanged: Unity player is the product target; original EXE remains oracle-only, not normal runtime.
