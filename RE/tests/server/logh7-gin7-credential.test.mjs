import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  buildGin7Credential,
  isLoginCredentialInner,
  parseGin7Credential,
  LOGIN_INNER_CODE,
} from '../../src/server/logh7-login-protocol.mjs';
import { parse0030Body, build0030Body } from '../../src/server/logh7-envelope-0030.mjs';

// The byte-exact ground truth: the decoded 0x0030 login body captured from the REAL G7MTClient for
// account "inei00" / password "dummy" (tools/tests/test_logh7_post_handshake_body.py, DECODED_0030).
// The envelope declares innerLen = 0x27 (39), so the session/registry receive the first 39 bytes.
const CAPTURED_0030_BODY_HEX =
  '5517000000010027700047494e370001000000070069006e006500690030003000000600640075006d006d0079000000';
// innerPayload = body[8 : 8+innerLen] (39 bytes) — what authenticate()/register()/verify() hash.
const CAPTURED_INNER_HEX =
  '700047494e370001000000070069006e006500690030003000000600640075006d006d00790000';

test('buildGin7Credential reproduces the real captured login blob byte-for-byte', () => {
  const inner = buildGin7Credential({ account: 'inei00', password: 'dummy' });
  assert.equal(inner.toString('hex'), CAPTURED_INNER_HEX);
});

test('encoded blob is the exact innerPayload the 0x0030 envelope extracts from the real capture', () => {
  const parsed = parse0030Body(Buffer.from(CAPTURED_0030_BODY_HEX, 'hex'));
  assert.equal(parsed.valid, true, parsed.reason ?? 'capture must parse as a valid 0x0030 body');
  const inner = buildGin7Credential({ account: 'inei00', password: 'dummy' });
  assert.deepEqual(Buffer.from(inner), Buffer.from(parsed.innerPayload));
});

test('encoded blob is a well-formed GIN7 credential (inner code 0x7000 + magic)', () => {
  const inner = buildGin7Credential({ account: 'admin', password: 'secret' });
  assert.equal(isLoginCredentialInner(inner), true);
  assert.equal(inner.readUInt16BE(0), LOGIN_INNER_CODE);
  assert.equal(inner.toString('ascii', 2, 6), 'GIN7');
});

test('round-trip: parseGin7Credential recovers the account label from the encoder output', () => {
  for (const account of ['inei00', 'admin', 'Player1', 'a', 'TwelveChars1', 'mix_ED.99']) {
    const inner = buildGin7Credential({ account, password: 'whatever-Pass99' });
    const parsed = parseGin7Credential(inner);
    assert.equal(parsed.accountLabel, account, `round-trip failed for account ${account}`);
  }
});

test('the same (account,password) always encodes to the same deterministic blob', () => {
  const a = buildGin7Credential({ account: 'inei00', password: 'dummy' });
  const b = buildGin7Credential({ account: 'inei00', password: 'dummy' });
  assert.equal(a.toString('hex'), b.toString('hex'));
});

test('different passwords for the same account produce different blobs', () => {
  const a = buildGin7Credential({ account: 'inei00', password: 'dummy' });
  const b = buildGin7Credential({ account: 'inei00', password: 'dummy2' });
  assert.notEqual(a.toString('hex'), b.toString('hex'));
});

test('the encoded innerPayload wraps back into a self-consistent 0x0030 body', () => {
  // Re-wrapping the encoder output as a 0x0030 body and parsing it must yield the same innerPayload,
  // proving the encoder produces the session-form (innerLen-truncated) blob, not the natural one.
  const inner = buildGin7Credential({ account: 'inei00', password: 'dummy' });
  const body = build0030Body({ id: 1, innerPayload: inner });
  const parsed = parse0030Body(body);
  assert.equal(parsed.valid, true, parsed.reason ?? '');
  assert.equal(parsed.innerLen, inner.length);
  assert.deepEqual(Buffer.from(parsed.innerPayload), Buffer.from(inner));
});

test('buildGin7Credential rejects an empty account and a non-string password', () => {
  assert.throws(() => buildGin7Credential({ account: '', password: 'x' }), TypeError);
  assert.throws(() => buildGin7Credential({ account: 'a', password: 123 }), TypeError);
});
