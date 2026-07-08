import { readFileSync } from 'node:fs';

const DEFAULT_TABLES_URL = new URL('../../content/crypto/child-codec-tables.json', import.meta.url);
const BLOCK_BYTES = 8;
const GIN7_MAGIC_HEX = '47494e37';
const INNER_CODE_0031 = 0x0031;
const KEY_IMAGE_XOR = 0x17;
const U32_MAX = 0xffffffff;

export function u32(value) {
  return value >>> 0;
}

export function addU32(a, b) {
  return (a + b) >>> 0;
}

function validateUint32List(name, values, expectedLength) {
  if (!Array.isArray(values) || values.length !== expectedLength) {
    throw new TypeError(`${name} must contain ${expectedLength} uint32 values`);
  }
  for (const [index, value] of values.entries()) {
    if (!Number.isInteger(value) || value < 0 || value > U32_MAX) {
      throw new TypeError(`${name}[${index}] must be uint32`);
    }
  }
}

function validateSBoxes(sBoxes) {
  if (!Array.isArray(sBoxes) || sBoxes.length !== 4) {
    throw new TypeError('sBoxes must contain 4 tables');
  }
  for (const [index, sBox] of sBoxes.entries()) {
    validateUint32List(`sBoxes[${index}]`, sBox, 256);
  }
}

export function validateChildCodecTables(tables) {
  if (!tables || typeof tables !== 'object') {
    throw new TypeError('child-codec tables must be an object');
  }
  validateUint32List('pArray', tables.pArray, 18);
  validateSBoxes(tables.sBoxes);
  return tables;
}

export function cloneChildCodecTables(tables) {
  const valid = validateChildCodecTables(tables);
  return {
    pArray: valid.pArray.slice(),
    sBoxes: valid.sBoxes.map((sBox) => sBox.slice()),
  };
}

export function loadChildCodecTables(pathOrUrl = DEFAULT_TABLES_URL) {
  return validateChildCodecTables(JSON.parse(readFileSync(pathOrUrl, 'utf8')));
}

function blowfishFUnchecked(word, sBoxes) {
  const a = (word >>> 24) & 0xff;
  const b = (word >>> 16) & 0xff;
  const c = (word >>> 8) & 0xff;
  const d = word & 0xff;
  return addU32((addU32(sBoxes[0][a], sBoxes[1][b]) ^ sBoxes[2][c]) >>> 0, sBoxes[3][d]);
}

export function blowfishF(word, tables) {
  const { sBoxes } = validateChildCodecTables(tables);
  return blowfishFUnchecked(word >>> 0, sBoxes);
}

function readBlock(block) {
  if (!Buffer.isBuffer(block) || block.length !== BLOCK_BYTES) {
    throw new RangeError('child-codec block must be exactly 8 bytes');
  }
  return [block.readUInt32LE(0), block.readUInt32LE(4)];
}

function writeBlock(left, right) {
  const out = Buffer.allocUnsafe(BLOCK_BYTES);
  out.writeUInt32LE(left >>> 0, 0);
  out.writeUInt32LE(right >>> 0, 4);
  return out;
}

function encryptWords(left, right, tables) {
  const { pArray, sBoxes } = validateChildCodecTables(tables);
  let l = left >>> 0;
  let r = right >>> 0;
  for (let i = 0; i < 16; i += 1) {
    l = (l ^ pArray[i]) >>> 0;
    r = (r ^ blowfishFUnchecked(l, sBoxes)) >>> 0;
    [l, r] = [r, l];
  }
  [l, r] = [r, l];
  r = (r ^ pArray[16]) >>> 0;
  l = (l ^ pArray[17]) >>> 0;
  return [l, r];
}

function decryptWords(left, right, tables) {
  const { pArray, sBoxes } = validateChildCodecTables(tables);
  let l = left >>> 0;
  let r = right >>> 0;
  for (let i = 17; i >= 2; i -= 1) {
    l = (l ^ pArray[i]) >>> 0;
    r = (r ^ blowfishFUnchecked(l, sBoxes)) >>> 0;
    [l, r] = [r, l];
  }
  [l, r] = [r, l];
  r = (r ^ pArray[1]) >>> 0;
  l = (l ^ pArray[0]) >>> 0;
  return [l, r];
}

export function encryptBlock(block, tables) {
  const [left, right] = readBlock(block);
  return writeBlock(...encryptWords(left, right, tables));
}

export function decryptBlock(block, tables) {
  const [left, right] = readBlock(block);
  return writeBlock(...decryptWords(left, right, tables));
}

function assertAlignedBuffer(buffer, operation) {
  if (buffer.length % BLOCK_BYTES !== 0) {
    throw new RangeError(`${operation} input length must be an 8-byte multiple`);
  }
}

function transformAlignedBuffer(buffer, tables, transformBlock, operation) {
  const input = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  assertAlignedBuffer(input, operation);
  const out = Buffer.alloc(input.length);
  for (let offset = 0; offset < input.length; offset += BLOCK_BYTES) {
    transformBlock(input.subarray(offset, offset + BLOCK_BYTES), tables).copy(out, offset);
  }
  return out;
}

export function encryptBuffer(buffer, tables) {
  return transformAlignedBuffer(buffer, tables, encryptBlock, 'child-codec encrypt');
}

export function decryptBuffer(buffer, tables) {
  return transformAlignedBuffer(buffer, tables, decryptBlock, 'child-codec decrypt');
}

function keyWord(key, offset) {
  let word = 0;
  for (let i = 0; i < 4; i += 1) {
    word = ((word << 8) | key[(offset + i) % key.length]) >>> 0;
  }
  return word;
}

export function expandChildCodecKey(keyBytes, tables = loadChildCodecTables(), initialBlock = Buffer.alloc(BLOCK_BYTES)) {
  const key = Buffer.isBuffer(keyBytes) ? keyBytes : Buffer.from(keyBytes);
  if (key.length === 0) {
    throw new RangeError('child-codec key must not be empty');
  }
  const expanded = cloneChildCodecTables(tables);
  for (let i = 0; i < expanded.pArray.length; i += 1) {
    expanded.pArray[i] = (expanded.pArray[i] ^ keyWord(key, i * 4)) >>> 0;
  }
  let [left, right] = readBlock(initialBlock);
  for (let i = 0; i < expanded.pArray.length; i += 2) {
    [left, right] = encryptWords(left, right, expanded);
    expanded.pArray[i] = left;
    expanded.pArray[i + 1] = right;
  }
  for (const sBox of expanded.sBoxes) {
    for (let i = 0; i < sBox.length; i += 2) {
      [left, right] = encryptWords(left, right, expanded);
      sBox[i] = left;
      sBox[i + 1] = right;
    }
  }
  return expanded;
}

export function obfuscateStoredKeyImage(keyBytes) {
  const key = Buffer.isBuffer(keyBytes) ? keyBytes : Buffer.from(keyBytes);
  return Buffer.from(key.map((byte) => byte ^ KEY_IMAGE_XOR));
}

export function deobfuscateStoredKeyImage(storedBytes) {
  return obfuscateStoredKeyImage(storedBytes);
}

export function extract0031KeyMaterial(inner) {
  const payload = Buffer.isBuffer(inner) ? inner : Buffer.from(inner);
  if (payload.length < 2) {
    throw new RangeError('0031 inner payload must include a 2-byte code');
  }
  const code = payload.readUInt16BE(0);
  if (code !== INNER_CODE_0031) {
    throw new RangeError(`0031 inner code expected, got 0x${code.toString(16)}`);
  }
  const key = payload.subarray(2);
  if (key.length < 4 || key.subarray(0, 4).toString('hex') !== GIN7_MAGIC_HEX) {
    throw new RangeError('0031 key material must start with GIN7');
  }
  return key;
}

export function expand0031ChildCodecKey(inner, tables = loadChildCodecTables()) {
  return expandChildCodecKey(extract0031KeyMaterial(inner), tables);
}
