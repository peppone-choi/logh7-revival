/**
 * NotifyBaseParameter (planet/base economy) builder — tests.
 *
 * Verifies the message32 framing, the EXACT 0x4a = 74-byte body size (fixed record with full budget[6]),
 * the confirmed population@0x28 / food@0x40 round-trip (the two anchors named in the task), the full
 * documented field layout (docs/logh7-info-records-wire.md §3 lines 244-259), the budget[] count header
 * + industry→budget[0] proxy fold, and the content loader. Body is little-endian at inner.subarray(6);
 * the 2-byte inner code prefix is big-endian. Pure/synchronous — no live client.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildNotifyBaseParameterInner,
  planetToBaseParameter,
  loadPlanetEconomy,
  NOTIFY_BASE_PARAMETER_CODE,
  NOTIFY_BASE_PARAMETER_BYTES,
  NBP_OFF_TIME,
  NBP_OFF_GRID,
  NBP_OFF_BASE,
  NBP_OFF_BUDGET_COUNT,
  NBP_OFF_BUDGET,
  NBP_OFF_POPULATION,
  NBP_OFF_ADULT_POPULATION,
  NBP_OFF_APPROVAL,
  NBP_OFF_PEACE,
  NBP_OFF_THOUGHT,
  NBP_OFF_RELIGION,
  NBP_OFF_ENERGY,
  NBP_OFF_FOOD,
  NBP_OFF_LIVING,
  NBP_OFF_SUPPLIES,
  NBP_OFF_ARMOR,
  NBP_BUDGET_MAX,
} from '../../src/server/logh7-base-economy.mjs';

/** Assert the message32 framing: [u32 BE 0][u16 BE code][body of bodyLen]; return the LE body view. */
function framedBody(inner, code, bodyLen) {
  assert.equal(inner.readUInt32BE(0), 0, 'message32 prefix dword is 0');
  assert.equal(inner.readUInt16BE(4), code, 'inner code (big-endian) matches');
  assert.equal(inner.length, 6 + bodyLen, 'total inner length = 6 + dispatch body size');
  return inner.subarray(6);
}

test('NotifyBaseParameter: exact 0x4a body, message32 framing', () => {
  assert.equal(NOTIFY_BASE_PARAMETER_BYTES, 0x4a, 'record is 74 bytes (full budget[6], wire doc §3)');
  const inner = buildNotifyBaseParameterInner({});
  const body = framedBody(inner, NOTIFY_BASE_PARAMETER_CODE, NOTIFY_BASE_PARAMETER_BYTES);
  assert.equal(body.length, 0x4a, 'body view is exactly 74 bytes');
  // empty record is all zero (buildLobbyResponseInner zero-pads)
  assert.ok(body.every((b) => b === 0), 'empty record body is fully zeroed');
});

test('NotifyBaseParameter: population@0x28 + food@0x40 round-trip (confirmed anchors)', () => {
  const inner = buildNotifyBaseParameterInner({ population: 569_000_000, food: 523 });
  const body = framedBody(inner, NOTIFY_BASE_PARAMETER_CODE, NOTIFY_BASE_PARAMETER_BYTES);
  assert.equal(NBP_OFF_POPULATION, 0x28, 'population offset is the confirmed 0x28');
  assert.equal(NBP_OFF_FOOD, 0x40, 'food offset is the confirmed 0x40');
  assert.equal(body.readUInt32LE(0x28), 569_000_000, 'population round-trips at 0x28');
  assert.equal(body.readUInt32LE(0x40), 523, 'food round-trips at 0x40');
});

test('NotifyBaseParameter: full documented field layout (lines 244-259)', () => {
  const inner = buildNotifyBaseParameterInner({
    time: 0x11223344,
    grid: 0xa1b2,
    base: 0x0000007f,
    population: 1_000_000,
    adultPopulation: 600_000,
    approval: 77,
    peace: 88,
    thought: 12,
    religion: 34,
    energy: 9000,
    food: 4321,
    living: 65,
    supplies: 250,
    armor: 1500,
  });
  const body = framedBody(inner, NOTIFY_BASE_PARAMETER_CODE, NOTIFY_BASE_PARAMETER_BYTES);
  assert.equal(body.readUInt32LE(NBP_OFF_TIME), 0x11223344, 'time u32 @0x00');
  assert.equal(body.readUInt16LE(NBP_OFF_GRID), 0xa1b2, 'grid u16 @0x04');
  assert.equal(body.readUInt32LE(NBP_OFF_BASE), 0x7f, 'base u32 @0x08');
  assert.equal(body.readUInt32LE(NBP_OFF_ADULT_POPULATION), 600_000, 'adult_population u32 @0x2c');
  assert.equal(body.readUInt32LE(NBP_OFF_APPROVAL), 77, 'approval u32 @0x30');
  assert.equal(body.readUInt16LE(NBP_OFF_PEACE), 88, 'peace u16 @0x34');
  assert.equal(body.readUInt16LE(NBP_OFF_THOUGHT), 12, 'thought u16 @0x36');
  assert.equal(body.readUInt16LE(NBP_OFF_RELIGION), 34, 'religion u16 @0x38');
  assert.equal(body.readUInt32LE(NBP_OFF_ENERGY), 9000, 'energy u32 @0x3c');
  assert.equal(body.readUInt16LE(NBP_OFF_LIVING), 65, 'living u16 @0x44');
  assert.equal(body.readUInt16LE(NBP_OFF_SUPPLIES), 250, 'supplies u16 @0x46');
  assert.equal(body.readUInt16LE(NBP_OFF_ARMOR), 1500, 'armor u16 @0x48 — body ends 0x4a');
});

test('NotifyBaseParameter: explicit budget[] writes count@0x0c + entries@0x10 (≤6)', () => {
  const inner = buildNotifyBaseParameterInner({ budget: [10, 20, 30, 40, 50, 60, 70 /* >6 dropped */] });
  const body = framedBody(inner, NOTIFY_BASE_PARAMETER_CODE, NOTIFY_BASE_PARAMETER_BYTES);
  assert.equal(body.readUInt8(NBP_OFF_BUDGET_COUNT), NBP_BUDGET_MAX, 'budget_count clamps to 6 @0x0c');
  for (let i = 0; i < NBP_BUDGET_MAX; i += 1) {
    assert.equal(body.readUInt32LE(NBP_OFF_BUDGET + i * 4), (i + 1) * 10, `budget[${i}] @0x10+${i * 4}`);
  }
});

test('NotifyBaseParameter: orphaned industry folds into budget[0] when no explicit budget', () => {
  const inner = buildNotifyBaseParameterInner({ industry: 308 });
  const body = framedBody(inner, NOTIFY_BASE_PARAMETER_CODE, NOTIFY_BASE_PARAMETER_BYTES);
  assert.equal(body.readUInt8(NBP_OFF_BUDGET_COUNT), 1, 'one budget entry from industry');
  assert.equal(body.readUInt32LE(NBP_OFF_BUDGET), 308, 'industry → budget[0] @0x10');
});

test('NotifyBaseParameter: explicit budget wins over industry fold', () => {
  const inner = buildNotifyBaseParameterInner({ industry: 999, budget: [5] });
  const body = framedBody(inner, NOTIFY_BASE_PARAMETER_CODE, NOTIFY_BASE_PARAMETER_BYTES);
  assert.equal(body.readUInt8(NBP_OFF_BUDGET_COUNT), 1, 'explicit budget count');
  assert.equal(body.readUInt32LE(NBP_OFF_BUDGET), 5, 'explicit budget[0] wins, industry ignored');
});

test('NotifyBaseParameter: ownership/development/garrison/mineral/tax accepted-but-zeroed', () => {
  // These have no documented NotifyBaseParameter slot (doc lines 261-274) — must NOT corrupt the record.
  const inner = buildNotifyBaseParameterInner({
    ownership: 9, development: 9, garrison: 9, mineral: 9, tax: 9,
  });
  const body = framedBody(inner, NOTIFY_BASE_PARAMETER_CODE, NOTIFY_BASE_PARAMETER_BYTES);
  assert.ok(body.every((b) => b === 0), 'undocumented fields leave the record fully zeroed');
});

test('NotifyBaseParameter: clamps oversized + negative inputs (saturating)', () => {
  const inner = buildNotifyBaseParameterInner({
    population: -5, peace: 0x1_0000 + 3, armor: -1,
  });
  const body = framedBody(inner, NOTIFY_BASE_PARAMETER_CODE, NOTIFY_BASE_PARAMETER_BYTES);
  assert.equal(body.readUInt32LE(NBP_OFF_POPULATION), 0, 'negative population clamps to 0');
  assert.equal(body.readUInt16LE(NBP_OFF_PEACE), 0xffff, 'oversized peace saturates to u16 max');
  assert.equal(body.readUInt16LE(NBP_OFF_ARMOR), 0, 'negative armor clamps to 0');
});

test('planetToBaseParameter: maps population_M (millions)→people, food direct, industry→budget, habitable→living', () => {
  const planet = { name: 'バドガオン', orbit: 3, population_M: 355, food: 429, industry: 308, habitable: true };
  const shaped = planetToBaseParameter(planet, { grid: 11, base: 22, time: 100 });
  assert.equal(shaped.population, 355_000_000, 'population_M millions → raw people u32');
  assert.equal(shaped.food, 429, 'food direct');
  assert.equal(shaped.industry, 308, 'industry passed through (folds to budget[0] in builder)');
  assert.equal(shaped.grid, 11, 'grid from ctx');
  assert.equal(shaped.base, 22, 'base from ctx');
  assert.ok(shaped.living > 0, 'habitable planet gets a living bump');

  const barren = planetToBaseParameter({ population_M: 1, habitable: false });
  assert.ok(barren.living < shaped.living, 'barren planet reads lower living than habitable');

  // end-to-end: shaped record round-trips through the builder at the confirmed offsets
  const body = buildNotifyBaseParameterInner(shaped).subarray(6);
  assert.equal(body.readUInt32LE(NBP_OFF_POPULATION), 355_000_000, 'population at 0x28 via planet map');
  assert.equal(body.readUInt32LE(NBP_OFF_FOOD), 429, 'food at 0x40 via planet map');
  assert.equal(body.readUInt32LE(NBP_OFF_BUDGET), 308, 'industry at budget[0] 0x10 via planet map');
});

test('loadPlanetEconomy: builds systemName→planets map from content (281 planets / 80 systems)', () => {
  const map = loadPlanetEconomy();
  assert.ok(map instanceof Map, 'returns a Map');
  assert.equal(map.size, 80, '80 systems loaded');
  let planetCount = 0;
  for (const planets of map.values()) planetCount += planets.length;
  assert.equal(planetCount, 281, '281 planets total');

  const lunbini = map.get('ルンビーニ');
  assert.ok(Array.isArray(lunbini), 'ルンビーニ system present');
  assert.equal(lunbini[0].name, 'バクタプール', 'first planet name preserved');
  assert.equal(lunbini[0].population_M, 135, 'population_M preserved from content');
  assert.equal(lunbini._faction, 'alliance', '_faction tag attached (non-enumerable)');
  assert.ok(!Object.keys(lunbini).includes('_faction'), '_faction is non-enumerable on the array');
});

test('loadPlanetEconomy: missing content path → empty map (no throw)', () => {
  const map = loadPlanetEconomy({ path: '/no/such/planet-economy.json' });
  assert.ok(map instanceof Map, 'returns a Map even when content is missing');
  assert.equal(map.size, 0, 'empty map for unreadable content');
});
