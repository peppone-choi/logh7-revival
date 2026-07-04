import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  loadOriginalSourceProvenance,
  validateOriginalSourceProvenance,
} from '../../src/server/logh7-source-provenance.mjs';

test('original source provenance pins Archive.org BIN/CUE metadata', () => {
  const provenance = loadOriginalSourceProvenance();

  assert.equal(provenance.id, 'logh7-archive-org');
  assert.equal(provenance.sourceUrl, 'https://archive.org/download/logh-7');
  assert.equal(provenance.status, 'remote-metadata-verified');

  const bin = provenance.files.find((file) => file.name === 'Logh7.bin');
  assert.equal(bin.size, 229070688);
  assert.equal(bin.md5, 'bf87c6a8cb068f05625737377a07b09d');
  assert.equal(bin.sha1, '80e261e9d84c81bca622c99d9cbdc47a2154c1a8');

  const cue = provenance.files.find((file) => file.name === 'Logh7.cue');
  assert.equal(cue.size, 71);
  assert.equal(cue.md5, '878418e704a913f7baac67b38b10e680');
  assert.equal(cue.sha1, '9bff4ea17ca6ff7b088440bd7f8a5206cd2dfe81');
});

test('source provenance validator rejects incomplete metadata', () => {
  assert.throws(
    () => validateOriginalSourceProvenance({
      id: 'logh7-archive-org',
      sourceUrl: 'https://archive.org/download/logh-7',
      files: [
        { name: 'Logh7.bin', size: 1, md5: 'bad', sha1: 'bad' },
        {
          name: 'Logh7.cue',
          size: 71,
          md5: '878418e704a913f7baac67b38b10e680',
          sha1: '9bff4ea17ca6ff7b088440bd7f8a5206cd2dfe81',
        },
      ],
    }),
    /invalid md5/,
  );
});
