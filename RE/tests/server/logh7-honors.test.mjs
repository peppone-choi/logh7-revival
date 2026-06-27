// logh7-honors: 훈장 decoration_bits 비트필드 순수 연산(award/revoke/has/count/list) 검증.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  awardDecoration,
  revokeDecoration,
  hasDecoration,
  decorationCount,
  decorationList,
  MAX_DECORATION_BITS,
} from '../../src/server/logh7-honors.mjs';

test('award/has: 비트 설정 + 조회', () => {
  let bits = 0;
  bits = awardDecoration(bits, 0);
  bits = awardDecoration(bits, 5);
  assert.equal(hasDecoration(bits, 0), true);
  assert.equal(hasDecoration(bits, 5), true);
  assert.equal(hasDecoration(bits, 1), false);
});

test('award는 멱등(같은 비트 두 번)', () => {
  const once = awardDecoration(0, 3);
  const twice = awardDecoration(once, 3);
  assert.equal(once, twice);
  assert.equal(decorationCount(twice), 1);
});

test('revoke: 비트 해제', () => {
  let bits = awardDecoration(awardDecoration(0, 2), 7);
  bits = revokeDecoration(bits, 2);
  assert.equal(hasDecoration(bits, 2), false);
  assert.equal(hasDecoration(bits, 7), true);
});

test('count/list: 개수 + 인덱스 목록(오름차순)', () => {
  let bits = 0;
  for (const i of [1, 4, 9, 31]) bits = awardDecoration(bits, i);
  assert.equal(decorationCount(bits), 4);
  assert.deepEqual(decorationList(bits), [1, 4, 9, 31]);
});

test('잘못된 인덱스는 무시(범위 밖)', () => {
  assert.equal(awardDecoration(0, -1), 0);
  assert.equal(awardDecoration(0, MAX_DECORATION_BITS), 0);
  assert.equal(hasDecoration(0xffffffff, 99), false);
});

test('비트31(최상위)도 안전하게 처리(부호없는 u32)', () => {
  const bits = awardDecoration(0, 31);
  assert.equal(hasDecoration(bits, 31), true);
  assert.equal(decorationCount(bits), 1);
  assert.ok(bits > 0, 'u32 unsigned이라 음수 아님');
});
