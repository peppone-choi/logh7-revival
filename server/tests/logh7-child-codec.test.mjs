import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  blowfishF,
  cloneChildCodecTables,
  deobfuscateStoredKeyImage,
  decryptBlock,
  decryptBuffer,
  encryptBlock,
  encryptBuffer,
  expand0031ChildCodecKey,
  expandChildCodecKey,
  extract0031KeyMaterial,
  loadChildCodecTables,
  obfuscateStoredKeyImage,
  validateChildCodecTables,
} from '../src/server/logh7-child-codec.mjs';

const SECOND_0030_KEY_HEX =
  '47494e370001000000070069006e006500690030003000000600640075006d006d00790000';

test('static table shape P=18 S=4x256 uint32 values', () => {
  const tables = validateChildCodecTables(loadChildCodecTables());
  assert.equal(tables.pArray.length, 18);
  assert.equal(tables.sBoxes.length, 4);
  for (const sBox of tables.sBoxes) assert.equal(sBox.length, 256);
  for (const value of [...tables.pArray, ...tables.sBoxes.flat()]) {
    assert.equal(Number.isInteger(value), true);
    assert.equal(value >= 0 && value <= 0xffffffff, true);
  }
});

test('invalid table shapes are rejected', () => {
  const tables = loadChildCodecTables();
  assert.throws(() => validateChildCodecTables({ ...tables, pArray: tables.pArray.slice(1) }), /pArray/);
  assert.throws(() => validateChildCodecTables({ ...tables, sBoxes: tables.sBoxes.slice(1) }), /sBoxes/);
  assert.throws(
    () => validateChildCodecTables({ ...tables, sBoxes: [tables.sBoxes[0].slice(1), ...tables.sBoxes.slice(1)] }),
    /sBoxes\[0\]/,
  );
  assert.throws(() => validateChildCodecTables({ ...tables, pArray: [0x1_0000_0000, ...tables.pArray.slice(1)] }), /uint32/);
});

test('Blowfish F function deterministic uint32 bounded', () => {
  const tables = loadChildCodecTables();
  assert.equal(blowfishF(0x12345678, tables), blowfishF(0x12345678, tables));
  assert.notEqual(blowfishF(0x12345678, tables), blowfishF(0x12345679, tables));
  assert.equal(blowfishF(0x12345678, tables) >>> 0, blowfishF(0x12345678, tables));
});

test('encryptBlock/decryptBlock round-trip deterministic 64-bit blocks', () => {
  const tables = loadChildCodecTables();
  for (const block of [
    Buffer.from('0000000000000000', 'hex'),
    Buffer.from('0123456789abcdef', 'hex'),
    Buffer.from('47494e3700010000', 'hex'),
  ]) {
    const encrypted = encryptBlock(block, tables);
    assert.equal(encrypted.length, 8);
    assert.deepEqual(decryptBlock(encrypted, tables), block);
    assert.deepEqual(encryptBlock(block, tables), encrypted);
  }
});

test('different plaintext blocks produce different ciphertext under static table', () => {
  const tables = loadChildCodecTables();
  assert.notDeepEqual(
    encryptBlock(Buffer.from('0000000000000000', 'hex'), tables),
    encryptBlock(Buffer.from('0000000000000001', 'hex'), tables),
  );
});

test('block byte order matches x86 dword order used by the client', () => {
  const tables = expandChildCodecKey(Buffer.from(SECOND_0030_KEY_HEX, 'hex'), loadChildCodecTables());
  assert.equal(encryptBlock(Buffer.from('0011223344556677', 'hex'), tables).toString('hex'), '82b3331645971c97');
  assert.notEqual(encryptBlock(Buffer.from('0011223344556677', 'hex'), tables).toString('hex'), 'ec54df53bd93691b');
});

test('block primitive rejects non-8-byte input', () => {
  const tables = loadChildCodecTables();
  assert.throws(() => encryptBlock(Buffer.alloc(7), tables), /8 bytes/);
  assert.throws(() => decryptBlock(Buffer.alloc(9), tables), /8 bytes/);
});

test('aligned buffer codec is an independent 8-byte block loop', () => {
  const tables = expandChildCodecKey(Buffer.from(SECOND_0030_KEY_HEX, 'hex'), loadChildCodecTables());
  const plain = Buffer.from('00112233445566778899aabbccddeeff', 'hex');
  const before = Buffer.from(plain);

  const encrypted = encryptBuffer(plain, tables);

  assert.deepEqual(plain, before);
  assert.deepEqual(encrypted.subarray(0, 8), encryptBlock(plain.subarray(0, 8), tables));
  assert.deepEqual(encrypted.subarray(8, 16), encryptBlock(plain.subarray(8, 16), tables));
  assert.deepEqual(decryptBuffer(encrypted, tables), plain);
  assert.deepEqual(encryptBuffer(Buffer.alloc(0), tables), Buffer.alloc(0));
  assert.throws(() => encryptBuffer(Buffer.alloc(7), tables), /8-byte multiple/);
  assert.throws(() => decryptBuffer(Buffer.alloc(9), tables), /8-byte multiple/);
});

test('key expansion is deterministic and does not mutate static tables', () => {
  const tables = loadChildCodecTables();
  const before = cloneChildCodecTables(tables);
  const key = Buffer.from('47494e3700010000', 'hex');
  const expandedA = expandChildCodecKey(key, tables);
  const expandedB = expandChildCodecKey(key, tables);
  assert.deepEqual(tables.pArray, before.pArray);
  assert.deepEqual(tables.sBoxes, before.sBoxes);
  assert.deepEqual(expandedA, expandedB);
  assert.notDeepEqual(expandedA.pArray, before.pArray);
  assert.notDeepEqual(expandedA.sBoxes[0], before.sBoxes[0]);
});

test('key expansion changes with key material and validates inputs', () => {
  const tables = loadChildCodecTables();
  const keyA = Buffer.from('47494e3700010000', 'hex');
  const keyB = Buffer.from('47494e3700010001', 'hex');
  assert.notDeepEqual(expandChildCodecKey(keyA, tables).pArray, expandChildCodecKey(keyB, tables).pArray);
  assert.throws(() => expandChildCodecKey(Buffer.alloc(0), tables), /must not be empty/);
  assert.throws(() => expandChildCodecKey(keyA, tables, Buffer.alloc(7)), /8 bytes/);
});

test('0031 key material extraction uses documented GIN7 key vector', () => {
  const key = Buffer.from(SECOND_0030_KEY_HEX, 'hex');
  const inner = Buffer.concat([Buffer.from([0x00, 0x31]), key]);
  assert.deepEqual(extract0031KeyMaterial(inner), key);
  assert.throws(() => extract0031KeyMaterial(Buffer.concat([Buffer.from([0x70, 0x00]), key])), /0031/);
  assert.throws(() => extract0031KeyMaterial(Buffer.from([0x00, 0x31, 0x00, 0x00])), /GIN7/);
});

test('stored key image XOR 0x17 round-trips without mutating input', () => {
  const key = Buffer.from(SECOND_0030_KEY_HEX, 'hex');
  const before = Buffer.from(key);
  const stored = obfuscateStoredKeyImage(key);
  assert.notDeepEqual(stored, key);
  assert.deepEqual(key, before);
  assert.deepEqual(deobfuscateStoredKeyImage(stored), key);
  assert.equal(stored[0], key[0] ^ 0x17);
});

test('0031 key expansion wrapper matches explicit extraction', () => {
  const tables = loadChildCodecTables();
  const key = Buffer.from(SECOND_0030_KEY_HEX, 'hex');
  const inner = Buffer.concat([Buffer.from([0x00, 0x31]), key]);
  assert.deepEqual(expand0031ChildCodecKey(inner, tables), expandChildCodecKey(key, tables));
});
