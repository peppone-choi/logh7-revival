<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# tests/server

## Purpose
node:test suite for the reverse-engineered LOGH VII protocol implementation in `src/server/`. Covers the child-codec cipher (key schedule, phase1→phase3 handshake, command-OK candidate frames), session-bootstrap and world-init candidate frame builders, the HTTP server (/health, /manifest, /update.ini, /protocol/client), the TCP gameplay capture server with its JSONL trace and evidence-first response policy, and an integration test that spawns the standalone world-init probe CLI. Golden hex values, frame sizes, and offsets are regression anchors derived from the real `G7MTClient.exe` binary.

## Key Files
| File | Description |
|------|-------------|
| logh7-codec.test.mjs | Asserts buildPhase3ResponseFromPhase1Request yields phase1KeyHex dbb2f9ab333223792a6f45be98af2773 and an exact phase3 hex; buildCommandOkResponseCandidate 0x0031 returns a 1060-byte frame (length 1058 at off 0, code at off 2) decoding to 1052 zero bytes; 0x0032 with entityKey 0x12345678 decodes count=1 at off 0x0c and the key at off 0x10 little-endian. |
| logh7-session-bootstrap.test.mjs | buildSessionBootstrapCandidateFrames returns SSLoginOK (transport 0x0001, queued 0x0200, paired 0x0201, frame 0003000101) and SSGameLoginOK (transport 0x0003, queued 0x0205, paired 0x0206, stateWrite annotation "client+0x35837e byte = 1"); decodedBody [1,0,0,0] gives 0006000101000000/0006000301000000; encrypted variant decodes to leading byte 1 with the live phase1 key. |
| logh7-world-init.test.mjs | buildWorldInitCandidateFrames returns ResponseWorldInitialize (queued 0x0f00, paired 0x0f01, transport 0x0013 at off 2) and ResponseGridInitialize (queued 0x0f02, paired 0x0f03, transport 0x0014 at off 2), each decoding to a leading byte of 1 with the live phase1 key. |
| logh7-server.test.mjs | 700-line suite: HTTP startLogh7Server (/health ok, /manifest title, /update.ini CRLF [UPDATE] INI from server.update keys else 404, /protocol/client catalog with account ginei00 / loginServerPort 47900 / robot mode / messageGroups login,session,world / evidence.responsePolicy, traversal and bad percent-encoding return 404/400) plus TCP startLogh7GameplayServer (tcp-capture-stub mode, JSONL trace, 0x34/0x36/0x30 classification, configured and dynamicProbe responses, secret redaction, startup rejection without a gameplay schema). |
| logh7-world-init-probe-server.test.mjs | Spawns tools/logh7_world_init_probe_server.mjs, waits for stdout "world-init probe listening on 127.0.0.1:<port>"; test 1 (after-0030 timing, raw encoding, body 01000000) splits a coalesced 0x0036+0x0030 packet into payload codes [0x0034,0x0036,0x0030] with response kinds dynamic-phase3-candidate, 2x dynamic-session-bootstrap-candidate, 2x dynamic-world-init-candidate; test 2 (both timing) aborts the socket mid-write and asserts exitCode null. |

## For AI Agents
### Working In This Directory
- Tests need the real binary at `.omo/work/logh7-installed/exe/G7MTClient.exe`; codec, session-bootstrap, world-init and dynamicProbe tests fail to extract static tables without it. HTTP-only and observed-packet tests do not need the binary.
- Golden values are tied to the EXE and codec: phase1KeyHex dbb2f9ab333223792a6f45be98af2773, the phase3 frame hex, sizes 1060/1058/1052, offsets 0x0c/0x10. If codec output legitimately changes, regenerate goldens rather than hand-editing.
- Message-code taxonomy is load-bearing: 0x0034 login request, 0x0036 post-phase3, 0x0030 post-handshake; transport 0x0001/0x0003 (session bootstrap), 0x0013/0x0014 (world/grid init); internal 0x0200/0x0201, 0x0205/0x0206, 0x0f00-0x0f03. The probe test depends on splitting one coalesced 0x0036+0x0030 chunk into separate frames.
- The probe-server test asserts the exact stdout line `world-init probe listening on 127.0.0.1:<port>` and CLI flag names (--host/--port/--trace/--client-exe/--transport-key-hex/--decipher-key-hex/--bootstrap-timing/--bootstrap-encoding/--bootstrap-body-hex). Renaming flags or the log line breaks it.
- The gameplay trace redacts secrets: lines[0].schema.loginResponse.frame, commandOkResponses[0].frame and dynamicProbe.clientExePath are undefined while dynamicProbe.enabled is true. Preserve this redaction.
- Keep the `.test.mjs` naming: playwright.config.js matches `**/*.spec.ts`, so renaming a server test to `.spec` would misroute it into the Playwright runner.

### Testing Requirements
- Run with `npm run test:server` (node --test tests/server/*.test.mjs); part of `npm test` after test:tools (python) and before playwright.
- Evidence-first invariant: the gameplay server emits zero bytes for observed 0x34/0x36/0x30 packets unless the manifest supplies loginResponse (configured-phase3-candidate), commandOkResponses (configured-command-ok-candidate, 1060B 0x0031), or dynamicProbe (dynamic-phase3-candidate then dynamic-command-ok-candidate with entityKey 0x12345678). Keep evidence/responsePolicy strings and the trace event/kind taxonomy intact.

### Common Patterns
- node:test with `assert from 'node:assert/strict'`; isolation via `mkdtemp` in `os.tmpdir()`, a manifest.json fixture, port 0 binding, and `finally` cleanup (server.close() + rm).
- Shared constants reused across tests: transportKey 7b41...42337d, requestFrame 001a0034..., decipherKey Buffer.from('XY'), and the real EXE fixture path.
- TCP trace is JSONL: each line has an `event` field (connection|payload|response|close); payload lines carry frame.messageCode and frame.kind; response lines carry response.kind and phase1KeySource.
- Probe-test helpers: waitForServer (stdout readiness regex) and closeProcess (SIGTERM then SIGKILL after 1s).

## Dependencies
### Internal
- `src/server/logh7-codec.mjs` — buildPhase3ResponseFromPhase1Request, buildCommandOkResponseCandidate, childCodecDecode, childCodecKeySchedule, extractChildCodecStaticTables
- `src/server/logh7-server.mjs` — startLogh7Server, startLogh7GameplayServer
- `src/server/logh7-session-bootstrap.mjs` — buildSessionBootstrapCandidateFrames, buildEncryptedSessionBootstrapCandidateFrames
- `src/server/logh7-world-init.mjs` — buildWorldInitCandidateFrames
- `tools/logh7_world_init_probe_server.mjs` — CLI spawned under test
- `.omo/work/logh7-installed/exe/G7MTClient.exe` — binary fixture for static-table extraction

### External
- `node:test` / `node:assert/strict` — built-in runner and assertions
- `node:net`, `node:child_process`, `node:fs/promises`, `node:os`, `node:events` — TCP clients, probe CLI spawning, temp dirs, trace IO
- global `fetch` (Node 18+) — HTTP assertions against startLogh7Server

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
