// logh7-playable-server.mjs — 로그인→로비→월드→권위 이동/채팅 통합 TCP 서버
//
// 기존 login-harness-server 의 핸드셰이크/0x0030 경로를 재사용하고,
// 월드 세션 권위 처리(logh7-world-session)를 같은 포트에 붙인다.
// 진입점: node src/server/logh7-playable-server.mjs [--port 47900] [--trace path]
// 3티어 런타임(ORM/CQRS) 권장: node src/presentation/main.mjs

import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createServer } from 'node:net';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import {
  decryptBuffer,
  encryptBuffer,
  expandChildCodecKey,
  loadChildCodecTables,
} from './logh7-child-codec.mjs';
import {
  parse0030Body,
  readInnerCode,
  build0030Body,
  frame0030,
  frame0030WithSubheader,
} from './logh7-envelope-0030.mjs';
import { buildTransportFrame, createFrameStreamParser } from './logh7-frame-stream.mjs';
import { LOGIN_INNER_CODE } from './logh7-gin7-credential.mjs';
import {
  buildLoginResponseFrames,
  buildLoginNgResponseFrame,
  buildRedirectInner,
  ipToRedirectU32,
} from './logh7-login-response.mjs';
import {
  CODE_LOBBY_SESSION_INIT,
  CODE_LOBBY_LOGIN_REQUEST,
  CODE_LOBBY_LOGIN_OK,
  decodeLobbyLoginRequest,
  buildLobbyLoginOkFrame,
} from './logh7-lobby-login.mjs';
import { handleLobbyInner } from './logh7-lobby-session.mjs';
import { createCharacterStore } from './logh7-character-store.mjs';
import { encodeResponseInfoAccount } from './logh7-character-codec.mjs';
import { createWorldSession } from './logh7-world-session.mjs';
import {
  CODE_LOBBY_SESSION_LOGIN_REQ,
  CODE_SS_LOGIN_REQ,
  CODE_SS_GAME_LOGIN_REQ,
  CODE_CMD_MOVE_GRID,
  CODE_CMD_GRID_CHAT,
  CODE_TX_SIMPLE_DATA_BEGIN,
  buildSsLoginOkInner,
  buildCharacterRosterTransaction,
  isAdmissionRequestCode,
  decodeLobbySessionLoginReq,
} from './logh7-world-records.mjs';
import { CODE_REQ_INFO_ACCOUNT } from './logh7-character-codec.mjs';
import { buildPhase3ResponseFromPhase1Frame } from './logh7-login-harness-server.mjs';
import {
  verifyGin7Login,
  loadAccountRegistry,
  DEFAULT_ACCOUNTS_PATH,
  DEFAULT_CHARACTERS_PATH,
} from './logh7-account-auth.mjs';
import {
  buildCorrelationRecord,
  validateCorrelationRecord,
  reportCorrelationFailure,
} from './logh7-correlation-record.mjs';

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

function isLoopbackHost(host) {
  return host === '127.0.0.1' || host === '::1' || host === 'localhost';
}

function hasKnownDevCredential(accounts) {
  return accounts.some((entry) => (
    (entry.accountId === 'inei00' || entry.accountId === 'dummy')
    && entry.password === 'dummy'
  ));
}

// 응답 inner 의 실제 방출 코드 추출 (message32 [u32 0][u16BE code] 또는 raw [u16BE code]).
// admission trace 가 codes=null 로 남던 문제 해소 — 다음 라이브 캡처에서 무슨 코드를 실제로
// 보냈는지(0x0315 등) 판독 가능하게 한다.
function innerEmitCode(inner) {
  const buf = Buffer.isBuffer(inner) ? inner : Buffer.from(inner);
  if (buf.length >= 6 && buf.readUInt32LE(0) === 0) return buf.readUInt16BE(4);
  if (buf.length >= 2) return buf.readUInt16BE(0);
  return null;
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
  const paddedLength = data.length % BLOCK_BYTES === 0
    ? data.length
    : data.length + (BLOCK_BYTES - (data.length % BLOCK_BYTES));
  const padded = Buffer.alloc(paddedLength);
  data.copy(padded);
  return padded;
}

// conn2 로비 S→C 기본 subheader 4 (auth-server LOGH_LOBBY_SUBHEADER, RE transport+0x12=4)
const LOBBY_SUBHEADER_LEN = Number(process.env.LOGH_LOBBY_SUBHEADER ?? '4');

function encryptInnerFrame({ tables, decipherKey, id, inner, subheaderLen = LOBBY_SUBHEADER_LEN }) {
  const body = build0030Body({ id: id >>> 0, inner });
  const enc = encryptBuffer(pad8(body), expandChildCodecKey(decipherKey, tables));
  if (subheaderLen > 0) return frame0030WithSubheader(enc, subheaderLen);
  return frame0030(enc);
}

/**
 * 클라이언트에 광고할 endpoint를 TCP/와이어 생성 전에 fail-closed 검증한다.
 * @param {{ip:string, port:number}|null|undefined} advertisedEndpoint
 * @returns {{ip:string, port:number}|null}
 */
export function validateAdvertisedEndpoint(advertisedEndpoint) {
  if (advertisedEndpoint === undefined || advertisedEndpoint === null) return null;
  if (typeof advertisedEndpoint !== 'object' || Array.isArray(advertisedEndpoint)) {
    throw new TypeError('advertisedEndpoint must be an { ip, port } object');
  }
  const ip = advertisedEndpoint.ip;
  const advertisedPort = advertisedEndpoint.port;
  if (typeof ip !== 'string' || ip.length === 0) {
    throw new TypeError('advertisedEndpoint.ip must be a non-empty IPv4 string');
  }
  try {
    ipToRedirectU32(ip);
  } catch (error) {
    throw new RangeError(`advertisedEndpoint.ip must be a valid IPv4 address: ${ip}`, {
      cause: error,
    });
  }
  if (!Number.isInteger(advertisedPort) || advertisedPort < 1 || advertisedPort > 0xffff) {
    throw new RangeError(`advertisedEndpoint.port must be an integer in 1..65535: ${advertisedPort}`);
  }
  return { ip, port: advertisedPort };
}

/**
 * 최소 플레이어블 서버 팩토리.
 * 반환 객체: listen/close/address + worldSession + characterStore
 */
export function createPlayableServer({
  port = 47900,
  host = '127.0.0.1',
  advertisedEndpoint = undefined,
  tracePath = null,
  logger = console,
  tables = loadChildCodecTables(),
  transportKey = undefined,
  decipherKey = undefined,
  characterStore = null,
  characterStorePath = null,
  accountsPath = DEFAULT_ACCOUNTS_PATH,
  worldSession = null,
} = {}) {
  const validatedAdvertisedEndpoint = validateAdvertisedEndpoint(advertisedEndpoint);
  if (tracePath) mkdirSync(dirname(tracePath), { recursive: true });

  // bind endpoint와 원본 클라이언트에 알릴 endpoint를 분리한다.
  // 미지정 API 호출은 기존 0x7001 기본 템플릿을 그대로 쓰고,
  // 명시하면 0x7001과 내부에서 생성한 0x200a가 같은 endpoint를 쓴다.
  let resolvedAdvertisedEndpoint = null;
  let loginRedirectInner;
  if (validatedAdvertisedEndpoint) {
    const { ip, port: advertisedPort } = validatedAdvertisedEndpoint;
    loginRedirectInner = buildRedirectInner({ ip, port: advertisedPort, token: 1 });
    resolvedAdvertisedEndpoint = { ip, port: advertisedPort, token: 1 };
  }

  // 실 서버 data/ 경로 (유저 환경과 동일). accounts 시드 보장.
  const loopbackHost = isLoopbackHost(host);
  const accountRegistry = loadAccountRegistry(accountsPath, {
    seedIfMissing: loopbackHost || process.env.LOGH_ALLOW_DEV_ACCOUNTS === '1',
  });
  if (!loopbackHost && process.env.LOGH_ALLOW_DEV_ACCOUNTS !== '1' && hasKnownDevCredential(accountRegistry.accounts)) {
    throw new Error('refusing public bind with known development credentials; set LOGH_ALLOW_DEV_ACCOUNTS=1 only for an isolated QA run');
  }
  const resolvedCharacterStore = characterStore
    ?? createCharacterStore(characterStorePath ?? DEFAULT_CHARACTERS_PATH);
  const resolvedWorld = worldSession ?? createWorldSession({
    worldRedirect: resolvedAdvertisedEndpoint
      ?? { ip: host === '0.0.0.0' ? '127.0.0.1' : host, port, token: 1 },
    // 0x0323 world-enter 레코드를 실 시드 캐릭터로 채우도록 스토어 주입(빈 테이블 크래시 해소).
    characterStore: resolvedCharacterStore,
  });

  const resolvedTransportKey = resolveKey(transportKey, 'LOGH_TRANSPORT_KEY_HEX', LEGACY_TRANSPORT_KEY_HEX);
  const resolvedDecipherKey = resolveKey(decipherKey, 'LOGH_DECIPHER_KEY_HEX', LEGACY_DECIPHER_KEY_HEX);

  let nextConnectionId = 1;
  let listening = false;
  /** @type {Map<number, import('node:net').Socket>} */
  const socketsByConn = new Map();
  /** @type {Map<number, number>} */
  const nextReplyIdByConn = new Map();
  const sockets = new Set();
  const reconnectHandoffs = new Map();
  let nextHandoffId = 1;
  const RECONNECT_HANDOFF_TTL_MS = 60_000;
  // 원본 클라이언트는 새 TCP 연결에 티켓을 반사하지 않으므로, 호스트 공개 시
  // 계정 바인딩을 증명할 수 없다. 루프백 호환을 벗어날 때는 명시적 옵트인만 허용한다.
  const allowInsecureHandoff = loopbackHost || process.env.LOGH_ALLOW_INSECURE_HANDOFF === '1';

  const issueReconnectHandoff = (account, socket, stage = 'lobby') => {
    if (!allowInsecureHandoff) return;
    const id = nextHandoffId;
    nextHandoffId += 1;
    reconnectHandoffs.set(id, {
      id,
      account: String(account),
      remoteAddress: socket.remoteAddress ?? null,
      stage,
      expiresAt: Date.now() + RECONNECT_HANDOFF_TTL_MS,
    });
  };

  const consumeReconnectHandoff = (socket, account = null, stage = 'lobby') => {
    if (!allowInsecureHandoff) return null;
    const now = Date.now();
    for (const [id, handoff] of reconnectHandoffs) {
      if (handoff.expiresAt < now) reconnectHandoffs.delete(id);
    }
    const matches = [...reconnectHandoffs.values()]
      .filter((handoff) => handoff.stage === stage)
      .filter((handoff) => handoff.remoteAddress === (socket.remoteAddress ?? null))
      .filter((handoff) => account == null || handoff.account === String(account));
    // 월드 0x0200에는 계정 필드가 없으므로 동일 원격지의 동시 세션은
    // 추측으로 선택하지 않고 거부한다.
    if (matches.length !== 1) return null;
    const handoff = matches[0];
    reconnectHandoffs.delete(handoff.id);
    return handoff.account;
  };

  // SRV-CORR(Issue #7): 이 서버 프로세스 실행 전체를 식별하는 runId.
  // eventId는 writeTrace 호출마다 새로 발급한다(레코드별 고유값).
  const correlationRunId = randomUUID();

  const writeTrace = (record) => {
    const line = JSON.stringify({ ts: new Date().toISOString(), ...record });
    if (tracePath) appendFileSync(tracePath, `${line}\n`);
    logger?.debug?.(record);

    // 기존 trace 라인(위)은 포맷 변경 없이 그대로 두고, M4-OBS-001 23키 correlation
    // 레코드를 별도 라인으로 추가 기록한다. build/validate 실패가 게임 서버를 죽이면
    // 안 되므로(순수 관측 부가 기능) 여기서 흡수하고 Sentry는 설정된 경우에만 통지한다.
    try {
      const correlationRecord = buildCorrelationRecord({
        runId: correlationRunId,
        eventId: randomUUID(),
        source: 'server',
        stage: typeof record.event === 'string' ? record.event : null,
        connectionId: typeof record.connectionId === 'number' ? record.connectionId : null,
        outcome: typeof record.message === 'string' ? 'failed' : 'ok',
      });
      validateCorrelationRecord(correlationRecord);
      if (tracePath) appendFileSync(tracePath, `${JSON.stringify(correlationRecord)}\n`);
    } catch (error) {
      logger?.error?.({ event: 'srv-corr-invalid', message: error.message });
      reportCorrelationFailure(error).catch(() => {});
    }
  };

  const traceInner = (inner) => {
    const raw = Buffer.from(inner);
    if (process.env.LOGH_TRACE_RAW_INNER === '1') {
      const preview = raw.subarray(0, 64);
      return {
        innerHex: preview.toString('hex'),
        innerHexTruncated: raw.length > preview.length,
      };
    }
    return { innerHexRedacted: true };
  };

  const traceGin7Key = (gin7KeyHex) => {
    if (process.env.LOGH_TRACE_SECRETS === '1') return { gin7KeyHex };
    return {
      gin7KeyBytes: Math.floor(String(gin7KeyHex ?? '').length / 2),
      gin7KeyRedacted: true,
    };
  };

  // 소켓별 S→C 직렬 쓰기 큐.
  // 0x0325(≈52KB)·0x0321(≈36KB) 등 대형 프레임을 연속 socket.write 하면
  // highWater 초과 시 부분 버퍼만 나가고 이후 프레임이 깨져 클라 디스패처에
  // 0x0325 가 안 보이는 증상(Frida 2026-07-21: 0x323/b09 는 오고 0x325 누락).
  const writeQueues = new WeakMap();

  function enqueueSocketWrite(socket, buf) {
    const data = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
    let q = writeQueues.get(socket);
    if (!q) {
      q = { chain: Promise.resolve(), dropped: false };
      writeQueues.set(socket, q);
      socket.once('close', () => {
        q.dropped = true;
        writeQueues.delete(socket);
      });
      try {
        // 대형 버스트(≥100KB) 여유
        socket.setDefaultEncoding?.('binary');
        if (typeof socket.setNoDelay === 'function') socket.setNoDelay(true);
      } catch {
        /* ignore */
      }
    }
    q.chain = q.chain.then(
      () => new Promise((resolve) => {
        if (q.dropped || socket.destroyed) {
          resolve();
          return;
        }
        const ok = socket.write(data, (err) => {
          if (err) {
            writeTrace({
              event: 'socket-write-error',
              message: err.message,
              bytes: data.length,
            });
          }
        });
        if (ok) {
          resolve();
          return;
        }
        const onDrain = () => {
          socket.off('error', onErr);
          resolve();
        };
        const onErr = () => {
          socket.off('drain', onDrain);
          resolve();
        };
        socket.once('drain', onDrain);
        socket.once('error', onErr);
      }),
    );
    return q.chain;
  }

  function sendInner(socket, connectionId, id, inner) {
    const frame = encryptInnerFrame({
      tables,
      decipherKey: resolvedDecipherKey.bytes,
      id,
      inner,
    });
    enqueueSocketWrite(socket, frame);
    if (frame.length > 32767) {
      writeTrace({
        event: 'large-frame-queued',
        connectionId,
        frameBytes: frame.length,
        lenField: frame.readUInt16BE(0),
        note: 'u16 len>0x7fff — client signed-length 가설 시 드롭 가능; drain 큐로 부분쓰기 완화',
      });
    }
    return frame;
  }

  function takeReplyIdForConnection(connectionId, minExclusive = 0) {
    let nextReplyId = nextReplyIdByConn.get(connectionId) ?? 1;
    if (nextReplyId <= minExclusive) nextReplyId = minExclusive + 1;
    nextReplyIdByConn.set(connectionId, nextReplyId + 1);
    return nextReplyId;
  }

  const server = createServer((socket) => {
    const connectionId = nextConnectionId;
    nextConnectionId += 1;
    sockets.add(socket);
    socketsByConn.set(connectionId, socket);
    nextReplyIdByConn.set(connectionId, 1);
    const parser = createFrameStreamParser();
    let phase1Key = null;
    let lobbyAccount = null;
    let authenticatedAccount = null;
    let authRejected = false;
    // S→C 단조 증가 id (해독 시퀀스 게이트 0x645eda: id > cipher+0x20)
    // ★요청 id 재사용 금지 — 0x2001 replyId=3 후 0x2004 에 또 id=3 쓰면 클라가 폐기/FIN.
    function takeReplyId(minExclusive = 0) {
      return takeReplyIdForConnection(connectionId, minExclusive);
    }

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
            enqueueSocketWrite(socket, phase3.frame);
            writeTrace({
              event: 'phase3-sent',
              connectionId,
              codeHex: codeHex(PHASE3_CODE),
              phase1KeyBytes: phase3.phase1Key.length,
              sequence: phase3.sequence,
            });
          } catch (error) {
            writeTrace({ event: 'phase3-error', connectionId, message: error.message });
          }
        } else if (frame.code === TRANSPORT_0030_CODE) {
          if (!phase1Key) {
            writeTrace({ event: '0030-decode-skipped', connectionId, reason: 'phase1-key-missing' });
            continue;
          }
          try {
            const decodedBody = decryptBuffer(frame.body, expandChildCodecKey(phase1Key, tables));
            let parsed0030;
            try {
              parsed0030 = parse0030Body(decodedBody);
            } catch (strictErr) {
              // 로비 0x2009 등: 복호 구조는 유효한데 checksum 만 불일치 → soft-accept
              // (live 2026-07-21: got 0xbca expect 0x8c9, inner=2009+char/session field)
              const soft = parse0030Body(decodedBody, { allowChecksumMismatch: true });
              const softCode = soft.inner.length >= 2 ? soft.inner.readUInt16BE(0) : 0;
              const softOk = soft.checksumMismatch
                && soft.innerLen >= 2
                && soft.innerLen <= 64
                && (
                  softCode === CODE_LOBBY_SESSION_LOGIN_REQ
                  || softCode === 0x1008
                  || softCode === 0x1006
                  || softCode === 0x2008
                );
              if (!softOk) throw strictErr;
              parsed0030 = soft;
              writeTrace({
                event: '0030-checksum-soft-accept',
                connectionId,
                message: strictErr.message,
                id: soft.id,
                innerCodeHex: codeHex(softCode),
                innerLen: soft.innerLen,
                checksumWire: soft.checksum,
                checksumExpect: soft.expectChecksum,
                bodyHeadHex: decodedBody.subarray(0, Math.min(16, decodedBody.length)).toString('hex'),
              });
            }
            const innerCode = readInnerCode(parsed0030.inner);

            writeTrace({
              event: '0030-decoded',
              connectionId,
              id: parsed0030.id,
              innerCodeHex: codeHex(innerCode),
              innerLen: parsed0030.innerLen,
              checksumMismatch: !!parsed0030.checksumMismatch,
              ...(innerCode === CODE_CMD_MOVE_GRID ? traceInner(parsed0030.inner) : {}),
            });

            if (innerCode === LOGIN_INNER_CODE) {
              const auth = verifyGin7Login(parsed0030.inner, accountsPath);
              writeTrace({
                event: 'login-credential',
                connectionId,
                account: auth.account ?? null,
                authOk: auth.ok,
                reason: auth.reason ?? null,
              });
              if (!auth.ok) {
                authRejected = true;
                // fail-closed: 성공 쌍 없이 0x7002 LGLoginNG 만 전송
                try {
                  const { ngFrame } = buildLoginNgResponseFrame({
                    decodedBody,
                    decipherKey: resolvedDecipherKey.bytes,
                    tables,
                  });
                  enqueueSocketWrite(socket, ngFrame);
                  writeTrace({
                    event: 'login-ng-sent',
                    connectionId,
                    reason: auth.reason,
                    ngCodeHex: codeHex(0x7002),
                    frameBytes: ngFrame.length,
                  });
                } catch (ngError) {
                  writeTrace({
                    event: 'login-rejected-no-frame',
                    connectionId,
                    reason: auth.reason,
                    message: ngError.message,
                  });
                }
                socket.end();
              } else {
                authenticatedAccount = String(auth.account);
                lobbyAccount = authenticatedAccount;
                issueReconnectHandoff(authenticatedAccount, socket);
                const { keysetupFrame, redirectFrame, gin7KeyHex } = buildLoginResponseFrames({
                  tables,
                  decipherKey: resolvedDecipherKey.bytes,
                  decodedBody,
                  redirectInner: loginRedirectInner,
                });
                enqueueSocketWrite(socket, Buffer.concat([keysetupFrame, redirectFrame]));
                writeTrace({
                  event: 'login-response-sent',
                  connectionId,
                  keysetupCodeHex: codeHex(0x0031),
                  redirectCodeHex: codeHex(0x7001),
                  ...traceGin7Key(gin7KeyHex),
                });
              }
            } else if (innerCode === CODE_LOBBY_SESSION_INIT) {
              writeTrace({ event: 'lobby-session-init', connectionId, id: parsed0030.id });
              // G177: LOGH_LOBBY_EARLY_OK=1 일 때만 0x0020 시점에 0x2001 선전송.
              // 기본 OFF — 이중 0x2001 + 잘못된 타이밍이 실클라 다이얼로그/종료를 유발한 전례.
              if (process.env.LOGH_LOBBY_EARLY_OK === '1' && authenticatedAccount) {
                const earlyId = takeReplyId(parsed0030.id >>> 0);
                const earlyFrame = buildLobbyLoginOkFrame({
                  id: earlyId,
                  decipherKey: resolvedDecipherKey.bytes,
                  tables,
                  status: 0,
                  format: 'message32',
                  subheaderLen: LOBBY_SUBHEADER_LEN,
                });
                enqueueSocketWrite(socket, earlyFrame);
                writeTrace({
                  event: 'lobby-early-ok-sent',
                  connectionId,
                  replyId: earlyId,
                  okFormat: 'message32',
                  subheaderLen: LOBBY_SUBHEADER_LEN,
                });
              } else if (process.env.LOGH_LOBBY_EARLY_OK === '1') {
                writeTrace({
                  event: 'lobby-early-ok-suppressed',
                  connectionId,
                  reason: 'auth-required',
                });
              }
            } else if (innerCode === CODE_SS_LOGIN_REQ) {
              // 0x0200 GameLogin: 씬 전환 FSM 게이트다 (RE 확정).
              // message32 0x200a 리다이렉트 후 같은 소켓으로 도착. 여기서는 0x0201 만 응답한다.
              //   0x0201 SSLoginOK → 클라 씬 FSM 통과(0x35837d/0x35837a) → 클라가 0x0205 송신
              //   0x0205 응답에서 0x0206 SSGameLoginOK(0x35837e) → 0x0204 → 월드레코드 → 전략맵
              // 월드레코드는 0x0205(handleWorldInner CODE_SS_GAME_LOGIN_REQ)에서 흐른다.
              // 0x0200 에 인라인 푸시하면 0x0205 응답과 이중 송신되고, 0x0206-before-0x0204
              // 순서를 클라 recv 필터에서 보장할 수 없다(0x0204 드롭 + 0x0205 재트리거 루프).
              if (!authenticatedAccount) {
                const handedAccount = consumeReconnectHandoff(socket, null, 'world');
                if (!handedAccount) {
                  writeTrace({ event: 'auth-required', connectionId, innerCodeHex: codeHex(innerCode) });
                  authRejected = true;
                  socket.end();
                  break;
                }
                authenticatedAccount = handedAccount;
              }
              lobbyAccount = authenticatedAccount;
              const okId = takeReplyId(parsed0030.id >>> 0);
              const okInner = buildSsLoginOkInner({ status: 1 });
              sendInner(socket, connectionId, okId, okInner);
              writeTrace({
                event: 'ss-login-ok-sent',
                connectionId,
                replyId: okId,
                account: lobbyAccount,
                requestInnerBytes: parsed0030.innerLen,
                responseHex: okInner.toString('hex'),
                note: 'world records deferred to 0x0205 SSGameLoginRequest',
              });
              // 로스터 트랜잭션은 C→S 0x1200 요청에만 응답 (중복 푸시 시 클라 루프/추첨 실패 유발).
            } else if (innerCode === CODE_TX_SIMPLE_DATA_BEGIN) {
              // 라이브 생성 경로: 클라가 0x1001 직후 C→S 0x1200(31B) 송신.
              // S→C 트랜잭션으로 응답 (Begin 포함 전체).
              if (!authenticatedAccount) {
                writeTrace({ event: 'auth-required', connectionId, innerCodeHex: codeHex(innerCode) });
                authRejected = true;
                socket.end();
                break;
              }
              lobbyAccount = authenticatedAccount;
              const rosterChars = lobbyAccount
                ? resolvedCharacterStore.getCharacters(lobbyAccount)
                : [];
              const rosterFrames = buildCharacterRosterTransaction({
                characters: rosterChars.map((c) => ({
                  id: c.id,
                  name: c.lastname || c.firstname || undefined,
                })),
              });
              let lastId = parsed0030.id >>> 0;
              for (const frame of rosterFrames) {
                lastId = takeReplyId(lastId);
                sendInner(socket, connectionId, lastId, frame);
              }
              writeTrace({
                event: 'roster-tx-pushed',
                connectionId,
                after: 'c2s-0x1200',
                frames: rosterFrames.length,
                characterCount: rosterChars.length,
                ...traceInner(parsed0030.inner),
              });
            } else if (innerCode === CODE_LOBBY_LOGIN_REQUEST) {
              const { account } = decodeLobbyLoginRequest(parsed0030.inner);
              if (!authenticatedAccount) {
                const handedAccount = consumeReconnectHandoff(socket, account, 'lobby');
                if (!handedAccount) {
                  writeTrace({ event: 'auth-required', connectionId, innerCodeHex: codeHex(innerCode), account });
                  authRejected = true;
                  socket.end();
                  break;
                }
                authenticatedAccount = handedAccount;
              }
              if (authenticatedAccount !== account) {
                writeTrace({
                  event: 'account-mismatch',
                  connectionId,
                  authenticatedAccount,
                  requestedAccount: account,
                });
                authRejected = true;
                socket.end();
                break;
              }
              lobbyAccount = authenticatedAccount;
              // ★캐릭터 자동 생성 금지. 빈 로스터면 빈 목록 그대로 응답.
              // 생성은 클라 0x1008(CommandGenerateCharacterCharge) 등 정식 경로만.
              const chars = resolvedCharacterStore.getCharacters(account);
              // 실클라 기본: message32 0x2001 + subheader4 + 단조 replyId
              const replyId = takeReplyId(parsed0030.id >>> 0);
              const okFrame = buildLobbyLoginOkFrame({
                id: replyId,
                decipherKey: resolvedDecipherKey.bytes,
                tables,
                status: 0,
                format: 'message32',
                subheaderLen: LOBBY_SUBHEADER_LEN,
              });
              enqueueSocketWrite(socket, okFrame);
              writeTrace({
                event: 'lobby-login-ok-sent',
                connectionId,
                account,
                replyId,
                okCodeHex: codeHex(CODE_LOBBY_LOGIN_OK),
                okFormat: 'message32',
                subheaderLen: LOBBY_SUBHEADER_LEN,
                characterCount: chars.length,
              });
              // 0x1001 선푸시: 기본 OFF.
              // 라이브 관측: 빈 로스터 선푸시 후 로비 체류 중 MSVC abnormal termination 이
              // 간헐적으로 발생. 클라가 0x1000 을 보낼 때만 응답하는 경로가 안전.
              // 필요 시 LOGH_PUSH_1001=1 로 재활성.
              if (process.env.LOGH_PUSH_1001 === '1') {
                try {
                  const rosterInner = encodeResponseInfoAccount({}, chars);
                  const rosterId = takeReplyId(replyId);
                  sendInner(socket, connectionId, rosterId, rosterInner);
                  writeTrace({
                    event: 'roster-push-1001',
                    connectionId,
                    replyId: rosterId,
                    account,
                    bytes: rosterInner.length,
                    characters: chars.length,
                    note: 'post-lobby-login empty-ok',
                  });
                } catch (rosterErr) {
                  writeTrace({
                    event: 'roster-push-error',
                    connectionId,
                    message: rosterErr.message,
                  });
                }
              }
            } else if (
              innerCode === CODE_LOBBY_SESSION_LOGIN_REQ
              || innerCode === CODE_SS_GAME_LOGIN_REQ
              || innerCode === CODE_CMD_MOVE_GRID
              || innerCode === CODE_CMD_GRID_CHAT
              // 월드 진입 후 어드미션 핸드셰이크(0x0304/0x0306/0x0312/0x0314/0x030a/0x030e/0x0310).
              // 이걸 로비 라우터로 흘리면 handleLobbyInner 가 null 반환 → 응답 없음 → NOW LOADING 정지.
              || isAdmissionRequestCode(innerCode)
            ) {
              if (!authenticatedAccount) {
                writeTrace({ event: 'auth-required', connectionId, innerCodeHex: codeHex(innerCode) });
                authRejected = true;
                socket.end();
                break;
              }
              lobbyAccount = authenticatedAccount;
              // 월드 권위 경로
              const rosterChars = lobbyAccount
                ? resolvedCharacterStore.getCharacters(lobbyAccount)
                : [];
              let character = rosterChars[0] ?? null;
              // session-login 시 character 주입을 위해 handleSessionLogin 직접 분기
              let result;
              if (innerCode === CODE_LOBBY_SESSION_LOGIN_REQ) {
                result = {
                  kind: 'session-login',
                  responses: [],
                };
                // 라이브: 캐릭 카드 더블클릭 시 0x2009 짧은 바디의 u16 필드에
                // sessionId 대신 characterId 가 실리는 경우가 있다(id=1 이면 session 1 과
                // 우연히 일치해 과거 통과). 로스터 id 와 일치하면 해당 캐릭 선택.
                let sessionCharacter = character;
                let loginInner = parsed0030.inner;
                try {
                  const req2009 = decodeLobbySessionLoginReq(parsed0030.inner);
                  const field = Number(req2009.sessionId) || 0;
                  const byId = rosterChars.find((c) => Number(c.id) === field);
                  if (byId) {
                    sessionCharacter = byId;
                    // session 피커 id 는 1|2. characterId 가 실린 경우 session=1 로 정규화.
                    if (field > 64) {
                      const norm = Buffer.alloc(4);
                      norm.writeUInt16BE(CODE_LOBBY_SESSION_LOGIN_REQ, 0);
                      norm.writeUInt16LE(1, 2);
                      loginInner = norm;
                    }
                  } else if (req2009.characterId > 0) {
                    const byChar = rosterChars.find((c) => Number(c.id) === Number(req2009.characterId));
                    if (byChar) sessionCharacter = byChar;
                  }
                } catch {
                  /* 디코드 실패 시 chars[0] 폴백 */
                }
                const login = resolvedWorld.handleSessionLogin({
                  connectionId,
                  accountId: lobbyAccount,
                  inner: loginInner,
                  character: sessionCharacter,
                });
                issueReconnectHandoff(authenticatedAccount, socket, 'world');
                result.responses.push({
                  targets: [connectionId],
                  inner: login.responseInner,
                  isMsg32: login.responseIsMsg32 !== false,
                });
                writeTrace({
                  event: 'session-login',
                  connectionId,
                  createPending: !!login.createPending,
                  characterId: login.player?.characterId ?? 0,
                  sessionId: login.player?.sessionId ?? 0,
                  responseIsMsg32: login.responseIsMsg32 !== false,
                  responseHex: Buffer.from(login.responseInner).toString('hex'),
                  ...traceInner(parsed0030.inner),
                });
                // 0x2009 는 0x200a 리다이렉트만 보낸다. 월드 진입(0x0206+레코드)은
                // 클라가 이어 보내는 0x0200 GameLogin 응답에서 0x0201 직후에 처리한다.
                // RE 확정: 0x2009 에 월드레코드를 인라인 푸시하면 씬 전환 게이트(0x35837d)를
                // 세팅하는 0x0201 이 없어 클라가 캐릭터 선택 화면에 잔류한다.
                // handleSessionLogin 이 기존캐릭이면 플레이어를 등록해 두므로,
                // 0x0200 핸들러의 enterWorld({connectionId}) 가 그 상태를 사용한다.
                result.codes = [0x200a];
                result.kind = login.createPending
                  ? 'session-login-create-pending'
                  : 'session-login-redirect';
              } else {
                result = resolvedWorld.handleWorldInner({
                  connectionId,
                  accountId: lobbyAccount,
                  inner: parsed0030.inner,
                });
              }

              if (!result) {
                writeTrace({ event: 'world-inner-unhandled', connectionId, innerCodeHex: codeHex(innerCode) });
                continue;
              }

              for (const resp of result.responses) {
                for (const targetId of resp.targets) {
                  const sock = socketsByConn.get(targetId);
                  if (!sock) continue;
                  const minExclusive = targetId === connectionId ? parsed0030.id >>> 0 : 0;
                  const replyId = takeReplyIdForConnection(targetId, minExclusive);
                  sendInner(sock, targetId, replyId, resp.inner);
                }
              }
              writeTrace({
                event: 'world-response-sent',
                connectionId,
                kind: result.kind,
                // admission 은 result.codes 를 안 채운다 → 응답 inner 의 실제 코드를 유도해 남긴다.
                codes: (result.codes ?? result.responses.map((r) => innerEmitCode(r.inner)))
                  .map((c) => (typeof c === 'number' ? codeHex(c) : c)),
                reqCode: result.reqCode != null ? codeHex(result.reqCode) : null,
                responseCount: result.responses.length,
                cell: result.cell ?? null,
                cellSource: result.cellSource ?? null,
                routeCellCandidate: result.routeCellCandidate ?? null,
                configuredFallback: result.configuredFallback ?? null,
                unresolved: result.unresolved ?? null,
                textLength: typeof result.text === 'string' ? result.text.length : null,
                // 핸들러가 실은 원시 바이트/디코드 관측치(0x0326 레이아웃 판별용)를 stdout 트레이스로 낸다.
                debug: result.debug ?? null,
              });
            } else {
              // 로비 캐릭터 라우터 (0x1000/0x2003/0x2005/0x1008 등)
              if (!authenticatedAccount) {
                writeTrace({ event: 'auth-required', connectionId, innerCodeHex: codeHex(innerCode) });
                authRejected = true;
                socket.end();
                break;
              }
              lobbyAccount = authenticatedAccount;
              try {
                const responseInner = handleLobbyInner(
                  parsed0030.inner,
                  lobbyAccount,
                  resolvedCharacterStore,
                );
                if (responseInner) {
                  const replyId = takeReplyId(parsed0030.id >>> 0);
                  sendInner(socket, connectionId, replyId, responseInner);
                  writeTrace({
                    event: 'lobby-response-sent',
                    connectionId,
                    replyId,
                    requestInnerCodeHex: codeHex(innerCode),
                    responseInnerBytes: responseInner.length,
                  });
                  // 0x1001 후 로스터 트랜잭션 선푸시 안 함 — 클라 C→S 0x1200 이 요청.
                } else {
                  writeTrace({ event: 'lobby-inner-silent', connectionId, innerCodeHex: codeHex(innerCode) });
                }
              } catch (lobbyError) {
                writeTrace({
                  event: 'lobby-inner-error',
                  connectionId,
                  innerCodeHex: codeHex(innerCode),
                  message: lobbyError.message,
                  ...traceInner(parsed0030.inner),
                });
                // 로비 미지 코드면 월드 라우터 재시도
                const worldResult = resolvedWorld.handleWorldInner({
                  connectionId,
                  accountId: lobbyAccount,
                  inner: parsed0030.inner,
                });
                if (worldResult) {
                  for (const resp of worldResult.responses) {
                    for (const targetId of resp.targets) {
                      const sock = socketsByConn.get(targetId);
                      if (!sock) continue;
                      const minExclusive = targetId === connectionId ? parsed0030.id >>> 0 : 0;
                      const replyId = takeReplyIdForConnection(targetId, minExclusive);
                      sendInner(sock, targetId, replyId, resp.inner);
                    }
                  }
                  writeTrace({
                    event: 'world-response-sent',
                    connectionId,
                    kind: worldResult.kind,
                  });
                } else {
                  writeTrace({
                    event: 'inner-unhandled',
                    connectionId,
                    innerCodeHex: codeHex(innerCode),
                    message: lobbyError.message,
                    ...traceInner(parsed0030.inner),
                  });
                }
              }
            }
          } catch (error) {
            // 로비 버튼 클릭 직후 checksum 실패 진단: 복호 실패 vs 봉투 필드 불일치 구분
            let decodeDiag = null;
            try {
              if (phase1Key && frame?.body?.length) {
                const raw = decryptBuffer(frame.body, expandChildCodecKey(phase1Key, tables));
                decodeDiag = {
                  bodyBytes: raw.length,
                  bodyHeadHex: raw.subarray(0, Math.min(16, raw.length)).toString('hex'),
                  checksumWire: raw.length >= 2 ? raw.readUInt16BE(0) : null,
                  idWire: raw.length >= 6 ? raw.readUInt32BE(2) : null,
                  innerLenWire: raw.length >= 8 ? raw.readUInt16BE(6) : null,
                };
              }
            } catch {
              decodeDiag = { note: 'decrypt-also-failed' };
            }
            writeTrace({
              event: '0030-decode-error',
              connectionId,
              message: error.message,
              frameBodyBytes: frame?.body?.length ?? null,
              decodeDiag,
            });
          }
        } else if (frame.code === CONFIRM_CODE) {
          // traced via frame-received
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
      socketsByConn.delete(connectionId);
      nextReplyIdByConn.delete(connectionId);
      if (typeof resolvedWorld.handleDisconnect === 'function') {
        resolvedWorld.handleDisconnect(connectionId);
      }
      writeTrace({ event: 'connection-closed', connectionId, hadError });
    });
  });

  return {
    worldSession: resolvedWorld,
    characterStore: resolvedCharacterStore,
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
          writeTrace({ event: 'server-listening', address: server.address() });
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

// ─── CLI ──────────────────────────────────────────────────────────────────────

function parseAdvertisedPort(value) {
  const advertisedPort = Number(value);
  if (!Number.isInteger(advertisedPort) || advertisedPort < 1 || advertisedPort > 0xffff) {
    throw new Error(`invalid --advertise-port: ${value}`);
  }
  return advertisedPort;
}

function parseArgs(argv) {
  const opts = {
    port: 47900,
    host: '127.0.0.1',
    tracePath: null,
    advertiseHost: null,
    advertisePort: null,
  };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--port' && argv[i + 1]) opts.port = Number(argv[++i]);
    else if (argv[i] === '--host' && argv[i + 1]) opts.host = argv[++i];
    else if (argv[i] === '--trace' && argv[i + 1]) opts.tracePath = argv[++i];
    else if (argv[i] === '--advertise-host') {
      if (!argv[i + 1] || argv[i + 1].startsWith('--')) {
        throw new Error('--advertise-host requires a value');
      }
      opts.advertiseHost = argv[++i];
    } else if (argv[i] === '--advertise-port') {
      if (!argv[i + 1] || argv[i + 1].startsWith('--')) {
        throw new Error('--advertise-port requires a value');
      }
      opts.advertisePort = parseAdvertisedPort(argv[++i]);
    }
  }
  const hasAdvertiseHost = opts.advertiseHost !== null;
  const hasAdvertisePort = opts.advertisePort !== null;
  if (hasAdvertiseHost !== hasAdvertisePort) {
    throw new Error('--advertise-host and --advertise-port must be provided together');
  }
  opts.advertisedEndpoint = hasAdvertiseHost
    ? { ip: opts.advertiseHost, port: opts.advertisePort }
    : { ip: opts.host === '0.0.0.0' ? '127.0.0.1' : opts.host, port: opts.port };
  return opts;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const opts = parseArgs(process.argv.slice(2));
  const srv = createPlayableServer({
    port: opts.port,
    host: opts.host,
    advertisedEndpoint: opts.advertisedEndpoint,
    tracePath: opts.tracePath,
    logger: console,
  });
  await srv.listen();
  const addr = srv.address();
  console.log(JSON.stringify({ event: 'playable-server-ready', address: addr }));
}
