import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const PLACE_FACILITIES_PATH = fileURLToPath(
  new URL('../../content/manual/place-facilities.json', import.meta.url),
);

function loadPlaceFacilities() {
  return JSON.parse(readFileSync(PLACE_FACILITIES_PATH, 'utf8'));
}

test('manual place facilities expose canonical facility and spot taxonomy', () => {
  const data = loadPlaceFacilities();
  assert.equal(data._grade, 'P1');
  assert.ok(data._source.includes('gin7manual-alt.pdf'));

  const spotTypes = new Set(data.spotTypes.map((type) => type.id));
  for (const type of ['free', 'restricted', 'rank_limited', 'guarded', 'closed']) {
    assert.ok(spotTypes.has(type), `spot type ${type} present`);
  }

  assert.ok(data.facilities.length >= 20, 'alt manual facility table loaded');
  const byId = new Map(data.facilities.map((facility) => [facility.id, facility]));

  assert.equal(byId.get('government_office')?.ja, '政庁');
  assert.ok(byId.get('government_office')?.commandDomains.includes('politics'));
  assert.ok(byId.get('government_office')?.spots.some((spot) => spot.type === 'closed'));

  assert.equal(byId.get('spaceport')?.ja, '宇宙港');
  assert.ok(byId.get('spaceport')?.spots.some((spot) => spot.id === 'flagship_pier'));

  assert.equal(byId.get('officer_academy')?.ja, '士官学校');
  assert.ok(byId.get('officer_academy')?.commandDomains.includes('training'));

  for (const facility of data.facilities) {
    assert.ok(facility.id, 'facility has id');
    assert.ok(facility.ja, `${facility.id} has Japanese label`);
    assert.ok(Array.isArray(facility.spots) && facility.spots.length > 0, `${facility.id} has spots`);
    for (const spot of facility.spots) {
      assert.ok(spot.id, `${facility.id} spot has id`);
      assert.ok(spot.ja, `${facility.id} spot has Japanese label`);
      assert.ok(spotTypes.has(spot.type), `${facility.id}/${spot.id} references known spot type`);
    }
  }
});

test('manual place movement commands require planet facility and spot targets', () => {
  const data = loadPlaceFacilities();
  const byId = new Map(data.movementCommands.map((command) => [command.id, command]));

  assert.equal(byId.get('warp_navigation')?.targetKind, 'gridCell');
  assert.equal(byId.get('make_port')?.targetKind, 'planet');
  assert.equal(byId.get('long_distance_move')?.targetKind, 'facility');
  assert.equal(byId.get('short_distance_move')?.targetKind, 'spot');
  assert.equal(byId.get('long_distance_move')?.card, '個人カード');
  assert.equal(byId.get('short_distance_move')?.card, '個人カード');
});
