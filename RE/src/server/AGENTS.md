<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# src/server

## Purpose
Node.js (ESM .mjs) replacement game server and protocol toolkit for the reverse-engineered LOGH VII client. It implements: (1) the client's custom block cipher (the "child codec", a Blowfish variant) whose P-array and S-boxes are extracted at runtime from the client PE binary; (2) the on-the-wire transport framing (2-byte BE length + 2-byte BE message code + body); (3) the login handshake state machine (phase1 0x0034 request -> phase3 0x0035 response key exchange); (4) candidate-frame builders for "command OK", session bootstrap, and world-init messages used for protocol probing; and (5) two servers wired to a CLI — an HTTP resource/manifest server and a TCP gameplay-capture/probe server. The dominant stance is evidence-driven and conservative: most observed client frames are logged ("record only; do not emit until response bytes are observed"), and only explicitly configured or dynamic-probe-enabled responses are emitted.

## Key Files
| File | Description |
|------|-------------|
| logh7-transport-frame.mjs | Leaf module (no imports). `buildTransportFrame(code, body)` writes UInt16BE(body.length+2) at offset 0 (length prefix counts the 2-byte code, NOT itself), UInt16BE(code) at 2, body at 4 — the canonical frame encoder used by every other module. |
| logh7-command-ok.mjs | Leaf module. `COMMAND_OK_SIZES` (0x0031->1052, 0x0032->276, 0x0033->1052); `buildCommandOkDecodedBody({responseCode, entityKey})` zero-fills the exact size, and when entityKey is set writes body[0x0c]=1 plus UInt32LE(entityKey) at 0x10; throws on unknown responseCode. |
| logh7-codec.mjs | Cryptographic + handshake core. Extracts Blowfish-variant tables from the client PE (`extractChildCodecStaticTables`, XOR 0x91 de-obfuscation), implements encrypt/decryptBlock + key schedule, and builds the phase3 0x0035 response from a phase1 0x0034 request (`buildPhase3ResponseFromPhase1Request`) plus command-OK candidates. |
| logh7-session-bootstrap.mjs | Probe helper (not imported by the server). `SESSION_BOOTSTRAP_CANDIDATES`: SSLoginOK (transport 0x0001, queued 0x0200/0x0201, state write client+0x35f252) and SSGameLoginOK (transport 0x0003, 0x0205/0x0206, client+0x35837e); builds plaintext and phase1Key-keyed encrypted frames. |
| logh7-world-init.mjs | Probe helper (not imported by the server). `WORLD_INIT_CANDIDATES`: ResponseWorldInitialize (transport 0x0013, 0x0f00/0x0f01) and ResponseGridInitialize (transport 0x0014, 0x0f02/0x0f03); `buildEncryptedCandidateFrame` key-schedules then encrypts+frames, default decoded body 0x01. |
| logh7-server.mjs | CLI entry + two servers. `startLogh7Server` (HTTP /health, /manifest, /update.ini, /protocol/client, /resources/* with path-traversal guard) and `startLogh7GameplayServer` (TCP frame reassembly, classification, policy-gated responses, JSONL tracing). CLI dispatch: serve | serve-gameplay | health (default ports 4787 HTTP, 47900 TCP). |

## For AI Agents
### Working In This Directory
- Cipher is a Blowfish variant ("child codec"): 18-entry P-array, 4 S-boxes x 256 dwords, 8-byte block, 16 Feistel rounds. F-function = `((S1[b2] + S0[b3]) mod 2^32 XOR S2[b1]) + S3[b0] mod 2^32` where b3 is the most-significant byte — do NOT reorder the byte-to-S-box mapping.
- `encryptBlock`/`decryptBlock` read and write the two 32-bit halves as LITTLE-endian (readUInt32LE/writeUInt32LE). encrypt XORs pArray[0..15] then post-whitens with pArray[16]/[17]; decrypt walks pArray[17..2] then [1]/[0]. Keep this LE block I/O and P-array index order intact.
- Static tables are recovered from the client PE at fixed VAs `P_ARRAY_VA=0x007b6ae4` and `S_BOXES_VA=0x007b6ba8`, each dword XOR-deobfuscated with `TABLE_MASK=0x91`. `extractChildCodecStaticTables` hard-requires `IMAGE_BASE==0x00400000`; a different binary build/addresses requires updating these constants.
- Mixed endianness is intentional: transport/handshake metadata (length, code, checksum, key-length, sequence) is big-endian; cipher block words are little-endian. Preserve both.
- `childCodecKeySchedule` re-snapshots {pArray, sBoxes} after EACH encrypted pair so later encryptions see updated P/S entries (standard Blowfish). Do NOT optimize away the per-pair re-clone or you change key material. Key must be non-empty; `keyWord` wraps the key cyclically (cursor % key.length).
- `checksum()` = XOR of all UInt32LE words (then byte-XOR the tail), folded to 16 bits via `((v>>>16) ^ v) & 0xffff`, stored as a UInt16BE prefix. Both phase1 verify and phase3 build depend on this exact algorithm.

### Testing Requirements
- `npm run test:server` (runs: `node --test tests/server/*.test.mjs`).
- Relevant test files: tests/server/logh7-codec.test.mjs, logh7-server.test.mjs, logh7-session-bootstrap.test.mjs, logh7-world-init.test.mjs, logh7-world-init-probe-server.test.mjs.
- `childCodecDecode` requires input length to be an 8-byte multiple; `childCodecEncode` zero-pads to the next 8-byte multiple (no length header, no PKCS padding) so original length must be tracked out-of-band — account for this in test fixtures.

### Common Patterns
- ESM `.mjs` modules, named exports only (no default exports). Two-tier layout: leaf encoders (transport-frame, command-ok) -> codec core -> server + standalone probe helpers (session-bootstrap, world-init).
- Transport frame layout (MUST preserve): bytes[0..1]=UInt16BE(bodyLen+2) — length prefix counts the 2-byte code but NOT the 2-byte prefix; bytes[2..3]=UInt16BE(messageCode); bytes[4..]=body. Total wire length = declaredPayloadLength + 2; `takeGameplayFrames` reassembly relies on `totalLength = readUInt16BE(0)+2`.
- Handshake phases: `PHASE1_CODE=0x0034` (request, observed payloadLen 26) -> `PHASE3_CODE=0x0035` (server response). Phase1 body: UInt16BE checksum, UInt16BE keyLength, key[keyLength], UInt32BE sequence. Phase3 body: UInt16BE checksum, UInt16BE encipherKeyLen, encipherKey, UInt16BE decipherKeyLen, decipherKey, UInt32BE sequence. The recovered phase1 key becomes the encipherKey and is reused (`connectionState.phase1Key`) to key-schedule subsequent command-OK/world/session responses on that connection.
- Gameplay frame classification triggers are exact (payloadLen, messageCode) pairs: (26,52)=login-request 0x0034, (10,54)=post-phase3 0x0036, (50,48)=post-handshake 0x0030 (messageCode values in parse are decimal 52/54/48 = hex 0x34/0x36/0x30).
- Command-OK decoded body sizes are exact and fixed (0x0031->1052, 0x0032->276, 0x0033->1052); the entityKey path writes body[0x0c]=1 and UInt32LE at 0x10. Changing sizes breaks fixed-length client parsing.
- Candidate opcodes encode RE'd client internals (SSLoginOK transport 0x0001 / internal 0x0200/0x0201 / client+0x35f252; SSGameLoginOK 0x0003 / 0x0205/0x0206 / client+0x35837e; ResponseWorldInitialize 0x0013 / 0x0f00/0x0f01; ResponseGridInitialize 0x0014 / 0x0f02/0x0f03). Keep in sync with the RE notes.
- Response emission is policy-gated: the gameplay server only writes bytes for configured `loginResponse`/`commandOkResponses` or when `dynamicProbe` is present in the manifest; everything else is trace-logged only. Do NOT make the server auto-respond to unrecognized frames. Evidence/policy strings are attached to every emitted/observed frame.
- Manifest schema is validated by `gameplaySchemaFromManifest`: `frameHex` must round-trip to lowercase hex and command-OK frame code must match `responseCode`. Strict validation everywhere (PE imageBase must equal 0x00400000, decoded payloads checksum-verified).

## Dependencies
### Internal
- logh7-codec.mjs imports logh7-command-ok.mjs and logh7-transport-frame.mjs
- logh7-server.mjs imports logh7-codec.mjs
- logh7-session-bootstrap.mjs imports logh7-codec.mjs and logh7-transport-frame.mjs
- logh7-world-init.mjs imports logh7-codec.mjs and logh7-transport-frame.mjs
- Consumed by tests in tests/server/*.test.mjs and npm scripts server:logh7 / server:gameplay / server:health in package.json

### External
- node:fs (readFileSync, createReadStream, createWriteStream) — PE binary load, resource streaming, JSONL trace writing
- node:fs/promises (readFile, stat) — manifest reads and resource stat
- node:http (createServer) — HTTP resource/manifest server
- node:net (createServer) — TCP gameplay capture/probe server
- node:path, node:url (fileURLToPath) — path resolution, traversal guard, CLI self-detection
- global fetch — used by the `health` CLI subcommand

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
