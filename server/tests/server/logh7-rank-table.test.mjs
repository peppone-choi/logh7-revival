/**
 * RANK TABLE — tests. The accessor over content/roster/ranks.json must resolve names by (id, faction) in
 * BOTH directions, key by faction (the two ladders share names like 元帥 but diverge at the floor and at
 * 上級大将), localize across ja/ko/en, and expose RANK_MAX = 14. Pure/synchronous — no live client.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  loadRankTable,
  rankName,
  rankId,
  clampRankId,
  normalizeFaction,
  RANK_MAX,
  RANK_FACTIONS,
} from '../../src/server/logh7-rank-table.mjs';

test('RANK_MAX is 14 (top rung)', () => {
  assert.equal(RANK_MAX, 14);
});

test('loadRankTable loads 28 ranks (14 empire + 14 alliance) and memoises', () => {
  const t = loadRankTable();
  assert.equal(t.ranks.length, 28);
  const empire = t.ranks.filter((r) => normalizeFaction(r.faction) === 'empire');
  const alliance = t.ranks.filter((r) => normalizeFaction(r.faction) === 'alliance');
  assert.equal(empire.length, 14);
  assert.equal(alliance.length, 14);
  // same handle returned on a second call (idempotent cache)
  assert.equal(loadRankTable(), t);
});

test('every faction ladder covers ids 1..14 exactly once', () => {
  const t = loadRankTable();
  for (const faction of RANK_FACTIONS) {
    const ids = t.ranks
      .filter((r) => normalizeFaction(r.faction) === faction)
      .map((r) => r.id)
      .sort((a, b) => a - b);
    assert.deepEqual(ids, Array.from({ length: RANK_MAX }, (_, i) => i + 1), `${faction} ids`);
  }
});

test('rankName: id 14 = 元帥/Marshal in BOTH factions (default lang ja)', () => {
  assert.equal(rankName({ id: 14, faction: 'empire' }), '元帥');
  assert.equal(rankName({ id: 14, faction: 'alliance' }), '元帥');
  assert.equal(rankName({ id: 14, faction: 'empire', lang: 'en' }), 'Marshal');
  assert.equal(rankName({ id: 14, faction: 'empire', lang: 'ko' }), '원수');
});

test('rankName: the floor (id 1) DIFFERS by faction', () => {
  assert.equal(rankName({ id: 1, faction: 'empire' }), '兵長'); // Lance Corporal
  assert.equal(rankName({ id: 1, faction: 'alliance' }), '軍曹'); // Sergeant
  assert.notEqual(
    rankName({ id: 1, faction: 'empire' }),
    rankName({ id: 1, faction: 'alliance' }),
  );
});

test('rankName: Empire has 上級大将 at id 13, Alliance has 大将 there', () => {
  assert.equal(rankName({ id: 13, faction: 'empire' }), '上級大将');
  assert.equal(rankName({ id: 13, faction: 'empire', lang: 'en' }), 'Senior Admiral');
  assert.equal(rankName({ id: 13, faction: 'alliance' }), '大将');
  assert.equal(rankName({ id: 13, faction: 'alliance', lang: 'en' }), 'Admiral');
});

test('rankName: localizes across ja/ko/en for a mid rung', () => {
  assert.equal(rankName({ id: 12, faction: 'empire', lang: 'ja' }), '大将');
  assert.equal(rankName({ id: 12, faction: 'empire', lang: 'ko' }), '대장');
  assert.equal(rankName({ id: 12, faction: 'empire', lang: 'en' }), 'Admiral');
});

test('rankName: unknown (faction,id) returns empty string', () => {
  assert.equal(rankName({ id: 99, faction: 'empire' }), '');
  assert.equal(rankName({ id: 0, faction: 'empire' }), '');
  assert.equal(rankName({ id: 5, faction: 'klingon' }), '');
});

test('rankId: reverse lookup by JP name returns {id, faction}', () => {
  assert.deepEqual(rankId('兵長'), { id: 1, faction: 'empire' });
  assert.deepEqual(rankId('軍曹'), { id: 1, faction: 'alliance' });
  assert.deepEqual(rankId('上級大将'), { id: 13, faction: 'empire' });
});

test('rankId: 느슨한 영문 계급 별칭 — 캐논 정식명이 아닌 통칭도 해소(로스터 데이터 흡수)', () => {
  // 로스터가 'Lieutenant'(통칭)을 쓰면 캐논 name_en은 'First Lieutenant'(中尉, id 5)이라 직접 매칭 실패 →
  // 별칭 테이블로 해소(Julian Mintz 등). name_ja 경유라 진영 무관하게 동작.
  // 中尉의 id는 진영-로컬(제국 사다리는 上級大将 때문에 한 칸 밀려 中尉=4, 동맹=5) — 별칭이 name_ja 경유라 각 진영 올바른 id로 해소.
  assert.deepEqual(rankId('Lieutenant', { faction: 'alliance' }), { id: 5, faction: 'alliance' });
  assert.deepEqual(rankId('Lieutenant', { faction: 'empire' }), { id: 4, faction: 'empire' });
  assert.deepEqual(rankId('Sub Lieutenant', { faction: 'alliance' }), { id: 4, faction: 'alliance' });
  assert.deepEqual(rankId('Lieutenant Commander', { faction: 'alliance' }), { id: 7, faction: 'alliance' });
  // 정식 name_en은 여전히 동작(회귀 없음).
  assert.deepEqual(rankId('Marshal', { faction: 'empire' }), { id: 14, faction: 'empire' });
});

test('rankId: reverse lookup works for ko and en names', () => {
  assert.deepEqual(rankId('Senior Admiral'), { id: 13, faction: 'empire' });
  assert.deepEqual(rankId('상급대장'), { id: 13, faction: 'empire' });
  assert.deepEqual(rankId('Sergeant Major'), { id: 2, faction: 'alliance' });
  assert.deepEqual(rankId('상사'), { id: 2, faction: 'alliance' });
});

test('rankId: case-insensitive and whitespace-trimmed', () => {
  assert.deepEqual(rankId('  marshal  '), { id: 14, faction: 'empire' });
  assert.deepEqual(rankId('SENIOR ADMIRAL'), { id: 13, faction: 'empire' });
});

test('rankId: shared name (元帥) resolves to empire by default but honours a faction hint', () => {
  // both ladders have 元帥@14; default (no hint) is deterministic = first-loaded ladder (empire).
  assert.deepEqual(rankId('元帥'), { id: 14, faction: 'empire' });
  assert.deepEqual(rankId('元帥', { faction: 'alliance' }), { id: 14, faction: 'alliance' });
  assert.deepEqual(rankId('元帥', { faction: 'empire' }), { id: 14, faction: 'empire' });
});

test('rankId: round-trips against rankName for every rung in both ladders', () => {
  const t = loadRankTable();
  for (const faction of RANK_FACTIONS) {
    for (let id = 1; id <= RANK_MAX; id += 1) {
      const ja = rankName({ id, faction, lang: 'ja' });
      assert.equal(rankId(ja, { faction }).id, id, `${faction} ja id ${id}`);
      assert.equal(rankId(ja, { faction }).faction, faction, `${faction} ja faction ${id}`);
      const en = rankName({ id, faction, lang: 'en' });
      assert.equal(rankId(en, { faction }).id, id, `${faction} en id ${id}`);
    }
  }
});

test('rankId: unknown name returns null', () => {
  assert.equal(rankId('Grand Poobah'), null);
  assert.equal(rankId(''), null);
  assert.equal(rankId(null), null);
  assert.equal(rankId('元帥', { faction: 'klingon' }), null);
});

test('normalizeFaction: canonicalises english + JP/KO aliases, null on unknown', () => {
  assert.equal(normalizeFaction('Empire'), 'empire');
  assert.equal(normalizeFaction('imperial'), 'empire');
  assert.equal(normalizeFaction('帝国'), 'empire');
  assert.equal(normalizeFaction('제국'), 'empire');
  assert.equal(normalizeFaction('Alliance'), 'alliance');
  assert.equal(normalizeFaction('free planets'), 'alliance');
  assert.equal(normalizeFaction('同盟'), 'alliance');
  assert.equal(normalizeFaction('동맹'), 'alliance');
  assert.equal(normalizeFaction(0), 'empire');
  assert.equal(normalizeFaction(1), 'alliance');
  assert.equal(normalizeFaction('martian'), null);
  assert.equal(normalizeFaction(null), null);
});

test('table.get returns the full record (used to source name@0xd6/0xd8 together)', () => {
  const t = loadRankTable();
  const rec = t.get('empire', 14);
  assert.equal(rec.id, 14);
  assert.equal(rec.faction, 'empire');
  assert.equal(rec.name_ja, '元帥');
  assert.equal(t.get('alliance', 13).name_ja, '大将');
  assert.equal(t.get('empire', 999), null);
});

test('clampRankId keeps ids inside 1..RANK_MAX', () => {
  assert.equal(clampRankId(0), 1);
  assert.equal(clampRankId(-5), 1);
  assert.equal(clampRankId(1), 1);
  assert.equal(clampRankId(14), 14);
  assert.equal(clampRankId(99), 14);
  assert.equal(clampRankId(7.9), 7);
  assert.equal(clampRankId(NaN), 1);
  assert.equal(clampRankId(undefined), 1);
});
