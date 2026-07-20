# LOGH VII Current Document Index

> **2026-07-20 설계 게이트:** GitHub #216 / Jira LOGH7-213의 마스터 설계는 [`logh7-causal-ledger-master-design.md`](logh7-causal-ledger-master-design.md)다. 사용자가 승인했으며 현재 상태는 `APPROVED-PENDING-MERGE`다. PR #232 merge 전에는 구현 권위가 아니고, merge 뒤 15축 자식 이슈의 공통 계약과 완료 감사 기준으로 승격한다.
> **현재 라우팅 (2026-07-15):** 시작 권위는 아래 세 문서뿐이다. 핸드오프·로드맵·대시보드는 근거 또는 파생 상태이며 계획 권위가 아니다.

> **현재 플레이어 경로:** 설치 폴더의 수정된 `g7mtclient.exe`를 직접 실행한다. 보조 런처·`ui_explorer`·overlay는 정상 경로가 아니며, 수정 도구 언어(Python 포함)는 제한하지 않는다. 직접 in-place 패치에도 원본 백업, source-hash guard, rollback 경로가 필수다.

2026-07-17 사용자 매뉴얼·배포 방침 등재: 루트 `README.md`가 신설됐다(Claude·Codex 사용자 매뉴얼 링크, 배포 계획, 개발 진입점). AI 자동 업무 관리 사용자 매뉴얼은 `docs/agent/claude-code-ai-업무관리-매뉴얼.md`(Claude Code용)와 `docs/agent/codex-user-manual.md`(Codex용) 두 벌이며 `docs/agent/README.md` 라우팅 표로 진입한다. 클라이언트/서버 레포 분리·부트스트랩 클라이언트 최종 배포 방침은 `docs/logh7-architecture-operations-current.md`의 "Distribution and Repository Split Plan (2026-07-17)" 절과 `.ai/decisions.md` ADR-LITE-006이 정본이다 (PR #167 merge). 같은 날 옵시디언 볼트 연동이 활성화됐다: 볼트 정본은 `peppone-choi/obsidian-tech-vault` 클론이며 머신별 `LOGH7_VAULT_DIR` 설정·참조 훅은 `docs/agent/tool-capabilities.md` 하네스 변경 이력이 정본이다 (PR #169 merge, 게이트 볼트 검사 라이브 동작 확인).

2026-07-16 Agent Operating System 부트스트랩: 에이전트 세션 진입 라우팅이 재구조화됐다. 진입은 `CLAUDE.md`(Claude) / `AGENTS.md`(Codex, 도구 독립 계약) → `.ai/task.md`(작업 계약)·`.ai/decisions.md`(승인 결정) → `docs/agent/README.md`(작업 유형별 문서 라우터) 순서다. 검증 행렬은 `docs/agent/verification.md`, 공통 검증 스크립트는 `scripts/agent/verify-changes.sh`(Claude 훅·Codex 수동 공용), 실패 메모리는 `docs/agent/failure-cases.md`. 근거 결정: `.ai/decisions.md` ADR-LITE-001~005.

2026-07-14 현재 상태: run9 EXE SHA256은 `825635783a9fb663ae3b9a2ecf8d4b74df648322256c57ee32f6426c42a23f22`다. `postlogin` 59개 패치(`lobby-res` 8 + layout 13 + `charsel` 38), 로그인 레이아웃 패치 33개 제거, 로그인 내부 644×484와 로그인 후 1920×1080(캡처 1924×1084)을 검증했다. `.omo/live-qa/m3-two-client-persistence-1080p-cp932-20260714-run9/`에서 직접 실행 5회, 두 계정 월드 진입, `0x0b01 → 0x0b07`의 B 반영, cell `2587` 재로그인·서버 재시작 영속, 정리를 포함한 8/8 게이트를 통과했다. M3 완료로 마일스톤은 4/8(50%)이며, 전체 작업량은 보수적으로 35%다.

2026-07-15 M4 현재 상태: production `createPlayableRuntime`가 `EnterWorld`·`MoveGrid`에 동기 CQRS/UoW와 `0x0315 spaceCells ∪ systemCells` navigability policy를 주입한다. 성공 이동만 SQLite cell과 `GridMoved`를 커밋하며 거부 이동은 무변경이다. 이 집합은 runtime consistency일 뿐 canonical promotion이 아니다. `.omo/live-qa/m4-cqrs-two-client-20260715-run3/`의 원본 EXE 8/8은 JSON store live QA라 SQLite CQRS 증거와 분리한다. M4는 81개 중 factory 확인 2개·미해결 79개인 부분 상태다.

2026-07-13 역사적 핸드오프 스냅샷: [[logh7-strategy-system-detail-current|전략맵 성계 상세 복원]]과 [[logh7-m4-strategy-system-detail-handoff-2026-07-13|M4 전략 성계 상세 핸드오프]]에 `cell 2588 → runtime base ID 70`, static prerequisite `0x031d`, phase `0`의 `0x031e → 0x031f`, phase `1`의 `0x0326 → 0x0327`, generic info factory `0x19/0x2d/0x43 → FUN_00579e60 → FUN_0057aa90`을 정리했다. 권한카드 브리지는 `6720faf2`로 커밋됐고 자동 검증을 마쳤다. 당시 열린 경계는 자연 Captain kind `59 → 0x2d`의 B71 라이브 출력이었다. 현재 상태는 실행 계획과 파생 대시보드를 따른다.

2026-07-04 G070 Unity 클라이언트 완전 삭제: `client-unity/` 작업트리 제거(보존 `dbf3b43` → 제거 `ca24dd3`). 아래 `client-unity/README.md` 등 Unity 경로를 가리키는 인덱스 항목은 더 이상 작업트리에 존재하지 않으며, 참조하려면 git 히스토리에서 복원해야 한다.

2026-07-04 G069 방향 전환: 레거시 클라이언트(`G7MTClient.exe`) 직접 수정이 잠정 주 경로로 재오픈됨(Unity 픽셀-패러티 시연 후 사용자 명시적 지시). Unity(`client-unity/`)는 RE 완료 후 재이식 목표로 보류. 상세는 `docs/logh7-requirements-current.md`/`docs/logh7-architecture-operations-current.md`/`.omo/plans/logh7-execution-plan-current.md`와 메모리 `logh7-legacy-client-reopen-2026-07-04` 참조.

2026-07-04 G048 Unity scene-panel manifest evidence: current Unity player visual reference includes `.omo/ulw-loop/evidence/g048-scene-panel-manifest-player-battle-20260704.png`, manifest proof `.omo/ulw-loop/evidence/g048-scene-panel-manifest-proof-20260704.log`, and build log `g048-scene-panel-manifest-unity-build-20260704.log`.

Updated: 2026-07-15

2026-07-04 Unity scene-panel evidence: current Unity player visual reference includes `.omo/ulw-loop/evidence/g047-scene-panel-surfaces-compact-20260704/contact-sheet.png`, representative `.omo/ulw-loop/evidence/g047-scene-panel-surfaces-compact-20260704/09-battle.png`, and `g047-scene-panel-compact-unity-windows-build-20260704.log`.

2026-07-04 G043 galaxy trust references: `server/content/generated/logh7-current-content-crosscheck.json`, `server/content/generated/logh7-galaxy-trust-crosscheck.json`, `server/content/generated/logh7-hidden-data-watchlist.json`, `server/content/generated/logh7-unity-streamingassets-export.json`, `.omo/ulw-loop/evidence/g043-galaxy-current-data-proof-20260704.log`, `.omo/ulw-loop/evidence/g043-focused-galaxy-current-data-tests-20260704.log`, `.omo/ulw-loop/evidence/g043-server-tests-after-export-refresh-20260704.log`.

2026-07-04 G035/G036 gate references: `.omo/ulw-loop/evidence/g035-unity-batchmode-20260704.log`, `.omo/ulw-loop/evidence/g035-unity-batchmode-summary-20260704.log`, `.omo/ulw-loop/evidence/g035-ulw-checkpoint-blocked-20260704.log`, `.omo/ulw-loop/evidence/g036-scope-fidelity-audit-20260704.log`, `.omo/ulw-loop/evidence/g036-focused-scope-fidelity-tests-20260704.log`, `.omo/ulw-loop/evidence/g036-server-tests-20260704.log`.

2026-07-04 ULW final status references: `.omo/ulw-loop/evidence/g038-status-final-20260704.json`, `.omo/ulw-loop/evidence/g037-g038-git-policy-evidence-20260704.log`; final loop state is `complete=39`, `pending=0`, `blocked=5` pending Unity Licensing IPC repair.

2026-07-04 asset clarification references: 제국 함선 원천은 `.omo/work/logh7-installed/data/model/Ship/GE/`, `server/content/extracted/model-ship.json`, `server/content/generated/logh7-empire-ship-reference-manifest.json`, `server/content/generated/logh7-imperial-medal-source-lock-manifest.json`; 제국 문장 원천은 (2026-07-04 G070 이후 과거 기록 — client-unity/ 삭제로 재현 불가, git 히스토리 dbf3b43에서 복원 필요) `client-unity/Assets/ArtSource/reference/logh7-imperial-double-eagle-reference.jpg`, `client-unity/Assets/ArtSource/reference/imperial-crest/`; `server/content/generated/logh7-imperial-crest-mask-manifest.json`은 여전히 현재 참조다.

2026-07-04 G034 remaster provenance references: `server/src/server/logh7-remaster-provenance-manifest.mjs`, `server/tests/server/logh7-remaster-provenance-manifest.test.mjs`, `server/content/generated/logh7-remaster-provenance-manifest.json` remain current; (2026-07-04 G070 이후 과거 기록 — client-unity/ 삭제로 재현 불가, git 히스토리 dbf3b43에서 복원 필요, 또한 G071 이후 생성 코드가 이 client-unity 미러 경로에 더 이상 dual-write하지 않음) `client-unity/Assets/StreamingAssets/logh7/logh7-remaster-provenance-manifest.json`; `server/content/generated/logh7-unity-streamingassets-export.json`, and `.omo/ulw-loop/evidence/g034-*-20260704.log` are current evidence for the Empire ship original-data lock and Imperial double-eagle crest output-assets lock. Use `logh7-empire-ship-reference-manifest.json` and `logh7-imperial-crest-mask-manifest.json` as source manifests; do not replace them with generated placeholders.

2026-07-04 G044 Unity manifest-consumption references: (2026-07-04 G070 이후 과거 기록 — client-unity/ 삭제로 재현 불가, git 히스토리 dbf3b43에서 복원 필요) `client-unity/Assets/Scripts/Logh7GalaxyPrototypeRuntime.cs`, `server/tests/server/logh7-unity-client-surface.test.mjs`, `client-unity/Assets/StreamingAssets/logh7/logh7-unity-streamingassets-export.json`, and `.omo/ulw-loop/evidence/g044-*-20260704.log` are current evidence that the Unity runtime surface reads the StreamingAssets export and required manifests instead of drifting into detached mock data.

2026-07-04 G039 archive media references: `artifacts/logh7-cd/Logh7.bin`, `artifacts/logh7-cd/Logh7.cue`, `server/content/generated/logh7-cd-media-manifest.json`, `server/tests/server/logh7-cd-media.test.mjs`, and `.omo/ulw-loop/evidence/g039-*-20260704.log` are current evidence for original Archive BIN/CUE presence, hash verification, MODE2 conversion, ISO root inventory, and InstallShield payload root inventory. Treat them as source authority evidence; family-specific catalogs still need cross-check promotion.

2026-07-04 G040 CD extraction references: `.omo/work/logh7-cd-extract/iso-root`, `.omo/work/logh7-cd-extract/installshield-root`, `server/content/generated/logh7-cd-media-manifest.json`, `server/tests/server/logh7-cd-media.test.mjs`, and `.omo/ulw-loop/evidence/g040-*-20260704.log` are current evidence for extracted CD filesystem and InstallShield payload availability. Use these roots for source mining only; do not promote extracted values to canonical without family-specific cross-check evidence.

2026-07-04 G041 hidden-data references: `server/content/generated/logh7-hidden-data-candidates.json`, `server/content/generated/logh7-hidden-data-classification.json`, `server/content/generated/logh7-hidden-data-watchlist.json`, `server/tests/server/logh7-hidden-data-*.test.mjs`, and `.omo/ulw-loop/evidence/g041-*-20260704.log` are current evidence for hidden-data candidate preservation. The watchlist categories `systemPositions` and `originalCharacterRoster` are mandatory report categories but not newly confirmed canonical values.

2026-07-04 G042 server-data-family references: `server/content/generated/logh7-server-servable-data-family.json`, `server/src/server/logh7-server-servable-data-family.mjs`, `server/tests/server/logh7-server-servable-data-family.test.mjs`, and `.omo/ulw-loop/evidence/g042-*-20260704.log` are current evidence for the server data-surface scope ledger. Use it to find source candidates and confidence status for every server-servable family; do not treat any family as canonical while its status is `suspect-cross-check-required`.

2026-07-03 Unity scene references: `server/content/generated/logh7-scene-inventory.json` remains current; (2026-07-04 G070 이후 과거 기록 — client-unity/ 삭제로 재현 불가, git 히스토리 dbf3b43에서 복원 필요) `client-unity/Assets/Scenes/*.unity`, `client-unity/Assets/Scenes/*.unity.txt`, and `.omo/ulw-loop/evidence/*scene*20260703.log` are current evidence for the first visible Unity production surface.

2026-07-03 record-candidate references: `server/content/generated/logh7-record-candidate-scan.json`, `server/content/generated/logh7-record-candidate-crosscheck.json`, and `.omo/ulw-loop/evidence/record-candidate-*-20260703.log` are current status/evidence for byte/text record-surface candidate scanning. Use them to avoid re-reporting path-only hidden-data candidates as new data.

2026-07-03 hidden-data watchlist references: `server/content/generated/logh7-hidden-data-watchlist.json` and `.omo/ulw-loop/evidence/hidden-data-watchlist-*-20260703.log` are current status/evidence for the mandatory `성계 위치` and `오리지널 캐릭터 로스터` reports. Use them as watch reports only; canonical promotion still requires CD/manual/Ghidra/live/wire cross-check.

2026-07-03 CD-first addition: `artifacts/logh7-cd/Logh7.bin` and `Logh7.cue`, `.omo/work/logh7-cd-extract/`, `.omo/ulw-loop/evidence/source-verify-from-archive-download-20260703.log`, `.omo/ulw-loop/evidence/cd-*-20260703.log`, `.omo/ulw-loop/evidence/unity-scene-resource-re-20260703.md`, `docs/superpowers/plans/2026-07-03-logh7-unity-canonical-port-plan.md`, and `.omo/plans/logh7-unity-canonical-port.md` are current execution references for the Unity revival/remastering port. Current extracted catalogs remain subordinate until crosschecked against the CD-derived extraction and other evidence.

This index is subordinate to the three startup entrypoints:

1. `docs/logh7-requirements-current.md`
2. `docs/logh7-architecture-operations-current.md`
3. `.omo/plans/logh7-execution-plan-current.md`

Since 2026-07-04 G069, direct restoration of the original `G7MTClient.exe` is
the active client path. Treat deleted pre-bootstrap notes as historical evidence;
use the current requirements, architecture, and plans for implementation and live QA.

## Current Authority

| Path | Role |
| --- | --- |
| `docs/logh7-requirements-current.md` | Product and evidence requirements. |
| `docs/logh7-architecture-operations-current.md` | Architecture, workflow, and operating boundaries. |
| `.omo/plans/logh7-execution-plan-current.md` | Current validation and implementation plan. |
| `docs/logh7-document-index-current.md` | This routing index. |

## Proposed Approval Gate (Not Current Authority)

| Path | Role |
| --- | --- |
| `docs/logh7-causal-ledger-master-design.md` | Proposed 15-axis causal-ledger contract; becomes implementation authority only after explicit approval and merge. |

## Derived Status And Reference Routing

| Path | Role |
| --- | --- |
| `docs/logh7-developer-dashboard.html` | Derived dashboard only; not a startup authority. |
| `docs/logh7-roadmap-current.md` | 마일스톤 파생 현황과 보수적 전체 진척률. |
| `docs/logh7-remaster-prep-current.md` | 1080p 네이티브 레이아웃과 미완료 리마스터 범위. |
| `docs/logh7-localization-font-current.md` | CP932/CP949, 폰트 charset, 한글화 현재 판정. |
| `docs/reference/logh7-remaster-asset-inventory.md` | 원본 자산과 해상도·리마스터 스코핑 근거. |
| `docs/logh7-reference-haul.md` | 모든 LOGH VII 작업의 트랙별 방법론·외부 레포 라우팅. canonical game data가 아니며, 라이선스 확인 없는 코드 복사는 금지하고 `reference/` clone은 gitignored로 유지한다. |
| `.omo/rules/logh7-capability-harness.md` | Capability harness and skill/tool routing rules. |
| `AGENTS.md`, `CLAUDE.md`, `.claude/CLAUDE.md` | Agent startup rules mirrored from the current path. |
| `server/AGENTS.md`, `server/README.md` | Server/data-pipeline local rules and command surface. |

## Supporting Work Notes (Not Startup Authority)

| Path | Role |
| --- | --- |
| `docs/logh7-strategy-system-detail-current.md` | Supporting strategy-map system-detail wire/cache/lookup evidence through B81/B82. Subordinate to the startup authorities above. |
| `docs/logh7-m4-strategy-system-detail-handoff-2026-07-13.md` | Historical handoff/evidence trail for the late-M3/early-M4 authority-card → factory `0x2d` → detail-renderer bridge. |

## Current Code And Data Surfaces

- `server/src/server/logh7-cd-media.mjs`, `server/tools/logh7_extract_cd_media.mjs`, `server/content/generated/logh7-cd-media-manifest.json` - current CD verification and MODE2 extraction evidence surface; not canonical promotion by itself.
- `server/src/server/logh7-hidden-data-scan.mjs`, `server/tools/logh7_scan_hidden_data.mjs`, `server/content/generated/logh7-hidden-data-candidates.json` - current raw BIN/ISO/InstallShield hidden signature candidate surface; candidates remain unverified until carved/deduplicated/cross-checked.

| Path | Role |
| --- | --- |
| `server/content/` | Canonical normalized content, manual fixtures, extracted records, generated catalogs, and original-source manifests. |
| `server/src/server/` | Current playable server/protocol/world-session runtime and data-mining/catalog modules. |
| `server/src/server/logh7-logistics-allocation-catalog.mjs` | Manual logistics allocation authority catalog over role/unit table. |
| `server/src/server/logh7-logistics-allocation-rules.mjs` | Explicit logistics allocation authority rules preserving uncertain OCR cells. |
| `server/src/server/logh7-rank-promotion-catalog.mjs` | Manual rank ladder/headcount-cap catalog preserving promotion/fame uncertainty. |
| `server/src/server/logh7-rank-promotion-rules.mjs` | Explicit rank headcount-cap rules; no promotion formula or fame-cost inference. |
| `server/src/server/logh7-ship-stat-catalog.mjs` | Ship stat evidence catalog over normalized manual/OCR data and documented transforms. |
| `server/src/server/logh7-ship-stat-rules.mjs` | Explicit ship pool-readiness rules; no combat formula or missing-pool inference. |
| `server/src/server/logh7-operation-catalog.mjs` | Manual operation planning catalog preserving purposes, gates, duration, results, unresolved CP range. |
| `server/src/server/logh7-operation-rules.mjs` | Explicit operation draft gate rules; no CP formula or outcome simulation inference. |
| `server/src/server/logh7-operation-state.mjs` | First state-changing operation gameplay consumer; writes planned records only after explicit draft gates pass. |
| `server/src/server/logh7-strategy-command-rules.mjs` | First command-catalog gameplay-rule consumer; fixed CP/timing only, variable CP unresolved. |
| `server/src/server/logh7-galaxy-placement.mjs`, `server/src/application/handlers.mjs`, `server/src/presentation/createPlayableRuntime.mjs` | 현재 `0x0315` cell 집합과 동일한 runtime navigability predicate, fail-closed `MoveGrid` policy, production handler injection. Canonical galaxy promotion은 아님. |
| `server/tools/` | Current server-side inventory, verification, and catalog CLIs. |
| `server/tests/server/` | Focused tests for current source/data catalog modules. |
| `server/content/generated/logh7-logistics-allocation-catalog.json` | Generated logistics allocation authority catalog. |
`server/content/generated/logh7-rank-promotion-catalog.json`,Generated rank ladder/headcount-cap catalog with uncertain cap provenance.
| `server/content/generated/logh7-ship-stat-catalog.json` | Generated ship stat evidence catalog and pool coverage summary. |
| `server/content/generated/logh7-operation-catalog.json` | Generated manual operations catalog preserving planning gates and unresolved cost evidence. |
| `server/content/generated/logh7-strategy-command-catalog.json` | Generated manual strategy-command catalog for gameplay-rule consumers. |
| `client-unity/README.md` | (2026-07-04 G070 이후 과거 기록 — client-unity/ 삭제로 재현 불가, git 히스토리 dbf3b43에서 복원 필요) Unity port placeholder and target import direction. |

## Preserved Source Material

| Path | Role |
| --- | --- |
| `docs/reference/` | Manuals and external visual reference catalog plus preserved source visual sheets such as `logh7-spot-bg-contact-sheet.jpg`. |
| `docs/reference/legacy-evidence/` | Pre-bootstrap evidence documents kept as source/reference material only; not startup, plan, or runtime authority. |
| `tmp/manual_extract/`, `tmp/manual_alt_render/` | Manual text/image extraction material. |
| `.omo/work/manual_saved.pdf` | Saved manual source copy. |
| `.omo/work/logh7-installed/data/`, `.omo/work/logh7-installed/fonts/`, `.omo/work/logh7-installed/doc/` | Installed original game resources for mining. |
| `.omo/ghidra/` | Ghidra/redex exports, source binaries, minimap evidence, and official patch source material. |
| `RE/content/` | Preserved pre-bootstrap content mirror; source material only, not active code. |
| `RE/.debug-journal.md`, `.debug-journal.md` | Reverse-engineering evidence journals. |
| `.omo/ulw-loop/evidence/source-*`, `.omo/ulw-loop/evidence/tcf-*` | Current source inventory and TCF catalog evidence from the re-bootstrap slice. |

## Preserved Evidence Documents

Keep old documents only when they contain data, extraction evidence, RE facts,
manual/visual source notes, or content provenance that has not yet been
normalized into `server/content/`.

Examples of preserved evidence categories:

- `docs/reference/legacy-evidence/logh7-*data*`
- `docs/reference/legacy-evidence/logh7-*extract*`
- `docs/reference/legacy-evidence/logh7-*manual*`
- `docs/reference/legacy-evidence/logh7-*canon*`
- `docs/reference/legacy-evidence/logh7-*roster*`
- `docs/reference/legacy-evidence/logh7-*galaxy*`
- `docs/reference/legacy-evidence/logh7-*coord*`
- `docs/reference/legacy-evidence/logh7-*opcode*`
- `docs/reference/legacy-evidence/logh7-*wire*`
- `docs/reference/legacy-evidence/logh7-*protocol*`
- `docs/reference/legacy-evidence/logh7-*forensics*`
- `docs/reference/legacy-evidence/logh7-*function-re*`

These are evidence references, not planning authority.

## Removed Pre-Bootstrap Classes

The 2026-07-03 cleanup removes old files unless they are source material:

- historical handoff documents
- old roadmaps, status ledgers, completion matrices, gap backlogs, and loop notes
- old live-client runtime/test plans
- old playable-client and launcher patch/build notes
- old remaster deployment plans
- old campaign/progress/session/layout/modding-plan/tooling documents
- old local RE Playwright specs and skill copies
- old ULW runtime diagnostic logs unrelated to the current source/TCF catalog slice

If a deleted file is needed later, recover the specific file from git history
and promote only the evidence into `server/content/` or a current evidence doc.

## Current Unity Bootstrap Artifacts

- `server/src/server/logh7-unity-session-flow.mjs` - current source for Unity entry scene order, session gates, and runtime state model names.
- `server/content/generated/logh7-scene-inventory.json` - generated scene inventory; current implementation inventory, not final proof of all original scenes.
- (2026-07-04 G070 이후 과거 기록 — client-unity/ 삭제로 재현 불가, git 히스토리 dbf3b43에서 복원 필요) `client-unity/Assets/StreamingAssets/logh7/logh7-unity-runtime-manifest.json` - Unity runtime manifest consumed by the prototype client.
- (2026-07-04 G070 이후 과거 기록 — client-unity/ 삭제로 재현 불가, git 히스토리 dbf3b43에서 복원 필요) `client-unity/Assets/Scripts/Logh7SessionRuntimeModels.cs` - C# model surface for the first boot/login/lobby/character/world session contract.

## Current Medal And Remaster Artifacts

- `server/content/generated/logh7-medal-mining-catalog.json` - current generated evidence for 52 mined decorations, original 15-icon medal pool, and exact Imperial crest reference policy.
- `docs/reference/remaster-art/logh7-medal-emblem-mining-2026-07-03.md` - current remaster-art evidence note for medals, Imperial double-eagle crest exactness, and reference-only generated imperial medal concept sheet.
- (2026-07-04 G070 이후 과거 기록 — client-unity/ 삭제로 재현 불가, git 히스토리 dbf3b43에서 복원 필요) `client-unity/Assets/ArtSource/concept/medals/imperial-medal-concept-sheet-2026-07-03.png` - generated concept sheet only; not production replacement for mined original medal art.
- `server/content/generated/logh7-medal-art-brief.json` - current production split: 15 Alliance upscales, 11 Alliance variants if needed, 26 Empire name-driven creations.
- `docs/reference/remaster-art/logh7-medal-korean-list-and-production-2026-07-04.md` - Korean medal list and production order.
- (2026-07-04 G070 이후 과거 기록 — client-unity/ 삭제로 재현 불가, git 히스토리 dbf3b43에서 복원 필요) `client-unity/Assets/ArtSource/reference/logh7-alliance-flag-pentagon-reference.png` - Alliance flag and central pentagon emblem reference.
- (2026-07-04 G070 이후 과거 기록 — client-unity/ 삭제로 재현 불가, git 히스토리 dbf3b43에서 복원 필요) `client-unity/Assets/ArtSource/remaster/alliance-medals-4x/` - deterministic 4x Alliance medal base outputs.
- `server/content/generated/logh7-alliance-medal-upscale-manifest.json` - manifest for the 15 Alliance 80x80 to 320x320 base upscales.
## 2026-07-04 Medal Art Reference And Prototype Outputs

| Path | Role |
|---|---|
| (2026-07-04 G070 이후 과거 기록 — client-unity/ 삭제로 재현 불가, git 히스토리 dbf3b43에서 복원 필요) `client-unity/Assets/ArtSource/reference/heinessen/` | User-supplied Ale Heinessen face/statue references for Alliance medal `793`. |
| (2026-07-04 G070 이후 과거 기록 — client-unity/ 삭제로 재현 불가, git 히스토리 dbf3b43에서 복원 필요) `client-unity/Assets/ArtSource/reference/nguyen-kim-hoa/` | User-supplied Nguyen Kim Hoa face reference for Alliance medal `794`. |
| (2026-07-04 G070 이후 과거 기록 — client-unity/ 삭제로 재현 불가, git 히스토리 dbf3b43에서 복원 필요) `client-unity/Assets/ArtSource/reference/imperial-crest/` | Exact Imperial double-eagle mask/recolor outputs derived from supplied crest reference. |
| (2026-07-04 G070 이후 과거 기록 — client-unity/ 삭제로 재현 불가, git 히스토리 dbf3b43에서 복원 필요) `client-unity/Assets/ArtSource/reference/logh7-ship-thumbnail-contact-sheet.png` | Decoded original ship thumbnail contact sheet for faction/ship visual QA. |
| (2026-07-04 G070 이후 과거 기록 — client-unity/ 삭제로 재현 불가, git 히스토리 dbf3b43에서 복원 필요) `client-unity/Assets/ArtSource/reference/empire-ships/` | Decoded original Empire ship thumbnail candidates and relief variants for medal composition. |
| (2026-07-04 G070 이후 과거 기록 — client-unity/ 삭제로 재현 불가, git 히스토리 dbf3b43에서 복원 필요) `client-unity/Assets/ArtSource/remaster/alliance-foundation-medals-1024/` | Current concept candidates for Alliance medals `793..795`. |
| (2026-07-04 G070 이후 과거 기록 — client-unity/ 삭제로 재현 불가, git 히스토리 dbf3b43에서 복원 필요) `client-unity/Assets/ArtSource/remaster/imperial-medal-prototypes-1024/` | Corrected Imperial prototype candidates using exact crest and original ship data. |
| `server/content/generated/logh7-alliance-foundation-medal-redraw-manifest.json` | Manifest for Alliance founder/high-honor medal concepts. |
| `server/content/generated/logh7-imperial-crest-mask-manifest.json` | Manifest proving crest masks derive from exact supplied reference. |
| `server/content/generated/logh7-empire-ship-reference-manifest.json` | Manifest for decoded original Empire ship thumbnail candidates. |
| `server/content/generated/logh7-imperial-medal-corrected-prototype-manifest.json` | Manifest for corrected Imperial medal prototypes `767` and `779`. |
| `server/content/generated/logh7-imperial-medal-source-lock-manifest.json` | Source lock requiring exact Imperial crest and original Empire ship data; reports 121 Empire records, 120 `Ship/GE` files, 117 MDX, 3 MDS, and 39 render hulls. |
| (2026-07-04 G070 이후 과거 기록 — client-unity/ 삭제로 재현 불가, git 히스토리 dbf3b43에서 복원 필요) `client-unity/Assets/ArtSource/remaster/imperial-medal-prototypes-1024/779-expeditionary-campaign-source-locked-crest-ship-v2.png` / `client-unity/Assets/ArtSource/remaster/imperial-medal-prototypes-1024/767-grand-double-eagle-order-source-locked-crest-v2.png` | QA correction samples: original Empire ship-data motif and exact double-eagle crest kept visibly legible. |
| `server/content/generated/logh7-mdx-render-source-manifest.json` | Current generated evidence for Imperial medal ship-art source prep: first target `data/model/Ship/GE/EH001.mdx`, exact Imperial crest reference/mask, recovered node names, texture presence, and missing authoring/bump assets. Regenerate with `npm --prefix server run catalog:mdx-render-sources`. |
| `server/content/generated/logh7-server-servable-data-family.json` | Current G004 generated evidence map for server-servable data families. Lists 15 families, source manifest paths, mandatory watch categories, and keeps all families `suspect-cross-check-required`; regenerate with `npm --prefix server run catalog:server-data-family`. |
| `server/content/generated/logh7-current-content-crosscheck.json` | Current G005 generated evidence map for pre-canonical-promotion cross-check. Inventories `server/content`, `RE/content`, `.omo/work/logh7-installed`, evidence-channel roots, and generated catalogs; all entries remain `suspect-cross-check-required`. Regenerate with `npm --prefix server run catalog:current-content-crosscheck`. |
| `server/content/generated/logh7-galaxy-trust-crosscheck.json` | Current G008 trust gate for existing galaxy positions, star colors, planet lists, passable cells, and generated catalogs. Keeps all listed sources suspect and blocks canonical promotion; `systemPositions` remains report-immediately with no newly confirmed positions. Regenerate with `npm --prefix server run catalog:galaxy-trust-crosscheck`. |
| `server/content/generated/logh7-runtime-boundary-manifest.json` | Historical G009 Unity runtime-boundary artifact. Its Unity/launcher normal-path policy is superseded by the 2026-07-14 current authority above. |
| `server/content/generated/logh7-asset-overwrite-guard.json` | Current G010 asset overwrite guard. Protects original/installed/CD/original-data roots as read-only fallback, permits remaster/reference/concept outputs, and reports overwrite violations before remaster provenance can treat a pack as clean. Regenerate with `npm --prefix server run catalog:asset-overwrite-guard`. |
| `server/content/generated/logh7-unity-source-pack-manifest.json` (server-side manifest still current; 2026-07-04 G070 이후 `client-unity/Assets/StreamingAssets/logh7/logh7-unity-source-pack-manifest.json` 미러는 client-unity/ 삭제로 재현 불가하며, G071 이후 생성기가 이 client-unity 경로에 더 이상 dual-write하지 않음, git 히스토리 dbf3b43에서 복원 필요) | Current G006 Unity pack contract. Separates required original fallback from reversible remaster pack; keeps `verifiedRecords` empty while canonical promotion remains blocked. Regenerate with `npm --prefix server run catalog:unity-source-pack`. |
| `server/content/generated/logh7-remaster-provenance-manifest.json` (server-side manifest still current; 2026-07-04 G070 이후 `client-unity/Assets/StreamingAssets/logh7/logh7-remaster-provenance-manifest.json` 미러는 client-unity/ 삭제로 재현 불가하며, G071 이후 생성기가 이 client-unity 경로에 더 이상 dual-write하지 않음, git 히스토리 dbf3b43에서 복원 필요) | Current G007 remaster provenance contract. Keeps `remaster-hd` disabled by default, reversible, conflict-checked, provenance-labeled, manifest-driven, original-fallback-backed, and tracks `imperial-crest-mask` plus original Empire ship-derived `empire-ship-reference`. Regenerate with `npm --prefix server run catalog:remaster-provenance`. |
| `server/content/generated/logh7-formula-provenance-guard.json` | Current G011 generated evidence guard for CP/combat/economy/AI formulas. Keeps `canonicalPromotion=blocked-until-cross-source-confirmed`, `canonicalFormulaRecords=[]`, `unresolvedFormulaCount=9`; regenerate `npm --prefix server run catalog:formula-provenance-guard`. |
| `server/content/generated/logh7-unity-asset-source-truth.json` (server-side manifest still current; 2026-07-04 G070 이후 `client-unity/Assets/StreamingAssets/logh7/logh7-unity-asset-source-truth.json` 미러는 client-unity/ 삭제로 재현 불가하며, G071 이후 생성기가 이 client-unity 경로에 더 이상 dual-write하지 않음, git 히스토리 dbf3b43에서 복원 필요) | Current G012 generated guard: Unity assets are implementation/output/proof surfaces; manual drag-and-drop cannot become source truth. Regenerate `npm --prefix server run catalog:unity-asset-source-truth`. |
| `server/content/generated/logh7-unity-source-pack-manifest.json` (server-side manifest still current; 2026-07-04 G070 이후 `client-unity/Assets/StreamingAssets/logh7/logh7-unity-source-pack-manifest.json` 미러는 client-unity/ 삭제로 재현 불가하며, G071 이후 생성기가 이 client-unity 경로에 더 이상 dual-write하지 않음, git 히스토리 dbf3b43에서 복원 필요) | Current G015 augmentation to the Unity pack contract. Required original fallback asset families include Imperial `Ship/GE` MDX, original `ShipMark.tga`, exact Imperial double-eagle reference JPG, and derived crest masks; `verifiedRecords` remains empty while canonical promotion is blocked. Regenerate with `npm --prefix server run catalog:unity-source-pack`. |
| (2026-07-04 G070 이후 과거 기록 — client-unity/ 삭제로 재현 불가, git 히스토리 dbf3b43에서 복원 필요) `client-unity/Assets/Editor/Logh7ValidationSceneCapture.cs` / `client-unity/Assets/Editor/Logh7PrototypeSceneGenerator.cs` / `client-unity/Assets/Scripts/Logh7GalaxyPrototypeRuntime.cs` | Current G015 Unity validation scene surface. Runtime/editor display source-pack and asset-source-truth ledgers, `Ship/GE=117`, crest mask status, blocked canonical promotion, and provide batch screenshot entrypoint `Logh7ValidationSceneCapture.CaptureEvidence`. Screenshot evidence is currently blocked by Unity Licensing IPC timeout before `executeMethod`; do not mark G015 complete until PNG exists. |
- `server/content/generated/logh7-ui-scene-remaster-gameplay-boundary.json` (server-side manifest still current; 2026-07-04 G070 이후 `client-unity/Assets/StreamingAssets/logh7/logh7-ui-scene-remaster-gameplay-boundary.json` 미러는 client-unity/ 삭제로 재현 불가하며, G071 이후 생성기가 이 client-unity 경로에 더 이상 dual-write하지 않음, git 히스토리 dbf3b43에서 복원 필요) - Current G018 generated evidence contract linking UI scene inventory, remaster pack schema, gameplay/runtime boundary, and original asset contracts. Regenerate `npm --prefix server run catalog:ui-scene-remaster-gameplay-boundary`; expected original asset counts are Empire `Ship/GE` `117` MDX + `3` MDS, `Thumbnail/Ship` `79` TGA, Empire ship reference manifest `6` entries, Imperial crest mask manifest `3` variants.
- (2026-07-04 G070 이후 과거 기록 — client-unity/ 삭제로 재현 불가, git 히스토리 dbf3b43에서 복원 필요) `client-unity/Assets/Scripts/Logh7GalaxyPrototypeRuntime.cs` / `client-unity/Assets/Editor/Logh7PrototypeSceneGenerator.cs` - Current G019 Unity loader/validation source surface. Runtime and generated validation scene source-ledger panel consume/display the G018 UI/remaster/gameplay boundary manifest (`ui-boundary`, `Ship/GE=117`, `crest variants=3`) alongside source-pack/source-truth ledgers.

## 2026-07-04 G021 Server Data Scope

- Current reference: `server/content/generated/logh7-server-servable-data-family.json` and `server/src/server/logh7-server-servable-data-family.mjs` define the rebuilt-server data-family boundary for this slice.
- Evidence: `.omo/ulw-loop/evidence/g021-server-data-family-catalog-20260704.log`, `.omo/ulw-loop/evidence/g021-server-data-family-focused-tests-20260704.log`, `.omo/ulw-loop/evidence/g021-current-content-crosscheck-20260704.log`, `.omo/ulw-loop/evidence/g021-server-tests-20260704.log`.
- Status: all data families remain `suspect-cross-check-required`; `systemPositions` and `originalCharacterRoster` remain immediate-report watches with no newly promoted values.

## 2026-07-04 G022 Hidden Data Scanner

- Current reference: `server/content/generated/logh7-hidden-data-candidates.json`, `server/content/generated/logh7-hidden-data-classification.json`, and `server/content/generated/logh7-hidden-data-watchlist.json` are evidence-forensics catalogs, not canonical data.
- Evidence: `.omo/ulw-loop/evidence/g022-hidden-data-scan-20260704.log`, `.omo/ulw-loop/evidence/g022-hidden-data-classify-20260704.log`, `.omo/ulw-loop/evidence/g022-hidden-data-watchlist-20260704.log`, `.omo/ulw-loop/evidence/g022-hidden-data-focused-tests-20260704.log`, `.omo/ulw-loop/evidence/g022-server-tests-20260704.log`.
- Status: hidden candidates are preserved and classified; `systemPositions` and `originalCharacterRoster` produced reportable candidates but no newly confirmed values.

## 2026-07-04 G023 Source Inventory

- Current reference: `server/content/original-data/logh7-source-roots.json` and `server/src/server/logh7-source-corpus.mjs` define source-root inventory inputs.
- Evidence: `.omo/ulw-loop/evidence/g023-source-inventory-20260704.log`, `.omo/ulw-loop/evidence/g023-source-corpus-focused-tests-20260704.log`, `.omo/ulw-loop/evidence/g023-current-content-crosscheck-20260704.log`, `.omo/ulw-loop/evidence/g023-unity-asset-source-truth-20260704.log`, `.omo/ulw-loop/evidence/g023-unity-source-pack-20260704.log`, `.omo/ulw-loop/evidence/g023-server-tests-20260704.log`.
- Status: CD extraction roots are now indexed alongside Archive media, installed data, server/RE content, Ghidra evidence, and manual extracts; canonical promotion remains blocked pending cross-source proof.
## 2026-07-04 G024 Unity Source Pack
- Current reference: `server/content/generated/logh7-unity-source-pack-manifest.json` and `server/src/server/logh7-unity-source-pack-manifest.mjs`; (2026-07-04 G070 이후 과거 기록 — client-unity/ 삭제로 재현 불가, git 히스토리 dbf3b43에서 복원 필요, G071 이후 생성기가 더 이상 이 경로에 dual-write하지 않음) `client-unity/Assets/StreamingAssets/logh7/logh7-unity-source-pack-manifest.json`.
- Evidence: `.omo/ulw-loop/evidence/g024-unity-source-pack-catalog-rerun-20260704.log`, `.omo/ulw-loop/evidence/g024-unity-source-pack-original-asset-contract-20260704.log`, `.omo/ulw-loop/evidence/g024-unity-source-pack-focused-redgreen-20260704.log`, `.omo/ulw-loop/evidence/g024-server-tests-20260704.log`.
- Status: Unity source-pack uses CD media/source-root registry inputs, carries source-root inventory, and preserves original fallback asset requirements for Empire `Ship/GE` MDX and the Imperial double-eagle crest reference/masks; no canonical promotion yet.
## 2026-07-04 G025 UI Scene Catalog
- Current reference: `server/content/generated/logh7-ui-scene-catalog.json`, `server/src/server/logh7-ui-scene-catalog.mjs`, and `server/tools/logh7_catalog_ui_scenes.mjs`; (2026-07-04 G070 이후 과거 기록 — client-unity/ 삭제로 재현 불가, git 히스토리 dbf3b43에서 복원 필요, G071 이후 생성기가 더 이상 이 경로에 dual-write하지 않음) `client-unity/Assets/StreamingAssets/logh7/logh7-ui-scene-catalog.json`.
- Evidence: `.omo/ulw-loop/evidence/g025-ui-scene-catalog-red-20260704.log`, `.omo/ulw-loop/evidence/g025-ui-scene-catalog-green-20260704.log`, `.omo/ulw-loop/evidence/g025-ui-scene-catalog-run-20260704.log`, `.omo/ulw-loop/evidence/g025-ui-scene-catalog-surface-proof-20260704.log`, `.omo/ulw-loop/evidence/g025-current-content-crosscheck-20260704.log`, `.omo/ulw-loop/evidence/g025-server-tests-20260704.log`.
- Status: UI scene catalog covers launcher/login/lobby/character/world/strategic/select-grid/info/tactics/battle as Unity-consumable surface contract; canonical promotion remains blocked pending cross-source proof.
## 2026-07-04 G026 Unity StreamingAssets Export
- Current reference: `server/content/generated/logh7-unity-streamingassets-export.json`, `server/src/server/logh7-unity-streamingassets-export.mjs`, and `server/tools/logh7_catalog_unity_streamingassets_export.mjs`; (2026-07-04 G070 이후 과거 기록 — client-unity/ 삭제로 재현 불가, git 히스토리 dbf3b43에서 복원 필요, G071 이후 생성기가 더 이상 이 경로에 dual-write하지 않음) `client-unity/Assets/StreamingAssets/logh7/logh7-unity-streamingassets-export.json`.
- Evidence: `.omo/ulw-loop/evidence/g026-streamingassets-export-red-20260704.log`, `.omo/ulw-loop/evidence/g026-streamingassets-export-green-20260704.log`, `.omo/ulw-loop/evidence/g026-streamingassets-export-final-focused-20260704.log`, `.omo/ulw-loop/evidence/g026-streamingassets-export-run-20260704.log`, `.omo/ulw-loop/evidence/g026-streamingassets-export-proof-20260704.log`, `.omo/ulw-loop/evidence/g026-current-content-crosscheck-20260704.log`, `.omo/ulw-loop/evidence/g026-server-tests-20260704.log`.
- Status: StreamingAssets export is deterministic, self-excluding, hash-addressed, and subordinate to source-pack fallback/canonical-promotion blockers.
## 2026-07-04 G027 Unity Project Open Blocker
- Current reference: (2026-07-04 G070 이후 과거 기록 — client-unity/ 삭제로 재현 불가, git 히스토리 dbf3b43에서 복원 필요) `client-unity/ProjectSettings/ProjectVersion.txt`, `client-unity/Packages/manifest.json`; `.omo/ulw-loop/evidence/g027-unity-open-batch-20260704.log`, and `.omo/ulw-loop/evidence/g027-unity-open-blocker-summary-20260704.log` remain current.
- Evidence: project declares Unity `6000.5.2f1`; editor path `E:/unity/hub/6000.5.2f1/Editor/Unity.exe`; batch open reached engine initialization but blocked on Unity Licensing IPC and non-elevated cleanup could not terminate one `Unity.Licensing.Client` PID.
- Status: blocked until Unity Licensing Client health is repaired/cleared; not a data-manifest blocker for subsequent non-Unity slices.
## 2026-07-04 G028 Unity EditMode Test Blocker
- Current reference: `.omo/ulw-loop/evidence/g027-unity-open-batch-20260704.log` and `.omo/ulw-loop/evidence/g027-unity-open-blocker-summary-20260704.log`.
- Status: C# EditMode loader tests are blocked by Unity Licensing IPC; continue non-Unity slices until licensing is repaired.
## 2026-07-04 G030 Remaster Provenance Ship/Crest Lock

- Current reference: `server/src/server/logh7-remaster-provenance-manifest.mjs`, `server/tests/server/logh7-remaster-provenance-manifest.test.mjs`, and `server/content/generated/logh7-remaster-provenance-manifest.json`; (2026-07-04 G070 이후 과거 기록 — client-unity/ 삭제로 재현 불가, git 히스토리 dbf3b43에서 복원 필요, G071 이후 생성기가 더 이상 이 경로에 dual-write하지 않음) `client-unity/Assets/StreamingAssets/logh7/logh7-remaster-provenance-manifest.json`.
- Evidence: `.omo/ulw-loop/evidence/g030-remaster-provenance-ship-red-20260704.log`, `.omo/ulw-loop/evidence/g030-remaster-provenance-ship-green-20260704.log`, `.omo/ulw-loop/evidence/g030-remaster-provenance-ship-run-20260704.log`, `.omo/ulw-loop/evidence/g030-remaster-provenance-ship-proof-20260704.log`, `.omo/ulw-loop/evidence/g030-current-content-crosscheck-20260704.log`, `.omo/ulw-loop/evidence/g030-server-tests-20260704.log`.
- Status: remaster provenance now records original Empire ship thumbnail source hashes for `empire-ship-reference` (`shipSourceHashCount=6`) and keeps Imperial crest locked to `logh7-imperial-double-eagle-reference.jpg` SHA256 `822276b190c3e83729de39c14e4e9fc06c2eb8b39a56225bdcbe16f147134e9e`; pack remains disabled by default and blocked pending cross-source proof.
## 2026-07-04 G031 Gameplay Contract Boundary

- Current reference: `server/src/server/logh7-gameplay-contract-boundary.mjs`, `server/tools/logh7_catalog_gameplay_contract_boundary.mjs`, `server/tests/server/logh7-gameplay-contract-boundary.test.mjs`, and `server/content/generated/logh7-gameplay-contract-boundary.json`; (2026-07-04 G070 이후 과거 기록 — client-unity/ 삭제로 재현 불가, git 히스토리 dbf3b43에서 복원 필요, G071 이후 생성기가 더 이상 이 경로에 dual-write하지 않음) `client-unity/Assets/StreamingAssets/logh7/logh7-gameplay-contract-boundary.json`.
- Supporting updated reference: `server/tests/server/logh7-unity-streamingassets-export.test.mjs` and `server/content/generated/logh7-unity-streamingassets-export.json`; (2026-07-04 G070 이후 과거 기록 — client-unity/ 삭제로 재현 불가, git 히스토리 dbf3b43에서 복원 필요, G071 이후 생성기가 더 이상 이 경로에 dual-write하지 않음) `client-unity/Assets/StreamingAssets/logh7/logh7-unity-streamingassets-export.json`.
- Evidence: `.omo/ulw-loop/evidence/g031-gameplay-contract-red-20260704.log`, `.omo/ulw-loop/evidence/g031-gameplay-contract-green-20260704.log`, `.omo/ulw-loop/evidence/g031-gameplay-contract-run-20260704.log`, `.omo/ulw-loop/evidence/g031-gameplay-contract-proof-20260704.log`, `.omo/ulw-loop/evidence/g031-focused-after-export-fix-20260704.log`, `.omo/ulw-loop/evidence/g031-streamingassets-export-rerun-20260704.log`, `.omo/ulw-loop/evidence/g031-streamingassets-export-proof-20260704.log`, `.omo/ulw-loop/evidence/g031-current-content-crosscheck-final-20260704.log`, `.omo/ulw-loop/evidence/g031-server-tests-final-20260704.log`.
- Status: gameplay contract boundary exposes `strategy-command-cost-table` as the only implemented evidence-backed gameplay rule and locks `9` unresolved formulas from runtime promotion. StreamingAssets deterministic export now has `fileCount=14` and includes `logh7-gameplay-contract-boundary.json`.
## 2026-07-04 G033 Plan Compliance Audit

- Current reference: `.omo/ulw-loop/evidence/g033-plan-compliance-audit-20260704.log`, `.omo/ulw-loop/evidence/g033-plan-compliance-boundary-20260704.log`, and G030-G032 current-doc/dashboard entries.
- Status: compliance audit passed with no failed checks. It verifies recent ULW completions, remaster/gameplay/StreamingAssets manifest guardrails, blocked canonical promotion, diagnostic-only runtime boundary, immediate-report watch non-promotion, Unity Licensing IPC blocker visibility, and required evidence-file presence.
## 2026-07-04 Unity Visual Build Evidence

- Current reference: (2026-07-04 G070 이후 과거 기록 — client-unity/ 삭제로 재현 불가, git 히스토리 dbf3b43에서 복원 필요) `client-unity/Builds/Windows/LOGH7RevivalUnity.exe`; `.omo/ulw-loop/evidence/codex-unity-windows-build-final2-20260704.log`, `.omo/ulw-loop/evidence/codex-unity-player-window-screenshot-final-20260704.png`, `.omo/ulw-loop/evidence/codex-unity-validation-scene-screenshot-20260704.png` remain valid evidence artifacts.
- G045 current reference: `.omo/ulw-loop/evidence/g045-player-clickthrough-strategic-map-20260704.png`, `.omo/ulw-loop/evidence/g045-player-edge-strategic-blocked-20260704.png`, `.omo/ulw-loop/evidence/g045-focused-unity-surface-tests-20260704.log`, `.omo/ulw-loop/evidence/g045-server-tests-20260704.log`, `.omo/ulw-loop/evidence/g045-status-closed-20260704.json`.
- G046 current reference: `.omo/ulw-loop/evidence/g046-player-scene-tactics-switch-20260704.png`, `.omo/ulw-loop/evidence/g046-player-scene-tactics-blocked-20260704.png`, `.omo/ulw-loop/evidence/g046-focused-unity-scene-surface-tests-20260704.log`, `.omo/ulw-loop/evidence/g046-server-tests-20260704.log`, `.omo/ulw-loop/evidence/g046-status-closed-20260704.json`.
- Status: current Unity prototype is visually runnable as a Windows player. It shows the shell/session/data-preview surface only; full gameplay parity remains unproven and pending.
