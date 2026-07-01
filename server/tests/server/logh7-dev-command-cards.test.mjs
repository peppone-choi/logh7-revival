import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEV_COMMAND_CARD_PROVENANCE,
  DEV_COMMAND_FACTORY_MAPPING_AUDIT,
  buildDevInteractionExposure,
  buildDevPlayabilityAudit,
  buildPlayableCommandTargets,
  devCommandCategoryCards,
  devCommandExposureCatalog,
  devCommandSeatEntries,
  devCommandStaticCardRecords,
} from '../../src/server/logh7-dev-command-cards.mjs';
import { createCommandTargetPool } from '../../src/server/logh7-command-targets.mjs';

test('dev command category cards preserve resident-table compatibility ids and expose target metadata', () => {
  const cards = devCommandCategoryCards();
  assert.equal(cards.length, 7);
  assert.equal(cards[0].categoryName, '作戦コマンド');
  assert.equal(cards[0].commands[0].factoryId, 0x002b);
  assert.equal(cards[0].commands[1].factoryId, 0x0041);
  assert.equal(cards[0].commands[0].targetKinds.includes('gridCell'), true);
  assert.equal(cards[0].targetKinds.includes('system'), true);
  assert.equal(cards[0].targetKinds.includes('planet'), true);
  assert.equal(cards[0].targetKinds.includes('celestial'), true);
  assert.equal(cards[0].targetKinds.includes('fighter'), true);
  assert.equal(cards[0].targetKinds.includes('weapon'), true);
  assert.equal(cards[0].targetKinds.includes('troop'), true);
  assert.equal(cards[2].targetKinds.includes('operationPlan'), true);
  assert.equal(cards[4].targetKinds.includes('post'), true);
  assert.equal(cards[4].targetKinds.includes('rank'), true);
  assert.equal(cards[5].targetKinds.includes('power'), true);
  assert.equal(cards.every((card) => card.provenance === DEV_COMMAND_CARD_PROVENANCE), true);
});

test('dev playability audit separates dev-playable commands from canonical authority-card gaps', () => {
  const targets = createCommandTargetPool(buildPlayableCommandTargets({
    activeCharacterId: 11,
    activeUnitId: 13,
    baseId: 7,
    power: 2,
  })).snapshot();
  const contentExposure = {
    opcodeContract: [
      { request: 0x0304, response: 0x0305, name: 'StaticInformationCard', status: 'known-builder-not-default' },
      { request: 0x0306, response: 0x0307, name: 'StaticInformationCardCommand', status: 'known-builder-not-default' },
      { request: 0x031e, response: 0x031f, name: 'InformationBase', targetKinds: ['base', 'planet'] },
    ],
    targetProducersByKind: {
      planet: [{ request: 0x031e, response: 0x031f, name: 'InformationBase' }],
    },
  };
  const catalog = devCommandExposureCatalog({
    targetPool: targets,
    targetProducersByKind: contentExposure.targetProducersByKind,
  });
  const interactionExposure = buildDevInteractionExposure({ catalog, targetPool: targets, contentExposure });
  const audit = buildDevPlayabilityAudit({ catalog, interactionExposure, contentExposure });

  assert.equal(audit.status, 'dev-playable-canonical-card-route-incomplete');
  assert.equal(audit.devPlayable, true);
  assert.equal(audit.canonicalAuthorityCardMappingRecovered, false);
  assert.equal(audit.commandTotals.totalCommands, catalog.readiness.totalCommands);
  assert.equal(audit.commandTotals.executableCommands, catalog.readiness.executableCommands);
  assert.equal(audit.commandTotals.serverDirectCommands > 0, true);
  assert.equal(audit.commandTotals.opcodeCommands > 0, true);
  assert.equal(audit.commandBuckets.transports['server-direct'].commandCount > 0, true);
  assert.equal(audit.commandBuckets.transports.opcode.commandCount > 0, true);
  assert.equal(audit.objectCoverage.withTargets.includes('planet'), true);
  assert.equal(audit.objectCoverage.withProducerOpcodes.includes('planet'), true);
  assert.equal(audit.opcodeStatus['known-builder-not-default'].count, 2);
  assert.equal(audit.recoveredCanonicalEvidence.some((entry) => entry.evidence.includes('0x19/0x3f/0x40')), true);
  assert.equal(audit.canonicalGates.some((gate) => gate.gate.includes('authority-card')), true);
  assert.match(audit.nextBestFocus, /0x0305\/0x0307/);
});

test('dev interaction exposure indexes objects to commands producers consumers and state domains', () => {
  const targets = createCommandTargetPool(buildPlayableCommandTargets({
    activeCharacterId: 11,
    activeUnitId: 13,
    baseId: 7,
    power: 2,
  })).snapshot();
  const contentExposure = {
    opcodeContract: [
      {
        request: 0x0312,
        response: 0x0313,
        name: 'StaticInformationGridType',
        consumer: 'strategic object table',
        datasets: ['systems', 'specialBodies'],
        targetKinds: ['system', 'celestial'],
      },
      {
        request: 0x031e,
        response: 0x031f,
        name: 'InformationBase',
        consumer: 'base/planet management panel',
        datasets: ['systems', 'planets'],
        targetKinds: ['base', 'planet'],
      },
    ],
    targetProducersByKind: {
      system: [{ request: 0x0312, response: 0x0313, name: 'StaticInformationGridType' }],
      celestial: [{ request: 0x0312, response: 0x0313, name: 'StaticInformationGridType' }],
      planet: [{ request: 0x031e, response: 0x031f, name: 'InformationBase' }],
    },
  };
  const catalog = devCommandExposureCatalog({
    targetPool: targets,
    targetProducersByKind: contentExposure.targetProducersByKind,
  });
  const exposure = buildDevInteractionExposure({ catalog, targetPool: targets, contentExposure });

  assert.equal(exposure.mappingStatus, 'dev-compat-static-anchor-only');
  assert.equal(exposure.objectKinds.planet.slot.available, true);
  assert.equal(exposure.objectKinds.planet.producers[0].requestHex, '0x031e');
  assert.equal(exposure.objectKinds.planet.consumers[0].responseHex, '0x031f');
  assert.equal(exposure.objectKinds.planet.commandCount > 0, true);
  assert.equal(exposure.objectKinds.planet.stateDomains.includes('world-state'), true);
  assert.equal(exposure.objectKinds.celestial.producers[0].responseHex, '0x0313');
  assert.equal(exposure.objectKinds.operationPlan.interactionKinds.includes('order'), true);
  assert.equal(exposure.categories.some((category) => (
    category.route === 'command' && category.interactionKinds.includes('suggestion')
  )), true);
  assert.equal(exposure.playability.objectKindsWithTargets > 0, true);
  assert.equal(exposure.playability.objectKindsWithProducerOpcodes >= 3, true);
});

test('dev command wire-facing records stay minimal while exposure catalog carries tooling metadata', () => {
  const staticCards = devCommandStaticCardRecords();
  assert.deepEqual(staticCards[0].commands.slice(0, 2), [0x002b, 0x0041]);
  assert.deepEqual(devCommandSeatEntries({ all: false, category: 0 }), [{ character: 0x10000, role: 0 }]);

  const pool = createCommandTargetPool(buildPlayableCommandTargets({
    activeCharacterId: 11,
    activeUnitId: 13,
    baseId: 7,
    power: 2,
  }));
  const targets = pool.snapshot();
  assert.equal(targets.systems.length > 0, true);
  assert.equal(targets.planets.length > 0, true);
  assert.equal(targets.celestials.length > 0, true);
  const catalog = devCommandExposureCatalog({ targetPool: targets });
  assert.equal(catalog.mappingAudit.status, DEV_COMMAND_FACTORY_MAPPING_AUDIT.status);
  assert.equal(catalog.mappingAudit.canonicalAuthorityCardMappingRecovered, false);
  assert.equal(catalog.mappingAudit.recovered.some((entry) => entry.includes('0x19/0x3f/0x40')), true);
  assert.equal(catalog.targetInteractionPolicy.cardFirst, true);
  const missing = [];
  for (const card of catalog.cards) {
    for (const [kind, available] of Object.entries(card.targetAvailability)) {
      if (!available) missing.push(`${card.categoryName}:${kind}`);
    }
  }
  assert.deepEqual(missing, []);
  assert.equal(catalog.cards[0].commands[0].targetAvailability.gridCell, true);
  assert.equal(catalog.cards[0].commands[1].targetAvailability.resources, true);
  assert.deepEqual(catalog.cards[0].commands[0].missingTargetKinds, []);
  assert.equal(catalog.cards[0].commands[0].targetSlots.find((slot) => slot.kind === 'gridCell').samples[0].cell, 2588);
  assert.equal(catalog.cards[0].commands[0].targetSlots.find((slot) => slot.kind === 'system').available, true);
  assert.equal(catalog.cards[0].commands[0].targetSlots.find((slot) => slot.kind === 'planet').available, true);
  assert.equal(catalog.cards[0].commands[0].targetSlots.find((slot) => slot.kind === 'celestial').available, true);
  assert.equal(catalog.cards[0].commands[0].targetSlots.find((slot) => slot.kind === 'planet').inputMode, 'select-or-override');
  assert.equal(catalog.cards[0].commands[0].targetSlots.find((slot) => slot.kind === 'outfit').samples[0].id, 13);
  assert.equal(catalog.cards[0].commands[1].targetSlots.find((slot) => slot.kind === 'base').samples[0].id, 7);
  assert.equal(catalog.cards[0].commands[1].targetSlots.find((slot) => slot.kind === 'resources').samples[0].supplies, 5000);
  assert.equal(catalog.cards[0].commands.some((command) => command.targetKinds.includes('fighter')), true);
  assert.equal(catalog.cards[0].commands.some((command) => command.targetKinds.includes('troop')), true);
  assert.equal(catalog.readiness.totalCommands > 0, true);
  assert.equal(catalog.readiness.executableCommands > 0, true);
  assert.equal(catalog.readiness.mappingStatus, 'dev-compat-static-anchor-only');
  assert.equal(catalog.readiness.canonicalAuthorityCardMappedCommands, 0);
  assert.equal(catalog.readiness.factoryAnchorCommands >= 2, true);
  assert.equal(catalog.readiness.executableCommandSamples[0].factoryIdHex.startsWith('0x'), true);

  const targetProducersByKind = {
    gridCell: [{ request: 0x0314, response: 0x0315, name: 'StaticInformationGrid' }],
    outfit: [{ request: 0x032a, response: 0x032b, name: 'InformationOutfit' }],
  };
  const emptyCatalog = devCommandExposureCatalog({
    targetPool: createCommandTargetPool({ supplies: 0, food: 0, mineral: 0 }).snapshot(),
    targetProducersByKind,
  });
  assert.deepEqual(emptyCatalog.cards[0].commands[0].missingTargetKinds, [
    'system',
    'planet',
    'celestial',
    'gridCell',
    'outfit',
  ]);
  assert.deepEqual(emptyCatalog.cards[0].commands[0].missingTargetProducerHints.gridCell.map((entry) => entry.request), [0x0314]);
  assert.deepEqual(emptyCatalog.cards[0].commands[0].missingTargetProducerHints.outfit.map((entry) => entry.request), [0x032a]);
  assert.equal(emptyCatalog.cards[0].commands[0].targetSlots[0].available, false);
  assert.equal(emptyCatalog.readiness.blockedCommands > 0, true);
  assert.equal(emptyCatalog.readiness.missingTargetsByKind.gridCell.producers[0].requestHex, '0x0314');
  assert.equal(emptyCatalog.readiness.nextTargetPulls.some((pull) => (
    pull.request === 0x0314 && pull.unlocks.targetKinds.includes('gridCell')
  )), true);
});
