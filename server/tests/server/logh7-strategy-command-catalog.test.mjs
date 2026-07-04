import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  buildStrategyCommandCatalog,
  getCommandById,
  listCommandsByCategory,
  writeStrategyCommandCatalog,
} from '../../src/server/logh7-strategy-command-catalog.mjs';

test('strategy command catalog normalizes manual table evidence', () => {
  const catalog = buildStrategyCommandCatalog({ manual: fixtureManual() });

  assert.equal(catalog.id, 'logh7-strategy-command-catalog');
  assert.equal(catalog.source.evidenceGrade, 'P0-manual-table');
  assert.equal(catalog.commandCount, 5);
  assert.equal(catalog.categoryCount, 3);
  assert.deepEqual(catalog.summary, {
    fixedCostCount: 3,
    variableCostCount: 2,
    rangedWaitCount: 0,
    rangedExecutionCount: 1,
  });
  assert.deepEqual(catalog.categories, [
    { id: 'operations', nameJa: '作戦コマンド', commandCount: 2 },
    { id: 'personal', nameJa: '個人コマンド', commandCount: 1 },
    { id: 'command', nameJa: '指揮コマンド', commandCount: 2 },
  ]);

  assert.deepEqual(catalog.commands[0], {
    id: 'operations-001',
    sourceIndex: 0,
    categoryId: 'operations',
    categoryJa: '作戦コマンド',
    categoryOrdinal: 1,
    nameJa: 'ワープ航行',
    cost: { kind: 'fixed', cp: 40, raw: 40 },
    wait: { kind: 'fixed', gDays: 0, raw: '0' },
    execution: { kind: 'fixed', gDays: 0, raw: '0' },
    descriptionJa: '任意のグリッドへ移動。',
  });
});

test('strategy command catalog preserves variable costs and ranged durations', () => {
  const catalog = buildStrategyCommandCatalog({ manual: fixtureManual() });

  const refuel = getCommandById(catalog, 'operations-002');
  assert.equal(refuel.nameJa, '燃料補給');
  assert.deepEqual(refuel.execution, { kind: 'range', minGDays: 48, maxGDays: 960, raw: '48〜960' });

  const operationPlan = getCommandById(catalog, 'command-001');
  assert.equal(operationPlan.nameJa, '作戦計画');
  assert.deepEqual(operationPlan.cost, { kind: 'variable', raw: -1 });

  assert.deepEqual(
    listCommandsByCategory(catalog, 'command').map((command) => command.id),
    ['command-001', 'command-002'],
  );
  assert.equal(getCommandById(catalog, 'missing-command'), undefined);
});

test('strategy command catalog rejects unknown manual categories', () => {
  assert.throws(
    () => buildStrategyCommandCatalog({
      manual: {
        _source: 'manual fixture',
        commands: [
          {
            name_ja: '未知',
            category_ja: '未知コマンド',
            cost_cp: 0,
            wait_time: '0',
            exec_time: '0',
            desc: 'fixture',
          },
        ],
      },
    }),
    /unknown strategy command category/,
  );
});

test('strategy command catalog writer emits generated JSON', () => {
  const outDir = mkdtempSync(join(tmpdir(), 'logh7-strategy-command-'));
  const outPath = join(outDir, 'catalog.json');
  const catalog = buildStrategyCommandCatalog({ manual: fixtureManual() });

  writeStrategyCommandCatalog(outPath, catalog);

  const written = JSON.parse(readFileSync(outPath, 'utf8'));
  assert.equal(written.id, 'logh7-strategy-command-catalog');
  assert.equal(written.commandCount, 5);
});

function fixtureManual() {
  return {
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
      {
        name_ja: '作戦撤回',
        category_ja: '指揮コマンド',
        cost_cp: -1,
        wait_time: '0',
        exec_time: '0',
        desc: '既に計画されている作戦を中止する(消費CP 5〜320)。',
      },
    ],
  };
}
