# LOGH VII Internal Validation Plan

2026-07-04 G069 방향 전환 receipt: 사용자가 Unity 픽셀-패러티 시연(G066-G068) 이후에도 "레거시 클라 수정으로 다시 가야겠다"고 명시적으로 재오픈 지시. 아래 "## Legacy-Client Slice Backlog Status"의 슬라이스 2-8은 더 이상 이력/오라클 백로그가 아니라 **재활성 대상**으로 취급한다 — 사용자 지시가 그 섹션이 요구하던 "미래 슬라이스가 명시적으로 레거시 클라 오라클 검증을 재오픈"하는 조건을 충족한다. **Goal** 문장("legacy client is an oracle/diagnostic source only, not the current product runtime")은 이 전환 동안 보류되며, 레거시 클라 직접 패치가 잠정 주 런타임이다. Unity 슬라이스(G045-G068)는 중단하지 않고 보존하되 신규 작업을 멈추고, RE 완료 후 재이식 시점에 재개한다. 재개 전 반드시 다시 짚을 기지 블로커: C002 마우스클릭→커맨드 라우팅([[logh7-c002-fleetclick-noneexpected-2026-07-02]] 계열), cp932 한글 채팅 인코딩([[logh7-chat-cp932-send-hazard-2026-06-22]]), 단일 패치 크래시 취약성.

2026-07-04 G068 validation receipt: 로비 원본 재현 1파 닫힘 — 실로그인 E2E 후 로비가 원본 bg005 배경+宇宙港+施設内ロビー(旗艦桟橋/航路管理センター)+실서버 슬롯(account parity1, slots 0)으로 렌더(`g068-player-lobby-original-bg-20260704.png`). 계약 테스트 6/6(로비 계약 포함), 전체 회귀 195/195(스트리밍 수출 fileCount 17 갱신), Unity 빌드 Success. 다음 패러티 축: 캐릭터 생성/선택 화면 원본 재현(548 G군 얼굴 실선택), 로비 초상화/직무카드, spot 룸 인덱스↔시설명 매핑 마이닝(bg%03d).

2026-07-04 G067 validation receipt: 원본 로그인 화면→실서버 로그인 풀 E2E가 실플레이어 UI 조작으로 검증됐다(자동 마우스/키 입력으로 ID/PW 타이핑→ログイン 클릭→실토큰 발급→Lobby 게이트 전진, `g067-player-login-success-20260704.png`). 계약 테스트 5/5, 전체 회귀 194/194, Unity 빌드 Success. 오라클 반증 1건: 설치본 클라는 부트 로고 스플래시를 표시하지 않음(12프레임 캡처 `g067-oracle-splash-20260704/`) — 부트 로고 시퀀스 슬라이스는 보류하고 다음 패러티 축은 로비 씬 원본 재현(원본 `spot/` 배경), 로그인 필드/버튼 위치의 실클라 정밀 대조(현재 title.tga 각인 기준, 실클라 런타임 레이아웃과 차이 가능성 기록됨).

2026-07-04 G066 validation receipt: 원본 로그인 화면 픽셀 패러티가 실플레이어로 검증됐다. RED 계약 테스트(`logh7-unity-client-surface.test.mjs` 첫 테스트)가 P0 문자열(EXE 캡션/메뉴 리소스, title.tga 각인)로 GREEN 전환, TGA→PNG 수출 도구 테스트 포함 전체 서버 회귀 193/193, Unity 빌드 Success(`g066-legacy-login-unity-build-20260704.log`), 실플레이어 캡처(`g066-player-legacy-login-20260704.png`)가 원본 title.tga와 시각 일치(로고/입력박스/버튼/저작권/메뉴바). 남은 패러티 축: 부트 로고 시퀀스(bothtec/microvision/multiterm), 로그인 버튼의 실서버(`serve:session`) 연동, 로비 이후 씬의 원본 화면 재현.

2026-07-04 G048 validation receipt: panel manifest consumption is covered by `tests/server/logh7-unity-scene-surface.test.mjs`, `tests/server/logh7-unity-client-surface.test.mjs`, StreamingAssets export tests, full `npm test`, C# LSP, Unity build `g048-scene-panel-manifest-unity-build-20260704.log`, real player capture `g048-scene-panel-manifest-player-battle-20260704.png`, and dual visual QA PASS.

2026-07-04 Unity scene-panel validation: focused scene-surface test passes 2/2, full `npm test` exits 0, C# LSP reports no diagnostics, Unity build logs `Build Finished, Result: Success`, and real player captures show all 10 selected-surface panels in `.omo/ulw-loop/evidence/g047-scene-panel-surfaces-compact-20260704/contact-sheet.png`.

2026-07-03 validation priority: first validation slices for Unity revival are CD re-extraction, hidden-data scan, server-servable data scope, and cross-check ledgers. Existing galaxy/system/star/planet/manual/catalog interpretations must be treated as unconfirmed until CD/manual/Ghidra/live/wire evidence agrees or a mismatch is recorded with a next verification path.

Capability harness: `.omo/rules/logh7-capability-harness.md` is the canonical workflow router for LazyCodex/OMO, Superpowers, gstack, LOGH7, CodeGraph/LSP/Git Bash/ast-grep, review, and Compound Engineering capture during validation execution.

2026-07-04 G034 validation receipt: remaster provenance quality review locked two user-visible asset risks. Empire ship evidence is still original-data backed (`Ship/GE` MDX root present, 117 MDX files; `empire-ship-reference` has six original thumbnail source hashes). Imperial crest evidence is still present (`logh7-imperial-double-eagle-reference.jpg` source SHA256 `822276b190c3e83729de39c14e4e9fc06c2eb8b39a56225bdcbe16f147134e9e`; gold/silver/white mask outputs exposed via `provenance.outputAssets`). Verification: focused tests 5/5, full `npm --prefix server test` pass, server/Unity provenance manifest byte-equal.

2026-07-04 G044 validation receipt: Unity runtime manifest-consumption contract is now test-locked without using diagnostic-only runtime shortcuts. Focused test `node --test server/tests/server/logh7-unity-client-surface.test.mjs` passes 3/3 and verifies actual StreamingAssets export `summary.fileCount=14`, `canonicalPromotion=blocked-until-cross-source-confirmed`, and five required manifest links. Full `npm --prefix server test` passes 152/152. Unity Editor manual QA remains not-run because the known Unity Licensing blocker still prevents reliable Editor execution.

2026-07-04 G039 validation receipt: Archive original media verification reran cleanly. `verify:source` passed for `Logh7.bin` and `Logh7.cue`; `extract:cd-media` rebuilt `logh7-cd-media-manifest.json`; focused CD media tests passed 3/3 including missing-media and non-sector-aligned boundaries; full `npm --prefix server test` passed 152/152. Mandatory watch categories `systemPositions` and `originalCharacterRoster` remain candidate-watch only with no newly confirmed values in this slice.

2026-07-04 G040 validation receipt: CD filesystem and InstallShield payload extraction roots reran cleanly. Direct inventory proof: ISO root `25` files / `199030313` bytes, InstallShield root `2207` files / `321825815` bytes. Manifest proof matches these counts and keeps canonical promotion blocked. Focused CD media tests passed 3/3; full `npm --prefix server test` passed 152/152. Mandatory watch categories remain candidate-watch only with no newly confirmed values in this slice.

2026-07-04 G041 validation receipt: hidden-data scan/classify/watchlist reran cleanly. Candidate manifest: `37047` candidates from `4` sources. Classification manifest: `10253` validated, `26794` invalid, `161` raw-only, `10092` already extracted. Watchlist manifest: category count `2`; `systemPositions` has `209` hidden candidates across `44` paths and `originalCharacterRoster` has `403` hidden candidates across `8` paths. Both remain not-confirmed candidate reports. Focused hidden-data tests passed 10/10; full `npm --prefix server test` passed 152/152.

2026-07-04 G042 validation receipt: server-servable data-family manifest reran cleanly. Manifest proof: SHA256 `9793db3a3b6ac1c68aee382e7bbc1af0ab66ae87f85065a88cda6341c02c1034`, `15` families, all suspect, mandatory watch categories `systemPositions` and `originalCharacterRoster`. Focused data-family tests passed 2/2 including malformed source-data boundary; full `npm --prefix server test` passed 152/152. No newly confirmed watch-category values in this slice.

2026-07-04 asset clarification validation: 제국 함선/문장 검증은 `Ship/GE` MDX 117개, `ShipMark.tga`, `logh7-empire-ship-reference-manifest.json`, `logh7-imperial-crest-mask-manifest.json`, `logh7-imperial-medal-source-lock-manifest.json`의 존재/해시/정책을 확인한다. 원본 함선·쌍두독수리 마스크 없이 생성 이미지만 통과시키지 않는다.

2026-07-04 G043 validation receipt: `logh7-current-content-crosscheck.json` and `logh7-galaxy-trust-crosscheck.json` still report `blocked-until-cross-source-confirmed`; focused galaxy/current-content tests passed 6/6 and full server regression passed 152/152 after refreshing `logh7-unity-streamingassets-export.json`.

2026-07-04 G035/G036 validation receipt: G035 real Unity manual QA is blocked by Unity Licensing IPC before the product surface opens; do not claim manual QA complete until the license client launches cleanly. G036 scope fidelity audit passed 12/12 requirement axes, focused guard tests passed 20/20, and full server regression passed 152/152.

2026-07-04 G045 validation receipt: the Unity Licensing IPC blocker is repaired and all five blocked Unity goals (G015/G027/G028/G029/G035) are closed with real Editor evidence. Root cause: stale elevated `Unity.Licensing.Client` holding the license mutex with a dead IPC channel; killed via UAC-approved elevated `taskkill`, fresh client initializes licensing in seconds. Proof chain: batch open exit 0 with zero CS errors after removing incompatible `collab-proxy`/`timeline`/`textmeshpro` packages (`g045-unity-compile-retry-20260704.log`), EditMode manifest-loader tests 4/4 (`g045-editmode-test-results-20260704.xml` + rerun), validation scene screenshot with suspect banner + source ledgers + 85-system suspect galaxy (`g015-unity-validation-scene-screenshot-20260704.png`), export builder now excludes Unity `.meta` files keeping `fileCount=14`, and full server regression 152/152. Galaxy data remains suspect/blocked from canonical promotion; the scene only visualizes it with the suspect warning.

2026-07-04 G047 validation receipt: the systemPositions watch category advanced by one full evidence axis. A fresh, independent re-extraction of the 101p manual star chart (exact-palette label detection + glow-blob star detection + 3-parameter grid fit; June constants unused) quantitatively corroborates `galaxy.json`: 80 chart labels, 76 dots, 68 exact cell matches, 6 near misses (occlusion bias), 2 anomalous dots flagged, 0 faction mismatches, and grid pitch independently reproduced (29.15px@300dpi vs 29.17 expected). Five galaxy systems have no chart label and need CD/RE/live evidence. New reproducible surface: `server/src/server/logh7-galaxy-manual-crosscheck.mjs`, `server/tools/logh7_crosscheck_galaxy_manual.mjs`, `npm --prefix server run crosscheck:galaxy-manual`, tests 2/2 (fail-closed on malformed detection), full server regression 154/154, G043 refresh chain rerun. No canonical promotion; no newly confirmed hidden positions (immediate-report categories unchanged).

2026-07-04 G065 validation receipt: Unity command client closed (EditMode 25/25; flow-gated load, category filtering, unresolved CP honesty preserved through the client layer).

2026-07-04 G064 validation receipt: command-catalog endpoint closed (2/2 focused, 182/182 full). Serving is read-only from the generated catalog — no availability inference before the duty/rank slice.

2026-07-04 G063 validation receipt: strategic-map scene now distinguishes a server-approved world session from standalone validation mode (context set only on approved entry; rejected entry leaves it empty — EditMode 23/23). Frontier after this: fleet/command contracts from evidence catalogs, strategic-map interactivity, remaining official-patch-stack behaviors.

2026-07-04 G062 validation receipt: character persistence closed (restart survival, account-keyed JSON, fail-closed corrupt-file startup; 3/3 focused, 180/180 full). CLI default persist path `.omo/work/logh7-characters.json`.

2026-07-04 G060/G061 validation receipt: world-entry contract closed (server 2/2 + full regression 177/177; Unity EditMode 21/21) and the full normal session chain is live-proven by PlayMode E2E 3/3 against `serve:session` — no diagnostic-only shortcut, no preseed, no autologin default (explicit fixture credentials), suspect galaxy stays labeled. Next candidate slices: strategic-map scene runtime consumption of the world session, character persistence (SQLite write-behind reusing dirty-checking lessons), fleet/command contract from evidence catalogs.

2026-07-04 G059 validation receipt: Unity character client closed (EditMode 18/18; negative paths: unknown-id selection fails, validation failure grants nothing). Next slices in order: world-entry contract (`/api/world` serving world session + suspect galaxy reference, granting character-authority/world-session), strategic-map scene consumption, then a full-chain PlayMode E2E against the live server.

2026-07-04 G058 validation receipt: character creation closed server-side with manual-p8 faction exclusivity and portrait-manifest face validation (548 G-group faces; O-group rejected, matching the original create-picker rule). RED→GREEN store/HTTP tests, 175/175 regression, live smoke with a real face id. Unity character-select/create client is the next slice; the store is in-memory (persistence slice comes after the flow proves out end to end).

2026-07-04 G057 validation receipt: lobby contract closed both sides (server 401-gated slot list, Unity flow-gated consumer); server 166/166, EditMode 15/15. Process note: two "missing results XML" scares were a persistent-shell cwd artifact (`server/` vs repo root) — Unity runs had succeeded; check absolute paths before re-running Unity batches.

2026-07-04 G056 validation receipt: first real Unity↔server round trip proven — PlayMode E2E 2/2 against live localhost session server (boot summary, successful scrypt login with token, 401 on wrong password), no diagnostic-only shortcut involved. Blocker fixed en route: slimmed Unity manifest requires built-in modules explicitly (`com.unity.modules.unitywebrequest`). Internal playable loop now has boot+login proven end to end; next slice is the lobby/character-slot contract on both sides.

2026-07-04 G055 validation receipt: Unity login client closed with EditMode 12/12 including the negative gates (failed login grants nothing; server-ok without boot grant is rejected by the session flow). Transport is injected, so the same client code will take a UnityWebRequest transport in the PlayMode E2E slice.

2026-07-04 G054 validation receipt: first server runtime slice closed with RED→GREEN tests (service 5/5, HTTP 2/2), full regression 164/164, and a real-surface smoke (CLI start, `GET /api/boot` returned fileCount=14 with promotion blocked, `POST /api/login` issued a real token, wrong password 401). /cso quick pass on the auth surface: scrypt/timingSafeEqual/enumeration-equalized/no-registration/localhost-bind confirmed; recorded gaps = session expiry, rate-limit/lockout, TLS. Next scene slice: Unity `Logh7LoginClient` consuming this contract with a fake transport EditMode test, then PlayMode against the live localhost server.

2026-07-04 G053 validation receipt: boot scene logic implemented and test-locked (EditMode 9/9): export-manifest integrity check fails closed on missing manifest/files, boot grant only on pass, next scene `login`. MonoBehaviour layer is thin glue over the tested pure logic; PlayMode capture is deferred to the login-scene slice.

2026-07-04 G052 validation receipt: manual P2 gaps (pages 19/21/23/25) mined into four more catalogs with the same uncertainty discipline (unnamed UI elements recorded as `term:null` `_uncertain` rather than named from the task hint — the page-19 agent explicitly declined to assert チャットウィンドウ from the hint because the page does not name it; page 21 names it, so `system-menu-chat.json` carries the authoritative naming). Completeness ledger status `manual-read-complete-all-gaps-mined`; full server regression 157/157.

2026-07-04 G051 validation receipt: manual P1 gaps (pages 8/20/22/24) mined into four `server/content/manual/*.json` catalogs by a 4-agent workflow with uncertainty preservation (`_uncertain` markers for low-res screenshot reads, `_mining_notes` listing every value the manual does not state — e.g. total flagship energy amount, offline simulation tick, server character-count cap). First gameplay-rule consumer `logh7-flagship-energy-rules.mjs` implements only the explicitly stated WARP-max retreat gate; focused tests 3/3; full server regression 157/157. Completeness ledger updated with `mined-2026-07-04` statuses.

2026-07-04 G048/G049/G050 validation receipts: (G048) manual read-to-completion ledger generated via 7-agent workflow over the 26 uncovered pages; result 8 mining gaps (P1: p8/p20/p22/p24, P2: p19/p21/p23/p25), everything else confirmed covered or non-game content; next slices must mine the P1 gaps into machine-readable catalogs. (G049) Unity session-flow gate machine implemented and test-locked; EditMode 7/7; duplicate-type compile error fixed by reusing `Logh7SessionRuntimeModels` types. (G050) first real original-resource import into Unity: 1061 portraits (decoded, sha1 manifest) + 79 ship thumbnails (byte-for-byte, sha256 manifest); full server regression 154/154 after `catalog:current-content-crosscheck` refresh.

2026-07-04 final validation state: ULW reports `complete=44`, `pending=0`, `blocked=0`. The former licensing-blocker instruction (rerun Unity manual QA after repair) is satisfied by the G045 receipt above.

2026-07-04 G046 validation receipt: the two `G7MTClient.exe` coordinate-shaped hidden-data clusters are now definitively classified via Ghidra reference analysis (the documented next strategy after filename/record scanning). CD-extract EXE and installed EXE are SHA256-identical, so the existing full-decompile export applies. Cluster at file offset `3732628` (`.data` VA `0x0078f494`) is a yacc/bison parser table family consumed by `FUN_005b75f1`; cluster at offset `2547614` (`.rdata` VA `0x0066df9e`) is a monotonic dword sequence (0x5F, 1..50) inside function-pointer tables misread as short pairs. Neither is a system-position table; the `systemPositions` watch category still has no newly confirmed value. Evidence: `.omo/ulw-loop/evidence/g046-exe-coordinate-cluster-ghidra-analysis-20260704.md`. Next different strategy for system positions: quantitative manual star-chart vs `galaxy.json` cross-check ledger.

Updated: 2026-07-04

2026-07-03 Unity scene inventory slice: visible production has started. PASS evidence: `scene-inventory-green-20260703.log`, `scene-inventory-run-20260703.log`, `unity-scene-placeholder-export-20260703.log`, `server-test-scene-inventory-20260703.log`. Current scene count: 12 placeholders from EXE/Ghidra/MsgDat evidence: boot/update/launcher, login, lobby, strategic map, fleet operations, tactical battle, system/planet detail, organization/personnel, economy/logistics, diplomacy/intel, reports/mail/system, settings/save/load. Next slice should pick one scene and replace placeholder UI with evidence-backed controls/data.

2026-07-03 record-surface validation slice: byte/text candidate scan and cross-check now prove the earlier path-watch report did not find a new canonical roster and did not prove a new coordinate table. PASS evidence: `record-candidate-scan-green-20260703.log`, `record-candidate-crosscheck-green-20260703.log`, `record-candidate-scan-rerun-20260703.log`, `record-candidate-crosscheck-run-20260703.log`, `server-test-record-crosscheck-20260703.log`. Current result: 2 `G7MTClient.exe` coordinate-shaped clusters, both weak overlap (`0` matches against current galaxy coordinate sets); 1 `constmsg.dat` system-name text cluster; 0 record-surface original-roster candidates. Next different strategy for G003/G004 is Ghidra reference analysis of those EXE offsets and MsgDat parser work, not more filename scanning.

2026-07-03 hidden-data watchlist validation slice: `report:hidden-data-watchlist` now gates mandatory reporting for two user-watch categories. PASS evidence: `hidden-data-watchlist-20260703.log`, `hidden-data-watchlist-rerun-20260703.log`, `server-test-hidden-watchlist-20260703.log`; focused tests cover system-position candidates without canonical promotion, Face/portrait candidates without treating portraits as roster, malformed manifest rejection, and report writing. Current report must be read before claiming hidden-data status: system-position candidates exist (`209` hits, `44` paths) but no new hidden coordinate table confirmed; original-character-roster candidates exist (`403` hits, `8` paths) but no new hidden original roster confirmed.

2026-07-03 current execution slice: `draftOperationPlan` in `server/src/server/logh7-operation-state.mjs` consumes the operation draft gates as actual gameplay state change. This closes the first state reducer step without inferring CP formula or operation outcome simulation.

2026-07-03 completed slice: operations planning gates. `catalog:operations` emits a 3-purpose operation catalog from `server/content/manual/operations.json`; `evaluateOperationPlanDraft` returns draftable/blocked using explicit manual gates for occupation enemy-only targets, defense own-holding targets, sweep lone-ship targets, duplicate target per card, global unit cap, and new-plan lockout. Operation CP stays `variable-cost-unresolved` with range `10-1280 CP`; outcome simulation is not inferred.

2026-07-03 rank-promotion slice: `server/content/manual/ranks-promotion.json` now generates `server/content/generated/logh7-rank-promotion-catalog.json` through `npm --prefix server run catalog:ranks-promotion`. `server/src/server/logh7-rank-promotion-rules.mjs` evaluates explicit manual rank headcount caps only; cap counts remain uncertain and promotion formulas/fame costs are not inferred.

2026-07-03 completed slice: logistics allocation authority. `catalog:logistics-allocation` emits role/unit authority catalog from manual logistics table; `evaluateAllocationAuthority` returns allowed/blocked/uncertain/unknown while preserving two OCR-null cells as uncertain.

2026-07-03 completed slice: ship stat catalog and pool-readiness rules. `catalog:ship-stats` emits 63-ship generated catalog with empire/alliance side counts and pool coverage; `evaluateShipPoolRequirements` returns ready/missing/unknown without inferring absent pools or combat formulas.

2026-07-03 completed slice: strategic grid entry gates. The rule set uses the 3628-cell passable mask plus manual terrain/navigability restrictions. It evaluates out-of-bounds, non-passable grid, unit-count cap, faction-count cap, terrain obstacle, lone-flagship restriction, and enterable outcomes.

2026-07-03 completed slice: command-cost/timing rules. `evaluateCommandCost` supports fixed manual CP payable/insufficient outcomes and intentionally returns `variable-cost-unresolved` for variable CP rows. `getCommandTimingSpec` preserves fixed/ranged manual durations.

2026-07-03 completed slice: strategy command manual normalization. `catalog:strategy-commands` emits an 81-command catalog with 7 categories, fixed/variable CP classification, and fixed/ranged duration classification. Next gameplay-rule slices can consume command ids such as `operations-001` and `command-001` without parsing Japanese manual rows directly.

Cleanup note: current validation starts from preserved source material and current server data/catalog modules only. Deleted pre-bootstrap process/runtime files are not blockers; recover specific evidence from git history only if it must be normalized into `server/content/`.

**For agentic workers:** this is a planning artifact, not permission to implement blindly. Use the full LazyCodex/OMO harness (`init-deep`, `ulw-plan`, `start-work`, `ulw-loop`, Hephaestus/ultrawork, hooks, model routing, and MCP tools), Superpowers brainstorming/writing-plans/TDD/debugging/verification discipline, CodeGraph-first code orientation, and the full gstack suite through its router when a specialized skill matches the work. When execution starts, work one slice at a time and close each slice with verification, review, `/cso` when security-relevant, Compound Engineering learning capture, and documentation sync.

All slice rules apply retroactively. Existing slices, evidence, docs, patch artifacts, and dashboard status that violate current policy must be audited and migrated before they are treated as closed.

**Goal:** bootstrap evidence-backed LOGH VII data/spec mining, implement gameplay logic from those artifacts, and prepare a Unity client port. The legacy client is an oracle/diagnostic source only, not the current product runtime.

**Architecture:** current implementation path is source inventory, asset/data extraction, canonical catalogs, gameplay model/specs, then Unity import/runtime. Original client, launcher, live traces, and patch history may prove facts but must not reintroduce Python EXE builders, JSON patch descriptors, Frida runtime patches, or direct-client shortcuts as normal execution.

## 2026-07-03 Reimplementation Validation Axis

Validation now prioritizes canonical data/spec extraction and gameplay logic implementation over legacy-client modification. Each new slice should prove one of these surfaces:

1. Original provenance: source URL, local artifact path, byte size, md5/sha1, and any conversion command are recorded.
2. Asset mining: extracted file, decoded schema, provenance, confidence, and regeneration command are recorded.
3. Manual/spec alignment: manual or in-game evidence is linked to a machine-readable rule or data table.
4. Logic implementation: server/shared logic has tests that assert the rule against canonical fixtures.
5. Oracle check: legacy live client is used only when needed to resolve ambiguity, and the evidence is stored as diagnostics.

Current original source candidate is Internet Archive `https://archive.org/download/logh-7`; `logh-7_files.xml` verified 2026-07-03 lists `Logh7.bin` size `229070688`, md5 `bf87c6a8cb068f05625737377a07b09d`, sha1 `80e261e9d84c81bca622c99d9cbdc47a2154c1a8`, and `Logh7.cue` size `71`, md5 `878418e704a913f7baac67b38b10e680`, sha1 `9bff4ea17ca6ff7b088440bd7f8a5206cd2dfe81`.

Current source inventory slice: `server/content/original-data/logh7-source-roots.json` plus `npm --prefix server run inventory:sources` proves registered evidence roots. Current run after deleting the non-original `Face.bak-gfpgan-20260626-055248` backup: 8 roots, `archive-org-original-media` missing until BIN/CUE download, `installed-game-data` present with 2186 files, 406 `mdx`, and 994 `bmp`.

Current MDX catalog slice: `npm --prefix server run catalog:mdx` generates `server/content/generated/logh7-mdx-catalog.json` from preserved installed MDX models. Current evidence: 406 MDX files, 8 categories, `strategy/Null_galaxy.mdx` has 85 header slot-0 nodes and 79 `star_NN_<spectralClass>` node names. This is asset catalog evidence only; star positions remain manual/PDF-derived, not MDX-derived.

Current Null_galaxy template slice: `npm --prefix server run catalog:null-galaxy` generates `server/content/generated/logh7-null-galaxy-template.json` from the MDX catalog. Current evidence: `strategy/Null_galaxy.mdx` has 79 star template nodes with spectral distribution A=7, B=5, F=8, G=19, K=17, M=21, O=2 plus six non-star template nodes (`bh_01..03`, `ns_01..03`). `positionStatus` is `not-in-mdx`; do not infer star positions from this fixture.

Current TCF face catalog slice: `npm --prefix server run catalog:tcf` generates `server/content/generated/logh7-face-tcf-catalog.json` from preserved installed Face archives. Current evidence: 7 current TCF archives, archive groups G=4/O=3, all current archive magics `badacabe`, `tcf.hed` has 1355 slots with 669 used and 686 zero.

Current TCF portrait decode slice: `npm --prefix server run catalog:tcf-portraits` generates `server/content/generated/logh7-face-portrait-catalog.json`. Current evidence: 7 archives, 669 used HED slots, 1061 decoded portrait payloads from 18-byte header + 1024-byte BGRA palette + bottom-up 8-bit indices, archive decoded counts `gaf=44`, `gam=134`, `gef=69`, `gem=301`, `o=92`, `oam=220`, `oem=201`.

Current TCF portrait visual export slice: `npm --prefix server run export:tcf-portraits -- --limit-per-archive 2` writes `.omo/ulw-loop/evidence/tcf-portrait-bmp-sample/` and `.omo/ulw-loop/evidence/tcf-portrait-bmp-sample.json`. Current evidence: 14 BMP samples exported and representative `oam-slot0001-64x80.bmp` visually inspected as a valid portrait.

Do not create new normal-runtime requirements around EXE patch descriptors, playable-client Python builders, Frida runtime patches, or direct EXE launches. Existing legacy-client diagnostics may remain as evidence tools, but closure for this plan comes from reproducible data/spec artifacts and game-logic tests.

2026-07-03 cleanup pass removed pre-bootstrap runtime, builder, direct-client helper, cache, tool-download, obsolete test files unless source/evidence material. Preserve `server/content`, `RE/content`, `.omo/ghidra`, `.omo/work/logh7-installed/{data,fonts,doc}`, manual extraction material, current docs, current catalog source/tests/tools, and `docs/reference/legacy-evidence/` for retained pre-bootstrap evidence docs.

Cleanup follow-up: remaining old campaign/progress/session/layout/modding-plan/tooling documents were removed unless source/evidence material; `docs/reference/logh7-spot-bg-contact-sheet.jpg` is preserved source visual material.

## Startup Rule

New agents start only:

1. `docs/logh7-requirements-current.md`
2. `docs/logh7-architecture-operations-current.md`
3. `.omo/plans/logh7-internal-validation-plan.md`

Then use `docs/logh7-document-index-current.md` to decide which older docs to open.

## Slice Creation Brainstorming Gate

Every new slice, split slice, merged slice, or materially changed slice must start with brainstorming before implementation planning or coding.

- Use `superpowers:brainstorming` first and record alternatives/trade-offs considered.
- For LOGH VII planning, include required gstack role voices at brainstorming/plan time: `/office-hours`, `/plan-ceo-review`, `/plan-eng-review`, `/review` where a diff exists, `/cso` for security-sensitive surfaces, and compound learning capture at closure.
- Do not create a slice by directly writing tasks from an implementation impulse. First clarify player/operator outcome, normal-vs-diagnostic path, acceptance evidence, risks, and must-not rules.
- The resulting slice must state whether it belongs to internal playable loop, remaster-included closed beta, public server operation, expansion/native systems, or modding.

## Work Unit Closure

Every work unit, even documentation-only units, must end with:

- EXE-changing work must use direct patch operations only. Do not use Python to indirectly modify, regenerate, copy over, or overwrite `G7MTClient.exe` or launcher EXEs; require original signature checks, target hash, changed bytes, rollback, and live QA.
- Existing indirect EXE patch artifacts are retroactive migration targets. Audit them, convert retained behavior to direct patch descriptors, and do not count them as closed evidence until re-verified.
- Matching skill use: LOGH7, Superpowers, OMO, gstack, and project-installed skills where applicable.
- LazyCodex/OMO capability routing: apply `init-deep` for hierarchy refresh, `ulw-plan` for ambiguous plans, `start-work` for written-plan execution, `ulw-loop` for durable goal loops, and Hephaestus/ultrawork RED->GREEN plus Manual QA for substantial work.
- Superpowers/gstack routing: use every triggered Superpowers process skill and every matching gstack role skill; record any unavailable, host-forbidden, or unsuitable capability with fallback evidence.
- For remastering/modding work, first verify installed skills include `image-upscaling`, `game-assets`, `game-3d-assets`, `game-engine`, and `multiplayer-game`; if a narrower skill is needed, search/install only high-fit candidates and record unsuitable search results.
- CodeGraph-first orientation for codebase flow/call/path questions when `.codegraph/` exists, with `rg`/direct reads as completeness backstop.
- If a required matching skill is missing from the active environment, attempt installation with `find-skills` or `npx skills add <owner/repo@skill> -y` before development. If install fails, record exact output and fallback.
- Verification appropriate to the changed surface.
- Review or explicit reason review is not applicable.
- `/cso` if account, session, admin, moderation, launcher update, logging, supply chain, remaster pack, mod pack, or client patch pack behavior changed.
- Compound capture for mistakes/near-misses: make the lesson findable, update the agent-readable system, and verify the system would catch it next time.
- Documentation sync: add, modify, prune, and delete/retire entries in the current docs, document index, and entrypoint docs.

Documentation sync targets:

- `docs/logh7-requirements-current.md`
- `docs/logh7-architecture-operations-current.md`
- `.omo/plans/logh7-internal-validation-plan.md`
- `docs/logh7-document-index-current.md`
- `docs/logh7-developer-dashboard.html` when status, release phase, scope, evidence, blockers, progress, or remaining tasks change
- `AGENTS.md`
- `CLAUDE.md`
- `.claude/CLAUDE.md`

## Slice 0: Documentation Baseline

**Purpose:** make current planning discoverable and prevent future agents from starting with stale summaries.

**Acceptance:**

- The three startup docs exist.
- The document index exists and classifies older docs.
- `AGENTS.md`, root `CLAUDE.md`, and `.claude/CLAUDE.md` instruct new agents to read the three startup docs first.
- Entry docs state documentation sync, skill-install, CodeGraph, blocked-loop, macOS, remastering, and modding rules.

**Verification:**

- `test -f docs/logh7-requirements-current.md`
- `test -f docs/logh7-architecture-operations-current.md`
- `test -f .omo/plans/logh7-internal-validation-plan.md`
- `test -f docs/logh7-document-index-current.md`
- Search entry docs for `LOGH VII Current Startup Rule`, `CodeGraph`, `matching skill`, `macOS`, `Remastering`, and `Modding`.

## Slice 1: Bootstrap Source Inventory

**Purpose:** prove the current data/spec bootstrap route rather than the removed operator/player legacy runtime route.

**Scope:**

- Source-root registry and inventory.
- Archive.org provenance record plus local BIN/CUE hash verification and repeatable MODE2 conversion.
- CD media extraction manifest and hidden-data candidate manifest.
- MDX catalog, Null_galaxy template catalog, Face TCF archive/HED catalog.
- Current data/spec tests and regeneration commands.

**Acceptance:** source inventory and CD extraction/catalog regeneration commands produce reproducible artifacts; hidden-data candidates remain unverified until carved/deduplicated/cross-checked.

**Verification:**

- `npm --prefix server test`.
- `npm --prefix server run extract:cd-media`.
- `npm --prefix server run scan:hidden-data`.
- `npm --prefix server run inventory:sources`.
- `npm --prefix server run catalog:mdx`.
- `npm --prefix server run catalog:null-galaxy`.
- `npm --prefix server run catalog:tcf`.
- `npm --prefix server run catalog:tcf-portraits`.
- `npm --prefix server run export:tcf-portraits -- --limit-per-archive 2`.
- `npm --prefix server run verify:source` and `npm --prefix server run extract:cd-media` must confirm local BIN/CUE hash match before CD-derived data promotion.

## Slice 1b: Skill and CodeGraph Operating Discipline

**Purpose:** make skill use explicit and avoid repeated blocked loops.

**Scope:**

- CodeGraph-first code orientation.
- Matching skill selection for LOGH7, Superpowers, OMO, gstack, and installed skills from the active Codex global skill list; local `.agents/skills` copies were removed during cleanup.
- Install-missing-skill attempt at development start.
- Blocked-loop budget.
- `find-skills` use when capability gaps appear.

**Acceptance:**

- Plans name skills that apply to each work unit.
- Code flow questions start with CodeGraph when `.codegraph/` exists.
- Missing required skills trigger an install attempt or documented blocker.
- No worker repeats the same blocked command/probe more than three times without pivoting.
- Blocker reports include attempted evidence and next different strategy.

**Verification:**

- Entry docs include skill, install, and blocker rules.
- `npx skills ls --json` lists expected project skills.
- CodeGraph CLI or MCP works when `.codegraph/` exists.
- `npx skills ls --json` lists `game-engine` and `multiplayer-game` alongside remaster asset skills.
- Blocked work includes concise blocker report instead of repeated trace churn.

## Legacy-Client Slice Backlog Status

Slices below this marker are retained as historical/oracle evidence backlog after the 2026-07-03 cleanup. Do not execute them as normal runtime work unless a future slice explicitly reopens legacy-client oracle validation with fresh evidence paths. Current active work should select data/spec mining or gameplay logic reimplementation slices first.

## Slice 2: Forced Character Cleanup

**Purpose:** remove invalid character shortcuts from runtime and evidence.

**Scope:** runtime bypass/preseed paths, tests/fixtures, and docs/status references that imply forced characters are accepted flow.

**Acceptance:** normal validation cannot rely on forced/preseeded/placeholder characters; diagnostic bypasses are labeled and excluded from milestone evidence.

**Verification:** search for forced/preseed references, run server character registry tests, update document index classifications.

## Slice 3: Character

**Purpose:** make client-created characters authoritative.

**Scope:** legacy client character creation, persistence, selection, list/card/HUD/command eligibility fields, and web/community character identity link if feasible.

**Acceptance:** a client-created character reaches the server, persists, reappears in selection, can be selected, drives world HUD/state, and avoids emperor/placeholder fallback.

**Verification:** server record tests plus real-client live QA screenshots/traces for create, list, select, and world HUD. Current HUD blocker rule: if server trace already proves player `0x0323`/`0x0356` `rank=13` and empty title, next investigation must instrument the real HUD consumer/global state rather than rechecking the same rank/title wire offsets.

**Retired HUD-rank evidence summary:** prior oracle runs showed rank/title wire offsets were not enough to explain the lower-left HUD label. Raw `RE/.omo/ui-explorer` artifacts were removed during cleanup; reopen only with a fresh oracle slice and fresh evidence paths.

**Retired HUD-cache evidence summary:** prior oracle runs suggested a lower-left HUD cache path rather than rank/title packet data. Do not repeat after-the-fact GDI-only capture as the sole strategy if legacy-client oracle work is explicitly reopened.

**Retired execution setup summary:** launcher-started legacy-client setup was a diagnostic path for the old playable-loop slices. It is not part of the current data/spec and Unity-port execution path.

**Retired attach-mode summary:** attach/capture hooks remain diagnostic-only if reopened, and must not become normal implementation runtime.

**Retired HUD social-class summary:** prior oracle work indicated the social-class display issue had a client-side consumer/cache dimension. Raw live-run artifacts were removed during cleanup; reopen only as an explicit oracle slice.

## Slice 4: World and Strategic Map

**Purpose:** validate readable world play.

**Scope:** world entry, system/grid/fleet info, grid ship counts, celestial body data, faction ownership, selection, movement, visible movement/warp effects, and two-account same-world visibility/state.

**Acceptance:** selected character enters world/strategic map, Korean UI is readable, grid/system selection produces populated panel data, movement/warp shows visible effect, and two accounts observe relevant same-world state.

**Verification:** server strategic tests, real-client screenshots/traces, and two-account proof followed by real-client confirmation.

**Grid/system panel preload update:** `server/src/server/logh7-login-session.mjs` now treats `LOGH_WORLD_IMPORT_STATIC_BASE` as opt-out (`'0'` only) and preloads populated `0x031d` static base/name data before `0x031f` and `0x0321` on the default `0x0f02` world-entry path. `server/src/server/logh7-world-content-exposure.mjs` now includes `0x031c -> 0x031d` in the system/base/planet producer contract. Focused verification: `cd server && node --test tests/server/logh7-login-session.test.mjs tests/server/logh7-world-content-exposure.test.mjs` passed 165/165. This closes only the server-record subcondition for populated grid/system panel data; Slice 4 still needs real-client screenshot/trace confirmation, movement/warp visible effect proof, and two-account same-world proof.

## Slice 5: Tactical and Battle

**Purpose:** make tactical mode playable enough for internal validation.

**Scope:** strategic-to-tactical entry, tactical object/panel population, no `NO DATA`, selection, movement, warp/move effects, attack, hit, damage, destruction/explosion, result display, and all first-phase tactical commands.

**Acceptance:** tactical map opens from strategic route, objects/panels are populated from server data, every in-scope tactical command executes, and combat/movement feedback is visible.

**Verification:** tactical record/parser tests, command execution tests, and real-client live QA screenshots/traces.

## Slice 6: Jobs, Commands, and Proposals

**Purpose:** stop treating command cards as flat dev UI.

**Scope:** full job/duty/authority catalog, full command catalog, phase membership, at least one executable command per known group, and proposal/report display.

**Acceptance:** every known group is represented in a coverage matrix; every first-phase command executes; proposals/reports are visible or on-route; dev-only command dumps are not accepted as canonical authority cards.

**Verification:** catalog tests, command execution tests, and real-client live QA for role-specific command availability/results.

## Slice 6b: Official 2004 Patch Stack Baseline

**Purpose:** start incorporating official live-service patch/update behavior before any closed beta readiness claim.

**Source:** `docs/reference/legacy-evidence/logh7-2004-official-patch-stack.md`, seeded from the user-provided Korean pasted patch text and to be upgraded through Wayback/CDX evidence.

**Scope:** chronological official patch stack, applied top-to-bottom:

- 2004-06 planned command/proposal verbs: promotion/selection, demotion, appointment, dismissal, resignation, assignment/allocation.
- character deletion rules: generated character deletion, colonel-or-lower eligibility, original-character non-deletion, authority-demotion prerequisite for high-rank generated characters.
- original-character lottery cooldown 12h to 3h and cancellation recovery.
- tactical retreat warp-out destination and Sargasso/radar-frame fixes.
- daily military-supply production.
- destroyer rail-arm angle and unit performance balance adjustments.
- evaluation-point-linked merit/achievement gains.
- planetary occupation parity.
- tactical entry timeout, damaged/normal ship display, tactical calendar year display, repair self-target, reversal wait gauge, tactical background carryover.
- character/ship info UI fixes: return-planet label, flagship decimal simplification, list scrollbar.
- strategic reconnaissance persistence, occupied-enemy visibility, strategic warp fuel/range/CP, complete supply, command concurrency/repeat gates, proposal mail subjects.

**Acceptance:**

- Each stack item is implemented, proven already covered, or explicitly deferred with blocker/evidence/owner.
- Later patch notices override earlier planned behavior while preserving the historical record.
- Wayback verification records archive timestamp, original URL, Japanese excerpt, Korean interpretation, affected slice, and provenance grade.
- Attachment-only items remain P2 until official Japanese source or other evidence upgrades them.
- No Wayback cache or generated extract is written to `C:`; repo-local cache/output paths must live under `E:\logh7-revival`.

**Verification:**

- CDX/Wayback search evidence for `www.gineiden.com` / `gineiden.com` `ct=update`, `ct=mente`, `ct=news` routes, decoded as EUC-JP.
- Server tests for domain rules: deletion eligibility, lottery cooldown/cancel recovery, supplies, merit calculation, occupation, warp fuel/range/CP, command concurrency, proposal mail titles.
- Wire/RE tests and real-client live QA for client-visible surfaces: command/proposal results, tactical retreat, tactical entry, repair/reversal, damaged-ship display, calendar display, complete supply, strategic warp/reconnaissance.
- Documentation sync keeps this slice linked from requirements, architecture, and document index.

## Slice 7: Community, Notices, and Moderation

**Purpose:** cover the non-game surfaces needed for internal validation.

**Scope:** launcher/web notices, in-game lobby/session notices, board read/write, linked character identity, admin notice management, board hide/delete, report review/handling.

**Acceptance:** player sees launcher/web notices and in-game lobby notice; logged-in account can use board; moderator/admin can handle posts and reports.

**Verification:** web/API tests, authz tests, and real-client live QA for lobby/session notice route.

## Slice 7b: Native System Extension Foundation

**Purpose:** make new native gameplay/political systems possible without treating them as mods or speculative client behavior.

**Scope:** server-domain system state machines, audit logs, admin/operator controls, existing client/web presentation routes, RE-backed client surface discovery, and native-client patch capacity planning for systems that need richer in-client UI. Example proving target: Free Planets Alliance Supreme Council chair election.

**Acceptance:**

- Native system additions are documented as core extension features separate from mod packs.
- One example system has a server-domain design covering state, invariants, actions, audit log, security roles, rollback, and user-visible outputs.
- Existing-surface path is identified first: web/community/admin, in-game lobby/session notices, proposal/report text, command outcomes, faction/session state.
- Any client-consumed packet, parser, command, panel, or display route required for native UI has `logh7-re`/`logh7-wire` evidence before bytes are emitted.
- Native-client expansion is no longer a product-path checklist. If legacy-client diagnostics require an EXE change, record target discovery, available patch capacity, direct changed bytes, original signature, target hash, rollback, and real-client live QA.

**Verification:**

- CodeGraph + `rg` orientation identifies server command/notify and client patch surfaces.
- `logh7-re` evidence names relevant dispatcher, size-table, command, parser, or display functions.
- `logh7-patch` checklist rejects any patch plan without originalHex/signature and rollback.
- `/cso` covers election/voting ledgers, admin override, audit log, identity linking, and client patch supply chain.
- Documentation distinguishes native system extension from modding.

## Slice 8: Remastering Foundation

**Purpose:** ship closed beta with remastering applied while keeping original assets as reversible fallback.

**Scope:** 2D art, 3D assets, modeling, textures, effects, sound, images, UI scaling, UI texture cleanup, portrait/background/media upscale, launcher polish, remaster pack manifest, provenance labels, original/remaster toggle, rollback expectation.

**Acceptance:**

- Original assets remain canonical fallback.
- Closed beta build includes approved remaster defaults for readability/presentation.
- Remaster assets remain reversible and provenance-labeled.
- AI-upscaled or generated assets are never labeled as original.
- 2D/3D/modeling/texture/effect/sound/image remaster outputs have source reference, tool/prompt chain when applicable, reviewer, hash, preview/live evidence, and rollback.
- One internal remaster experiment can be enabled and disabled without damaging the base install.
- Live-client consumed remaster assets have screenshot evidence.

**Verification:**

- Asset manifest validation.
- Original/remaster file diff and rollback check.
- Live-client screenshot comparison where applicable.
- 3D/model preview QA covers orientation, scale, texture maps, polygon budget, format, and fallback.
- Sound/effect QA covers format, loudness, playback route or closest tooling preview, and fallback.
- Use `image-upscaling` for upscale experiments when appropriate.
- Use `game-assets`, `game-3d-assets`, or `game-engine` only for approved prototypes/previews, with provenance and original fallback.

## Slice 9: Modding Foundation

**Purpose:** prevent future mod support from being blocked by hardcoded data and patch paths.

**Scope:** Layer A data/content pack manifest, Layer B localization/texture pack manifest, Layer C guarded client patch pack manifest, dependency/conflict metadata, schema/provenance validation, and one internal proof mod pack after the playable loop is stable.

**Acceptance:**

- Mods are manifest-driven, versioned, reversible, and conflict-checked.
- Server-side mods pass schema/provenance checks.
- Client patch mods require original signatures, target hash recording, rollback, and live QA.
- Public mod distribution is explicitly later scope.

**Verification:**

- Manifest parser/schema tests.
- Pack apply/remove dry run.
- Client patch pack byte/signature verification when Layer C is used.
- Use LOGH7 `extract`, `localize`, `patch`, `re`, and `wire` skills before generic game-asset skills.
- Use `multiplayer-game` only for state-sync/interest/server-authority pattern review; do not import RivetKit or replace LOGH7 protocol without separate approved architecture decision.
- If a dedicated modding/editor skill is needed, rerun `find-skills` with exact ecosystem and document install or rejection evidence.

## Slice 9b: DNT/Sourcebook AI Mod Pipeline

**Purpose:** support DNT/setting-book-derived optional mod packs without polluting original canonical data.

**Scope:** Google Drive or local setting-book PDFs/images, page rendering, OCR/crop extraction, structured asset briefs, Meshy/image-to-3D prototypes, generated asset provenance, prompt/cost/task-id records, mod pack overlay.

**Acceptance:**

- Drive folder access is verified or exact login/permission blocker recorded.
- Every extracted asset has source page/image id, crop coordinates or screenshot, OCR confidence when applicable, and rights/provenance label.
- AI-generated 3D assets are R3/generated placeholders unless reviewed and promoted.
- Meshy/API generation requires API-key presence, credit-cost confirmation, downloaded model hashes, thumbnails, and orientation/scale QA.

**Verification:**

- Use `pdf` page rendering and `smart-ocr` extraction for scanned source material.
- Use `meshy-3d-generation` or `game-3d-assets` for prototype 3D model generation.
- Validate manifest schema includes sourcebook provenance, prompt chain, generated status, and rollback.
- Preview generated model in tooling before any client-facing packaging.

## Slice 9c: macOS Client Compatibility Lab

**Purpose:** determine whether normal players can run the legacy client on macOS via Wine-family tooling.

**Scope:** CrossOver/Wineskin/PortingKit/maintained Wine builds, isolated prefixes/bottles, 32-bit Windows client behavior, D3D8 rendering through WineD3D/DXVK/D3D8/wrapper options, launcher handoff, Korean text, audio/input, network login, rollback.

**Acceptance:**

- macOS client support is not claimed until real Mac hardware shows launcher start, login, world entry, tactical rendering, Korean text, input, sound, network, and update/patch rollback.
- Failed attempts record exact macOS version, CPU, Wine/CrossOver/PortingKit version, bottle/prefix settings, DLL overrides, logs, and next different route.
- macOS server/web/dev remains supported even if legacy client playability fails.

**Verification:**

- Real-device smoke checklist.
- Wine/CrossOver logs and screenshots.
- DXVK/D3D8 or wrapper HUD/log evidence when used.
- Documentation update classifying macOS as supported, experimental, or blocked.

## Slice 10: Security, Review, and Compound Closure

**Purpose:** prevent repeated execution-review mistakes.

**Scope:** gstack `/cso`, gstack `/review` where a diff exists, `/learn`, `/retro`, compound learning capture, documentation sync, remaster/mod pack security.

**Acceptance:** security/review findings are fixed, mitigated, blocked with exact blocker, or intentionally deferred; compound capture answers mistake, root cause, prevention check, storage location, and future enforcement; current docs and entrypoints are updated.

**Verification:** `/cso` report or exact blocker, review report or exact reason no diff review applies, updated docs/entrypoints, and search confirming old invalid guidance is not current path.

### 2026-07-03 Unity Session Gate Slice

**Scope:** Validate that Unity bootstrapping follows the original client concept order instead of starting at StrategicMap.

**Evidence to inspect:**
- `server/content/generated/logh7-scene-inventory.json` first seven scene ids must be `boot-update-launcher`, `login`, `lobby`, `character-select`, `character-create`, `world-entry`, `strategic-map`.
- `client-unity/Assets/StreamingAssets/logh7/logh7-unity-runtime-manifest.json` must expose `normalEntryScene: boot-update-launcher`, `Logh7CharacterAuthority`, and `Logh7WorldSession`.
- `client-unity/Assets/Scripts/Logh7GalaxyPrototypeRuntime.cs` must consume `logh7-unity-runtime-manifest.json` rather than hardcoding StrategicMap as the first visible state.

**Verification:** `node --test server/tests/server/logh7-scene-inventory.test.mjs`, `node --test server/tests/server/logh7-unity-runtime-data.test.mjs`, full `npm --prefix server test`, and a Unity/editor compile or documented blocker when the editor cannot be driven in the current session.

### Slice: Medal and emblem data-mining gate

**Scope:** Validate decorations and remaster references are mined from original data before any generated art is accepted.

**Evidence to inspect:**
- `server/content/generated/logh7-medal-mining-catalog.json` must report 52 medals, ids `767..818`, Empire bits `0..25`, Alliance bits `26..51`.
- The catalog must prove Japanese medal names from `server/content/client/msgdat.json` and localized Korean names from `server/content/extracted/dat-tables.json`.
- `client-unity/Assets/ArtSource/original/medals/` must contain byte-identical copies of original `m_f001..m_f015` PNG/TGA files.
- `client-unity/Assets/ArtSource/reference/logh7-imperial-double-eagle-reference.jpg` must stay the exact Imperial crest reference; simplified generated crests fail the gate.

**Verification:** `npm --prefix server run catalog:medals`, `node --test server/tests/server/logh7-medal-catalog.test.mjs`, and visual inspection of the crest plus at least one original medal icon.

### Slice: Medal art production split

**Scope:** Validate the art pipeline follows the user-approved split: Alliance originals upscale first; missing Alliance variants may be generated in the same style; Empire medals are created from the 26 mined Empire names.

**Evidence to inspect:**
- `server/content/generated/logh7-medal-art-brief.json` must report `allianceOriginalUpscaleCount: 15`, `allianceVariantIfUniqueNeededCount: 11`, and `empireCreateCount: 26`.
- Alliance variant briefs must reference `client-unity/Assets/ArtSource/reference/logh7-alliance-flag-pentagon-reference.png`.
- Empire briefs must carry original Korean/Japanese/English names and `create-name-driven-imperial-medal`.

**Verification:** `npm --prefix server run catalog:medal-art-brief`, `node --test server/tests/server/logh7-medal-art-brief.test.mjs`, and visual inspection of Alliance flag plus at least one original medal icon.

### Slice: Alliance medal upscale base

**Scope:** Produce a reproducible first remaster base for existing Alliance medal icons before generating any missing variants.

**Evidence to inspect:**
- `client-unity/Assets/ArtSource/remaster/alliance-medals-4x/` must contain `m_f001_4x.png..m_f015_4x.png`.
- `server/content/generated/logh7-alliance-medal-upscale-manifest.json` must report `entryCount: 15`, `scale: 4`, and 80x80 source to 320x320 output dimensions.

**Verification:** `npm --prefix server run remaster:alliance-medals-4x`, manifest inspection, and visual inspection of at least one upscaled medal.
### Slice: Medal Art QA Correction And Empire Asset Composition

**Status 2026-07-04:** Real-ESRGAN direct medal upscale tried rejected by visual QA. Alliance `793..795` now user-reference-driven concept candidates 1024 transparent PNG packaging. Imperial work must use exact crest masks and original Empire ship data; corrected prototypes exist `767` `779`, and `779` has a source-locked crest/ship proof sample, but full 26-medal Empire production is not closed.

**Evidence to inspect:**
- `server/content/generated/logh7-alliance-foundation-medal-redraw-manifest.json`
- `server/content/generated/logh7-imperial-crest-mask-manifest.json`
- `server/content/generated/logh7-empire-ship-reference-manifest.json`
- `server/content/generated/logh7-imperial-medal-corrected-prototype-manifest.json`
- `server/content/generated/logh7-imperial-medal-source-lock-manifest.json`
- `client-unity/Assets/ArtSource/reference/logh7-ship-thumbnail-contact-sheet.png`
- `client-unity/Assets/ArtSource/remaster/imperial-medal-prototypes-1024/779-expeditionary-campaign-source-locked-crest-ship-v2.png`
- `client-unity/Assets/ArtSource/remaster/imperial-medal-prototypes-1024/767-grand-double-eagle-order-source-locked-crest-v2.png`

**Next verification:** run `npm --prefix server run catalog:imperial-medal-source-lock`; require `121` Empire model records, `120` `Ship/GE` file records, `117` MDX records, `3` MDS records, and `39` MDX render hulls before expanding Empire production prototypes for all 26 medal ids. Low-resolution ship-thumbnail reliefs may remain proof-only, not final large-detail medal art.
- 2026-07-04 completed slice: `server/content/generated/logh7-mdx-render-source-manifest.json` now confirms the first Imperial medal ship-art source is original `data/model/Ship/GE/EH001.mdx` (`23` nodes, SHA256 `31bc4de737d411c9c78192f63709207d5a9a58d44177bb8df78fd0a993acfbb2`) with the exact Imperial crest reference/mask still mandatory. Found texture evidence: Hi/Mid/Lo `EH001` and `meca_tile2`; missing evidence: authoring `EH001x.lwo` and `EH001_bump.tga`. **Next verification:** inspect/extract MDX geometry blocks or renderer output for `EH001`; do not promote the current proof PNG or decoded thumbnail into final large-detail medal art.
- 2026-07-04 G004 server-data-family slice: `catalog:server-data-family` produced `server/content/generated/logh7-server-servable-data-family.json` and `.omo/ulw-loop/evidence/server-servable-data-family-20260704.log`. The manifest scopes 14 server-facing families and keeps all `suspect-cross-check-required`; C002 boundary evidence `.omo/ulw-loop/evidence/server-servable-data-family-test-20260704.log` proves malformed source JSON is recorded as `unreadable`; C003 regression evidence `.omo/ulw-loop/evidence/server-test-data-family-20260704.log` passed `113/113`, and `.omo/ulw-loop/evidence/hidden-data-watchlist-data-family-20260704.log` kept `systemPositions` / `originalCharacterRoster` as not-confirmed-new-hidden canonical data.
- 2026-07-04 G005 current-content cross-check slice: `catalog:current-content-crosscheck` produced `server/content/generated/logh7-current-content-crosscheck.json` and `.omo/ulw-loop/evidence/current-content-crosscheck-20260704.log`. C001 evidence shows `serverContent`, `reContent`, and `installedGame` present but still suspect; `ghidraEvidence`, `manualOcrEvidence`, `liveEvidence`, and `wireEvidence` roots currently missing under the inventoried paths; generated catalog count `31` all `suspect-cross-check-required`. C002 boundary evidence `.omo/ulw-loop/evidence/current-content-crosscheck-test-20260704.log` passed `2/2`; C003 regression `.omo/ulw-loop/evidence/server-test-current-content-crosscheck-20260704.log` passed `115/115`, and `.omo/ulw-loop/evidence/server-data-family-after-crosscheck-20260704.log` kept all 14 G004 families suspect.
- 2026-07-04 G006 Unity source-pack slice: `catalog:unity-source-pack` produced `server/content/generated/logh7-unity-source-pack-manifest.json`, `client-unity/Assets/StreamingAssets/logh7/logh7-unity-source-pack-manifest.json`, and `.omo/ulw-loop/evidence/unity-source-pack-20260704.log`. The manifest separates required `original-fallback` from reversible disabled-by-default `remaster-hd`; `verifiedRecords` is `0` while current-content promotion is `blocked-until-cross-source-confirmed`. Boundary evidence `.omo/ulw-loop/evidence/unity-source-pack-test-20260704.log` passed `2/2`; regression `.omo/ulw-loop/evidence/server-test-unity-source-pack-20260704.log` passed `117/117`, and `.omo/ulw-loop/evidence/current-content-after-unity-source-pack-20260704.log` kept generated catalog count `30` all suspect.
- 2026-07-04 G007 remaster provenance slice: `catalog:remaster-provenance` produced `server/content/generated/logh7-remaster-provenance-manifest.json`, `client-unity/Assets/StreamingAssets/logh7/logh7-remaster-provenance-manifest.json`, and `.omo/ulw-loop/evidence/remaster-provenance-20260704.log`. `remaster-hd` pack disabled default, reversible, manifest-driven, conflict-check-required, provenance-label-required, original-fallback-required; all 6 artifact inputs are present but still suspect, including `imperial-crest-mask` and original Empire ship-derived `empire-ship-reference`. Boundary evidence `.omo/ulw-loop/evidence/remaster-provenance-test-20260704.log` passed `2/2`; regression `.omo/ulw-loop/evidence/server-test-remaster-provenance-20260704.log` passed `119/119`, `.omo/ulw-loop/evidence/unity-source-pack-after-remaster-provenance-20260704.log` kept source-pack `verifiedRecords=0`, and `.omo/ulw-loop/evidence/current-content-after-remaster-provenance-20260704.log` raised generated catalog count to `31`, all suspect.
- 2026-07-04 G008 galaxy trust crosscheck slice: `catalog:galaxy-trust-crosscheck` produced `server/content/generated/logh7-galaxy-trust-crosscheck.json`; `catalog:server-data-family` now lists it under the `systems` family; `catalog:current-content-crosscheck` now inventories 32 generated catalogs. Manifest groups `systemPositions`, `starColors`, `planetLists`, `passableCells`, and `generatedCatalogs` are present but `promotionAllowed=false`; `confirmedNewHiddenData.systemPositions=[]`, so no newly confirmed system positions were found.
- 2026-07-04 G009 runtime boundary slice: `catalog:runtime-boundary` produced `server/content/generated/logh7-runtime-boundary-manifest.json`; bootstrap and source-pack manifests include the runtime-boundary input, systems data-family references it, and current-content now inventories 33 generated catalogs. Parsed evidence keeps `G7MTClient.exe`, Frida, `ui_explorer`, preseed flags, and patch builders `oracle-only` with `normalRuntimeAllowed=false`.
- 2026-07-04 G010 asset overwrite guard slice: `catalog:asset-overwrite-guard` produced `server/content/generated/logh7-asset-overwrite-guard.json`; protected roots are read-only fallback, allowed output roots are remaster/reference/concept, `violationCount=0`, remaster provenance artifact count is 7, and current-content now inventories 34 generated catalogs.
- 2026-07-04 G011 formula provenance guard slice: `catalog:formula-provenance-guard` produced `server/content/generated/logh7-formula-provenance-guard.json`; focused tests cover unresolved CP/combat/economy/AI formula promotion block, data-family `formulas` integration, and generated catalog writes. **Next verification:** expand RE/live/manual evidence per domain before moving any formula from `unresolved` to verified.
- 2026-07-04 G012 Unity asset source-truth slice: `catalog:unity-asset-source-truth` produced server and StreamingAssets manifests; focused tests cover normal contract, missing StreamingAssets boundary, and generated write. **Next verification:** Unity runtime scene should display/consume this manifest alongside source-pack before any asset pack is treated as authoritative.
- 2026-07-04 G012 follow-up: Unity asset source-truth now requires Empire ship reference, Imperial crest mask, and Imperial medal source-lock inputs. **Next verification:** Unity runtime scene should display/consume manifest alongside source-pack before any asset pack is treated authoritative; Imperial ship medal art must prove `Ship/GE` MDX render/extract consumption rather than thumbnail upscale.
- 2026-07-04 G013 test decision guard slice: `catalog:test-decision-guard` produced `server/content/generated/logh7-test-decision-guard.json`; focused tests cover Node TDD-required extraction/inventory/cross-check surfaces, Unity tests-after first loader/scene surface policy, and generated write. Current-content cross-check inventories the new generated catalog. **Next verification:** first Unity manifest-consuming loader/scene surface must turn the Unity policy into a concrete runtime test target.
- 2026-07-04 G014 ULW evidence inventory slice: `catalog:ulw-evidence-20260703` produced `server/content/generated/logh7-ulw-evidence-20260703-inventory.json`; focused tests cover default 20260703 inventory, missing/excluded boundary, and generated write. Current-content cross-check inventories the new generated catalog. **Next verification:** use the inventory to decide which 2026-07-03 evidence groups still need cross-source promotion blockers or newer reruns.
- 2026-07-04 G015 source-pack correction slice: `catalog:unity-source-pack` now emits `originalFallbackPack.requiredAssetFamilies` for `imperialShipMdx` (`.omo/work/logh7-installed/data/model/Ship/GE`, `fileCount=117`), `fieldShipMarkSheet`, `imperialDoubleEagleReference`, and `imperialDoubleEagleMasks` into both server generated content and Unity StreamingAssets. RED evidence `.omo/ulw-loop/evidence/g015-imperial-ship-crest-red-20260704.log` fails on missing `requiredAssetFamilies`; GREEN/final evidence `.omo/ulw-loop/evidence/g015-unity-source-pack-test-final-20260704.log` passes `3/3`; full server regression `.omo/ulw-loop/evidence/g015-server-test-20260704.log` passes `138/138`. No newly confirmed `systemPositions` or `originalCharacterRoster` data in this slice.
- 2026-07-04 G015 Unity validation scene slice: source-ledger scene/capture implementation landed but manual screenshot is blocked. Added `client-unity/Assets/Editor/Logh7ValidationSceneCapture.cs`, extended `Logh7PrototypeSceneGenerator` with `RebuildSceneForBatch()` and source-ledger TextMesh lines, and extended `Logh7GalaxyPrototypeRuntime` to show source-pack/source-truth ledger summaries. RED evidence `.omo/ulw-loop/evidence/g015-unity-validation-scene-red-20260704.log`; GREEN focused evidence `.omo/ulw-loop/evidence/g015-focused-tests-20260704.log` passes `7/7`; full regression `.omo/ulw-loop/evidence/g015-server-test-after-validation-scene-20260704.log` passes `139/139`; C# LSP diagnostics clean. Manual QA blocker evidence `.omo/ulw-loop/evidence/g015-unity-capture-final-20260704.log` shows Unity Licensing channel refused / mutex timeout before executeMethod; screenshot PNG missing; batch Unity PID cleaned. G015 remains blocked, not complete.
- 2026-07-04 G016 wave-0 CD/server-data/hidden-data regeneration slice: pipeline evidence `.omo/ulw-loop/evidence/g016-pipeline-run-20260704.log` reran CD media extraction, hidden-data scan/classify/watchlist, server-data family, and current-content crosscheck. Watch summary `.omo/ulw-loop/evidence/g016-watchlist-summary-20260704.log`: hidden candidate count `37047`, server families `15`, generated catalogs `38`, no newly confirmed `systemPositions` or `originalCharacterRoster`; existing roster findings remain suspect current composite/manual content. Focused tests `.omo/ulw-loop/evidence/g016-focused-tests-20260704.log` pass `14/14`; full server tests `.omo/ulw-loop/evidence/g016-server-test-20260704.log` pass `139/139`.
- 2026-07-04 G017 source inventory / cross-check / Unity import manifest slice: pipeline evidence `.omo/ulw-loop/evidence/g017-pipeline-run-20260704.log` reran source-root inventory, current-content crosscheck, Unity asset source-truth, and Unity source-pack. Consistency evidence `.omo/ulw-loop/evidence/g017-manifest-consistency-20260704.log`: source roots `8`, generated catalogs `38`, source-truth inputs `9`, runtime consumers `5`, `violationCount=0`, source-pack `verifiedRecords=0`, `Ship/GE fileCount=117`, crest reference/masks present, server/StreamingAssets JSON match. Focused tests `.omo/ulw-loop/evidence/g017-focused-tests-20260704.log` pass `8/8`; full server tests `.omo/ulw-loop/evidence/g017-server-test-20260704.log` pass `139/139`.
- 2026-07-04 G018 validation update: UI scene/remaster/gameplay boundary validation now includes original Empire ship and crest asset contracts. Evidence artifacts: `server/content/generated/logh7-ui-scene-remaster-gameplay-boundary.json`, `client-unity/Assets/StreamingAssets/logh7/logh7-ui-scene-remaster-gameplay-boundary.json`, `.omo/ulw-loop/evidence/g018-ui-boundary-catalog-20260704.log`, `.omo/ulw-loop/evidence/g018-ui-boundary-focused-tests-20260704.log`, `.omo/ulw-loop/evidence/g018-ui-boundary-server-tests-20260704.log`. Required assertions: `Ship/GE` raw `117` MDX + `3` MDS, `Thumbnail/Ship` `79` TGA, Empire ship reference manifest `6` entries, Imperial crest mask manifest `3` variants, server/Unity manifest hashes match, and canonical promotion remains `blocked-until-cross-source-confirmed`.
- 2026-07-04 G019 validation update: Unity loader/validation scene source tests now require the G018 boundary manifest surface. `Logh7GalaxyPrototypeRuntime` must contain `uiBoundaryLine`, read `logh7-ui-scene-remaster-gameplay-boundary.json`, and expose `Ship/GE=117` plus `crest variants=3`; `Logh7PrototypeSceneGenerator` must include a `ui-boundary` source-ledger line. Evidence `.omo/ulw-loop/evidence/g019-unity-boundary-red-20260704.log` (RED), `.omo/ulw-loop/evidence/g019-unity-boundary-green-20260704.log` (GREEN), `.omo/ulw-loop/evidence/g019-unity-boundary-focused-tests-20260704.log` (`6/6`), `.omo/ulw-loop/evidence/g019-unity-boundary-server-tests-20260704.log` (`142/142`). Unity batch screenshot remains blocked by the existing Licensing IPC issue, so G019 proof is loader/source-surface only.
- 2026-07-04 G020 validation update: `extract:cd-media` revalidated Archive BIN/CUE and extraction outputs. Required evidence now includes media `verified`, ISO `converted`, ISO root `25` files, InstallShield root `2207` files, canonical promotion `blocked-pending-crosscheck`, focused CD media tests `3/3`, and full server tests `142/142`. Evidence files: `.omo/ulw-loop/evidence/g020-cd-media-extract-20260704.log`, `.omo/ulw-loop/evidence/g020-cd-media-tests-20260704.log`, `.omo/ulw-loop/evidence/g020-cd-media-server-tests-20260704.log`.

- 2026-07-04 G021 validation update: server data scope catalog revalidated every rebuilt-server data family. Required evidence now includes `familyCount=15`, all family `canonicalStatus=suspect-cross-check-required`, mandatory watches `systemPositions` and `originalCharacterRoster`, current-content promotion still `blocked-until-cross-source-confirmed`, focused server-data-family tests `2/2`, and full server tests `142/142`. Evidence files: `.omo/ulw-loop/evidence/g021-server-data-family-catalog-20260704.log`, `.omo/ulw-loop/evidence/g021-server-data-family-focused-tests-20260704.log`, `.omo/ulw-loop/evidence/g021-current-content-crosscheck-20260704.log`, `.omo/ulw-loop/evidence/g021-server-tests-20260704.log`.

- 2026-07-04 G022 validation update: hidden-data scanner/classifier/watchlist pipeline revalidated raw BIN/ISO/InstallShield/installed payload candidates. Required evidence now includes classification records `37047`, validation split `10253/26794`, immediate-report watch summaries for `systemPositions` and `originalCharacterRoster`, no canonical promotion, focused hidden-data tests `10/10`, and full server tests `142/142`. Evidence files: `.omo/ulw-loop/evidence/g022-hidden-data-scan-20260704.log`, `.omo/ulw-loop/evidence/g022-hidden-data-classify-20260704.log`, `.omo/ulw-loop/evidence/g022-hidden-data-watchlist-20260704.log`, `.omo/ulw-loop/evidence/g022-hidden-data-focused-tests-20260704.log`, `.omo/ulw-loop/evidence/g022-server-tests-20260704.log`.

- 2026-07-04 G023 validation update: source inventory now covers verified Archive media plus CD extraction roots. Required evidence includes source-root `rootCount=10`, `cd-extract-iso-filesystem` present with `25` files, `cd-extract-installshield-payload` present with `2207` files, source corpus focused tests `3/3`, LSP clean for changed source-corpus test, current-content and Unity source manifests preserving `blocked-until-cross-source-confirmed`, and full server tests `142/142`. Evidence files: `.omo/ulw-loop/evidence/g023-source-inventory-20260704.log`, `.omo/ulw-loop/evidence/g023-source-corpus-focused-tests-20260704.log`, `.omo/ulw-loop/evidence/g023-current-content-crosscheck-20260704.log`, `.omo/ulw-loop/evidence/g023-unity-asset-source-truth-20260704.log`, `.omo/ulw-loop/evidence/g023-unity-source-pack-20260704.log`, `.omo/ulw-loop/evidence/g023-server-tests-20260704.log`.
- 2026-07-04 G024 validation update: Unity source-pack manifest now verifies CD media/source-root registry inputs, source-root inventory, original fallback asset families, and reversible remaster pack policy. Required evidence includes server and Unity StreamingAssets source-pack hashes matching, `canonicalPromotion=blocked-until-cross-source-confirmed`, `verifiedRecords=0`, `imperialShipMdx` present with `117` files, `fieldShipMarkSheet` present, `imperialDoubleEagleReference` present, `imperialDoubleEagleMasks` present, focused tests `3/3`, LSP clean for source/test manifest files, and full server tests `142/142`. Evidence files: `.omo/ulw-loop/evidence/g024-unity-source-pack-catalog-rerun-20260704.log`, `.omo/ulw-loop/evidence/g024-unity-source-pack-original-asset-contract-20260704.log`, `.omo/ulw-loop/evidence/g024-unity-source-pack-focused-redgreen-20260704.log`, `.omo/ulw-loop/evidence/g024-server-tests-20260704.log`.
- 2026-07-04 G025 validation update: UI scene catalog now has RED/GREEN evidence and generated server/Unity StreamingAssets outputs. Required evidence includes RED `ERR_MODULE_NOT_FOUND`, GREEN focused tests `3/3`, generated catalog run `surfaceCount=10 missingSceneCount=0 liveTraceSurfaceCount=6`, server/Unity JSON byte equality and matching SHA256, current-content crosscheck including `logh7-ui-scene-catalog.json`, LSP clean for source/tool/test files, and full server tests `145/145`. Evidence files: `.omo/ulw-loop/evidence/g025-ui-scene-catalog-red-20260704.log`, `.omo/ulw-loop/evidence/g025-ui-scene-catalog-green-20260704.log`, `.omo/ulw-loop/evidence/g025-ui-scene-catalog-run-20260704.log`, `.omo/ulw-loop/evidence/g025-ui-scene-catalog-surface-proof-20260704.log`, `.omo/ulw-loop/evidence/g025-current-content-crosscheck-20260704.log`, `.omo/ulw-loop/evidence/g025-server-tests-20260704.log`.
- 2026-07-04 G026/G031 validation update: Unity StreamingAssets deterministic export has RED/GREEN evidence and generated server/Unity copies. G026 established deterministic export at `fileCount=13`; G031 supersedes the current export surface after adding `logh7-gameplay-contract-boundary.json`: `fileCount=14`, `originalFallbackAssetCount=4`, server/Unity export byte equality and SHA256 `04fb0f60fd003d5b3bd90231a4449ec30f97295539fb57a9b145a2f28e7ec8dd`, self-index exclusion, fallback hash addresses for `imperialShipMdx`, `fieldShipMarkSheet`, `imperialDoubleEagleReference`, `imperialDoubleEagleMasks`, current-content crosscheck including export, LSP clean source/tool/test, and full server tests `151/151`. Evidence files include `.omo/ulw-loop/evidence/g026-streamingassets-export-*.log`, `.omo/ulw-loop/evidence/g031-streamingassets-export-rerun-20260704.log`, `.omo/ulw-loop/evidence/g031-streamingassets-export-proof-20260704.log`, and `.omo/ulw-loop/evidence/g031-server-tests-final-20260704.log`.
- 2026-07-04 G027 validation blocker: Unity project structure and editor version are present, but `Unity.exe -quit -batchmode -nographics -projectPath E:/logh7-revival/client-unity` timed out after 240s. Log evidence shows repeated Licensing IPC failures (`Unity-LicenseClient-Peppone Choi`, `LicenseClient-Peppone Choi` refused/timeouts, `com.unity.editor.headless` missing) and cleanup left one `Unity.Licensing.Client` PID access-denied. Evidence files: `.omo/ulw-loop/evidence/g027-unity-open-batch-20260704.log`, `.omo/ulw-loop/evidence/g027-unity-open-blocker-summary-20260704.log`.
- 2026-07-04 G028 validation blocker: C# manifest/scene catalog loader EditMode tests require Unity Editor execution and are blocked by G027 Licensing IPC. Evidence reuses `.omo/ulw-loop/evidence/g027-unity-open-batch-20260704.log` and `.omo/ulw-loop/evidence/g027-unity-open-blocker-summary-20260704.log`; no duplicate Unity batch attempt was run.
## 2026-07-04 G030 Remaster Provenance Validation Update

- Required evidence now includes RED/GREEN proof that `empire-ship-reference` no longer reports `provenance.sourceHashes.status=missing`. RED: `.omo/ulw-loop/evidence/g030-remaster-provenance-ship-red-20260704.log`. GREEN: `.omo/ulw-loop/evidence/g030-remaster-provenance-ship-green-20260704.log`.
- Generated manifest proof: `.omo/ulw-loop/evidence/g030-remaster-provenance-ship-run-20260704.log` and `.omo/ulw-loop/evidence/g030-remaster-provenance-ship-proof-20260704.log` show server/Unity byte equality, `artifactCount=7`, `shipSourceHashCount=6`, first source `.omo/work/logh7-installed/data/image/Thumbnail/Ship/iu008.tga` SHA256 `d92982521bf4109fd770f436c366254949a555d046332d4fd23cd00ca3144106`, crest reference SHA256 `822276b190c3e83729de39c14e4e9fc06c2eb8b39a56225bdcbe16f147134e9e`.
- Regression gates: `.omo/ulw-loop/evidence/g030-current-content-crosscheck-20260704.log`, `.omo/ulw-loop/evidence/g030-server-tests-20260704.log` (`148/148`), and LSP diagnostics clean for `server/src/server/logh7-remaster-provenance-manifest.mjs` and `server/tests/server/logh7-remaster-provenance-manifest.test.mjs`.
- No new `systemPositions` or `originalCharacterRoster` values were confirmed in this slice.
## 2026-07-04 G031 Gameplay Contract Boundary Validation Update

- Required evidence now includes RED/GREEN proof for `logh7-gameplay-contract-boundary`: RED `.omo/ulw-loop/evidence/g031-gameplay-contract-red-20260704.log` (`ERR_MODULE_NOT_FOUND`), GREEN `.omo/ulw-loop/evidence/g031-gameplay-contract-green-20260704.log` (`3/3`).
- Generated manifest proof: `.omo/ulw-loop/evidence/g031-gameplay-contract-run-20260704.log` and `.omo/ulw-loop/evidence/g031-gameplay-contract-proof-20260704.log` show server/Unity byte equality, SHA256 `c6aeb113835dccda6cacd2dbc7012e072268035bcc043990108ccbfe309dce40`, `implementedEvidenceBackedRuleCount=1`, `implementedRuleIds=["strategy-command-cost-table"]`, `unresolvedFormulaLockCount=9`, formula guard/server-data-family present, and `unresolvedFormulaPromotionAllowed=false`.
- StreamingAssets export was refreshed after adding the gameplay contract file: `.omo/ulw-loop/evidence/g031-streamingassets-export-rerun-20260704.log` and `.omo/ulw-loop/evidence/g031-streamingassets-export-proof-20260704.log` show `fileCount=14`, byteEqual `true`, SHA256 `04fb0f60fd003d5b3bd90231a4449ec30f97295539fb57a9b145a2f28e7ec8dd`, gameplay contract included, self-index excluded.
- Regression gates: `.omo/ulw-loop/evidence/g031-current-content-crosscheck-final-20260704.log`, `.omo/ulw-loop/evidence/g031-server-tests-final-20260704.log` (`151/151`), `.omo/ulw-loop/evidence/g031-loc-check-final-20260704.log`, and LSP diagnostics clean for changed `.mjs` source/tool/test files. No new `systemPositions` or `originalCharacterRoster` values were confirmed.
## 2026-07-04 G033 Plan Compliance Audit Validation Update

- Required evidence now includes `.omo/ulw-loop/evidence/g033-plan-compliance-audit-20260704.log`: pass status, no failed checks, G030/G031/G032 complete with criteria pass, remaster pack disabled/reversible/fallback-backed, `empire-ship-reference` source hashes present, Imperial crest locked, gameplay unresolved formulas locked, StreamingAssets current at `fileCount=14`, canonical promotion blocked, runtime diagnostic shortcuts not promoted, evidence files present.
- Boundary evidence `.omo/ulw-loop/evidence/g033-plan-compliance-boundary-20260704.log` verifies missing evidence detection with a synthetic missing path. This prevents receipt-only slices from passing on unchecked or stale evidence lists.
- No new `systemPositions` or `originalCharacterRoster` values were confirmed in this audit.
## 2026-07-04 Unity Visual Build Check

- Result: current Unity prototype builds and displays a visible validation surface.
- G045 result: current Unity prototype player session controls visibly advance through the expected gate sequence when clicked and block Strategic Map entry when prerequisites are absent.
- G046 result: current Unity prototype player consumes `logh7-ui-scene-catalog.json`, renders the catalog's 10 scene surfaces, gates them by session state, and selects `tactics` only after Strategic Map prerequisites.
- Evidence:
  - Build log: `.omo/ulw-loop/evidence/codex-unity-windows-build-final2-20260704.log`
  - Editor capture: `.omo/ulw-loop/evidence/codex-unity-validation-scene-screenshot-20260704.png`
  - Player run log: `.omo/ulw-loop/evidence/codex-unity-player-run-final-20260704.log`
  - Player screenshot: `.omo/ulw-loop/evidence/codex-unity-player-window-screenshot-final-20260704.png`
  - Clickthrough screenshot: `.omo/ulw-loop/evidence/g045-player-clickthrough-strategic-map-20260704.png`
  - Edge blocked screenshot: `.omo/ulw-loop/evidence/g045-player-edge-strategic-blocked-20260704.png`
  - Focused tests: `.omo/ulw-loop/evidence/g045-focused-unity-surface-tests-20260704.log`
  - Full regression: `.omo/ulw-loop/evidence/g045-server-tests-20260704.log`
  - G046 tactics surface screenshot: `.omo/ulw-loop/evidence/g046-player-scene-tactics-switch-20260704.png`
  - G046 tactics blocked screenshot: `.omo/ulw-loop/evidence/g046-player-scene-tactics-blocked-20260704.png`
  - G046 focused tests: `.omo/ulw-loop/evidence/g046-focused-unity-scene-surface-tests-20260704.log`
  - G046 full regression: `.omo/ulw-loop/evidence/g046-server-tests-20260704.log`
- Validation note: player screenshot shows the current surface only: session shell, suspect galaxy preview, runtime evidence, and watch-category non-promotion. It does not prove full game feature parity.
