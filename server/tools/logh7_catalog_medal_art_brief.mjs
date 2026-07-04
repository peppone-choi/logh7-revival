#!/usr/bin/env node
import { join } from 'node:path';

import {
  buildMedalArtBrief,
  writeMedalArtBrief,
} from '../src/server/logh7-medal-art-brief.mjs';

const args = parseArgs(process.argv.slice(2));
const brief = buildMedalArtBrief();

if (args.out) {
  writeMedalArtBrief(args.out, brief);
} else {
  console.log(JSON.stringify(brief, null, 2));
}

function parseArgs(argv) {
  const args = {
    out: undefined,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--out') {
      args.out = argv[index + 1] ?? join('content', 'generated', 'logh7-medal-art-brief.json');
      index += 1;
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }

  return args;
}
