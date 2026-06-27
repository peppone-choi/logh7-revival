export function buildTransportFrame(code, body) {
  const frame = Buffer.alloc(body.length + 4);
  frame.writeUInt16BE(body.length + 2, 0);
  frame.writeUInt16BE(code, 2);
  body.copy(frame, 4);
  return frame;
}
