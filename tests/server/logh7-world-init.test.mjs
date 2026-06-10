import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'node:test';

import {
  buildPhase3ResponseFromPhase1Request,
  childCodecDecode,
  childCodecKeySchedule,
  extractChildCodecStaticTables,
} from '../../src/server/logh7-codec.mjs';
import { buildWorldInitCandidateFrames } from '../../src/server/logh7-world-init.mjs';

const clientExe = path.resolve('.omo/work/logh7-installed/exe/G7MTClient.exe');
const transportKey = Buffer.from(
  '7b41344331333734382d303135392d346335342d414542332d3144363835373537363142337d',
  'hex',
);
const requestFrame = Buffer.from('001a003422785b40fcdcf830b86fbd86cbc8cd0a4771041b05b0873c', 'hex');

test('builds world and grid init candidates from the live phase1 key', () => {
  const phase3 = buildPhase3ResponseFromPhase1Request({
    clientExe,
    transportKey,
    requestFrame,
    decipherKey: Buffer.from('XY', 'ascii'),
  });
  const tables = extractChildCodecStaticTables(clientExe);

  const frames = buildWorldInitCandidateFrames({ tables, phase1Key: phase3.phase1Key });

  assert.equal(frames.length, 2);
  assert.equal(frames[0].messageName, 'ResponseWorldInitialize');
  assert.equal(frames[0].queuedInternalCode, 0x0f00);
  assert.equal(frames[0].pairedInternalCode, 0x0f01);
  assert.equal(frames[0].frame.readUInt16BE(2), 0x0013);
  assert.equal(frames[1].messageName, 'ResponseGridInitialize');
  assert.equal(frames[1].queuedInternalCode, 0x0f02);
  assert.equal(frames[1].pairedInternalCode, 0x0f03);
  assert.equal(frames[1].frame.readUInt16BE(2), 0x0014);
  const scheduled = childCodecKeySchedule(tables, phase3.phase1Key);
  assert.equal(childCodecDecode(scheduled, frames[0].frame.subarray(4))[0], 1);
  assert.equal(childCodecDecode(scheduled, frames[1].frame.subarray(4))[0], 1);
});
