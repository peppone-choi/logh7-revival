const COMMAND_OK_SIZES = new Map([
  [0x0031, 1052],
  [0x0032, 276],
  [0x0033, 1052],
]);

export function buildCommandOkDecodedBody({ responseCode, entityKey = null }) {
  const decodedSize = COMMAND_OK_SIZES.get(responseCode);
  if (decodedSize === undefined) {
    throw new Error('unsupported command OK response code');
  }
  const body = Buffer.alloc(decodedSize);
  if (entityKey !== null) {
    body[0x0c] = 1;
    body.writeUInt32LE(entityKey, 0x10);
  }
  return body;
}
