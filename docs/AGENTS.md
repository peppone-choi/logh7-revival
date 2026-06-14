<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# docs

## Purpose
Seven Korean-language working documents coordinating the reverse-engineering and revival of the 1990s BOTHTEC game "Legend of the Galactic Heroes VII" (銀河英雄伝説VII). They split labor across environments — Windows PC runs/observes the original client (G7Start.exe, G7MTClient.exe, Gin7UpdateClient.exe), a macOS-embedded Linux box handles InstallShield extraction and server reimplementation, and AWS Docker is the only permitted long-running server. The docs define role splits and prohibitions, the Windows analysis toolchain, the localization pipeline (CD -> ISO -> InstallShield CAB -> installed tree -> Korean overlay -> distributable zip), Codex handoff/resume prompts, and — in the 96 KB logh7-server-setup.md — the live ledger of static RE findings about G7MTClient.exe's network protocol, cipher handshake, and message-family tables. Embedded constants (IP 202.8.80.179, ports 47900/47902/4787, message codes, virtual addresses, PE offsets) are captured evidence, not configuration, and must not be altered casually.

## Key Files
| File | Description |
|------|-------------|
| client-server-work-rules.md | OS role split (Windows = client observation, Linux = extraction/static analysis/server impl, AWS Docker = long-run), handoff artifacts, prohibitions (no guessed protocol, no "it connects" claims without packet capture), 5 completion criteria. |
| ios-extraction-request.md | Work order for the iOS worker: 10-step pipeline from artifacts/logh7-cd inputs to an image-free distribution zip; forbids shipping CD/ISO/BIN/CUE or requiring git lfs pull from end users. |
| logh7-localization-pipeline.md | Canonical pipeline doc: confirmed CD structure (volume id GINEIDEN7, CP932 setup.ini, language 0x0011, InstallShield non-MSCF CABs), exact tools/logh7_pipeline.py command chain, .omo/work artifact layout; lines 151-152 are a dense protocol/cipher CLI catalog. |
| logh7-server-setup.md | 96 KB running RE ledger: client defaults (ginei00 / 47900 / 202.8.80.179), local Node resource server (127.0.0.1:4787), cipher handshake phases 1-3 VAs (0x645180/0x6452f0/0x645660), child-codec P-array 0x007b6ae4 / S-box 0x007b6ba8 / xor 0x91, message-family maps (0x0200/0x0400/0x0f00), and chronological G004-G081 findings. |
| windows-client-tools.md | Reference table of the Windows-only toolchain: Process Monitor/Explorer, Regshot, Dependencies, Resource Hacker, DIE, HxD, x64dbg/WinDbg, Wireshark+Npcap, TCPView, unshield/UniExtract2/i6comp, Locale Emulator for CP932 + 0x0011. |
| windows-codex-handoff.md | Codex resume doc: clone/lfs/npm bootstrap, build/test and package-installed commands, verbatim Korean auto-resume prompt, 2026-06-10 OMO Loop Handoff (static-RE-first pivot, uncommitted tool list, next target tools/logh7_launcher_update_index.py). |
| windows-next-steps.md | 7-step Windows checklist: pull/build/test, ISO inspect manifest, extract-root + unshield + build-installed, package-installed zip, real run via setup-local.ps1 (HKCU\Software\BOTHTEC\銀河英雄伝説VII\1.0) and launch-client.ps1; notes 0x0034 = login request, 0x0035 = response candidate only. |

## For AI Agents
### Working In This Directory
- Never alter embedded hex constants (IPs 202.8.80.179 / 127.0.0.1, ports 47900/47902/4787, message codes 0x0034/0x0035/0x0030/0x0200/0x0400/0x0f00, VAs, PE file offsets, P-array VA 0x007b6ae4, S-box 0x007b6ba8, xor mask 0x91, byte signatures). They are RE evidence keyed to specific G7MTClient.exe bytes; editing them silently corrupts the record.
- logh7-server-setup.md G004-G081 entries are append-only chronological logs, each citing a tool, VA/file-offset, RED/GREEN test, and a matching .omo/ulw-loop/evidence/*.json artifact. Append new G### entries; never rewrite or reorder existing ones. Same for logh7-localization-pipeline.md lines 151-152 (dense single-line CLI catalog).
- 0x0034 is the client login request; 0x0035 is only a server-response *candidate* that has NOT achieved login. Never edit text to imply login succeeds or that a fabricated login/session/world response is a default — the server is deliberately record-only / capture-stub.
- artifacts/logh7-cd/ originals (Logh7.bin, Logh7_mode2_2048.iso, Logh7.cue) are never modified, never committed extracted, never shipped. package-installed is contractually required to FAIL if .bin/.cue/.iso appear in the dist tree — do not document relaxing that guard.
- Preserve CJK literals exactly (HKCU\Software\BOTHTEC\銀河英雄伝説VII\1.0, ボーステック株式会社) — they are CP932/registry-path sensitive. setup.ini language key is 0x0011; localization must verify byte length/terminators/pointer tables before write-back (no blind translation writes).
- Docs are Korean prose with English/hex technical tokens; status markers like "static-evidence-only", "unresolved", "do not promote to default server response" carry meaning — keep them.
- The file is windows-client-tools.md — there is NO "logh7-windows-client-tools.md".

### Testing Requirements
- Full suite: `npm test` (Python 122 tests + Node server 25 tests + Playwright 5 tests; needs `npx playwright install` first).
- Subsets: `npm run test:tools`, `npm run test:server`, or `python -m unittest tools.tests.test_logh7_message_family_maps tools.tests.test_logh7_pe_inventory tools.tests.test_logh7_packet_trace`.
- Doc edits that touch CLI surfaces (pipeline subcommands, probe flags) must stay in sync with tools/logh7_pipeline.py — verify the subcommand exists before documenting it.

### Common Patterns
- All pipeline commands route through `python tools/logh7_pipeline.py <subcommand>` (convert -> inspect -> extract-root -> unshield -> build-installed -> package-installed) writing to gitignored .omo/work/ and .omo/ulw-loop/evidence/.
- Findings pair a doc claim with a specific .omo/ulw-loop/evidence/*.json filename; keep that pairing intact when appending.
- Command examples assume PowerShell on Windows; extraction and long-running server work belong on Linux/AWS Docker per client-server-work-rules.md.

## Dependencies
### Internal
- tools/logh7_pipeline.py — CLI hub (inspect, extract-root, build-installed, package-installed, discover-server, client-protocol-index, gameplay-trace-analyze, msgdat-index, message-family-index, pe-inventory, runtime-*-patch).
- tools/convert_mode2_bin_to_iso.py — MODE2/2352 BIN -> 2048-byte ISO.
- tools/logh7_message_family_maps.py, tools/logh7_pe_inventory.py — G080/G081 tools referenced in the handoff doc.
- tools/logh7_packet_trace.py — 0x0013/0x0014 world/grid trace classification.
- tools/logh7_world_init_probe_server.mjs, tools/logh7_real_client_world_init_probe.py — real-client runtime probes.
- artifacts/logh7-cd/ — Git LFS baseline CD inputs (read-only).
- .omo/work/ and .omo/ulw-loop/evidence/ — gitignored work dirs and G### evidence JSON/traces.
- src/, index.html, package.json (Vite/React surface); tests/ (Playwright); npm scripts server:logh7, server:gameplay, server:health, test:tools, test:server.

### External
- unshield — InstallShield CAB extraction (7-Zip cannot open data1/data2.cab; `scoop install unshield` on Windows).
- Node.js LTS + npm; Python 3.11+; Playwright; Git + Git LFS (for artifacts/logh7-cd).
- Windows toolchain (referenced, not code deps): DirectX End-User Runtime, VC++ redist, Locale Emulator, Process Monitor/Explorer, Wireshark+Npcap, TCPView, Dependencies, Resource Hacker, Detect It Easy, HxD, x64dbg/WinDbg, UniExtract2, i6comp/i5comp.
- AWS — Docker host for the only sanctioned long-running server.

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
