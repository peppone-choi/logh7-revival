import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import net from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { startLogh7GameplayServer, startLogh7Server } from '../../src/server/logh7-server.mjs';
import {
  buildCommandOkResponseCandidate,
  buildPhase3ResponseFromPhase1Request,
  childCodecDecode,
  childCodecKeySchedule,
  extractChildCodecStaticTables,
} from '../../src/server/logh7-codec.mjs';

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

test('serves manifest-derived update.ini with binary-evidenced server keys', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'logh7-server-'));
  const manifest = path.join(root, 'manifest.json');
  await writeFile(
    manifest,
    JSON.stringify({
      title: 'LOGH VII',
      resources: [],
      server: {
        update: {
          VERSION: 131,
          BASE_DIR: '.\\',
          SERVER_ADDRESS: '127.0.0.1',
          SERVER_PORT: 4787,
          PORT: 47900,
        },
      },
    }),
    'utf8',
  );
  const server = await startLogh7Server({ host: '127.0.0.1', port: 0, manifestPath: manifest });

  try {
    const response = await fetch(`http://${server.host}:${server.port}/update.ini`);

    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type') ?? '', /^text\/plain\b/);
    assert.equal(
      await response.text(),
      '[UPDATE]\r\nVERSION=131\r\nBASE_DIR=.\\\r\nSERVER_ADDRESS=127.0.0.1\r\nSERVER_PORT=4787\r\nPORT=47900\r\n',
    );
  } finally {
    await server.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('keeps update.ini unavailable when manifest lacks server update schema', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'logh7-server-'));
  const manifest = path.join(root, 'manifest.json');
  await writeFile(manifest, JSON.stringify({ title: 'LOGH VII', resources: [] }), 'utf8');
  const server = await startLogh7Server({ host: '127.0.0.1', port: 0, manifestPath: manifest });

  try {
    const response = await fetch(`http://${server.host}:${server.port}/update.ini`);

    assert.equal(response.status, 404);
    assert.match(response.headers.get('content-type') ?? '', /^application\/json\b/);
    assert.deepEqual(await response.json(), { error: 'update.ini is not staged in the current manifest' });
  } finally {
    await server.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('serves client protocol catalog from manifest without gameplay response claims', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'logh7-server-'));
  const manifest = path.join(root, 'manifest.json');
  await writeFile(
    manifest,
    JSON.stringify({
      title: 'LOGH VII',
      resources: [],
      server: {
        clientProtocol: {
          defaults: {
            account: 'ginei00',
            loginServerPort: 47900,
            loginServerAddress: '202.8.80.179',
          },
          commandLineModes: [
            {
              mode: 'robot',
              usage: 'usage : >robot <login-server address> <login-server port> <session-server name>',
            },
          ],
          messageGroups: {
            login: ['LobbyLoginRequest', 'LobbyLoginOK'],
            session: ['SSLoginRequest', 'SSLoginOK'],
            world: ['RequestWorldInitialize', 'ResponseWorldInitialize'],
          },
          evidence: {
            responsePolicy: 'Do not emit protocol responses until real client packets are captured.',
          },
        },
      },
    }),
    'utf8',
  );
  const server = await startLogh7Server({ host: '127.0.0.1', port: 0, manifestPath: manifest });

  try {
    const response = await fetch(`http://${server.host}:${server.port}/protocol/client`);

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.defaults.account, 'ginei00');
    assert.equal(body.defaults.loginServerPort, 47900);
    assert.equal(body.commandLineModes[0].mode, 'robot');
    assert.deepEqual(body.messageGroups.world, ['RequestWorldInitialize', 'ResponseWorldInitialize']);
    assert.match(body.evidence.responsePolicy, /Do not emit protocol responses/);
  } finally {
    await server.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('keeps client protocol endpoint unavailable when manifest lacks protocol catalog', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'logh7-server-'));
  const manifest = path.join(root, 'manifest.json');
  await writeFile(manifest, JSON.stringify({ title: 'LOGH VII', resources: [], server: {} }), 'utf8');
  const server = await startLogh7Server({ host: '127.0.0.1', port: 0, manifestPath: manifest });

  try {
    const response = await fetch(`http://${server.host}:${server.port}/protocol/client`);

    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { error: 'client protocol catalog is not staged in the current manifest' });
  } finally {
    await server.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('captures gameplay TCP sessions without inventing a protocol response', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'logh7-gameplay-'));
  const manifest = path.join(root, 'manifest.json');
  const trace = path.join(root, 'gameplay-trace.jsonl');
  await writeFile(
    manifest,
    JSON.stringify({
      title: 'LOGH VII',
      server: {
        gameplay: {
          MODE: 'tcp-capture-stub',
          HOST: '127.0.0.1',
          PORT: 47900,
          LEGACY_ADDRESS: '202.8.80.179',
          CLIENT_LITERAL: 'ginei00',
        },
      },
    }),
    'utf8',
  );
  const server = await startLogh7GameplayServer({ host: '127.0.0.1', port: 0, manifestPath: manifest, tracePath: trace });

  try {
    await new Promise((resolve, reject) => {
      const socket = net.createConnection({ host: server.host, port: server.port });
      socket.once('error', reject);
      socket.once('connect', () => {
        socket.end(Buffer.from('ginei00', 'ascii'));
      });
      socket.once('close', resolve);
    });

    const lines = (await readFile(trace, 'utf8')).trim().split('\n').map((line) => JSON.parse(line));
    assert.equal(lines[0].event, 'connection');
    assert.equal(lines[0].schema.mode, 'tcp-capture-stub');
    assert.equal(lines[0].schema.port, 47900);
    assert.equal(lines[1].event, 'payload');
    assert.equal(lines[1].hex, Buffer.from('ginei00', 'ascii').toString('hex'));
    assert.equal(lines[2].event, 'close');
  } finally {
    await server.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('classifies the observed real login packet without emitting a response', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'logh7-gameplay-'));
  const manifest = path.join(root, 'manifest.json');
  const trace = path.join(root, 'gameplay-trace.jsonl');
  await writeFile(
    manifest,
    JSON.stringify({
      title: 'LOGH VII',
      server: {
        gameplay: {
          MODE: 'tcp-capture-stub',
          HOST: '127.0.0.1',
          PORT: 47900,
          LEGACY_ADDRESS: '202.8.80.179',
          CLIENT_LITERAL: 'ginei00',
        },
      },
    }),
    'utf8',
  );
  const server = await startLogh7GameplayServer({ host: '127.0.0.1', port: 0, manifestPath: manifest, tracePath: trace });

  try {
    const received = await new Promise((resolve, reject) => {
      const socket = net.createConnection({ host: server.host, port: server.port });
      const chunks = [];
      socket.once('error', reject);
      socket.once('connect', () => {
        socket.write(Buffer.from('001a0034a5eeed8ed2006d608f5f51cab90168cb467cd2eb355d8510', 'hex'));
        socket.end();
      });
      socket.on('data', (chunk) => chunks.push(chunk));
      socket.once('close', () => resolve(Buffer.concat(chunks)));
    });

    assert.equal(received.byteLength, 0);
    const lines = (await readFile(trace, 'utf8')).trim().split('\n').map((line) => JSON.parse(line));
    assert.equal(lines[1].event, 'payload');
    assert.deepEqual(lines[1].frame, {
      kind: 'observed-login-request',
      byteLength: 28,
      declaredPayloadLength: 26,
      messageCode: 52,
      bodyHex: 'a5eeed8ed2006d608f5f51cab90168cb467cd2eb355d8510',
      evidence: 'g004-generated-client-login.jsonl',
      responsePolicy: 'record only; do not emit login/session responses until response bytes are observed',
    });
  } finally {
    await server.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('emits explicit phase3 candidate frame for observed login packet when manifest provides one', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'logh7-gameplay-'));
  const manifest = path.join(root, 'manifest.json');
  const trace = path.join(root, 'gameplay-trace.jsonl');
  await writeFile(
    manifest,
    JSON.stringify({
      title: 'LOGH VII',
      server: {
        gameplay: {
          MODE: 'tcp-capture-stub',
          HOST: '127.0.0.1',
          PORT: 47900,
          LEGACY_ADDRESS: '202.8.80.179',
          CLIENT_LITERAL: 'ginei00',
          loginResponse: {
            requestCode: 52,
            frameHex: '001200356783362eee69aec7e7eca218faa2b528',
            evidence: 'g005-phase3-child-codec-response-green.txt',
            policy: 'explicit encrypted phase3 candidate only',
          },
        },
      },
    }),
    'utf8',
  );
  const server = await startLogh7GameplayServer({ host: '127.0.0.1', port: 0, manifestPath: manifest, tracePath: trace });

  try {
    const received = await new Promise((resolve, reject) => {
      const socket = net.createConnection({ host: server.host, port: server.port });
      const chunks = [];
      socket.once('error', reject);
      socket.once('connect', () => {
        socket.write(Buffer.from('001a0034a5eeed8ed2006d608f5f51cab90168cb467cd2eb355d8510', 'hex'));
        socket.end();
      });
      socket.on('data', (chunk) => chunks.push(chunk));
      socket.once('close', () => resolve(Buffer.concat(chunks)));
    });

    assert.equal(received.toString('hex'), '001200356783362eee69aec7e7eca218faa2b528');
    const lines = (await readFile(trace, 'utf8')).trim().split('\n').map((line) => JSON.parse(line));
    assert.equal(lines[0].schema.loginResponse.frame, undefined);
    assert.equal(lines[0].schema.loginResponse.frameHex, '001200356783362eee69aec7e7eca218faa2b528');
    assert.deepEqual(lines[2].response, {
      kind: 'configured-phase3-candidate',
      requestCode: 52,
      byteLength: 20,
      hex: '001200356783362eee69aec7e7eca218faa2b528',
      evidence: 'g005-phase3-child-codec-response-green.txt',
      policy: 'explicit encrypted phase3 candidate only',
    });
  } finally {
    await server.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('classifies observed post-handshake client packets without responding', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'logh7-gameplay-'));
  const manifest = path.join(root, 'manifest.json');
  const trace = path.join(root, 'gameplay-trace.jsonl');
  await writeFile(
    manifest,
    JSON.stringify({
      title: 'LOGH VII',
      server: {
        gameplay: {
          MODE: 'tcp-capture-stub',
          HOST: '127.0.0.1',
          PORT: 47900,
          LEGACY_ADDRESS: '202.8.80.179',
          CLIENT_LITERAL: 'ginei00',
        },
      },
    }),
    'utf8',
  );
  const server = await startLogh7GameplayServer({ host: '127.0.0.1', port: 0, manifestPath: manifest, tracePath: trace });

  try {
    const received = await new Promise((resolve, reject) => {
      const socket = net.createConnection({ host: server.host, port: server.port });
      const chunks = [];
      socket.once('error', reject);
      socket.once('connect', () => {
        socket.write(Buffer.from('000a003629af89de470c6280', 'hex'));
        socket.end();
      });
      socket.on('data', (chunk) => chunks.push(chunk));
      socket.once('close', () => resolve(Buffer.concat(chunks)));
    });

    assert.equal(received.byteLength, 0);
    const lines = (await readFile(trace, 'utf8')).trim().split('\n').map((line) => JSON.parse(line));
    assert.deepEqual(lines[1].frame, {
      kind: 'observed-post-phase3-client-packet',
      byteLength: 12,
      declaredPayloadLength: 10,
      messageCode: 54,
      bodyHex: '29af89de470c6280',
      evidence: 'g013-phase1-derived-real-client-probe.txt',
      responsePolicy: 'record only; next server response is not yet proven',
    });
  } finally {
    await server.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('classifies observed 0x0030 post-handshake packet without responding', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'logh7-gameplay-'));
  const manifest = path.join(root, 'manifest.json');
  const trace = path.join(root, 'gameplay-trace.jsonl');
  await writeFile(
    manifest,
    JSON.stringify({
      title: 'LOGH VII',
      server: {
        gameplay: {
          MODE: 'tcp-capture-stub',
          HOST: '127.0.0.1',
          PORT: 47900,
          LEGACY_ADDRESS: '202.8.80.179',
          CLIENT_LITERAL: 'ginei00',
        },
      },
    }),
    'utf8',
  );
  const server = await startLogh7GameplayServer({ host: '127.0.0.1', port: 0, manifestPath: manifest, tracePath: trace });

  try {
    const received = await new Promise((resolve, reject) => {
      const socket = net.createConnection({ host: server.host, port: server.port });
      const chunks = [];
      socket.once('error', reject);
      socket.once('connect', () => {
        socket.write(
          Buffer.from(
            '00320030590ca783b7cecfa3797058413770ac8d752dd02709b1ee545a3107fcabf0a2d83d54a1fcb9bcd135d389f3b40cdb78ef',
            'hex',
          ),
        );
        socket.end();
      });
      socket.on('data', (chunk) => chunks.push(chunk));
      socket.once('close', () => resolve(Buffer.concat(chunks)));
    });

    assert.equal(received.byteLength, 0);
    const lines = (await readFile(trace, 'utf8')).trim().split('\n').map((line) => JSON.parse(line));
    assert.deepEqual(lines[1].frame, {
      kind: 'observed-post-handshake-client-packet',
      byteLength: 52,
      declaredPayloadLength: 50,
      messageCode: 48,
      bodyHex:
        '590ca783b7cecfa3797058413770ac8d752dd02709b1ee545a3107fcabf0a2d83d54a1fcb9bcd135d389f3b40cdb78ef',
      evidence: 'g013-phase1-derived-real-client-probe.txt',
      responsePolicy: 'record only; next server response is not yet proven',
    });
  } finally {
    await server.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('emits explicit command OK candidate for observed 0x0030 packet when manifest provides one', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'logh7-gameplay-'));
  const manifest = path.join(root, 'manifest.json');
  const trace = path.join(root, 'gameplay-trace.jsonl');
  const frameHex = `04220031${'00'.repeat(1056)}`;
  await writeFile(
    manifest,
    JSON.stringify({
      title: 'LOGH VII',
      server: {
        gameplay: {
          MODE: 'tcp-capture-stub',
          HOST: '127.0.0.1',
          PORT: 47900,
          LEGACY_ADDRESS: '202.8.80.179',
          CLIENT_LITERAL: 'ginei00',
          commandOkResponses: [
            {
              requestCode: 48,
              responseCode: 49,
              frameHex,
              evidence: 'g022-command-ok-response-candidates.json',
              policy: 'explicit encrypted command OK candidate only',
            },
          ],
        },
      },
    }),
    'utf8',
  );
  const server = await startLogh7GameplayServer({ host: '127.0.0.1', port: 0, manifestPath: manifest, tracePath: trace });

  try {
    const received = await new Promise((resolve, reject) => {
      const socket = net.createConnection({ host: server.host, port: server.port });
      const chunks = [];
      socket.once('error', reject);
      socket.once('connect', () => {
        socket.write(
          Buffer.from(
            '00320030590ca783b7cecfa3797058413770ac8d752dd02709b1ee545a3107fcabf0a2d83d54a1fcb9bcd135d389f3b40cdb78ef',
            'hex',
          ),
        );
        socket.end();
      });
      socket.on('data', (chunk) => chunks.push(chunk));
      socket.once('close', () => resolve(Buffer.concat(chunks)));
    });

    assert.equal(received.toString('hex'), frameHex);
    const lines = (await readFile(trace, 'utf8')).trim().split('\n').map((line) => JSON.parse(line));
    assert.equal(lines[0].schema.commandOkResponses[0].frame, undefined);
    assert.equal(lines[0].schema.commandOkResponses[0].frameHex, frameHex);
    assert.deepEqual(lines[2].response, {
      kind: 'configured-command-ok-candidate',
      requestCode: 48,
      responseCode: 49,
      byteLength: 1060,
      hex: frameHex,
      evidence: 'g022-command-ok-response-candidates.json',
      policy: 'explicit encrypted command OK candidate only',
    });
  } finally {
    await server.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('emits dynamic phase3 and command OK candidates from one live phase1 request', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'logh7-gameplay-'));
  const manifest = path.join(root, 'manifest.json');
  const trace = path.join(root, 'gameplay-trace.jsonl');
  const clientExe = path.resolve('.omo/work/logh7-installed/exe/G7MTClient.exe');
  const transportKeyHex = '7b41344331333734382d303135392d346335342d414542332d3144363835373537363142337d';
  const requestFrame = Buffer.from('001a003422785b40fcdcf830b86fbd86cbc8cd0a4771041b05b0873c', 'hex');
  const phase3 = buildPhase3ResponseFromPhase1Request({
    clientExe,
    transportKey: Buffer.from(transportKeyHex, 'hex'),
    requestFrame,
    decipherKey: Buffer.from('XY', 'ascii'),
  });
  const commandOk = buildCommandOkResponseCandidate({
    tables: extractChildCodecStaticTables(clientExe),
    phase1Key: phase3.phase1Key,
    responseCode: 0x0031,
    entityKey: 0x12345678,
  });
  await writeFile(
    manifest,
    JSON.stringify({
      title: 'LOGH VII',
      server: {
        gameplay: {
          MODE: 'tcp-capture-stub',
          HOST: '127.0.0.1',
          PORT: 47900,
          LEGACY_ADDRESS: '202.8.80.179',
          CLIENT_LITERAL: 'ginei00',
          dynamicProbe: {
            clientExePath: clientExe,
            transportKeyHex,
            decipherKeyHex: Buffer.from('XY', 'ascii').toString('hex'),
            commandOkResponseCode: 49,
            commandOkEntityKey: 0x12345678,
            evidence: 'g024-dynamic-probe-server-green.txt',
            policy: 'explicit dynamic phase3 plus command OK probe only',
          },
        },
      },
    }),
    'utf8',
  );
  const server = await startLogh7GameplayServer({ host: '127.0.0.1', port: 0, manifestPath: manifest, tracePath: trace });

  try {
    const received = await new Promise((resolve, reject) => {
      const socket = net.createConnection({ host: server.host, port: server.port });
      const chunks = [];
      const timeout = setTimeout(() => {
        socket.destroy();
        reject(new Error('timed out waiting for dynamic probe responses'));
      }, 2000);
      socket.once('error', reject);
      socket.once('connect', () => socket.write(requestFrame));
      socket.on('data', (chunk) => {
        chunks.push(chunk);
        const body = Buffer.concat(chunks);
        if (body.length === phase3.frame.length) {
          socket.write(
            Buffer.from(
              '000a003629af89de470c628000320030590ca783b7cecfa3797058413770ac8d752dd02709b1ee545a3107fcabf0a2d83d54a1fcb9bcd135d389f3b40cdb78ef',
              'hex',
            ),
          );
        }
        if (body.length >= phase3.frame.length + commandOk.length) {
          socket.end();
        }
      });
      socket.once('close', () => {
        clearTimeout(timeout);
        resolve(Buffer.concat(chunks));
      });
    });

    assert.equal(received.subarray(0, phase3.frame.length).toString('hex'), phase3.frame.toString('hex'));
    assert.equal(received.subarray(phase3.frame.length).toString('hex'), commandOk.toString('hex'));
    const decoded = childCodecDecode(
      childCodecKeySchedule(extractChildCodecStaticTables(clientExe), phase3.phase1Key),
      received.subarray(phase3.frame.length + 4),
    );
    assert.equal(decoded[0x0c], 1);
    assert.equal(decoded.readUInt32LE(0x10), 0x12345678);
    const lines = (await readFile(trace, 'utf8')).trim().split('\n').map((line) => JSON.parse(line));
    const responses = lines.filter((line) => line.event === 'response').map((line) => line.response);
    assert.equal(lines[0].schema.dynamicProbe.clientExePath, undefined);
    assert.equal(lines[0].schema.dynamicProbe.enabled, true);
    assert.deepEqual(
      lines.filter((line) => line.event === 'payload').map((line) => line.frame.messageCode),
      [52, 54, 48],
    );
    assert.deepEqual(
      responses.map((response) => response.kind),
      ['dynamic-phase3-candidate', 'dynamic-command-ok-candidate'],
    );
    assert.equal(responses[0].phase1KeySource, 'decoded from same connection 0x0034');
    assert.equal(responses[1].phase1KeySource, 'decoded from same connection 0x0034');
  } finally {
    await server.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('records synchronized dynamic gameplay phases across split and coalesced TCP frames', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'logh7-gameplay-'));
  const manifest = path.join(root, 'manifest.json');
  const trace = path.join(root, 'gameplay-trace.jsonl');
  const clientExe = path.resolve('.omo/work/logh7-installed/exe/G7MTClient.exe');
  const transportKeyHex = '7b41344331333734382d303135392d346335342d414542332d3144363835373537363142337d';
  const requestFrame = Buffer.from('001a003422785b40fcdcf830b86fbd86cbc8cd0a4771041b05b0873c', 'hex');
  const phase3 = buildPhase3ResponseFromPhase1Request({
    clientExe,
    transportKey: Buffer.from(transportKeyHex, 'hex'),
    requestFrame,
    decipherKey: Buffer.from('XY', 'ascii'),
  });
  const commandOk = buildCommandOkResponseCandidate({
    tables: extractChildCodecStaticTables(clientExe),
    phase1Key: phase3.phase1Key,
    responseCode: 0x0031,
    entityKey: 0x12345678,
  });
  await writeFile(
    manifest,
    JSON.stringify({
      title: 'LOGH VII',
      server: {
        gameplay: {
          MODE: 'tcp-capture-stub',
          HOST: '127.0.0.1',
          PORT: 47900,
          LEGACY_ADDRESS: '202.8.80.179',
          CLIENT_LITERAL: 'ginei00',
          dynamicProbe: {
            clientExePath: clientExe,
            transportKeyHex,
            decipherKeyHex: Buffer.from('XY', 'ascii').toString('hex'),
            commandOkResponseCode: 49,
            commandOkEntityKey: 0x12345678,
            evidence: 'g024-dynamic-probe-server-green.txt',
            policy: 'explicit dynamic phase3 plus command OK probe only',
          },
        },
      },
    }),
    'utf8',
  );
  const server = await startLogh7GameplayServer({ host: '127.0.0.1', port: 0, manifestPath: manifest, tracePath: trace });

  try {
    const received = await new Promise((resolve, reject) => {
      const socket = net.createConnection({ host: server.host, port: server.port });
      const chunks = [];
      const timeout = setTimeout(() => {
        socket.destroy();
        reject(new Error('timed out waiting for synchronized dynamic probe responses'));
      }, 2000);
      socket.once('error', reject);
      socket.once('connect', () => {
        socket.write(requestFrame.subarray(0, 7));
        socket.write(requestFrame.subarray(7));
      });
      socket.on('data', (chunk) => {
        chunks.push(chunk);
        const body = Buffer.concat(chunks);
        if (body.length === phase3.frame.length) {
          socket.write(
            Buffer.from(
              '000a003629af89de470c628000320030590ca783b7cecfa3797058413770ac8d752dd02709b1ee545a3107fcabf0a2d83d54a1fcb9bcd135d389f3b40cdb78ef',
              'hex',
            ),
          );
        }
        if (body.length >= phase3.frame.length + commandOk.length) {
          socket.end();
        }
      });
      socket.once('close', () => {
        clearTimeout(timeout);
        resolve(Buffer.concat(chunks));
      });
    });

    assert.equal(received.subarray(0, phase3.frame.length).toString('hex'), phase3.frame.toString('hex'));
    assert.equal(received.subarray(phase3.frame.length).toString('hex'), commandOk.toString('hex'));
    const lines = (await readFile(trace, 'utf8')).trim().split('\n').map((line) => JSON.parse(line));
    const payloads = lines.filter((line) => line.event === 'payload');
    assert.deepEqual(
      payloads.map((line) => line.frame.messageCode),
      [52, 54, 48],
    );
    assert.deepEqual(
      payloads.map((line) => line.sync),
      [
        {
          sequence: 1,
          phaseBefore: 'awaiting-login',
          phaseAfter: 'phase3-response-sent',
          accepted: true,
          responseKind: 'dynamic-phase3-candidate',
        },
        {
          sequence: 2,
          phaseBefore: 'phase3-response-sent',
          phaseAfter: 'post-phase3-observed',
          accepted: true,
        },
        {
          sequence: 3,
          phaseBefore: 'post-phase3-observed',
          phaseAfter: 'post-handshake-observed',
          accepted: true,
          responseKind: 'dynamic-command-ok-candidate',
        },
      ],
    );
  } finally {
    await server.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('does not emit a second phase3 response for duplicate login packets on one TCP session', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'logh7-gameplay-'));
  const manifest = path.join(root, 'manifest.json');
  const trace = path.join(root, 'gameplay-trace.jsonl');
  const clientExe = path.resolve('.omo/work/logh7-installed/exe/G7MTClient.exe');
  const transportKeyHex = '7b41344331333734382d303135392d346335342d414542332d3144363835373537363142337d';
  const requestFrame = Buffer.from('001a003422785b40fcdcf830b86fbd86cbc8cd0a4771041b05b0873c', 'hex');
  const phase3 = buildPhase3ResponseFromPhase1Request({
    clientExe,
    transportKey: Buffer.from(transportKeyHex, 'hex'),
    requestFrame,
    decipherKey: Buffer.from('XY', 'ascii'),
  });
  await writeFile(
    manifest,
    JSON.stringify({
      title: 'LOGH VII',
      server: {
        gameplay: {
          MODE: 'tcp-capture-stub',
          HOST: '127.0.0.1',
          PORT: 47900,
          LEGACY_ADDRESS: '202.8.80.179',
          CLIENT_LITERAL: 'ginei00',
          dynamicProbe: {
            clientExePath: clientExe,
            transportKeyHex,
            decipherKeyHex: Buffer.from('XY', 'ascii').toString('hex'),
            commandOkResponseCode: 49,
            commandOkEntityKey: 0x12345678,
            evidence: 'g024-dynamic-probe-server-green.txt',
            policy: 'explicit dynamic phase3 plus command OK probe only',
          },
        },
      },
    }),
    'utf8',
  );
  const server = await startLogh7GameplayServer({ host: '127.0.0.1', port: 0, manifestPath: manifest, tracePath: trace });

  try {
    const received = await new Promise((resolve, reject) => {
      const socket = net.createConnection({ host: server.host, port: server.port });
      const chunks = [];
      const timeout = setTimeout(() => socket.end(), 100);
      socket.once('error', reject);
      socket.once('connect', () => socket.write(requestFrame));
      socket.on('data', (chunk) => {
        chunks.push(chunk);
        const body = Buffer.concat(chunks);
        if (body.length === phase3.frame.length) {
          socket.write(requestFrame);
        }
        if (body.length >= phase3.frame.length * 2) {
          socket.end();
        }
      });
      socket.once('close', () => {
        clearTimeout(timeout);
        resolve(Buffer.concat(chunks));
      });
    });

    assert.equal(received.toString('hex'), phase3.frame.toString('hex'));
    const lines = (await readFile(trace, 'utf8')).trim().split('\n').map((line) => JSON.parse(line));
    const payloads = lines.filter((line) => line.event === 'payload');
    const responses = lines.filter((line) => line.event === 'response');
    assert.equal(responses.length, 1);
    assert.deepEqual(
      payloads.map((line) => line.sync),
      [
        {
          sequence: 1,
          phaseBefore: 'awaiting-login',
          phaseAfter: 'phase3-response-sent',
          accepted: true,
          responseKind: 'dynamic-phase3-candidate',
        },
        {
          sequence: 2,
          phaseBefore: 'phase3-response-sent',
          phaseAfter: 'phase3-response-sent',
          accepted: false,
          reason: 'login request is only valid before phase3 response',
        },
      ],
    );
  } finally {
    await server.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('records malformed gameplay packet frames without a fabricated login response', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'logh7-gameplay-'));
  const manifest = path.join(root, 'manifest.json');
  const trace = path.join(root, 'gameplay-trace.jsonl');
  await writeFile(
    manifest,
    JSON.stringify({
      title: 'LOGH VII',
      server: {
        gameplay: {
          MODE: 'tcp-capture-stub',
          HOST: '127.0.0.1',
          PORT: 47900,
          LEGACY_ADDRESS: '202.8.80.179',
          CLIENT_LITERAL: 'ginei00',
        },
      },
    }),
    'utf8',
  );
  const server = await startLogh7GameplayServer({ host: '127.0.0.1', port: 0, manifestPath: manifest, tracePath: trace });

  try {
    const received = await new Promise((resolve, reject) => {
      const socket = net.createConnection({ host: server.host, port: server.port });
      const chunks = [];
      socket.once('error', reject);
      socket.once('connect', () => {
        socket.write(Buffer.from('001a', 'hex'));
        socket.end();
      });
      socket.on('data', (chunk) => chunks.push(chunk));
      socket.once('close', () => resolve(Buffer.concat(chunks)));
    });

    assert.equal(received.byteLength, 0);
    const lines = (await readFile(trace, 'utf8')).trim().split('\n').map((line) => JSON.parse(line));
    assert.deepEqual(lines[1].frame, {
      kind: 'malformed',
      reason: 'packet shorter than LOGH VII observed frame header',
      byteLength: 2,
    });
  } finally {
    await server.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('rejects gameplay TCP startup when manifest lacks gameplay schema', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'logh7-gameplay-'));
  const manifest = path.join(root, 'manifest.json');
  await writeFile(manifest, JSON.stringify({ title: 'LOGH VII', server: {} }), 'utf8');

  try {
    await assert.rejects(
      startLogh7GameplayServer({ host: '127.0.0.1', port: 0, manifestPath: manifest }),
      /server\.gameplay/,
    );
  } finally {
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
