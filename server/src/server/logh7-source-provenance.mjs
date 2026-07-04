import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SERVER_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DEFAULT_PROVENANCE_PATH = join(SERVER_ROOT, 'content', 'original-data', 'logh7-archive-org.json');

export function loadOriginalSourceProvenance(path = DEFAULT_PROVENANCE_PATH) {
  const record = JSON.parse(readFileSync(path, 'utf8'));
  validateOriginalSourceProvenance(record);
  return record;
}

export function validateOriginalSourceProvenance(record) {
  if (!record || typeof record !== 'object') {
    throw new TypeError('source provenance must be an object');
  }
  if (record.id !== 'logh7-archive-org') {
    throw new Error(`unexpected source id: ${record.id}`);
  }
  if (record.sourceUrl !== 'https://archive.org/download/logh-7') {
    throw new Error(`unexpected source URL: ${record.sourceUrl}`);
  }
  if (!Array.isArray(record.files) || record.files.length < 2) {
    throw new Error('source provenance must list original files');
  }
  for (const file of record.files) {
    assertSourceFileMetadata(file);
  }
  return true;
}

export function verifyLocalOriginalFiles({ artifactRoot, provenance = loadOriginalSourceProvenance() }) {
  return provenance.files.map((file) => {
    const path = join(artifactRoot, file.name);
    const stat = statSync(path);
    const bytes = readFileSync(path);
    const md5 = createHash('md5').update(bytes).digest('hex');
    const sha1 = createHash('sha1').update(bytes).digest('hex');
    return {
      name: file.name,
      path,
      size: stat.size,
      expectedSize: file.size,
      md5,
      expectedMd5: file.md5,
      sha1,
      expectedSha1: file.sha1,
      ok: stat.size === file.size && md5 === file.md5 && sha1 === file.sha1,
    };
  });
}

function assertSourceFileMetadata(file) {
  if (!file || typeof file !== 'object') {
    throw new TypeError('source file metadata must be an object');
  }
  if (typeof file.name !== 'string' || file.name.length === 0) {
    throw new Error('source file metadata missing name');
  }
  if (!Number.isInteger(file.size) || file.size <= 0) {
    throw new Error(`${file.name} has invalid size`);
  }
  if (!/^[0-9a-f]{32}$/.test(file.md5 ?? '')) {
    throw new Error(`${file.name} has invalid md5`);
  }
  if (!/^[0-9a-f]{40}$/.test(file.sha1 ?? '')) {
    throw new Error(`${file.name} has invalid sha1`);
  }
}
