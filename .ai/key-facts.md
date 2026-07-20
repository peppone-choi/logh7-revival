<!-- This card is injected every turn. Refresh when roadmap, known-issues, or task.md changes. -->
# LOGH VII Key Facts (NIAH)

## Active contract
- GitHub #216 / Jira LOGH7-213 master design merged at `ec6d9b52`; A01 #217 / LOGH7-214 merged at `43ee007a` (2026-07-20).
- **Wave-1 A02/A04/A06/A09/A13 implemented+verified** (2026-07-21): branch `peppone-choi/wave1-axes`, single PR ready, merge NOT approved. Tests: A02 21/21, A04 7/7, A06 13/13, A09 4/4, A13 7/7, A01 regression 9/9 all pass. After merge: A03/A05 eligible.
- Master design: `docs/logh7-causal-ledger-master-design.md` (`APPROVED-MERGED`). A01 machine contract: `tools/causal-ledger/schema.json` v`1.0.0`. All axes follow shared bootstrap pattern (importSources→append→coverage-attach→validateLedger).
- Current baseline: `origin/main@43ee007a`; Wave-1 PR awaits merge authorization.
- Preserve user-owned `.codex/config.toml`: never read, modify, stage, or reset it.

## Design invariants
- Close the real chain: input → client state → request → server authority/state → response/push → client state → pixels/audio → next input.
- Every claim is a versioned Node/Edge/Evidence record; `Unknown` and `Blocked` are explicit states, never silently canonical.
- Every queue, buffer, cache, retry, correlation map, and session table is bounded with owner, pressure policy, shutdown drain, OOM behavior, metrics, and tests.
- Server is authoritative; rejected commands commit no domain state or outbox event.
- Rights and technical provenance are independent. Distribution is fail-closed; P3/reference-derived material never becomes canonical without approval.
- Legacy client is untrusted. Lineage hash, image base, sentinel, payload bounds, replay/rate limits, redaction, and recovery evidence are required.

## Current evidence and blockers
- Existing MoveGrid covers server decrypt/parse → authority → SQLite UoW → 0x0b07 broadcast, but lacks same-correlation real input and final pixels/audio/next-input proof.
- Fleet marker/selection blocks 0x032f and Warp live reachability; actual planet render remains unproven.
- Static data promotion, clock/RNG/replay, bounded-resource enforcement, restore evidence, and rights classification remain open.
- Historical P0→P1→P2→M4 evidence remains input to the ledger, not a fresh completion gate.

## Tracker corrections after design merge
- Correct LOGH7-213 ↔ LOGH7-85 dependency direction.
- Make A01 precede all 15 axes, not only A02~A09.
- Make A10 consume A01~A09 and A11~A15.
- Add structured dependency links and owners; do not infer completion from comments or status alone.

## Live and repository safety
- Server port: 47900. Native Windows runs verified EXE directly; macOS/Linux use isolated explicit Wine runtime.
- Never launch, attach, or patch when EXE hash, image base, or sentinels mismatch.
- Never claim live behavior without fresh commands, exit codes, screenshots/audio or equivalent evidence, and cleanup receipts.
- Never read secrets, delete `server/data/`, or transplant code from `reference/`.
