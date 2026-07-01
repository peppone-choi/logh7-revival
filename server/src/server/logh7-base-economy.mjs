/**
 * PLANET / BASE ECONOMY builder — `NotifyBaseParameter` (惑星/基地 経済パラメータ).
 *
 * This is the in-world base-detail economy panel (人口/食料/生活/治安/思想/宗教/支持率) that currently
 * shows NO DATA because the server never emits the record. content/planet-economy.json carries 300
 * procedural planets (population_M / food / industry / habitable) that are orphaned today — this module
 * turns one planet into the on-wire `NotifyBaseParameter` record so the panel populates.
 *
 * SELF-CONTAINED (no edits to the hot-path login modules; avoids parallel write-conflicts with
 * logh7-info-records.mjs / logh7-login-session.mjs): the only import is the framing helper
 * `buildLobbyResponseInner` from logh7-login-protocol.mjs.
 *
 * FRAMING (identical to logh7-info-records-static.mjs): every record is a conn3 message32 object
 *   inner = [u32 BE 0][u16 BE code][LE body...]   (buildLobbyResponseInner(code, bodyLen))
 * so the LE body lives at inner.subarray(6) and total inner length = 6 + bodyLen. The body is
 * little-endian; only the 2-byte inner code prefix is big-endian. The record is FIXED 0x4a = 74 bytes
 * with the full budget[6] (the dump/parser/text serializers all agree on this stride).
 *
 * WIRE EVIDENCE — docs/logh7-info-records-wire.md §3 "Planet economy record — NotifyBaseParameter"
 * (confidence 0.82; 18 fields, fully labeled, triple-cross-validated by FUN_00438a20 dump-label,
 * FUN_00438390 binary parser, FUN_00438590 text parser). Offsets used here are the lines 244-259 of
 * that doc:
 *   0x00 u32 time            (line 244)  | 0x28 u32 population (人口)  (line 249) [CONFIRMED]
 *   0x04 u16 grid            (line 245)  | 0x2c u32 adult_population   (line 250)
 *   0x08 u32 base            (line 246)  | 0x30 u32 approval (支持率)  (line 251)
 *   0x0c u8  budget_count    (line 247)  | 0x34 u16 peace (治安)       (line 252)
 *   0x10 u32[budget] (≤6)    (line 248)  | 0x36 u16 thought (思想)     (line 253)
 *                                        | 0x38 u16 religion (宗教)    (line 254)
 *                                        | 0x3c u32 energy             (line 255)
 *                                        | 0x40 u32 food (食料)        (line 256) [CONFIRMED]
 *                                        | 0x44 u16 living (生活レベル) (line 257)
 *                                        | 0x46 u16 supplies          (line 258)
 *                                        | 0x48 u16 armor             (line 259) — record ends 0x4a
 * Size note from line 230-231: "Fixed size 0x4a = 74 bytes with full budget[6] (0x32 bytes with empty
 * budget)." over-limit string @0x765040 confirms budget[] max 6 (line 240/248).
 *
 * SCOPE NOTE (doc lines 261-274): there is NO single client record carrying the constmsg UI labels
 * 税率(tax)/造兵工廠/防衛施設 as wire fields — those are split into ResponseInformationBase 0x031f and
 * ResponseInformationInstitution 0x0321. This record is the ECONOMY half (人口/食料/生活/治安/思想/宗教/
 * 支持率). The orphaned JSON `industry` has no dedicated NotifyBaseParameter slot, so it is mapped onto
 * `budget[0]` (production-budget proxy, MEDIUM confidence) where a caller does not override it.
 *
 * CONFIDENCE per field is documented inline in buildNotifyBaseParameterInner's JSDoc.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { buildLobbyResponseInner } from './logh7-login-protocol.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = join(HERE, '..', '..', 'content');

// ===================================================================================================
// Message code + size.
//
// CODE confidence: MEDIUM. docs/logh7-info-records-wire.md §3 (lines 236-241) states NotifyBaseParameter
// is NOT routed by the client dispatcher FUN_004ba2b0 (no `NotifyBaseParameter OK` case) and has no
// client-side authoritative store — the serializers are server/debug-side. The record therefore has no
// dispatcher-pinned opcode in the export. Earlier work placed it at 0x0337 as a candidate Notify slot in the
// 0x03xx info-records family between ResponseOutfitInformationUnit (0x0331) and ResponseCardCharacter
// (0x034f) — and gate emission on a live A/B check before claiming it wired (see integration note).
// The OFFSETS below are HIGH-confidence (triple-validated); only the opcode is provisional.
// RE correction 2026-06-28: 0x0337 is not free in the live dispatcher. FUN_004b8b00 sizes it as
// 0x964, FUN_004ba2b0 logs ResponseTacticsCharacter_OK and copies 0x259 dwords to client+0x431ab4,
// and FUN_00421740 parses Input_ResponseTacticsCharacter. Do not emit this record by default.
// ===================================================================================================
export const NOTIFY_BASE_PARAMETER_CODE = 0x0337; // provisional diagnostic only; live dispatcher collision
export const NOTIFY_BASE_PARAMETER_BYTES = 0x4a; // 74 = fixed record with full budget[6] (wire doc §3)

// ===================================================================================================
// Field offsets (into inner.subarray(6); LE). docs/logh7-info-records-wire.md §3 lines 244-259.
// ===================================================================================================
export const NBP_OFF_TIME = 0x00; // u32  time              [HIGH] line 244
export const NBP_OFF_GRID = 0x04; // u16  grid (map-cell)   [HIGH] line 245
export const NBP_OFF_BASE = 0x08; // u32  base (system/base id) [HIGH] line 246
export const NBP_OFF_BUDGET_COUNT = 0x0c; // u8 budget_count [HIGH] line 247
export const NBP_OFF_BUDGET = 0x10; // u32[≤6] budget[]      [HIGH] line 248
export const NBP_OFF_POPULATION = 0x28; // u32 population 人口 [CONFIRMED] line 249
export const NBP_OFF_ADULT_POPULATION = 0x2c; // u32 adult_population [HIGH] line 250
export const NBP_OFF_APPROVAL = 0x30; // u32 approval 支持率  [HIGH] line 251
export const NBP_OFF_PEACE = 0x34; // u16 peace 治安         [HIGH] line 252
export const NBP_OFF_THOUGHT = 0x36; // u16 thought 思想      [HIGH] line 253
export const NBP_OFF_RELIGION = 0x38; // u16 religion 宗教     [HIGH] line 254
export const NBP_OFF_ENERGY = 0x3c; // u32 energy            [HIGH] line 255
export const NBP_OFF_FOOD = 0x40; // u32 food 食料           [CONFIRMED] line 256
export const NBP_OFF_LIVING = 0x44; // u16 living 生活レベル  [HIGH] line 257
export const NBP_OFF_SUPPLIES = 0x46; // u16 supplies         [HIGH] line 258
export const NBP_OFF_ARMOR = 0x48; // u16 armor              [HIGH] line 259 — record ends 0x4a

export const NBP_BUDGET_MAX = 6; // over-limit string @0x765040 confirms budget[] max 6 (line 240/248)

const clampU8 = (v) => Math.max(0, Math.min(0xff, Math.trunc(v ?? 0))) & 0xff;
const clampU16 = (v) => Math.max(0, Math.min(0xffff, Math.trunc(v ?? 0))) & 0xffff;
const clampU32 = (v) => (Math.max(0, Math.trunc(v ?? 0)) >>> 0);

/**
 * Build a `NotifyBaseParameter` record (the in-world base-detail economy panel). Emits the fixed
 * 74-byte (0x4a) record with the full budget[6] block; every field below population/food is zero-padded
 * by buildLobbyResponseInner unless supplied. Offsets are docs/logh7-info-records-wire.md §3 (lines
 * 244-259). Confidence per field:
 *   - population (0x28) and food (0x40): CONFIRMED (the two anchors named in the task; line 249/256).
 *   - time/grid/base/budget_count/budget/adult_population/approval/peace/thought/religion/energy/
 *     living/supplies/armor: HIGH (labeled + triple-cross-validated by the 3 serializers, line 244-259).
 *   - There is NO documented NotifyBaseParameter slot for ownership / development / garrison / mineral /
 *     tax (those live in ResponseInformationBase 0x031f / ResponseInformationInstitution 0x0321, doc
 *     lines 261-274). They are intentionally LEFT ZERO here (not guessed into unknown offsets) so the
 *     74-byte record stays byte-accurate. The accessor params for them are accepted-but-ignored, named
 *     so a future doc revision can wire them without a signature change.
 *
 * @param {{
 *   time?: number,            // u32 @0x00 [HIGH] world tick / sample time
 *   grid?: number,            // u16 @0x04 [HIGH] map-cell id this base sits in
 *   base?: number,            // u32 @0x08 [HIGH] system/base id
 *   budget?: number[],        // u32[≤6] @0x10 [HIGH] per-category budget (industry → budget[0] by default)
 *   population?: number,      // u32 @0x28 [CONFIRMED] 人口 (people; JSON population_M is in millions)
 *   adultPopulation?: number, // u32 @0x2c [HIGH] adult/working population
 *   approval?: number,        // u32 @0x30 [HIGH] 支持率
 *   peace?: number,           // u16 @0x34 [HIGH] 治安 ≈ peace/security
 *   thought?: number,         // u16 @0x36 [HIGH] 思想
 *   religion?: number,        // u16 @0x38 [HIGH] 宗教
 *   energy?: number,          // u32 @0x3c [HIGH]
 *   food?: number,            // u32 @0x40 [CONFIRMED] 食料
 *   living?: number,          // u16 @0x44 [HIGH] 生活レベル
 *   supplies?: number,        // u16 @0x46 [HIGH]
 *   armor?: number,           // u16 @0x48 [HIGH] planetary armor/defence stat
 *   industry?: number,        // ZERO-MAPPED: no NotifyBaseParameter slot → folded into budget[0] proxy
 *   ownership?: number,       // ACCEPTED-BUT-ZERO: lives in 0x031f base record, not this one
 *   development?: number,     // ACCEPTED-BUT-ZERO: not in NotifyBaseParameter (doc lines 261-274)
 *   garrison?: number,        // ACCEPTED-BUT-ZERO: modeled on the character record (spot_owner), not here
 *   mineral?: number,         // ACCEPTED-BUT-ZERO: lives in ResponseInformationWarehouse 0x327
 *   tax?: number,             // ACCEPTED-BUT-ZERO: tax_rate label is unreferenced/UI-only (doc line 263)
 * }} [base]
 * @returns {Buffer} message32 inner: [u32 BE 0][u16 BE code][74-byte LE body]
 */
export function buildNotifyBaseParameterInner(base = {}) {
  const {
    time = 0, grid = 0, base: baseId = 0, budget = null,
    population = 0, adultPopulation = 0, approval = 0,
    peace = 0, thought = 0, religion = 0, energy = 0,
    food = 0, living = 0, supplies = 0, armor = 0,
    industry = 0,
    // ownership/development/garrison/mineral/tax accepted-but-ignored (no documented slot — see JSDoc)
  } = base ?? {};

  const inner = buildLobbyResponseInner(NOTIFY_BASE_PARAMETER_CODE, NOTIFY_BASE_PARAMETER_BYTES);
  const body = inner.subarray(6);

  body.writeUInt32LE(clampU32(time), NBP_OFF_TIME); // 0x00
  body.writeUInt16LE(clampU16(grid), NBP_OFF_GRID); // 0x04
  body.writeUInt32LE(clampU32(baseId), NBP_OFF_BASE); // 0x08

  // budget[]: explicit caller list wins; otherwise the orphaned `industry` is folded into budget[0] as a
  // production-budget proxy (MEDIUM confidence — industry has no dedicated NotifyBaseParameter field).
  const budgetList = Array.isArray(budget)
    ? budget.slice(0, NBP_BUDGET_MAX)
    : (industry ? [clampU32(industry)] : []);
  body.writeUInt8(budgetList.length & 0xff, NBP_OFF_BUDGET_COUNT); // 0x0c
  for (let i = 0; i < budgetList.length; i += 1) {
    body.writeUInt32LE(clampU32(budgetList[i]), NBP_OFF_BUDGET + i * 4); // 0x10 + i*4 (≤6)
  }

  body.writeUInt32LE(clampU32(population), NBP_OFF_POPULATION); // 0x28 [CONFIRMED]
  body.writeUInt32LE(clampU32(adultPopulation), NBP_OFF_ADULT_POPULATION); // 0x2c
  body.writeUInt32LE(clampU32(approval), NBP_OFF_APPROVAL); // 0x30
  body.writeUInt16LE(clampU16(peace), NBP_OFF_PEACE); // 0x34
  body.writeUInt16LE(clampU16(thought), NBP_OFF_THOUGHT); // 0x36
  body.writeUInt16LE(clampU16(religion), NBP_OFF_RELIGION); // 0x38
  body.writeUInt32LE(clampU32(energy), NBP_OFF_ENERGY); // 0x3c
  body.writeUInt32LE(clampU32(food), NBP_OFF_FOOD); // 0x40 [CONFIRMED]
  body.writeUInt16LE(clampU16(living), NBP_OFF_LIVING); // 0x44
  body.writeUInt16LE(clampU16(supplies), NBP_OFF_SUPPLIES); // 0x46
  body.writeUInt16LE(clampU16(armor), NBP_OFF_ARMOR); // 0x48 — body ends at 0x4a

  return inner;
}

/**
 * Project a content/planet-economy.json planet object onto the buildNotifyBaseParameterInner shape.
 * The JSON carries the procedural pool (population_M millions, food, industry, habitable) plus name/orbit.
 * Mapping:
 *   - population_M (millions) → population u32 (× 1e6, clamped to u32 so the panel shows real people),
 *   - food → food u32 (direct),
 *   - industry → budget[0] proxy (folded by the builder; no dedicated slot),
 *   - habitable → living (生活レベル) bump (habitable planets read higher), all other fields stay 0
 *     pending a doc revision. `grid`/`base` are supplied by the caller (the world-init wiring knows the
 *     planet's grid cell + base id; the JSON does not carry them).
 *
 * @param {{ name?:string, orbit?:number, population_M?:number, food?:number, industry?:number, habitable?:boolean }} planet
 * @param {{ grid?:number, base?:number, time?:number, livingHabitable?:number, livingBarren?:number }} [ctx]
 * @returns {Parameters<typeof buildNotifyBaseParameterInner>[0]}
 */
export function planetToBaseParameter(planet = {}, ctx = {}) {
  const {
    grid = 0, base = 0, time = 0, livingHabitable = 80, livingBarren = 30,
  } = ctx ?? {};
  // population_M is in millions; the wire field is a raw u32 people count. Multiply, clamp to u32.
  const popPeople = Math.min(0xffffffff, Math.max(0, Math.trunc((planet.population_M ?? 0) * 1_000_000)));
  return {
    time,
    grid,
    base,
    population: popPeople,
    food: clampU32(planet.food),
    industry: clampU32(planet.industry), // → budget[0] proxy inside the builder
    living: planet.habitable ? livingHabitable : livingBarren,
  };
}

/**
 * Load content/planet-economy.json into a { systemName -> planets[] } map. Each value is the raw planet
 * array (name/orbit/population_M/food/industry/habitable) for that system, ready to feed
 * planetToBaseParameter + buildNotifyBaseParameterInner. The system→faction tag is attached as a
 * non-enumerable `_faction` on each array (so callers can faction-tint without a second lookup).
 *
 * @param {{ path?: string }} [opts] override the content path (for tests / alt content packs).
 * @returns {Map<string, Array<{ name:string, orbit:number, population_M:number, food:number, industry:number, habitable:boolean }>>}
 */
export function loadPlanetEconomy({ path = join(CONTENT_DIR, 'planet-economy.json') } = {}) {
  const map = new Map();
  let doc;
  try {
    doc = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return map; // missing/unreadable content → empty map (server runs without the economy pack)
  }
  const systems = Array.isArray(doc?.systems) ? doc.systems : [];
  for (const sys of systems) {
    const name = sys?.system;
    if (typeof name !== 'string') continue;
    const planets = Array.isArray(sys.planets) ? sys.planets : [];
    Object.defineProperty(planets, '_faction', { value: sys.faction ?? null, enumerable: false });
    map.set(name, planets);
  }
  return map;
}
