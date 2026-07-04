import test from 'node:test';
import assert from 'node:assert/strict';

import { buildNullGalaxyTemplate } from '../../src/server/logh7-null-galaxy-template.mjs';

test('Null_galaxy template extracts only star spectral-class nodes', () => {
  const template = buildNullGalaxyTemplate({ catalog: fixtureCatalog() });

  assert.equal(template.id, 'logh7-null-galaxy-template');
  assert.equal(template.source.positionStatus, 'not-in-mdx');
  assert.equal(template.headerNodeCount, 5);
  assert.equal(template.starCount, 3);
  assert.deepEqual(template.spectralClasses, { A: 1, G: 1, O: 1 });
  assert.deepEqual(template.stars, [
    { ordinal: 1, spectralClass: 'G', nodeName: 'star_01_G', mdxNodeIndex: 0, mdxOffset: 0x58 },
    { ordinal: 2, spectralClass: 'O', nodeName: 'star_02_O', mdxNodeIndex: 1, mdxOffset: 0x140 },
    { ordinal: 3, spectralClass: 'A', nodeName: 'star_03_A', mdxNodeIndex: 2, mdxOffset: 0x228 },
  ]);
  assert.deepEqual(template.nonStarTemplateNodes, [
    { index: 3, offset: 0x310, name: 'bh_01' },
    { index: 4, offset: 0x3f8, name: 'ns_01' },
  ]);
});

test('Null_galaxy template fails when source MDX is absent from catalog', () => {
  assert.throws(
    () => buildNullGalaxyTemplate({ catalog: { id: 'logh7-mdx-catalog', files: [] } }),
    /Null_galaxy\.mdx missing/,
  );
});

function fixtureCatalog() {
  return {
    id: 'logh7-mdx-catalog',
    files: [
      {
        path: 'strategy/Null_galaxy.mdx',
        sha1: '0'.repeat(40),
        header: [{ slot: 0, pointer: 0x1e300a0, count: 5 }],
        nodeNames: [
          { index: 0, offset: 0x58, name: 'star_01_G' },
          { index: 1, offset: 0x140, name: 'star_02_O' },
          { index: 2, offset: 0x228, name: 'star_03_A' },
          { index: 3, offset: 0x310, name: 'bh_01' },
          { index: 4, offset: 0x3f8, name: 'ns_01' },
        ],
      },
    ],
  };
}
