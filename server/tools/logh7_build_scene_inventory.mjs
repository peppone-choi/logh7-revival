#!/usr/bin/env node
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  LOGH7_SCENE_INVENTORY_DEFAULTS,
  buildSceneInventory,
  writeSceneInventory,
} from '../src/server/logh7-scene-inventory.mjs';

const DEFAULT_WORKSPACE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const args = parseArgs(process.argv.slice(2));
const inventory = buildSceneInventory({ workspaceRoot: args.workspaceRoot });
writeSceneInventory(args.out, inventory);
console.log(JSON.stringify(inventory, null, 2));

function parseArgs(argv) {
  const args = {
    out: LOGH7_SCENE_INVENTORY_DEFAULTS.outPath,
    workspaceRoot: DEFAULT_WORKSPACE_ROOT,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--out') {
      args.out = argv[index + 1];
      index += 1;
    } else if (arg === '--workspace-root') {
      args.workspaceRoot = resolve(argv[index + 1]);
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}
