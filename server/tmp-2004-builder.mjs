const LOBBY_CHARACTER_CHARGE_FIRST_RECORD_STREAM_OFFSET = 0x01;
const LOBBY_CHARACTER_CHARGE_NAME_UNITS = 0x0d;
const LOBBY_CHARACTER_CHARGE_DESCRIPTION_UNITS = 0x41;
const LOBBY_CHARACTER_CHARGE_GATE_PREFIX_STREAM_BYTES = 0x22;
const LOBBY_CHARACTER_CHARGE_DETAIL_NAME_UNITS = 0x0d;
const LOBBY_CHARACTER_CHARGE_CARD_KIND = 2;
const LOBBY_CHARACTER_CHARGE_SELECTABLE_DETAIL_COUNT = 1;
const LOBBY_CHARACTER_CHARGE_DISPLAY_AGE_SECONDS_PER_YEAR = 0x01e13380;
const DEFAULT_LOBBY_CHARACTER_DISPLAY_AGE_YEARS = 18;

/**
 * Build a minimal 0x2004 character-charge response from account/session characters.
 *
 * Static input for `0x0043fd60` accepts at most two records (`count < 3`) and
 * copies them into a destination object with a 0x36c record stride. The wire
 * input is still a compact sequential stream, not a prelaid destination struct:
 * each record starts immediately after the bytes consumed by the previous one.
 * Runtime state `0x2a` later reads the copied object at object offsets 0x04 and
 * 0x370; non-zero ids there are the values passed into `FUN_0051bea0`, which
 * sends the client's `0x2009` LobbySessionLoginRequest.
 *
 * G136 runtime evidence showed the card objects are built enabled, then
 * `FUN_0051f1c0` disables them unless the parsed destination record has status
 * 1/2, card kind `record+0x2a0 == 2`, and selectable/detail count
 * `record+0x2a1 != 0`. Those two destination fields are reached only after the
 * compact stream consumes the zeroed post-description/power blocks, so they must
 * be encoded at the stream cursor rather than at payload offsets 0x2a0/0x2a1.
 *
 * @param {{ characters?: Array<{
 *   id?: number, characterId?: number, status?: number, name?: string, characterName?: string,
 *   description?: string, characterDescription?: string, power?: number|string, camp?: number|string,
 *   nationId?: number, nation_id?: number, faction?: string, generated?: number, sex?: number,
 *   birthdayMonth?: number, birthday_month?: number, birthdayDay?: number, birthday_day?: number,
 *   state?: number, abilities?: number[], lastname?: string, firstname?: string, displayName?: string,
 * }>} [options]
 */
export function buildLobbyInformationCharacterChargeInner({ characters = [] } = {}) {
  const records = normalizeLobbyCharacterRecords(characters);
  const inner = buildLobbyResponseInner(
    LOBBY_RESP_INFO_CHARACTER_CHARGE_CODE,
    LOBBY_RESP_INFO_CHARACTER_CHARGE_PAYLOAD_BYTES,
  );
  const payload = inner.subarray(6);
  payload.writeUInt8(records.length, 0);
  // ??????????????? ??????????? 0x0043fd60???????? 0x36c ??????????????????).
  // ???????? ??? ?????? ????????????? ???????????(??? ???????????).
  let cursor = LOBBY_CHARACTER_CHARGE_FIRST_RECORD_STREAM_OFFSET;
  for (const record of records) {
    cursor = writeLobbyCharacterChargeRecord(payload, cursor, record);
  }
  return inner;
}

function writeLobbyCharacterChargeRecord(payload, cursor, record) {
  payload.writeUInt16LE(record.id, cursor);
  cursor += 2;
  payload.writeUInt8(record.status, cursor);
  cursor += 1;
  cursor = writeLobbyUtf16FieldBE(payload, cursor, record.name, LOBBY_CHARACTER_CHARGE_NAME_UNITS);
  cursor = writeLobbyUtf16FieldBE(payload, cursor, record.description, LOBBY_CHARACTER_CHARGE_DESCRIPTION_UNITS);

  cursor += LOBBY_CHARACTER_CHARGE_GATE_PREFIX_STREAM_BYTES;
  payload.writeUInt8(LOBBY_CHARACTER_CHARGE_CARD_KIND, cursor);
  cursor += 1;
  payload.writeUInt8(LOBBY_CHARACTER_CHARGE_SELECTABLE_DETAIL_COUNT, cursor);
  cursor += 1;
  return writeLobbyChargedCharacterDetail(payload, cursor, record);
}

function normalizeLobbyCharacterRecords(characters) {
  if (!Array.isArray(characters)) {
    throw new Error('lobby characters must be an array');
  }
  if (characters.length > 2) {
    throw new Error(`invalid lobby character-charge record count: ${characters.length}`);
  }
  return characters.map((record, index) => {
    if (typeof record !== 'object' || record === null) {
      throw new Error(`invalid lobby character record at index ${index}`);
    }
    const id = record.characterId ?? record.id;
    if (!Number.isInteger(id) || id <= 0 || id > 0xffff) {
      throw new Error(`invalid lobby character id at index ${index}: ${id}`);
    }
    const status = record.status ?? 1;
    if (!Number.isInteger(status) || status < 1 || status > 2) {
      throw new Error(`invalid lobby character status at index ${index}: ${status}`);
    }
    const name = record.characterName ?? record.name ?? `Character ${id}`;
    const description = record.characterDescription ?? record.description ?? `Character ${id} ready`;
    const power = lobbyPowerByte(record.power ?? record.nationId ?? record.nation_id ?? record.faction) ?? 1;
    const camp = lobbyPowerByte(record.camp ?? record.campId ?? record.camp_id) ?? power;
    const lastname = lobbyDetailFieldText(
      record.cardHeaderName
      ?? record.headerName
      ?? record.displayName
      ?? record.display_name
      ?? record.fullName
      ?? record.lastname
      ?? record.lastName
      ?? record.familyName
      ?? name,
    );
    const firstname = lobbyDetailFieldText(record.firstname ?? record.firstName ?? '');
    const displayName = lobbyDetailFieldText(record.displayName ?? record.display_name ?? record.characterName ?? name);
    return {
      id,
      status,
      name,
      description,
      power,
      camp,
      generated: lobbyByte(record.generated ?? record.isGenerated ?? 1),
      sex: lobbyByte(record.sex ?? 0),
      birthdayMonth: lobbyByte(record.birthdayMonth ?? record.birthday_month ?? record.birthMonth ?? 1),
      birthdayDay: lobbyByte(record.birthdayDay ?? record.birthday_day ?? record.birthDay ?? 1),
      displayAgeSeconds: lobbyCardDisplayAgeSeconds(record),
      state: lobbyByte(record.state ?? 1),
      abilities: lobbyAbility8(record.abilities),
      lastname,
      firstname,
      displayName,
    };
  });
}

function lobbyDetailFieldText(value) {
  return [...String(value ?? '')].slice(0, LOBBY_CHARACTER_CHARGE_DETAIL_NAME_UNITS - 1).join('');
}

function writeLobbyChargedCharacterDetail(payload, cursor, record) {
  payload.writeUInt32BE(record.id, cursor);
  cursor += 4;
  payload.writeUInt8(record.power, cursor);
  cursor += 1;
  payload.writeUInt8(record.camp, cursor);
  cursor += 1;
  payload.writeUInt8(record.generated, cursor);
  cursor += 1;
  payload.writeUInt8(record.sex, cursor);
  cursor += 1;
  payload.writeUInt8(record.birthdayMonth, cursor);
  cursor += 1;
  payload.writeUInt8(record.birthdayDay, cursor);
  cursor += 1;
  payload.writeUInt32BE(record.displayAgeSeconds, cursor);
  cursor += 4;
  payload.writeUInt8(record.state, cursor);
  cursor += 1;
  for (const ability of record.abilities) {
    payload.writeUInt16BE(ability, cursor);
    cursor += 2;
  }
  cursor = writeLobbyUtf16FieldBE(payload, cursor, record.lastname, LOBBY_CHARACTER_CHARGE_DETAIL_NAME_UNITS);
  cursor = writeLobbyUtf16FieldBE(payload, cursor, record.firstname, LOBBY_CHARACTER_CHARGE_DETAIL_NAME_UNITS);
  cursor = writeLobbyUtf16FieldBE(payload, cursor, record.displayName, LOBBY_CHARACTER_CHARGE_DETAIL_NAME_UNITS);
  return cursor;
}

function lobbyInt(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function lobbyByte(value) {
  const n = lobbyInt(value);
  return n == null ? 0 : Math.max(0, Math.min(0xff, n));
}

function lobbyU32(value) {
  const n = lobbyInt(value);
  return n == null ? 0 : n >>> 0;
}

function lobbyCardDisplayAgeSeconds(record) {
  const explicitSeconds = record.ageSeconds ?? record.age_seconds;
  if (explicitSeconds != null) return lobbyU32(explicitSeconds);
  const years = record.ageYears ?? record.age;
  if (years != null) {
    return Math.min(
      0xffffffff,
      Math.max(0, lobbyU32(years)) * LOBBY_CHARACTER_CHARGE_DISPLAY_AGE_SECONDS_PER_YEAR,
    ) >>> 0;
  }
  return lobbyU32(record.reserved ?? record.unknownDword ?? DEFAULT_LOBBY_CHARACTER_DISPLAY_AGE_YEARS * LOBBY_CHARACTER_CHARGE_DISPLAY_AGE_SECONDS_PER_YEAR);
}

function lobbyPowerByte(value) {
  if (value == null) return null;
  const n = lobbyInt(value);
  if (n != null) {
    if (n === 0x500) return 1;
    if (n === 0x501) return 2;
    if (n === 0x502) return 3;
    return n >= 1 && n <= 0xff ? n & 0xff : null;
  }
  const key = String(value).trim().toLowerCase();
  if (key === 'empire' || key === 'imperial' || key === '???' || key === '???') return 1;
  if (key === 'alliance' || key === 'fpa' || key === 'free planets' || key === 'free planets alliance' || key === '???' || key === '???') return 2;
  if (key === 'neutral' || key === 'phezzan' || key === '???????? || key === '???') return 3;
  return null;
}

function lobbyAbility8(abilities) {
  const out = Array.isArray(abilities) ? abilities.slice(0, 8).map((v) => lobbyU32(v) & 0xffff) : [];
  while (out.length < 8) out.push(0);
  return out;
}

function writeLobbyUtf16Field(target, cursor, value, maxUnits) {
  const text = String(value ?? '');
  const units = [...text, '\0'];
  if (units.length > maxUnits) {
    throw new Error(`lobby session string is too long: ${text}`);
  }
  target.writeUInt8(units.length, cursor);
  let next = cursor + 1;
  for (const unit of units) {
    target.writeUInt16LE(unit.codePointAt(0) ?? 0, next);
    next += 2;
  }
  return next;
}

function writeLobbyUtf16FieldBE(target, cursor, value, maxUnits) {
  const text = String(value ?? '');
  const bodyUnits = [...text].slice(0, Math.max(0, maxUnits - 1));
  const units = [...bodyUnits, '\0'];
  target.writeUInt8(units.length, cursor);
  let next = cursor + 1;
  for (const unit of units) {
    target.writeUInt16BE(unit.codePointAt(0) ?? 0, next);
    next += 2;
  }
  return next;
}

/**
 * Build a minimal named 0x2006 session-list response.
 *
 * Ghidra `0x00444900` first consumes one raw byte, then reads the top-level
 * record count. Each record then consumes a u16 scalar, one raw metadata byte,
 * and two counted UTF-16LE fields (max 13 and 65 units). The remaining nested
 * counts stay zero until their semantics are proven. The metadata byte is not
 * cosmetic: `FUN_00593d90` gates the selectable session list on record status
 * `1` or `2`.
 */
