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
