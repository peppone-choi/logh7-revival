import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createServer } from 'node:net';

import { decryptBuffer, encryptBuffer, expandChildCodecKey, loadChildCodecTables } from './logh7-child-codec.mjs';
import { parse0030Body, readInnerCode } from './logh7-envelope-0030.mjs';
import { buildTransportFrame, createFrameStreamParser } from './logh7-frame-stream.mjs';
import { LOGIN_INNER_CODE, parseGin7CredentialInner } from './logh7-gin7-credential.mjs';
import { buildLoginResponseFrames } from './logh7-login-response.mjs';
import {
  CODE_LOBBY_SESSION_INIT,
  CODE_LOBBY_LOGIN_REQUEST,
  CODE_LOBBY_LOGIN_OK,
  decodeLobbyLoginRequest,
  buildLobbyLoginOkFrame,
} from './logh7-lobby-login.mjs';
import { handleLobbyInner } from './logh7-lobby-session.mjs';
import { createCharacterStore } from './logh7-character-store.mjs';

const PHASE1_CODE = 0x0034;
const PHASE3_CODE = 0x0035;
const CONFIRM_CODE = 0x0036;
const TRANSPORT_0030_CODE = 0x0030;
const LEGACY_TRANSPORT_KEY_HEX = '7b41344331333734382d303135392d346335342d414542332d3144363835373537363142337d';
const LEGACY_DECIPHER_KEY_HEX = '5859';
const BLOCK_BYTES = 8;

function codeHex(code) {
  return `0x${code.toString(16).padStart(4, '0')}`;
}

function keyBytes(value) {
  if (Buffer.isBuffer(value)) return Buffer.from(value);
  if (typeof value === 'string') return Buffer.from(value, 'hex');
  throw new TypeError('key must be Buffer or hex string');
}

function resolveKey(value, envName, fallbackHex) {
  if (value !== undefined && value !== null) {
    return { bytes: keyBytes(value), source: 'option' };
  }
  if (process.env[envName]) {
    return { bytes: keyBytes(process.env[envName]), source: 'env' };
  }
  return { bytes: Buffer.from(fallbackHex, 'hex'), source: 'legacy-default' };
}

function pad8(data) {
  const paddedLength = data.length % BLOCK_BYTES === 0 ? data.length : data.length + (BLOCK_BYTES - (data.length % BLOCK_BYTES));
  const padded = Buffer.alloc(paddedLength);
  data.copy(padded);
  return padded;
}

function checksum(data) {
  let value = 0;
  let offset = 0;
  for (; offset + 4 <= data.length; offset += 4) {
    value = (value ^ data.readUInt32LE(offset)) >>> 0;
  }
  for (; offset < data.length; offset += 1) {
    value = (value ^ data[offset]) >>> 0;
  }
  return ((value >>> 16) ^ value) & 0xffff;
}

function parsePhase1DecodedPayload(data) {
  if (data.length < 8) throw new Error('phase1 decoded payload truncated');
  const expected = checksum(data.subarray(2));
  const actual = data.readUInt16BE(0);
  if (actual !== expected) {
    throw new Error(`phase1 decoded payload checksum mismatch: got 0x${actual.toString(16)} expect 0x${expected.toString(16)}`);
  }
  const keyLength = data.readUInt16BE(2);
  const cursor = 4 + keyLength;
  if (data.length < cursor + 4) throw new Error('phase1 decoded payload truncated');
  return {
    key: Buffer.from(data.subarray(4, cursor)),
    sequence: data.readUInt32BE(cursor),
  };
}

function buildPhase3DecodedPayload({ encipherKey, decipherKey, sequence }) {
  const body = Buffer.alloc(2 + encipherKey.length + 2 + decipherKey.length + 4);
  let cursor = 0;
  body.writeUInt16BE(encipherKey.length, cursor);
  cursor += 2;
  encipherKey.copy(body, cursor);
  cursor += encipherKey.length;
  body.writeUInt16BE(decipherKey.length, cursor);
  cursor += 2;
  decipherKey.copy(body, cursor);
  cursor += decipherKey.length;
  body.writeUInt32BE(sequence >>> 0, cursor);

  const output = Buffer.alloc(body.length + 2);
  output.writeUInt16BE(checksum(body), 0);
  body.copy(output, 2);
  return output;
}

export function buildPhase3ResponseFromPhase1Frame({ requestFrame, tables = loadChildCodecTables(), transportKey, decipherKey }) {
  if (requestFrame.length < 4 || requestFrame.readUInt16BE(0) + 2 !== requestFrame.length || requestFrame.readUInt16BE(2) !== PHASE1_CODE) {
    throw new Error('phase1 request frame invalid');
  }

  const scheduled = expandChildCodecKey(transportKey, tables);
  const decodedPhase1 = decryptBuffer(requestFrame.subarray(4), scheduled);
  const phase1 = parsePhase1DecodedPayload(decodedPhase1);
  const decodedPhase3 = buildPhase3DecodedPayload({
    encipherKey: phase1.key,
    decipherKey,
    sequence: phase1.sequence,
  });

  return {
    frame: buildTransportFrame(PHASE3_CODE, encryptBuffer(pad8(decodedPhase3), scheduled)),
    phase1Key: phase1.key,
    sequence: phase1.sequence,
  };
}

export function createLoginHarnessServer({
  port = 47900,
  host = '127.0.0.1',
  tracePath = null,
  logger = console,
  tables = loadChildCodecTables(),
  transportKey = undefined,
  decipherKey = undefined,
  characterStore = null,
  characterStorePath = null,
} = {}) {
  if (tracePath) mkdirSync(dirname(tracePath), { recursive: true });

  // 로비 캐릭터 store: 주입(테스트) 우선, 없으면 경로(라이브 영속)로 생성.
  // 계정 단위 CRUD 이므로 서버 인스턴스당 1개를 공유한다(conn2 는 0x2000 account 로 키잉).
  const resolvedCharacterStore = characterStore
    ?? createCharacterStore(characterStorePath ?? join(process.cwd(), 'data', 'logh7-characters.json'));

  const resolvedTransportKey = resolveKey(transportKey, 'LOGH_TRANSPORT_KEY_HEX', LEGACY_TRANSPORT_KEY_HEX);
  const resolvedDecipherKey = resolveKey(decipherKey, 'LOGH_DECIPHER_KEY_HEX', LEGACY_DECIPHER_KEY_HEX);
  const phase3Mode = resolvedTransportKey.source === 'legacy-default' || resolvedDecipherKey.source === 'legacy-default' ? 'replayed' : 'observed';
  const loopbackHost = host === '127.0.0.1' || host === '::1' || host === 'localhost';
  const allowUnauthenticatedLobby = loopbackHost || process.env.LOGH_ALLOW_INSECURE_HARNESS === '1';
  let nextConnectionId = 1;
  let listening = false;
  const sockets = new Set();

  const writeTrace = (record) => {
    const line = JSON.stringify({ ts: new Date().toISOString(), ...record });
    if (tracePath) appendFileSync(tracePath, `${line}\n`);
    logger?.debug?.(record);
  };

  const traceGin7Key = (gin7KeyHex) => {
    if (process.env.LOGH_TRACE_SECRETS === '1') return { gin7KeyHex };
    return {
      gin7KeyBytes: Math.floor(String(gin7KeyHex ?? '').length / 2),
      gin7KeyRedacted: true,
    };
  };

  const traceFrame = (frame) => {
    const raw = Buffer.from(frame.raw);
    if (process.env.LOGH_TRACE_RAW_FRAMES === '1') {
      const preview = raw.subarray(0, 128);
      return {
        rawFrameHex: preview.toString('hex'),
        rawFrameHexTruncated: raw.length > preview.length,
      };
    }
    return {
      rawFrameBytes: raw.length,
      rawFrameRedacted: true,
    };
  };

  const server = createServer((socket) => {
    const connectionId = nextConnectionId;
    nextConnectionId += 1;
    sockets.add(socket);
    const parser = createFrameStreamParser();
    let phase1Key = null;
    let authRejected = false;
    let lobbyAccount = null; // conn2 0x2000 에서 바인딩되는 로비 계정(캐릭터 store 키)
    writeTrace({
      event: 'connection-opened',
      connectionId,
      remoteAddress: socket.remoteAddress ?? null,
      remotePort: socket.remotePort ?? null,
    });

    socket.on('data', (chunk) => {
      let frames;
      try {
        frames = parser.push(chunk);
      } catch (error) {
        writeTrace({ event: 'frame-error', connectionId, message: error.message });
        socket.destroy(error);
        return;
      }

      for (const frame of frames) {
        if (authRejected) break;
        writeTrace({
          event: 'frame-received',
          connectionId,
          codeHex: codeHex(frame.code),
          length: frame.length,
          bodyBytes: frame.body.length,
          ...traceFrame(frame),
        });

        if (frame.code === PHASE1_CODE) {
          try {
            const phase3 = buildPhase3ResponseFromPhase1Frame({
              requestFrame: frame.raw,
              tables,
              transportKey: resolvedTransportKey.bytes,
              decipherKey: resolvedDecipherKey.bytes,
            });
            phase1Key = phase3.phase1Key;
            socket.write(phase3.frame);
            writeTrace({
              event: 'phase3-sent',
              connectionId,
              codeHex: codeHex(PHASE3_CODE),
              mode: phase3Mode,
              transportKeySource: resolvedTransportKey.source,
              decipherKeySource: resolvedDecipherKey.source,
              phase1KeyBytes: phase3.phase1Key.length,
              sequence: phase3.sequence,
              frameBytes: phase3.frame.length,
            });
          } catch (error) {
            writeTrace({
              event: 'phase3-error',
              connectionId,
              codeHex: codeHex(PHASE3_CODE),
              mode: 'minimal',
              message: error.message,
            });
          }
        } else if (frame.code === TRANSPORT_0030_CODE) {
          if (!phase1Key) {
            writeTrace({ event: '0030-decode-skipped', connectionId, reason: 'phase1-key-missing' });
            continue;
          }
          try {
            const decodedBody = decryptBuffer(frame.body, expandChildCodecKey(phase1Key, tables));
            const parsed0030 = parse0030Body(decodedBody);
            const innerCode = readInnerCode(parsed0030.inner);
            const decoded = {
              event: '0030-decoded',
              connectionId,
              id: parsed0030.id,
              innerLen: parsed0030.innerLen,
              checksum: parsed0030.checksum,
              innerCodeHex: codeHex(innerCode),
            };
            if (innerCode === LOGIN_INNER_CODE) {
              const credential = parseGin7CredentialInner(parsed0030.inner);
              decoded.credential = {
                magic: credential.magic,
                version: credential.version,
                flags: credential.flags,
                account: credential.account,
                accountUnits: credential.accountUnits,
                passwordUnits: credential.passwordUnits,
                passwordRedacted: true,
              };
            }
            writeTrace(decoded);
            // GIN7 자격증명 수신 시 로그인 성공 응답(keysetup 0x0031 + redirect 0x7001) 회신.
            if (innerCode === LOGIN_INNER_CODE) {
              const { keysetupFrame, redirectFrame, gin7KeyHex } = buildLoginResponseFrames({
                tables,
                decipherKey: resolvedDecipherKey.bytes,
                decodedBody,
              });
              socket.write(Buffer.concat([keysetupFrame, redirectFrame]));
              writeTrace({
                event: 'login-response-sent',
                connectionId,
                id: parsed0030.id,
                keysetupCodeHex: codeHex(0x0031),
                redirectCodeHex: codeHex(0x7001),
                keysetupFrameBytes: keysetupFrame.length,
                redirectFrameBytes: redirectFrame.length,
                ...traceGin7Key(gin7KeyHex),
              });
            } else if (innerCode === CODE_LOBBY_SESSION_INIT) {
              // 0x0020 LobbySessionInit — 서버 무응답이 정상(라이브 근거: selector=1). 트레이스만.
              writeTrace({ event: 'lobby-session-init', connectionId, id: parsed0030.id });
            } else if (innerCode === CODE_LOBBY_LOGIN_REQUEST) {
              // 0x2000 LobbyLoginRequest(GIN7 v4, LE) → 0x2001 LobbyLoginOK.
              // account 를 커넥션에 바인딩(이후 0x1000 캐릭터 로스터의 store 키).
              if (!allowUnauthenticatedLobby) {
                writeTrace({ event: 'auth-required', connectionId, innerCodeHex: codeHex(innerCode) });
                authRejected = true;
                socket.end();
                break;
              }
              const { account } = decodeLobbyLoginRequest(parsed0030.inner);
              lobbyAccount = account;
              const okFrame = buildLobbyLoginOkFrame({
                id: parsed0030.id,
                decipherKey: resolvedDecipherKey.bytes,
                tables,
                status: 0,
              });
              socket.write(okFrame);
              writeTrace({
                event: 'lobby-login-ok-sent',
                connectionId,
                id: parsed0030.id,
                account,
                okCodeHex: codeHex(CODE_LOBBY_LOGIN_OK),
                frameBytes: okFrame.length,
              });
            } else {
              // 0x1000 계정 로스터 및 0x100x/0x2008 캐릭터 메시지 → 로비 세션 라우터.
              // 반환 inner(응답 없는 코드는 null)를 0x0030 봉투로 감싸 decipherKey 로 회신.
              const responseInner = handleLobbyInner(parsed0030.inner, lobbyAccount, resolvedCharacterStore);
              if (responseInner) {
                const responseFrame = buildLobbyLoginOkFrame({
                  id: parsed0030.id,
                  decipherKey: resolvedDecipherKey.bytes,
                  tables,
                  inner: responseInner,
                });
                socket.write(responseFrame);
                writeTrace({
                  event: 'lobby-response-sent',
                  connectionId,
                  id: parsed0030.id,
                  requestInnerCodeHex: codeHex(innerCode),
                  responseInnerBytes: responseInner.length,
                  responseFrameBytes: responseFrame.length,
                });
              } else {
                writeTrace({ event: 'lobby-inner-silent', connectionId, innerCodeHex: codeHex(innerCode) });
              }
            }
          } catch (error) {
            writeTrace({ event: '0030-decode-error', connectionId, message: error.message });
          }
        } else if (frame.code === CONFIRM_CODE) {
          // confirm frame is already captured by frame-received.
        }
      }
    });

    socket.on('error', (error) => {
      writeTrace({ event: 'socket-error', connectionId, message: error.message });
    });
    socket.on('end', () => {
      writeTrace({ event: 'peer-fin', connectionId });
    });
    socket.on('close', (hadError) => {
      sockets.delete(socket);
      writeTrace({ event: 'connection-closed', connectionId, hadError });
    });
  });

  return {
    listen() {
      if (listening) return Promise.resolve(this);
      return new Promise((resolve, reject) => {
        const onError = (error) => {
          server.off('listening', onListening);
          reject(error);
        };
        const onListening = () => {
          server.off('error', onError);
          listening = true;
          resolve(this);
        };
        server.once('error', onError);
        server.once('listening', onListening);
        server.listen({ port, host });
      });
    },

    close() {
      for (const socket of sockets) socket.destroy();
      if (!listening) return Promise.resolve();
      return new Promise((resolve, reject) => {
        server.close((error) => {
          listening = false;
          if (error) reject(error);
          else resolve();
        });
      });
    },

    address() {
      return server.address();
    },

    server,
  };
}
