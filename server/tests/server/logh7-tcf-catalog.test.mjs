import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  catalogTcfFaceDirectory,
  parseTcfArchive,
  parseTcfHed,
} from '../../src/server/logh7-tcf-catalog.mjs';

test('TCF archive parser records magic, group, size, and hash evidence', () => {
  const root = mkdtempSync(join(tmpdir(), 'logh7-tcf-archive-'));
  try {
    const path = join(root, 'oam.tcf');
    writeFileSync(path, Buffer.from('badacabe00112233445566778899aabbccddeeff', 'hex'));

    const archive = parseTcfArchive(path, root);

    assert.equal(archive.path, 'oam.tcf');
    assert.equal(archive.group, 'O-group-canon');
    assert.equal(archive.size, 20);
    assert.equal(archive.magic, 'badacabe');
    assert.equal(archive.magicOk, true);
    assert.match(archive.sha1, /^[0-9a-f]{40}$/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('TCF HED parser reads offset-size slots and statistics', () => {
  const root = mkdtempSync(join(tmpdir(), 'logh7-tcf-hed-'));
  try {
    const path = join(root, 'tcf.hed');
    writeFileSync(path, buildHedFixture([
      [0, 0],
      [50, 6162],
      [6212, 6082],
      [12294, 6162],
    ]));

    const hed = parseTcfHed(path, root);

    assert.equal(hed.slotCount, 4);
    assert.equal(hed.usedSlotCount, 3);
    assert.equal(hed.zeroSlotCount, 1);
    assert.deepEqual(hed.sizeHistogram, { 6082: 1, 6162: 2 });
    assert.deepEqual(hed.firstUsedSlots[0], { index: 1, offset: 50, size: 6162 });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('TCF face catalog walks current archive files without backup directories', () => {
  const workspaceRoot = mkdtempSync(join(tmpdir(), 'logh7-tcf-catalog-'));
  try {
    const faceRoot = join(workspaceRoot, 'data', 'image', 'Face');
    mkdirSync(join(faceRoot, 'Face.bak-gfpgan'), { recursive: true });
    writeFileSync(join(faceRoot, 'o.tcf'), Buffer.from('badacabe00', 'hex'));
    writeFileSync(join(faceRoot, 'gem.tcf'), Buffer.from('badacabe01', 'hex'));
    writeFileSync(join(faceRoot, 'Face.bak-gfpgan', 'ignored.tcf'), Buffer.from('badacabe02', 'hex'));
    writeFileSync(join(faceRoot, 'tcf.hed'), buildHedFixture([[50, 6162]]));

    const catalog = catalogTcfFaceDirectory({ faceRoot, workspaceRoot });

    assert.equal(catalog.status, 'present');
    assert.equal(catalog.archiveCount, 2);
    assert.deepEqual(catalog.archiveGroups, { 'G-group-player': 1, 'O-group-canon': 1 });
    assert.deepEqual(catalog.archives.map((archive) => archive.path), ['gem.tcf', 'o.tcf']);
    assert.equal(catalog.hed.usedSlotCount, 1);
  } finally {
    rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

function buildHedFixture(slots) {
  const bytes = Buffer.alloc(slots.length * 8);
  slots.forEach(([offset, size], index) => {
    bytes.writeUInt32LE(offset, index * 8);
    bytes.writeUInt32LE(size, index * 8 + 4);
  });
  return bytes;
}
