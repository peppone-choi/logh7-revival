// logh7-world-records.mjs — 월드 진입/이동/채팅 S→C 레코드 순수 빌더
//
// 근거:
//   docs/reference/legacy-evidence/logh7-info-records-wire.md (0x0323, 0x2d4)
//   docs/reference/legacy-evidence/logh7-protocol-master.md (message32 framing)
//   docs/reference/legacy-evidence/logh7-strategic-input-wire.md (0x0b07, 0x244)
//   docs/reference/legacy-evidence/logh7-proto-social-account.md (0x0f1c, 0x8c)
//   이전 사이클 라이브 경로: 0x0204 + 0x0323 + 0x0325 로 월드 로드 가능 (G164)
//
// 미확정 필드는 0으로 두고, 확정 anchor 만 채운다 (날조 금지).

/** message32: [u32 LE 0][u16 BE code][body] — 현재 코드베이스 관례(LE prefix) */
export function buildMsg32Inner(code, body = Buffer.alloc(0)) {
  const bodyBuf = Buffer.isBuffer(body) ? body : Buffer.from(body);
  const out = Buffer.alloc(6 + bodyBuf.length);
  out.writeUInt32LE(0, 0);
  out.writeUInt16BE(code & 0xffff, 4);
  bodyBuf.copy(out, 6);
  return out;
}

export function readMsg32Code(inner) {
  const buf = Buffer.isBuffer(inner) ? inner : Buffer.from(inner);
  if (buf.length < 6) throw new RangeError('message32 too short');
  return buf.readUInt16BE(4);
}

export function msg32Body(inner) {
  const buf = Buffer.isBuffer(inner) ? inner : Buffer.from(inner);
  if (buf.length < 6) throw new RangeError('message32 too short');
  return buf.subarray(6);
}

// ─── 상수 (FUN_004b8b00 / FUN_004ba2b0) ──────────────────────────────────────

export const CODE_SS_LOGIN_REQ = 0x0200; // C→S SSLoginRequest (세션 서버 재접속 첫 로그인)
export const CODE_SS_LOGIN_OK = 0x0201; // S→C SSLoginOK
export const CODE_SS_LOGIN_NG = 0x0202; // S→C SSLoginNG
export const CODE_SS_CHARACTER_ID = 0x0204; // S→C SSCharacterIDResponce → client+0x3584a0
export const CODE_SS_GAME_LOGIN_OK = 0x0206; // S→C SSGameLoginOK
export const CODE_SS_GAME_LOGIN_REQ = 0x0205; // C→S SSGameLoginRequest
export const CODE_INFO_CHARACTER = 0x0323; // S→C ResponseInformationCharacter
export const CODE_INFO_CHARACTER_BYTES = 0x02d4; // 724
export const CODE_INFO_UNIT = 0x0325; // S→C ResponseInformationUnit
export const CODE_INFO_UNIT_BYTES = 0xce44; // 52804 fixed receive size
export const CODE_INFO_UNIT_HEADER = 4; // [u16 count][u16 pad]
export const CODE_INFO_UNIT_STRIDE = 0x58; // 88B element
export const CODE_NOTIFY_MOVED_GRID = 0x0b07; // S→C NotifyMovedGrid
export const CODE_NOTIFY_MOVED_GRID_BYTES = 0x244; // 580
export const CODE_NOTIFY_MOVED_GRID_MAX_UNITS = 70;
export const CODE_CMD_MOVE_GRID = 0x0b01; // C→S SelectGrid / move request
export const CODE_CMD_GRID_CHAT = 0x0f1c; // bidir CommandGridChat
export const CODE_CMD_GRID_CHAT_BYTES = 0x8c; // 140
export const CODE_LOBBY_SESSION_LOGIN_REQ = 0x2009;
export const CODE_LOBBY_SESSION_LOGIN_OK = 0x200a;
export const CODE_LOBBY_SESSION_LOGIN_OK_PAYLOAD = 0x000c;
export const CODE_LOBBY_REQ_INFO_SESSION = 0x2005;
export const CODE_LOBBY_RESP_INFO_SESSION = 0x2006;

// 월드 초기화 / 시각 / 그리드 (FUN_004b8b00 sizes; G144 WORLD_OK status=1)
export const CODE_REQ_RESPONSE_TIME = 0x0300; // C→S RequestResponseTime → 0x0301
export const CODE_RESP_TIME = 0x0301; // S→C ResponseTime — 4B LE start time
export const CODE_REQ_WORLD_INIT = 0x0f00; // C→S RequestWorldInitialize → 0x0f01
export const CODE_WORLD_INIT_OK = 0x0f01; // ResponseWorldInitialize_OK → client+0x35f356
export const CODE_REQ_GRID_INIT = 0x0f02; // C→S RequestGridInitialize → 0x0f03 (라이브 정정: push 아님)
export const CODE_GRID_INIT_OK = 0x0f03; // ResponseGridInitialize_OK → client+0x35f357
export const CODE_STATIC_GRID = 0x0315; // ResponseStaticInformationGrid RLE, fixed 0x138c
export const CODE_STATIC_GRID_BYTES = 0x138c; // 5004
export const CODE_GRID_SELECTOR = 0x0317; // ResponseInformationGrid single dword
/** status-byte=1 이 필수인 OK 코드 (empty 0 이면 클라 미초기화 래치) */
export const WORLD_OK_STATUS_CODES = new Set([CODE_WORLD_INIT_OK, CODE_GRID_INIT_OK, CODE_GRID_SELECTOR]);

const NAME_MAX = 13;
const STRATEGIC_GRID_W = 100;
const STRATEGIC_GRID_H = 50;

// ─── 0x0201 SSLoginOK ─────────────────────────────────────────────────────────
//
// 세션 서버 재접속 직후 C→S 0x0200 에 대한 응답.
// LobbyLoginOK 와 같이 status 바이트 계열. 라이브 생성 경로(2026-07-09):
//   0x2009→0x200a → conn 재연결 → 0x0020 → 0x0200(25B) → (여기) 0x0201
// status=0 이 OK (0x2001 과 동일 관례).

export function buildSsLoginOkInner({ status = 0 } = {}) {
  return buildMsg32Inner(CODE_SS_LOGIN_OK, Buffer.from([status & 0xff]));
}

// ─── 0x1200/0x120f/0x1201 캐릭터 로스터 트랜잭션 ─────────────────────────────
//
// 근거 (5bd249c logh7-login-protocol.mjs + Ghidra FUN_004ba2b0 / FUN_004c1f10 / FUN_00597ff0):
//   S→C Begin 0x1200 (body 0x24) → Entry 0x120f (body 0x73a4) → End 0x1201 (body 1)
//   filler 가 clientBase+0x554da4 count / +0x554da8 records 를 채움.
//   생성 메뉴 게이트 FUN_00597ff0: count≥1 이고 GROUP@rec+0==2, THRESHOLD@rec+4 ≤ ceiling.
// 빈 계정도 게이트 통과용 더미 레코드 1개 필요 (이름/황제 합성 금지 — group/threshold 만).

export const CODE_TX_SIMPLE_DATA_BEGIN = 0x1200; // S→C TransactionSimpleDataBegin
export const CODE_TX_SIMPLE_DATA_BEGIN_BYTES = 0x24;
export const CODE_NOTIFY_SIMPLE_CHAR_ENTRY = 0x120f; // S→C NotifySimpleInformationCharacterEntry
export const CODE_NOTIFY_SIMPLE_CHAR_ENTRY_BYTES = 0x73a4;
export const CODE_TX_SIMPLE_DATA_END = 0x1201; // S→C TransactionSimpleDataEnd
export const CODE_TX_SIMPLE_DATA_END_BYTES = 0x01;
export const SIMPLE_CHAR_ENTRY_STRIDE = 0x128; // 296
export const SIMPLE_CHAR_ENTRY_HEADER = 4;
export const SIMPLE_CHAR_ENTRY_GROUP = 2;
export const SIMPLE_CHAR_ENTRY_MAX = 600;

export function buildTransactionSimpleDataBeginInner() {
  return buildMsg32Inner(CODE_TX_SIMPLE_DATA_BEGIN, Buffer.alloc(CODE_TX_SIMPLE_DATA_BEGIN_BYTES));
}

export function buildTransactionSimpleDataEndInner() {
  return buildMsg32Inner(CODE_TX_SIMPLE_DATA_END, Buffer.alloc(CODE_TX_SIMPLE_DATA_END_BYTES));
}

/**
 * 0x120f bulk roster fill. characters 항목: { id?, characterId?, name?, group?, threshold? }
 * 게이트 필드만 필수 — 빈 계정은 [{}] 한 장으로 group=2/threshold=0 통과.
 */
export function buildNotifySimpleInformationCharacterInner({ characters = [] } = {}) {
  const body = Buffer.alloc(CODE_NOTIFY_SIMPLE_CHAR_ENTRY_BYTES);
  const list = Array.isArray(characters) ? characters : [];
  const count = Math.min(list.length, SIMPLE_CHAR_ENTRY_MAX);
  body.writeUInt8(count & 0xff, 0);
  for (let i = 0; i < count; i += 1) {
    const off = SIMPLE_CHAR_ENTRY_HEADER + i * SIMPLE_CHAR_ENTRY_STRIDE;
    if (off + SIMPLE_CHAR_ENTRY_STRIDE > body.length) break;
    const record = list[i] ?? {};
    body.writeUInt8((record.group ?? SIMPLE_CHAR_ENTRY_GROUP) & 0xff, off + 0x00);
    body.writeUInt32LE((record.threshold ?? 0) >>> 0, off + 0x04);
    const id = Number(record.characterId ?? record.id ?? 0) || 0;
    body.writeUInt32LE(id >>> 0, off + 0x08);
    if (record.name != null && String(record.name).length > 0) {
      const codes = [...String(record.name)].slice(0, NAME_MAX);
      body.writeUInt8(codes.length, off + 0x0c);
      for (let j = 0; j < codes.length; j += 1) {
        body.writeUInt16LE(codes[j].charCodeAt(0) & 0xffff, off + 0x0e + j * 2);
      }
    }
  }
  return buildMsg32Inner(CODE_NOTIFY_SIMPLE_CHAR_ENTRY, body);
}

/**
 * 전체 로스터 트랜잭션 [0x1200, 0x120f…, 0x1201].
 * 빈 목록이어도 게이트 통과 레코드 1장 포함 (캐릭 합성 아님).
 * @returns {Buffer[]}
 */
export function buildCharacterRosterTransaction({ characters = [] } = {}) {
  const list = Array.isArray(characters) ? characters : [];
  const frames = [buildTransactionSimpleDataBeginInner()];
  if (list.length === 0) {
    // 게이트: group=2 우선, 실패 시 group=3 재시도(FUN_00597ea0). 둘 다 넣어 통과 보장.
    // id/이름은 합성 금지 — 빈 슬롯 게이트 전용.
    frames.push(
      buildNotifySimpleInformationCharacterInner({
        characters: [
          { group: 2, threshold: 0 },
          { group: 3, threshold: 0 },
        ],
      }),
    );
  } else {
    for (let i = 0; i < list.length; i += SIMPLE_CHAR_ENTRY_MAX) {
      frames.push(
        buildNotifySimpleInformationCharacterInner({
          characters: list.slice(i, i + SIMPLE_CHAR_ENTRY_MAX),
        }),
      );
    }
  }
  frames.push(buildTransactionSimpleDataEndInner());
  return frames;
}

// ─── 0x0204 선택 캐릭터 id ────────────────────────────────────────────────────

export function buildSsCharacterIdInner({ characterId = 1 } = {}) {
  const body = Buffer.alloc(4);
  body.writeUInt32LE(characterId >>> 0, 0);
  return buildMsg32Inner(CODE_SS_CHARACTER_ID, body);
}

// ─── 0x0206 SSGameLoginOK ─────────────────────────────────────────────────────

export function buildSsGameLoginOkInner({ status = 1 } = {}) {
  // message32 + 1-byte status (G138 형식)
  return buildMsg32Inner(CODE_SS_GAME_LOGIN_OK, Buffer.from([status & 0xff]));
}

// ─── 0x0323 ResponseInformationCharacter (724B) ───────────────────────────────

function writePstr16Ucs2(payload, str, lenOff, charsOff) {
  const codes = [...String(str ?? '')].slice(0, NAME_MAX);
  payload.writeUInt8(codes.length, lenOff);
  for (let i = 0; i < codes.length; i += 1) {
    payload.writeUInt16LE(codes[i].charCodeAt(0) & 0xffff, charsOff + i * 2);
  }
}

/**
 * 최소 월드 로드용 0x0323. id@0x00 · flagship@0x24 가 앵커 (G164).
 * parentage 이름은 표시용으로만 채우며, 없는 필드는 0.
 */
export function buildInformationCharacterInner({
  characterId = 1,
  gridUnitId = 1,
  power = 1,
  spot = 1,
  online = true,
  lastname = null,
  firstname = null,
  face = null,
  rank = null,
  abilities = null,
  officerCount = null,
  seatEntries = null,
  stamina = 100,
} = {}) {
  const body = Buffer.alloc(CODE_INFO_CHARACTER_BYTES);
  body.writeUInt32LE(characterId >>> 0, 0x00);
  body.writeUInt8(power & 0xff, 0x04);
  body.writeUInt32LE(spot >>> 0, 0x1c);
  body.writeUInt32LE(gridUnitId >>> 0, 0x24);
  if (online) body.writeUInt8(1, 0x64);
  // 스탯 기본값 (전부 0이면 패널이 NO DATA 로 보이는 경우 방지)
  const stats = Array.isArray(abilities) && abilities.length
    ? abilities
    : [50, 50, 50, 50, 50, 50, 50, 50];
  for (let i = 0; i < 8; i += 1) {
    body.writeUInt16LE((stats[i] ?? 50) & 0xffff, 0x188 + i * 4);
  }
  if (Number.isInteger(stamina)) body.writeUInt8(stamina & 0xff, 0x1a9);

  const hasParentage =
    lastname != null || firstname != null || Number.isInteger(face) || Number.isInteger(rank);
  if (hasParentage) {
    body.writeUInt8(1, 0x7d); // parentage_len
    body.writeUInt8(1, 0x80); // truth
    if (lastname != null) writePstr16Ucs2(body, lastname, 0x81, 0x82);
    if (firstname != null) writePstr16Ucs2(body, firstname, 0x9c, 0x9e);
    const display = [lastname, firstname].filter(Boolean).join(' ');
    if (display) writePstr16Ucs2(body, display, 0xb8, 0xba);
    if (Number.isInteger(rank)) body.writeUInt16LE(rank & 0xffff, 0xd6);
    if (Number.isInteger(face)) body.writeUInt32LE(face >>> 0, 0xf4);
  }

  // card/officer count @0x24c — 0이면 유닛 리스트 패널 NO DATA (C002 RE)
  const seats = Array.isArray(seatEntries)
    ? seatEntries
    : [{ character: characterId, role: 0 }];
  const seatCount = Math.min(
    seats.length || (Number.isInteger(officerCount) ? officerCount : 1),
    16,
  );
  body.writeUInt8(Math.max(1, seatCount), 0x24c);
  for (let i = 0; i < Math.max(1, seatCount); i += 1) {
    const entry = seats[i] ?? { character: characterId, role: 0 };
    const cid = Number(entry.character ?? entry.characterId ?? characterId) >>> 0;
    const role = Number(entry.role ?? 0) >>> 0;
    body.writeUInt32LE(cid, 0x254 + i * 8);
    body.writeUInt32LE(role, 0x258 + i * 8);
  }

  return buildMsg32Inner(CODE_INFO_CHARACTER, body);
}

// ─── 0x0325 ResponseInformationUnit (최소 count+id) ───────────────────────────

export function buildInformationUnitInner({ unitId = 1, unitCount = 1, cell = 0, commander = 0 } = {}) {
  const body = Buffer.alloc(CODE_INFO_UNIT_BYTES);
  const count = Math.max(0, Math.min(unitCount, 600));
  body.writeUInt16LE(count, 0);
  if (count > 0) {
    const base = CODE_INFO_UNIT_HEADER;
    body.writeUInt32LE(unitId >>> 0, base + 0x00);
    if (Number.isInteger(commander)) body.writeUInt32LE(commander >>> 0, base + 0x08);
    if (Number.isInteger(cell)) body.writeUInt32LE(cell >>> 0, base + 0x0c);
  }
  return buildMsg32Inner(CODE_INFO_UNIT, body);
}

// ─── 0x200a LobbySessionLoginOK (월드 리다이렉트) ─────────────────────────────

/** IPv4 → 클라 %d.%d.%d.%d 파서용 u32 (octet0 = 하위 바이트) */
export function ipToU32(ip) {
  const octets = String(ip).split('.').map((p) => Number(p));
  if (octets.length !== 4 || octets.some((v) => !Number.isInteger(v) || v < 0 || v > 255)) {
    throw new Error(`invalid IPv4: ${ip}`);
  }
  return ((octets[3] << 24) | (octets[2] << 16) | (octets[1] << 8) | octets[0]) >>> 0;
}

/** raw (비-message32) 0x200a — Input_LobbySessionLoginOK 경로 */
export function buildLobbySessionLoginOkRaw({ ip = '127.0.0.1', port = 47900, token = 0 } = {}) {
  if (!Number.isInteger(port) || port < 0 || port > 0xffff) {
    throw new Error(`invalid world redirect port: ${port}`);
  }
  const inner = Buffer.alloc(2 + CODE_LOBBY_SESSION_LOGIN_OK_PAYLOAD);
  inner.writeUInt16BE(CODE_LOBBY_SESSION_LOGIN_OK, 0);
  inner.writeUInt32BE(ipToU32(ip), 2);
  inner.writeUInt16BE(port & 0xffff, 6);
  inner.writeUInt16BE(0, 8);
  inner.writeUInt32BE((token ?? 0) >>> 0, 10);
  return inner;
}

export function buildLobbySessionLoginOkInner(options = {}) {
  const raw = buildLobbySessionLoginOkRaw(options);
  return buildMsg32Inner(CODE_LOBBY_SESSION_LOGIN_OK, raw.subarray(2));
}

/**
 * 0x2009 LobbySessionLoginRequest 디코드.
 *
 * 라이브 가변 바디 (2026-07-09 create 경로 실측 innerLen=4):
 *   - 4B: [u16BE 0x2009][u16LE sessionId]  — 캐릭 없는 세션 선택(생성)
 *   - 6B: [u16BE 0x2009][u32LE sessionId]
 *   - 10B+: [u16BE 0x2009][u32LE sessionId][u32LE characterId]
 *
 * 주의: 예전 디코더는 len<10 일 때 characterId=sessionId 로 오염시켜
 * 생성 경로를 월드 로그인으로 오인했다. 캐릭 id 없으면 0.
 */
export function decodeLobbySessionLoginReq(inner) {
  const buf = Buffer.isBuffer(inner) ? inner : Buffer.from(inner);
  if (buf.length < 2) throw new RangeError('0x2009 too short');
  const code = buf.readUInt16BE(0);
  if (code !== CODE_LOBBY_SESSION_LOGIN_REQ) {
    throw new RangeError(`0x2009 expected, got 0x${code.toString(16)}`);
  }
  let sessionId = 0;
  let characterId = 0;
  if (buf.length >= 10) {
    sessionId = buf.readUInt32LE(2);
    characterId = buf.readUInt32LE(6);
  } else if (buf.length >= 6) {
    sessionId = buf.readUInt32LE(2);
  } else if (buf.length >= 4) {
    sessionId = buf.readUInt16LE(2);
  }
  return { code, sessionId, characterId };
}

// ─── 0x0b07 NotifyMovedGrid ───────────────────────────────────────────────────

export function buildNotifyMovedGridInner({ units = [], header = {} } = {}) {
  const body = Buffer.alloc(CODE_NOTIFY_MOVED_GRID_BYTES);
  const count = Math.min(units.length, CODE_NOTIFY_MOVED_GRID_MAX_UNITS);
  body.writeUInt32LE((header.dword0 ?? 0) >>> 0, 0);
  body.writeUInt32LE((header.dword1 ?? 0) >>> 0, 4);
  body.writeUInt32LE((header.dword2 ?? 0) >>> 0, 8);
  body.writeUInt32LE((header.dword3 ?? 0) >>> 0, 12);
  body.writeUInt16LE((header.flags ?? 0) & 0xffff, 16);
  body.writeUInt8(count & 0xff, 18); // unit_count @0x12
  for (let i = 0; i < count; i += 1) {
    const off = 0x14 + i * 8;
    body.writeUInt32LE((units[i].unitId ?? 0) >>> 0, off);
    body.writeUInt32LE((units[i].cell ?? 0) >>> 0, off + 4);
  }
  return buildMsg32Inner(CODE_NOTIFY_MOVED_GRID, body);
}

/** 0x0b01 C→S: body 최소 [u32 unitId][u32 cell] (RE: 0x24 body; 앞 필드만 소비) */
export function decodeMoveGridCommand(inner) {
  const buf = Buffer.isBuffer(inner) ? inner : Buffer.from(inner);
  if (buf.length < 2) throw new RangeError('0x0b01 too short');
  const code = buf.readUInt16BE(0);
  if (code !== CODE_CMD_MOVE_GRID) {
    throw new RangeError(`0x0b01 expected, got 0x${code.toString(16)}`);
  }
  const body = buf.subarray(2);
  // 유연 파싱: unitId@0, cell@4 또는 unitCount@12 이후 entry (tactical-style) 무시하고 LE 첫 두 dword
  const unitId = body.length >= 4 ? body.readUInt32LE(0) : 0;
  const cell = body.length >= 8 ? body.readUInt32LE(4) : 0;
  return { code, unitId, cell };
}

// ─── 0x0f1c CommandGridChat ───────────────────────────────────────────────────

export function buildGridChatInner({ text = '', channel = 0, time = 0, castType = 0 } = {}) {
  const chars = Array.from(String(text)).slice(0, 65);
  const body = Buffer.alloc(CODE_CMD_GRID_CHAT_BYTES);
  body.writeUInt32LE(time >>> 0, 0);
  body.writeUInt32LE(channel >>> 0, 4);
  body.writeUInt8(castType & 0xff, 8);
  body.writeUInt8(chars.length, 9);
  for (let i = 0; i < chars.length; i += 1) {
    body.writeUInt16LE(chars[i].charCodeAt(0) & 0xffff, 10 + i * 2);
  }
  return buildMsg32Inner(CODE_CMD_GRID_CHAT, body);
}

export function decodeGridChatCommand(inner) {
  const buf = Buffer.isBuffer(inner) ? inner : Buffer.from(inner);
  if (buf.length < 2) throw new RangeError('0x0f1c too short');
  // C→S raw [u16BE code][body] 또는 S→C message32 [u32 0][u16BE code][body]
  let code;
  let body;
  if (buf.length >= 6 && buf.readUInt32LE(0) === 0 && buf.readUInt16BE(4) === CODE_CMD_GRID_CHAT) {
    code = CODE_CMD_GRID_CHAT;
    body = buf.subarray(6);
  } else {
    code = buf.readUInt16BE(0);
    if (code !== CODE_CMD_GRID_CHAT) {
      throw new RangeError(`0x0f1c expected, got 0x${code.toString(16)}`);
    }
    body = buf.subarray(2);
  }
  if (body.length < 10) throw new RangeError('0x0f1c body too short');
  const time = body.readUInt32LE(0);
  const channel = body.readUInt32LE(4);
  const castType = body.readUInt8(8);
  const msgLen = body.readUInt8(9);
  let text = '';
  for (let i = 0; i < msgLen && 10 + i * 2 + 1 < body.length; i += 1) {
    text += String.fromCharCode(body.readUInt16LE(10 + i * 2));
  }
  return { code, time, channel, castType, text };
}

// ─── 0x0301 ResponseTime ──────────────────────────────────────────────────────

/** 비영 서버 시작 시각 (G143: startTime=0 은 월드 빌드 크래시 후보) */
export function buildResponseTimeInner({ serverTime = 0x40000000 } = {}) {
  const body = Buffer.alloc(4);
  body.writeUInt32LE(serverTime >>> 0, 0);
  return buildMsg32Inner(CODE_RESP_TIME, body);
}

// ─── 0x0f01 / 0x0f03 초기화 OK (1바이트 status=1) ─────────────────────────────

export function buildWorldOkStatusInner(code, { status = 1 } = {}) {
  if (!WORLD_OK_STATUS_CODES.has(code) && code !== CODE_WORLD_INIT_OK && code !== CODE_GRID_INIT_OK) {
    // 0x0317 도 status/selector 로 쓰이나 여기선 1B OK 전용 헬퍼
  }
  return buildMsg32Inner(code & 0xffff, Buffer.from([status & 0xff]));
}

export function buildWorldInitOkInner({ status = 1 } = {}) {
  return buildWorldOkStatusInner(CODE_WORLD_INIT_OK, { status });
}

export function buildGridInitOkInner({ status = 1 } = {}) {
  return buildWorldOkStatusInner(CODE_GRID_INIT_OK, { status });
}

// ─── 0x0b09 / 0x0b0a NotifyEnterGrid Begin/End (그리드진입 = 렌더 트리거) ───────
//
// 근거 (5bd249c logh7-login-protocol.mjs:1197-1209, opcode-reference-2026-06-28.md L211-212):
//   0x0b09 NotifyEnterGridBegin [S→C] 1바이트 body[0]=value — 그리드 진입 개시.
//   0x0b0a NotifyEnterGridEnd   [S→C] 1바이트 body[0]=value — FUN_004c2a80(1)/FUN_004c32a0(1)
//     그리드 배치를 트리거(플레이어 슬롯 월드 엔티티 생성 → PLAYER_INFO 링크 → 전략맵 렌더).
//
// ★value 선택: value=1 인 begin 은 클라 char-record count(clientBase+0x36a5dc)를 0으로 RESET 해
//   직전 0x0325/0x0323 을 무효화한다(구코드 FIX A/G211). 검증된 안전 경로(구코드 0x0f06 grid-enter)는
//   begin/end 모두 value=0 을 써 리셋 없이 배치만 트리거한다. 기본 0.
export const CODE_NOTIFY_ENTER_GRID_BEGIN = 0x0b09;
export const CODE_NOTIFY_ENTER_GRID_END = 0x0b0a;
export const CODE_NOTIFY_ENTER_GRID_BYTES = 0x0001;

export function buildNotifyEnterGridBeginInner({ value = 0 } = {}) {
  return buildMsg32Inner(CODE_NOTIFY_ENTER_GRID_BEGIN, Buffer.from([value & 0xff]));
}

export function buildNotifyEnterGridEndInner({ value = 0 } = {}) {
  return buildMsg32Inner(CODE_NOTIFY_ENTER_GRID_END, Buffer.from([value & 0xff]));
}

// ─── 0x0315 Static grid RLE (빈 보드 또는 cell 배치) ──────────────────────────

/**
 * 전략 셀 그리드 (RE 확정 FUN_004abbb0):
 *   [u8 width=100][u8 height=50][u16 LE rleLen][RLE: (u8 runLen, u8 cellType)…][0 패딩]
 * 고정 수신 크기 0x138c(5004). rleLen = RLE 스트림 바이트 수(1<rleLen<0x1389).
 *
 * ★불변식: ΣrunLen == width*height == 5000. 각 (runLen,cellType) 쌍이 runLen개 셀을
 *   cellType 으로 채운다. 렌더러 워킹그리드(clientBase+0x2c03cc)를 +y*100+x 로 채우려면
 *   전체 5000셀 커버리지가 필수 — 부족하면 빈 워킹그리드 역참조로 크래시.
 * cellType 은 systemId 가 아니라 0x0313 팔레트 인덱스. 빈 우주는 전부 0.
 * unitCell(cells[])이 주어지면 해당 cell 을 cellType 값(기본 3)으로 1칸 배치(ΣrunLen 불변).
 */
export function buildStaticInformationGridInner({
  width = STRATEGIC_GRID_W,
  height = STRATEGIC_GRID_H,
  fillValue = 0,
  cells = [],
} = {}) {
  const w = width & 0xff;
  const h = height & 0xff;
  const grid = new Uint8Array(w * h).fill(fillValue & 0xff);
  for (const cell of cells) {
    const col = cell.col ?? (Number.isInteger(cell.cell) ? cell.cell % w : -1);
    const row = cell.row ?? (Number.isInteger(cell.cell) ? Math.floor(cell.cell / w) : -1);
    const value = (cell.value ?? 3) & 0xff;
    if (col >= 0 && col < w && row >= 0 && row < h) {
      grid[row * w + col] = value;
    }
  }
  // RLE encode
  const pairs = [];
  let i = 0;
  while (i < grid.length) {
    const value = grid[i];
    let run = 1;
    while (i + run < grid.length && grid[i + run] === value && run < 255) run += 1;
    pairs.push(run, value);
    i += run;
  }
  const rle = Buffer.from(pairs);
  const payload = Buffer.alloc(CODE_STATIC_GRID_BYTES);
  payload.writeUInt8(w, 0);
  payload.writeUInt8(h, 1);
  payload.writeUInt16LE(rle.length & 0xffff, 2); // rleLen u16 LE (RE 확정 FUN_004abbb0)
  rle.copy(payload, 4, 0, Math.min(rle.length, CODE_STATIC_GRID_BYTES - 4));
  return buildMsg32Inner(CODE_STATIC_GRID, payload);
}

// ─── 월드 진입 후 어드미션 핸드셰이크 (NOW LOADING 해제) ──────────────────────
//
// 근거: docs/reference/restored-from-git/logh7-inworld-progress.md (P27/P29 라이브 트레이스)
//   8종 월드레코드 수신 후 클라 부트스트랩 요청열:
//     0x0304→0x0305, 0x0306→0x0307, 0x0314→0x0315, 0x0312→0x0313,
//     0x030a→0x030b, 0x030e→0x030f, 0x0310→0x0311 (+ 0x031c→0x031d 는 별도 static-base)
//   요청은 페이로드 없는 2B [u16BE code]. 서버가 대응 응답(code+1)을 안 주면 클라가
//   NOW LOADING 에서 영구 정지한다.
//
// 응답 포맷 확정도:
//   0x0313 ResponseStaticInformationGridType — 문서 확정 (render-interaction-contract L178):
//     고정 5004B, payload[0]=count, 레코드는 1 + value*3 에 [contentId, klass, variant].
//   0x0315 ResponseStaticInformationGrid — 문서 확정 (L179): 기존 buildStaticInformationGridInner.
//   0x0305/0x0307/0x030b/0x030f/0x0311 — 바디 포맷 문서 미확정. "빈 walker"(코드만) 최소 응답.
//     (P1 라이브: empty walker 응답은 decode no-op → walk 안 멈춤. 안전.)

export const CODE_REQ_SESSION_WALKER = 0x0304; // C→S
export const CODE_RESP_SESSION_WALKER = 0x0305; // S→C (빈 InformationSession walker)
export const CODE_REQ_DUTY_WALKER = 0x0306;
export const CODE_RESP_DUTY_WALKER = 0x0307;
export const CODE_REQ_ADMISSION_0308 = 0x0308; // C→S (신규: 정지 원인 — case 없어 lobby 로 샜음)
export const CODE_RESP_ADMISSION_0309 = 0x0309; // S→C 풀사이즈 0채움 1372B
export const CODE_REQ_ADMISSION_030A = 0x030a;
export const CODE_RESP_ADMISSION_030B = 0x030b;
export const CODE_REQ_ADMISSION_030C = 0x030c; // C→S (신규)
export const CODE_RESP_ADMISSION_030D = 0x030d; // S→C 풀사이즈 0채움 388B
export const CODE_REQ_ADMISSION_030E = 0x030e;
export const CODE_RESP_ADMISSION_030F = 0x030f;
export const CODE_REQ_ADMISSION_0310 = 0x0310;
export const CODE_RESP_ADMISSION_0311 = 0x0311;
export const CODE_REQ_STATIC_GRID_TYPE = 0x0312; // C→S ResponseStaticInformationGridType 요청
export const CODE_STATIC_GRID_TYPE = 0x0313; // S→C
export const CODE_STATIC_GRID_TYPE_BYTES = 0x138c; // 5004 (0x0315 와 동일 고정 크기)
export const CODE_REQ_STATIC_GRID = 0x0314; // C→S ResponseStaticInformationGrid 요청
export const CODE_REQ_STATIC_BASE = 0x031c; // C→S ResponseStaticInformationBase 요청
export const CODE_RESP_STATIC_BASE_031D = 0x031d; // S→C static-base (고정 21004B)

/**
 * static-info 어드미션 응답 opcode → body 바이트 크기 (클라 사이저 FUN_004b8b00 직접 인용, RE 확정).
 *
 * 왜 필요한가: 클라는 이 응답들을 "고정크기 프레이밍"으로 처리한다 — 사이저가 opcode별
 * 고정크기를 반환하고, enqueue 가 길이검사 없이 그 크기만큼 recv 버퍼에서 복사한다.
 * 서버가 빈(0바이트) body 로 응답하면 클라가 최대 21KB 앞으로 over-read → access violation
 * ("abnormal program termination"). 따라서 이 표의 opcode 는 반드시 풀사이즈 body 로 응답한다.
 *
 * zero-fill 안전성(RE 확정): walker 가 고정 루프에서 body 로부터 count/포인터를 유도하지
 * 않으므로 전부 0이면 "빈 테이블"로 무해하게 소비된다. 데이터 날조가 아니라 빈(0) 테이블이며,
 * 실제 세션/캐릭터/맵 콘텐츠는 미승격이다.
 */
export const STATIC_INFO_BODY_SIZES = Object.freeze({
  0x0305: 0x520a, // 21002 InformationSession walker
  0x0307: 0xe5b2, // 58802 Duty walker
  0x0309: 0x055c, // 1372
  0x030b: 0x6d64, // 28004
  0x030d: 0x0184, // 388
  0x030f: 0x0034, // 52
  0x0311: 0x01b0, // 432
  0x0313: 0x138c, // 5004 (전용 빌더 buildStaticInformationGridTypeInner 로 헤더 채움)
  0x0315: 0x138c, // 5004 (전용 빌더 buildStaticInformationGridInner 로 헤더 채움)
  0x031d: 0x520c, // 21004 static-base
});

/**
 * 0x0313 ResponseStaticInformationGridType (고정 5004B).
 * 문서 확정 포맷: payload[0]=count; 각 map object value v 에 대해 1 + v*3 위치에
 * [contentId, klass, variant] (klass==3 이 마커로 렌더/클릭). 기본 empty(count 0).
 * 근거: docs/reference/legacy-evidence/logh7-render-interaction-contract.md L178.
 */
/**
 * 최소 유효 섹터그리드 타입 팔레트 (콘텐츠 미승격, 날조 아님).
 *
 * 근거(5bd249c logh7-login-protocol.mjs buildStaticInformationGridTypeInner 주석):
 *   constmsg group 0x18 subId 0..2 가 그리드-TYPE 라벨이다 —
 *     0 = プラズマ嵐(플라스마 폭풍), 1 = 空間(공간), 2 = 航行不能(항행 불능 그리드).
 *   실 성계 이름(アイゼンヘルツ …)은 subId 3 부터. klass==3 만 클릭 가능한 섹터 마커로 배치된다.
 *
 * 따라서 이 3개는 클라가 자체 보유한 실 그리드-타입 라벨이며(원본 데이터, 서버 날조 아님),
 * klass=0(비클릭 terrain 타입)으로 두어 팬텀 마커(공간 그리드 오클릭)를 만들지 않는다.
 * 빈 셀그리드(0x0315 전부 value 0)와 함께 써도 클릭 오브젝트(value 3..88)를 배치하지 않으므로
 * 렌더 안전 — "빈 팔레트(count=0)" 대신 "최소 유효 섹터그리드 타입 구조"를 제공한다.
 */
export const DEFAULT_SECTOR_GRID_TYPES = Object.freeze([
  { value: 0, contentId: 0, klass: 0, variant: 0 }, // プラズマ嵐 / 플라스마 폭풍
  { value: 1, contentId: 1, klass: 0, variant: 0 }, // 空間 / 공간
  { value: 2, contentId: 2, klass: 0, variant: 0 }, // 航行不能 / 항행 불능 그리드
]);

/**
 * 0x0313 grid-type 팔레트. count 는 max(value)+1 (구 빌더 FUN_00413050 파서 관례 — byte0=count,
 * 레코드는 payload offset 1+value*3 에 순차 read). objects 미지정 시 empty(count 0).
 * 세션 플로우는 DEFAULT_SECTOR_GRID_TYPES 를 넘겨 최소 유효 섹터그리드 타입을 방출한다.
 */
export function buildStaticInformationGridTypeInner({ objects = [] } = {}) {
  const body = Buffer.alloc(CODE_STATIC_GRID_TYPE_BYTES);
  const list = Array.isArray(objects) ? objects : [];
  // count = max(value)+1 (구 빌더 관례): 셀 value v 가 palette index v 로 해석되도록 filler 유지.
  const count = list.length === 0
    ? 0
    : Math.min(Math.max(...list.map((o) => (Number(o?.value ?? 0) & 0xff))) + 1, 255);
  body.writeUInt8(count & 0xff, 0);
  for (const obj of list) {
    const value = Number(obj?.value ?? 0) & 0xff;
    const off = 1 + value * 3;
    if (off + 3 > body.length) continue;
    body.writeUInt8((obj.contentId ?? 0) & 0xff, off);
    body.writeUInt8((obj.klass ?? 0) & 0xff, off + 1);
    body.writeUInt8((obj.variant ?? 0) & 0xff, off + 2);
  }
  return buildMsg32Inner(CODE_STATIC_GRID_TYPE, body);
}

/**
 * static-info 어드미션 응답 (opcode + 풀사이즈 0채움 body).
 *
 * STATIC_INFO_BODY_SIZES 에 있는 opcode 는 그 고정크기(RE 확정)만큼 0채움 body 를 낸다 —
 * 빈 body 를 내면 클라 고정크기 프레이밍이 recv 버퍼를 over-read 해 크래시한다.
 * zero=빈 테이블, 콘텐츠 미승격(데이터 날조 아님). Buffer.alloc 이라 0 초기화 보장
 * (allocUnsafe 금지 — garbage 위험). 표에 없는 순수 ack 코드는 기존대로 빈 body 유지.
 */
export function buildEmptyWalkerInner(code) {
  const size = STATIC_INFO_BODY_SIZES[code & 0xffff] ?? 0;
  return buildMsg32Inner(code & 0xffff, Buffer.alloc(size));
}

/**
 * static-info 어드미션 walker 요청 code → 응답 code 매핑 (req 짝수 → resp = req+1 홀수).
 *
 * 전부 buildEmptyWalkerInner 로 처리 — 응답 code 의 STATIC_INFO_BODY_SIZES 고정크기
 * 0채움 body(빈 테이블). 클라 고정크기 프레이밍이 recv 버퍼를 over-read 하지 않도록
 * 반드시 풀사이즈로 응답한다. 0x0308/0x030c 미배선 시 lobby 라우터로 새어 NOW LOADING 정지.
 *
 * 전용 빌더가 필요한 0x0312→0x0313 / 0x0314→0x0315 (헤더 채움)는 이 표에 넣지 않고
 * buildAdmissionResponseInner 에서 별도 분기한다.
 */
export const ADMISSION_WALKER_REQ_RESP = Object.freeze({
  [CODE_REQ_SESSION_WALKER]: CODE_RESP_SESSION_WALKER, // 0x0304 → 0x0305 (21002B)
  [CODE_REQ_DUTY_WALKER]: CODE_RESP_DUTY_WALKER, // 0x0306 → 0x0307 (58802B)
  [CODE_REQ_ADMISSION_0308]: CODE_RESP_ADMISSION_0309, // 0x0308 → 0x0309 (1372B, 신규)
  [CODE_REQ_ADMISSION_030A]: CODE_RESP_ADMISSION_030B, // 0x030a → 0x030b (28004B)
  [CODE_REQ_ADMISSION_030C]: CODE_RESP_ADMISSION_030D, // 0x030c → 0x030d (388B, 신규)
  [CODE_REQ_ADMISSION_030E]: CODE_RESP_ADMISSION_030F, // 0x030e → 0x030f (52B)
  [CODE_REQ_ADMISSION_0310]: CODE_RESP_ADMISSION_0311, // 0x0310 → 0x0311 (432B)
  [CODE_REQ_STATIC_BASE]: CODE_RESP_STATIC_BASE_031D, // 0x031c → 0x031d (21004B)
});

/**
 * 전용 빌더가 필요한 어드미션 / 월드-init 핸드셰이크 요청 code.
 *   0x0312→0x0313 · 0x0314→0x0315 : static-info 그리드(헤더 채움 5004B)
 *   0x0300→0x0301 : RequestResponseTime → ResponseTime (4B LE start time)
 *   0x0f00→0x0f01 : RequestWorldInitialize → WorldInitialize OK (status=1)
 *   0x0f02→0x0f03 : RequestGridInitialize → GridInitialize OK (status=1)
 *
 * 근거: docs/reference/restored-from-git/logh7-inworld-progress.md P28/P30 라이브 트레이스 +
 *   docs/logh7-loop-state.md P28/P30 시퀀스 (static-info→0x0300→0x0f00→0x0f02(→0x0f03)→0x0f06(→0x0f07)):
 *   static-info 완주 후 0x0300→0x0301, 0x0f00→0x0f01, 0x0f02→0x0f03 순으로 흘러 strategic HUD 도달
 *   (Now Loading 아님). 응답 포맷은 기존 RE 빌더 재사용(날조 없음):
 *   buildResponseTimeInner / buildWorldInitOkInner(status=1) / buildGridInitOkInner(status=1).
 *
 * ★0x0f02 라이브 정정: 문서는 0x0f02 를 "서버 push" 로 기술했으나 실측상 클라가 0x0f02 를
 *   요청으로 보낸다(inworld-progress L716 "0x0f02 plus …/0x0f03", L869 "0x0f02 fell back to a
 *   plain 0x0f03"; loop-state P28/P30 "0x0f02(→0x0f03)"). 따라서 req→resp(→0x0f03)로 배선.
 *   응답은 최소(plain 0x0f03, status=1, WORLD_OK_STATUS_CODES · client+0x35f357). 조기 rich
 *   0x0f02 위치/스탯 주입은 라이브 회귀 위험이라 분리(render-interaction-contract L27/L124-128).
 *
 * 이 맵의 code 는 isAdmissionRequestCode 로도 잡혀 playable-server 가 world 로 라우팅한다.
 * 미배선 시 lobby 라우터로 새어 응답 없음 → 클라가 code+1 응답을 무한 대기(NOW LOADING 정지).
 *
 * 근거 없어 배선 안 한 후속 코드(다음 라이브 특정 대상 — 추측 응답 금지, 크래시/황제 위험):
 *   0x0f06→0x0f07 (messenger-stat tick): 0x0f07 바이트 포맷 미확정. 검증자가 0x0f07 P0
 *     오승격 적발(loop-state journal). render-contract 는 라이브 관측(P1/P2)만 기록·레이아웃 없음.
 *   0x0f04→0x0f05 / 0x0f08→0x0f09: UI 아이콘 트리거(부트스트랩 아님)·트리 내 빌더/포맷 없음.
 *   0x0322→0x0323 / 0x034e→0x034f: 월드 진입 후 메뉴 PULL 리드(NOW LOADING 정지 경로 아님).
 *   0x031e→0x031f / 0x0320→0x0321 / 0x033b: base/facility 패널 — 현재 리셋 트리에 빌더 없음.
 */
const ADMISSION_DEDICATED_BUILDERS = Object.freeze({
  // 0x0312 → 0x0313: 빈 팔레트(count=0) 대신 최소 유효 섹터그리드 타입(플라스마 폭풍/공간/항행불능,
  // klass=0 비클릭). 실 GridType 구조여야 그리드가 terrain 타입을 해석해 배치·렌더한다.
  [CODE_REQ_STATIC_GRID_TYPE]: () => buildStaticInformationGridTypeInner({ objects: DEFAULT_SECTOR_GRID_TYPES }), // 0x0312 → 0x0313
  [CODE_REQ_STATIC_GRID]: () => buildStaticInformationGridInner({ cells: [] }), // 0x0314 → 0x0315
  [CODE_REQ_RESPONSE_TIME]: () => buildResponseTimeInner(), // 0x0300 → 0x0301
  [CODE_REQ_WORLD_INIT]: () => buildWorldInitOkInner({ status: 1 }), // 0x0f00 → 0x0f01
  [CODE_REQ_GRID_INIT]: () => buildGridInitOkInner({ status: 1 }), // 0x0f02 → 0x0f03 (plain OK)
});

/**
 * 어드미션 요청 code → 응답 message32. handleWorldInner 가 사용.
 * 전용 빌더(0x0313/0x0315)만 실제 바디, 나머지는 빈 walker(풀사이즈 0채움). 미배선은 null.
 */
export function buildAdmissionResponseInner(reqCode) {
  const code = reqCode & 0xffff;
  const dedicated = ADMISSION_DEDICATED_BUILDERS[code];
  if (dedicated) return dedicated();
  const respCode = ADMISSION_WALKER_REQ_RESP[code];
  if (respCode == null) return null;
  return buildEmptyWalkerInner(respCode);
}

/** 어드미션 요청 코드 여부 (미배선 신규 req 가 lobby 로 새지 않도록 라우터가 사용) */
export function isAdmissionRequestCode(code) {
  const c = code & 0xffff;
  return c in ADMISSION_WALKER_REQ_RESP || c in ADMISSION_DEDICATED_BUILDERS;
}

// ─── 월드 진입 시퀀스 (RE 최소 + 초기화 OK) ───────────────────────────────────

/**
 * 월드 세션 진입 S→C 레코드 열 (RE 근거, 미확정 바디 날조 없음).
 *
 * 순서 (RE: 0x0206 이 월드 파이프라인 활성 0x35837e → 레코드가 흐른다):
 *   0x0206 SSGameLoginOK (선두, 0x0205 응답)
 *   0x0204 선택 캐릭터 id
 *   0x0323 캐릭터 레코드 (724B — 오브젝트 테이블 채움, 렌더러 크래시 방지 필수)
 *   0x0325 유닛 테이블 (고정 52804B, 최소 count+id)
 *
 * 이 4코드는 클라가 워크에서 요청하지 않는 unsolicited 테이블 채움이라 push(ring 상관 대상 아님).
 *
 * ★send-ring reactive화 (docs/logh7-loop-state.md "M3 정지 확정: request-response send-ring
 * 상관 실패"): 실클라 로더(FUN_004b76e0)는 엄격한 요청-응답 send-ring 파이프라인 —
 * 요청 1개 송신 → 매칭 응답이 ring 엔트리 pop → 다음 요청, ring 이 빌 때만 다음 스텝 진행.
 * 예전 배치는 0x0301/0x0f01/0x0f03/0x0315 를 클라가 요청하기 전에 pre-push 했는데, 그 시점
 * ring 에 매칭 엔트리가 없어 dispatch(데이터 저장)만 되고 ring 이 안 비워져 로더가 영구 정지
 * (NOW LOADING) 했다. 따라서 이 4코드는 배치에서 제거하고, 클라 후속 요청
 * (0x0300→0x0301, 0x0f00→0x0f01, 0x0f02→0x0f03, 0x0314→0x0315)에 대해
 * buildAdmissionResponseInner/ADMISSION_DEDICATED_BUILDERS 가 reactive 로 응답한다.
 *
 * 0x031d/0x031f base 바디는 오프셋 미확정 → 생략 (fail-closed).
 */
/**
 * ★황제(emperor) 재발 금지:
 * - characterId 기본 1 금지 (캐논 프리드리히 4세/황제 슬롯과 충돌 → HUD "황제")
 * - 빈 이름에 Test/Pilot 등 더미 채우기 금지 (클라 빈이름 → 기본 "황제" 폴백과 동일 증상)
 * - 호출 측이 실제 세션 캐릭터 필드를 넘겨야 한다
 */
export function buildWorldEntryInners({
  characterId,
  gridUnitId,
  unitCell = 2588,
  power = 0,
  spot = 0,
  lastname = '',
  firstname = '',
  face = 0,
  rank = 0,
  abilities = null,
  serverTime = 0x40000000,
  includeEmptyGrid = true,
  placeUnitCellOnGrid = true,
  officerCount = 0,
} = {}) {
  if (!Number.isInteger(characterId) || characterId <= 0) {
    throw new Error('buildWorldEntryInners: characterId required (no default id=1 / emperor trap)');
  }
  if (!Number.isInteger(gridUnitId) || gridUnitId <= 0) {
    throw new Error('buildWorldEntryInners: gridUnitId required');
  }
  // unsolicited 테이블 채움 4코드만 push. 요청-응답 4코드(0x0301/0x0f01/0x0f03/0x0315)는
  // pre-push 시 send-ring 미배수로 로더 정지 → reactive 어드미션 핸들러로 분리(위 JSDoc 참조).
  const emits = [
    // 0x0206 을 선두로: 월드 파이프라인 활성(0x35837e) 후 레코드가 흐른다 (RE 순서).
    buildSsGameLoginOkInner({ status: 1 }),
    buildSsCharacterIdInner({ characterId }),
    buildInformationCharacterInner({
      characterId,
      gridUnitId,
      power,
      spot,
      online: true,
      lastname,
      firstname,
      face,
      rank,
      abilities: Array.isArray(abilities) && abilities.length ? abilities : null,
      officerCount,
    }),
    buildInformationUnitInner({
      unitId: gridUnitId,
      unitCount: 1,
      cell: unitCell,
      commander: characterId,
    }),
  ];
  return emits;
}

// ─── 월드-ready push 시퀀스 (NOW LOADING 해제) ────────────────────────────────
//
// 근거:
//   docs/logh7-loop-state.md 최상단 "M3 블로커 해법 발견: 서버가 world-ready 시퀀스를 PUSH해야"
//   docs/reference/restored-from-git/logh7-live-world-entry-2026-06-23.md:9 성공 트레이스
//     (…0x0325 → 0x0b09/0x0b0a → 0x0f02(월드초기화) → 0x0f06/0x0f07)
//   docs/reference/legacy-evidence/logh7-render-interaction-contract.md L27/L102
//     (grid-enter begin/end + 조기 0x0f02 위치주입 크래시 경고 → 최소 레코드 유지)
//
// 왜 push 인가: 실 0x0323+유효 그리드로 클라를 채우면 클라가 어드미션 3요청(0x0304/0x0306/0x0314)
// 만 하고 NOW LOADING 에서 정지한다(더는 0x0f00/0x0f02/0x0f06 을 요청하지 않음). 이 상태는 정상 —
// 서버의 그리드진입/월드초기화 능동 push 를 기다리는 것. 클라 0x0314 직후 이 시퀀스를 순서대로 push:
//   0x0b09(EnterGridBegin) → 0x0325(유닛 refresh) + 0x0323(캐릭터 refresh)
//   → 0x0b0a(EnterGridEnd, 렌더 트리거) → 0x0f03(GridInitialize OK, status=1).
//
// ★ grid-enter 계약(render-contract L102): "0x0b09/0x0b0a grid-enter begin/end, with 0x0325/0x0323
//   refreshed **between** begin/end". 즉 유닛/오브젝트 테이블 갱신(0x0325 유닛, 0x0323 캐릭터)은
//   반드시 begin/end 괄호 **안**에서 일어나야 그리드가 begin/end 안에서 플레이어 유닛을 배치한다.
//   0x0325 가 begin 밖(앞)이거나 0x0323 refresh 가 없으면 NOW LOADING 이 해제되지 않는다(라이브 확정).
//   0x0323 = 플레이어 실 시드 캐릭터 레코드(world-enter 의 buildInformationCharacterInner 재사용).
//   0x0b09/0x0b0a value=0 유지: value=1 은 char count 를 리셋(구코드 FIX A)하므로, count 리셋 없이
//   begin(value=0) 뒤에 0x0323 을 refresh 해도 안전.
//
// ★"0x0f02" 정정(근거 기반): opcode-reference L234 + 구코드 login-session:149 확정 —
//   0x0f02 는 RequestGridInitialize [C→S]. 이에 대한 S→C 신호는 0x0f03(ResponseGridInitialize_OK,
//   client+0x35f357). 트레이스의 "0x0f02(월드초기화)"는 그리드-init 단계를 가리키며 서버가 실제 방출하는
//   레코드는 0x0f03 이다(별도 S→C 0x0f02 바디는 존재/근거 없음 → 날조 금지). 순서 불변식(0x0f02 는
//   0x0b09/0x0b0a 이후)은 0x0f03 을 grid-enter 뒤에 두어 충족한다.
//
// 미배선(근거 없어 제외, 추측 시 크래시/오승격 위험):
//   0x0f06→0x0f07: 0x0f07(ResponseInformationMessengerStatus) 바디 포맷 미확정(검증자 P0 오승격 적발).
//     구코드에선 클라 0x0f06 요청에 reactive 로만 응답했다 — unsolicited push 근거 없음.
export function buildWorldReadyPushInners({
  unitId,
  unitCell = 2588,
  commander = 0,
  gridBeginValue = 0,
  gridEndValue = 0,
  // 0x0323 refresh 필드(begin/end 사이 캐릭터 레코드). commander 를 characterId 앵커로 사용.
  power = 0,
  spot = 1,
  lastname = '',
  firstname = '',
  face = 0,
  rank = 0,
  abilities = null,
  officerCount = 0,
  // LOGH_STRAT_GRID_EARLY: begin 전에 0x0313 grid-type 를 조기 push(reactive 0x0312 응답과 합쳐 ×2).
  includeEarlyGridType = false,
} = {}) {
  if (!Number.isInteger(unitId) || unitId <= 0) {
    throw new Error('buildWorldReadyPushInners: unitId required (no synthetic id)');
  }
  // 0x0323 캐릭터 refresh 레코드 팩토리 (commander>0 일 때만). world-enter 의
  // buildInformationCharacterInner 재사용 — 오브젝트 테이블 갱신(그리드 유닛 배치).
  const makeChar = () => buildInformationCharacterInner({
    characterId: commander,
    gridUnitId: unitId,
    power,
    spot,
    online: true,
    lastname,
    firstname,
    face,
    rank,
    abilities: Array.isArray(abilities) && abilities.length ? abilities : null,
    officerCount,
  });
  const makeUnit = () => buildInformationUnitInner({ unitId, unitCount: 1, cell: unitCell, commander });
  const hasChar = Number.isInteger(commander) && commander > 0;

  const inners = [];
  // early-grid(LOGH_STRAT_GRID_EARLY): begin 전에 grid-type 팔레트를 한 번 더 방출.
  // grid-type 테이블(terrain 타입)이 grid-enter 배치 전에 resident 여야 셀 value 를 해석한다.
  if (includeEarlyGridType) {
    inners.push(buildStaticInformationGridTypeInner({ objects: DEFAULT_SECTOR_GRID_TYPES }));
  }
  // 계약 순서(render-contract L102) + A6 FIX(inworld-progress P7):
  //   0x0b09(begin) → [0x0325 유닛 + 0x0323 캐릭터] refresh ×2 → 0x0b0a(end) → 0x0f03.
  // ★×2 재전송(P7 FIX A "re-send 0x0325 + 0x0323 BETWEEN 0x0b09 and 0x0b0a"): FUN_004c2a80(1)이
  //   0x0b0a 에서 플레이어 슬롯 엔티티(clientBase+0xc)를 빌드하려면 유닛/캐릭터 레코드가 begin/end
  //   사이에 resident 여야 한다. 클라 Field_Import 완료 타이밍(mode==2) 편차로 1회 refresh 는
  //   0x0b0a 처리 시점에 미도달할 수 있어 두 번 방출(refresh ×2)로 resident 를 보장한다.
  inners.push(buildNotifyEnterGridBeginInner({ value: gridBeginValue }));
  inners.push(makeUnit());
  if (hasChar) inners.push(makeChar());
  inners.push(makeUnit());
  if (hasChar) inners.push(makeChar());
  inners.push(buildNotifyEnterGridEndInner({ value: gridEndValue }));
  inners.push(buildGridInitOkInner({ status: 1 })); // 0x0f03 — 트레이스 "0x0f02(월드초기화)"의 S→C 신호
  return inners;
}

/** 로그인/로비/월드 S→C 코드 인벤토리 (문서·구현 대조용) */
export function listRequiredServerEmitCodes() {
  return {
    login: {
      keysetup: 0x0031,
      redirectOk: 0x7001,
      loginNg: 0x7002,
    },
    lobby: {
      loginOk: 0x2001,
      accountRoster: 0x1001,
      charCards: 0x2004,
      sessionLoginOk: 0x200a,
      generateOk: 0x1008,
      deleteOk: 0x2008,
    },
    worldEntry: {
      characterId: CODE_SS_CHARACTER_ID,
      characterRecord: CODE_INFO_CHARACTER,
      unitTable: CODE_INFO_UNIT,
      responseTime: CODE_RESP_TIME,
      worldInitOk: CODE_WORLD_INIT_OK,
      gridInitOk: CODE_GRID_INIT_OK,
      staticGrid: CODE_STATIC_GRID,
      gameLoginOk: CODE_SS_GAME_LOGIN_OK,
    },
    inWorldMp: {
      notifyMovedGrid: CODE_NOTIFY_MOVED_GRID,
      gridChat: CODE_CMD_GRID_CHAT,
    },
    omittedUnproven: [
      '0x031d ResponseStaticInformationBase (layout partial)',
      '0x031f ResponseInformationSystem (provisional offsets)',
      '0x0321 ResponseInformationInstitution',
    ],
  };
}

/** message32 배열에서 code 목록 추출 (테스트/감사용) */
export function listWorldEntryCodes(inners) {
  return inners.map((inner) => readMsg32Code(inner));
}
