import { createWriteStream } from 'node:fs';
import { createServer } from 'node:net';

import { buildPhase3ResponseFromPhase1Request, extractChildCodecStaticTables } from '../src/server/logh7-codec.mjs';
import {
  buildEncryptedSessionBootstrapCandidateFrames,
  buildSessionBootstrapCandidateFrames,
} from '../src/server/logh7-session-bootstrap.mjs';
import { buildWorldInitCandidateFrames } from '../src/server/logh7-world-init.mjs';

function arg(name, fallback = null) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? fallback : process.argv[index + 1];
}

function writeTrace(stream, event) {
  stream.write(`${JSON.stringify({ at: new Date().toISOString(), ...event })}\n`);
}

function writeSocketFrame(socket, stream, frame, context) {
  if (socket.destroyed || socket.writableEnded || !socket.writable) {
    writeTrace(stream, { event: 'write-skipped', reason: 'socket-not-writable', ...context });
    return false;
  }
  try {
    socket.write(frame);
    return true;
  } catch (error) {
    writeTrace(stream, {
      event: 'write-error',
      code: error.code ?? null,
      message: error.message,
      ...context,
    });
    return false;
  }
}

const host = arg('host', '127.0.0.1');
const port = Number(arg('port', '47900'));
const tracePath = arg('trace');
const clientExe = arg('client-exe');
const transportKey = Buffer.from(arg('transport-key-hex'), 'hex');
const decipherKey = Buffer.from(arg('decipher-key-hex', '5859'), 'hex');
const bootstrapTiming = arg('bootstrap-timing', 'after-0036');
const bootstrapEncoding = arg('bootstrap-encoding', 'phase1-child-codec');
const bootstrapBody = Buffer.from(arg('bootstrap-body-hex', '01'), 'hex');
const trace = createWriteStream(tracePath, { flags: 'w' });
const tables = extractChildCodecStaticTables(clientExe);

if (!['after-0036', 'after-0030', 'both'].includes(bootstrapTiming)) {
  throw new Error(`unsupported bootstrap timing: ${bootstrapTiming}`);
}
if (!['phase1-child-codec', 'raw'].includes(bootstrapEncoding)) {
  throw new Error(`unsupported bootstrap encoding: ${bootstrapEncoding}`);
}

function sendSessionBootstrapCandidates(socket, stream, phase1Key) {
  const candidates = bootstrapEncoding === 'raw'
    ? buildSessionBootstrapCandidateFrames({ decodedBody: bootstrapBody })
    : buildEncryptedSessionBootstrapCandidateFrames({ tables, phase1Key, decodedBody: bootstrapBody });
  for (const candidate of candidates) {
    const wrote = writeSocketFrame(socket, stream, candidate.frame, {
      kind: 'dynamic-session-bootstrap-candidate',
      code: candidate.transportCode,
    });
    writeTrace(stream, {
      event: 'response',
      kind: 'dynamic-session-bootstrap-candidate',
      wrote,
      code: candidate.transportCode,
      transportCode: candidate.transportCode,
      queuedInternalCode: candidate.queuedInternalCode,
      queuedInternalHex: `0x${candidate.queuedInternalCode.toString(16).padStart(4, '0')}`,
      pairedInternalCode: candidate.pairedInternalCode,
      pairedInternalHex: `0x${candidate.pairedInternalCode.toString(16).padStart(4, '0')}`,
      messageName: candidate.messageName,
      stateWrite: candidate.stateWrite,
      decodedBodyHex: candidate.decodedBodyHex,
      encoding: bootstrapEncoding,
      hex: candidate.frame.toString('hex'),
    });
  }
}

function takeFrames(buffer) {
  const frames = [];
  let offset = 0;
  while (buffer.length - offset >= 4) {
    const totalLength = buffer.readUInt16BE(offset) + 2;
    if (totalLength < 4) {
      frames.push(buffer.subarray(offset));
      return { frames, remaining: Buffer.alloc(0) };
    }
    if (buffer.length - offset < totalLength) {
      break;
    }
    frames.push(buffer.subarray(offset, offset + totalLength));
    offset += totalLength;
  }
  return { frames, remaining: buffer.subarray(offset) };
}

function handleFrame(socket, stream, state, frame) {
  const code = frame.length >= 4 ? frame.readUInt16BE(2) : null;
  writeTrace(stream, { event: 'payload', code, byteLength: frame.length, hex: frame.toString('hex') });
  if (code === 0x0034) {
    const phase3 = buildPhase3ResponseFromPhase1Request({ clientExe, transportKey, requestFrame: frame, decipherKey });
    state.phase1Key = phase3.phase1Key;
    const wrote = writeSocketFrame(socket, stream, phase3.frame, { kind: 'dynamic-phase3-candidate', code: 0x0035 });
    writeTrace(stream, { event: 'response', kind: 'dynamic-phase3-candidate', wrote, code: 0x0035, hex: phase3.frame.toString('hex') });
    return;
  }
  if (code === 0x0036 && state.phase1Key !== null && ['after-0036', 'both'].includes(bootstrapTiming) && !state.sentBootstrap) {
    sendSessionBootstrapCandidates(socket, stream, state.phase1Key);
    state.sentBootstrap = bootstrapTiming !== 'both';
    return;
  }
  if (code !== 0x0030 || state.phase1Key === null) {
    return;
  }
  if (['after-0030', 'both'].includes(bootstrapTiming) && !state.sentBootstrap) {
    sendSessionBootstrapCandidates(socket, stream, state.phase1Key);
    state.sentBootstrap = true;
  }
  for (const candidate of buildWorldInitCandidateFrames({ tables, phase1Key: state.phase1Key })) {
    const wrote = writeSocketFrame(socket, stream, candidate.frame, {
      kind: 'dynamic-world-init-candidate',
      code: candidate.transportCode,
    });
    writeTrace(stream, {
      event: 'response',
      kind: 'dynamic-world-init-candidate',
      wrote,
      code: candidate.transportCode,
      transportCode: candidate.transportCode,
      queuedInternalCode: candidate.queuedInternalCode,
      queuedInternalHex: `0x${candidate.queuedInternalCode.toString(16).padStart(4, '0')}`,
      pairedInternalCode: candidate.pairedInternalCode,
      pairedInternalHex: `0x${candidate.pairedInternalCode.toString(16).padStart(4, '0')}`,
      messageName: candidate.messageName,
      decodedBodyHex: candidate.decodedBodyHex,
      hex: candidate.frame.toString('hex'),
    });
  }
}

const server = createServer((socket) => {
  const state = { phase1Key: null, sentBootstrap: false };
  let pendingBytes = Buffer.alloc(0);
  writeTrace(trace, { event: 'connection', remoteAddress: socket.remoteAddress, remotePort: socket.remotePort });
  socket.on('error', (error) => {
    writeTrace(trace, { event: 'socket-error', code: error.code ?? null, message: error.message });
  });
  socket.on('data', (chunk) => {
    pendingBytes = Buffer.concat([pendingBytes, chunk]);
    const result = takeFrames(pendingBytes);
    pendingBytes = Buffer.from(result.remaining);
    for (const frame of result.frames) {
      handleFrame(socket, trace, state, frame);
    }
  });
  socket.on('close', () => {
    if (pendingBytes.length > 0) {
      handleFrame(socket, trace, state, pendingBytes);
      pendingBytes = Buffer.alloc(0);
    }
    writeTrace(trace, { event: 'close' });
  });
});

server.listen(port, host, () => {
  console.log(`world-init probe listening on ${host}:${server.address().port}`);
});

process.on('SIGTERM', () => {
  server.close(() => trace.end());
});
