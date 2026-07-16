// LOGH VII 로그인 성공 응답(login-OK) — GIN7 자격증명 수신 후 클라에 회신하는 keysetup+redirect 쌍.
//
// 근거(이전 사이클 5bd249c:server/src/server/logh7-auth-server.mjs buildRedirectReply,
//      docs/reference/legacy-evidence/logh7-0030-protocol.md):
//   실클라가 로그인 자격증명을 inner 0x7000(GIN7)으로 보내면, 서버는 같은 0x0030 연결에
//   두 개의 0x0030 프레임을 회신한다(g134에서 실클라 로그인 성공으로 검증된 형태).
//     1. keysetup 프레임: 수신한 inner 를 그대로 쓰되 코드만 0x0031 로 덮어쓴다.
//        decipherKey(서버->클라 방향 키)로 암호화. 클라 라우터가 inner 0x31 을 key-setup 으로
//        라우팅해 GIN7 blob(자격증명 inner 의 코드 2바이트 이후 전체)을 다음 암호키로 설치한다.
//     2. redirect 프레임: inner 0x7001(로비 IP/port/token). 방금 설치된 gin7Key 로 암호화.
//        LoginProcessor::handle_message(0x004ac700)가 IP(inner+8)/port(inner+12)/token(inner+16)을
//        읽어 클라를 로비 서버로 재접속시킨다.
//   두 프레임 모두 수신 프레임과 동일한 id 를 싣고, child-codec 암호화 전 8바이트 zero-pad 한다.

import {
  build0030Body,
  frame0030,
  parse0030Body,
} from './logh7-envelope-0030.mjs';
import {
  encryptBuffer,
  expandChildCodecKey,
  loadChildCodecTables,
} from './logh7-child-codec.mjs';
import { ipv4ToClientU32 } from './logh7-ipv4.mjs';

export const KEYSETUP_INNER_CODE = 0x0031; // inner key-setup (클라 라우터 fast-path)
export const REDIRECT_INNER_CODE = 0x7001; // S->C 로비 redirect (LGLoginOK)
export const LOGIN_NG_INNER_CODE = 0x7002; // S->C LGLoginNG (fail-closed)

// 검증된 127.0.0.1:47900 redirect 프레임의 원형(REDIRECT_TEMPLATE_HEX, 5bd249c login-protocol).
// [u16BE 0x7001][u16 0][u32 0][u32BE ip@8][u16BE port@12][u16 0][u32BE token@16][u16 0]
const REDIRECT_TEMPLATE_HEX = '70010000000000000100007fbb1c0000000100000000';
const REDIRECT_IP_OFFSET = 8; // BE u32, octet-packed
const REDIRECT_PORT_OFFSET = 12; // BE u16
const REDIRECT_TOKEN_OFFSET = 16; // BE u32
const BLOCK_BYTES = 8;

// child-codec 은 8바이트 배수 입력만 받는다. 봉투 body 를 zero-pad(레거시 childCodecEncode 동일).
function pad8(data) {
  const paddedLength = data.length % BLOCK_BYTES === 0 ? data.length : data.length + (BLOCK_BYTES - (data.length % BLOCK_BYTES));
  const padded = Buffer.alloc(paddedLength);
  data.copy(padded);
  return padded;
}

/**
 * IPv4 점표기를 클라 "%d.%d.%d.%d" 파서가 기대하는 u32 로 팩킹한다:
 * octet[0]=하위바이트, octet[3]=상위바이트.
 * @param {string} ip
 * @returns {number}
 */
export function ipToRedirectU32(ip) {
  return ipv4ToClientU32(ip);
}

/**
 * 0x7001 로비 redirect inner 를 만든다. 기본값은 검증된 127.0.0.1:47900 프레임을 재현한다.
 * @param {{ ip?: string, port?: number, token?: number|null }} [options]
 * @returns {Buffer}
 */
export function buildRedirectInner({ ip = '127.0.0.1', port = 47900, token = null } = {}) {
  if (!Number.isInteger(port) || port < 0 || port > 0xffff) {
    throw new Error(`invalid redirect port: ${port}`);
  }
  const inner = Buffer.from(REDIRECT_TEMPLATE_HEX, 'hex');
  inner.writeUInt32BE(ipToRedirectU32(ip), REDIRECT_IP_OFFSET);
  inner.writeUInt16BE(port, REDIRECT_PORT_OFFSET);
  if (token !== null) {
    if (!Number.isInteger(token) || token < 0 || token > 0xffffffff) {
      throw new Error(`invalid redirect token: ${token}`);
    }
    inner.writeUInt32BE(token >>> 0, REDIRECT_TOKEN_OFFSET);
  }
  return inner;
}

// 복호 body 를 지정 키로 child-codec 암호화해 0x0030 TCP 프레임으로 감싼다.
function encrypt0030Frame({ tables, key, body }) {
  return frame0030(encryptBuffer(pad8(body), expandChildCodecKey(key, tables)));
}

/**
 * 0x7002 LGLoginNG raw inner. G120: body 최소 필드 — [u16BE 0x7002][u8 status].
 * @param {{ status?: number }} [options]
 * @returns {Buffer}
 */
export function buildLoginNgInner({ status = 1 } = {}) {
  const inner = Buffer.alloc(4);
  inner.writeUInt16BE(LOGIN_NG_INNER_CODE, 0);
  inner.writeUInt8(status & 0xff, 2);
  return inner;
}

/**
 * GIN7 자격증명(inner 0x7000)이 실린 복호 body 로부터 로그인 성공 응답 프레임 쌍을 만든다.
 * @param {{ decodedBody: Buffer, decipherKey: Buffer, redirectInner?: Buffer, tables?: object }} options
 * @returns {{ keysetupFrame: Buffer, redirectFrame: Buffer, gin7KeyHex: string }}
 */
export function buildLoginResponseFrames({ decodedBody, decipherKey, redirectInner = buildRedirectInner(), tables = loadChildCodecTables() }) {
  const parsed = parse0030Body(decodedBody); // 유효하지 않으면 throw (경계 검증)

  // 1) keysetup: 수신 inner 복제 후 코드만 0x0031 로. decipherKey 로 암호화.
  const keysetupInner = Buffer.from(parsed.inner);
  keysetupInner.writeUInt16BE(KEYSETUP_INNER_CODE, 0);
  const keysetupFrame = encrypt0030Frame({
    tables,
    key: decipherKey,
    body: build0030Body({ id: parsed.id, inner: keysetupInner }),
  });

  // 2) redirect: keysetup 이 설치한 gin7Key(자격증명 inner 코드 2바이트 이후 전체)로 암호화.
  const gin7Key = Buffer.from(parsed.inner.subarray(2));
  const redirectFrame = encrypt0030Frame({
    tables,
    key: gin7Key,
    body: build0030Body({ id: parsed.id, inner: redirectInner }),
  });

  return { keysetupFrame, redirectFrame, gin7KeyHex: gin7Key.toString('hex') };
}

/**
 * 로그인 거부: decipherKey 로 암호화한 단일 0x7002 프레임 (성공 쌍을 보내지 않음 = fail-closed).
 * @param {{ decodedBody: Buffer, decipherKey: Buffer, status?: number, tables?: object }} options
 * @returns {{ ngFrame: Buffer, innerCode: number }}
 */
export function buildLoginNgResponseFrame({
  decodedBody,
  decipherKey,
  status = 1,
  tables = loadChildCodecTables(),
}) {
  const parsed = parse0030Body(decodedBody);
  const ngInner = buildLoginNgInner({ status });
  const ngFrame = encrypt0030Frame({
    tables,
    key: decipherKey,
    body: build0030Body({ id: parsed.id, inner: ngInner }),
  });
  return { ngFrame, innerCode: LOGIN_NG_INNER_CODE };
}
