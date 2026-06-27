import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  build0030Body,
  build0031RekeyInner,
  classify0030SingleFrame,
  TRANSPORT_MAX_SINGLE_MESSAGE_BYTES,
  TRANSPORT_DECODE_BLOCK_BYTES,
  TRANSPORT_REKEY_INNER_CODE,
} from '../../src/server/logh7-envelope-0030.mjs';

// ---------------------------------------------------------------------------
// These tests lock the EVIDENCE-DERIVED transport contract of the real client
// (G7MTClient.exe), so a future investigator cannot re-introduce the refuted
// "split 0x2006 into 0x31-continuation subframes the client reassembles" myth.
//
// RE summary (static decomp .omo/ghidra/export/G7MTClient + capstone disasm):
//  * Transport router FUN_006130a0 routes each 0x0030 subframe. Inner opcode 0x31
//    is a CIPHER REKEY message: it calls blowfish vtable+4 = FUN_006140c0 ->
//    FUN_00613ad0 (Blowfish key schedule) + FUN_00614810 ("mtCipherModule::set_key",
//    confirmed by the embedded string at 0x007b7cb4), then ZEROES the inbound
//    sequence gate (cipherMgr+0x20) and RECURSES to the next subframe with the new
//    key. The terminal (non-0x31) path stores ONLY the current decoded buffer
//    (piVar7[9..0xc]); there is NO reassembly accumulator anywhere in the router.
//    => 0x31 fragments do NOT concatenate into one logical application message.
//  * The client's max single application message size = 0xf000 (61440), stored at
//    socket-struct+0xac by FUN_00614ea0; the recv ring buffer is ~4MB. A single
//    21280-byte 0x2006 frame is WITHIN every transport limit and decodes
//    successfully (confirmed by live frida: decipher_message FUN_00645db0 ran on
//    both the 0x2004 and the 0x2006 frames).
//  * The per-subframe decode size handed to the cipher = (subframe_len - subheader)
//    - 2 and must be a multiple of the 8-byte cipher block (blowfish decipher
//    FUN_00614460 rejects a non-8-aligned size with "decipher: buffer is short").
// ---------------------------------------------------------------------------

test('transport constants match the RE-derived client limits', () => {
  assert.equal(TRANSPORT_MAX_SINGLE_MESSAGE_BYTES, 0xf000); // socket-struct+0xac (FUN_00614ea0)
  assert.equal(TRANSPORT_DECODE_BLOCK_BYTES, 8); // child-codec block; blowfish size & 7 == 0
  assert.equal(TRANSPORT_REKEY_INNER_CODE, 0x31); // router 0x31 branch = rekey marker
});

test('classify0030SingleFrame: the fixed 0x2006 session-list fits ONE 0x0030 frame', () => {
  // The 0x2006 reply inner = message32 object [u32 BE 0][u16 BE 0x2006][0x5304 body] = 21258 bytes.
  const inner = Buffer.alloc(6 + 0x5304);
  inner.writeUInt16BE(0x2006, 4);
  const result = classify0030SingleFrame(inner, { subheaderLen: 4 });
  assert.equal(result.fitsSingleFrame, true, result.reason ?? 'must fit a single frame');
  // The wire frame the server emits and the decode size the client computes:
  assert.equal(result.wireFrameBytes, 21280); // matches the observed live frame size
  assert.equal(result.clientDecodeBytes % TRANSPORT_DECODE_BLOCK_BYTES, 0); // 8-byte aligned
  assert.ok(result.clientDecodeBytes <= TRANSPORT_MAX_SINGLE_MESSAGE_BYTES);
});

test('classify0030SingleFrame: an inner above the client single-message cap is rejected', () => {
  // There is NO client reassembly path, so an inner that exceeds 0xf000 cannot be sent
  // as a 0x0030 message at all (and must NOT be "fragmented" via 0x31 — that is a rekey).
  const tooBig = Buffer.alloc(TRANSPORT_MAX_SINGLE_MESSAGE_BYTES + 0x100);
  const result = classify0030SingleFrame(tooBig, { subheaderLen: 4 });
  assert.equal(result.fitsSingleFrame, false);
  assert.match(result.reason, /single-message cap/i);
});

test('build0031RekeyInner emits a [u16 BE 0x31][key] inner (rekey, NOT data reassembly)', () => {
  const key = Buffer.from('0011223344556677', 'hex');
  const inner = build0031RekeyInner(key);
  assert.equal(inner.readUInt16BE(0), TRANSPORT_REKEY_INNER_CODE);
  assert.equal(inner.subarray(2).toString('hex'), key.toString('hex'));
  // A rekey inner is tiny and is consumed as cipher key material by the client router's
  // 0x31 branch; it is NOT a fragment of a larger logical message.
  assert.ok(inner.length <= TRANSPORT_MAX_SINGLE_MESSAGE_BYTES);
  // It round-trips through the standard 0x0030 body framing like any other inner.
  const body = build0030Body({ id: 5, innerPayload: inner });
  assert.equal(body.readUInt32BE(2), 5);
});

test('build0031RekeyInner rejects an empty key (set_key needs key material)', () => {
  assert.throws(() => build0031RekeyInner(Buffer.alloc(0)), /key/i);
});
