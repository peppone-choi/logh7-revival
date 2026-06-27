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

  // three canon powers; the roster now also carries the identity-unrecovered canon (原作/O-group) portrait
  // characters, so it is much larger than the named cast.
  assert.ok(pack.nations.some((n) => n.id === NATION_ID.empire));
  assert.ok(pack.nations.some((n) => n.id === NATION_ID.alliance));
  assert.ok(pack.characters.length >= 90, 'recovered roster present');
  // Fleets are seeded for the commandable (named-stat) roster only — NOT one per canon portrait. The
  // nation-managed fleet model is being RE-verified (docs/logh7-data-structures-re.md). Bounded by roster.
  assert.ok(pack.units.length >= 1 && pack.units.length <= pack.characters.length, 'fleets seeded, bounded by roster');

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
  assert.equal(iserlohn.contentId, 14, 'Iserlohn constmsg group-0x18 sub id carried');
  assert.deepEqual([iserlohn.map.canonCol, iserlohn.map.canonRow], [53, 12], 'Iserlohn wire cell carried');
  assert.deepEqual([iserlohn.canonCol, iserlohn.canonRow], [53, 12], 'Iserlohn top-level wire cell carried');
  assert.equal(iserlohn.spectralClass, 'K', 'Iserlohn marker variant uses the raster-dot color class');
  assert.equal(iserlohn.provenance.spectralClass.authority, 'manual_star_chart_pixel_color');
  const lumbini = pack.systemByName('ルンビーニ');
  assert.equal(lumbini.contentId, 86, 'Lumbini constmsg group-0x18 sub id carried');
  assert.equal(lumbini.nameKo, '룬비니', 'Lumbini KO label carried');
  assert.deepEqual(
    lumbini.planets.map((planet) => [planet.name, planet.nameKo, planet.orbit]),
    [
      ['バクタプール', '바구타푸루', 1],
      ['カライヤ', '카라이야', 2],
      ['バドガオン', '바도가온', 3],
    ],
    'manual planet names stay orbit-ordered with KO labels',
  );
  assert.equal(lumbini.planets[0].population_M, 135, 'planet economy population_M carried');
  assert.equal(lumbini.planets[0].population, 135_000_000, 'planet economy raw population carried');
  assert.equal(typeof lumbini.planets[0].food, 'number', 'planet economy food carried');
  assert.equal(typeof lumbini.planets[0].industry, 'number', 'planet economy industry carried');
  assert.equal(typeof lumbini.planets[0].habitable, 'boolean', 'planet habitability carried');
  assert.ok(iserlohn.fortresses.includes('イゼルローン'));
  assert.ok(pack.systems.reduce((n, s) => n + s.planets.length, 0) >= 280, 'planets carried');
  assert.equal(typeof pack.systems[0].map.cx, 'number', 'manual star-chart x coordinate carried');
  assert.equal(pack.systems[0].map.source, 'content/galaxy.json manual star-chart annotations');
  assert.equal(pack.systems[0].planets[0].inferredPosition.source, 'content/galaxy.json orbit order, deterministic local polar slots');

  // client/manual inferred command-surface catalogs: institutions + rooms such as 執務室 survive as data.
  assert.ok(pack.institutions.length >= 30, 'manual institution names carried');
  assert.ok(pack.rooms.some((room) => room.name === '皇帝執務室'), 'client room/office names carried');
  assert.ok(pack.rooms.some((room) => Number.isInteger(room.nameCatalogId)), 'rooms retain constmsg catalog ids');

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

test('content adapter preserves character provenance through pack normalization', () => {
  const source = {
    listCharacters: () => [
      {
        id: 1,
        name_ja: 'ラインハルト',
        name_romaji: 'Reinhard',
        name_kr: '라인하르트',
        faction: 'empire',
        rank_ja: '元帥',
        kind: 'military',
        post_ja: '帝国軍最高司令官',
        source: 'manual',
        tochi: 100,
        seiji: 98,
        unei: 99,
        joho: 80,
        shiki: 100,
        kido: 90,
        kogeki: 88,
        bogyo: 86,
      },
      {
        id: 2,
        name_ja: 'テスト提督',
        name_romaji: 'Test Admiral',
        name_kr: null,
        faction: 'alliance',
        rank_ja: '中将',
        kind: 'military',
        post_ja: '艦隊司令官',
        source: ['ivex-real', 'manual-duty-card'],
        tochi: 70,
        seiji: 60,
        unei: 65,
        joho: 55,
        shiki: 80,
        kido: 75,
        kogeki: 72,
        bogyo: 68,
      },
    ],
    listSystems: () => [],
  };
  // Inspect the RAW recovered roster (maskCanonNames:false) so this test verifies provenance survival,
  // independent of the display-name placeholder policy (which is covered by its own test below).
  const pack = createContentPack(buildContentPackDataFromSource(source, { maxUnits: 2, maskCanonNames: false }));

  const officialAnchor = pack.characterById(1);
  assert.equal(officialAnchor.nameKo, '라인하르트');
  assert.deepEqual(officialAnchor.source, ['manual']);
  assert.equal(officialAnchor.provenance.name.authority, 'revival_roster');
  assert.equal(officialAnchor.provenance.stats.authority, 'revival_roster');
  assert.equal(officialAnchor.provenance.stats.originalServerData, false);
  assert.equal(officialAnchor.provenance.portrait.authority, 'official_anchor');
  assert.deepEqual(officialAnchor.provenance.portrait.source, ['content/roster/face-name-map.json']);

  const assigned = pack.characterById(2);
  assert.deepEqual(assigned.source, ['ivex-real', 'manual-duty-card']);
  assert.equal(assigned.provenance.stats.originalServerData, false);
  assert.equal(assigned.provenance.portrait.authority, 'house_rule');
  assert.equal(assigned.provenance.portrait.method, 'deterministic_pool');
});

test('canon display names are masked to placeholders by default — no unverified canon name is claimed', () => {
  const source = {
    listCharacters: () => [{
      id: 1, name_ja: 'ラインハルト', name_romaji: 'Reinhard', name_kr: '라인하르트',
      faction: 'empire', rank_ja: '元帥', source: 'manual',
      tochi: 100, seiji: 98, unei: 99, joho: 80, shiki: 100, kido: 90, kogeki: 88, bogyo: 86,
    }],
    listSystems: () => [],
  };
  // default maskCanonNames=true: even the recovered roster names are unverified, so the DISPLAY name is a
  // placeholder; the recovered name survives only as a (non-displayed) candidate for a future mapping.
  const data = buildContentPackDataFromSource(source, { maxUnits: 1 });
  const c = data.characters.find((x) => x.id === 1);
  assert.equal(c.name, '1', 'display name is a placeholder ("1"), not the unverified canon name');
  assert.equal(c.nameKo, null);
  assert.equal(c.candidateName, 'ラインハルト', 'recovered name preserved as candidate');
  assert.equal(c.identityRecovered, false);
  assert.equal(c.provenance.name.authority, 'placeholder_unrecovered_identity');
  assert.equal(c.provenance.name.originalServerData, false);
  // only the NAME is masked — stats provenance still carries its real authority
  assert.equal(c.provenance.stats.authority, 'revival_roster');

  // the identity-unrecovered canon (原作/O-group) portrait roster is appended and also placeholder-named
  const canon = data.characters.filter((x) => x.isCanon && x.identityRecovered === false);
  assert.ok(canon.length > 100, 'the large O-group canon portrait roster exists in-world');
});
