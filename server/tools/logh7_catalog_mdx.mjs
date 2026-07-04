#!/usr/bin/env node
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { catalogMdxDirectory, writeMdxCatalog } from '../src/server/logh7-mdx-catalog.mjs';

const DEFAULT_WORKSPACE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const args = parseArgs(process.argv.slice(2));
const catalog = catalogMdxDirectory({ mdxRoot: args.mdxRoot, workspaceRoot: args.workspaceRoot });

if (args.out) {
  writeMdxCatalog(args.out, catalog);
}
console.log(JSON.stringify(catalog, null, 2));

if (args.requirePresent && catalog.status !== 'present') {
  process.exitCode = 1;
}

function parseArgs(argv) {
  const args = {
    mdxRoot: undefined,
    out: undefined,
    requirePresent: false,
    workspaceRoot: DEFAULT_WORKSPACE_ROOT,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--mdx-root') {
      args.mdxRoot = resolve(argv[index + 1] ?? '');
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
