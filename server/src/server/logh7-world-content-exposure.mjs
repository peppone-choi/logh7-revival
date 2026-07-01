import {
  SS_RESP_STATIC_GRID_CODE,
  SS_RESP_STATIC_GRID_TYPE_CODE,
  buildStrategicGalaxyGrid,
} from './logh7-login-protocol.mjs';
import {
  CARD_MENU_SPECIAL_FACTORY_ACTIONS,
  RESP_STATIC_INFORMATION_CARD_CODE,
  RESP_INFORMATION_PACKAGE_CODE,
  RESP_INFORMATION_WAREHOUSE_CODE,
} from './logh7-info-records.mjs';
import {
  RESP_STATIC_INFORMATION_CARD_COMMAND_CODE,
} from './logh7-info-records-static.mjs';

export const WORLD_CONTENT_OPCODE_CONTRACT = Object.freeze([
  {
    request: 0x0304,
    response: RESP_STATIC_INFORMATION_CARD_CODE,
    name: 'StaticInformationCard',
    consumer: 'authority-card catalog / resident command-table staging',
    parser: 'FUN_0040ee80 stream, FUN_0040f1c0 text; 70-byte card records, <=24 command factory ids',
    datasets: ['manualStrategyCommands', 'authorityCards'],
    status: 'known-builder-not-default',
    contentGaps: ['canonical authority-card -> factory-id mapping not recovered'],
    commandTargetReasons: ['0x0305-authority-card-catalog'],
    nativeFactoryBranches: Object.values(CARD_MENU_SPECIAL_FACTORY_ACTIONS),
  },
  {
    request: 0x0306,
    response: RESP_STATIC_INFORMATION_CARD_COMMAND_CODE,
    name: 'StaticInformationCardCommand',
    consumer: 'authority-card command descriptors / command factory ids',
    parser: 'FUN_0040f9f0 stream, FUN_0040fcd0 text; consumed by FUN_004f5cb0 category menu rows',
    datasets: ['manualStrategyCommands', 'commandFactoryTable'],
    status: 'known-builder-not-default',
    contentGaps: ['canonical command descriptor packed fields not fully recovered'],
    commandTargetReasons: ['0x0307-command-factory-table'],
  },
  {
    request: 0x0312,
    response: SS_RESP_STATIC_GRID_TYPE_CODE,
    name: 'StaticInformationGridType',
  consumer: 'strategic object table',
  parser: 'FUN_004ba2b0 -> 0x0313 table; object record = [labelSubId, class, variant]',
  datasets: ['systems', 'specialBodies'],
  targetKinds: ['system', 'celestial'],
  commandTargetReasons: ['0x0312-grid-type'],
},
{
request: 0x0314,
response: SS_RESP_STATIC_GRID_CODE,
name: 'StaticInformationGrid',
consumer: 'strategic cell grid',
parser: 'FUN_004abbb0 RLE-decodes width*height terrain/object marker cells',
datasets: ['systems', 'specialBodies'],
targetKinds: ['system', 'celestial', 'gridCell'],
commandTargetReasons: ['0x0314-grid'],
},
{
request: 0x031e,
response: 0x031f,
name: 'InformationBase',
consumer: 'base/planet management panel',
parser: 'FUN_00414c70 fixed 0x031f base record array',
datasets: ['systems', 'planets', 'planetEconomy', 'fiefs'],
targetKinds: ['base', 'planet'],
commandTargetReasons: ['0x031e-base'],
},
  {
    request: 0x0320,
    response: 0x0321,
    name: 'InformationInstitution',
    consumer: 'base facility/office panel',
    parser: 'institution nested fixed record parser',
    datasets: ['systems', 'planets', 'institutions', 'facilities', 'spots'],
    targetKinds: ['base', 'planet', 'facility', 'spot'],
    commandTargetReasons: ['0x0320-institution'],
  },
{
request: 0x0322,
response: 0x0323,
name: 'InformationCharacter',
consumer: 'character/officer detail panel',
parser: 'FUN_00419300 character record consumer',
datasets: ['characters', 'officers'],
targetKinds: ['character'],
commandTargetReasons: ['0x0322-character'],
},
{
request: 0x0324,
response: 0x0325,
name: 'InformationUnit',
consumer: 'fleet/unit table and grid-unit binding',
parser: '0x0325 parser-stream unit/fleet record path',
datasets: ['units', 'outfits', 'ships', 'troops'],
targetKinds: ['outfit', 'ship', 'troop'],
commandTargetReasons: ['0x0324-unit'],
},
{
request: 0x0326,
response: RESP_INFORMATION_WAREHOUSE_CODE,
name: 'InformationWarehouse',
consumer: 'base warehouse stockpile panel',
parser: 'FUN_0041aff0 fixed 0x0327 warehouse record',
datasets: ['systems', 'planets', 'warehouse', 'ships', 'troops'],
targetKinds: ['base', 'ship', 'troop', 'resources'],
commandTargetReasons: ['0x0326-warehouse'],
},
{
request: 0x0328,
response: RESP_INFORMATION_PACKAGE_CODE,
name: 'InformationPackage',
consumer: 'base transport package panel',
parser: 'FUN_0041b990 fixed 0x0329 package record',
datasets: ['systems', 'planets', 'transportPackages', 'troops'],
targetKinds: ['base', 'package'],
commandTargetReasons: ['0x0328-package'],
},
{
request: 0x032a,
response: 0x032b,
name: 'InformationOutfit',
consumer: 'fleet/outfit roster summary',
parser: '0x032b fixed outfit roster object',
datasets: ['units', 'outfits'],
targetKinds: ['outfit'],
commandTargetReasons: ['0x032a-outfit', '0x032a-outfit-list'],
},
{
request: 0x032e,
response: 0x032f,
name: 'InformationOutfitParty',
consumer: 'fleet/outfit party composition panel',
parser: '0x032f fixed outfit party manifest',
datasets: ['units', 'outfits', 'characters', 'ships', 'troops', 'transportPackages'],
targetKinds: ['outfit', 'character', 'ship', 'troop', 'package', 'resources'],
commandTargetReasons: ['0x032e-outfit-party'],
},
{
request: 0x034e,
response: 0x034f,
name: 'CardCharacter',
consumer: 'personnel/card character roster',
parser: '0x034f dispatch-sized character-card roster',
datasets: ['characters', 'officers'],
targetKinds: ['character'],
commandTargetReasons: ['0x034e-card-character'],
},
]);

const markerValueForIndex = (index) => 4 + index;
const isRecordObject = (value) => value && typeof value === 'object';

export function decodeStaticGridInner(inner) {
  const payload = inner.subarray(6);
  const width = payload.readUInt8(0);
  const height = payload.readUInt8(1);
  const rleByteCount = payload.readUInt16BE(2);
  const cells = new Uint8Array(width * height);
  let pos = 0;
  for (let offset = 0; offset < rleByteCount; offset += 2) {
    const run = payload.readUInt8(4 + offset);
    const value = payload.readUInt8(5 + offset);
    cells.fill(value, pos, pos + run);
    pos += run;
  }
  return { width, height, rleByteCount, decodedCells: cells, decodedCellCount: pos };
}

export function decodeStaticGridTypeInner(inner, values = []) {
  const payload = inner.subarray(6);
  return values.map((value) => {
    const offset = 1 + value * 3;
    return {
      value,
      contentId: payload.readUInt8(offset),
      klass: payload.readUInt8(offset + 1),
      variant: payload.readUInt8(offset + 2),
    };
  });
}

function coordinateConfirmedSystems(pack) {
  return (Array.isArray(pack?.systems) ? pack.systems : [])
    .filter((system) => system?.map != null && system?.coordinatePending !== true);
}

function countGalaxyPlanets(doc) {
  return (Array.isArray(doc?.systems) ? doc.systems : [])
    .reduce((sum, system) => sum + (Array.isArray(system?.planets) ? system.planets.length : 0), 0);
}

function economySystemNames(doc) {
  return new Set((Array.isArray(doc?.systems) ? doc.systems : [])
    .map((system) => system?.system)
    .filter((name) => typeof name === 'string' && name.length > 0));
}

function planetEconomyCount(doc) {
  return (Array.isArray(doc?.systems) ? doc.systems : [])
    .reduce((sum, system) => sum + (Array.isArray(system?.planets) ? system.planets.length : 0), 0);
}

function missingEconomySystems(pack, planetEconomyDoc) {
  const economyNames = economySystemNames(planetEconomyDoc);
  return (Array.isArray(pack?.systems) ? pack.systems : [])
    .filter((system) => !economyNames.has(system.name))
    .map((system) => system.name);
}

function specialBodies(galaxyDoc) {
  const bodies = galaxyDoc?._specialBodies ?? {};
  return {
    blackHoleCount: Number(bodies.blackHoleCount) || 0,
    neutronStarCount: Number(bodies.neutronStarCount) || 0,
    placement: bodies._cellPlacement ?? null,
    provenance: bodies._provenance ?? null,
  };
}

function consumersByDataset(opcodeContract = WORLD_CONTENT_OPCODE_CONTRACT) {
  const out = {};
  for (const entry of opcodeContract) {
    for (const dataset of entry.datasets ?? []) {
      out[dataset] ??= [];
      out[dataset].push({
        request: entry.request,
        response: entry.response,
        name: entry.name,
        consumer: entry.consumer,
      });
    }
  }
  return out;
}

function targetProducersByKind(opcodeContract = WORLD_CONTENT_OPCODE_CONTRACT) {
  const out = {};
  for (const entry of opcodeContract) {
    for (const kind of entry.targetKinds ?? []) {
      out[kind] ??= [];
      out[kind].push({
        request: entry.request,
        response: entry.response,
        name: entry.name,
        consumer: entry.consumer,
        commandTargetReasons: [...(entry.commandTargetReasons ?? [])],
      });
    }
  }
  return out;
}

export function buildWorldContentExposure({
  pack,
  galaxyDoc = null,
  planetEconomyDoc = null,
  gridInners = null,
} = {}) {
  const systems = Array.isArray(pack?.systems) ? pack.systems : [];
  const coordinateSystems = coordinateConfirmedSystems(pack);
  const inners = gridInners ?? buildStrategicGalaxyGrid({ systems });
  const decodedGrid = decodeStaticGridInner(inners.cellInner);
  const markerValues = coordinateSystems.map((_, index) => markerValueForIndex(index));
  const objectRecords = decodeStaticGridTypeInner(inners.objectInner, markerValues);
  const markerCells = markerValues.map((value) => decodedGrid.decodedCells.indexOf(value));
  const missingMarkers = coordinateSystems
    .map((system, index) => ({ system, index, value: markerValues[index], cellIndex: markerCells[index] }))
    .filter((entry) => entry.cellIndex < 0);
  const mismatchedObjectRecords = objectRecords
    .map((record, index) => ({ record, system: coordinateSystems[index] }))
    .filter(({ record, system }) => record.klass !== 3 || record.contentId !== ((system?.contentId ?? 0) & 0xff));
  const packPlanetCount = systems.reduce((sum, system) => sum + (Array.isArray(system?.planets) ? system.planets.length : 0), 0);
  const galaxyPlanetCount = countGalaxyPlanets(galaxyDoc);
  const economyPlanetCount = planetEconomyCount(planetEconomyDoc);
  const economyMissing = missingEconomySystems(pack, planetEconomyDoc);

  return {
    opcodeContract: WORLD_CONTENT_OPCODE_CONTRACT,
    consumersByDataset: consumersByDataset(WORLD_CONTENT_OPCODE_CONTRACT),
    targetProducersByKind: targetProducersByKind(WORLD_CONTENT_OPCODE_CONTRACT),
    systems: {
      packCount: systems.length,
      coordinateConfirmedCount: coordinateSystems.length,
      coordinatePendingCount: systems.length - coordinateSystems.length,
      galaxyJsonCount: Array.isArray(galaxyDoc?.systems) ? galaxyDoc.systems.length : null,
    },
    strategicGrid: {
      responseCode: SS_RESP_STATIC_GRID_CODE,
      objectTableCode: SS_RESP_STATIC_GRID_TYPE_CODE,
      width: decodedGrid.width,
      height: decodedGrid.height,
      decodedCellCount: decodedGrid.decodedCellCount,
      markerCount: markerCells.filter((cellIndex) => cellIndex >= 0).length,
      missingMarkers: missingMarkers.map(({ system, value }) => ({ name: system.name, value })),
      mismatchedObjectRecords: mismatchedObjectRecords.map(({ record, system }) => ({
        name: system?.name,
        value: record.value,
        contentId: record.contentId,
        expectedContentId: (system?.contentId ?? 0) & 0xff,
        klass: record.klass,
      })),
    },
    planets: {
      packCount: packPlanetCount,
      galaxyJsonCount: galaxyPlanetCount,
      economyCount: economyPlanetCount,
      economySystemCount: Array.isArray(planetEconomyDoc?.systems) ? planetEconomyDoc.systems.length : null,
      missingEconomySystems: economyMissing,
    },
    specialBodies: specialBodies(galaxyDoc),
  };
}

export function validateWorldContentExposure(exposure) {
  const errors = [];
  if (!isRecordObject(exposure)) return ['exposure-missing'];
  if (exposure.systems?.packCount !== 85) errors.push(`systems-pack-count:${exposure.systems?.packCount}`);
  if (exposure.systems?.coordinateConfirmedCount !== 80) errors.push(`systems-coordinate-count:${exposure.systems?.coordinateConfirmedCount}`);
  if (exposure.strategicGrid?.width !== 100 || exposure.strategicGrid?.height !== 50) {
    errors.push(`grid-size:${exposure.strategicGrid?.width}x${exposure.strategicGrid?.height}`);
  }
  if (exposure.strategicGrid?.decodedCellCount !== 5000) errors.push(`grid-decoded-cells:${exposure.strategicGrid?.decodedCellCount}`);
  if (exposure.strategicGrid?.markerCount !== exposure.systems?.coordinateConfirmedCount) {
    errors.push(`grid-marker-count:${exposure.strategicGrid?.markerCount}`);
  }
  if ((exposure.strategicGrid?.missingMarkers ?? []).length > 0) errors.push('grid-missing-markers');
  if ((exposure.strategicGrid?.mismatchedObjectRecords ?? []).length > 0) errors.push('grid-object-record-mismatch');
  if (exposure.planets?.packCount !== 300) errors.push(`planet-pack-count:${exposure.planets?.packCount}`);
  if (exposure.planets?.economyCount !== 300) errors.push(`planet-economy-count:${exposure.planets?.economyCount}`);
  if ((exposure.planets?.missingEconomySystems ?? []).length > 0) errors.push('planet-economy-missing-systems');
  if (exposure.specialBodies?.blackHoleCount !== 3) errors.push(`black-hole-count:${exposure.specialBodies?.blackHoleCount}`);
  if (exposure.specialBodies?.neutronStarCount !== 3) errors.push(`neutron-star-count:${exposure.specialBodies?.neutronStarCount}`);
  return errors;
}
