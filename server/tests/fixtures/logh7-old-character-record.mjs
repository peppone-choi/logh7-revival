// tests/fixtures/logh7-old-character-record.mjs
//
// 옛 proven 렌더 경로(커밋 5bd249c server/src/server/logh7-login-protocol.mjs)의
// buildInformationCharacterRecordInner(0x0323, 724B) verbatim 복원 픽스처.
//
// 목적: 현재 buildInformationCharacterInner(전 필드 포팅본)가 이 옛 빌더와 같은 입력에 대해
//   byte-identical 을 내는지 대조하기 위한 기준 구현. 이 파일은 절대 수정하지 말 것 —
//   초기화 전 실제로 전략맵이 렌더됐던 정본 바이트열의 소스 오브 트루스다.
//   (framing/writeWireU32/상수도 5bd249c 원문 그대로 최소 이식.)

const SS_RESP_INFO_CHARACTER_RECORD_CODE = 0x0323;
const SS_RESP_INFO_CHARACTER_RECORD_BYTES = 0x02d4; // 724
const CHARACTER_NAME_MAX_UNITS = 13; // parser cap `< 0xe` per name (lastname/firstname/flagship)

function buildMpsClientMessage32Inner({ code, prefix = 0, payload = Buffer.alloc(0) }) {
  const inner = Buffer.alloc(6 + payload.length);
  inner.writeUInt32BE(prefix >>> 0, 0);
  inner.writeUInt16BE(code & 0xffff, 4);
  payload.copy(inner, 6);
  return inner;
}

function buildLobbyResponseInner(code, payloadLength = 0) {
  return buildMpsClientMessage32Inner({ code, payload: Buffer.alloc(Math.max(0, payloadLength)) });
}

function writeWireU32(buffer, value, offset, wireEndian = 'le') {
  if (wireEndian === 'be') buffer.writeUInt32BE(value >>> 0, offset);
  else buffer.writeUInt32LE(value >>> 0, offset);
}

/**
 * 0x0323 ResponseInformationCharacter: one 724-byte character record. (5bd249c verbatim)
 */
export function buildInformationCharacterRecordInner({
  characterId = 1, gridUnitId = 0, power = null, spot = null, spotOwner = null, abilities = null, online = false,
  camp = null, state = null, fame = null, pcp = null, mcp = null, money = null, influence = null, stamina = null,
  officerCount = null,
  lastname = null, firstname = null, displayName = null, rank = null, title = null, face = null,
  seatEntries = null, spotResolverBase = null, together = null,
  wireEndian = 'le',
} = {}) {
  const inner = buildLobbyResponseInner(SS_RESP_INFO_CHARACTER_RECORD_CODE, SS_RESP_INFO_CHARACTER_RECORD_BYTES);
  const payload = inner.subarray(6);
  const writeRecordU16 = (value, offset) => payload.writeUInt16LE((value ?? 0) & 0xffff, offset);
  const writeRecordU32 = (value, offset) => payload.writeUInt32LE((value ?? 0) >>> 0, offset);
  // proven anchors (G164 world load): id@0x00, flagship/grid-unit id@0x24
  writeWireU32(payload, characterId, 0x00, wireEndian);
  writeWireU32(payload, gridUnitId, 0x24, wireEndian);
  // optional real fields at the binary-evidenced 0x0323 offsets (docs/logh7-info-records-wire.md)
  if (Number.isInteger(power)) payload.writeUInt8(power & 0xff, 0x04); // 陣営/faction id
  if (Number.isInteger(camp)) payload.writeUInt8(camp & 0xff, 0x05);
  if (Number.isInteger(state)) payload.writeUInt8(state & 0xff, 0x06);
  if (Number.isInteger(fame)) writeRecordU32(fame, 0x10);
  if (Number.isInteger(spot)) writeWireU32(payload, spot, 0x1c, wireEndian); // current system id
  if (Number.isInteger(spotOwner)) writeWireU32(payload, spotOwner, 0x20, wireEndian);
  if (Number.isInteger(pcp)) writeRecordU32(pcp, 0x50);
  if (Number.isInteger(mcp)) writeRecordU32(mcp, 0x54);
  if (online) payload.writeUInt8(1, 0x64);
  if (Number.isInteger(money)) writeRecordU32(money, 0x68);
  // ability_8 @0x188: 8 entries of {point u16, experience u16}, canonical order
  if (Array.isArray(abilities)) {
    for (let i = 0; i < 8 && i < abilities.length; i += 1) {
      writeRecordU16(abilities[i] ?? 0, 0x188 + i * 4);
    }
  }
  if (Number.isInteger(influence)) payload.writeUInt8(influence & 0xff, 0x1a8);
  if (Number.isInteger(stamina)) payload.writeUInt8(stamina & 0xff, 0x1a9);
  // 0x0323 card/seat array: count u8 @0x24c, entries @0x254 stride 8 {character u32 @+0, role u32 @+4}, max 16.
  const resolvedSeatEntries = Array.isArray(seatEntries)
    ? seatEntries
    : (Number.isInteger(officerCount) && officerCount > 0
      ? Array.from({ length: Math.min(officerCount, 0x10) }, () => ({ character: characterId, role: 0 }))
      : []);
  const seatCount = Math.min(resolvedSeatEntries.length, 0x10);
  payload.writeUInt8(seatCount, 0x24c);
  for (let i = 0; i < seatCount; i += 1) {
    const entry = resolvedSeatEntries[i] ?? {};
    const character = Number(entry.character ?? entry.characterId ?? entry.cardId ?? entry.id ?? 0);
    const role = Number(entry.role ?? entry.seatRole ?? 0);
    writeWireU32(payload, Number.isInteger(character) ? character : 0, 0x254 + i * 8, wireEndian);
    writeWireU32(payload, Number.isInteger(role) ? role : 0, 0x258 + i * 8, wireEndian);
  }
  // parentage[0] sub-record @0x80 (stride 0x84): names + rank + face at the documented rel. offsets.
  const P0 = 0x80;
  const writePstr16 = (str, lenOff, charsOff) => {
    const codes = [...String(str)].slice(0, CHARACTER_NAME_MAX_UNITS);
    payload.writeUInt8(codes.length, lenOff);
    for (let i = 0; i < codes.length; i += 1) {
      // Text fields follow the client's UCS-2/UTF-16LE string readers even when
      // live-memory numeric anchors require BE bytes on the same 0x0323 record.
      payload.writeUInt16LE(codes[i].charCodeAt(0), charsOff + i * 2);
    }
  };
  const resolvedDisplayName = displayName ?? (
    lastname != null && firstname != null ? `${lastname} ${firstname}` : lastname ?? firstname
  );
  const hasParentage =
    lastname != null ||
    firstname != null ||
    resolvedDisplayName != null ||
    Number.isInteger(rank) ||
    title != null ||
    Number.isInteger(face);
  if (hasParentage) {
    payload.writeUInt8(1, 0x7d); // parentage_len: client skips the sub-record when this stays zero.
    payload.writeUInt8(1, P0 + 0x00); // truth flag for parentage[0].
  }
  if (lastname != null) writePstr16(lastname, P0 + 0x01, P0 + 0x02); // lastname @0x81/0x82
  if (firstname != null) writePstr16(firstname, P0 + 0x1c, P0 + 0x1e); // firstname @0x9c/0x9e
  if (resolvedDisplayName != null) writePstr16(resolvedDisplayName, P0 + 0x38, P0 + 0x3a); // display_name @0xb8/0xba
  if (Number.isInteger(rank)) writeRecordU16(rank, P0 + 0x56); // rank @0xd6
  if (title != null && String(title).length > 0) writePstr16(String(title), P0 + 0x58, P0 + 0x5a);
  if (Number.isInteger(face)) writeRecordU32(face, P0 + 0x74); // face @0xf4
  if (Number.isInteger(spotResolverBase)) writeRecordU32(spotResolverBase, P0 + 0x80); // source +0x100 -> PLAYER_INFO +0x120
  if (Number.isInteger(together)) payload.writeUInt8(together & 0xff, 0x2d0);
  return inner;
}
