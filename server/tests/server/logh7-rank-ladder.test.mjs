// 계급 사다리 5법칙 비교자 + 정원캡 (§B5 4.4) — 순수 캐논룰(p35, p273-284). 와이어/라이브 무관.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  compareLadder,
  sortLadder,
  headcountCap,
  canPromoteTo,
  autoPromoteLadders,
  RANK_HEADCOUNT,
} from '../../src/server/logh7-rank-ladder.mjs';

// --- 감사 2026-06-20: 자동진급(sortLadder #1 월간, 캐논 §5.3) -----------------------------------------

test('autoPromoteLadders: 각 사다리 #1(5법칙)을 다음 계급으로, 大佐이하만', () => {
  const chars = [
    { id: 1, rank: 5, faction: 'empire', achievement: 90 }, // 사다리 #1
    { id: 2, rank: 5, faction: 'empire', achievement: 30 },
    { id: 3, rank: 9, faction: 'empire', achievement: 99 }, // 准将(rank9>8) → 자동진급 제외
  ];
  const promos = autoPromoteLadders(chars, { maxAutoRank: 8 });
  const ids = promos.map((p) => p.charId);
  assert.ok(ids.includes(1), '#1(공적90) 진급');
  assert.ok(!ids.includes(2), '#2는 진급 안 함');
  assert.ok(!ids.includes(3), 'rank9는 자동진급 대상 아님');
  assert.equal(promos.find((p) => p.charId === 1).toRank, 6);
});

test('autoPromoteLadders: 목표 계급 정원 초과면 보류', () => {
  const chars = [{ id: 1, rank: 8, faction: 'empire', achievement: 99 }];
  // 准将(rank9, cap 80)을 가득 채움.
  for (let i = 0; i < 80; i += 1) chars.push({ id: 100 + i, rank: 9, faction: 'empire', achievement: 1 });
  const promos = autoPromoteLadders(chars, { maxAutoRank: 8 });
  assert.equal(promos.find((p) => p.charId === 1), undefined, '准将 정원 만석 → 大佐 자동진급 보류');
});

test('compareLadder 법칙1: 功績(achievement) 높을수록 상위', () => {
  const a = { achievement: 100 };
  const b = { achievement: 50 };
  assert.ok(compareLadder(a, b) < 0, 'a(功績100)가 b(50)보다 상위(앞)');
  assert.ok(compareLadder(b, a) > 0);
});

test('compareLadder 법칙2: 功績 동률 → 爵위(帝国軍 military)에서 높은 작위 상위', () => {
  // 공작(title 1) vs 백작(title 4 가정), 功績 동률.
  const duke = { achievement: 50, title: 1 };
  const lower = { achievement: 50, title: 4 };
  assert.ok(compareLadder(duke, lower, { faction: 'empire', track: 'military' }) < 0, '공작이 상위');
});

test('compareLadder: Alliance는 爵위를 무시(법칙2 미적용)', () => {
  // 동맹은 작위 비교 안 함 → 작위 차이가 있어도 다음 법칙(影響力/파라미터)으로 넘어간다.
  const a = { achievement: 50, title: 1, influence: 10 };
  const b = { achievement: 50, title: 7, influence: 20 };
  // 작위만 보면 a(공작)가 상위지만, 동맹은 작위 무시 → 影響力 b(20)>a(10) → b 상위.
  assert.ok(compareLadder(a, b, { faction: 'alliance', track: 'military' }) > 0, '동맹은 작위 무시, 影響力으로 b 상위');
});

test('compareLadder: 정치가(political) 트랙도 작위 무시', () => {
  const a = { achievement: 50, title: 1, influence: 10 };
  const b = { achievement: 50, title: 7, influence: 20 };
  assert.ok(compareLadder(a, b, { faction: 'empire', track: 'political' }) > 0, '정치가는 작위 무시');
});

test('compareLadder 법칙3(훈장)은 절대 무시 — medals/decorations 필드가 결과를 바꾸지 않음', () => {
  // 모든 비교 필드 동률 + 훈장만 다름 → 동률(0) 이어야 한다(법칙3 SKIP).
  const a = { achievement: 50, influence: 10, paramSum: 100, medals: 99, decorations: 5 };
  const b = { achievement: 50, influence: 10, paramSum: 100, medals: 0, decorations: 0 };
  assert.equal(compareLadder(a, b, { faction: 'empire', track: 'military' }), 0, '훈장은 비교에 안 들어감 → 동률');
});

test('compareLadder 법칙4: 功績·爵위 동률 → 影響力 tiebreak', () => {
  const a = { achievement: 50, title: 2, influence: 30 };
  const b = { achievement: 50, title: 2, influence: 10 };
  assert.ok(compareLadder(a, b, { faction: 'empire', track: 'military' }) < 0, '影響力 높은 a 상위');
});

test('compareLadder 법칙5: 그 외 동률 → 전 파라미터 합(abilities 합) 최종', () => {
  const a = { achievement: 50, influence: 10, abilities: [90, 90, 90, 90, 90, 90, 90, 90] };
  const b = { achievement: 50, influence: 10, abilities: [10, 10, 10, 10, 10, 10, 10, 10] };
  assert.ok(compareLadder(a, b) < 0, '파라미터합 큰 a 상위');
  // paramSum 명시가 abilities보다 우선.
  const c = { achievement: 50, influence: 10, paramSum: 5, abilities: [99, 99] };
  const d = { achievement: 50, influence: 10, paramSum: 500 };
  assert.ok(compareLadder(c, d) > 0, 'paramSum 명시 우선(c<d)');
});

test('sortLadder: 5법칙 순서로 상위가 앞에 정렬', () => {
  const chars = [
    { id: 'low', achievement: 10 },
    { id: 'high', achievement: 100 },
    { id: 'mid', achievement: 50 },
  ];
  assert.deepEqual(sortLadder(chars).map((c) => c.id), ['high', 'mid', 'low']);
});

test('headcountCap/canPromoteTo: 정원캡(元帥5 / 上級大将 제국전용 / 大佐이하 무제한)', () => {
  assert.equal(headcountCap(14, 'empire'), 5, '元帥 5');
  assert.equal(headcountCap(14, 'alliance'), 5);
  assert.equal(headcountCap(13, 'empire'), 5, '上級大将 제국 5');
  assert.equal(headcountCap(13, 'alliance'), 0, '上級大将 동맹 0(전용)');
  assert.equal(headcountCap(9, 'empire'), 80, '准将 80');
  assert.equal(headcountCap(8, 'empire'), Infinity, '大佐 이하 무제한');
  assert.equal(headcountCap(1, 'alliance'), Infinity);
  // 元帥 6번째 진급은 막힌다.
  assert.equal(canPromoteTo(14, 'empire', 5), false, '元帥 정원 5 찼으면 6번째 reject');
  assert.equal(canPromoteTo(14, 'empire', 4), true, '4명이면 가능');
  // 上級大将 동맹은 정원 0 → 절대 불가.
  assert.equal(canPromoteTo(13, 'alliance', 0), false, '동맹 上級大将 정원0 → 불가');
  // 大佐 이하는 인원 많아도 가능.
  assert.equal(canPromoteTo(8, 'empire', 9999), true);
});

test('RANK_HEADCOUNT은 동결(불변)', () => {
  assert.equal(Object.isFrozen(RANK_HEADCOUNT), true);
});
