// LOGH VII in-game face-value codec (server side; mirrors tools/logh7_face_id_decode.py).
//
// The 0x0323 record's face field (and the 0x1008 create face@0x4c) is a COMPOSITE digit
// encoding the client decomposes (FUN_00592c30) into an atlas selector + per-atlas local index:
//   index = n % 1000
//   M  = n / 1000000        (0 => O officer-group atlas, 1 => G general/generate-group atlas)
//   d5 = (n % 1000000)/100000   (faction column)
//   d4 = (n %  100000)/10000    (sex / o-bucket)
//   d3 = (n %   10000)/1000     (0 => real atlas, nonzero => 'o' overflow bucket)
//
// The character-creation face picker (grid painter FUN_00596f90) hard-codes the group to G
// (gem/gef/gam/gaf): a PLAYER-created face is always G-group. The O-group atlases
// (oem/oam/o) never appear in the picker and are RESERVED for original/canon characters
// (RE 2026-06-14). So a server-authoritative create check rejects any non-G-group face.

/** @type {Record<string, {sel:number, faction:string|null, sex:string|null, rank:string, cap:number, group:'O'|'G'}>} */
export const FACE_ATLAS = {
  oem: { sel: 0, faction: 'empire', sex: 'male', rank: 'officer', cap: 199, group: 'O' },
  oam: { sel: 1, faction: 'alliance', sex: 'male', rank: 'officer', cap: 95, group: 'O' },
  o: { sel: 2, faction: null, sex: null, rank: 'misc', cap: 99, group: 'O' },
  gem: { sel: 3, faction: 'empire', sex: 'male', rank: 'general', cap: 99, group: 'G' },
  gef: { sel: 4, faction: 'empire', sex: 'female', rank: 'general', cap: 31, group: 'G' },
  gam: { sel: 5, faction: 'alliance', sex: 'male', rank: 'general', cap: 99, group: 'G' },
  gaf: { sel: 6, faction: 'alliance', sex: 'female', rank: 'general', cap: 31, group: 'G' },
};

const ATLAS_BASE = { oem: 0, oam: 100000, o: 10000, gem: 1000000, gef: 1010000, gam: 1100000, gaf: 1110000 };

const OVERFLOW_OFFSET = new Map([
  ['0,1,1', 10], ['0,2,0', 20], ['1,0,0', 40], ['1,0,1', 50], ['1,1,0', 60], ['1,1,1', 70],
]);

const CLEAN_TABLE = new Map([
  ['0,0,0', 'oem'], ['0,1,0', 'oam'], ['0,0,1', 'o'],
  ['1,0,0', 'gem'], ['1,0,1', 'gef'], ['1,1,0', 'gam'], ['1,1,1', 'gaf'],
]);

/** Build the in-game face value for (atlas, localIndex). Throws on out-of-range. */
export function encodeFace(atlas, index) {
  const meta = FACE_ATLAS[atlas];
  if (!meta) throw new Error(`unknown atlas ${atlas}`);
  if (!(Number.isInteger(index) && index >= 0 && index <= meta.cap)) {
    throw new Error(`index ${index} out of range 0..${meta.cap} for ${atlas}`);
  }
  return ATLAS_BASE[atlas] + index;
}

/** Decompose a face value into { atlas, index, group, faction, sex, rank } or null if undecodable. */
export function decodeFace(n) {
  if (!Number.isInteger(n) || n < 0) return null;
  const index = n % 1000;
  const M = Math.floor(n / 1000000);
  const d5 = Math.floor((n % 1000000) / 100000);
  const d4 = Math.floor((n % 100000) / 10000);
  const d3 = Math.floor((n % 10000) / 1000);
  let atlas;
  let localIndex = index;
  if (d3 !== 0) {
    const offset = OVERFLOW_OFFSET.get(`${M},${d5},${d4}`);
    if (offset === undefined) return null;
    atlas = 'o';
    localIndex = index + offset;
  } else {
    atlas = CLEAN_TABLE.get(`${M},${d5},${d4}`);
    if (!atlas) return null;
  }
  const meta = FACE_ATLAS[atlas];
  return { atlas, index: localIndex, group: meta.group, faction: meta.faction, sex: meta.sex, rank: meta.rank };
}

/** True iff `face` is a G-group (player-selectable) atlas slot. */
export function isPlayerSelectableFace(face) {
  const d = decodeFace(face);
  return d !== null && d.group === 'G';
}

/** True iff `face` is an O-group (canon-reserved) atlas slot. */
export function isCanonFace(face) {
  const d = decodeFace(face);
  return d !== null && d.group === 'O';
}

/**
 * Authoritative gate for a 0x1008 create face. A player-created character must use a G-group face
 * (the picker never offers O-group). Returns { ok, reason?, atlas?, index? }.
 *
 * NOTE: faction/sex match against the request's power/sex bytes is NOT enforced here yet — the
 * wire power(u8)->faction enum mapping is unconfirmed. This gate enforces the unambiguous part:
 * O-group (canon) faces are rejected for player creation. face === 0 (unset) is allowed.
 */
export function validateCreateFace(face) {
  if (face === 0) return { ok: true, atlas: null, index: 0 };
  const d = decodeFace(face);
  if (d === null) return { ok: false, reason: `undecodable face ${face}` };
  if (d.group !== 'G') return { ok: false, reason: `face ${face} is O-group (${d.atlas}); reserved for canon`, atlas: d.atlas };
  return { ok: true, atlas: d.atlas, index: d.index };
}
