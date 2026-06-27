const PROFILE_NAME_MAX = 64;
const PROFILE_ABILITIES = 8;

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

function profileAbilities(value) {
  const source = Array.isArray(value) ? value : [];
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
  const lastname = stringField(character?.lastname);
  const firstname = stringField(character?.firstname);
  const fallbackName = lastname || `Character ${characterId}`;
  const name = stringField(character?.name ?? character?.cardName ?? fallbackName);
  const displayName = stringField(
    character?.displayName ?? character?.fullName ?? [lastname, firstname].filter(Boolean).join(' ') ?? name,
  );
  return {
    characterId,
    name,
    displayName: displayName || name,
    lastname,
    firstname,
    faction: stringField(character?.faction, 32),
    power: positiveInt(character?.power ?? character?.worldPower),
    blood: positiveInt(character?.blood),
    sex: positiveInt(character?.sex),
    face: positiveInt(character?.face),
    abilities: profileAbilities(character?.abilities),
    rank: positiveInt(character?.rank),
    spot: positiveInt(character?.spot ?? character?.currentSpot, 1),
    spotOwner: positiveInt(character?.spotOwner ?? character?.ownerSeed, 1),
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
    spot: positiveInt(character?.spot ?? character?.currentSpot, 1),
    spotOwner: positiveInt(character?.spotOwner ?? character?.ownerSeed, 1),
    createdAt: typeof character?.createdAt === 'string' ? character.createdAt : null,
  };
}

/** @param {object} character */
export function cloneAccountCharacterProfile(character) {
  return { ...character, abilities: profileAbilities(character?.abilities) };
}
