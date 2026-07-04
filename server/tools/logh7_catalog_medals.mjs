#!/usr/bin/env node
import { join, resolve } from 'node:path';

import {
  buildMedalMiningCatalog,
  loadLocalizedDatTables,
  loadMedalRoster,
  loadMsgDat,
  writeMedalMiningCatalog,
} from '../src/server/logh7-medal-catalog.mjs';

const args = parseArgs(process.argv.slice(2));
const catalog = buildMedalMiningCatalog({
  roster: loadMedalRoster(args.roster),
  msgdat: loadMsgDat(args.msgdat),
  localizedDatTables: loadLocalizedDatTables(args.localizedDatTables),
  installedMedalDir: args.installedMedalDir,
  emblemReferencePath: args.emblemReference,
  rosterPath: args.rosterLabel,
  msgdatPath: args.msgdatLabel,
  localizedDatTablesPath: args.localizedDatTablesLabel,
  installedMedalDirLabel: args.installedMedalDirLabel,
  emblemReferencePathLabel: args.emblemReferenceLabel,
});

if (args.out) {
  writeMedalMiningCatalog(args.out, catalog);
} else {
  console.log(JSON.stringify(catalog, null, 2));
}

function parseArgs(argv) {
  const args = {
    roster: join(import.meta.dirname, '..', 'content', 'roster', 'medals.json'),
    msgdat: join(import.meta.dirname, '..', 'content', 'client', 'msgdat.json'),
    localizedDatTables: join(import.meta.dirname, '..', 'content', 'extracted', 'dat-tables.json'),
    installedMedalDir: join(
      import.meta.dirname,
      '..',
      '..',
      '.omo',
      'work',
      'logh7-installed',
      'data',
      'image',
      'Medal',
    ),
    emblemReference: join(
      import.meta.dirname,
      '..',
      '..',
      'client-unity',
      'Assets',
      'ArtSource',
      'reference',
      'logh7-imperial-double-eagle-reference.jpg',
    ),
    rosterLabel: 'server/content/roster/medals.json',
    msgdatLabel: 'server/content/client/msgdat.json',
    localizedDatTablesLabel: 'server/content/extracted/dat-tables.json',
    installedMedalDirLabel: '.omo/work/logh7-installed/data/image/Medal',
    emblemReferenceLabel:
      'client-unity/Assets/ArtSource/reference/logh7-imperial-double-eagle-reference.jpg',
    out: undefined,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--roster') {
      args.roster = resolve(argv[index + 1] ?? '');
      args.rosterLabel = argv[index + 1] ?? args.rosterLabel;
      index += 1;
    } else if (arg === '--msgdat') {
      args.msgdat = resolve(argv[index + 1] ?? '');
      args.msgdatLabel = argv[index + 1] ?? args.msgdatLabel;
      index += 1;
    } else if (arg === '--localized-dat-tables') {
      args.localizedDatTables = resolve(argv[index + 1] ?? '');
      args.localizedDatTablesLabel = argv[index + 1] ?? args.localizedDatTablesLabel;
      index += 1;
    } else if (arg === '--installed-medal-dir') {
      args.installedMedalDir = resolve(argv[index + 1] ?? '');
      args.installedMedalDirLabel = argv[index + 1] ?? args.installedMedalDirLabel;
      index += 1;
    } else if (arg === '--emblem-reference') {
      args.emblemReference = resolve(argv[index + 1] ?? '');
      args.emblemReferenceLabel = argv[index + 1] ?? args.emblemReferenceLabel;
      index += 1;
    } else if (arg === '--out') {
      args.out = argv[index + 1];
      index += 1;
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }

  return args;
}
