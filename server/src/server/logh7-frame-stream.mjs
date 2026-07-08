const MIN_FRAME_LENGTH = 2;
const HEADER_BYTES = 4;
const U16_MAX = 0xffff;

export function buildTransportFrame(code, body = Buffer.alloc(0)) {
  if (!Number.isInteger(code) || code < 0 || code > U16_MAX) {
    throw new RangeError(`transport code out of range: ${code}`);
  }
  const payload = Buffer.isBuffer(body) ? body : Buffer.from(body);
  const length = MIN_FRAME_LENGTH + payload.length;
  if (length > U16_MAX) {
    throw new RangeError(`transport frame length ${length} > ${U16_MAX}`);
  }
  const frame = Buffer.allocUnsafe(HEADER_BYTES + payload.length);
  frame.writeUInt16BE(length, 0);
  frame.writeUInt16BE(code, 2);
  payload.copy(frame, 4);
  return frame;
}

export function parseTransportFrame(frame) {
  const raw = Buffer.isBuffer(frame) ? frame : Buffer.from(frame);
  if (raw.length < HEADER_BYTES) {
    throw new RangeError(`transport frame ${raw.length} < ${HEADER_BYTES}`);
  }
  const length = raw.readUInt16BE(0);
  if (length < MIN_FRAME_LENGTH) {
    throw new RangeError(`transport frame length ${length} < ${MIN_FRAME_LENGTH}`);
  }
  const totalLength = length + 2;
  if (raw.length !== totalLength) {
    throw new RangeError(`transport frame length ${length} does not match ${raw.length}`);
  }
  return {
    length,
    code: raw.readUInt16BE(2),
    body: raw.subarray(4),
    raw,
  };
}

export function createFrameStreamParser({ maxFrameLength = U16_MAX } = {}) {
  let buffered = Buffer.alloc(0);

  return {
    push(chunk) {
      const input = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      buffered = buffered.length === 0 ? Buffer.from(input) : Buffer.concat([buffered, input]);
      const frames = [];

      while (buffered.length >= HEADER_BYTES) {
        const length = buffered.readUInt16BE(0);
        if (length < MIN_FRAME_LENGTH) {
          throw new RangeError(`transport frame length ${length} < ${MIN_FRAME_LENGTH}`);
        }
        if (length > maxFrameLength) {
          throw new RangeError(`transport frame length ${length} > ${maxFrameLength}`);
        }

        const totalLength = length + 2;
        if (buffered.length < totalLength) break;

        const raw = Buffer.from(buffered.subarray(0, totalLength));
        frames.push(parseTransportFrame(raw));
        buffered = buffered.subarray(totalLength);
      }

      return frames;
    },

    get bufferedBytes() {
      return buffered.length;
    },
  };
}
