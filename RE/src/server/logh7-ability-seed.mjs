// LOGH VII character-creation ability SEED (house-rule).
//
// PROBLEM (live "기준 0"): the new-character creation FORM shows all 8 abilities
// (統率/政治/運用/情報 + 指揮/機動/攻撃/防御) as 0. The per-ability BASE (기준) is a
// CLIENT-LOCAL form-widget default — no pre-creation S->C message seeds the new-char
// form's ability widgets keyed to origin (the dispatcher writes to client+0x3584a0/a4 are
// the SELECTED char id (0x0204) and the account roster (0x1001), not a per-new-character
// base-ability provider). So the SERVER CANNOT feed the creation form directly; fixing the
// blank form would require a client patch.
//
// What the server CAN do (additive, no risk to the proven path): when it registers a created
// character (CommandGenerateCharacterCharge 0x1008) whose submitted abilities are all zero
// (the "기준 0" bug), stamp these deterministic house-rule BASE values onto the character so
// its authoritative 0x0323 record (ability_8 @0x188) carries non-zero, canon-shaped stats.
//
// House-rule (content/roster/ability-seed.json, derived from content/roster/ivex-abilities.json):
//   BASE 40 every ability + per-origin modifiers, clamp 0-100. The player additionally
//   distributes a BONUS pool of 50 (the 가산/added column in the client) — server provides BASE only.

import { readFileSync } from 'node:fs';

/** Canonical ability column order: PCP (統率/政治/運用/情報) then MCP (指揮/機動/攻撃/防御). */
export const ABILITY_COLUMNS = Object.freeze([
  'tochi', 'seiji', 'unei', 'joho', 'shiki', 'kido', 'kogeki', 'bogyo',
]);

/** Load the house-rule seed table once (content/roster/ability-seed.json). */
function loadSeedTable() {
  try {
    return JSON.parse(readFileSync(new URL('../../content/roster/ability-seed.json', import.meta.url), 'utf8'));
  } catch {
    // Defensive fallback: a flat BASE-40 table with no origins (every character seeds to all-40).
    return { base: 40, clampMin: 0, clampMax: 100, origins: [] };
  }
}

const SEED_TABLE = loadSeedTable();

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/**
 * Resolve the origin entry for a (power, blood) pair from the seed table, or null when the pair is
 * unrecognized (the caller then seeds BASE only). `power` = faction id (0x1008 @0x05), `blood` =
 * origin/bloodline (0x1008 @0x06).
 */
function resolveOrigin(power, blood) {
  const origins = Array.isArray(SEED_TABLE.origins) ? SEED_TABLE.origins : [];
  for (const o of origins) {
    const powers = Array.isArray(o.powers) ? o.powers : [];
    if (powers.includes(power) && o.blood === blood) {
      return o;
    }
  }
  return null;
}

/**
 * Compute the 8 house-rule BASE abilities for a created character's origin.
 *
 * @param {{ power?: number, blood?: number }} [origin] the 0x1008 wire fields (power=faction, blood=origin)
 * @returns {number[]} 8 ability values in ABILITY_COLUMNS order, each clamped to [clampMin, clampMax].
 */
export function seedAbilities({ power = 0, blood = 0 } = {}) {
  const base = Number.isFinite(SEED_TABLE.base) ? SEED_TABLE.base : 40;
  const lo = Number.isFinite(SEED_TABLE.clampMin) ? SEED_TABLE.clampMin : 0;
  const hi = Number.isFinite(SEED_TABLE.clampMax) ? SEED_TABLE.clampMax : 100;
  const origin = resolveOrigin(power, blood);
  const modifiers = origin?.modifiers ?? {};
  return ABILITY_COLUMNS.map((col) => clamp(base + (modifiers[col] ?? 0), lo, hi));
}

/** True iff `abilities` is missing or all-zero (the "기준 0" case the server should seed). */
export function abilitiesAreUnseeded(abilities) {
  if (!Array.isArray(abilities) || abilities.length === 0) {
    return true;
  }
  return abilities.every((v) => !v);
}

/**
 * Pick the abilities to persist on a created character: the player's submitted abilities when they
 * carry any non-zero value (the form sent real stats), otherwise the deterministic house-rule seed
 * for the character's origin (fixes "기준 0" on the registered character's 0x0323 record).
 *
 * @param {{ abilities?: number[]|null, power?: number, blood?: number }} req the parsed create request
 * @returns {number[]} the 8 abilities to store (ABILITY_COLUMNS order).
 */
export function resolveCreatedAbilities({ abilities = null, power = 0, blood = 0 } = {}) {
  if (!abilitiesAreUnseeded(abilities)) {
    return abilities.slice(0, 8);
  }
  return seedAbilities({ power, blood });
}
