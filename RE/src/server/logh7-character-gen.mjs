/**
 * Character stat generation — resolves "~1000 character stats" WITHOUT per-character judgment.
 *
 * The client holds ~1355 portrait slots (Face/*.tcf) but LOGH VII is an MMO: most of those are
 * PLAYER characters, not authored NPCs. So the roster is three tiers (logh7-character-record-schema):
 *   A) Named canon — a finite, sourced override table (NAMED_CANON below; values from the LOGH
 *      strategy games / series, not invented).
 *   B) Generic NPC officers — DETERMINISTICALLY generated from (rank, role, id-seed). No per-unit
 *      judgment: a pure function id -> stats. Re-running yields identical results (persistable).
 *   C) Player characters — created at runtime by players; not authored here.
 *
 * Innate stats (ability, ai_tactics/strategy/operations) are generated; progression fields
 * (experience, fame, money, achievement) start low and grow through play.
 */

export const RANKS = [
  'Ensign', 'Lieutenant', 'Lt. Commander', 'Commander', 'Captain',
  'Commodore', 'Rear Admiral', 'Vice Admiral', 'Admiral', 'Senior Admiral', 'Marshal',
];

// Per-rank innate baseline (command/tactics/operations midpoint). Higher rank = higher floor.
const RANK_BASE = {
  Ensign: 35, Lieutenant: 40, 'Lt. Commander': 45, Commander: 50, Captain: 55,
  Commodore: 62, 'Rear Admiral': 68, 'Vice Admiral': 74, Admiral: 80, 'Senior Admiral': 88, Marshal: 95,
};

// Role tilts the three innate axes (sum ~0). role -> {command, tactics, operations} deltas.
const ROLE_TILT = {
  flagship: { command: 6, tactics: 4, operations: 2 },
  battleship: { command: 3, tactics: 2, operations: 1 },
  cruiser: { command: 0, tactics: 3, operations: 2 },
  destroyer: { command: -2, tactics: 5, operations: 0 },
  carrier: { command: 1, tactics: -1, operations: 6 },
  merchant: { command: -4, tactics: -4, operations: 8 },
  staff: { command: -6, tactics: 2, operations: 10 },
};

/** Deterministic 0..1 hash from an integer id + salt (no Math.random — must be reproducible). */
function seeded(id, salt) {
  let h = (id ^ (salt * 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 0xffffffff;
}

const clamp = (n, lo = 1, hi = 100) => Math.max(lo, Math.min(hi, Math.round(n)));

/**
 * Named canon overrides — sourced (LOGH strategy-game stats), NOT invented per-character.
 * Only the principals need this; everyone else is generated. portraitIndex binds to Face/*.tcf.
 */
export const NAMED_CANON = {
  0x1001: { name: 'Reinhard von Lohengramm', nationId: 0x500, rank: 'Marshal', command: 100, tactics: 98, operations: 99, portraitIndex: 1 },
  0x1002: { name: 'Siegfried Kircheis', nationId: 0x500, rank: 'Senior Admiral', command: 95, tactics: 94, operations: 96, portraitIndex: 2 },
  0x1003: { name: 'Wolfgang Mittermeyer', nationId: 0x500, rank: 'Admiral', command: 94, tactics: 90, operations: 88, portraitIndex: 3 },
  0x1004: { name: 'Oskar von Reuenthal', nationId: 0x500, rank: 'Admiral', command: 93, tactics: 95, operations: 92, portraitIndex: 4 },
  0x1005: { name: 'Paul von Oberstein', nationId: 0x500, rank: 'Admiral', command: 70, tactics: 80, operations: 99, portraitIndex: 5 },
  0x1006: { name: 'August Samuel Wahlen', nationId: 0x500, rank: 'Admiral', command: 85, tactics: 82, operations: 83, portraitIndex: 6 },
  0x1007: { name: 'Fritz Josef Bittenfeld', nationId: 0x500, rank: 'Admiral', command: 88, tactics: 86, operations: 72, portraitIndex: 7 },
  0x1008: { name: 'Neidhart Müller', nationId: 0x500, rank: 'Admiral', command: 86, tactics: 88, operations: 85, portraitIndex: 8 },
  0x2001: { name: 'Yang Wen-li', nationId: 0x501, rank: 'Admiral', command: 96, tactics: 100, operations: 95, portraitIndex: 20 },
  0x2002: { name: 'Alexander Bucock', nationId: 0x501, rank: 'Admiral', command: 88, tactics: 85, operations: 90, portraitIndex: 21 },
  0x2003: { name: 'Dusty Attenborough', nationId: 0x501, rank: 'Rear Admiral', command: 82, tactics: 84, operations: 80, portraitIndex: 22 },
  0x2004: { name: 'Walter von Schenkopp', nationId: 0x501, rank: 'Commodore', command: 80, tactics: 88, operations: 70, portraitIndex: 23 },
  0x2005: { name: 'Julian Mintz', nationId: 0x501, rank: 'Lieutenant', command: 78, tactics: 85, operations: 80, portraitIndex: 24 },
  0x2006: { name: 'Fyodor Patrichev', nationId: 0x501, rank: 'Rear Admiral', command: 75, tactics: 72, operations: 82, portraitIndex: 25 },
};

/**
 * Resolve a character's full stat record by id. If named canon exists, use it (filling generated
 * defaults for anything the canon entry omits); otherwise deterministically generate from rank/role.
 * @param {{ id: number, nationId?: number, rank?: string, role?: string }} opts
 */
export function generateCharacter({ id, nationId = null, rank = null, role = 'battleship' }) {
  const canon = canonRoster.get(id);
  const r = rank ?? canon?.rank ?? RANKS[Math.floor(seeded(id, 1) * 5)]; // generics skew junior
  const base = RANK_BASE[r] ?? 50;
  const tilt = ROLE_TILT[role] ?? ROLE_TILT.battleship;
  // ±8 spread per axis from an id-seeded jitter, so two same-rank officers still differ.
  const jitter = (salt) => (seeded(id, salt) - 0.5) * 16;
  const gen = {
    command: clamp(base + tilt.command + jitter(11)),
    tactics: clamp(base + tilt.tactics + jitter(12)),
    operations: clamp(base + tilt.operations + jitter(13)),
  };
  return {
    id,
    name: canon?.name ?? `Officer ${id.toString(16)}`,
    nationId: canon?.nationId ?? nationId,
    rank: r,
    command: canon?.command ?? gen.command,
    tactics: canon?.tactics ?? gen.tactics,
    operations: canon?.operations ?? gen.operations,
    portraitIndex: canon?.portraitIndex ?? (id % 1355),
    canon: Boolean(canon),
  };
}

// The live canon roster — seeded from NAMED_CANON, extensible from sourced data files. The client
// registers ~669 characters (Face/*.tcf, 669 real portraits): EVERY registered character should get
// a CUSTOM sourced stat here (from the prior LOGH strategy games / series DB), NOT generation.
// Generation (generateCharacter for an unregistered id) is the fallback for anonymous/player slots only.
const canonRoster = new Map(Object.entries(NAMED_CANON).map(([id, rec]) => [Number(id), rec]));

/** Merge sourced roster records (array of {id, name, nationId, rank, command, tactics, operations,
 * portraitIndex}) into the canon roster. This is how all 669 client-registered characters get their
 * custom stats: provide the data (from prior-game/series sources), no per-character code. */
export function registerCanon(records) {
  for (const rec of records) {
    if (!Number.isInteger(rec.id)) throw new Error('canon record requires an integer id');
    canonRoster.set(rec.id, { ...canonRoster.get(rec.id), ...rec });
  }
  return canonRoster.size;
}

/** True if `id` is a registered (custom-statted) character vs a generated/anonymous one. */
export function isCanon(id) {
  return canonRoster.has(id);
}

/** Every registered canon character, resolved to a full stat record. These MUST all appear in-game
 * with full custom stats — they are the sourced principals, not generated filler. */
export function allCanonCharacters() {
  return [...canonRoster.keys()].map((id) => generateCharacter({ id }));
}

/**
 * Generate a roster of `count` generic officers for a nation (ids start at `startId`), each
 * deterministically statted. Use to populate the NPC officer pool without per-character authoring.
 */
export function generateRoster({ nationId, count, startId, roles = ['battleship', 'cruiser', 'destroyer'] }) {
  const out = [];
  for (let i = 0; i < count; i += 1) {
    const id = startId + i;
    out.push(generateCharacter({ id, nationId, role: roles[i % roles.length] }));
  }
  return out;
}
