#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { buildLedger } from './index.mjs';

const args = process.argv.slice(2);
const value = (name, fallback) => {
  const index = args.indexOf(name);
  return index < 0 ? fallback : args[index + 1];
};

const repoRoot = resolve(value('--repo-root', resolve(import.meta.dirname, '..', '..')));
const outDir = resolve(value('--out-dir', resolve(import.meta.dirname, 'generated')));

try {
  const { ledgerBytes, reportBytes } = await buildLedger(repoRoot);
  await mkdir(outDir, { recursive: true });
  await Promise.all([
    writeFile(resolve(outDir, 'ledger.json'), ledgerBytes, 'utf8'),
    writeFile(resolve(outDir, 'import-report.json'), reportBytes, 'utf8'),
  ]);
  process.stdout.write(`${outDir}\n`);
} catch (error) {
  if (error?.code === 'ERR_CAUSAL_LEDGER_SCHEMA') {
    process.stderr.write(`${JSON.stringify({ code: error.code, details: error.details })}\n`);
    process.exitCode = 2;
  } else {
    throw error;
  }
}
