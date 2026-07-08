import {
  build0030Body,
  deframe0030,
  frame0030,
  parse0030Body,
} from './logh7-envelope-0030.mjs';
import {
  decryptBuffer,
  encryptBuffer,
} from './logh7-child-codec.mjs';

const BLOCK_BYTES = 8;

function assertAligned0030Body(body) {
  if (body.length % BLOCK_BYTES !== 0) {
    throw new RangeError(`0030 body length ${body.length} is not 8-byte aligned`);
  }
}

export function encode0030Frame({ id, inner, tables }) {
  const body = build0030Body({ id, inner });
  assertAligned0030Body(body);
  return frame0030(encryptBuffer(body, tables));
}

export function decode0030Frame(frame, tables) {
  const { encBody } = deframe0030(frame);
  const body = decryptBuffer(encBody, tables);
  return parse0030Body(body);
}
