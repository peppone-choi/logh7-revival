import { strict as assert } from 'node:assert';
import { EventEmitter } from 'node:events';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { PassThrough } from 'node:stream';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { test } from 'node:test';

import {
  buildCaptureFilter,
  captureSession,
  listInterfaces,
  parseTsharkInterfaces,
  selectCaptureInterface,
} from '../../tools/live/logh7_capture.mjs';

function createSpawnStub() {
  const calls = [];
  const spawnImpl = (command, args) => {
    calls.push({ command, args });
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    queueMicrotask(() => {
      const signature = `${command} ${args.join(' ')}`;
    if (signature.endsWith(' -v')) {
      child.stdout.end(`${basename(command)} version 4.4.6\n`);
        child.stderr.end('');
        child.emit('close', 0, null);
        return;
      }
      if (signature.endsWith(' -D')) {
        child.stdout.end('1. \\\\Device\\\\NPF_Loopback (Npcap Loopback Adapter)\n2. Ethernet\n');
        child.stderr.end('');
        child.emit('close', 0, null);
        return;
      }
      if (args[0] === '-i') {
        assert.equal(args[1], '1');
        assert.equal(args[2], '-w');
        assert.equal(args[4], '-a');
        assert.equal(args[5], 'duration:5');
        assert.equal(args[6], '-f');
        assert.equal(args[7], 'port 5566');
        child.stdout.end('');
        child.stderr.end('');
        child.emit('close', 0, null);
        return;
      }
      child.stdout.end('');
      child.stderr.end(`unexpected command: ${signature}`);
      child.emit('close', 1, null);
    });
    return child;
  };
  return { spawnImpl, calls };
}

async function createFakeTool(root, name) {
  const path = join(root, name);
  await writeFile(path, '');
  return path;
}

test('tshark interface parsing prefers loopback', () => {
  const interfaces = parseTsharkInterfaces([
    '1. \\\\Device\\\\NPF_Loopback (Npcap Loopback Adapter)',
    '2. Ethernet',
  ].join('\n'));
  assert.equal(interfaces.length, 2);
  assert.equal(interfaces[0].loopback, true);
  assert.equal(selectCaptureInterface(interfaces).index, 1);
  assert.equal(buildCaptureFilter({ port: 1234 }), 'port 1234');
  assert.equal(buildCaptureFilter({ port: 1234, filter: 'tcp or udp' }), '(tcp or udp) and port 1234');
});

test('listInterfaces invokes tshark -D and parses the result', async () => {
  const root = await mkdtemp(join(tmpdir(), 'logh7-tools-'));
  const tsharkPath = await createFakeTool(root, 'tshark.exe');
  const { spawnImpl, calls } = createSpawnStub();
  const result = await listInterfaces({
    tsharkPath,
    spawnImpl,
  });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], {
    command: tsharkPath,
    args: ['-D'],
  });
  assert.equal(result.interfaces.length, 2);
  assert.equal(result.interfaces[0].description, 'Npcap Loopback Adapter');
});

test('listInterfaces fails closed when tshark cannot be resolved', async () => {
  await assert.rejects(
    () => listInterfaces({
      tsharkPath: '',
      env: { PATH: '' },
      spawnImpl: () => {
        throw new Error('spawn should not run when tshark is missing');
      },
    }),
    /tshark was not found/,
  );
});

test('captureSession writes a manifest beside the pcap path', async () => {
  const root = await mkdtemp(join(tmpdir(), 'logh7-capture-'));
  const tsharkPath = await createFakeTool(root, 'tshark.exe');
  const dumpcapPath = await createFakeTool(root, 'dumpcap.exe');
  const { spawnImpl, calls } = createSpawnStub();
  const result = await captureSession({
    tsharkPath,
    dumpcapPath,
    port: 5566,
    durationSeconds: 5,
    captureRoot: root,
    sessionId: 'test-session',
    spawnImpl,
  });
  assert.equal(result.sessionId, 'test-session');
  assert.equal(result.exitCode, 0);
  assert.equal(calls.length, 4);
  const manifest = JSON.parse(await readFile(result.manifestPath, 'utf8'));
  assert.equal(manifest.schema, 'logh7-live-capture-manifest-v1');
  assert.equal(manifest.sessionId, 'test-session');
  assert.equal(manifest.outputPath, result.outputPath);
  assert.equal(manifest.exitCode, 0);
  assert.equal(manifest.filter, 'port 5566');
  assert.equal(manifest.interface.arg, '1');
  assert.equal(manifest.tools.tshark.version, 'tshark.exe version 4.4.6');
  assert.equal(manifest.tools.dumpcap.version, 'dumpcap.exe version 4.4.6');
  assert.ok(manifest.command[0].endsWith('dumpcap.exe'));
});
