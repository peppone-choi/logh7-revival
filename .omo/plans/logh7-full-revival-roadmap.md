# logh7-full-revival-roadmap - Work Plan

## TL;DR (For humans)

**What you'll get:** A reproducible revival of the original `G7MTClient.exe` against the Node.js authority server: canonical data and protocol evidence, a playable login-to-world loop, strategic/tactical/social systems, official-patch behavior, operations, and a release-quality evidence bundle.

**Why this approach:** The original client is the product surface, and every promotion is gated by source provenance, automated tests, and a real-client observation. Uncertain advertised features remain reversible extension profiles instead of being mislabeled as shipped behavior.

**What it will NOT do:** It will not make Unity the runtime, silently canonicalize P2/P3 guesses, redistribute copyrighted binaries, or use irreversible EXE changes.

**Effort:** XL

**Risk:** High - the current M3 character/unit join, incomplete original-client RE, mixed-provenance data, and absent battle runtime are the critical path.
**Decisions to sanity-check:** Original-client-first scope; P0/P1/P2/P3 promotion rules; reconstructed-extension profile; reversible patch policy; one-at-a-time live QA on port 47900.

Your next move: approve this execution plan to begin implementation, or request a high-accuracy review before execution.

Review status: Metis gap review incorporated on 2026-07-12. This file is execution-ready; implementation remains prohibited until the user approves this revised plan.

> TL;DR (machine): XL/high-risk evidence-first vertical restoration of G7MTClient + Node authority server, from truthful M3 through all client-visible domains and operations.

## Scope

### Must have

- Canonical source/data/RE ledger with hashes, versions, encoding, rights, provenance, server consumer, and promotion state.
- Original `G7MTClient.exe` compatibility from transport/login/lobby through account-wide character entry and a stable strategic world.
- Authoritative persistent state for characters, systems, planets, ships, fleets, fortresses, factions, ranks, commands, CP, duties, operations, economy, tactics, battles, occupation, mail, chat, localization, and community surfaces.
- Official 2004-2005 update behavior and a clearly versioned final-service preset.
- Launcher/signup/Compose/security/observability/backup/load/regression operation path.
- Real-client evidence bundles containing hashes, server revision, ports, traces, screenshots, result JSON, and a 300-second survival run where applicable.

### Must NOT have (guardrails, anti-slop, scope boundaries)

- Unity revival or reimplementation in this execution plan; Unity is a later migration appendix only.
- Native new-system extensions, macOS client support, and a public mod marketplace are deferred; the closed-beta reversible remaster track remains in scope.
- P2/P3 values promoted to canonical without a source and acceptance ledger; five overlay systems and nineteen overlay planets stay out of the default seed until proven.
- Source/binary/asset redistribution, private-system intrusion, leaked material, or unapproved external contact.
- Irreversible EXE overwrite, Python-generated replacement binaries, or unreviewed patching of the original install.
- Completion claims based only on opcode registration, process survival, passing unit tests, or a screenshot without the corresponding state/trace.
- Required Frida/ui_explorer/preseed/manual PID cleanup in the normal playable path; probes remain QA-only.
- Nested worker teams. Only the root agent may delegate; live client port 47900 is serialized.

## Verification strategy

> Zero human intervention - all verification is agent-executed.

- Test decision: TDD for parsers, codecs, state transitions, persistence, and security; tests-after for original-client live behavior; no test deletion or weakening.
- Unit/integration framework: `server/package.json` scripts and Node `node:test` suites under `server/tests/`.
- Static gates: JSON parse/provenance audits, `npm test` in `server/`, diagnostics/LSP clean on changed files, and no stale-path references in generated audits.
- Live gate: one stock client only on port 47900; drive through login, lobby, world, selection, movement, and each feature slice using existing `tools/live/*` harnesses extended with fail-closed exit status.
- Evidence: `.omo/evidence/ulw/<session>/<goalId>/a<attempt>/task-<N>-logh7-full-revival-roadmap.<ext>` plus a named per-run directory under `.omo/live-qa/`. Every bundle records client SHA-256, loose-file manifest, server revision/diff, exact command, ports, trace, screenshots, result JSON, crash/timeout status, and redacted logs.
- Required negative cases: bad credentials, malformed/truncated frames, invalid session/world entry, duplicate command, unauthorized faction/character mutation, stale version, persistence restart, and missing/low-trust data.
- Runtime readiness gate: direct Node/EXE/Frida diagnostics never satisfy production readiness; `/cso` smoke, launcher, Compose, auth-abuse, replay, backup/restore, and secret/PII checks are required.

## Execution strategy

### Parallel execution waves

Each wave has 5-8 implementation/test todos. Read-only RE, archive, and data work may run in parallel; any live client run is serialized after its dependencies.

| Wave | Outcome | Parallel lane | Exit gate |
| --- | --- | --- | --- |
| 0 | Truthful baseline and control plane | docs, audits, harness | no stale authority claims; reproducible baseline bundle |
| 1 | Source/data/protocol foundations | provenance, CD/patch, opcode/RE | every promoted input has a ledger row and fixture |
| 2 | M3/M2 playable entry | world join, object table, character lifecycle | two-account world entry and stable map evidence |
| 3 | Strategic vertical slice | map state, movement, commands, logistics/economy | one persistent strategic turn with two clients |
| 4 | Tactical/battle vertical slice | tactical pool, battle core, occupation | one bounded battle roundtrip and result persistence |
| 5 | Social/localization/patch profiles | chat/mail/Korean/UI/official updates | client-visible social and localization evidence |
| 6 | Operations and release | launcher/signup/security/backup/load | clean deployed run and recovery proof |
| 7 | Full regression and handoff | all lanes | all final verification lanes approve |

Wave 0 is serial. After its path-scoped checkpoint, archive/data/RE lanes may run in separate worktrees; the root agent alone may spawn workers, every brief forbids delegation/team creation, and only one live-QA owner may bind port 47900.

### Dependency matrix

| Todo | Depends on | Blocks | Can parallelize with |
| --- | --- | --- | --- |
| 1-5 | none | all later work | 1-5 with each other |
| 6-10 | 1-5 | M3/M2 and data consumers | each other after shared ledger schema |
| 11-16 | 6-10 | strategic/tactical work | 11-13 with 14-16 |
| 17-22 | 15-16 | tactical/social/operations | 17-19 with 20-22 |
| 23-28 | 21-22 | battle and full loop | 23-25 with 26-28 |
| 29-34 | 23-28 | release gates | 29-31 with 32-34 |
| 35-40 | 29-34 | final verification | each domain review in parallel |

## Todos

> Implementation + Test = ONE todo. Never separate.

### Wave 0 - baseline, authority, and fail-closed gates

- [ ] 1. Record a dirty-worktree checkpoint before any implementation, then reconcile the normative product/runtime documents around patched `G7MTClient.exe` + Node authority server; move Unity-era instructions to a historical appendix. References: `docs/logh7-work-plan-current.md`, `docs/logh7-requirements-current.md`, `docs/logh7-architecture-operations-current.md`, `docs/logh7-document-index-current.md`. Acceptance: HEAD, staged/unstaged/untracked path lists, ownership classification, and hashes are saved; no `git add -A`, cleanup, branch switch, or parallel worktree occurs before the checkpoint; a script finds exactly one normative runtime path and zero active references to deleted `client-unity/`. QA: checkpoint verifier, `rg` audit, and `npm test`.
- [ ] 2. Freeze a baseline manifest for the canonical client, CD/ISO, installed payload, official patch, manuals, server tree, and current working diff. References: `server/content/generated/*audit.json`, `artifacts/logh7-cd`, `artifacts/logh7-install`, `artifacts/official-patch-staging`, `docs/reference/*.pdf`. Acceptance: SHA-256 manifest and source-root JSON parse; no user files are overwritten. QA: manifest verifier and JSON parse.
- [ ] 3. Make all live-QA harnesses fail closed on crash, timeout, missing screenshot, zero active units, `NO TABLE`, wrong client hash, or missing trace. References: `tools/live/_m3_close_probe.py`, `tools/live/_wiretap_fade_drive.py`, `.omo/live-qa/m3-*`. Acceptance: injected failure exits nonzero; a known-good fixture exits zero only with all required artifacts. QA: harness self-test and one dry run without launching the client.
- [ ] 4. Add a current evidence-bundle schema and redaction checker. References: `docs/logh7-codex-harness-loop.md`, `.omo/live-qa/`, `tools/live/`. Acceptance: incomplete bundle is rejected; secrets/PII are redacted; bundle links to the exact client and server revisions. QA: fixture pass/fail tests.
- [ ] 5. Create the cross-domain completion matrix and reconcile it with `.omc/ultragoal/goals.json` and the six active milestones. States are `discovered`, `decoded`, `server-consumed`, `automated-tested`, `wire-tested`, `real-client-live`, `canonical`, `official-patch`, `dead`, `unshipped`, `blocked`, and `reconstructed-extension`. References: `docs/logh7-client-dispatch-catalog.md`, `docs/reference/legacy-evidence/logh7-function-re-coverage-matrix.md`, `server/content/generated/logh7-server-servable-data-family.json`, `.omc/ultragoal/goals.json`. Acceptance: every known opcode (185/203), 81 commands, 15 data families, manual/patch behavior, and client-visible surface has one row; zero unclassified rows and no “done” status without evidence; no competing status ledger is created. QA: generated matrix and goal reconciliation test.

### Wave 1 - provenance, CD/patch corpus, protocol and RE foundations

- [ ] 6. Regenerate all source-root and cross-check manifests against `artifacts/` and current `server/content/`; repair broken path references without deleting historical records. Acceptance: data audit reports zero stale-root references for active inputs and explicitly labels historical paths. QA: audit command and JSON parse.
- [ ] 7. Split canonical galaxy data into P0/P1/P3 files; keep 79 MDX coordinates, the one manual-only system, five overlay systems, and nineteen overlay planets explicitly separated. References: `server/content/galaxy.json`, `server/data/seed/galaxy-systems.json`, `docs/reference/legacy-evidence/logh7-true-system-count-2026-06-29.md`. Acceptance: default seed excludes P3; placement reports 79/1/5 counts; passability has a cited source or remains noncanonical. QA: `node` galaxy placement tests.
- [ ] 8. Re-extract and hash CD/ISO/installed assets, manuals, and official `G7UPD040514.exe`; build page/byte-stream diffs and an update chronology. References: `docs/reference/gin7manual*.pdf`, `docs/reference/legacy-evidence/logh7-2004-official-patch-stack.md`, `server/tests/logh7-cd-extract.test.mjs`. Acceptance: coverage, duplicate, encoding, and rights metadata are recorded; no payload is redistributed. QA: CD extraction and PDF/hash tests.
- [ ] 8a. Run the recurring public-research lane for Wayback/IA/official pages, press, video, manuals, and fan P2 evidence. Record query, original/archive URL, capture time, raw hash, encoding, version, rights note, provenance grade, affected matrix rows, and server consumer; keep the missing post-bootstrap update payload explicitly blocked. References: `.omo/ulw-research/`, `docs/logh7-requirements-current.md`, `docs/logh7-architecture-operations-current.md`, `https://web.archive.org/web/20050507031023id_/http://www.gineiden.com/`. Acceptance: each new source creates a ledger row and no unsupported claim enters canonical data. QA: research-ledger lint and hash/rights fixture.
- [ ] 9. Reconcile the 185 current inbound opcodes with the historical 203 bidirectional catalog, including missing `0x0343`, `0x0430`, `0x0318-0x031b`, and `0x0501`. References: `docs/logh7-client-dispatch-catalog.md`, `docs/reference/legacy-evidence/logh7-opcode-reference-2026-06-28.md`, `server/src/server/`. Acceptance: each code is classified and either has a fixture/handler or an explicit blocked reason. QA: catalog cross-check test.
- [ ] 10. Establish RE work queues by dependency rather than function count, prioritizing `0x0323/0x0325`, object table, focus lookup, tactical pool, battle records, and base/economy consumers. References: `docs/logh7-focusid-lookup-re.md`, `docs/logh7-objtable-gate-re.md`, `docs/reference/legacy-evidence/logh7-tactical-battle-re.md`. Acceptance: every queue item names input, expected state effect, probe, and promotion gate. QA: RE matrix lint.

### Wave 2 - M3/M2 client entry and persistent world

- [ ] 11. Resolve the current M3 character-to-unit join and `0x0325` header/ID/slot semantics; remove the crash at `0x58f83a` and prove a nonzero occupied unit registry. References: `server/src/server/logh7-world-records.mjs`, `server/src/server/logh7-deployment-units.mjs`, `docs/logh7-m3-join-handoff-2026-07-11.md`, `tools/live/_frida_charstage_probe.js`. Acceptance: stock client receives valid unit header, `activeCount>0`, focus lookup succeeds, no crash. QA: fail-closed M3 live bundle.
- [ ] 12. Complete the now-loading/object-table transition and flagship information table. References: `docs/logh7-now-loading-gate-re.md`, `docs/logh7-objtable-gate-re.md`, `docs/reference/legacy-evidence/logh7-032a-flagship-wire.md`. Acceptance: no `NO TABLE`, object rows are selectable, map remains interactive for 300 seconds. QA: screenshot/trace/result bundle.
- [ ] 13. Implement two-account world visibility and persistent movement state. References: `server/src/server/logh7-world-session.mjs`, `server/src/server/logh7-world-records.mjs`, `server/tests/logh7-world-session.test.mjs`, `tools/live/_m3_walkstate_drive.py`. Acceptance: account A moves; account B observes the same authoritative position after reconnect and restart. QA: two-client live run plus persistence test.
- [ ] 14. Correct M2 around stock-client `0x1008` creation, account-wide entry, deletion dead-end, and original-character charge. References: `docs/logh7-character-lifecycle-re.md`, `docs/logh7-m2-character-creation-flow.md`, `server/src/server/logh7-character-codec.mjs`, `server/src/server/logh7-character-store.mjs`. Acceptance: create/select/enter/charge paths match observed client; deletion is explicitly disabled or a reversible patch with evidence. QA: happy and invalid lifecycle tests plus live evidence.
- [ ] 14a. Re-run the completed M2 lifecycle from a freshly created `0x1008` character through the M3 join; distinguish diagnostic M3 repair using an existing character from authoritative M7 completion. Acceptance: the new character, not a preseed, reaches the world and passes the same unit/object/table/movement/two-account gates. QA: clean-account live bundle and lifecycle-to-world regression.
- [ ] 15. Promote only verified character/face/ship/faction/rank data and preserve unknown identity mappings as placeholders. References: `server/data/seed/*.json`, `server/content/roster/`, `docs/reference/legacy-evidence/logh7-official-roster-recovery.md`. Acceptance: no AI portrait similarity is canonical; seed manifest records field-level trust. QA: seed loader and schema tests.
- [ ] 16. Wire loaded world catalogs to concrete consumers and remove the false “not yet consumed” manifest claim. References: `server/src/infrastructure/persistence/WorldCatalog.mjs`, `server/src/application/`, `server/data/seed/seed-manifest.json`. Acceptance: systems, ships, fortresses, factions, ranks, abilities, characters, and deployments each have a query/command consumer or remain explicitly deferred. QA: consumer coverage test.

### Wave 3 - strategic systems

- [ ] 17. Complete strategic map transfer, markers, selection, grid/passability, planets, and special-body membership with provenance-aware records. References: `server/src/server/logh7-galaxy-placement.mjs`, `docs/logh7-strategic-map-placement-re.md`, `docs/reference/legacy-evidence/logh7-grid-0317-lever-2026-06-26.md`. Acceptance: canonical map is interactive, P3 overlays are opt-in, and all movement rejects impassable cells deterministically. QA: placement, negative movement, and live map bundle.
- [ ] 18. Implement the strategic movement/warp command and authoritative time/delay model. References: `docs/reference/legacy-evidence/logh7-moveship-wire.md`, `docs/reference/legacy-evidence/logh7-strategic-input-wire.md`, `docs/reference/legacy-evidence/logh7-strategic-output-fields.md`. Acceptance: command roundtrip, delay, cancel/reject, reconnect, and two-account observation pass. QA: codec fixtures, state tests, live movement.
- [ ] 19. Implement all 81 strategic commands with rank, duty, CP, faction, cooldown, and proposal permissions. References: `server/content/manual/commands*.json`, `server/content/manual/duties*.json`, `docs/reference/legacy-evidence/logh7-command-state-ledger-2026-06-30.md`. Acceptance: every command has a catalog row, validator, result, and denial case; unknown formulas remain noncanonical. QA: generated command matrix tests.
- [ ] 20. Implement fleets, ships, officers, bases, supply, production, reconnaissance, transport escort, and pirate operations as persistent authoritative jobs. References: `server/content/manual/operations*.json`, `server/content/manual/logistics*.json`, `docs/reference/legacy-evidence/logh7-content-recovery-economy-2026-06-29.md`. Acceptance: at least one end-to-end job changes persisted state and is visible to a second account. QA: job state-machine tests and live readback.
- [ ] 21. Implement proposals, internal affairs, elections/appointments, organization roles, and CP pooling with audit logs. References: `server/content/manual/organization*.json`, `docs/reference/legacy-evidence/logh7-planet-duty-survey-2026-06-24.md`, `docs/reference/legacy-evidence/logh7-proto-personnel-strategy.md`. Acceptance: authorized and unauthorized proposal paths are deterministic and replayable. QA: permission matrix tests.
- [ ] 22. Resolve and version the nine unresolved gameplay formulas; any unproven formula ships only in an extension profile. References: `server/content/manual/formulas*`, `docs/reference/legacy-evidence/logh7-proto-strategic-logistics.md`. Acceptance: each formula has source, implementation, golden vector, or explicit extension label. QA: golden-vector test suite.

### Wave 4 - tactics, battle, occupation

- [ ] 23. Build tactical session/pool creation and entry prerequisites before emitting movement or battle notifications. References: `docs/reference/legacy-evidence/logh7-tactics-field-impl-2026-06-26.md`, `docs/reference/legacy-evidence/logh7-state-transition-0f1f-push-2026-06-26.md`. Acceptance: a valid tactical pool exists and invalid early commands are rejected without crash. QA: state-machine and live entry probe.
- [ ] 24. Implement tactical formation, selection, movement, rotation, warp, range, order delay, and notification cadence. References: `docs/reference/legacy-evidence/logh7-tactical-movement-wire.md`, `server/content/manual/tactical-*.json`. Acceptance: one unit performs each action and both clients receive the same authoritative result. QA: codec/negative tests and live traces.
- [ ] 25. Implement attack/fire, beam/missile/fighter behavior, hit/damage, destruction, retreat, reissue, and result records. References: `docs/reference/legacy-evidence/logh7-proto-battle-core.md`, `docs/reference/legacy-evidence/logh7-proto-battle-fire.md`, TGS video artifact `https://www.4gamer.net/files/movies/Ginga.zip`. Acceptance: one bounded battle roundtrip persists damage/result and matches observed UI state categories. QA: deterministic combat vectors and live battle bundle.
- [ ] 26. Implement fortress, ground battle, occupation, coup, capital capture, and session-reset rules as versioned profiles. References: `server/content/manual/fortress*.json`, `docs/reference/legacy-evidence/logh7-proto-battle-fleetops.md`, contemporary design sources in `.omo/ulw-research/`. Acceptance: shipped/advertised/extension states are distinct; a capture/reset test is deterministic. QA: profile tests and controlled live scenario.
- [ ] 27. Add result/reward/merit/rank/stat/authority progression and original-character reuse/age rules with persistence. References: `docs/reference/legacy-evidence/logh7-canon-character-research.md`, `server/content/manual/rank*.json`. Acceptance: progression is source-backed and cannot cross faction/authorization boundaries. QA: progression and replay tests.
- [ ] 28. Restore tactical/battle opcode coverage and update the current dispatch catalog only with verified parsers/handlers. References: `docs/logh7-client-dispatch-catalog.md`, `docs/reference/legacy-evidence/logh7-proto-*`, `server/src/server/`. Acceptance: no battle code is counted as implemented solely by comments or registration. QA: per-code fixture matrix and one live battle run.

### Wave 5 - social, localization, assets, official profiles

- [ ] 29. Implement grid/global chat, mail, messenger, address book, roster/settings sync, required notices, board read/write, character identity, moderation, report handling, and notification routing. References: `docs/logh7-korean-chat-io-re.md`, `docs/reference/legacy-evidence/logh7-0f06-wire.md`, `docs/reference/legacy-evidence/logh7-proto-social-account.md`, `docs/logh7-requirements-current.md`. Acceptance: two accounts exchange chat/mail and use the community/report surfaces; malformed, unauthorized, and moderated content is rejected. QA: codec, persistence, moderation, and two-client live tests.
- [ ] 30. Complete CP932/CP949/UTF-16 boundaries, Korean input, fonts, hardcoded UI strings, and fallback rendering without changing canonical wire bytes. References: `docs/logh7-localization-font-current.md`, `docs/logh7-localization-re-groundwork.md`, `server/content/localization/`. Acceptance: Japanese and Korean login/lobby/world/chat strings render and roundtrip. QA: encoding corpus, screenshot, and live input test.
- [ ] 31. Index and serve original portraits, models, effects, UI resources, and fallback assets with rights/hash metadata. References: `docs/reference/logh7-remaster-asset-inventory.md`, `server/content/extracted/`, `server/content/generated/`. Acceptance: every runtime asset resolves from a declared source or displays a labeled placeholder; no source asset is overwritten. QA: asset index/hash and live render smoke test.
- [ ] 32. Reconstruct official 2004-2005 update/maintenance states and final-service preset from Wayback, patch, press, and manual evidence. References: `docs/reference/legacy-evidence/logh7-2004-official-patch-stack.md`, `https://web.archive.org/web/20050507031023id_/http://www.gineiden.com/`, `https://game.watch.impress.co.jp/docs/20050414/ginga.htm`. Acceptance: each changed behavior has a version/profile and provenance; dead payloads are not invented. QA: profile diff and upgrade/rollback tests.
- [ ] 33. Add reversible, hash-checked client patches only where the original UI/RE proves the feature is reachable and the user-facing requirement demands it. References: `tools/patch/exe-patch.mjs`, `docs/reference/legacy-evidence/logh7-exe-patch-status-2026-07-11.md`. Acceptance: patch is idempotent, reversible, backup-preserving, and never replaces the original binary. QA: patch fixture, rollback, and client hash gate.
- [ ] 34. Document the public evidence corpus, source rights, uncertainty, and contact boundaries; do not send external messages without a later explicit approval. References: `.omo/ulw-research/`, `docs/reference/legacy-evidence/`, corporate-public findings. Acceptance: every external claim has a link/hash/access date and no private data is stored. QA: citation/rights lint.

### Wave 6 - operations and release

- [ ] 35. Complete signup/account/auth/session security, authorization, rate limits, replay protection, and audit logging. References: `server/src/server/logh7-account-auth.mjs`, `server/tests/logh7-account-auth.test.mjs`, `docs/logh7-architecture-operations-current.md`. Acceptance: bad credentials, replay, cross-faction mutation, and malformed frames fail closed with redacted logs. QA: security test matrix.
- [ ] 36. Build launcher/update/package verification around immutable client manifests and the official patch chain. References: `docs/reference/legacy-evidence/logh7-launcher-re.md`, `tools/patch/`, `artifacts/official-patch-staging/`. Acceptance: clean install, update, rollback, and tampered-file rejection work without network trust shortcuts. QA: isolated package test.
- [ ] 37. Finish Docker Compose/service startup using PostgreSQL as the public-server persistence default, migrations, transactional account/character/economy writes, authoritative in-memory projections, tactical single-writer determinism, versioned snapshots/journal, backups, restore, health checks, metrics, and structured logs. References: `server/src/presentation/`, `server/src/infrastructure/persistence/`, `docs/logh7-architecture-operations-current.md`, `docs/logh7-work-plan-current.md`. Acceptance: cold start, restart, migration, replay, backup restore, and health probes preserve authoritative state; write semantics and migration versions are documented. QA: Compose smoke, crash/replay, and restore drill.
- [ ] 38. Add load/concurrency tests for the version-tagged 2,000-user research target with a smaller deterministic CI profile, plus disconnect/reconnect and server auto-restart behavior. References: `docs/reference/legacy-evidence/logh7-server-data-audit-2026-06-28.md`, contemporary server design sources. Acceptance: latency/error/memory/tick budgets are measured and labeled as targets, not assumed SLOs; no live-client claim is inferred from synthetic load. QA: load script, recovery scenario, and resource report.
- [ ] 39. Create the one-session end-to-end scenario: signup/login, create/select, world entry, map, movement, command, operation, tactical battle, result, chat/mail, restart, and re-entry. Acceptance: scenario runs from a clean environment with no manual PID/preseed/probe dependency and produces one complete evidence bundle. QA: exact scenario command plus fail-closed bundle validator.
- [ ] 40. Produce release documentation, operator runbook, data/feature status dashboard, rollback instructions, and a known-uncertainty register. Acceptance: docs match code/audits and a fresh operator can reproduce the supported path. QA: clean-clone/read-only dry run.

## Final verification wave

> Runs in parallel after ALL todos. ALL must APPROVE. Surface results and wait for the user's explicit okay before declaring complete.

- [ ] F1. Plan compliance audit: every todo has implementation, automated test, evidence bundle, and correct provenance/profile label; no out-of-scope Unity or unapproved contact.
- [ ] F2. Code quality review: diagnostics clean, `npm test` and targeted suites pass, no weakened/deleted tests, no stale active paths, no secrets/PII.
- [ ] F3. Real manual QA: use the original client through the supported path, including one bad input and the complete scenario; verify screenshots, state traces, 300-second survival, and clean restart.
- [ ] F4. Scope fidelity: independently compare shipped/live/official-patch/reconstructed-extension claims to source evidence and confirm P3 data and unsupported formulas are isolated.
- [ ] F4a. Scope fidelity: confirm required community surfaces are present and native/macOS/public-marketplace tracks remain deferred.
- [ ] F5. Security and normal-runtime gate: run `/cso`, launcher, Docker Compose, auth-abuse, replay, rate-limit, admin-separation, patch supply-chain, secret/PII redaction, backup/restore, and health-check scenarios. Diagnostic direct Node/EXE/Frida paths do not count.
- [ ] F6. Persistence/capacity gate: verify PostgreSQL migrations, transaction boundaries, snapshot/journal replay, tactical single-writer determinism, restore correctness, and measured target budgets under disconnect/restart/load.
- [ ] F7. Goal/docs/research sync gate: verify `.omc/ultragoal/goals.json`, document index, research ledger, completion matrix, audits, and operator runbook agree with code and evidence; no placeholder, `test.skip`, `test.only`, or stale-path escape remains.
- [ ] F8. Evidence integrity gate: independently validate every final bundle's client/server hashes, trace/screenshot/result linkage, redaction, provenance/profile labels, and failure exit status; reject ack-only, timeout, or inconclusive lanes.

## Commit strategy

- Commits are one logical todo or tightly coupled vertical slice, with implementation and tests together.
- Commit message format: `feat(logh7): <slice>`, `fix(logh7): <gate>`, `test(logh7): <fixture>`, `docs(logh7): <ledger>`.
- Never commit generated evidence blobs, downloaded copyrighted payloads, secrets, or unrelated user changes. Keep artifact paths/hashes and reproducible extraction commands instead.
- Before each commit: targeted tests, JSON/audit lint, `git diff --check`, and a status review that preserves pre-existing dirty work.

## Success criteria

- The original client completes the clean supported scenario against the authority server, including account-wide character entry, stable strategic map, movement, one tactical battle, result persistence, chat/mail, restart, and re-entry.
- Every promoted data family and opcode has source/provenance, server consumer, automated fixture/test, and real-client evidence at the claimed profile.
- The default seed contains only accepted canonical data; P3 overlays, unresolved formulas, and advertised-but-unshipped features are isolated and labeled.
- Official patch/update profiles, launcher, signup, Compose deployment, security, backup/restore, metrics, load, and rollback are reproducible.
- All final verification lanes approve, the user gives explicit completion approval, and the final handoff links to the plan, evidence index, operator runbook, and known-uncertainty register.
