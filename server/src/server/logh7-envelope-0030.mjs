// transport-0x0030 (GIN7) 봉투 — build/parse/checksum
// 근거: docs/reference/legacy-evidence/logh7-0030-protocol.md (실클라 프로브 + 정적 RE 검증)
//
// 이 모듈은 "평문 봉투" 레이어만 다룬다. child-codec(decipherKey) 암호화/복호화는
// 별도 모듈이며, 여기서는 이미 복호된 body를 다루거나 암호화 직전 body를 만든다.
//
// TCP 프레임:  [u16 BE len][u16 BE 0x0030][child-codec 암호화 body]
//   - len = 2 + enc.length  (0x0030 코드워드 + 암호화 body 길이)
// 복호 body:   [u16 BE checksum][u32 BE id][u16 BE innerLen][innerLen bytes inner]
//   - 제약: body.length >= 8,  (body.length - 8) >= innerLen
//   - id <= client+0x20 (수신측 검증; 서버 송신 시엔 세션 id 카운터를 싣는다)
// inner:       [u16 BE code][payload]   (0x31=key setup, 0x7000=login, 0x7001/0x7002=lobby)

export const TRANSPORT_CODE_0030 = 0x0030;

// 봉투 헤더 오프셋(복호 body 기준)
const OFF_CHECKSUM = 0; // u16 BE
const OFF_ID = 2; // u32 BE
const OFF_INNERLEN = 6; // u16 BE
const OFF_INNER = 8; // inner payload 시작
const HEADER_LEN = 8;

// fold16: 32비트 누산값을 16비트로 접는다.  ((x>>16) ^ x) & 0xFFFF
function fold16(x) {
  return (((x >>> 16) ^ x) & 0xffff) >>> 0;
}

// 체크섬 = fold16( body[2 .. 8+innerLen) 를 LE-dword 로 XOR 누적 + 남는 tail 바이트 )
// 대상 구간 = id(4) + innerLen(2) + inner(innerLen) = 6 + innerLen 바이트. checksum 자신([0:2])은 제외.
export function compute0030Checksum(body, innerLen) {
  const start = OFF_ID; // 2
  const end = OFF_INNER + innerLen; // 8 + innerLen
  let acc = 0;
  let i = start;
  for (; i + 4 <= end; i += 4) {
    acc = (acc ^ body.readUInt32LE(i)) >>> 0;
  }
  // 남는 1~3 바이트: LE 로 부분 dword 구성 후 XOR (tail-byte 처리)
  if (i < end) {
    let tail = 0;
    for (let s = 0, j = i; j < end; j++, s += 8) {
      tail = (tail | (body[j] << s)) >>> 0;
    }
    acc = (acc ^ tail) >>> 0;
  }
  return fold16(acc);
}

// S→C: 복호 body 를 만든다(암호화는 호출측 child-codec 이 담당).
export function build0030Body({ id, inner }) {
  const innerBuf = Buffer.isBuffer(inner) ? inner : Buffer.from(inner);
  const innerLen = innerBuf.length;
  if (innerLen > 0xffff) throw new RangeError(`innerLen ${innerLen} > 0xffff`);
  const body = Buffer.allocUnsafe(HEADER_LEN + innerLen);
  body.writeUInt32BE(id >>> 0, OFF_ID);
  body.writeUInt16BE(innerLen, OFF_INNERLEN);
  innerBuf.copy(body, OFF_INNER);
  const checksum = compute0030Checksum(body, innerLen);
  body.writeUInt16BE(checksum, OFF_CHECKSUM);
  return body;
}

// C→S: 복호 body 를 파싱·검증한다. 실패 시 throw(경계에서만 검증, 프로토콜 위반은 연결 종료 사유).
export function parse0030Body(body) {
  if (body.length < HEADER_LEN) throw new RangeError(`0030 body ${body.length} < ${HEADER_LEN}`);
  const checksum = body.readUInt16BE(OFF_CHECKSUM);
  const id = body.readUInt32BE(OFF_ID);
  const innerLen = body.readUInt16BE(OFF_INNERLEN);
  if (body.length - HEADER_LEN < innerLen) {
    throw new RangeError(`0030 innerLen ${innerLen} > available ${body.length - HEADER_LEN}`);
  }
  const expect = compute0030Checksum(body, innerLen);
  if (checksum !== expect) {
    throw new Error(`0030 checksum 불일치: got 0x${checksum.toString(16)} expect 0x${expect.toString(16)}`);
  }
  const inner = body.subarray(OFF_INNER, OFF_INNER + innerLen);
  return { id, innerLen, inner, checksum };
}

// 암호화된 body 를 TCP 프레임으로 감싼다.  [u16BE len=2+enc][u16BE 0x0030][enc]
export function frame0030(encBody) {
  const enc = Buffer.isBuffer(encBody) ? encBody : Buffer.from(encBody);
  const out = Buffer.allocUnsafe(4 + enc.length);
  out.writeUInt16BE(2 + enc.length, 0);
  out.writeUInt16BE(TRANSPORT_CODE_0030, 2);
  enc.copy(out, 4);
  return out;
}

/**
 * conn2(로비) S→C 0x0030 프레임.
 * 근거(5bd249c auth-server buildEncrypted0030Frame + RE):
 *   로비 연결 transport+0x12 = 4 → 라우터가 code 를 offset+4 에서 읽음.
 *   프레임: [u16BE len][subheaderLen zero][u16BE 0x0030][enc]
 *   len = subheaderLen + 2 + enc.length
 * 로그인 conn1 은 subheaderLen=0 (frame0030). 기본 로비 = 4.
 */
export function frame0030WithSubheader(encBody, subheaderLen = 4) {
  const enc = Buffer.isBuffer(encBody) ? encBody : Buffer.from(encBody);
  const sh = Math.max(0, subheaderLen | 0);
  const out = Buffer.alloc(4 + sh + enc.length); // zero-filled subheader
  out.writeUInt16BE(sh + 2 + enc.length, 0);
  out.writeUInt16BE(TRANSPORT_CODE_0030, 2 + sh);
  enc.copy(out, 4 + sh);
  return out;
}

/** subheader 유무 자동 판별 후 enc body 슬라이스 (테스트/디코드 보조) */
export function unwrap0030Frame(frame) {
  const raw = Buffer.isBuffer(frame) ? frame : Buffer.from(frame);
  if (raw.length < 4) throw new RangeError('0030 frame too short');
  const len = raw.readUInt16BE(0);
  // subheader 0: code@2, subheader 4: code@6
  if (raw.readUInt16BE(2) === TRANSPORT_CODE_0030) {
    return { subheaderLen: 0, encBody: raw.subarray(4, 2 + len) };
  }
  if (raw.length >= 8 && raw.readUInt16BE(6) === TRANSPORT_CODE_0030) {
    return { subheaderLen: 4, encBody: raw.subarray(8, 2 + len) };
  }
  throw new RangeError('0030 transport code not found at offset 2 or 6');
}

// 프레임에서 transport code 와 암호화 body 를 벗겨낸다(스트림 파서 보조).
export function deframe0030(frame) {
  if (frame.length < 4) throw new RangeError(`0030 frame ${frame.length} < 4`);
  const len = frame.readUInt16BE(0);
  const code = frame.readUInt16BE(2);
  const encBody = frame.subarray(4, 2 + len); // len 은 code워드+enc 를 덮음
  return { len, code, encBody };
}

// inner code 는 빅엔디안 u16 prefix. (0x31 / 0x7000 / 0x7001 …)
export function readInnerCode(inner) {
  return inner.readUInt16BE(0);
}
