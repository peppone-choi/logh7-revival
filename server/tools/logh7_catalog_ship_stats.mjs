#!/usr/bin/env node
import { join, resolve } from 'node:path';

import {
  buildShipStatCatalog,
  loadShipStats,
  writeShipStatCatalog,
} from '../src/server/logh7-ship-stat-catalog.mjs';

const args = parseArgs(process.argv.slice(2));
const normalized = loadShipStats(args.stats);
const catalog = buildShipStatCatalog({ normalized, normalizedPath: args.statsPathLabel });

if (args.out) {
  writeShipStatCatalog(args.out, catalog);
}

console.log(JSON.stringify(catalog, null, 2));

function parseArgs(argv) {
  const args = {
    stats: join(import.meta.dirname, '..', 'content', 'ship-stats.json'),
    statsPathLabel: 'server/content/ship-stats.json',
    out: undefined,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--stats') {
      args.stats = resolve(argv[index + 1] ?? '');
      args.statsPathLabel = argv[index + 1] ?? args.statsPathLabel;
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
