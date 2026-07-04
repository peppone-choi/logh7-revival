#!/usr/bin/env node
import { join, resolve } from 'node:path';

import {
  buildStrategyCommandCatalog,
  loadManualStrategyCommands,
  writeStrategyCommandCatalog,
} from '../src/server/logh7-strategy-command-catalog.mjs';

const args = parseArgs(process.argv.slice(2));
const manual = loadManualStrategyCommands(args.manual);
const catalog = buildStrategyCommandCatalog({ manual, manualPath: args.manualPathLabel });

if (args.out) {
  writeStrategyCommandCatalog(args.out, catalog);
}
console.log(JSON.stringify(catalog, null, 2));

function parseArgs(argv) {
  const args = {
    manual: join(import.meta.dirname, '..', 'content', 'manual', 'strategy-commands.json'),
    manualPathLabel: 'server/content/manual/strategy-commands.json',
    out: undefined,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--manual') {
      args.manual = resolve(argv[index + 1] ?? '');
      args.manualPathLabel = argv[index + 1] ?? args.manualPathLabel;
      index += 1;
    } else if (arg === '--out') {
      args.out = argv[index + 1];
      index += 1;
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  return args;
}
