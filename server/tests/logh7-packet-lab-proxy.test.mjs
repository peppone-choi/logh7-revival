import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, realpath, rename, rm, stat, writeFile } from 'node:fs/promises';
import net, { Socket } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  CORRELATION_KEYS,
  createPacketLabProxy,
} from '../../tools/live/logh7_packet_lab_proxy.mjs';
import { frame0030WithSubheader } from '../src/server/logh7-envelope-0030.mjs';
import { buildTransportFrame } from '../src/server/logh7-frame-stream.mjs';

const HOST = '127.0.0.1';
const PROXY_CLI_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'tools', 'live', 'logh7_packet_lab_proxy.mjs');

function listen(server) {
  return new Promise((resolve, reject) => {
    const onError = (error) => {
      server.off('listening', onListening);
      reject(error);
    };
    const onListening = () => {
      server.off('error', onError);
      resolve(server.address());
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen({ host: HOST, port: 0 });
  });
}

function closeServer(server) {
  if (!server.listening) return Promise.resolve();
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

async function connect(address, { allowHalfOpen = false } = {}) {
  const socket = new Socket({ allowHalfOpen });
  socket.connect(address);
  await once(socket, 'connect');
  return socket;
}

function readBytes(socket, expectedLength, timeoutMs = 2000) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    const timer = setTimeout(() => finish(new Error(`timed out waiting for ${expectedLength} bytes; got ${total}`)), timeoutMs);
    const onData = (chunk) => {
      chunks.push(Buffer.from(chunk));
      total += chunk.length;
      if (total >= expectedLength) finish(null, Buffer.concat(chunks, total).subarray(0, expectedLength));
    };
    const onError = (error) => finish(error);
    const onClose = () => {
      if (total < expectedLength) finish(new Error(`socket closed waiting for ${expectedLength} bytes; got ${total}`));
    };
    const finish = (error, value) => {
      clearTimeout(timer);
      socket.off('data', onData);
      socket.off('error', onError);
      socket.off('close', onClose);
      if (error) reject(error);
      else resolve(value);
    };
    socket.on('data', onData);
    socket.once('error', onError);
    socket.once('close', onClose);
  });
}

function readUntilEnd(socket, timeoutMs = 2000) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const timer = setTimeout(() => finish(new Error('timed out waiting for peer FIN')), timeoutMs);
    const onData = (chunk) => chunks.push(Buffer.from(chunk));
    const onEnd = () => finish(null, Buffer.concat(chunks));
    const onError = (error) => finish(error);
    const finish = (error, value) => {
      clearTimeout(timer);
      socket.off('data', onData);
      socket.off('end', onEnd);
      socket.off('error', onError);
      if (error) reject(error);
      else resolve(value);
    };
    socket.on('data', onData);
    socket.once('end', onEnd);
    socket.once('error', onError);
  });
}

async function waitFor(predicate, message, timeoutMs = 2000) {
  const deadline = Date.now() + timeoutMs;
  while (!(await predicate())) {
    if (Date.now() >= deadline) throw new Error(message);
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

async function writeChunks(socket, chunks) {
  for (const chunk of chunks) {
    if (!socket.write(chunk)) await once(socket, 'drain');
  }
}

function withTimeout(promise, timeoutMs, message) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

async function startProxy({ upstreamAddress, records = [], logger = null, tracePath = null, runId = 'test-run' }) {
  const proxy = createPacketLabProxy({
    listenHost: HOST,
    listenPort: 0,
    upstreamHost: HOST,
    upstreamPort: upstreamAddress.port,
    runId,
    tracePath,
    logger: logger ?? { debug: (record) => records.push(record) },
  });
  await proxy.listen();
  return proxy;
}

test('split/coalesced frames are byte-identical in both directions with independent frame sequences', async (t) => {
  const upstreamServer = net.createServer({ allowHalfOpen: true });
  const upstreamAddress = await listen(upstreamServer);
  const records = [];
  const proxy = await startProxy({ upstreamAddress, records, runId: 'split-coalesced' });
  const upstreamConnected = once(upstreamServer, 'connection');
  const client = await connect(proxy.address());
  const [upstream] = await upstreamConnected;

  t.after(async () => {
    client.destroy();
    upstream.destroy();
    await proxy.close();
    await closeServer(upstreamServer);
  });

  const c2sFrames = [
    buildTransportFrame(0x0030, Buffer.from('0011223344556677', 'hex')),
    buildTransportFrame(0x0036, Buffer.from('8899aabbcc', 'hex')),
  ];
  const c2sBytes = Buffer.concat(c2sFrames);
  const upstreamRead = readBytes(upstream, c2sBytes.length);
  client.write(c2sFrames[0].subarray(0, 3));
  client.write(Buffer.concat([c2sFrames[0].subarray(3), c2sFrames[1]]));
  assert.deepEqual(await upstreamRead, c2sBytes);

  const s2cFrames = [
    buildTransportFrame(0x0035, Buffer.from('0102030405060708', 'hex')),
    buildTransportFrame(0x7fff, Buffer.from('f0e0d0c0', 'hex')),
  ];
  const s2cBytes = Buffer.concat(s2cFrames);
  const clientRead = readBytes(client, s2cBytes.length);
  upstream.write(s2cFrames[0].subarray(0, 2));
  upstream.write(Buffer.concat([s2cFrames[0].subarray(2), s2cFrames[1]]));
  assert.deepEqual(await clientRead, s2cBytes);

  await waitFor(() => records.length === 8, `expected 8 correlation records, got ${records.length}`);
  for (const record of records) assert.deepEqual(Object.keys(record), CORRELATION_KEYS);

  const grouped = new Map();
  for (const record of records) {
    const events = grouped.get(record.messageId) ?? [];
    events.push(record);
    grouped.set(record.messageId, events);
  }
  assert.equal(grouped.size, 4);
  for (const events of grouped.values()) {
    assert.equal(events.length, 2);
    assert.deepEqual(events.map((event) => event.stage).sort(), ['proxy-recv', 'proxy-send']);
    assert.equal(events[0].payloadLength, events[1].payloadLength);
    assert.equal(events[0].payloadSha256, events[1].payloadSha256);
    assert.equal(events[0].transportCode, events[1].transportCode);
    assert.equal(events[0].innerCode, null);
    assert.equal(events[1].innerCode, null);
  }

  assert.deepEqual(
    records.filter((record) => record.stage === 'proxy-recv' && record.direction === 'c2s').map((record) => record.frameSeq),
    [0, 1],
  );
  assert.deepEqual(
    records.filter((record) => record.stage === 'proxy-recv' && record.direction === 's2c').map((record) => record.frameSeq),
    [0, 1],
  );
  assert.equal(records.find((record) => record.messageId === 'conn-000000:c2s:0').transportCode, '0x0030');
});

test('0x0030 encrypted payload stays metadata-only and never exposes raw, credential, key, or guessed inner code', async (t) => {
  const tempDir = await mkdtemp(join(tmpdir(), 'logh7-packet-lab-'));
  const tracePath = join(tempDir, 'correlation.jsonl');
  const upstreamServer = net.createServer({ allowHalfOpen: true });
  const upstreamAddress = await listen(upstreamServer);
  const proxy = await startProxy({ upstreamAddress, tracePath, runId: 'redaction' });
  assert.equal((await stat(tracePath)).mode & 0o777, 0o600);
  const upstreamConnected = once(upstreamServer, 'connection');
  const client = await connect(proxy.address());
  const [upstream] = await upstreamConnected;

  t.after(async () => {
    client.destroy();
    upstream.destroy();
    await proxy.close();
    await closeServer(upstreamServer);
    await rm(tempDir, { recursive: true, force: true });
  });

  const secret = Buffer.from('account=test-user;password=do-not-log;key=00112233', 'utf8');
  const frame = buildTransportFrame(0x0030, secret);
  const upstreamRead = readBytes(upstream, frame.length);
  client.write(frame);
  assert.deepEqual(await upstreamRead, frame);

  await waitFor(async () => {
    try {
      return (await readFile(tracePath, 'utf8')).trim().split('\n').length === 2;
    } catch {
      return false;
    }
  }, 'expected recv/send JSONL records');

  const receipt = await proxy.close();
  const traceText = await readFile(tracePath, 'utf8');
  assert.equal(traceText.includes(secret.toString('utf8')), false);
  assert.equal(traceText.includes(secret.toString('hex')), false);
  assert.equal(traceText.includes('password'), false);
  assert.equal(traceText.includes('key='), false);
  const lines = traceText.trim().split('\n').map((line) => JSON.parse(line));
  assert.equal(lines.length, 2);
  for (const line of lines) {
    assert.deepEqual(Object.keys(line), CORRELATION_KEYS);
    assert.equal(line.transportCode, '0x0030');
    assert.equal(line.innerCode, null);
    assert.equal(line.payloadLength, frame.length);
    assert.equal(line.payloadSha256, createHash('sha256').update(frame).digest('hex'));
    assert.equal(line.redaction, 'metadata-only');
  }
  assert.equal(receipt.traceReceipt.configured, true);
  assert.equal(receipt.traceReceipt.path, join(await realpath(dirname(tracePath)), 'correlation.jsonl'));
  assert.equal(receipt.traceReceipt.eventCount, lines.length);
  assert.equal(receipt.traceReceipt.sizeBytes, Buffer.byteLength(traceText));
  assert.equal(receipt.traceReceipt.sha256, createHash('sha256').update(traceText).digest('hex'));
  assert.equal(receipt.traceReceipt.inode, String((await stat(tracePath)).ino));
  assert.equal(receipt.traceReceipt.identityVerified, true);
  assert.equal(receipt.evidenceHealth.evidenceHealthy, true);
});

test('conn2 subheader-4 envelope records transport 0x0030 without decoding encrypted inner data', async (t) => {
  const upstreamServer = net.createServer({ allowHalfOpen: true });
  const upstreamAddress = await listen(upstreamServer);
  const records = [];
  const proxy = await startProxy({ upstreamAddress, records, runId: 'conn2-subheader' });
  const upstreamConnected = once(upstreamServer, 'connection');
  const client = await connect(proxy.address());
  const [upstream] = await upstreamConnected;

  t.after(async () => {
    client.destroy();
    upstream.destroy();
    await proxy.close();
    await closeServer(upstreamServer);
  });

  const encryptedBody = Buffer.from('9f50a81c3d77e2b4f1230011aabbccdd', 'hex');
  const frame = frame0030WithSubheader(encryptedBody, 4);
  const upstreamRead = readBytes(upstream, frame.length);
  client.write(frame);
  assert.deepEqual(await upstreamRead, frame);
  await waitFor(() => records.length === 2, `expected recv/send records, got ${records.length}`);

  const expectedHash = createHash('sha256').update(frame).digest('hex');
  for (const record of records) {
    assert.equal(record.transportCode, '0x0030');
    assert.equal(record.innerCode, null);
    assert.equal(record.payloadLength, frame.length);
    assert.equal(record.payloadSha256, expectedHash);
  }
});

test('paused upstream preserves a large frame sequence across backpressure', async (t) => {
  const upstreamServer = net.createServer({ allowHalfOpen: true });
  const upstreamAddress = await listen(upstreamServer);
  const records = [];
  const proxy = await startProxy({ upstreamAddress, records, runId: 'backpressure' });
  const upstreamConnected = once(upstreamServer, 'connection');
  const client = await connect(proxy.address());
  const [upstream] = await upstreamConnected;

  t.after(async () => {
    client.destroy();
    upstream.destroy();
    await proxy.close();
    await closeServer(upstreamServer);
  });

  const frames = Array.from({ length: 96 }, (_, index) => (
    buildTransportFrame(0x0036, Buffer.alloc(60_000, index & 0xff))
  ));
  const expected = Buffer.concat(frames);
  const upstreamRead = readBytes(upstream, expected.length, 15_000);
  upstream.pause();
  const writePromise = writeChunks(client, frames);
  await new Promise((resolve) => setTimeout(resolve, 30));
  upstream.resume();

  await writePromise;
  assert.deepEqual(await upstreamRead, expected);
  await waitFor(
    () => records.filter((record) => record.direction === 'c2s' && record.outcome === 'forwarded').length === frames.length,
    `expected ${frames.length} forwarded frame records`,
    5_000,
  );
  assert.deepEqual(
    records
      .filter((record) => record.direction === 'c2s' && record.stage === 'proxy-recv')
      .map((record) => record.frameSeq),
    Array.from({ length: frames.length }, (_, index) => index),
  );
});

test('malformed frame observation and throwing logger do not interrupt byte forwarding', async (t) => {
  const upstreamServer = net.createServer({ allowHalfOpen: true });
  const upstreamAddress = await listen(upstreamServer);
  const records = [];
  const logger = {
    debug(record) {
      records.push(record);
      if (record.outcome === 'failed') throw new Error('observer logger failed');
    },
  };
  const proxy = await startProxy({ upstreamAddress, records, logger, runId: 'malformed-isolation' });
  const upstreamConnected = once(upstreamServer, 'connection');
  const client = await connect(proxy.address());
  const [upstream] = await upstreamConnected;

  t.after(async () => {
    client.destroy();
    upstream.destroy();
    await proxy.close();
    await closeServer(upstreamServer);
  });

  const malformed = Buffer.from([0x00, 0x01, 0x73, 0x65, 0x63, 0x72, 0x65, 0x74]);
  const upstreamRead = readBytes(upstream, malformed.length);
  client.write(malformed);
  assert.deepEqual(await upstreamRead, malformed);

  const validResponse = buildTransportFrame(0x0036, Buffer.from('aabbccdd', 'hex'));
  const clientRead = readBytes(client, validResponse.length);
  upstream.write(validResponse);
  assert.deepEqual(await clientRead, validResponse);
  await waitFor(() => records.some((record) => record.direction === 's2c' && record.outcome === 'forwarded'), 's2c frame was not observed');

  const failed = records.find((record) => record.outcome === 'failed');
  assert.ok(failed);
  assert.equal(failed.frameSeq, null);
  assert.equal(failed.payloadLength, null);
  assert.equal(failed.payloadSha256, null);
  assert.equal(failed.transportCode, null);
  const evidenceHealth = proxy.evidenceHealth();
  assert.equal(evidenceHealth.evidenceHealthy, false);
  assert.equal(evidenceHealth.logger.healthy, false);
  assert.equal(evidenceHealth.observation.healthy, false);
  assert.deepEqual(evidenceHealth.failureCodes, [
    'trace-not-configured',
    'frame-observation-failed',
    'logger-write-failed',
  ]);
});

test('trace mkdir failure is sticky in close receipt while forwarding remains byte-identical', async (t) => {
  const tempDir = await mkdtemp(join(tmpdir(), 'logh7-packet-lab-health-'));
  const blocker = join(tempDir, 'not-a-directory');
  await writeFile(blocker, 'blocker');
  const tracePath = join(blocker, 'correlation.jsonl');
  const upstreamServer = net.createServer({ allowHalfOpen: true });
  const upstreamAddress = await listen(upstreamServer);
  const records = [];
  const proxy = await startProxy({ upstreamAddress, records, tracePath, runId: 'trace-mkdir-failure' });
  const upstreamConnected = once(upstreamServer, 'connection');
  const client = await connect(proxy.address());
  const [upstream] = await upstreamConnected;

  t.after(async () => {
    client.destroy();
    upstream.destroy();
    await proxy.close();
    await closeServer(upstreamServer);
    await rm(tempDir, { recursive: true, force: true });
  });

  const frame = buildTransportFrame(0x0036, Buffer.from('01020304', 'hex'));
  const upstreamRead = readBytes(upstream, frame.length);
  client.write(frame);
  assert.deepEqual(await upstreamRead, frame);
  await waitFor(() => records.some((record) => record.outcome === 'forwarded'), 'forwarding stopped after trace mkdir failure');

  const receipt = await proxy.close();
  assert.equal(receipt.closed, true);
  assert.equal(receipt.evidenceHealth.evidenceHealthy, false);
  assert.equal(receipt.evidenceHealth.trace.healthy, false);
  assert.deepEqual(receipt.evidenceHealth.failureCodes, ['trace-mkdir-failed']);
});

test('trace path replacement cannot redirect writes away from the owned inode', async (t) => {
  const tempDir = await mkdtemp(join(tmpdir(), 'logh7-packet-lab-health-'));
  const tracePath = join(tempDir, 'correlation.jsonl');
  const ownedPath = join(tempDir, 'owned-correlation.jsonl');
  const upstreamServer = net.createServer({ allowHalfOpen: true });
  const upstreamAddress = await listen(upstreamServer);
  const records = [];
  const proxy = await startProxy({ upstreamAddress, records, tracePath, runId: 'trace-path-replacement' });
  await rename(tracePath, ownedPath);
  const replacement = '{"runId":"replacement-must-remain-untouched"}\n';
  await writeFile(tracePath, replacement, { mode: 0o600 });
  const upstreamConnected = once(upstreamServer, 'connection');
  const client = await connect(proxy.address());
  const [upstream] = await upstreamConnected;

  t.after(async () => {
    client.destroy();
    upstream.destroy();
    await proxy.close();
    await closeServer(upstreamServer);
    await rm(tempDir, { recursive: true, force: true });
  });

  const frame = buildTransportFrame(0x0034, Buffer.from('05060708', 'hex'));
  const upstreamRead = readBytes(upstream, frame.length);
  client.write(frame);
  assert.deepEqual(await upstreamRead, frame);
  await waitFor(() => records.some((record) => record.outcome === 'forwarded'), 'forwarding stopped after trace path replacement');

  const receipt = await proxy.close();
  const ownedTrace = await readFile(ownedPath, 'utf8');
  const ownedStat = await stat(ownedPath);
  assert.equal(receipt.evidenceHealth.evidenceHealthy, false);
  assert.equal(receipt.evidenceHealth.trace.failures, 1);
  assert.equal(receipt.evidenceHealth.logger.healthy, true);
  assert.deepEqual(receipt.evidenceHealth.failureCodes, ['trace-path-identity-changed']);
  assert.equal(receipt.traceReceipt.eventCount, records.length);
  assert.equal(receipt.traceReceipt.sizeBytes, Buffer.byteLength(ownedTrace));
  assert.equal(receipt.traceReceipt.sha256, createHash('sha256').update(ownedTrace).digest('hex'));
  assert.equal(receipt.traceReceipt.inode, String(ownedStat.ino));
  assert.equal(receipt.traceReceipt.identityVerified, false);
  assert.equal(await readFile(tracePath, 'utf8'), replacement);
});

test('preexisting trace path fails closed without mixing or overwriting the previous run', async (t) => {
  const tempDir = await mkdtemp(join(tmpdir(), 'logh7-packet-lab-owner-'));
  const tracePath = join(tempDir, 'correlation.jsonl');
  const previousRun = '{"runId":"previous-run","eventId":"proxy-client:000000"}\n';
  await writeFile(tracePath, previousRun, { mode: 0o600 });
  const upstreamServer = net.createServer();
  const upstreamAddress = await listen(upstreamServer);
  t.after(async () => {
    await closeServer(upstreamServer);
    await rm(tempDir, { recursive: true, force: true });
  });

  await assert.rejects(
    startProxy({ upstreamAddress, tracePath, runId: 'must-not-mix' }),
    /trace path already exists/,
  );
  assert.equal(await readFile(tracePath, 'utf8'), previousRun);
});

test('client half-close reaches upstream while the reverse response remains available', async (t) => {
  const upstreamServer = net.createServer({ allowHalfOpen: true });
  const upstreamAddress = await listen(upstreamServer);
  const records = [];
  const proxy = await startProxy({ upstreamAddress, records, runId: 'half-close' });
  const upstreamConnected = once(upstreamServer, 'connection');
  const client = await connect(proxy.address(), { allowHalfOpen: true });
  const [upstream] = await upstreamConnected;

  t.after(async () => {
    client.destroy();
    upstream.destroy();
    await proxy.close();
    await closeServer(upstreamServer);
  });

  const request = buildTransportFrame(0x0034, Buffer.from('0102030405060708', 'hex'));
  const response = buildTransportFrame(0x0035, Buffer.from('1112131415161718', 'hex'));
  const upstreamRequest = readUntilEnd(upstream);
  const clientResponse = readUntilEnd(client);
  client.end(request);
  assert.deepEqual(await upstreamRequest, request);
  upstream.end(response);
  assert.deepEqual(await clientResponse, response);
  await waitFor(() => records.filter((record) => record.outcome === 'forwarded').length === 2, 'half-close frames were not correlated');
});

test('FIN with a truncated frame preserves raw bytes and records sticky metadata-only evidence failure', async (t) => {
  const upstreamServer = net.createServer({ allowHalfOpen: true });
  const upstreamAddress = await listen(upstreamServer);
  const records = [];
  const proxy = await startProxy({ upstreamAddress, records, runId: 'truncated-fin' });
  const upstreamConnected = once(upstreamServer, 'connection');
  const client = await connect(proxy.address());
  const [upstream] = await upstreamConnected;

  t.after(async () => {
    client.destroy();
    upstream.destroy();
    await proxy.close();
    await closeServer(upstreamServer);
  });

  const truncated = Buffer.from([0x00, 0x0a, 0x00, 0x36, 0xaa, 0xbb]);
  const upstreamRequest = readUntilEnd(upstream);
  client.end(truncated);
  assert.deepEqual(await upstreamRequest, truncated);
  await waitFor(() => records.some((record) => record.outcome === 'failed'), 'truncated FIN was not recorded');

  const failed = records.find((record) => record.outcome === 'failed');
  assert.equal(failed.frameSeq, null);
  assert.equal(failed.transportCode, null);
  assert.equal(failed.innerCode, null);
  assert.equal(failed.payloadLength, null);
  assert.equal(failed.payloadSha256, null);
  const health = proxy.evidenceHealth();
  assert.equal(health.observation.healthy, false);
  assert.deepEqual(health.failureCodes, ['trace-not-configured', 'truncated-frame-at-fin']);

  const clientClosed = once(client, 'close');
  upstream.end();
  await clientClosed;
  const receipt = await proxy.close();
  assert.equal(receipt.evidenceHealth.evidenceHealthy, false);
  assert.deepEqual(receipt.evidenceHealth.failureCodes, ['trace-not-configured', 'truncated-frame-at-fin']);
});

test('RST with a truncated frame finalizes parser state as sticky close/error evidence failure', async (t) => {
  const upstreamServer = net.createServer({ allowHalfOpen: true });
  const upstreamAddress = await listen(upstreamServer);
  const records = [];
  const proxy = await startProxy({ upstreamAddress, records, runId: 'truncated-rst' });
  const upstreamConnected = once(upstreamServer, 'connection');
  const client = await connect(proxy.address());
  const [upstream] = await upstreamConnected;

  t.after(async () => {
    client.destroy();
    upstream.destroy();
    await proxy.close();
    await closeServer(upstreamServer);
  });

  const truncated = Buffer.from([0x00, 0x0c, 0x00, 0x30, 0xde, 0xad, 0xbe, 0xef]);
  const upstreamRead = readBytes(upstream, truncated.length);
  await new Promise((resolve, reject) => {
    client.write(truncated, (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
  assert.deepEqual(await upstreamRead, truncated);
  client.resetAndDestroy();
  await waitFor(() => records.some((record) => record.outcome === 'failed'), 'truncated RST was not finalized');

  const health = proxy.evidenceHealth();
  assert.equal(health.observation.healthy, false);
  assert.ok(
    health.failureCodes.includes('truncated-frame-at-error')
      || health.failureCodes.includes('truncated-frame-at-close'),
  );
  const receipt = await proxy.close();
  assert.equal(receipt.evidenceHealth.evidenceHealthy, false);
});

test('upstream refusal closes only the accepted client and leaves the proxy listener alive', async (t) => {
  const portProbe = net.createServer();
  const refusedAddress = await listen(portProbe);
  await closeServer(portProbe);

  const proxy = await startProxy({ upstreamAddress: refusedAddress, runId: 'upstream-refused' });
  t.after(() => proxy.close());

  const client = new Socket();
  client.on('error', () => {});
  const closed = once(client, 'close');
  client.connect(proxy.address());
  await once(client, 'connect');
  await closed;
  assert.ok(proxy.address());
});

test('concurrent connect and close cannot create a late pair or hang shutdown', async (t) => {
  const upstreamSockets = new Set();
  const upstreamServer = net.createServer((socket) => {
    upstreamSockets.add(socket);
    socket.on('close', () => upstreamSockets.delete(socket));
  });
  const upstreamAddress = await listen(upstreamServer);
  const proxy = await startProxy({ upstreamAddress, runId: 'connect-close-race' });
  const clients = [];
  const clientClosed = [];

  t.after(async () => {
    for (const client of clients) client.destroy();
    for (const socket of upstreamSockets) socket.destroy();
    await proxy.close();
    await closeServer(upstreamServer);
  });

  for (let index = 0; index < 64; index += 1) {
    const client = new Socket();
    client.on('error', () => {});
    clientClosed.push(new Promise((resolve) => client.once('close', resolve)));
    clients.push(client);
    client.connect(proxy.address());
  }

  const receipt = await withTimeout(proxy.close(), 2_000, 'proxy close hung during queued accepts');
  await withTimeout(Promise.all(clientClosed), 2_000, 'late client sockets survived proxy close');
  await waitFor(() => upstreamSockets.size === 0, 'late upstream socket survived proxy close');
  assert.equal(receipt.closed, true);
  assert.equal(proxy.address(), null);
});

test('CLI SIGTERM cleanup guard closes once and exits nonzero when evidence is unhealthy', async (t) => {
  const upstreamServer = net.createServer();
  const upstreamAddress = await listen(upstreamServer);
  const child = spawn(process.execPath, [
    PROXY_CLI_PATH,
    '--listen-port', '0',
    '--upstream-port', String(upstreamAddress.port),
    '--run-id', 'signal-guard',
  ], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => { stdout += chunk.toString('utf8'); });
  child.stderr.on('data', (chunk) => { stderr += chunk.toString('utf8'); });

  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    await closeServer(upstreamServer);
  });

  await waitFor(() => stdout.includes('"event":"packet-lab-listening"'), `proxy CLI did not listen: ${stderr}`);
  const exited = once(child, 'exit');
  child.kill('SIGTERM');
  const [code, signal] = await exited;
  assert.equal(code, 1);
  assert.equal(signal, null);
  assert.equal(stderr, '');
  const outputLines = stdout
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
  const listening = outputLines.find((record) => record.event === 'packet-lab-listening');
  const shutdown = outputLines.find((record) => record.event === 'packet-lab-shutdown');
  assert.equal(listening.evidenceHealth.evidenceHealthy, false);
  assert.deepEqual(listening.evidenceHealth.failureCodes, ['trace-not-configured']);
  assert.equal(shutdown.signal, 'SIGTERM');
  assert.equal(shutdown.mode, 'observe-only');
  assert.equal(shutdown.closed, true);
  assert.equal(shutdown.evidenceHealth.evidenceHealthy, false);
  assert.deepEqual(shutdown.evidenceHealth.failureCodes, ['trace-not-configured']);
  assert.deepEqual(shutdown.traceReceipt, {
    configured: false,
    path: null,
    eventCount: 0,
    sizeBytes: null,
    sha256: null,
    device: null,
    inode: null,
    identityVerified: null,
    removed: null,
  });
});

test('CLI listen failure finalizes receipt and removes its empty owned trace', async (t) => {
  const tempDir = await mkdtemp(join(tmpdir(), 'logh7-packet-lab-start-failure-'));
  const tracePath = join(tempDir, 'correlation.jsonl');
  const blocker = net.createServer();
  const blockerAddress = await listen(blocker);
  const upstreamServer = net.createServer();
  const upstreamAddress = await listen(upstreamServer);
  const child = spawn(process.execPath, [
    PROXY_CLI_PATH,
    '--listen-port', String(blockerAddress.port),
    '--upstream-port', String(upstreamAddress.port),
    '--run-id', 'listen-failure-cleanup',
    '--trace', tracePath,
  ], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => { stdout += chunk.toString('utf8'); });
  child.stderr.on('data', (chunk) => { stderr += chunk.toString('utf8'); });

  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    await closeServer(blocker);
    await closeServer(upstreamServer);
    await rm(tempDir, { recursive: true, force: true });
  });

  const [code, signal] = await once(child, 'exit');
  assert.equal(code, 1);
  assert.equal(signal, null);
  assert.equal(stdout, '');
  const failure = JSON.parse(stderr.trim());
  assert.equal(failure.event, 'packet-lab-start-failed');
  assert.equal(failure.code, 'EADDRINUSE');
  assert.equal(failure.receipt.runId, 'listen-failure-cleanup');
  assert.equal(failure.receipt.traceReceipt.eventCount, 0);
  assert.equal(failure.receipt.traceReceipt.identityVerified, true);
  assert.equal(failure.receipt.traceReceipt.removed, true);
  await assert.rejects(stat(tracePath), { code: 'ENOENT' });
});

test('close is idempotent, cleans an active socket pair, and keeps loopback scope fail-closed', async (t) => {
  assert.throws(
    () => createPacketLabProxy({ listenHost: '0.0.0.0' }),
    /loopback/,
  );
  assert.throws(
    () => createPacketLabProxy({ upstreamHost: '192.0.2.10' }),
    /loopback/,
  );
  for (const [listenHost, upstreamHost] of [
    ['127.0.0.1', '127.0.0.1'],
    ['localhost', '127.0.0.1'],
    ['127.0.0.1', 'LOCALHOST'],
    ['localhost', '::1'],
    ['::1', '::1'],
  ]) {
    assert.throws(
      () => createPacketLabProxy({ listenHost, listenPort: 47900, upstreamHost, upstreamPort: 47900 }),
      /same-family loopback/,
    );
  }
  const crossFamily = createPacketLabProxy({
    listenHost: '127.0.0.1',
    listenPort: 47900,
    upstreamHost: '::1',
    upstreamPort: 47900,
  });
  assert.equal(crossFamily.evidenceHealth().evidenceHealthy, false);
  await crossFamily.close();

  const upstreamServer = net.createServer();
  const upstreamAddress = await listen(upstreamServer);
  const proxy = await startProxy({ upstreamAddress, runId: 'repeat-close' });
  const upstreamConnected = once(upstreamServer, 'connection');
  const client = await connect(proxy.address());
  const [upstream] = await upstreamConnected;
  t.after(async () => {
    client.destroy();
    upstream.destroy();
    await proxy.close();
    await closeServer(upstreamServer);
  });

  const clientClosed = once(client, 'close');
  const upstreamClosed = once(upstream, 'close');
  const [receipt] = await Promise.all([proxy.close(), proxy.close(), proxy.close()]);
  await Promise.all([clientClosed, upstreamClosed]);
  await proxy.close();
  assert.equal(receipt.evidenceHealth.evidenceHealthy, false);
  assert.deepEqual(receipt.evidenceHealth.failureCodes, ['trace-not-configured']);
  assert.equal(client.destroyed, true);
  assert.equal(upstream.destroyed, true);
  assert.equal(proxy.address(), null);
});
