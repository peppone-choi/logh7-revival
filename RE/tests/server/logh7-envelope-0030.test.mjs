import assert from 'node:assert/strict';
import { test } from 'node:test';

import { build0030Body, compute0030Checksum, parse0030Body } from '../../src/server/logh7-envelope-0030.mjs';

// A real client transport-0x0030 body, decrypted from a live G7MTClient.exe session
// (phase1Key decode of frame 00320030...). Format: [u16 checksum][u32 id][u16 innerLen][payload].
const CLIENT_0030_BODY = Buffer.from(
  '5517' + '00000001' + '0027' +
    '700047494e370001000000070069006e006500690030003000000600640075006d006d0079000000',
  'hex',
);
// innerLen field is 0x27 = 39, though the captured body carries one trailing pad byte.
const CLIENT_INNER = CLIENT_0030_BODY.subarray(8, 8 + 0x27); // 39 bytes

test('parse0030Body validates the real client message', () => {
  const parsed = parse0030Body(CLIENT_0030_BODY);
  assert.equal(parsed.valid, true, parsed.reason ?? 'should be valid');
  assert.equal(parsed.checksum, 0x5517);
  assert.equal(parsed.id, 1);
  assert.equal(parsed.innerLen, 0x27);
  assert.equal(parsed.innerPayload.length, 0x27);
});

test('compute0030Checksum reproduces the real client checksum', () => {
  assert.equal(compute0030Checksum(CLIENT_0030_BODY.subarray(2)), 0x5517);
});

test('build0030Body round-trips the real client body byte-for-byte', () => {
  const built = build0030Body({ id: 1, innerPayload: CLIENT_INNER });
  // The captured body has one trailing pad byte beyond innerLen; compare to the un-padded prefix.
  assert.equal(built.toString('hex'), CLIENT_0030_BODY.subarray(0, 8 + 0x27).toString('hex'));
  assert.equal(built.readUInt16BE(0), 0x5517);
});

test('build0030Body output always validates', () => {
  const inner = Buffer.from('700047494e3700112233', 'hex');
  for (const id of [0, 1, 7, 0x1234]) {
    const body = build0030Body({ id, innerPayload: inner });
    const parsed = parse0030Body(body);
    assert.equal(parsed.valid, true, parsed.reason ?? 'built body must validate');
    assert.equal(parsed.id, id);
    assert.equal(parsed.innerPayload.toString('hex'), inner.toString('hex'));
  }
});

test('parse0030Body rejects a corrupted checksum', () => {
  const bad = Buffer.from(CLIENT_0030_BODY);
  bad[0] ^= 0xff;
  const parsed = parse0030Body(bad);
  assert.equal(parsed.valid, false);
  assert.match(parsed.reason, /checksum/);
});
