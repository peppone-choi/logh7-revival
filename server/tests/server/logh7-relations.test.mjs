// logh7-relations: 影響力/友好度 델타 + 0..MAX 클램프 + 영속 라운드트립 검증.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRelationsState, INFLUENCE_MAX, FRIENDLINESS_MAX } from '../../src/server/logh7-relations.mjs';

test('미등록 캐릭터는 影響力/友好度 0', () => {
  const rel = createRelationsState();
  assert.equal(rel.influenceOf(1), 0);
  assert.equal(rel.friendlinessOf(1), 0);
  assert.equal(rel.get(1), null);
});

test('演説/夜会: adjustInfluence 누적 + 상한 클램프', () => {
  const rel = createRelationsState();
  assert.equal(rel.adjustInfluence(7, 30), 30); // 演説
  assert.equal(rel.adjustInfluence(7, 30), 60); // 夜会
  assert.equal(rel.adjustInfluence(7, 100), INFLUENCE_MAX); // 상한
  assert.equal(rel.influenceOf(7), INFLUENCE_MAX);
});

test('狩猟/談話: adjustFriendliness 누적 + 하한 클램프', () => {
  const rel = createRelationsState();
  assert.equal(rel.adjustFriendliness(3, 40), 40); // 狩猟
  assert.equal(rel.adjustFriendliness(3, -1000), 0); // 하한
  assert.equal(rel.friendlinessOf(3), 0);
  assert.equal(rel.adjustFriendliness(3, FRIENDLINESS_MAX + 50), FRIENDLINESS_MAX); // 상한
});

test('影響力/友好度는 독립 축', () => {
  const rel = createRelationsState();
  rel.adjustInfluence(5, 20);
  rel.adjustFriendliness(5, 70);
  assert.deepEqual(rel.get(5), { influence: 20, friendliness: 70 });
});

test('비수치 델타는 무시(0 취급)', () => {
  const rel = createRelationsState();
  rel.adjustInfluence(9, 10);
  assert.equal(rel.adjustInfluence(9, undefined), 10);
  assert.equal(rel.adjustInfluence(9, NaN), 10);
});

test('영속: toSnapshot/restore 라운드트립', () => {
  const rel = createRelationsState();
  rel.adjustInfluence(1, 15);
  rel.adjustFriendliness(1, 25);
  rel.adjustInfluence(2, 40);
  const snap = rel.toSnapshot();
  const rel2 = createRelationsState();
  rel2.restore(snap);
  assert.equal(rel2.influenceOf(1), 15);
  assert.equal(rel2.friendlinessOf(1), 25);
  assert.equal(rel2.influenceOf(2), 40);
  assert.deepEqual(rel2.toSnapshot(), snap);
});
