import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  scanHiddenDataCandidates,
  writeHiddenDataCandidates,
} from '../../src/server/logh7-hidden-data-scan.mjs';

test('hidden-data scanner records raw signatures with source provenance', () => {
  const workspaceRoot = mkdtempSync(join(tmpdir(), 'logh7-hidden-scan-'));
  try {
    const rawPath = join(workspaceRoot, 'Logh7.bin');
    const isoPath = join(workspaceRoot, 'Logh7.iso');
    writeFileSync(rawPath, Buffer.concat([
      Buffer.from('lead', 'ascii'),
      Buffer.from('CD001', 'ascii'),
      Buffer.alloc(8, 0),
      Buffer.from('MSCF', 'ascii'),
      Buffer.alloc(16, 0),
      Buffer.from('MZ', 'ascii'),
      Buffer.alloc(62, 0),
      Buffer.from('PE\0\0', 'binary'),
      Buffer.from('tail', 'ascii'),
    ]));
    writeFileSync(isoPath, Buffer.concat([
      Buffer.from('%PDF', 'ascii'),
      Buffer.alloc(4, 0),
      Buffer.from('OggS', 'ascii'),
      Buffer.alloc(4, 0),
      Buffer.from([0x89, 0x50, 0x4e, 0x47]),
    ]));

    const scan = scanHiddenDataCandidates({
      sources: [
        { id: 'raw-bin', role: 'raw-sector-bin', path: rawPath },
        { id: 'converted-iso', role: 'mode2-2048-iso', path: isoPath },
      ],
      workspaceRoot,
    });

    assert.equal(scan.id, 'logh7-hidden-data-candidates');
    assert.equal(scan.status, 'scanned');
    assert.equal(scan.sources.length, 2);
    assert.equal(scan.signatureSummary.CD001.count, 1);
    assert.equal(scan.signatureSummary.MSCF.count, 1);
    assert.equal(scan.signatureSummary.MZ.count, 1);
    assert.equal(scan.signatureSummary.PE.count, 1);
    assert.equal(scan.signatureSummary.PDF.count, 1);
    assert.equal(scan.signatureSummary.OGG.count, 1);
    assert.equal(scan.signatureSummary.PNG.count, 1);
    assert.ok(scan.candidates.every((candidate) => candidate.provenance === 'P0-candidate'));
  } finally {
    rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test('hidden-data scanner preserves missing sources instead of succeeding silently', () => {
  const workspaceRoot = mkdtempSync(join(tmpdir(), 'logh7-hidden-missing-'));
  try {
    const scan = scanHiddenDataCandidates({
      sources: [
        { id: 'missing-bin', role: 'raw-sector-bin', path: join(workspaceRoot, 'missing.bin') },
      ],
      workspaceRoot,
    });

    assert.equal(scan.status, 'partial');
    assert.equal(scan.sources[0].status, 'missing');
    assert.equal(scan.candidates.length, 0);
  } finally {
    rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test('hidden-data scanner writes deterministic generated manifest JSON', () => {
  const workspaceRoot = mkdtempSync(join(tmpdir(), 'logh7-hidden-write-'));
  try {
    const sourcePath = join(workspaceRoot, 'tiny.bin');
    const outPath = join(workspaceRoot, 'generated', 'hidden.json');
    mkdirSync(join(workspaceRoot, 'generated'), { recursive: true });
    writeFileSync(sourcePath, Buffer.from('BMLOGHMDX', 'ascii'));

    const scan = scanHiddenDataCandidates({
      sources: [{ id: 'tiny', role: 'fixture', path: sourcePath }],
      workspaceRoot,
    });
    writeHiddenDataCandidates(outPath, scan);

    assert.deepEqual(scan.signatureSummary.BMP, { count: 1 });
    assert.deepEqual(scan.signatureSummary.MDX, { count: 1 });
  } finally {
    rmSync(workspaceRoot, { recursive: true, force: true });
  }
});
