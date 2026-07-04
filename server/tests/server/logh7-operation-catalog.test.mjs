import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  buildOperationCatalog,
  getOperationPurposeById,
  writeOperationCatalog,
} from '../../src/server/logh7-operation-catalog.mjs';

test('operation catalog preserves manual planning evidence without inferring CP formula', () => {
  const catalog = buildOperationCatalog({ manual: fixtureManual() });

  assert.equal(catalog.id, 'logh7-operation-catalog');
  assert.equal(catalog.source.evidenceGrade, 'P1');
  assert.equal(catalog.purposeCount, 3);
  assert.equal(catalog.planFieldCount, 4);
  assert.deepEqual(catalog.commandPointCost, {
    kind: 'variable-unresolved',
    variesBy: '発動予定時期 (scheduled activation timing)',
    numericTable: null,
    overallRange: { minCp: 10, maxCp: 1280, raw: '10-1280 CP' },
    uncertain: true,
    note: 'No numeric CP table on pp.38-40; range sourced digest §10.',
  });
  assert.deepEqual(catalog.summary, {
    purposeCount: 3,
    planFieldCount: 4,
    restrictionCount: 4,
    resultPurposeCount: 3,
    operationDurationDays: 30,
    hasUnresolvedCpFormula: true,
  });

  assert.deepEqual(getOperationPurposeById(catalog, 'occupation'), {
    id: 'occupation',
    nameJa: '占領',
    nameEn: 'Occupation',
    nameKo: '점령',
    description: 'Capture an enemy system.',
    targetConstraint: 'Target system must contain ONLY other-faction-controlled planets/fortresses at time planning (敵星系).',
    gates: { enemyOnly: true, ownHoldingRequired: false, loneShipsRequired: false, anySystem: false },
  });
});

test('operation catalog rejects malformed manual evidence', () => {
  assert.throws(
    () => buildOperationCatalog({ manual: { ...fixtureManual(), operationPurposes: [] } }),
    /operation manual must define exactly 3 purposes/,
  );
  assert.throws(
    () => buildOperationCatalog({
      manual: {
        ...fixtureManual(),
        commandPointCost: { ...fixtureManual().commandPointCost, overallRangeFromSection10: 'unclear' },
      },
    }),
    /unsupported operation CP range/,
  );
});

test('operation catalog writer emits generated JSON', () => {
  const catalog = buildOperationCatalog({ manual: fixtureManual() });
  const dir = mkdtempSync(join(tmpdir(), 'logh7-operation-catalog-'));
  const out = join(dir, 'catalog.json');

  writeOperationCatalog(out, catalog);

  assert.deepEqual(JSON.parse(readFileSync(out, 'utf8')), catalog);
});

test('real operations manual smoke preserves 30-day duration and unresolved CP', () => {
  const catalog = buildOperationCatalog();

  assert.equal(catalog.duration.durationDays, 30);
  assert.equal(catalog.commandPointCost.kind, 'variable-unresolved');
  assert.deepEqual(catalog.purposeIds, ['occupation', 'defense', 'sweep']);
});

function fixtureManual() {
  return {
    _source: 'gin7 manual pp.38-40',
    _grade: 'P1',
    _confidence_notes: ['fixture'],
    operationPurposes: [
      {
        ja: '占領',
        en: 'Occupation',
        ko: '점령',
        description: 'Capture an enemy system.',
        targetConstraint: 'Target system must contain ONLY other-faction-controlled planets/fortresses at time planning (敵星系).',
        targetMustBeEnemyOnly: true,
      },
      {
        ja: '防衛',
        en: 'Defense',
        ko: '방위',
        description: 'Hold one own systems in current state fixed period.',
        targetConstraint: 'Target system must contain least 1 own-faction-controlled planet/fortress at time of planning (自陣営の支配する惑星/要塞が最低1つ).',
        targetMustHaveOwnHolding: true,
      },
      {
        ja: '掃討',
        en: 'Sweep',
        ko: '소탕',
        description: 'Destroy/sweep enemy units present in grid.',
        targetConstraint: 'Any system may set target (全ての星系が目標に設定できます), BUT this purpose can only offered when target 独行艦 (lone ships).',
        targetAnySystem: true,
        targetOnlyLoneShips: true,
      },
    ],
    planningEffect: { bonusOnTopOfNormalMerit: true },
    planFields: [
      { ja: '作戦目的', en: 'Operation purpose', ko: '작전 목적', note: 'One 3 operationPurposes (占領 / 防衛 / 掃討).' },
      { ja: '目標星系', en: 'Target system', ko: '목표 성계', note: 'Select target system grid.' },
      { ja: '作戦参加艦艇ユニット数', en: 'Participating ship-unit count', ko: '작전 참가 함정 유닛 수', note: 'Ship-unit count.' },
      {
        ja: '発動予定時期',
        en: 'Scheduled activation timing',
        ko: '발동 예정 시기',
        note: 'CP cost varies by timing.',
        affectsCommandPointCost: true,
      },
    ],
    commandPointCost: {
      variesBy: '発動予定時期 (scheduled activation timing)',
      numericTable: null,
      overallRangeFromSection10: '10-1280 CP',
      _uncertain: true,
      note: 'No numeric CP table on pp.38-40; range sourced digest §10.',
    },
    planningRestrictions: [
      { ja: '自動撤回', en: 'Auto-withdrawal', rule: 'If target system conditions no longer met, plan automatically withdrawn.' },
      { ja: '目標星系の重複禁止', en: 'No duplicate target system per card', rule: 'A single card cannot issue two plans against same target system.' },
      { ja: '有効艦艇ユニット総数の上限', en: 'Global ship-unit cap', rule: 'Participating ship-unit count cannot exceed effective unit count.' },
      { ja: '新規策定ロック', en: 'New-plan lockout on infeasibility', rule: 'No new operation plan drafted until corrected.' },
    ],
    issuingOrders: {
      duration: {
        durationDays: 30,
        earlyWithdrawalCommand: { ja: '作戦撤回', en: 'Operation withdrawal' },
      },
    },
    operationResults: [
      { ja: '占領', en: 'Occupation', outcomes: [{ bonusFraction: 1 }] },
      { ja: '防衛', en: 'Defense', outcomes: [{ bonusFraction: 1 }] },
      { ja: '掃討', en: 'Sweep', outcomes: [{ bonusFraction: 1 }] },
    ],
  };
}
