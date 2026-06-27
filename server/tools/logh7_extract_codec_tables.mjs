// Extract the immutable child-codec static tables from an explicit client EXE.
// This is a maintenance tool for regenerating content/crypto/child-codec-tables.json;
// the standalone server runtime uses the committed JSON and does not need a client EXE.
//
// Usage:
//   node tools/logh7_extract_codec_tables.mjs <G7MTClient.exe> [--out content/crypto/child-codec-tables.json]

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  extractChildCodecStaticTables,
  serializeChildCodecTables,
  DEFAULT_CODEC_TABLES_PATH,
} from '../src/server/logh7-codec.mjs';

function parseArgs(argv) {
  const positional = [];
  let out = DEFAULT_CODEC_TABLES_PATH;
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--out') {
      out = argv[index + 1];
      index += 1;
    } else {
      positional.push(value);
    }
  }
  return { exe: positional[0] ?? null, out };
}

const { exe, out } = parseArgs(process.argv.slice(2));
if (!exe) {
  console.error('usage: node tools/logh7_extract_codec_tables.mjs <G7MTClient.exe> [--out <json>]');
  process.exitCode = 2;
} else {
  const exePath = path.resolve(exe);
  if (!existsSync(exePath)) {
    console.error(`client EXE not found: ${exePath}`);
    process.exitCode = 2;
  } else {
    const tables = extractChildCodecStaticTables(exePath);
    const json = serializeChildCodecTables(tables);
    mkdirSync(path.dirname(out), { recursive: true });
    writeFileSync(out, `${JSON.stringify(json, null, 1)}\n`, 'utf8');
    console.log(`child-codec tables written: ${out} (pArray ${tables.pArray.length}, sBoxes ${tables.sBoxes.length}x${tables.sBoxes[0].length})`);
  }
}
