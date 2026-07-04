import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildHiddenDataWatchlist,
  writeHiddenDataWatchlist,
} from '../../src/server/logh7-hidden-data-watchlist.mjs';

test('hidden-data watchlist reports system-position candidates without canonical promotion', () => {
  const workspaceRoot = mkdtempSync(join(tmpdir(), 'logh7-hidden-watchlist-'));
  try {
    writeJson(join(workspaceRoot, 'server/content/galaxy.json'), {
      _source: 'manual-derived test fixture',
      systems: [
        { id: 1, name: 'Heinessen', canonCol: 10, canonRow: 11 },
      ],
    });
    writeJson(join(workspaceRoot, 'server/content/generated/logh7-null-galaxy-template.json'), {
      source: {
        positionStatus: 'not-in-mdx',
        note: 'Template node names only.',
      },
      starCount: 79,
      stars: [{ nodeName: 'star_00_G' }],
    });

    const watchlist = buildHiddenDataWatchlist({
      classification: classificationWith([
        record('archive-raw-bin', 'artifacts/logh7-cd/Logh7.bin', 'BMP', 'rawOnly'),
        record('installshield', 'data/strategy/galaxy/system_positions.dat', 'MZ', 'unvalidated'),
      ]),
      workspaceRoot,
    });

    const systemPositions = watchlist.categories.find((category) => (
      category.id === 'systemPositions'
    ));
    assert.equal(systemPositions.mustReport, true);
    assert.equal(
      systemPositions.canonicalStatus,
      'not-confirmed-new-hidden-system-position-table',
    );
    assert.equal(systemPositions.hiddenCandidateSummary.total, 1);
    assert.equal(systemPositions.contentFindings.length, 2);
    assert.equal(systemPositions.contentFindings[0].systemsCount, 1);
    assert.equal(systemPositions.contentFindings[1].positionStatus, 'not-in-mdx');
  } finally {
    rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test('hidden-data watchlist reports face and roster material without treating portraits as roster', () => {
  const workspaceRoot = mkdtempSync(join(tmpdir(), 'logh7-hidden-watchlist-'));
  try {
    writeJson(join(workspaceRoot, 'server/content/character-roster.json'), {
      _sources: ['manual roster', 'external sample'],
      _count: 2,
      characters: [{ id: 1 }, { id: 2 }],
    });
    writeJson(join(workspaceRoot, 'server/content/generated/logh7-face-tcf-catalog.json'), {
      archiveCount: 7,
      archiveGroups: {
        'G-group-player': 4,
        'O-group-canon': 3,
      },
    });

    const watchlist = buildHiddenDataWatchlist({
      classification: classificationWith([
        record('installshield', 'data/image/Face/o.tcf', 'BMP', 'unvalidated'),
        record('installshield', 'data/image/Face/unknownface.tga', 'MZ', 'unvalidated'),
      ]),
      workspaceRoot,
    });

    const roster = watchlist.categories.find((category) => (
      category.id === 'originalCharacterRoster'
    ));
    assert.equal(roster.mustReport, true);
    assert.equal(
      roster.canonicalStatus,
      'not-confirmed-new-hidden-original-character-roster',
    );
    assert.equal(roster.hiddenCandidateSummary.total, 2);
    assert.equal(roster.contentFindings.length, 2);
    assert.equal(roster.contentFindings[0].charactersCount, 2);
    assert.equal(roster.contentFindings[1].count, 7);
  } finally {
    rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test('hidden-data watchlist rejects malformed classification manifests and writes reports', () => {
  const workspaceRoot = mkdtempSync(join(tmpdir(), 'logh7-hidden-watchlist-'));
  try {
    assert.throws(
      () => buildHiddenDataWatchlist({ classification: { id: 'other' }, workspaceRoot }),
      /Expected logh7-hidden-data-classification/,
    );

    const report = buildHiddenDataWatchlist({
      classification: classificationWith([]),
      workspaceRoot,
    });
    const outPath = join(workspaceRoot, 'out/watchlist.json');
    writeHiddenDataWatchlist(outPath, report);
    assert.equal(report.status, 'reported');
  } finally {
    rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

function classificationWith(records) {
  return {
    id: 'logh7-hidden-data-classification',
    status: 'classified',
    records,
  };
}

function record(sourceId, sourcePath, signatureId, visibility) {
  return {
    sourceId,
    sourceRole: 'test',
    sourcePath,
    signatureId,
    offset: 0,
    validation: visibility === 'unvalidated' ? 'invalid' : 'validated',
    validationKind: 'test',
    carveLength: null,
    visibility,
    provenance: 'P0-candidate',
  };
}

function writeJson(path, value) {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}
