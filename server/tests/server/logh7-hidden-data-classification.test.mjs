import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  classifyHiddenDataCandidates,
  writeHiddenDataClassification,
} from '../../src/server/logh7-hidden-data-classification.mjs';

test('hidden-data classifier validates file-like signatures and deduplicates extracted copies', () => {
  const workspaceRoot = mkdtempSync(join(tmpdir(), 'logh7-hidden-classify-'));
  try {
    const rawPath = join(workspaceRoot, 'raw.bin');
    const extractedPath = join(workspaceRoot, 'extract', 'image.bmp');
    mkdirSync(join(workspaceRoot, 'extract'), { recursive: true });

    const bmp = buildBmpFixture();
    const pdf = Buffer.from('%PDF-1.2\n1 0 obj\n<<>>\nendobj\n%%EOF\n', 'ascii');
    const raw = Buffer.concat([
      Buffer.from('lead', 'ascii'),
      bmp,
      Buffer.alloc(7, 0),
      pdf,
      Buffer.alloc(11, 0),
      buildMzPeFixture(),
    ]);
    writeFileSync(rawPath, raw);
    writeFileSync(extractedPath, bmp);

    const bmpOffset = 4;
    const pdfOffset = 4 + bmp.length + 7;
    const mzOffset = pdfOffset + pdf.length + 11;
    const manifest = {
      id: 'logh7-hidden-data-candidates',
      status: 'scanned',
      sources: [],
      candidates: [
        candidate('raw-bin', 'raw-sector-bin', rawPath, 'BMP', bmpOffset),
        candidate('raw-bin', 'raw-sector-bin', rawPath, 'PDF', pdfOffset),
        candidate('raw-bin', 'raw-sector-bin', rawPath, 'MZ', mzOffset),
        candidate('extract', 'installshield-extract', extractedPath, 'BMP', 0),
      ],
    };

    const classification = classifyHiddenDataCandidates({ manifest, workspaceRoot });

    assert.equal(classification.id, 'logh7-hidden-data-classification');
    assert.equal(classification.inputCandidateCount, 4);
    assert.equal(classification.summary.byValidation.validated, 4);
    assert.equal(classification.summary.byVisibility.rawOnly, 2);
    assert.equal(classification.summary.byVisibility.alreadyExtracted, 2);
    assert.equal(classification.dedupGroups.length, 3);

    const duplicateGroup = classification.dedupGroups.find((group) => group.count === 2);
    assert.equal(duplicateGroup.signatureId, 'BMP');
    assert.deepEqual(duplicateGroup.sourceRoles.sort(), ['installshield-extract', 'raw-sector-bin']);

    const mzRecord = classification.records.find((record) => record.signatureId === 'MZ');
    assert.equal(mzRecord.validation, 'validated');
    assert.equal(mzRecord.validationKind, 'mz-pe-header');
    assert.equal(mzRecord.carveLength, null);
  } finally {
    rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test('hidden-data classifier records missing source candidates as unvalidated', () => {
  const workspaceRoot = mkdtempSync(join(tmpdir(), 'logh7-hidden-missing-classify-'));
  try {
    const manifest = {
      id: 'logh7-hidden-data-candidates',
      status: 'partial',
      sources: [],
      candidates: [
        candidate('missing', 'raw-sector-bin', join(workspaceRoot, 'missing.bin'), 'BMP', 0),
      ],
    };

    const classification = classifyHiddenDataCandidates({ manifest, workspaceRoot });

    assert.equal(classification.status, 'partial');
    assert.equal(classification.records[0].validation, 'source-missing');
    assert.equal(classification.summary.byValidation.sourceMissing, 1);
  } finally {
    rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test('hidden-data classifier rejects malformed candidate manifests', () => {
  assert.throws(
    () => classifyHiddenDataCandidates({ manifest: { id: 'wrong', candidates: [] } }),
    /hidden-data candidates manifest/,
  );
});

test('hidden-data classifier writes generated manifest JSON', () => {
  const workspaceRoot = mkdtempSync(join(tmpdir(), 'logh7-hidden-write-classify-'));
  try {
    const sourcePath = join(workspaceRoot, 'tiny.pdf');
    const outPath = join(workspaceRoot, 'generated', 'classification.json');
    writeFileSync(sourcePath, Buffer.from('%PDF-1.0\n%%EOF\n', 'ascii'));

    const classification = classifyHiddenDataCandidates({
      manifest: {
        id: 'logh7-hidden-data-candidates',
        status: 'scanned',
        candidates: [candidate('pdf', 'fixture', sourcePath, 'PDF', 0)],
      },
      workspaceRoot,
    });
    writeHiddenDataClassification(outPath, classification);

    assert.equal(classification.summary.bySignature.PDF.validated, 1);
  } finally {
    rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

function candidate(sourceId, sourceRole, sourcePath, signatureId, offset) {
  return {
    sourceId,
    sourceRole,
    sourcePath,
    signatureId,
    signatureLabel: signatureId,
    offset,
    classification: 'unverified-signature-candidate',
    provenance: 'P0-candidate',
  };
}

function buildBmpFixture() {
  const bytes = Buffer.alloc(70, 0);
  bytes.write('BM', 0, 'ascii');
  bytes.writeUInt32LE(bytes.length, 2);
  bytes.writeUInt32LE(54, 10);
  bytes.writeUInt32LE(40, 14);
  bytes.writeInt32LE(1, 18);
  bytes.writeInt32LE(1, 22);
  bytes.writeUInt16LE(1, 26);
  bytes.writeUInt16LE(24, 28);
  return bytes;
}

function buildMzPeFixture() {
  const bytes = Buffer.alloc(128, 0);
  bytes.write('MZ', 0, 'ascii');
  bytes.writeUInt32LE(0x40, 0x3c);
  bytes.write('PE\0\0', 0x40, 'binary');
  return bytes;
}
