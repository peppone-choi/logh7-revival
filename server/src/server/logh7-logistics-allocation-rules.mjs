import {
  getAllocationRoleById,
  getAllocationUnitTypeById,
} from './logh7-logistics-allocation-catalog.mjs';

export function buildLogisticsAllocationRuleSet(catalog) {
  return {
    id: 'logh7-logistics-allocation-rules',
    sourceCatalogId: catalog.id,
    roleCount: catalog.roleCount,
    unitTypeCount: catalog.unitTypeCount,
    inferencePolicy: 'use explicit manual authority cells only; preserve null OCR cells as uncertain',
  };
}

export function evaluateAllocationAuthority(catalog, { roleId, unitTypeId }) {
  assertNonEmptyString('roleId', roleId);
  assertNonEmptyString('unitTypeId', unitTypeId);

  const role = getAllocationRoleById(catalog, roleId);
  if (!role) {
    return {
      status: 'unknown-role',
      roleId,
      unitTypeId,
      reason: 'role-not-in-allocation-catalog',
    };
  }
  const unitType = getAllocationUnitTypeById(catalog, unitTypeId);
  if (!unitType) {
    return {
      status: 'unknown-unit-type',
      roleId,
      unitTypeId,
      reason: 'unit-type-not-in-allocation-catalog',
    };
  }

  const cell = role.authorityByUnitType[unitTypeId];
  if (cell === null) {
    return {
      status: 'uncertain',
      roleId,
      roleNameEn: role.nameEn,
      unitTypeId,
      unitTypeNameEn: unitType.nameEn,
      reason: 'manual-ocr-uncertain-cell',
      uncertainNote: role.uncertainNote,
    };
  }
  if (cell === false) {
    return {
      status: 'blocked',
      roleId,
      roleNameEn: role.nameEn,
      unitTypeId,
      unitTypeNameEn: unitType.nameEn,
      reason: 'manual-authority-denied',
    };
  }
  return {
    status: 'allowed',
    roleId,
    roleNameEn: role.nameEn,
    unitTypeId,
    unitTypeNameEn: unitType.nameEn,
    evidence: 'manual-allocation-authority-table',
  };
}

function assertNonEmptyString(name, value) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`${name} must be non-empty string`);
  }
}
