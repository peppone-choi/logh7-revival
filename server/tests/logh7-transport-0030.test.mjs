import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  decode0030Frame,
  encode0030Frame,
} from '../src/server/logh7-transport-0030.mjs';
import {
  build0030Body,
  deframe0030,
  frame0030,
  TRANSPORT_CODE_0030,
} from '../src/server/logh7-envelope-0030.mjs';
import {
  decryptBuffer,
  encryptBuffer,
  expandChildCodecKey,
  loadChildCodecTables,
} from '../src/server/logh7-child-codec.mjs';

const KEY_VECTOR = Buffer.from(
  '47494e370001000000070069006e006500690030003000000600640075006d006d00790000',
  'hex',
);

function transportTables() {
  return expandChildCodecKey(KEY_VECTOR, loadChildCodecTables());
}

test('0x0030 transport frame round-trips an aligned inner payload', () => {
  const tables = transportTables();
  const inner = Buffer.from('7000010203040506', 'hex');

  const frame = encode0030Frame({ id: 0x11223344, inner, tables });
  const decoded = decode0030Frame(frame, tables);

  assert.equal(decoded.id, 0x11223344);
  assert.equal(decoded.innerLen, inner.length);
  assert.deepEqual(decoded.inner, inner);
});

test('encoded frame is length/code plus encrypted 0x0030 body', () => {
  const tables = transportTables();
  const inner = Buffer.from('7000aabbccddeeff', 'hex');
  const body = build0030Body({ id: 9, inner });

  const frame = encode0030Frame({ id: 9, inner, tables });
  const { encBody: encryptedBody } = deframe0030(frame);

  assert.equal(frame.readUInt16BE(0), 2 + encryptedBody.length);
  assert.equal(frame.readUInt16BE(2), TRANSPORT_CODE_0030);
  assert.notDeepEqual(encryptedBody, body);
  assert.deepEqual(decryptBuffer(encryptedBody, tables), body);
});

test('non-aligned 0x0030 body is rejected before encryption', () => {
  const tables = transportTables();
  const inner = Buffer.from('700001', 'hex');

  assert.throws(
    () => encode0030Frame({ id: 1, inner, tables }),
    /8-byte aligned/,
  );
});

test('corrupted encrypted body is rejected while decoding', () => {
  const tables = transportTables();
  const frame = encode0030Frame({
    id: 3,
    inner: Buffer.from('7000010203040506', 'hex'),
    tables,
  });
  const corrupted = Buffer.from(frame);
  corrupted[corrupted.length - 1] ^= 0xff;

  assert.throws(
    () => decode0030Frame(corrupted, tables),
    /0030|8-byte multiple/,
  );
});

test('encrypted body with bad plaintext checksum is rejected', () => {
  const tables = transportTables();
  const body = build0030Body({
    id: 4,
    inner: Buffer.from('7000010203040506', 'hex'),
  });
  body[0] ^= 0xff;

  const frame = frame0030(encryptBuffer(body, tables));

  assert.throws(
    () => decode0030Frame(frame, tables),
    /checksum|불일치/,
  );
});
