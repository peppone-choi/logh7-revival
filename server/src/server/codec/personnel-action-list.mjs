// 0x0356 NotifyInformationCharacter의 compact stream 코덱.
// 클라이언트 FUN_0042c7e0가 가변 길이 stream을 0x2d8 native 객체로 확장한다.

export const CODE_NOTIFY_INFORMATION_CHARACTER = 0x0356;
export const NOTIFY_INFORMATION_CHARACTER_BYTES = 0x2d8;
export const MAX_AUTHORITY_CARDS_PER_CHARACTER = 16;

function message32(code, payload) {
  const body = Buffer.isBuffer(payload) ? payload : Buffer.from(payload ?? []);
  const inner = Buffer.alloc(6 + body.length);
  inner.writeUInt32BE(0, 0);
  inner.writeUInt16BE(code & 0xffff, 4);
  body.copy(inner, 6);
  return inner;
}
function characterCodes(value, max) {
  if (value == null) return [];
  return [...String(value)].slice(0, max).map((ch) => ch.charCodeAt(0) & 0xffff);
}

function streamU8(parts, value) {
  parts.push(Buffer.from([(value ?? 0) & 0xff]));
}

function streamU16(parts, value, wireEndian) {
  const item = Buffer.alloc(2);
  if (wireEndian === 'le') item.writeUInt16LE((value ?? 0) & 0xffff, 0);
  else item.writeUInt16BE((value ?? 0) & 0xffff, 0);
  parts.push(item);
}

function streamU32(parts, value, wireEndian) {
  const item = Buffer.alloc(4);
  if (wireEndian === 'le') item.writeUInt32LE((value ?? 0) >>> 0, 0);
  else item.writeUInt32BE((value ?? 0) >>> 0, 0);
  parts.push(item);
}

function streamBytes(parts, length) {
  parts.push(Buffer.alloc(length));
}

function writeUtf16CodeStream(parts, codes, wireEndian) {
  for (const code of codes) streamU16(parts, code, wireEndian);
}

function writePstr16Stream(parts, value, max, wireEndian) {
  const codes = characterCodes(value ?? '', max);
  streamU8(parts, codes.length);
  writeUtf16CodeStream(parts, codes, wireEndian);
}

/**
 * 0x0356 compact stream을 만든다. 기본 BE 수치/문자 순서는 old 2bffc4f5
 * personnel-records.mjs와 동일하며, native object를 직접 보내지 않는다.
 */
export function buildNotifyInformationCharacterInner({
  characterId = 1,
  gridUnitId = 0,
  power = null,
  spot = null,
  spotOwner = null,
  abilities = null,
  online = false,
  camp = null,
  state = null,
  fame = null,
  pcp = null,
  mcp = null,
  money = null,
  influence = null,
  stamina = null,
  blood = null,
  lastname = null,
  firstname = null,
  displayName = null,
  rank = null,
  title = null,
  face = null,
  cardEntries = null,
  coupConduct = null,
  spotResolverBase = null,
  together = null,
  wireEndian = 'be',
} = {}) {
  const parts = [];
  const nativeDisplayName = displayName ?? (
    lastname != null && firstname != null ? `${lastname} ${firstname}` : lastname ?? firstname
  );
  const trayNameCodes = characterCodes(nativeDisplayName ?? '', 13);
  const resolvedSpotOwner = Number.isInteger(spotOwner) ? spotOwner : gridUnitId;

  streamU8(parts, 1); // valid/type
  streamU32(parts, characterId, wireEndian);
  streamU8(parts, Number.isInteger(power) ? power : 0);
  streamU8(parts, Number.isInteger(camp) ? camp : 0);
  streamU8(parts, Number.isInteger(state) ? state : 0);
  streamU8(parts, 0);
  streamU32(parts, Number.isInteger(spot) ? spot : 0, wireEndian);
  streamU8(parts, 0); // birthday month
  streamU8(parts, 0); // birthday day
  streamU32(parts, Number.isInteger(fame) ? fame : 0, wireEndian);
  streamU16(parts, 0, wireEndian);
  streamU32(parts, Number.isInteger(spot) ? spot : 0, wireEndian); // return base
  streamU32(parts, Number.isInteger(spot) ? spot : 0, wireEndian); // current spot
  streamU32(parts, Number.isInteger(resolvedSpotOwner) ? resolvedSpotOwner : 0, wireEndian);
  streamU32(parts, gridUnitId, wireEndian);
  streamU8(parts, trayNameCodes.length);
  writeUtf16CodeStream(parts, trayNameCodes, wireEndian);

  streamU32(parts, 0, wireEndian); // strategy
  streamU32(parts, Number.isInteger(coupConduct) ? coupConduct : 0, wireEndian);
  streamU32(parts, Number.isInteger(pcp) ? pcp : 0, wireEndian);
  streamU32(parts, Number.isInteger(mcp) ? mcp : 0, wireEndian);
  streamU32(parts, 0, wireEndian); // achievement
  streamU32(parts, 0, wireEndian); // evaluation
  streamU16(parts, 0, wireEndian); // sendmail
  for (let i = 0; i < 6; i += 1) streamU8(parts, 0); // AI flags
  streamU8(parts, online ? 1 : 0);
  streamU32(parts, Number.isInteger(money) ? money : 0, wireEndian);
  streamBytes(parts, 0x10); // decoration bitset
  streamU8(parts, 0); // arrested

  const hasTitle = title != null && String(title).length > 0;
  const hasParentage = lastname != null || firstname != null || nativeDisplayName != null
    || Number.isInteger(rank) || hasTitle || Number.isInteger(face);
  streamU8(parts, hasParentage ? 1 : 0);
  if (hasParentage) {
    streamU8(parts, 1); // parentage[0] valid
    writePstr16Stream(parts, lastname ?? '', 13, wireEndian);
    writePstr16Stream(parts, firstname ?? '', 13, wireEndian);
    writePstr16Stream(parts, nativeDisplayName ?? '', 13, wireEndian);
    streamU16(parts, Number.isInteger(blood) ? blood : 0, wireEndian);
    streamU16(parts, Number.isInteger(rank) ? rank : 0, wireEndian);
    writePstr16Stream(parts, hasTitle ? String(title) : '', 13, wireEndian);
    streamU32(parts, Number.isInteger(face) ? face : 0, wireEndian);
    streamU32(parts, 0, wireEndian); // rival
    streamU32(parts, Number.isInteger(spotResolverBase) ? spotResolverBase : 0, wireEndian);
    streamU32(parts, 0, wireEndian); // achievement
  }

  for (let i = 0; i < 8; i += 1) {
    streamU16(parts, Array.isArray(abilities) ? abilities[i] ?? 0 : 0, wireEndian);
    streamU16(parts, 0, wireEndian);
  }
  streamU8(parts, Number.isInteger(influence) ? influence : 0);
  streamU8(parts, Number.isInteger(stamina) ? stamina : 0);
  streamU8(parts, 0); // special ability count
  if (cardEntries != null && !Array.isArray(cardEntries)) {
    throw new TypeError('cardEntries must be an array');
  }
  const cards = cardEntries ?? [];
  if (cards.length > MAX_AUTHORITY_CARDS_PER_CHARACTER) {
    throw new RangeError(`at most ${MAX_AUTHORITY_CARDS_PER_CHARACTER} authority cards are allowed`);
  }
  streamU8(parts, cards.length);
  for (const [index, entry] of cards.entries()) {
    const kind = entry?.kind;
    const cardSpot = entry?.spot ?? 0;
    if (!Number.isInteger(kind) || kind < 0 || kind > 0xffff) {
      throw new RangeError(`cardEntries[${index}].kind must be an unsigned 16-bit integer`);
    }
    if (!Number.isInteger(cardSpot) || cardSpot < 0 || cardSpot > 0xffffffff) {
      throw new RangeError(`cardEntries[${index}].spot must be an unsigned 32-bit integer`);
    }
    streamU16(parts, kind, wireEndian);
    streamU32(parts, cardSpot, wireEndian);
  }
  streamU8(parts, Number.isInteger(together) ? together : 0);
  return message32(CODE_NOTIFY_INFORMATION_CHARACTER, Buffer.concat(parts));
}

/** compact stream을 old native object로 펼치는 테스트/진단용 decoder. */
export function decodeNotifyInformationCharacterStream(payload, { wireEndian = 'be' } = {}) {
  if (!Buffer.isBuffer(payload)) return null;
  const out = Buffer.alloc(NOTIFY_INFORMATION_CHARACTER_BYTES);
  let off = 0;
  const need = (size) => off + size <= payload.length;
  const readU8 = () => {
    if (!need(1)) return null;
    const value = payload.readUInt8(off);
    off += 1;
    return value;
  };
  const readU16 = () => {
    if (!need(2)) return null;
    const value = wireEndian === 'le' ? payload.readUInt16LE(off) : payload.readUInt16BE(off);
    off += 2;
    return value;
  };
  const readU32 = () => {
    if (!need(4)) return null;
    const value = wireEndian === 'le' ? payload.readUInt32LE(off) : payload.readUInt32BE(off);
    off += 4;
    return value;
  };
  const putU8 = (at) => {
    const value = readU8();
    if (value == null) return false;
    out.writeUInt8(value, at);
    return true;
  };
  const putU16 = (at) => {
    const value = readU16();
    if (value == null) return false;
    out.writeUInt16LE(value, at);
    return true;
  };
  const putU32 = (at) => {
    const value = readU32();
    if (value == null) return false;
    out.writeUInt32LE(value, at);
    return true;
  };
  const putPstr16 = (lenAt, charsAt, max = 13) => {
    const count = readU8();
    if (count == null || count > max) return false;
    out.writeUInt8(count, lenAt);
    for (let i = 0; i < count; i += 1) {
      if (!putU16(charsAt + i * 2)) return false;
    }
    return true;
  };

  if (!putU8(0x00) || !putU32(0x04)) return null;
  if (!putU8(0x08) || !putU8(0x09) || !putU8(0x0a) || !putU8(0x0b)) return null;
  if (!putU32(0x0c) || !putU8(0x10) || !putU8(0x11) || !putU32(0x14)) return null;
  if (!putU16(0x18) || !putU32(0x1c) || !putU32(0x20) || !putU32(0x24) || !putU32(0x28)) return null;
  if (!putPstr16(0x2c, 0x2e, 13)) return null;
  if (!putU32(0x48) || !putU32(0x4c) || !putU32(0x50) || !putU32(0x54)) return null;
  if (!putU32(0x58) || !putU32(0x5c) || !putU16(0x60)) return null;
  if (!putU8(0x62) || !putU8(0x63) || !putU8(0x64) || !putU8(0x65)
    || !putU8(0x66) || !putU8(0x67) || !putU8(0x68) || !putU32(0x6c)) return null;
  if (!need(0x10)) return null;
  payload.copy(out, 0x70, off, off + 0x10);
  off += 0x10;
  if (!putU8(0x80)) return null;
  const parentageCount = readU8();
  if (parentageCount == null || parentageCount > 2) return null;
  out.writeUInt8(parentageCount, 0x81);
  for (let i = 0; i < parentageCount; i += 1) {
    const base = 0x85 + i * 0x84;
    if (!putU8(base - 1) || !putPstr16(base, base + 1, 13)
      || !putPstr16(base + 0x1b, base + 0x1d, 13)
      || !putPstr16(base + 0x37, base + 0x39, 13)
      || !putU16(base + 0x53) || !putU16(base + 0x55)
      || !putPstr16(base + 0x57, base + 0x59, 13)
      || !putU32(base + 0x73) || !putU32(base + 0x77)
      || !putU32(base + 0x7b) || !putU32(base + 0x7f)) return null;
  }
  for (let i = 0; i < 8; i += 1) {
    if (!putU16(0x18c + i * 4) || !putU16(0x18e + i * 4)) return null;
  }
  if (!putU8(0x1ac) || !putU8(0x1ad)) return null;
  const specialCount = readU8();
  if (specialCount == null || specialCount > 0x50) return null;
  out.writeUInt8(specialCount, 0x1ae);
  for (let i = 0; i < specialCount; i += 1) {
    if (!putU16(0x1b0 + i * 2)) return null;
  }
  const cardCount = readU8();
  if (cardCount == null || cardCount > MAX_AUTHORITY_CARDS_PER_CHARACTER) return null;
  out.writeUInt8(cardCount, 0x250);
  for (let i = 0; i < cardCount; i += 1) {
    if (!putU16(0x254 + i * 8) || !putU32(0x258 + i * 8)) return null;
  }
  if (!putU8(0x2d4)) return null;
  return { object: out, consumed: off, trailing: payload.length - off };
}
