// 도메인 엔티티 — 와이어와 무관한 권위 상태

let nextTempId = -1;

function markDirty(entity) {
  entity._dirty = true;
  entity.revision = (entity.revision ?? 0) + 1;
  entity.updatedAt = Date.now();
  return entity;
}

export function createAccountEntity({
  id = null,
  accountId,
  password,
  createdAt = Date.now(),
  revision = 0,
} = {}) {
  if (!accountId) throw new Error('accountId required');
  return {
    _type: 'Account',
    _dirty: id == null,
    id,
    accountId: String(accountId),
    password: String(password ?? ''),
    createdAt,
    revision,
    updatedAt: createdAt,
  };
}

export function createCharacterEntity({
  id = null,
  accountId,
  power = 0,
  blood = 0,
  sex = 0,
  lastname = '',
  firstname = '',
  face = 0,
  rank = 0,
  unitId = null,
  cell = null,
  online = false,
  ability8 = null,
  createdAt = Date.now(),
  revision = 0,
} = {}) {
  if (!accountId) throw new Error('character.accountId required');
  // 빈 이름 금지 — 클라 HUD 가 빈 표시명을 "황제" 기본 문자열로 폴백한 전례(DEFECT 1)
  const ln = String(lastname ?? '').trim();
  const fn = String(firstname ?? '').trim();
  if (!ln && !fn) {
    throw new Error('character name required (empty name → client 황제 fallback)');
  }
  return {
    _type: 'Character',
    _dirty: id == null,
    id,
    accountId: String(accountId),
    power: power & 0xff,
    blood: blood & 0xff,
    sex: sex & 0xff,
    lastname: ln,
    firstname: fn,
    face: Number(face) || 0,
    rank: Number(rank) || 0,
    unitId: unitId == null ? null : Number(unitId),
    // cell 미지정 시 스폰 셀 0 (스키마 NOT NULL). 캐릭터 정체성(이름/계급/id)과는 무관.
    cell: cell == null ? 0 : Number(cell),
    online: Boolean(online),
    ability8: Array.isArray(ability8) ? ability8.slice(0, 8) : null,
    createdAt,
    revision,
    updatedAt: createdAt,
  };
}

export function setCharacterCell(character, cell) {
  character.cell = cell >>> 0;
  return markDirty(character);
}

export function setCharacterOnline(character, online) {
  character.online = Boolean(online);
  return markDirty(character);
}

export function assignCharacterId(character, id) {
  character.id = id;
  character._dirty = true;
  return character;
}

export function assignAccountId(account, id) {
  account.id = id;
  account._dirty = true;
  return account;
}

export function ensureUnitId(character) {
  if (character.unitId == null) {
    character.unitId = character.id ?? nextTempId--;
    markDirty(character);
  }
  return character.unitId;
}
