import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CARD_MENU_SPECIAL_FACTORY_ACTIONS } from './logh7-info-records.mjs';
import { previewDevCommandExecution } from './logh7-dev-command-executor.mjs';

const STRATEGY_COMMANDS_PATH = fileURLToPath(
  new URL('../../content/manual/strategy-commands.json', import.meta.url),
);

export const DEV_COMMAND_CARD_PROVENANCE = 'P3/server-designed/dev-only';
export const DEV_COMMAND_COMPAT_FACTORY_IDS = Object.freeze([0x002b, 0x0041]);
export const DEV_COMMAND_FACTORY_BASE = 0x0200;
export const DEV_COMMAND_FACTORY_ANCHORS = Object.freeze({
  0x0019: Object.freeze({
    factoryId: 0x0019,
    factoryIdHex: '0x0019',
    pointerGlobal: 'DAT_00c9e360',
    function: 'FUN_0058ba40',
    va: '0x0058ba40',
    labels: Object.freeze([]),
    selectedFactoryBranch: CARD_MENU_SPECIAL_FACTORY_ACTIONS[0x0019],
    evidence: 'FUN_0058c750 assigns _DAT_00c9e360 = FUN_0058ba40; (0x00c9e360 - 0x00c9e2fc) / 4 = 0x19. FUN_005312b0 selected-factory branch maps 0x19 -> 0x0903.',
    confidence: 'P0-static-factory-anchor',
    authorityCardMapping: 'native-selected-factory-branch-recovered',
  }),
  0x002b: Object.freeze({
    factoryId: 0x002b,
    factoryIdHex: '0x002b',
    pointerGlobal: 'DAT_00c9e3a8',
    function: 'FUN_00581c80',
    va: '0x00581c80',
    labels: Object.freeze(['SelectGrid', 'TARGET_GRID', 'TARGET_BASE_GRID']),
    request: 0x0b01,
    response: 0x0b07,
    requestHex: '0x0b01',
    responseHex: '0x0b07',
    evidence: 'FUN_0058c750 assigns _DAT_00c9e3a8 = FUN_00581c80; (0x00c9e3a8 - 0x00c9e2fc) / 4 = 0x2b.',
    confidence: 'P0-static-factory-anchor',
    authorityCardMapping: 'unverified-dev-compat-slot',
  }),
  0x003f: Object.freeze({
    factoryId: 0x003f,
    factoryIdHex: '0x003f',
    pointerGlobal: 'DAT_00c9e3f8',
    function: 'FUN_00584420',
    va: '0x00584420',
    labels: Object.freeze([]),
    selectedFactoryBranch: CARD_MENU_SPECIAL_FACTORY_ACTIONS[0x003f],
    evidence: 'FUN_0058c750 assigns _DAT_00c9e3f8 = FUN_00584420; (0x00c9e3f8 - 0x00c9e2fc) / 4 = 0x3f. FUN_005312b0 selected-factory branch maps 0x3f -> 0x0c02.',
    confidence: 'P0-static-factory-anchor',
    authorityCardMapping: 'native-selected-factory-branch-recovered',
  }),
  0x0040: Object.freeze({
    factoryId: 0x0040,
    factoryIdHex: '0x0040',
    pointerGlobal: 'DAT_00c9e3fc',
    function: 'FUN_00584960',
    va: '0x00584960',
    labels: Object.freeze([]),
    selectedFactoryBranch: CARD_MENU_SPECIAL_FACTORY_ACTIONS[0x0040],
    evidence: 'FUN_0058c750 assigns _DAT_00c9e3fc = FUN_00584960; (0x00c9e3fc - 0x00c9e2fc) / 4 = 0x40. FUN_005312b0 selected-factory branch maps 0x40 -> 0x0c05.',
    confidence: 'P0-static-factory-anchor',
    authorityCardMapping: 'native-selected-factory-branch-recovered',
  }),
  0x0041: Object.freeze({
    factoryId: 0x0041,
    factoryIdHex: '0x0041',
    pointerGlobal: 'DAT_00c9e400',
    function: 'FUN_00584c90',
    va: '0x00584c90',
    labels: Object.freeze(['FromDialog', 'TARGET_ORGANIZE', 'FLOW_FLAGNUM']),
    evidence: 'FUN_0058c750 assigns _DAT_00c9e400 = FUN_00584c90; (0x00c9e400 - 0x00c9e2fc) / 4 = 0x41.',
    confidence: 'P0-static-factory-anchor',
    authorityCardMapping: 'unverified-dev-compat-slot',
  }),
});

export const DEV_COMMAND_FACTORY_MAPPING_AUDIT = Object.freeze({
  status: 'dev-compat-static-anchor-only',
  canonicalAuthorityCardMappingRecovered: false,
  playableRoute: 'dev-resident-command-table-injection',
  consumer: 'FUN_004f5cb0 reads 0x0305 card+0x14 count and card+0x16 factory-id list',
  recovered: Object.freeze([
    'selected 0x0305 factory ids 0x19/0x3f/0x40 native branch to 0x0903/0x0c02/0x0c05',
    'factory table anchors for 0x19/0x2b/0x3f/0x40/0x41',
  ]),
  missing: Object.freeze([
    'canonical authority-card -> factory-id list',
    '0x0307 packed descriptor field semantics',
    'natural 0x0305/0x0307 resident-table population route',
  ]),
  removalGate: 'delete this dev catalog after canonical authority-card data path is recovered',
});

export const DEV_COMMAND_TARGET_INTERACTION_POLICY = Object.freeze({
  cardFirst: true,
  targetSelection: 'server-samples-now-client-or-admin-override-when-needed',
  emptyTargetAction: 'show missingTargetKinds and nextTargetPulls before execution',
  overrideShape: 'POST /admin/dev-command/execute { factoryId, targets | targetPool }',
});

export const DEV_COMMAND_TARGET_KIND_LABELS = Object.freeze({
  base: 'base / planet',
  system: 'star system',
  planet: 'planet',
  celestial: 'celestial body',
  character: 'character / officer',
  outfit: 'outfit / fleet organization',
  ship: 'ship unit',
  troop: 'ground troop unit',
  package: 'base package',
  gridCell: 'strategic grid cell',
  fighter: 'fighter / bomber craft',
  weapon: 'weapon / armament',
  operationPlan: 'operation plan',
  post: 'organization post',
  rank: 'rank',
  power: 'faction / power',
  resources: 'fuel / supplies / money-like stockpile',
});

export const DEV_COMMAND_ROUTE_INTERACTIONS = Object.freeze({
  operations: Object.freeze({
    stateDomains: Object.freeze(['world-state', 'strategic-map', 'combat-assets']),
    interactionKinds: Object.freeze(['fleet movement', 'sortie', 'ground sortie', 'combat asset use']),
  }),
  personal: Object.freeze({
    stateDomains: Object.freeze(['personnel-state', 'social-state', 'account-state']),
    interactionKinds: Object.freeze(['personal command', 'movement', 'retirement']),
  }),
  command: Object.freeze({
    stateDomains: Object.freeze(['strategy-state', 'operation-plan-state']),
    interactionKinds: Object.freeze(['operation plan', 'order', 'suggestion', 'withdrawal']),
  }),
  logistics: Object.freeze({
    stateDomains: Object.freeze(['logistics-state', 'economy-state', 'warehouse-state']),
    interactionKinds: Object.freeze(['repair', 'supply', 'transport', 'reorganization']),
  }),
  personnel: Object.freeze({
    stateDomains: Object.freeze(['personnel-state', 'organization-state']),
    interactionKinds: Object.freeze(['appointment', 'dismissal', 'promotion', 'rank/title']),
  }),
  politics: Object.freeze({
    stateDomains: Object.freeze(['social-state', 'political-state', 'account-state']),
    interactionKinds: Object.freeze(['political order', 'suggestion mail', 'will message', 'budget']),
  }),
  intelligence: Object.freeze({
    stateDomains: Object.freeze(['intel-state', 'espionage-state', 'coup-state']),
    interactionKinds: Object.freeze(['investigation', 'arrest', 'espionage', 'coup']),
  }),
});

const FALLBACK_GROUPS = Object.freeze([
  { categoryName: 'Operations', commands: ['Warp', 'Supply', 'SystemMove'] },
  { categoryName: 'Personal', commands: ['MoveFar', 'MoveNear', 'Retire'] },
  { categoryName: 'Command', commands: ['MakePlan', 'WithdrawPlan', 'IssueOrder'] },
  { categoryName: 'Logistics', commands: ['Repair', 'Resupply', 'Reorganize'] },
  { categoryName: 'Personnel', commands: ['Promote', 'Appoint', 'Dismiss'] },
  { categoryName: 'Politics', commands: ['Speech', 'Budget', 'Diplomacy'] },
  { categoryName: 'Intelligence', commands: ['Investigation', 'Arrest', 'Espionage'] },
]);

const CATEGORY_PROFILES = Object.freeze([
  {
    route: 'operations',
    targetKinds: ['system', 'planet', 'celestial', 'gridCell', 'outfit', 'ship', 'troop', 'fighter', 'weapon', 'resources'],
    candidateOpcodes: [0x0b01, 0x0b02, 0x0b05, 0x0b06, 0x0404, 0x0411],
  },
  {
    route: 'personal',
    targetKinds: ['character', 'outfit', 'base', 'planet', 'resources'],
    candidateOpcodes: [0x0f1c],
  },
  {
    route: 'command',
    targetKinds: ['operationPlan', 'system', 'gridCell', 'outfit', 'character'],
    candidateOpcodes: [0x0900, 0x0901, 0x0902],
  },
  {
    route: 'logistics',
    targetKinds: ['base', 'planet', 'outfit', 'ship', 'troop', 'package', 'resources'],
    candidateOpcodes: [0x0903, 0x0906, 0x0b00, 0x0b02, 0x0b03, 0x0b04, 0x0b05],
  },
  {
    route: 'personnel',
    targetKinds: ['character', 'post', 'rank', 'power'],
    candidateOpcodes: [0x0e00, 0x0e01],
  },
  {
    route: 'politics',
    targetKinds: ['power', 'system', 'planet', 'base', 'character', 'resources'],
    candidateOpcodes: [0x0e00, 0x1201, 0x120f],
  },
  {
    route: 'intelligence',
    targetKinds: ['character', 'system', 'planet', 'base', 'gridCell', 'outfit'],
    candidateOpcodes: [0x0b03, 0x0f08],
  },
]);

const KEYWORD_TARGETS = Object.freeze([
  { re: /封土授与|封土直轄/, kinds: ['character', 'base', 'rank', 'power'] },
  { re: /部隊結成|部隊解散/, kinds: ['base', 'outfit', 'character'] },
  { re: /ワープ|航行|移動|進攻|掃討|占領|防衛|哨戒/, kinds: ['system', 'planet', 'celestial', 'gridCell', 'outfit'] },
  { re: /補給|燃料|物資|資金|投入|購入|修理|建造|生産|徴税|輸送|補充/, kinds: ['resources', 'base', 'outfit'] },
  { re: /陸戦|兵|上陸|強襲|制圧/, kinds: ['troop'] },
  { re: /空戦|戦闘艇|雷撃艇|航空/, kinds: ['fighter'] },
  { re: /砲|兵装|武器|ミサイル|ビーム|ガン/, kinds: ['weapon', 'ship'] },
  { re: /任命|解任|昇進|降格|受講|参加|説得|叛|謀議|演習/, kinds: ['character'] },
  { re: /作戦|計画|命令|発令|撤回|指揮/, kinds: ['operationPlan', 'outfit', 'gridCell'] },
  { re: /階級|人事|職|組織|幕僚|司令/, kinds: ['post', 'rank', 'character'] },
  { re: /政治|予算|外交|演説|同盟|帝国/, kinds: ['power', 'resources', 'character'] },
  { re: /諜報|調査|逮捕|探索|偵察/, kinds: ['character', 'base', 'gridCell'] },
]);

let cachedGroups = null;

function readManualCommandGroups() {
  if (cachedGroups) return cachedGroups;
  try {
    const json = JSON.parse(readFileSync(STRATEGY_COMMANDS_PATH, 'utf8'));
    const groups = [];
    const byName = new Map();
    for (const command of Array.isArray(json?.commands) ? json.commands : []) {
      const categoryName = String(command?.category_ja ?? 'Unknown');
      if (!byName.has(categoryName)) {
        const group = { categoryName, commands: [] };
        byName.set(categoryName, group);
        groups.push(group);
      }
      byName.get(categoryName).commands.push(command);
    }
    cachedGroups = groups.length > 0 ? groups : FALLBACK_GROUPS;
  } catch {
    cachedGroups = FALLBACK_GROUPS;
  }
  return cachedGroups;
}

function commandLabel(command, fallback) {
  if (typeof command === 'string') return command;
  return String(command?.name_ja ?? command?.name ?? fallback);
}

function allocateFactoryId({ groupIndex, commandIndex, nextFactoryId, usedFactoryIds }) {
  if (groupIndex === 0 && commandIndex < DEV_COMMAND_COMPAT_FACTORY_IDS.length) {
    return { factoryId: DEV_COMMAND_COMPAT_FACTORY_IDS[commandIndex], nextFactoryId };
  }
  let factoryId = nextFactoryId;
  while (usedFactoryIds.has(factoryId)) factoryId += 1;
  return { factoryId, nextFactoryId: factoryId + 1 };
}

function unique(items) {
  return [...new Set(items.filter(Boolean))];
}

function profileForCategory(categoryIndex) {
  return CATEGORY_PROFILES[categoryIndex] ?? CATEGORY_PROFILES[CATEGORY_PROFILES.length - 1];
}

function commandTargetKinds(name, categoryIndex) {
  const profile = profileForCategory(categoryIndex);
  const keywordKinds = [];
  for (const rule of KEYWORD_TARGETS) {
    if (rule.re.test(name)) keywordKinds.push(...rule.kinds);
  }
  return unique(keywordKinds.length > 0 ? keywordKinds : profile.targetKinds);
}

function targetAvailability(targetPool = {}, targetKinds = []) {
  return Object.fromEntries(targetKinds.map((kind) => {
    if (kind === 'base') return [kind, Number.isInteger(targetPool.baseId)];
    if (kind === 'resources') {
      return [kind, Number(targetPool.supplies) > 0 || Number(targetPool.food) > 0 || Number(targetPool.mineral) > 0];
    }
    const key = kind === 'package' ? 'otherPackages' : `${kind}s`;
    return [kind, Array.isArray(targetPool[key]) && targetPool[key].length > 0];
  }));
}

function targetCollectionKey(kind) {
  if (kind === 'base' || kind === 'resources') return null;
  return kind === 'package' ? 'otherPackages' : `${kind}s`;
}

function targetSample(targetPool = {}, kind) {
  if (kind === 'base') {
    return Number.isInteger(targetPool.baseId)
      ? [{ kind, id: targetPool.baseId, label: `base:${targetPool.baseId}` }]
      : [];
  }
  if (kind === 'resources') {
    const resources = {
      supplies: Number(targetPool.supplies) || 0,
      food: Number(targetPool.food) || 0,
      mineral: Number(targetPool.mineral) || 0,
    };
    return resources.supplies > 0 || resources.food > 0 || resources.mineral > 0
      ? [{ kind, ...resources }]
      : [];
  }
  const key = targetCollectionKey(kind);
  const entries = key && Array.isArray(targetPool[key]) ? targetPool[key] : [];
  return entries.slice(0, 3).map((entry, index) => ({
    kind,
    index,
    ...entry,
  }));
}

function targetSlot(targetPool, kind) {
  const samples = targetSample(targetPool, kind);
  const key = targetCollectionKey(kind);
  const count = kind === 'base'
    ? (Number.isInteger(targetPool?.baseId) ? 1 : 0)
    : kind === 'resources'
      ? samples.length
      : (key && Array.isArray(targetPool?.[key]) ? targetPool[key].length : 0);
  return {
    kind,
    label: DEV_COMMAND_TARGET_KIND_LABELS[kind] ?? kind,
    required: true,
    available: count > 0,
    inputMode: 'select-or-override',
    emptyAction: 'pull-target-data-or-provide-admin-target',
    count,
    samples,
  };
}

function targetSlots(targetPool = {}, targetKinds = []) {
  return targetKinds.map((kind) => targetSlot(targetPool, kind));
}

function missingTargetKindsFromSlots(slots = []) {
  return slots.filter((slot) => !slot.available).map((slot) => slot.kind);
}

function missingTargetProducerHints(slots = [], targetProducersByKind = null) {
  if (!targetProducersByKind || typeof targetProducersByKind !== 'object') return null;
  const hints = {};
  for (const kind of missingTargetKindsFromSlots(slots)) {
    const producers = targetProducersByKind[kind];
    if (Array.isArray(producers) && producers.length > 0) {
      hints[kind] = producers.map((producer) => ({ ...producer }));
    }
  }
  return Object.keys(hints).length > 0 ? hints : null;
}

function opcodeHex(value) {
  return Number.isInteger(value) ? `0x${value.toString(16).padStart(4, '0')}` : null;
}

function cloneFactoryAnchor(factoryId) {
  const anchor = DEV_COMMAND_FACTORY_ANCHORS[Number(factoryId)];
  if (!anchor) return null;
  return {
    ...anchor,
    labels: Array.isArray(anchor.labels) ? [...anchor.labels] : [],
  };
}

function producerRecord(producer) {
  const requestHex = opcodeHex(producer?.request);
  const responseHex = opcodeHex(producer?.response);
  return {
    ...producer,
    ...(requestHex ? { requestHex } : {}),
    ...(responseHex ? { responseHex } : {}),
  };
}

function commandSummaryRecord(card, command) {
  return {
    categoryIndex: card.categoryIndex,
    categoryName: card.categoryName,
    commandIndex: command.commandIndex,
    factoryId: command.factoryId,
    factoryIdHex: opcodeHex(command.factoryId),
    factoryAnchor: command.factoryAnchor ?? cloneFactoryAnchor(command.factoryId),
    name: command.name,
    route: command.route,
    targetKinds: command.targetKinds,
    candidateOpcodes: command.candidateOpcodes,
    candidateOpcodeHex: (command.candidateOpcodes ?? []).map((code) => opcodeHex(code)),
  };
}

function noteMissingKind({ missingTargetsByKind, kind, card, command, producers }) {
  if (!missingTargetsByKind.has(kind)) {
    missingTargetsByKind.set(kind, {
      kind,
      label: DEV_COMMAND_TARGET_KIND_LABELS[kind] ?? kind,
      blockedCommandCount: 0,
      sampleCommands: [],
      producers: [],
    });
  }
  const entry = missingTargetsByKind.get(kind);
  entry.blockedCommandCount += 1;
  if (entry.sampleCommands.length < 8) {
    entry.sampleCommands.push(commandSummaryRecord(card, command));
  }
  for (const producer of producers) {
    const record = producerRecord(producer);
    const exists = entry.producers.some((candidate) => (
      candidate.request === record.request && candidate.response === record.response
    ));
    if (!exists) entry.producers.push(record);
  }
}

function noteNextPull({ nextPullsByKey, kind, card, command, producer }) {
  const request = Number.isInteger(producer?.request) ? producer.request : null;
  const response = Number.isInteger(producer?.response) ? producer.response : null;
  if (request === null || response === null) return;
  const key = `${request}:${response}`;
  if (!nextPullsByKey.has(key)) {
    nextPullsByKey.set(key, {
      ...producerRecord(producer),
      unlocks: {
        targetKinds: [],
        commandCount: 0,
        sampleCommands: [],
      },
    });
  }
  const entry = nextPullsByKey.get(key);
  if (!entry.unlocks.targetKinds.includes(kind)) entry.unlocks.targetKinds.push(kind);
  entry.unlocks.commandCount += 1;
  if (entry.unlocks.sampleCommands.length < 8) {
    entry.unlocks.sampleCommands.push(commandSummaryRecord(card, command));
  }
}

export function devCommandReadinessSummary(catalog = {}) {
  const cards = Array.isArray(catalog?.cards) ? catalog.cards : [];
  const executableCommandSamples = [];
  const blockedCommandSamples = [];
  const missingTargetsByKind = new Map();
  const nextPullsByKey = new Map();
  let totalCommands = 0;
  let executableCommands = 0;
  let blockedCommands = 0;
  let unknownTargetCommands = 0;
  let factoryAnchorCommands = 0;

  for (const card of cards) {
    for (const command of Array.isArray(card.commands) ? card.commands : []) {
      totalCommands += 1;
      if (command.factoryAnchor) factoryAnchorCommands += 1;
      const missingKinds = Array.isArray(command.missingTargetKinds) ? command.missingTargetKinds : null;
      const baseSummary = commandSummaryRecord(card, command);
      if (missingKinds === null) {
        unknownTargetCommands += 1;
        continue;
      }
      if (missingKinds.length === 0) {
        executableCommands += 1;
        if (executableCommandSamples.length < 8) {
          executableCommandSamples.push({
            ...baseSummary,
            executionPreview: command.executionPreview ?? null,
          });
        }
        continue;
      }

      blockedCommands += 1;
      const hints = command.missingTargetProducerHints ?? {};
      const blockedSummary = {
        ...baseSummary,
        missingTargetKinds: missingKinds,
        missingTargetProducerHints: hints,
      };
      if (blockedCommandSamples.length < 8) blockedCommandSamples.push(blockedSummary);
      for (const kind of missingKinds) {
        const producers = Array.isArray(hints[kind]) ? hints[kind] : [];
        noteMissingKind({ missingTargetsByKind, kind, card, command, producers });
        for (const producer of producers) {
          noteNextPull({ nextPullsByKey, kind, card, command, producer });
        }
      }
    }
  }

  return {
    totalCards: cards.length,
    totalCommands,
    executableCommands,
    blockedCommands,
    unknownTargetCommands,
    factoryAnchorCommands,
    canonicalAuthorityCardMappedCommands: 0,
    mappingStatus: DEV_COMMAND_FACTORY_MAPPING_AUDIT.status,
    canonicalAuthorityCardMappingRecovered: DEV_COMMAND_FACTORY_MAPPING_AUDIT.canonicalAuthorityCardMappingRecovered,
    executableCommandSamples,
    blockedCommandSamples,
    missingTargetsByKind: Object.fromEntries(missingTargetsByKind.entries()),
    nextTargetPulls: [...nextPullsByKey.values()].sort((a, b) => a.request - b.request),
  };
}

export function devCommandCategoryCards() {
  const groups = readManualCommandGroups();
  const usedFactoryIds = new Set(DEV_COMMAND_COMPAT_FACTORY_IDS);
  let nextFactoryId = DEV_COMMAND_FACTORY_BASE;

  return groups.map((group, groupIndex) => {
    const profile = profileForCategory(groupIndex);
    const commands = (Array.isArray(group.commands) ? group.commands : []).map((command, commandIndex) => {
      const allocated = allocateFactoryId({ groupIndex, commandIndex, nextFactoryId, usedFactoryIds });
      nextFactoryId = allocated.nextFactoryId;
      usedFactoryIds.add(allocated.factoryId);
      const name = commandLabel(command, `Command ${commandIndex + 1}`);
      const targetKinds = commandTargetKinds(name, groupIndex);
      return {
        factoryId: allocated.factoryId,
        factoryAnchor: cloneFactoryAnchor(allocated.factoryId),
        commandIndex,
        categoryIndex: groupIndex,
        name,
        costCp: Number(command?.cost_cp ?? 0) || 0,
        waitTime: command?.wait_time ?? null,
        execTime: command?.exec_time ?? null,
        route: profile.route,
        targetKinds,
        candidateOpcodes: profile.candidateOpcodes,
        provenance: DEV_COMMAND_CARD_PROVENANCE,
      };
    });
    return {
      cardId: groupIndex,
      categoryIndex: groupIndex,
      categoryName: group.categoryName,
      route: profile.route,
      targetKinds: profile.targetKinds,
      candidateOpcodes: profile.candidateOpcodes,
      commands,
      provenance: DEV_COMMAND_CARD_PROVENANCE,
    };
  });
}

export function devCommandStaticCardRecords() {
  return devCommandCategoryCards().map((card) => ({
    id: card.cardId,
    commands: card.commands.map((command) => command.factoryId),
  }));
}

export function devCommandDescriptorRecords() {
  return devCommandCategoryCards().map((card) => ({
    cardId: card.cardId,
    commands: card.commands.map((command) => ({
      id: command.factoryId,
      // Unknown descriptor fields stay zero. Factory ids only RE-pinned consumer field.
    })),
  }));
}

export function devCommandSeatEntries({ all = true, category = 0 } = {}) {
  const cards = devCommandCategoryCards();
  const selected = all
    ? cards
    : [cards[Math.max(0, Math.min(cards.length - 1, Number(category) || 0))] ?? cards[0]].filter(Boolean);
  return selected.map((card) => ({
    // Category/card 0 needs non-zero dword on 0x0323, but client consumes low u16 category 0.
    character: card.cardId === 0 ? 0x10000 : card.cardId,
    role: 0,
  }));
}

function cloneRouteInteraction(route) {
  const interaction = DEV_COMMAND_ROUTE_INTERACTIONS[route] ?? {
    stateDomains: ['unknown-state'],
    interactionKinds: ['command'],
  };
  return {
    route,
    stateDomains: [...(interaction.stateDomains ?? [])],
    interactionKinds: [...(interaction.interactionKinds ?? [])],
  };
}

function opcodeConsumerRecords(contentExposure = null, targetKind = null) {
  const contract = Array.isArray(contentExposure?.opcodeContract) ? contentExposure.opcodeContract : [];
  return contract
    .filter((entry) => targetKind === null || (entry.targetKinds ?? []).includes(targetKind))
    .map((entry) => ({
      request: entry.request,
      response: entry.response,
      requestHex: opcodeHex(entry.request),
      responseHex: opcodeHex(entry.response),
      name: entry.name,
      consumer: entry.consumer,
      parser: entry.parser ?? null,
      status: entry.status ?? 'known',
      datasets: Array.isArray(entry.datasets) ? [...entry.datasets] : [],
      targetKinds: Array.isArray(entry.targetKinds) ? [...entry.targetKinds] : [],
      contentGaps: Array.isArray(entry.contentGaps) ? [...entry.contentGaps] : [],
      nativeFactoryBranches: Array.isArray(entry.nativeFactoryBranches)
        ? entry.nativeFactoryBranches.map((branch) => ({ ...branch }))
        : [],
    }));
}

function targetProducerRecords(contentExposure = null, targetKind = null) {
  const producers = targetKind && Array.isArray(contentExposure?.targetProducersByKind?.[targetKind])
    ? contentExposure.targetProducersByKind[targetKind]
    : [];
  return producers.map((producer) => producerRecord(producer));
}

function commandPlayability(command) {
  const missing = Array.isArray(command?.missingTargetKinds) ? command.missingTargetKinds : null;
  if (missing === null) return 'unknown-targets';
  return missing.length === 0 ? 'executable' : 'missing-targets';
}

function emptyObjectInteraction(kind, targetPool, contentExposure) {
  const slot = targetPool ? targetSlot(targetPool, kind) : null;
  return {
    kind,
    label: DEV_COMMAND_TARGET_KIND_LABELS[kind] ?? kind,
    slot,
    producers: targetProducerRecords(contentExposure, kind),
    consumers: opcodeConsumerRecords(contentExposure, kind),
    commandCount: 0,
    executableCommandCount: 0,
    blockedCommandCount: 0,
    stateDomains: [],
    interactionKinds: [],
    sampleCommands: [],
  };
}

function pushUnique(list, values = []) {
  for (const value of values) {
    if (value && !list.includes(value)) list.push(value);
  }
}

export function buildDevInteractionExposure({ catalog = {}, targetPool = null, contentExposure = null } = {}) {
  const objectKinds = {};
  for (const kind of Object.keys(DEV_COMMAND_TARGET_KIND_LABELS)) {
    objectKinds[kind] = emptyObjectInteraction(kind, targetPool, contentExposure);
  }

  const cards = Array.isArray(catalog?.cards) ? catalog.cards : [];
  const categories = [];
  for (const card of cards) {
    const routeInfo = cloneRouteInteraction(card.route);
    let cardCommandCount = 0;
    let cardExecutableCount = 0;
    for (const command of Array.isArray(card.commands) ? card.commands : []) {
      cardCommandCount += 1;
      const playability = commandPlayability(command);
      if (playability === 'executable') cardExecutableCount += 1;
      for (const kind of command.targetKinds ?? []) {
        objectKinds[kind] ??= emptyObjectInteraction(kind, targetPool, contentExposure);
        const objectEntry = objectKinds[kind];
        objectEntry.commandCount += 1;
        if (playability === 'executable') objectEntry.executableCommandCount += 1;
        if (playability === 'missing-targets') objectEntry.blockedCommandCount += 1;
        pushUnique(objectEntry.stateDomains, routeInfo.stateDomains);
        pushUnique(objectEntry.interactionKinds, routeInfo.interactionKinds);
        if (objectEntry.sampleCommands.length < 10) {
          objectEntry.sampleCommands.push({
            ...commandSummaryRecord(card, command),
            playability,
            missingTargetKinds: Array.isArray(command.missingTargetKinds) ? [...command.missingTargetKinds] : null,
            selectedTarget: command.executionPreview?.selectedTargets?.[kind] ?? null,
          });
        }
      }
    }
    categories.push({
      cardId: card.cardId,
      categoryIndex: card.categoryIndex,
      categoryName: card.categoryName,
      route: card.route,
      commandCount: cardCommandCount,
      executableCommandCount: cardExecutableCount,
      stateDomains: routeInfo.stateDomains,
      interactionKinds: routeInfo.interactionKinds,
      targetKinds: Array.isArray(card.targetKinds) ? [...card.targetKinds] : [],
      candidateOpcodeHex: (card.candidateOpcodes ?? []).map((code) => opcodeHex(code)),
    });
  }

  const objectKindList = Object.values(objectKinds);
  return {
    provenance: DEV_COMMAND_CARD_PROVENANCE,
    purpose: 'dev-only object-interaction-command exposure',
    mappingStatus: catalog?.mappingAudit?.status ?? DEV_COMMAND_FACTORY_MAPPING_AUDIT.status,
    objectKinds,
    categories,
    opcodeConsumers: opcodeConsumerRecords(contentExposure),
    playability: {
      totalObjectKinds: objectKindList.length,
      objectKindsWithTargets: objectKindList.filter((entry) => entry.slot?.available).length,
      objectKindsWithCommands: objectKindList.filter((entry) => entry.commandCount > 0).length,
      objectKindsWithProducerOpcodes: objectKindList.filter((entry) => entry.producers.length > 0).length,
      executableCommands: catalog?.readiness?.executableCommands ?? 0,
      blockedCommands: catalog?.readiness?.blockedCommands ?? 0,
      unknownTargetCommands: catalog?.readiness?.unknownTargetCommands ?? 0,
    },
  };
}

function createCommandBucket(key) {
  return {
    key: String(key ?? 'unknown'),
    commandCount: 0,
    executableCommandCount: 0,
    blockedCommandCount: 0,
    sampleCommands: [],
  };
}

function noteCommandBucket(buckets, key, card, command, playability) {
  const normalized = String(key ?? 'unknown');
  buckets[normalized] ??= createCommandBucket(normalized);
  const bucket = buckets[normalized];
  bucket.commandCount += 1;
  if (playability === 'executable') bucket.executableCommandCount += 1;
  if (playability === 'missing-targets') bucket.blockedCommandCount += 1;
  if (bucket.sampleCommands.length < 8) {
    bucket.sampleCommands.push({
      ...commandSummaryRecord(card, command),
      semantic: command.executionPreview?.semantic ?? null,
      effect: command.executionPreview?.effect ?? null,
      transport: command.executionPreview?.transport ?? null,
      innerCodeHex: command.executionPreview?.innerCodeHex ?? null,
      playability,
      missingTargetKinds: Array.isArray(command.missingTargetKinds) ? [...command.missingTargetKinds] : null,
    });
  }
}

function opcodeStatusSummary(contentExposure = null) {
  const status = {};
  for (const entry of Array.isArray(contentExposure?.opcodeContract) ? contentExposure.opcodeContract : []) {
    const key = entry.status ?? 'known';
    status[key] ??= {
      status: key,
      count: 0,
      sampleOpcodes: [],
    };
    status[key].count += 1;
    if (status[key].sampleOpcodes.length < 8) {
      status[key].sampleOpcodes.push({
        request: entry.request,
        response: entry.response,
        requestHex: opcodeHex(entry.request),
        responseHex: opcodeHex(entry.response),
        name: entry.name,
      });
    }
  }
  return status;
}

function objectCoverageSummary(interactionExposure = null) {
  const objectKinds = interactionExposure?.objectKinds ?? {};
  const entries = Object.values(objectKinds);
  return {
    totalObjectKinds: entries.length,
    withTargets: entries.filter((entry) => entry.slot?.available).map((entry) => entry.kind),
    withoutTargets: entries.filter((entry) => !entry.slot?.available).map((entry) => entry.kind),
    withCommands: entries.filter((entry) => entry.commandCount > 0).map((entry) => entry.kind),
    withoutCommands: entries.filter((entry) => entry.commandCount === 0).map((entry) => entry.kind),
    withProducerOpcodes: entries.filter((entry) => entry.producers.length > 0).map((entry) => entry.kind),
    withoutProducerOpcodes: entries.filter((entry) => entry.producers.length === 0).map((entry) => entry.kind),
    withConsumerOpcodes: entries.filter((entry) => entry.consumers.length > 0).map((entry) => entry.kind),
    withoutConsumerOpcodes: entries.filter((entry) => entry.consumers.length === 0).map((entry) => entry.kind),
  };
}

export function buildDevPlayabilityAudit({
  catalog = {},
  interactionExposure = null,
  contentExposure = null,
} = {}) {
  const routeBuckets = {};
  const effectBuckets = {};
  const transportBuckets = {};
  const semanticBuckets = {};
  const innerCodeBuckets = {};
  const unanchoredFactorySamples = [];
  let totalCommands = 0;
  let executableCommands = 0;
  let blockedCommands = 0;
  let unknownTargetCommands = 0;
  let serverDirectCommands = 0;
  let opcodeCommands = 0;
  let anchoredFactoryCommands = 0;

  for (const card of Array.isArray(catalog?.cards) ? catalog.cards : []) {
    for (const command of Array.isArray(card.commands) ? card.commands : []) {
      totalCommands += 1;
      const playability = commandPlayability(command);
      const preview = command.executionPreview ?? {};
      if (playability === 'executable') executableCommands += 1;
      else if (playability === 'missing-targets') blockedCommands += 1;
      else unknownTargetCommands += 1;
      if (preview.transport === 'server-direct') serverDirectCommands += 1;
      if ((preview.transport ?? 'opcode') === 'opcode' && preview.innerCodeHex) opcodeCommands += 1;
      if (command.factoryAnchor) anchoredFactoryCommands += 1;
      else if (unanchoredFactorySamples.length < 12) unanchoredFactorySamples.push(commandSummaryRecord(card, command));

      noteCommandBucket(routeBuckets, command.route ?? card.route, card, command, playability);
      noteCommandBucket(effectBuckets, preview.effect ?? 'unclassified', card, command, playability);
      noteCommandBucket(transportBuckets, preview.transport ?? (preview.innerCodeHex ? 'opcode' : 'unknown'), card, command, playability);
      noteCommandBucket(semanticBuckets, preview.semantic ?? 'unclassified', card, command, playability);
      noteCommandBucket(innerCodeBuckets, preview.innerCodeHex ?? 'unmapped', card, command, playability);
    }
  }

  const canonicalRecovered = catalog?.mappingAudit?.canonicalAuthorityCardMappingRecovered === true;
  const missingCanonical = Array.isArray(catalog?.mappingAudit?.missing)
    ? catalog.mappingAudit.missing
    : [...DEV_COMMAND_FACTORY_MAPPING_AUDIT.missing];
  const recoveredCanonical = Array.isArray(catalog?.mappingAudit?.recovered)
    ? catalog.mappingAudit.recovered
    : [...DEV_COMMAND_FACTORY_MAPPING_AUDIT.recovered];
  return {
    provenance: DEV_COMMAND_CARD_PROVENANCE,
    status: canonicalRecovered ? 'canonical-route-recovered' : 'dev-playable-canonical-card-route-incomplete',
    devPlayable: executableCommands > 0,
    canonicalAuthorityCardMappingRecovered: canonicalRecovered,
    commandTotals: {
      totalCommands,
      executableCommands,
      blockedCommands,
      unknownTargetCommands,
      opcodeCommands,
      serverDirectCommands,
      anchoredFactoryCommands,
      canonicalAuthorityCardMappedCommands: catalog?.readiness?.canonicalAuthorityCardMappedCommands ?? 0,
    },
    commandBuckets: {
      routes: routeBuckets,
      effects: effectBuckets,
      transports: transportBuckets,
      semantics: semanticBuckets,
      innerCodes: innerCodeBuckets,
    },
    objectCoverage: objectCoverageSummary(interactionExposure),
    opcodeStatus: opcodeStatusSummary(contentExposure),
    recoveredCanonicalEvidence: recoveredCanonical.map((evidence) => ({
      evidence,
      status: 'recovered',
    })),
    canonicalGates: missingCanonical.map((gate) => ({
      gate,
      status: 'missing',
      evidence: catalog?.mappingAudit?.consumer ?? DEV_COMMAND_FACTORY_MAPPING_AUDIT.consumer,
    })),
    unanchoredFactorySamples,
    nextBestFocus: canonicalRecovered
      ? 'replace dev command cards with recovered authority-card data'
      : 'recover natural 0x0305/0x0307 authority-card factory mapping and descriptor semantics',
  };
}

export function devCommandExposureCatalog({ targetPool = null, targetProducersByKind = null } = {}) {
  const cards = devCommandCategoryCards();
  const catalog = {
    provenance: DEV_COMMAND_CARD_PROVENANCE,
    mappingAudit: {
      ...DEV_COMMAND_FACTORY_MAPPING_AUDIT,
      recovered: [...DEV_COMMAND_FACTORY_MAPPING_AUDIT.recovered],
      missing: [...DEV_COMMAND_FACTORY_MAPPING_AUDIT.missing],
    },
    targetInteractionPolicy: { ...DEV_COMMAND_TARGET_INTERACTION_POLICY },
    factoryAnchors: Object.values(DEV_COMMAND_FACTORY_ANCHORS).map((anchor) => ({
      ...anchor,
      labels: Array.isArray(anchor.labels) ? [...anchor.labels] : [],
    })),
    targetKindLabels: DEV_COMMAND_TARGET_KIND_LABELS,
    cards: cards.map((card) => {
      const cardSlots = targetPool ? targetSlots(targetPool, card.targetKinds) : null;
      const cardMissingProducerHints = cardSlots ? missingTargetProducerHints(cardSlots, targetProducersByKind) : null;
      return {
        ...card,
        targetAvailability: targetPool ? targetAvailability(targetPool, card.targetKinds) : null,
        targetSlots: cardSlots,
        missingTargetKinds: cardSlots ? missingTargetKindsFromSlots(cardSlots) : null,
        missingTargetProducerHints: cardMissingProducerHints,
        commands: card.commands.map((command) => {
          const commandSlots = targetPool ? targetSlots(targetPool, command.targetKinds) : null;
          const commandMissingProducerHints = commandSlots ? missingTargetProducerHints(commandSlots, targetProducersByKind) : null;
          return {
            ...command,
            targetAvailability: targetPool ? targetAvailability(targetPool, command.targetKinds) : null,
            targetSlots: commandSlots,
            missingTargetKinds: commandSlots ? missingTargetKindsFromSlots(commandSlots) : null,
            missingTargetProducerHints: commandMissingProducerHints,
            executionPreview: targetPool ? previewDevCommandExecution({ command, targetPool }) : null,
          };
        }),
      };
    }),
  };
  return {
    ...catalog,
    readiness: devCommandReadinessSummary(catalog),
  };
}

function staticSystemSamples(staticState = null) {
  const systems = Array.isArray(staticState?.systems) ? staticState.systems : [];
  if (systems.length === 0) {
    return [
      { id: 1, contentId: 1, name: 'Dev System Alpha', cell: 2588, provenance: DEV_COMMAND_CARD_PROVENANCE },
      { id: 2, contentId: 2, name: 'Dev System Beta', cell: 2599, provenance: DEV_COMMAND_CARD_PROVENANCE },
      { id: 3, contentId: 3, name: 'Dev System Gamma', cell: 2115, provenance: DEV_COMMAND_CARD_PROVENANCE },
    ];
  }
  return systems.slice(0, 5).map((system, index) => {
    const id = Number(system?.id ?? system?.contentId ?? index + 1) || index + 1;
    return {
      id,
      contentId: Number(system?.contentId ?? id) || id,
      name: system?.nameKo ?? system?.name_ko ?? system?.name ?? `System ${index + 1}`,
      cell: Number(system?.map?.cell ?? system?.cell ?? system?.gridCell ?? 2588 + index) || 2588 + index,
      provenance: DEV_COMMAND_CARD_PROVENANCE,
    };
  });
}

function staticPlanetSamples(staticState = null, systemSamples = []) {
  const planets = [];
  const systems = Array.isArray(staticState?.systems) ? staticState.systems : [];
  for (const [systemIndex, system] of systems.entries()) {
    const systemId = Number(system?.id ?? system?.contentId ?? systemSamples[systemIndex]?.id ?? systemIndex + 1) || systemIndex + 1;
    const systemName = system?.nameKo ?? system?.name_ko ?? system?.name ?? `System ${systemIndex + 1}`;
    const sourcePlanets = Array.isArray(system?.planets) ? system.planets : [];
    if (sourcePlanets.length === 0) {
      planets.push({
        id: systemId * 100 + 1,
        systemId,
        name: `${systemName} I`,
        kind: 'planet',
        provenance: DEV_COMMAND_CARD_PROVENANCE,
      });
    } else {
      for (const [planetIndex, planet] of sourcePlanets.entries()) {
        planets.push({
          id: Number(planet?.id ?? systemId * 100 + planetIndex + 1) || systemId * 100 + planetIndex + 1,
          systemId,
          name: planet?.nameKo ?? planet?.name_ko ?? planet?.name ?? `${systemName} ${planetIndex + 1}`,
          kind: planet?.kind ?? 'planet',
          provenance: planet?.authority ?? DEV_COMMAND_CARD_PROVENANCE,
        });
      }
    }
    if (planets.length >= 8) break;
  }
  if (planets.length > 0) return planets.slice(0, 8);
  return systemSamples.slice(0, 3).map((system, index) => ({
    id: system.id * 100 + 1,
    systemId: system.id,
    name: `${system.name} I`,
    kind: 'planet',
    provenance: DEV_COMMAND_CARD_PROVENANCE,
    index,
  }));
}

function staticCelestialSamples(systemSamples = []) {
  return systemSamples.slice(0, 5).map((system, index) => ({
    id: system.id * 10 + 1,
    systemId: system.id,
    name: `${system.name} primary`,
    kind: index === 0 ? 'black-hole-or-star-slot' : 'star',
    cell: system.cell,
    provenance: DEV_COMMAND_CARD_PROVENANCE,
  }));
}

export function buildPlayableCommandTargets({
  activeCharacterId = 1,
  activeUnitId = 1,
  baseId = 1,
  characterName = 'Player',
  power = 0,
  staticState = null,
} = {}) {
  const shipKinds = (Array.isArray(staticState?.shipClasses) ? staticState.shipClasses : [])
    .slice(0, 3)
    .map((ship, i) => Number(ship?.kind) || i + 1);
  if (shipKinds.length === 0) shipKinds.push(1);

  const troopKinds = (Array.isArray(staticState?.troops) ? staticState.troops : [])
    .slice(0, 3)
    .map((troop, i) => Number(troop?.kind) || i + 1);
  if (troopKinds.length === 0) troopKinds.push(1);

  const fighterKinds = (Array.isArray(staticState?.fighters) ? staticState.fighters : [])
    .slice(0, 3)
    .map((fighter, i) => Number(fighter?.kind) || i + 1);
  if (fighterKinds.length === 0) fighterKinds.push(1);

  const weaponKinds = (Array.isArray(staticState?.arms) ? staticState.arms : [])
    .slice(0, 4)
    .map((weapon, i) => Number(weapon?.kind) || i + 1);
  if (weaponKinds.length === 0) weaponKinds.push(1);
  const systems = staticSystemSamples(staticState);
  const planets = staticPlanetSamples(staticState, systems);
  const celestials = staticCelestialSamples(systems);

  return {
    baseId,
    systems,
    planets,
    celestials,
    characters: [{ id: activeCharacterId, kind: 0, rank: 0, name: characterName }],
    outfits: [{ id: activeUnitId, power, index: 0 }],
    ships: shipKinds.map((kind, i) => ({
      id: activeUnitId * 100 + i + 1,
      kind,
      unitId: activeUnitId,
      unitNumber: Math.max(1, 6 - i),
      boatNumber: Math.max(1, 100 - i * 25),
      units: [activeUnitId],
    })),
    troops: troopKinds.map((kind, i) => ({
      id: activeUnitId * 100 + 50 + i,
      kind,
      unitId: activeUnitId,
      troopGrade: i,
      unitNumber: Math.max(1, 12 - i * 2),
    })),
    otherPackages: shipKinds.slice(0, 2).map((kind, i) => ({
      kind: i + 1,
      unitKind: kind,
      troopGrade: 0,
      packageNumber: i + 1,
    })),
    troopPackages: troopKinds.slice(0, 4).map((kind, i) => ({
      kind: i + 1,
      unitKind: kind,
      troopGrade: i,
      packageNumber: i + 1,
    })),
    gridCells: [
      { cell: 2588, systemId: 1, label: 'home-cell' },
      { cell: 2599, systemId: 1, label: 'adjacent-cell' },
    ],
    fighters: fighterKinds.map((kind, i) => ({
      id: activeUnitId * 100 + 80 + i,
      kind,
      unitId: activeUnitId,
      unitNumber: Math.max(1, 12 - i * 2),
      boatNumber: Math.max(1, 48 - i * 8),
    })),
    weapons: weaponKinds.map((kind, i) => ({
      id: activeUnitId * 100 + 90 + i,
      kind,
      unitId: activeUnitId,
      slot: i,
      power: Math.max(1, 100 - i * 10),
    })),
    operationPlans: [{ id: 1, target: 2599, units: [activeUnitId] }],
    posts: [{ id: 1, name: 'Command Post', capacity: 1 }],
    ranks: [{ id: 1, name: 'Rank' }],
    powers: [{ id: power || 1, name: power === 2 ? 'Alliance' : 'Empire' }],
    supplies: 5000,
    food: 3000,
    mineral: 2000,
  };
}
