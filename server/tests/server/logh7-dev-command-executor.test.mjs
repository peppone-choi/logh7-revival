import test from 'node:test';
import assert from 'node:assert/strict';

import { createWorldState } from '../../src/server/logh7-world-state.mjs';
import {
  buildPlayableCommandTargets,
  devCommandCategoryCards,
  devCommandExposureCatalog,
} from '../../src/server/logh7-dev-command-cards.mjs';
import {
  executeDevCommand,
  previewDevCommandExecution,
} from '../../src/server/logh7-dev-command-executor.mjs';

function commandNamed(cards, name) {
  for (const card of cards) {
    const command = card.commands.find((entry) => entry.name === name);
    if (command) return command;
  }
  throw new Error(`missing dev command ${name}`);
}

function playableTargets() {
  return buildPlayableCommandTargets({
    activeCharacterId: 1001,
    activeUnitId: 1001,
    baseId: 77,
    characterName: 'Dev Player',
    power: 1,
  });
}

function world() {
  const state = createWorldState();
  state.addPlayer({ connectionId: 1, charId: 1001, powerId: 1 });
  return state;
}

test('previewDevCommandExecution rejects command cards without required targets', () => {
  const warp = devCommandCategoryCards()[0].commands[0];
  const preview = previewDevCommandExecution({ command: warp, targetPool: {} });

  assert.equal(preview.executable, false);
  assert.equal(preview.reject, 'missing-targets');
  assert.deepEqual(preview.missingTargetKinds, ['system', 'planet', 'celestial', 'gridCell', 'outfit']);
  assert.equal(preview.innerCodeHex, '0x0b01');
});

test('devCommandExposureCatalog annotates cards with execution previews and selected targets', () => {
  const catalog = devCommandExposureCatalog({ targetPool: playableTargets() });
  const warpPreview = catalog.cards[0].commands[0].executionPreview;

  assert.equal(warpPreview.executable, true);
  assert.equal(warpPreview.semantic, 'fleet-grid-move');
  assert.equal(warpPreview.selectedTargets.system.id > 0, true);
  assert.equal(warpPreview.selectedTargets.planet.id > 0, true);
  assert.equal(warpPreview.selectedTargets.celestial.id > 0, true);
  assert.equal(warpPreview.selectedTargets.gridCell.cell, 2599);
  assert.equal(warpPreview.selectedTargets.outfit.id, 1001);
});

test('executeDevCommand routes Warp through 0x0b01 and mutates strategic fleet state', () => {
  const state = world();
  state.upsertFleet({ id: 1001, owner: 1, faction: 1, cell: 2588 });

  const decision = executeDevCommand({
    state,
    connectionId: 1,
    command: devCommandCategoryCards()[0].commands[0],
    targetPool: playableTargets(),
  });

  assert.equal(decision.accept, true);
  assert.equal(decision.devExecution.innerCodeHex, '0x0b01');
  assert.equal(state.getFleet(1001).cell, 2599);
  assert.equal(state.listCommandLog().at(-1).effect, 'fleet-grid-move');
});

test('executeDevCommand routes fuel supply through existing logistics opcode', () => {
  const state = world();
  const decision = executeDevCommand({
    state,
    connectionId: 1,
    command: devCommandCategoryCards()[0].commands[1],
    targetPool: playableTargets(),
  });

  assert.equal(decision.accept, true);
  assert.equal(decision.devExecution.innerCodeHex, '0x0b02');
  assert.equal(decision.result.fuelA, 5000);
  assert.equal(decision.result.fuelB, 3000);
  assert.equal(state._logistics.getFleet(1001).fuel, 5000);
  assert.equal(state._logistics.getFleet(1001).supply, 3000);
  assert.equal(state._logistics.toSnapshot().recentLog.at(-1).event, 'supply-fuel');
});

test('executeDevCommand materializes combat assets and routes ground sortie state', () => {
  const cards = devCommandCategoryCards();
  const targets = playableTargets();
  assert.equal(targets.ships[0].unitId, 1001);
  assert.equal(targets.troops[0].id, 100150);
  assert.equal(targets.fighters[0].unitId, 1001);
  assert.equal(targets.weapons[0].unitId, 1001);

  const manifestState = world();
  const manifestDecision = executeDevCommand({
    state: manifestState,
    connectionId: 1,
    command: cards[0].commands[3],
    targetPool: targets,
  });
  assert.equal(manifestDecision.accept, true);
  const fleet = manifestState.getFleet(1001);
  assert.equal(fleet.assetManifest.ships[0].id, 100101);
  assert.equal(fleet.assetManifest.troops[0].id, 100150);
  assert.equal(fleet.assetManifest.fighters[0].id, 100180);
  assert.equal(fleet.assetManifest.weapons[0].id, 100190);
  assert.equal(manifestState.getShip(100101).owner, 1);
  assert.equal(manifestState.getTroop(100150).landed, false);

  const sortieState = world();
  const sortie = executeDevCommand({
    state: sortieState,
    connectionId: 1,
    command: cards[0].commands[14],
    targetPool: targets,
  });
  assert.equal(sortie.accept, true);
  assert.equal(sortie.preview.semantic, 'ground-sortie');
  assert.equal(sortie.devExecution.transport, 'server-direct');
  assert.equal(sortie.result.action, 'sortie');
  assert.equal(sortieState.getTroop(100150).landed, true);
  assert.equal(sortieState.listCommandLog().at(-1).effect, 'ground-command');

  const withdraw = executeDevCommand({
    state: sortieState,
    connectionId: 1,
    command: cards[0].commands[15],
    targetPool: targets,
  });
  assert.equal(withdraw.accept, true);
  assert.equal(withdraw.preview.semantic, 'ground-withdraw');
  assert.equal(withdraw.result.action, 'withdraw');
  assert.equal(sortieState.getTroop(100150).landed, false);
});

test('executeDevCommand routes MakePlan through strategy state', () => {
  const cards = devCommandCategoryCards();
  const state = world();
  const decision = executeDevCommand({
    state,
    connectionId: 1,
    command: commandNamed(cards, '作戦計画'),
    targetPool: playableTargets(),
  });

  assert.equal(decision.accept, true);
  assert.equal(decision.devExecution.innerCodeHex, '0x0900');
  assert.equal(state._strategy.planCount(), 1);
  assert.equal(state.listCommandLog().at(-1).effect, 'strategy-command');
});

test('executeDevCommand routes promotion through personnel state', () => {
  const cards = devCommandCategoryCards();
  const state = world();
  state.upsertCharacter({ id: 1001, rank: 0, faction: 'Empire' });

  const decision = executeDevCommand({
    state,
    connectionId: 1,
    command: commandNamed(cards, '昇進'),
    targetPool: playableTargets(),
  });

  assert.equal(decision.accept, true);
  assert.equal(decision.devExecution.innerCodeHex, '0x0704');
  assert.equal(state._personnel.getCharacter(1001).rank, 1);
  assert.equal(state.listCommandLog().at(-1).effect, 'personnel-command');
});

test('executeDevCommand routes appointment and dismissal through personnel seats', () => {
  const cards = devCommandCategoryCards();
  const state = world();
  state.upsertCharacter({ id: 1001, rank: 1, faction: 'Empire' });

  const appointed = executeDevCommand({
    state,
    connectionId: 1,
    command: commandNamed(cards, '任命'),
    targetPool: playableTargets(),
  });
  assert.equal(appointed.accept, true);
  assert.equal(appointed.devExecution.innerCodeHex, '0x0707');
  assert.equal(state._personnel.getOutfit(1001).seats.some((seat) => seat.character === 1001), true);

  const dismissed = executeDevCommand({
    state,
    connectionId: 1,
    command: commandNamed(cards, '罷免'),
    targetPool: playableTargets(),
  });
  assert.equal(dismissed.accept, true);
  assert.equal(dismissed.devExecution.innerCodeHex, '0x0708');
  assert.equal(state._personnel.getOutfit(1001).seats.some((seat) => seat.character === 1001), false);
});

test('executeDevCommand routes political cards through existing social opcodes', () => {
  const cards = devCommandCategoryCards();
  const state = world();
  state.upsertCharacter({ id: 1001, rank: 1, faction: 'Empire' });

  const diplomacy = executeDevCommand({
    state,
    connectionId: 1,
    command: commandNamed(cards, '外交'),
    targetPool: playableTargets(),
  });

  assert.equal(diplomacy.accept, true);
  assert.equal(diplomacy.preview.semantic, 'political-order-mail');
  assert.equal(diplomacy.devExecution.innerCodeHex, '0x0f13');
  assert.equal(state.listCommandLog().at(-1).effect, 'social-command');
});

test('executeDevCommand routes intelligence cards into espionage state and command ledger', () => {
  const cards = devCommandCategoryCards();
  const state = world();
  state.upsertCharacter({ id: 1001, rank: 1, faction: 'Empire' });

  const infiltrated = executeDevCommand({
    state,
    connectionId: 1,
    command: commandNamed(cards, '潜入工作'),
    targetPool: playableTargets(),
  });
  assert.equal(infiltrated.accept, true);
  assert.equal(infiltrated.preview.transport, 'server-direct');
  assert.equal(infiltrated.result.success, true);
  assert.equal(state._espionage.isInfiltrated(1001), true);

  const arrest = executeDevCommand({
    state,
    connectionId: 1,
    command: commandNamed(cards, '逮捕命令'),
    targetPool: playableTargets(),
  });
  assert.equal(arrest.accept, true);
  assert.equal(arrest.result.arrested, true);
  assert.equal(state._espionage.isDetained(1001), true);
  assert.equal(state.listCommandLog().at(-1).effect, 'intelligence-command');
});

test('executeDevCommand routes coup personal cards into coup state', () => {
  const cards = devCommandCategoryCards();
  const state = world();
  state.upsertCharacter({ id: 1001, rank: 1, faction: 'Empire' });

  const rebellion = executeDevCommand({
    state,
    connectionId: 1,
    command: commandNamed(cards, '叛乱'),
    targetPool: playableTargets(),
  });

  assert.equal(rebellion.accept, true);
  assert.equal(rebellion.preview.semantic, 'coup-execute');
  assert.equal(rebellion.devExecution.transport, 'server-direct');
  assert.equal(rebellion.result.rebelFaction, 'rebel-1');
  assert.equal(state.getCoupState().getConspiracy(1001).executed, true);
  assert.equal(state.listCommandLog().at(-1).effect, 'coup-command');
});

test('dev command catalog exposes every manual command as executable with playable targets', () => {
  const catalog = devCommandExposureCatalog({ targetPool: playableTargets() });
  const commands = catalog.cards.flatMap((card) => card.commands);
  assert.equal(commands.length, 81);
  assert.equal(commands.filter((command) => command.executionPreview?.executable).length, 81);
  assert.deepEqual(commandNamed(catalog.cards, '封土授与').targetKinds.includes('base'), true);
});

test('executeDevCommand routes remaining manual dev cards through existing processors', () => {
  const cards = devCommandCategoryCards();
  const cases = [
    ['作戦撤回', '0x0901', 'strategy-command'],
    ['部隊結成', '0x0903', 'strategy-command'],
    ['部隊解散', '0x0906', 'strategy-command'],
    ['講義', '0x0902', 'strategy-command'],
    ['輸送計画', '0x0902', 'strategy-command'],
    ['輸送中止', '0x0902', 'strategy-command'],
    ['完全修理', '0x0c00', 'logistics-command'],
    ['搬出入', '0x0c08', 'logistics-command'],
    ['割当', '0x0c0b', 'logistics-command'],
    ['降等', '0x0706', 'personnel-command'],
    ['叙爵', '0x070c', 'personnel-command'],
    ['叙勲', '0x070c', 'personnel-command'],
    ['辞任', '0x0709', 'personnel-command'],
    ['封土授与', '0x070d', 'personnel-command'],
    ['封土直轄', '0x070e', 'personnel-command'],
  ];
  for (const [name, innerCodeHex, effect] of cases) {
    const state = world();
    state.upsertCharacter({ id: 1001, rank: 9, faction: 'Empire' });
    const decision = executeDevCommand({
      state,
      connectionId: 1,
      command: commandNamed(cards, name),
      targetPool: playableTargets(),
    });
    assert.equal(decision.accept, true, `${name}: ${decision.reject ?? 'rejected'}`);
    assert.equal(decision.devExecution.innerCodeHex, innerCodeHex, name);
    assert.equal(state.listCommandLog().at(-1).effect, effect, name);
    if (name === '部隊結成') {
      assert.equal(state._strategy.outfits.size > 0, true);
    }
    if (name === '部隊解散') {
      assert.equal(state._strategy.outfits.has(1001), false);
    }
    if (name === '封土授与') {
      assert.equal(state._personnel.getBase(77).owner, 1001);
    }
    if (name === '封土直轄') {
      assert.equal(state._personnel.getBase(77).owner, 0);
    }
  }
});
