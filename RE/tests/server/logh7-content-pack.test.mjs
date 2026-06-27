import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createContentPack, DEFAULT_CONTENT } from '../../src/server/logh7-content-pack.mjs';
import { CANON_CONTENT } from '../../src/server/logh7-canon-content.mjs';
import { buildStrategicGalaxyGrid, SS_RESP_TACTICS_INFO_CODE } from '../../src/server/logh7-login-protocol.mjs';

test('default content pack loads with 2 nations and 2 units', () => {
  const pack = createContentPack();
  assert.equal(pack.nations.length, 2);
  assert.equal(pack.units.length, 2);
  assert.equal(pack.nationById(0x500).name, 'Galactic Empire');
  assert.equal(pack.unitsForNation(0x501).length, 1);
});

test('content pack maps units to the 0x33b tactics-unit shape and builds the inner', () => {
  const pack = createContentPack();
  const tactics = pack.toTacticsUnits();
  assert.equal(tactics[0].unitId, DEFAULT_CONTENT.units[0].id);
  assert.equal(tactics[0].controllable, 1);
  assert.equal(tactics[0].mapSection, DEFAULT_CONTENT.units[0].id);
  const inner = pack.buildTacticsUnitTableInner();
  assert.equal(inner.readUInt16BE(4), SS_RESP_TACTICS_INFO_CODE);
  assert.equal(inner.subarray(6).readUInt16LE(0), 2); // count = 2 units
});

test('content pack supports a custom nation (data-driven)', () => {
  const pack = createContentPack({
    name: 'custom',
    nations: [
      { id: 0x500, name: 'Empire', color: 0 },
      { id: 0x501, name: 'Alliance', color: 1 },
      { id: 0x502, name: 'Neue Reinhard', color: 2, budget: 50000 },
    ],
    units: [{ id: 0x01000099, nationId: 0x502, controllable: true, x: 1, y: 2, z: 3 }],
  });
  assert.equal(pack.nations.length, 3);
  assert.equal(pack.nationById(0x502).name, 'Neue Reinhard');
  assert.equal(pack.unitsForNation(0x502)[0].id, 0x01000099);
});

test('content pack preserves localized character names for Korean rendering', () => {
  const pack = createContentPack({
    name: 'localized-name',
    nations: [{ id: 0x500, name: 'Empire' }],
    characters: [{ id: 7, name: 'ラインハルト', nameRomaji: 'Reinhard', name_ko: '라인하르트', nationId: 0x500 }],
  });

  assert.equal(pack.characterById(7).name, 'ラインハルト');
  assert.equal(pack.characterById(7).nameRomaji, 'Reinhard');
  assert.equal(pack.characterById(7).nameKo, '라인하르트');
});

test('content pack preserves absent vs explicit-null spectral class semantics', () => {
  const pack = createContentPack({
    name: 'spectral-absence',
    nations: [{ id: 0x500, name: 'Empire' }, { id: 0x501, name: 'Alliance' }],
    systems: [
      { name_ja: 'Legacy system', faction: 'empire' },
      { name_ja: 'Unknown star', faction: 'alliance', spectralClass: null },
    ],
  });
  assert.equal(Object.hasOwn(pack.systems[0], 'spectralClass'), false);
  assert.equal(Object.hasOwn(pack.systems[1], 'spectralClass'), true);
  assert.equal(pack.systems[1].spectralClass, null);

  const { objectInner } = buildStrategicGalaxyGrid({
    systems: pack.systems.map((system, index) => ({ ...system, cx: index, cy: index })),
  });
  const body = objectInner.subarray(6);
  assert.equal(body.readUInt8(1 + 4 * 3 + 2), 1); // absent field: legacy empire fallback
  assert.equal(body.readUInt8(1 + 5 * 3 + 2), 8); // explicit null: unknown/special star slot
});

test('provisional canon content loads with nations, ship classes, characters, and a scenario', () => {
  const pack = createContentPack(CANON_CONTENT);
  assert.equal(pack.nationById(0x500).capital, 'Odin');
  assert.equal(pack.shipClassById(1).name, 'Brünhild');
  assert.equal(pack.characterById(0x2001).name, 'Yang Wen-li');
  assert.equal(pack.characterById(0x2001).tactics, 100);
  assert.ok(pack.charactersForNation(0x500).length >= 4);
  assert.ok(pack.shipClassesForNation(0x501).length >= 3);
  // scenario units reference their class + commander
  const flagship = pack.units.find((u) => u.id === 0x01000000);
  assert.equal(flagship.shipClass, 1);
  assert.equal(flagship.commander, 0x1001);
  // builds a valid 0x33b table
  assert.equal(pack.buildTacticsUnitTableInner().readUInt16BE(4), SS_RESP_TACTICS_INFO_CODE);
});

test('content pack rejects units referencing an unknown ship class or commander', () => {
  assert.throws(
    () => createContentPack({ nations: [{ id: 1 }], units: [{ id: 5, nationId: 1, shipClass: 999 }] }),
    /unknown shipClass/,
  );
  assert.throws(
    () => createContentPack({ nations: [{ id: 1 }], units: [{ id: 5, nationId: 1, commander: 0x999 }] }),
    /unknown commander/,
  );
});

test('content pack validation rejects bad data', () => {
  assert.throws(() => createContentPack({ nations: [] }), /no nations/);
  assert.throws(
    () => createContentPack({ nations: [{ id: 1 }, { id: 1 }] }),
    /duplicate nation/,
  );
  assert.throws(
    () => createContentPack({ nations: [{ id: 1 }], units: [{ id: 0, nationId: 1 }] }),
    /missing\/zero id/,
  );
  assert.throws(
    () => createContentPack({ nations: [{ id: 1 }], units: [{ id: 5, nationId: 999 }] }),
    /unknown nationId/,
  );
});
