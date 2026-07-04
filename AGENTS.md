<!-- Generated: 2026-06-10 | Updated: 2026-07-03 -->

G048 moved Unity scene-panel text out of C# hardcoding into `logh7-unity-scene-surface-panels.json`. Evidence: `.omo/ulw-loop/evidence/g048-scene-panel-manifest-player-battle-20260704.png` and `.omo/ulw-loop/evidence/g048-scene-panel-manifest-proof-20260704.log`. (Historical only — the `logh7-unity-streamingassets-export` module/tool this fileCount referred to was retired in G071 along with the deleted `client-unity/` dual-write target.)

# logh7-revival

2026-07-04 G071 G070 삭제 후속 정리: `client-unity/` 삭제(G070) 직후 서버 회귀 12건 발견(생성기 모듈들이 `server/content/generated/*.json` 정본과 함께 `client-unity/Assets/StreamingAssets/logh7/...`로 dual-write하던 잔재). Unity 산출물만 검증하던 테스트 3종+전용 모듈 2종(`logh7-unity-streamingassets-export.mjs`/`logh7-unity-runtime-data.mjs`, 대응 `tools/*`·`package.json` 스크립트)을 완전 삭제, 나머지 8개 모듈에서 `client-unity/` 쓰기 경로만 제거하고 `server/content/generated/*.json` 단일 정본 출력 유지. `npm --prefix server test` 180/180 통과 회복. 동시에 P0-03 cp932 한글 채팅 패치 스크립트 `RE/tools/logh7_chat_cp932_korean_patch.py` 작성(VA `0x0076e3fc` 9바이트 `"Japanese\0"`→`"Korean\0"` 동일길이 in-place 치환; `FUN_004eac60`/`FUN_004eb100`/`FUN_00516bf0`의 `setlocale(LC_ALL,"Japanese")`→cp932 mbstowcs 경로가 cp949 한글 채팅을 깨뜨리는 문제의 근본 수정; 캐이브 삽입 불필요, 스크래치 사본 드라이런으로만 검증, 실제 설치 EXE 미적용).

2026-07-04 G070 Unity 클라이언트 완전 삭제(사용자 "완전 삭제" 결정): `client-unity/` 작업트리를 제거했다(보존 커밋 `dbf3b43` → 제거 커밋 `ca24dd3`, 9226 files deleted). 삭제 직전 상태(스테이징된 2026-07-03/04 메달 리마스터 아트 포함)는 `dbf3b43`에 전량 보존되어 있어 git 히스토리로 복구 가능하다. G069의 "RE 완료 후 Unity 재이식" 장기 목표는 유지되지만, 현재 작업트리에는 `client-unity/`가 존재하지 않는다 — 아래 "Repository Boundaries"의 `client-unity/` 항목과 이 문서/다른 현재 문서의 과거 Unity 진행(G0xx) 항목은 모두 과거 기록이며 재현하려면 먼저 git에서 복원해야 한다.

2026-07-04 G069 방향 전환(사용자 명시적 재오픈): Unity 경로 잠정 중단, 레거시 클라이언트(`G7MTClient.exe`) 직접 수정을 현재 주 경로로 재개. RE 완료 후 Unity 재이식이 장기 목표. 아래 "Current Product Direction"/"Runtime And Diagnostics"는 이 전환 동안 대체됨: EXE 직접 패치가 진단 전용이 아니라 정규 개발 경로다. 재개 전 재점검: C002 마우스클릭→커맨드 미도달, cp932 한글 채팅 인코딩, 단일 패치 크래시 취약성.

## Current Startup Rule

For LOGH VII planning or development, start from these three documents only:

1. `docs/logh7-requirements-current.md`
2. `docs/logh7-architecture-operations-current.md`
3. `.omo/plans/logh7-internal-validation-plan.md`

Use `docs/logh7-document-index-current.md` to decide which older docs are current references, evidence, superseded, or archive references. Do not treat old handoffs, old status docs, deleted tools, or deleted tests as current guidance unless the current docs point to them.

Apply `.omo/rules/logh7-capability-harness.md` after the three entrypoint docs. Use matching LazyCodex/OMO, Superpowers, gstack, LOGH7, CodeGraph, LSP, Git Bash, ast-grep, and Compound Engineering capabilities when the work shape matches, but do not change runtime boundaries through tooling shortcuts.

At the end of every work unit, update the three current docs, the document index, `AGENTS.md`, `CLAUDE.md`, `.claude/CLAUDE.md`, and `docs/logh7-developer-dashboard.html` when status, release phase, scope, evidence, blockers, progress, remaining tasks, startup rules, or workflow rules change.

## Current Product Direction

(2026-07-04 G069 supersedes this section — see the dated entry above.) The legacy LOGH VII client (`G7MTClient.exe`) is the current primary modification target again, by explicit user direction, after Unity pixel-parity demos were judged insufficiently faithful. Unity remains paused, not deleted, for a post-RE re-port.

Primary work now:

- Mine canonical data from the original BIN/CUE, installed resources, manuals, extracted content, and RE evidence.
- Build small, testable data/spec/game-logic modules under `server/`.
- Keep a future Unity client path in `client-unity/`, consuming generated data/spec artifacts instead of patching the old client.
- Preserve source data and provenance. Delete or retire pre-bootstrap implementation, patch builders, JSON patch descriptors, old client-modification outputs, and tests that only protect deleted code.

## Repository Boundaries

- `docs/`: current requirements, architecture/operations, evidence index, and generated dashboard.
- `server/content/`: canonical and mined data inputs/outputs for the reimplementation.
- `server/src/server/`: new bootstrap modules only. Do not restore the deleted legacy Node protocol server unless a current plan explicitly reopens that path.
- `server/tests/server/`: tests for current bootstrap data/spec/game-logic modules only.
- `server/tools/`: small bootstrap CLIs only, currently source-provenance verification, source-root inventory, MDX catalog extraction, Null_galaxy template extraction, and Face TCF archive catalog extraction.
- `client-unity/`: deleted from the working tree 2026-07-04 (G070, full-deletion decision). History preserved in commits `dbf3b43` (preserve) and `ca24dd3` (remove); restore from git before any future Unity re-port work.
- `RE/content/` and `.omo/ghidra/`: reverse-engineering evidence/data. Treat the old client as oracle input, not the product runtime.
- `.omo/work/logh7-installed/data`, `.omo/work/logh7-installed/fonts`, `.omo/work/logh7-installed/doc`, and `tmp/manual_extract*`: preserved source-like extracted materials until they are migrated or proven duplicate.

Do not restore `.agents`, `.claude/agents`, `.claude/commands`, `.claude/skills`, `.codex/skills`, old `RE/tools`, old `RE/src`, old `RE/tests`, old server protocol/runtime modules, launcher/client patch outputs, or pre-bootstrap tests just to recover old workflows.

## Runtime And Diagnostics

Normal runtime boundaries remain explicit:

- Operators use the Docker Compose/server path when a runnable service exists.
- Players use the launcher/client path only for legacy-client diagnostics.
- `ui_explorer`, direct `G7MTClient.exe`, direct Node commands, preseed flags, trace tools, and old patch outputs are diagnostic-only and are not the normal product runtime.

(2026-07-04 G069: EXE changes are now the current primary modification path, per explicit user reopening — see dated entry above.) Do not use Python builders, JSON patch descriptors, or generated client-copy stacks as the normal modification path unless a current plan reintroduces them. Require original signatures, target hash, changed bytes, rollback notes, and live QA for any EXE patch.

## Current Commands

From repo root:

```bash
npm --prefix server test
npm --prefix server run inventory:sources
npm --prefix server run catalog:mdx
npm --prefix server run catalog:null-galaxy
npm --prefix server run catalog:tcf
npm --prefix server run catalog:tcf-portraits
npm --prefix server run export:tcf-portraits -- --limit-per-archive 2
npm --prefix server run verify:source
```

`verify:source` expects local originals at `artifacts/logh7-cd/Logh7.bin` and `artifacts/logh7-cd/Logh7.cue`. If they are absent, `artifact-root-missing` is the expected failure.

`inventory:sources` reads `server/content/original-data/logh7-source-roots.json`. Missing `archive-org-original-media` is expected until BIN/CUE download; preserved installed data should remain present and counted.

## Tooling Rules

- Use CodeGraph first for code location, call-path, subsystem, and blast-radius questions when `.codegraph/` exists. Confirm details with direct reads only when CodeGraph is stale or incomplete.
- Prefer Git Bash MCP for shell commands on Windows.
- Use LSP diagnostics when available, but report unavailable or crashing servers honestly.
- Do not burn tokens repeating blocked routes. After three same-symptom failures or two no-new-evidence investigation paths, pivot or write a concise blocker report with evidence and the next different strategy.
- Keep server, docs, tests, and Docker Compose service work developable on macOS. Original D3D8 live QA remains Windows-only.

## Installed Helper Skills

LOGH7 remaster/modding helper skills installed: `image-upscaling`, `game-assets`, `game-3d-assets`, `game-engine`, `multiplayer-game`, `pdf`, `smart-ocr`, `meshy-3d-generation`. Use them only as sourcebook/remaster/prototype/pattern aids; LOGH7 evidence and current LOGH7 skills remain authority.

## CodeGraph

In repositories indexed by CodeGraph, reach for it before grep/find or reading files when you need to understand or locate code:

- MCP tool: `codegraph_explore` for most code questions and edit planning.
- Shell fallback: `codegraph explore "<symbol names or question>"`.

If there is no `.codegraph/` directory, skip CodeGraph entirely. Indexing is the user's decision.

`catalog:mdx` regenerates `server/content/generated/logh7-mdx-catalog.json` from preserved installed MDX files. Treat node names and header counts as P0 extracted-asset evidence; do not infer galaxy star positions from MDX.

`catalog:null-galaxy` regenerates `server/content/generated/logh7-null-galaxy-template.json`. Treat spectral classes as P0 extracted-asset evidence and positions as explicitly absent from MDX.

`catalog:tcf` regenerates `server/content/generated/logh7-face-tcf-catalog.json`. `catalog:tcf-portraits` regenerates `server/content/generated/logh7-face-portrait-catalog.json` with decoded 8-bit indexed portrait payload evidence; failures remain categorized rather than inferred. `export:tcf-portraits` writes controlled BMP evidence samples under `.omo/ulw-loop/evidence/tcf-portrait-bmp-sample/`.
## Latest Unity Visual Build Evidence

As of 2026-07-04, the current Unity prototype player builds at `client-unity/Builds/Windows/LOGH7RevivalUnity.exe`. Visual evidence is `.omo/ulw-loop/evidence/codex-unity-player-window-screenshot-final-20260704.png`; editor capture evidence is `.omo/ulw-loop/evidence/codex-unity-validation-scene-screenshot-20260704.png`. This proves a visible prototype shell only, not full gameplay parity.

G045 extended the visible shell with real player clickthrough proof: `.omo/ulw-loop/evidence/g045-player-clickthrough-strategic-map-20260704.png` advances to Strategic Map, while `.omo/ulw-loop/evidence/g045-player-edge-strategic-blocked-20260704.png` stays at Boot when Strategic Map is clicked without prerequisites.

G046 extended the visible shell with `logh7-ui-scene-catalog.json` consumption and gated scene surface switching. Evidence: `.omo/ulw-loop/evidence/g046-player-scene-tactics-switch-20260704.png` selects `tactics` after Strategic Map prerequisites, while `.omo/ulw-loop/evidence/g046-player-scene-tactics-blocked-20260704.png` stays on `launcher` from Boot.

Unity scene-panel slice extended the same visible shell with distinct selected-surface panels for all 10 catalog surfaces. Evidence: `.omo/ulw-loop/evidence/g047-scene-panel-surfaces-compact-20260704/contact-sheet.png`; representative battle panel: `.omo/ulw-loop/evidence/g047-scene-panel-surfaces-compact-20260704/09-battle.png`.
