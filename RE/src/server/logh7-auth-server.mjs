// LOGH VII authoritative login server (the *solved* login -> lobby-redirect flow).
//
// Pipeline per connection (all reverse-engineered & validated against the real client):
//   1. client -> 0x0034 (phase1)  : server replies 0x0035 (phase3) and learns the
//      per-connection encipherKey (used to decode the client's 0x0030 bodies).
//   2. client -> 0x0036 (confirm) : no reply needed.
//   3. client -> 0x0030 / inner 0x7000 (GIN7 credential) : server authenticates against
//      the in-memory account store, then drives the client to the lobby exactly as the
//      proven g134 sequence does:
//        frame A "keysetup": the login body with its inner code forced to 0x31, encoded
//          with decipherKey. The client's router routes inner 0x31 into keysetup, which
//          installs the GIN7 blob as the next child-codec key.
//        frame B "redirect": inner 0x7001 (lobby IP/port/token), encoded with that same
//          GIN7 blob key (== the client's own credential payload, loginInner[2:]).
//      The client then closes this connection and reconnects to the lobby server.
//
// Transport framing / crypto reuse logh7-codec + logh7-envelope-0030; auth/state logic
// reuse logh7-login-session. This module is just the IO wiring.

import { createServer as createTcpServer } from 'node:net';
import { createServer as createHttpServer } from 'node:http';
import { createWriteStream } from 'node:fs';
import { timingSafeEqual } from 'node:crypto';
import path from 'node:path';

import {
  buildPhase3ResponseFromPhase1Request,
  childCodecDecode,
  childCodecEncode,
  childCodecKeySchedule,
  resolveChildCodecTables,
} from './logh7-codec.mjs';
import { build0030Body, parse0030Body } from './logh7-envelope-0030.mjs';
import {
  LOGIN_INNER_CODE,
  LOBBY_LOGIN_REQUEST_CODE,
  LOBBY_LOGIN_OK_CODE,
  buildLobbyLoginOkInner,
  buildMpsClientMessage32Inner,
  wrapRawInnerAsMessage32,
  buildCommandGridChatInner,
  buildServerListInner,
  selectSsResponseInner,
  buildInformationUnitRecordInner,
  buildInformationCharacterRecordInner,
} from './logh7-login-protocol.mjs';
import { projectFleetCommanderRecords } from './logh7-faction-projection.mjs';
import { createAccountStore, createLoginSession } from './logh7-login-session.mjs';
import { runNpcTick, behaviorProfile } from './logh7-npc-ai.mjs';
import { createStrategicSim, buildStrategicGraph } from './logh7-strategic-sim.mjs';
import { createWorldRelay, isRelayCommandCode } from './logh7-world-relay.mjs';
import { createWorldState } from './logh7-world-state.mjs';
import { loadScenarioFile, loadScenarioInto } from './logh7-scenario.mjs';
import { loadConfig } from './logh7-config.mjs';
import { composeSnapshot } from './logh7-repository.mjs';
import { createEconomyState, seedEconomyFromSystems } from './logh7-economy.mjs';
import { operationIssueEnabled, OPERATION_PURPOSE, creditOperationMerit } from './logh7-strategy.mjs'; // 작전계획 발령 게이트(30일 lifecycle, opt-in) + 결과정산 功績 적립 배선
import { processCommand, seedPersonnelFromWorldState } from './logh7-command-engine.mjs';
import { createContentPack } from './logh7-content-pack.mjs';
import { CANON_CONTENT } from './logh7-canon-content.mjs';
import { openContentSource } from './logh7-content-source.mjs';
import { buildContentPackDataFromSource } from './logh7-content-adapter.mjs';
import { loadMods } from './logh7-mod-loader.mjs';

/**
 * Opt-in mod application (LOGH_MODS_DIR). Layers mods/<name>/content over the base content data and
 * validates against the client caps. If a mod would exceed a client cap (which bails the parser), it
 * logs the errors and serves the BASE unmodified — modding never breaks the client.
 */
function applyModsIfEnabled(baseData, modsDir = process.env.LOGH_MODS_DIR) {
  const dir = modsDir;
  if (!dir) return baseData;
  const { data, appliedMods, validation, conflicts } = loadMods(baseData, dir);
  for (const c of conflicts) console.warn(`[mods] conflict: ${c}`);
  for (const w of validation.warnings) console.warn(`[mods] cap warning: ${w}`);
  if (!validation.ok) {
    console.error(`[mods] mod content failed client-cap validation; serving base unmodified:\n  ${validation.errors.join('\n  ')}`);
    return baseData;
  }
  if (appliedMods.length) console.log(`[mods] applied: ${appliedMods.join(', ')}`);
  return data;
}
import { characterDisplayName } from './logh7-inferred-content.mjs';
import { decodeNotifyInformationCharacterStream } from './logh7-personnel.mjs';

const PHASE1_CODE = 0x0034;
const TRANSPORT_0030 = 0x0030;
const KEYSETUP_INNER_CODE = 0x0031;
const DEFAULT_LOBBY_CHARACTERS = Object.freeze([{ id: 1 }]);
const DEFAULT_SESSIONS = Object.freeze([
  { sessionId: 1, name: 'Amritsar', status: 1, beginDay: 'UC 796', powers: [{ id: 1, superMan: 'Reinhard' }] },
  { sessionId: 2, name: 'Vermilion', status: 1, beginDay: 'UC 799', powers: [{ id: 2, superMan: 'Yang' }] },
]);

export function resolveLobbyCharacters({
  characters = undefined,
  lobby = undefined,
  contentPack = null,
  worldCharacterId = process.env.LOGH_WORLD_CHAR_ID,
} = {}) {
  if (characters !== undefined) return characters;
  if (lobby?.characters !== undefined) return lobby.characters;
  const richContentCards = process.env.LOGH_LOBBY_RICH_CHARACTERS === '1';
  const forcedId = Number(worldCharacterId ?? 0);
  if (Number.isInteger(forcedId) && forcedId > 0) {
    const ch = contentPack?.characterById?.(forcedId) ?? null;
    if (!richContentCards) return [minimalLobbyCharacterRecord(forcedId, ch)];
    const record = { ...(ch ?? {}), id: forcedId, status: 1 };
    const displayName = fitLobbyCharacterName(lobbyCharacterDisplayName(ch ?? record));
    if (displayName) record.name = displayName;
    return [record];
  }
  const defaultId = DEFAULT_LOBBY_CHARACTERS[0]?.id ?? 1;
  const ch = contentPack?.characterById?.(defaultId) ?? null;
  if (ch && !richContentCards) return [minimalLobbyCharacterRecord(defaultId, ch)];
  if (ch && richContentCards) {
    const record = { ...ch, id: defaultId, status: 1 };
    const displayName = fitLobbyCharacterName(lobbyCharacterDisplayName(record));
    if (displayName) record.name = displayName;
    return [record];
  }
  return DEFAULT_LOBBY_CHARACTERS;
}

function minimalLobbyCharacterRecord(id, character = null) {
  const record = { id, status: 1 };
  const displayName = fitLobbyCharacterName(lobbyCharacterDisplayName(character ?? record));
  if (displayName) record.name = displayName;
  return record;
}

function fitLobbyCharacterName(value) {
  if (typeof value !== 'string' || value.length === 0) return null;
  if ([...value, '\0'].length <= 0x0d) return value;
  for (const token of value.split(/\s+/u)) {
    if (token && [...token, '\0'].length <= 0x0d) return token;
  }
  return null;
}

function lobbyCharacterDisplayName(character = {}) {
  return (
    character.nameKo
    ?? character.name_ko
    ?? character.nameKr
    ?? character.name_kr
    ?? character.nameRomaji
    ?? character.name_romaji
    ?? characterDisplayName(character)
    ?? character.name
    ?? character.name_ja
    ?? null
  );
}

/** Build a transport-0x0030 frame whose body is child-codec encoded under `key`. */
export function buildEncrypted0030Frame({ tables, key, body, subheaderLen = 0 }) {
  // The lobby connection (conn2) parse context carries a header-size field [transport+0x12]=4
  // (login conn = 0): its router reads the transport code at readptr + that offset and computes the
  // decode length as frameLen - offset - 2. So a lobby 0x0030 frame must be
  // [u16 len][subheaderLen bytes][u16 0x0030][encoded body], with len counting subheader+code+body.
  // (RE: frida router-code probe — conn2 reads code 4 bytes too far without the subheader.)
  const encoded = childCodecEncode(childCodecKeySchedule(tables, key), body);
  const frame = Buffer.alloc(4 + subheaderLen + encoded.length);
  frame.writeUInt16BE(subheaderLen + 2 + encoded.length, 0);
  frame.writeUInt16BE(TRANSPORT_0030, 2 + subheaderLen); // subheader bytes stay zero
  encoded.copy(frame, 4 + subheaderLen);
  return frame;
}

export function selectLobbyLoginOkKey({ mode, parsedInnerPayload, decipherKey, phase1Key }) {
  const keyMode = mode === 'gin7' ? 'gin7' : mode === 'phase1' ? 'phase1' : 'decipher';
  const key =
    keyMode === 'gin7'
      ? Buffer.from(parsedInnerPayload.subarray(2))
      : keyMode === 'phase1'
        ? phase1Key
        : decipherKey;
  return { keyMode, key };
}

export function buildLobbyLoginOkPayload({ status = 0, format } = {}) {
  const okFormat = format === 'message32' ? 'message32' : 'raw';
  const rawInner = buildLobbyLoginOkInner({ status });
  const message32Payload = Buffer.from([status & 0xff, 0, 0]);
  const okInner =
    okFormat === 'message32'
      ? buildMpsClientMessage32Inner({ code: LOBBY_LOGIN_OK_CODE, payload: message32Payload })
      : rawInner;
  return { okFormat, okInner };
}

/** Split a TCP byte stream into [u16 len][u16 code][body] frames (len counts code+body). */
export function takeTransportFrames(buffer) {
  const frames = [];
  let offset = 0;
  while (buffer.length - offset >= 4) {
    const declaredLength = buffer.readUInt16BE(offset);
    const totalLength = declaredLength + 2;
    if (totalLength < 4 || buffer.length - offset < totalLength) {
      break;
    }
    frames.push(buffer.subarray(offset, offset + totalLength));
    offset += totalLength;
  }
  return { frames, remaining: buffer.subarray(offset) };
}

/**
 * Compute the server's reply frames for the authenticated login redirect, mirroring
 * the proven g134 keysetup+redirect pair. Pure (no IO) for unit-testing.
 * @returns {{ keysetupFrame: Buffer, redirectFrame: Buffer, gin7KeyHex: string }}
 */
export function buildRedirectReply({ tables, decipherKey, decodedBody, redirectInner }) {
  const parsed = parse0030Body(decodedBody);
  if (!parsed.valid) {
    throw new Error(`cannot build redirect reply from invalid 0x0030 body: ${parsed.reason}`);
  }
  const keysetupInner = Buffer.from(parsed.innerPayload);
  keysetupInner.writeUInt16BE(KEYSETUP_INNER_CODE, 0);
  const keysetupFrame = buildEncrypted0030Frame({
    tables,
    key: decipherKey,
    body: build0030Body({ id: parsed.id, innerPayload: keysetupInner }),
  });
  // The keysetup installs the GIN7 blob (login inner minus its 2-byte code) as the
  // next cipher key; the redirect must be encoded with that same key.
  const gin7Key = Buffer.from(parsed.innerPayload.subarray(2));
  const redirectFrame = buildEncrypted0030Frame({
    tables,
    key: gin7Key,
    body: build0030Body({ id: parsed.id, innerPayload: redirectInner }),
  });
  return { keysetupFrame, redirectFrame, gin7KeyHex: gin7Key.toString('hex') };
}

function writeTrace(stream, event) {
  if (stream !== null) {
    stream.write(`${JSON.stringify({ at: new Date().toISOString(), ...event })}\n`);
  }
}

function appCodeForTrace(innerPayload) {
  if (innerPayload.length >= 6 && innerPayload.readUInt16BE(0) === 0) {
    return innerPayload.readUInt16BE(4);
  }
  return innerPayload.readUInt16BE(0);
}

function payloadForTrace(innerPayload) {
  if (innerPayload.length >= 6 && innerPayload.readUInt16BE(0) === 0) {
    return innerPayload.subarray(6);
  }
  return innerPayload.subarray(2);
}

function profileKeyForTrace(account, characterId) {
  if (typeof account !== 'string' || account.length === 0) return null;
  if (!Number.isInteger(characterId) || characterId <= 0) return null;
  return `${account}:${characterId}`;
}

function recordTraceFields(innerPayload) {
  const code = appCodeForTrace(innerPayload);
  const payload = payloadForTrace(innerPayload);
  if (code === 0x0305 || code === 0x0307) {
    const head = payload.subarray(0, Math.min(256, payload.length));
    const nonzeroFirst256 = head.reduce((count, byte) => count + (byte === 0 ? 0 : 1), 0);
    return {
      worldInfoWire: code === 0x0305 ? 'response-0305' : 'response-0307',
      worldInfoWireLength: payload.length,
      worldInfoWireCountLe0: payload.length >= 2 ? payload.readUInt16LE(0) : null,
      worldInfoWireCountBe0: payload.length >= 2 ? payload.readUInt16BE(0) : null,
      worldInfoWireNonzeroFirst256: nonzeroFirst256,
      worldInfoWireAllZeroFirst256: nonzeroFirst256 === 0,
    };
  }
  if (code === 0x0204) {
    if (payload.length < 4) {
      return {};
    }
    return { characterId: payload.readUInt32BE(0) };
  }
  if (code === 0x0325) {
    if (payload.length < 8) {
      return {};
    }
    return {
      unitCountBe0: payload.readUInt16BE(0),
      unitCountLe0: payload.readUInt16LE(0),
      unit0IdBe2: payload.readUInt32BE(2),
      unit0IdLe2: payload.readUInt32LE(2),
      unit0IdBe4: payload.readUInt32BE(4),
      unit0IdLe4: payload.readUInt32LE(4),
    };
  }
  if (code !== 0x0323 && code !== 0x0356) {
    return {};
  }
  if (code === 0x0356) {
    const decoded = decodeNotifyInformationCharacterStream(payload);
    if (!decoded) {
      return {
        recordWire: 'compact-0356-unparsed',
        recordWireLength: payload.length,
        actionListCategoryEnv: process.env.LOGH_ACTION_LIST_CATEGORY ?? null,
        actionListSeatsEnv: process.env.LOGH_ACTION_LIST_SEATS ?? null,
        postloadActionListSeatsEnv: process.env.LOGH_POSTLOAD_ACTION_LIST_SEATS ?? null,
      };
    }
    const object = decoded.object;
    return {
      characterId: object.readUInt32LE(0x04),
      recordWire: 'compact-0356',
      recordWireLength: payload.length,
      recordWireHeadHex: payload.subarray(0, 32).toString('hex'),
      recordId04Le: object.readUInt32LE(0x04),
      recordGridUnit24Le: object.readUInt32LE(0x24),
      recordGridUnit28Le: object.readUInt32LE(0x28),
      recordWireConsumed: decoded.consumed,
      recordWireTrailing: decoded.trailing,
      recordSeatCount250: object.readUInt8(0x250),
      recordSeatKind254: object.readUInt16LE(0x254),
      recordSeatChar254: object.readUInt16LE(0x254),
      recordSeatRole258: object.readUInt32LE(0x258),
      actionListCategoryEnv: process.env.LOGH_ACTION_LIST_CATEGORY ?? null,
      actionListSeatsEnv: process.env.LOGH_ACTION_LIST_SEATS ?? null,
      postloadActionListSeatsEnv: process.env.LOGH_POSTLOAD_ACTION_LIST_SEATS ?? null,
    };
  }
  if (payload.length < 0x25c) {
    return {};
  }
  const readU32 = (offset) => payload.readUInt32BE(offset);
  const characterId = readU32(0x00);
  return {
    characterId,
    recordWire: 'fixed-0323',
    recordSeatCount250: payload.readUInt8(0x250),
    recordSeatChar254: readU32(0x254),
    recordSeatRole258: readU32(0x258),
    actionListCategoryEnv: process.env.LOGH_ACTION_LIST_CATEGORY ?? null,
    actionListSeatsEnv: process.env.LOGH_ACTION_LIST_SEATS ?? null,
    postloadActionListSeatsEnv: process.env.LOGH_POSTLOAD_ACTION_LIST_SEATS ?? null,
  };
}

function actionTraceFields(action, innerPayload = null, fallbackAccount = null) {
  const trace = action?.trace ?? {};
  const record = innerPayload ? recordTraceFields(innerPayload) : {};
  const account = trace.account ?? action?.account ?? fallbackAccount ?? null;
  const characterId = trace.characterId ?? record.characterId ?? null;
  const profileKey = trace.profileKey ?? profileKeyForTrace(account, characterId);
  return {
    ...trace,
    ...record,
    account,
    ...(action?.kind === 'reject' && action?.reason ? { reason: action.reason } : {}),
    ...(characterId !== null ? { characterId } : {}),
    ...(profileKey !== null ? { profileKey } : {}),
  };
}

export function buildResponseRecordTraceFields(innerPayload) {
  return recordTraceFields(innerPayload);
}

const DIAGNOSTIC_INNER_PAYLOAD_CODES = new Set([0x0f08]);

function diagnosticInnerPayloadTraceFields(innerPayload) {
  const wordsBeHex = [];
  const nonzeroWordsBe = [];
  const evenLength = innerPayload.length - (innerPayload.length % 2);
  for (let offset = 0; offset < evenLength; offset += 2) {
    const value = innerPayload.readUInt16BE(offset);
    const valueHex = `0x${value.toString(16).padStart(4, '0')}`;
    wordsBeHex.push(valueHex);
    if (value !== 0) nonzeroWordsBe.push({ offset, valueHex, value });
  }
  return {
    innerPayloadHex: innerPayload.toString('hex'),
    innerPayloadWordsBeHex: wordsBeHex,
    innerPayloadNonzeroWordsBe: nonzeroWordsBe,
  };
}

export function buildLoginMessageTraceFields({ connectionId, parsed, action, sessionAccount = null }) {
  const innerCode = appCodeForTrace(parsed.innerPayload);
  const credentialPayload = innerCode === LOGIN_INNER_CODE || innerCode === LOBBY_LOGIN_REQUEST_CODE;
  const diagnosticPayload = !credentialPayload && DIAGNOSTIC_INNER_PAYLOAD_CODES.has(innerCode);
  return {
    event: 'login-message',
    connectionId,
    innerCodeHex: `0x${innerCode.toString(16).padStart(4, '0')}`,
    innerPayloadLength: parsed.innerPayload.length,
    ...(credentialPayload ? { credentialPayloadRedacted: true } : {}),
    ...(diagnosticPayload ? diagnosticInnerPayloadTraceFields(parsed.innerPayload) : {}),
    id: parsed.id,
    actionKind: action.kind,
    ...actionTraceFields(action, null, sessionAccount),
  };
}

export function resolveLobbyAnnouncementText({ announcementText = undefined, env = process.env } = {}) {
  if (announcementText !== undefined) {
    return announcementText;
  }
  if (env.LOGH_LOBBY_ANNOUNCE_CP949_HEX !== undefined) {
    return decodeCp949NoticeHex(env.LOGH_LOBBY_ANNOUNCE_CP949_HEX, 'LOGH_LOBBY_ANNOUNCE_CP949_HEX');
  }
  if (env.LOGH_SESSION_ANNOUNCE_CP949_HEX !== undefined) {
    return decodeCp949NoticeHex(env.LOGH_SESSION_ANNOUNCE_CP949_HEX, 'LOGH_SESSION_ANNOUNCE_CP949_HEX');
  }
  return env.LOGH_LOBBY_ANNOUNCE_TEXT ?? env.LOGH_SESSION_ANNOUNCE_TEXT ?? null;
}

function decodeCp949NoticeHex(hex, label = 'cp949Hex') {
  if (typeof hex !== 'string' || !/^(?:[0-9a-fA-F]{2})*$/.test(hex)) {
    throw new Error(`${label} must be an even-length hex string`);
  }
  return Buffer.from(hex, 'hex');
}

function hasOnlyLatin1Codepoints(text) {
  return [...text].every((char) => char.codePointAt(0) <= 0xff);
}

function normalizeNoticeValue(value, label = 'notice') {
  if (value === null || value === undefined || value === '') return null;
  if (Buffer.isBuffer(value)) return Buffer.from(value);
  if (typeof value !== 'string') {
    throw new Error(`${label} must be a string, cp949Hex, or null`);
  }
  if (!hasOnlyLatin1Codepoints(value)) {
    throw new Error(`${label} contains non-Latin-1 text; encode Korean notices as CP949 bytes via cp949Hex`);
  }
  return value;
}

export function createServerNoticeState(initialValue = null) {
  let current = normalizeNoticeValue(initialValue, 'initial notice');
  return {
    get: () => current,
    set(value) {
      current = normalizeNoticeValue(value);
      return this.snapshot();
    },
    clear() {
      current = null;
      return this.snapshot();
    },
    snapshot() {
      return {
        configured: current !== null,
        wireEncoding: Buffer.isBuffer(current) ? 'cp949' : current === null ? null : 'latin1',
        text: typeof current === 'string' ? current : null,
        cp949Hex: Buffer.isBuffer(current) ? current.toString('hex') : null,
        byteLength: Buffer.isBuffer(current)
          ? current.length
          : current === null
            ? 0
            : Buffer.byteLength(current, 'latin1'),
      };
    },
  };
}

class AdminRequestError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function resolveLobbySessions({ sessions = undefined, lobby = undefined } = {}) {
  if (sessions !== undefined) return sessions;
  if (lobby?.sessions !== undefined) return lobby.sessions;
  return DEFAULT_SESSIONS;
}

function isLoopbackRemoteAddress(address) {
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';
}

/**
 * 루프백 계정 바인딩 키(C4). 기본은 remoteAddress(IP)만 — 검증된 단일클라 redirect→world 핸드오프를 그대로
 * 보존한다(같은 IP의 후속 연결이 같은 계정을 픽업). isolate=true(멀티플레이 4클라, LOGH_MP_VISIBILITY)면
 * (IP,port)로 키를 격리해 같은 머신(127.0.0.1) 동시 4클라가 서로의 계정 바인딩을 덮지 않게 한다. 순수 함수.
 */
export function loopbackBindingKey({ remoteAddress = '', remotePort = 0 } = {}, isolate = false) {
  return isolate ? `${remoteAddress}:${remotePort}` : `${remoteAddress}`;
}

/**
 * 멀티플레이 진영 일원화(C3): 플레이어의 클라 power 바이트(1=제국·2=동맹, login-session worldPlayerInfo)를
 * 콘텐츠팩 nation으로 매핑한다. 기본팩은 nation id가 클라 power 코드(0x500=제국·0x501=동맹) 그대로라
 * id로 직접 매칭하고, 없으면 nation 이름으로 진영을 추정한다(Empire/帝國 -> power1, Alliance/同盟 -> power2).
 * 매핑 불가면 null(호출부가 round-robin으로 폴백). 순수 함수 — 테스트 가능.
 */
export function nationForPowerByte(nations, powerByte) {
  const power = Number(powerByte) || 0;
  if (!Array.isArray(nations) || power <= 0) return null;
  // 1) id가 클라 power 코드(0x500/0x501)면 직접 매칭.
  const wantId = power === 1 ? 0x500 : power === 2 ? 0x501 : null;
  if (wantId != null) {
    const byId = nations.find((n) => Number(n?.id) === wantId);
    if (byId) return byId;
  }
  // 2) 이름으로 진영 추정(커스텀 팩 대비). 첫 글자 매칭이 아니라 키워드 포함.
  const isEmpire = (name) => /empire|帝国|帝國|제국|reich/i.test(String(name ?? ''));
  const isAlliance = (name) => /alliance|同盟|동맹|planets/i.test(String(name ?? ''));
  if (power === 1) return nations.find((n) => isEmpire(n?.name)) ?? null;
  if (power === 2) return nations.find((n) => isAlliance(n?.name)) ?? null;
  return null;
}

/**
 * 커맨드 엔진의 단일 notify를 어디로 보낼지 결정한다(순수). dispatchNotifies가 이 결정에 따라 실제
 * worldRelay 호출을 한다 — 라우팅 규칙을 테스트 가능하게 분리한 것.
 *  - targetConnectionId 지정(귓속말/개인메일/메신저 IM/명령메일 등 1:1 비공개): 그 연결로만 unicast.
 *    (이전엔 이 필드를 무시해 같은 월드 전원에게 새던 P0 프라이버시 버그를 닫음.)
 *  - target 'self': 발신자에게만(account/info 응답).
 *  - 그 외('others'/'all'): 발신자 제외 브로드캐스트, 'all'이면 발신자에게도.
 * @param {{target?:string, targetConnectionId?:number|null}} notify
 * @param {number} actorConnectionId 발신자 연결
 * @returns {{kind:'unicast', to:number} | {kind:'broadcast', alsoSelf:boolean}}
 */
export function planNotifyDispatch(notify = {}, actorConnectionId) {
  const { target, targetConnectionId } = notify;
  if (targetConnectionId != null) return { kind: 'unicast', to: targetConnectionId };
  if (target === 'self') return { kind: 'unicast', to: actorConnectionId };
  return { kind: 'broadcast', alsoSelf: target === 'all' };
}

function tail(values, max) {
  if (!Array.isArray(values) || values.length <= max) return values;
  return values.slice(values.length - max);
}

function countBy(values, field) {
  const out = {};
  for (const value of values) {
    const key = String(value?.[field] ?? 'unknown');
    out[key] = (out[key] ?? 0) + 1;
  }
  return out;
}

function buildAdminSessionSnapshot({
  host,
  port,
  admin,
  startedAtMs,
  nextConnectionId,
  relayEnabled,
  authoritativeEnabled,
  npcAiEnabled,
  stratSimEnabled,
  economyEnabled,
  repository,
  config,
  lobbyCharacters,
  lobbySessions,
  noticeState,
  bootScenario,
  worldState,
  economyState,
}) {
  const nowMs = Date.now();
  const notice = noticeState.snapshot();
  const players = worldState.listPlayers();
  const ships = worldState.listShips();
  const livingShips = worldState.listLivingShips();
  const troops = worldState.listTroops();
  const systems = worldState.listSystems();
  const fleets = worldState.listFleets();
  const characters = worldState.listCharacters();
  const chat = worldState.listChat();
  const battleLog = worldState.battleLog();
  const economySnapshot = economyEnabled ? economyState.toSnapshot() : null;

  return {
    ok: true,
    generatedAt: new Date(nowMs).toISOString(),
    server: {
      host,
      port,
      uptimeMs: nowMs - startedAtMs,
      adminHost: admin?.host ?? null,
      adminPort: admin?.port ?? null,
    },
    flags: {
      relay: relayEnabled,
      authoritative: authoritativeEnabled,
      npcAi: npcAiEnabled,
      strategicSim: stratSimEnabled,
      economy: economyEnabled,
      contentDb: config.content.useDb,
      koNames: config.content.koNames,
      stratGalaxy: config.strategic.galaxy,
      stratGrid: config.strategic.grid,
      stratTerrain: config.strategic.terrain,
      stratFleet: config.strategic.fleet,
    },
    persistence: {
      enabled: repository !== null,
      backend: repository?.backend ?? null,
      path: repository?.path ?? null,
    },
    lobby: {
      characters: lobbyCharacters.length,
      sessions: lobbySessions.length,
      announcementConfigured: notice.configured,
      announcement: notice,
    },
    scenario: {
      bootScenarioName: bootScenario?.name ?? null,
      ...worldState.getScenarioInfo(),
    },
    counts: {
      connectionsSeen: Math.max(0, nextConnectionId - 1),
      players: players.length,
      ships: ships.length,
      livingShips: livingShips.length,
      troops: troops.length,
      systems: systems.length,
      fleets: fleets.length,
      characters: characters.length,
      chatMessages: chat.length,
      battleEvents: battleLog.length,
      economyPlanets: economySnapshot?.planets?.length ?? 0,
      economyNations: economySnapshot?.nations?.length ?? 0,
    },
    world: {
      players,
      factions: Object.values(worldState.factionSummary()),
      shipsByFaction: countBy(ships, 'faction'),
      fleets: tail(fleets, 40),
      systems: tail(systems, 40),
      battle: {
        active: worldState.isBattleActive(),
        recentEvents: tail(battleLog, 40),
      },
      recentChat: tail(chat, 40),
    },
    economy: economyEnabled
      ? {
        enabled: true,
        lastTickDay: economyState.lastTickDay(),
        nations: economySnapshot.nations ?? [],
        planetSample: tail(economySnapshot.planets ?? [], 40),
      }
      : { enabled: false },
  };
}

function writeJson(response, status, body, headers = {}) {
  const json = JSON.stringify(body, null, 2);
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    ...headers,
  });
  response.end(`${json}\n`);
}

function corsHeaders(admin, request) {
  const origin = request.headers.origin;
  if (typeof origin !== 'string') return {};
  if (!admin.allowOrigins.has(origin)) return null;
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'access-control-allow-headers': 'authorization, content-type',
    'vary': 'Origin',
  };
}

function tokenMatches(expected, actual) {
  if (typeof actual !== 'string') return false;
  const expectedBytes = Buffer.from(expected, 'utf8');
  const actualBytes = Buffer.from(actual, 'utf8');
  if (expectedBytes.length !== actualBytes.length) return false;
  return timingSafeEqual(expectedBytes, actualBytes);
}

function requestAdminToken(request) {
  const auth = request.headers.authorization;
  if (typeof auth === 'string' && auth.startsWith('Bearer ')) {
    return auth.slice('Bearer '.length);
  }
  const headerToken = request.headers['x-logh7-admin-token'];
  return typeof headerToken === 'string' ? headerToken : null;
}

function requireAdminAuth(admin, request) {
  if (admin.unsafeAllowUnauthenticated) return true;
  return tokenMatches(admin.token, requestAdminToken(request));
}

function resolveAdminOptions(admin) {
  if (admin === null || admin === undefined || admin === false) return null;
  const host = admin.host ?? '127.0.0.1';
  const port = Number(admin.port);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`invalid admin port: ${admin.port}`);
  }
  const unsafeAllowUnauthenticated = admin.unsafeAllowUnauthenticated === true;
  const token = admin.token ?? null;
  if (!unsafeAllowUnauthenticated && (typeof token !== 'string' || token.length < 12)) {
    throw new Error('admin token is required and must be at least 12 characters');
  }
  const allowOrigins = new Set(admin.allowOrigins ?? ['http://127.0.0.1:4173', 'http://localhost:4173']);
  return { host, port, token, allowOrigins, unsafeAllowUnauthenticated };
}

const ADMIN_JSON_BODY_LIMIT = 4096;

async function readAdminJson(request) {
  const chunks = [];
  let total = 0;
  for await (const chunk of request) {
    total += chunk.length;
    if (total > ADMIN_JSON_BODY_LIMIT) {
      throw new AdminRequestError(413, 'request body too large');
    }
    chunks.push(chunk);
  }
  if (total === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new AdminRequestError(400, 'request body must be valid JSON');
  }
}

function noticeValueFromAdminBody(body) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw new AdminRequestError(400, 'notice body must be a JSON object');
  }
  const hasText = Object.hasOwn(body, 'text');
  const hasHex = Object.hasOwn(body, 'cp949Hex');
  if (hasText && hasHex) {
    throw new AdminRequestError(400, 'provide either text or cp949Hex, not both');
  }
  if (!hasText && !hasHex) {
    throw new AdminRequestError(400, 'notice body must include text or cp949Hex');
  }
  try {
    if (hasHex) {
      if (body.cp949Hex === null || body.cp949Hex === '') return null;
      return decodeCp949NoticeHex(body.cp949Hex, 'cp949Hex');
    }
    return normalizeNoticeValue(body.text, 'text');
  } catch (error) {
    throw new AdminRequestError(400, error instanceof Error ? error.message : String(error));
  }
}

async function handleAdminHttpRequest({ admin, snapshot, noticeState, request, response }) {
  const cors = corsHeaders(admin, request);
  if (cors === null) {
    writeJson(response, 403, { ok: false, error: 'origin not allowed' });
    return;
  }
  if (request.method === 'OPTIONS') {
    response.writeHead(204, cors);
    response.end();
    return;
  }

  const url = new URL(request.url ?? '/', `http://${admin.host}:${admin.port}`);
  if (url.pathname === '/health') {
    if (request.method !== 'GET') {
      writeJson(response, 405, { ok: false, error: 'method not allowed' }, cors);
      return;
    }
    writeJson(response, 200, {
      ok: true,
      service: 'logh7-admin',
      sessionRoute: '/admin/session-state',
      noticeRoute: '/admin/notice',
    }, cors);
    return;
  }
  if (url.pathname === '/admin/session-state' || url.pathname === '/api/admin/session-state') {
    if (request.method !== 'GET') {
      writeJson(response, 405, { ok: false, error: 'method not allowed' }, cors);
      return;
    }
    if (!requireAdminAuth(admin, request)) {
      writeJson(response, 401, { ok: false, error: 'admin token required' }, cors);
      return;
    }
    writeJson(response, 200, snapshot(), cors);
    return;
  }
  if (url.pathname === '/admin/notice' || url.pathname === '/api/admin/notice') {
    if (!requireAdminAuth(admin, request)) {
      writeJson(response, 401, { ok: false, error: 'admin token required' }, cors);
      return;
    }
    if (request.method === 'GET') {
      writeJson(response, 200, { ok: true, notice: noticeState.snapshot() }, cors);
      return;
    }
    if (request.method === 'POST' || request.method === 'PUT') {
      const body = await readAdminJson(request);
      const value = noticeValueFromAdminBody(body);
      writeJson(response, 200, { ok: true, notice: noticeState.set(value) }, cors);
      return;
    }
    if (request.method === 'DELETE') {
      writeJson(response, 200, { ok: true, notice: noticeState.clear() }, cors);
      return;
    }
    writeJson(response, 405, { ok: false, error: 'method not allowed' }, cors);
    return;
  }
  writeJson(response, 404, { ok: false, error: 'not found' }, cors);
}

async function startAdminHttpServer({ admin, snapshot, noticeState }) {
  const httpServer = createHttpServer((request, response) => {
    handleAdminHttpRequest({ admin, snapshot, noticeState, request, response }).catch((error) => {
      const cors = corsHeaders(admin, request) ?? {};
      if (error instanceof AdminRequestError) {
        writeJson(response, error.status, { ok: false, error: error.message }, cors);
        return;
      }
      writeJson(response, 500, {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      }, cors);
    });
  });

  await new Promise((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(admin.port, admin.host, resolve);
  });
  const address = httpServer.address();
  const boundPort = typeof address === 'object' && address !== null ? address.port : admin.port;
  const resolved = { host: admin.host, port: boundPort };
  return {
    ...resolved,
    url: `http://${resolved.host}:${resolved.port}/admin/session-state`,
    close: () => new Promise((resolve, reject) => {
      httpServer.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    }),
  };
}

/**
 * Start the authoritative login server.
 * @param {{
 *   host: string, port: number, clientExe: string,
 *   transportKey: Buffer, decipherKey: Buffer,
 *   lobby: { ip?: string, port?: number, token?: number|null },
 *   world?: { ip?: string, port?: number, token?: number|null },
 *   characters?: Array<{ id?: number, characterId?: number }>,
 *   sessions?: Array<object>,
 *   worldBySession?: Record<string, { ip?: string, port?: number, token?: number|null }>,
 *   accountStore?: ReturnType<typeof createAccountStore>,
 *   announcementText?: string|Buffer|null,
 *   admin?: { host?: string, port: number }|null,
 *   tracePath?: string,
 * }} options
 */
export async function startLogh7AuthServer({
  host,
  port,
  clientExe,
  tables: tablesOption = null,
  transportKey,
  decipherKey,
  lobby,
  world,
  characters,
  sessions,
  worldBySession,
  accountStore = createAccountStore(),
  announcementText = undefined,
  admin = null,
  tracePath,
  repository = null,
  persistIntervalMs = 30000,
  // A1c: 구조화 config(기본 loadConfig(process.env)). 산재한 process.env.LOGH_* 직접 읽기를 점진 이행 중.
  // 테스트/도구는 명시 config를 주입해 env 없이 동작 결정 가능(DIP). 미지정 시 현 env 동작과 동일.
  config = loadConfig(process.env),
}) {
  // child-codec 테이블 해결: 직접 주어진 tables > clientExe 추출 > 커밋된 JSON. 서버는 클라 EXE 없이도 부팅.
  const tables = resolveChildCodecTables({ tables: tablesOption, clientExe });
  const traceStream = tracePath === undefined ? null : createWriteStream(path.resolve(tracePath), { flags: 'a' });
  const resolvedAnnouncementText = resolveLobbyAnnouncementText({ announcementText });
  const noticeState = createServerNoticeState(resolvedAnnouncementText);
  const adminOptions = resolveAdminOptions(admin);
  const startedAtMs = Date.now();
  let nextConnectionId = 1;
  const loopbackAccountBindings = new Map();
  // G168/G169 in-world multiplayer relay: shared across connections. A connection registers when
  // it reaches the world (conn3 SS); an in-world command (CommandGridChat/MoveShip/...) is
  // rebroadcast to every other in-world connection, re-framed with that connection's own key + id.
  // Opt-in via LOGH_RELAY=1 so the proven single-client world-load flow (G164) is never perturbed.
  const relayEnabled = config.gameplay.relay;
  const worldRelay = createWorldRelay();
  // 동시 세션 가드(계정당 단일 활성 연결). 표준 온라인게임 패턴 — 같은 계정의 신규 로그인이 기존 연결을
  // takeover(기존을 축출, 기본값: 끊긴 클라가 재접속하기 좋음)하거나 reject(신규를 거부, LOGH_SESSION_POLICY=
  // reject)한다. 같은 계정 다중 동시접속은 권위적 월드상태(함대 소유·위치·전투)를 충돌시키므로 차단한다.
  // presence: 계정 라벨 → { connectionId, evict() }. close에서 현 소유자일 때만 제거(takeover 레이스 방지).
  const sessionPolicy = process.env.LOGH_SESSION_POLICY === 'reject' ? 'reject' : 'takeover';
  const presenceByAccount = new Map();
  // G-impl: authoritative in-world engine (opt-in, requires LOGH_RELAY). When on, an inbound in-world
  // command is validated + applied to shared world state and the server broadcasts the canonical
  // Notify* it decides (vs the blind relay re-broadcasting the raw frame). Shared across connections.
  const authoritativeEnabled = relayEnabled && config.gameplay.authoritative;
  // 멀티플레이 함대 가시성(2:2 제국2·동맹2, opt-in LOGH_MP_VISIBILITY). ON이면 월드진입한 플레이어 함대를
  // 공유 worldState에 등록(C1, login-session)하고, 신규 입장자↔기존 전원 함대를 0x0325로 상호 push(C2),
  // req.power를 권위 진영으로 worldState player에 일원화(C3)한다. relay가 켜져 있어야 broadcast 경로가 산다.
  // 기본 OFF로 검증된 단일클라 월드로드(1107 그린) 경로 불변 — 라이브 4클라에서만 ON.
  const mpVisibilityEnabled = relayEnabled && config.gameplay.mpVisibility;
  // 시나리오(opt-in, `LOGH_SCENARIO=경로`): 월드 시작상태를 데이터로 정의(Phase C). 부팅 전에 읽어 두면
  // (1) 게임클록 기준점을 world 생성에 반영하고 (2) 콘텐츠 시드 위에 엔티티를 레이어한다. 미설정/로드 실패면
  // null → 기존 콘텐츠팩 시드 그대로(현 동작 불변). 실패는 경고만 하고 진행(graceful).
  let bootScenario = null;
  if (config.content.scenarioPath) {
    const { scenario, errors } = loadScenarioFile(config.content.scenarioPath);
    if (scenario) {
      bootScenario = scenario;
    } else {
      console.error(`LOGH7 시나리오 로드 실패(콘텐츠 기본 시드로 진행): ${errors.join(',')}`);
    }
  }
  // 게임클록을 부팅 시각에 앵커 → 게임일이 0부터 시작(영속성 복원 시 snapshot의 clockStartMs로 덮여 연속).
  // 시나리오가 clockStartMs를 명시하면 그 값으로 앵커한다(없으면 부팅 시각).
  const clockStartMs = Number.isFinite(bootScenario?.clockStartMs) ? bootScenario.clockStartMs : Date.now();
  const worldState = createWorldState({ clockStartMs });
  // 영속성(opt-in): repository가 주어지면 부팅 시 저장된 월드 스냅샷을 로드해 복원한다(인메모리 authoritative
  // 위에 얹음). repository 미지정이면 무동작 → 테스트/휘발 부팅은 영향 없음. seed보다 먼저 복원해 콘텐츠
  // 시드가 저장된 동적 상태를 덮어쓰지 않게 한다(restore가 비우고 채움 → 이후 seed는 빈 슬롯만).
  if (repository) {
    try {
      const snapshot = repository.load();
      if (snapshot?.world) worldState.restore(snapshot.world);
    } catch (error) {
      console.error(`LOGH7 영속성 로드 실패(빈 상태로 진행): ${error instanceof Error ? error.message : error}`);
    }
  }
  // 주기적 write-behind 스냅샷 + 종료 시 1회 저장(repository 있을 때만). 인터벌은 unref하여 저장만 남았을 때
  // 프로세스 종료를 막지 않는다. 인메모리가 진실, repository는 비동기 영속성만(CQRS).
  // 더티체킹(write-behind) — 게임에 맞는 영속성: 인메모리가 진실(CQRS), 디스크는 비동기 백업. Hibernate
  // 수준의 정확성(변경을 절대 놓치지 않음)을 유지하면서 처리속도도 빠르게 하려고 **2단 게이트**로 짠다.
  //   ① revision 빠른 게이트(O(1), 월드 크기 무관): worldState/economyState의 단조 리비전을 합성키로 묶어,
  //      직전 영속화 이후 mutator 호출이 0이면(=유휴) 직렬화조차 안 하고 즉시 반환한다. Hibernate가 "더티
  //      엔티티가 없으면 flush 시 SQL을 한 줄도 안 내는" 것과 동형 — 유휴 서버의 30초마다 헛 직렬화+fsync 제거.
  //      정확성 근거: reader는 정의상 영속 상태를 안 바꾸고(화이트리스트), 그 외 모든 메서드는 팩토리에서
  //      자동 래핑돼 revision을 올리므로 "revision 불변 ⟺ 변이 없음"이 성립. 새 mutator도 자동 추적 = 무손실.
  //   ② 지문 게이트(O(N), revision이 올랐을 때만): 그래도 직렬화해 직전 저장 내용과 대조하고, 내용이 같으면
  //      디스크 fsync를 생략한다(no-op mutator·evaluateEnding 재호출 등 "변이 신호는 있으나 실내용 동일" 보강).
  //      지문은 영속화될 내용 그 자체(toSnapshot)에서 뽑으므로 추적 누락이 원천 불가능 = 데이터 손실 없음.
  //      savedAt은 매번 달라지므로 0으로 정규화해 비교에서 제외(저장본엔 실제 savedAt 기록).
  // 합성키는 정수 덧셈이 아니라 `world:economy` 문자열 — 두 카운터가 겹쳐 같은 합이 되는 충돌을 피한다.
  let lastPersistedFingerprint = null;
  let lastPersistedRevision = null;
  // economyState/economyEnabled는 아래에서 선언되지만 saveSnapshot/currentRevision은 인터벌·종료 시(선언 후)에만
  // 호출되므로 forward 참조가 안전하다.
  const currentRevision = () => `${worldState.revision()}:${economyEnabled ? economyState.revision() : 0}`;
  const saveSnapshot = () => {
    if (!repository) return;
    // ① revision 빠른 게이트 — 합성키가 직전 저장과 같으면 변이 0 → 직렬화 없이 상수시간 반환.
    const rev = currentRevision();
    if (rev === lastPersistedRevision) return;
    try {
      const entities = economyEnabled ? { economy: economyState.toSnapshot() } : null;
      const snapshot = composeSnapshot({ world: worldState.toSnapshot(), entities, savedAt: Date.now() });
      // ② 지문 게이트 — revision은 올랐어도 실제 내용이 같으면 디스크쓰기 생략(무손실 보강).
      const fingerprint = JSON.stringify({ ...snapshot, savedAt: 0 });
      if (fingerprint !== lastPersistedFingerprint) {
        repository.save(snapshot); // 국고/세수/lastTickDay가 재시작 시 소실·이중적립되던 버그를 닫음.
        lastPersistedFingerprint = fingerprint;
      }
      // 내용 동일이라 디스크를 건너뛰어도 revision은 동기화 → 다음 유휴 틱이 ①에서 바로 끊긴다.
      lastPersistedRevision = rev;
    } catch (error) {
      // save 실패 시 lastPersistedRevision 미갱신 → 다음 틱이 재시도(rev 여전히 불일치).
      console.error(`LOGH7 영속성 저장 실패: ${error instanceof Error ? error.message : error}`);
    }
  };
  let persistHandle = null;
  if (repository && persistIntervalMs > 0) {
    persistHandle = setInterval(saveSnapshot, persistIntervalMs);
    if (typeof persistHandle.unref === 'function') persistHandle.unref();
  }
  // Server content pack used for world/unit seeding. Default CANON_CONTENT is a P3 reconstructed
  // gameplay seed, not recovered original server state. LOGH_CONTENT_DB=1 opts into the current
  // extracted/manual-backed DB, whose individual fields still need provenance checks before being
  // treated as original data.
  let contentPack;
  const modsDir = config.content.modsDir;
  if (config.content.useDb) {
    const source = openContentSource({});
    contentPack = createContentPack(applyModsIfEnabled(buildContentPackDataFromSource(source), modsDir));
    source.close();
  } else {
    contentPack = createContentPack(applyModsIfEnabled(CANON_CONTENT, modsDir));
  }
  const lobbyCharacters = resolveLobbyCharacters({ characters, lobby, contentPack });
  const lobbySessions = resolveLobbySessions({ sessions, lobby });
  // Seed authoritative ship state from the content pack so ownership checks have ground truth. Each
  // ship starts neutral (owner 0); a player claims their nation's ships when they enter the world.
  if (authoritativeEnabled) {
    for (const u of contentPack.units) {
      // faction/shipClass (when the content provides them) make the ship combat-capable: fire commands
      // target the OPPOSING faction and damage scales by class (logh7-combat-engine). Absent fields
      // fall back to neutral faction 0 / cruiser stats, so existing content keeps working.
      worldState.upsertShip({
        id: u.id, owner: 0, x: u.x, y: u.y, z: u.z, heading: u.heading,
        faction: u.faction ?? u.nation ?? u.powerId ?? 0,
        shipClass: u.shipClass ?? u.class ?? 'cruiser',
      });
    }
    // seed the strategic map (recovered galaxy: systems start owned by their canon faction)
    worldState.seedSystems(contentPack.systems ?? []);
    // 시나리오 시드(opt-in): 콘텐츠팩 위에 시나리오가 정의한 시작 배치를 레이어한다. upsert는 id 기준
    // 멱등이라 같은 id면 덮어쓰고 새 id면 추가 → 시나리오가 시작상태의 단일 진실. 미설정이면 무동작.
    if (bootScenario) {
      const { counts } = loadScenarioInto(worldState, bootScenario);
      writeTrace(traceStream, { event: 'scenario-seed', name: bootScenario.name, ...counts });
    }
    // Opt-in (LOGH_NPC_SEED=1): seed two opposing NPC fleets into the tactical grid so the NPC AI loop
    // produces a live AI-vs-AI battle (NotifyAttackedShip 0x0426 broadcasts to in-world clients). Each
    // ship is owner:0 (server/NPC-held) with a nonzero faction so runNpcTick acts on it. Two clusters
    // ~40 units apart in tactical x/z sit well within the default fireRangeSq (~153²≈23512), so both
    // sides open fire on the first tick. SEED_BASE keeps these ids clear of player grid-slot ids.
    if (process.env.LOGH_NPC_SEED === '1') {
      const SEED_BASE = 0x0a000000;
      const groups = [
        { faction: 1, x: -20, name: 'Imperial' },
        { faction: 2, x: 20, name: 'Alliance' },
      ];
      let globalIndex = 0;
      for (const group of groups) {
        for (let i = 0; i < 4; i += 1) {
          worldState.upsertShip({
            id: SEED_BASE + globalIndex,
            owner: 0,
            faction: group.faction,
            shipClass: 'battleship',
            x: group.x,
            z: i * 8,
          });
          globalIndex += 1;
        }
      }
    }
  }

  // NPC AI (G-impl): drive the canon characters the player does NOT control. Opt-in via LOGH_NPC_AI=1
  // (requires LOGH_AUTHORITATIVE world state). Each tick every NPC-held ship (owner 0, faction != 0)
  // acts per its commander profile and the server broadcasts the resulting Notify* to all in-world
  // players — so a lone player gets a live opponent (de-facto solo play) and battles have both sides act.
  const npcAiEnabled = authoritativeEnabled && process.env.LOGH_NPC_AI === '1';
  const npcTickMs = Math.max(50, Number(process.env.LOGH_NPC_AI_INTERVAL_MS ?? '500'));
  const defaultNpcProfile = behaviorProfile({});
  // One NPC tick: only meaningful with in-world players to receive the broadcasts. Notifies target
  // 'all' (no actor connection) -> deliver to every registered connection (broadcast sentinel -1).
  const runNpcTickOnce = () => {
    if (!npcAiEnabled || worldRelay.size() === 0) {
      return { notifies: [], actions: [] };
    }
    const result = runNpcTick(worldState, { defaultProfile: defaultNpcProfile });
    for (const { inner } of result.notifies) {
      worldRelay.broadcast(-1, inner);
    }
    if (result.actions.length > 0) {
      writeTrace(traceStream, { event: 'npc-tick', actions: result.actions.length, notifies: result.notifies.length });
    }
    return result;
  };
  let npcTickHandle = null;
  if (npcAiEnabled) {
    npcTickHandle = setInterval(runNpcTickOnce, npcTickMs);
    npcTickHandle.unref?.(); // the AI loop alone must not keep the event loop (and tests) alive
  }

  // 내정·경제 (Phase B §B1): contentPack 성계로 행성 경제 시드, 게임클록 day로 tickIfDue → 30게임일 경계마다
  // 세금→국고 적립. opt-in LOGH_ECONOMY=1(원작 経済 未実装·계수 P3 → 기본 off). 서버 내부 상태만(패널 노출은 별도).
  // (전략틱보다 먼저 생성 — runStrategicTickOnce가 정복 시 economyState.setPlanetOwner로 행성 소유를 동기화함.)
  const economyEnabled = config.gameplay.economy;
  const economyState = createEconomyState();
  if (economyEnabled) {
    // 영속 복원: 저장된 economy 스냅샷이 있으면 시드 전에 복원(시드가 복원값을 덮지 않게).
    let economyRestored = false;
    if (repository) {
      try {
        const snap = repository.load();
        if (snap?.entities?.economy) { economyState.restore(snap.entities.economy); economyRestored = true; }
      } catch { /* 복원 실패는 무시(시드로 진행) */ }
    }
    if (!economyRestored) {
      seedEconomyFromSystems(economyState, contentPack.systems ?? []);
    }
    writeTrace(traceStream, { event: 'economy-seed', planets: economyState.listPlanets().length, restored: economyRestored });
  }

  // Strategic galaxy AI sim (logh7-strategic-sim): the MACRO layer — NPC fleet commanders advance across
  // the galaxy and conquer systems each tick. Opt-in via LOGH_STRAT_SIM=1 (requires LOGH_AUTHORITATIVE).
  // worldRelay-INDEPENDENT: the simulation advances even with zero connected players (the war runs without
  // anyone watching); a broadcast (0x0325 unit table re-push) only happens when someone is in-world.
  const stratSimEnabled = authoritativeEnabled && process.env.LOGH_STRAT_SIM === '1';
  const stratTickMs = Math.max(1000, Number(process.env.LOGH_STRAT_SIM_INTERVAL_MS ?? '5000'));
  const stratSeed = Number(process.env.LOGH_STRAT_SIM_SEED ?? '1') >>> 0;
  // 叛乱忠誠度 누적(coup_conduct 생산자) — opt-in LOGH_COUP_SIM=1(기본 OFF, 라이브 불변). 켜지면 전략틱에서
  // 성계를 잃은(정복당한) 진영 사령관의 叛乱忠誠度를 누적한다(패전→불만 모델). delta·트리거는 P3 SERVER DESIGN.
  const coupSimEnabled = stratSimEnabled && process.env.LOGH_COUP_SIM === '1';
  // SERVER DESIGN(P3): 성계 1개 상실당 사령관 叛乱忠誠度 가산폭(누적은 intelState가 0..MAX 클램프).
  const coupLoyaltyPerLoss = Math.max(0, Number(process.env.LOGH_COUP_LOSS_DELTA ?? '15'));
  let strat = null;
  let stratTickNo = 0;
  let stratHandle = null;
  if (stratSimEnabled) {
    // graph from listSystems() AFTER seedSystems, so node faction = canon owner.
    const stratGraph = buildStrategicGraph(worldState.listSystems());
    strat = createStrategicSim(worldState, stratGraph, { seed: stratSeed });
    writeTrace(traceStream, { event: 'strat-seed', fleets: strat.snapshot().fleets.length });
  }
  const runStrategicTickOnce = () => {
    if (!stratSimEnabled || strat === null) {
      return null;
    }
    stratTickNo += 1;
    const result = strat.tick(stratTickNo); // authoritative world-state mutation (moveFleet/conquerSystem)
    // 정복 시 경제 행성 소유를 새 진영으로 동기화 — 세수가 상실 진영이 아닌 점령 진영 국고로 가게 한다
    // (이전엔 economyState가 부팅 시드 후 재동기 안 돼 적국에 세금이 계속 적립되던 버그). economyState는
    // 전략틱보다 먼저 생성됨(위 블록).
    if (economyEnabled && result.economy && result.economy.length) {
      for (const { system, owner } of result.economy) {
        economyState.setSystemOwner(system, owner);
      }
    }
    // broadcast only when players are present: re-push the full 0x0325 unit table so in-world clients
    // see the moved/destroyed fleets. No connected players → simulate silently (no emit).
    if (worldRelay.size() > 0 && (result.moves.length || result.conquests.length)) {
      const unitInner = buildInformationUnitRecordInner({
        wireLayout: 'parser-stream',
        fleets: worldState.listFleets(),
      });
      worldRelay.broadcast(-1, unitInner);
    }
    if (result.moves.length || result.conquests.length || result.battles.length) {
      writeTrace(traceStream, {
        event: 'strat-tick', tick: stratTickNo,
        moves: result.moves.length, conquests: result.conquests.length, battles: result.battles.length,
      });
    }
    // 叛乱忠誠度 누적(coup_conduct 생산자, opt-in): 이번 틱에 성계를 잃은(정복당한) 진영의 사령관들에게
    // 패전 불만으로 叛乱忠誠度를 가산한다. delta·트리거 모두 P3 SERVER DESIGN(매뉴얼 미수록). intelState는
    // world의 공유 인스턴스(getIntelState) — 누적/클램프는 순수 모듈(addCoupLoyalty)에 위임(배선만 추가).
    if (coupSimEnabled && coupLoyaltyPerLoss > 0 && result.conquests && result.conquests.length) {
      const intelState = worldState.getIntelState();
      // 상실 진영(from) → 손실 성계 수 집계. from은 문자열 진영명('empire'/'alliance' 등).
      const lossesByFaction = new Map();
      for (const c of result.conquests) {
        const loser = c.from;
        if (loser == null || loser === 'neutral' || loser === c.to) continue;
        lossesByFaction.set(loser, (lossesByFaction.get(loser) ?? 0) + 1);
      }
      // 상실 진영의 사령관(전략 함대 commander charId)마다 손실분만큼 누적. 같은 진영 사령관 전원이
      // 패전 불만을 공유(전략적 사기 저하 모델) — P3 SERVER DESIGN.
      if (lossesByFaction.size > 0) {
        for (const fleet of strat.simState.fleetsById.values()) {
          const losses = lossesByFaction.get(fleet.faction);
          if (!losses || !fleet.commander) continue;
          intelState.addCoupLoyalty(fleet.commander, coupLoyaltyPerLoss * losses);
        }
      }
    }
    // 정복으로 성계 소유가 바뀌면 캐논 §1.6 종료(≤3성계 또는 전멸)를 평가한다 — economy 클록과 독립적으로
    // 게임을 결정짓는 시점(정복)에 종료를 감지. over면 전략 스케줄러를 멈춰 무유저 갤럭시가 무한 진행하지
    // 않게 한다(stratHandle은 인터벌로 이 함수를 부르므로 forward 참조 안전).
    if (result.conquests && result.conquests.length) {
      const ending = worldState.evaluateEnding({ minSystems: 3 });
      if (ending.over) {
        writeTrace(traceStream, { event: 'strat-ending', winner: ending.winner, tick: stratTickNo });
        if (stratHandle) { clearInterval(stratHandle); stratHandle = null; }
      }
    }
    return result;
  };
  if (stratSimEnabled) {
    stratHandle = setInterval(runStrategicTickOnce, stratTickMs);
    stratHandle.unref?.(); // the sim loop alone must not keep the event loop (and tests) alive
  }

  // 한 번의 경제 틱: 게임클록 day가 새 30일 주기로 넘어갔을 때만 실제 적립(tickIfDue가 중복 방지). 결과/ null.
  // 주기 경계가 실제로 넘어가면(result 비-null) 권위적 턴(A7 advanceTurn)을 1 진행하고 완전승리 종료를
  // 평가한다(S5 시간틱). 둘 다 서버 내부 상태(턴 카운터·ending 마커) — 클라 와이어 신설 없음(트레이스만).
  const runEconomyTickOnce = () => {
    if (!economyEnabled) return null;
    const gameDay = worldState.gameDayOf(Date.now());
    const result = economyState.tickIfDue({ gameDay });
    if (result) {
      worldState.advanceTurn(1);
      const ending = worldState.evaluateEnding();
      if (ending.over) {
        writeTrace(traceStream, { event: 'decisive-victory', winner: ending.winner, turn: worldState.getScenarioInfo().currentTurn });
      }
    }
    // 작전계획 30일 lifecycle 정산(opt-in LOGH_OPERATION_ISSUE). 전략 도메인 상태(_strategy)가 lazily 생성된
    // 경우에만, 발령된 작전의 30 in-game days 자동종료(매뉴얼 p39 P2)를 같은 게임클록 day로 만료시킨다. 게이트
    // off거나 발령 작전이 없으면 no-op(회귀 0). 占領/防衛/掃討 결과 보너스는 라이브 sub-action 확정 후 별도(스텁).
    if (operationIssueEnabled() && worldState._strategy?.tickOperationsIfDue) {
      // outcomeFor: 占領/防衛 목적 작전의 30일 시점 점령 상태를 world-state 갤럭시에서 공급한다. plan.target은
      // 목표 성계명(문자열)으로 발령 시 주입된다고 가정 — getSystem으로 조회되면 그 성계 1곳의 소유가 발령 진영
      // (power 1=empire/2=alliance)이면 controlledByActor=1, 아니면 lostToEnemy=1(目標 1곳 모델, P2). 조회
      // 안 되면(미상 target) {} 반환 → 보너스 0(정보부재 보수적). 掃討는 outcomeFor 불요(누적 sweepKills로 정산).
      const factionOf = (power) => (power === 1 ? 'empire' : power === 2 ? 'alliance' : 'neutral');
      const outcomeFor = (power, plan) => {
        if (plan?.purpose !== OPERATION_PURPOSE.OCCUPATION && plan?.purpose !== OPERATION_PURPOSE.DEFENSE) {
          return {};
        }
        const sys = typeof plan?.target === 'string' ? worldState.getSystem?.(plan.target) : null;
        if (!sys) return {}; // 목표 성계 미상 → 정보부재(보너스 0)
        const mine = sys.owner === factionOf(power);
        return mine
          ? { targetTotal: 1, controlledByActor: 1, lostToEnemy: 0 }
          : { targetTotal: 1, controlledByActor: 0, lostToEnemy: 1 };
      };
      const expired = worldState._strategy.tickOperationsIfDue({ gameDay, outcomeFor });
      if (expired.length) {
        // 결과정산 보너스를 발령 사령관(plan.commander)의 功績에 적립한다. _personnel 로스터가 있을 때만(없으면
        // 적립 no-op). draft 작전은 expired에 오르지 않으므로 구조적 제외. 적립 내역을 트레이스로 남긴다.
        const credits = creditOperationMerit(expired, worldState._strategy?._personnel ?? worldState._personnel ?? null);
        writeTrace(traceStream, { event: 'operation-expire', count: expired.length, gameDay, merits: credits.length });
      }
    }
    return result;
  };
  const economyTickMs = Math.max(1000, config.gameplay.economyIntervalMs);
  let economyHandle = null;
  if (economyEnabled) {
    economyHandle = setInterval(runEconomyTickOnce, economyTickMs);
    economyHandle.unref?.(); // 경제 루프 단독으로 이벤트 루프(테스트)를 살려두지 않음
  }

  const server = createTcpServer((socket) => {
    // Latency: the protocol is dominated by tiny (20-30B) frames and strict request/response
    // pairing, so Nagle batching only adds dead time before each reply reaches the client.
    socket.setNoDelay(true);
    const connectionId = nextConnectionId;
    nextConnectionId += 1;
    const remoteAddress = socket.remoteAddress ?? '';
    const remotePort = socket.remotePort ?? 0;
    // C4: 멀티플레이(4클라 동시)면 (IP,port)로 키 격리해 같은 머신 바인딩 충돌을 막는다. 기본은 IP-only(핸드오프 보존).
    const loopbackKey = loopbackBindingKey({ remoteAddress, remotePort }, mpVisibilityEnabled);
    const boundAccount = isLoopbackRemoteAddress(remoteAddress)
      ? loopbackAccountBindings.get(loopbackKey) ?? null
      : null;
    const session = createLoginSession({
      accountStore,
      lobby,
      world,
      worldState, // 월드진입 시 플레이어 캐릭터를 전투 레지스트리에 시드(戦死/사령관 데이터)
      characters: lobbyCharacters,
      contentPack,
      sessions: lobbySessions,
      worldBySession,
      announcementText: noticeState.get(),
      boundAccount,
      connectionId, // 멀티플레이 distinct in-world 함대 id 파생(login-session sessionWorldUnitId)
    });
    let phase1Key = null;
    // Monotonic S->C body id. The client's decipher_message sequence gate (0x645eda) accepts an
    // inbound frame only when id > [cipher+0x20] (the last-accepted inbound id), then stores it.
    // So every S->C 0x0030 reply on a connection must carry a strictly-increasing id; hardcoding
    // parsed.id breaks as soon as we send multiple replies (e.g. the lobby 0x2001/0x2004/0x2006/0x200a
    // chain). We seed/advance from the highest client id seen and consume one id per reply.
    let nextReplyId = 1;
    const takeReplyId = () => {
      const id = nextReplyId;
      nextReplyId += 1;
      return id;
    };
    // Send unsolicited follow-up frames (already-final message32 inners) after a response,
    // each as its own decipherKey-encoded 0x0030 frame with a monotonic id (G145 world push:
    // 0x0204 char id, 0x0323 character record). subheaderLen matches the triggering branch.
    const sendExtraInners = (extraInners, subheaderLen, action = null) => {
      if (!Array.isArray(extraInners)) {
        return;
      }
      for (const extraInner of extraInners) {
        const extraId = takeReplyId();
        const extraFrame = buildEncrypted0030Frame({
          tables,
          key: decipherKey,
          body: build0030Body({ id: extraId, innerPayload: extraInner }),
          subheaderLen,
        });
        socket.write(extraFrame);
        writeTrace(traceStream, {
          event: 'extra-inner-sent',
          connectionId,
          replyId: extraId,
          respInnerCodeHex: `0x${appCodeForTrace(extraInner).toString(16).padStart(4, '0')}`,
          respLen: extraInner.length,
          subheaderLen,
          frameBytes: extraFrame.length,
          ...actionTraceFields(action, extraInner, session.account),
        });
      }
    };
    // 서버-주도 전술맵 진입 probe(지연 푸시). login-session이 action.deferredBattleInners(+delayMs)로 배틀
    // 시퀀스(0x349…0x42f NotifyChangeMode…0x0f1f)를 넘기면, grid-enter 응답을 보낸 뒤 지연만큼 기다렸다가
    // 같은 소켓에 푸시한다. ★grid-enter 즉시 푸시는 전략 씬 렌더 전에 0x42f가 들어가 전략맵 렌더를 깨뜨림이
    // 라이브로 확정됨(control 대조) → 반드시 전략맵 렌더 후 지연 푸시. timer.unref로 이벤트루프/테스트 비차단.
    const scheduleDeferredBattle = (action, subheaderLen) => {
      if (!Array.isArray(action?.deferredBattleInners) || action.deferredBattleInners.length === 0) {
        return;
      }
      const delay = Math.max(0, Number(action.deferredBattleDelayMs ?? 8000));
      const timer = setTimeout(() => {
        try {
          sendExtraInners(action.deferredBattleInners, subheaderLen, action);
          writeTrace(traceStream, {
            event: 'deferred-battle-pushed',
            connectionId,
            steps: action.deferredBattleInners.length,
            delayMs: delay,
          });
        } catch (e) {
          writeTrace(traceStream, { event: 'deferred-battle-error', connectionId, error: String(e?.message ?? e) });
        }
      }, delay);
      timer.unref?.();
    };
    // G169 relay wiring: register this connection so other in-world players' commands reach it.
    // sendInner re-frames a (message32) inner as a decipherKey 0x0030 frame with this connection's
    // own monotonic id + lobby subheader, exactly like a normal conn3 server->client reply.
    let registeredInWorld = false;
    let relayTestSent = false;
    let mpFleetSynced = false; // C2 일회성: 신규 입장자↔기존 전원 함대 상호 동기화 1회만.
    const registerInWorld = () => {
      if (registeredInWorld || !relayEnabled) {
        return;
      }
      registeredInWorld = true;
      const lobbySubheaderLen = Number(process.env.LOGH_LOBBY_SUBHEADER ?? '4');
      worldRelay.register(connectionId, (inner) => {
        const frame = buildEncrypted0030Frame({
          tables,
          key: decipherKey,
          body: build0030Body({ id: takeReplyId(), innerPayload: inner }),
          subheaderLen: lobbySubheaderLen,
        });
        socket.write(frame);
        writeTrace(traceStream, {
          event: 'relay-deliver',
          connectionId,
          respInnerCodeHex: `0x${inner.readUInt16BE(4).toString(16).padStart(4, '0')}`,
          frameBytes: frame.length,
        });
      });
      if (authoritativeEnabled) {
        const nations = contentPack.nations;
        // C3 (멀티플레이 함대 가시성, 게이트 ON): 플레이어 진영을 round-robin 대신 req.power(생성 시 선택한
        // 진영, login-session worldPlayerInfo().power=1제국/2동맹)로 일원화한다 — 'placeholder for real
        // team/side select' 해소. power 바이트를 콘텐츠팩 nation으로 매핑(1->제국 0x500·2->동맹 0x501);
        // 매핑 실패(데이터 불일치)면 안전하게 round-robin로 폴백한다. 게이트 OFF면 기존 round-robin 그대로.
        let nation = null;
        if (mpVisibilityEnabled && typeof session.worldPlayerInfo === 'function') {
          nation = nationForPowerByte(nations, session.worldPlayerInfo().power);
        }
        if (!nation) {
          // round-robin over the content pack — the legacy placeholder when no authoritative side is known.
          nation = nations[worldState.playerCount() % nations.length];
        }
        worldState.addPlayer({ connectionId, charId: connectionId, powerId: nation.id });
        for (const u of contentPack.unitsForNation(nation.id)) {
          worldState.claimShip(u.id, connectionId);
        }
        // 인사(人事) 도메인 상태 시드: worldState에 등록된 플레이어 캐릭터를 personnelState 로스터에
        // 추가해 작위/봉토/진급 커맨드(0x0704..0x070e)가 검증·처리 가능하게 한다.
        seedPersonnelFromWorldState({ state: worldState });
        writeTrace(traceStream, { event: 'world-join', connectionId, powerId: nation.id, ships: contentPack.unitsForNation(nation.id).length });
      }
      writeTrace(traceStream, { event: 'relay-register', connectionId, peers: worldRelay.size() });
    };
    // C2 (멀티플레이 함대 가시성): 이 연결의 플레이어 함대가 공유 worldState에 막 등록된 시점(월드진입 0x0f02/
    // grid-enter 처리 직후)에 1회 호출. (a)이 입장자의 함대/유닛(0x0325)을 기존 전원에게 broadcast하고,
    // (b)기존 전원의 함대를 0x0325로 이 입장자에게 push한다. 둘 다 전략 sim 브로드캐스트와 동일한
    // parser-stream 와이어 레이아웃의 단일 0x0325 레코드(클라가 자기 좌표계로 렌더). 게이트 ON + relay 등록 +
    // 함대 1개 이상 등록 상태에서만 동작. unitId 키가 0x0325 월드진입 바인딩(char+0x24)과 일치해 그대로 렌더된다.
    const syncMultiplayerFleets = () => {
      if (mpFleetSynced || !mpVisibilityEnabled || !registeredInWorld) return;
      if (typeof worldState.listFleets !== 'function') return;
      const myInfo = typeof session.worldPlayerInfo === 'function' ? session.worldPlayerInfo() : null;
      const myFleetId = myInfo?.unitId ?? null;
      const allFleets = worldState.listFleets();
      const myFleet = myFleetId != null ? allFleets.find((f) => f.id === myFleetId) : null;
      if (!myFleet) return; // 아직 이 입장자의 함대가 worldState에 없음 — 다음 메시지에서 재시도(일회성 보존).
      mpFleetSynced = true;
      const lobbySubheaderLen = Number(process.env.LOGH_LOBBY_SUBHEADER ?? '4');
      // ★진영 함대색 투영(2026-06-26, logh7-faction-projection): 0x0325 함대 마커를 수신 클라가 아/적
      // 색으로 구분하려면 그 함대 사령관의 0x0323 레코드(power 바이트 @0x04)가 수신 클라 char-table에
      // 있어야 한다 — 렌더러 FUN_004ef0d0이 사령관 엔트리 +0xa/+0xb를 로컬 플레이어와 비교해 색을 가른다.
      // 사령관 엔트리가 없으면(iVar10==0) 마커 자체가 안 그려진다. 그래서 함대 push마다 그 사령관 0x0323
      // 레코드를 동반 push한다(같은 로비 subheader/단조 id 시퀀스). 0x0323 power만 투영(RE 확정), 0x34f 금지.
      const commanderRecordsFor = (fleets) =>
        projectFleetCommanderRecords(fleets, worldState).map((r) =>
          buildInformationCharacterRecordInner({ ...r, wireEndian: 'be' }),
        );
      // (a) joiner -> 기존 전원: 이 함대 1개를 담은 0x0325를 다른 모든 in-world 연결에 broadcast.
      const joinerInner = buildInformationUnitRecordInner({
        wireLayout: 'parser-stream',
        fleets: [myFleet],
      });
      const deliveredToPeers = worldRelay.broadcast(connectionId, joinerInner);
      // (a') joiner 사령관 0x0323 레코드를 기존 전원에 broadcast(수신 클라 char-table 시드 → 마커+색).
      for (const rec of commanderRecordsFor([myFleet])) {
        worldRelay.broadcast(connectionId, rec);
      }
      // (b) 기존 전원 -> joiner: 자기 함대를 제외한 나머지 함대 전부를 0x0325로 이 입장자에게 push(sendExtraInners
      //     재사용 — 로비 subheader/단조 id로 한 프레임씩). 기존 함대가 없으면(첫 입장자) push 없음.
      const existingFleets = allFleets.filter((f) => f.id !== myFleetId);
      if (existingFleets.length > 0) {
        const existingInner = buildInformationUnitRecordInner({
          wireLayout: 'parser-stream',
          fleets: existingFleets,
        });
        // (b') 기존 함대 사령관들의 0x0323 레코드를 joiner에 함께 push(0x0325보다 먼저 — 마커 그릴 때
        //      char-table에 이미 사령관 엔트리가 있게). 그 다음 0x0325 unit 테이블 push.
        sendExtraInners([...commanderRecordsFor(existingFleets), existingInner], lobbySubheaderLen);
      }
      writeTrace(traceStream, {
        event: 'mp-fleet-sync',
        connectionId,
        myFleetId,
        deliveredToPeers,
        existingFleets: existingFleets.length,
      });
    };
    // C4 (멀티플레이 진영 정합): registerInWorld는 세션 연결(ss-response) 시점에 호출되는데, 캐릭터 생성
    // (0x1008 requestCategory0=진영선택)보다 먼저라 그 순간 worldPlayerInfo().power가 아직 기본(제국) 시드
    // 캐릭터의 power다 → 동맹 클라까지 전부 제국(powerId 1280)으로 등록되는 버그(라이브 2026-06-22 확정:
    // world-join 4건 전부 1280, 0x1008은 17초 뒤). 캐릭터가 생성돼 worldPlayerInfo().power가 확정되면
    // (월드진입 0x0f02 무렵 이 입장자의 함대가 worldState에 시드되는 시점) 등록 nation을 재도출해 worldState
    // 플레이어 powerId와 함선 소유(claimShip)를 올바른 진영으로 정정한다. 멱등(불일치 시에만 동작): 제국
    // 플레이어는 제국→제국 no-op, 동맹 플레이어만 제국→동맹 1회 전환. fleet/character faction은 login-session
    // seedPlayerCharacter가 이미 생성 캐릭 power로 올바로 시드하므로 여기선 worldState 플레이어 레코드만 맞춘다.
    // 게이트 OFF(단일클라)면 호출되지 않아 기존 round-robin/단일 경로 불변.
    const reconcileWorldNation = () => {
      if (!authoritativeEnabled || !mpVisibilityEnabled || !registeredInWorld) return;
      if (typeof session.worldPlayerInfo !== 'function') return;
      const nation = nationForPowerByte(contentPack.nations, session.worldPlayerInfo().power);
      if (!nation) return; // 매핑 실패(데이터 불일치) → registerInWorld의 round-robin 배정 유지.
      const player = worldState.getPlayer(connectionId);
      if (!player || player.powerId === nation.id) return; // 이미 정합 → no-op.
      // 잘못 claim된 이전 진영 함선을 neutral로 풀고, 올바른 진영으로 재등록 + 재claim.
      worldState.releaseShipsOf(connectionId);
      worldState.addPlayer({ connectionId, charId: connectionId, powerId: nation.id });
      for (const u of contentPack.unitsForNation(nation.id)) {
        worldState.claimShip(u.id, connectionId);
      }
      writeTrace(traceStream, {
        event: 'world-nation-reconciled',
        connectionId,
        fromPowerId: player.powerId,
        toPowerId: nation.id,
        ships: contentPack.unitsForNation(nation.id).length,
      });
    };
    // Broadcast a command engine's notifies per target: 'others' = everyone but the actor, 'all' =
    // including the actor (the thin client only applies an effect when it receives the Notify).
    const dispatchNotifies = (notifies) => {
      let delivered = 0;
      for (const n of notifies) {
        const plan = planNotifyDispatch(n, connectionId);
        if (plan.kind === 'unicast') {
          delivered += worldRelay.send(plan.to, n.inner) ? 1 : 0;
          continue;
        }
        delivered += worldRelay.broadcast(connectionId, n.inner);
        if (plan.alsoSelf) {
          worldRelay.send(connectionId, n.inner);
        }
      }
      return delivered;
    };
    let pending = Buffer.alloc(0);
    writeTrace(traceStream, {
      event: 'connection',
      connectionId,
      remoteAddress,
      remotePort: socket.remotePort,
      accountBinding: boundAccount ? 'loopback-single-user' : null,
      account: boundAccount,
    });

    socket.on('data', (chunk) => {
      pending = Buffer.concat([pending, chunk]);
      const { frames, remaining } = takeTransportFrames(pending);
      pending = Buffer.from(remaining);
      for (const frame of frames) {
        const code = frame.readUInt16BE(2);
        if (code === PHASE1_CODE) {
          try {
            const reply = buildPhase3ResponseFromPhase1Request({ tables, transportKey, requestFrame: frame, decipherKey });
            phase1Key = reply.phase1Key;
            session.markHandshakeComplete();
            socket.write(reply.frame);
            writeTrace(traceStream, {
              event: 'phase3-sent',
              connectionId,
              phase1KeyRedacted: true,
              phase1KeyBytes: reply.phase1Key.length,
            });
            // Proactive lobby OK (G179 timing fix): conn2's recv pump only polls during the handshake
            // window (~5ms) and stops before the reply to 0x2000 arrives, so the late 0x2001 is never
            // read and the lobby FSM times out. Send the 0x2001 RIGHT AFTER phase3 (gated to the lobby
            // connection = connId>=2) so it lands in conn2's recv buffer while the pump is still polling,
            // exactly like conn1's keysetup+redirect arriving in one recv. The 0x2001 consumer 0x4bdb70
            // sets the success flag regardless of FSM state, so an early flag-set survives to state7.
            // Opt-in (LOGH_LOBBY_PROACTIVE_OK=1): send the 0x2001 RIGHT AFTER phase3, encoded with the
            // per-connection phase1Key the client just installed (symmetric Blowfish), so it lands in
            // conn2's recv buffer during the post-handshake polling window AND decodes. Proven via live
            // probe to pass decipher (baseline 0->1); but the lobby SCENE dispatcher still doesn't
            // consume it, so this alone does not set the success flag.
            if (process.env.LOGH_LOBBY_PROACTIVE_OK === '1' && connectionId >= 2) {
              const proactiveId = takeReplyId();
              socket.write(
                buildEncrypted0030Frame({
                  tables,
                  key: phase1Key,
                  body: build0030Body({ id: proactiveId, innerPayload: buildLobbyLoginOkInner({ status: 0 }) }),
                  subheaderLen: Number(process.env.LOGH_LOBBY_SUBHEADER ?? '4'),
                }),
              );
              writeTrace(traceStream, { event: 'lobby-proactive-ok-sent', connectionId, replyId: proactiveId });
            }
          } catch (error) {
            writeTrace(traceStream, { event: 'phase3-error', connectionId, message: error.message });
          }
          continue;
        }
        if (code === TRANSPORT_0030 && phase1Key !== null) {
          let decoded;
          try {
            decoded = childCodecDecode(childCodecKeySchedule(tables, phase1Key), frame.subarray(4));
          } catch (error) {
            writeTrace(traceStream, { event: 'decode-error', connectionId, message: error.message });
            continue;
          }
          const parsed = parse0030Body(decoded);
          if (!parsed.valid) {
            writeTrace(traceStream, { event: 'invalid-0030', connectionId, reason: parsed.reason });
            continue;
          }
          // Keep our outbound id strictly ahead of the client's ids so replies clear the gate.
          if (parsed.id + 1 > nextReplyId) {
            nextReplyId = parsed.id + 1;
          }
          const action = session.onInnerMessage(parsed.innerPayload);
          writeTrace(traceStream, buildLoginMessageTraceFields({ connectionId, parsed, action, sessionAccount: session.account }));
          // G169 in-world relay (opt-in). Register conn3 (world) connections on their SS handshake,
          // then rebroadcast any in-world command (chat/move) to the other players. The client sends
          // these inners raw ([u16 code][payload]); recipients consume conn3 frames in the message32
          // form, so re-wrap before relaying. (Live framing validation awaits two in-world clients.)
          if (relayEnabled) {
            if (action.kind === 'ss-response') {
              registerInWorld();
            }
            // C4: 캐릭터 생성 이후(worldPlayerInfo().power 확정) 등록 nation을 올바른 진영으로 정정.
            // 멱등이라 매 인-월드 메시지에서 호출해도 불일치 1회만 실제 동작(이후 no-op).
            if (mpVisibilityEnabled && registeredInWorld) {
              reconcileWorldNation();
            }
            // C2: 월드진입(0x0f02/grid-enter) 처리 직후 이 입장자의 함대가 worldState에 등록되면 1회 상호 동기화.
            // syncMultiplayerFleets는 함대 미등록 시 no-op(다음 메시지 재시도)이고 동기화 후엔 일회성 잠금된다.
            if (mpVisibilityEnabled && registeredInWorld && !mpFleetSynced) {
              syncMultiplayerFleets();
            }
            if (registeredInWorld) {
              const inboundCode = parsed.innerPayload.readUInt16BE(0);
              if (isRelayCommandCode(inboundCode)) {
                if (authoritativeEnabled) {
                  // Authoritative path: validate + apply + broadcast the canonical Notify the engine
                  // decides (vs blindly echoing the client's frame).
                  const decision = processCommand({
                    state: worldState,
                    connectionId,
                    innerCode: inboundCode,
                    inner: parsed.innerPayload,
                  });
                  const delivered = decision.accept ? dispatchNotifies(decision.notifies) : 0;
                  writeTrace(traceStream, {
                    event: 'authoritative-command',
                    connectionId,
                    innerCodeHex: `0x${inboundCode.toString(16).padStart(4, '0')}`,
                    accept: decision.accept,
                    reject: decision.reject ?? null,
                    delivered,
                    debug: decision.debug ?? null,
                  });
                } else {
                  const relayInner = wrapRawInnerAsMessage32(parsed.innerPayload);
                  const delivered = worldRelay.broadcast(connectionId, relayInner);
                  writeTrace(traceStream, {
                    event: 'relay-broadcast',
                    connectionId,
                    innerCodeHex: `0x${inboundCode.toString(16).padStart(4, '0')}`,
                    delivered,
                  });
                }
              }
              // G192 relay self-test: once 2+ players are in the world, this connection broadcasts a
              // server-built CommandGridChat (0x0f1c) to the OTHER players so it appears on their
              // screens — an end-to-end demo of the relay delivering an in-world message between
              // players, without needing the chat-UI. One-shot per connection, opt-in LOGH_RELAY_TEST=1.
              if (process.env.LOGH_RELAY_TEST === '1' && !relayTestSent && worldRelay.size() >= 2) {
                relayTestSent = true;
                const chat = buildCommandGridChatInner({ text: `RELAY OK conn${connectionId}` });
                const delivered = worldRelay.broadcast(connectionId, chat);
                writeTrace(traceStream, { event: 'relay-test-broadcast', connectionId, delivered });
              }
            }
          }
          if (action.kind === 'redirect') {
            // 동시 세션 가드: 로그인 성공(account 확정) 시점에 계정당 단일 활성 연결을 강제한다.
            // 'unknown'(라벨 없는 익명 자격증명)은 충돌 키가 모호하므로 가드 대상에서 제외한다.
            if (action.account && action.account !== 'unknown') {
              const prior = presenceByAccount.get(action.account);
              if (prior && prior.connectionId !== connectionId) {
                if (sessionPolicy === 'reject') {
                  // 거부 정책: 신규 연결을 닫고 redirect를 보내지 않는다(기존 세션 유지).
                  writeTrace(traceStream, {
                    event: 'session-duplicate-rejected',
                    connectionId,
                    account: action.account,
                    existingConnectionId: prior.connectionId,
                  });
                  try { socket.destroy(); } catch { /* 이미 닫힘 */ }
                  continue;
                }
                // takeover 정책(기본): 기존 연결을 축출하고 신규로 교체한다.
                writeTrace(traceStream, {
                  event: 'session-takeover',
                  connectionId,
                  account: action.account,
                  evictedConnectionId: prior.connectionId,
                });
                prior.evict();
              }
              presenceByAccount.set(action.account, {
                connectionId,
                evict: () => { try { socket.destroy(); } catch { /* 이미 닫힘 */ } },
              });
            }
            if (action.account && isLoopbackRemoteAddress(remoteAddress)) {
              loopbackAccountBindings.set(loopbackKey, action.account);
              writeTrace(traceStream, {
                event: 'loopback-account-bound',
                connectionId,
                remoteAddress,
                loopbackKey,
                account: action.account,
              });
            }
            const reply = buildRedirectReply({ tables, decipherKey, decodedBody: decoded, redirectInner: action.redirectInner });
            const frames = [reply.keysetupFrame, reply.redirectFrame];
            // LOGH_SEND_SERVERLIST experiment (workflow ws2xffdw9): the bare 0x7001 redirect stamps
            // the login->lobby signal *(0x76bbe4)=0xFFFFFFFF (the lobby FSM's -1 fail sentinel). The
            // 0x7002 serverlist branch (0x4ac758) instead sets it to byte[inner+2]=a valid channel
            // index. Append a 0x7002 frame (gin7-keyed like the redirect, monotonic id) AFTER the
            // redirect so the valid index wins and ids stay strictly increasing.
            let serverListSent = false;
            if (process.env.LOGH_SEND_SERVERLIST === '1') {
              const gin7Key = Buffer.from(reply.gin7KeyHex, 'hex');
              const serverListInner = buildServerListInner({ index: Number(process.env.LOGH_SERVERLIST_INDEX ?? '0') });
              frames.push(
                buildEncrypted0030Frame({
                  tables,
                  key: gin7Key,
                  body: build0030Body({ id: takeReplyId(), innerPayload: serverListInner }),
                }),
              );
              serverListSent = true;
            }
            socket.write(Buffer.concat(frames));
            writeTrace(traceStream, {
              event: 'redirect-sent',
              connectionId,
              account: action.account,
              matchedBy: action.matchedBy,
              lobby,
              gin7KeyRedacted: true,
              gin7KeyBytes: Buffer.from(reply.gin7KeyHex, 'hex').length,
              serverListSent,
            });
          } else if (action.kind === 'lobby-response') {
            // Lobby RPC reply on the same open connection (decipherKey "XY", never close).
            const replyId = takeReplyId();
            const lobbySubheaderLen = Number(process.env.LOGH_LOBBY_SUBHEADER ?? '4');
            const okFrame = buildEncrypted0030Frame({
              tables,
              key: decipherKey,
              body: build0030Body({ id: replyId, innerPayload: action.okInner }),
              subheaderLen: lobbySubheaderLen,
            });
            socket.write(okFrame);
            writeTrace(traceStream, {
              event: 'lobby-response-sent',
              connectionId,
              replyId,
              respInnerCodeHex: `0x${appCodeForTrace(action.okInner).toString(16).padStart(4, '0')}`,
              respLen: action.okInner.length,
              subheaderLen: lobbySubheaderLen,
              frameBytes: okFrame.length,
              ...actionTraceFields(action, action.okInner, session.account),
            });
            sendExtraInners(action.extraInners, lobbySubheaderLen, action);
            scheduleDeferredBattle(action, lobbySubheaderLen);
          } else if (action.kind === 'ss-response') {
            const replyId = takeReplyId();
            const ssSubheaderLen = Number(process.env.LOGH_SS_SUBHEADER ?? '4');
            // G138 (PROVEN): conn3 SS replies must use the conn2-style message32 wrap
            // [u32 0][u16 code][u8 status]; the raw [u16 code][u8 status] form left the client's
            // request/response queue (queued 0x0200 -> 0x0201) pending under BOTH subheader 0 and 4.
            // With message32, the real client set ssLoginOk/cipherReady/sessionReady/ssGameLoginOk/
            // cipherGate=1 and advanced 0x0200->0x0201->0x0205->0x0206->0x0304 (world "NOW LOADING").
            // message32 is therefore the default; LOGH_SS_FORMAT=raw keeps the old form for A/B.
            const { ssFormat, okInner } = selectSsResponseInner({
              rawOkInner: action.okInner,
              format: process.env.LOGH_SS_FORMAT ?? 'message32',
            });
            const okFrame = buildEncrypted0030Frame({
              tables,
              key: decipherKey,
              body: build0030Body({ id: replyId, innerPayload: okInner }),
              subheaderLen: ssSubheaderLen,
            });
            socket.write(okFrame);
            writeTrace(traceStream, {
              event: 'ss-response-sent',
              connectionId,
              replyId,
              respInnerCodeHex: `0x${appCodeForTrace(okInner).toString(16).padStart(4, '0')}`,
              respLen: okInner.length,
              ssFormat,
              subheaderLen: ssSubheaderLen,
              frameBytes: okFrame.length,
              ...actionTraceFields(action, okInner, session.account),
            });
            sendExtraInners(action.extraInners, ssSubheaderLen, action);
            scheduleDeferredBattle(action, ssSubheaderLen);
          } else if (action.kind === 'lobby-redirect') {
            // Workflow w8fyp5tg1 (high conf): the lobby stage is a redirect hop, not a terminal
            // 0x2001. Reply to inner 0x2000 with a 0x7001 redirect (routed to the session redirect
            // handler FUN_0x4adbe0) so the client opens conn3 to the world server.
            // G150 showed the lobby conn REJECTS the login-style forced-0x31 keysetup, so the
            // default ("bare") path sends inner 0x7001 encoded with decipherKey, no keysetup frame.
            // LOGH_LOBBY_KEYSETUP=1 selects the alternative keysetup+redirect pair (login-style).
            if (process.env.LOGH_LOBBY_KEYSETUP === '1') {
              const reply = buildRedirectReply({ tables, decipherKey, decodedBody: decoded, redirectInner: action.redirectInner });
              socket.write(Buffer.concat([reply.keysetupFrame, reply.redirectFrame]));
              writeTrace(traceStream, {
                event: 'lobby-redirect-sent',
                connectionId,
                variant: 'keysetup',
                world,
                gin7KeyRedacted: true,
                gin7KeyBytes: Buffer.from(reply.gin7KeyHex, 'hex').length,
              });
            } else {
              const redirectFrame = buildEncrypted0030Frame({
                tables,
                key: decipherKey,
                body: build0030Body({ id: parsed.id, innerPayload: action.redirectInner }),
              });
              socket.write(redirectFrame);
              writeTrace(traceStream, {
                event: 'lobby-redirect-sent',
                connectionId,
                variant: 'bare-decipher',
                world,
                respInnerCodeHex: `0x${appCodeForTrace(action.redirectInner).toString(16).padStart(4, '0')}`,
                respLen: action.redirectInner.length,
                redirectInnerRedacted: true,
                ...actionTraceFields(action, action.redirectInner, session.account),
              });
            }
          } else if (action.kind === 'lobby-login-ok') {
            // Reply to inner 0x2000 with inner 0x2001 LobbyLoginOK (workflow wicdkooh5, byte-verified):
            // consumer 0x4bdb70 sets the success flag *(0x7ccffc)+0x35837b=1 that lobby FSM wait-state 7
            // (getter 0x51be40) polls to advance — keeping conn2 alive instead of parking in watchdog
            // 0x6c -> teardown. status 0 = OK (0x2002 / non-zero would be a reject path). Encoded with
            // decipherKey "XY" and a MONOTONIC id so it clears the decipher sequence gate (0x645eda).
            const status = Number(process.env.LOGH_LOBBY_OK_STATUS ?? '0');
            // LOGH_LOBBY_OK_INNER_HEX overrides the whole inner (format-sweep escape hatch).
            const builtOk = buildLobbyLoginOkPayload({ status, format: process.env.LOGH_LOBBY_OK_FORMAT });
            const okInner = process.env.LOGH_LOBBY_OK_INNER_HEX
              ? Buffer.from(process.env.LOGH_LOBBY_OK_INNER_HEX, 'hex')
              : builtOk.okInner;
            const okFormat = process.env.LOGH_LOBBY_OK_INNER_HEX ? 'hex' : builtOk.okFormat;
            const okReplyId = takeReplyId();
            const lobbySubheaderLen = Number(process.env.LOGH_LOBBY_SUBHEADER ?? '4');
            // LOGH_LOBBY_OK_KEY: 'gin7' encodes the 0x2001 with the GIN7 blob from the client's own
            // 0x2000 credential (inner[2:]) instead of decipherKey "XY". Hypothesis (G193): the client
            // self-installs its lobby credential as the S->C decode key when it sends 0x2000 (like the
            // login conn keys to the 0x7000 blob), so a "XY"-encoded 0x2001 decodes to garbage and is
            // dropped at the 0x0030 decode (0x613193) before reaching decipher.
            if (process.env.LOGH_LOBBY_OK_KEYSETUP === '1') {
              // Hypothesis (G195): conn2 self-installs the 0x2000 GIN7 blob as its S->C decode key,
              // so the 0x2001 must be preceded by a keysetup (force 0x2000 inner -> 0x31, decipherKey)
              // and encoded with that GIN7 blob — exactly like conn1's keysetup+redirect. Reuse
              // buildRedirectReply with the 0x2001 inner. Now that conn2 stays open (router-teardown
              // patch), retest this (G150 rejected it only because conn2 closed instantly back then).
              const reply = buildRedirectReply({ tables, decipherKey, decodedBody: decoded, redirectInner: okInner });
              socket.write(Buffer.concat([reply.keysetupFrame, reply.redirectFrame]));
              writeTrace(traceStream, {
                event: 'lobby-login-ok-sent',
                connectionId,
                variant: 'keysetup',
                respInnerCodeHex: `0x${appCodeForTrace(okInner).toString(16).padStart(4, '0')}`,
                respLen: okInner.length,
                okInnerRedacted: true,
                gin7KeyRedacted: true,
                gin7KeyBytes: Buffer.from(reply.gin7KeyHex, 'hex').length,
                ...actionTraceFields(action, okInner, session.account),
              });
            } else {
              const { keyMode: okKeyMode, key: okKey } = selectLobbyLoginOkKey({
                mode: process.env.LOGH_LOBBY_OK_KEY,
                parsedInnerPayload: parsed.innerPayload,
                decipherKey,
                phase1Key,
              });
              const okFrame = buildEncrypted0030Frame({
                tables,
                key: okKey,
                body: build0030Body({ id: okReplyId, innerPayload: okInner }),
                subheaderLen: lobbySubheaderLen,
              });
              socket.write(okFrame);
              writeTrace(traceStream, {
                event: 'lobby-login-ok-sent',
                connectionId,
                replyId: okReplyId,
                respInnerCodeHex: `0x${appCodeForTrace(okInner).toString(16).padStart(4, '0')}`,
                respLen: okInner.length,
                okInnerRedacted: true,
                status,
                okFormat,
                keyMode: okKeyMode,
                subheaderLen: lobbySubheaderLen,
                frameBytes: okFrame.length,
                ...actionTraceFields(action, okInner, session.account),
              });
            }
            sendExtraInners(action.extraInners, lobbySubheaderLen, action);
          }
        }
      }
    });
    socket.on('error', (error) => writeTrace(traceStream, { event: 'socket-error', connectionId, message: error.message }));
    socket.on('end', () => writeTrace(traceStream, { event: 'peer-fin', connectionId, note: 'client sent FIN (client-initiated close)' }));
    socket.on('close', (hadError) => {
      session.close();
      if (registeredInWorld) {
        // C2 (멀티플레이 leave): 게이트 ON이면 다른 클라에 제거 통지를 보낸다(가능 범위). 떠나는 함대를
        // 공유 worldState에서 제거한 뒤, 남은 함대 테이블을 0x0325로 re-broadcast해 다른 in-world 클라가
        // 떠난 함대를 드롭하게 한다. unregister 전에 broadcast해야 이 연결의 콜백이 빠지기 전에 처리되며,
        // broadcast는 자신을 제외하므로 (이미 닫히는) 자기 소켓엔 안 쓴다. 게이트 OFF면 기존 동작 그대로.
        if (mpVisibilityEnabled && typeof worldState.listFleets === 'function') {
          const myInfo = typeof session.worldPlayerInfo === 'function' ? session.worldPlayerInfo() : null;
          const myFleetId = myInfo?.unitId ?? null;
          if (myFleetId != null && typeof worldState.removeFleet === 'function') {
            worldState.removeFleet(myFleetId);
          }
          const remaining = worldState.listFleets();
          if (worldRelay.size() > 1) {
            const remainingInner = buildInformationUnitRecordInner({
              wireLayout: 'parser-stream',
              fleets: remaining,
            });
            const delivered = worldRelay.broadcast(connectionId, remainingInner);
            writeTrace(traceStream, { event: 'mp-fleet-leave', connectionId, myFleetId, remaining: remaining.length, delivered });
          }
        }
        worldRelay.unregister(connectionId);
        if (authoritativeEnabled) {
          worldState.releaseShipsOf(connectionId);
          worldState.removePlayer(connectionId);
        }
      }
      // 동시 세션 가드 해제: 이 연결이 계정의 현 소유자일 때만 제거한다. takeover로 축출된 옛 소켓의 close가
      // 방금 등록된 새 소유자를 지우지 않게 connectionId를 대조한다.
      if (session.account) {
        const owner = presenceByAccount.get(session.account);
        if (owner && owner.connectionId === connectionId) {
          presenceByAccount.delete(session.account);
        }
      }
      writeTrace(traceStream, { event: 'close', connectionId, hadError });
    });
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, resolve);
  });
  const address = server.address();
  const boundPort = typeof address === 'object' && address !== null ? address.port : port;
  const adminServer = adminOptions
    ? await startAdminHttpServer({
      admin: adminOptions,
      noticeState,
      snapshot: () => buildAdminSessionSnapshot({
        host,
        port: boundPort,
        admin: adminServer,
        startedAtMs,
        nextConnectionId,
        relayEnabled,
        authoritativeEnabled,
        npcAiEnabled,
        stratSimEnabled,
        economyEnabled,
        repository,
        config,
        lobbyCharacters,
        lobbySessions,
        noticeState,
        bootScenario,
        worldState,
        economyState,
      }),
    })
    : null;
  return {
    host,
    port: boundPort,
    admin: adminServer
      ? { host: adminServer.host, port: adminServer.port, url: adminServer.url }
      : null,
    // Exposed for deterministic testing: run a single NPC tick (broadcasts to in-world connections).
    npcTickOnce: runNpcTickOnce,
    npcAiEnabled,
    // Exposed for deterministic testing: run a single strategic-sim tick (mutates the galaxy authoritatively).
    stratTickOnce: runStrategicTickOnce,
    stratSimEnabled,
    // 결정론 테스트용: 경제 틱 1회(게임클록 30일 경계에서만 적립). economyEnabled로 게이트.
    economyTickOnce: runEconomyTickOnce,
    economyEnabled,
    economyState,
    // 테스트/운영 관측용: authoritative 월드 상태(시나리오/콘텐츠 시드 결과 조회). bootScenario.name으로
    // 부팅에 어떤 시나리오가 적용됐는지 확인 가능(미적용이면 null).
    worldState,
    bootScenarioName: bootScenario?.name ?? null,
    // 테스트/운영에서 현재 월드 스냅샷을 즉시 저장(repository 있을 때). 더티체킹으로 변경 있을 때만 기록하되,
    // 변경이 없으면 직전 저장본이 이미 최신이라 생략해도 디스크는 항상 현재 상태와 동일하다.
    persist: saveSnapshot,
    close: async () => {
        if (npcTickHandle) {
          clearInterval(npcTickHandle);
          npcTickHandle = null;
        }
        if (stratHandle) {
          clearInterval(stratHandle);
          stratHandle = null;
        }
        if (persistHandle) {
          clearInterval(persistHandle);
          persistHandle = null;
        }
        if (economyHandle) {
          clearInterval(economyHandle);
          economyHandle = null;
        }
        saveSnapshot(); // 종료 직전 마지막 스냅샷(더티체킹: 변경 있을 때만 기록)
        await Promise.all([
          new Promise((resolve, reject) => {
            server.close((error) => {
              if (error) reject(error);
              else resolve();
            });
          }),
          adminServer?.close() ?? Promise.resolve(),
        ]);
        if (traceStream !== null) {
          await new Promise((resolve) => traceStream.end(resolve));
        }
      },
  };
}
