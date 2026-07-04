#!/usr/bin/env node
import { resolve } from 'node:path';

import {
  buildNullGalaxyTemplate,
  loadMdxCatalog,
  writeNullGalaxyTemplate,
} from '../src/server/logh7-null-galaxy-template.mjs';

const args = parseArgs(process.argv.slice(2));
const template = buildNullGalaxyTemplate({ catalog: loadMdxCatalog(args.catalog) });

if (args.out) {
  writeNullGalaxyTemplate(args.out, template);
}
console.log(JSON.stringify(template, null, 2));

if (args.requireStars && template.starCount === 0) {
  process.exitCode = 1;
}

function parseArgs(argv) {
  const args = {
    catalog: undefined,
    out: undefined,
    requireStars: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--catalog') {
      args.catalog = resolve(argv[index + 1] ?? '');
      index += 1;
    } else if (arg === '--out') {
      args.out = argv[index + 1];
      index += 1;
    } else if (arg === '--require-stars') {
      args.requireStars = true;
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  return args;
}
