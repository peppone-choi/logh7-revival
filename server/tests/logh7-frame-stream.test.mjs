import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildTransportFrame,
  createFrameStreamParser,
  parseTransportFrame,
} from '../src/server/logh7-frame-stream.mjs';

test('TCP chunks can split one transport frame', () => {
  const parser = createFrameStreamParser();
  const frame = buildTransportFrame(0x0034, Buffer.from('01020304', 'hex'));

  assert.deepEqual(parser.push(frame.subarray(0, 3)), []);

  const frames = parser.push(frame.subarray(3));
  assert.equal(frames.length, 1);
  assert.equal(frames[0].code, 0x0034);
  assert.deepEqual(frames[0].body, Buffer.from('01020304', 'hex'));
  assert.equal(parser.bufferedBytes, 0);
});

test('one TCP chunk can contain multiple transport frames', () => {
  const parser = createFrameStreamParser();
  const first = buildTransportFrame(0x0036, Buffer.from([0xaa]));
  const second = buildTransportFrame(0x0030, Buffer.from([0xbb, 0xcc]));

  const frames = parser.push(Buffer.concat([first, second]));

  assert.equal(frames.length, 2);
  assert.deepEqual(
    frames.map((frame) => [frame.code, frame.body.toString('hex')]),
    [
      [0x0036, 'aa'],
      [0x0030, 'bbcc'],
    ],
  );
});

test('invalid transport lengths are rejected at the stream boundary', () => {
  const parser = createFrameStreamParser();
  const invalid = Buffer.from([0x00, 0x01, 0x00, 0x34]);

  assert.throws(() => parser.push(invalid), /length/);
});

test('parseTransportFrame exposes length code body and raw frame', () => {
  const raw = buildTransportFrame(0x0030, Buffer.from('abcd', 'hex'));
  const frame = parseTransportFrame(raw);

  assert.equal(frame.length, 4);
  assert.equal(frame.code, 0x0030);
  assert.deepEqual(frame.body, Buffer.from('abcd', 'hex'));
  assert.deepEqual(frame.raw, raw);
});
