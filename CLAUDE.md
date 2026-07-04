# logh7-revival Claude Entry

2026-07-04 G071 G070 삭제 후속 정리 + cp932 패치 스크립트: `client-unity/` 삭제(G070) 직후 `npm --prefix server test`에서 12개 회귀 발견 — 여러 생성기 모듈(`server/src/server/logh7-unity-*.mjs` 등)이 `server/content/generated/*.json` 정본 출력과 함께 `client-unity/Assets/StreamingAssets/logh7/...`로 dual-write하던 것이 원인. 조치: (1) 전적으로 Unity 산출물(삭제된 C# 스크립트)만 검증하던 테스트 3종(`logh7-unity-client-surface`/`logh7-unity-scene-surface`/`logh7-unity-validation-scene`)과 그 전용 모듈 2종(`logh7-unity-streamingassets-export.mjs`/`logh7-unity-runtime-data.mjs`, 관련 `tools/*` 포함)을 완전 삭제 — 대응하는 `package.json` 스크립트(`catalog:unity-streamingassets-export`/`export:unity-runtime-data`)도 함께 제거; (2) 나머지 dual-write 모듈들(`logh7-ui-scene-remaster-gameplay-boundary`/`logh7-remaster-provenance-manifest`/`logh7-gameplay-contract-boundary`/`logh7-ui-scene-catalog`/`logh7-unity-source-pack-manifest`/`logh7-unity-asset-source-truth`/`logh7-unity-bootstrap-manifest`/`logh7-original-ui-image-export.mjs`)에서 `client-unity/` 쓰기 경로(`DEFAULT_UNITY_OUT` 상수+관련 파라미터)를 제거하고 `server/content/generated/*.json` 단일 정본 출력만 남김; (3) 남은 참조는 모두 주석/라벨/가드설정/읽기전용 입력으로 실쓰기 없음 확인. 결과: 회귀 0건, 전체 180/180 통과. 또한 P0-03 cp932 한글 채팅 해저드 진단 확정 및 패치 스크립트 작성: `RE/tools/logh7_chat_cp932_korean_patch.py` — `G7MTClient.exe`의 `FUN_004eac60`/`FUN_004eb100`/`FUN_00516bf0`가 `setlocale(LC_ALL,"Japanese")`(cp932) 후 mbstowcs 변환을 수행해 cp949 한글 채팅 바이트를 깨뜨림; VA `0x0076e3fc`(파일 오프셋 `0x36e3fc`)의 9바이트 `"Japanese\0"` 리터럴을 동일 길이 `"Korean\0"`(cp949)로 교체하는 동일-길이 in-place 패치로, 캐이브 삽입 불필요(직전 가설이던 `CreateFontA` charset 바이트·`0x5d5290` 코드케이브는 모두 반증됨: charset은 두 호출 모두 DEFAULT_CHARSET=1, 0x5d5290은 export 전체에서 참조 0건). 스크래치 사본 대상 드라이런으로 바이트 정합 검증 완료; 실제 설치 EXE에는 아직 미적용(라이브 테스트 필요).

2026-07-04 G070 Unity 클라이언트 삭제(사용자 명시적 "완전 삭제" 결정): `client-unity/` 작업트리 완전 제거. 스테이징된 2026-07-03/04 메달 리마스터 아트를 포함해 삭제 직전 상태를 커밋 `dbf3b43`(보존)에 전량 보존한 뒤 커밋 `ca24dd3`(제거, 9226 files deleted)로 작업트리에서 삭제했다. G069의 "RE 완료 후 Unity 재이식" 장기 목표는 유지되나, 재이식 시점에는 `client-unity/` 전체를 git 히스토리에서 되살려야 한다(현재 작업트리에 없음). 이 문서와 `.claude/CLAUDE.md`/`AGENTS.md`/`docs/logh7-architecture-operations-current.md`/`docs/logh7-requirements-current.md`/`docs/logh7-document-index-current.md`의 기존 Unity 증거/진행 항목들(G0xx)은 모두 과거 기록으로만 취급하며 재현 불가하다(빌드 산출물·에디터 테스트 등 재현하려면 먼저 `client-unity/`를 git에서 복원해야 함).

2026-07-04 G069 방향 전환(사용자 명시적 재오픈): Unity 경로 잠정 중단, **레거시 클라이언트(`G7MTClient.exe`) 직접 수정을 현재 주 경로로 재개**. RE 완료 후 Unity 재이식이 장기 목표(사용자: "나중에 이거 RE가 전부 끝나고 돌아갈때 옮겨야 겠어"). Runtime Boundary의 "EXE changes are legacy-oracle/mod-only and require a current plan explicitly reopening that path"는 본 항목으로 충족됨 — 지금부터 EXE 직접 패치가 정규 구현 경로다. 재개 전 재점검 필요: C002(마우스클릭→커맨드 미도달), cp932 한글 채팅 인코딩, 단일 패치 크래시 취약성. 상세: `docs/logh7-requirements-current.md`/`docs/logh7-architecture-operations-current.md`/`.omo/plans/logh7-internal-validation-plan.md` 동일 날짜 항목.

2026-07-04 G068: 로비 게이트가 원본 spot 배경(EXE 기본 bg005, P0)+施設内ロビー 패널(P1)+실서버 `/api/lobby` 슬롯으로 렌더. 수출 도구에 JPG byte-copy 모드 추가(fileCount 17). 회귀 195/195. 증거 `g068-player-lobby-original-bg-20260704.png`.

2026-07-04 G067: 원본 로그인 화면에서 실서버(`serve:session`) 로그인 E2E 검증(ok+token만 게이트 전진, 원본 상태 문자열 P0). 오라클 반증: 설치본 클라는 부트 로고 스플래시 미표시 → 로고 시퀀스 슬라이스 보류. 회귀 194/194.

2026-07-04 G066 원본 로그인 화면 픽셀 패러티: Unity 로그인 이전 게이트는 원본 `title.tga` 디코드 배경(`export:original-ui-images`, StreamingAssets fileCount 16) 위 원본 좌표 위젯으로 렌더된다. 증거 `.omo/ulw-loop/evidence/g066-player-legacy-login-20260704.png`. 이후 씬도 동일한 원본-화면-재현 방식으로 전환한다.

2026-07-04 G048 Unity scene-panel manifest slice: panel text is now loaded from `logh7-unity-scene-surface-panels.json`, not hardcoded in C#; StreamingAssets export fileCount is 15 and canonical promotion remains blocked.

2026-07-04 Unity scene-panel slice: current Unity player builds and shows 10 distinct scene catalog surface panels; evidence contact sheet is `.omo/ulw-loop/evidence/g047-scene-panel-surfaces-compact-20260704/contact-sheet.png`. Treat as development surface only; canonical promotion remains blocked.

## LOGH VII Current Startup Rule

Apply `.omo/rules/logh7-capability-harness.md` after reading the three current entrypoint docs. The harness routes matched LazyCodex/OMO, Superpowers, gstack, LOGH7, CodeGraph/LSP/Git Bash/ast-grep, and Compound Engineering capabilities, but it does not change normal runtime boundaries.

For LOGH VII planning or development, start from these three current documents only:

1. `docs/logh7-requirements-current.md`
2. `docs/logh7-architecture-operations-current.md`
3. `.omo/plans/logh7-internal-validation-plan.md`

Then use `docs/logh7-document-index-current.md` to decide which older docs are current references, evidence, superseded, or archive references. Do not treat old handoffs or status docs as current guidance unless the current docs point to them.

## Work Unit Documentation Sync

At the end of every work unit, update documentation automatically:

- Add new requirements, decisions, evidence links, commands, risks, and doc-index entries.
- Modify current requirements, architecture/operations guidance, validation-plan steps, and entrypoint rules when behavior or scope changes.
- Prune stale duplicate guidance and old status claims that no longer describe the current path.
- Delete or retire invalid current-path guidance, especially forced/preseeded character flows or developer-only harnesses presented as normal operation.

Update `docs/logh7-developer-dashboard.html` whenever status, release phase, scope, evidence, blockers, progress percentage, or remaining tasks change. The dashboard is derived from current docs and is not a fourth startup authority document.

Apply this to:

- `docs/logh7-requirements-current.md`
- `docs/logh7-architecture-operations-current.md`
- `.omo/plans/logh7-internal-validation-plan.md`
- `docs/logh7-document-index-current.md`
- `docs/logh7-developer-dashboard.html` when development status changes
- `AGENTS.md`
- `CLAUDE.md`
- `.claude/CLAUDE.md`

Current development objective (2026-07-03): prioritize asset/data mining and game-logic reimplementation over legacy-client modification. Treat the original client, Archive.org `https://archive.org/download/logh-7`, manuals, extracted resources, and traces as evidence/oracle inputs; build canonical data/spec pipelines and gameplay logic from them.

Current bootstrap commands: `npm --prefix server test`, `npm --prefix server run inventory:sources`, `npm --prefix server run catalog:mdx`, `npm --prefix server run catalog:null-galaxy`, `npm --prefix server run catalog:tcf`, `npm --prefix server run catalog:tcf-portraits`, `npm --prefix server run export:tcf-portraits -- --limit-per-archive 2`, and `npm --prefix server run verify:source`. `catalog:mdx` writes `server/content/generated/logh7-mdx-catalog.json`; `catalog:null-galaxy` writes `server/content/generated/logh7-null-galaxy-template.json`; `catalog:tcf` writes `server/content/generated/logh7-face-tcf-catalog.json`; `catalog:tcf-portraits` writes `server/content/generated/logh7-face-portrait-catalog.json`; `export:tcf-portraits` writes controlled BMP samples under `.omo/ulw-loop/evidence/tcf-portrait-bmp-sample/`; `inventory:sources` should find preserved installed data; `verify:source` reports `artifact-root-missing` until Archive.org BIN/CUE files are downloaded under `artifacts/logh7-cd`.

EXE changes are legacy-oracle/mod-only and require a current plan explicitly reopening that path. Do not restore Python builders, JSON patch descriptors, generated client-copy stacks, or old direct-client helpers as normal implementation.

## Runtime Boundary

- Data/spec developer inventories sources, extracts assets/manual rules, regenerates catalogs.
- Gameplay logic developer implements rules against canonical fixtures and tests.
- Unity client developer consumes generated manifests/catalogs; legacy-client diagnostics remain oracle-only.

## Skill and CodeGraph Rule

Use matching skills before ad hoc work. CodeGraph is mandatory first for code location, call-path, subsystem, and blast-radius questions when `.codegraph/` exists; confirm exhaustive answers with `rg` or direct reads. Use `find-skills` when a needed capability is missing.

If a matching skill is not installed in the active environment, attempt installation at development start with `find-skills` or `npx skills add <owner/repo@skill> -y`; if install fails, record command/output and fallback path.

## LazyCodex, Superpowers, gstack, and Compound Harness

Treat the full capability stack as routing rules for every LOGH VII work unit:

- LazyCodex/OMO: use `init-deep`, `ulw-plan`, `start-work`, `ulw-loop`, Hephaestus/ultrawork, hooks, model routing, CodeGraph, git_bash, LSP, and other MCP tools when the work shape matches. Evidence-bound RED->GREEN plus real-surface QA remains mandatory.
- Superpowers: use matching process skills, especially `using-superpowers`, `brainstorming`, `writing-plans`, `test-driven-development`, `systematic-debugging`, `verification-before-completion`, and review/worktree/subagent skills when host policy permits.
- gstack: route planning, QA, review, CSO/security, docs, design, deploy, learning, and retrospective needs through the gstack router or specific gstack role skill.
- Compound Engineering: every completed work unit records plan, work, review, compound, repeat; capture the mistake or near-miss, root cause, reusable guard, storage location, enforcing future check, and whether it will be caught automatically next time.
- If any matching capability is unavailable, host-forbidden, or unsuitable, record the attempted lookup/use and fallback in the work notes.

## Blocked-Loop Rule

Do not spend tokens repeating the same blocked route. After three same-symptom failures or two no-new-evidence investigation paths, pivot or write a concise blocker report with evidence and the next different strategy.

## macOS Development

Keep server, web/community, tests, documentation, and Docker Compose service work developable on macOS. Original D3D8 client live QA remains Windows-only; macOS developers should use Docker Desktop or OrbStack for service work.

## Remastering and Modding

Remastering and modding are first-class planning tracks. Original assets stay canonical fallback; remaster/mod packs must be optional, reversible, manifest-driven, provenance-labeled, and conflict-checked. Public mod distribution is later scope.

Installed project helpers include `image-upscaling`, `game-assets`, `game-3d-assets`, `game-engine`, `multiplayer-game`, `pdf`, `smart-ocr`, and `meshy-3d-generation`; use them only as sourcebook/remaster/prototype/pattern aids. LOGH7 skills and client evidence stay authoritative. If a narrower skill is missing, run `find-skills` and install only high-fit candidates at development start; record unsuitable search results.

## Completion Gate

Do not close a work unit after implementation review alone. Completion requires implementation, verification, review, `/cso` when security-relevant, [Compound Engineering](https://every.to/guides/compound-engineering) learning capture, and updated docs.
## Latest Unity Visual Build Evidence

As of 2026-07-04, Unity `6000.5.2f1` builds the current prototype player at `client-unity/Builds/Windows/LOGH7RevivalUnity.exe`. Evidence: `.omo/ulw-loop/evidence/codex-unity-windows-build-final2-20260704.log`, `.omo/ulw-loop/evidence/codex-unity-player-window-screenshot-final-20260704.png`, `.omo/ulw-loop/evidence/codex-unity-validation-scene-screenshot-20260704.png`. The visible scope is still a shell/session/data-preview surface.

G045 evidence: `.omo/ulw-loop/evidence/g045-player-clickthrough-strategic-map-20260704.png` proves real mouse-click progression to Strategic Map; `.omo/ulw-loop/evidence/g045-player-edge-strategic-blocked-20260704.png` proves direct Strategic Map is blocked at Boot.

G046 evidence: `.omo/ulw-loop/evidence/g046-player-scene-tactics-switch-20260704.png` proves the Unity player consumes the UI scene catalog and selects `tactics` after prerequisites; `.omo/ulw-loop/evidence/g046-player-scene-tactics-blocked-20260704.png` proves `tactics` stays blocked from Boot.
