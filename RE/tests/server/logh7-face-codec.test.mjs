import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  decodeFace,
  encodeFace,
  isPlayerSelectableFace,
  isCanonFace,
  validateCreateFace,
} from '../../src/server/logh7-face-codec.mjs';

test('encode/decode round-trips for every atlas', () => {
  for (const atlas of ['oem', 'oam', 'o', 'gem', 'gef', 'gam', 'gaf']) {
    const face = encodeFace(atlas, 3);
    const d = decodeFace(face);
    assert.equal(d.atlas, atlas, `${atlas} round-trip`);
    assert.equal(d.index, 3);
  }
});

test('Yang anchor oam/79 == face 100079 (O-group)', () => {
  assert.equal(encodeFace('oam', 79), 100079);
  const d = decodeFace(100079);
  assert.equal(d.atlas, 'oam');
  assert.equal(d.group, 'O');
});

test('G-group faces are player-selectable, O-group are canon-only', () => {
  assert.equal(isPlayerSelectableFace(encodeFace('gem', 5)), true);
  assert.equal(isCanonFace(encodeFace('gem', 5)), false);
  assert.equal(isPlayerSelectableFace(encodeFace('oem', 8)), false);
  assert.equal(isCanonFace(encodeFace('oem', 8)), true);
});

test('validateCreateFace accepts G-group, rejects O-group / undecodable, allows unset 0', () => {
  assert.equal(validateCreateFace(encodeFace('gam', 3)).ok, true);
  assert.equal(validateCreateFace(0).ok, true); // unset
  const canon = validateCreateFace(encodeFace('oem', 8));
  assert.equal(canon.ok, false);
  assert.match(canon.reason, /canon/);
  assert.equal(validateCreateFace(999999999).ok, false); // undecodable
});
