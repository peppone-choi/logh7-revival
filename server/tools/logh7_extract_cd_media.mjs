#!/usr/bin/env node
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  LOGH7_CD_MEDIA_DEFAULTS,
  extractCdMedia,
} from '../src/server/logh7-cd-media.mjs';

const DEFAULT_WORKSPACE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const args = parseArgs(process.argv.slice(2));
const manifest = extractCdMedia({
  generatedManifestPath: args.out,
  mediaRoot: args.mediaRoot,
  workRoot: args.workRoot,
  workspaceRoot: args.workspaceRoot,
});

console.log(JSON.stringify(manifest, null, 2));

if (args.requireVerified && manifest.media.status !== 'verified') {
  process.exitCode = 1;
}

function parseArgs(argv) {
  const args = {
    mediaRoot: LOGH7_CD_MEDIA_DEFAULTS.mediaRoot,
    out: LOGH7_CD_MEDIA_DEFAULTS.generatedManifestPath,
    requireVerified: false,
    workRoot: LOGH7_CD_MEDIA_DEFAULTS.workRoot,
    workspaceRoot: DEFAULT_WORKSPACE_ROOT,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--media-root') {
      args.mediaRoot = resolve(argv[index + 1] ?? '');
      index += 1;
    } else if (arg === '--work-root') {
      args.workRoot = resolve(argv[index + 1] ?? '');
      index += 1;
    } else if (arg === '--workspace-root') {
      args.workspaceRoot = resolve(argv[index + 1] ?? '.');
      index += 1;
    } else if (arg === '--out') {
      args.out = argv[index + 1];
      index += 1;
    } else if (arg === '--require-verified') {
      args.requireVerified = true;
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  return args;
}
