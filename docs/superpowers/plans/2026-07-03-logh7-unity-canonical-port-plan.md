# LOGH VII Unity Canonical Port Implementation Plan

**For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Build the first Unity revival harness from the original CD authority: re-extract every CD/install/server-servable data source, cross-check current analysis, load canonical star/planet/UI data only after verification, show a faithful validation scene, and keep remastering as a reversible pack layer.

**Architecture:** Server-side Node tools own CD-first extraction, evidence-backed inventories, raw-record archives, cross-check ledgers, and Unity manifests. Unity consumes generated manifests from `StreamingAssets/LOGH7`, displays original/canonical content first, and optionally overlays remaster packs without overwriting original fallback assets. Legacy EXE/Ghidra/live-client tools remain oracle diagnostics for UI scene discovery and server-servable record validation, not runtime dependencies.

**Tech Stack:** Node.js ESM under `server/`, JSON canonical catalogs under `server/content/generated/`, Unity `6000.5.2f1`, C# EditMode tests, Unity `StreamingAssets`, Git Bash on Windows, CodeGraph first for source questions, LOGH7 RE/extract/live skills for oracle checks.

---

## Planning Evidence

- Design spec: `docs/superpowers/specs/2026-07-03-logh7-unity-bootstrap-harness-design.md`
- ULW scaffold:
  - `.omo/drafts/logh7-unity-canonical-port.md`
  - `.omo/plans/logh7-unity-canonical-port.md`
- RE/resource evidence: `.omo/ulw-loop/evidence/unity-scene-resource-re-20260703.md`
- Current authorities:
  - `docs/logh7-requirements-current.md`
  - `docs/logh7-architecture-operations-current.md`
  - `.omo/plans/logh7-internal-validation-plan.md`
  - `docs/logh7-document-index-current.md`
- Unity Editor: `E:/Unity/hub/6000.5.2f1/Editor/Unity.exe`
- Original CD media:
  - `artifacts/logh7-cd/Logh7.bin`
  - `artifacts/logh7-cd/Logh7.cue`
  - verification log: `.omo/ulw-loop/evidence/source-verify-from-archive-download-20260703.log`

## Non-Negotiable Scope

- This is a revival/remastering port, not a new loosely inspired game.
- Original assets and data remain canonical fallback.
- Remastered outputs are optional packs with source hash, tool/prompt/settings, reviewer, output hash, rollback path.
- Unity must not infer CP formulas, tactical outcomes, AI, economy, or hidden rules not backed by canonical data or RE evidence.
- Existing `server/content`, `RE/content`, `.omo/work/logh7-installed`, old extraction outputs, galaxy coordinates, star/planet records, and previous analysis are verification inputs, not trusted authorities.
- The original CD and CD-derived extraction roots are the first authority. Manual/OCR, Ghidra, live client, and wire/server traces are cross-check authorities.
- Hidden data is in scope. Raw sectors, ISO slack, installer internals, PE resources, string tables, unused resource slots, duplicate records, and server-servable records must be searched and classified.
- Legacy `G7MTClient.exe`, direct EXE launch, Frida, `ui_explorer`, preseed flags, and direct patch builders are diagnostic-only.
- Do not restore Python/JSON playable-client patch builders as normal runtime.
- Do not manually drag assets into Unity as the source of truth; all import state must be manifest-generated and reproducible.
- UI, stars, planets, portraits, models, textures, sounds, fonts, messages, and documents are first-class content classes.

## Files By Responsibility

### Server Inventory And Manifest

- Create: `server/src/server/logh7-cd-media.mjs`
  - Verifies BIN/CUE provenance, detects track mode, derives complete CD extraction requirements.
- Create: `server/tools/logh7_extract_cd_media.mjs`
  - Converts/mounts/extracts the CD filesystem and installer payloads into `.omo/work/logh7-cd-extract/`.
- Create: `server/src/server/logh7-cd-crosscheck.mjs`
  - Compares CD-derived extraction against installed data, current server content, RE content, Ghidra strings, and generated catalogs.
- Create: `server/tools/logh7_crosscheck_cd_extraction.mjs`
  - Writes `server/content/generated/logh7-cd-crosscheck-ledger.json`.
- Create: `server/src/server/logh7-hidden-data-scan.mjs`
  - Scans raw BIN/ISO/CAB/payload/EXE/DAT files for embedded signatures, strings, and unreferenced candidate data.
- Create: `server/tools/logh7_scan_hidden_data.mjs`
  - Writes `server/content/generated/logh7-hidden-data-candidates.json`.
- Create: `server/src/server/logh7-source-inventory.mjs`
  - Pure functions for walking CD source roots and comparison roots, hashing files, classifying extensions, assigning provenance and content class.
- Create: `server/src/server/logh7-unity-import-manifest.mjs`
  - Converts inventory plus canonical catalogs into Unity-facing import records.
- Create: `server/tools/logh7_inventory_sources.mjs`
  - CLI that writes `server/content/generated/logh7-source-inventory.json`.
- Create: `server/tools/logh7_build_unity_manifest.mjs`
  - CLI that writes `server/content/generated/logh7-unity-import-manifest.json`.
- Create: `server/tools/logh7_export_unity_streaming_assets.mjs`
  - CLI that copies original fallback assets and generated manifests into `client-unity/Assets/StreamingAssets/LOGH7/`.
- Modify: `server/package.json`
  - Add scripts: `catalog:sources`, `catalog:unity-manifest`, `export:unity-streaming-assets`.
- Test: `server/tests/server/logh7-cd-media.test.mjs`
- Test: `server/tests/server/logh7-cd-crosscheck.test.mjs`
- Test: `server/tests/server/logh7-hidden-data-scan.test.mjs`
- Test: `server/tests/server/logh7-source-inventory.test.mjs`
- Test: `server/tests/server/logh7-unity-import-manifest.test.mjs`

### UI Scene And Transition Catalog

- Create: `server/content/manual/ui-scenes.json`
  - Evidence-backed scene/surface seed from `.omo/ulw-loop/evidence/unity-scene-resource-re-20260703.md`.
- Create: `server/src/server/logh7-ui-scene-catalog.mjs`
  - Validates scene IDs, confidence, evidence links, required content classes, and transitions.
- Create: `server/tools/logh7_catalog_ui_scenes.mjs`
  - Writes `server/content/generated/logh7-ui-scene-catalog.json`.
- Modify: `server/package.json`
  - Add script `catalog:ui-scenes`.
- Test: `server/tests/server/logh7-ui-scene-catalog.test.mjs`

### Unity Project

- Create project root files through Unity or checked-in minimal project files:
  - `client-unity/ProjectSettings/ProjectVersion.txt`
  - `client-unity/Packages/manifest.json`
  - `client-unity/Assets/Scenes/Logh7ContentValidation.unity`
  - `client-unity/Assets/Scripts/Logh7/Data/Logh7UnityManifest.cs`
  - `client-unity/Assets/Scripts/Logh7/Data/Logh7UnityManifestLoader.cs`
  - `client-unity/Assets/Scripts/Logh7/Data/Logh7SceneCatalog.cs`
  - `client-unity/Assets/Scripts/Logh7/Presentation/Logh7ContentInventoryView.cs`
  - `client-unity/Assets/Scripts/Logh7/Presentation/Logh7GalaxyMapView.cs`
  - `client-unity/Assets/Scripts/Logh7/Presentation/Logh7RemasterToggle.cs`
  - `client-unity/Assets/Tests/EditMode/Logh7UnityManifestLoaderTests.cs`
  - `client-unity/Assets/Tests/EditMode/Logh7SceneCatalogTests.cs`
- Modify: `client-unity/README.md`
  - Replace placeholder boundary with actual commands, manifests, verification gates.
- Generated/copied by script, not hand-authored:
  - `client-unity/Assets/StreamingAssets/LOGH7/catalogs/*.json`
  - `client-unity/Assets/StreamingAssets/LOGH7/original/by-hash/*`
  - `client-unity/Assets/StreamingAssets/LOGH7/remaster-packs/README.md`

### Documentation And Dashboard

- Modify:
  - `docs/logh7-requirements-current.md`
  - `docs/logh7-architecture-operations-current.md`
  - `.omo/plans/logh7-internal-validation-plan.md`
  - `docs/logh7-document-index-current.md`
  - `docs/logh7-developer-dashboard.html`
- Evidence output:
  - `.omo/ulw-loop/evidence/unity-source-inventory-20260703.log`
  - `.omo/ulw-loop/evidence/unity-streaming-export-20260703.log`
  - `.omo/ulw-loop/evidence/unity-batchmode-20260703.log`
  - `.omo/ulw-loop/evidence/unity-scene-screenshot-20260703.png`

## Verification Strategy

- Test decision: TDD for server inventory, manifest, and UI scene catalog modules.
- Test decision: TDD for CD media verification, CD-derived extraction planner, and cross-check ledger before any Unity work.
- Unity tests-after for first C# loader surface because project files may be generated by Unity bootstrap.
- Every command writes evidence under `.omo/ulw-loop/evidence/`.
- Required test/validation commands:
  - `npm --prefix server run catalog:sources`
  - `npm --prefix server run extract:cd-media`
  - `npm --prefix server run crosscheck:cd-extraction`
  - `npm --prefix server run scan:hidden-data`
  - `npm --prefix server run catalog:ui-scenes`
  - `npm --prefix server run catalog:unity-manifest`
  - `npm --prefix server run export:unity-streaming-assets`
  - `npm --prefix server test -- tests/server/logh7-cd-media.test.mjs tests/server/logh7-cd-crosscheck.test.mjs tests/server/logh7-hidden-data-scan.test.mjs tests/server/logh7-source-inventory.test.mjs tests/server/logh7-unity-import-manifest.test.mjs tests/server/logh7-ui-scene-catalog.test.mjs`
  - `E:/Unity/hub/6000.5.2f1/Editor/Unity.exe -batchmode -quit -projectPath E:/logh7-revival/client-unity -runTests -testPlatform EditMode -testResults E:/logh7-revival/.omo/ulw-loop/evidence/unity-editmode-results.xml -logFile E:/logh7-revival/.omo/ulw-loop/evidence/unity-batchmode-20260703.log`
- Manual QA gate:
  - Open Unity validation scene or run a screenshot-capable batch/playmode path.
  - Verify visible content inventory, galaxy/system list, planet counts, scene transition list, original/remaster toggle.

## Task 0: Original CD Re-Extraction Authority

**Files:**

- Create: `server/src/server/logh7-cd-media.mjs`
- Create: `server/tools/logh7_extract_cd_media.mjs`
- Create: `server/src/server/logh7-cd-crosscheck.mjs`
- Create: `server/tools/logh7_crosscheck_cd_extraction.mjs`
- Test: `server/tests/server/logh7-cd-media.test.mjs`
- Test: `server/tests/server/logh7-cd-crosscheck.test.mjs`
- Modify: `server/package.json`
- Generated:
  - `.omo/work/logh7-cd-extract/`
  - `server/content/generated/logh7-cd-crosscheck-ledger.json`
  - `.omo/ulw-loop/evidence/cd-extract-20260703.log`
  - `.omo/ulw-loop/evidence/cd-crosscheck-20260703.log`

- [ ] Step 1: Write failing tests for CD provenance verification.
  - Use existing metadata in `server/content/original-data/logh7-archive-org.json`.
  - Expected `Logh7.bin`:
    - size `229070688`
    - MD5 `bf87c6a8cb068f05625737377a07b09d`
    - SHA1 `80e261e9d84c81bca622c99d9cbdc47a2154c1a8`
  - Expected `Logh7.cue`:
    - size `71`
    - MD5 `878418e704a913f7baac67b38b10e680`
    - SHA1 `9bff4ea17ca6ff7b088440bd7f8a5206cd2dfe81`
- [ ] Step 2: Write failing tests for extraction plan.
  - The tool must not treat `.omo/work/logh7-installed` as source authority.
  - It must produce distinct phases:
    - `verify-media`
    - `convert-or-read-track`
    - `extract-cd-filesystem`
    - `extract-installshield-or-cab-payloads`
    - `inventory-cd-root`
    - `inventory-installed-payload`
    - `raw-record-extract`
    - `crosscheck-existing-analysis`
- [ ] Step 3: Implement media verifier and extraction planner.
  - Prefer structured Node APIs and explicit external command checks.
  - Allowed external tools if found: `7z`, `bsdtar`, `PowerShell Mount-DiskImage`, `isoinfo`, `cabextract`, `unshield`.
  - If a required extractor is missing, write exact missing tool and fallback command to evidence, not a guessed partial extraction.
- [ ] Step 4: Add scripts:
  - `extract:cd-media`
  - `crosscheck:cd-extraction`
- [ ] Step 5: Run media verification.
  - Run: `npm --prefix server run verify:source | tee .omo/ulw-loop/evidence/source-verify-from-archive-download-20260703.log`
  - Expected: `ok: true`.
- [ ] Step 6: Run CD extraction.
  - Run: `npm --prefix server run extract:cd-media > .omo/ulw-loop/evidence/cd-extract-20260703.log`
  - Expected:
    - Extracted tree appears under `.omo/work/logh7-cd-extract/`.
    - The log includes every CD-visible file and every installer/payload output path.
    - If extraction is blocked by missing tools, the log exits non-zero with exact tool names and no canonical promotion occurs.
- [ ] Step 7: Run cross-check.
  - Run: `npm --prefix server run crosscheck:cd-extraction > .omo/ulw-loop/evidence/cd-crosscheck-20260703.log`
  - Expected:
    - `server/content/generated/logh7-cd-crosscheck-ledger.json` records matches/mismatches among CD extraction, installed data, `server/content`, `RE/content`, Ghidra strings, and generated catalogs.
    - Existing galaxy/star/planet records remain `unconfirmed` until matched to CD/manual/Ghidra/live evidence.
- [ ] Step 8: Run tests green.

## Task 0B: Hidden Data Sweep

**Files:**

- Create: `server/src/server/logh7-hidden-data-scan.mjs`
- Create: `server/tools/logh7_scan_hidden_data.mjs`
- Test: `server/tests/server/logh7-hidden-data-scan.test.mjs`
- Modify: `server/package.json`
- Generated:
  - `server/content/generated/logh7-hidden-data-candidates.json`
  - `.omo/ulw-loop/evidence/hidden-data-scan-20260703.log`

- [ ] Step 1: Write failing tests for signature scanning.
  - Test scanner finds known signatures at non-zero offsets in a fixture buffer.
  - Required signatures:
    - `CD001`
    - `MSCF`
    - `MZ`
    - `PE\0\0`
    - PNG
    - BMP
    - OGG
    - PDF
    - RIFF/WAV
    - MDX/MDS text markers where present
    - TCF magic candidates
    - `MsgDat`
    - `G7MTClient`
- [ ] Step 2: Write failing tests for candidate classification.
  - Candidate states:
    - `extracted-file`
    - `duplicate-of-extracted`
    - `embedded-resource`
    - `raw-sector-only`
    - `false-positive`
    - `needs-parser`
  - Candidate must include source path, byte offset, signature, nearby bytes hash, containing extracted file if known, and verification status.
- [ ] Step 3: Implement scanner over:
  - `artifacts/logh7-cd/Logh7.bin`
  - `.omo/work/logh7-cd-extract/Logh7_mode2_2048.iso`
  - `.omo/work/logh7-cd-extract/iso-root/*`
  - `.omo/work/logh7-cd-extract/installshield-root/**/*`
  - `.omo/ghidra/bin/*.exe`
- [ ] Step 4: Add string sweeps.
  - Encodings: ASCII, CP932/Shift-JIS where possible, UTF-16LE.
  - Terms: system names, planet names, `MsgDat`, `SelectGrid`, `Tactics`, `Response`, `Request`, `GALAXY`, `String.txt`, file extensions, command names.
- [ ] Step 5: Add PE resource sweep.
  - Extract resource tree metadata from `G7MTClient.exe`, `G7Start.exe`, `Gin7UpdateClient.exe`, `BootFirst.exe`, `setup.exe`.
  - If no parser is available, record exact blocker and keep raw resource directory candidates.
- [ ] Step 6: Add ISO/CAB slack checks.
  - Record ISO volume size vs extracted file extents.
  - Record raw signature hits not explained by extracted file ranges.
  - Record CAB entries and duplicate internal filenames.
- [ ] Step 7: Run scanner.
  - Run: `npm --prefix server run scan:hidden-data > .omo/ulw-loop/evidence/hidden-data-scan-20260703.log`
  - Expected: candidate JSON contains raw hits and a classification field; no hit is silently discarded.
- [ ] Step 8: Feed hidden candidates into cross-check ledger.
  - Hidden candidates must not become canonical until parsed and matched to a real game consumer or source.

## Task 0A: Server-Servable Data Exhaustive Extraction Plan

**Files:**

- Create: `server/content/manual/server-data-extraction-scope.json`
- Create: `server/src/server/logh7-server-data-scope.mjs`
- Create: `server/tools/logh7_catalog_server_data_scope.mjs`
- Test: `server/tests/server/logh7-server-data-scope.test.mjs`

- [ ] Step 1: Write failing tests for required data families.
  - Required families:
    - systems, stars, planets, fortresses, special bodies
    - grid cells, terrain/passability, routes/adjacency
    - factions, ownership, occupation, economy, facilities
    - characters, faces, ranks, titles, posts, medals, stats
    - fleets, ships, ship classes, hardpoints, weapons, shields, engines, sensors, carriers, troops
    - bases, warehouses, supplies, production, logistics, repairs
    - cards, commands, proposals, jobs/duties, authority gates
    - operations, movement, warp/fuel/CP/range, reports/mail
    - tactical units, tactics grids, battle commands, retreat/warp-out, battle results
    - UI text, messages, menus, labels, help, errors
    - launcher/update/notice/community surfaces
- [ ] Step 2: Implement scope catalog.
  - Each family must list candidate sources: CD file, installed payload, MsgDat, MDX/MDS, TCF, DAT table, manual/OCR, Ghidra string/function, live trace, server generated catalog.
  - Each family must carry `status`: `not-started`, `raw-extracted`, `normalized`, `crosschecked`, `canonical`, `blocked`, `unresolved`.
- [ ] Step 2A: Mark previous world analysis as suspect until crosschecked.
  - `server/content/galaxy.json` positions, spectral class, grid coordinates, system order, planet lists, special bodies, fortresses, economy records, and passable cells must be tagged `previous-analysis-unconfirmed` until the new CD/manual/Ghidra/live cross-check promotes them.
  - Do not use current galaxy data to justify itself.
- [ ] Step 3: Generate `server/content/generated/logh7-server-data-scope-catalog.json`.
- [ ] Step 4: Add this catalog to Unity manifest and dashboard.

## Task 1: Source Inventory Module

**Files:**

- Create: `server/src/server/logh7-source-inventory.mjs`
- Create: `server/tools/logh7_inventory_sources.mjs`
- Test: `server/tests/server/logh7-source-inventory.test.mjs`
- Modify: `server/package.json`

- [ ] Step 1: Write failing tests for inventory classification.
  - Test a temp tree with `.bmp`, `.tga`, `.mdx`, `.mds`, `.tcf`, `.dat`, `.jpg`, `.ogg`, `.wav`, `.pdf`, `.txt`, `.json`, `.hed`, `.vix`, unknown extension.
  - Expected fields per record: `sourceRoot`, `relativePath`, `sizeBytes`, `sha256`, `extension`, `contentClass`, `provenance`, `unityEligible`, `diagnosticOnly`, `notes`.
- [ ] Step 2: Run the focused test and confirm it fails.
  - Run: `npm --prefix server test -- tests/server/logh7-source-inventory.test.mjs`
  - Expected: FAIL because module does not exist.
- [ ] Step 3: Implement minimal inventory functions.
  - Source roots must include at least:
    - `artifacts/logh7-cd`
    - `.omo/work/logh7-cd-extract`
    - `.omo/work/logh7-installed`
    - `server/content`
    - `RE/content`
    - `.omo/ghidra/export/G7MTClient`
  - Classification must mark EXE/patch/live diagnostic inputs as diagnostic-only when encountered.
- [ ] Step 4: Add CLI and package script.
  - Script: `catalog:sources`.
  - Output: `server/content/generated/logh7-source-inventory.json`.
- [ ] Step 5: Run command and capture evidence.
  - Run: `npm --prefix server run catalog:sources > .omo/ulw-loop/evidence/unity-source-inventory-20260703.log`
  - Expected: generated JSON includes Archive media, CD-derived extraction roots, and comparison roots. Previously observed installed-resource counts are comparison evidence only: 2,191 installed files, including 994 BMP, 662 TGA, 406 MDX, 7 TCF, 22 DAT, 13 WAV, 7 OGG.
- [ ] Step 6: Run focused tests green.

## Task 2: Unity Import Manifest Generator

**Files:**

- Create: `server/src/server/logh7-unity-import-manifest.mjs`
- Create: `server/tools/logh7_build_unity_manifest.mjs`
- Test: `server/tests/server/logh7-unity-import-manifest.test.mjs`
- Modify: `server/package.json`

- [ ] Step 1: Write failing tests for manifest construction.
  - It must include content classes for UI, stars, planets, portraits, models, textures, sounds, fonts, messages, documents, rules, and unknowns.
  - It must include canonical dataset references:
    - `server/content/galaxy.json`
    - `server/content/planet-economy.json`
    - `server/content/extracted/model-planets.json`
    - `server/content/extracted/model-galaxy-stars.json`
    - `server/content/generated/logh7-mdx-catalog.json`
    - `server/content/generated/logh7-face-portrait-catalog.json`
    - `server/content/generated/logh7-strategy-command-catalog.json`
- [ ] Step 2: Run test and confirm fail.
- [ ] Step 3: Implement generator.
  - Output manifest fields: `manifestVersion`, `generatedAt`, `cdMedia`, `cdExtraction`, `sourceInventoryHash`, `crosscheckLedger`, `canonicalCatalogs`, `originalAssets`, `serverDataFamilies`, `remasterPacks`, `unityStreamingLayout`, `coverage`.
  - Coverage must distinguish `importedOriginalFallback`, `canonicalData`, `generatedCatalog`, `remasterCandidate`, `diagnosticOnly`, `blocked`, `unknown`.
- [ ] Step 4: Add CLI and package script.
  - Script: `catalog:unity-manifest`.
  - Output: `server/content/generated/logh7-unity-import-manifest.json`.
- [ ] Step 5: Run command.
  - Run: `npm --prefix server run catalog:unity-manifest`
  - Expected: manifest references CD-derived source paths, all first-class world/server data families, and original resource classes; no remaster pack is marked canonical.
- [ ] Step 6: Run tests green.

## Task 3: UI Scene Catalog

**Files:**

- Create: `server/content/manual/ui-scenes.json`
- Create: `server/src/server/logh7-ui-scene-catalog.mjs`
- Create: `server/tools/logh7_catalog_ui_scenes.mjs`
- Test: `server/tests/server/logh7-ui-scene-catalog.test.mjs`
- Modify: `server/package.json`

- [ ] Step 1: Write failing tests for scene seed validation.
  - Required scenes/surfaces:
    - `launcherAccount`
    - `login`
    - `lobbySessionList`
    - `characterCreationSelection`
    - `worldEntry`
    - `strategicGalaxyGrid`
    - `gridSelectCommandTargeting`
    - `informationPanels`
    - `tacticsBattleEntry`
    - `tacticsBattleExecution`
  - Each scene requires `confidence`, `evidence`, `requiredContentClasses`, `allowedTransitions`.
- [ ] Step 2: Create `ui-scenes.json` from current RE evidence.
  - Include Ghidra candidates from `.omo/ulw-loop/evidence/unity-scene-resource-re-20260703.md`.
  - Mark exact UI topology as unresolved where only strings/protocol names exist.
- [ ] Step 3: Implement catalog validation/generation.
  - Output: `server/content/generated/logh7-ui-scene-catalog.json`.
- [ ] Step 4: Run:
  - `npm --prefix server run catalog:ui-scenes`
  - Expected: scene catalog includes transition graph and confidence levels.
- [ ] Step 5: Run focused tests green.

## Task 4: Unity StreamingAssets Export

**Files:**

- Create: `server/tools/logh7_export_unity_streaming_assets.mjs`
- Test: extend `server/tests/server/logh7-unity-import-manifest.test.mjs`
- Modify: `server/package.json`
- Generated:
  - `client-unity/Assets/StreamingAssets/LOGH7/catalogs/*.json`
  - `client-unity/Assets/StreamingAssets/LOGH7/original/by-hash/*`
  - `client-unity/Assets/StreamingAssets/LOGH7/remaster-packs/README.md`

- [ ] Step 1: Write failing test using temp source/destination directories.
  - Verify exported original asset path is hash-addressed and manifest maps back to original path.
  - Verify remaster pack directory exists but no generated/AI asset is canonical.
- [ ] Step 2: Implement export CLI.
  - Copy only from source roots into Unity `StreamingAssets`.
  - Do not alter `.omo/work/logh7-installed`.
  - Use deterministic paths and skip identical hashes.
- [ ] Step 3: Run:
  - `npm --prefix server run export:unity-streaming-assets > .omo/ulw-loop/evidence/unity-streaming-export-20260703.log`
  - Expected: catalogs copied and original fallback assets exported; command prints counts by class and skipped identical files.
- [ ] Step 4: Run tests green.

## Task 5: Unity Project Bootstrap

**Files:**

- Create/verify:
  - `client-unity/ProjectSettings/ProjectVersion.txt`
  - `client-unity/Packages/manifest.json`
  - `client-unity/Assets/Scenes/Logh7ContentValidation.unity`
- Modify:
  - `client-unity/README.md`

- [ ] Step 1: Create Unity project using installed editor if project files are absent.
  - Run: `E:/Unity/hub/6000.5.2f1/Editor/Unity.exe -batchmode -quit -createProject E:/logh7-revival/client-unity -logFile E:/logh7-revival/.omo/ulw-loop/evidence/unity-create-project-20260703.log`
  - Expected: Unity exits 0 and writes project settings without deleting `client-unity/README.md`.
- [ ] Step 2: Pin Unity version.
  - `ProjectVersion.txt` must contain `m_EditorVersion: 6000.5.2f1`.
- [ ] Step 3: Add README commands.
  - Include create/open, export manifests, run EditMode tests, and no-legacy-runtime boundary.
- [ ] Step 4: Run Unity batchmode project open.
  - Run: `E:/Unity/hub/6000.5.2f1/Editor/Unity.exe -batchmode -quit -projectPath E:/logh7-revival/client-unity -logFile E:/logh7-revival/.omo/ulw-loop/evidence/unity-open-project-20260703.log`
  - Expected: exit 0; no compile errors.

## Task 6: Unity Manifest Loader And Tests

**Files:**

- Create: `client-unity/Assets/Scripts/Logh7/Data/Logh7UnityManifest.cs`
- Create: `client-unity/Assets/Scripts/Logh7/Data/Logh7UnityManifestLoader.cs`
- Create: `client-unity/Assets/Scripts/Logh7/Data/Logh7SceneCatalog.cs`
- Create: `client-unity/Assets/Tests/EditMode/Logh7UnityManifestLoaderTests.cs`
- Create: `client-unity/Assets/Tests/EditMode/Logh7SceneCatalogTests.cs`

- [ ] Step 1: Write EditMode tests first.
  - Loader must parse `logh7-unity-import-manifest.json`.
  - Loader must expose counts for original assets, canonical catalogs, scene catalog, stars, systems, planets, remaster packs.
  - Scene catalog test must require all 10 planned surfaces.
- [ ] Step 2: Run Unity EditMode tests and confirm fail.
  - Expected: C# types missing.
- [ ] Step 3: Implement minimal serializable C# DTOs and loader.
  - Use Unity `JsonUtility` only if manifest shape is compatible; otherwise use a small included parser only if already available in Unity packages. Do not add large dependencies without recording reason.
- [ ] Step 4: Run EditMode tests green.

## Task 7: Unity Validation Scene For Revival Content

**Files:**

- Create: `client-unity/Assets/Scripts/Logh7/Presentation/Logh7ContentInventoryView.cs`
- Create: `client-unity/Assets/Scripts/Logh7/Presentation/Logh7GalaxyMapView.cs`
- Create: `client-unity/Assets/Scripts/Logh7/Presentation/Logh7RemasterToggle.cs`
- Modify/create: `client-unity/Assets/Scenes/Logh7ContentValidation.unity`

- [ ] Step 1: Implement a utilitarian validation scene, not a marketing splash.
  - Visible panels:
    - content coverage counts
    - scene/surface transition list
    - galaxy system count and sample system list
    - planet record count
    - original/remaster active layer
    - unresolved gameplay formulas list
  - The first viewport must signal LOGH VII revival content, not a generic Unity sample.
- [ ] Step 2: Add original/remaster toggle.
  - Default: original fallback.
  - Remaster pack: disabled/empty until assets exist, but the toggle must show pack status.
- [ ] Step 3: Run Unity batchmode.
  - Expected: compile succeeds.
- [ ] Step 4: Manual QA surface.
  - Capture screenshot into `.omo/ulw-loop/evidence/unity-scene-screenshot-20260703.png`.
  - Verify UI text does not overlap, counts are visible, and star/planet data appears.

## Task 8: Remaster Pack Foundation

**Files:**

- Create: `server/content/remaster-packs/README.md`
- Create: `server/content/remaster-packs/schema.json`
- Create: `server/content/remaster-packs/internal-original-upscale-seed.json`
- Create or update: `client-unity/Assets/StreamingAssets/LOGH7/remaster-packs/README.md`
- Test: extend `server/tests/server/logh7-unity-import-manifest.test.mjs`

- [ ] Step 1: Define remaster pack schema.
  - Required fields: `packId`, `status`, `sourceAssetSha256`, `sourcePath`, `method`, `tool`, `settingsOrPrompt`, `reviewer`, `outputSha256`, `licenseNote`, `rollback`, `qaEvidence`.
  - Allowed `method`: `original-derived-upscale`, `hand-cleaned`, `generated-placeholder`, `community-contribution`.
- [ ] Step 2: Add tests preventing remaster assets from being marked canonical.
- [ ] Step 3: Add seed pack metadata with no actual remastered replacement yet.
  - The seed should identify candidate classes: portraits, UI textures, galaxy/background textures, ship models, effects, sounds.
  - Each candidate must point back to CD-derived source hash, not only installed or previous extracted output.
- [ ] Step 4: Run server tests.

## Task 9: Gameplay Contract Boundary

**Files:**

- Create: `server/content/generated/logh7-unity-gameplay-contract.json` through a small generator or extend the Unity manifest generator.
- Modify: `server/src/server/logh7-unity-import-manifest.mjs`
- Modify: `client-unity/Assets/Scripts/Logh7/Data/Logh7UnityManifest.cs`
- Test: extend server and Unity tests.

- [ ] Step 1: Add explicit gameplay contract sections.
  - Include operation state reducer availability.
  - Include strategy command catalog.
  - Include unresolved CP, combat, economy, AI, battle outcome formulas.
- [ ] Step 2: Unity loader exposes unresolved formulas.
- [ ] Step 3: Unity validation scene displays unresolved formulas as locked, not implemented.
- [ ] Step 4: Run server and Unity tests.

## Task 10: Documentation, Dashboard, And Review Closure

**Files:**

- Modify:
  - `docs/logh7-requirements-current.md`
  - `docs/logh7-architecture-operations-current.md`
  - `.omo/plans/logh7-internal-validation-plan.md`
  - `docs/logh7-document-index-current.md`
  - `docs/logh7-developer-dashboard.html`
  - `.omo/drafts/logh7-unity-canonical-port.md`
  - `.omo/plans/logh7-unity-canonical-port.md`

- [ ] Step 1: Update current docs with actual Unity bootstrap status.
  - Include source inventory counts, Unity manifest outputs, scene catalog status, remaster pack foundation, known gaps.
- [ ] Step 2: Update document index.
  - Add new generated catalogs and Unity project files.
- [ ] Step 3: Update dashboard.
  - Status should show revival/remastering port, not legacy-client patch route.
- [ ] Step 4: Run self-review scans.
  - Run: `rg -n "TBD|TODO|fill in|implement later|appropriate|similar" docs/superpowers/plans/2026-07-03-logh7-unity-canonical-port-plan.md .omo/plans/logh7-unity-canonical-port.md .omo/ulw-loop/evidence/unity-scene-resource-re-20260703.md`
  - Expected: no placeholder language except deliberate checkbox task text if any.
- [ ] Step 5: Run changed-file formatting/syntax checks.
  - JSON files parse.
  - Node modules syntax check through tests.
  - Unity compile/test command.
- [ ] Step 6: If implementation happened, use review skills before claiming complete.
  - `superpowers:verification-before-completion`
  - `superpowers:requesting-code-review`
  - `omo:review-work` when available and scoped.
  - gstack `/review` where a diff exists.

## Dependency Matrix

| Task | Depends on | Blocks | Parallelizable |
| --- | --- | --- | --- |
| 0 CD Re-Extraction | original media | 0B, 1, 2, 4, 8, 9 | 0A after source families listed |
| 0A Server Data Scope | current docs, RE evidence | 2, 7, 9, 10 | 0 |
| 0B Hidden Data Sweep | 0 partial extraction | 1, 2, 8, 9 | 0A |
| 1 Source Inventory | 0 | 2, 4 | 3 |
| 2 Unity Manifest | 1 | 4, 6, 7, 9 | 3 |
| 3 UI Scene Catalog | RE evidence | 6, 7 | 1, 2 |
| 4 StreamingAssets Export | 1, 2 | 6, 7 | 5 after project exists |
| 5 Unity Project Bootstrap | none | 6, 7 | 1, 2, 3 |
| 6 Unity Loader | 2, 3, 4, 5 | 7, 9 | none |
| 7 Validation Scene | 5, 6 | 10 | 8 partially |
| 8 Remaster Pack Foundation | 1, 2 | 7 toggle, 10 | 5, 6 |
| 9 Gameplay Contract Boundary | 2, 6 | 7, 10 | 8 |
| 10 Docs/Dashboard/Review | all prior tasks | completion | none |

## Acceptance Criteria

- Original installed resources are inventoried by hash and class.
- Original Archive BIN/CUE are present and hash-verified.
- CD filesystem and installer payload extraction are attempted from `artifacts/logh7-cd`; any blocker is exact and recorded.
- Existing `server/content` galaxy/star/planet/UI/server data records are cross-checked, not blindly trusted.
- Server-servable data families are explicitly scoped and tracked.
- Hidden data candidates are scanned, classified, and preserved in a generated candidate ledger.
- Previous galaxy/system/star/planet conclusions are not treated as canonical unless the CD/manual/Ghidra/live cross-check confirms them.
- Unity import manifest references UI, star, planet, portrait, model, texture, sound, font, message, document, rule, and unknown classes.
- `galaxy.json`, `planet-economy.json`, `model-planets.json`, and `model-galaxy-stars.json` are loaded by Unity-facing manifest.
- UI scene catalog includes launcher/account, login, lobby/session, character, world, strategic grid, command targeting, information panels, tactical entry, tactical execution.
- Unity project opens with `6000.5.2f1` in batchmode.
- Unity EditMode tests parse manifest and scene catalog.
- Unity validation scene visibly shows content inventory, galaxy/system/planet data, scene transitions, remaster toggle, unresolved gameplay formulas.
- Remastering foundation exists but does not overwrite or relabel original assets.
- Current docs and dashboard reflect Unity revival/remastering path.

## Execution Notes

- Use `git_bash` MCP for shell commands on Windows.
- Use CodeGraph before source edits or call-path questions.
- Use LOGH7 skills before generic game skills for evidence questions.
- Use generic Unity/game/remaster/OCR skills only as implementation aids.
- Do not stage or commit unless explicitly requested.
