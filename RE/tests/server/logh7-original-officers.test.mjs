import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCanonPortraitRoster,
  listOGroupFaces,
  buildOGroupFacePool,
  loadOriginalFaceCodes,
} from '../../src/server/logh7-original-officers.mjs';
import { decodeFace } from '../../src/server/logh7-face-codec.mjs';

test('canon portrait roster fills every field except the unrecovered name (placeholder "1".."N")', () => {
  const roster = buildCanonPortraitRoster({ startId: 0x4000, max: 10 });
  assert.equal(roster.length, 10);
  roster.forEach((c, i) => {
    assert.equal(c.name, String(i + 1), 'identity is unrecovered -> placeholder name');
    assert.equal(c.id, 0x4000 + i);
    assert.equal(c.isCanon, true, 'these are 原作/canon characters, not fabricated officers');
    assert.equal(c.identityRecovered, false);
    assert.equal(c.rank, 'Officer');
    assert.ok(Array.isArray(c.abilities) && c.abilities.length === 8 && c.abilities.every((v) => v === 50), 'stats present, not blank');
    assert.ok(Number.isInteger(c.portraitIndex), 'carries a real shipped portrait code');
  });
});

test('every roster portrait is a REAL O-group (原作) face, never a G-group player face', () => {
  const roster = buildCanonPortraitRoster({ max: 50 });
  for (const c of roster) {
    const decoded = decodeFace(c.portraitIndex);
    assert.ok(decoded, `portrait ${c.portraitIndex} decodes to a real atlas slot`);
    assert.equal(decoded.group, 'O', 'canon roster uses only O-group faces (oem/oam/o)');
  }
});

test('faction is reliable only for oem/oam; the o atlas is a mixed bucket (faction unrecovered)', () => {
  const roster = buildCanonPortraitRoster();
  const byAtlas = (atlas) => roster.filter((c) => decodeFace(c.portraitIndex)?.atlas === atlas);
  assert.ok(byAtlas('oem').every((c) => c.nationId === 0x500 && c.factionRecovered === true), 'oem -> empire (verified)');
  assert.ok(byAtlas('oam').every((c) => c.nationId === 0x501 && c.factionRecovered === true), 'oam -> alliance (verified)');
  // o = women (either power) + neutral/Phezzan + misc: faction & sex are NOT encoded, so never claimed
  const o = byAtlas('o');
  assert.ok(o.length > 0);
  assert.ok(o.every((c) => c.factionRecovered === false), 'o atlas faction is unrecovered (mixed bucket)');
  assert.ok(o.every((c) => c.provenance.faction.authority === 'placeholder_mixed_bucket'), 'o faction provenance is placeholder');
  assert.ok(o.every((c) => c.sex === null), 'o atlas sex is unknown (mixed)');
});

test('portrait is P1 (real shipped) but identity/name is P3 (unrecovered) — never original server data', () => {
  const [c] = buildCanonPortraitRoster({ max: 1 });
  assert.equal(c.provenance.portrait.tier, 'P1');
  assert.equal(c.provenance.portrait.originalServerData, false);
  assert.equal(c.provenance.name.tier, 'P3');
  assert.equal(c.provenance.name.originalServerData, false);
  assert.equal(c.provenance.stats.tier, 'P3');
});

test('excludeFaces drops portraits already tied to a named canon person (no double representation)', () => {
  const full = buildCanonPortraitRoster();
  const exclude = full.slice(0, 3).map((c) => c.portraitIndex);
  const trimmed = buildCanonPortraitRoster({ excludeFaces: exclude });
  assert.equal(trimmed.length, full.length - 3);
  for (const code of exclude) assert.ok(!trimmed.some((c) => c.portraitIndex === code));
});

test('the O-group pool is large (matches the ~446 shipped canon portraits)', () => {
  const faces = listOGroupFaces();
  // oem cap 199 + oam cap 95 + o cap 99 => 200 + 96 + 100 = 396 enumerable codes
  assert.equal(faces.length, 396);
  assert.equal(buildOGroupFacePool().length, 396);
  assert.ok(faces.every((f) => decodeFace(f.code)?.group === 'O'));
});

test('loadOriginalFaceCodes pulls O-group face codes from the canon face registry', () => {
  const registry = {
    records: [
      { name_ja: 'A', group: 'O', faceCode: 2 },
      { name_ja: 'B', group: 'O', faceCode: 114 },
      { name_ja: 'C', group: 'G', faceCode: 999 }, // not O-group -> excluded
      { name_ja: 'D', group: 'O', faceCode: 2 },   // duplicate -> excluded
    ],
  };
  assert.deepEqual(loadOriginalFaceCodes(registry), [2, 114]);
  assert.deepEqual(loadOriginalFaceCodes({}), []);
  assert.deepEqual(loadOriginalFaceCodes(null), []);
});
