// logh7-lobby-login.mjs — 로비 진입 핸드셰이크 코덱 (inner 0x0020 / 0x2000 → 0x2001)
//
// 흐름(라이브 근거: .omo/live-qa/login-hw-20260707/trace.jsonl conn2):
//   로그인 성공(conn1: 0x7000 → 0x0031 keysetup + 0x7001 redirect) 후 클라가 로비 서버로 재접속 →
//   재핸드셰이크(0x0034/0x0035/0x0036) → inner 0x0020(LobbySessionInit) → inner 0x2000(LobbyLoginRequest).
//   서버가 0x2000 에 0x2001(LobbyLoginOK)로 응답해야 클라가 다음 단계(0x1000 계정 로스터 요청)로 진행한다.
//   ★관측(trace): 이전 하네스는 0x2000 에 무응답 → 클라 ~2분 후 ECONNRESET. 즉 0x2001 미회신이 블로커.
//
// 근거 문서/코드:
//   - 5bd249c:server/src/server/logh7-login-protocol.mjs, logh7-login-session.mjs (이전 사이클 라이브 돌파)
//   - docs/reference/legacy-evidence/logh7-opcode-reference-2026-06-28.md
//       · 0x2000 RequestLogin/LobbyLoginRequest (LobbyLogin, version 4 GIN7) [C→S]
//       · 0x2001 ResponseLogin/LobbyLoginOK [S→C]
//   - Input_LobbyLoginOK::input_from_stream(0x0043f830): 코드 뒤 정확히 2바이트 필드만 읽음
//       → 0x2001 inner = [u16BE 0x2001][u16BE status].  status 0 = OK.
//
// 실측 디코드(trace conn2, phase1Key 로 0x0030 복호):
//   0x0020 inner = 00 20 | 00 00 00 01
//     = [u16BE 0x0020][u32BE selector=1].  server stays silent.
//     · selector==0 → conn3(SS) 세션 초기화 경로, selector!=0 → 로비 세션. 어느 쪽이든 즉시 응답 없음.
//   0x2000 inner = 20 00 | 47 49 4e 37 | 00 04 | 00 00 | 07 00 | 74 00 65 00 73 00 74 00 30 00 31 00 00
//     = [u16BE 0x2000][GIN7][u16BE version=4][u16BE flags=0][u16LE accountUnits=7][UTF-16LE account="test01"]
//   ★엔디안 주의: conn1 로그인(0x7000)은 version=1·accountUnits/account 가 BE UTF-16 이지만,
//     conn2 로비 로그인(0x2000)은 version=4·accountUnits/account 가 LE UTF-16 이다(실측 확정).
//     따라서 0x7000 용 parseGin7CredentialInner 를 그대로 쓸 수 없어 전용 파서를 둔다.

import {
  build0030Body,
  frame0030,
  frame0030WithSubheader,
} from './logh7-envelope-0030.mjs';
import {
  encryptBuffer,
  expandChildCodecKey,
  loadChildCodecTables,
} from './logh7-child-codec.mjs';

export const CODE_LOBBY_SESSION_INIT = 0x0020;   // C→S: 로비/SS 세션 초기화 (서버 무응답)
export const CODE_LOBBY_LOGIN_REQUEST = 0x2000;  // C→S: 로비 로그인 (GIN7 version 4, LE)
export const CODE_LOBBY_LOGIN_OK = 0x2001;       // S→C: 로비 로그인 승인
export const CODE_LOBBY_LOGIN_NG = 0x2002;       // S→C: 로비 로그인 거부
export const GIN7_MAGIC = 'GIN7';

const BLOCK_BYTES = 8;

function asBuf(value) {
  return Buffer.isBuffer(value) ? value : Buffer.from(value);
}

// child-codec 은 8바이트 배수 입력만 받는다. 봉투 body 를 zero-pad(login-response pad8 동일).
function pad8(data) {
  const paddedLength = data.length % BLOCK_BYTES === 0
    ? data.length
    : data.length + (BLOCK_BYTES - (data.length % BLOCK_BYTES));
  const padded = Buffer.alloc(paddedLength);
  data.copy(padded);
  return padded;
}

/**
 * 0x0020 LobbySessionInit 디코드. 즉시 응답 없음(silent)이 정상 동작.
 * @param {Buffer} inner  C→S inner ([u16BE 0x0020][u32BE selector])
 * @returns {{ code: number, selector: number|null }}
 */
export function decodeLobbySessionInit(inner) {
  const buf = asBuf(inner);
  if (buf.length < 2) throw new RangeError('0x0020 inner too short (< 2 bytes)');
  const code = buf.readUInt16BE(0);
  if (code !== CODE_LOBBY_SESSION_INIT) {
    throw new RangeError(`0x0020 expected, got 0x${code.toString(16).padStart(4, '0')}`);
  }
  const selector = buf.length >= 6 ? buf.readUInt32BE(2) : null;
  return { code, selector };
}

/**
 * 0x2000 LobbyLoginRequest(GIN7 version 4, LE) 디코드.
 * conn2 로비 로그인 자격증명. password 필드는 없다(body 가 account 로 끝남).
 * @param {Buffer} inner  C→S inner
 * @returns {{ code, magic, version, flags, accountUnits, account }}
 */
export function decodeLobbyLoginRequest(inner) {
  const buf = asBuf(inner);
  if (buf.length < 12) throw new RangeError(`0x2000 inner ${buf.length} < 12`);
  const code = buf.readUInt16BE(0);
  if (code !== CODE_LOBBY_LOGIN_REQUEST) {
    throw new RangeError(`0x2000 expected, got 0x${code.toString(16).padStart(4, '0')}`);
  }
  const magic = buf.toString('ascii', 2, 6);
  if (magic !== GIN7_MAGIC) {
    throw new RangeError(`0x2000 GIN7 magic expected, got ${magic}`);
  }
  const version = buf.readUInt16BE(6);   // 실측: 0x0004 (BE)
  const flags = buf.readUInt16BE(8);     // 실측: 0
  const accountUnits = buf.readUInt16LE(10); // 실측: 7 (LE)
  // account 는 accountUnits UCS-2 units(마지막 NUL 포함). innerLen 절단으로 마지막 half-NUL 이
  // 잘릴 수 있으므로 가용 바이트만큼 LE 로 읽고 NUL 을 절단한다.
  const accountOffset = 12;
  const readableEnd = Math.min(accountOffset + accountUnits * 2, buf.length - ((buf.length - accountOffset) % 2));
  let account = '';
  for (let cursor = accountOffset; cursor + 2 <= readableEnd; cursor += 2) {
    account += String.fromCharCode(buf.readUInt16LE(cursor));
  }
  account = account.replace(/\0+$/u, '');
  return { code, magic, version, flags, accountUnits, account };
}

/**
 * 0x2001 LobbyLoginOK raw inner.  [u16BE 0x2001][u16BE status].  status 0 = OK.
 * 근거: Input_LobbyLoginOK::input_from_stream(0x0043f830)은 코드 뒤 2바이트만 읽는다.
 * 주의: 실클라 conn2 수신 경로는 message32 래퍼가 필요(G122). 와이어 송신은
 *       buildLobbyLoginOkMessage32Inner / buildLobbyLoginOkFrame 를 쓴다.
 * @param {{ status?: number }} [options]
 * @returns {Buffer}  4바이트 raw inner (message32 래핑 아님)
 */
export function buildLobbyLoginOkInner({ status = 0 } = {}) {
  const inner = Buffer.alloc(4);
  inner.writeUInt16BE(CODE_LOBBY_LOGIN_OK, 0);
  inner.writeUInt16BE(status & 0xffff, 2);
  return inner;
}

/**
 * 0x2001 LobbyLoginOK message32 inner (실클라 기본).
 * 레이아웃: [u32 LE 0][u16 BE 0x2001][u8 status][u8 0][u8 0]
 * 근거: 5bd249c buildLobbyLoginOkPayload(format=message32) + 라이브 플래그
 *       LOGH_LOBBY_OK_FORMAT=message32. bare raw 는 conn2 enqueue 에 도달하지 못함(G122).
 * @param {{ status?: number }} [options]
 * @returns {Buffer}  9바이트 message32 inner
 */
export function buildLobbyLoginOkMessage32Inner({ status = 0 } = {}) {
  const inner = Buffer.alloc(9);
  inner.writeUInt32LE(0, 0);
  inner.writeUInt16BE(CODE_LOBBY_LOGIN_OK, 4);
  inner[6] = status & 0xff;
  // [7],[8] pad 0 — Input_LobbyLoginOK 는 코드 뒤 2바이트(status+pad)만 읽음
  return inner;
}

/**
 * 0x2002 LobbyLoginNG inner 조립.  [u16BE 0x2002][u16BE status].
 * @param {{ status?: number }} [options]
 * @returns {Buffer}
 */
export function buildLobbyLoginNgInner({ status = 1 } = {}) {
  const inner = Buffer.alloc(4);
  inner.writeUInt16BE(CODE_LOBBY_LOGIN_NG, 0);
  inner.writeUInt16BE(status & 0xffff, 2);
  return inner;
}

/**
 * S→C 로비 로그인 응답을 완성된 0x0030 TCP 프레임으로 만든다.
 * conn2 재핸드셰이크에서 서버가 정한 decipherKey(클라가 수신 복호에 쓰는 키)로 암호화한다.
 *
 * 기본 inner = message32. 기본 subheaderLen = 4 (conn2 라우터 필수).
 * format:'raw' / subheaderLen:0 은 A/B·유닛테스트 용.
 *
 * @param {{ id: number, decipherKey: Buffer, tables?: object, status?: number, inner?: Buffer, format?: 'message32'|'raw', subheaderLen?: number }} options
 * @returns {Buffer}
 */
export function buildLobbyLoginOkFrame({
  id,
  decipherKey,
  tables = loadChildCodecTables(),
  status = 0,
  inner,
  format = 'message32',
  subheaderLen = 4,
} = {}) {
  const okInner = inner
    ?? (format === 'raw'
      ? buildLobbyLoginOkInner({ status })
      : buildLobbyLoginOkMessage32Inner({ status }));
  const body = build0030Body({ id: id >>> 0, inner: okInner });
  const schedule = expandChildCodecKey(decipherKey, tables);
  const enc = encryptBuffer(pad8(body), schedule);
  if (subheaderLen > 0) return frame0030WithSubheader(enc, subheaderLen);
  return frame0030(enc);
}
