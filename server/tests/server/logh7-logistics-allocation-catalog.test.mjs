import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  buildLogisticsAllocationCatalog,
  getAllocationRoleById,
  getAllocationUnitTypeById,
  writeLogisticsAllocationCatalog,
} from '../../src/server/logh7-logistics-allocation-catalog.mjs';

test('logistics allocation catalog normalizes manual authority table', () => {
  const catalog = buildLogisticsAllocationCatalog({ manual: fixtureManual() });

  assert.equal(catalog.id, 'logh7-logistics-allocation-catalog');
  assert.equal(catalog.source.evidenceGrade, 'P0-manual-table');
  assert.equal(catalog.unitTypeCount, 4);
  assert.equal(catalog.roleCount, 3);
  assert.deepEqual(catalog.unitTypes.map((unitType) => unitType.id), [
    'fleet',
    'patrol-squadron',
    'transport-fleet',
    'ground-unit',
  ]);
  assert.deepEqual(catalog.roles[0], {
    id: 'supreme-hq-operations-1st-section-chief',
    nameEn: 'Supreme HQ Operations 1st Section Chief',
    sourceIndex: 0,
    uncertain: false,
    uncertainNote: null,
    authorityByUnitType: {
      fleet: true,
      'ground-unit': false,
      'patrol-squadron': false,
      'transport-fleet': false,
    },
  });
  assert.deepEqual(catalog.summary, {
    allowedCellCount: 6,
    blockedCellCount: 4,
    uncertainCellCount: 2,
    uncertainRoleCount: 1,
  });
});

test('logistics allocation catalog exposes deterministic lookups', () => {
  const catalog = buildLogisticsAllocationCatalog({ manual: fixtureManual() });

  assert.equal(getAllocationRoleById(catalog, 'supreme-hq-operations-2nd-section-chief').sourceIndex, 1);
  assert.equal(getAllocationRoleById(catalog, 'missing-role'), undefined);
  assert.equal(getAllocationUnitTypeById(catalog, 'transport-fleet').sourceKey, '輸送艦隊');
  assert.equal(getAllocationUnitTypeById(catalog, 'missing-unit'), undefined);
});

test('logistics allocation catalog rejects malformed manual tables', () => {
  assert.throws(
    () => buildLogisticsAllocationCatalog({ manual: { ...fixtureManual(), allocation: {} } }),
    /missing allocation authority table/,
  );
  assert.throws(
    () =>
      buildLogisticsAllocationCatalog({
        manual: {
          ...fixtureManual(),
          allocation: {
            ...fixtureManual().allocation,
            authorityTable: {
              ...fixtureManual().allocation.authorityTable,
              rows: [fixtureManual().allocation.authorityTable.rows[0], fixtureManual().allocation.authorityTable.rows[0]],
            },
          },
        },
      }),
    /duplicate allocation role id/,
  );
});

test('logistics allocation catalog writer emits generated JSON', () => {
  const outPath = join(mkdtempSync(join(tmpdir(), 'logh7-allocation-')), 'catalog.json');
  const catalog = buildLogisticsAllocationCatalog({ manual: fixtureManual() });

  writeLogisticsAllocationCatalog(outPath, catalog);

  assert.deepEqual(JSON.parse(readFileSync(outPath, 'utf8')), catalog);
});

test('real logistics allocation content smoke preserves uncertainty', () => {
  const catalog = buildLogisticsAllocationCatalog();

  assert.equal(catalog.roleCount, 3);
  assert.equal(catalog.unitTypeCount, 4);
  assert.equal(catalog.summary.allowedCellCount, 6);
  assert.equal(catalog.summary.blockedCellCount, 4);
  assert.equal(catalog.summary.uncertainCellCount, 2);
});

function fixtureManual() {
  return {
    _source: 'fixture logistics manual',
    _grade: 'P0-manual-table',
    allocation: {
      prerequisite: { gatesReplenishAndReorganize: true },
      authorityTable: {
        columns: [
          '艦隊 (fleet)',
          '巡察隊 (patrol squadron)',
          '輸送艦隊 (transport fleet)',
          '地上部隊 (ground unit)',
        ],
        rows: [
          {
            role: { en: 'Supreme HQ Operations 1st Section Chief' },
            艦隊: true,
            巡察隊: false,
            輸送艦隊: false,
            地上部隊: false,
          },
          {
            role: { en: 'Supreme HQ Operations 2nd Section Chief' },
            艦隊: false,
            巡察隊: true,
            輸送艦隊: true,
            地上部隊: true,
          },
          {
            role: { en: 'Joint Operations HQ 3rd Deputy Chief (?)' },
            _uncertain: true,
            uncertainNote: 'first two cells unreadable',
            艦隊: null,
            巡察隊: null,
            輸送艦隊: true,
            地上部隊: true,
          },
        ],
      },
    },
  };
}
