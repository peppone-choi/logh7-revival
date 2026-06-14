import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openContentSource } from '../../src/server/logh7-content-source.mjs';
import { buildContentPackDataFromSource, NATION_ID } from '../../src/server/logh7-content-adapter.mjs';
import { createContentPack } from '../../src/server/logh7-content-pack.mjs';
import { buildInformationCharacterRecordInner } from '../../src/server/logh7-login-protocol.mjs';

test('recovered content DB drives a valid content pack', () => {
  const source = openContentSource({ build: true });
  const data = buildContentPackDataFromSource(source);
  const pack = createContentPack(data); // throws on a structurally invalid pack

  // three canon powers, with the recovered named cast assigned + a fleet each
  assert.ok(pack.nations.some((n) => n.id === NATION_ID.empire));
  assert.ok(pack.nations.some((n) => n.id === NATION_ID.alliance));
  assert.ok(pack.characters.length >= 90, 'recovered roster present');
  assert.equal(pack.units.length, pack.characters.length, 'one fleet per character');

  // ship classes present and every unit references a valid one (flagship for the first fleet/faction)
  assert.ok(pack.shipClasses.length >= 4, 'ship classes seeded');
  assert.ok(pack.shipClasses.some((s) => s.role === 'flagship'), 'a flagship class exists');

  // every unit's commander + nation + ship class resolve inside the pack (referential integrity)
  for (const u of pack.units) {
    assert.ok(pack.characterById(u.commander), `commander ${u.commander} exists`);
    assert.ok(pack.nationById(u.nationId), `nation ${u.nationId} exists`);
    assert.ok(pack.shipClassById(u.shipClass), `ship class ${u.shipClass} exists`);
  }

  // recovered galaxy travels with the pack (80 systems, planets orbit-ordered, Iserlohn fortress)
  assert.equal(pack.systems.length, 80, 'all star systems carried');
  const iserlohn = pack.systemByName('イゼルローン');
  assert.ok(iserlohn, 'Iserlohn system in pack');
  assert.equal(iserlohn.faction, 'empire');
  assert.ok(iserlohn.fortresses.includes('イゼルローン'));
  assert.ok(pack.systems.reduce((n, s) => n + s.planets.length, 0) >= 280, 'planets carried');

  // abilities carried through (command/tactics/operations from the 8-ability schema)
  const empire = pack.charactersForNation(NATION_ID.empire);
  assert.ok(empire.length > 0);
  assert.ok(empire.every((c) => Number.isFinite(c.command) && Number.isFinite(c.tactics)));

  // bridge: a character's full 8-ability block flows into the 0x0323 record at ability_8@0x188
  const withAbilities = pack.characters.find((c) => Array.isArray(c.abilities) && c.abilities.length === 8);
  assert.ok(withAbilities, 'characters carry the 8-ability block');
  const rec = buildInformationCharacterRecordInner({
    characterId: withAbilities.id, gridUnitId: 1, abilities: withAbilities.abilities,
  });
  const payload = rec.subarray(6);
  for (let i = 0; i < 8; i += 1) {
    assert.equal(payload.readUInt16LE(0x188 + i * 4), withAbilities.abilities[i] & 0xffff, `ability[${i}] at 0x188`);
  }

  // bridge: a character's assigned portrait (Face/*.tcf id) flows into the 0x0323 face field @0xf4.
  const withFace = pack.characters.find((c) => Number.isInteger(c.portraitIndex));
  assert.ok(withFace, 'characters carry an assigned portraitIndex (face pool)');
  const faceRec = buildInformationCharacterRecordInner({
    characterId: withFace.id, gridUnitId: 1, face: withFace.portraitIndex,
  });
  assert.equal(faceRec.subarray(6).readUInt32LE(0x80 + 0x74), withFace.portraitIndex, 'face id at 0xf4');
  source.close();
});
