import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseGin7CredentialInner } from '../src/server/logh7-gin7-credential.mjs';

const LIVE_INNER_HEX = '700047494e370001000000070069006e006500690030003000000600640075006d006d00790000';

test('parses live GIN7 credential inner payload', () => {
  const credential = parseGin7CredentialInner(Buffer.from(LIVE_INNER_HEX, 'hex'));

  assert.equal(credential.code, 0x7000);
  assert.equal(credential.magic, 'GIN7');
  assert.equal(credential.version, 1);
  assert.equal(credential.flags, 0);
  assert.equal(credential.account, 'inei00');
  assert.equal(credential.accountUnits, 7);
  assert.equal(credential.password, 'dummy');
  assert.equal(credential.passwordUnits, 6);
});

test('rejects non-GIN7 credential payloads', () => {
  assert.throws(() => parseGin7CredentialInner(Buffer.from('700147494e37000100000000', 'hex')), /0x7000/);
  assert.throws(() => parseGin7CredentialInner(Buffer.from('70004e4f5045000100000000', 'hex')), /GIN7/);
});
