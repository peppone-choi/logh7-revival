#!/usr/bin/env node
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  LOGH7_UNITY_BOOTSTRAP_MANIFEST_DEFAULTS,
  buildUnityBootstrapManifest,
  writeUnityBootstrapManifest,
} from '../src/server/logh7-unity-bootstrap-manifest.mjs';

const DEFAULT_WORKSPACE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const args = parseArgs(process.argv.slice(2));
const manifest = buildUnityBootstrapManifest({ workspaceRoot: args.workspaceRoot });
writeUnityBootstrapManifest({
  outPath: args.out,
  unityOutPath: args.unityOut,
  manifest,
});

console.log(JSON.stringify(manifest, null, 2));

function parseArgs(argv) {
  const args = {
    out: LOGH7_UNITY_BOOTSTRAP_MANIFEST_DEFAULTS.outPath,
    unityOut: LOGH7_UNITY_BOOTSTRAP_MANIFEST_DEFAULTS.unityOutPath,
    workspaceRoot: DEFAULT_WORKSPACE_ROOT,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--out') {
      args.out = argv[index + 1];
      index += 1;
    } else if (arg === '--unity-out') {
      args.unityOut = argv[index + 1];
      index += 1;
    } else if (arg === '--workspace-root') {
      args.workspaceRoot = resolve(argv[index + 1]);
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}
