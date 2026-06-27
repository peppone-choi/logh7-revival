import test from 'node:test';
import assert from 'node:assert/strict';
import {
  titleLadder, titleRank, titleName, canHoldFief, validateGrantTitle, validateGrantFief,
  fiefIncome, applyGrantFief, applyRevokeFief,
} from '../../src/server/logh7-imperial-titles.mjs';

test('the hereditary title ladder is the 5 titled ranks + knight + commoner', () => {
  const ladder = titleLadder();
  assert.ok(ladder.length >= 7);
  assert.equal(titleRank('공작'), 1, 'Duke = rank 1');
  assert.equal(titleRank('남작'), 5, 'Baron = rank 5');
  assert.equal(titleRank('제국기사'), 6);
  assert.equal(titleRank('Duke'), 1, 'by English name too');
  assert.equal(titleRank('not-a-title'), null);
});

test('titleName resolves a ladder rank or name to the 작위명 written to the 0x0323/0x0356 titlename', () => {
  // numeric ladder rank (the 0x1008 create-form `title` byte) -> displayed name
  assert.equal(titleName(1), '공작', 'rank 1 = 공작');
  assert.equal(titleName(5), '남작', 'rank 5 = 남작');
  assert.equal(titleName(6), '제국기사');
  assert.equal(titleName(1, { lang: 'en' }), 'Duke');
  // bare commoner (rank 7) carries no displayed peerage name
  assert.equal(titleName(7), '');
  // 0 / null / negative = untitled -> empty titlename (no guard needed by the builder)
  assert.equal(titleName(0), '');
  assert.equal(titleName(null), '');
  // already-resolved name strings pass through; unknown ladder ranks are empty
  assert.equal(titleName('공작'), '공작');
  assert.equal(titleName('Baron'), '남작');
  assert.equal(titleName(99), '');
});

test('a fief requires Baron(남작)-or-higher title', () => {
  assert.equal(canHoldFief('공작'), true);
  assert.equal(canHoldFief('남작'), true);
  assert.equal(canHoldFief('제국기사'), false, 'a knight cannot hold a fief');
  assert.equal(canHoldFief('평민'), false);
  assert.equal(canHoldFief(5), true);
  assert.equal(canHoldFief(6), false);
});

test('grant title gates on noble birth + rank', () => {
  assert.equal(validateGrantTitle({ target: { socialClass: 'commoner' }, newTitle: '남작' }).ok, false);
  assert.equal(validateGrantTitle({ target: { socialClass: 'noble', rankId: 5 }, newTitle: '백작' }).ok, true);
  assert.equal(validateGrantTitle({ target: { socialClass: 'noble', rankId: 1 }, newTitle: '백작', minMilitaryRank: 3 }).ok, false);
  assert.equal(validateGrantTitle({ target: { socialClass: 'noble' }, newTitle: 'bogus' }).ok, false);
});

test('grant fief gates on title + an unowned base', () => {
  assert.equal(validateGrantFief({ target: { title: '제국기사' }, base: { id: 1 } }).ok, false);
  assert.equal(validateGrantFief({ target: { title: '백작' }, base: { id: 1 } }).ok, true);
  assert.equal(validateGrantFief({ target: { title: '백작' }, base: { id: 1, owner: 99 } }).ok, false, 'already a fief');
  assert.equal(validateGrantFief({ target: { title: '백작' } }).ok, false, 'no base');
});

test('fief income = base economy * tax rate, summed over fiefs', () => {
  assert.equal(fiefIncome([{ economy: 1000, taxRatePct: 20 }, { economy: 500, taxRatePct: 10 }]), 250);
  assert.equal(fiefIncome([]), 0);
  // tuning override (a mod's defines)
  assert.equal(fiefIncome([{ economy: 1000 }], { taxRatePct: 50 }), 500);
});

test('apply grant/revoke fief mutates ownership purely', () => {
  const granted = applyGrantFief({ id: 7 }, { id: 42, fiefs: [] });
  assert.equal(granted.base.owner, 42);
  assert.equal(granted.base.isFief, true);
  assert.deepEqual(granted.lord.fiefs, [7]);
  const revoked = applyRevokeFief(granted.base, granted.lord);
  assert.equal(revoked.base.owner, 0);
  assert.equal(revoked.base.isFief, false);
  assert.deepEqual(revoked.lord.fiefs, []);
});
