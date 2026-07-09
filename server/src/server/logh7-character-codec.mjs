// logh7-character-codec.mjs — 캐릭터 목록/생성/삭제/선택 inner 메시지 코덱
//
// 근거 문서:
//   [CW] docs/reference/legacy-evidence/logh7-character-creation-wire.md
//   [CR] docs/reference/legacy-evidence/logh7-character-record-wire.md
//   [CD] docs/reference/legacy-evidence/logh7-lobby-char-delete-2026-06-26.md
//   [SA] docs/reference/legacy-evidence/logh7-proto-social-account.md
//
// 레이어 전제:
//   C→S inner = [u16 BE code][body]                          [SA]:11
//   S→C inner = [u32 LE 0][u16 BE code][body]  (message32)  [SA]:11
//   0x0030 봉투·암호화: logh7-transport-0030.mjs 담당. 이 모듈은 inner 순수 함수만.

// ─── 메시지 코드 상수 ──────────────────────────────────────────────────────────
// Account 패밀리 base=0x1000 (9 entries), Lobby 패밀리 base=0x2000 (12 entries).
// 근거: [CW]§1 PE 포인터 테이블 바이트 직접 읽기
//   PTR_s_RequestInformationAccount_0075ecb4 (9항목)
//   PTR_s_LobbyLoginRequest_00765cb8 (12항목)

export const CODE_REQ_INFO_ACCOUNT = 0x1000;        // C→S: 계정 로스터 요청
export const CODE_RESP_INFO_ACCOUNT = 0x1001;       // S→C: 계정 로스터 응답 (body 0x1c0 bytes)
export const CODE_REQ_UNCHARGE_CHAR = 0x1002;       // C→S: 캐릭터 삭제 요청
export const CODE_RESP_UNCHARGE_CHAR = 0x1003;      // S→C: 삭제 결과
export const CODE_REQ_CHAR_ENTRY_STATE = 0x1004;    // C→S: 엔트리 상태 요청
export const CODE_RESP_CHAR_ENTRY_STATE = 0x1005;   // S→C: 엔트리 상태 응답 (body 0x20 bytes)
export const CODE_CMD_ORIGINAL_CHARGE = 0x1006;     // C→S: 기존 캐릭터 동기화 (body 24 bytes)
export const CODE_CMD_EXTENSION_CHARGE = 0x1007;    // C→S: 확장 캐릭터 등록 (echo body 8 bytes)
export const CODE_CMD_GENERATE_CHARGE = 0x1008;     // C→S: 새 캐릭터 생성 (body 128 bytes)

export const CODE_LOBBY_LOGIN_REQUEST = 0x2000;     // C→S: 로비 로그인
export const CODE_LOBBY_LOGIN_OK = 0x2001;          // S→C: 로비 로그인 OK
export const CODE_LOBBY_LOGIN_NG = 0x2002;          // S→C: 로비 로그인 NG
export const CODE_LOBBY_REQ_INFO_CHAR = 0x2003;     // C→S: 카드 목록 요청
export const CODE_LOBBY_RESP_INFO_CHAR = 0x2004;    // S→C: 카드 목록 응답
export const CODE_LOBBY_REQ_INFO_SESSION = 0x2005;  // C→S: 세션 목록 요청
export const CODE_LOBBY_RESP_INFO_SESSION = 0x2006; // S→C: 세션 목록 응답
export const CODE_LOBBY_CMD_EXT_CHARGE = 0x2007;   // C→S: 로비 확장 등록
export const CODE_LOBBY_CMD_DELETE_CHAR = 0x2008;   // C→S: 로비 캐릭터 삭제
export const CODE_LOBBY_SESSION_LOGIN_REQ = 0x2009; // C→S: 세션 로그인 요청
export const CODE_LOBBY_SESSION_LOGIN_OK = 0x200a;  // S→C: 세션 로그인 OK
export const CODE_LOBBY_SESSION_LOGIN_NG = 0x200b;  // S→C: 세션 로그인 NG

// ─── 파서 cap 상수 ─────────────────────────────────────────────────────────────
// 근거: [CW]§5 Input_InformationCharacter::input_from_stream 캡 문자열
export const NAME_MAX_CHARS = 13;      // 성/이름/기함명 ≤13 UCS-2 chars
export const MAX_ENTRY_CHARS = 5;      // entry_character ≤5
export const MAX_EXTENSION_CHARS = 2;  // extension_character ≤2

// CommandGenerateCharacterCharge OK body: 128 bytes (0x20 dword)
// 근거: [CW]§1 case 0x1008 → "store 0x20 dwords into +0x43243c"
const GENERATE_OK_BODY_SIZE = 128;

// ─── 내부 헬퍼 ────────────────────────────────────────────────────────────────

function asBuf(v) {
  return Buffer.isBuffer(v) ? v : Buffer.from(v);
}

// C→S inner 코드 검증 후 body(inner[2:]) 반환
function innerBody(inner, expectedCode) {
  const buf = asBuf(inner);
  if (buf.length < 2) throw new RangeError('inner too short (< 2 bytes)');
  const code = buf.readUInt16BE(0);
  if (code !== expectedCode) {
    throw new RangeError(
      `inner code 0x${code.toString(16).padStart(4, '0')} ≠ expected 0x${expectedCode.toString(16).padStart(4, '0')}`
    );
  }
  return buf.subarray(2);
}

// S→C message32 inner 조립: [u32 LE 0][u16 BE code][body]
// 근거: [SA] l.11 "server→client conn3 = message32 [u32 0][u16 BE code][body]"
function buildMsg32Inner(code, body) {
  const bodyBuf = asBuf(body);
  const out = Buffer.alloc(6 + bodyBuf.length);
  out.writeUInt32LE(0, 0);
  out.writeUInt16BE(code, 4);
  bodyBuf.copy(out, 6);
  return out;
}

// C→S packed UTF-16LE 문자열 읽기: [u8 len(NUL포함)][u8 pad][u16LE × (len-1)][u8 NUL]
// 근거: [CW]§2.1 packed layout + 실클라 캡처 "Reinhard"/"Lohengramm" 벡터 검증
function readPackedUtf16LE(buf, offset) {
  if (offset >= buf.length) {
    throw new RangeError(`readPackedUtf16LE: offset ${offset} >= length ${buf.length}`);
  }
  const len = buf[offset];
  if (len === 0) return { str: '', nextOffset: offset + 1 };
  const realChars = len - 1; // len includes NUL
  if (realChars > NAME_MAX_CHARS) {
    throw new RangeError(`name length ${realChars} > max ${NAME_MAX_CHARS}`);
  }
  // offset+1: pad byte; offset+2: UCS-2 chars start
  const charsStart = offset + 2;
  const required = charsStart + realChars * 2 + 1; // +1 for trailing NUL byte
  if (required > buf.length) throw new RangeError(`name field overrun at offset ${offset}`);
  const chars = [];
  for (let i = 0; i < realChars; i++) {
    chars.push(buf.readUInt16LE(charsStart + i * 2));
  }
  return {
    str: String.fromCharCode(...chars),
    nextOffset: charsStart + realChars * 2 + 1,
  };
}

// C→S packed UTF-16LE 문자열 쓰기
function writePackedUtf16LE(buf, offset, str) {
  const realChars = str.length;
  if (realChars > NAME_MAX_CHARS) {
    throw new RangeError(`name '${str}' exceeds ${NAME_MAX_CHARS} chars`);
  }
  buf[offset] = realChars + 1; // len includes NUL
  buf[offset + 1] = 0;         // alignment pad
  for (let i = 0; i < realChars; i++) {
    buf.writeUInt16LE(str.charCodeAt(i), offset + 2 + i * 2);
  }
  buf[offset + 2 + realChars * 2] = 0; // NUL byte
  return offset + 2 + realChars * 2 + 1;
}

// S→C pstr16 BE 읽기: [u8 len(NUL포함)][u16BE × (len-1)]
// 근거: [CW]§2.2 "pstr16 BE"
function readPstr16BE(buf, offset) {
  if (offset >= buf.length) {
    throw new RangeError(`readPstr16BE: offset ${offset} >= length ${buf.length}`);
  }
  const len = buf[offset];
  if (len === 0) return { str: '', nextOffset: offset + 1 };
  const realChars = len - 1;
  if (realChars > NAME_MAX_CHARS) {
    throw new RangeError(`pstr16BE len ${len} > max ${NAME_MAX_CHARS + 1}`);
  }
  const required = offset + 1 + realChars * 2;
  if (required > buf.length) throw new RangeError(`pstr16BE overrun at offset ${offset}`);
  const chars = [];
  for (let i = 0; i < realChars; i++) {
    chars.push(buf.readUInt16BE(offset + 1 + i * 2));
  }
  return { str: String.fromCharCode(...chars), nextOffset: offset + 1 + realChars * 2 };
}

// S→C pstr16 BE 쓰기
function writePstr16BE(buf, offset, str) {
  const realChars = str.length;
  if (realChars > NAME_MAX_CHARS) {
    throw new RangeError(`name '${str}' exceeds ${NAME_MAX_CHARS} chars`);
  }
  if (realChars === 0) {
    buf[offset] = 0; // len=0 = 빈 문자열
    return offset + 1;
  }
  buf[offset] = realChars + 1; // len includes NUL
  for (let i = 0; i < realChars; i++) {
    buf.writeUInt16BE(str.charCodeAt(i), offset + 1 + i * 2);
  }
  return offset + 1 + realChars * 2;
}

// ─── 0x1008 CommandGenerateCharacterCharge ─────────────────────────────────

/**
 * 0x1008 C→S CommandGenerateCharacterCharge 디코드
 * 근거: [CW]§2.1 packed layout + 실클라 캡처 (Reinhard/Lohengramm)
 *
 * @param {Buffer} inner - 전체 inner (code prefix 포함)
 * @returns {{ requestCategory, power, blood, sex, lastname, firstname,
 *             face, ability8, bonusPoint, specialAbilityNum, title, rank }}
 */
export function decodeGenerateCharReq(inner) {
  const body = innerBody(inner, CODE_CMD_GENERATE_CHARGE);
  if (body.length < 0x12) throw new RangeError('0x1008 body too short');

  const requestCategory = body.readUInt32LE(0x00);
  // body[0x04]: reserved (§2.1)
  const power = body[0x05]; // 진영 id (2=제국, 3=동맹)
  const blood = body[0x06]; // 혈통/출신
  const sex   = body[0x07]; // 성별

  // lastname: [len@0x08][pad@0x09][u16LE chars][NUL byte]
  const { str: lastname, nextOffset: fnOff } = readPackedUtf16LE(body, 0x08);
  // firstname: packed immediately after lastname
  const { str: firstname, nextOffset: tailOff } = readPackedUtf16LE(body, fnOff);

  // tail: face(u32 LE) + ability_8[8] + bonusPoint + specialAbilityNum + title + rank
  // 근거: [CW]§2.1 캡처 tail 오프셋 검증 (face@0x32, ability8@0x36 for Reinhard/Lohengramm)
  if (tailOff + 16 > body.length) throw new RangeError('0x1008 body tail truncated');
  const face = body.readUInt32LE(tailOff);
  const ability8 = Array.from(body.subarray(tailOff + 4, tailOff + 12));
  const bonusPoint       = body[tailOff + 12];
  const specialAbilityNum = body[tailOff + 13];
  const title = body[tailOff + 14];
  const rank  = body[tailOff + 15];

  // 미확정: birth_month/birth_day, flagship 필드
  // → 실클라 캡처에서 모두 0이라 커서 위치 미검증. 서버 핸들러에서 별도 처리 필요.

  return { requestCategory, power, blood, sex, lastname, firstname, face, ability8, bonusPoint, specialAbilityNum, title, rank };
}

/**
 * 0x1008 S→C CommandGenerateCharacterCharge OK inner 인코드
 * 근거: [CW]§2.2 packed OK stream (128-byte body, message32 래퍼)
 *
 * @param {object} fields
 * @returns {Buffer} message32 inner: [u32 0][u16 BE 0x1008][128-byte body]
 */
export function encodeGenerateCharOk({
  requestCategory = 4,  // 최종 phase=4 → 커밋. [CW]§7 미확정(0~4 관찰됨)
  accepted = 1,         // 1=accepted draft [CW]§2.2
  power = 2,
  blood = 2,
  sex = 0,
  lastname = '',
  firstname = '',
  createUnknown44 = 0,  // 미확정 [CW]§2.2
  birthMonth = 0,
  birthDay = 0,
  face = 0,             // [CW]§2.2 u32 BE
  ability8 = [0, 0, 0, 0, 0, 0, 0, 0],
  bonusPoint = 0,
  specialAbilityNum = 0,
  title = 0,
  rank = 0x0d,          // 소위 (constmsg group-5 subid 0x0d) [CW]§2.2
  flagshipType = 0,
  flagshipKind = 0,     // [CW]§2.2 u16 BE
  flagshipName = '',
  check = 0,            // [CW]§2.2 fixed +0x7c
} = {}) {
  const body = Buffer.alloc(GENERATE_OK_BODY_SIZE); // zero-filled
  let cursor = 0;

  body.writeUInt32LE(requestCategory, cursor); cursor += 4;
  body[cursor++] = accepted;
  body[cursor++] = power;
  body[cursor++] = blood;
  body[cursor++] = sex;
  // pstr16 BE 이름: [CW]§2.2 "pstr16 BE"
  cursor = writePstr16BE(body, cursor, lastname);
  cursor = writePstr16BE(body, cursor, firstname);
  body.writeUInt32BE(createUnknown44, cursor); cursor += 4;
  body[cursor++] = birthMonth;
  body[cursor++] = birthDay;
  body.writeUInt32BE(face, cursor); cursor += 4;
  for (let i = 0; i < 8; i++) body[cursor++] = (ability8[i] ?? 0);
  body[cursor++] = bonusPoint;
  body[cursor++] = specialAbilityNum;
  body[cursor++] = title;
  body[cursor++] = rank;
  body[cursor++] = flagshipType;
  // 미확정: flagship_kind 앞 pad 유무. [CW]§2.2 "u8/u16 BE | flagship type/kind"
  // 직렬화에서 pad 없이 type(u8) 바로 뒤에 kind(u16 BE)로 처리.
  body.writeUInt16BE(flagshipKind, cursor); cursor += 2;
  cursor = writePstr16BE(body, cursor, flagshipName);
  // check @ fixed+0x7c = 124 byte. 나머지는 zero-pad(Buffer.alloc 기본값).
  // 근거: [CW]§2.2 "check | fixed +0x7c; payload padded to 128 bytes"
  body[0x7c] = check;

  return buildMsg32Inner(CODE_CMD_GENERATE_CHARGE, body);
}

// ─── 0x2008 LobbyCommandDeleteCharacter ────────────────────────────────────

/**
 * 0x2008 C→S LobbyCommandDeleteCharacter 디코드
 * 근거: [CD] "RE-확정 형태 [u16 BE 0x2008][u32 LE characterId]"
 *       [CW]§2 "LobbyCommandDeleteCharacter (0x2008) is just [u32 session_id]"
 *
 * @param {Buffer} inner
 * @returns {{ characterId: number }}
 */
export function decodeLobbyDeleteCharReq(inner) {
  const body = innerBody(inner, CODE_LOBBY_CMD_DELETE_CHAR);
  if (body.length < 4) throw new RangeError('0x2008 body too short (< 4 bytes)');
  return { characterId: body.readUInt32LE(0) };
}

/**
 * 0x2008 S→C 삭제 결과 — 서버가 클라에 삭제 완료를 알릴 때.
 * 와이어 레이아웃 미확정: characterId echo 형태로 구현.
 * 미확정 표시: [CW]에서 S→C 삭제 결과 body 레이아웃 미기술.
 *
 * @param {{ characterId: number }} fields
 * @returns {Buffer} message32 inner
 */
export function encodeLobbyDeleteCharOk({ characterId = 0 } = {}) {
  // 미확정: 실제 S→C 삭제 확인 body 레이아웃 RE 미확인.
  // 임시: characterId echo (4 bytes).
  const body = Buffer.alloc(4);
  body.writeUInt32LE(characterId >>> 0, 0);
  return buildMsg32Inner(CODE_LOBBY_CMD_DELETE_CHAR, body);
}

// ─── 0x2003 LobbyRequestInformationCharacterCharge ────────────────────────

/**
 * 0x2003 C→S 카드 목록 요청 디코드 (body 없음)
 * 근거: [CW]§3 kind=5 → reqCode=0x2003 (body layout 없음, 단순 요청)
 *
 * @param {Buffer} inner
 * @returns {{}} 빈 객체
 */
export function decodeLobbyReqInfoChar(inner) {
  innerBody(inner, CODE_LOBBY_REQ_INFO_CHAR); // code 검증만
  return {};
}

// ─── 0x1000 RequestInformationAccount ─────────────────────────────────────

/**
 * 0x1000 C→S 계정 로스터 요청 디코드 (body 없음)
 * 근거: [CW]§3 kind=8 → reqCode=0x1000
 *
 * @param {Buffer} inner
 * @returns {{}}
 */
export function decodeReqInfoAccount(inner) {
  innerBody(inner, CODE_REQ_INFO_ACCOUNT);
  return {};
}

// ─── 0x1007 CommandExtensionCharacterCharge ───────────────────────────────

/**
 * 0x1007 C→S CommandExtensionCharacterCharge 디코드
 * 근거: [CW]§4 "FUN_00595ce0 → buffer [u8 count][u32 charId × count], up to 5 ids"
 *       [SA] body size 8 bytes = 2 dwords (echo body)
 * 미확정: C→S wire body가 가변길이인지 고정 8바이트인지 RE로 미확인.
 *
 * @param {Buffer} inner
 * @returns {{ count: number, charIds: number[] }}
 */
export function decodeExtensionCharReq(inner) {
  const body = innerBody(inner, CODE_CMD_EXTENSION_CHARGE);
  if (body.length < 1) throw new RangeError('0x1007 body empty');
  const count = body[0];
  if (count > MAX_ENTRY_CHARS) {
    throw new RangeError(`extension char count ${count} > max ${MAX_ENTRY_CHARS}`);
  }
  const charIds = [];
  for (let i = 0; i < count; i++) {
    const off = 1 + i * 4;
    if (off + 4 > body.length) throw new RangeError(`0x1007 body truncated at char ${i}`);
    charIds.push(body.readUInt32LE(off));
  }
  return { count, charIds };
}

/**
 * 0x1007 S→C CommandExtensionCharacterCharge OK echo
 * 근거: [SA] case 0x1007 → store 2 dwords (8 bytes) into +0x432434
 * 미확정: echo body 필드 레이아웃. count+accepted 형태로 임시 구현.
 *
 * @param {{ count?: number, accepted?: number }} fields
 * @returns {Buffer} message32 inner
 */
export function encodeExtensionCharOk({ count = 0, accepted = 1 } = {}) {
  // 미확정: 2 dword echo body 레이아웃. count(u32)+accepted(u32) 임시.
  const body = Buffer.alloc(8);
  body.writeUInt32LE(count >>> 0, 0);
  body.writeUInt32LE(accepted >>> 0, 4);
  return buildMsg32Inner(CODE_CMD_EXTENSION_CHARGE, body);
}

// ─── 0x1006 CommandOriginalCharacterCharge ────────────────────────────────

/**
 * 0x1006 C→S CommandOriginalCharacterCharge 디코드
 * 근거: [SA] case 0x1006 → store 6 dwords (24 bytes) into +0x43241c
 *       [CW]§3 kind=0xb sends charId from FUN_00598940
 * 미확정: 6 dword 내 필드 레이아웃. charId가 첫 dword라고 추정.
 *
 * @param {Buffer} inner
 * @returns {{ charId: number, raw: number[] }} charId=추정값, raw=6 dwords
 */
export function decodeOriginalCharReq(inner) {
  const body = innerBody(inner, CODE_CMD_ORIGINAL_CHARGE);
  if (body.length < 24) throw new RangeError('0x1006 body too short (< 24 bytes)');
  const raw = [];
  for (let i = 0; i < 6; i++) raw.push(body.readUInt32LE(i * 4));
  return { charId: raw[0], raw }; // charId: 미확정, 첫 dword 추정
}

/**
 * 0x1006 S→C CommandOriginalCharacterCharge OK echo
 * 근거: [SA] case 0x1006 → FUN_004be760 → UI event 0x1006
 * 미확정: echo body. charId echo + status 형태 임시.
 *
 * @param {{ charId?: number }} fields
 * @returns {Buffer} message32 inner
 */
export function encodeOriginalCharOk({ charId = 0 } = {}) {
  // 미확정: 6 dword echo body 레이아웃.
  const body = Buffer.alloc(24);
  body.writeUInt32LE(charId >>> 0, 0);
  return buildMsg32Inner(CODE_CMD_ORIGINAL_CHARGE, body);
}

// ─── 고정크기 S→C 이름 필드 헬퍼 ─────────────────────────────────────────────
//
// 고정크기 LE raw 이미지 이름 필드 = 28바이트:
//   [u8 len][u8 pad(2-byte 정렬)][u16[13] UTF-16LE zero-pad]
//
// 근거: 확정 오프셋 간격 검증 (모두 0x1c = 28)
//   0x1001 extension_character: +22→+3e→+5a→+76→+92→+ae  각 0x1c ✓
//   0x2004 ChargedCharacter:    +2c6→+2e2→+2fe→+31a→+336→+352  각 0x1c ✓
// [CW]§8.1 "Name fields [u8 len][u16[N] UTF-16LE] fixed slots" — RE 오프셋 산술로
// 1-byte 정렬 패드 확인.  총 슬롯 크기 = 1 + 1 + 26 = 28.
const NAME_FIELD_BYTES = 28;

function writeNameFieldFixed(buf, offset, str) {
  const s = String(str ?? '').slice(0, NAME_MAX_CHARS);
  buf[offset]     = s.length; // u8 len (유효 코드유닛 수)
  buf[offset + 1] = 0;        // u8 pad (u16 2-byte 정렬)
  for (let i = 0; i < s.length; i++) {
    buf.writeUInt16LE(s.charCodeAt(i), offset + 2 + i * 2);
  }
  // 나머지 슬롯 = Buffer.alloc zero-fill
}

// ─── 0x1001 ResponseInformationAccount ───────────────────────────────────────

/** 고정크기 바이트 이미지 크기 (body only, message32 헤더 별도) */
export const RESP_INFO_ACCOUNT_SIZE = 0x1c0; // 448 B

// extension_character 레코드 stride / 시작 오프셋
const EXT_CHAR_STRIDE   = 0xcc;  // 204 B
const EXT_CHAR_BASE_OFF = 0x00c; // 첫 레코드 시작

/**
 * 0x1001 ResponseInformationAccount 인코더
 *
 * 448-byte 고정크기 LE 바이트 이미지를 빌드 후 message32 래핑 반환.
 * 근거: [CW]§8.1 FUN_004b8b00→0x1c0; FUN_00409190 필드 워크.
 *
 * 레이아웃:
 *   0x000 u8 state · 0x004 u32 fame · 0x008 u8 extension_count(≤2)
 *   0x00c + i*0xcc: extension_character[i] (stride 204)
 *     +00 u32 sid · +04~07 u8×4(power/camp/gen/sex) · +08~09 u8×2(bday)
 *     +0c u32 age · +10 u8 state · +12 u16[8] ability
 *     +22/+3e/+5a/+76/+92 이름×5(28B each) · +ae blood · +af rank
 *     +b0 u32 face · +b4 u8 ending_count · +b8~c4 u32×4(evals+fame) · +c8 u8 friendship
 *   0x1a4 u32 · 0x1a8 u8 entry_count(≤5) · 0x1ac u32[5] committed-char ids
 *
 * @param {{ state?: number, fame?: number }} account
 * @param {import('./logh7-character-store.mjs').CharRecord[]} chars
 * @returns {Buffer} message32 inner [u32 LE 0][u16 BE 0x1001][448B body]
 */
export function encodeResponseInfoAccount(account = {}, chars = []) {
  const buf = Buffer.alloc(RESP_INFO_ACCOUNT_SIZE); // zero-filled

  // 최상위 헤더
  buf[0x000] = (account.state ?? 0) & 0xff;
  buf.writeUInt32LE((account.fame ?? 0) >>> 0, 0x004);
  // 0x001~0x003: pad(이미 0)

  const extChars = chars.slice(0, MAX_EXTENSION_CHARS); // ≤2 full records
  buf[0x008] = extChars.length;
  // 0x009~0x00b: pad

  for (let i = 0; i < extChars.length; i++) {
    const c = extChars[i];
    const b = EXT_CHAR_BASE_OFF + i * EXT_CHAR_STRIDE; // record base

    buf.writeUInt32LE((c.id       ?? 0) >>> 0, b + 0x00); // u32 sid
    buf[b + 0x04] = (c.power      ?? 0) & 0xff;           // u8 power
    buf[b + 0x05] = (c.camp       ?? 0) & 0xff;           // u8 camp
    buf[b + 0x06] = (c.generated  ?? 0) & 0xff;           // u8 generated
    buf[b + 0x07] = (c.sex        ?? 0) & 0xff;           // u8 sex
    buf[b + 0x08] = (c.bdayMonth  ?? 0) & 0xff;           // u8 bday_month
    buf[b + 0x09] = (c.bdayDay    ?? 0) & 0xff;           // u8 bday_day
    // +0x0a, +0x0b: pad (u32 age 정렬)
    buf.writeUInt32LE((c.age      ?? 0) >>> 0, b + 0x0c); // u32 age
    buf[b + 0x10] = (c.charState  ?? 0) & 0xff;           // u8 state
    // +0x11: pad (u16 정렬)
    const ab = c.ability8 ?? [0, 0, 0, 0, 0, 0, 0, 0];
    for (let j = 0; j < 8; j++) {
      buf.writeUInt16LE((ab[j] ?? 0) & 0xffff, b + 0x12 + j * 2); // u16[8]
    }
    // 이름 필드 (각 28B: u8 len + u8 pad + u16[13])
    writeNameFieldFixed(buf, b + 0x22, c.lastname     ?? ''); // lastname
    writeNameFieldFixed(buf, b + 0x3e, c.firstname    ?? ''); // firstname
    writeNameFieldFixed(buf, b + 0x5a, c.display      ?? ''); // display_name
    writeNameFieldFixed(buf, b + 0x76, c.titleName    ?? ''); // title_name
    writeNameFieldFixed(buf, b + 0x92, c.flagshipName ?? ''); // flagship_name

    buf[b + 0xae] = (c.blood      ?? 0) & 0xff;           // u8 blood
    buf[b + 0xaf] = (c.rank       ?? 0) & 0xff;           // u8 rank
    buf.writeUInt32LE((c.face     ?? 0) >>> 0, b + 0xb0); // u32 face
    buf[b + 0xb4] = (c.endingCount ?? 0) & 0xff;         // u8 ending_count
    // +0xb5~0xb7: pad
    buf.writeUInt32LE((c.eval0    ?? 0) >>> 0, b + 0xb8); // u32 eval0
    buf.writeUInt32LE((c.eval1    ?? 0) >>> 0, b + 0xbc); // u32 eval1
    buf.writeUInt32LE((c.eval2    ?? 0) >>> 0, b + 0xc0); // u32 eval2
    buf.writeUInt32LE((c.charFame ?? 0) >>> 0, b + 0xc4); // u32 char_fame
    buf[b + 0xc8] = (c.friendship ?? 0) & 0xff;          // u8 friendship
    // +0xc9~0xcb: pad → record boundary 0xcc ✓
  }

  // tail
  buf.writeUInt32LE(0, 0x1a4); // u32 unknown
  const entryChars = chars.slice(0, MAX_ENTRY_CHARS); // ≤5 committed ids only
  buf[0x1a8] = entryChars.length;
  // 0x1a9~0x1ab: pad
  for (let i = 0; i < entryChars.length; i++) {
    buf.writeUInt32LE((entryChars[i].id ?? 0) >>> 0, 0x1ac + i * 4);
  }
  // 0x1ac + 5*4 = 0x1c0 ✓

  return buildMsg32Inner(CODE_RESP_INFO_ACCOUNT, buf);
}

// ─── 0x2004 LobbyResponseInformationCharacterCharge ──────────────────────────
//
// ★정본: 고정 0x36c 슬롯이 아니라 compact sequential stream (5bd249c G136).
// body 크기 cap = 0x6dc (FUN_004b8b00). count@0, records from offset 1.
// 카드 enable 조건: status∈{1,2}, card_kind=2, selectable_detail≠0.

/** 수신 버퍼 cap (body only) */
export const LOBBY_CHAR_CARD_LIST_SIZE = 0x6dc; // 1756 B

const LOBBY_CC_NAME_UNITS = 0x0d;
const LOBBY_CC_DESC_UNITS = 0x41;
const LOBBY_CC_GATE_PREFIX = 0x22;
const LOBBY_CC_DETAIL_NAME_UNITS = 0x0d;
const LOBBY_CC_CARD_KIND = 2;
const LOBBY_CC_SELECTABLE = 1;
const LOBBY_CC_AGE_SEC_PER_YEAR = 0x01e13380;

function writeLobbyUtf16FieldBE(target, cursor, value, maxUnits) {
  const bodyUnits = [...String(value ?? '')].slice(0, Math.max(0, maxUnits - 1));
  const units = [...bodyUnits, '\0'];
  target.writeUInt8(units.length, cursor);
  let next = cursor + 1;
  for (const unit of units) {
    target.writeUInt16BE(unit.codePointAt(0) ?? 0, next);
    next += 2;
  }
  return next;
}

function writeLobbyUtf16FieldLE(target, cursor, value, maxUnits) {
  const units = [...String(value ?? ''), '\0'].slice(0, maxUnits);
  target.writeUInt8(units.length, cursor);
  let next = cursor + 1;
  for (const unit of units) {
    target.writeUInt16LE(unit.codePointAt(0) ?? 0, next);
    next += 2;
  }
  return next;
}

function writeLobbyChargedCharacterDetail(payload, cursor, record) {
  payload.writeUInt32BE(record.id >>> 0, cursor); cursor += 4;
  payload.writeUInt8(record.power & 0xff, cursor); cursor += 1;
  payload.writeUInt8(record.camp & 0xff, cursor); cursor += 1;
  payload.writeUInt8(record.generated & 0xff, cursor); cursor += 1;
  payload.writeUInt8(record.sex & 0xff, cursor); cursor += 1;
  payload.writeUInt8(record.bdayMonth & 0xff, cursor); cursor += 1;
  payload.writeUInt8(record.bdayDay & 0xff, cursor); cursor += 1;
  payload.writeUInt32BE(record.ageSeconds >>> 0, cursor); cursor += 4;
  payload.writeUInt8(record.state & 0xff, cursor); cursor += 1;
  for (const ability of record.abilities) {
    payload.writeUInt16BE(ability & 0xffff, cursor);
    cursor += 2;
  }
  cursor = writeLobbyUtf16FieldBE(payload, cursor, record.lastname, LOBBY_CC_DETAIL_NAME_UNITS);
  cursor = writeLobbyUtf16FieldBE(payload, cursor, record.firstname, LOBBY_CC_DETAIL_NAME_UNITS);
  cursor = writeLobbyUtf16FieldBE(payload, cursor, record.displayName, LOBBY_CC_DETAIL_NAME_UNITS);
  return cursor;
}

function writeLobbyCharacterChargeRecord(payload, cursor, record) {
  payload.writeUInt16LE(record.id & 0xffff, cursor); cursor += 2;
  payload.writeUInt8(record.status & 0xff, cursor); cursor += 1;
  cursor = writeLobbyUtf16FieldBE(payload, cursor, record.name, LOBBY_CC_NAME_UNITS);
  cursor = writeLobbyUtf16FieldBE(payload, cursor, record.description, LOBBY_CC_DESC_UNITS);
  cursor += LOBBY_CC_GATE_PREFIX; // zero-filled by alloc
  payload.writeUInt8(LOBBY_CC_CARD_KIND, cursor); cursor += 1;
  payload.writeUInt8(LOBBY_CC_SELECTABLE, cursor); cursor += 1;
  return writeLobbyChargedCharacterDetail(payload, cursor, record);
}

/**
 * 0x2004 인코더 — compact stream (정본) + 0x6dc zero-pad body.
 * @param {import('./logh7-character-store.mjs').CharRecord[]} chars
 * @returns {Buffer} message32
 */
export function encodeLobbyCharCardList(chars = []) {
  const payload = Buffer.alloc(LOBBY_CHAR_CARD_LIST_SIZE);
  const list = (chars ?? []).slice(0, 2);
  payload.writeUInt8(list.length, 0);
  let cursor = 1;
  for (const c of list) {
    const id = Number(c.id) || 0;
    if (id <= 0) continue;
    const lastname = String(c.lastname ?? '');
    const firstname = String(c.firstname ?? '');
    const display = String(c.display ?? ((lastname + firstname) || `Char${id}`));
    const ab = Array.isArray(c.ability8) ? c.ability8.slice(0, 8) : [];
    while (ab.length < 8) ab.push(0);
    const ageYears = Number.isFinite(c.age) ? Number(c.age) : 18;
    const record = {
      id,
      status: 1, // selectable (G136: status 1|2)
      name: display,
      description: display,
      power: (c.power ?? 1) & 0xff,
      camp: (c.camp ?? c.power ?? 1) & 0xff,
      generated: (c.generated ?? 1) & 0xff,
      sex: (c.sex ?? 0) & 0xff,
      bdayMonth: (c.bdayMonth ?? 1) & 0xff,
      bdayDay: (c.bdayDay ?? 1) & 0xff,
      ageSeconds: (Math.max(0, ageYears) * LOBBY_CC_AGE_SEC_PER_YEAR) >>> 0,
      state: (c.charState ?? 1) & 0xff,
      abilities: ab.map((v) => (v ?? 0) & 0xffff),
      lastname,
      firstname,
      displayName: display,
    };
    cursor = writeLobbyCharacterChargeRecord(payload, cursor, record);
  }
  return buildMsg32Inner(CODE_LOBBY_RESP_INFO_CHAR, payload);
}

/**
 * 0x2006 LobbyResponseInformationSession — FUN_00444900 packed stream + 0x5304 고정.
 *
 * 정본 (5bd249c codec/scenario-session.mjs, RE 2026-06-16):
 *   [u8 lead=0][u8 count]
 *   per record:
 *     [u16 LE session_id][u8 status 1|2]
 *     [u8 name_units≤13][u16LE × units]          ← unit count, NUL 미포함
 *     [u8 begin_day_units≤65][u16LE × units]
 *     [u32 LE term]
 *     2× power: [u8 id][u32 d0][u32 d1][u32 d2][u8 pend]
 *               pend×{ [u8 super_man_len][u16×][ending body 23B] }
 *     [u8 ending] ending×{ 16B }
 *
 * 간소 빌더(name+description 만)는 begin_day 다음에 올 term/power 를 생략해
 * 파서가 0 selectable row 로 빠짐 → 세션 피커에 카드가 안 뜸.
 */
export const LOBBY_SESSION_LIST_SIZE = 0x5304; // 21252 B
const SESSION_NAME_MAX_UNITS = 13;
const SESSION_BEGIN_DAY_MAX_UNITS = 65;
const SESSION_POWER_COUNT = 2;
const SESSION_SUPER_MAN_MAX_UNITS = 13;

/** [u8 unitCount][u16BE chars] — unit count only, no NUL (FUN_00444900).
 *  라이브 정본(2026-07-01): sessionId LE + 텍스트 BE 혼합. */
function writeSessionPstr16(payload, cursor, str, maxUnits) {
  const units = [...String(str ?? '')].slice(0, maxUnits);
  payload.writeUInt8(units.length, cursor);
  let c = cursor + 1;
  for (const ch of units) {
    payload.writeUInt16BE((ch.codePointAt(0) ?? 0) & 0xffff, c);
    c += 2;
  }
  return c;
}

function writePackedSessionRecord(payload, cursor, rec) {
  let c = cursor;
  payload.writeUInt16LE((rec.sessionId ?? 1) & 0xffff, c); c += 2;
  payload.writeUInt8((rec.status ?? 1) & 0xff, c); c += 1;
  c = writeSessionPstr16(payload, c, rec.name ?? rec.sessionName ?? 'LOGH VII', SESSION_NAME_MAX_UNITS);
  // description 별칭 → begin_day (구 간소 빌더 호환)
  const beginDay = rec.beginDay ?? rec.begin_day ?? rec.description ?? 'UC 796';
  c = writeSessionPstr16(payload, c, beginDay, SESSION_BEGIN_DAY_MAX_UNITS);
  payload.writeUInt32LE((rec.term ?? 0) >>> 0, c); c += 4;

  const powers = Array.isArray(rec.powers) ? rec.powers : [];
  for (let k = 0; k < SESSION_POWER_COUNT; k += 1) {
    const p = powers[k] ?? {};
    payload.writeUInt8((p.id ?? k + 1) & 0xff, c); c += 1;
    payload.writeUInt32LE((p.d0 ?? 0) >>> 0, c); c += 4;
    payload.writeUInt32LE((p.d1 ?? 0) >>> 0, c); c += 4;
    payload.writeUInt32LE((p.d2 ?? 0) >>> 0, c); c += 4;
    const leader = String(p.superMan ?? p.super_man ?? '');
    const hasLeader = [...leader].length > 0;
    payload.writeUInt8(hasLeader ? 1 : 0, c); c += 1;
    if (hasLeader) {
      c = writeSessionPstr16(payload, c, leader, SESSION_SUPER_MAN_MAX_UNITS);
      c += 2 + 1 + 1 + 1 + 1 + 1 + 2 + 2 + 4 + 4 + 4; // ending body zeros
    }
  }

  const ending = (rec.ending ?? 0) ? 1 : 0;
  payload.writeUInt8(ending, c); c += 1;
  if (ending) {
    c += 2 + 2 + 4 + 4 + 4;
  }
  return c;
}

export function encodeLobbySessionList({
  sessions = [{ sessionId: 1, status: 1, name: 'LOGH VII', beginDay: 'UC 796' }],
} = {}) {
  const records = (sessions ?? []).slice(0, 0x40);
  const body = Buffer.alloc(LOBBY_SESSION_LIST_SIZE);
  body.writeUInt8(0, 0); // leading raw byte
  body.writeUInt8(records.length, 1);
  let cursor = 2;
  for (const r of records) {
    cursor = writePackedSessionRecord(body, cursor, r);
    if (cursor >= LOBBY_SESSION_LIST_SIZE) break;
  }
  return buildMsg32Inner(CODE_LOBBY_RESP_INFO_SESSION, body);
}

// ─── 보조: inner 코드 읽기 ─────────────────────────────────────────────────

/**
 * inner 버퍼의 첫 2바이트에서 message code를 읽는다 (C→S 방향).
 * S→C message32는 [u32 0][u16 code] → code at offset 4.
 *
 * @param {Buffer} inner
 * @param {boolean} [isMsg32=false] S→C message32이면 true
 * @returns {number}
 */
export function readCharMsgCode(inner, isMsg32 = false) {
  const buf = asBuf(inner);
  const off = isMsg32 ? 4 : 0;
  if (buf.length < off + 2) throw new RangeError('inner too short for code read');
  return buf.readUInt16BE(off);
}
