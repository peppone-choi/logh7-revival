#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  loadOriginalSourceProvenance,
  verifyLocalOriginalFiles,
} from '../src/server/logh7-source-provenance.mjs';

const DEFAULT_ARTIFACT_ROOT = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'artifacts',
  'logh7-cd',
);

const artifactRoot = parseArtifactRoot(process.argv.slice(2));
const provenance = loadOriginalSourceProvenance();

if (!existsSync(artifactRoot)) {
  console.log(JSON.stringify({
    ok: false,
    reason: 'artifact-root-missing',
    artifactRoot,
    expectedFiles: provenance.files.map((file) => file.name),
  }, null, 2));
  process.exitCode = 1;
} else {
  const files = verifyLocalOriginalFiles({ artifactRoot, provenance });
  const ok = files.every((file) => file.ok);
  console.log(JSON.stringify({ ok, artifactRoot, files }, null, 2));
  process.exitCode = ok ? 0 : 1;
}

function parseArtifactRoot(args) {
  const flagIndex = args.indexOf('--artifact-root');
  if (flagIndex !== -1) {
    return resolve(args[flagIndex + 1] ?? DEFAULT_ARTIFACT_ROOT);
  }
  return resolve(args[0] ?? DEFAULT_ARTIFACT_ROOT);
}
