<!-- This card is injected every turn. Refresh when roadmap, known-issues, or task.md changes. -->
# LOGH VII Key Facts (NIAH)

## Latest completed contract
- Codex harness parity is DONE locally (2026-07-17): native hooks, eight workflow skills, and project-scoped skills.sh acquisition.
- Codex SessionStart runs a network-free project skill check on every open.
- If no local skill fits, use `logh7-skill-manager`: search, vet source/content/scripts/permissions, then install with `--reviewed` only to `.agents/skills/`. Never use `-g`.
- Fresh local gate: Codex regression 26/26, skill validators 8/8, skills CLI project discovery, and strict Codex config all passed.
- Live hook activation is still unverified until the user trusts the project hash with `/hooks` and starts a new task.
- Preserve concurrent edits in `CLAUDE.md` and `.codex/config.toml`; push, PR, and merge require approval.

## P0 gate
- Next P0 gate: M4-OBS-001 (47900 to 47901 proxy correlation slice).
- Wine is blocked by `runtime_support_manifest_missing` (exit 2, `fullPassEligible=false`); do not launch before restoring the V1 manifest and sentinels.
- E2E slice SRV-CORR is complete in PR #8 (`3fd847b1`); it covers server correlation records, not the Wine live gate.

## Invariants
- Server port: 47900.
- Never launch, attach, or patch when EXE hash, image base, or sentinels mismatch. Fail-closed is expected.
- After the 2026-07-05 reset, commit `5bd249c` is reference-only; do not revive old code.
- Do not convert CP932 assets to UTF-8 arbitrarily.
- Do not transplant code from reference repositories.

## Verification
- Never claim live behavior without fresh command output, exit codes, screenshots, or equivalent evidence.
- Historical counts such as 460 server tests are baselines, not fresh gates.
- Server test command: `cd server && npm test`.
- Secrets stay user-managed and must not be read or printed.
