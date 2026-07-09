// logh7-playable-server.mjs — 로그인→로비→월드→권위 이동/채팅 통합 TCP 서버
//
// 기존 login-harness-server 의 핸드셰이크/0x0030 경로를 재사용하고,
// 월드 세션 권위 처리(logh7-world-session)를 같은 포트에 붙인다.
// 진입점: node src/server/logh7-playable-server.mjs [--port 47900] [--trace path]
// 3티어 런타임(ORM/CQRS) 권장: node src/presentation/main.mjs

import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createServer } from 'node:net';
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
import { buildLoginResponseFrames, buildLoginNgResponseFrame } from './logh7-login-response.mjs';
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
} from './logh7-world-records.mjs';
import { CODE_REQ_INFO_ACCOUNT } from './logh7-character-codec.mjs';
import { buildPhase3ResponseFromPhase1Frame } from './logh7-login-harness-server.mjs';
import {
  verifyGin7Login,
  loadAccountRegistry,
  DEFAULT_ACCOUNTS_PATH,
  DEFAULT_CHARACTERS_PATH,
} from './logh7-account-auth.mjs';

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
 * 최소 플레이어블 서버 팩토리.
 * 반환 객체: listen/close/address + worldSession + characterStore
 */
export function createPlayableServer({
  port = 47900,
  host = '127.0.0.1',
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
  if (tracePath) mkdirSync(dirname(tracePath), { recursive: true });

  // 실 서버 data/ 경로 (유저 환경과 동일). accounts 시드 보장.
  loadAccountRegistry(accountsPath);
  const resolvedCharacterStore = characterStore
    ?? createCharacterStore(characterStorePath ?? DEFAULT_CHARACTERS_PATH);
  const resolvedWorld = worldSession ?? createWorldSession({
    worldRedirect: { ip: host === '0.0.0.0' ? '127.0.0.1' : host, port, token: 1 },
  });

  const resolvedTransportKey = resolveKey(transportKey, 'LOGH_TRANSPORT_KEY_HEX', LEGACY_TRANSPORT_KEY_HEX);
  const resolvedDecipherKey = resolveKey(decipherKey, 'LOGH_DECIPHER_KEY_HEX', LEGACY_DECIPHER_KEY_HEX);

  let nextConnectionId = 1;
  let listening = false;
  /** @type {Map<number, import('node:net').Socket>} */
  const socketsByConn = new Map();
  const sockets = new Set();
  // 세션 서버 재접속(conn N+1) 시 직전 로비 계정 바인딩용 (0x0200 바디 계정 파싱 전 임시)
  let lastLobbyAccount = null;

  const writeTrace = (record) => {
    const line = JSON.stringify({ ts: new Date().toISOString(), ...record });
    if (tracePath) appendFileSync(tracePath, `${line}\n`);
    logger?.debug?.(record);
  };

  function sendInner(socket, connectionId, id, inner) {
    const frame = encryptInnerFrame({
      tables,
      decipherKey: resolvedDecipherKey.bytes,
      id,
      inner,
    });
    socket.write(frame);
    return frame;
  }

  function broadcastInner(targets, id, inner, exceptConn = null) {
    const frames = [];
    for (const targetId of targets) {
      if (exceptConn != null && targetId === exceptConn) {
        // still send to self for move/chat echo (recipients include self)
      }
      const sock = socketsByConn.get(targetId);
      if (!sock) continue;
      frames.push({ connectionId: targetId, frame: sendInner(sock, targetId, id, inner) });
    }
    return frames;
  }

  const server = createServer((socket) => {
    const connectionId = nextConnectionId;
    nextConnectionId += 1;
    sockets.add(socket);
    socketsByConn.set(connectionId, socket);
    const parser = createFrameStreamParser();
    let phase1Key = null;
    let lobbyAccount = null;
    // S→C 단조 증가 id (해독 시퀀스 게이트 0x645eda: id > cipher+0x20)
    // ★요청 id 재사용 금지 — 0x2001 replyId=3 후 0x2004 에 또 id=3 쓰면 클라가 폐기/FIN.
    let nextReplyId = 1;
    function takeReplyId(minExclusive = 0) {
      if (nextReplyId <= minExclusive) nextReplyId = minExclusive + 1;
      const id = nextReplyId;
      nextReplyId += 1;
      return id;
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
            socket.write(phase3.frame);
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
            const parsed0030 = parse0030Body(decodedBody);
            const innerCode = readInnerCode(parsed0030.inner);

            writeTrace({
              event: '0030-decoded',
              connectionId,
              id: parsed0030.id,
              innerCodeHex: codeHex(innerCode),
              innerLen: parsed0030.innerLen,
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
                // fail-closed: 성공 쌍 없이 0x7002 LGLoginNG 만 전송
                try {
                  const { ngFrame } = buildLoginNgResponseFrame({
                    decodedBody,
                    decipherKey: resolvedDecipherKey.bytes,
                    tables,
                  });
                  socket.write(ngFrame);
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
              } else {
                const { keysetupFrame, redirectFrame, gin7KeyHex } = buildLoginResponseFrames({
                  tables,
                  decipherKey: resolvedDecipherKey.bytes,
                  decodedBody,
                });
                socket.write(Buffer.concat([keysetupFrame, redirectFrame]));
                writeTrace({
                  event: 'login-response-sent',
                  connectionId,
                  keysetupCodeHex: codeHex(0x0031),
                  redirectCodeHex: codeHex(0x7001),
                  gin7KeyHex,
                });
              }
            } else if (innerCode === CODE_LOBBY_SESSION_INIT) {
              writeTrace({ event: 'lobby-session-init', connectionId, id: parsed0030.id });
              // G177: LOGH_LOBBY_EARLY_OK=1 일 때만 0x0020 시점에 0x2001 선전송.
              // 기본 OFF — 이중 0x2001 + 잘못된 타이밍이 실클라 다이얼로그/종료를 유발한 전례.
              if (process.env.LOGH_LOBBY_EARLY_OK === '1') {
                const earlyId = takeReplyId(parsed0030.id >>> 0);
                const earlyFrame = buildLobbyLoginOkFrame({
                  id: earlyId,
                  decipherKey: resolvedDecipherKey.bytes,
                  tables,
                  status: 0,
                  format: 'message32',
                  subheaderLen: LOBBY_SUBHEADER_LEN,
                });
                socket.write(earlyFrame);
                writeTrace({
                  event: 'lobby-early-ok-sent',
                  connectionId,
                  replyId: earlyId,
                  okFormat: 'message32',
                  subheaderLen: LOBBY_SUBHEADER_LEN,
                });
              }
            } else if (innerCode === CODE_SS_LOGIN_REQ) {
              // 세션 서버 재접속: 0x200a 리다이렉트 이후 0x0200 SSLoginRequest.
              // 생성 경로 라이브(2026-07-09): 0x0201 없으면 공지 복귀.
              if (!lobbyAccount && lastLobbyAccount) lobbyAccount = lastLobbyAccount;
              const replyId = takeReplyId(parsed0030.id >>> 0);
              const okInner = buildSsLoginOkInner({ status: 0 });
              sendInner(socket, connectionId, replyId, okInner);
              writeTrace({
                event: 'ss-login-ok-sent',
                connectionId,
                replyId,
                account: lobbyAccount,
                requestInnerBytes: parsed0030.innerLen,
                responseHex: okInner.toString('hex'),
              });
              // 로스터 트랜잭션은 C→S 0x1200 요청에만 응답 (중복 푸시 시 클라 루프/추첨 실패 유발).
            } else if (innerCode === CODE_TX_SIMPLE_DATA_BEGIN) {
              // 라이브 생성 경로: 클라가 0x1001 직후 C→S 0x1200(31B) 송신.
              // S→C 트랜잭션으로 응답 (Begin 포함 전체).
              if (!lobbyAccount && lastLobbyAccount) lobbyAccount = lastLobbyAccount;
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
                requestInnerHex: Buffer.from(parsed0030.inner).subarray(0, 64).toString('hex'),
              });
            } else if (innerCode === CODE_LOBBY_LOGIN_REQUEST) {
              const { account } = decodeLobbyLoginRequest(parsed0030.inner);
              lobbyAccount = account;
              lastLobbyAccount = account;
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
              socket.write(okFrame);
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
            ) {
              // 월드 권위 경로
              let character = null;
              if (lobbyAccount) {
                const chars = resolvedCharacterStore.getCharacters(lobbyAccount);
                character = chars[0] ?? null;
              }
              // session-login 시 character 주입을 위해 handleSessionLogin 직접 분기
              let result;
              if (innerCode === CODE_LOBBY_SESSION_LOGIN_REQ) {
                result = {
                  kind: 'session-login',
                  responses: [],
                };
                const login = resolvedWorld.handleSessionLogin({
                  connectionId,
                  accountId: lobbyAccount,
                  inner: parsed0030.inner,
                  character,
                });
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
                  innerHex: Buffer.from(parsed0030.inner).toString('hex'),
                });
                // 기존 캐릭 로그인만 월드 진입. 생성 경로(createPending)는 0x200a 만 —
                // 클라가 8단계 생성 폼으로 진행하고 0x1008 을 보내게 둔다.
                if (!login.createPending && login.player?.characterId > 0) {
                  const entered = resolvedWorld.enterWorld({ connectionId });
                  for (const emit of entered.emits) {
                    result.responses.push({
                      targets: [connectionId],
                      inner: emit,
                      isMsg32: true,
                    });
                  }
                  result.codes = entered.codes;
                  result.kind = 'session-login+world-enter';
                } else {
                  result.kind = 'session-login-create-pending';
                  result.codes = [0x200a];
                }
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
                const replyId = takeReplyId(parsed0030.id >>> 0);
                for (const targetId of resp.targets) {
                  const sock = socketsByConn.get(targetId);
                  if (!sock) continue;
                  sendInner(sock, targetId, replyId, resp.inner);
                }
              }
              writeTrace({
                event: 'world-response-sent',
                connectionId,
                kind: result.kind,
                codes: result.codes ?? null,
                responseCount: result.responses.length,
                cell: result.cell ?? null,
                text: result.text ?? null,
              });
            } else {
              // 로비 캐릭터 라우터 (0x1000/0x2003/0x2005/0x1008 등)
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
                  innerHex: Buffer.from(parsed0030.inner).subarray(0, 64).toString('hex'),
                });
                // 로비 미지 코드면 월드 라우터 재시도
                const worldResult = resolvedWorld.handleWorldInner({
                  connectionId,
                  accountId: lobbyAccount,
                  inner: parsed0030.inner,
                });
                if (worldResult) {
                  for (const resp of worldResult.responses) {
                    const replyId = takeReplyId(parsed0030.id >>> 0);
                    broadcastInner(resp.targets, replyId, resp.inner);
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
                    innerHex: Buffer.from(parsed0030.inner).subarray(0, 64).toString('hex'),
                  });
                }
              }
            }
          } catch (error) {
            writeTrace({ event: '0030-decode-error', connectionId, message: error.message });
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

function parseArgs(argv) {
  const opts = { port: 47900, host: '127.0.0.1', tracePath: null };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--port' && argv[i + 1]) opts.port = Number(argv[++i]);
    else if (argv[i] === '--host' && argv[i + 1]) opts.host = argv[++i];
    else if (argv[i] === '--trace' && argv[i + 1]) opts.tracePath = argv[++i];
  }
  return opts;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const opts = parseArgs(process.argv.slice(2));
  const srv = createPlayableServer({
    port: opts.port,
    host: opts.host,
    tracePath: opts.tracePath,
    logger: console,
  });
  await srv.listen();
  const addr = srv.address();
  console.log(JSON.stringify({ event: 'playable-server-ready', address: addr }));
}
