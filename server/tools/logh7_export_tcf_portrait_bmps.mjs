#!/usr/bin/env node

import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync } from 'node:fs';

import {
  catalogTcfPortraitDirectory,
  exportTcfPortraitBmps,
} from '../src/server/logh7-tcf-portrait-catalog.mjs';

const DEFAULT_WORKSPACE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const args = parseArgs(process.argv.slice(2));
const catalog = catalogTcfPortraitDirectory({
  faceRoot: args.faceRoot,
  workspaceRoot: args.workspaceRoot,
});

const manifest = exportTcfPortraitBmps({
  catalog,
  faceRoot: args.faceRoot,
  limitPerArchive: args.all ? null : args.limitPerArchive,
  outDir: args.outDir,
  workspaceRoot: args.workspaceRoot,
});

if (args.manifest) {
  writeFileSync(args.manifest, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}

console.log(JSON.stringify(manifest, null, 2));

function parseArgs(argv) {
  const args = {
    all: false,
    faceRoot: undefined,
    limitPerArchive: 3,
    manifest: undefined,
    outDir: undefined,
    workspaceRoot: DEFAULT_WORKSPACE_ROOT,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--all') {
      args.all = true;
    } else if (arg === '--face-root') {
      args.faceRoot = resolve(argv[index + 1] ?? '');
      index += 1;
    } else if (arg === '--limit-per-archive') {
      args.limitPerArchive = Number.parseInt(argv[index + 1] ?? '', 10);
      index += 1;
    } else if (arg === '--manifest') {
      args.manifest = argv[index + 1];
      index += 1;
    } else if (arg === '--out-dir') {
      args.outDir = argv[index + 1];
      index += 1;
    } else if (arg === '--workspace-root') {
      args.workspaceRoot = resolve(argv[index + 1] ?? '.');
      index += 1;
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }

  if (!args.outDir) {
    throw new Error('--out-dir is required');
  }
  if (!Number.isInteger(args.limitPerArchive) || args.limitPerArchive < 0) {
    throw new Error('--limit-per-archive must be a non-negative integer');
  }

  return args;
}
