import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  catalogTcfPortraitDirectory,
  decodeTcfPortraitPayload,
  encodeRgbaToBmp24,
  exportTcfPortraitBmps,
} from '../../src/server/logh7-tcf-portrait-catalog.mjs';

test('TCF portrait decoder reads 8-bit indexed BGRA pixels bottom-up', () => {
  const payload = buildPortraitPayload({
    width: 2,
    height: 2,
    indices: [0, 1, 1, 0],
  });

  const decoded = decodeTcfPortraitPayload(payload);

  assert.equal(decoded.status, 'decoded');
  assert.equal(decoded.width, 2);
  assert.equal(decoded.height, 2);
  assert.equal(decoded.bitsPerPixel, 8);
  assert.equal(decoded.expectedSize, 18 + 1024 + 4);
  assert.equal(decoded.extraBytes, 0);
  assert.equal(decoded.rgbaSampleHex, '060504ff030201ff030201ff060504ff');
  assert.match(decoded.paletteSha1, /^[0-9a-f]{40}$/);
  assert.match(decoded.indicesSha1, /^[0-9a-f]{40}$/);
  assert.match(decoded.rgbaSha1, /^[0-9a-f]{40}$/);
});

test('TCF portrait decoder rejects truncated pixel payloads conservatively', () => {
  const payload = buildPortraitPayload({
    width: 2,
    height: 2,
    indices: [0, 1, 1],
  });

  const decoded = decodeTcfPortraitPayload(payload);

  assert.equal(decoded.status, 'truncated-pixel-data');
  assert.equal(decoded.width, 2);
  assert.equal(decoded.height, 2);
  assert.equal(decoded.missingBytes, 1);
});

test('TCF portrait catalog decodes eligible archive slots and records failures', () => {
  const root = mkdtempSync(join(tmpdir(), 'logh7-tcf-portraits-'));
  try {
    const faceRoot = join(root, 'Face');
    mkdirSync(faceRoot);

    const decodedPayload = buildPortraitPayload({
      width: 2,
      height: 2,
      indices: [0, 1, 1, 0],
    });
    const truncatedPayload = buildPortraitPayload({
      width: 2,
      height: 2,
      indices: [0, 1, 1],
    });
    const firstOffset = 50;
    const secondOffset = firstOffset + decodedPayload.length;

    writeFileSync(
      join(faceRoot, 'tcf.hed'),
      buildHedFixture([
        [0, 0],
        [firstOffset, decodedPayload.length],
        [secondOffset, truncatedPayload.length],
        [99999, decodedPayload.length],
      ]),
    );

    writeFileSync(
      join(faceRoot, 'oam.tcf'),
      Buffer.concat([Buffer.alloc(firstOffset), decodedPayload, truncatedPayload]),
    );

    const catalog = catalogTcfPortraitDirectory({
      faceRoot,
      workspaceRoot: root,
    });

    assert.equal(catalog.status, 'present');
    assert.equal(catalog.hed.usedSlotCount, 3);
    assert.equal(catalog.archiveCount, 1);
    assert.equal(catalog.totals.decodedCount, 1);
    assert.equal(catalog.totals.outsideArchiveCount, 1);
    assert.deepEqual(catalog.totals.failureCounts, { 'truncated-pixel-data': 1 });

    const archive = catalog.archives[0];
    assert.equal(archive.group, 'O-group-canon');
    assert.equal(archive.decodedCount, 1);
    assert.equal(archive.portraits[0].slot, 1);
    assert.equal(archive.portraits[0].width, 2);
    assert.equal(archive.failureSamples[0].slot, 2);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('BMP encoder writes a 24-bit bottom-up image', () => {
  const rgba = Buffer.from([
    255, 0, 0, 255,
    0, 255, 0, 255,
    0, 0, 255, 255,
    255, 255, 255, 255,
  ]);

  const bmp = encodeRgbaToBmp24({ rgba, width: 2, height: 2 });

  assert.equal(bmp.toString('ascii', 0, 2), 'BM');
  assert.equal(bmp.readUInt32LE(2), 70);
  assert.equal(bmp.readUInt32LE(10), 54);
  assert.equal(bmp.readInt32LE(18), 2);
  assert.equal(bmp.readInt32LE(22), 2);
  assert.equal(bmp.readUInt16LE(28), 24);
  assert.equal(bmp.subarray(54, 70).toString('hex'), 'ff0000ffffff00000000ff00ff000000');
});

test('TCF portrait BMP exporter writes limited visual samples and manifest data', () => {
  const root = mkdtempSync(join(tmpdir(), 'logh7-tcf-export-'));
  try {
    const faceRoot = join(root, 'Face');
    const outDir = join(root, 'out');
    mkdirSync(faceRoot);

    const firstPayload = buildPortraitPayload({
      width: 2,
      height: 2,
      indices: [0, 1, 1, 0],
    });
    const secondPayload = buildPortraitPayload({
      width: 2,
      height: 2,
      indices: [1, 0, 0, 1],
    });
    const firstOffset = 50;
    const secondOffset = firstOffset + firstPayload.length;

    writeFileSync(
      join(faceRoot, 'tcf.hed'),
      buildHedFixture([
        [0, 0],
        [firstOffset, firstPayload.length],
        [secondOffset, secondPayload.length],
      ]),
    );
    writeFileSync(join(faceRoot, 'o.tcf'), Buffer.concat([Buffer.alloc(firstOffset), firstPayload, secondPayload]));

    const catalog = catalogTcfPortraitDirectory({ faceRoot, workspaceRoot: root });
    const manifest = exportTcfPortraitBmps({
      catalog,
      faceRoot,
      limitPerArchive: 1,
      outDir,
      workspaceRoot: root,
    });

    assert.equal(manifest.outputCount, 1);
    assert.equal(manifest.outputs[0].archive, 'o.tcf');
    assert.equal(manifest.outputs[0].slot, 1);
    assert.equal(manifest.outputs[0].width, 2);
    assert.equal(manifest.outputs[0].height, 2);
    assert.match(manifest.outputs[0].sha1, /^[0-9a-f]{40}$/);
    assert.equal(existsSync(join(root, manifest.outputs[0].path)), true);
    assert.equal(readFileSync(join(root, manifest.outputs[0].path)).toString('ascii', 0, 2), 'BM');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

function buildPortraitPayload({ width, height, indices }) {
  const header = Buffer.alloc(18);
  header.writeUInt16LE(0x0100, 0);
  header.writeUInt16LE(0x0001, 2);
  header.writeUInt16LE(0x2001, 6);
  header.writeUInt16LE(width, 12);
  header.writeUInt16LE(height, 14);
  header.writeUInt16LE(8, 16);

  const palette = Buffer.alloc(1024);
  palette.set([1, 2, 3, 255], 0);
  palette.set([4, 5, 6, 255], 4);

  return Buffer.concat([header, palette, Buffer.from(indices)]);
}

function buildHedFixture(slots) {
  const bytes = Buffer.alloc(slots.length * 8);
  slots.forEach(([offset, size], index) => {
    bytes.writeUInt32LE(offset, index * 8);
    bytes.writeUInt32LE(size, index * 8 + 4);
  });
  return bytes;
}
