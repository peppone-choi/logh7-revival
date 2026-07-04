#!/usr/bin/env node
import { join, resolve } from 'node:path';

import {
  buildRankPromotionCatalog,
  loadRanksPromotionManual,
  writeRankPromotionCatalog,
} from '../src/server/logh7-rank-promotion-catalog.mjs';

const args = parseArgs(process.argv.slice(2));
const manual = loadRanksPromotionManual(args.manual);
const catalog = buildRankPromotionCatalog({ manual, manualPath: args.manualPathLabel });

if (args.out) {
  writeRankPromotionCatalog(args.out, catalog);
} else {
  console.log(JSON.stringify(catalog, null, 2));
}

function parseArgs(argv) {
  const args = {
    manual: join(import.meta.dirname, '..', 'content', 'manual', 'ranks-promotion.json'),
    manualPathLabel: 'server/content/manual/ranks-promotion.json',
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
