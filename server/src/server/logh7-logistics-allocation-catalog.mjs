import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SERVER_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DEFAULT_MANUAL_PATH = join(SERVER_ROOT, 'content', 'manual', 'logistics-economy.json');

export function loadLogisticsEconomyManual(path = DEFAULT_MANUAL_PATH) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function buildLogisticsAllocationCatalog({
  manual = loadLogisticsEconomyManual(),
  manualPath = 'server/content/manual/logistics-economy.json',
} = {}) {
  const table = requireAuthorityTable(manual);
  const unitTypes = table.columns.map(normalizeUnitType);
  const seenRoleIds = new Set();
  const roles = table.rows.map((row, sourceIndex) => {
    const role = normalizeRole(row, unitTypes, sourceIndex);
    if (seenRoleIds.has(role.id)) {
      throw new Error(`duplicate allocation role id: ${role.id}`);
    }
    seenRoleIds.add(role.id);
    return role;
  });

  return {
    id: 'logh7-logistics-allocation-catalog',
    source: {
      manualPath,
      source: manual._source,
      evidenceGrade: manual._grade,
      prerequisite: manual.allocation.prerequisite ?? null,
      inferencePolicy: 'normalize explicit manual allocation authority table; preserve null OCR cells as uncertain',
    },
    unitTypeCount: unitTypes.length,
    roleCount: roles.length,
    unitTypes,
    roles,
    summary: summarizeAuthority(roles),
  };
}

export function getAllocationRoleById(catalog, roleId) {
  return catalog.roles.find((role) => role.id === roleId);
}

export function getAllocationUnitTypeById(catalog, unitTypeId) {
  return catalog.unitTypes.find((unitType) => unitType.id === unitTypeId);
}

export function writeLogisticsAllocationCatalog(path, catalog) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(catalog, null, 2)}\n`);
}

function requireAuthorityTable(manual) {
  const table = manual?.allocation?.authorityTable;
  if (!table || !Array.isArray(table.columns) || !Array.isArray(table.rows)) {
    throw new TypeError('missing allocation authority table');
  }
  if (table.columns.length === 0 || table.rows.length === 0) {
    throw new TypeError('allocation authority table must have columns and rows');
  }
  return table;
}

function normalizeUnitType(label) {
  if (typeof label !== 'string' || label.length === 0) {
    throw new TypeError('allocation unit type column must be non-empty string');
  }
  const match = label.match(/^(.+?)\s+\((.+)\)$/);
  if (!match) {
    throw new Error(`unsupported allocation unit type label: ${label}`);
  }
  return {
    id: slugify(match[2]),
    nameEn: match[2],
    sourceKey: match[1],
    sourceLabel: label,
  };
}

function normalizeRole(row, unitTypes, sourceIndex) {
  if (!row?.role || typeof row.role.en !== 'string' || row.role.en.length === 0) {
    throw new TypeError(`allocation row missing role.en: ${sourceIndex}`);
  }
  const authorityByUnitType = {};
  for (const unitType of unitTypes) {
    const cell = row[unitType.sourceKey];
    if (cell !== true && cell !== false && cell !== null) {
      throw new TypeError(`allocation cell must be true, false, or null: ${row.role.en}.${unitType.sourceKey}`);
    }
    authorityByUnitType[unitType.id] = cell;
  }
  return {
    id: slugify(row.role.en.replace(/\s+\(\?\)$/, '')),
    nameEn: row.role.en,
    sourceIndex,
    uncertain: row._uncertain === true,
    uncertainNote: typeof row.uncertainNote === 'string' ? row.uncertainNote : null,
    authorityByUnitType,
  };
}

function summarizeAuthority(roles) {
  let allowedCellCount = 0;
  let blockedCellCount = 0;
  let uncertainCellCount = 0;
  for (const role of roles) {
    for (const cell of Object.values(role.authorityByUnitType)) {
      if (cell === true) {
        allowedCellCount += 1;
      } else if (cell === false) {
        blockedCellCount += 1;
      } else {
        uncertainCellCount += 1;
      }
    }
  }
  return {
    allowedCellCount,
    blockedCellCount,
    uncertainCellCount,
    uncertainRoleCount: roles.filter((role) => role.uncertain).length,
  };
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
