import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildArchiveFileRecord,
  convertMode2BinToIso,
  extractCdMedia,
} from '../../src/server/logh7-cd-media.mjs';

test('CD media extraction verifies Archive-style BIN/CUE and converts MODE2 sectors', () => {
  const workspaceRoot = mkdtempSync(join(tmpdir(), 'logh7-cd-media-'));
  try {
    const mediaRoot = join(workspaceRoot, 'artifacts', 'logh7-cd');
    const workRoot = join(workspaceRoot, '.omo', 'work', 'logh7-cd-extract');
    mkdirSync(mediaRoot, { recursive: true });

    const payloadA = Buffer.alloc(2048, 0x41);
    const payloadB = Buffer.alloc(2048, 0x42);
    const bin = Buffer.concat([buildMode2Sector(payloadA), buildMode2Sector(payloadB)]);
    const cue = Buffer.from('FILE "Fixture.bin" BINARY\n  TRACK 01 MODE2/2352\n', 'ascii');
    writeFileSync(join(mediaRoot, 'Fixture.bin'), bin);
    writeFileSync(join(mediaRoot, 'Fixture.cue'), cue);

    const provenance = {
      id: 'logh7-archive-org',
      sourceUrl: 'https://archive.org/download/logh-7',
      files: [
        buildArchiveFileRecord('Fixture.bin', bin),
        buildArchiveFileRecord('Fixture.cue', cue),
      ],
    };

    const manifest = extractCdMedia({
      mediaRoot,
      workRoot,
      provenance,
      workspaceRoot,
    });

    assert.equal(manifest.id, 'logh7-cd-media');
    assert.equal(manifest.media.status, 'verified');
    assert.equal(manifest.iso.status, 'converted');
    assert.equal(manifest.iso.sectors, 2);
    assert.equal(manifest.iso.outputBytes, 4096);
    assert.equal(manifest.iso.sha1, sha1(Buffer.concat([payloadA, payloadB])));
    assert.equal(manifest.canonicalPromotion.status, 'blocked-pending-crosscheck');
    assert.ok(existsSync(join(workRoot, 'Fixture_mode2_2048.iso')));
    assert.ok(existsSync(join(workRoot, 'logh7-cd-media-manifest.json')));
  } finally {
    rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test('CD media extraction fails closed when original media is missing', () => {
  const workspaceRoot = mkdtempSync(join(tmpdir(), 'logh7-cd-missing-'));
  try {
    const missingRoot = join(workspaceRoot, 'missing-media');
    const workRoot = join(workspaceRoot, '.omo', 'work', 'logh7-cd-extract');
    const provenance = {
      id: 'logh7-archive-org',
      sourceUrl: 'https://archive.org/download/logh-7',
      files: [
        {
          name: 'Missing.bin',
          size: 2352,
          md5: '0'.repeat(32),
          sha1: '1'.repeat(40),
        },
      ],
    };

    const manifest = extractCdMedia({
      mediaRoot: missingRoot,
      workRoot,
      provenance,
      workspaceRoot,
    });

    assert.equal(manifest.media.status, 'source-missing');
    assert.equal(manifest.iso.status, 'blocked');
    assert.equal(manifest.canonicalPromotion.status, 'blocked-pending-source');
  } finally {
    rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test('MODE2 converter rejects non-sector-aligned input', () => {
  const workspaceRoot = mkdtempSync(join(tmpdir(), 'logh7-cd-bad-sector-'));
  try {
    const binPath = join(workspaceRoot, 'bad.bin');
    const isoPath = join(workspaceRoot, 'bad.iso');
    writeFileSync(binPath, Buffer.alloc(2351));

    assert.throws(
      () => convertMode2BinToIso({ binPath, isoPath }),
      /multiple of 2352/,
    );
  } finally {
    rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

function buildMode2Sector(payload) {
  assert.equal(payload.length, 2048);
  const sector = Buffer.alloc(2352, 0);
  payload.copy(sector, 24);
  return sector;
}

function sha1(bytes) {
  return createHash('sha1').update(bytes).digest('hex');
}
