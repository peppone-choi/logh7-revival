#!/usr/bin/env node
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  LOGH7_HIDDEN_DATA_WATCHLIST_DEFAULTS,
  buildHiddenDataWatchlist,
  loadHiddenDataClassification,
  writeHiddenDataWatchlist,
} from '../src/server/logh7-hidden-data-watchlist.mjs';

const DEFAULT_WORKSPACE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const args = parseArgs(process.argv.slice(2));
const classification = loadHiddenDataClassification(args.inPath);
const watchlist = buildHiddenDataWatchlist({
  classification,
  workspaceRoot: args.workspaceRoot,
  maxExamples: args.maxExamples,
});

writeHiddenDataWatchlist(args.out, watchlist);
console.log(JSON.stringify(watchlist, null, 2));

if (args.requireReport && watchlist.summary.mustReportCategoryIds.length === 0) {
  process.exitCode = 1;
}

function parseArgs(argv) {
  const args = {
    inPath: LOGH7_HIDDEN_DATA_WATCHLIST_DEFAULTS.inPath,
    out: LOGH7_HIDDEN_DATA_WATCHLIST_DEFAULTS.outPath,
    maxExamples: 20,
    requireReport: false,
    workspaceRoot: DEFAULT_WORKSPACE_ROOT,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--in') {
      args.inPath = argv[index + 1];
      index += 1;
    } else if (arg === '--out') {
      args.out = argv[index + 1];
      index += 1;
    } else if (arg === '--workspace-root') {
      args.workspaceRoot = resolve(argv[index + 1]);
      index += 1;
    } else if (arg === '--max-examples') {
      args.maxExamples = Number(argv[index + 1]);
      index += 1;
    } else if (arg === '--require-report') {
      args.requireReport = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}
