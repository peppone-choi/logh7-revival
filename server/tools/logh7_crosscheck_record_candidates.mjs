#!/usr/bin/env node
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  LOGH7_RECORD_CANDIDATE_CROSSCHECK_DEFAULTS,
  crossCheckRecordCandidates,
  loadGalaxy,
  loadRecordCandidateScan,
  writeRecordCandidateCrossCheck,
} from '../src/server/logh7-record-candidate-crosscheck.mjs';

const DEFAULT_WORKSPACE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const args = parseArgs(process.argv.slice(2));
const crossCheck = crossCheckRecordCandidates({
  recordScan: loadRecordCandidateScan(args.recordScanPath),
  galaxy: loadGalaxy(args.galaxyPath),
  workspaceRoot: args.workspaceRoot,
});

writeRecordCandidateCrossCheck(args.out, crossCheck);
console.log(JSON.stringify(crossCheck, null, 2));

if (args.requireChecked && crossCheck.status !== 'checked') {
  process.exitCode = 1;
}

function parseArgs(argv) {
  const args = {
    recordScanPath: LOGH7_RECORD_CANDIDATE_CROSSCHECK_DEFAULTS.recordScanPath,
    galaxyPath: LOGH7_RECORD_CANDIDATE_CROSSCHECK_DEFAULTS.galaxyPath,
    out: LOGH7_RECORD_CANDIDATE_CROSSCHECK_DEFAULTS.outPath,
    workspaceRoot: DEFAULT_WORKSPACE_ROOT,
    requireChecked: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--record-scan') {
      args.recordScanPath = argv[index + 1];
      index += 1;
    } else if (arg === '--galaxy') {
      args.galaxyPath = argv[index + 1];
      index += 1;
    } else if (arg === '--out') {
      args.out = argv[index + 1];
      index += 1;
    } else if (arg === '--workspace-root') {
      args.workspaceRoot = resolve(argv[index + 1]);
      index += 1;
    } else if (arg === '--require-checked') {
      args.requireChecked = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}
