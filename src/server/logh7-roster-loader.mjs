/**
 * Roster loader — fills the canon character roster from DATA files, not code.
 *
 * The client/CD has NO character roster or stats (exhaustively verified: the archive.org item is a
 * single client CD, all game-state data was server-side and is lost — logh7-client-data-map). So
 * canon stats must be SOURCED (prior LOGH strategy games IV/V/VI + series/community databases) and
 * dropped in as roster JSON. This loader ingests that JSON and registers it, so adding the full
 * named cast is "provide the data file", never "write more code".
 *
 * Roster JSON shape: { "characters": [ { id, name, nationId, rank, command, tactics, operations,
 * portraitIndex }, ... ] }. Each record overrides/extends the canon roster (logh7-character-gen).
 */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { registerCanon } from './logh7-character-gen.mjs';

/** Validate + register an array of sourced roster records. Returns the new total canon size. */
export function loadRosterRecords(records) {
  if (!Array.isArray(records)) {
    throw new Error('roster records must be an array');
  }
  for (const r of records) {
    if (!r || !Number.isInteger(r.id)) {
      throw new Error(`roster record missing integer id: ${JSON.stringify(r)}`);
    }
  }
  return registerCanon(records);
}

/** Parse roster JSON text ({characters:[...]} or a bare array) and register it. */
export function loadRosterJson(text) {
  const data = JSON.parse(text);
  const records = Array.isArray(data) ? data : (data.characters ?? []);
  return loadRosterRecords(records);
}

/** Load one roster JSON file from disk and register it. */
export function loadRosterFile(filePath) {
  return loadRosterJson(readFileSync(filePath, 'utf8'));
}

/**
 * Load every legacy-format roster file in a directory (sorted), registering all. Returns {files,
 * total}. Legacy roster files are an array (or {characters:[...]}) of records each with an integer
 * `id`; newer name-keyed content files (characters.json, manual-roster.json) feed the content DB
 * (logh7-content-db) instead and are skipped here.
 */
export function loadRosterDir(dirPath) {
  let entries = [];
  try {
    entries = readdirSync(dirPath).filter((f) => f.toLowerCase().endsWith('.json')).sort();
  } catch {
    return { files: [], total: 0 };
  }
  const files = [];
  let total = 0;
  for (const f of entries) {
    const data = JSON.parse(readFileSync(path.join(dirPath, f), 'utf8'));
    const records = Array.isArray(data) ? data : (data.characters ?? null);
    if (!Array.isArray(records) || records.length === 0 || !records.every((r) => r && Number.isInteger(r.id))) {
      continue; // not a legacy id-keyed roster file
    }
    total = loadRosterRecords(records);
    files.push(f);
  }
  return { files, total };
}
