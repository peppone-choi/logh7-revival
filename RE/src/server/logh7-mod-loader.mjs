/**
 * Mod content-pack loader (Layer A — the modding keystone).
 *
 * Layers mod content packs over the base content pack with Paradox-style semantics: ADDITIVE by default
 * (a mod entry with a NEW id is added; an entry with an EXISTING id OVERRIDES it), in load order, then
 * VALIDATES the merged pack against the RE'd client caps (logh7-content-caps) so a mod can never produce
 * data that bails the client parser. See docs/logh7-modding-architecture.md (Layer A / mod manifest).
 *
 * The core (applyModPacks) is pure and testable; readModsDir is the thin fs wrapper.
 *
 * A mod pack:
 *   { name, loadOrder?, enabled?, content: { characters?, shipClasses?, systems?, nations?, units? }, defines? }
 * The base data is the buildContentPackDataFromSource shape: { name, nations, characters, units, shipClasses, systems, ... }.
 */
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { validateContentPack } from './logh7-content-caps.mjs';

const COLLECTIONS = ['nations', 'characters', 'units', 'shipClasses', 'systems'];

/** Pick a stable identity key for a collection (most use `id`; systems may key by name). */
function idKeyFor(collection) {
  return collection === 'systems' ? 'name' : 'id';
}

/** Additive merge: override by id, append new ids; preserves base order, then appends new entries. */
export function mergeById(baseArr = [], overrideArr = [], idKey = 'id') {
  if (!Array.isArray(overrideArr) || overrideArr.length === 0) return Array.isArray(baseArr) ? baseArr.slice() : [];
  const out = Array.isArray(baseArr) ? baseArr.slice() : [];
  const indexById = new Map();
  out.forEach((e, i) => { if (e && e[idKey] != null) indexById.set(e[idKey], i); });
  for (const entry of overrideArr) {
    if (!entry || entry[idKey] == null) { out.push(entry); continue; }
    const at = indexById.get(entry[idKey]);
    if (at != null) {
      out[at] = entry.__remove ? undefined : { ...out[at], ...entry };
    } else {
      indexById.set(entry[idKey], out.length);
      out.push(entry);
    }
  }
  return out.filter((e) => e !== undefined);
}

/** Apply ONE mod pack's content onto a base data object (returns a new object; does not mutate base). */
export function applyModPack(baseData, modPack) {
  const out = { ...baseData };
  const content = modPack?.content ?? {};
  for (const col of COLLECTIONS) {
    if (content[col] !== undefined) {
      out[col] = mergeById(baseData[col], content[col], idKeyFor(col));
    }
  }
  if (modPack?.defines && typeof modPack.defines === 'object') {
    out.defines = { ...(baseData.defines ?? {}), ...modPack.defines };
  }
  out.appliedMods = [...(baseData.appliedMods ?? []), modPack?.name].filter(Boolean);
  return out;
}

/**
 * Apply a list of mod packs (in load order) over base data, then validate against client caps.
 * @returns {{ data:object, appliedMods:string[], validation:{ok:boolean,errors:string[],warnings:string[]}, conflicts:string[] }}
 */
export function applyModPacks(baseData, modPacks = [], { validate = true } = {}) {
  const ordered = [...modPacks]
    .filter((m) => m && m.enabled !== false)
    .sort((a, b) => (a.loadOrder ?? 0) - (b.loadOrder ?? 0));

  // conflict detection: two mods writing the same collection id
  const touched = new Map(); // `${col}:${id}` -> first mod name
  const conflicts = [];
  for (const m of ordered) {
    for (const col of COLLECTIONS) {
      for (const e of m?.content?.[col] ?? []) {
        const key = `${col}:${e?.[idKeyFor(col)]}`;
        if (touched.has(key) && touched.get(key) !== m.name) {
          conflicts.push(`${key} written by both "${touched.get(key)}" and "${m.name}" (load-order last wins)`);
        } else if (!touched.has(key)) {
          touched.set(key, m.name);
        }
      }
    }
  }

  let data = baseData;
  for (const m of ordered) data = applyModPack(data, m);

  const validation = validate ? validateContentPack(data) : { ok: true, errors: [], warnings: [] };
  return { data, appliedMods: data.appliedMods ?? [], validation, conflicts };
}

/** Read mods/<name>/{mod.json, content/*.json} into mod-pack objects. Thin fs wrapper. */
export function readModsDir(modsDir) {
  if (!existsSync(modsDir)) return [];
  const packs = [];
  for (const name of readdirSync(modsDir)) {
    const dir = join(modsDir, name);
    if (!statSync(dir).isDirectory()) continue;
    const manifestPath = join(dir, 'mod.json');
    const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : { name };
    const content = {};
    const contentDir = join(dir, 'content');
    if (existsSync(contentDir)) {
      for (const f of readdirSync(contentDir)) {
        if (!f.endsWith('.json')) continue;
        const col = f.replace(/\.json$/, ''); // characters.json -> characters
        try {
          const parsed = JSON.parse(readFileSync(join(contentDir, f), 'utf8'));
          content[col] = Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.[col]) ? parsed[col] : parsed?.entries ?? []);
        } catch { /* skip malformed */ }
      }
    }
    packs.push({
      name: manifest.name ?? name,
      loadOrder: manifest.loadOrder ?? 0,
      enabled: manifest.enabled !== false,
      defines: manifest.defines,
      content,
    });
  }
  return packs;
}

/** Convenience: load mods from a dir and apply+validate over base data. */
export function loadMods(baseData, modsDir, opts = {}) {
  return applyModPacks(baseData, readModsDir(modsDir), opts);
}
