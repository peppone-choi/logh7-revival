export const LOGIN_INNER_CODE = 0x7000;
export const GIN7_MAGIC = 'GIN7';

function readUtf16Units(buffer, offset, units, endian, { allowTrailingHalfNull = false } = {}) {
  const end = offset + units * 2;
  if (end > buffer.length) {
    const missing = end - buffer.length;
    const lastByte = buffer.length > offset ? buffer[buffer.length - 1] : null;
    if (!allowTrailingHalfNull || missing !== 1 || lastByte !== 0) {
      throw new RangeError(`UTF-16${endian} field ${offset}+${units * 2} exceeds ${buffer.length}`);
    }
  }
  let text = '';
  const readableEnd = Math.min(end, buffer.length - ((buffer.length - offset) % 2));
  for (let cursor = offset; cursor < readableEnd; cursor += 2) {
    text += String.fromCharCode(endian === 'LE' ? buffer.readUInt16LE(cursor) : buffer.readUInt16BE(cursor));
  }
  return text.replace(/\0+$/u, '');
}

export function parseGin7CredentialInner(inner) {
  const payload = Buffer.isBuffer(inner) ? inner : Buffer.from(inner);
  if (payload.length < 12) {
    throw new RangeError(`GIN7 credential inner ${payload.length} < 12`);
  }
  const code = payload.readUInt16BE(0);
  if (code !== LOGIN_INNER_CODE) {
    throw new RangeError(`GIN7 credential inner code expected 0x7000, got 0x${code.toString(16)}`);
  }
  const magic = payload.toString('ascii', 2, 6);
  if (magic !== GIN7_MAGIC) {
    throw new RangeError(`GIN7 credential magic expected, got ${magic}`);
  }

  const version = payload.readUInt16BE(6);
  const flags = payload.readUInt16BE(8);
  const accountUnits = payload.readUInt16BE(10);
  const accountOffset = 12;
  const passwordLengthOffset = accountOffset + accountUnits * 2;
  if (passwordLengthOffset + 2 > payload.length) {
    throw new RangeError('GIN7 credential account field truncated');
  }
  const passwordUnits = payload.readUInt16LE(passwordLengthOffset);
  const passwordOffset = passwordLengthOffset + 2;

  return {
    code,
    magic,
    version,
    flags,
    accountUnits,
    account: readUtf16Units(payload, accountOffset, accountUnits, 'BE'),
    passwordUnits,
    password: readUtf16Units(payload, passwordOffset, passwordUnits, 'LE', { allowTrailingHalfNull: true }),
    rawHex: payload.toString('hex'),
  };
}
