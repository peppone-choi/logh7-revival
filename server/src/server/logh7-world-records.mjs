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
export const CODE_RESP_TIME = 0x0301; // S→C ResponseTime — 4B LE start time
export const CODE_WORLD_INIT_OK = 0x0f01; // ResponseWorldInitialize_OK → client+0x35f356
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

// ─── 0x0315 Static grid RLE (빈 보드 또는 cell 배치) ──────────────────────────

/**
 * 전략 셀 그리드. FUN_004abbb0: [u8 w][u8 h][u16 BE rleByteCount]{run,value}...
 * 고정 수신 크기 0x138c. 기본 100×50 전부 0 (성계 마커 없음 — 좌표 날조 금지).
 * unitCell 이 주어지면 해당 cell 에 systemId 값(기본 3) 1칸만 배치.
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
  payload.writeUInt16BE(rle.length & 0xffff, 2);
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
export const CODE_REQ_ADMISSION_030A = 0x030a;
export const CODE_RESP_ADMISSION_030B = 0x030b;
export const CODE_REQ_ADMISSION_030E = 0x030e;
export const CODE_RESP_ADMISSION_030F = 0x030f;
export const CODE_REQ_ADMISSION_0310 = 0x0310;
export const CODE_RESP_ADMISSION_0311 = 0x0311;
export const CODE_REQ_STATIC_GRID_TYPE = 0x0312; // C→S ResponseStaticInformationGridType 요청
export const CODE_STATIC_GRID_TYPE = 0x0313; // S→C
export const CODE_STATIC_GRID_TYPE_BYTES = 0x138c; // 5004 (0x0315 와 동일 고정 크기)
export const CODE_REQ_STATIC_GRID = 0x0314; // C→S ResponseStaticInformationGrid 요청

/**
 * 0x0313 ResponseStaticInformationGridType (고정 5004B).
 * 문서 확정 포맷: payload[0]=count; 각 map object value v 에 대해 1 + v*3 위치에
 * [contentId, klass, variant] (klass==3 이 마커로 렌더/클릭). 기본 empty(count 0).
 * 근거: docs/reference/legacy-evidence/logh7-render-interaction-contract.md L178.
 */
export function buildStaticInformationGridTypeInner({ objects = [] } = {}) {
  const body = Buffer.alloc(CODE_STATIC_GRID_TYPE_BYTES);
  const list = Array.isArray(objects) ? objects : [];
  const count = Math.min(list.length, 255);
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
 * 빈 walker/ack 응답 (코드만, body 없음). 바디 포맷 미확정 어드미션 응답용.
 * P1 라이브: empty walker 응답은 클라 decode no-op → world-init walk 를 멈추지 않는다.
 */
export function buildEmptyWalkerInner(code) {
  return buildMsg32Inner(code & 0xffff, Buffer.alloc(0));
}

/**
 * 어드미션 요청 code → 응답 빌더 매핑. handleWorldInner 가 사용.
 * 문서 확정 응답(0x0313/0x0315)만 실제 바디, 나머지는 빈 walker(최소 응답).
 */
export function buildAdmissionResponseInner(reqCode) {
  switch (reqCode) {
    case CODE_REQ_SESSION_WALKER: // 0x0304 → 0x0305 (빈 InformationSession walker, 미확정)
      return buildEmptyWalkerInner(CODE_RESP_SESSION_WALKER);
    case CODE_REQ_DUTY_WALKER: // 0x0306 → 0x0307 (빈 walker, 미확정)
      return buildEmptyWalkerInner(CODE_RESP_DUTY_WALKER);
    case CODE_REQ_ADMISSION_030A: // 0x030a → 0x030b (빈 ack, 미확정)
      return buildEmptyWalkerInner(CODE_RESP_ADMISSION_030B);
    case CODE_REQ_ADMISSION_030E: // 0x030e → 0x030f (빈 ack, 미확정)
      return buildEmptyWalkerInner(CODE_RESP_ADMISSION_030F);
    case CODE_REQ_ADMISSION_0310: // 0x0310 → 0x0311 (빈 ack, 미확정)
      return buildEmptyWalkerInner(CODE_RESP_ADMISSION_0311);
    case CODE_REQ_STATIC_GRID_TYPE: // 0x0312 → 0x0313 (문서 확정 포맷, empty content)
      return buildStaticInformationGridTypeInner({ objects: [] });
    case CODE_REQ_STATIC_GRID: // 0x0314 → 0x0315 (문서 확정, empty grid — 비-empty 는 walk stall)
      return buildStaticInformationGridInner({ cells: [] });
    default:
      return null;
  }
}

/** 어드미션 요청 코드 여부 */
export function isAdmissionRequestCode(code) {
  return buildAdmissionResponseInner(code) != null;
}

// ─── 월드 진입 시퀀스 (RE 최소 + 초기화 OK) ───────────────────────────────────

/**
 * 월드 세션 진입 S→C 레코드 열 (RE 근거, 미확정 바디 날조 없음).
 *
 * 순서 (RE: 0x0206 이 월드 파이프라인 활성 0x35837e → 레코드가 흐른다):
 *   0x0206 SSGameLoginOK (선두)
 *   0x0204 선택 캐릭터 id
 *   0x0323 캐릭터 레코드 (724B)
 *   0x0325 유닛 테이블 (고정 52804B, 최소 count+id)
 *   0x0301 ResponseTime (비영)
 *   0x0f01 WorldInitialize OK (status=1)
 *   0x0f03 GridInitialize OK (status=1)
 *   0x0315 Static grid (100×50 RLE, 기본 empty; unitCell 있으면 1마커)
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
      officerCount,
    }),
    buildInformationUnitInner({
      unitId: gridUnitId,
      unitCount: 1,
      cell: unitCell,
      commander: characterId,
    }),
    buildResponseTimeInner({ serverTime }),
    buildWorldInitOkInner({ status: 1 }),
    buildGridInitOkInner({ status: 1 }),
  ];
  if (includeEmptyGrid) {
    const cells = placeUnitCellOnGrid && Number.isInteger(unitCell)
      ? [{ cell: unitCell, value: 3 }]
      : [];
    emits.push(buildStaticInformationGridInner({ cells }));
  }
  return emits;
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
