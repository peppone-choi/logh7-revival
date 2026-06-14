/**
 * Content adapter — turns the unified content DB (logh7-content-source) into the content-pack shape
 * that the authoritative world consumes (logh7-content-pack / world seeding). This is the Track-1
 * bridge: the recovered galaxy/roster data drives the live world instead of the small hard-coded
 * CANON_CONTENT table.
 *
 * Mappings:
 *   faction key  -> nation id   (empire 0x500 / alliance 0x501 / neutral=Phezzan 0x502)
 *   character    -> {command,tactics,operations} from the 8-ability schema (統率/指揮/運営)
 *   character    -> portraitIndex (a Face/*.tcf global index) for the 0x0323 face field
 *   each character gets a fleet unit so the named cast appears on the map.
 */
import { readFileSync } from 'node:fs';

export const NATION_ID = { empire: 0x500, alliance: 0x501, neutral: 0x502 };

// Normalize a romaji name to a matchable surname key: lowercase, drop nobiliary particles, keep the
// longest token (the family name) — so "Reinhard von Lohengramm" and "Reinhard" both key on a shared
// token, and "Yang Wen-li" / "Yang Wenli" both reduce to "yang…". Used to match a character against the
// authoritative face-number anchors recovered from the official site (content/roster/face-name-map.json).
function nameKeys(romaji) {
  if (!romaji) return [];
  const tokens = String(romaji)
    .toLowerCase()
    .replace(/[.\-]/g, ' ')
    .split(/\s+/)
    .filter((t) => t && !['von', 'van', 'de', 'der', 'the', 'di', 'du'].includes(t));
  return tokens;
}

/**
 * Return a deterministic face assigner. Priority:
 *   1) AUTHORITATIVE — the official VII face number recovered from gineiden.com
 *      (content/roster/face-name-map.json: 12 confirmed name↔face-number pairs, e.g. Reinhard=209,
 *      Yang=206). Matched by a shared surname token, so the named principals render their REAL face.
 *   2) Pool anchor / deterministic pick from the valid Face/*.tcf pool (content/roster/face-pool.json)
 *      for everyone else — a stable, plausible face (the original name↔face table was server-side and
 *      is lost, so non-principals get a consistent assigned face, not an authentic one).
 * Best-effort: missing files degrade gracefully (faces left null).
 */
export function loadFaceAssigner(
  poolPath = 'content/roster/face-pool.json',
  officialPath = 'content/roster/face-name-map.json',
) {
  let pool = {};
  try {
    pool = JSON.parse(readFileSync(poolPath, 'utf8'));
  } catch {
    pool = {};
  }
  const valid = Array.isArray(pool.valid) ? pool.valid : [];
  const poolAnchors = pool.anchors ?? {};

  // Build the authoritative surname-token → face_number index from the recovered official 12.
  const officialByKey = new Map();
  try {
    const map = JSON.parse(readFileSync(officialPath, 'utf8'));
    const entries = Array.isArray(map) ? map : map.entries ?? map.mappings ?? map.faces ?? [];
    for (const e of entries) {
      if (!Number.isInteger(e?.face_number)) continue;
      for (const k of nameKeys(e.name_romaji)) {
        if (k.length >= 3 && !officialByKey.has(k)) officialByKey.set(k, e.face_number);
      }
    }
  } catch {
    /* no official map — fall through to the pool */
  }

  return (character) => {
    // 1) authoritative official face number by surname-token match
    for (const k of nameKeys(character.nameRomaji)) {
      if (officialByKey.has(k)) return officialByKey.get(k);
    }
    // 2) pool anchor (legacy) then deterministic pool pick
    if (character.nameRomaji && poolAnchors[character.nameRomaji] != null) {
      return poolAnchors[character.nameRomaji];
    }
    if (valid.length === 0) return null;
    return valid[(character.id >>> 0) % valid.length];
  };
}

// Ship classes per faction (names from the constmsg ship catalog incl. flagships; stats LOGH-grounded).
// Each faction has a flagship (for its top commander) + standard line classes.
const SHIP_CLASSES = [
  { id: 1, faction: 'empire', name: 'ブリュンヒルト', role: 'flagship', hp: 5200, attack: 920, defense: 880, speed: 11 },
  { id: 2, faction: 'empire', name: '戦艦', role: 'battleship', hp: 2200, attack: 430, defense: 400, speed: 9 },
  { id: 3, faction: 'empire', name: '巡航艦', role: 'cruiser', hp: 1400, attack: 260, defense: 230, speed: 12 },
  { id: 4, faction: 'empire', name: '駆逐艦', role: 'destroyer', hp: 900, attack: 180, defense: 150, speed: 14 },
  { id: 10, faction: 'alliance', name: 'ヒューベリオン', role: 'flagship', hp: 4400, attack: 780, defense: 760, speed: 11 },
  { id: 11, faction: 'alliance', name: '戦艦', role: 'battleship', hp: 2100, attack: 410, defense: 400, speed: 9 },
  { id: 12, faction: 'alliance', name: '巡航艦', role: 'cruiser', hp: 1300, attack: 240, defense: 220, speed: 12 },
  { id: 13, faction: 'alliance', name: '駆逐艦', role: 'destroyer', hp: 850, attack: 170, defense: 140, speed: 14 },
  { id: 20, faction: 'neutral', name: 'フェザーン商船', role: 'merchant', hp: 1100, attack: 90, defense: 200, speed: 13 },
];
const FLAGSHIP_BY_FACTION = { empire: 1, alliance: 10, neutral: 20 };
const LINE_BY_FACTION = { empire: 2, alliance: 11, neutral: 20 };
const NATION_META = {
  empire: { name: 'Galactic Empire', color: 0, budget: 200000, capital: 'オーディン' },
  alliance: { name: 'Free Planets Alliance', color: 1, budget: 180000, capital: 'ハイネセン' },
  neutral: { name: 'Phezzan Dominion', color: 2, budget: 150000, capital: 'フェザーン' },
};

/**
 * Build a content-pack data object ({name, nations, shipClasses, characters, units}) from a content
 * source (logh7-content-source). Pass to createContentPack() to get the validated pack.
 * @param {ReturnType<import('./logh7-content-source.mjs').openContentSource>} source
 * @param {{ name?: string, maxUnits?: number }} [opts]
 */
export function buildContentPackDataFromSource(source, { name = 'logh-vii-recovered', maxUnits = 580 } = {}) {
  const dbChars = source.listCharacters();
  // only factions that map to a real nation can seed units
  const usedFactions = new Set(dbChars.map((c) => c.faction).filter((f) => f in NATION_ID));
  // always include the three canon powers so the faction table is stable
  for (const f of ['empire', 'alliance', 'neutral']) usedFactions.add(f);

  const nations = [...usedFactions].map((f) => ({
    id: NATION_ID[f],
    name: NATION_META[f].name,
    color: NATION_META[f].color,
    budget: NATION_META[f].budget,
    capital: NATION_META[f].capital,
  }));

  const assignFace = loadFaceAssigner();
  const characters = dbChars
    .filter((c) => c.faction in NATION_ID)
    .map((c) => {
      const ch = {
        id: c.id,
        name: c.name_ja,
        nameRomaji: c.name_romaji || null, // ASCII-safe name (avoids the unresolved u16 name encoding)
        nationId: NATION_ID[c.faction],
        rank: c.rank_ja || 'Officer',
        command: c.tochi ?? 50,
        tactics: c.shiki ?? 50,
        operations: c.unei ?? 50,
        // the full 8-ability block in canonical wire order (統率/政治/運用/情報 + 指揮/機動/攻撃/防御)
        // for the 0x0323 record's ability_8@0x188 (docs/logh7-info-records-wire.md)
        abilities: [c.tochi, c.seiji, c.unei, c.joho, c.shiki, c.kido, c.kogeki, c.bogyo].map((v) => v ?? 50),
      };
      ch.portraitIndex = assignFace(ch); // Face/*.tcf id → 0x0323 face field
      return ch;
    });

  const factionOf = (nationId) => Object.keys(NATION_ID).find((k) => NATION_ID[k] === nationId) ?? 'empire';
  const shipClasses = SHIP_CLASSES
    .filter((s) => usedFactions.has(s.faction))
    .map((s) => ({ id: s.id, name: s.name, nationId: NATION_ID[s.faction], role: s.role, hp: s.hp, attack: s.attack, defense: s.defense, speed: s.speed }));

  // one fleet per character (capped), Empire facing Alliance across the field. The first fleet of
  // each faction flies its flagship; the rest fly the standard line class.
  const flagshipUsed = new Set();
  const units = characters.slice(0, maxUnits).map((c, i) => {
    const fac = factionOf(c.nationId);
    const side = c.nationId === NATION_ID.empire ? -1 : 1;
    const useFlag = !flagshipUsed.has(fac);
    if (useFlag) flagshipUsed.add(fac);
    return {
      id: 0x01000000 + i,
      nationId: c.nationId,
      shipClass: useFlag ? FLAGSHIP_BY_FACTION[fac] : LINE_BY_FACTION[fac],
      commander: c.id,
      controllable: true,
      x: side * 220,
      y: (i % 12) * 40 - 220,
      z: 0,
      heading: side < 0 ? 90 : 270,
    };
  });

  // carry the recovered galaxy (systems + planets/fortresses) so the world has one content source
  const systems = source.listSystems().map((s) => ({
    name_ja: s.name_ja,
    faction: s.faction,
    is_corridor: s.is_corridor,
    planets: s.planets,
    fortresses: s.fortresses,
  }));

  return { name, nations, shipClasses, characters, units, systems };
}
