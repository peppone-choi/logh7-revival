import assert from 'node:assert/strict';
import test from 'node:test';

import { buildStrategyCommandCatalog } from '../../src/server/logh7-strategy-command-catalog.mjs';
import {
  buildStrategyCommandRuleSet,
  evaluateCommandCost,
  getCommandTimingSpec,
} from '../../src/server/logh7-strategy-command-rules.mjs';

test('strategy command cost rule pays fixed manual CP costs', () => {
  const catalog = fixtureCatalog();

  assert.deepEqual(evaluateCommandCost(catalog, 'operations-001', { availableCp: 100 }), {
    status: 'payable',
    commandId: 'operations-001',
    commandNameJa: 'ワープ航行',
    costKind: 'fixed',
    requiredCp: 40,
    availableCp: 100,
    remainingCp: 60,
  });

  assert.deepEqual(evaluateCommandCost(catalog, 'operations-001', { availableCp: 39 }), {
    status: 'insufficient-cp',
    commandId: 'operations-001',
    commandNameJa: 'ワープ航行',
    costKind: 'fixed',
    requiredCp: 40,
    availableCp: 39,
    shortageCp: 1,
  });
});

test('strategy command cost rule refuses to infer variable manual CP costs', () => {
  const catalog = fixtureCatalog();

  assert.deepEqual(evaluateCommandCost(catalog, 'command-001', { availableCp: 1280 }), {
    status: 'variable-cost-unresolved',
    commandId: 'command-001',
    commandNameJa: '作戦計画',
    costKind: 'variable',
    availableCp: 1280,
    reason: 'manual-table-variable-cp',
  });
});

test('strategy command timing spec preserves fixed and ranged manual durations', () => {
  const catalog = fixtureCatalog();

  assert.deepEqual(getCommandTimingSpec(catalog, 'operations-002'), {
    commandId: 'operations-002',
    commandNameJa: '燃料補給',
    wait: { kind: 'fixed', gDays: 8, raw: '8' },
    execution: { kind: 'range', minGDays: 48, maxGDays: 960, raw: '48〜960' },
  });
});

test('strategy command rule set summarizes manual-cost evidence coverage', () => {
  const catalog = fixtureCatalog();

  assert.deepEqual(buildStrategyCommandRuleSet(catalog), {
    id: 'logh7-strategy-command-rules',
    sourceCatalogId: 'logh7-strategy-command-catalog',
    commandCount: 4,
    fixedCostCommandCount: 3,
    variableCostCommandIds: ['command-001'],
    rangedExecutionCommandIds: ['operations-002'],
    inferencePolicy: 'fixed CP and durations come from manual table; variable CP stays unresolved',
  });
});

test('strategy command rules fail closed for unknown command ids and invalid CP', () => {
  const catalog = fixtureCatalog();

  assert.throws(
    () => evaluateCommandCost(catalog, 'missing-command', { availableCp: 10 }),
    /unknown strategy command id: missing-command/,
  );
  assert.throws(
    () => evaluateCommandCost(catalog, 'operations-001', { availableCp: -1 }),
    /availableCp must be a non-negative integer/,
  );
  assert.throws(
    () => getCommandTimingSpec(catalog, 'missing-command'),
    /unknown strategy command id: missing-command/,
  );
});

function fixtureCatalog() {
  return buildStrategyCommandCatalog({
    manual: {
      _source: 'gin7 manual 別表 戦略コマンド一覧表',
      commands: [
        {
          name_ja: 'ワープ航行',
          category_ja: '作戦コマンド',
          cost_cp: 40,
          wait_time: '0',
          exec_time: '0',
          desc: '任意のグリッドへ移動。',
        },
        {
          name_ja: '燃料補給',
          category_ja: '作戦コマンド',
          cost_cp: 160,
          wait_time: '8',
          exec_time: '48〜960',
          desc: 'ワープ燃料の補給を行う。',
        },
        {
          name_ja: '遠距離移動',
          category_ja: '個人コマンド',
          cost_cp: 10,
          wait_time: '0',
          exec_time: '0',
          desc: '惑星/要塞上の施設間を移動する。',
        },
        {
          name_ja: '作戦計画',
          category_ja: '指揮コマンド',
          cost_cp: -1,
          wait_time: '0',
          exec_time: '0',
          desc: '我が軍の戦略的目標を策定する(消費CP 10〜1280)。',
        },
      ],
    },
  });
}
