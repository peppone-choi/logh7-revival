#!/usr/bin/env node
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { inventorySourceRoots, loadSourceRootRegistry } from '../src/server/logh7-source-corpus.mjs';

const DEFAULT_WORKSPACE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const args = parseArgs(process.argv.slice(2));
const registry = loadSourceRootRegistry(args.registry);
const inventory = inventorySourceRoots({
  registry,
  workspaceRoot: args.workspaceRoot,
  includeFiles: args.includeFiles,
});

console.log(JSON.stringify(inventory, null, 2));

if (args.requireAll && inventory.roots.some((root) => root.status !== 'present')) {
  process.exitCode = 1;
}

function parseArgs(argv) {
  const args = {
    includeFiles: false,
    registry: undefined,
    requireAll: false,
    workspaceRoot: DEFAULT_WORKSPACE_ROOT,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--files') {
      args.includeFiles = true;
    } else if (arg === '--registry') {
      args.registry = argv[index + 1];
      index += 1;
    } else if (arg === '--require-all') {
      args.requireAll = true;
    } else if (arg === '--workspace-root') {
      args.workspaceRoot = resolve(argv[index + 1] ?? '.');
      index += 1;
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  return args;
}
