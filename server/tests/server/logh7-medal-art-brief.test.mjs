import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  buildMedalArtBrief,
  writeMedalArtBrief,
} from '../../src/server/logh7-medal-art-brief.mjs';

test('medal art brief separates Alliance upscale and Empire creation policy', () => {
  const brief = buildMedalArtBrief();

  assert.equal(brief.id, 'logh7-medal-art-production-brief');
  assert.equal(brief.summary.allianceOriginalUpscaleCount, 15);
  assert.equal(brief.summary.allianceVariantIfUniqueNeededCount, 11);
  assert.equal(brief.summary.empireCreateCount, 26);
  assert.match(brief.policy.alliance, /Upscale\/remaster those 15 first/);
  assert.match(brief.policy.alliance, /flag pentagon/);
  assert.match(brief.policy.empire, /26 original Empire decoration names/);
  assert.deepEqual(brief.allianceEmblemReference, {
    path: 'client-unity/Assets/ArtSource/reference/logh7-alliance-flag-pentagon-reference.png',
    sha256: '81d5c36e3a4455214c276250e60d88e4e87f722dad8b1a5ba4ca8ef2acad7e0d',
    dimensions: { width: 560, height: 350 },
    emblem: 'central gold pentagon mark with black internal facets',
  });

  assert.equal(brief.alliance[0].productionAction, 'upscale-original');
  assert.equal(brief.alliance[0].sourceStem, 'm_f001');
  assert.equal(brief.alliance[15].productionAction, 'create-variant-if-unique-icon-needed');
  assert.equal(
    brief.alliance[15].emblemReference.path,
    'client-unity/Assets/ArtSource/reference/logh7-alliance-flag-pentagon-reference.png',
  );

  assert.equal(brief.empire[0].id, 767);
  assert.equal(brief.empire[0].names.ja, '大双頭鷲勲章');
  assert.equal(brief.empire[0].productionAction, 'create-name-driven-imperial-medal');
  assert.equal(brief.empire[0].family, 'grand-order');
	assert(brief.empire[0].promptKernel.includes('exact supplied Imperial double-eagle crest if a crest appears'));
	assert.deepEqual(brief.empire[0].imperialCrestReference, {
		sourceImage: 'client-unity/Assets/ArtSource/reference/logh7-imperial-double-eagle-reference.jpg',
		mask: 'client-unity/Assets/ArtSource/reference/imperial-crest/logh7-imperial-double-eagle-mask-gold.png',
		placement: 'large-visible-faction-mark',
		generatedReplacementAllowed: false,
	});
	assert.deepEqual(brief.empire[0].shipMotifReference, {
		finalLargeShipMotifSource: 'original-ship-ge-mdx-render',
		sourceRoot: '.omo/work/logh7-installed/data/model/Ship/GE/',
		thumbnailUse: 'proof-only',
		generatedShipSilhouettesAllowed: false,
	});
	assert.equal(
		brief.empire[0].sourceLockManifest,
		'server/content/generated/logh7-imperial-medal-source-lock-manifest.json',
	);
	assert(brief.empire[12].promptKernel.some((term) => term.includes('original Ship/GE MDX render')));
	assert.equal(brief.empire[12].shipMotifReference.finalLargeShipMotifSource, 'original-ship-ge-mdx-render');
});

test('medal art brief writes a generated artifact', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'logh7-medal-art-brief-'));
  const out = join(tmp, 'brief.json');

  writeMedalArtBrief(out, buildMedalArtBrief());

  const written = JSON.parse(readFileSync(out, 'utf8'));
  assert.equal(written.empire.at(-1).id, 792);
  assert.equal(written.empire.at(-1).family, 'staff-officer');
});
