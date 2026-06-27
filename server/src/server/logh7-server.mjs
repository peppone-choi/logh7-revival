import { createReadStream, createWriteStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createServer as createTcpServer } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildCommandOkResponseCandidate,
  buildPhase3ResponseFromPhase1Request,
  resolveChildCodecTables,
} from './logh7-codec.mjs';
import { startLogh7AuthServer } from './logh7-auth-server.mjs';
import { createAccountStore } from './logh7-login-session.mjs';
import { createAccountRegistry } from './logh7-account-registry.mjs';
import { runAdminCommand } from './logh7-admin.mjs';
import { parseBool } from './logh7-config.mjs';
import { applyEnvDefaults, loadDotEnv } from './logh7-config.mjs';
import {
  createRepository,
  DEFAULT_JSON_SEED_SNAPSHOT_PATH,
  DEFAULT_SQLITE_PATH,
} from './logh7-repository.mjs';

const DEFAULT_TRANSPORT_KEY_HEX = '7b41344331333734382d303135392d346335342d414542332d3144363835373537363142337d';
const DEFAULT_DECIPHER_KEY_HEX = '5859';
const EPHEMERAL_PORT_RETRY_LIMIT = 16;

// Fetch and browsers refuse a small set of historically unsafe ports before any socket is opened.
// Tests and the local UI bind with port 0, so retry if the OS hands us one of those ports.
const FETCH_FORBIDDEN_PORTS = new Set([
  1, 7, 9, 11, 13, 15, 17, 19, 20, 21, 22, 23, 25, 37, 42, 43, 53, 69, 77,
  79, 87, 95, 101, 102, 103, 104, 109, 110, 111, 113, 115, 117, 119, 123,
  135, 137, 139, 143, 161, 179, 389, 427, 465, 512, 513, 514, 515, 526,
  530, 531, 532, 540, 548, 554, 556, 563, 587, 601, 636, 989, 990, 993,
  995, 1719, 1720, 1723, 2049, 3659, 4045, 5060, 5061, 6000, 6566, 6665,
  6666, 6667, 6668, 6669, 6697, 10080,
]);

export function isFetchForbiddenPort(port) {
  return Number.isInteger(port) && FETCH_FORBIDDEN_PORTS.has(port);
}

function jsonResponse(response, status, body) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(`${JSON.stringify(body)}\n`);
}

function textResponse(response, status, body) {
  response.writeHead(status, { 'content-type': 'text/plain; charset=utf-8' });
  response.end(body);
}

function bufferFromEvenHex(hex, label) {
  if (typeof hex !== 'string' || !/^(?:[0-9a-fA-F]{2})*$/.test(hex)) {
    throw new Error(`${label} must be an even-length hex string`);
  }
  return Buffer.from(hex, 'hex');
}

function listenOnce(server, host, port) {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      server.off('error', onError);
      server.off('listening', onListening);
    };
    const onError = (error) => {
      cleanup();
      reject(error);
    };
    const onListening = () => {
      cleanup();
      resolve();
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, host);
  });
}

function closeNodeServer(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

async function listenHttpServer(server, host, port) {
  if (port !== 0) {
    await listenOnce(server, host, port);
    const address = server.address();
    return typeof address === 'object' && address !== null ? address.port : port;
  }
  for (let attempt = 0; attempt < EPHEMERAL_PORT_RETRY_LIMIT; attempt += 1) {
    await listenOnce(server, host, 0);
    const address = server.address();
    const boundPort = typeof address === 'object' && address !== null ? address.port : port;
    if (!isFetchForbiddenPort(boundPort)) {
      return boundPort;
    }
    await closeNodeServer(server);
  }
  throw new Error(`failed to bind an HTTP port usable by Fetch after ${EPHEMERAL_PORT_RETRY_LIMIT} attempts`);
}

function parseArgs(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const part = argv[index];
    if (!part.startsWith('--')) {
      continue;
    }
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--')) {
      values.set(part.slice(2), 'true');
    } else {
      values.set(part.slice(2), value);
      index += 1;
    }
  }
  return values;
}

// config.parseBool로 통일 — 같은 env를 모듈마다 다르게 해석하지 않게 한다(이전엔 config asBool은 '1'/'true'만).
function isEnabled(value) {
  return parseBool(value);
}

export function createServeAuthAccountStore({
  accountDbPath = null,
  accountSeedPath = null,
  allowFirstLoginRegistration = false,
} = {}) {
  if (!accountDbPath) {
    // Strict by default: without an account DB, only pre-seeded credentials match.
    // Use --account-db (or LOGH_ACCOUNT_DB) and, for local one-shot setups,
    // --allow-first-login-registration to enable Trust-On-First-Use capture.
    return createAccountStore({ acceptAnyGin7: false });
  }
  return createAccountStore({
    acceptAnyGin7: false,
    allowRegister: allowFirstLoginRegistration,
    registry: createAccountRegistry({
      persistPath: path.resolve(accountDbPath),
      seedPath: accountSeedPath === null ? null : path.resolve(accountSeedPath),
    }),
  });
}

function parseCharacterRecords(args) {
  const raw = args.get('character-ids') ?? args.get('character-id');
  if (raw === undefined) {
    return undefined;
  }
  const ids = String(raw)
    .split(',')
    .map((value) => Number(value.trim()));
  if (ids.length === 0 || ids.some((id) => !Number.isInteger(id) || id <= 0 || id > 0xffff)) {
    throw new Error(`--character-id/--character-ids must be one or two uint16 ids: ${raw}`);
  }
  if (ids.length > 2) {
    throw new Error(`--character-id/--character-ids accepts at most two ids: ${raw}`);
  }
  return ids.map((id) => ({ id }));
}

function isSqliteFilePath(value) {
  return typeof value === 'string' && /\.(sqlite|sqlite3|db)$/iu.test(value);
}

function resolveSnapshotStoreOptions(env = process.env) {
  const legacySnapshotPath = env.LOGH_SNAPSHOT_PATH ?? null;
  return {
    backend: env.LOGH_REPOSITORY_BACKEND ?? env.LOGH_PERSIST_BACKEND ?? 'sqlite',
    path: env.LOGH_SQLITE_PATH ?? (isSqliteFilePath(legacySnapshotPath) ? legacySnapshotPath : DEFAULT_SQLITE_PATH),
    seedPath:
      env.LOGH_SNAPSHOT_SEED_JSON ??
      env.LOGH_WORLD_SEED_JSON ??
      (!isSqliteFilePath(legacySnapshotPath) ? legacySnapshotPath : null) ??
      DEFAULT_JSON_SEED_SNAPSHOT_PATH,
  };
}

async function readManifest(manifestPath) {
  return JSON.parse(await readFile(manifestPath, 'utf8'));
}

function updateIniFromManifest(manifest) {
  const update = manifest?.server?.update;
  const keys = ['VERSION', 'BASE_DIR', 'SERVER_ADDRESS', 'SERVER_PORT', 'PORT'];
  if (typeof update !== 'object' || update === null || keys.some((key) => update[key] === undefined)) {
    return null;
  }
  return `[UPDATE]\r\n${keys.map((key) => `${key}=${update[key]}`).join('\r\n')}\r\n`;
}

function clientProtocolFromManifest(manifest) {
  const clientProtocol = manifest?.server?.clientProtocol;
  if (typeof clientProtocol !== 'object' || clientProtocol === null) {
    return null;
  }
  return clientProtocol;
}

function gameplaySchemaFromManifest(manifest) {
  const gameplay = manifest?.server?.gameplay;
  const keys = ['MODE', 'HOST', 'PORT', 'LEGACY_ADDRESS', 'CLIENT_LITERAL'];
  if (typeof gameplay !== 'object' || gameplay === null || keys.some((key) => gameplay[key] === undefined)) {
    throw new Error('server.gameplay schema is required for gameplay TCP capture');
  }
  let loginResponse = null;
  if (typeof gameplay.loginResponse === 'object' && gameplay.loginResponse !== null) {
    loginResponse = {
      requestCode: Number(gameplay.loginResponse.requestCode),
      frame: Buffer.from(String(gameplay.loginResponse.frameHex), 'hex'),
      frameHex: String(gameplay.loginResponse.frameHex).toLowerCase(),
      evidence: String(gameplay.loginResponse.evidence),
      policy: String(gameplay.loginResponse.policy),
    };
    if (loginResponse.frame.toString('hex') !== loginResponse.frameHex) {
      throw new Error('server.gameplay.loginResponse.frameHex must be valid lowercase hex');
    }
  }
  const commandOkResponses = [];
  if (Array.isArray(gameplay.commandOkResponses)) {
    for (const item of gameplay.commandOkResponses) {
      if (typeof item !== 'object' || item === null) {
        throw new Error('server.gameplay.commandOkResponses entries must be objects');
      }
      const response = {
        requestCode: Number(item.requestCode),
        responseCode: Number(item.responseCode),
        frame: Buffer.from(String(item.frameHex), 'hex'),
        frameHex: String(item.frameHex).toLowerCase(),
        evidence: String(item.evidence),
        policy: String(item.policy),
      };
      if (response.frame.toString('hex') !== response.frameHex) {
        throw new Error('server.gameplay.commandOkResponses.frameHex must be valid lowercase hex');
      }
      if (response.frame.length < 4 || response.frame.readUInt16BE(2) !== response.responseCode) {
        throw new Error('server.gameplay.commandOkResponses.frameHex response code mismatch');
      }
      commandOkResponses.push(response);
    }
  }
  let dynamicProbe = null;
  if (typeof gameplay.dynamicProbe === 'object' && gameplay.dynamicProbe !== null) {
    dynamicProbe = {
      clientExePath: path.resolve(String(gameplay.dynamicProbe.clientExePath)),
      transportKey: Buffer.from(String(gameplay.dynamicProbe.transportKeyHex), 'hex'),
      transportKeyHex: String(gameplay.dynamicProbe.transportKeyHex).toLowerCase(),
      decipherKey: Buffer.from(String(gameplay.dynamicProbe.decipherKeyHex), 'hex'),
      decipherKeyHex: String(gameplay.dynamicProbe.decipherKeyHex).toLowerCase(),
      commandOkResponseCode: Number(gameplay.dynamicProbe.commandOkResponseCode),
      commandOkEntityKey:
        gameplay.dynamicProbe.commandOkEntityKey === undefined ? null : Number(gameplay.dynamicProbe.commandOkEntityKey),
      evidence: String(gameplay.dynamicProbe.evidence),
      policy: String(gameplay.dynamicProbe.policy),
    };
    if (dynamicProbe.transportKey.toString('hex') !== dynamicProbe.transportKeyHex) {
      throw new Error('server.gameplay.dynamicProbe.transportKeyHex must be valid lowercase hex');
    }
    if (dynamicProbe.decipherKey.toString('hex') !== dynamicProbe.decipherKeyHex) {
      throw new Error('server.gameplay.dynamicProbe.decipherKeyHex must be valid lowercase hex');
    }
  }
  return {
    mode: String(gameplay.MODE),
    host: String(gameplay.HOST),
    port: Number(gameplay.PORT),
    legacyAddress: String(gameplay.LEGACY_ADDRESS),
    clientLiteral: String(gameplay.CLIENT_LITERAL),
    loginResponse,
    commandOkResponses,
    dynamicProbe,
    dynamicTables: dynamicProbe === null ? null : resolveChildCodecTables({ clientExe: dynamicProbe.clientExePath }),
  };
}

function createTraceWriter(tracePath) {
  if (tracePath === undefined) {
    return null;
  }
  const stream = createWriteStream(path.resolve(tracePath), { flags: 'a' });
  let pending = Promise.resolve();
  return {
    write(event) {
      const line = `${JSON.stringify({ at: new Date().toISOString(), ...event })}\n`;
      pending = pending.then(
        () => new Promise((resolve, reject) => {
          stream.write(line, (error) => (error ? reject(error) : resolve()));
        }),
      );
    },
    flush() {
      return pending;
    },
    async close() {
      await pending;
      await new Promise((resolve, reject) => {
        stream.end((error) => (error ? reject(error) : resolve()));
      });
    },
  };
}

function writeTrace(traceWriter, event) {
  if (traceWriter === null) {
    return;
  }
  traceWriter.write(event);
}

function parseGameplayFrame(chunk) {
  if (chunk.length < 4) {
    return {
      kind: 'malformed',
      reason: 'packet shorter than LOGH VII observed frame header',
      byteLength: chunk.length,
    };
  }
  const declaredPayloadLength = chunk.readUInt16BE(0);
  const messageCode = chunk.readUInt16BE(2);
  if (chunk.length !== declaredPayloadLength + 2) {
    return {
      kind: 'malformed',
      reason: 'packet byteLength does not match observed length prefix',
      byteLength: chunk.length,
      declaredPayloadLength,
    };
  }
  if (declaredPayloadLength === 26 && messageCode === 52) {
    return {
      kind: 'observed-login-request',
      byteLength: chunk.length,
      declaredPayloadLength,
      messageCode,
      bodyHex: chunk.subarray(4).toString('hex'),
      evidence: 'g004-generated-client-login.jsonl',
      responsePolicy: 'record only; do not emit login/session responses until response bytes are observed',
    };
  }
  if (declaredPayloadLength === 10 && messageCode === 54) {
    return {
      kind: 'observed-post-phase3-client-packet',
      byteLength: chunk.length,
      declaredPayloadLength,
      messageCode,
      bodyHex: chunk.subarray(4).toString('hex'),
      evidence: 'g013-phase1-derived-real-client-probe.txt',
      responsePolicy: 'record only; next server response is not yet proven',
    };
  }
  if (declaredPayloadLength === 50 && messageCode === 48) {
    return {
      kind: 'observed-post-handshake-client-packet',
      byteLength: chunk.length,
      declaredPayloadLength,
      messageCode,
      bodyHex: chunk.subarray(4).toString('hex'),
      evidence: 'g013-phase1-derived-real-client-probe.txt',
      responsePolicy: 'record only; next server response is not yet proven',
    };
  }
  return {
    kind: 'unknown-observed-frame',
    byteLength: chunk.length,
    declaredPayloadLength,
    messageCode,
    bodyHex: chunk.subarray(4).toString('hex'),
    responsePolicy: 'record only; do not emit login/session responses until response bytes are observed',
  };
}

function takeGameplayFrames(buffer) {
  const frames = [];
  let offset = 0;
  while (buffer.length - offset >= 4) {
    const declaredPayloadLength = buffer.readUInt16BE(offset);
    const totalLength = declaredPayloadLength + 2;
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

function createGameplayConnectionState() {
  return { phase1Key: null, lastPacket: null, sessionPhase: 'awaiting-login', sequence: 0 };
}

function traceGameplayPayload(traceStream, connectionId, chunk, frame, sync) {
  writeTrace(traceStream, {
    event: 'payload',
    connectionId,
    byteLength: chunk.length,
    hex: chunk.toString('hex'),
    frame,
    sync,
  });
}

function responseForGameplayFrame(schema, frame, connectionState) {
  if (frame.kind === 'observed-login-request' && connectionState.sessionPhase !== 'awaiting-login') {
    return null;
  }
  if (schema.dynamicProbe !== null && frame.kind === 'observed-login-request') {
    const result = buildPhase3ResponseFromPhase1Request({
      clientExe: schema.dynamicProbe.clientExePath,
      transportKey: schema.dynamicProbe.transportKey,
      requestFrame: connectionState.lastPacket,
      decipherKey: schema.dynamicProbe.decipherKey,
    });
    connectionState.phase1Key = result.phase1Key;
    return {
      kind: 'dynamic-phase3-candidate',
      requestCode: frame.messageCode,
      responseCode: 0x0035,
      byteLength: result.frame.length,
      hex: result.frame.toString('hex'),
      evidence: schema.dynamicProbe.evidence,
      policy: schema.dynamicProbe.policy,
      phase1KeySource: 'decoded from same connection 0x0034',
      frame: result.frame,
    };
  }
  if (schema.dynamicProbe !== null && frame.kind === 'observed-post-handshake-client-packet' && connectionState.phase1Key !== null) {
    const frameBytes = buildCommandOkResponseCandidate({
      tables: schema.dynamicTables,
      phase1Key: connectionState.phase1Key,
      responseCode: schema.dynamicProbe.commandOkResponseCode,
      entityKey: schema.dynamicProbe.commandOkEntityKey,
    });
    return {
      kind: 'dynamic-command-ok-candidate',
      requestCode: frame.messageCode,
      responseCode: schema.dynamicProbe.commandOkResponseCode,
      byteLength: frameBytes.length,
      hex: frameBytes.toString('hex'),
      evidence: schema.dynamicProbe.evidence,
      policy: schema.dynamicProbe.policy,
      phase1KeySource: 'decoded from same connection 0x0034',
      frame: frameBytes,
    };
  }
  if (schema.loginResponse !== null && frame.kind === 'observed-login-request') {
    if (frame.messageCode !== schema.loginResponse.requestCode) {
      return null;
    }
    return {
      kind: 'configured-phase3-candidate',
      requestCode: schema.loginResponse.requestCode,
      byteLength: schema.loginResponse.frame.length,
      hex: schema.loginResponse.frameHex,
      evidence: schema.loginResponse.evidence,
      policy: schema.loginResponse.policy,
      frame: schema.loginResponse.frame,
    };
  }
  if (frame.kind === 'observed-post-handshake-client-packet') {
    const commandOkResponse = schema.commandOkResponses.find((item) => item.requestCode === frame.messageCode);
    if (commandOkResponse !== undefined) {
      return {
        kind: 'configured-command-ok-candidate',
        requestCode: commandOkResponse.requestCode,
        responseCode: commandOkResponse.responseCode,
        byteLength: commandOkResponse.frame.length,
        hex: commandOkResponse.frameHex,
        evidence: commandOkResponse.evidence,
        policy: commandOkResponse.policy,
        frame: commandOkResponse.frame,
      };
    }
  }
  return null;
}

function recordGameplaySync(frame, response, connectionState) {
  const phaseBefore = connectionState.sessionPhase;
  connectionState.sequence += 1;
  const sync = {
    sequence: connectionState.sequence,
    phaseBefore,
    phaseAfter: phaseBefore,
    accepted: false,
  };
  if (response !== null) {
    sync.responseKind = response.kind;
  }
  if (frame.kind === 'malformed') {
    sync.reason = 'malformed frame';
    return sync;
  }
  if (frame.kind === 'observed-login-request') {
    if (phaseBefore !== 'awaiting-login') {
      sync.reason = 'login request is only valid before phase3 response';
      return sync;
    }
    if (response !== null) {
      connectionState.sessionPhase = 'phase3-response-sent';
      sync.phaseAfter = connectionState.sessionPhase;
      sync.accepted = true;
      return sync;
    }
    sync.accepted = true;
    sync.reason = 'login request recorded without configured response';
    return sync;
  }
  if (frame.kind === 'observed-post-phase3-client-packet') {
    if (phaseBefore !== 'phase3-response-sent') {
      sync.reason = 'post-phase3 packet is only valid after phase3 response';
      return sync;
    }
    connectionState.sessionPhase = 'post-phase3-observed';
    sync.phaseAfter = connectionState.sessionPhase;
    sync.accepted = true;
    return sync;
  }
  if (frame.kind === 'observed-post-handshake-client-packet') {
    if (phaseBefore === 'awaiting-login' && response === null) {
      sync.reason = 'post-handshake packet requires phase3 response on this connection';
      return sync;
    }
    connectionState.sessionPhase = 'post-handshake-observed';
    sync.phaseAfter = connectionState.sessionPhase;
    sync.accepted = true;
    return sync;
  }
  sync.reason = 'unknown frame recorded without session transition';
  return sync;
}

function traceGameplaySchema(schema) {
  return {
    mode: schema.mode,
    host: schema.host,
    port: schema.port,
    legacyAddress: schema.legacyAddress,
    clientLiteral: schema.clientLiteral,
    loginResponse:
      schema.loginResponse === null
        ? null
        : {
            requestCode: schema.loginResponse.requestCode,
            frameHex: schema.loginResponse.frameHex,
            evidence: schema.loginResponse.evidence,
            policy: schema.loginResponse.policy,
          },
    commandOkResponses: schema.commandOkResponses.map((item) => ({
      requestCode: item.requestCode,
      responseCode: item.responseCode,
      frameHex: item.frameHex,
      evidence: item.evidence,
      policy: item.policy,
    })),
    dynamicProbe:
      schema.dynamicProbe === null
        ? null
        : {
            enabled: true,
            commandOkResponseCode: schema.dynamicProbe.commandOkResponseCode,
            commandOkEntityKey: schema.dynamicProbe.commandOkEntityKey,
            evidence: schema.dynamicProbe.evidence,
            policy: schema.dynamicProbe.policy,
          },
  };
}

function resourcePath(root, requestPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(requestPath.replace(/^\/resources\//, ''));
  } catch (error) {
    if (error instanceof URIError) {
      return { kind: 'malformed' };
    }
    throw error;
  }
  const resolved = path.resolve(root, decoded);
  const rootPath = path.resolve(root);
  if (resolved !== rootPath && !resolved.startsWith(`${rootPath}${path.sep}`)) {
    return { kind: 'missing' };
  }
  return { kind: 'path', path: resolved };
}

export async function startLogh7Server({ host, port, manifestPath, resourceRoot = path.dirname(manifestPath) }) {
  const absoluteManifest = path.resolve(manifestPath);
  const absoluteResourceRoot = path.resolve(resourceRoot);
  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', `http://${host}:${port}`);
    if (url.pathname === '/health') {
      jsonResponse(response, 200, { ok: true, service: 'logh7-local-resource-server' });
      return;
    }
    if (url.pathname === '/manifest') {
      jsonResponse(response, 200, await readManifest(absoluteManifest));
      return;
    }
    if (url.pathname === '/update.ini') {
      const updateIni = updateIniFromManifest(await readManifest(absoluteManifest));
      if (updateIni !== null) {
        textResponse(response, 200, updateIni);
        return;
      }
      jsonResponse(response, 404, { error: 'update.ini is not staged in the current manifest' });
      return;
    }
    if (url.pathname === '/protocol/client') {
      const clientProtocol = clientProtocolFromManifest(await readManifest(absoluteManifest));
      if (clientProtocol !== null) {
        jsonResponse(response, 200, clientProtocol);
        return;
      }
      jsonResponse(response, 404, { error: 'client protocol catalog is not staged in the current manifest' });
      return;
    }
    if (url.pathname.startsWith('/resources/')) {
      const resolved = resourcePath(absoluteResourceRoot, url.pathname);
      if (resolved.kind === 'malformed') {
        jsonResponse(response, 400, { error: 'malformed resource path' });
        return;
      }
      if (resolved.kind === 'missing') {
        jsonResponse(response, 404, { error: 'resource not found' });
        return;
      }
      try {
        const info = await stat(resolved.path);
        if (!info.isFile()) {
          jsonResponse(response, 404, { error: 'resource not found' });
          return;
        }
        response.writeHead(200, { 'content-type': 'application/octet-stream' });
        createReadStream(resolved.path).pipe(response);
      } catch (error) {
        if (error instanceof Error) {
          jsonResponse(response, 404, { error: 'resource not found' });
          return;
        }
        throw error;
      }
      return;
    }
    jsonResponse(response, 404, { error: 'not found' });
  });

  const boundPort = await listenHttpServer(server, host, port);
  return {
    host,
    port: boundPort,
    close: () => new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))),
  };
}

export async function startLogh7GameplayServer({ host, port, manifestPath, tracePath }) {
  const manifest = await readManifest(path.resolve(manifestPath));
  const schema = gameplaySchemaFromManifest(manifest);
  const traceWriter = createTraceWriter(tracePath);
  let nextConnectionId = 1;
  const server = createTcpServer((socket) => {
    // Tiny request/response frames; Nagle batching only delays replies.
    socket.setNoDelay(true);
    const connectionId = nextConnectionId;
    nextConnectionId += 1;
    const connectionState = createGameplayConnectionState();
    let pendingBytes = Buffer.alloc(0);
    writeTrace(traceWriter, {
      event: 'connection',
      connectionId,
      remoteAddress: socket.remoteAddress,
      remotePort: socket.remotePort,
      schema: traceGameplaySchema(schema),
    });
    socket.on('data', (chunk) => {
      pendingBytes = Buffer.concat([pendingBytes, chunk]);
      const result = takeGameplayFrames(pendingBytes);
      pendingBytes = Buffer.from(result.remaining);
      for (const packet of result.frames) {
        connectionState.lastPacket = Buffer.from(packet);
        const frame = parseGameplayFrame(packet);
        const response = responseForGameplayFrame(schema, frame, connectionState);
        const sync = recordGameplaySync(frame, response, connectionState);
        traceGameplayPayload(traceWriter, connectionId, packet, frame, sync);
        if (response !== null) {
          socket.write(response.frame);
          const { frame: _frame, ...traceResponse } = response;
          writeTrace(traceWriter, { event: 'response', connectionId, response: traceResponse });
        }
      }
    });
    socket.on('error', (error) => {
      writeTrace(traceWriter, { event: 'socket-error', connectionId, error: error.message });
    });
    socket.on('close', () => {
      if (pendingBytes.length > 0) {
        const frame = parseGameplayFrame(pendingBytes);
        const sync = recordGameplaySync(frame, null, connectionState);
        traceGameplayPayload(traceWriter, connectionId, pendingBytes, frame, sync);
        pendingBytes = Buffer.alloc(0);
      }
      writeTrace(traceWriter, { event: 'close', connectionId });
    });
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, resolve);
  });
  const address = server.address();
  const boundPort = typeof address === 'object' && address !== null ? address.port : port;
  return {
    host,
    port: boundPort,
    flushTrace: () => (traceWriter === null ? Promise.resolve() : traceWriter.flush()),
    close: async () => {
      await new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
      if (traceWriter !== null) {
        await traceWriter.close();
      }
    },
  };
}

async function health(argv) {
  const args = parseArgs(argv);
  const host = args.get('host') ?? '127.0.0.1';
  const port = Number(args.get('port') ?? '4787');
  const response = await fetch(`http://${host}:${port}/health`);
  console.log(await response.text());
  return response.ok ? 0 : 1;
}

async function serve(argv) {
  const args = parseArgs(argv);
  const host = args.get('host') ?? '127.0.0.1';
  const port = Number(args.get('port') ?? '4787');
  const manifestPath = args.get('manifest');
  if (manifestPath === undefined) {
    console.error('--manifest is required');
    return 1;
  }
  const server = await startLogh7Server({ host, port, manifestPath, resourceRoot: args.get('resource-root') });
  console.log(`LOGH7 local resource server listening on http://${server.host}:${server.port}`);
  return new Promise(() => undefined);
}

async function serveGameplay(argv) {
  const args = parseArgs(argv);
  const host = args.get('host') ?? '127.0.0.1';
  const port = Number(args.get('port') ?? '47900');
  const manifestPath = args.get('manifest');
  if (manifestPath === undefined) {
    console.error('--manifest is required');
    return 1;
  }
  try {
    const server = await startLogh7GameplayServer({ host, port, manifestPath, tracePath: args.get('trace') });
    console.log(`LOGH7 gameplay TCP capture listening on ${server.host}:${server.port}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    return 1;
  }
  return new Promise(() => undefined);
}

// serve-auth 부팅 로직을 재사용 가능한 함수로 추출(Nest 마이그레이션 Phase 0). CLI(serveAuth)와
// Nest WireServerService가 *동일* 코드 경로로 와이어 서버를 띄우게 해 "동일 와이어 동작"을 코드로 보장한다.
// 차이는 단 하나: 여기서는 검증 실패 시 prefix가 붙은 Error를 throw(반환코드 대신)하고 핸들을 반환한다.
// serveAuth는 이 throw를 잡아 기존과 동일한 console.error + return 1 로 변환하므로 CLI 동작은 불변.
// env는 주입 가능(기본 process.env) — 산재한 LOGH_* 직접 읽기의 점진 DIP 이행과 정합.
/**
 * @param {{ argv?: string[], env?: Record<string, string | undefined> }} [options]
 * @returns {Promise<Awaited<ReturnType<typeof startLogh7AuthServer>>>}
 */
export async function bootServeAuthServer({ argv = [], env = process.env } = {}) {
  // 제로설정 부팅: (1) `.env` 파일로 운영자 override를 받고, (2) 검증된 playable 기본값으로 나머지를 채운다.
  // 둘 다 미설정 키만 건드리므로 우선순위는 실제 셸 env > `.env` > playable 프리셋. `npm start`(env 없음·.env
  // 없음)만으로 플레이 가능한 월드에 도달한다.
  loadDotEnv(env);
  applyEnvDefaults(env);
  const args = parseArgs(argv);
  const host = args.get('host') ?? '127.0.0.1';
  const port = Number(args.get('port') ?? '47900');
  // 서버는 클라 EXE에 의존하지 않는다(서버↔클라 분리). 암호 테이블은 커밋된 JSON에서 로드한다.
  // --client-exe를 명시하면 그 EXE에서 재추출(개발/재생성용). 미지정이면 committed JSON 사용.
  const clientExeArg = args.get('client-exe');
  const clientExe = clientExeArg ? path.resolve(clientExeArg) : null;
  const transportKey = Buffer.from(args.get('transport-key-hex') ?? DEFAULT_TRANSPORT_KEY_HEX, 'hex');
  const decipherKey = Buffer.from(args.get('decipher-key-hex') ?? DEFAULT_DECIPHER_KEY_HEX, 'hex');
  const lobby = {
    ip: args.get('lobby-ip') ?? '127.0.0.1',
    port: Number(args.get('lobby-port') ?? String(port)),
    token: args.get('lobby-token') === undefined ? null : Number(args.get('lobby-token')),
  };
  // The lobby stage redirects to the world server (conn3). For the local e2e the world target
  // defaults to the same host:port the harness already serves, so conn3 reconnects right back here.
  const world = {
    ip: args.get('world-ip') ?? lobby.ip,
    port: Number(args.get('world-port') ?? String(lobby.port)),
    token: args.get('world-token') === undefined ? null : Number(args.get('world-token')),
  };
  const adminPortText = args.get('admin-port') ?? env.LOGH_ADMIN_PORT ?? null;
  let admin = null;
  if (adminPortText !== null && adminPortText !== '') {
    const adminPort = Number(adminPortText);
    if (!Number.isInteger(adminPort) || adminPort < 0 || adminPort > 65535) {
      throw new Error(`invalid --admin-port: ${adminPortText}`);
    }
    const adminAllowOrigins = (args.get('admin-allow-origin') ?? env.LOGH_ADMIN_ALLOW_ORIGIN ?? '')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean);
    admin = {
      host: args.get('admin-host') ?? env.LOGH_ADMIN_HOST ?? '127.0.0.1',
      port: adminPort,
      token: args.get('admin-token') ?? env.LOGH_ADMIN_TOKEN ?? null,
      allowOrigins: adminAllowOrigins.length > 0 ? adminAllowOrigins : undefined,
    };
  }
  // Real signup (회원가입): pass --account-db <path> (or LOGH_ACCOUNT_DB) to require an account that
  // was already created out of band by the admin/signup registry. Without it, authentication is
  // strict by default and rejects unknown credentials (no legacy accept-any-GIN7 fallback).
  // For local/autologin one-shots, set LOGH_ACCEPT_ANY_GIN7=1 to opt back into the legacy skeleton.
  const accountDbPath = args.get('account-db') ?? env.LOGH_ACCOUNT_DB ?? null;
  const accountSeedPath = args.get('account-seed-json') ?? env.LOGH_ACCOUNT_SEED_JSON ?? null;
  const allowFirstLoginRegistration =
    isEnabled(args.get('allow-first-login-registration')) ||
    isEnabled(env.LOGH_ACCOUNT_DB_ALLOW_REGISTER);
  let accountStore;
  try {
    if (isEnabled(env.LOGH_ACCEPT_ANY_GIN7)) {
      accountStore = createAccountStore({ acceptAnyGin7: true });
    } else {
      accountStore = createServeAuthAccountStore({ accountDbPath, accountSeedPath, allowFirstLoginRegistration });
    }
  } catch (error) {
    throw new Error(`LOGH7 account store: ${error instanceof Error ? error.message : error}`);
  }
  // 암호 테이블 해결(커밋된 JSON 기본, --client-exe 주면 재추출). 실패 시 조치 가능한 메시지로 종료.
  let tables;
  try {
    tables = resolveChildCodecTables({ clientExe });
  } catch (error) {
    throw new Error(`LOGH7 server: ${error instanceof Error ? error.message : error}`);
  }
  // 영속성: 기본 on(인메모리 authoritative + SQLite 스냅샷 덤프/부팅 로드). LOGH_PERSIST=0으로 끔.
  const snapshotStore = resolveSnapshotStoreOptions(env);
  const repositoryBackend = snapshotStore.backend;
  if (repositoryBackend === 'json') {
    throw new Error("LOGH7 persistence: repository backend 'json' is disabled; use LOGH_SNAPSHOT_SEED_JSON for initial JSON and LOGH_SQLITE_PATH for runtime SQLite.");
  }
  let repository = null;
  if (env.LOGH_PERSIST !== '0') {
    try {
      repository = createRepository({
        backend: repositoryBackend,
        path: snapshotStore.path,
        seedPath: snapshotStore.seedPath,
      });
    } catch (error) {
      throw new Error(`LOGH7 persistence: ${error instanceof Error ? error.message : error}`);
    }
  }
  const characters = parseCharacterRecords(args);
  const announcementCp949Hex = args.get('announcement-cp949-hex') ?? args.get('announce-cp949-hex');
  const announcementText = announcementCp949Hex === undefined
    ? (args.get('announcement') ?? args.get('announce') ?? undefined)
    : bufferFromEvenHex(announcementCp949Hex, '--announcement-cp949-hex');
  const server = await startLogh7AuthServer({
    host,
    port,
    tables,
    repository,
    transportKey,
    decipherKey,
    lobby,
    world,
    characters,
    accountStore,
    announcementText,
    admin,
    tracePath: args.get('trace'),
  });
  console.log(
    `LOGH7 authoritative login server listening on ${server.host}:${server.port} ` +
      `(login->redirect to lobby ${lobby.ip}:${lobby.port}, lobby->redirect to world ${world.ip}:${world.port})` +
      (accountDbPath
        ? ` [signup registry: ${path.resolve(accountDbPath)}${allowFirstLoginRegistration ? ', first-login registration enabled' : ''}]`
        : ' [accept-any-GIN7]') +
      (server.admin ? ` [admin: ${server.admin.url}]` : ''),
  );
  return server;
}

async function serveAuth(argv) {
  // CLI 래퍼: bootServeAuthServer로 부팅하고(동일 와이어 경로), 검증 실패는 기존과 동일한
  // console.error(메시지) + 반환코드 1로 변환한다. 성공 시 데몬으로 영구 대기.
  try {
    await bootServeAuthServer({ argv, env: process.env });
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    return 1;
  }
  return new Promise(() => undefined);
}

async function main() {
  const [command, ...argv] = process.argv.slice(2);
  if (command === 'serve') {
    return serve(argv);
  }
  if (command === 'serve-gameplay') {
    return serveGameplay(argv);
  }
  if (command === 'serve-auth') {
    return serveAuth(argv);
  }
  if (command === 'health') {
    return health(argv);
  }
  if (command === 'admin') {
    // Account provisioning for the external signup workflow; operates on the same --account-db store
    // the auth server uses (SQLite for *.sqlite/*.db, legacy JSON otherwise). See logh7-admin.mjs.
    return runAdminCommand(argv);
  }
  console.error('usage: logh7-server.mjs <serve|serve-gameplay|serve-auth|health|admin>');
  return 1;
}

const isCli = process.argv[1] === fileURLToPath(import.meta.url);
if (isCli) {
  process.exitCode = await main();
}
