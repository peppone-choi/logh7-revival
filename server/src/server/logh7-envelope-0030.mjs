// LOGH VII transport-0x0030 application envelope.
//
// After handshake (0x0034/0x0035/0x0036) the real client only routes transport code 0x0030
// through its message pipeline; bare codes (0x0001/0x0013...) hit an empty handler map and the
// socket is dropped. A 0x0030 frame takes the 0x30 fast-path parser (G7MTClient.exe 0x00645db0),
// whose validation fixes this body layout (verified byte-exact against a real client 0x0030):
//
//   body (decrypted) = [u16 BE checksum][u32 BE id][u16 BE innerLen][innerLen bytes innerPayload]
//
// Validation performed by the client parser:
//   * decrypted length >= 8
//   * (length - 8) >= innerLen
//   * checksum == fold16( XOR of body[2 : 8+innerLen] as little-endian dwords + trailing bytes ),
//       fold16(x) = ((x >>> 16) ^ x) & 0xFFFF
//   * id <= client+0x20 (running sequence; client sets client+0x20 = id on success)
//
// This module builds/validates that body; transport framing and child-codec encryption are
// applied by the caller (the body is what the sub-parser decrypts).

/**
 * @param {Buffer} afterChecksum  the bytes after the 2-byte checksum field: [u32 id][u16 innerLen][payload]
 * @returns {number} fold16 checksum (0..0xFFFF)
 */
export function compute0030Checksum(afterChecksum) {
  let acc = 0;
  const fullDwords = afterChecksum.length >>> 2;
  for (let i = 0; i < fullDwords; i += 1) {
    acc = (acc ^ afterChecksum.readUInt32LE(i * 4)) >>> 0;
  }
  for (let i = fullDwords * 4; i < afterChecksum.length; i += 1) {
    acc = (acc ^ afterChecksum[i]) >>> 0;
  }
  return ((acc >>> 16) ^ acc) & 0xFFFF;
}

/**
 * Build a decrypted transport-0x0030 body for the given inner application payload.
 * @param {{ id: number, innerPayload: Buffer }} params
 * @returns {Buffer} the body the client's 0x30 sub-parser must decrypt to
 */
export function build0030Body({ id, innerPayload }) {
  if (!Buffer.isBuffer(innerPayload)) {
    throw new TypeError('innerPayload must be a Buffer');
  }
  if (innerPayload.length > 0xffff) {
    throw new RangeError('innerPayload exceeds u16 innerLen');
  }
  const afterChecksum = Buffer.alloc(4 + 2 + innerPayload.length);
  afterChecksum.writeUInt32BE(id >>> 0, 0);
  afterChecksum.writeUInt16BE(innerPayload.length, 4);
  innerPayload.copy(afterChecksum, 6);

  const body = Buffer.alloc(2 + afterChecksum.length);
  body.writeUInt16BE(compute0030Checksum(afterChecksum), 0);
  afterChecksum.copy(body, 2);
  return body;
}

// ---------------------------------------------------------------------------
// Transport framing limits + the inner-0x31 REKEY marker (evidence-derived).
//
// A recurring (and refuted) hypothesis was that the 21KB `LobbyResponseInformationSession`
// (0x2006) is dropped because it overflows a client transport buffer, and that the server
// should split it into several smaller 0x0030 subframes carrying inner opcode 0x31 as a
// "fragment continuation marker" that the client reassembles. Static RE of G7MTClient.exe
// (.omo/ghidra/export/G7MTClient + capstone disasm of .omo/ghidra/bin/G7MTClient.exe)
// refutes this:
//
//   * The transport router FUN_006130a0 treats inner opcode 0x31 as a CIPHER REKEY: it
//     calls the child-codec module's set-key path (blowfish vtable+4 = FUN_006140c0 ->
//     FUN_00613ad0 key schedule + FUN_00614810 "mtCipherModule::set_key", string @0x007b7cb4),
//     ZEROES the inbound sequence gate (cipherMgr+0x20), then RECURSES to the next subframe
//     with the new key. The terminal (non-0x31) path stores ONLY the current decoded buffer
//     and returns it; there is NO reassembly accumulator. So 0x31 subframes do NOT concatenate
//     into one logical application message — using 0x31 to "fragment" 0x2006 would just rekey
//     the cipher mid-stream and corrupt every following subframe.
//   * The client's max single application-message size is 0xf000 (61440) — stored at
//     socket-struct+0xac by FUN_00614ea0 — and the recv ring buffer is ~4MB. A single
//     21280-byte 0x2006 frame is within every transport limit and decodes successfully
//     (the live drop is a post-decode receive-object / recv-pump FSM cadence issue, tracked
//     by tools/client_patches/lobbyfsm.json — NOT a transport-size bug).
//   * The per-subframe decode size the router hands the cipher is (subframeLen - subheader)
//     - 2 and must be a multiple of the 8-byte child-codec block (blowfish decipher
//     FUN_00614460 rejects a non-8-aligned size: "decipher: buffer is short").
// ---------------------------------------------------------------------------

/** Max single application message the client accepts on a 0x0030 connection (FUN_00614ea0, socket+0xac). */
export const TRANSPORT_MAX_SINGLE_MESSAGE_BYTES = 0xf000;
/** Child-codec block size; the client's per-frame decode length must be a multiple of this. */
export const TRANSPORT_DECODE_BLOCK_BYTES = 8;
/** Inner opcode the transport router treats as a cipher REKEY (NOT a data-fragment marker). */
export const TRANSPORT_REKEY_INNER_CODE = 0x31;

/**
 * Decide whether `inner` can be delivered as a SINGLE transport-0x0030 frame to the real client,
 * and report the resulting wire frame size + the decode length the client computes. There is no
 * client-side reassembly path, so an inner that exceeds the single-message cap cannot be sent as a
 * 0x0030 message at all (and must NOT be "fragmented" via inner 0x31 — that is a rekey).
 *
 * Frame the server emits: [u16 BE len][subheaderLen zero bytes][u16 BE 0x0030][child-codec body].
 *   body (pre-encode) = [u16 checksum][u32 id][u16 innerLen][inner]  -> 8 + inner.length
 *   encoded body is padded up to the 8-byte block size.
 *   len field = subheaderLen + 2 + encodedLen ; total wire = 2 + len field.
 *   client decode size = (lenField - subheaderLen) - 2 = encodedLen (must be 8-aligned).
 *
 * @param {Buffer} inner the application inner payload (e.g. a message32 object)
 * @param {{ subheaderLen?: number }} [opts]
 * @returns {{ fitsSingleFrame: boolean, reason: string|null, encodedBodyBytes: number,
 *            wireFrameBytes: number, clientDecodeBytes: number }}
 */
export function classify0030SingleFrame(inner, { subheaderLen = 4 } = {}) {
  if (!Buffer.isBuffer(inner)) {
    throw new TypeError('inner must be a Buffer');
  }
  const bodyBytes = 8 + inner.length; // [u16 cksum][u32 id][u16 innerLen][inner]
  const encodedBodyBytes = bodyBytes % TRANSPORT_DECODE_BLOCK_BYTES === 0
    ? bodyBytes
    : bodyBytes + (TRANSPORT_DECODE_BLOCK_BYTES - (bodyBytes % TRANSPORT_DECODE_BLOCK_BYTES));
  const lenField = subheaderLen + 2 + encodedBodyBytes;
  const wireFrameBytes = 2 + lenField;
  const clientDecodeBytes = encodedBodyBytes; // (lenField - subheaderLen) - 2
  let reason = null;
  if (inner.length > 0xffff) {
    reason = 'inner exceeds the u16 innerLen field';
  } else if (clientDecodeBytes > TRANSPORT_MAX_SINGLE_MESSAGE_BYTES) {
    reason = `decode size ${clientDecodeBytes} exceeds the client single-message cap 0x${TRANSPORT_MAX_SINGLE_MESSAGE_BYTES.toString(16)}`;
  } else if (clientDecodeBytes % TRANSPORT_DECODE_BLOCK_BYTES !== 0) {
    reason = 'decode size is not a multiple of the child-codec block';
  }
  return {
    fitsSingleFrame: reason === null,
    reason,
    encodedBodyBytes,
    wireFrameBytes,
    clientDecodeBytes,
  };
}

/**
 * Build a transport REKEY inner: [u16 BE 0x31][key bytes]. The client router's 0x31 branch
 * installs `key` as the next child-codec key (set_key) and resets the inbound sequence gate.
 * This is the login keysetup mechanism — it is NOT a data-fragment marker; the payload is
 * consumed as cipher key material, never concatenated into a larger application message.
 * @param {Buffer} key non-empty cipher key material
 * @returns {Buffer} the rekey inner ([u16 0x31][key])
 */
export function build0031RekeyInner(key) {
  if (!Buffer.isBuffer(key) || key.length === 0) {
    throw new Error('rekey key must be a non-empty Buffer');
  }
  const inner = Buffer.alloc(2 + key.length);
  inner.writeUInt16BE(TRANSPORT_REKEY_INNER_CODE, 0);
  key.copy(inner, 2);
  return inner;
}

/**
 * Parse + validate a decrypted 0x0030 body the way the client parser does.
 * @param {Buffer} body
 * @returns {{ checksum: number, id: number, innerLen: number, innerPayload: Buffer, valid: boolean, reason: string|null }}
 */
export function parse0030Body(body) {
  if (body.length < 8) {
    return { checksum: 0, id: 0, innerLen: 0, innerPayload: Buffer.alloc(0), valid: false, reason: 'length < 8' };
  }
  const checksum = body.readUInt16BE(0);
  const id = body.readUInt32BE(2);
  const innerLen = body.readUInt16BE(6);
  if (body.length - 8 < innerLen) {
    return { checksum, id, innerLen, innerPayload: Buffer.alloc(0), valid: false, reason: '(length-8) < innerLen' };
  }
  const expected = compute0030Checksum(body.subarray(2, 8 + innerLen));
  const innerPayload = body.subarray(8, 8 + innerLen);
  if (expected !== checksum) {
    return { checksum, id, innerLen, innerPayload, valid: false, reason: `checksum mismatch (got 0x${checksum.toString(16)}, computed 0x${expected.toString(16)})` };
  }
  return { checksum, id, innerLen, innerPayload, valid: true, reason: null };
}
