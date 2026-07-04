#!/usr/bin/env node
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  LOGH7_RECORD_CANDIDATE_SCAN_DEFAULTS,
  scanRecordCandidates,
  writeRecordCandidateScan,
} from '../src/server/logh7-record-candidate-scan.mjs';

const DEFAULT_WORKSPACE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const args = parseArgs(process.argv.slice(2));
const scan = scanRecordCandidates({
  sourceRoots: args.sourceRoots,
  workspaceRoot: args.workspaceRoot,
  maxFileBytes: args.maxFileBytes,
});

writeRecordCandidateScan(args.out, scan);
console.log(JSON.stringify(scan, null, 2));

if (args.requireScanned && scan.status !== 'scanned') {
  process.exitCode = 1;
}

function parseArgs(argv) {
  const args = {
    out: LOGH7_RECORD_CANDIDATE_SCAN_DEFAULTS.outPath,
    sourceRoots: LOGH7_RECORD_CANDIDATE_SCAN_DEFAULTS.sourceRoots,
    workspaceRoot: DEFAULT_WORKSPACE_ROOT,
    maxFileBytes: 8 * 1024 * 1024,
    requireScanned: false,
  };
  const sourceRoots = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--out') {
      args.out = argv[index + 1];
      index += 1;
    } else if (arg === '--workspace-root') {
      args.workspaceRoot = resolve(argv[index + 1]);
      index += 1;
    } else if (arg === '--source-root') {
      sourceRoots.push(parseSourceRoot(argv[index + 1], sourceRoots.length));
      index += 1;
    } else if (arg === '--max-file-bytes') {
      args.maxFileBytes = Number(argv[index + 1]);
      index += 1;
    } else if (arg === '--require-scanned') {
      args.requireScanned = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (sourceRoots.length > 0) args.sourceRoots = sourceRoots;
  return args;
}

function parseSourceRoot(value, index) {
  const [id, role, path] = value.split(':');
  if (!id || !role || !path) {
    throw new Error('--source-root must be id:role:path');
  }
  return {
    id,
    role,
    path,
  };
}
