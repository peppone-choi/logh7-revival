/**
 * Canon (原作 / "Original-work") character roster from the shipped O-group portraits — REAL canon
 * portraits, PLACEHOLDER identity.
 *
 * In LOGH VII "オリジナル/오리지널" = 原作 (the original novels/anime) characters, i.e. CANON. Their
 * portraits ship in the client: the O-group Face atlases oem (empire officers, cap 199), oam (alliance
 * officers, cap 95) and o (misc, cap 99) — ~396 codes / ~446 frames. These are NOT player-created
 * (that is the G-group gem/gef/gam/gaf). Every O-group portrait is a canon character.
 *
 * The problem (user-confirmed, data-mining failed repeatedly): there are so many O-group portraits that
 * we do NOT know which frame is which canon character, and some frames visually duplicate. So we can
 * recover the canon FACES but not the canon NAMES/abilities. The handful we DO know (official face-number
 * anchors / canon-face-registry) stay as the named roster; the rest must still EXIST in-world as canon
 * characters with everything filled in EXCEPT the unrecovered name — placeholder names "1".."N",
 * neutral mid abilities, a rank, a faction inferred from the atlas, and their REAL canon portrait.
 *
 * Provenance: portraitIndex = a real shipped canon portrait (P1, identity-unmapped). name/abilities =
 * P3 placeholder (`identityRecovered: false`) — NEVER claimed as recovered LOGH VII name/stat data.
 * These are replaced by real names/stats only when a portrait↔identity mapping is recovered.
 */
import { encodeFace, FACE_ATLAS } from './logh7-face-codec.mjs';

const DEFAULT_ABILITY = 50;
const ABILITY_COUNT = 8; // 統率/政治/運用/情報 (PCP) + 指揮/機動/攻撃/防御 (MCP)
const O_GROUP_ATLASES = ['oem', 'oam', 'o'];
// Faction is reliable ONLY for the male-officer atlases: oem = Galactic Empire, oam = Free Planets
// Alliance. The `o` atlas is a MIXED bucket — women of EITHER power + Phezzan/neutral + misc — so it does
// NOT encode faction or sex. `o` entries therefore carry a placeholder nationId with factionRecovered:false
// (never claimed as their real faction). See FACE_ATLAS (oem/oam faction set, o = null).
const ATLAS_FACTION = {
  oem: { nationId: 0x500, factionRecovered: true, sex: 'male' },
  oam: { nationId: 0x501, factionRecovered: true, sex: 'male' },
  o: { nationId: 0x502, factionRecovered: false, sex: null }, // mixed: female / neutral / misc — unverified
};

/**
 * Enumerate the real shipped O-group face codes (canon portraits) across the oem/oam/o atlases as
 * `{ atlas, index, code }`, skipping any code in `exclude`. These are actual in-game portraits.
 * @param {{ atlases?: string[], exclude?: Iterable<number> }} [opts]
 */
export function listOGroupFaces({ atlases = O_GROUP_ATLASES, exclude = [] } = {}) {
  const skip = new Set(Array.from(exclude, (n) => Number(n)).filter(Number.isInteger));
  const faces = [];
  for (const atlas of atlases) {
    const meta = FACE_ATLAS[atlas];
    if (!meta) continue;
    for (let index = 0; index <= meta.cap; index += 1) {
      const code = encodeFace(atlas, index);
      if (!skip.has(code)) faces.push({ atlas, index, code });
    }
  }
  return faces;
}

/** Back-compat: just the face codes. */
export function buildOGroupFacePool(opts = {}) {
  return listOGroupFaces(opts).map((f) => f.code);
}

/**
 * Build the canon roster from the shipped O-group portraits. One character per portrait (minus the
 * `excludeFaces` already tied to a named canon character so the same person isn't represented twice).
 * @param {{
 *   startId?: number,            // first id (kept far above the lobby id space, default 0x4000)
 *   excludeFaces?: Iterable<number>, // face codes already used by the NAMED canon roster
 *   atlases?: string[],
 *   max?: number,                // cap the count (default: all enumerable O-group portraits)
 * }} [opts]
 * @returns {Array<object>} content-pack character records: real canon portrait, placeholder identity.
 */
export function buildCanonPortraitRoster({
  startId = 0x4000,
  excludeFaces = [],
  atlases = O_GROUP_ATLASES,
  max = Infinity,
} = {}) {
  const faces = listOGroupFaces({ atlases, exclude: excludeFaces });
  const limit = Number.isFinite(max) ? Math.max(0, Math.trunc(max)) : faces.length;
  const roster = [];
  for (let i = 0; i < faces.length && i < limit; i += 1) {
    const { atlas, index, code } = faces[i];
    const fac = ATLAS_FACTION[atlas] ?? { nationId: 0x502, factionRecovered: false, sex: null };
    const factionProv = fac.factionRecovered
      ? { authority: 'o_group_atlas', source: ['data/image/Face/' + atlas + '.tcf'], originalServerData: false, tier: 'P1', note: atlas + ' is a faction-specific male-officer atlas' }
      : { authority: 'placeholder_mixed_bucket', source: ['data/image/Face/o.tcf'], originalServerData: false, tier: 'P3', note: 'o atlas mixes women / neutral / misc — faction & sex NOT encoded; nationId is a placeholder' };
    roster.push({
      id: startId + i,
      name: String(i + 1),                              // placeholder display name (identity unrecovered)
      nameRomaji: `Canon ${atlas}#${index}`,            // ASCII-safe placeholder for the u16 name field
      nameKo: null,
      isOriginal: true,   // 原作/canon
      isCanon: true,
      identityRecovered: false,
      factionRecovered: fac.factionRecovered,
      sex: fac.sex,                                     // null for the mixed `o` atlas
      source: ['data/image/Face/' + atlas + '.tcf (shipped canon portrait)'],
      provenance: {
        name: { authority: 'placeholder_unrecovered_identity', source: ['logh7-original-officers.mjs'], originalServerData: false, tier: 'P3' },
        stats: { authority: 'placeholder_unrecovered_identity', source: ['logh7-original-officers.mjs'], originalServerData: false, tier: 'P3' },
        faction: factionProv,
        portrait: {
          authority: 'shipped_canon_portrait',
          source: ['data/image/Face/' + atlas + '.tcf'],
          method: 'o_group_atlas_enumeration',
          originalServerData: false, // it IS a real shipped canon portrait, but the name↔face mapping is not recovered
          tier: 'P1',
          note: 'real shipped 原作 portrait; which canon character it depicts is unrecovered',
        },
      },
      nationId: fac.nationId,
      rank: 'Officer',
      command: DEFAULT_ABILITY,
      tactics: DEFAULT_ABILITY,
      operations: DEFAULT_ABILITY,
      abilities: new Array(ABILITY_COUNT).fill(DEFAULT_ABILITY),
      portraitIndex: code,
    });
  }
  return roster;
}

/**
 * Back-compat shim for callers that used buildOriginalOfficers({ count, faces, ... }). Prefer
 * buildCanonPortraitRoster. If an explicit `faces` list is given it is honored verbatim (legacy);
 * otherwise it builds from the full O-group pool.
 */
export function buildOriginalOfficers({ count, startId = 0x4000, excludeFaces = [], faces = null } = {}) {
  if (Array.isArray(faces) && faces.length > 0) {
    // legacy explicit-faces path
    const n = Math.max(0, Math.trunc(Number(count) || faces.length));
    const out = [];
    for (let i = 0; i < n; i += 1) {
      const code = faces[i % faces.length];
      const built = buildCanonPortraitRoster({ startId: startId + i, max: 1 })[0];
      out.push({ ...built, id: startId + i, name: String(i + 1), portraitIndex: code });
    }
    return out;
  }
  return buildCanonPortraitRoster({ startId, excludeFaces, max: count ?? Infinity });
}

/** Pull the O-group face codes already tied to a named canon character (to exclude from the placeholder roster). */
export function loadOriginalFaceCodes(registry) {
  const records = Array.isArray(registry?.records) ? registry.records : [];
  const codes = [];
  const seen = new Set();
  for (const rec of records) {
    if (rec?.group !== 'O') continue;
    const code = Number(rec?.faceCode);
    if (Number.isInteger(code) && code >= 0 && !seen.has(code)) {
      seen.add(code);
      codes.push(code);
    }
  }
  return codes;
}
