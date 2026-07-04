import { getCommandById } from './logh7-strategy-command-catalog.mjs';

export function evaluateCommandCost(catalog, commandId, { availableCp }) {
  assertAvailableCp(availableCp);
  const command = requireCommand(catalog, commandId);

  if (command.cost.kind === 'variable') {
    return {
      status: 'variable-cost-unresolved',
      commandId,
      commandNameJa: command.nameJa,
      costKind: 'variable',
      availableCp,
      reason: 'manual-table-variable-cp',
    };
  }

  if (command.cost.kind !== 'fixed') {
    throw new Error(`unsupported strategy command cost kind: ${command.cost.kind}`);
  }

  const requiredCp = command.cost.cp;
  if (availableCp < requiredCp) {
    return {
      status: 'insufficient-cp',
      commandId,
      commandNameJa: command.nameJa,
      costKind: 'fixed',
      requiredCp,
      availableCp,
      shortageCp: requiredCp - availableCp,
    };
  }

  return {
    status: 'payable',
    commandId,
    commandNameJa: command.nameJa,
    costKind: 'fixed',
    requiredCp,
    availableCp,
    remainingCp: availableCp - requiredCp,
  };
}

export function getCommandTimingSpec(catalog, commandId) {
  const command = requireCommand(catalog, commandId);
  return {
    commandId,
    commandNameJa: command.nameJa,
    wait: command.wait,
    execution: command.execution,
  };
}

export function buildStrategyCommandRuleSet(catalog) {
  return {
    id: 'logh7-strategy-command-rules',
    sourceCatalogId: catalog.id,
    commandCount: catalog.commands.length,
    fixedCostCommandCount: catalog.commands.filter((command) => command.cost.kind === 'fixed').length,
    variableCostCommandIds: catalog.commands
      .filter((command) => command.cost.kind === 'variable')
      .map((command) => command.id),
    rangedExecutionCommandIds: catalog.commands
      .filter((command) => command.execution.kind === 'range')
      .map((command) => command.id),
    inferencePolicy: 'fixed CP and durations come from manual table; variable CP stays unresolved',
  };
}

function requireCommand(catalog, commandId) {
  const command = getCommandById(catalog, commandId);
  if (!command) {
    throw new Error(`unknown strategy command id: ${commandId}`);
  }
  return command;
}

function assertAvailableCp(availableCp) {
  if (!Number.isInteger(availableCp) || availableCp < 0) {
    throw new TypeError('availableCp must be a non-negative integer');
  }
}
