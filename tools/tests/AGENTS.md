<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# tools/tests

## Purpose
Stdlib `unittest` regression suite (~50 `test_logh7_*.py` files) for the LOGH VII reverse-engineering and server tooling under `tools/`. The tests validate three concerns: (1) static-analysis indexers that parse the real Win32 client `G7MTClient.exe` and assert exact virtual addresses, transport/internal message codes, and struct layouts; (2) binary patchers that emit instrumented EXEs (guarded log patches and in-memory ring probes) and assert the `.text` section is made writable; (3) the child-codec block cipher, phase1/2/3 payload framing, packet-trace analysis, MsgDat/ISO localization extraction, and the packaging pipeline subcommands. Binary-dependent tests read `REPO_ROOT/.omo/work/logh7-installed/exe/G7MTClient.exe` and hard-code addresses, so they fail (error, not skip) if that binary is missing or tool output drifts.

## Key Files
| File | Description |
|------|-------------|
| test_logh7_pipeline.py | Core shared harness: defines `REPO_ROOT`, `TOOL` (tools/logh7_pipeline.py) and ISO fixture helpers (`_fixture_iso`, `_directory_record`, `_write_sector`) reused suite-wide; tests localization manifest, missing-ISO rejection, discover-server, and package-installed zip+hash. |
| test_logh7_cipher.py | Validates the child-codec Feistel cipher (logh7_child_codec + logh7_cipher): static tables, round/key-schedule vs disassembly, live phase1 replay, Phase1/2/3 build+parse with checksums, rejects bad checksum/truncated/unaligned input. |
| test_logh7_client_protocol.py | Runs pipeline against a synthetic null-separated G7MTClient.exe; asserts indexed literals (ginei00, port 47900, IP 202.8.80.179) and message symbols (LobbyLoginRequest/OK/NG) into client-protocol.json. |
| test_logh7_command_ok_layout.py | `build_command_ok_layout`: trigger string + decoded-body entries for transports 0x0031 (1052 bytes, stream VAs 0x00492930/0x0049a680), 0x0032, 0x0033, plus pipeline CLI variant. |
| test_logh7_command_ok_response_candidates.py | `build_command_ok_response_candidates` with PHASE1_KEY 32f5...97e8; zero-count and one-entry frames for 0x0031/0x0032/0x0033, decoded lengths {1052,276,1052} declared +6, cross-checked vs key schedule. |
| test_logh7_decoded_dispatch_entry_patch.py | `python -m tools.logh7_decoded_dispatch_entry_patch` emits decoded-dispatch entry ring-probe EXE+manifest; asserts .text writable at offset 0x244. |
| test_logh7_decoded_response_dispatch_patch.py | `python -m tools.logh7_decoded_response_dispatch_patch` emits decoded-response-dispatch ring-probe EXE+manifest; asserts .text writable (0x244). |
| test_logh7_entity_lookup.py | `build_entity_lookup_index`: lookup VA 0x004c7cd0, activationRoot client+0x126718, commandOkSelector 1, per-selector pool descriptors (activeFlagField record+0x00, keyField record+0x04). Plus CLI writer. |
| test_logh7_entity_pool_prerequisites.py | `build_entity_pool_prerequisite_index`: activationRoot client+0x126718, world-init (ResponseWorldInitialize 0x0f01, handler 0x004bd0c9, stateWrite client+0x35f356) plus unit prereqs. CLI writer. |
| test_logh7_extraction.py | Pipeline `extract-root` on fixture ISO; verifies ISO files+manifest written for InstallShield payload and CP932 Japanese directory-entry filenames preserved. Bare-imports helpers from test_logh7_pipeline. |
| test_logh7_inbound_response_dispatch.py | `build_inbound_response_dispatch_index`: entry/tail/unhandled VAs (0x004ba316/0x004bdd33/0x004bdcee), routes 0x0200 (handler 0x004ba347), 0x0205, 0x0400 (0x004bb5d9), 0x0f01 range-compare. CLI writer. |
| test_logh7_installed_tree.py | Pipeline `build-installed`: fixture install root (update.ini VERSION=131, Gin7UpdateClient.exe) + ISO root; asserts detected root and ISO launcher copied with manifest. Bare-imports REPO_ROOT/TOOL. |
| test_logh7_internal_handlers.py | Synthetic 24-section PE; asserts pipeline indexes post-handshake internal-handler evidence. Reuses section constants and `_fixture`/`_write` helpers from test_logh7_transport_dispatch. |
| test_logh7_launcher_update_flow.py | Runs logh7_launcher_update_flow.py CLI over a synthetic Gin7UpdateClient.exe PE fixture (KERNEL32 IAT: GetPrivateProfileStringA/WritePrivateProfileStringA/CreateProcessA/MoveFileA); asserts serverIniOverride (SERVER_ADDRESS/SERVER_PORT keys, hardcoded default 202.8.80.179), processLaunch of .\exe\G7MTClient.exe, updateFileReplacement (Gin7UpdateClient.new), plus missing-directory summary. (untracked) |
| test_logh7_launcher_update_index.py | Targets logh7_launcher_update_index.py with own `_fixture_pe` builder; asserts indexing of launcher/update-server endpoints and replacement markers. |
| test_logh7_live_entity_scan.py | Pure unit (no binary) for logh7_live_entity_scan: 12-byte transport-queue entries (codes 0x0200/0x0201/0x0205/0x0206 + pointer), selector-1 record keys, selector1 scan result with activation flags. |
| test_logh7_message_family_maps.py | Synthetic PE (IMAGE_BASE 0x400000, SECTION_RVA 0x40000) with mov-eax-ret stubs; asserts pipeline indexes static message-family lookup objects. (untracked) |
| test_logh7_msgdat.py | Pipeline `msgdat-index` over fixture MsgDat dir: magic tokens HFWR/GFWR, CP932 decoding, template placeholders ($r10$, $xcommand$, $xdate$); rejects malformed magic. |
| test_logh7_packet_trace.py | Pipeline `gameplay-trace-analyze` over JSONL traces: classifies wire frames (login 0x0034, phase3 candidate 0x0035, post-phase3 0x0036, post-handshake 0x0030); reports command-OK (0x0031 frame 0422...) and probes 'without followup'. (modified) |
| test_logh7_pe_inventory.py | Fixture PE files; asserts pipeline indexes EXE/DLL files for reverse-engineering triage. (untracked) |
| test_logh7_phase3_recv_parser.py | `build_phase3_recv_parser_index`: recv callsite VA 0x00645992/return 0x00645998, store return-1 to phase-object+0x20, decode helper 0x00648d42, g071 offsets, transport-build register map (htons). CLI test. |
| test_logh7_phase3_sink_patch.py | `python -m tools.logh7_phase3_sink_patch` emits phase3 parser-sink ring-probe EXE+manifest; asserts .text writable (0x244). |
| test_logh7_post_0030_followups.py | `build_post_0030_followup_effects`: maps transport 0x0031->internal 0x0400 (CommandMoveShip OK), followup VA 0x004be8f0, activationGate client+0x126718, entity-lookup call 0x004c7cd0. CLI test. |
| test_logh7_post_0030_payload_layout.py | `build_post_0030_payload_layout`: transport 0x0031/internal 0x0400 -> handler 0x004bb5d9, decoded body source ebx, length/status at body+0x08 dword. CLI test. |
| test_logh7_post_handshake_body.py | `decode_post_handshake_0030_frame` with phase1 key; GUID transport key {A4C13748-...}, observed G013/G015 frames, expected DECODED_0030 plaintext; asserts decode correctness + stability + CLI decode. |
| test_logh7_post_handshake_responses.py | `build_post_handshake_response_candidates`: candidate transport 0x0031/internal 0x0400, transport target 0x004b7dde, handler 0x004bb5d9, state gate = cipher-enabled flag at client+0x35837e. CLI test. |
| test_logh7_real_client_probe.py | Unit tests with injected FakeWin32Gui/FakeWin32Api for logh7_real_client_probe/_world_init_probe/_process_memory/_window_login: login when SetForegroundWindow denied, dynamic probe manifests, `_wait_for_trace` raises on missing command-OK. |
| test_logh7_runtime_keylog_patch.py | Pipeline `runtime-keylog-patch` family: guarded key-store/setup/read patches, child-encode trace patches, queue-append/entry trace patches; reads back KLG2/CLG2 ring records. Own REPO_ROOT/TOOL/CLIENT_EXE; checks 0x244. |
| test_logh7_runtime_manager.py | `build_runtime_manager_index`: manager global VA 0x007c25f4, constructor store 0x004ad94f, allocation call 0x00612570 size 0x7530, post-register 0x004adeb0, destructor 0x004adb09/0x004adaa0/0x004adac0. Writer test. |
| test_logh7_runtime_manager_dispatcher_node_patch.py | Pipeline `runtime-manager-dispatcher-node-log-patch` emits guarded patch EXE+manifest; asserts .text writable (0x244). |
| test_logh7_runtime_manager_dispatcher_patch.py | Pipeline `runtime-manager-dispatcher-log-patch` emits guarded patch EXE+manifest; asserts .text writable (0x244). |
| test_logh7_runtime_manager_member_slot_effect_patch.py | Pipeline `runtime-manager-member-slot-effect-log-patch` emits guarded patch EXE+manifest; asserts .text writable (0x244). |
| test_logh7_runtime_manager_member_slot_patch.py | Pipeline `runtime-manager-member-slot-log-patch` emits guarded patch EXE+manifest; asserts .text writable (0x244). |
| test_logh7_runtime_manager_member_slot_tail_patch.py | Pipeline `runtime-manager-member-slot-tail-log-patch` emits guarded patch EXE+manifest; asserts .text writable (0x244). |
| test_logh7_runtime_manager_nested_callback_patch.py | Pipeline `runtime-manager-nested-callback-log-patch` emits guarded patch EXE+manifest; asserts .text writable (0x244). |
| test_logh7_runtime_manager_patch.py | Pipeline `runtime-manager-log-patch` family: five tests emitting store/clear/destructor/cleanup/callback log patch EXEs+manifests; each asserts .text writable (0x244). |
| test_logh7_runtime_manager_state_patch.py | Pipeline `runtime-manager-state-log-patch` emits guarded patch EXE+manifest; asserts .text writable (0x244). |
| test_logh7_runtime_manager_state_trigger_patch.py | Pipeline `runtime-manager-state-trigger-log-patch` emits guarded patch EXE+manifest; asserts .text writable (0x244). |
| test_logh7_runtime_patch_targets.py | `extract_runtime_patch_targets`: asserts exact named-target set {keySetupWrapper, keyStoreHelper, keyReadHelper, childCodecEncode, phase1ChildEncodePostCall, phase3CompareCallsite, runtimeManagerGlobalStore/Clear, ...}. Writer test. |
| test_logh7_session_bootstrap.py | Synthetic client with session handlers + transport-queue-append stub (INTERNAL_TABLE_VA 0x004BDE7C, TRANSPORT_QUEUE_APPEND_VA 0x004B852B); asserts session-bootstrap transports + internal handlers. Bare-imports from transport_dispatch. |
| test_logh7_session_bootstrap_gate_patch.py | `python -m tools.logh7_session_bootstrap_gate_patch` emits session-bootstrap manager-gate ring-probe EXE+manifest; asserts .text writable (0x244). |
| test_logh7_socket_boundary.py | `build_socket_boundary_index`: WinSock IAT imports/ordinals (recv 14 @0x0066b6b0, recvfrom 15, send 19, connect 4), direct recv callsites incl. 0x006454d1 (phase2) and 0x00645992 (phase3). CLI writer. |
| test_logh7_socket_recv_all_patch.py | Pipeline `runtime-socket-recv-all-log-patch`: one wrapper over all six recv callsites (offsets 0x211AA5/0x211BA5/0x211BF6/0x2454D1/0x245992/0x245E2B); asserts .text writable (0x244). |
| test_logh7_socket_recv_patch.py | Pipeline `runtime-socket-recv-log-patch` emits guarded phase recv log patch EXE+manifest; asserts .text writable (0x244). |
| test_logh7_socket_recv_phase_ring_patch.py | Pipeline `runtime-socket-recv-phase-ring-log-patch` emits in-memory ring probe for phase recv calls; asserts .text writable (0x244). |
| test_logh7_socket_recv_phase3_ring_patch.py | Pipeline `runtime-socket-recv-phase3-ring-log-patch` emits single-site phase3 pre/post ring probe; asserts .text writable (0x244). |
| test_logh7_socket_recv_ring_patch.py | Pipeline `runtime-socket-recv-ring-log-patch` emits ring probe across all six recv callsites (same RECV_CALLSITE_OFFSETS); asserts .text writable (0x244). |
| test_logh7_socket_recv_window_patch.py | Pipeline `runtime-socket-recv-window-log-patch` emits guarded phase3 recv-window patch EXE+manifest; asserts .text writable (0x244). |
| test_logh7_transport_dispatch.py | Shared synthetic-PE harness: defines IMAGE_BASE/SECTION_RVA(0xB0000)/SECTION_SIZE, JUMP_TABLE_VA 0x004B864C, `_fixture_client`/`_handler_bytes`/`_va_offset`/`_write_u16`/`_write_u32` reused by internal_handlers + session_bootstrap. |
| test_logh7_transport_dispatch_entry_patch.py | `python -m tools.logh7_transport_dispatch_entry_patch` emits transport-dispatch-entry ring-probe EXE+manifest; asserts .text writable (0x244). |

## For AI Agents
### Working In This Directory
- These run under stdlib `unittest`, NOT pytest. There are no pytest fixtures/markers; every file is a `unittest.TestCase` subclass named `Logh7*Tests` with `test_*` methods.
- Two divergent import styles for shared helpers coexist and both must keep resolving: most files use package-qualified `from tools.tests.test_logh7_pipeline import REPO_ROOT, TOOL`, but several (extraction, installed_tree, internal_handlers, transport_dispatch, session_bootstrap, post_handshake_body/responses) use bare `from test_logh7_pipeline import ...`. Both rely on running from the repo root via `unittest discover` — switching one style breaks collection.
- Do NOT rename or change the shared helpers/constants in `test_logh7_pipeline.py` (`REPO_ROOT`, `TOOL`, `_fixture_iso`) or `test_logh7_transport_dispatch.py` (`_fixture_client`, `_va_offset`, `_write_u16`/`_write_u32`, `IMAGE_BASE`, `SECTION_RVA`/`RAW`/`SIZE`) — multiple modules import them and breakage cascades.
- Binary-dependent tests need `REPO_ROOT/.omo/work/logh7-installed/exe/G7MTClient.exe` present (note `.omo`, distinct from the `.omc` dir in git status). Without it they error rather than skip.

### Testing Requirements
- Test command: `npm run test:tools` (equivalently `node tools/run_python_tests.mjs`, which runs `python -m unittest discover -s tools/tests` with Python 3.11+ from the repo root). Do not assume pytest collection.
- Run from the repo root so both bare and package-qualified imports resolve.
- Every patch test asserts `TEXT_SECTION_CHARACTERISTICS_OFFSET = 0x244` (the patched `.text` section is made writable). Patch tests invoke tools either as pipeline subcommands (`sys.executable TOOL <sub>`) or as modules (`sys.executable -m tools.<module>`), writing the patched EXE + JSON manifest into a `TemporaryDirectory`.

### Common Patterns
- Many assertions hard-code exact virtual addresses (e.g. 0x004ba316, 0x00645992, 0x007c25f4), transport/internal codes (0x0030/0x0031/0x0032/0x0033/0x0400/0x0f01/0x0200), and decoded-body sizes (1052/276). If you intentionally change a tool's output, every affected literal must be updated in lockstep.
- The six direct recv callsite offsets (0x211AA5, 0x211BA5, 0x211BF6, 0x2454D1, 0x245992, 0x245E2B) and the 0x244 `.text`-characteristics offset recur across many socket/patch tests — keep them consistent if changed.
- `test_logh7_cipher.py` and `test_logh7_post_handshake_body.py` embed concrete crypto vectors (PHASE1 key 32f5...97e8, GUID transport key {A4C13748-...}, G013/G015 frames, DECODED_0030 plaintext) that encode proven child-codec behavior — do not casually edit.
- Pure-logic modules (`live_entity_scan`, `real_client_probe`) are tested in isolation with hand-built byte buffers or injected `Fake*` substitutes, no real binary needed. Other fixtures are synthesized byte-by-byte via `_write_u16`/`_write_u32`/`_va_offset` and module-level `IMAGE_BASE`/`SECTION_RVA`/`SECTION_RAW`/`SECTION_SIZE` constants.

## Dependencies
### Internal
- tools/logh7_pipeline.py — the primary CLI exercised by most tests.
- tools/run_python_tests.mjs — the test runner invoked by `package.json` `test:tools`.
- tools/logh7_child_codec.py, tools/logh7_cipher.py — cipher under test.
- tools/logh7_command_ok_layout.py, logh7_command_ok_response_candidates.py, logh7_entity_lookup.py, logh7_entity_pool_prerequisites.py, logh7_live_entity_scan.py, logh7_inbound_response_dispatch.py, logh7_phase3_recv_parser.py, logh7_post_0030_followups.py, logh7_post_0030_payload_layout.py, logh7_post_handshake_body.py, logh7_post_handshake_responses.py, logh7_runtime_manager.py, logh7_runtime_patch_targets.py, logh7_socket_boundary.py, logh7_launcher_update_index.py, logh7_message_family_maps.py — indexers/builders under test.
- Patch modules: logh7_transport_dispatch_entry_patch.py, logh7_decoded_dispatch_entry_patch.py, logh7_decoded_response_dispatch_patch.py, logh7_phase3_sink_patch.py, logh7_session_bootstrap_gate_patch.py.
- Probe modules: logh7_real_client_probe.py, logh7_real_client_world_init_probe.py, logh7_process_memory.py, logh7_window_login.py.
- Real client binary at `.omo/work/logh7-installed/exe/G7MTClient.exe`.
- Shared test helpers: tools/tests/test_logh7_pipeline.py and tools/tests/test_logh7_transport_dispatch.py.

### External
- Python 3.11+ standard library only (unittest, subprocess, json, tempfile, pathlib, zipfile) — no third-party pytest/test deps.
- Node.js — used solely as the launcher (tools/run_python_tests.mjs / npm scripts) that locates a supported Python and invokes unittest discovery.
- pywin32 (win32gui/win32api) is referenced conceptually by tools.logh7_real_client_probe, but tests inject `Fake*` substitutes, so it is not an actual test-time dependency.

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
