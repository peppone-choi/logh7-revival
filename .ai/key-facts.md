<!-- This card is injected every turn. Refresh when roadmap, known-issues, or task.md changes. -->
# LOGH VII Key Facts (NIAH)

## Latest completed contract
- Platform-aware legacy client live QA is DONE locally (2026-07-17): native Windows does not require or launch Wine; macOS/Linux keep the isolated Wine gate; unsupported hosts block; Codex and Claude share canonical live-QA and orchestrator contracts.

## Prior completed harness context
- Codex harness parity is DONE locally (2026-07-17): native hooks, eight workflow skills, and project-scoped skills.sh acquisition.
- Codex SessionStart runs a network-free project skill check on every open.
- If no local skill fits, use `logh7-skill-manager`: search, vet source/content/scripts/permissions, then install with `--reviewed` only to `.agents/skills/`. Never use `-g`.
- Fresh local gate: Codex regression 26/26, skill validators 8/8, skills CLI project discovery, and strict Codex config all passed.
- Live hook activation is still unverified until the user trusts the project hash with `/hooks` and starts a new task.
- Preserve the user-owned `.codex/config.toml` edit. Commit, push, PR, merge, and this Wine GUI run are approved only for the current platform-aware live-QA contract.

## Live QA gate
- 2026-07-17 macOS Wine Stable 11 requires explicit `--prefix-mode wow64`; `#arch=win64` is the WoW64 prefix format and the PE32 client remains 32-bit.
- Fresh evidence confirmed server 47900 ready, a real client process, and the `0x0034/0035/0036/0030` login flow. It ended in `invalid-credentials`/login-ng, client exit 3, and a user-observed runtime error.
- The runtime-support manifest was recovered for this run. Do not reuse the old `runtime_support_manifest_missing` blocker.
- Registry restoration was observed. The first drive release receipt was false; exact auto-mapping restoration and exception cleanup are unit-tested but still need a fresh live cleanup receipt.
- Native Windows remains simulation-only and Linux is unrun. Do not claim a cross-platform full pass.
- Next P0 gate: diagnose the post-login failure, close cleanup live evidence, then resume M4-OBS-001 (47900 to 47901 proxy correlation slice).
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
- Local `basedpyright` and `yaml-ls` are not installed; PostToolUse LSP failures are an isolated tooling baseline for this task. Use fresh `py_compile`/`unittest`, YAML parsing, and skill validation instead.
- Server test command: `cd server && npm test`.
- Secrets stay user-managed and must not be read or printed.
