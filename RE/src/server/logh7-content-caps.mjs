/**
 * Client-enforced content CAPS + a content-pack validator — the modding safety net.
 *
 * Every cap below is enforced by the CLIENT wire parsers (docs/logh7-data-structures-re.md §3, verified
 * against the G7MTClient decompile). Exceeding ANY of them makes the client BAIL on the whole message,
 * so a mod/content pack MUST be validated against these before it is served. This is our proactive
 * equivalent of Paradox's error.log: catch over-cap mod data here, never at the client.
 *
 * Pure module (no I/O) so it is trivially testable and usable by the mod loader.
 */

/** @type {Readonly<Record<string, {value:number, where:string}>>} */
export const CLIENT_CAPS = Object.freeze({
  POWERS_PER_SESSION: { value: 2, where: 'FUN_00444900 `power[2]` — exactly 2 playable powers; Phezzan is a neutral tag, never a 3rd power' },
  NATION_FLEET_ROSTER: { value: 14, where: 'FUN_004301d0 power+0x28 `if (bVar1 < 0xe)`' },
  NATION_LEADERS: { value: 3, where: 'FUN_004301d0 power+0x7d `if (bVar1 < 3)`' },
  ENTRY_CHARACTERS: { value: 5, where: 'FUN_00407920 `entry_character_size over than 5`' },
  EXTENSION_CHARACTERS: { value: 2, where: 'FUN_00407920 `extension_character_size over than 2`' },
  CARD_CHARACTER_ROSTER: { value: 64, where: '0x034f outer copy 0x40 / `character_size over than 64`' },
  CARDS_PER_CHARACTER: { value: 16, where: 'FUN_00417390 char+0x24c `if (bVar2 < 0x11)` / `card_size over than 16`' },
  SESSIONS: { value: 64, where: 'FUN_00444900 `if (bVar2 < 0x41)`' },
  WORLD_CHARACTERS: { value: 600, where: 'FUN_004c2a80 `if (600 < local_8)` / unit table cap' },
  UNITS: { value: 600, where: '0x0325 `information_size over than 600`, table @0x41a368' },
  BOATS_PER_FLEET: { value: 10, where: '0x0325 `troop_units_size over than 10`' },
  NAME_UCS2_UNITS: { value: 13, where: 'name parsers `*_size over than 13` (flagship/last/first/display/title)' },
  SPECIAL_ABILITIES: { value: 80, where: 'char+0x1aa `if (bVar1 < 0x51)`' },
  ABILITY_BLOCK: { value: 8, where: '0x0323 ability_8 FIXED 8 entries stride 4 @0x188' },
  NATION_BUDGET: { value: 6, where: 'NotifyBaseParameter `budget_size over than 6`' },
  BASE_ELEMENTS: { value: 4, where: '0x031f ResponseInformationBase 4 elements stride 0x180' },
  MARKER_CELL_VALUE_MAX: { value: 88, where: '0x0315 placeable cell value range 3..88 (object table index)' },
  GROUP18_FIRST_SYSTEM_SUBID: { value: 3, where: 'constmsg group 0x18 subIds 0..2 are grid-type labels; system names start at 3' },
});

const PLAYABLE_NATION_IDS = new Set([0x500, 0x501]); // empire, alliance (the 2 session powers)
const NEUTRAL_NATION_ID = 0x502; // Phezzan / neutral tag — allowed, but NOT a 3rd playable power

/** UCS-2 unit length (the client counts u16 code units, not bytes/codepoints). */
function ucs2Len(s) {
  return typeof s === 'string' ? s.length : 0;
}

/**
 * Validate a content-pack data object (the buildContentPackDataFromSource shape) against the client caps.
 * @param {{ nations?:any[], characters?:any[], units?:any[], shipClasses?:any[], systems?:any[] }} pack
 * @param {{ strictNames?: boolean }} [opts] strictNames: also flag display `name` length (placeholders are short)
 * @returns {{ ok:boolean, errors:string[], warnings:string[] }}
 */
export function validateContentPack(pack = {}, { strictNames = false } = {}) {
  const errors = [];
  const warnings = [];
  const cap = (k) => CLIENT_CAPS[k].value;

  const nations = Array.isArray(pack.nations) ? pack.nations : [];
  const characters = Array.isArray(pack.characters) ? pack.characters : [];
  const units = Array.isArray(pack.units) ? pack.units : [];
  const systems = Array.isArray(pack.systems) ? pack.systems : [];

  // --- nations / powers ---
  const playable = nations.filter((n) => PLAYABLE_NATION_IDS.has(n?.id));
  if (playable.length > cap('POWERS_PER_SESSION')) {
    errors.push(`powers/session: ${playable.length} playable nations > ${cap('POWERS_PER_SESSION')} (${CLIENT_CAPS.POWERS_PER_SESSION.where})`);
  }
  if (nations.some((n) => n?.id != null && !PLAYABLE_NATION_IDS.has(n.id) && n.id !== NEUTRAL_NATION_ID)) {
    warnings.push('a nation id is neither a playable power (0x500/0x501) nor the neutral tag (0x502); a 3rd playable power is impossible client-side');
  }

  // --- characters ---
  if (characters.length > cap('WORLD_CHARACTERS')) {
    errors.push(`characters: ${characters.length} > WORLD_CHARACTERS ${cap('WORLD_CHARACTERS')} (${CLIENT_CAPS.WORLD_CHARACTERS.where})`);
  }
  const charIds = new Set();
  for (const c of characters) {
    if (c?.id != null) {
      if (charIds.has(c.id)) errors.push(`duplicate character id ${c.id}`);
      charIds.add(c.id);
    }
    if (Array.isArray(c?.abilities) && c.abilities.length !== cap('ABILITY_BLOCK')) {
      errors.push(`character ${c.id}: ability block length ${c.abilities.length} != ${cap('ABILITY_BLOCK')} (fixed)`);
    }
    if (Array.isArray(c?.specialAbilities) && c.specialAbilities.length > cap('SPECIAL_ABILITIES')) {
      errors.push(`character ${c.id}: ${c.specialAbilities.length} special abilities > ${cap('SPECIAL_ABILITIES')}`);
    }
    for (const key of ['nameRomaji', 'flagshipName', 'lastname', 'firstname', 'titlename']) {
      if (ucs2Len(c?.[key]) > cap('NAME_UCS2_UNITS')) {
        errors.push(`character ${c.id}: ${key} length ${ucs2Len(c[key])} > ${cap('NAME_UCS2_UNITS')} UCS-2 units`);
      }
    }
    if (strictNames && ucs2Len(c?.name) > cap('NAME_UCS2_UNITS')) {
      errors.push(`character ${c.id}: display name length ${ucs2Len(c.name)} > ${cap('NAME_UCS2_UNITS')}`);
    }
  }

  // --- units / fleets ---
  if (units.length > cap('UNITS')) {
    errors.push(`units: ${units.length} > ${cap('UNITS')} (${CLIENT_CAPS.UNITS.where})`);
  }
  // per-nation fleet roster cap (the national numbered-fleet roster, ≤14)
  const fleetsByNation = new Map();
  for (const u of units) {
    fleetsByNation.set(u?.nationId, (fleetsByNation.get(u?.nationId) ?? 0) + 1);
    if (Array.isArray(u?.boats) && u.boats.length > cap('BOATS_PER_FLEET')) {
      errors.push(`unit ${u.id}: ${u.boats.length} boats > ${cap('BOATS_PER_FLEET')}`);
    }
    if (u?.commander != null && charIds.size > 0 && !charIds.has(u.commander)) {
      warnings.push(`unit ${u.id}: commander ${u.commander} not in characters (referential)`);
    }
  }
  for (const [nationId, n] of fleetsByNation) {
    if (PLAYABLE_NATION_IDS.has(nationId) && n > cap('NATION_FLEET_ROSTER')) {
      warnings.push(`nation ${nationId}: ${n} fleets > NATION_FLEET_ROSTER ${cap('NATION_FLEET_ROSTER')} — the national numbered-fleet roster caps at 14 (extra fleets won't enter that roster)`);
    }
  }

  // --- systems / strategic markers ---
  if (systems.length > 0) {
    for (const s of systems) {
      const cid = s?.contentId;
      if (Number.isInteger(cid) && cid >= 0 && cid < cap('GROUP18_FIRST_SYSTEM_SUBID')) {
        errors.push(`system "${s.name ?? '?'}": marker contentId ${cid} is a grid-TYPE label sub-id (<${cap('GROUP18_FIRST_SYSTEM_SUBID')}); would render "공간 그리드" etc.`);
      }
    }
    if (systems.length > 85) {
      warnings.push(`systems: ${systems.length} > 85 placeable markers (object values must stay ≤${cap('MARKER_CELL_VALUE_MAX')}); extra systems won't get a marker`);
    }
  }

  return { ok: errors.length === 0, errors, warnings };
}
