/**
 * FORTRESS accessor + strategic-marker support — the 6 LOGH VII fortresses (Iserlohn, Geiersburg,
 * Rentenberg, Garmisch, Lyudmila, Dayan Khan) as a pure content read model for the strategic map.
 *
 * Scope: this module is a SELF-CONTAINED data accessor. It loads content/fortresses.json and projects
 * its rows onto the strategic OBJECT TABLE shape (`{ value, contentId, klass:3, variant }`) so the
 * caller (buildStrategicGalaxyGrid / the 0x031d base builder) can place fortresses as class-3 sector
 * markers ALONGSIDE star systems, without this module knowing the wire encoding. No edits to any
 * existing hot-path module; the only thing it shares with the rest of the codebase is the object-table
 * record shape already consumed by buildStaticInformationGridTypeInner (logh7-login-protocol.mjs).
 *
 * MARKER MODEL (docs/logh7-strategic-map-wire.md §B/§E): every placed marker is `byte1 (klass) == 3`
 * (the placement gate). Star systems, fortresses and fleets are ALL klass 3 — they are visually
 * distinguished by `byte2` (the marker `variant`, → icon/glow slot), NOT by a different klass. So a
 * fortress marker is `{ value (object value 3..88), contentId (byte0 → constmsg group-0x18 label idx),
 * klass: 3, variant (byte2 icon/faction tint) }`. `value` is assigned by the caller (it owns the
 * 3..88 object-value space shared with systems/fleet); fortressMarkerObjects() therefore takes a
 * `startValue` and a faction→variant mapper so it composes cleanly with the existing system loop.
 *
 * Pure + synchronous => fully unit-testable without a live client.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = join(HERE, '..', '..', 'content');

/**
 * Faction → strategic-marker variant (byte2 / icon-glow slot, valid 0..6,8 per the render loop). Empire
 * and Alliance get distinct tints; anything else falls to a neutral slot. This mirrors the system
 * variant convention in buildStrategicGalaxyGrid so fortresses tint consistently with their systems.
 * The exact "fortress sprite" slot is a content convention (needs a live visual probe per the wire
 * doc §B), so we expose `variant` as data the caller can override rather than hard-coding a slot.
 *
 * @param {string|undefined} faction
 * @returns {number} variant in 0..6
 */
export function fortressVariantForFaction(faction) {
  if (faction === 'empire') return 1;
  if (faction === 'alliance') return 2;
  return 0;
}

let cached = null;

/**
 * Load the 6 fortresses from content/fortresses.json. Returns the parsed `fortresses[]` array (each
 * row: id, name_ja, name_ko, name_en, system, faction, cannon_name, cannon_power, armor, antiaircraft,
 * stamina, defense_outfit, garrison_capacity). Result is cached on first read; pass `{ reload: true }`
 * to force a fresh read (e.g. in tests). On any read/parse failure returns an empty array (the
 * strategic map simply omits fortress markers rather than crashing world-init).
 *
 * @param {{ reload?: boolean }} [opts]
 * @returns {Array<object>} the fortress rows
 */
export function loadFortresses({ reload = false } = {}) {
  if (cached && !reload) return cached;
  try {
    const json = JSON.parse(readFileSync(join(CONTENT_DIR, 'fortresses.json'), 'utf8'));
    cached = Array.isArray(json?.fortresses) ? json.fortresses : [];
  } catch {
    cached = [];
  }
  return cached;
}

/**
 * Find the fortress stationed in a given star system by its NAME. Matches against `system` (the
 * Japanese system name, which is the join key shared with content/galaxy.json's `system` field) and,
 * as a convenience, against the fortress's own `name_ja` / `name_en` / `name_ko`. Returns the fortress
 * row or `undefined` when no fortress sits in that system. Lookup is exact-string (the galaxy join is
 * exact); falsy/empty input returns `undefined`.
 *
 * @param {string} name the star-system name (name_ja) the fortress guards
 * @param {{ reload?: boolean }} [opts]
 * @returns {object|undefined}
 */
export function fortressBySystem(name, { reload = false } = {}) {
  if (!name) return undefined;
  const list = loadFortresses({ reload });
  return list.find(
    (f) => f.system === name
      || f.name_ja === name
      || f.name_en === name
      || f.name_ko === name,
  );
}

/**
 * Project the fortresses onto strategic OBJECT-TABLE records so they can be placed as class-3 markers
 * alongside star systems. Returns one `{ value, contentId, klass:3, variant }` per fortress (the exact
 * shape buildStaticInformationGridTypeInner / buildStrategicGalaxyGrid already consume).
 *
 * - `value`   = object value (3..88), assigned sequentially from `startValue`. The CALLER owns the
 *               shared object-value space, so it passes the next free value after its systems; entries
 *               whose value would exceed 88 (the placeable range) are dropped (the board is full).
 * - `contentId` = byte0, the constmsg group-0x18 label index for the fortress name. We default it to a
 *               stable per-fortress id derived from the row's position (or its explicit `content_id` /
 *               `byte0` when the content pack supplies the real constmsg index); the KO/JA text itself
 *               comes from the overlaid constmsg.dat, not the wire.
 * - `klass`   = 3 (the only class the client places/renders as a clickable marker).
 * - `variant` = byte2 icon/glow slot from the fortress faction (override-friendly).
 *
 * Each returned entry also carries `fortress` (the source row) and `system` so the caller can resolve
 * the cell (col,row) from the matching galaxy system. The grid cell is intentionally NOT computed here:
 * this module has no galaxy-projection knowledge — the caller already projects systems to cells and
 * reuses that same projection for the fortress's `system`.
 *
 * @param {{ startValue?: number, maxValue?: number, variantForFaction?: (f:string)=>number,
 *   reload?: boolean }} [opts]
 * @returns {Array<{ value:number, contentId:number, klass:3, variant:number, system:string, fortress:object }>}
 */
export function fortressMarkerObjects({
  startValue = 83,
  maxValue = 88,
  variantForFaction = fortressVariantForFaction,
  reload = false,
} = {}) {
  const list = loadFortresses({ reload });
  const out = [];
  let value = startValue;
  for (let i = 0; i < list.length; i += 1) {
    if (value > maxValue) break; // board full — no more placeable object values
    const f = list[i];
    const contentId = Number.isFinite(f?.content_id)
      ? (f.content_id & 0xff)
      : Number.isFinite(f?.byte0)
        ? (f.byte0 & 0xff)
        : ((startValue + i) & 0xff); // stable placeholder until the real constmsg-0x18 idx is mapped
    out.push({
      value,
      contentId,
      klass: 3,
      variant: variantForFaction(f?.faction) & 0xff,
      system: f?.system,
      fortress: f,
    });
    value += 1;
  }
  return out;
}
