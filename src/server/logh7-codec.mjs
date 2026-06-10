import { readFileSync } from 'node:fs';

import { buildCommandOkDecodedBody } from './logh7-command-ok.mjs';
import { buildTransportFrame } from './logh7-transport-frame.mjs';

const IMAGE_BASE = 0x00400000;
const P_ARRAY_VA = 0x007b6ae4;
const S_BOXES_VA = 0x007b6ba8;
const TABLE_MASK = 0x91;
const P_ARRAY_DWORDS = 18;
const S_BOX_COUNT = 4;
const S_BOX_DWORDS = 256;
const BLOCK_SIZE = 8;
const UINT32 = 0xffffffff;
const PHASE1_CODE = 0x0034;
const PHASE3_CODE = 0x0035;

function u16(data, offset) {
  return data.readUInt16LE(offset);
}

function u32(data, offset) {
  return data.readUInt32LE(offset);
}

function parsePeImage(data) {
  if (data.length < 0x40 || data.subarray(0, 2).toString('ascii') !== 'MZ') {
    throw new Error('child codec source is not a PE image');
  }
  const peOffset = u32(data, 0x3c);
  if (data.length < peOffset + 0x18 || data.subarray(peOffset, peOffset + 4).toString('binary') !== 'PE\0\0') {
    throw new Error('child codec source is not a PE image');
  }
  const sectionCount = u16(data, peOffset + 6);
  const optionalHeaderSize = u16(data, peOffset + 20);
  const optionalHeader = peOffset + 24;
  const imageBase = u32(data, optionalHeader + 28);
  const sectionTable = optionalHeader + optionalHeaderSize;
  const sections = [];
  for (let index = 0; index < sectionCount; index += 1) {
    const sectionOffset = sectionTable + index * 40;
    sections.push({
      virtualSize: u32(data, sectionOffset + 8),
      virtualAddress: u32(data, sectionOffset + 12),
      rawSize: u32(data, sectionOffset + 16),
      rawPointer: u32(data, sectionOffset + 20),
    });
  }
  return { imageBase, sections };
}

function virtualAddressToOffset(image, virtualAddress) {
  const rva = virtualAddress - image.imageBase;
  for (const section of image.sections) {
    const sectionSize = Math.max(section.virtualSize, section.rawSize);
    if (section.virtualAddress <= rva && rva < section.virtualAddress + sectionSize) {
      return section.rawPointer + (rva - section.virtualAddress);
    }
  }
  throw new Error(`virtual address is not mapped in PE sections: 0x${virtualAddress.toString(16)}`);
}

function maskedDwords(data, offset, count) {
  const values = [];
  for (let index = 0; index < count; index += 1) {
    const start = offset + index * 4;
    values.push(
      ((data[start] ^ TABLE_MASK) |
        ((data[start + 1] ^ TABLE_MASK) << 8) |
        ((data[start + 2] ^ TABLE_MASK) << 16) |
        ((data[start + 3] ^ TABLE_MASK) << 24)) >>>
        0,
    );
  }
  return values;
}

export function extractChildCodecStaticTables(source) {
  const data = readFileSync(source);
  const image = parsePeImage(data);
  if (image.imageBase !== IMAGE_BASE) {
    throw new Error('child codec source has an unexpected image base');
  }
  const pOffset = virtualAddressToOffset(image, P_ARRAY_VA);
  const sOffset = virtualAddressToOffset(image, S_BOXES_VA);
  const sBoxes = [];
  for (let index = 0; index < S_BOX_COUNT; index += 1) {
    sBoxes.push(maskedDwords(data, sOffset + index * S_BOX_DWORDS * 4, S_BOX_DWORDS));
  }
  return { pArray: maskedDwords(data, pOffset, P_ARRAY_DWORDS), sBoxes };
}

function add32(left, right) {
  return (left + right) >>> 0;
}

export function childCodecRoundFunction(sBoxes, value) {
  const b0 = value & 0xff;
  const b1 = (value >>> 8) & 0xff;
  const b2 = (value >>> 16) & 0xff;
  const b3 = (value >>> 24) & 0xff;
  return add32((add32(sBoxes[1][b2], sBoxes[0][b3]) ^ sBoxes[2][b1]) >>> 0, sBoxes[3][b0]);
}

function encryptBlock(tables, left, right) {
  let l = left >>> 0;
  let r = right >>> 0;
  for (let index = 0; index < 16; index += 1) {
    l = (l ^ tables.pArray[index]) >>> 0;
    r = (r ^ childCodecRoundFunction(tables.sBoxes, l)) >>> 0;
    [l, r] = [r, l];
  }
  [l, r] = [r, l];
  r = (r ^ tables.pArray[16]) >>> 0;
  l = (l ^ tables.pArray[17]) >>> 0;
  return [l, r];
}

function decryptBlock(tables, left, right) {
  let l = left >>> 0;
  let r = right >>> 0;
  for (let index = 17; index > 1; index -= 1) {
    l = (l ^ tables.pArray[index]) >>> 0;
    r = (r ^ childCodecRoundFunction(tables.sBoxes, l)) >>> 0;
    [l, r] = [r, l];
  }
  [l, r] = [r, l];
  r = (r ^ tables.pArray[1]) >>> 0;
  l = (l ^ tables.pArray[0]) >>> 0;
  return [l, r];
}

function keyWord(key, start) {
  let cursor = start;
  let word = 0;
  for (let index = 0; index < 4; index += 1) {
    word = ((word << 8) | key[cursor]) >>> 0;
    cursor = (cursor + 1) % key.length;
  }
  return { word, cursor };
}

export function childCodecKeySchedule(tables, key) {
  if (key.length === 0) {
    throw new Error('child codec key must not be empty');
  }
  const pArray = [...tables.pArray];
  const sBoxes = tables.sBoxes.map((sBox) => [...sBox]);
  let cursor = 0;
  for (let index = 0; index < P_ARRAY_DWORDS; index += 1) {
    const result = keyWord(key, cursor);
    cursor = result.cursor;
    pArray[index] = (pArray[index] ^ result.word) >>> 0;
  }
  let scheduled = { pArray: [...pArray], sBoxes: sBoxes.map((sBox) => [...sBox]) };
  let left = 0;
  let right = 0;
  for (let index = 0; index < P_ARRAY_DWORDS; index += 2) {
    [left, right] = encryptBlock(scheduled, left, right);
    pArray[index] = left;
    pArray[index + 1] = right;
    scheduled = { pArray: [...pArray], sBoxes: sBoxes.map((sBox) => [...sBox]) };
  }
  for (let box = 0; box < S_BOX_COUNT; box += 1) {
    for (let entry = 0; entry < S_BOX_DWORDS; entry += 2) {
      [left, right] = encryptBlock(scheduled, left, right);
      sBoxes[box][entry] = left;
      sBoxes[box][entry + 1] = right;
      scheduled = { pArray: [...pArray], sBoxes: sBoxes.map((sBox) => [...sBox]) };
    }
  }
  return scheduled;
}

export function childCodecEncode(tables, data) {
  const paddedLength = data.length % BLOCK_SIZE === 0 ? data.length : data.length + (BLOCK_SIZE - (data.length % BLOCK_SIZE));
  const padded = Buffer.alloc(paddedLength);
  data.copy(padded);
  const output = Buffer.alloc(padded.length);
  for (let offset = 0; offset < padded.length; offset += BLOCK_SIZE) {
    const [left, right] = encryptBlock(tables, padded.readUInt32LE(offset), padded.readUInt32LE(offset + 4));
    output.writeUInt32LE(left, offset);
    output.writeUInt32LE(right, offset + 4);
  }
  return output;
}

export function childCodecDecode(tables, data) {
  if (data.length % BLOCK_SIZE !== 0) {
    throw new Error('child codec encoded data must be 8-byte aligned');
  }
  const output = Buffer.alloc(data.length);
  for (let offset = 0; offset < data.length; offset += BLOCK_SIZE) {
    const [left, right] = decryptBlock(tables, data.readUInt32LE(offset), data.readUInt32LE(offset + 4));
    output.writeUInt32LE(left, offset);
    output.writeUInt32LE(right, offset + 4);
  }
  return output;
}

function checksum(data) {
  let value = 0;
  let offset = 0;
  for (; offset + 4 <= data.length; offset += 4) {
    value = (value ^ data.readUInt32LE(offset)) >>> 0;
  }
  for (; offset < data.length; offset += 1) {
    value = (value ^ data[offset]) >>> 0;
  }
  return ((value >>> 16) ^ value) & 0xffff;
}

function parsePhase1DecodedPayload(data) {
  if (data.length < 8) {
    throw new Error('phase1 decoded payload is truncated');
  }
  if (data.readUInt16BE(0) !== checksum(data.subarray(2))) {
    throw new Error('phase1 decoded payload checksum mismatch');
  }
  const keyLength = data.readUInt16BE(2);
  const cursor = 4 + keyLength;
  if (data.length < cursor + 4) {
    throw new Error('phase1 decoded payload is truncated');
  }
  return { key: data.subarray(4, cursor), sequence: data.readUInt32BE(cursor) };
}

function buildPhase3DecodedPayload({ encipherKey, decipherKey, sequence }) {
  const body = Buffer.alloc(2 + encipherKey.length + 2 + decipherKey.length + 4);
  let cursor = 0;
  body.writeUInt16BE(encipherKey.length, cursor);
  cursor += 2;
  encipherKey.copy(body, cursor);
  cursor += encipherKey.length;
  body.writeUInt16BE(decipherKey.length, cursor);
  cursor += 2;
  decipherKey.copy(body, cursor);
  cursor += decipherKey.length;
  body.writeUInt32BE(sequence, cursor);
  const output = Buffer.alloc(body.length + 2);
  output.writeUInt16BE(checksum(body), 0);
  body.copy(output, 2);
  return output;
}

export function buildPhase3ResponseFromPhase1Request({ clientExe, transportKey, requestFrame, decipherKey }) {
  if (requestFrame.length < 4 || requestFrame.readUInt16BE(0) + 2 !== requestFrame.length || requestFrame.readUInt16BE(2) !== PHASE1_CODE) {
    throw new Error('phase1 request frame is invalid');
  }
  const tables = extractChildCodecStaticTables(clientExe);
  const scheduled = childCodecKeySchedule(tables, transportKey);
  const phase1 = parsePhase1DecodedPayload(childCodecDecode(scheduled, requestFrame.subarray(4)));
  const decoded = buildPhase3DecodedPayload({
    encipherKey: phase1.key,
    decipherKey,
    sequence: phase1.sequence,
  });
  return {
    frame: buildTransportFrame(PHASE3_CODE, childCodecEncode(scheduled, decoded)),
    phase1Key: Buffer.from(phase1.key),
    phase1KeyHex: phase1.key.toString('hex'),
    sequence: phase1.sequence,
  };
}

export function buildCommandOkResponseCandidate({ tables, phase1Key, responseCode, entityKey = null }) {
  return buildTransportFrame(
    responseCode,
    childCodecEncode(childCodecKeySchedule(tables, phase1Key), buildCommandOkDecodedBody({ responseCode, entityKey })),
  );
}
