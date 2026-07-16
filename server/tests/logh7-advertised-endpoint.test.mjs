import assert from 'node:assert/strict';
import { once } from 'node:events';
import { existsSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import net from 'node:net';
import { test } from 'node:test';

import { createPlayableRuntime } from '../src/presentation/createPlayableRuntime.mjs';
import { createPlayableServer } from '../src/server/logh7-playable-server.mjs';
import {
  decryptBuffer,
  encryptBuffer,
  expandChildCodecKey,
  loadChildCodecTables,
} from '../src/server/logh7-child-codec.mjs';
import { build0030Body, parse0030Body, readInnerCode } from '../src/server/logh7-envelope-0030.mjs';
import { buildTransportFrame, createFrameStreamParser } from '../src/server/logh7-frame-stream.mjs';
import { createCharacterStore } from '../src/server/logh7-character-store.mjs';

const TRANSPORT_KEY = Buffer.from(
  '7b41344331333734382d303135392d346335342d414542332d3144363835373537363142337d',
  'hex',
);
const DECIPHER_KEY = Buffer.from('5859', 'hex');
const CREDENTIAL_INNER = Buffer.from(
  '700047494e370001000000070069006e006500690030003000000600640075006d006d00790000',
  'hex',
);
const PHASE1_KEY = Buffer.from('00112233445566778899aabbccddeeff', 'hex');
const DEFAULT_REDIRECT_HEX = '70010000000000000100007fbb1c0000000100000000';

function fold16(value) {
  return ((value >>> 16) ^ value) & 0xffff;
}

function checksum(data) {
  let value = 0;
  let offset = 0;
  for (; offset + 4 <= data.length; offset += 4) {
    value = (value ^ data.readUInt32LE(offset)) >>> 0;
  }
  for (; offset < data.length; offset += 1) value = (value ^ data[offset]) >>> 0;
  return fold16(value);
}

function pad8(data) {
  const paddedLength = data.length % 8 === 0
    ? data.length
    : data.length + (8 - (data.length % 8));
  const padded = Buffer.alloc(paddedLength);
  data.copy(padded);
  return padded;
}

function buildPhase1Frame({ sequence, tables }) {
  const body = Buffer.alloc(2 + PHASE1_KEY.length + 4);
  body.writeUInt16BE(PHASE1_KEY.length, 0);
  PHASE1_KEY.copy(body, 2);
  body.writeUInt32BE(sequence, 2 + PHASE1_KEY.length);
  const decoded = Buffer.alloc(body.length + 2);
  decoded.writeUInt16BE(checksum(body), 0);
  body.copy(decoded, 2);
  return buildTransportFrame(
    0x0034,
    encryptBuffer(pad8(decoded), expandChildCodecKey(TRANSPORT_KEY, tables)),
  );
}

function build0030Transport({ id, inner, tables }) {
  const body = build0030Body({ id, inner });
  return buildTransportFrame(
    0x0030,
    encryptBuffer(pad8(body), expandChildCodecKey(PHASE1_KEY, tables)),
  );
}

async function readFrames(socket, count, timeoutMs = 3000) {
  const parser = createFrameStreamParser();
  const frames = [];
  const deadline = Date.now() + timeoutMs;
  while (frames.length < count) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      throw new Error(`timeout waiting for ${count} frames, got ${frames.length}`);
    }
    const chunk = await Promise.race([
      once(socket, 'data').then(([data]) => data),
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error('socket data timeout')), remaining);
      }),
    ]);
    frames.push(...parser.push(chunk));
  }
  return frames;
}

async function connectAndPhase(server, tables, sequence) {
  const socket = net.connect(server.address());
  await once(socket, 'connect');
  socket.write(buildPhase1Frame({ sequence, tables }));
  const [phase3] = await readFrames(socket, 1);
  assert.equal(phase3.code, 0x0035);
  return socket;
}

function decode0030(frame, key, tables, { subheaderBytes = 0 } = {}) {
  const decoded = decryptBuffer(
    frame.body.subarray(subheaderBytes),
    expandChildCodecKey(key, tables),
  );
  return parse0030Body(decoded).inner;
}

function endpointFrom7001(inner) {
  assert.equal(readInnerCode(inner), 0x7001);
  const ip = inner.readUInt32BE(8);
  return {
    ip: [ip & 0xff, (ip >>> 8) & 0xff, (ip >>> 16) & 0xff, (ip >>> 24) & 0xff].join('.'),
    port: inner.readUInt16BE(12),
  };
}

function endpointFrom200a(inner) {
  assert.equal(inner.readUInt32LE(0), 0);
  assert.equal(inner.readUInt16BE(4), 0x200a);
  const ip = inner.readUInt32BE(6);
  return {
    ip: [ip & 0xff, (ip >>> 8) & 0xff, (ip >>> 16) & 0xff, (ip >>> 24) & 0xff].join('.'),
    port: inner.readUInt16BE(10),
  };
}

async function createFixtureServer({ port, advertisedEndpoint }) {
  const dir = await mkdtemp(join(tmpdir(), 'logh7-advertise-'));
  const accountsPath = join(dir, 'accounts.json');
  await writeFile(
    accountsPath,
    JSON.stringify({ accounts: [{ accountId: 'inei00', password: 'dummy' }] }),
    'utf8',
  );
  const characterStore = createCharacterStore(join(dir, 'characters.json'));
  characterStore.addCharacter('inei00', {
    power: 1,
    lastname: 'Endpoint',
    firstname: 'Probe',
    face: 1,
    rank: 0x0d,
  });
  const tables = loadChildCodecTables();
  const server = createPlayableServer({
    port,
    host: '127.0.0.1',
    advertisedEndpoint,
    accountsPath,
    characterStore,
    tables,
    transportKey: TRANSPORT_KEY,
    decipherKey: DECIPHER_KEY,
    logger: null,
  });
  return { dir, server, tables };
}

async function createFixtureRuntime({ port, advertisedEndpoint }) {
  const dir = await mkdtemp(join(tmpdir(), 'logh7-advertise-runtime-'));
  const accountsPath = join(dir, 'accounts.json');
  await writeFile(
    accountsPath,
    JSON.stringify({ accounts: [{ accountId: 'inei00', password: 'dummy' }] }),
    'utf8',
  );
  const runtime = createPlayableRuntime({
    port,
    host: '127.0.0.1',
    advertisedEndpoint,
    accountsPath,
    dbPath: join(dir, 'runtime.sqlite'),
    transportKey: TRANSPORT_KEY,
    decipherKey: DECIPHER_KEY,
    logger: null,
  });
  runtime.characterStore.addCharacter('inei00', {
    power: 1,
    lastname: 'Endpoint',
    firstname: 'Runtime',
    face: 1,
    rank: 0x0d,
  });
  return { dir, server: runtime, tables: loadChildCodecTables() };
}

test('bind 47901 advertises 47900 in both encrypted 0x7001 and message32 0x200a', async () => {
  const fixture = await createFixtureRuntime({
    port: 47901,
    advertisedEndpoint: { ip: '127.0.0.1', port: 47900 },
  });
  const sockets = [];
  try {
    await fixture.server.listen();
    assert.equal(fixture.server.address().port, 47901);

    const loginSocket = await connectAndPhase(fixture.server, fixture.tables, 1);
    sockets.push(loginSocket);
    loginSocket.write(build0030Transport({ id: 1, inner: CREDENTIAL_INNER, tables: fixture.tables }));
    const loginReplies = await readFrames(loginSocket, 2);
    const redirect7001 = decode0030(
      loginReplies[1],
      CREDENTIAL_INNER.subarray(2),
      fixture.tables,
    );
    assert.deepEqual(endpointFrom7001(redirect7001), { ip: '127.0.0.1', port: 47900 });
    loginSocket.end();
    await once(loginSocket, 'close');

    const lobbySocket = await connectAndPhase(fixture.server, fixture.tables, 2);
    sockets.push(lobbySocket);
    const lobbyLogin = Buffer.from(
      '200047494e3700040000070069006e00650069003000300000',
      'hex',
    );
    lobbySocket.write(build0030Transport({ id: 2, inner: lobbyLogin, tables: fixture.tables }));
    await readFrames(lobbySocket, 1);

    const sessionRequest = Buffer.alloc(10);
    sessionRequest.writeUInt16BE(0x2009, 0);
    sessionRequest.writeUInt32LE(1, 2);
    sessionRequest.writeUInt32LE(1, 6);
    lobbySocket.write(build0030Transport({ id: 3, inner: sessionRequest, tables: fixture.tables }));
    const [sessionReply] = await readFrames(lobbySocket, 1);
    const redirect200a = decode0030(sessionReply, DECIPHER_KEY, fixture.tables, {
      subheaderBytes: 4,
    });
    assert.deepEqual(endpointFrom200a(redirect200a), { ip: '127.0.0.1', port: 47900 });
  } finally {
    for (const socket of sockets) socket.destroy();
    await fixture.server.close().catch(() => {});
    await rm(fixture.dir, { recursive: true, force: true });
  }
});

test('omitting advertisedEndpoint preserves the legacy 0x7001 golden', async () => {
  const fixture = await createFixtureServer({ port: 0, advertisedEndpoint: undefined });
  let socket = null;
  try {
    await fixture.server.listen();
    socket = await connectAndPhase(fixture.server, fixture.tables, 1);
    socket.write(build0030Transport({ id: 1, inner: CREDENTIAL_INNER, tables: fixture.tables }));
    const replies = await readFrames(socket, 2);
    const redirect = decode0030(replies[1], CREDENTIAL_INNER.subarray(2), fixture.tables);
    assert.equal(redirect.toString('hex'), DEFAULT_REDIRECT_HEX);
  } finally {
    socket?.destroy();
    await fixture.server.close().catch(() => {});
    await rm(fixture.dir, { recursive: true, force: true });
  }
});

test('both APIs reject invalid advertised endpoints before creating storage or traces', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'logh7-advertise-invalid-'));
  const accountsPath = join(dir, 'should-not-exist', 'accounts.json');
  const dbPath = join(dir, 'should-not-exist', 'runtime.sqlite');
  const tracePath = join(dir, 'should-not-exist', 'trace.jsonl');
  const invalidCases = [
    [{ ip: 'localhost', port: 47900 }, /valid IPv4 address/],
    [{ ip: '127..0.1', port: 47900 }, /valid IPv4 address/],
    [{ ip: '1e2.0.0.1', port: 47900 }, /valid IPv4 address/],
    [{ ip: ' 127.0.0.1', port: 47900 }, /valid IPv4 address/],
    [{ ip: '127.01.0.1', port: 47900 }, /valid IPv4 address/],
    [{ ip: '127.0.0.1', port: 0 }, /integer in 1\.\.65535/],
    [{ ip: '127.0.0.1', port: 47900.5 }, /integer in 1\.\.65535/],
    [{ ip: '127.0.0.1', port: -1 }, /integer in 1\.\.65535/],
    [{ ip: '127.0.0.1', port: 0x1_0000 }, /integer in 1\.\.65535/],
    [{ ip: '127.0.0.1', port: '47900' }, /integer in 1\.\.65535/],
  ];
  try {
    for (const [advertisedEndpoint, expectedError] of invalidCases) {
      assert.throws(
        () => createPlayableServer({ advertisedEndpoint, accountsPath, tracePath }),
        expectedError,
      );
      assert.throws(
        () => createPlayableRuntime({ advertisedEndpoint, accountsPath, dbPath, tracePath }),
        expectedError,
      );
    }
    assert.equal(existsSync(accountsPath), false);
    assert.equal(existsSync(dbPath), false);
    assert.equal(existsSync(tracePath), false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('both playable CLIs reject an unpaired advertised endpoint before listening', () => {
  const entries = [
    fileURLToPath(new URL('../src/presentation/main.mjs', import.meta.url)),
    fileURLToPath(new URL('../src/server/logh7-playable-server.mjs', import.meta.url)),
  ];
  for (const entry of entries) {
    for (const unpairedArgs of [
      ['--advertise-host', '127.0.0.1'],
      ['--advertise-port', '47900'],
    ]) {
      const result = spawnSync(process.execPath, [entry, ...unpairedArgs], {
        encoding: 'utf8',
        timeout: 5000,
      });
      assert.notEqual(result.status, 0, `${entry} ${unpairedArgs.join(' ')}`);
      assert.match(result.stderr, /--advertise-host and --advertise-port must be provided together/);
    }
  }
});

test('both playable CLIs reject invalid advertised IPv4 and port values', () => {
  const entries = [
    fileURLToPath(new URL('../src/presentation/main.mjs', import.meta.url)),
    fileURLToPath(new URL('../src/server/logh7-playable-server.mjs', import.meta.url)),
  ];
  const invalidCases = [
    [
      ['--advertise-host', 'localhost', '--advertise-port', '47900'],
      /valid IPv4 address/,
    ],
    [
      ['--advertise-host', '127..0.1', '--advertise-port', '47900'],
      /valid IPv4 address/,
    ],
    [
      ['--advertise-host', '1e2.0.0.1', '--advertise-port', '47900'],
      /valid IPv4 address/,
    ],
    [
      ['--advertise-host', ' 127.0.0.1', '--advertise-port', '47900'],
      /valid IPv4 address/,
    ],
    [
      ['--advertise-host', '127.01.0.1', '--advertise-port', '47900'],
      /valid IPv4 address/,
    ],
    [
      ['--advertise-host', '127.0.0.1', '--advertise-port', '0'],
      /invalid --advertise-port/,
    ],
    [
      ['--advertise-host', '127.0.0.1', '--advertise-port', '47900.5'],
      /invalid --advertise-port/,
    ],
    [
      ['--advertise-host', '127.0.0.1', '--advertise-port', '65536'],
      /invalid --advertise-port/,
    ],
  ];
  for (const entry of entries) {
    for (const [invalidArgs, expectedError] of invalidCases) {
      const result = spawnSync(process.execPath, [entry, ...invalidArgs], {
        encoding: 'utf8',
        timeout: 5000,
      });
      assert.notEqual(result.status, 0, `${entry} ${invalidArgs.join(' ')}`);
      assert.match(result.stderr, expectedError);
    }
  }
});
