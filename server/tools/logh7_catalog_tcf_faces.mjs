#!/usr/bin/env node
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { catalogTcfFaceDirectory, writeTcfFaceCatalog } from '../src/server/logh7-tcf-catalog.mjs';

const DEFAULT_WORKSPACE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = parseArgs(process.argv.slice(2));
const catalog = catalogTcfFaceDirectory({ faceRoot: args.faceRoot, workspaceRoot: args.workspaceRoot });

if (args.out) {
  writeTcfFaceCatalog(args.out, catalog);
}
console.log(JSON.stringify(catalog, null, 2));

if (args.requirePresent && catalog.status !== 'present') {
  process.exitCode = 1;
}

function parseArgs(argv) {
  const args = {
    faceRoot: undefined,
    out: undefined,
    requirePresent: false,
    workspaceRoot: DEFAULT_WORKSPACE_ROOT,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--face-root') {
      args.faceRoot = resolve(argv[index + 1] ?? '');
      index += 1;
    } else if (arg === '--out') {
      args.out = argv[index + 1];
      index += 1;
    } else if (arg === '--require-present') {
      args.requirePresent = true;
    } else if (arg === '--workspace-root') {
      args.workspaceRoot = resolve(argv[index + 1] ?? '.');
      index += 1;
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  return args;
}
