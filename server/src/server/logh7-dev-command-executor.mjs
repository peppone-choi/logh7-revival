import {
  COMMAND_MOVE_GRID_CODE,
  processCommand,
  seedPersonnelFromWorldState,
} from './logh7-command-engine.mjs';
import {
  COMMAND_ANNOUNCEMENT_BYTES,
  COMMAND_ANNOUNCEMENT_CODE,
  COMMAND_CREATE_OUTFIT_CODE,
  COMMAND_DELETE_OUTFIT_CODE,
  COMMAND_MAKE_PLAN_BYTES,
  COMMAND_MAKE_PLAN_CODE,
  COMMAND_WITHDRAWAL_PLAN_BYTES,
  COMMAND_WITHDRAWAL_PLAN_CODE,
  createStrategyState,
} from './logh7-strategy.mjs';
import {
  COMMAND_ASSIGNMENT_BYTES,
  COMMAND_ASSIGNMENT_CODE,
  COMMAND_CARRYING_IN_OUT_BYTES,
  COMMAND_CARRYING_IN_OUT_CODE,
  COMMAND_COMPLETENESS_REPAIR_BYTES,
  COMMAND_COMPLETENESS_REPAIR_CODE,
  COMMAND_REORGANIZATION_BYTES,
  COMMAND_REORGANIZATION_CODE,
  COMMAND_SUPPLY_FUEL_BYTES,
  COMMAND_SUPPLY_FUEL_CODE,
  createLogisticsState,
} from './logh7-logistics.mjs';
import {
  COMMAND_CARD_APPOINTMENT_CODE,
  COMMAND_CARD_DISMISAL_CODE,
  COMMAND_CARD_RESIGNATION_CODE,
  COMMAND_GRANT_FIEF_CODE,
  COMMAND_GRANT_TITLE_CODE,
  COMMAND_RANK_UP_CODE,
  COMMAND_RANK_DOWN_CODE,
  COMMAND_REVOKE_FIEF_CODE,
} from './codec/personnel-records.mjs';
import {
  COMMAND_ORDER_SUGGEST_MAIL_CODE,
  COMMAND_SET_PRIVATE_ACCOUNT_RATE_CODE,
  COMMAND_SET_UNIT_DISTRIBUTE_PRIORITY_CODE,
  COMMAND_SET_WILL_MESSAGE_CODE,
} from './logh7-social.mjs';
import { createEspionageState } from './logh7-espionage.mjs';

export const DEV_COMMAND_EXECUTOR_PROVENANCE = 'P3/server-designed/dev-only';

const GRID_MOVE_BYTES = 0x24;
const CREATE_OUTFIT_DEV_BYTES = 0x39;
const DELETE_OUTFIT_DEV_BYTES = 0x10;
const RANK_UP_BYTES = 0x24;
const RANK_DOWN_BYTES = 0x28;
const CARD_APPOINTMENT_BYTES = 0x28;
const CARD_DISMISSAL_BYTES = 0x20;
const CARD_RESIGNATION_BYTES = 0x1c;
const GRANT_TITLE_BYTES = 0x18;
const FIEF_BYTES = 0x18;
const ORDER_SUGGEST_MAIL_BYTES = 0x264;
const WILL_MESSAGE_BYTES = 0x8c;
const DISTRIBUTE_PRIORITY_BYTES = 0x10;
const PRIVATE_ACCOUNT_RATE_BYTES = 0x0c;

function rawInner(code, body) {
  const inner = Buffer.alloc(2 + body.length);
  inner.writeUInt16BE(code & 0xffff, 0);
  body.copy(inner, 2);
  return inner;
}

function writeWideText(body, text, lenOffset, charOffset, maxChars) {
  const chars = [...String(text ?? '')].slice(0, maxChars);
  body.writeUInt8(chars.length & 0xff, lenOffset);
  chars.forEach((ch, index) => body.writeUInt16LE(ch.charCodeAt(0) & 0xffff, charOffset + index * 2));
}

function collectionForKind(targetPool, kind) {
  if (!targetPool) return [];
  if (kind === 'base') {
    return Number.isInteger(targetPool.baseId) ? [{ id: targetPool.baseId, baseId: targetPool.baseId }] : [];
  }
  if (kind === 'resources') {
    const resources = {
      supplies: Number(targetPool.supplies) || 0,
      food: Number(targetPool.food) || 0,
      mineral: Number(targetPool.mineral) || 0,
    };
    return resources.supplies > 0 || resources.food > 0 || resources.mineral > 0 ? [resources] : [];
  }
  const key = kind === 'package' ? 'otherPackages' : `${kind}s`;
  return Array.isArray(targetPool[key]) ? targetPool[key] : [];
}

function pickTarget(targetPool, kind) {
  const entries = collectionForKind(targetPool, kind);
  if (entries.length === 0) return null;
  if (kind === 'gridCell' && entries.length > 1) return { ...entries[1] };
  return { ...entries[0] };
}

function selectTargets(targetPool, targetKinds = []) {
  const selected = {};
  const missing = [];
  for (const kind of targetKinds) {
    const target = pickTarget(targetPool, kind);
    if (target) selected[kind] = target;
    else missing.push(kind);
  }
  return { selected, missing };
}

function commandName(command) {
  return String(command?.name ?? command?.name_ja ?? '');
}

function classifyCommand(command) {
  const name = commandName(command);
  const categoryIndex = Number(command?.categoryIndex);
  if (/ワープ|Warp|星系内航行|遠距離移動|近距離移動|SystemMove|MoveFar|MoveNear/.test(name)) {
    return 'fleet-grid-move';
  }
  if (/燃料補給|完全補給|補充|Supply|Resupply/.test(name)) return 'supply-fuel';
  if (/資金投入|旗艦購入/.test(name)) return 'supply-fuel';
  if (/作戦計画|MakePlan/.test(name)) return 'make-plan';
  if (/作戦撤回/.test(name)) return 'withdrawal-plan';
  if (/部隊結成/.test(name)) return 'create-outfit';
  if (/部隊解散/.test(name)) return 'delete-outfit';
  if (/発令|IssueOrder|Announcement/.test(name)) return 'announcement';
  if (/講義|輸送計画|輸送中止/.test(name)) return 'announcement';
  if (/陸戦隊出撃/.test(name) || (categoryIndex === 0 && command?.commandIndex === 14)) return 'ground-sortie';
  if (/陸戦隊撤収/.test(name) || (categoryIndex === 0 && command?.commandIndex === 15)) return 'ground-withdraw';
  if (/軍紀維持|訓練|警戒出動|武力鎮圧|分列行進|徴発|特別警備/.test(name)) return 'announcement';
  if (/再編成|Reorganize/.test(name)) return 'reorganize';
  if (/完全修理/.test(name)) return 'complete-repair';
  if (/搬出入/.test(name)) return 'carry-in-out';
  if (/割当/.test(name)) return 'assignment';
  if (/昇進|抜擢|Promote/.test(name)) return 'rank-up';
  if (/降等/.test(name)) return 'rank-down';
  if (/任命|Appoint/.test(name)) return 'appointment';
  if (/罷免|Dismiss/.test(name)) return 'dismissal';
  if (/辞任/.test(name)) return 'resignation';
  if (/叙爵|叙勲/.test(name)) return 'grant-title';
  if (/封土授与/.test(name)) return 'grant-fief';
  if (/封土直轄/.test(name)) return 'revoke-fief';
  if (/国家目標|統治目標|演説|談話/.test(name)) return 'political-will-message';
  if (/納入率変更|関税率変更/.test(name)) return 'political-rate';
  if (/分配/.test(name)) return 'political-distribution';
  if (/夜会|狩猟|会談|外交|処断|退役|志願|亡命|会見|受講|兵棋演習/.test(name)) return 'political-order-mail';
  if (/叛意/.test(name)) return 'coup-ringleader';
  if (/謀議/.test(name)) return 'coup-recruit';
  if (/説得/.test(name)) return 'coup-persuade';
  if (/参加/.test(name)) return 'coup-join';
  if (/叛乱/.test(name)) return 'coup-execute';
  if (/一斉捜索/.test(name)) return 'intel-mass-search';
  if (/逮捕許可/.test(name)) return 'intel-arrest-auth';
  if (/執行命令/.test(name)) return 'intel-enforcement';
  if (/逮捕命令/.test(name)) return 'intel-arrest-order';
  if (/査閲/.test(name)) return 'coup-inspect';
  if (/襲撃/.test(name)) return 'intel-raid';
  if (/監視/.test(name)) return 'intel-surveil';
  if (/潜入工作/.test(name)) return 'intel-infiltrate';
  if (/脱出工作/.test(name)) return 'intel-escape';
  if (/情報工作/.test(name)) return 'intel-op';
  if (/破壊工作/.test(name)) return 'intel-sabotage';
  if (/煽動工作/.test(name)) return 'intel-agitate';
  if (/侵入工作/.test(name)) return 'intel-intrusion';
  if (/帰還工作/.test(name)) return 'intel-return';
  if (categoryIndex === 0 && command?.commandIndex === 0) return 'fleet-grid-move';
  if (categoryIndex === 0 && command?.commandIndex === 1) return 'supply-fuel';
  return null;
}

function planForCommand(command) {
  const semantic = classifyCommand(command);
  const name = commandName(command);
  const withName = (plan) => ({ ...plan, commandName: name });
  const direct = (effect) => ({
    semantic,
    innerCode: Number(command?.factoryId) || 0,
    effect,
    transport: 'server-direct',
    commandName: name,
  });
  switch (semantic) {
    case 'fleet-grid-move':
      return withName({ semantic, innerCode: COMMAND_MOVE_GRID_CODE, effect: 'fleet-grid-move' });
    case 'supply-fuel':
      return withName({ semantic, innerCode: COMMAND_SUPPLY_FUEL_CODE, effect: 'logistics-command' });
    case 'make-plan':
      return withName({ semantic, innerCode: COMMAND_MAKE_PLAN_CODE, effect: 'strategy-command' });
    case 'withdrawal-plan':
      return withName({ semantic, innerCode: COMMAND_WITHDRAWAL_PLAN_CODE, effect: 'strategy-command' });
    case 'create-outfit':
      return withName({ semantic, innerCode: COMMAND_CREATE_OUTFIT_CODE, effect: 'strategy-command' });
    case 'delete-outfit':
      return withName({ semantic, innerCode: COMMAND_DELETE_OUTFIT_CODE, effect: 'strategy-command' });
    case 'announcement':
      return withName({ semantic, innerCode: COMMAND_ANNOUNCEMENT_CODE, effect: 'strategy-command' });
    case 'reorganize':
      return withName({ semantic, innerCode: COMMAND_REORGANIZATION_CODE, effect: 'logistics-command' });
    case 'complete-repair':
      return withName({ semantic, innerCode: COMMAND_COMPLETENESS_REPAIR_CODE, effect: 'logistics-command' });
    case 'carry-in-out':
      return withName({ semantic, innerCode: COMMAND_CARRYING_IN_OUT_CODE, effect: 'logistics-command' });
    case 'assignment':
      return withName({ semantic, innerCode: COMMAND_ASSIGNMENT_CODE, effect: 'logistics-command' });
    case 'rank-up':
      return withName({ semantic, innerCode: COMMAND_RANK_UP_CODE, effect: 'personnel-command' });
    case 'rank-down':
      return withName({ semantic, innerCode: COMMAND_RANK_DOWN_CODE, effect: 'personnel-command' });
    case 'appointment':
      return withName({ semantic, innerCode: COMMAND_CARD_APPOINTMENT_CODE, effect: 'personnel-command' });
    case 'dismissal':
      return withName({ semantic, innerCode: COMMAND_CARD_DISMISAL_CODE, effect: 'personnel-command' });
    case 'resignation':
      return withName({ semantic, innerCode: COMMAND_CARD_RESIGNATION_CODE, effect: 'personnel-command' });
    case 'grant-title':
      return withName({ semantic, innerCode: COMMAND_GRANT_TITLE_CODE, effect: 'personnel-command' });
    case 'grant-fief':
      return withName({ semantic, innerCode: COMMAND_GRANT_FIEF_CODE, effect: 'personnel-command' });
    case 'revoke-fief':
      return withName({ semantic, innerCode: COMMAND_REVOKE_FIEF_CODE, effect: 'personnel-command' });
    case 'political-order-mail':
      return withName({ semantic, innerCode: COMMAND_ORDER_SUGGEST_MAIL_CODE, effect: 'social-command' });
    case 'political-will-message':
      return withName({ semantic, innerCode: COMMAND_SET_WILL_MESSAGE_CODE, effect: 'social-command' });
    case 'political-distribution':
      return withName({ semantic, innerCode: COMMAND_SET_UNIT_DISTRIBUTE_PRIORITY_CODE, effect: 'social-command' });
    case 'political-rate':
      return withName({ semantic, innerCode: COMMAND_SET_PRIVATE_ACCOUNT_RATE_CODE, effect: 'social-command' });
    case 'coup-ringleader':
    case 'coup-recruit':
    case 'coup-persuade':
    case 'coup-join':
    case 'coup-execute':
    case 'coup-inspect':
      return direct('coup-command');
    case 'ground-sortie':
    case 'ground-withdraw':
      return direct('ground-command');
    case 'intel-mass-search':
    case 'intel-arrest-auth':
    case 'intel-enforcement':
    case 'intel-arrest-order':
    case 'intel-raid':
    case 'intel-surveil':
    case 'intel-infiltrate':
    case 'intel-escape':
    case 'intel-op':
    case 'intel-sabotage':
    case 'intel-agitate':
    case 'intel-intrusion':
    case 'intel-return':
      return direct('intelligence-command');
    default:
      return null;
  }
}

function selectedId(selected, kind, fallback = 1) {
  const target = selected[kind];
  return Number(target?.id ?? target?.baseId ?? target?.cell ?? target?.outfitId ?? fallback) || fallback;
}

function positiveInt(...values) {
  for (const value of values) {
    const n = Number(value);
    if (Number.isInteger(n) && n > 0) return n;
  }
  return null;
}

function selectedAssetUnitId(selected) {
  return positiveInt(
    selected.outfit?.id,
    selected.ship?.unitId,
    selected.troop?.unitId,
    selected.fighter?.unitId,
    selected.weapon?.unitId,
    selected.operationPlan?.units?.[0],
    selected.character?.id,
  ) ?? 1;
}

function selectedShipEntityId(selected) {
  return positiveInt(selected.ship?.id, selected.ship?.unitNumber, selectedAssetUnitId(selected) * 100 + 1);
}

function selectedTroopEntityId(selected) {
  return positiveInt(selected.troop?.id, selected.troop?.unitNumber, selectedAssetUnitId(selected) * 100 + 51);
}

function upsertManifestRecord(records = [], record, key = 'id') {
  const list = Array.isArray(records) ? records.filter(Boolean).map((entry) => ({ ...entry })) : [];
  const value = record?.[key];
  const index = list.findIndex((entry) => entry?.[key] === value);
  if (index >= 0) list[index] = { ...list[index], ...record };
  else list.push({ ...record });
  return list.slice(0, 16);
}

function addBoatId(boats, id) {
  const list = Array.isArray(boats) ? boats.filter((value) => Number.isInteger(value) && value > 0) : [];
  if (Number.isInteger(id) && id > 0 && !list.includes(id)) list.push(id);
  return list.slice(0, 10);
}

function attachSelectedAssets({ state, connectionId, selected }) {
  const unitId = selectedAssetUnitId(selected);
  const faction = Number(selected.outfit?.power) || Number(selected.power?.id) || 0;
  let fleet = typeof state.getFleet === 'function' ? state.getFleet(unitId) : null;
  if (!fleet && typeof state.upsertFleet === 'function') {
    fleet = state.upsertFleet({
      id: unitId,
      owner: connectionId,
      faction,
      commander: selectedId(selected, 'character', unitId),
      cell: Number(selected.gridCell?.cell) || 2588,
      supply: Number(selected.resources?.supplies) || 0,
    });
  }
  const manifest = fleet
    ? {
      ships: Array.isArray(fleet.assetManifest?.ships) ? fleet.assetManifest.ships : [],
      troops: Array.isArray(fleet.assetManifest?.troops) ? fleet.assetManifest.troops : [],
      fighters: Array.isArray(fleet.assetManifest?.fighters) ? fleet.assetManifest.fighters : [],
      weapons: Array.isArray(fleet.assetManifest?.weapons) ? fleet.assetManifest.weapons : [],
    }
    : null;

  if (selected.ship) {
    const shipId = selectedShipEntityId(selected);
    if (typeof state.upsertShip === 'function') {
      state.upsertShip({ id: shipId, owner: connectionId, faction, shipClass: 'cruiser' });
    }
    if (fleet && manifest) {
      fleet.boats = addBoatId(fleet.boats, shipId);
      manifest.ships = upsertManifestRecord(manifest.ships, {
        id: shipId,
        kind: Number(selected.ship.kind) || 0,
        unitId,
        unitNumber: Number(selected.ship.unitNumber) || 0,
        boatNumber: Number(selected.ship.boatNumber) || 0,
      });
    }
  }

  if (selected.troop) {
    const troopId = selectedTroopEntityId(selected);
    if (typeof state.upsertTroop === 'function') {
      const existing = state.getTroop?.(troopId);
      state.upsertTroop({
        id: troopId,
        owner: connectionId,
        faction,
        strength: Number(existing?.strength) || 100,
        morale: Number(existing?.morale) || 100,
        defense: Number(existing?.defense) || 30,
        landed: Boolean(existing?.landed),
      });
    }
    if (fleet && manifest) {
      fleet.boats = addBoatId(fleet.boats, troopId);
      manifest.troops = upsertManifestRecord(manifest.troops, {
        id: troopId,
        kind: Number(selected.troop.kind) || 0,
        unitId,
        troopGrade: Number(selected.troop.troopGrade) || 0,
        unitNumber: Number(selected.troop.unitNumber) || 0,
      });
    }
  }

  if (selected.fighter && manifest) {
    manifest.fighters = upsertManifestRecord(manifest.fighters, {
      id: positiveInt(selected.fighter.id, unitId * 100 + 80) ?? unitId * 100 + 80,
      kind: Number(selected.fighter.kind) || 0,
      unitId,
      unitNumber: Number(selected.fighter.unitNumber) || 0,
      boatNumber: Number(selected.fighter.boatNumber) || 0,
    });
  }

  if (selected.weapon && manifest) {
    manifest.weapons = upsertManifestRecord(manifest.weapons, {
      id: positiveInt(selected.weapon.id, unitId * 100 + 90) ?? unitId * 100 + 90,
      kind: Number(selected.weapon.kind) || 0,
      unitId,
      slot: Number(selected.weapon.slot) || 0,
      power: Number(selected.weapon.power) || 0,
    });
  }

  if (fleet && manifest) fleet.assetManifest = manifest;
  return { fleet, manifest };
}

function buildFleetGridMoveInner(selected) {
  const unitId = selectedId(selected, 'outfit');
  const destCell = selectedId(selected, 'gridCell', 2588);
  const body = Buffer.alloc(GRID_MOVE_BYTES);
  body.writeUInt32LE(unitId >>> 0, 0x0c);
  body.writeUInt32LE(destCell >>> 0, 0x10);
  return rawInner(COMMAND_MOVE_GRID_CODE, body);
}

function buildSupplyFuelInner(selected) {
  const targetUnitId = selectedId(selected, 'outfit');
  const resources = selected.resources ?? {};
  const fuelA = Math.max(1, Number(resources.supplies) || 1000);
  const fuelB = Math.max(1, Number(resources.food) || Math.floor(fuelA / 2));
  const body = Buffer.alloc(COMMAND_SUPPLY_FUEL_BYTES);
  body.writeUInt32LE(targetUnitId >>> 0, 0x08);
  body.writeUInt32LE(fuelA >>> 0, 0x10);
  body.writeUInt32LE(fuelB >>> 0, 0x14);
  return rawInner(COMMAND_SUPPLY_FUEL_CODE, body);
}

function buildMakePlanInner(selected) {
  const planId = selectedId(selected, 'operationPlan', selectedId(selected, 'outfit'));
  const target = selectedId(selected, 'gridCell', selectedId(selected, 'base'));
  const body = Buffer.alloc(COMMAND_MAKE_PLAN_BYTES);
  body.writeUInt32LE(planId >>> 0, 0x08);
  body.writeUInt32LE(target >>> 0, 0x0c);
  return rawInner(COMMAND_MAKE_PLAN_CODE, body);
}

function buildWithdrawalPlanInner(selected) {
  const planId = selectedId(selected, 'operationPlan', selectedId(selected, 'outfit'));
  const body = Buffer.alloc(COMMAND_WITHDRAWAL_PLAN_BYTES);
  body.writeUInt32LE(planId >>> 0, 0x08);
  body.writeUInt32LE(selectedId(selected, 'outfit', 0) >>> 0, 0x0c);
  return rawInner(COMMAND_WITHDRAWAL_PLAN_CODE, body);
}

function buildCreateOutfitInner(selected) {
  const body = Buffer.alloc(CREATE_OUTFIT_DEV_BYTES);
  const shipKind = Number(selected.ship?.kind) || 1;
  const unitNumber = Number(selected.ship?.unitNumber ?? selected.outfit?.id) || 1;
  const tailOffset = 0x1d;
  body.writeUInt32LE(selectedId(selected, 'base') >>> 0, 0x11);
  body.writeUInt8(1, 0x15);
  body.writeUInt8(1, 0x16);
  body.writeUInt16LE(shipKind & 0xffff, 0x17);
  body.writeUInt8(unitNumber & 0xff, 0x19);
  body.writeInt16LE(Math.max(-32768, Math.min(32767, unitNumber)) | 0, 0x1a);
  body.writeUInt8(0, 0x1c);
  body.writeUInt32LE(12000, tailOffset);
  body.writeUInt32LE(3000, tailOffset + 4);
  body.writeUInt8(1, tailOffset + 12);
  body.writeUInt8(selectedId(selected, 'power') & 0xff, tailOffset + 13);
  body.writeUInt8(selectedId(selected, 'power') & 0xff, tailOffset + 14);
  body.writeUInt8(1, tailOffset + 15);
  return rawInner(COMMAND_CREATE_OUTFIT_CODE, body);
}

function buildDeleteOutfitInner(selected) {
  const body = Buffer.alloc(DELETE_OUTFIT_DEV_BYTES);
  body.writeUInt32LE(selectedId(selected, 'outfit') >>> 0, 0x08);
  return rawInner(COMMAND_DELETE_OUTFIT_CODE, body);
}

function buildAnnouncementInner(selected) {
  const body = Buffer.alloc(COMMAND_ANNOUNCEMENT_BYTES);
  body.writeUInt32LE(selectedId(selected, 'operationPlan', selectedId(selected, 'outfit')) >>> 0, 0x08);
  body.writeUInt32LE(selectedId(selected, 'gridCell', selectedId(selected, 'base')) >>> 0, 0x0c);
  return rawInner(COMMAND_ANNOUNCEMENT_CODE, body);
}

function buildReorganizationInner(selected) {
  const outfitId = selectedId(selected, 'outfit');
  const shipKind = Number(selected.ship?.kind) || 1;
  const body = Buffer.alloc(COMMAND_REORGANIZATION_BYTES);
  body.writeUInt32LE(outfitId >>> 0, 0x0c);
  body.writeUInt32LE(outfitId >>> 0, 0x10);
  body.writeUInt8(1, 0x1d);
  body.writeUInt16LE(shipKind & 0xffff, 0x1e);
  return rawInner(COMMAND_REORGANIZATION_CODE, body);
}

function buildCompleteRepairInner(selected) {
  const body = Buffer.alloc(COMMAND_COMPLETENESS_REPAIR_BYTES);
  body.writeUInt32LE(selectedId(selected, 'outfit') >>> 0, 0x08);
  body.writeUInt32LE(selectedId(selected, 'base') >>> 0, 0x0c);
  return rawInner(COMMAND_COMPLETENESS_REPAIR_CODE, body);
}

function buildCarryInOutInner(selected) {
  const resources = selected.resources ?? {};
  const body = Buffer.alloc(COMMAND_CARRYING_IN_OUT_BYTES);
  body.writeUInt32LE(selectedId(selected, 'base') >>> 0, 0x0c);
  body.writeUInt32LE(selectedId(selected, 'outfit', selectedId(selected, 'base')) >>> 0, 0x10);
  body.writeUInt32LE(selectedId(selected, 'gridCell', 0) >>> 0, 0x14);
  body.writeUInt8(1, 0x18);
  body.writeUInt32LE(1, 0x1c);
  body.writeUInt8(1, 0x20);
  body.writeUInt8(Number(selected.package?.kind ?? 1) & 0xff, 0x24);
  body.writeUInt8(Number(selected.package?.unitKind ?? 0) & 0xff, 0x25);
  body.writeUInt32LE(Math.max(1, Number(resources.supplies) || 1000) >>> 0, 0x28);
  body.writeUInt8(0, 0x3c);
  return rawInner(COMMAND_CARRYING_IN_OUT_CODE, body);
}

function buildAssignmentInner(selected) {
  const body = Buffer.alloc(COMMAND_ASSIGNMENT_BYTES);
  body.writeUInt32LE(selectedId(selected, 'outfit') >>> 0, 0x08);
  body.writeUInt32LE(selectedId(selected, 'base') >>> 0, 0x0c);
  body.writeUInt32LE(Number(selected.ship?.kind ?? 1) >>> 0, 0x10);
  return rawInner(COMMAND_ASSIGNMENT_CODE, body);
}

function buildRankUpInner(selected) {
  const characterId = selectedId(selected, 'character');
  const targetRank = Math.max(1, Math.min(14, Number(selected.character?.rank ?? 0) + 1));
  const body = Buffer.alloc(RANK_UP_BYTES);
  body.writeUInt8(targetRank & 0xff, 0x10);
  body.writeUInt8(1, 0x1c);
  body.writeUInt32LE(characterId >>> 0, 0x20);
  return rawInner(COMMAND_RANK_UP_CODE, body);
}

function buildRankDownInner(selected) {
  const characterId = selectedId(selected, 'character');
  const targetRank = Math.max(1, Math.min(14, Number(selected.rank?.id ?? selected.character?.rank ?? 3)));
  const body = Buffer.alloc(RANK_DOWN_BYTES);
  body.writeUInt8(targetRank & 0xff, 0x10);
  body.writeUInt32LE(characterId >>> 0, 0x14);
  body.writeUInt32LE(Number(selected.post?.id ?? 0) >>> 0, 0x20);
  return rawInner(COMMAND_RANK_DOWN_CODE, body);
}

function buildAppointmentInner(selected) {
  const fallbackOutfitId = selectedId(selected, 'character');
  const body = Buffer.alloc(CARD_APPOINTMENT_BYTES);
  body.writeUInt32LE(selectedId(selected, 'outfit', fallbackOutfitId) >>> 0, 0x10);
  body.writeUInt32LE(selectedId(selected, 'character') >>> 0, 0x18);
  body.writeUInt32LE(Number(selected.post?.id ?? 0) >>> 0, 0x1c);
  return rawInner(COMMAND_CARD_APPOINTMENT_CODE, body);
}

function buildDismissalInner(selected) {
  const characterId = selectedId(selected, 'character');
  const body = Buffer.alloc(CARD_DISMISSAL_BYTES);
  body.writeUInt32LE(characterId >>> 0, 0x10);
  body.writeUInt32LE(characterId >>> 0, 0x14);
  body.writeUInt32LE(Number(selected.post?.id ?? 0) >>> 0, 0x18);
  return rawInner(COMMAND_CARD_DISMISAL_CODE, body);
}

function buildResignationInner(selected) {
  const characterId = selectedId(selected, 'character');
  const body = Buffer.alloc(CARD_RESIGNATION_BYTES);
  body.writeUInt32LE(characterId >>> 0, 0x10);
  body.writeUInt32LE(Number(selected.post?.id ?? 0) >>> 0, 0x14);
  body.writeUInt8(0, 0x18);
  return rawInner(COMMAND_CARD_RESIGNATION_CODE, body);
}

function buildGrantTitleInner(selected) {
  const body = Buffer.alloc(GRANT_TITLE_BYTES);
  body.writeUInt8(Math.max(1, Math.min(7, Number(selected.rank?.id) || 3)) & 0xff, 0x10);
  body.writeUInt32LE(selectedId(selected, 'character') >>> 0, 0x14);
  return rawInner(COMMAND_GRANT_TITLE_CODE, body);
}

function buildFiefInner(selected, code) {
  const body = Buffer.alloc(FIEF_BYTES);
  body.writeUInt32LE(selectedId(selected, 'character') >>> 0, 0x10);
  body.writeUInt32LE(selectedId(selected, 'base') >>> 0, 0x14);
  return rawInner(code, body);
}

function buildPoliticalOrderMailInner(selected, commandNameValue) {
  const body = Buffer.alloc(ORDER_SUGGEST_MAIL_BYTES);
  body.writeUInt32LE(selectedId(selected, 'character') >>> 0, 0x00);
  body.writeUInt32LE((Number(selected.operationPlan?.id) || 1) >>> 0, 0x04);
  writeWideText(body, commandNameValue, 0x08, 0x0a, 64);
  return rawInner(COMMAND_ORDER_SUGGEST_MAIL_CODE, body);
}

function buildPoliticalWillMessageInner(selected, commandNameValue) {
  const body = Buffer.alloc(WILL_MESSAGE_BYTES);
  body.writeUInt32LE(selectedId(selected, 'character') >>> 0, 0x00);
  writeWideText(body, commandNameValue, 0x04, 0x06, 64);
  return rawInner(COMMAND_SET_WILL_MESSAGE_CODE, body);
}

function buildPoliticalDistributionInner(selected) {
  const body = Buffer.alloc(DISTRIBUTE_PRIORITY_BYTES);
  body.writeUInt32LE(selectedId(selected, 'outfit') >>> 0, 0x00);
  body.writeUInt32LE(selectedId(selected, 'base') >>> 0, 0x04);
  body.writeUInt32LE(Math.max(1, Number(selected.resources?.supplies) || 1) >>> 0, 0x08);
  body.writeUInt32LE(Math.max(1, Number(selected.resources?.food) || 1) >>> 0, 0x0c);
  return rawInner(COMMAND_SET_UNIT_DISTRIBUTE_PRIORITY_CODE, body);
}

function buildPoliticalRateInner(selected) {
  const body = Buffer.alloc(PRIVATE_ACCOUNT_RATE_BYTES);
  body.writeUInt32LE(selectedId(selected, 'power') >>> 0, 0x00);
  body.writeUInt32LE(selectedId(selected, 'base') >>> 0, 0x04);
  body.writeUInt32LE(30, 0x08);
  return rawInner(COMMAND_SET_PRIVATE_ACCOUNT_RATE_CODE, body);
}

function buildInner(plan, selected) {
  switch (plan.semantic) {
    case 'fleet-grid-move':
      return buildFleetGridMoveInner(selected);
    case 'supply-fuel':
      return buildSupplyFuelInner(selected);
    case 'make-plan':
      return buildMakePlanInner(selected);
    case 'withdrawal-plan':
      return buildWithdrawalPlanInner(selected);
    case 'create-outfit':
      return buildCreateOutfitInner(selected);
    case 'delete-outfit':
      return buildDeleteOutfitInner(selected);
    case 'announcement':
      return buildAnnouncementInner(selected);
    case 'reorganize':
      return buildReorganizationInner(selected);
    case 'complete-repair':
      return buildCompleteRepairInner(selected);
    case 'carry-in-out':
      return buildCarryInOutInner(selected);
    case 'assignment':
      return buildAssignmentInner(selected);
    case 'rank-up':
      return buildRankUpInner(selected);
    case 'rank-down':
      return buildRankDownInner(selected);
    case 'appointment':
      return buildAppointmentInner(selected);
    case 'dismissal':
      return buildDismissalInner(selected);
    case 'resignation':
      return buildResignationInner(selected);
    case 'grant-title':
      return buildGrantTitleInner(selected);
    case 'grant-fief':
      return buildFiefInner(selected, COMMAND_GRANT_FIEF_CODE);
    case 'revoke-fief':
      return buildFiefInner(selected, COMMAND_REVOKE_FIEF_CODE);
    case 'political-order-mail':
      return buildPoliticalOrderMailInner(selected, plan.commandName);
    case 'political-will-message':
      return buildPoliticalWillMessageInner(selected, plan.commandName);
    case 'political-distribution':
      return buildPoliticalDistributionInner(selected);
    case 'political-rate':
      return buildPoliticalRateInner(selected);
    default:
      return null;
  }
}

export function previewDevCommandExecution({ command, targetPool = null } = {}) {
  const targetKinds = Array.isArray(command?.targetKinds) ? command.targetKinds : [];
  const { selected, missing } = selectTargets(targetPool, targetKinds);
  const plan = planForCommand(command);
  const base = {
    provenance: DEV_COMMAND_EXECUTOR_PROVENANCE,
    commandName: commandName(command),
    selectedTargets: selected,
    missingTargetKinds: missing,
  };
  if (!plan) {
    return { ...base, executable: false, reject: 'unmapped-dev-command' };
  }
  if (missing.length > 0) {
    return {
      ...base,
      executable: false,
      reject: 'missing-targets',
      semantic: plan.semantic,
      innerCode: plan.innerCode,
      innerCodeHex: `0x${plan.innerCode.toString(16).padStart(4, '0')}`,
      effect: plan.effect,
      transport: plan.transport ?? 'opcode',
    };
  }
  return {
    ...base,
    executable: true,
    semantic: plan.semantic,
    innerCode: plan.innerCode,
    innerCodeHex: `0x${plan.innerCode.toString(16).padStart(4, '0')}`,
    effect: plan.effect,
    transport: plan.transport ?? 'opcode',
  };
}

function ensureWorldSeeds({ state, connectionId, selected }) {
  const character = selected.character;
  if (character && typeof state.upsertCharacter === 'function') {
    const characterId = selectedId(selected, 'character');
    const existing = state.getCharacter?.(characterId);
    state.upsertCharacter({
      id: characterId,
      rank: Math.max(1, Number(character.rank) || Number(existing?.rank) || 9),
      faction: selected.power?.name ?? existing?.faction ?? 'dev',
    });
  }
  const outfit = selected.outfit;
  if (outfit && typeof state.upsertFleet === 'function') {
    const id = selectedId(selected, 'outfit');
    if (!state.getFleet?.(id)) {
      state.upsertFleet({
        id,
        owner: connectionId,
        faction: Number(outfit.power) || Number(selected.power?.id) || 0,
        commander: selectedId(selected, 'character', id),
        cell: Number(selected.gridCell?.cell) || 2588,
        supply: Number(selected.resources?.supplies) || 0,
      });
    }
  }
  attachSelectedAssets({ state, connectionId, selected });
}

function ensureStrategySeeds({ state, connectionId, selected, semantic }) {
  if (semantic !== 'withdrawal-plan' && semantic !== 'delete-outfit') return;
  state._strategy ??= createStrategyState({ targetPool: state._commandTargets ?? null });
  if (semantic === 'withdrawal-plan') {
    const power = selectedId(selected, 'power');
    const planId = selectedId(selected, 'operationPlan', selectedId(selected, 'outfit'));
    const queue = state._strategy.plans?.get(power >>> 0) ?? [];
    if (!queue.some((plan) => Number(plan?.planId) === planId)) {
      state._strategy.enqueuePlan?.(power, {
        planId,
        target: selectedId(selected, 'gridCell', selectedId(selected, 'base')),
        owner: connectionId,
      });
    }
  }
  if (semantic === 'delete-outfit') {
    const outfitId = selectedId(selected, 'outfit');
    if (!state._strategy.outfits?.has(outfitId)) {
      state._strategy.createOutfit?.({
        id: outfitId,
        base: selectedId(selected, 'base'),
        power: selectedId(selected, 'power'),
        owner: connectionId,
        ships: [],
        troops: [],
      });
    }
  }
}

function ensureLogisticsSeeds({ state, connectionId, selected, semantic }) {
  const logisticsSemantics = new Set([
    'supply-fuel',
    'reorganize',
    'complete-repair',
    'carry-in-out',
    'assignment',
  ]);
  if (!logisticsSemantics.has(semantic)) return;
  state._logistics ??= createLogisticsState();
  const baseId = selectedId(selected, 'base');
  const outfitId = selectedId(selected, 'outfit', selectedAssetUnitId(selected));
  const resources = selected.resources ?? {};
  const fuel = Math.max(0, Number(resources.supplies) || 0);
  const supply = Math.max(0, Number(resources.food) || 0);
  if (!state._logistics.getBase?.(baseId)) {
    state._logistics.upsertBase?.({
      id: baseId,
      owner: connectionId,
      fuel,
      supply,
      troops: selected.troop ? [selectedTroopEntityId(selected)] : [],
    });
  }
  if (!state._logistics.getFleet?.(outfitId)) {
    state._logistics.upsertFleet?.({
      id: outfitId,
      owner: connectionId,
      faction: Number(selected.power?.id) || Number(selected.outfit?.power) || 0,
      fuel: 0,
      fuelCap: Math.max(fuel, 1000),
      supply: 0,
      supplyCap: Math.max(supply, 1000),
      troops: selected.troop ? [selectedTroopEntityId(selected)] : [],
    });
  }
}

function ensurePersonnelSeeds({ state, connectionId, selected, semantic }) {
  const personnelSemantics = new Set([
    'rank-up',
    'rank-down',
    'appointment',
    'dismissal',
    'resignation',
    'grant-title',
    'grant-fief',
    'revoke-fief',
  ]);
  if (!personnelSemantics.has(semantic)) return;
  seedPersonnelFromWorldState({ state });
  const personnel = state._personnel;
  if (!personnel) return;
  const characterId = selectedId(selected, 'character');
  if (!personnel.getCharacter?.(characterId)) {
    personnel.addCharacter?.({
      id: characterId,
      rank: Math.max(1, Number(selected.character?.rank) || 9),
      owner: connectionId,
      faction: 'empire',
      socialClass: 'noble',
      title: semantic === 'grant-fief' || semantic === 'revoke-fief' ? 3 : (selected.character?.title ?? null),
    });
  }
  const character = personnel.getCharacter?.(characterId);
  if (character) {
    character.owner = connectionId;
    character.faction = character.faction ?? 'empire';
    character.socialClass = character.socialClass ?? 'noble';
    if (!Number.isFinite(Number(character.rank)) || Number(character.rank) < 1) {
      character.rank = Math.max(1, Number(selected.character?.rank) || 9);
    }
    if ((semantic === 'grant-fief' || semantic === 'revoke-fief') && character.title == null) {
      character.title = 3;
    }
  }
  const outfitId = selectedId(selected, 'outfit', characterId);
  personnel.addOutfit?.({ id: outfitId, owner: connectionId });
  const outfit = personnel.getOutfit?.(outfitId);
  const alreadySeated = Array.isArray(outfit?.seats)
    && outfit.seats.some((seat) => Number(seat?.character) === characterId);
  if ((semantic === 'dismissal' || semantic === 'resignation') && !alreadySeated) {
    personnel.appointCard?.(outfitId, { character: characterId, role: Number(selected.post?.id) || 0 });
  }
  if (semantic === 'grant-fief' || semantic === 'revoke-fief') {
    const baseId = selectedId(selected, 'base');
    const owner = semantic === 'revoke-fief' ? characterId : 0;
    personnel.addBase?.({ id: baseId, owner, economy: 1000, taxRatePct: 20 });
    if (semantic === 'revoke-fief' && character && !character.fiefs?.includes(baseId)) {
      character.fiefs = [...(character.fiefs ?? []), baseId];
    }
  }
}

function espionageState(state) {
  state._espionage ??= createEspionageState();
  return state._espionage;
}

function recordDirectCommand({ state, connectionId, plan, selected, accept = true, reject = null, result = null }) {
  state.recordCommand?.({
    connectionId,
    innerCode: plan.innerCode,
    accept,
    reject,
    effect: plan.effect,
    units: [
      selectedId(selected, 'character'),
      selectedId(selected, 'outfit', 0),
      selectedId(selected, 'base', 0),
    ].filter((value) => Number.isInteger(value) && value > 0),
    debug: {
      provenance: DEV_COMMAND_EXECUTOR_PROVENANCE,
      transport: plan.transport,
      semantic: plan.semantic,
      result,
    },
  });
}

function executeCoupCommand({ state, connectionId, plan, selected }) {
  const coup = state.getCoupState?.();
  const intel = state.getIntelState?.();
  if (!coup || !intel) {
    return { accept: false, reject: 'no-coup-state', notifies: [] };
  }
  const mastermindId = selectedId(selected, 'character');
  const followerId = selectedId(selected, 'outfit', mastermindId + 1);
  const faction = Number(selected.power?.id) || 1;
  let result;
  switch (plan.semantic) {
    case 'coup-ringleader':
      result = coup.declareRingleader(mastermindId, faction);
      break;
    case 'coup-recruit':
      coup.declareRingleader(mastermindId, faction);
      result = coup.recruit(mastermindId, followerId, { intel: 100, roll: 0 });
      break;
    case 'coup-persuade':
      coup.declareRingleader(mastermindId, faction);
      result = coup.persuadeUnit(intel, mastermindId, followerId, 100);
      break;
    case 'coup-join':
      coup.declareRingleader(mastermindId, faction);
      coup.recruit(mastermindId, followerId, { intel: 100, roll: 0 });
      result = { joined: coup.join(mastermindId, followerId), followerId };
      break;
    case 'coup-execute':
      coup.declareRingleader(mastermindId, faction);
      coup.persuadeUnit(intel, mastermindId, followerId, 100);
      result = coup.execute(mastermindId, { rebelFaction: `rebel-${faction}` });
      break;
    case 'coup-inspect':
      coup.declareRingleader(mastermindId, faction);
      result = coup.inspect(mastermindId, { inspectorIntel: 100, roll: 0 });
      break;
    default:
      return { accept: false, reject: 'unknown-coup-command', notifies: [] };
  }
  recordDirectCommand({ state, connectionId, plan, selected, result });
  return { accept: true, result, notifies: [] };
}

function executeIntelligenceCommand({ state, connectionId, plan, selected }) {
  const esp = espionageState(state);
  const faction = Number(selected.power?.id) || 1;
  const agentId = selectedId(selected, 'character');
  const targetId = selectedId(selected, 'outfit', agentId + 1);
  const baseId = selectedId(selected, 'base', 1);
  let result;
  switch (plan.semantic) {
    case 'intel-mass-search':
      result = esp.massSearch(targetId, 100, 0, 0);
      break;
    case 'intel-arrest-auth':
      result = { authorized: esp.authorizeArrest(faction, targetId), targetId };
      break;
    case 'intel-enforcement':
      result = { delegated: esp.delegateEnforcement(faction, agentId), agentId };
      break;
    case 'intel-arrest-order':
      esp.authorizeArrest(faction, targetId);
      esp.delegateEnforcement(faction, agentId);
      result = esp.arrestOrder(faction, agentId, targetId, { coLocated: true });
      break;
    case 'intel-raid':
      result = esp.raid(agentId, targetId, { intel: 100, roll: 0 });
      break;
    case 'intel-surveil':
      result = { surveilled: esp.surveil(agentId, targetId), targetId };
      break;
    case 'intel-infiltrate':
      result = esp.infiltrate(agentId, baseId, { intel: 100, security: 0, roll: 0 });
      break;
    case 'intel-escape':
      esp.infiltrate(agentId, baseId, { intel: 100, security: 0, roll: 0 });
      result = esp.escape(agentId, { intel: 100, security: 0, roll: 0 });
      break;
    case 'intel-op':
      esp.infiltrate(agentId, baseId, { intel: 100, security: 0, roll: 0 });
      result = esp.intelOp(agentId, { intel: 100, security: 0, roll: 0 });
      break;
    case 'intel-sabotage':
      esp.infiltrate(agentId, baseId, { intel: 100, security: 0, roll: 0 });
      result = esp.sabotage(agentId, { intel: 100, security: 0, roll: 0 });
      break;
    case 'intel-agitate':
      result = esp.agitate(50, { intel: 100 });
      break;
    case 'intel-intrusion':
      result = esp.intrusion(agentId, targetId, { intel: 100, security: 0, roll: 0 });
      break;
    case 'intel-return':
      esp.intrusion(agentId, targetId, { intel: 100, security: 0, roll: 0 });
      result = esp.returnOp(agentId, { intel: 100, security: 0, roll: 0 });
      break;
    default:
      return { accept: false, reject: 'unknown-intelligence-command', notifies: [] };
  }
  recordDirectCommand({ state, connectionId, plan, selected, result });
  return { accept: true, result, notifies: [] };
}

function executeGroundCommand({ state, connectionId, plan, selected }) {
  const troopId = selectedTroopEntityId(selected);
  const faction = Number(selected.power?.id) || Number(selected.outfit?.power) || 0;
  if (!state.getTroop?.(troopId) && typeof state.upsertTroop === 'function') {
    state.upsertTroop({ id: troopId, owner: connectionId, faction });
  }
  let troop = state.getTroop?.(troopId);
  let result;
  if (plan.semantic === 'ground-sortie') {
    troop = typeof state.sortieTroop === 'function'
      ? state.sortieTroop(troopId, { x: Number(selected.gridCell?.cell) || 0, y: 0, z: 0 })
      : troop;
    result = { troopId, landed: Boolean(troop?.landed), action: 'sortie' };
  } else if (plan.semantic === 'ground-withdraw') {
    if (troop) {
      troop.landed = false;
      troop.x = 0;
      troop.y = 0;
      troop.z = 0;
    }
    result = { troopId, landed: Boolean(troop?.landed), action: 'withdraw' };
  } else {
    return { accept: false, reject: 'unknown-ground-command', notifies: [] };
  }
  recordDirectCommand({ state, connectionId, plan, selected, result });
  return { accept: true, result, notifies: [] };
}

function executeDirectCommand({ state, connectionId, plan, selected }) {
  if (plan.effect === 'ground-command') {
    return executeGroundCommand({ state, connectionId, plan, selected });
  }
  if (plan.effect === 'coup-command') {
    return executeCoupCommand({ state, connectionId, plan, selected });
  }
  if (plan.effect === 'intelligence-command') {
    return executeIntelligenceCommand({ state, connectionId, plan, selected });
  }
  return { accept: false, reject: 'unknown-direct-dev-command', notifies: [] };
}

export function executeDevCommand({ state, connectionId, command, targetPool = null } = {}) {
  const preview = previewDevCommandExecution({ command, targetPool });
  if (!preview.executable) {
    return { accept: false, reject: preview.reject, notifies: [], preview };
  }
  const plan = planForCommand(command);
  if (plan.transport === 'server-direct') {
    ensureWorldSeeds({ state, connectionId, selected: preview.selectedTargets });
    const decision = executeDirectCommand({ state, connectionId, plan, selected: preview.selectedTargets });
    return {
      ...decision,
      preview,
      devExecution: {
        provenance: DEV_COMMAND_EXECUTOR_PROVENANCE,
        semantic: plan.semantic,
        innerCode: plan.innerCode,
        innerCodeHex: `0x${plan.innerCode.toString(16).padStart(4, '0')}`,
        transport: plan.transport,
      },
    };
  }
  const inner = buildInner(plan, preview.selectedTargets);
  if (!inner) {
    return { accept: false, reject: 'unbuilt-dev-command', notifies: [], preview };
  }
  ensureWorldSeeds({ state, connectionId, selected: preview.selectedTargets });
  ensureStrategySeeds({ state, connectionId, selected: preview.selectedTargets, semantic: plan.semantic });
  ensureLogisticsSeeds({ state, connectionId, selected: preview.selectedTargets, semantic: plan.semantic });
  ensurePersonnelSeeds({ state, connectionId, selected: preview.selectedTargets, semantic: plan.semantic });
  const decision = processCommand({ state, connectionId, innerCode: plan.innerCode, inner });
  return {
    ...decision,
    preview,
    devExecution: {
      provenance: DEV_COMMAND_EXECUTOR_PROVENANCE,
      semantic: plan.semantic,
      innerCode: plan.innerCode,
      innerCodeHex: `0x${plan.innerCode.toString(16).padStart(4, '0')}`,
    },
  };
}
