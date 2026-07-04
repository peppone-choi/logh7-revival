import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  crossCheckRecordCandidates,
  writeRecordCandidateCrossCheck,
} from '../../src/server/logh7-record-candidate-crosscheck.mjs';

test('record-candidate cross-check marks coordinate clusters as possible only with strong overlap', () => {
  const workspaceRoot = mkdtempSync(join(tmpdir(), 'logh7-record-crosscheck-'));
  try {
    const bytes = Buffer.alloc(20 * 4);
    for (let index = 0; index < 20; index += 1) {
      bytes.writeUInt16LE(index, index * 4);
      bytes.writeUInt16LE(index + 1, index * 4 + 2);
    }
    const candidatePath = join(workspaceRoot, 'payload', 'coords.dat');
    mkdirSync(join(workspaceRoot, 'payload'), { recursive: true });
    writeFileSync(candidatePath, bytes);

    const recordScan = {
      id: 'logh7-record-candidate-scan',
      categories: {
        systemPositions: {
          coordinateClusters: [
            {
              sourcePath: rel(workspaceRoot, candidatePath),
              offset: 0,
              pairCount: 20,
            },
          ],
          textClusters: [],
        },
        originalCharacterRoster: {
          textClusters: [],
          abilityVectorClusters: [],
        },
      },
    };
    const galaxy = {
      systems: Array.from({ length: 20 }, (_, index) => ({
        system: `S${index}`,
        canonCol: index,
        canonRow: index + 1,
      })),
    };

    const crossCheck = crossCheckRecordCandidates({
      recordScan,
      galaxy,
      workspaceRoot,
      strongOverlapRatio: 0.8,
    });

    assert.equal(crossCheck.id, 'logh7-record-candidate-crosscheck');
    assert.equal(crossCheck.status, 'checked');
    assert.equal(crossCheck.systemPositions.coordinateChecks[0].classification, 'possible-system-position-table');
    assert.equal(crossCheck.systemPositions.coordinateChecks[0].bestOverlap.matches, 20);
    assert.equal(crossCheck.systemPositions.canonicalStatus, 'not-promoted-cross-check-required');
  } finally {
    rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test('record-candidate cross-check rejects weak coordinate overlap and reports roster absence', () => {
  const workspaceRoot = mkdtempSync(join(tmpdir(), 'logh7-record-crosscheck-'));
  try {
    const candidatePath = join(workspaceRoot, 'payload', 'coords.dat');
    mkdirSync(join(workspaceRoot, 'payload'), { recursive: true });
    writeFileSync(candidatePath, Buffer.alloc(12 * 4, 0));

    const crossCheck = crossCheckRecordCandidates({
      recordScan: {
        id: 'logh7-record-candidate-scan',
        categories: {
          systemPositions: {
            coordinateClusters: [
              {
                sourcePath: rel(workspaceRoot, candidatePath),
                offset: 0,
                pairCount: 12,
              },
            ],
            textClusters: [],
          },
          originalCharacterRoster: {
            textClusters: [],
            abilityVectorClusters: [],
          },
        },
      },
      galaxy: {
        systems: [{ system: 'A', canonCol: 1, canonRow: 2 }],
      },
      workspaceRoot,
    });

    assert.equal(crossCheck.systemPositions.coordinateChecks[0].classification, 'weak-overlap-coordinate-candidate');
    assert.equal(crossCheck.originalCharacterRoster.status, 'no-record-surface-roster-candidate');
  } finally {
    rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test('record-candidate cross-check writes a manifest', () => {
  const workspaceRoot = mkdtempSync(join(tmpdir(), 'logh7-record-crosscheck-'));
  try {
    const crossCheck = crossCheckRecordCandidates({
      recordScan: {
        id: 'logh7-record-candidate-scan',
        categories: {
          systemPositions: { coordinateClusters: [], textClusters: [] },
          originalCharacterRoster: { textClusters: [], abilityVectorClusters: [] },
        },
      },
      galaxy: { systems: [] },
      workspaceRoot,
    });
    const outPath = join(workspaceRoot, 'out', 'crosscheck.json');
    writeRecordCandidateCrossCheck(outPath, crossCheck);
    assert.equal(crossCheck.status, 'checked');
  } finally {
    rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

function rel(workspaceRoot, path) {
  return relative(workspaceRoot, path).replaceAll('\\', '/');
}
