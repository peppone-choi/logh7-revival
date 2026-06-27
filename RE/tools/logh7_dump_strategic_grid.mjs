#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  STRATEGIC_GRID_HEIGHT,
  STRATEGIC_GRID_WIDTH,
  TERRAIN_VALUE,
  buildStrategicGalaxyGrid,
  parsePassableCells,
} from '../src/server/logh7-login-protocol.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SYSTEM_OBJECT_BASE_VALUE = 4;

function usage() {
  return `Usage: node tools/logh7_dump_strategic_grid.mjs [options]

Options:
  --terrain              Emit terrain-enabled 0x0315 summary.
  --galaxy <path>        Galaxy content JSON. Default: content/galaxy.json.
  --passable <path>      Passable-mask JSON. Default: content/galaxy-passable-cells.json.
  --plasma <path>        Optional plasma-cell JSON.
  --out <path>           Write JSON summary to this path.
  --pretty              Pretty-print JSON to stdout.
  -h, --help             Show this help.
`;
}

function parseArgs(argv) {
  const options = {
    terrain: false,
    galaxy: resolve(ROOT, 'content/galaxy.json'),
    passable: resolve(ROOT, 'content/galaxy-passable-cells.json'),
    plasma: null,
    out: null,
    pretty: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--terrain') {
      options.terrain = true;
    } else if (arg === '--pretty') {
      options.pretty = true;
    } else if (arg === '-h' || arg === '--help') {
      options.help = true;
    } else if (arg === '--galaxy' || arg === '--passable' || arg === '--plasma' || arg === '--out') {
      const value = argv[i + 1];
      if (!value || value.startsWith('--')) {
        throw new Error(`${arg} requires a value`);
      }
      options[arg.slice(2)] = resolve(value);
      i += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return options;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function decodeCellGrid(cellInner) {
  const payload = cellInner.subarray(6);
  const width = payload.readUInt8(0);
  const height = payload.readUInt8(1);
  const rleByteCount = payload.readUInt16BE(2);
  const decoded = new Uint8Array(width * height);
  let pos = 0;
  for (let offset = 0; offset < rleByteCount; offset += 2) {
    const run = payload.readUInt8(4 + offset);
    const value = payload.readUInt8(4 + offset + 1);
    decoded.fill(value, pos, pos + run);
    pos += run;
  }
  return { width, height, rleByteCount, decoded, decodedCells: pos };
}

function decodeObjectTable(objectInner) {
  const payload = objectInner.subarray(6);
  const count = payload.readUInt8(0);
  const records = [];
  for (let value = 0; value < count; value += 1) {
    const offset = 1 + value * 3;
    records.push({
      value,
      contentId: payload.readUInt8(offset),
      klass: payload.readUInt8(offset + 1),
      variant: payload.readUInt8(offset + 2),
    });
  }
  return { count, records };
}

function cellKey(col, row) {
  return `${col},${row}`;
}

function indexToCell(index, width) {
  if (index < 0) return null;
  return [index % width, Math.floor(index / width)];
}

function countValues(decoded) {
  const byValue = {};
  for (const value of decoded) {
    const key = String(value);
    byValue[key] = (byValue[key] ?? 0) + 1;
  }
  return byValue;
}

function findDuplicateCells(systems) {
  const seen = new Map();
  const duplicates = [];
  for (const system of systems) {
    if (!system.cell) continue;
    const key = cellKey(system.cell[0], system.cell[1]);
    const previous = seen.get(key);
    if (previous) {
      duplicates.push({ cell: system.cell, systems: [previous.system, system.system] });
    } else {
      seen.set(key, system);
    }
  }
  return duplicates;
}

function keySystems(systemSummaries) {
  const names = {
    iserlohn: 'イゼルローン',
    fezzan: 'フェザーン',
    valhalla: 'ヴァルハラ',
    barlat: 'バーラト',
  };
  return Object.fromEntries(
    Object.entries(names).map(([key, name]) => [key, systemSummaries.find((system) => system.system === name) ?? null]),
  );
}

function buildSummary(options) {
  const galaxy = readJson(options.galaxy);
  const passableSource = readJson(options.passable);
  const plasmaSource = options.plasma ? readJson(options.plasma) : null;
  const systems = Array.isArray(galaxy.systems) ? galaxy.systems : [];
  const passableCells = parsePassableCells(passableSource);
  const plasmaCells = plasmaSource ? parsePassableCells(plasmaSource) : null;
  const { objectInner, cellInner } = buildStrategicGalaxyGrid({
    systems,
    passableCells,
    terrain: options.terrain,
    plasmaCells,
  });
  const objectTable = decodeObjectTable(objectInner);
  const cellGrid = decodeCellGrid(cellInner);
  const byValue = countValues(cellGrid.decoded);
  const systemSummaries = systems.slice(0, 85).map((system, index) => {
    const value = SYSTEM_OBJECT_BASE_VALUE + index;
    const actualIndex = cellGrid.decoded.indexOf(value);
    const cell = indexToCell(actualIndex, cellGrid.width);
    const canonCell = [
      Number.isInteger(system.canonCol) ? system.canonCol : null,
      Number.isInteger(system.canonRow) ? system.canonRow : null,
    ];
    const gameCell = [
      Number.isInteger(system.canonGameCol) ? system.canonGameCol : (Number.isInteger(system.canonCol) ? system.canonCol + 1 : null),
      Number.isInteger(system.canonGameRow) ? system.canonGameRow : (Number.isInteger(system.canonRow) ? system.canonRow + 1 : null),
    ];
    const passable = cell ? passableCells.has(cellKey(cell[0], cell[1])) : false;
    return {
      value,
      system: system.system,
      faction: system.faction ?? null,
      contentId: system.contentId ?? null,
      spectralClass: system.spectralClass ?? null,
      canonCell,
      gameCell,
      cell,
      passable,
      object: objectTable.records[value] ?? null,
    };
  });
  const markerOutsidePassableSystems = systemSummaries
    .filter((system) => !system.passable)
    .map((system) => ({ system: system.system, value: system.value, cell: system.cell, canonCell: system.canonCell }));
  const duplicateMarkerCells = findDuplicateCells(systemSummaries);
  const markerCells = systemSummaries.filter((system) => system.cell != null).length;
  const expectedCells = cellGrid.width * cellGrid.height;
  const summary = {
    source: {
      galaxy: resolve(options.galaxy),
      passable: resolve(options.passable),
      plasma: options.plasma ? resolve(options.plasma) : null,
      galaxySource: galaxy._source ?? null,
      passableSource: passableSource._source ?? null,
    },
    terrainEnabled: options.terrain,
    width: cellGrid.width,
    height: cellGrid.height,
    fixedInnerBytes: cellInner.length,
    rleByteCount: cellGrid.rleByteCount,
    rleDecodedCells: cellGrid.decodedCells,
    objectTable: {
      count: objectTable.count,
      usedRecords: objectTable.records.filter((record) => record.contentId !== 0 || record.klass !== 0 || record.variant !== 0),
    },
    passableMaskCount: passableCells.size,
    systemMarkers: systems.length,
    markerCells,
    markerOutsidePassable: markerOutsidePassableSystems.length,
    markerOutsidePassableSystems,
    duplicateMarkerCells,
    terrain: {
      plasma: byValue[String(TERRAIN_VALUE.PLASMA)] ?? 0,
      space: byValue[String(TERRAIN_VALUE.SPACE)] ?? 0,
      nonNavigable: byValue[String(TERRAIN_VALUE.NON_NAVIGABLE)] ?? 0,
      marker: Object.entries(byValue)
        .filter(([value]) => Number(value) >= SYSTEM_OBJECT_BASE_VALUE)
        .reduce((sum, [, count]) => sum + count, 0),
      byValue,
    },
    keySystems: keySystems(systemSummaries),
    systems: systemSummaries,
    invariants: {
      widthHeightOk: cellGrid.width === STRATEGIC_GRID_WIDTH && cellGrid.height === STRATEGIC_GRID_HEIGHT,
      decodedCellsOk: cellGrid.decodedCells === expectedCells,
      allSystemMarkersPresent: markerCells === systems.length,
      noMarkerOutsidePassable: markerOutsidePassableSystems.length === 0,
      noDuplicateMarkerCells: duplicateMarkerCells.length === 0,
    },
  };
  summary.invariants.readyForTerrainLiveSmoke = Object.values(summary.invariants).every(Boolean);
  return summary;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(usage());
    return;
  }
  const summary = buildSummary(options);
  const json = JSON.stringify(summary, null, 2);
  if (options.out) {
    mkdirSync(dirname(options.out), { recursive: true });
    writeFileSync(options.out, `${json}\n`);
  }
  if (options.pretty || !options.out) {
    process.stdout.write(`${json}\n`);
  } else {
    process.stdout.write(`wrote ${options.out}\n`);
  }
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
