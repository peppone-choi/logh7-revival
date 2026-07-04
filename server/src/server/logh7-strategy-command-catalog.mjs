import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SERVER_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DEFAULT_MANUAL_PATH = join(SERVER_ROOT, 'content', 'manual', 'strategy-commands.json');

const CATEGORY_DEFINITIONS = [
  { id: 'operations', nameJa: '作戦コマンド' },
  { id: 'personal', nameJa: '個人コマンド' },
  { id: 'command', nameJa: '指揮コマンド' },
  { id: 'logistics', nameJa: '兵站コマンド' },
  { id: 'personnel', nameJa: '人事コマンド' },
  { id: 'politics', nameJa: '政治コマンド' },
  { id: 'intelligence', nameJa: '諜報コマンド' },
];
const CATEGORY_BY_NAME = new Map(CATEGORY_DEFINITIONS.map((category) => [category.nameJa, category]));

export function loadManualStrategyCommands(path = DEFAULT_MANUAL_PATH) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function buildStrategyCommandCatalog({
  manual = loadManualStrategyCommands(),
  manualPath = 'server/content/manual/strategy-commands.json',
} = {}) {
  validateManualStrategyCommands(manual);

  const categoryCounters = new Map();
  const categoryCounts = new Map();
  const commands = manual.commands.map((command, index) => {
    const category = CATEGORY_BY_NAME.get(command.category_ja);
    if (!category) {
      throw new Error(`unknown strategy command category: ${command.category_ja}`);
    }
    const categoryOrdinal = (categoryCounters.get(category.id) ?? 0) + 1;
    categoryCounters.set(category.id, categoryOrdinal);
    categoryCounts.set(category.id, (categoryCounts.get(category.id) ?? 0) + 1);

    return {
      id: `${category.id}-${String(categoryOrdinal).padStart(3, '0')}`,
      sourceIndex: index,
      categoryId: category.id,
      categoryJa: category.nameJa,
      categoryOrdinal,
      nameJa: command.name_ja,
      cost: normalizeCost(command.cost_cp),
      wait: normalizeDuration(command.wait_time),
      execution: normalizeDuration(command.exec_time),
      descriptionJa: command.desc,
    };
  });

  const categories = CATEGORY_DEFINITIONS
    .filter((category) => categoryCounts.has(category.id))
    .map((category) => ({
      id: category.id,
      nameJa: category.nameJa,
      commandCount: categoryCounts.get(category.id),
    }));

  return {
    id: 'logh7-strategy-command-catalog',
    source: {
      manualPath,
      sourceLabel: manual._source,
      evidenceGrade: 'P0-manual-table',
      inferencePolicy: 'preserve manual cost/time fields; do not infer gameplay effects from descriptions',
    },
    commandCount: commands.length,
    categoryCount: categories.length,
    summary: summarizeCommands(commands),
    categories,
    commands,
  };
}

export function writeStrategyCommandCatalog(path, catalog = buildStrategyCommandCatalog()) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(catalog, null, 2)}\n`);
  return catalog;
}

export function getCommandById(catalog, id) {
  return catalog.commands.find((command) => command.id === id);
}

export function listCommandsByCategory(catalog, categoryId) {
  return catalog.commands.filter((command) => command.categoryId === categoryId);
}

function validateManualStrategyCommands(manual) {
  if (!manual || typeof manual !== 'object') {
    throw new TypeError('strategy command manual must be an object');
  }
  if (typeof manual._source !== 'string' || manual._source.length === 0) {
    throw new TypeError('strategy command manual must include _source');
  }
  if (!Array.isArray(manual.commands) || manual.commands.length === 0) {
    throw new TypeError('strategy command manual must include commands');
  }
  for (const command of manual.commands) {
    validateManualCommand(command);
  }
}

function validateManualCommand(command) {
  for (const key of ['name_ja', 'category_ja', 'wait_time', 'exec_time', 'desc']) {
    if (typeof command[key] !== 'string' || command[key].length === 0) {
      throw new TypeError(`strategy command missing string field: ${key}`);
    }
  }
  if (!Number.isInteger(command.cost_cp)) {
    throw new TypeError(`strategy command has non-integer cost_cp: ${command.name_ja}`);
  }
}

function normalizeCost(raw) {
  if (raw === -1) {
    return { kind: 'variable', raw };
  }
  if (raw >= 0) {
    return { kind: 'fixed', cp: raw, raw };
  }
  throw new Error(`unsupported strategy command cost_cp: ${raw}`);
}

function normalizeDuration(raw) {
  const fixed = raw.match(/^\d+$/);
  if (fixed) {
    return { kind: 'fixed', gDays: Number(raw), raw };
  }
  const range = raw.match(/^(\d+)〜(\d+)$/);
  if (range) {
    const minGDays = Number(range[1]);
    const maxGDays = Number(range[2]);
    if (minGDays > maxGDays) {
      throw new Error(`invalid strategy command duration range: ${raw}`);
    }
    return { kind: 'range', minGDays, maxGDays, raw };
  }
  return { kind: 'unknown', raw };
}

function summarizeCommands(commands) {
  return {
    fixedCostCount: commands.filter((command) => command.cost.kind === 'fixed').length,
    variableCostCount: commands.filter((command) => command.cost.kind === 'variable').length,
    rangedWaitCount: commands.filter((command) => command.wait.kind === 'range').length,
    rangedExecutionCount: commands.filter((command) => command.execution.kind === 'range').length,
  };
}
