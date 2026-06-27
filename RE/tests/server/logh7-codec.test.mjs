import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'node:test';

import {
  buildCommandOkResponseCandidate,
  buildPhase3ResponseFromPhase1Request,
  childCodecDecode,
  childCodecKeySchedule,
  resolveChildCodecTables,
} from '../../src/server/logh7-codec.mjs';

const clientExe = path.resolve('.omo/work/logh7-installed/exe/G7MTClient.exe');
const transportKey = Buffer.from(
  '7b41344331333734382d303135392d346335342d414542332d3144363835373537363142337d',
  'hex',
);
const requestFrame = Buffer.from('001a003422785b40fcdcf830b86fbd86cbc8cd0a4771041b05b0873c', 'hex');

test('builds phase3 response from a live phase1 request vector', () => {
  const result = buildPhase3ResponseFromPhase1Request({
    clientExe,
    transportKey,
    requestFrame,
    decipherKey: Buffer.from('XY', 'ascii'),
  });

  assert.equal(result.phase1KeyHex, 'dbb2f9ab333223792a6f45be98af2773');
  assert.equal(
    result.frame.toString('hex'),
    '002200352ed7f2cb65cff5e9b86fbd86cbc8cd0a7a9b9d134ad79005d3c14951975330d7',
  );
});

test('builds command OK candidate from the live phase1 key', () => {
  const tables = resolveChildCodecTables({ clientExe });
  const phase3 = buildPhase3ResponseFromPhase1Request({
    clientExe,
    transportKey,
    requestFrame,
    decipherKey: Buffer.from('XY', 'ascii'),
  });

  const frame = buildCommandOkResponseCandidate({
    tables,
    phase1Key: phase3.phase1Key,
    responseCode: 0x0031,
  });

  assert.equal(frame.length, 1060);
  assert.equal(frame.readUInt16BE(0), 1058);
  assert.equal(frame.readUInt16BE(2), 0x0031);
  const scheduled = childCodecKeySchedule(tables, phase3.phase1Key);
  assert.equal(childCodecDecode(scheduled, frame.subarray(4)).subarray(0, 1052).toString('hex'), Buffer.alloc(1052).toString('hex'));
});

test('builds one-entry command OK candidate from the live phase1 key', () => {
  const tables = resolveChildCodecTables({ clientExe });
  const phase3 = buildPhase3ResponseFromPhase1Request({
    clientExe,
    transportKey,
    requestFrame,
    decipherKey: Buffer.from('XY', 'ascii'),
  });

  const frame = buildCommandOkResponseCandidate({
    tables,
    phase1Key: phase3.phase1Key,
    responseCode: 0x0032,
    entityKey: 0x12345678,
  });

  const scheduled = childCodecKeySchedule(tables, phase3.phase1Key);
  const decoded = childCodecDecode(scheduled, frame.subarray(4)).subarray(0, 276);
  assert.equal(decoded[0x0c], 1);
  assert.equal(decoded.readUInt32LE(0x10), 0x12345678);
});
