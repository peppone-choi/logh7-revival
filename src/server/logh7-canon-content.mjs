/**
 * Canon LOGH content dataset — the authored server data (nations, ship classes, characters, a
 * starting scenario) that the lost original server used to hold. Grounded in Legend of the Galactic
 * Heroes canon so the revival ships with real factions/admirals rather than placeholders.
 *
 * This is pure data; logh7-content-pack validates + indexes it and turns it into wire messages.
 * It grows over time ("implement all server content") — more ship classes, characters, star
 * systems/bases, and per-class stats get appended here without touching the loader.
 */
import { allCanonCharacters } from './logh7-character-gen.mjs';

export const NATIONS = [
  { id: 0x500, name: 'Galactic Empire', color: 0, budget: 200000, capital: 'Odin' },
  { id: 0x501, name: 'Free Planets Alliance', color: 1, budget: 180000, capital: 'Heinessen' },
  { id: 0x502, name: 'Phezzan Dominion', color: 2, budget: 150000, capital: 'Phezzan' },
];

// role: flagship | battleship | cruiser | destroyer | carrier | merchant
export const SHIP_CLASSES = [
  { id: 1, name: 'Brünhild', nationId: 0x500, role: 'flagship', hp: 5200, attack: 920, defense: 880, speed: 11 },
  { id: 2, name: 'Imperial Battleship', nationId: 0x500, role: 'battleship', hp: 2200, attack: 430, defense: 400, speed: 9 },
  { id: 3, name: 'Imperial Cruiser', nationId: 0x500, role: 'cruiser', hp: 1400, attack: 260, defense: 230, speed: 12 },
  { id: 4, name: 'Imperial Destroyer', nationId: 0x500, role: 'destroyer', hp: 900, attack: 180, defense: 150, speed: 14 },
  { id: 10, name: 'Hyperion', nationId: 0x501, role: 'flagship', hp: 4400, attack: 780, defense: 760, speed: 11 },
  { id: 11, name: 'Patroklos', nationId: 0x501, role: 'battleship', hp: 2100, attack: 410, defense: 400, speed: 9 },
  { id: 12, name: 'Alliance Cruiser', nationId: 0x501, role: 'cruiser', hp: 1300, attack: 240, defense: 220, speed: 12 },
  { id: 13, name: 'Alliance Destroyer', nationId: 0x501, role: 'destroyer', hp: 850, attack: 170, defense: 140, speed: 14 },
  { id: 20, name: 'Phezzan Merchant Cruiser', nationId: 0x502, role: 'merchant', hp: 1100, attack: 90, defense: 200, speed: 13 },
];

// The full named-canon roster (single source of truth = NAMED_CANON in logh7-character-gen), each
// resolved to a full stat record. EVERY registered canon name must appear in-game with full stats.
export const CHARACTERS = allCanonCharacters();

// A nation's flagship class (for its top commander) and a default battleship class (everyone else).
const FLAGSHIP_BY_NATION = { 0x500: 1, 0x501: 10, 0x502: 20 };
const BATTLESHIP_BY_NATION = { 0x500: 2, 0x501: 11, 0x502: 20 };

/**
 * Give EVERY canon character a fleet so they all appear on the map with full stats. The highest-rank
 * commander of each nation flies its flagship; the rest get a nation battleship. Fleets are laid out
 * in two facing lines (Empire left / Alliance right) spread by index.
 */
function buildCanonFleets() {
  const flagshipTaken = new Set();
  return CHARACTERS.map((c, i) => {
    const nationId = c.nationId;
    const useFlagship = !flagshipTaken.has(nationId) && (c.rank === 'Marshal' || c.rank === 'Senior Admiral' || c.rank === 'Admiral');
    if (useFlagship) flagshipTaken.add(nationId);
    const shipClass = useFlagship ? FLAGSHIP_BY_NATION[nationId] : (BATTLESHIP_BY_NATION[nationId] ?? 2);
    const side = nationId === 0x500 ? -1 : 1;
    return {
      id: 0x01000000 + i,
      nationId,
      shipClass,
      commander: c.id,
      controllable: true,
      x: side * 200,
      y: (i % 7) * 60 - 180,
      z: 0,
      heading: side < 0 ? 90 : 270,
    };
  });
}

export const SCENARIO_UNITS = buildCanonFleets();

export const CANON_CONTENT = {
  name: 'logh-canon-skirmish',
  nations: NATIONS,
  shipClasses: SHIP_CLASSES,
  characters: CHARACTERS,
  units: SCENARIO_UNITS,
};
