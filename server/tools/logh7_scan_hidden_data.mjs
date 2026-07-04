#!/usr/bin/env node
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  LOGH7_HIDDEN_DATA_SCAN_DEFAULTS,
  defaultHiddenDataSources,
  scanHiddenDataCandidates,
  writeHiddenDataCandidates,
} from '../src/server/logh7-hidden-data-scan.mjs';

const DEFAULT_WORKSPACE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const args = parseArgs(process.argv.slice(2));
const sources = args.sources.length > 0
  ? args.sources
  : defaultHiddenDataSources({ repoRoot: args.workspaceRoot, workRoot: args.workRoot });
const scan = scanHiddenDataCandidates({
  sources,
  workspaceRoot: args.workspaceRoot,
});

writeHiddenDataCandidates(args.out, scan);
console.log(JSON.stringify(scan, null, 2));

if (args.requireComplete && scan.status !== 'scanned') {
  process.exitCode = 1;
}

function parseArgs(argv) {
  const args = {
    out: LOGH7_HIDDEN_DATA_SCAN_DEFAULTS.outPath,
    requireComplete: false,
    sources: [],
    workRoot: LOGH7_HIDDEN_DATA_SCAN_DEFAULTS.workRoot,
    workspaceRoot: DEFAULT_WORKSPACE_ROOT,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--out') {
      args.out = argv[index + 1];
      index += 1;
    } else if (arg === '--source') {
      args.sources.push(parseSource(argv[index + 1]));
      index += 1;
    } else if (arg === '--work-root') {
      args.workRoot = resolve(argv[index + 1] ?? '');
      index += 1;
    } else if (arg === '--workspace-root') {
      args.workspaceRoot = resolve(argv[index + 1] ?? '.');
      index += 1;
    } else if (arg === '--require-complete') {
      args.requireComplete = true;
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  return args;
}

function parseSource(value) {
  const [id, role, ...pathParts] = (value ?? '').split(':');
  const path = pathParts.join(':');
  if (!id || !role || !path) {
    throw new Error('--source must use id:role:path');
  }
  return { id, role, path: resolve(path) };
}
