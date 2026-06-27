import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openContentSource } from '../../src/server/logh7-content-source.mjs';

// Build a fresh in-memory content DB from the JSON sources for every run.
function src() {
  return openContentSource({ build: true });
}

test('content DB loads every dataset', () => {
  const s = src();
  const c = s.counts();
  assert.equal(c.nations, 3, 'three powers (empire/alliance/neutral) — corridor is geography, not a nation');
  assert.equal(c.star_systems, 80);
  assert.equal(c.planets, 281);
  assert.equal(c.fortresses, 6);
  assert.ok(c.roster >= 70, 'manual initial duty-card holders');
  assert.ok(c.client_strings >= 9000, 'MsgDat catalog loaded');
  s.close();
});

test('galaxy: systems carry faction, planets are orbit-ordered, Iserlohn is an Empire fortress', () => {
  const s = src();
  const iserlohn = s.getSystem('イゼルローン');
  assert.ok(iserlohn, 'Iserlohn system exists');
  assert.equal(iserlohn.faction, 'empire');
  assert.equal(iserlohn.canon_col, 53);
  assert.equal(iserlohn.canon_row, 12);
  assert.equal(iserlohn.spectral_class, 'K');
  assert.equal(iserlohn.canon_line_marker_x, 202.917);
  assert.equal(iserlohn.canon_line_marker_y, 439.256);
  assert.deepEqual(iserlohn.fortresses, ['イゼルローン']);

  const valhalla = s.getSystem('ヴァルハラ'); // contains Odin
  assert.equal(valhalla.faction, 'empire');
  const orbits = valhalla.planets.map((p) => p.orbit);
  assert.deepEqual(orbits, [...orbits].sort((a, b) => a - b), 'planets returned inner->outer');

  // corridor is a flag, never a faction
  const factions = new Set(s.listSystems().map((x) => x.faction));
  assert.ok(!factions.has('corridor'));
  s.close();
});

test('character roster has innate abilities not derived from rank', () => {
  const s = src();
  const chars = s.listCharacters();
  assert.ok(chars.length >= 90, 'manual + IV EX cast loaded');
  // 8 abilities present
  const yang = s.getCharacter('ヤン');
  assert.ok(yang, 'Yang in roster');
  for (const k of ['tochi', 'seiji', 'unei', 'joho', 'shiki', 'kido', 'kogeki', 'bogyo']) {
    assert.ok(Number.isInteger(yang[k]), `Yang has ${k}`);
  }
  // ability is innate, not a function of rank: a politician (Oberstein) outclasses on intel/politics,
  // and military genius on combat — independent axes
  const ober = s.getCharacter('オーベルシュタイン');
  if (ober) assert.ok(ober.joho >= ober.kogeki, 'Oberstein: intel >= attack (profile, not rank)');
  s.close();
});

test('constmsg catalog is queryable by id', () => {
  const s = src();
  assert.equal(s.constmsg(0), '旗艦用コマンド');
  assert.ok(s.rankLadder('military').includes('元帥'));
  assert.ok(s.listShipClasses().length >= 60);
  s.close();
});
