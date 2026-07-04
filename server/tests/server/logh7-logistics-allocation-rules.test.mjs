import assert from 'node:assert/strict';
import test from 'node:test';

import { buildLogisticsAllocationCatalog } from '../../src/server/logh7-logistics-allocation-catalog.mjs';
import {
  buildLogisticsAllocationRuleSet,
  evaluateAllocationAuthority,
} from '../../src/server/logh7-logistics-allocation-rules.mjs';

test('allocation authority rule allows manual-approved role unit pairs', () => {
  const catalog = buildLogisticsAllocationCatalog({ manual: fixtureManual() });

  assert.deepEqual(
    evaluateAllocationAuthority(catalog, {
      roleId: 'supreme-hq-operations-2nd-section-chief',
      unitTypeId: 'transport-fleet',
    }),
    {
      status: 'allowed',
      roleId: 'supreme-hq-operations-2nd-section-chief',
      roleNameEn: 'Supreme HQ Operations 2nd Section Chief',
      unitTypeId: 'transport-fleet',
      unitTypeNameEn: 'transport fleet',
      evidence: 'manual-allocation-authority-table',
    },
  );
});

test('allocation authority rule blocks explicit manual denials', () => {
  const catalog = buildLogisticsAllocationCatalog({ manual: fixtureManual() });

  assert.deepEqual(
    evaluateAllocationAuthority(catalog, {
      roleId: 'supreme-hq-operations-1st-section-chief',
      unitTypeId: 'ground-unit',
    }),
    {
      status: 'blocked',
      roleId: 'supreme-hq-operations-1st-section-chief',
      roleNameEn: 'Supreme HQ Operations 1st Section Chief',
      unitTypeId: 'ground-unit',
      unitTypeNameEn: 'ground unit',
      reason: 'manual-authority-denied',
    },
  );
});

test('allocation authority rule preserves uncertain OCR cells', () => {
  const catalog = buildLogisticsAllocationCatalog({ manual: fixtureManual() });

  assert.deepEqual(
    evaluateAllocationAuthority(catalog, {
      roleId: 'joint-operations-hq-3rd-deputy-chief',
      unitTypeId: 'fleet',
    }),
    {
      status: 'uncertain',
      roleId: 'joint-operations-hq-3rd-deputy-chief',
      roleNameEn: 'Joint Operations HQ 3rd Deputy Chief (?)',
      unitTypeId: 'fleet',
      unitTypeNameEn: 'fleet',
      reason: 'manual-ocr-uncertain-cell',
      uncertainNote: 'first two cells unreadable',
    },
  );
});

test('allocation authority rule fails closed for unknown ids', () => {
  const catalog = buildLogisticsAllocationCatalog({ manual: fixtureManual() });

  assert.deepEqual(
    evaluateAllocationAuthority(catalog, {
      roleId: 'unknown-role',
      unitTypeId: 'fleet',
    }),
    {
      status: 'unknown-role',
      roleId: 'unknown-role',
      unitTypeId: 'fleet',
      reason: 'role-not-in-allocation-catalog',
    },
  );
  assert.deepEqual(
    evaluateAllocationAuthority(catalog, {
      roleId: 'supreme-hq-operations-1st-section-chief',
      unitTypeId: 'unknown-unit',
    }),
    {
      status: 'unknown-unit-type',
      roleId: 'supreme-hq-operations-1st-section-chief',
      unitTypeId: 'unknown-unit',
      reason: 'unit-type-not-in-allocation-catalog',
    },
  );
});

test('allocation rule set summarizes manual table scope', () => {
  const catalog = buildLogisticsAllocationCatalog({ manual: fixtureManual() });

  assert.deepEqual(buildLogisticsAllocationRuleSet(catalog), {
    id: 'logh7-logistics-allocation-rules',
    sourceCatalogId: 'logh7-logistics-allocation-catalog',
    roleCount: 3,
    unitTypeCount: 4,
    inferencePolicy: 'use explicit manual authority cells only; preserve null OCR cells as uncertain',
  });
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
