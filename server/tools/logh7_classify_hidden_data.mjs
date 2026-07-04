#!/usr/bin/env node
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  LOGH7_HIDDEN_DATA_CLASSIFICATION_DEFAULTS,
  classifyHiddenDataCandidates,
  loadHiddenDataCandidates,
  writeHiddenDataClassification,
} from '../src/server/logh7-hidden-data-classification.mjs';

const DEFAULT_WORKSPACE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const args = parseArgs(process.argv.slice(2));
const manifest = loadHiddenDataCandidates(args.inPath);
const classification = classifyHiddenDataCandidates({
  manifest,
  workspaceRoot: args.workspaceRoot,
});

writeHiddenDataClassification(args.out, classification);
console.log(JSON.stringify(classification, null, 2));

if (args.requireClassified && classification.status !== 'classified') {
  process.exitCode = 1;
}

function parseArgs(argv) {
  const args = {
    inPath: LOGH7_HIDDEN_DATA_CLASSIFICATION_DEFAULTS.inPath,
    out: LOGH7_HIDDEN_DATA_CLASSIFICATION_DEFAULTS.outPath,
    requireClassified: false,
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
      args.workspaceRoot = resolve(argv[index + 1] ?? '.');
      index += 1;
    } else if (arg === '--require-classified') {
      args.requireClassified = true;
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  return args;
}
