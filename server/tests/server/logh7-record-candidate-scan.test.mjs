import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  scanRecordCandidates,
  writeRecordCandidateScan,
} from '../../src/server/logh7-record-candidate-scan.mjs';

test('record-candidate scanner reports coordinate and roster text candidates without promotion', () => {
  const workspaceRoot = mkdtempSync(join(tmpdir(), 'logh7-record-candidates-'));
  try {
    const sourceRoot = join(workspaceRoot, 'payload');
    mkdirSync(sourceRoot, { recursive: true });
    writeFileSync(join(sourceRoot, 'scenario.dat'), buildCoordinateFixture(72));
    writeFileSync(
      join(sourceRoot, 'roster.txt'),
      'Reinhard Yang Wenli Kircheis Mittermeyer Reuenthal Oberstein\n',
    );
    writeFileSync(join(sourceRoot, 'noise.bmp'), buildCoordinateFixture(90));

    const scan = scanRecordCandidates({
      sourceRoots: [{ id: 'payload', role: 'test-payload', path: sourceRoot }],
      workspaceRoot,
      seeds: {
        systemTerms: ['Heinessen', 'Iserlohn', 'Odin'],
        characterTerms: [
          'Reinhard',
          'Yang Wenli',
          'Kircheis',
          'Mittermeyer',
          'Reuenthal',
          'Oberstein',
        ],
      },
      minCoordinatePairs: 48,
      minRosterTermHits: 4,
    });

    assert.equal(scan.id, 'logh7-record-candidate-scan');
    assert.equal(scan.status, 'scanned');
    assert.equal(
      scan.categories.systemPositions.canonicalStatus,
      'not-confirmed-new-hidden-system-position-table',
    );
    assert.equal(
      scan.categories.originalCharacterRoster.canonicalStatus,
      'not-confirmed-new-hidden-original-character-roster',
    );
    assert.equal(scan.categories.systemPositions.coordinateClusters.length, 1);
    assert.equal(scan.categories.systemPositions.coordinateClusters[0].pairCount, 72);
    assert.equal(scan.categories.originalCharacterRoster.textClusters.length, 1);
    assert.equal(scan.categories.originalCharacterRoster.textClusters[0].uniqueTermCount, 6);
    assert.equal(scan.summary.excludedMediaFiles, 1);
  } finally {
    rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test('record-candidate scanner preserves missing roots as partial evidence', () => {
  const workspaceRoot = mkdtempSync(join(tmpdir(), 'logh7-record-candidates-'));
  try {
    const scan = scanRecordCandidates({
      sourceRoots: [
        { id: 'missing', role: 'test-payload', path: join(workspaceRoot, 'missing') },
      ],
      workspaceRoot,
    });

    assert.equal(scan.status, 'partial');
    assert.equal(scan.sources[0].status, 'missing');
  } finally {
    rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test('record-candidate scanner writes a manifest', () => {
  const workspaceRoot = mkdtempSync(join(tmpdir(), 'logh7-record-candidates-'));
  try {
    const scan = scanRecordCandidates({ sourceRoots: [], workspaceRoot });
    const outPath = join(workspaceRoot, 'out', 'record-candidates.json');
    writeRecordCandidateScan(outPath, scan);
    assert.equal(scan.summary.scannedFiles, 0);
  } finally {
    rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

function buildCoordinateFixture(pairCount) {
  const bytes = Buffer.alloc(pairCount * 4);
  for (let index = 0; index < pairCount; index += 1) {
    bytes.writeUInt16LE((index * 7) % 100, index * 4);
    bytes.writeUInt16LE((index * 5) % 50, index * 4 + 2);
  }
  return bytes;
}
