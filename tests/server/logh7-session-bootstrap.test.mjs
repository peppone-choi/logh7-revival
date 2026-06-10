import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'node:test';

import {
  buildEncryptedSessionBootstrapCandidateFrames,
  buildSessionBootstrapCandidateFrames,
} from '../../src/server/logh7-session-bootstrap.mjs';
import {
  buildPhase3ResponseFromPhase1Request,
  childCodecDecode,
  childCodecKeySchedule,
  extractChildCodecStaticTables,
} from '../../src/server/logh7-codec.mjs';

const clientExe = path.resolve('.omo/work/logh7-installed/exe/G7MTClient.exe');
const transportKey = Buffer.from(
  '7b41344331333734382d303135392d346335342d414542332d3144363835373537363142337d',
  'hex',
);
const requestFrame = Buffer.from('001a003422785b40fcdcf830b86fbd86cbc8cd0a4771041b05b0873c', 'hex');

test('builds raw session bootstrap candidates that precede cipher-gated world frames', () => {
  const frames = buildSessionBootstrapCandidateFrames();

  assert.equal(frames.length, 2);
  assert.equal(frames[0].messageName, 'SSLoginOK');
  assert.equal(frames[0].transportCode, 0x0001);
  assert.equal(frames[0].queuedInternalCode, 0x0200);
  assert.equal(frames[0].pairedInternalCode, 0x0201);
  assert.equal(frames[0].frame.toString('hex'), '0003000101');
  assert.equal(frames[1].messageName, 'SSGameLoginOK');
  assert.equal(frames[1].transportCode, 0x0003);
  assert.equal(frames[1].queuedInternalCode, 0x0205);
  assert.equal(frames[1].pairedInternalCode, 0x0206);
  assert.equal(frames[1].stateWrite, 'client+0x35837e byte = 1');
  assert.equal(frames[1].frame.toString('hex'), '0003000301');
});

test('builds raw session bootstrap candidates with selected decoded body', () => {
  const frames = buildSessionBootstrapCandidateFrames({ decodedBody: Buffer.from([1, 0, 0, 0]) });

  assert.equal(frames[0].decodedBodyHex, '01000000');
  assert.equal(frames[0].frame.toString('hex'), '0006000101000000');
  assert.equal(frames[1].frame.toString('hex'), '0006000301000000');
});

test('builds encrypted session bootstrap candidates from the live phase1 key', () => {
  const phase3 = buildPhase3ResponseFromPhase1Request({
    clientExe,
    transportKey,
    requestFrame,
    decipherKey: Buffer.from('XY', 'ascii'),
  });
  const tables = extractChildCodecStaticTables(clientExe);

  const frames = buildEncryptedSessionBootstrapCandidateFrames({ tables, phase1Key: phase3.phase1Key });

  assert.equal(frames.length, 2);
  assert.equal(frames[0].transportCode, 0x0001);
  assert.equal(frames[1].transportCode, 0x0003);
  assert.equal(frames[0].frame.readUInt16BE(2), 0x0001);
  assert.equal(frames[1].frame.readUInt16BE(2), 0x0003);
  const scheduled = childCodecKeySchedule(tables, phase3.phase1Key);
  assert.equal(childCodecDecode(scheduled, frames[0].frame.subarray(4))[0], 1);
  assert.equal(childCodecDecode(scheduled, frames[1].frame.subarray(4))[0], 1);
});
