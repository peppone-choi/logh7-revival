import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import net from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { test } from 'node:test';

const PROBE_SERVER = path.resolve('tools/logh7_world_init_probe_server.mjs');
const TRANSPORT_KEY_HEX = '7b41344331333734382d303135392d346335342d414542332d3144363835373537363142337d';
const REQUEST_FRAME_HEX = '001a003422785b40fcdcf830b86fbd86cbc8cd0a4771041b05b0873c';
const G116_REQUEST_FRAME_HEX = '001a0034bbeb11d895b4241a7a6146d469a6421ea62a466fc5d26424';
const POST_PHASE3_FRAME_HEX = '000a003629af89de470c6280';
const POST_HANDSHAKE_FRAME_HEX =
  '00320030590ca783b7cecfa3797058413770ac8d752dd02709b1ee545a3107fcabf0a2d83d54a1fcb9bcd135d389f3b40cdb78ef';
const G116_POST_HANDSHAKE_FRAME_HEX =
  '003200305f7752b3679a0cd3d70f0f85026c937343c428d0b541259c4fa4a6c2ab80e7fb9da73dca2a6f22ff940222c102dcb266';

function waitForServer(child) {
  return new Promise((resolve, reject) => {
    let output = '';
    child.stdout.on('data', (chunk) => {
      output += chunk.toString('utf8');
      const match = output.match(/world-init probe listening on 127\.0\.0\.1:(\d+)/);
      if (match !== null) {
        resolve(Number(match[1]));
      }
    });
    child.once('error', reject);
    child.once('exit', (code) => {
      reject(new Error(`probe server exited before readiness: ${code ?? 'signal'}`));
    });
  });
}

async function closeProcess(child) {
  if (child.exitCode !== null) {
    return;
  }
  child.kill('SIGTERM');
  const timeout = new Promise((resolve) => {
    setTimeout(() => {
      if (child.exitCode === null) {
        child.kill('SIGKILL');
      }
      resolve();
    }, 1000);
  });
  await Promise.race([once(child, 'exit'), timeout]);
}

test('world-init probe server splits coalesced 0x0036 and 0x0030 frames', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'logh7-world-probe-'));
  const trace = path.join(root, 'trace.jsonl');
  const child = spawn(process.execPath, [
    PROBE_SERVER,
    '--host',
    '127.0.0.1',
    '--port',
    '0',
    '--trace',
    trace,
    '--transport-key-hex',
    TRANSPORT_KEY_HEX,
    '--decipher-key-hex',
    Buffer.from('XY', 'ascii').toString('hex'),
    '--bootstrap-timing',
    'after-0030',
    '--bootstrap-encoding',
    'raw',
    '--bootstrap-body-hex',
    '01000000',
  ]);

  try {
    const port = await waitForServer(child);
    const received = await new Promise((resolve, reject) => {
      const socket = net.createConnection({ host: '127.0.0.1', port });
      const chunks = [];
      let sentCoalescedFrames = false;
      const timeout = setTimeout(() => {
        socket.destroy();
        reject(new Error('timed out waiting for world-init responses after coalesced client frames'));
      }, 2000);
      socket.once('error', reject);
      socket.once('connect', () => {
        socket.write(Buffer.from(REQUEST_FRAME_HEX, 'hex'));
      });
      socket.on('data', (chunk) => {
        chunks.push(chunk);
        if (!sentCoalescedFrames && Buffer.concat(chunks).length >= 36) {
          sentCoalescedFrames = true;
          socket.write(Buffer.from(`${POST_PHASE3_FRAME_HEX}${POST_HANDSHAKE_FRAME_HEX}`, 'hex'));
        }
        if (Buffer.concat(chunks).length >= 76) {
          socket.end();
        }
      });
      socket.once('close', () => {
        clearTimeout(timeout);
        resolve(Buffer.concat(chunks));
      });
    });

    assert.ok(received.length >= 60);
    await new Promise((resolve) => {
      setTimeout(resolve, 50);
    });
    await closeProcess(child);
    const lines = (await readFile(trace, 'utf8')).trim().split('\n').map((line) => JSON.parse(line));
    const payloadCodes = lines.filter((line) => line.event === 'payload').map((line) => line.code);
    const responseKinds = lines.filter((line) => line.event === 'response').map((line) => line.kind);
    assert.deepEqual(payloadCodes, [0x0034, 0x0036, 0x0030]);
    assert.deepEqual(responseKinds, [
      'dynamic-phase3-candidate',
      'dynamic-session-bootstrap-candidate',
      'dynamic-session-bootstrap-candidate',
      'dynamic-world-init-candidate',
      'dynamic-world-init-candidate',
    ]);
  } finally {
    await closeProcess(child);
    await rm(root, { recursive: true, force: true });
  }
});

test('world-init probe server survives an aborted socket while writing candidates', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'logh7-world-probe-abort-'));
  const trace = path.join(root, 'trace.jsonl');
  const child = spawn(process.execPath, [
    PROBE_SERVER,
    '--host',
    '127.0.0.1',
    '--port',
    '0',
    '--trace',
    trace,
    '--transport-key-hex',
    TRANSPORT_KEY_HEX,
    '--decipher-key-hex',
    Buffer.from('XY', 'ascii').toString('hex'),
    '--bootstrap-timing',
    'both',
    '--bootstrap-encoding',
    'raw',
    '--bootstrap-body-hex',
    '01000000',
  ]);

  try {
    const port = await waitForServer(child);
    await new Promise((resolve, reject) => {
      const socket = net.createConnection({ host: '127.0.0.1', port });
      let sentAbortFrames = false;
      const timeout = setTimeout(() => {
        socket.destroy();
        reject(new Error('timed out waiting to abort after phase3 response'));
      }, 2000);
      socket.once('error', reject);
      socket.once('connect', () => {
        socket.write(Buffer.from(G116_REQUEST_FRAME_HEX, 'hex'));
      });
      socket.on('data', () => {
        if (sentAbortFrames) {
          return;
        }
        sentAbortFrames = true;
        socket.write(Buffer.from(`${POST_PHASE3_FRAME_HEX}${POST_HANDSHAKE_FRAME_HEX}`, 'hex'), () => {
          clearTimeout(timeout);
          socket.resetAndDestroy();
          resolve();
        });
      });
    });

    await new Promise((resolve) => {
      setTimeout(resolve, 250);
    });
    assert.equal(child.exitCode, null);
  } finally {
    await closeProcess(child);
    await rm(root, { recursive: true, force: true });
  }
});

test('world-init probe server can chain a second 0x0030 after forced keysetup', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'logh7-world-probe-chain-'));
  const trace = path.join(root, 'trace.jsonl');
  const child = spawn(
    process.execPath,
    [
      PROBE_SERVER,
      '--host',
      '127.0.0.1',
      '--port',
      '0',
      '--trace',
      trace,
      '--transport-key-hex',
      TRANSPORT_KEY_HEX,
      '--decipher-key-hex',
      Buffer.from('XY', 'ascii').toString('hex'),
      '--bootstrap-timing',
      'after-0030',
      '--bootstrap-encoding',
      'raw',
      '--bootstrap-body-hex',
      '01000000',
    ],
    {
      env: {
        ...process.env,
        LOGH_SUPPRESS_CANDIDATES: '1',
        LOGH_ECHO_0030: '1',
        LOGH_FORCE_0031: '1',
        LOGH_RESPONSE_KEY: 'decipher',
        LOGH_SECOND_0030_INNER_HEX: '020001',
        LOGH_SECOND_0030_KEY_HEX: Buffer.from('GIN7-key-after-31').toString('hex'),
      },
    },
  );

  try {
    const port = await waitForServer(child);
    const received = await new Promise((resolve, reject) => {
      const socket = net.createConnection({ host: '127.0.0.1', port });
      const chunks = [];
      let sentCoalescedFrames = false;
      const timeout = setTimeout(() => {
        socket.destroy();
        reject(new Error('timed out waiting for chained 0x0030 response'));
      }, 2000);
      socket.once('error', reject);
      socket.once('connect', () => {
        socket.write(Buffer.from(G116_REQUEST_FRAME_HEX, 'hex'));
      });
      socket.on('data', (chunk) => {
        chunks.push(chunk);
        if (!sentCoalescedFrames && Buffer.concat(chunks).length >= 36) {
          sentCoalescedFrames = true;
          socket.write(Buffer.from(`${POST_PHASE3_FRAME_HEX}${G116_POST_HANDSHAKE_FRAME_HEX}`, 'hex'));
        }
        if (Buffer.concat(chunks).length >= 80) {
          socket.end();
        }
      });
      socket.once('close', () => {
        clearTimeout(timeout);
        resolve(Buffer.concat(chunks));
      });
    });

    assert.ok(received.length >= 80);
    await new Promise((resolve) => {
      setTimeout(resolve, 50);
    });
    await closeProcess(child);
    const lines = (await readFile(trace, 'utf8')).trim().split('\n').map((line) => JSON.parse(line));
    const responses = lines.filter((line) => line.event === 'response');
    assert.equal(responses[0].kind, 'dynamic-phase3-candidate');
    assert.equal(responses[1].kind, 'echo-0030');
    assert.equal(responses[1].frameCount, 2);
    assert.equal(responses[1].forced0031, true);
    assert.equal(responses[1].second0030InnerHex, '020001');
    assert.equal(responses[1].second0030KeySource, 'LOGH_SECOND_0030_KEY_HEX');
    assert.match(responses[1].hex, /^00320030/);
  } finally {
    await closeProcess(child);
    await rm(root, { recursive: true, force: true });
  }
});
