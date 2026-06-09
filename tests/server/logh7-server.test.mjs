import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { startLogh7Server } from '../../src/server/logh7-server.mjs';

test('serves health and manifest from a bound localhost server', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'logh7-server-'));
  const manifest = path.join(root, 'manifest.json');
  await writeFile(manifest, JSON.stringify({ title: 'LOGH VII', resources: [] }), 'utf8');
  const server = await startLogh7Server({ host: '127.0.0.1', port: 0, manifestPath: manifest });

  try {
    const health = await fetch(`http://${server.host}:${server.port}/health`);
    assert.equal(health.status, 200);
    assert.equal((await health.json()).ok, true);

    const response = await fetch(`http://${server.host}:${server.port}/manifest`);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).title, 'LOGH VII');
  } finally {
    await server.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('rejects resource path traversal', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'logh7-server-'));
  const manifest = path.join(root, 'manifest.json');
  await writeFile(manifest, JSON.stringify({ title: 'LOGH VII', resources: [] }), 'utf8');
  const server = await startLogh7Server({ host: '127.0.0.1', port: 0, manifestPath: manifest });

  try {
    const response = await fetch(`http://${server.host}:${server.port}/resources/../../package.json`);
    assert.equal(response.status, 404);

    const encoded = await fetch(`http://${server.host}:${server.port}/resources/%2e%2e/%2e%2e/package.json`);
    assert.equal(encoded.status, 404);
  } finally {
    await server.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('rejects malformed encoded resource paths without stopping the server', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'logh7-server-'));
  const manifest = path.join(root, 'manifest.json');
  await writeFile(manifest, JSON.stringify({ title: 'LOGH VII', resources: [] }), 'utf8');
  const server = await startLogh7Server({ host: '127.0.0.1', port: 0, manifestPath: manifest });

  try {
    const malformed = await fetch(`http://${server.host}:${server.port}/resources/%E0%A4%A`);
    assert.equal(malformed.status, 400);

    const health = await fetch(`http://${server.host}:${server.port}/health`);
    assert.equal(health.status, 200);
    assert.equal((await health.json()).ok, true);
  } finally {
    await server.close();
    await rm(root, { recursive: true, force: true });
  }
});
