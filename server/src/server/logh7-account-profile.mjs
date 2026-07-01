const PROFILE_NAME_MAX = 64;
const PROFILE_ABILITIES = 8;

export const DEFAULT_PLAYER_CHARACTER_PROFILE = Object.freeze({
  status: 1,
  name: '신참사관',
  displayName: '신참사관',
  lastname: '신참',
  firstname: '사관',
  faction: 'empire',
  power: 1,
  worldPower: 1,
  createPower: 1,
  camp: 1,
  blood: 0,
  sex: 0,
  face: 0,
  abilities: Object.freeze([50, 50, 50, 50, 50, 50, 50, 50]),
  rank: 3,
  createRankSubId: 0x0d,
  state: 2,
  fame: 1,
  pcp: 1200,
  mcp: 1200,
  money: 50000,
  influence: 1,
  stamina: 100,
  title: 0,
  bonusPoint: 0,
  specialAbilityNum: 0,
  birthMonth: 1,
  birthDay: 1,
  birthYear: 767,
  ageYears: 18,
  spot: 70,
  spotOwner: 1,
  together: 1,
  generated: 1,
  check: 1,
});

function stringField(value, max = PROFILE_NAME_MAX) {
  return typeof value === 'string' ? value.slice(0, max) : '';
}

function finiteInt(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function positiveInt(value, fallback = 0) {
  return Math.max(0, finiteInt(value, fallback));
}

function positiveRequiredInt(value, fallback) {
  const n = positiveInt(value, fallback);
  return n > 0 ? n : positiveInt(fallback);
}

function profileAbilities(value) {
  const source = Array.isArray(value) ? value : DEFAULT_PLAYER_CHARACTER_PROFILE.abilities;
  return Array.from({ length: PROFILE_ABILITIES }, (_, i) => Math.max(0, Math.min(255, finiteInt(source[i], 0))));
}

/** @param {object} character */
export function profileCharacterId(character) {
  return positiveInt(character?.characterId ?? character?.id);
}

/**
 * Normalize the server-owned subset of a generated character profile for account persistence.
 * This deliberately excludes credentials, wire payloads, and content-DB rows.
 * @param {object} character
 * @param {{ createdAt?: string }} [options]
 * @returns {{characterId:number,name:string,displayName:string,lastname:string,firstname:string,faction:string,power:number,blood:number,sex:number,face:number,abilities:number[],rank:number,spot:number,spotOwner:number,createdAt:string}}
 */
export function normalizeAccountCharacterProfile(character, { createdAt = new Date().toISOString() } = {}) {
  const characterId = profileCharacterId(character);
  if (characterId <= 0) {
    throw new Error('profile characterId is required');
  }
  const lastname = stringField(character?.lastname) || DEFAULT_PLAYER_CHARACTER_PROFILE.lastname;
  const firstname = stringField(character?.firstname) || DEFAULT_PLAYER_CHARACTER_PROFILE.firstname;
  const fallbackName = [lastname, firstname].filter(Boolean).join('') || `Character ${characterId}`;
  const rawName = stringField(character?.name ?? character?.cardName);
  const name = rawName === DEFAULT_PLAYER_CHARACTER_PROFILE.lastname ? fallbackName : (rawName || fallbackName);
  const rawDisplayName = stringField(
    character?.displayName ?? character?.fullName ?? [lastname, firstname].filter(Boolean).join(' ') ?? name,
  );
  const displayName = rawDisplayName === DEFAULT_PLAYER_CHARACTER_PROFILE.lastname ? fallbackName : rawDisplayName;
  const faction = stringField(character?.faction, 32) || DEFAULT_PLAYER_CHARACTER_PROFILE.faction;
  const power = positiveInt(character?.power ?? character?.worldPower, DEFAULT_PLAYER_CHARACTER_PROFILE.power);
  const worldPower = positiveInt(character?.worldPower ?? character?.power, power);
  return {
    characterId,
    name,
    displayName: displayName || name,
    lastname,
    firstname,
    faction,
    power,
    worldPower,
    createPower: positiveInt(character?.createPower ?? character?.power, power),
    camp: positiveInt(character?.camp ?? character?.power, power),
    blood: positiveInt(character?.blood, DEFAULT_PLAYER_CHARACTER_PROFILE.blood),
    sex: positiveInt(character?.sex, DEFAULT_PLAYER_CHARACTER_PROFILE.sex),
    face: positiveInt(character?.face, DEFAULT_PLAYER_CHARACTER_PROFILE.face),
    abilities: profileAbilities(character?.abilities),
    rank: positiveInt(character?.rank, DEFAULT_PLAYER_CHARACTER_PROFILE.rank),
    createRankSubId: positiveInt(character?.createRankSubId ?? character?.rankSubId, DEFAULT_PLAYER_CHARACTER_PROFILE.createRankSubId),
    state: positiveInt(character?.state ?? character?.entryState, DEFAULT_PLAYER_CHARACTER_PROFILE.state),
    fame: positiveInt(character?.fame ?? character?.renown, DEFAULT_PLAYER_CHARACTER_PROFILE.fame),
    pcp: positiveInt(character?.pcp ?? character?.pcpPoints ?? character?.politicalCommandPoints, DEFAULT_PLAYER_CHARACTER_PROFILE.pcp),
    mcp: positiveInt(character?.mcp ?? character?.mcpPoints ?? character?.militaryCommandPoints, DEFAULT_PLAYER_CHARACTER_PROFILE.mcp),
    money: positiveInt(character?.money ?? character?.funds, DEFAULT_PLAYER_CHARACTER_PROFILE.money),
    influence: positiveInt(character?.influence ?? character?.influenceRank, DEFAULT_PLAYER_CHARACTER_PROFILE.influence),
    stamina: positiveInt(character?.stamina, DEFAULT_PLAYER_CHARACTER_PROFILE.stamina),
    title: positiveInt(character?.title, DEFAULT_PLAYER_CHARACTER_PROFILE.title),
    bonusPoint: positiveInt(character?.bonusPoint, DEFAULT_PLAYER_CHARACTER_PROFILE.bonusPoint),
    specialAbilityNum: positiveInt(character?.specialAbilityNum, DEFAULT_PLAYER_CHARACTER_PROFILE.specialAbilityNum),
    birthMonth: positiveRequiredInt(character?.birthMonth ?? character?.birthdayMonth ?? character?.birthday_month, DEFAULT_PLAYER_CHARACTER_PROFILE.birthMonth),
    birthDay: positiveRequiredInt(character?.birthDay ?? character?.birthdayDay ?? character?.birthday_day, DEFAULT_PLAYER_CHARACTER_PROFILE.birthDay),
    birthYear: positiveRequiredInt(character?.birthYear ?? character?.birth_year, DEFAULT_PLAYER_CHARACTER_PROFILE.birthYear),
    ageYears: positiveRequiredInt(character?.ageYears ?? character?.age, DEFAULT_PLAYER_CHARACTER_PROFILE.ageYears),
    spot: positiveInt(character?.spot ?? character?.currentSpot, DEFAULT_PLAYER_CHARACTER_PROFILE.spot),
    spotOwner: positiveInt(character?.spotOwner ?? character?.ownerSeed, DEFAULT_PLAYER_CHARACTER_PROFILE.spotOwner),
    together: positiveInt(character?.together, DEFAULT_PLAYER_CHARACTER_PROFILE.together),
    status: positiveInt(character?.status, DEFAULT_PLAYER_CHARACTER_PROFILE.status),
    generated: positiveInt(character?.generated ?? character?.isGenerated, DEFAULT_PLAYER_CHARACTER_PROFILE.generated),
    check: positiveInt(character?.check, DEFAULT_PLAYER_CHARACTER_PROFILE.check),
    createdAt: typeof createdAt === 'string' && createdAt.length > 0 ? createdAt : new Date().toISOString(),
  };
}

/**
 * Public evidence/admin view of a profile. It is intentionally smaller than the persisted record.
 * @param {object} character
 */
export function summarizeAccountCharacterProfile(character) {
  return {
    characterId: profileCharacterId(character),
    name: stringField(character?.name),
    displayName: stringField(character?.displayName),
    lastname: stringField(character?.lastname),
    firstname: stringField(character?.firstname),
    faction: stringField(character?.faction, 32),
    power: positiveInt(character?.power),
    rank: positiveInt(character?.rank),
    state: positiveInt(character?.state ?? character?.entryState),
    stamina: positiveInt(character?.stamina),
    birthMonth: positiveInt(character?.birthMonth ?? character?.birthdayMonth ?? character?.birthday_month),
    birthDay: positiveInt(character?.birthDay ?? character?.birthdayDay ?? character?.birthday_day),
    ageYears: positiveRequiredInt(character?.ageYears ?? character?.age, DEFAULT_PLAYER_CHARACTER_PROFILE.ageYears),
    spot: positiveInt(character?.spot ?? character?.currentSpot, 1),
    spotOwner: positiveInt(character?.spotOwner ?? character?.ownerSeed, 1),
    together: positiveInt(character?.together, 0),
    createdAt: typeof character?.createdAt === 'string' ? character.createdAt : null,
  };
}

/** @param {object} character */
export function cloneAccountCharacterProfile(character) {
  return { ...character, abilities: profileAbilities(character?.abilities) };
}
