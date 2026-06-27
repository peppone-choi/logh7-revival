/**
 * RANK TABLE — a tiny, self-contained accessor over content/roster/ranks.json (the canon 銀河英雄伝説Ⅶ
 * military rank ladder, 28 rungs = empire 14 + alliance 14). PURE read model: it loads the JSON once and
 * exposes name/id lookups in both directions. No wire framing, no mutation, no imports from the hot-path
 * modules — so it can be wired into login-protocol.mjs's 0x0323 character-record builder without touching
 * any existing file.
 *
 * WHY (faction): `id` is the wire value written to the character record's `rank` field (u16 @0xd6 per
 * docs/logh7-info-records-wire.md — parentage[0] base 0x80, rel. +0x56) AND it feeds `titlename` @0xd8.
 * `id` is faction-LOCAL: id=14 is 元帥/Marshal in BOTH ladders, but id=1 differs (Empire 兵長 vs Alliance
 * 軍曹), and the Empire has a rung (上級大将) the Alliance lacks. So every lookup MUST be keyed by
 * (faction, id); higher id = more senior (a `>=` compare gives seniority). RANK_MAX = 14 (top rung).
 *
 * SOURCE: content/roster/ranks.json `ranks[]`, each { id, faction, name_ja, name_ko, name_en }. faction
 * is "empire" | "alliance". Lookups normalise faction case-insensitively and accept a couple of common
 * aliases (帝国/imperial → empire, 同盟/free planets → alliance) so callers that hold a Japanese/loose
 * faction tag still resolve. lang is one of 'ja' | 'ko' | 'en' (default 'ja', matching the canon record).
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const RANKS_JSON = join(HERE, '..', '..', 'content', 'roster', 'ranks.json');

/** Top (most senior) rung id; ladders are 1..14 with 14 = 元帥/Marshal. */
export const RANK_MAX = 14;

/** Canonical faction keys used in ranks.json. */
export const RANK_FACTIONS = Object.freeze(['empire', 'alliance']);

/** Supported name languages → the ranks.json field that holds them. */
const LANG_FIELD = Object.freeze({ ja: 'name_ja', ko: 'name_ko', en: 'name_en' });

// 느슨한 영문 계급명 → 캐논 name_ja(진영 공유)로의 별칭. 로스터/외부 데이터가 캐논 정식 name_en
// ('First Lieutenant' 등)이 아닌 통칭('Lieutenant')을 쓰는 경우를 흡수한다. rankId가 직접 매칭에 실패하면
// 이 별칭으로 재시도(name_ja는 양 진영 사다리에서 동일 표기라 진영 무관하게 안전).
const RANK_NAME_ALIASES = Object.freeze({
  lieutenant: '中尉', // 中尉(First Lieutenant, id 5)
  'first lieutenant': '中尉',
  'sub lieutenant': '少尉', // 少尉(Ensign, id 4)
  '2nd lieutenant': '少尉',
  'second lieutenant': '少尉',
  'lieutenant commander': '少佐', // 少佐(Lt. Commander, id 7)
  'lt commander': '少佐',
  'lt. commander': '少佐',
});

/**
 * Normalise a loose faction tag to the canonical "empire" | "alliance" key, or null if unknown.
 * Accepts case-insensitive English plus the obvious JP/canon aliases so a caller holding 帝国/同盟 or
 * "imperial"/"free planets" still resolves to the right ladder.
 * @param {string|number|null|undefined} faction
 * @returns {('empire'|'alliance')|null}
 */
export function normalizeFaction(faction) {
  if (faction == null) return null;
  const f = String(faction).trim().toLowerCase();
  if (f === 'empire' || f === 'imperial' || f === '帝国' || f === '제국' || f === '0') return 'empire';
  if (
    f === 'alliance' || f === 'fpa' || f === 'free planets' || f === 'free planets alliance'
    || f === '同盟' || f === '동맹' || f === '1'
  ) return 'alliance';
  return null;
}

let CACHE = null; // { byKey: Map<"faction:id", record>, byName: Map<lowername, {id,faction}>, ranks: [] }

/**
 * Load (and memoise) the rank table from content/roster/ranks.json. Returns a frozen view:
 *   { ranks, byKey, byName, get(faction,id), max }
 * `byKey` maps `${faction}:${id}` → the full record; `byName` maps a lowercased name (ja/ko/en) →
 * { id, faction } for reverse lookup. The same object is returned on subsequent calls (idempotent);
 * pass { reload: true } to re-read the file (tests / hot-reload).
 *
 * @param {{ reload?: boolean }} [opts]
 * @returns {{
 *   ranks: Array<{ id:number, faction:string, name_ja:string, name_ko:string, name_en:string }>,
 *   byKey: Map<string, object>,
 *   byName: Map<string, { id:number, faction:string }>,
 *   max: number,
 *   get(faction:string, id:number): object|null,
 * }}
 */
export function loadRankTable({ reload = false } = {}) {
  if (CACHE && !reload) return CACHE;

  const raw = JSON.parse(readFileSync(RANKS_JSON, 'utf8'));
  const ranks = Array.isArray(raw?.ranks) ? raw.ranks : [];

  const byKey = new Map();
  const byName = new Map();
  for (const r of ranks) {
    const faction = normalizeFaction(r.faction) ?? String(r.faction);
    byKey.set(`${faction}:${r.id}`, r);
    // reverse map: every localized spelling points back at {id, faction}. First writer wins on a
    // cross-faction name collision (e.g. 元帥/Marshal exists in both ladders); rankId() resolves
    // such ambiguity deterministically (see rankId()).
    for (const field of Object.values(LANG_FIELD)) {
      const name = r[field];
      if (name == null) continue;
      const key = String(name).trim().toLowerCase();
      if (!byName.has(key)) byName.set(key, { id: r.id, faction });
    }
  }

  CACHE = Object.freeze({
    ranks,
    byKey,
    byName,
    max: RANK_MAX,
    get(faction, id) {
      return byKey.get(`${normalizeFaction(faction) ?? String(faction)}:${Number(id)}`) ?? null;
    },
  });
  return CACHE;
}

/**
 * Resolve a rank's display name for a given (id, faction, lang). Returns '' when the (faction, id) pair
 * is not in the ladder (e.g. id out of 1..14, or unknown faction) so a caller can write a length-0
 * titlename without a guard.
 *
 * @param {{ id:number, faction:string, lang?:('ja'|'ko'|'en') }} args
 * @returns {string} the localized rank name, or '' if not found.
 */
export function rankName({ id, faction, lang = 'ja' } = {}) {
  const table = loadRankTable();
  const rec = table.get(faction, id);
  if (!rec) return '';
  const field = LANG_FIELD[lang] ?? LANG_FIELD.ja;
  return String(rec[field] ?? '');
}

/**
 * Reverse lookup: given a rank name in ANY of the three languages, return { id, faction }, or null if
 * the name is not a known rank. Because some names exist in BOTH ladders (元帥/Marshal at id 14, plus
 * several佐/尉 rungs whose names coincide), an OPTIONAL `faction` hint disambiguates: when supplied we
 * search only that ladder; without it the first ladder-order match wins (empire is loaded first), which
 * is deterministic and stable across calls.
 *
 * @param {string} name a rank name (name_ja | name_ko | name_en), trimmed/case-insensitive.
 * @param {{ faction?: string }} [opts] optional faction hint to disambiguate shared names.
 * @returns {{ id:number, faction:string }|null}
 */
export function rankId(name, { faction = null } = {}) {
  if (name == null) return null;
  const table = loadRankTable();
  const raw = String(name).trim().toLowerCase();
  // 직접 매칭이 안 되는 통칭 영문명은 별칭 테이블로 캐논 name_ja에 매핑(예 'lieutenant'→中尉).
  const key = RANK_NAME_ALIASES[raw] ?? raw;

  if (faction != null) {
    // a faction hint was supplied: search ONLY that ladder. An unrecognised hint resolves to no
    // ladder, so the result is null (the caller explicitly scoped to a faction that doesn't exist).
    const hinted = normalizeFaction(faction);
    if (!hinted) return null;
    // search the hinted ladder only (handles shared names like 元帥 deterministically by faction).
    for (const r of table.ranks) {
      if ((normalizeFaction(r.faction) ?? r.faction) !== hinted) continue;
      for (const field of Object.values(LANG_FIELD)) {
        if (r[field] != null && String(r[field]).trim().toLowerCase() === key) {
          return { id: r.id, faction: hinted };
        }
      }
    }
    return null;
  }

  return table.byName.get(key) ?? null;
}

/**
 * Clamp/validate a numeric rank id to the 1..RANK_MAX range. Returns the clamped id (1 if not a finite
 * number). Convenience for callers seeding a rank: keeps the wire u16 inside a real rung.
 * @param {number} id
 * @returns {number}
 */
export function clampRankId(id) {
  const n = Math.trunc(Number(id));
  if (!Number.isFinite(n) || n < 1) return 1;
  return n > RANK_MAX ? RANK_MAX : n;
}
