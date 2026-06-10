import { createReadStream, createWriteStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createServer as createTcpServer } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildCommandOkResponseCandidate,
  buildPhase3ResponseFromPhase1Request,
  extractChildCodecStaticTables,
} from './logh7-codec.mjs';

function jsonResponse(response, status, body) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(`${JSON.stringify(body)}\n`);
}

function textResponse(response, status, body) {
  response.writeHead(status, { 'content-type': 'text/plain; charset=utf-8' });
  response.end(body);
}

function parseArgs(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const part = argv[index];
    if (!part.startsWith('--')) {
      continue;
    }
    const value = argv[index + 1];
    values.set(part.slice(2), value);
    index += 1;
  }
  return values;
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
    dynamicTables: dynamicProbe === null ? null : extractChildCodecStaticTables(dynamicProbe.clientExePath),
  };
}

function writeTrace(traceStream, event) {
  if (traceStream === null) {
    return;
  }
  traceStream.write(`${JSON.stringify({ at: new Date().toISOString(), ...event })}\n`);
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

function traceGameplayPayload(traceStream, connectionId, chunk, frame) {
  writeTrace(traceStream, {
    event: 'payload',
    connectionId,
    byteLength: chunk.length,
    hex: chunk.toString('hex'),
    frame,
  });
}

function responseForGameplayFrame(schema, frame, connectionState) {
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

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, resolve);
  });
  const address = server.address();
  const boundPort = typeof address === 'object' && address !== null ? address.port : port;
  return {
    host,
    port: boundPort,
    close: () => new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))),
  };
}

export async function startLogh7GameplayServer({ host, port, manifestPath, tracePath }) {
  const manifest = await readManifest(path.resolve(manifestPath));
  const schema = gameplaySchemaFromManifest(manifest);
  const traceStream = tracePath === undefined ? null : createWriteStream(path.resolve(tracePath), { flags: 'a' });
  let nextConnectionId = 1;
  const server = createTcpServer((socket) => {
    const connectionId = nextConnectionId;
    nextConnectionId += 1;
    const connectionState = { phase1Key: null, lastPacket: null };
    let pendingBytes = Buffer.alloc(0);
    writeTrace(traceStream, {
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
        traceGameplayPayload(traceStream, connectionId, packet, frame);
        const response = responseForGameplayFrame(schema, frame, connectionState);
        if (response !== null) {
          socket.write(response.frame);
          const { frame: _frame, ...traceResponse } = response;
          writeTrace(traceStream, { event: 'response', connectionId, response: traceResponse });
        }
      }
    });
    socket.on('error', (error) => {
      writeTrace(traceStream, { event: 'socket-error', connectionId, error: error.message });
    });
    socket.on('close', () => {
      if (pendingBytes.length > 0) {
        traceGameplayPayload(traceStream, connectionId, pendingBytes, parseGameplayFrame(pendingBytes));
        pendingBytes = Buffer.alloc(0);
      }
      writeTrace(traceStream, { event: 'close', connectionId });
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
    close: () =>
      new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) {
            traceStream?.end();
            reject(error);
            return;
          }
          if (traceStream === null) {
            resolve();
            return;
          }
          traceStream.end(resolve);
        });
      }),
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

async function main() {
  const [command, ...argv] = process.argv.slice(2);
  if (command === 'serve') {
    return serve(argv);
  }
  if (command === 'serve-gameplay') {
    return serveGameplay(argv);
  }
  if (command === 'health') {
    return health(argv);
  }
  console.error('usage: logh7-server.mjs <serve|serve-gameplay|health>');
  return 1;
}

const isCli = process.argv[1] === fileURLToPath(import.meta.url);
if (isCli) {
  process.exitCode = await main();
}
