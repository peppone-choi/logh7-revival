import { createWriteStream } from 'node:fs';
import { createServer } from 'node:net';

import {
  buildPhase3ResponseFromPhase1Request,
  childCodecDecode,
  childCodecEncode,
  childCodecKeySchedule,
  resolveChildCodecTables,
} from '../src/server/logh7-codec.mjs';
import {
  buildEncryptedSessionBootstrapCandidateFrames,
  buildSessionBootstrapCandidateFrames,
} from '../src/server/logh7-session-bootstrap.mjs';
import { buildWorldInitCandidateFrames } from '../src/server/logh7-world-init.mjs';
import { build0030Body, parse0030Body } from '../src/server/logh7-envelope-0030.mjs';

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

function buildEncrypted0030Frame({ tables, key, body }) {
  const reencoded = childCodecEncode(childCodecKeySchedule(tables, key), body);
  const out = Buffer.alloc(4 + reencoded.length);
  out.writeUInt16BE(2 + reencoded.length, 0);
  out.writeUInt16BE(0x0030, 2);
  reencoded.copy(out, 4);
  return out;
}

function optionalHexBuffer(value, name) {
  if (value === undefined || value === '') {
    return null;
  }
  const buffer = Buffer.from(value, 'hex');
  if (buffer.length === 0 || buffer.toString('hex') !== value.toLowerCase()) {
    throw new Error(`${name} must be valid non-empty hex`);
  }
  return buffer;
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
// Response-encode key: 'phase1' (default, legacy) encodes server->client with phase1Key;
// 'decipher' encodes with the advertised decipherKey. The asymmetric phase3 exchange advertises
// encipherKey=phase1.key and a separate decipherKey; the 0x0030 decode proves the client enciphers
// its sends with phase1Key, so by the 2-key design it deciphers server->client with decipherKey.
const responseKeyMode = arg('response-key', process.env.LOGH_RESPONSE_KEY || 'phase1');
const trace = createWriteStream(tracePath, { flags: 'w' });
const tables = resolveChildCodecTables({ clientExe });

if (!['phase1', 'decipher'].includes(responseKeyMode)) {
  throw new Error(`unsupported response-key mode: ${responseKeyMode}`);
}
function responseEncodeKey(phase1Key) {
  return responseKeyMode === 'decipher' ? decipherKey : phase1Key;
}
if (!['after-0036', 'after-0030', 'both'].includes(bootstrapTiming)) {
  throw new Error(`unsupported bootstrap timing: ${bootstrapTiming}`);
}
if (!['phase1-child-codec', 'raw'].includes(bootstrapEncoding)) {
  throw new Error(`unsupported bootstrap encoding: ${bootstrapEncoding}`);
}

function sendSessionBootstrapCandidates(socket, stream, phase1Key) {
  const candidates = bootstrapEncoding === 'raw'
    ? buildSessionBootstrapCandidateFrames({ decodedBody: bootstrapBody })
    : buildEncryptedSessionBootstrapCandidateFrames({ tables, phase1Key: responseEncodeKey(phase1Key), decodedBody: bootstrapBody });
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
    const phase3 = buildPhase3ResponseFromPhase1Request({ tables, transportKey, requestFrame: frame, decipherKey });
    state.phase1Key = phase3.phase1Key;
    const wrote = writeSocketFrame(socket, stream, phase3.frame, { kind: 'dynamic-phase3-candidate', code: 0x0035 });
    writeTrace(stream, { event: 'response', kind: 'dynamic-phase3-candidate', wrote, code: 0x0035, hex: phase3.frame.toString('hex') });
    return;
  }
  const suppressCandidates = process.env.LOGH_SUPPRESS_CANDIDATES === '1';
  if (code === 0x0036 && state.phase1Key !== null && !suppressCandidates && ['after-0036', 'both'].includes(bootstrapTiming) && !state.sentBootstrap) {
    sendSessionBootstrapCandidates(socket, stream, state.phase1Key);
    state.sentBootstrap = bootstrapTiming !== 'both';
    return;
  }
  if (code !== 0x0030 || state.phase1Key === null) {
    return;
  }
  if (process.env.LOGH_ECHO_0030 === '1') {
    // Evidence-based 0x30 routing test: decode the client's own 0x0030 (the only transport
    // code it routes besides handshake) with phase1Key, re-encode with the response key, and
    // send it back as a transport-0x0030 frame. Tests whether a 0x0030 reaches the client's
    // 0x30 vtable parser (bypassing the empty handler map).
    try {
      const decoded = childCodecDecode(childCodecKeySchedule(tables, state.phase1Key), frame.subarray(4));
      let responseBody = decoded;
      let parsed = null;
      // Connection-type gate (computed early): the login connection sends a large GIN7 credential
      // (inner 0x7000, innerLen >> 8); the lobby connection's join is short (inner 0x0020, innerLen 6).
      // When LOGH_REDIRECT_LOGIN_ONLY=1 we treat short inners as the lobby connection.
      const clientParsed = parse0030Body(decoded);
      const clientInnerLen = clientParsed.valid ? clientParsed.innerLen : 0;
      const isLobbyJoin = process.env.LOGH_REDIRECT_LOGIN_ONLY === '1' && clientInnerLen > 0 && clientInnerLen <= 8;
      // LOGH_FORCE_0031: forcing the echoed inner code to 0x31 routes the response into the client's
      // keysetup path (router 0x6130a0: inner==0x31 -> keysetup 0x6140c0). On the LOGIN connection this
      // is how the GIN7 session key gets installed so the subsequent 0x7001 redirect frame decrypts.
      // G138: on the LOBBY connection (which already owns a handshake-derived key) forcing 0x31 feeds
      // the keysetup garbage from the tiny 0x0020 payload and TEARS DOWN the connection. So we gate
      // forced-0031 to the login connection only (skip it for the lobby join).
      if (process.env.LOGH_FORCE_0031 === '1' && !isLobbyJoin) {
        parsed = parse0030Body(decoded);
        if (!parsed.valid) {
          throw new Error(`decoded 0x0030 body is invalid: ${parsed.reason}`);
        }
        const innerCodeOffset = Number(process.env.LOGH_0031_OFFSET || '0');
        const newInner = Buffer.from(parsed.innerPayload);
        newInner.writeUInt16BE(0x0031, innerCodeOffset); // bytes 00 31 -> client ntohs => 0x31
        responseBody = build0030Body({ id: parsed.id, innerPayload: newInner });
      }
      // LOGH_LOBBY_RESPONSE_INNER_HEX: on the lobby connection, replace the echoed body's inner with
      // a configurable response (non-0x31) so we can probe what advances the client past inner 0x0020.
      const lobbyResponseInnerHex = process.env.LOGH_LOBBY_RESPONSE_INNER_HEX;
      if (isLobbyJoin && lobbyResponseInnerHex !== undefined && lobbyResponseInnerHex !== '') {
        parsed = parse0030Body(decoded);
        if (!parsed.valid) {
          throw new Error(`decoded 0x0030 body is invalid: ${parsed.reason}`);
        }
        const lobbyInner = optionalHexBuffer(lobbyResponseInnerHex, 'LOGH_LOBBY_RESPONSE_INNER_HEX');
        responseBody = build0030Body({ id: parsed.id, innerPayload: lobbyInner });
      }
      const encodeKey = responseEncodeKey(state.phase1Key);
      const frames = [buildEncrypted0030Frame({ tables, key: encodeKey, body: responseBody })];
      const secondInnerHex = process.env.LOGH_SECOND_0030_INNER_HEX;
      let secondBody = null;
      let secondKeySource = null;
      // Connection-type gate: only the login connection should receive the 0x7001 lobby redirect.
      // The lobby connection's join (inner 0x0020, innerLen 6) must NOT be redirected again.
      if (secondInnerHex !== undefined && secondInnerHex !== '' && !isLobbyJoin) {
        parsed ??= parse0030Body(decoded);
        if (!parsed.valid) {
          throw new Error(`decoded 0x0030 body is invalid: ${parsed.reason}`);
        }
        const secondInner = optionalHexBuffer(secondInnerHex, 'LOGH_SECOND_0030_INNER_HEX');
        const secondId = Number(process.env.LOGH_SECOND_0030_ID || String(parsed.id));
        secondBody = build0030Body({ id: secondId, innerPayload: secondInner });
        const secondKey = optionalHexBuffer(process.env.LOGH_SECOND_0030_KEY_HEX, 'LOGH_SECOND_0030_KEY_HEX') ?? encodeKey;
        secondKeySource = process.env.LOGH_SECOND_0030_KEY_HEX === undefined || process.env.LOGH_SECOND_0030_KEY_HEX === ''
          ? responseKeyMode
          : 'LOGH_SECOND_0030_KEY_HEX';
        frames.push(buildEncrypted0030Frame({ tables, key: secondKey, body: secondBody }));
      }
      const out = Buffer.concat(frames);
      const wrote = writeSocketFrame(socket, stream, out, { kind: 'echo-0030', code: 0x0030 });
      writeTrace(stream, {
        event: 'response',
        kind: 'echo-0030',
        wrote,
        code: 0x0030,
        forced0031: process.env.LOGH_FORCE_0031 === '1',
        frameCount: frames.length,
        decodedHex: decoded.toString('hex'),
        responseBodyHex: responseBody.toString('hex'),
        second0030InnerHex: secondInnerHex ?? null,
        second0030BodyHex: secondBody === null ? null : secondBody.toString('hex'),
        second0030KeySource: secondKeySource,
        hex: out.toString('hex'),
      });
    } catch (error) {
      writeTrace(stream, { event: 'echo-0030-error', message: error.message });
    }
  }
  if (!suppressCandidates && ['after-0030', 'both'].includes(bootstrapTiming) && !state.sentBootstrap) {
    sendSessionBootstrapCandidates(socket, stream, state.phase1Key);
    state.sentBootstrap = true;
  }
  for (const candidate of (suppressCandidates ? [] : buildWorldInitCandidateFrames({ tables, phase1Key: responseEncodeKey(state.phase1Key) }))) {
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
