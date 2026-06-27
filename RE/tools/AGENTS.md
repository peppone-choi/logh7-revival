<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# tools

## Purpose
Python 3.11+ and Node toolkit for reverse-engineering the LOGH VII Windows client (`G7MTClient.exe`, PE image base `0x00400000`) and its TCP protocol, then extracting and repackaging the game from its CD image. The protocol/extraction half handles ISO9660/MsgDat asset extraction, the Blowfish-style "child codec" cipher and transport framing, capstone-based static disassembly that recovers the protocol state machine (transport-code dispatch, internal-code switch tables, response handlers, entity pools, message families, socket/recv boundaries), live-client probing via ctypes/pywin32, and the orchestration CLI. The runtime-patch half installs x86 (32-bit) detour/trampoline patches at known virtual addresses so the running client writes its own telemetry `.bin` records (child-codec key flow, the C++ runtime-manager object lifecycle, transport/dispatch path, and the WinSock `recv` boundary), plus the decoders that parse those records back to JSON. The recurring goal is to drive a real or stub server through the handshake phases (transport `0x0034` phase1, `0x0035` phase3, `0x0030` post-handshake, `0x0036`) into world/grid init, emitting JSON evidence artifacts at each step.

## Key Files

### Protocol / extraction / probing tools
| File | Description |
|------|-------------|
| convert_mode2_bin_to_iso.py | argparse CLI stripping Mode2/2352-byte raw CD sectors to ISO9660 2048-byte payloads (SECTOR_SIZE=2352, PAYLOAD_OFFSET=24), erroring on partial sectors. |
| logh7_iso.py | Core ISO9660 reader (PVD @sector 16, root @offset 156, cp932 names); IsoEntry/IsoImage and the PipelineError/MissingSourceError/InvalidIsoError hierarchy reused project-wide. |
| logh7_extractor.py | Extracts the ISO9660 root tree to disk with a sha256 manifest, rejecting absolute/`..` entries (UnsafeIsoPathError); builds on logh7_iso. |
| logh7_installed_tree.py | Builds the canonical installed game tree with sha256, requires INSTALL_ROOT_MARKERS, records the legacy `202.8.80.179` -> `127.0.0.1` redirect patch, emits Windows runtime files. |
| logh7_launcher_update_index.py | Scans launcher/update binaries (G7Start.exe role launcher, Gin7UpdateClient.exe role update-client, BootFirst.exe role bootstrap) for update-server evidence: SERVER.INI keys, update-transport needles (http://, ftp://, ProxyServer), self-replacement markers (Gin7UpdateClient.new/.old), client-launch target `.\exe\G7MTClient.exe`, and UPDATE.LOG/UpdateClient.err logging; build_launcher_update_index(root) maps each ASCII finding's raw offset to a VA and emits a typed findings JSON. Tested by tools/tests/test_logh7_launcher_update_index.py; flagged as next target in docs/windows-codex-handoff.md. |
| logh7_launcher_update_flow.py | Classifies launcher/update control flow from static PE bytes: resolves the import table, capstone-disassembles the executable section, and correlates watched Win32 import callsites (GetPrivateProfileString/Int, WritePrivateProfileString, CreateProcess, MoveFile/DeleteFile, registry APIs) with nearby config-string pushes; derives serverIniOverride (SERVER.INI SERVER_ADDRESS/SERVER_PORT, 202.8.80.179 only a fallback default), processLaunch (CreateProcessA -> .\exe\G7MTClient.exe), and updateFileReplacement (Gin7UpdateClient.new/.old swap) policy conclusions; read-only, builds on logh7_child_codec PE parsing. Untracked/in-progress. |
| logh7_msgdat.py | Parses MsgDat localization containers (magics HFWR/GFWR), scanning cp932 spans for Japanese text candidates and `$TOKEN$` placeholders with byte offsets. |
| logh7_pe_inventory.py | Inventories all .exe/.dll under the install root, parsing PE header (machine, image base, entry point, subsystem) + sha256 with role/priority triage. |
| logh7_packager.py | Builds a reproducible distribution ZIP with MANIFEST.json + per-file sha256; forbids `.bin`/`.cue`/`.iso` (ForbiddenArtifactError) and unsafe archive paths. |
| logh7_child_codec.py | Keystone module: parses the PE and extracts the static child-codec P-array (18 dwords @0x007B6AE4) + 4 S-boxes (@0x007B6BA8, masked 0x91); exports the PE-parse helpers imported by ~20 modules. |
| logh7_cipher.py | Transport framing + handshake structs: PHASE3 code 0x0035, stored-key mask 0x17, 16-bit xor-fold checksum, build/parse of Phase1/2/3 payloads; build_transport_frame imported widely. |
| logh7_phase3_response.py | Builds a phase3 frame (0x0035) from a captured phase1 frame (0x0034): decodes phase1 key+sequence, re-encodes Phase3DecodedPayload(encipher=phase1.key, decipher, sequence). |
| logh7_phase_analysis.py | argparse CLI classifying decoded request bodies into phase1/2/3 by child-codec-decode + parse against each layout; PhaseParseMatch / RequestBodyClassification. |
| logh7_post_handshake_body.py | Double-decodes a captured 0x0030 frame with the phase1 key from the same connection's 0x0034 request, extracting account (len@18/text@20) and password (len@34/text@36). |
| logh7_client_protocol.py | Scans the binary for ASCII protocol names (`^(Lobby|SS|Sys|Request|Response|Command|Notify|CHANGESERVER|LB_|ACCOUNT_)`) into a typed protocol index JSON. |
| logh7_command_ok_layout.py | Capstone-disassembles CommandOK handlers to recover decoded-body field offsets (StreamField/ArrayLayout/CommandOkTarget); LAYOUT_STATUS marks offsets proven, names not. |
| logh7_command_ok_response_candidates.py | Builds candidate encrypted CommandOK frames (0x0031 MoveShip 1052B, 0x0032 TurnShip 276B, 0x0033 ParallelMove 1052B) triggered by client 0x0030, child-codec-encoded via the phase1 schedule. |
| logh7_entity_lookup.py | Disassembles the entity-pool lookup @0x004C7CD0; EntityPool per-selector pools (selector 0 = 10 recs stride 0x8CC, selector 1 = 600 recs stride 0x9EC), validated by instruction markers. |
| logh7_entity_pool_prerequisites.py | Validates markers for world/grid/unit init handlers and the selector1 request builder: ResponseWorldInitialize 0x0f01, GridInitialize 0x0f03, InformationUnit, activation root client+0x126718. |
| logh7_transport_dispatch.py | Disassembles the transport jump table @0x004B864C (tail 0x004B78EF) for tracked codes 0x0001/3/4/13/14/30/34/35/36; TransportDispatchEntry maps transport->internal + state gate @0x35837e. |
| logh7_inbound_response_dispatch.py | Disassembles the inbound response dispatcher (entry 0x004BA316) decoding the small switch table @0x004BDE7C (base 0x0200), large index/target tables @0x004BDFD4/0x004BDF28 (base 0x033F), 0x0F-range @0x004BCFEE. |
| logh7_internal_handlers.py | Disassembles post-handshake internal handlers: ACK 0x004BA457, internal dispatch 0x004BA316, phase4 builder 0x00511AE0, phase4 send trigger 0x004C1949. |
| logh7_session_bootstrap.py | Disassembles session handlers SSLoginOK 0x0200 / SSGameLoginOK 0x0205 (table @0x004BDE7C), transport->internal map (0x0001->0x0200, 0x0003->0x0205), queue append @0x004B852B (count @0x357EC0). |
| logh7_message_family_maps.py | Disassembles message-family lookup tables mapping a base internal code to object size/count (MessageFamilySpec/MessageFamily, e.g. session-bootstrap family @0x0044F000). In-progress / untracked. |
| logh7_post_0030_payload_layout.py | Disassembles candidate internal handlers 0x0400/0x0401/0x0402 (0x004BB5D9/63A/670) for transports 0x0031/32/33, recovering message name + client destination of the 0x0030-triggered body. |
| logh7_post_0030_followups.py | Disassembles motion follow-up handlers after CommandOK (e.g. 0x0031/internal 0x0400 MoveShip OK @0x004BE8F0, action 2, stride 20), reading body +0x290..+0x29c and entity fallbacks +0x44/+0x4c. |
| logh7_post_handshake_responses.py | Decodes the transport jump table @0x004B864C and internal switch tables (base 0x033F) confirming 0x0031->0x0400, 0x0032->0x0401, 0x0033->0x0402; references cipher gate @0x35837e. |
| logh7_phase3_recv_parser.py | Disassembles the phase3 recv callsite @0x00645992 (winsock recv ordinal 14 via IAT 0x0066b6b0), documents post-recv decode helper @0x00648d42 and g071 recv-context evidence. |
| logh7_socket_boundary.py | Parses the ws2_32 import table (recv=14, send=19, connect=4) and labels recv callsite roles (0x00611AA5 low-level, 0x006454D1 phase2, 0x00645992 phase3, 0x00645E2B phase4); WinsockImport. |
| logh7_packet_trace.py | Reads JSONL probe traces and classifies frames into command-ok / session-bootstrap / world-grid-init response candidates; writes a gameplay trace-analysis JSON (HEADER_BYTES=4). Modified. |
| logh7_server_discovery.py | Static-only discovery: decodes installer files (data1.hdr, setup.inx) in cp932/latin-1/utf-16le into executables/configFiles/urls/resourceHints; default bind 127.0.0.1:4787, never runs legacy exes. |
| logh7_live_entity_scan.py | ctypes OpenProcess/ReadProcessMemory scan of selector1 entity records; hardcodes client object @0x007CCFFC, runtime manager @0x007C25F4 and state-flag offsets (SSLoginOK 0x35F252, world/grid 0x35F356/7). |
| logh7_process_memory.py | ctypes helpers (on logh7_live_entity_scan) dumping live client regions to disk: dump_client_memory(addr,size), dump_follow_memory resolving a follow address from a ring-buffer dump. |
| logh7_window_login.py | win32 GUI automation: find_client_window(pid) over visible windows, then login() clicking/typing fixed coords (325,333 / 325,360 / 323,389) with account 'ginei00' / password 'dummy'. |
| logh7_windows_runtime.py | Writes setup-local.ps1 / launch-client.ps1 / WINDOWS-COMPATIBILITY.txt, sets the HKCU BOTHTEC install key, applies AppCompatFlags (DISABLEDXMAXIMIZEDWINDOWEDMODE HIGHDPIAWARE). |
| logh7_real_client_probe.py | Orchestrates the real-client dynamic probe: GUID transport key (7b4134...), decipher key 0x5859, default CommandOK 0x0031; builds the stub-server manifest and drives launch + scripted login + trace capture. |
| logh7_real_client_probe_cli.py | argparse wrapper for run_real_client_dynamic_probe (installed_root, --manifest/trace/analysis/result-out, --port 47900, --timeout 20, base-0 command-ok code/entity key). |
| logh7_real_client_world_init_probe.py | Windows-only (os.name=='nt') world-init probe: bootstrap-timing (after-0036/0030/both), encoding (phase1-child-codec/raw), bootstrap body hex, optional client + ring-follow memory dumps. |
| logh7_world_init_probe_server.mjs | Node net TCP stub server feeding phase3/session-bootstrap/world-init candidate frames to the real client; imports the src/server/*.mjs codec + bootstrap builders, CLI host/port/keys/timing. |
| logh7_x86_patch.py | X86Builder assembler emitting raw 32-bit x86 (jmp rel32, je/jne/jbe placeholders + patch, u8/u32, call-via-IAT, append_record_data) used to generate every runtime binary patch. |
| logh7_pipeline.py | Main `#!/usr/bin/env python3` CLI orchestrator wiring every builder/writer (ISO extract, installed tree, protocol index, command-ok, pe inventory, msgdat, handlers, discovery, bootstrap, ~30 runtime patch writers). Modified. |
| logh7_pipeline_runtime.py | Aggregator re-exporting the many runtime_* patch/index modules as thin `write_*` wrappers that apply a patch and print the written paths. |
| run_python_tests.mjs | Node test runner probing for Python 3.11+ (py -3 / python / python3, honoring $PYTHON) and running `python -m unittest discover -s tools/tests`. |

### Runtime patch tools
| File | Description |
|------|-------------|
| logh7_runtime_target_specs.py | Single source of truth: frozen PATCH_TARGET_SPECS of name->(virtual_address, 16-byte expected_hex, role, patch_strategy, evidence-file) for every hookable client VA. Pure data, no I/O. |
| logh7_runtime_patch_targets.py | Shared PE/patch backbone: extract_runtime_patch_targets() validates expected_hex (raises 'signature drift'), find_runtime_probe_code_cave() (>=256B 0x00/0x90), IAT resolution, enable_section_write_for_virtual_address(). |
| logh7_runtime_keylog_patch.py | Patches keyStoreHelper (0x00614810, 7B) to append 92-byte 'KLG2' records (logh7_keylog.bin); defines the FILE_*/GENERIC_WRITE/OPEN_ALWAYS WinAPI constants + KEYLOG_* layout reused by most patchers. |
| logh7_runtime_keyread_patch.py | Hooks keyReadHelper (0x006148A0, 7B, event 3) logging when the stored key image is read/unmasked; reuses KLG2 format + WinAPI constants. |
| logh7_runtime_keysetup_patch.py | Hooks keySetupWrapper (0x006140C0, 7B, event 2) logging raw key bytes+length entering child-codec key setup; reuses KLG2 format. |
| logh7_runtime_keylog.py | Decoder for logh7_keylog.bin: parses 92-byte 'KLG2' records (copy_length<=64), labels event ids/return addresses, emits JSON with hex+ascii key preview. |
| logh7_runtime_child_encode_patch.py | Hooks childCodecEncode (6B, entry event 4) appending 176-byte 'CLG2' records (logh7_child_codec_trace.bin); owns the CHILD_TRACE_* constants imported by the post-encode/schedule patchers. |
| logh7_runtime_child_post_encode_patch.py | Hooks phase1ChildEncodePostCall (0x006452CC, 6B, post event 5) logging encoded output ptr/len/return after encode returns; reuses CLG2, exports _write_file_append. |
| logh7_runtime_child_schedule_patch.py | Hooks the child-codec scheduling site (event 6, P-array 72B) emitting CLG2 via mov_abs_from_reg; reuses CHILD_ENCODE overwrite/trace constants + _write_file_append. |
| logh7_runtime_child_trace.py | Decoder for logh7_child_codec_trace.bin: parses 176-byte 'CLG2' records, remaps event 5 to output fields, renders storedKeyRawXor17Hex (key stored XOR 0x17). |
| logh7_runtime_manager.py | Top-level capstone verifier/index for the C++ runtime-manager object (ctor 0x004AD900/store 0x004AD94F, dtor 0x004ADAA0, vtable 0x0066E0FC, queue append 0x004B852B); manager ptr 0x007C25F4, flag 0x007C25F8. |
| logh7_runtime_manager_callback.py | Capstone verifier of the cleanup-callback gate @0x004ADD60 asserting gate-read/zero-branch/reset and SIMPLE_SET_ONE_NEEDLES (c6453001/c6473001/c6403001). |
| logh7_runtime_manager_callback_patch.py | Patches runtimeManagerRegisteredCallback (0x004ADD60, 5B) appending 36-byte 'CBK1' records; exports _write_saved_stack_dword / _append_file_write + FILE_* constants used by many patchers. |
| logh7_runtime_manager_cleanup.py | Capstone verifier of the cleanup loop @0x004ADCE0 (manager+0x24 list, esi+0x10/+0xc call, edi+0x32 self-delete gate, vdtor 0x004ADD4E); produces the cleanup-loop schema. |
| logh7_runtime_manager_cleanup_patch.py | Patches runtimeManagerCleanupLoopEntry (0x004ADCE0, 7B) appending 32-byte 'CLP1' records (logh7_runtime_manager_cleanup.bin) tracing the callback-list cleanup loop. |
| logh7_runtime_manager_clear_patch.py | Patches runtimeManagerGlobalClear (0x004ADB09, 10B) appending 32-byte 'RMC1' records when the global manager pointer @0x007C25F4 is zeroed; uses mov_abs_from_reg. |
| logh7_runtime_manager_destructor_patch.py | Patches runtimeManagerDestructorEntry (0x004ADAA0, 8B) appending 32-byte 'DTE1' records; trampoline replays the original call to destructor body 0x004ADAC0. |
| logh7_runtime_manager_dispatcher_patch.py | Multi-hook patcher for DISPATCHER_TARGETS (FlagThree event1/5B, FlagZero event2/7B) emitting 52-byte 'RMD1' records; base class + _append_dispatcher_file_write reused by node/member-slot/trigger patchers. |
| logh7_runtime_manager_dispatcher_node_patch.py | Subclass adding per-target list head/count offsets (flag3 head 0x24/count 0x28; flag0 head 0x34/count 0x38) emitting 52-byte 'RMN1' records; exports _write_manager_byte/_write_manager_dword. |
| logh7_runtime_manager_state_dispatcher.py | Capstone verifier of flag-3 dispatcher 0x004AC350 and flag-0 dispatcher 0x004AC2C0; asserts gate reads manager+0xaa/+0xa8, lists +0x24/+0x34, calls 0x6122a0/0x6122b0, ebp=3 marker. |
| logh7_runtime_manager_state_patch.py | Multi-hook patcher for STATE_TARGETS (StateEventCallback 0x004ADF60, StateFollowupCallback 0x004ADFD0, 6B) emitting 36-byte 'RMS1' records when manager+0x30 is set. |
| logh7_runtime_manager_state_trigger_patch.py | Patches runtimeManagerStateTriggerCallback (0x004AC430, 6B) emitting 52-byte 'RMT1' records capturing the nested trigger that sets manager+0xaa before a member vtable call. |
| logh7_runtime_manager_member_slot.py | Capstone verifier of the member-slot state-function entry @0x00402880 (fs:[0] SEH prologue, esi=ecx this, push 4 / call [eax+8], word stores at ebp+6). |
| logh7_runtime_manager_member_slot_patch.py | Patches stateTriggerMemberSlot14 (6B) emitting 52-byte 'RME1' records; composes helper writers from callback/dispatcher/node patch modules. |
| logh7_runtime_manager_member_slot_effect_patch.py | Patches stateTriggerMemberSlotDispatchCall (5B) emitting 52-byte 'RME2' records; trampoline replays the original call to 0x00403160 (EFFECT_REPLAY_CALL_TARGET). |
| logh7_runtime_manager_member_slot_tail_patch.py | Patches stateTriggerMemberSlotSuccessTail (7B) emitting 52-byte 'RME3' records at the success tail of the member-slot dispatch; requires a writable section. |
| logh7_runtime_manager_nested_callback_patch.py | Patches runtimeManagerNestedCallbackWalker (0x004AB6A0, 5B) emitting 52-byte 'RMW1' records tracing the nested callback-list walker reached from the flag-zero dispatcher. |
| logh7_runtime_manager_patch.py | Patches runtimeManagerGlobalStore (0x004AD94F, 6B) emitting 32-byte 'RMG1' records capturing the moment the global manager pointer is stored to 0x007C25F4. |
| logh7_runtime_queue_append_patch.py | Patches lowTransportQueueAppendStore (9B) emitting 32-byte 'QLG1' records (logh7_queue_append.bin) at the low-transport send-queue append store. |
| logh7_runtime_queue_entry_patch.py | Patches lowTransportQueueAppend entry (11B) emitting 32-byte 'QEG1' records (logh7_queue_entry.bin); records conditional-append skip target 0x004B8611. |
| logh7_socket_recv_patch.py | Patches the recv boundary at PHASE_RECV_SITES 0x006454D1/0x00645992 (recv IAT 0x0066B6B0, 6B) emitting 64-byte 'SRB1' records; defines RECV_IAT/PHASE_RECV_SITES reused by all recv variants. |
| logh7_socket_recv_all_patch.py | Captures every recv call (not just phase sites) into 96-byte 'SRA1' records at cave offset 560; reuses RECV_IAT + WinAPI constants, enumerates sites via build_socket_boundary_index. |
| logh7_socket_recv_ring_patch.py | Installs a fixed 4-slot in-memory ring (RING_BUFFER_OFFSET 480) of 64-byte 'SRR1' records in the cave (no file) recording recv boundary data per site. |
| logh7_socket_recv_phase_ring_patch.py | Phase-scoped 4-slot ring of 64-byte 'SRP1' records for the two PHASE_RECV_SITES, with distinct buffer offsets (phase ring 544, phase3 288), phase3 VA 0x00645992. |
| logh7_socket_recv_window_patch.py | Sliding-window recv capture at phase3 site 0x00645992 (6B) emitting larger 128-byte 'SRS1' records to inspect a window of received transport bytes. |
| logh7_transport_dispatch_entry_patch.py | Cave-trampoline ring patch at transport dispatcher entry 0x004B78BB (10B, continuation 0x004B78C5) writing 8x 64-byte 'TDE1' records at offset 280; gated on manager global, notes cipher gate 0x0035837E. |
| logh7_decoded_dispatch_entry_patch.py | Cave-trampoline ring patch at decoded-response outer entry 0x004BA2E6 (7B, original 897de8c6450f00, continuation 0x004BA2ED) writing 8x 64-byte 'DDE1' records; gate offset 0x003579CD. |
| logh7_decoded_response_dispatch_patch.py | Cave-trampoline ring patch at decoded-response internal dispatcher 0x004BA316 (8B, original 8b450825ffff0000, continuation 0x004BA31E) writing 8x 64-byte 'DDR1' records; tail 0x004BDD33. |
| logh7_phase3_sink_patch.py | Cave-trampoline ring patch at the phase3 decoded sink 0x00645A4B (11B, original 528b542438525556ff500c, continuation 0x00645A56) capturing args before vtable +0x0c into 4x 64-byte 'SPK1' records. |
| logh7_session_bootstrap_gate_patch.py | Cave-trampoline ring patch at the session-bootstrap manager gate 0x004B78EF (10B, original a1f4257c0085c089750c, continuation 0x004B78F9) writing 4x 64-byte 'SBG1' records before the queue append. |

## Subdirectories
| Directory | Purpose |
|-----------|---------|
| tests/ | unittest suite (test_logh7_*.py) run by run_python_tests.mjs; one fixture-driven test per analysis/patch module, exercising builders against a fixture client image. |

## For AI Agents

### Working In This Directory
- All binary offsets are module-level `Final` constants suffixed `*_VA` (absolute virtual addresses, image base `0x00400000`) or `*_OFFSET` (client-object-relative). They are specific to one `G7MTClient.exe` build; changing the binary invalidates them.
- `logh7_runtime_target_specs.py` is GROUND TRUTH for every spec-driven hook: `PATCH_TARGET_SPECS` maps name -> (virtual_address, 16-byte expected_hex, role, evidence). `extract_runtime_patch_targets()` reads `SIGNATURE_LENGTH=16` bytes at each VA and raises `'signature drift'` on mismatch. Change a VA and you MUST update its `expected_hex` (and vice versa) or the whole pipeline aborts. expected_hex values trace to `docs/g0xx` evidence files.
- The standalone ring patchers (`logh7_decoded_dispatch_entry_patch.py`, `logh7_decoded_response_dispatch_patch.py`, `logh7_phase3_sink_patch.py`, `logh7_session_bootstrap_gate_patch.py`, `logh7_transport_dispatch_entry_patch.py`) do NOT go through `PATCH_TARGET_SPECS` — they hardcode their own `*_HOOK_VA`, `*_ORIGINAL_HEX`, `*_OVERWRITE_BYTES`. Those original-hex strings and continuation VAs must stay byte-exact; editing one requires re-dumping bytes at that VA.
- `OVERWRITE_BYTES` is load-bearing twice: it sets the JMP-patch clobber length AND `returnAddressHex = VA + OVERWRITE_BYTES` (the resume point). It must equal the summed length of the replaced original instructions — never split an instruction. Values vary per site (5,6,7,8,9,10,11).
- `logh7_child_codec.py` is the keystone import (PE parse + cipher tables). Breaking `_parse_pe_image` / `_virtual_address_to_offset` / `extract_child_codec_static_tables` cascades to ~20 modules and the .mjs server.
- Keep the two code spaces separate everywhere: transport codes (0x0034 phase1, 0x0035 phase3, 0x0030 post-handshake, 0x0036, 0x0001/0x0003) vs internal codes (0x0200/0x0205 session, 0x0400-0x0402 command, 0x0f01/0x0f03 world/grid).
- Mixed import conventions coexist: most modules use bare `from logh7_x ...` (run inside tools/), while the newer argparse ring patchers and `logh7_runtime_patch_targets.py` use package-qualified `from tools.logh7_x ...`; disassembly verifiers use the `if __package__:` dual-import idiom. Match the existing style of the file you edit — mixing them causes ImportError.

### Testing Requirements
- Run the full suite: `node tools/run_python_tests.mjs` (equivalently `python -m unittest discover -s tools/tests`, requires Python 3.11+; the code uses `X|Y` unions and `slots=True` dataclasses).
- Targeted patch/runtime/socket tests from repo root: `python -m pytest tools/tests/ -k "runtime or socket or patch or keylog or dispatch"`.
- Record formats are a binary contract between patcher (writer) and decoder: `logh7_runtime_keylog.py` expects exactly 92-byte KLG2 (copy_length<=64) and `logh7_runtime_child_trace.py` expects 176-byte CLG2 (64B buffer + 64B stored key). Decoders validate `len % RECORD_BYTES == 0` and per-record magic; changing `RECORD_BYTES`/struct/magic in a `*_patch.py` without updating the decoder breaks parsing.
- Capstone verifiers (`logh7_runtime_manager*.py` non-patch, `*_member_slot.py`, `*_state_dispatcher.py`, `*_callback.py`, `*_cleanup.py`) assert exact `(address, mnemonic, op_str)` tuples and byte needles; they raise if client instructions shift, acting as a self-check against the wrong binary.

### Common Patterns
- Static analysis modules disassemble with `Cs(CS_ARCH_X86, CS_MODE_32)` then assert expected instruction "markers" (`_expect_markers`/`_require_markers`/`_require_htons_calls`), raising `ValueError` on mismatch.
- Frozen, slotted dataclasses expose `to_json()` that hex-formats codes/addresses (`f"0x{x:04x}"` for message codes, `f"0x{x:08x}"` for VAs) — the JSON shape is the contract consumed by `logh7_pipeline`, `logh7_packet_trace`, docs, and the .mjs server.
- Builder/writer split: `build_*()` returns a dict/bytes; `write_*()` does `mkdir(parents=True)` + `write_text(json.dumps(..., ensure_ascii=False, indent=2)+'\n', encoding='utf-8')`.
- Two patch-file flavors: `*_patch.py` modules BUILD/apply detours (own a frozen-slots `<Name>Patch` with `to_json()`); the non-`_patch` siblings are capstone VERIFIERS; a third flavor (`logh7_runtime_keylog.py`, `logh7_runtime_child_trace.py`) DECODES emitted `.bin` records.
- Per-patch constant block: a 4-byte ASCII MAGIC, fixed `RECORD_BYTES`, an `*_OVERWRITE_BYTES` count, and a `logh7_*.bin` LOG_PATH. File-backed patchers route through IAT-resolved WinAPI (CreateFileA/WriteFile/SetFilePointer/CloseHandle/lstrlenA/wsprintfA/OutputDebugStringA); trampolines use `logh7_x86_patch` helpers (X86Builder, hook_jump, call_iat, push_u32, mov_abs_from_reg) JMP-patched into a discovered code cave.
- Manager/transport state offsets recur as magic numbers: manager ptr 0x007C25F4, flag 0x007C25F8, gate bytes manager+0xa8/+0xa9/+0xaa, state byte manager+0x30, list heads +0x24 (flag3)/+0x34 (flag0) with counts +0x28/+0x38.

### Gotchas
- Do NOT change `*_VA` / `*_OFFSET` constants without re-deriving them from the exact client build — a wrong offset that still passes markers would silently corrupt all downstream evidence/patches.
- The stored child-codec key is masked XOR `0x17`; `logh7_runtime_child_trace.py` exposes `storedKeyRawXor17Hex` and event 5 remaps stored_key_* to output_*. Preserve the XOR and event-id semantics (encode entry=4, post=5, schedule=6; keysetup=2, keyread=3).
- Heavy cross-module helper reuse — do not change signatures without checking importers: `_write_saved_stack_dword`/`_append_file_write` (callback patch), `_append_dispatcher_file_write` (dispatcher patch), `_write_manager_byte`/`_write_manager_dword` (dispatcher node patch), `_write_file_append` (child post-encode), `CHILD_TRACE_*` (child encode), `RECV_IAT`/`PHASE_RECV_SITES` (socket recv patch), and the FILE_* constants.
- Python<->Node parity requirement: `logh7_child_codec` / `logh7_cipher` / `logh7_phase3_response` / `logh7_session_bootstrap` are mirrored by `src/server/logh7-codec.mjs`, `logh7-session-bootstrap.mjs`, `logh7-world-init.mjs` used by the .mjs probe server. Cipher/frame/offset changes must land on BOTH sides or the real-client probe breaks.
- Handshake frame format: 2-byte big-endian length prefix + 2-byte big-endian transport code + child-codec-encoded body; bodies use big-endian length-prefixed keys + a 16-bit xor-fold checksum. Don't swap endianness.
- `logh7_installed_tree.py` hardcodes the legacy->local redirect (`202.8.80.179` -> `127.0.0.1`) and `INSTALL_ROOT_MARKERS`; the probe pipeline depends on the redirect to make the client send its first packet.
- `logh7_packager.py` intentionally forbids `.bin`/`.cue`/`.iso` in the distribution tree (`ForbiddenArtifactError`) — a deliberate no-copyrighted-CD-image policy, not a bug to relax.
- ISO/MsgDat text is cp932 (Shift-JIS); entry names strip `;` version suffixes and lowercase. Don't assume UTF-8/ASCII.
- `logh7_window_login.py` uses fixed pixel coordinates + literal account 'ginei00'/password 'dummy'; `logh7_real_client_probe.py` uses a fixed GUID transport key and decipher key 0x5859 — tied to the captured login flow.
- Per git status, `logh7_packet_trace.py` and `logh7_pipeline.py` are modified and `logh7_message_family_maps.py` / its test, plus `logh7_launcher_update_flow.py` / `tools/tests/test_logh7_launcher_update_flow.py`, are new/untracked — treat message-family wiring and launcher/update flow classification as in-progress.

## Dependencies

### Internal
- `tools/logh7_iso.py` — PipelineError hierarchy, IsoImage/IsoEntry, read_extent (base module).
- `tools/logh7_child_codec.py` — PE parsing (`_parse_pe_image`, `_virtual_address_to_offset`, `pe_virtual_address_to_file_offset`, `PeSection`) + cipher tables; imported by nearly all analysis and patch modules.
- `tools/logh7_cipher.py` — transport frame + phase payload structs.
- `tools/logh7_x86_patch.py` — X86Builder, hook_jump, call_iat, push_u32, mov_abs_from_reg (trampoline emission).
- `tools/logh7_runtime_target_specs.py` + `tools/logh7_runtime_patch_targets.py` — PATCH_TARGET_SPECS signature table + PE/cave/IAT/section-write backbone.
- `tools/logh7_socket_boundary.py` — build_socket_boundary_index (recv-site enumeration) used by the socket-recv patchers.
- Shared patch helpers: `logh7_runtime_keylog_patch.py` / `logh7_runtime_manager_callback_patch.py` (FILE_*/WinAPI constants + stack/file writers), `logh7_runtime_manager_dispatcher_patch.py` + `_dispatcher_node_patch.py`, `logh7_runtime_child_encode_patch.py` + `_child_post_encode_patch.py`, `logh7_socket_recv_patch.py`.
- `src/server/logh7-codec.mjs`, `logh7-session-bootstrap.mjs`, `logh7-world-init.mjs` — Node counterparts used by `logh7_world_init_probe_server.mjs`.
- `tools/tests/` — unittest suite run by `run_python_tests.mjs`.

### External
- `capstone` (CS_ARCH_X86, CS_MODE_32) — x86 disassembly for all static PE analysis modules and patch verifiers.
- `pywin32` (win32api/win32con/win32gui/win32process, pywintypes) — client window automation + login for the real-client probes (Windows only, imported lazily under `os.name=='nt'`).
- `ctypes` + `ctypes.wintypes` — OpenProcess/ReadProcessMemory live memory scanning (`logh7_live_entity_scan`, `logh7_process_memory`).
- Python stdlib: `struct` (little-endian `<IIIII`/`<H`/`<I` record + PE field packing), `hashlib` (sha256 manifests), `zipfile` (packaging), `argparse`/`subprocess` (CLIs, launching client + node stub), `json`/`shutil`/`pathlib`.
- Node.js (`node:net`, `node:fs`) — `logh7_world_init_probe_server.mjs` TCP stub server and `run_python_tests.mjs` runner.
- Requires Python 3.11+ (`run_python_tests.mjs` enforces; code uses `X|Y` unions and `slots=True` dataclasses).

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
