// logh7-combat-death: 전사(戦死) 토글 결정 + 계급별 평가포인트(SERVER DESIGN) 검증.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveFlagshipDestroyed, rankDeathAward, DEATH_AWARD_BASE } from '../../src/server/logh7-combat-death.mjs';

test('rankDeathAward: 准将(제국 id9) 미만 0, 이상부터 계급 가중', () => {
  assert.equal(rankDeathAward(8, 'empire'), 0, '대좌(8)는 0');
  assert.equal(rankDeathAward(9, 'empire'), DEATH_AWARD_BASE, '准将(9)=base');
  assert.equal(rankDeathAward(14, 'empire'), DEATH_AWARD_BASE * 6, '元帥(14)=base*6');
  assert.ok(rankDeathAward(12, 'empire') > rankDeathAward(10, 'empire'), '높을수록 큼');
});

test('rankDeathAward: 동맹 floor는 准将 id10', () => {
  assert.equal(rankDeathAward(9, 'alliance'), 0, '동맹 9(소장)는 准将 미만 → 0');
  assert.equal(rankDeathAward(10, 'alliance'), DEATH_AWARD_BASE, '동맹 准将(10)=base');
});

test('resolveFlagshipDestroyed: 토글 off → 負傷 + 帰還惑星 워프(생존)', () => {
  const r = resolveFlagshipDestroyed({ deathToggle: false, rank: 14, returnPlanet: '오딘' });
  assert.equal(r.outcome, 'injured');
  assert.equal(r.alive, true);
  assert.equal(r.injured, true);
  assert.equal(r.warpTo, '오딘');
  assert.equal(r.evalAward, undefined, '부상은 평가포인트 없음');
});

test('resolveFlagshipDestroyed: 帰還惑星 미지정 → 出身地 fallback', () => {
  const r = resolveFlagshipDestroyed({ deathToggle: false, returnPlanet: null, birthplace: '하이네센' });
  assert.equal(r.warpTo, '하이네센');
});

test('resolveFlagshipDestroyed: 토글 on → 사망 + 准将+ 평가포인트', () => {
  const killed = resolveFlagshipDestroyed({ deathToggle: true, rank: 11, faction: 'empire' });
  assert.equal(killed.outcome, 'killed');
  assert.equal(killed.alive, false);
  assert.ok(killed.evalAward > 0, '准将 이상 사망은 평가포인트 지급');

  const lowRank = resolveFlagshipDestroyed({ deathToggle: true, rank: 5, faction: 'empire' });
  assert.equal(lowRank.outcome, 'killed');
  assert.equal(lowRank.evalAward, 0, '准将 미만 사망은 0');
});
