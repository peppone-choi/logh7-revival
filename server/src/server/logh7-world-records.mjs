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
import { buildNotifyInformationCharacterInner } from './codec/personnel-action-list.mjs';

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
export const CODE_NOTIFY_INFORMATION_CHARACTER = 0x0356;
export const CODE_INFO_UNIT = 0x0325; // S→C ResponseInformationUnit
export const CODE_INFO_UNIT_BYTES = 0xce44; // 52804 fixed receive size
export const CODE_INFO_UNIT_HEADER = 4; // 클라이언트 native destination: [u16 count][u16 pad]
export const CODE_INFO_UNIT_WIRE_HEADER = 2; // wire cursor: u16 count 직후 첫 행 시작
export const CODE_INFO_UNIT_STRIDE = 0x58; // 클라이언트 native destination element stride
export const CODE_INFO_UNIT_MAX = 600; // 클라 파서 reject "information_size > 600" (0x763848)
export const UNIT_BOATS_MAX = 10; // troop_units cap (FUN_00419ca0/FUN_00419fd0: "> 10")

// 0x0325 클라이언트 native destination(0x58/88B) 필드 오프셋이다. wire offset이 아니다.
// FUN_00419ca0은 이 native 구조체에 쓰되 wire에서는 필드를 cursor-packed로 연속 소비한다.
export const UNIT_ELEM = Object.freeze({
  ID: 0x00, // u32 앵커 (== 0x0323 flagship+0x24, char↔unit 링크)
  FACTION: 0x04, // u16
  COMMANDER: 0x08, // u32
  CELL: 0x0c, // u32 (row*100+col 전략 셀)
  OWNER: 0x10, // u32
  BOATS_COUNT: 0x14, // u8 (troop_units, cap 10, role-pinned)
  BOATS_ARRAY: 0x18, // u32[] (role-pinned)
  SPOT_RESOLVER_BASE: 0x40, // u32
  MAP_SECTION: 0x48, // u16
});
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
export const CODE_REQ_MESSENGER_STATUS = 0x0f06; // C→S RequestInformationMessengerStatus → 0x0f07
export const CODE_RESP_MESSENGER_STATUS = 0x0f07; // S→C ResponseInformationMessengerStatus — 29900B zero-fill
export const CODE_RESP_MESSENGER_STATUS_BYTES = 0x74cc; // 29900 fixed receive size
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
  // 0x0204 핸들러(0x4ba3e7)는 wire body dword0을 무스왑으로 복사 → self-id 전역(clientBase+0x3584a0).
  // 조인 self-판정: char.id(0x0323 BE-파서 스왑) == self-id 전역. 일치하려면 BE.
  // 근거: 라이브 반증: 0x0204 핸들러가 SWAP → native 1을 얻으려면 BE wire. (단 2차 BE에서도 slot0 미등록이었으므로 self-id는 근본원인 아님 — 조인 매치가 진짜 블로커)
  body.writeUInt32BE(characterId >>> 0, 0);
  return buildMsg32Inner(CODE_SS_CHARACTER_ID, body);
}

// ─── 0x0206 SSGameLoginOK ─────────────────────────────────────────────────────

export function buildSsGameLoginOkInner({ status = 1 } = {}) {
  // message32 + 1-byte status (G138 형식)
  return buildMsg32Inner(CODE_SS_GAME_LOGIN_OK, Buffer.from([status & 0xff]));
}

// ─── 0x0323 ResponseInformationCharacter (724B) ───────────────────────────────

/**
 * 0x0323 ResponseInformationCharacter (724B) — 정본 wire = struct-aligned BIG-ENDIAN.
 *
 * 근거: 93fcf150 안정 경로와 5bd249c proven builder의 라이브 렌더 조합.
 * 앵커/링크 필드(id·spot·spot_owner·flagship·seat entries)는 정렬된 BIG-ENDIAN
 * 오프셋을 유지하고, 표시 스탯은 proven builder와 같이 고정 LITTLE-ENDIAN이다.
 *
 * 정본 앵커:
 *   0x00 u32 id ★self-match 앵커 (0x0204 self-id와 바이트 동일)
 *   0x04 u8×4 (@0x04..0x07 power/camp/state)
 *   0x1c u32 spot / 0x20 u32 spot_owner
 *   0x24 u32 flagship=gridUnitId ★char↔unit 링크 앵커
 *   body+0x20/0x28/0x2c 진입점은 별도 진단 게이트이며 정본이 아니다.
 *   wire 0x24c u8 seat/card count (officerCount, 최소 1) / 0x254 stride 8 = {character u32 @+0, role u32 @+4}, max 16
 *     ← FUN_004c2c80→PLAYER_INFO+0x270 유닛리스트 행수(C002 패널). 없으면 렌더 안 됨.
 * 표시 스탯(고정 LE, 옵션): 0x50 pcp / 0x54 mcp / 0x64 online / 0x68 money /
 *   0x188 ability_8(u16×8) / 0x1a8 influence / 0x1a9 stamina. 총 0x2d4(724B).
 */
const CHARACTER_NAME_MAX_UNITS = NAME_MAX; // parser cap `< 0xe` per name (lastname/firstname)

function writeWireU32(buffer, value, offset, wireEndian) {
  if (wireEndian === 'be') buffer.writeUInt32BE(value >>> 0, offset);
  else buffer.writeUInt32LE(value >>> 0, offset);
}

export function buildInformationCharacterInner({
  characterId = 1, gridUnitId = 0, power = null, spot = null, spotOwner = null, abilities = null, online = false,
  camp = null, state = null, fame = null, pcp = null, mcp = null, money = null, influence = null, stamina = null,
  officerCount = null,
  lastname = null, firstname = null, displayName = null, rank = null, title = null, face = null,
  seatEntries = null, spotResolverBase = null, together = null,
  wireEndian = 'be',
  // 최신 charstage A/B 진단용: 기본 aligned 위치(0x24)는 유지하고, opt-in 시 후보 오프셋을 쓴다.
  diagnosticGridUnitOffset28 = undefined,
  // 추가 charstage 후보: opt-in 시 gridUnitId를 body+0x2c에 쓴다. 기본값은 body+0x24다.
  diagnosticGridUnitOffset2c = undefined,
  // 정적 parser map 후보: opt-in 시 gridUnitId를 wire body+0x20에 쓴다. 기본값은 body+0x24다.
  diagnosticGridUnitOffset20 = undefined,
} = {}) {
  // 옛 proven 빌더(5bd249c buildInformationCharacterRecordInner)의 후반 필드는 보존하고 초기 앵커는 정본 파서에 맞춘다.
  // framing: buildMsg32Inner([u32 0][u16BE code][body]) == 옛 buildLobbyResponseInner 와 byte-identical.
  const body = Buffer.alloc(CODE_INFO_CHARACTER_BYTES);
  const payload = body; // 옛 코드의 payload(=inner.subarray(6)) 역할
  const writeRecordU16 = (value, offset) => payload.writeUInt16LE((value ?? 0) & 0xffff, offset);
  const writeRecordU32 = (value, offset) => payload.writeUInt32LE((value ?? 0) >>> 0, offset);
  const useLiveClientLayout = process.env.LOGH_LIVE_CLIENT_LAYOUT === '1';
  const useDiagnosticGridUnitOffset28 = diagnosticGridUnitOffset28 === true
    || (diagnosticGridUnitOffset28 === undefined && process.env.LOGH_DIAG_0323_GRIDUNIT_OFFSET28 === '1');
  const useDiagnosticGridUnitOffset2c = diagnosticGridUnitOffset2c === true
    || (diagnosticGridUnitOffset2c === undefined && process.env.LOGH_DIAG_0323_GRIDUNIT_OFFSET2C === '1');
  const useDiagnosticGridUnitOffset20 = diagnosticGridUnitOffset20 === true
    || (diagnosticGridUnitOffset20 === undefined
      && (process.env.LOGH_DIAG_0323_GRIDUNIT_OFFSET20 === '1' || useLiveClientLayout));
  const gridUnitWireOffset = useDiagnosticGridUnitOffset20
    ? 0x20
    : (useDiagnosticGridUnitOffset2c ? 0x2c : (useDiagnosticGridUnitOffset28 ? 0x28 : 0x24));
  // proven anchors (G164 world load): id@0x00, flagship/grid-unit id@0x24 (BE).
  // 진단 게이트(LOGH_DIAG_0323_GRIDUNIT_OFFSET28=1)에서만 body+0x28로 이동한다.
  writeWireU32(payload, characterId, 0x00, wireEndian); // id ★self-match 앵커 (0x0204 self-id 와 동일 BE)
  if (Number.isInteger(power)) payload.writeUInt8(power & 0xff, 0x04);
  if (Number.isInteger(camp)) payload.writeUInt8(camp & 0xff, 0x05);
  if (Number.isInteger(state)) payload.writeUInt8(state & 0xff, 0x06);
  writeWireU32(payload, gridUnitId, gridUnitWireOffset, wireEndian);
  if (Number.isInteger(fame)) writeRecordU32(fame, 0x10);
  if (Number.isInteger(spot)) writeWireU32(payload, spot, 0x1c, wireEndian);
  if (Number.isInteger(spotOwner) && !useDiagnosticGridUnitOffset20) {
    writeWireU32(payload, spotOwner, 0x20, wireEndian);
  }
  if (Number.isInteger(pcp)) writeRecordU32(pcp, 0x50);
  if (Number.isInteger(mcp)) writeRecordU32(mcp, 0x54);
  if (online) payload.writeUInt8(1, 0x64);
  if (Number.isInteger(money)) writeRecordU32(money, 0x68);
  // ability_8 @0x188: 8 entries of {point u16, experience u16}, canonical order. point(스탯값)만 채움.
  if (Array.isArray(abilities)) {
    for (let i = 0; i < 8 && i < abilities.length; i += 1) {
      writeRecordU16(abilities[i] ?? 0, 0x188 + i * 4);
    }
  }
  if (Number.isInteger(influence)) payload.writeUInt8(influence & 0xff, 0x1a8);
  if (Number.isInteger(stamina)) payload.writeUInt8(stamina & 0xff, 0x1a9); // 体力/stamina
  // seat/card 배열: count u8 @0x24c, entries @0x254 stride 8 {character u32 @+0, role u32 @+4}, max 16.
  // FUN_004c2c80 이 record+0x24c 를 PLAYER_INFO+0x270 으로 복사 → C002 유닛리스트 행수. count 0 이면 렌더 안 됨.
  const resolvedSeatEntries = Array.isArray(seatEntries)
    ? seatEntries
    : (Number.isInteger(officerCount) && officerCount > 0
      ? Array.from({ length: Math.min(officerCount, 0x10) }, () => ({ character: characterId, role: 0 }))
      : []);
  const seatCount = Math.min(resolvedSeatEntries.length, 0x10);
  payload.writeUInt8(seatCount, 0x24c);
  for (let i = 0; i < seatCount; i += 1) {
    const entry = resolvedSeatEntries[i] ?? {};
    const character = Number(entry.character ?? entry.characterId ?? entry.cardId ?? entry.id ?? 0);
    const role = Number(entry.role ?? entry.seatRole ?? 0);
    writeWireU32(payload, Number.isInteger(character) ? character : 0, 0x254 + i * 8, wireEndian);
    writeWireU32(payload, Number.isInteger(role) ? role : 0, 0x258 + i * 8, wireEndian);
  }
  // parentage[0] sub-record @0x80 (stride 0x84): names + rank + face at documented rel. offsets.
  // 텍스트 필드는 항상 UCS-2/UTF-16LE (수치 앵커가 BE 여도 문자열은 LE). 옛 렌더 경로가
  // lastname/firstname=''·face/rank=0 을 넘겨 이 블록을 방출했다 → 전 필드 복원의 핵심.
  const P0 = 0x80;
  const writePstr16 = (str, lenOff, charsOff) => {
    const codes = [...String(str)].slice(0, CHARACTER_NAME_MAX_UNITS);
    payload.writeUInt8(codes.length, lenOff);
    for (let i = 0; i < codes.length; i += 1) {
      payload.writeUInt16LE(codes[i].charCodeAt(0), charsOff + i * 2);
    }
  };
  const resolvedDisplayName = displayName ?? (
    lastname != null && firstname != null ? `${lastname} ${firstname}` : lastname ?? firstname
  );
  const hasParentage =
    lastname != null ||
    firstname != null ||
    resolvedDisplayName != null ||
    Number.isInteger(rank) ||
    title != null ||
    Number.isInteger(face);
  if (hasParentage) {
    payload.writeUInt8(1, 0x7d); // parentage_len: client skips the sub-record when this stays zero.
    payload.writeUInt8(1, P0 + 0x00); // truth flag for parentage[0].
  }
  if (lastname != null) writePstr16(lastname, P0 + 0x01, P0 + 0x02); // lastname @0x81/0x82
  if (firstname != null) writePstr16(firstname, P0 + 0x1c, P0 + 0x1e); // firstname @0x9c/0x9e
  if (resolvedDisplayName != null) writePstr16(resolvedDisplayName, P0 + 0x38, P0 + 0x3a); // display_name @0xb8/0xba
  if (Number.isInteger(rank)) writeRecordU16(rank, P0 + 0x56); // rank @0xd6
  if (title != null && String(title).length > 0) writePstr16(String(title), P0 + 0x58, P0 + 0x5a); // titlename @0xd8/0xda
  if (Number.isInteger(face)) writeRecordU32(face, P0 + 0x74); // face @0xf4
  if (Number.isInteger(spotResolverBase)) writeRecordU32(spotResolverBase, P0 + 0x80); // source +0x100 -> PLAYER_INFO +0x120
  if (Number.isInteger(together)) payload.writeUInt8(together & 0xff, 0x2d0); // together= (PLAYER_INFO+0x2f4)
  return buildMsg32Inner(CODE_INFO_CHARACTER, body);
}

// ─── 0x0325 ResponseInformationUnit ──────────────────────────────────────────

// 정본 클라이언트 FUN_00419ca0은 고정 0xce44 wire body를 native 0x58 구조체로 디코드한다.
// wire에는 native pad/stride가 없다. u16 BE count 직후부터 각 행을 다음 순서로 연속 소비한다.
//   u32 id, u16 faction, u8 native+0x06, u32 commander/cell/owner,
//   u8 boats count + u32 boats[], u32 spotResolverBase,
//   u8 tail44, u8 tail45, u16 tail46, u16 mapSection, u32 tail4c, u32 tail50, float tail54.
// 근거: 0x419cd2(count), 0x419dba..0x419dff(행 본문), 0x419e3d..0x419e96(tail).
// 의미가 확인되지 않은 native+0x06 및 tail 값은 Buffer.alloc의 0을 그대로 소비시킨다.
export function buildInformationUnitInner({
  unitId = 1, unitCount = 1, cell = 0, commander = 0, fleets = null,
} = {}) {
  const list = Array.isArray(fleets) && fleets.length ? fleets : null;
  const count = list ? Math.min(list.length, CODE_INFO_UNIT_MAX) : Math.max(0, Math.min(unitCount, CODE_INFO_UNIT_MAX));
  const body = Buffer.alloc(CODE_INFO_UNIT_BYTES);
  body.writeUInt16BE(count & 0xffff, 0);
  let cursor = CODE_INFO_UNIT_WIRE_HEADER;
  for (let i = 0; i < count; i += 1) {
    const f = list?.[i] ?? (i === 0 ? { id: unitId, commander, cell } : {});
    writeWireU32(body, f.id ?? 0, cursor, 'be'); cursor += 4;
    body.writeUInt16BE((f.faction ?? 0) & 0xffff, cursor); cursor += 2;
    cursor += 1; // native +0x06: 의미 미확정, zero 유지
    writeWireU32(body, f.commander ?? 0, cursor, 'be'); cursor += 4;
    writeWireU32(body, f.cell ?? 0, cursor, 'be'); cursor += 4;
    writeWireU32(body, f.owner ?? 0, cursor, 'be'); cursor += 4;
    const boats = Array.isArray(f.boats) ? f.boats.slice(0, UNIT_BOATS_MAX) : [];
    body.writeUInt8(boats.length & 0xff, cursor); cursor += 1;
    for (const boat of boats) {
      writeWireU32(body, boat ?? 0, cursor, 'be'); cursor += 4;
    }
    writeWireU32(body, f.spotResolverBase ?? 0, cursor, 'be'); cursor += 4;
    cursor += 2; // native +0x44/+0x45: u8×2, 의미 미확정
    cursor += 2; // native +0x46: u16, 의미 미확정
    body.writeUInt16BE((f.mapSection ?? 0) & 0xffff, cursor); cursor += 2;
    cursor += 4; // native +0x4c: u32, 의미 미확정
    cursor += 4; // native +0x50: u32, 의미 미확정
    cursor += 4; // native +0x54: float, 의미 미확정
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

/**
 * 0x0b01 C→S: compact body [u32 unitId][u32 cell] 또는 고정 0x24-byte legacy body.
 *
 * Legacy 0x0b01 is structurally distinguishable by its fixed body size: the first three
 * dwords are header fields and unitId/destination live at body+0x0c/+0x10. Shorter
 * diagnostic/compact inputs retain the current leading-dword interpretation.
 */
export function decodeMoveGridCommand(inner) {
  const buf = Buffer.isBuffer(inner) ? inner : Buffer.from(inner);
  if (buf.length < 2) throw new RangeError('0x0b01 too short');
  const code = buf.readUInt16BE(0);
  if (code !== CODE_CMD_MOVE_GRID) {
    throw new RangeError(`0x0b01 expected, got 0x${code.toString(16)}`);
  }
  const body = buf.subarray(2);
  if (body.length === 0x24) {
    return {
      code,
      unitId: body.readUInt32LE(0x0c),
      cell: body.readUInt32LE(0x10),
    };
  }
  if (body.length === 0x1f) {
    const nonzeroWordsBe = [];
    for (let offset = 0; offset + 1 < body.length; offset += 2) {
      const value = body.readUInt16BE(offset);
      if (value !== 0) {
        nonzeroWordsBe.push({
          offset,
          value,
          valueHex: `0x${value.toString(16).padStart(4, '0')}`,
        });
      }
    }
    const routeCellCandidate = body.readUInt16BE(0x16);
    // 100×50 전략 그리드 범위 안의 후보만 실제 목적지 셀로 승격한다.
    const decodedRouteCell = routeCellCandidate < 5000 ? routeCellCandidate : null;
    const routeTailWord = body.readUInt16BE(0x18);
    return {
      code,
      unitId: null,
      cell: decodedRouteCell,
      format: 'sendwarp-live-v1',
      unresolved: decodedRouteCell === null,
      bodyLength: body.length,
      fields: {
        coord0: { x: body.readUInt16BE(0x00), y: body.readUInt16BE(0x02) },
        coord1: { x: body.readUInt16BE(0x04), y: body.readUInt16BE(0x06) },
        actorOrSequence: body.readUInt32BE(0x08),
        commandCoord: { x: body.readUInt16BE(0x0e), y: body.readUInt16BE(0x10) },
        routeCellCandidate,
        routeCellCandidateHex: `0x${routeCellCandidate.toString(16).padStart(4, '0')}`,
        routeTailWord,
        routeTailWordHex: `0x${routeTailWord.toString(16).padStart(4, '0')}`,
        terminalByte: body.readUInt8(0x1e),
        nonzeroWordsBe,
        rawHex: body.toString('hex'),
      },
    };
  }
  if (body.length !== 8) {
    throw new RangeError(`0x0b01 unsupported body length: ${body.length}`);
  }
  // compact compatibility: unitId@0, cell@4
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

// ─── 0x0f07 ResponseInformationMessengerStatus (idle 파이프라인 해제) ─────────────
//
// 근거: docs/reference/legacy-evidence/logh7-0f06-wire.md (정본 EXE RE, 2026-07-11)
//   0x0f06 요청 → 0x0f07 응답 29900B(0x74cc). 클라 미결 큐가 응답을 대기하며, 응답 없으면
//   큐 정지 → 후속 요청 전부 미송신 → idle 크래시. 바디는 클라가 파싱하지 않음(핸들러 빈 스텁,
//   FUN_005266e0). 따라서 zero-fill이 정본.
export function buildMessengerStatus0f07() {
  // 필드 의미 unknown — 클라 파서가 빈 스텁이라 zero-fill이 정본(logh7-0f06-wire.md)
  return buildMsg32Inner(CODE_RESP_MESSENGER_STATUS, Buffer.alloc(CODE_RESP_MESSENGER_STATUS_BYTES));
}

// ─── 0x032a / 0x032b ResponseInformationOutfit (旗艦情報/편성 팝업) ─────────────
//
// 근거: docs/reference/legacy-evidence/logh7-032a-flagship-wire.md (정본 EXE RE, 2026-07-11)
//   0x032a(req) → 0x032b(resp). 응답 대기형(fire-and-forget 아님) — 응답 없으면 클라 재시도.
//   바디 정확히 2804B(0xaf4) 고정. count≥1 필수(0 이면 클라가 표시 함수 미호출 → 빈 창).
//   레이아웃: [u8 count @0x00][pad 3B][element[i] @0x04 + i*0x1c, 각 28B, ≤100].
//   엔디안: 형제 0x0323/0x0325 와 동일 aligned BE(0x03xx 앵커 규약).
export const CODE_REQ_OUTFIT_INFO = 0x032a; // C→S RequestInformationOutfit
export const CODE_RESP_OUTFIT_INFO = 0x032b; // S→C ResponseInformationOutfit
export const CODE_RESP_OUTFIT_INFO_BYTES = 0xaf4; // 2804 고정 수신 크기
export const OUTFIT_HEADER = 4; // [u8 count][pad 3B]; element[0] = payload+4
export const OUTFIT_STRIDE = 0x1c; // 28B element
export const OUTFIT_MAX = 100; // 사이저 상한

// element(28B) 필드 오프셋 — 요소 base 상대 (RE 표 §2, FUN_0041c330 덤프).
export const OUTFIT_ELEM = Object.freeze({
  ID: 0x00, // u32 outfit/fleet id
  KIND: 0x04, // u8 種別
  POWER: 0x05, // u8 陣営
  CAMP: 0x06, // u8 camp
  INDEX: 0x07, // u8 index
  ACHIEVEMENT: 0x08, // u16 戦功
  STRATEGY_ID: 0x0c, // u32
  PRACTICE_WARP: 0x10, // u8 연성치(함대 훈련) 10종 @0x10..0x19
  PRACTICE_SPEED: 0x11,
  PRACTICE_COMMAND: 0x12,
  PRACTICE_OFFENCE: 0x13,
  PRACTICE_DEFENCE: 0x14,
  PRACTICE_ANTIAIRCRAFT: 0x15,
  PRACTICE_SEARCH: 0x16,
  PRACTICE_DECEPTION: 0x17,
  PRACTICE_LANDBATTLE: 0x18,
  PRACTICE_AIRBATTLE: 0x19,
});

/**
 * ability8 → 연성치 10종 매핑 (정확 漢字 identity 만, 날조 금지).
 *
 * 시드 ability8 키: [tochi統治, seiji政治, unei運営, joho情報, shiki指揮, kido機動, kogeki攻撃, bogyo防御].
 * 연성치는 함대 훈련값으로 캐릭터 능력치와 개념이 다르나, 漢字가 정확히 일치하는 3종만 근거로 채운다:
 *   command(指揮) ← ability8[4] shiki指揮 / offence(攻撃) ← ability8[6] kogeki攻撃 / defence(防御) ← ability8[7] bogyo防御.
 * 나머지 warp/speed/antiaircraft/search/deception/landbattle/airbattle 는 대응 능력치 없음 → 0.
 *   (機動≠速度, 情報≠索敵 — 근사 매핑도 근거 부족이라 0 유지.)
 */
export function outfitPracticeFromAbility8(ability8) {
  const a = Array.isArray(ability8) ? ability8 : [];
  const at = (i) => (Number.isFinite(Number(a[i])) ? Number(a[i]) & 0xff : 0);
  return {
    warp: 0,
    speed: 0,
    command: at(4), // 指揮
    offence: at(6), // 攻撃
    defence: at(7), // 防御
    antiaircraft: 0,
    search: 0,
    deception: 0,
    landbattle: 0,
    airbattle: 0,
  };
}

/**
 * 0x032b ResponseInformationOutfit (2804B 고정). 순수 빌더.
 *
 * outfits: [{ id, kind, power, camp, index, achievement, strategyId, practice:{warp,speed,command,...} }]
 * count = min(outfits.length, 100). 자기소속 팝업이면 outfits=[플레이어 편성 1개] → count=1.
 * 엔디안 BE(형제 0x0323/0x0325 규약). 라이브에서 숫자 뒤집히면 LE 폴백(RE §3).
 * 근거 있는 필드만 채우고(호출측 책임) 미지정은 0 — 여기서 값 합성하지 않는다.
 */
export function buildOutfitInfo032b({ outfits = [], wireEndian = 'be' } = {}) {
  const body = Buffer.alloc(CODE_RESP_OUTFIT_INFO_BYTES);
  const list = Array.isArray(outfits) ? outfits : [];
  const count = Math.min(list.length, OUTFIT_MAX);
  body.writeUInt8(count & 0xff, 0); // count @0x00 (pad @0x01..0x03)
  const writeU32 = (v, off) => (wireEndian === 'be'
    ? body.writeUInt32BE((v ?? 0) >>> 0, off)
    : body.writeUInt32LE((v ?? 0) >>> 0, off));
  const writeU16 = (v, off) => (wireEndian === 'be'
    ? body.writeUInt16BE((v ?? 0) & 0xffff, off)
    : body.writeUInt16LE((v ?? 0) & 0xffff, off));
  for (let i = 0; i < count; i += 1) {
    const base = OUTFIT_HEADER + i * OUTFIT_STRIDE;
    if (base + OUTFIT_STRIDE > body.length) break;
    const o = list[i] ?? {};
    const p = o.practice ?? {};
    writeU32(o.id, base + OUTFIT_ELEM.ID);
    body.writeUInt8((o.kind ?? 0) & 0xff, base + OUTFIT_ELEM.KIND);
    body.writeUInt8((o.power ?? 0) & 0xff, base + OUTFIT_ELEM.POWER);
    body.writeUInt8((o.camp ?? 0) & 0xff, base + OUTFIT_ELEM.CAMP);
    body.writeUInt8((o.index ?? 0) & 0xff, base + OUTFIT_ELEM.INDEX);
    writeU16(o.achievement, base + OUTFIT_ELEM.ACHIEVEMENT);
    writeU32(o.strategyId, base + OUTFIT_ELEM.STRATEGY_ID);
    body.writeUInt8((p.warp ?? 0) & 0xff, base + OUTFIT_ELEM.PRACTICE_WARP);
    body.writeUInt8((p.speed ?? 0) & 0xff, base + OUTFIT_ELEM.PRACTICE_SPEED);
    body.writeUInt8((p.command ?? 0) & 0xff, base + OUTFIT_ELEM.PRACTICE_COMMAND);
    body.writeUInt8((p.offence ?? 0) & 0xff, base + OUTFIT_ELEM.PRACTICE_OFFENCE);
    body.writeUInt8((p.defence ?? 0) & 0xff, base + OUTFIT_ELEM.PRACTICE_DEFENCE);
    body.writeUInt8((p.antiaircraft ?? 0) & 0xff, base + OUTFIT_ELEM.PRACTICE_ANTIAIRCRAFT);
    body.writeUInt8((p.search ?? 0) & 0xff, base + OUTFIT_ELEM.PRACTICE_SEARCH);
    body.writeUInt8((p.deception ?? 0) & 0xff, base + OUTFIT_ELEM.PRACTICE_DECEPTION);
    body.writeUInt8((p.landbattle ?? 0) & 0xff, base + OUTFIT_ELEM.PRACTICE_LANDBATTLE);
    body.writeUInt8((p.airbattle ?? 0) & 0xff, base + OUTFIT_ELEM.PRACTICE_AIRBATTLE);
  }
  return buildMsg32Inner(CODE_RESP_OUTFIT_INFO, body);
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
  // rleLen 은 BE — 클라 상류 입력 파서 FUN_004134e0 가 스트림 헬퍼로 BE 읽어 유효범위
  // (0<c<0x1389=5001)를 게이트한다. LE 로 쓰면 40→BE-read 0x2800(10240)처럼 범위 초과로
  // 읽혀 dispatcher 도달 전 정지(옛 라이브 판정 G222 / 옛 proven 5bd249c writeUInt16BE).
  // 하류 RLE 디코더 FUN_004abbb0 은 이미 파싱된 버퍼를 host-order 로 소비하므로 상류 BE 가 정본.
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
  0x0f07: 0x74cc, // 29900 ResponseInformationMessengerStatus (zero-fill, 클라 미파싱)
  0x031d: 0x520c, // 21004 static-base
  0x032b: 0x0af4, // 2804 ResponseInformationOutfit (전용 빌더 buildOutfitInfo032b, count≥1)
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
/**
 * 0x0305/0x0307 명령 테이블은 라이브 호환 플레이 가능 기준선 시드다.
 *
 * 근거:
 *   - 0x0305: wire 외곽 count는 u16 BE이고 레코드는 compact cursor로 이어진다.
 *     wire의 card/factory id는 u16 BE, count는 record+0x12, factory 배열은 record+0x13부터다.
 *     클라이언트 native destination만 고정 0x46 stride이며 command_count/factory는 native +0x14/+0x16이다.
 *   - 0x0307: wire 외곽 count와 compact record/descriptor의 u16은 모두 BE다.
 *     wire descriptor stride는 8이며, 클라이언트 native destination만 card stride 0xc4다
 *     (FUN_004ba2b0/FUN_005312b0).
 *   - 0x2b는 P0 SelectGrid와 B48/B55/B59 라이브 근거가 있는 factory다. 0x41은
 *     FUN_00584c90 organize/dialog 경로에 대응하지만 이 카드가 이를 부여한다는 정본 근거는 없다.
 *     B61 live에서는 id=1 단일 레코드가 runtime category 0에 들어가고 category 1은 비었다.
 *     즉 변환은 card id가 아니라 record ordinal로 runtime slot을 채운다. category 0 레코드는
 *     canonical grant가 아니라 category 1 runtime slot에 도달하기 위한 구조적 ordinal padding이다.
 * 이 시드는 정본 전체 권한표가
 * 완성됐다는 뜻이 아니다. packed/w/flag의 의미도 미확정이므로 0으로 둔다.
 */
export const PLAYABLE_BASELINE_COMMAND_FACTORY_IDS = Object.freeze([0x002b]);
export const STATIC_INFORMATION_CARD_STRIDE = 0x46; // 0x0305 native destination stride (wire는 compact)
export const STATIC_INFORMATION_CARD_MAX = 300;
export const STATIC_INFORMATION_CARD_COMMAND_STRIDE = 0xc4; // 0x0307 native destination stride (wire는 compact)
export const STATIC_INFORMATION_CARD_COMMAND_RECORD_MAX = 300;
export const STATIC_INFORMATION_CARD_COMMAND_ENTRY_STRIDE = 8;
export const STATIC_INFORMATION_CARD_COMMAND_MAX = 24;

function clampU16(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.min(0xffff, Math.trunc(n))) : 0;
}

/** 0x0305 ResponseStaticInformationCard — RE 확정 필드만 채운다. */
export function buildStaticInformationCardInner({ cards = [] } = {}) {
  const body = Buffer.alloc(STATIC_INFO_BODY_SIZES[0x0305]);
  const list = Array.isArray(cards) ? cards.slice(0, STATIC_INFORMATION_CARD_MAX) : [];
  // 0x0305 wire는 외곽 count와 compact record의 모든 u16을 BE로 읽는다.
  body.writeUInt16BE(list.length, 0x00);
  let cursor = 2;
  for (const card of list) {
    const wireBase = cursor;
    const commands = Array.isArray(card?.commands)
      ? card.commands.slice(0, STATIC_INFORMATION_CARD_COMMAND_MAX)
      : [];
    const wireEnd = wireBase + 0x13 + commands.length * 2;
    if (wireEnd > body.length) break;
    body.writeUInt16BE(clampU16(card?.id ?? card?.cardId), wireBase + 0x00);
    // 0x02..0x11은 parser가 소비하는 미확정 필드이며 Buffer.alloc의 0을 유지한다.
    cursor = wireBase + 0x12;
    body.writeUInt8(commands.length, cursor);
    cursor += 1;
    for (const command of commands) {
      body.writeUInt16BE(clampU16(command?.id ?? command), cursor);
      cursor += 2;
    }
  }
  return buildMsg32Inner(0x0305, body);
}

/** 0x0307 ResponseStaticInformationCardCommand — descriptor ID만 RE-confirmed. */
export function buildStaticInformationCardCommandInner({ cards = [] } = {}) {
  const body = Buffer.alloc(STATIC_INFO_BODY_SIZES[0x0307]);
  const list = Array.isArray(cards) ? cards.slice(0, STATIC_INFORMATION_CARD_COMMAND_RECORD_MAX) : [];
  // 0x0307도 외곽 count와 compact record/descriptor의 모든 u16을 BE로 읽는다.
  body.writeUInt16BE(list.length, 0x00);
  let cursor = 2;
  for (const card of list) {
    const wireBase = cursor;
    const commands = Array.isArray(card?.commands)
      ? card.commands.slice(0, STATIC_INFORMATION_CARD_COMMAND_MAX)
      : [];
    const wireEnd = wireBase + 0x03 + commands.length * STATIC_INFORMATION_CARD_COMMAND_ENTRY_STRIDE;
    if (wireEnd > body.length) break;
    body.writeUInt16BE(clampU16(card?.id ?? card?.cardId), wireBase + 0x00);
    body.writeUInt8(commands.length, wireBase + 0x02);
    cursor = wireBase + 0x03;
    for (const command of commands) {
      const off = cursor;
      body.writeUInt16BE(clampU16(command?.id ?? command), off + 0x00);
      // packed u24, w u16, flag u8의 의미는 미확정 — Buffer.alloc의 0을 유지한다.
      cursor += STATIC_INFORMATION_CARD_COMMAND_ENTRY_STRIDE;
    }
  }
  return buildMsg32Inner(0x0307, body);
}

export function buildPlayableBaselineCommandCardInner() {
  return buildStaticInformationCardInner({
    // 첫 레코드는 category 1 runtime slot까지 변환을 진행시키는 ordinal padding이다.
    cards: [
      { id: 0, commands: PLAYABLE_BASELINE_COMMAND_FACTORY_IDS },
      { id: 1, commands: PLAYABLE_BASELINE_COMMAND_FACTORY_IDS },
    ],
  });
}

export function buildPlayableBaselineCommandDescriptorInner() {
  return buildStaticInformationCardCommandInner({
    // B61 live 근거에 따라 descriptor도 두 ordinal을 모두 채운다.
    cards: [
      {
        id: 0,
        commands: PLAYABLE_BASELINE_COMMAND_FACTORY_IDS.map((id) => ({ id })),
      },
      {
        id: 1,
        commands: PLAYABLE_BASELINE_COMMAND_FACTORY_IDS.map((id) => ({ id })),
      },
    ],
  });
}

export function buildEmptyWalkerInner(code) {
  const size = STATIC_INFO_BODY_SIZES[code & 0xffff] ?? 0;
  return buildMsg32Inner(code & 0xffff, Buffer.alloc(size));
}

/**
 * static-info 어드미션 walker 요청 code → 응답 code 매핑 (req 짝수 → resp = req+1 홀수).
 *
 * 0x0304/0x0306은 라이브 호환 플레이 가능 기준선 명령 테이블로 직접 응답한다. 나머지는
 * buildEmptyWalkerInner로 처리해 응답 code의 고정크기 0채움 body를 보낸다. 클라 프레이밍이
 * recv 버퍼를 over-read 하지 않도록 반드시 풀사이즈여야 한다.
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
  [CODE_REQ_MESSENGER_STATUS]: () => buildMessengerStatus0f07(), // 0x0f06 → 0x0f07 (idle queue unblock)
  // 0x032a → 0x032b: 라우팅 인식용 등록(isAdmissionRequestCode). 실제 응답은 handleWorldInner 가
  //   플레이어 편성으로 가로채 생성한다(0x0f02/0x0314 와 동일 패턴). 여기 fallback 은 플레이어
  //   컨텍스트 없이 호출될 때 창만 뜨는 안전망(count=1, 값 0) — 정상 경로에선 미사용.
  [CODE_REQ_OUTFIT_INFO]: () => buildOutfitInfo032b({ outfits: [{}] }), // 0x032a → 0x032b
});

/**
 * 어드미션 요청 code → 응답 message32. handleWorldInner 가 사용.
 * 명령 기준선(0x0305/0x0307)과 전용 빌더(0x0313/0x0315)는 실제 바디, 나머지는 빈 walker다.
 */
export function buildAdmissionResponseInner(reqCode) {
  const code = reqCode & 0xffff;
  if (code === CODE_REQ_SESSION_WALKER) return buildPlayableBaselineCommandCardInner();
  if (code === CODE_REQ_DUTY_WALKER) return buildPlayableBaselineCommandDescriptorInner();
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
 *   0x0325 유닛 테이블 (고정 52804B, compact cursor 행) — ★캐릭터보다 먼저 (아래 순서 주의)
 *   0x0323 캐릭터 레코드 (724B — 오브젝트 테이블 채움, 렌더러 크래시 방지 필수)
 *
 * ★유닛→캐릭터 순서 (라이브 크래시 회귀 수정, qa-marker2 확정): 클라는 0x0323 flagship(+0x24)
 *   →유닛 링크로 디코드된 0x0325 unit[0].id(native +0x04)를 찾아 그 유닛의 +0x14 를 deref 한다. 유닛이 캐릭터보다
 *   먼저 도착해 오브젝트 테이블에 resident 여야 null(+0x14) deref(0xc0000005, memAddr=0x14)를
 *   피한다. 캐릭터를 먼저 보내면 flagship→유닛 링크가 null 이라 결정적 하드크래시.
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
 * 0x031d base는 logh7-static-base 경로로 reactive 제공하지만, 전체 필드 계보는 provisional이다.
 * 0x031f/0x0321은 오프셋 미확정이라 생략한다(fail-closed).
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
  // 0x0325 유닛 레지스트리 충전용 전체 함대 목록(플레이어 unit[0] + NPC). 미지정 시 minimal(플레이어 1).
  fleets = null,
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
    // ★0x0325(유닛)를 0x0323(캐릭터)보다 먼저 방출(라이브 크래시 회귀 수정, qa-marker2 확정).
    //   클라는 0x0323 flagship(+0x24)→유닛 링크로 decoded unit[0].id(native +0x04)를 찾아 +0x14 를 deref 한다.
    //   유닛(0x0325)이 캐릭터(0x0323)보다 먼저 도착해 오브젝트 테이블에 resident 여야 null(+0x14) deref
    //   (STATUS_ACCESS_VIOLATION 0xc0000005, memAddr=0x14)를 피한다. char→unit 순서면 결정적 하드크래시.
    buildInformationUnitInner({
      unitId: gridUnitId,
      unitCount: 1,
      cell: unitCell,
      commander: characterId,
      fleets, // 지정 시 full 레코드(레지스트리 충전), 미지정 시 minimal
    }),
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
      // seat count@0x24c 최소 1 (commander 자신 1행) — 0 이면 C002 유닛리스트 미렌더.
      officerCount: Math.max(1, officerCount),
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
  // 0x0325 유닛 레지스트리 충전용 전체 함대 목록(begin/end 사이 refresh). 미지정 시 minimal.
  fleets = null,
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
    // seat count@0x24c 최소 1 (commander 자신 1행) — 0 이면 C002 유닛리스트 미렌더.
    officerCount: Math.max(1, officerCount),
  });
  const makeUnit = () => buildInformationUnitInner({ unitId, unitCount: 1, cell: unitCell, commander, fleets });
  const hasChar = Number.isInteger(commander) && commander > 0;

  const inners = [];
  // early-grid(LOGH_STRAT_GRID_EARLY): begin 전에 grid-type 팔레트를 한 번 더 방출.
  // grid-type 테이블(terrain 타입)이 grid-enter 배치 전에 resident 여야 셀 value 를 해석한다.
  if (includeEarlyGridType) {
    inners.push(buildStaticInformationGridTypeInner({ objects: DEFAULT_SECTOR_GRID_TYPES }));
  }
  // 계약 순서(render-contract L102) + M3 정합 수정:
  //   0x0b09(begin) → 0x0325(유닛) + 0x0323(캐릭터) → 0x0b0a(end) → 0x0f03. 각 정확히 1회.
  // ★정합이 NOW LOADING 을 해제한다: 0x0323 flagship(+0x24)=decoded 0x0325 unit id(native +0x04).
  //   클라 FUN_004c2a80 은 begin/end 사이에서 char.flagship(+0x24)을
  //   decoded unit id(native +0x04)와 링크해 플레이어 오브젝트(clientBase+0xc)를 빌드한다. makeChar 의
  //   gridUnitId 와 makeUnit 의 unitId 는 동일 `unitId` 라서 flagship==unit[0].id 가 성립한다.
  //   이전 P7 ×2 재전송은 정합이 아니라 타이밍 추측이었다 — 링크가 성립하면 1회로 충분하며,
  //   중복 방출은 불필요한 중복 스텁일 뿐이라 각 레코드 1회로 되돌린다.
  inners.push(buildNotifyEnterGridBeginInner({ value: gridBeginValue }));
  inners.push(makeUnit());
  if (hasChar) inners.push(makeChar());
  inners.push(buildNotifyEnterGridEndInner({ value: gridEndValue }));
  inners.push(buildGridInitOkInner({ status: 1 })); // 0x0f03 — 트레이스 "0x0f02(월드초기화)"의 S→C 신호
  return inners;
}

// ─── G164 grid-init 스폰 시퀀스 (0x0f02 RequestGridInitialize 핸들러용) ─────────
//
// 근거: 5bd249c server/src/server/logh7-login-session.mjs line 2095~ G164 스폰 로직(정본).
//
// 옛 라이브 확정 타이밍: 플레이어 스폰(0x0204 + 0x0325 + 0x0323)을 0x0f02(RequestGridInitialize)
// 핸들러에서 방출하고, 0x0f03(GridInitialize_OK)을 core 마지막에 둔 뒤 0x0356 post-load delta를 잇는다.
//   - 이유: 직전 0x0f01(ResponseWorldInitialize_OK) world-init reset 이 char count(client+0x36a5dc)를
//     0 으로 지운다. 그래서 0x0323 을 0x0f02 에서 (재)전송해야 count 가 1 로 복구돼 HUD 렌더 전까지
//     살아남는다. 0x0f03 이 gridInitialized 를 flip → FUN_004c2a80 이 PLAYER_INFO 를 count=1
//     (0x0325 가 unit gate 충족)로 재빌드 → FUN_004c7290 non-null → [0x80] 크래시 스킵 → 렌더.
//   - 순서: (0x0204, 0x0325, 0x0323) 먼저 → grid extras(0x0313 grid-type + 0x0315 cell, 플레이어
//     함대 cell 포함) → 0x0f03(core 마지막) → 0x0356(post-load delta).
//
// grid extras(옛 fleet-only 폴백): 함대를 klass-3 마커로 박지 않는다(오브젝트테이블에 함대 클래스가
// 없어 klass-3 은 가짜 성계 dot 로 오인 렌더됨). 대신 grid-type 에 SPACE(항행 가능) 객체 하나를 두고,
// 셀그리드의 플레이어 함대 cell 한 칸을 SPACE 로 채운다. 함대 자체 렌더/선택은 0x0325 unit 레코드가 담당.
export function buildGridInitializeSpawnInners({
  characterId,
  unitId,
  unitCell = 2588,
  power = 0,
  spot = 1,
  lastname = '',
  firstname = '',
  face = 0,
  rank = 0,
  abilities = null,
  officerCount = 0,
  // 정본 갤럭시 배치(logh7-galaxy-placement). 주어지면 SPACE-only 폴백 대신 실 성계 팔레트/셀을
  // 방출한다 — 스테이징→라이브 run-once 복사(FUN_004c5350) 전에 이 경로가 팔레트/셀을 재기록하므로
  // 여기에 galaxy 데이터를 실어야 마커가 스테이징에 남는다(SPACE-only 면 galaxy 팔레트를 덮어씀).
  paletteObjects = null,
  staticCells = null,
  // 0x0325 유닛 레지스트리 충전용 전체 함대 목록(플레이어 unit[0] + NPC). 미지정 시 minimal(플레이어 1).
  fleets = null,
} = {}) {
  if (!Number.isInteger(characterId) || characterId <= 0) {
    throw new Error('buildGridInitializeSpawnInners: characterId required (no default id=1 / emperor trap)');
  }
  if (!Number.isInteger(unitId) || unitId <= 0) {
    throw new Error('buildGridInitializeSpawnInners: unitId required (no synthetic id)');
  }
  const category = Number(process.env.LOGH_ACTION_LIST_CATEGORY);
  const hasCategory = process.env.LOGH_ACTION_LIST_CATEGORY !== undefined
    && Number.isInteger(category) && category >= 0 && category <= 0xffff;
  const actionSeatCharacter = hasCategory
    ? (category === 0 ? 0x10000 : category)
    : characterId;
  const inners = [];
  // 1) 0x0204 선택 캐릭터 id (self-match 앵커: 0x0323 record[0](+0x00 BE)와 바이트 동일)
  inners.push(buildSsCharacterIdInner({ characterId }));
  // 2) 0x0b09 NotifyEnterGridBegin (value=0) — grid-enter 괄호 開始.
  //    ★근거(docs/reference/legacy-evidence/logh7-0325-loader-gate.md): 클라 렌더 레지스트리 벌크
  //    적재(FUN_004c2a80)는 오직 0x0b0a 수신 시에만 실행된다. 0x0325/0x0323 은 스테이징/캐릭터
  //    테이블만 채우므로, begin/end 괄호가 없으면 레지스트리로 옮겨지지 않아 activeCount=0 →
  //    마커클릭 null-deref. begin(value=0)이 char count(client+0x36a5dc)를 리셋 → 뒤이은 0x0323 이
  //    count 를 1 로 재충전 → 0x0b0a 가 적재를 트리거한다. 반드시 0x0325/0x0323 **앞**(0x0323 前).
  inners.push(buildNotifyEnterGridBeginInner({ value: 0 }));
  // 3) 0x0325 유닛 테이블 (unit gate 충족: count≥1, unit[0].id = flagship 링크).
  //    fleets 지정 시 full 레코드 N개(레지스트리 충전 → 마커 클릭 null-deref 해소).
  inners.push(buildInformationUnitInner({ unitId, unitCount: 1, cell: unitCell, commander: characterId, fleets }));
  // 4) 0x0323 캐릭터 레코드 (char count 복구: 0x0b09 reset 후 1 로 되돌림. flagship(+0x24)=unitId 링크)
  inners.push(buildInformationCharacterInner({
    characterId,
    gridUnitId: unitId,
    power,
    spot,
    online: true,
    lastname,
    firstname,
    face,
    rank,
    abilities: Array.isArray(abilities) && abilities.length ? abilities : null,
    // seat count@0x24c 최소 1 (commander 자신 1행) — 0 이면 C002 유닛리스트 미렌더.
    officerCount: Math.max(1, officerCount),
  }));
  // 5) 0x0b0a NotifyEnterGridEnd (value=0) — grid-enter 괄호 終了 = 적재 트리거.
  //    이 프레임이 FUN_004c2a80 을 호출해 캐릭터 테이블(0x0323)을 순회하며 self 캐릭터를
  //    렌더 레지스트리로 스폰(0x0325 스테이징 flagship 링크 소비). 반드시 0x0325/0x0323 **뒤**.
  inners.push(buildNotifyEnterGridEndInner({ value: 0 }));
  // 6) grid extras: 0x0313 grid-type(팔레트) → 0x0315 cell grid.
  //    grid-type 이 셀그리드보다 먼저여야 클라가 셀 value 를 palette index 로 해석한다.
  //    galaxy 데이터가 있으면 실 성계 팔레트/셀(플레이어 함대 cell = SPACE 로 덮어 항행표식),
  //    없으면 옛 fleet-only 폴백(SPACE=1 값 하나). 함대 렌더/선택은 0x0325 가 담당.
  const TERRAIN_SPACE = 1; // 空間(항행 가능 빈 공간). byte1(klass)=1 → 비-마커.
  const col = unitCell % STRATEGIC_GRID_W;
  const row = Math.floor(unitCell / STRATEGIC_GRID_W);
  inners.push(buildStaticInformationGridTypeInner({
    objects: Array.isArray(paletteObjects) && paletteObjects.length
      ? paletteObjects
      : [{ value: TERRAIN_SPACE, contentId: TERRAIN_SPACE, klass: TERRAIN_SPACE, variant: 0 }],
  }));
  inners.push(buildStaticInformationGridInner({
    width: STRATEGIC_GRID_W,
    height: STRATEGIC_GRID_H,
    cells: Array.isArray(staticCells) && staticCells.length
      ? staticCells
      : [{ col, row, value: TERRAIN_SPACE }],
  }));
  // 7) 0x0f03 GridInitialize_OK — core grid-init 응답의 마지막. 이게 gridInitialized 를 flip 해 렌더를 트리거한다.
  inners.push(buildGridInitOkInner({ status: 1 }));
  // 8) 0x0356은 정상 플레이어 HUD의 필수 action-list다. B56에서 이 프레임만 빼자 링크는 정상인데도
  //    hudModeF4=1, listCount188=0, payloadCount270=0으로 30초 readiness가 실패했다.
  //    core 초기화 순서를 보존하도록 0x0f03 직후 정확히 한 번 보내며, category 진단이 없으면
  //    기본 seat character는 실제 characterId를 유지한다.
  inners.push(buildNotifyInformationCharacterInner({
    characterId,
    gridUnitId: unitId,
    power,
    spot,
    spotOwner: unitId,
    online: true,
    lastname,
    firstname,
    face,
    rank,
    abilities: Array.isArray(abilities) && abilities.length ? abilities : null,
    spotResolverBase: spot,
    seatEntries: [{ character: actionSeatCharacter, role: 0 }],
  }));
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
    provisional: [
      '0x031d ResponseStaticInformationBase (runtime served; field provenance partial)',
    ],
    omittedUnproven: [
      '0x031f ResponseInformationSystem (provisional offsets)',
      '0x0321 ResponseInformationInstitution',
    ],
  };
}

/** message32 배열에서 code 목록 추출 (테스트/감사용) */
export function listWorldEntryCodes(inners) {
  return inners.map((inner) => readMsg32Code(inner));
}
