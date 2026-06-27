#!/usr/bin/env node
/**
 * Validate a mods directory against the base content pack + the RE'd client caps BEFORE serving it —
 * the modder's pre-flight check (our equivalent of Paradox's error.log, but proactive). Exits non-zero
 * if any mod would exceed a client cap (which would bail the client parser).
 *
 * Usage: node tools/logh7_validate_mod.mjs [modsDir]   (default: mods)
 */
import { readModsDir, applyModPacks } from '../src/server/logh7-mod-loader.mjs';
import { CANON_CONTENT } from '../src/server/logh7-canon-content.mjs';

const dir = process.argv[2] ?? 'mods';
const packs = readModsDir(dir);
const { appliedMods, validation, conflicts } = applyModPacks(CANON_CONTENT, packs);

console.log(`mods dir   : ${dir}`);
console.log(`packs      : ${packs.map((p) => `${p.name}${p.enabled === false ? '(disabled)' : ''}`).join(', ') || '(none)'}`);
console.log(`applied    : ${appliedMods.join(', ') || '(none)'}`);
for (const c of conflicts) console.log(`  conflict : ${c}`);
for (const w of validation.warnings) console.log(`  warning  : ${w}`);
for (const e of validation.errors) console.log(`  ERROR    : ${e}`);
console.log(validation.ok ? 'RESULT: VALID — safe to serve (LOGH_MODS_DIR=' + dir + ')' : 'RESULT: INVALID — would bail the client; fix the errors above');
process.exit(validation.ok ? 0 : 1);
