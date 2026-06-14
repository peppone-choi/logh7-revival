// LOGH VII login-server protocol layer.
//
// This module encodes the *solved* portion of the protocol: the inner-message
// codes carried inside the transport-0x0030 envelope on the login connection,
// the GIN7 login credential the client sends (inner 0x7000), and the lobby
// redirect the server replies with (inner 0x7001).
//
// Wire facts (reverse-engineered, see docs/claude-handoff-2026-06-10.md G136/G137):
//   0x0030 body = [u16 BE checksum][u32 BE id][u16 BE innerLen][inner]
//   inner       = [u16 BE innerCode][payload]
//   0x7000 C->S : GIN7 credential (account + password), == login request
//   0x7001 S->C : lobby redirect — LoginProcessor::handle_message @0x004ac700 reads
//                 IP(param_5+4, parsed by FUN_0060fcc0 "%d.%d.%d.%d"), port(param_5+8),
//                 token(param_5+0xc) and reconnects the client to the lobby server.
//   0x7002 S->C : disconnect / list cleanup.

export const LOGIN_INNER_CODE = 0x7000;
export const REDIRECT_INNER_CODE = 0x7001;
export const DISCONNECT_INNER_CODE = 0x7002;
export const SERVERLIST_INNER_CODE = 0x7002; // login->lobby serverlist / channel-index set

/**
 * Build a serverlist/channel-index inner (login inner 0x7002). The login handler branch at
 * 0x4ac758 reads `byte[inner+2]` and stores it to the cross-module signal *(0x76bbe4)* — the
 * lobby FSM reads this as the server/channel index; the inner-0x7001 redirect branch instead
 * stamps it 0xFFFFFFFF (the -1 fail sentinel). So a bare redirect leaves the lobby on a degraded
 * path; sending a 0x7002 with a valid index (!= 0xff) sets a real channel index (workflow
 * ws2xffdw9). The byte at +2 is the only field this handler reads from the message.
 * @param {{ index?: number }} [options]
 */
export function buildServerListInner({ index = 0 } = {}) {
  const inner = Buffer.alloc(4);
  inner.writeUInt16BE(SERVERLIST_INNER_CODE, 0);
  inner.writeUInt8(index & 0xff, 2);
  return inner;
}

// Lobby connection (post-redirect) inner codes.
export const LOBBY_SESSION_INIT_CODE = 0x0020; // C->S first lobby frame (payload u32=1); server stays silent
export const LOBBY_LOGIN_REQUEST_CODE = 0x2000; // C->S GIN7 credential (version 4) — lobby login
export const LOBBY_LOGIN_OK_CODE = 0x2001; // S->C lobby login accepted
export const LOBBY_LOGIN_NG_CODE = 0x2002; // S->C lobby login rejected

export const GIN7_MAGIC = 'GIN7';

/**
 * Build the LobbyLoginOK (0x2001) inner. Input_LobbyLoginOK::input_from_stream
 * (0x0043f830) reads exactly a 2-byte field after the code, so the inner is
 * [u16 BE 0x2001][u16 BE status]. status 0 = OK.
 * @param {{ status?: number }} [options]
 */
export function buildLobbyLoginOkInner({ status = 0 } = {}) {
  const inner = Buffer.alloc(4);
  inner.writeUInt16BE(LOBBY_LOGIN_OK_CODE, 0);
  inner.writeUInt16BE(status & 0xffff, 2);
  return inner;
}

/**
 * Build the conn2 "mpsClientMessage32" body shape:
 * [u32 BE prefix][u16 BE appCode][payload].
 *
 * Runtime evidence (G122): conn2 handler key 0x0003 resolves to vtable 0x0066c0d8,
 * input method 0x00404210. That method reads a 32-bit field, then a 16-bit app
 * code, then dispatches the remaining bytes through FUN_00404610. A bare
 * [u16 code][payload] body is therefore too short and never reaches enqueue.
 * @param {{ code: number, prefix?: number, payload?: Buffer }} options
 */
export function buildMpsClientMessage32Inner({ code, prefix = 0, payload = Buffer.alloc(0) }) {
  const inner = Buffer.alloc(6 + payload.length);
  inner.writeUInt32BE(prefix >>> 0, 0);
  inner.writeUInt16BE(code & 0xffff, 4);
  payload.copy(inner, 6);
  return inner;
}

/**
 * Re-wrap a RAW client->server inner ([u16 BE code][payload], the form the server reads via
 * readInnerCode at offset 0) into the message32 form ([u32 0][u16 BE code][payload]) the recipient
 * client consumes on conn3 (G138). Used by the in-world relay (G169) to forward one player's
 * in-world command (CommandMoveGrid 0xb01 / CommandGridChat 0x0f1c / CommandMoveShip 0x400 / ...)
 * to the other players. Verified framing (G172): client->server inners are raw (readInnerCode
 * reads code@0; e.g. the 0x7000 login inner starts with the code), while server->client conn3
 * replies are message32 — so the relay must convert raw -> message32.
 */
export function wrapRawInnerAsMessage32(rawInner) {
  const code = rawInner.readUInt16BE(0);
  return buildMpsClientMessage32Inner({ code, payload: rawInner.subarray(2) });
}

// Lobby RPC the client drives after LobbyLoginOK on the SAME connection
// (handoff G159/workflow wl0krbnls): the client sends these requests and blocks
// until the server answers; the server must NOT close the connection.
export const LOBBY_REQ_INFO_CHARACTER_CHARGE_CODE = 0x2003; // C->S, answer 0x2004
export const LOBBY_RESP_INFO_CHARACTER_CHARGE_CODE = 0x2004; // S->C
export const LOBBY_REQ_INFO_SESSION_CODE = 0x2005; // C->S, answer 0x2006 (session/character list)
export const LOBBY_RESP_INFO_SESSION_CODE = 0x2006; // S->C
export const LOBBY_SESSION_LOGIN_REQUEST_CODE = 0x2009; // C->S, answer 0x200a
export const LOBBY_SESSION_LOGIN_OK_CODE = 0x200a; // S->C

// Character management family (docs/logh7-character-creation-wire.md). The lobby "新キャラクターの作成"
// (create new character) flow. Account family codes = idx+0x1000 (registrar FUN_0040a0f0); lobby
// family = idx+0x2000 (registrar FUN_00446b10). The CREATE request is CommandGenerateCharacterCharge.
export const CMD_GENERATE_CHARGE_CODE = 0x1008; // C->S CommandGenerateCharacterCharge (CREATE), echo 0x1008 OK
export const CMD_GENERATE_CHARGE_OK_BYTES = 0x80; // 0x20 dwords copied to client+0x43243c (FUN_004be7a0)
export const CMD_EXTENSION_CHARGE_CODE = 0x1007; // C->S CommandExtensionCharacterCharge, echo 0x1007 OK (2 dwords)
export const CMD_ORIGINAL_CHARGE_CODE = 0x1006; // C->S CommandOriginalCharacterCharge, echo 0x1006 OK (6 dwords)
export const LOBBY_CMD_EXTENSION_CHARGE_CODE = 0x2007; // C->S LobbyCommandExtensionCharacterCharge
export const LOBBY_CMD_DELETE_CHARACTER_CODE = 0x2008; // C->S LobbyCommandDeleteCharacter ([u32 session_id])
export const CHARACTER_NAME_MAX_UNITS = 13; // parser cap `< 0xe` per name (lastname/firstname/flagship)
export const MAX_ENTRY_CHARACTERS = 5; // Input_InformationAccount gate: active chars per account

// Conn3 / session-server app-level SS messages. These are distinct from the
// older low-transport bootstrap candidates (`0x0001`, `0x0003`) that map into
// internal 0x020x handlers but did not execute in real-client probes.
export const SS_LOGIN_REQUEST_CODE = 0x0200; // C->S SSLoginRequest, answer 0x0201
export const SS_LOGIN_OK_CODE = 0x0201; // S->C SSLoginOK
export const SS_LOGIN_NG_CODE = 0x0202; // S->C SSLoginNG
export const SS_CHARACTER_ID_REQUEST_CODE = 0x0203; // C->S, answer 0x0204
export const SS_CHARACTER_ID_RESPONSE_CODE = 0x0204; // S->C SSCharacterIDResponce
export const SS_GAME_LOGIN_REQUEST_CODE = 0x0205; // C->S SSGameLoginRequest, answer 0x0206
export const SS_GAME_LOGIN_OK_CODE = 0x0206; // S->C SSGameLoginOK

// Conn3 in-game world-data layer (G138 next gate). After SSGameLoginOK the client
// (now at "NOW LOADING") drives request/response pairs in the 0x03xx Information*
// family. FUN_004b78a0 pairs 0x0304->0x0305 and 0x0306->0x0307; FUN_004b8b00 sizes
// the receive object: 0x0305 -> 0x520a bytes (InformationSession), 0x0307 -> 0xe5b2
// bytes (InformationCharacter). Like the lobby 0x2004/0x2006 replies these are
// message32-wrapped objects whose wire payload is a compact stream with a leading
// count; a zeroed payload with count 0 is the minimal "empty world" answer.
export const SS_REQ_INFO_SESSION_CODE = 0x0304; // C->S, answer 0x0305
export const SS_RESP_INFO_SESSION_CODE = 0x0305; // S->C InformationSession
export const SS_REQ_INFO_CHARACTER_CODE = 0x0306; // C->S, answer 0x0307
export const SS_RESP_INFO_CHARACTER_CODE = 0x0307; // S->C InformationCharacter
export const SS_RESP_INFO_SESSION_PAYLOAD_BYTES = 0x520a;
export const SS_RESP_INFO_CHARACTER_PAYLOAD_BYTES = 0xe5b2;

/** Minimal conn3 InformationSession (0x0305) reply: message32, leading count 0. */
export function buildWorldInformationSessionInner() {
  return buildLobbyResponseInner(SS_RESP_INFO_SESSION_CODE, SS_RESP_INFO_SESSION_PAYLOAD_BYTES);
}

// conn3 world-clock sync (0x0300 family base, FUN_00434380 index 0 = "RequestTime").
export const SS_REQ_TIME_CODE = 0x0300; // C->S RequestTime, answer 0x0301
export const SS_RESP_TIME_CODE = 0x0301; // S->C ResponseTime: a 4-byte server start time

/**
 * Build the conn3 ResponseTime (0x0301) reply with a non-zero server start time.
 *
 * G143: the ResponseTime handler (FUN_004ba2b0 case 0x0301) stores `*body` at
 * client+0x432418 ("Start time = %d"), feeds it to the game-clock consumer
 * FUN_004c5a30, and uses (now - startTime) as elapsed seconds. The generic empty
 * walker answered with startTime=0, which is the suspected deterministic world-build
 * crash (zero/invalid game clock). The value is a single LE u32 the handler reads
 * directly from the message32 payload.
 * @param {{ serverTime?: number }} [options] monotonic seconds (default: a fixed non-zero base)
 */
export function buildResponseTimeInner({ serverTime = 0x40000000 } = {}) {
  const payload = Buffer.alloc(4);
  payload.writeUInt32LE(serverTime >>> 0, 0);
  return buildMpsClientMessage32Inner({ code: SS_RESP_TIME_CODE, payload });
}

// conn3 world-build crash fix (G145 grid-spec workflow). The world-build null-deref
// (FUN_004c9a80 -> FUN_004c96c0 resolving the player in the unit ring at client+0x126718)
// is avoided by populating that ring with the player's character: (1) 0x0204 sets the
// selected char id at client+0x3584a0; (2) >=1 0x0323 record whose first u32 == that id
// makes FUN_004c2a80's placement match (record[0]==client+0x3584a0), so FUN_004c7cd0
// returns a non-null slot. The client does not request 0x0203/0x0322 before crashing, so
// these are pushed unsolicited (dispatch cases 0x204/0x323 are unconditional).
export const SS_RESP_CHARACTER_ID_CODE = 0x0204; // S->C SSCharacterIDResponce -> client+0x3584a0
export const SS_RESP_INFO_CHARACTER_RECORD_CODE = 0x0323; // S->C ResponseInformationCharacter (724B record)
export const SS_RESP_INFO_CHARACTER_RECORD_BYTES = 0x02d4; // 724
export const SS_RESP_STATIC_GRID_CODE = 0x0315; // S->C ResponseStaticInformationGrid (terrain map)
export const SS_RESP_STATIC_GRID_TYPE_CODE = 0x0313; // S->C ResponseStaticInformationGridType (object table)
export const SS_RESP_STATIC_GRID_BYTES = 0x138c; // 5004 (fixed size for both 0x0313 and 0x0315)

/** 0x0204 SSCharacterIDResponce: 4-byte LE char id stored at client+0x3584a0. */
export function buildSsCharacterIdResponseInner({ characterId = 1 } = {}) {
  const payload = Buffer.alloc(4);
  payload.writeUInt32LE(characterId >>> 0, 0);
  return buildMpsClientMessage32Inner({ code: SS_RESP_CHARACTER_ID_CODE, payload });
}

/**
 * 0x0323 ResponseInformationCharacter: one 724-byte character record. Field [0..3] is the
 * char id compared to client+0x3584a0 (must match); [0x24..0x27] grid/unit id (0 = skip the
 * inner unit match). Everything else zero is the minimal placeable record.
 */
export function buildInformationCharacterRecordInner({
  characterId = 1, gridUnitId = 0, power = null, spot = null, spotOwner = null, abilities = null, online = false,
  lastname = null, firstname = null, rank = null, face = null,
} = {}) {
  const inner = buildLobbyResponseInner(SS_RESP_INFO_CHARACTER_RECORD_CODE, SS_RESP_INFO_CHARACTER_RECORD_BYTES);
  const payload = inner.subarray(6);
  // proven anchors (G164 world load): id@0x00, flagship/grid-unit id@0x24
  payload.writeUInt32LE(characterId >>> 0, 0x00);
  payload.writeUInt32LE(gridUnitId >>> 0, 0x24);
  // optional real fields at the binary-evidenced 0x0323 offsets (docs/logh7-info-records-wire.md)
  if (Number.isInteger(power)) payload.writeUInt8(power & 0xff, 0x04); // 陣営/faction id
  if (Number.isInteger(spot)) payload.writeUInt32LE(spot >>> 0, 0x1c); // current system id
  if (Number.isInteger(spotOwner)) payload.writeUInt32LE(spotOwner >>> 0, 0x20);
  if (online) payload.writeUInt8(1, 0x64);
  // ability_8 @0x188: 8 entries of {point u16, experience u16}, canonical order
  // 統率/政治/運用/情報 (PCP) + 指揮/機動/攻撃/防御 (MCP). We fill the `point` (the stat value).
  if (Array.isArray(abilities)) {
    for (let i = 0; i < 8 && i < abilities.length; i += 1) {
      payload.writeUInt16LE((abilities[i] ?? 0) & 0xffff, 0x188 + i * 4);
    }
  }
  // parentage[0] sub-record @0x80 (stride 0x84): names + rank + face at the documented rel. offsets.
  // Names are u16-char pascal strings (len byte + u16 chars, max 13).
  const P0 = 0x80;
  const writePstr16 = (str, lenOff, charsOff) => {
    const codes = [...String(str)].slice(0, 13);
    payload.writeUInt8(codes.length, lenOff);
    for (let i = 0; i < codes.length; i += 1) payload.writeUInt16LE(codes[i].charCodeAt(0) & 0xffff, charsOff + i * 2);
  };
  if (lastname != null) writePstr16(lastname, P0 + 0x01, P0 + 0x02); // lastname @0x81/0x82
  if (firstname != null) writePstr16(firstname, P0 + 0x1c, P0 + 0x1e); // firstname @0x9c/0x9e
  if (Number.isInteger(rank)) payload.writeUInt16LE(rank & 0xffff, P0 + 0x56); // rank @0xd6
  if (Number.isInteger(face)) payload.writeUInt32LE(face >>> 0, P0 + 0x74); // face @0xf4
  return inner;
}

export const SS_RESP_INFO_UNIT_CODE = 0x0325; // S->C ResponseInformationUnit (unit table)
export const SS_RESP_INFO_UNIT_BYTES = 0xce44; // 52804

/**
 * 0x0325 ResponseInformationUnit: the world unit table. Dispatcher case 0x325 copies the whole
 * payload to clientBase+0x41a364: [u16 LE unitCount][u16 pad][unit[0] (stride 0x58)][unit[1]]...
 * Each unit's id is the leading u32 of its 0x58-byte record (clientBase+0x41a368 for unit[0]).
 * This matters because FUN_004c2a80's LOCAL-player spawn (FUN_004c2c80(0, sessionRecord)) only
 * runs inside `if (unitCount != 0)` AND requires a unit whose id == the character record[9]
 * (0x0323 gridUnitId). So a single unit with id == gridUnitId is the minimal table that lets the
 * player be placed into PLAYER_INFO during world entry. (G160 live test: with unitCount 0 the
 * local spawn is skipped and the HUD crashes at 0x58f83a.)
 */
export function buildInformationUnitRecordInner({ unitId = 1, unitCount = 1 } = {}) {
  const inner = buildLobbyResponseInner(SS_RESP_INFO_UNIT_CODE, SS_RESP_INFO_UNIT_BYTES);
  const payload = inner.subarray(6);
  payload.writeUInt16LE(unitCount & 0xffff, 0); // clientBase+0x41a364 unit count
  payload.writeUInt32LE(unitId >>> 0, 4); // clientBase+0x41a368 unit[0].id
  return inner;
}

/**
 * 0x0315 ResponseStaticInformationGrid terrain map. Payload = [u8 width][u8 height]
 * [u16 LE rleByteCount][rle pairs (run,value)]; sum(run) must equal width*height. The
 * client RLE-decodes it (FUN_004abbb0) into a width*height grid-type cell map.
 */
/**
 * 0x0315 ResponseStaticInformationGrid — the strategic CELL GRID (RLE). Decoded by FUN_004abbb0:
 * `[u8 w][u8 h][u16 rleCount]{[u8 run][u8 value]}…`, validated `sum(run) == w*h`. A non-zero cell
 * value `v` (3..88) is an index into the 0x0313 object table (`objectTable[v*3]`), so placing value
 * `v` at a cell makes that cell render/click the object whose record is at index `v`. The wire record
 * is a FIXED 5004-byte size (FUN_004b8b00 size table), so buildLobbyResponseInner zero-pads the
 * payload to 5004 — the decoder ignores trailing zero pad once `rleCount` pairs are consumed.
 *
 * `cells` = [{ col, row, value }] placements (value 3..88). Everything else is `fillValue` (default 0
 * = empty). With no cells this is the proven empty board. `gridType`/`fillValue` are interchangeable
 * (gridType kept for back-compat). Evidence: docs/logh7-strategic-map-wire.md §2/§4.
 */
export function buildStaticInformationGridInner({
  width = 1,
  height = 1,
  gridType = 0,
  fillValue = gridType,
  cells = [],
} = {}) {
  const w = width & 0xff;
  const h = height & 0xff;
  // Materialize the 2D grid row-major (row*w + col), then RLE-encode it run-length (run capped 255).
  const grid = new Uint8Array(w * h).fill(fillValue & 0xff);
  for (const { col, row, value } of cells) {
    if (col >= 0 && col < w && row >= 0 && row < h) {
      grid[row * w + col] = value & 0xff;
    }
  }
  const pairs = [];
  let i = 0;
  while (i < grid.length) {
    const value = grid[i];
    let run = 0;
    while (i < grid.length && grid[i] === value && run < 255) {
      run += 1;
      i += 1;
    }
    pairs.push(run, value);
  }
  const inner = buildLobbyResponseInner(SS_RESP_STATIC_GRID_CODE, SS_RESP_STATIC_GRID_BYTES);
  const payload = inner.subarray(6);
  payload.writeUInt8(w, 0);
  payload.writeUInt8(h, 1);
  // rleCount = BYTE length of the pair region (FUN_004abbb0 loops a byte offset `uVar10 += 2` while
  // `uVar10 < rleCount-1`, so rleCount = 2 × pair count). Verified against the decompiled decoder.
  payload.writeUInt16LE(pairs.length, 2);
  Buffer.from(pairs).copy(payload, 4);
  return inner;
}

/**
 * 0x0313 ResponseStaticInformationGridType — the strategic OBJECT TABLE: 100 objects × 3 bytes,
 * preceded by a 1-byte lead (the client copies 301 bytes into a FIXED 5004-byte record). Per object
 * record at index `v` (= cell value 3..88): byte0 = content-table record id (→ FUN_00522010(0x18,…),
 * the marker's label/link), byte1 = object class (ONLY `3` is placed as a clickable sector marker),
 * byte2 = sprite/color variant (valid 0..6, 8). A fleet placed at cell value `v` needs both this
 * object record (class 3) AND the 0x0315 cell carrying value `v`.
 *
 * `objects` = [{ value, contentId, klass = 3, variant = 0 }] (value 3..88). Evidence:
 * docs/logh7-strategic-map-wire.md §1/§3 (FUN_004c5350 split, FUN_004d3bd0 placement gate).
 */
export function buildStaticInformationGridTypeInner({ objects = [] } = {}) {
  const inner = buildLobbyResponseInner(SS_RESP_STATIC_GRID_TYPE_CODE, SS_RESP_STATIC_GRID_BYTES);
  const payload = inner.subarray(6);
  // Object table proper starts 1 byte into the staging copy (client reads at base+1). Lay records at
  // payload offset `1 + value*3` so cell value `v` resolves to objectTable[v*3] client-side.
  for (const { value, contentId = 0, klass = 3, variant = 0 } of objects) {
    if (value < 0 || value > 99) {
      continue;
    }
    const off = 1 + value * 3;
    payload.writeUInt8(contentId & 0xff, off);
    payload.writeUInt8(klass & 0xff, off + 1);
    payload.writeUInt8(variant & 0xff, off + 2);
  }
  return inner;
}

/** Minimal conn3 InformationCharacter (0x0307) reply: message32, leading count 0. */
export function buildWorldInformationCharacterInner() {
  return buildLobbyResponseInner(SS_RESP_INFO_CHARACTER_CODE, SS_RESP_INFO_CHARACTER_PAYLOAD_BYTES);
}

// --- In-world (tactical grid) multiplayer messages (G165/G166) ---
// These are the authoritative server->client broadcasts that move ships in the grid. Field
// layouts read from the client's receive handlers in dispatcher FUN_004ba2b0:
//   NotifyTurnedShip (0x0424, 12B = 3 dwords) -> FUN_004bf970: dword1 = shipId (FUN_004c7cd0
//     grid-slot key), dword0 + dword2 are passed to the turn applier FUN_004bf4c0.
//   NotifyMovedShip  (0x0423, 28B = 7 dwords) -> FUN_004bf870: dword1 = shipId, dword2 = a
//     move param (speed/duration), dword3..5 = target position (x,y,z floats), dword6 low byte =
//     state: >=0 sets a docked/station state, <0 (0xff) triggers a position move to dword3..5.
// Both require the ship to already be in the grid at client+0x126718 (populated by FUN_004c32a0
// at grid-enter). Grid-enter is driven by NotifyEnterGridBegin/End (0xb09/0xb0a, 1 byte each).
export const NOTIFY_MOVED_SHIP_CODE = 0x0423;
export const NOTIFY_MOVED_SHIP_BYTES = 0x1c; // 28
export const NOTIFY_TURNED_SHIP_CODE = 0x0424;
export const NOTIFY_TURNED_SHIP_BYTES = 0x0c; // 12
export const NOTIFY_ENTER_GRID_BEGIN_CODE = 0x0b09;
export const NOTIFY_ENTER_GRID_END_CODE = 0x0b0a;
export const NOTIFY_ENTER_GRID_BYTES = 0x01;

/** 0x0424 NotifyTurnedShip: turn ship `shipId` (heading/turn carried in field0/field2). */
export function buildNotifyTurnedShipInner({ shipId = 1, field0 = 0, field2 = 0 } = {}) {
  const inner = buildLobbyResponseInner(NOTIFY_TURNED_SHIP_CODE, NOTIFY_TURNED_SHIP_BYTES);
  const payload = inner.subarray(6);
  payload.writeUInt32LE(field0 >>> 0, 0); // dword0
  payload.writeUInt32LE(shipId >>> 0, 4); // dword1 = grid-slot ship id
  payload.writeUInt32LE(field2 >>> 0, 8); // dword2
  return inner;
}

/**
 * 0x0423 NotifyMovedShip: move ship `shipId` to (x,y,z). stateByte < 0 (default 0xff) selects
 * the position-move branch; a value >= 0 instead sets a docked/station state index.
 */
export function buildNotifyMovedShipInner({
  shipId = 1,
  x = 0,
  y = 0,
  z = 0,
  moveParam = 0,
  field0 = 0,
  stateByte = 0xff,
} = {}) {
  const inner = buildLobbyResponseInner(NOTIFY_MOVED_SHIP_CODE, NOTIFY_MOVED_SHIP_BYTES);
  const payload = inner.subarray(6);
  payload.writeUInt32LE(field0 >>> 0, 0); // dword0
  payload.writeUInt32LE(shipId >>> 0, 4); // dword1 = grid-slot ship id
  payload.writeUInt32LE(moveParam >>> 0, 8); // dword2 = move param (speed/duration)
  payload.writeFloatLE(x, 12); // dword3 = target x
  payload.writeFloatLE(y, 16); // dword4 = target y
  payload.writeFloatLE(z, 20); // dword5 = target z
  payload.writeUInt8(stateByte & 0xff, 24); // dword6 low byte = state (>=0 dock, <0 move)
  return inner;
}

/** 0x0b09 NotifyEnterGridBegin (1 byte body[0]) — resets the session count, opens grid entry. */
export function buildNotifyEnterGridBeginInner({ value = 1 } = {}) {
  const inner = buildLobbyResponseInner(NOTIFY_ENTER_GRID_BEGIN_CODE, NOTIFY_ENTER_GRID_BYTES);
  inner.subarray(6).writeUInt8(value & 0xff, 0);
  return inner;
}

/** 0x0b0a NotifyEnterGridEnd (1 byte body[0]) — triggers FUN_004c2a80(1)/FUN_004c32a0(1) grid placement. */
export function buildNotifyEnterGridEndInner({ value = 1 } = {}) {
  const inner = buildLobbyResponseInner(NOTIFY_ENTER_GRID_END_CODE, NOTIFY_ENTER_GRID_BYTES);
  inner.subarray(6).writeUInt8(value & 0xff, 0);
  return inner;
}

// --- Space war / tactical combat notifies (G201, docs/logh7-proto-battle-fire.md) ---
export const NOTIFY_ATTACKED_SHIP_CODE = 0x0426;
export const NOTIFY_ATTACKED_SHIP_BYTES = 0x1c; // 28 = 7 dwords (apply FUN_004c0df0 copies 7 dwords)
export const NOTIFY_CHANGE_MODE_CODE = 0x042f;
export const NOTIFY_CHANGE_MODE_BYTES = 0x298; // 664 = 166 dwords (apply FUN_004c1c30 copies 0xa6 dwords)
export const NOTIFY_FOUGHT_CODE = 0x0427;
export const NOTIFY_FOUGHT_BYTES = 0x10; // 16 = 4 dwords (apply FUN_004c1130, param_1+0x438244)
export const NOTIFY_MORALE_DOWN_CODE = 0x0440;
export const NOTIFY_MORALE_DOWN_BYTES = 0x0c; // 12 = 3 dwords

/**
 * 0x0426 NotifyAttackedShip — THE damage broadcast (space war). The other clients render the hit:
 * each pool is set to (max − wireValue). Body (28B, apply FUN_004c0df0):
 *   @0x00 u32 context(0)  @0x04 u32 attackerId  @0x08 u8 weaponType (→ beam effect FUN_004b3460)
 *   @0x0c u32 targetId    @0x10 u16 armorDamage  @0x12 u16 zankiDamage(残機)
 *   @0x14 u8 hitLoc(<6)   @0x16 u16 shieldDamage
 * The damage values are CUMULATIVE (client: current = classMax − value). Evidence:
 * docs/logh7-proto-battle-fire.md, FUN_004c0df0 (entity+0x8d4 armor / +0x8d8 zanki / shield via +0x288).
 */
export function buildNotifyAttackedShipInner({
  attackerId = 0,
  targetId = 0,
  weaponType = 0,
  armorDamage = 0,
  zankiDamage = 0,
  shieldDamage = 0,
  hitLoc = 0,
} = {}) {
  const inner = buildLobbyResponseInner(NOTIFY_ATTACKED_SHIP_CODE, NOTIFY_ATTACKED_SHIP_BYTES);
  const p = inner.subarray(6);
  p.writeUInt32LE(0, 0); // context
  p.writeUInt32LE(attackerId >>> 0, 4);
  p.writeUInt8(weaponType & 0xff, 8);
  p.writeUInt32LE(targetId >>> 0, 12);
  p.writeUInt16LE(armorDamage & 0xffff, 16);
  p.writeUInt16LE(zankiDamage & 0xffff, 18);
  p.writeUInt8(hitLoc & 0xff, 20);
  p.writeUInt16LE(shieldDamage & 0xffff, 22);
  return inner;
}

/**
 * 0x042f NotifyChangeMode — THE authoritative battle-entry GRANT (664B, apply FUN_004c1c30). This is the
 * message that flips the client into a CONTROLLABLE tactical battle: it carries the field anchor + every
 * participant's SPAWN POSE, seeding each ship's position/facing in the same continuous float XZ space as
 * NotifyMovedShip 0x423. Body (docs/logh7-proto-battle-core.md §2):
 *   @0x00 u32 field0  @0x04 u8 modeKind (4/6=engage, 5=evac, 7=air)  @0x08 u32 fieldOwnerId (anchor)
 *   @0x0c u8 unitCount  @0x10 participant entries stride 20: [u32 shipId][f32 heading][f32 x][f32 z][f32 y]
 *   @0x290 u32 tail0 (field obj +0x40)  @0x294 u32 tail1 (field obj +0x44). Fixed 664B, wire-packed.
 * `units` = [{ shipId, heading, x, z, y }]. `mode`/`leaderId` kept as aliases for modeKind/fieldOwnerId.
 */
export function buildNotifyChangeModeInner({ mode = 0, modeKind, leaderId = 0, fieldOwnerId, units = [], tail0 = 0, tail1 = 0 } = {}) {
  const inner = buildLobbyResponseInner(NOTIFY_CHANGE_MODE_CODE, NOTIFY_CHANGE_MODE_BYTES);
  const p = inner.subarray(6);
  p.writeUInt8((modeKind ?? mode) & 0xff, 4); // modeKind low byte
  p.writeUInt32LE((fieldOwnerId ?? leaderId) >>> 0, 8); // field anchor
  const count = Math.min(units.length, 32);
  p.writeUInt8(count & 0xff, 12);
  for (let i = 0; i < count; i += 1) {
    const off = 16 + i * 20;
    if (off + 20 > p.length) break;
    const u = units[i];
    p.writeUInt32LE((u.shipId ?? u.unitId ?? 0) >>> 0, off);
    p.writeFloatLE(u.heading ?? 0, off + 4);
    p.writeFloatLE(u.x ?? 0, off + 8);
    p.writeFloatLE(u.z ?? 0, off + 12);
    p.writeFloatLE(u.y ?? 0, off + 16);
  }
  p.writeUInt32LE(tail0 >>> 0, 0x290);
  p.writeUInt32LE(tail1 >>> 0, 0x294);
  return inner;
}

/** 0x0427 NotifyFought — auto-resolved engagement result (16B / 4 dwords, apply FUN_004c1130). */
export function buildNotifyFoughtInner({ dword0 = 0, dword1 = 0, dword2 = 0, dword3 = 0 } = {}) {
  const inner = buildLobbyResponseInner(NOTIFY_FOUGHT_CODE, NOTIFY_FOUGHT_BYTES);
  const p = inner.subarray(6);
  p.writeUInt32LE(dword0 >>> 0, 0);
  p.writeUInt32LE(dword1 >>> 0, 4);
  p.writeUInt32LE(dword2 >>> 0, 8);
  p.writeUInt32LE(dword3 >>> 0, 12);
  return inner;
}

/** 0x0440 NotifyMoraleDown — a unit's 士気 dropped (12B / 3 dwords). dword1 = unit/ship id. */
export function buildNotifyMoraleDownInner({ shipId = 0, morale = 0, field0 = 0 } = {}) {
  const inner = buildLobbyResponseInner(NOTIFY_MORALE_DOWN_CODE, NOTIFY_MORALE_DOWN_BYTES);
  const p = inner.subarray(6);
  p.writeUInt32LE(field0 >>> 0, 0);
  p.writeUInt32LE(shipId >>> 0, 4);
  p.writeUInt32LE(morale >>> 0, 8);
  return inner;
}

// --- Ground combat (地上戦) notifies (G201, docs/logh7-proto-battle-fleetops.md §1) ---
export const NOTIFY_MOVED_TROOP_CODE = 0x0429;
export const NOTIFY_MOVED_TROOP_BYTES = 0x14; // 20 = [u32 troopId][f32 x][f32 y][f32 z] (mirrors NotifyMovedShip)
export const NOTIFY_LAND_COMBAT_CODE = 0x042a;
export const NOTIFY_LAND_COMBAT_BYTES = 0x0c; // 12 = [u32 unitId][u16 result][u16 _][u32 _]
export const NOTIFY_SORTIE_CODE = 0x0437;
export const NOTIFY_SORTIE_BYTES = 0x14; // 20 (dispatch group)

/** 0x0429 NotifyMovedTroop — a sortied troop's new position (20B), same float XZ space as ships. */
export function buildNotifyMovedTroopInner({ troopId = 0, x = 0, y = 0, z = 0 } = {}) {
  const inner = buildLobbyResponseInner(NOTIFY_MOVED_TROOP_CODE, NOTIFY_MOVED_TROOP_BYTES);
  const p = inner.subarray(6);
  p.writeUInt32LE(troopId >>> 0, 0);
  p.writeFloatLE(x, 4);
  p.writeFloatLE(y, 8);
  p.writeFloatLE(z, 12);
  return inner;
}

/**
 * 0x042a NotifyLandCombat — a ground-combat tick result (12B): [u32 unitId][u16 result][u16 _][u32 _].
 * `result` encodes the engagement outcome (0 ongoing / 1 attacker win / 2 defender win). Evidence:
 * docs/logh7-proto-battle-fleetops.md §1 (NotifyLandCombat 0x42a). Confidence medium.
 */
export function buildNotifyLandCombatInner({ unitId = 0, result = 0, field3 = 0 } = {}) {
  const inner = buildLobbyResponseInner(NOTIFY_LAND_COMBAT_CODE, NOTIFY_LAND_COMBAT_BYTES);
  const p = inner.subarray(6);
  p.writeUInt32LE(unitId >>> 0, 0);
  p.writeUInt16LE(result & 0xffff, 4);
  p.writeUInt32LE(field3 >>> 0, 8);
  return inner;
}

/** 0x0437 NotifySortie — the sortied troop/unit acknowledgement (20B). dword0 = unit id. */
export function buildNotifySortieInner({ unitId = 0, field1 = 0 } = {}) {
  const inner = buildLobbyResponseInner(NOTIFY_SORTIE_CODE, NOTIFY_SORTIE_BYTES);
  const p = inner.subarray(6);
  p.writeUInt32LE(unitId >>> 0, 0);
  p.writeUInt32LE(field1 >>> 0, 4);
  return inner;
}

// --- Strategic (sector map) fleet movement (G176+, docs/logh7-strategic-input-wire.md) ---
//   CommandMoveGrid  (0x0b01, 36B / 9 dwords) C->S: the player orders a fleet to a destination cell.
//     The client consumer FUN_004bea90 is an empty stub, so the server reflects 0x0b01 back to the
//     sender as the move ACK (byte-faithful) and broadcasts the authoritative 0x0b07 to everyone.
//   NotifyMovedGrid  (0x0b07, 580B) S->C: applied by FUN_004bee20->FUN_00517cd0. Layout = 0x14 header
//     (4 dwords + u16 @0x10 + u8 unitCount @0x12, max 70) + a 70-slot unit array @0x14 stride 8:
//     {u32 unitId, u32 cell}. Moving a fleet = one 0x0b07 with unitCount=1 carrying [unitId, destCell].
export const COMMAND_MOVE_GRID_BYTES = 0x24; // 36
export const NOTIFY_MOVED_GRID_CODE = 0x0b07;
export const NOTIFY_MOVED_GRID_BYTES = 0x244; // 580
export const NOTIFY_MOVED_GRID_MAX_UNITS = 70;

/**
 * 0x0b07 NotifyMovedGrid: authoritative strategic move. `units` = [{ unitId, cell }] (≤70). The
 * client writes each unit's new cell into PLAYER_INFO (FUN_00517cd0). Evidence:
 * docs/logh7-strategic-input-wire.md §3 (FUN_0044b460/FUN_0044b600 parsers, 0x14 header + stride-8 array).
 */
export function buildNotifyMovedGridInner({ units = [], header = {} } = {}) {
  const inner = buildLobbyResponseInner(NOTIFY_MOVED_GRID_CODE, NOTIFY_MOVED_GRID_BYTES);
  const payload = inner.subarray(6);
  const count = Math.min(units.length, NOTIFY_MOVED_GRID_MAX_UNITS);
  // 0x14 header: dwords 0..3 are context (move kind / actor / timestamp anchors — default 0 works for
  // a plain relayed move), u16 @0x10 (group/flags), u8 unitCount @0x12.
  payload.writeUInt32LE((header.dword0 ?? 0) >>> 0, 0);
  payload.writeUInt32LE((header.dword1 ?? 0) >>> 0, 4);
  payload.writeUInt32LE((header.dword2 ?? 0) >>> 0, 8);
  payload.writeUInt32LE((header.dword3 ?? 0) >>> 0, 12);
  payload.writeUInt16LE((header.flags ?? 0) & 0xffff, 16);
  payload.writeUInt8(count & 0xff, 18);
  for (let i = 0; i < count; i += 1) {
    const off = 0x14 + i * 8;
    payload.writeUInt32LE(units[i].unitId >>> 0, off);
    payload.writeUInt32LE(units[i].cell >>> 0, off + 4);
  }
  return inner;
}

/**
 * Parse an inbound CommandGenerateCharacterCharge (0x1008) — the "create new character" request, the
 * packed SEND form (serializer FUN_00405ea0 / parser FUN_004066f0). Raw inner is [u16 BE code][body];
 * the body (UCS-2 names = one u16 per char after a u8 length, each name capped ≤13) is laid out:
 *   @0x00 u32 request_category, @0x08 u8 power, @0x09 u8 blood, @0x0a u8 sex,
 *   @0x0b u8 lastname_len, @0x0c u16[len] lastname, then firstname_len/firstname,
 *   @0x4c u32 face, @0x50 u8[8] ability_8, @0x58 u8 bonus_point, @0x5a u8 title, @0x5b u8 rank.
 * Names sit at fixed slots (lastname@0x0c max 13, firstname@0x28 max 13) per get_length FUN_00405720.
 * Returns null if too short. Evidence: docs/logh7-character-creation-wire.md §2.
 */
export function parseGenerateCharacterCharge(inner) {
  const body = inner.subarray(2);
  if (body.length < 0x5c) {
    return null;
  }
  const readName = (lenOff, nameOff, maxUnits) => {
    const len = Math.min(body.readUInt8(lenOff), maxUnits);
    let name = '';
    for (let i = 0; i < len; i += 1) {
      const off = nameOff + i * 2;
      if (off + 2 > body.length) {
        break;
      }
      name += String.fromCharCode(body.readUInt16LE(off));
    }
    return name;
  };
  const abilities = [];
  for (let i = 0; i < 8; i += 1) {
    abilities.push(body.readUInt8(0x50 + i));
  }
  return {
    requestCategory: body.readUInt32LE(0x00),
    power: body.readUInt8(0x08),
    blood: body.readUInt8(0x09),
    sex: body.readUInt8(0x0a),
    lastname: readName(0x0b, 0x0c, CHARACTER_NAME_MAX_UNITS),
    firstname: readName(0x26, 0x28, CHARACTER_NAME_MAX_UNITS),
    face: body.readUInt32LE(0x4c),
    abilities,
    bonusPoint: body.readUInt8(0x58),
    title: body.readUInt8(0x5a),
    rank: body.readUInt8(0x5b),
  };
}

/**
 * 0x1008 CommandGenerateCharacterCharge OK echo. The dispatcher case 0x1008 copies 0x20 dwords (128
 * bytes) into client+0x43243c then runs the create-result post-proc FUN_004be7a0. We echo the new
 * character id in the first dword (the client re-requests 0x2003→0x2004 to render the new card).
 * `status` lands right after as a success marker. Evidence: docs/logh7-character-creation-wire.md §1.
 */
export function buildGenerateCharacterChargeOkInner({ characterId = 0, status = 1 } = {}) {
  const inner = buildLobbyResponseInner(CMD_GENERATE_CHARGE_CODE, CMD_GENERATE_CHARGE_OK_BYTES);
  const payload = inner.subarray(6);
  payload.writeUInt32LE(characterId >>> 0, 0);
  payload.writeUInt32LE(status >>> 0, 4);
  return inner;
}

export const COMMAND_GRID_CHAT_CODE = 0x0f1c;
export const COMMAND_GRID_CHAT_BYTES = 0x8c; // 140

/**
 * 0x0f1c CommandGridChat in the form a client RECEIVES it (case 0xf1c -> FUN_004be660 ->
 * FUN_004be6f0(text@+10, msgLen@+9, channel@+4)). 140-byte payload:
 *   [u32 time][u32 channel @4][u8 castType @8][u8 msgLen @9][message: msgLen 16-bit chars @10].
 * Message is wide (2 bytes/char), max 65 chars. The relay (G190) broadcasts this to the other
 * in-world players so the chat appears on their screens.
 */
export function buildCommandGridChatInner({ text = '', channel = 0, time = 0, castType = 0 } = {}) {
  const chars = Array.from(String(text)).slice(0, 65);
  const inner = buildLobbyResponseInner(COMMAND_GRID_CHAT_CODE, COMMAND_GRID_CHAT_BYTES);
  const payload = inner.subarray(6);
  payload.writeUInt32LE(time >>> 0, 0);
  payload.writeUInt32LE(channel >>> 0, 4);
  payload.writeUInt8(castType & 0xff, 8);
  payload.writeUInt8(chars.length, 9);
  for (let i = 0; i < chars.length; i += 1) {
    payload.writeUInt16LE(chars[i].charCodeAt(0) & 0xffff, 10 + i * 2);
  }
  return inner;
}

export const SS_RESP_TACTICS_INFO_CODE = 0x033b; // S->C ResponseTacticsInformationUnitSh
export const SS_RESP_TACTICS_INFO_BYTES = 0x79e4; // 31204 — dispatcher memcpy copies a fixed 0x1e79 dwords
export const TACTICS_UNIT_ENTRY_STRIDE = 52; // 13 dwords; entry[0] starts at body+4 (clientBase+0x4271ac)

/**
 * 0x033b ResponseTacticsInformationUnitSh — the tactical encounter unit table (G196, workflow
 * wnxq1e3hz). Dispatcher case 0x33b memcpy's the whole fixed-size payload to clientBase+0x4271a8.
 * The tactical-pool populator FUN_004c32a0 reads [u16 LE count @0], then iterates entries starting
 * at +4 (clientBase+0x4271ac) with stride 13 dwords (52 bytes):
 *   [0] u32 unitId      (nonzero; must match a unit-table id at clientBase+0x41a368)
 *   [1] u32 controllable (1 = player-controllable; stored to unit+0x954)
 *   [2] u32 mapSection   (validated against the faction DB; default = unitId)
 *   [3..6] float x, y, z, heading (passed to FUN_004c4240)
 *   [7..12] reserved (copied verbatim to unit+0x97c; zero is safe)
 * This is the ONLY vector that populates the tactical active-unit pool clientBase+0x126718. NOTE:
 * FUN_004c32a0 ALSO hard-gates on mode byte clientBase+0x126711==0, which no server message sets
 * (measured ==2 live, G167). So sending this alone does not populate the pool — a live experiment
 * must poke 0x126711=0 before the grid-enter (0xb09/0xb0a) that triggers the populate path.
 */
export function buildResponseTacticsInformationInner({ units = [] } = {}) {
  const inner = buildLobbyResponseInner(SS_RESP_TACTICS_INFO_CODE, SS_RESP_TACTICS_INFO_BYTES);
  const body = inner.subarray(6);
  const list = units.length ? units : [{}];
  body.writeUInt16LE(list.length & 0xffff, 0); // clientBase+0x4271a8 unit count
  for (let i = 0; i < list.length; i += 1) {
    const { unitId = 1, controllable = 1, mapSection, x = 0, y = 0, z = 0, heading = 0 } = list[i];
    const base = 4 + i * TACTICS_UNIT_ENTRY_STRIDE;
    if (base + TACTICS_UNIT_ENTRY_STRIDE > body.length) break; // never overflow the fixed buffer
    body.writeUInt32LE(unitId >>> 0, base + 0);
    body.writeUInt32LE(controllable >>> 0, base + 4);
    body.writeUInt32LE((mapSection ?? unitId) >>> 0, base + 8);
    body.writeFloatLE(x, base + 12);
    body.writeFloatLE(y, base + 16);
    body.writeFloatLE(z, base + 20);
    body.writeFloatLE(heading, base + 24);
  }
  return inner;
}

/**
 * conn3 world-init receive-object sizes, keyed by message code, read from the
 * receive-object factory FUN_004b8b00 (`case 0xNNN: param_4 = SIZE`, goto labels
 * resolved). At "NOW LOADING" the client walks a long sequence of Information/Notify
 * request/response pairs across families 0x03/0x04/0x05/0x07/0x09/0x0b/0x0c/0x0e/0x0f/
 * 0x10/0x12; each request X blocks on the paired reply X+1. A message32 object of the
 * right size with a leading count of 0 is the minimal "empty world" answer that lets
 * the client advance; real session/character/map data is filled into these later.
 * (Handshake codes 0x02xx SS / 0x20xx lobby / 0x7001 are answered by dedicated
 * builders and intentionally omitted here.)
 */
export const WORLD_RESPONSE_OBJECT_SIZES = Object.freeze({
  0x0301: 0x0004, 0x0305: 0x520a, 0x0307: 0xe5b2, 0x0309: 0x055c, 0x030b: 0x6d64, 0x030d: 0x0184,
  0x030f: 0x0034, 0x0311: 0x01b0, 0x0313: 0x138c, 0x0315: 0x138c, 0x0317: 0x0004, 0x031d: 0x520c,
  0x0321: 0x8de4, 0x0323: 0x02d4, 0x0325: 0xce44, 0x0327: 0x0300, 0x0329: 0x0154, 0x032b: 0x0af4,
  0x032d: 0x0e14, 0x032f: 0x8b04, 0x0331: 0x1814, 0x0337: 0x0964, 0x033b: 0x79e4, 0x033f: 0x8ca4,
  0x0341: 0x5dc4, 0x0345: 0x0204, 0x0347: 0x01d8, 0x0349: 0x2ee4, 0x034b: 0x0044, 0x034f: 0xb504,
  0x0356: 0x02d8, 0x0358: 0x005c, 0x0359: 0x001c, 0x035a: 0x0434, 0x0400: 0x041c, 0x0401: 0x0114,
  0x0402: 0x041c, 0x0403: 0x0114, 0x0404: 0x0090, 0x0405: 0x0098, 0x0406: 0x0098, 0x0407: 0x0024,
  0x0408: 0x0018, 0x0409: 0x0010, 0x040a: 0x0114, 0x040b: 0x0094, 0x040c: 0x0020, 0x040d: 0x0294,
  0x040e: 0x0098, 0x040f: 0x0094, 0x0410: 0x0090, 0x0411: 0x0098, 0x0412: 0x0090, 0x0413: 0x0014,
  0x0414: 0x0014, 0x0419: 0x0014, 0x041a: 0x0094, 0x041b: 0x0094, 0x041c: 0x0094, 0x041d: 0x0010,
  0x041e: 0x0010, 0x041f: 0x01a4, 0x0420: 0x0094, 0x0421: 0x0098, 0x0422: 0x0014, 0x0423: 0x001c,
  0x0424: 0x000c, 0x0425: 0x0090, 0x0426: 0x001c, 0x0427: 0x0010, 0x0428: 0x0018, 0x0429: 0x0014,
  0x042a: 0x000c, 0x042c: 0x00fc, 0x042f: 0x0298, 0x0431: 0x0008, 0x0432: 0x00fc, 0x0433: 0x0010,
  0x0434: 0x0010, 0x0435: 0x0014, 0x0436: 0x008c, 0x0437: 0x001c, 0x0438: 0x0010, 0x0439: 0x0088,
  0x043a: 0x000c, 0x043b: 0x000c, 0x043c: 0x0010, 0x043d: 0x0008, 0x043e: 0x0008, 0x043f: 0x0010,
  0x0440: 0x000c, 0x0441: 0x0004, 0x0442: 0x0008, 0x0500: 0x0104, 0x0501: 0x0102, 0x0704: 0x00a0,
  0x0705: 0x3f28, 0x0706: 0x00a8, 0x0707: 0x0028, 0x0708: 0x00a0, 0x0709: 0x009c, 0x0900: 0x001c,
  0x0901: 0x0018, 0x0902: 0x0028, 0x0903: 0x0324, 0x0904: 0x0004, 0x0905: 0x0004, 0x0906: 0x2b94,
  0x0908: 0x0010, 0x0b00: 0x0020, 0x0b01: 0x0024, 0x0b02: 0x0018, 0x0b03: 0x0014, 0x0b04: 0x0024,
  0x0b05: 0x0024, 0x0b06: 0x0164, 0x0b07: 0x0244, 0x0b08: 0x011c, 0x0b09: 0x0001, 0x0b0a: 0x0001,
  0x0b0b: 0x0044, 0x0b0c: 0x0240, 0x0b0d: 0x0a9c, 0x0c00: 0x035c, 0x0c01: 0x0324, 0x0c02: 0x0310,
  0x0c05: 0x9e5c, 0x0c08: 0x0100, 0x0c0b: 0x08dc, 0x0c0c: 0x0020, 0x0e00: 0x0018, 0x0f01: 0x0001,
  0x0f03: 0x0001, 0x0f05: 0x7214, 0x0f07: 0x74cc, 0x0f08: 0x0128, 0x0f09: 0x0001, 0x0f0a: 0x075c,
  0x0f0b: 0x024c, 0x0f0c: 0x0124, 0x0f0d: 0x0128, 0x0f0e: 0x0250, 0x0f0f: 0x052c, 0x0f10: 0x075c,
  0x0f11: 0x012c, 0x0f12: 0x012c, 0x0f13: 0x0264, 0x0f14: 0x025c, 0x0f15: 0x025c, 0x0f16: 0x000c,
  0x0f17: 0x008c, 0x0f18: 0x0010, 0x0f19: 0x0010, 0x0f1a: 0x000c, 0x0f1b: 0x000c, 0x0f1c: 0x008c,
  0x0f1d: 0x008c, 0x0f1e: 0x0090, 0x0f1f: 0x0008, 0x1001: 0x01c0, 0x1003: 0x0fa4, 0x1005: 0x0020,
  0x1006: 0x0018, 0x1007: 0x0008, 0x1008: 0x0080, 0x1200: 0x0024, 0x1201: 0x0001, 0x1202: 0xe104,
  0x1203: 0x2264, 0x1204: 0x1c24, 0x1205: 0x0324, 0x1206: 0x0644, 0x1207: 0x12c4, 0x1208: 0x0e14,
  0x1209: 0x002b, 0x120a: 0x73a4, 0x120b: 0x3cf4, 0x120c: 0x21c4, 0x120d: 0x2ee4, 0x120e: 0x723c,
  0x120f: 0x73a4,
});

/**
 * conn3 "*_OK" status responses whose handler copies the FIRST body byte into a
 * client init-flag (G144 workflow): 0xf01 ResponseWorldInitialize_OK -> client+0x35f356
 * (responseWorldInitialized), 0xf03 ResponseGridInitialize_OK -> client+0x35f357
 * (gridInitialized), 0x317 ResponseInformationGrid_OK -> client+0x35f358. These must
 * carry status byte 1 (OK); an empty 0 byte latches the flag to "not initialized".
 * (Unlike the data objects whose first byte is a record COUNT, which stays 0 = empty.)
 */
export const WORLD_OK_STATUS_CODES = new Set([0x0f01, 0x0f03, 0x0317]);

/**
 * Build the message32 reply for a conn3 world-data RESPONSE code, or null when the
 * factory has no object for it (caller then leaves the request unanswered so the stall
 * point is observable). Data objects are zero-filled (leading count 0 = empty); the
 * *_OK status objects (WORLD_OK_STATUS_CODES) carry a leading status byte of 1.
 * @param {number} responseCode request code + 1
 * @returns {Buffer|null}
 */
export function buildWorldDataResponseInner(responseCode) {
  const size = WORLD_RESPONSE_OBJECT_SIZES[responseCode];
  if (size === undefined) {
    return null;
  }
  const inner = buildLobbyResponseInner(responseCode, size);
  if (WORLD_OK_STATUS_CODES.has(responseCode)) {
    inner.writeUInt8(1, 6); // body[0] = status OK (handler latches it into the init flag)
  }
  return inner;
}

// FUN_004b8b00 receive-object sizes for the lobby response family.
export const LOBBY_RESP_INFO_CHARACTER_CHARGE_PAYLOAD_BYTES = 0x06dc;
export const LOBBY_RESP_INFO_SESSION_PAYLOAD_BYTES = 0x5304;
export const LOBBY_SESSION_LOGIN_OK_PAYLOAD_BYTES = 0x000c;

/**
 * Build the LobbySessionLoginOK (0x200a) inner — the lobby's world-server REDIRECT.
 *
 * RE (workflow wicdkooh5, high conf): the lobby->world handoff is NOT inner 0x7001
 * (which is inert on the lobby session). The client sends 0x2009 (LobbySessionLoginRequest)
 * and the paired reply is 0x200a. Consumer 0x4bdc2e copies the deserialized object's first
 * three dwords into the world-endpoint block [base+0x35f144 IP][+0x35f148 port][+0x35f14c token]
 * and sets the world-ready flag [base+0x35837c]=1; the lobby FSM (gate 0x51bec0) then connects
 * conn3 via 0x51bee0 reading exactly those fields.
 *
 * Wire layout: [u16 BE 0x200a][u32 BE octet-packed IP][u16 BE port][u16 BE pad=0][u32 BE token].
 * IP packing is octet-low-byte-first (== ipToRedirectU32); 127.0.0.1 -> 0x0100007f.
 * @param {{ ip?: string, port?: number, token?: number }} [options]
 */
export function buildLobbySessionLoginOkInner({ ip = '127.0.0.1', port = 47900, token = 0 } = {}) {
  if (!Number.isInteger(port) || port < 0 || port > 0xffff) {
    throw new Error(`invalid world redirect port: ${port}`);
  }
  const inner = Buffer.alloc(2 + LOBBY_SESSION_LOGIN_OK_PAYLOAD_BYTES);
  inner.writeUInt16BE(LOBBY_SESSION_LOGIN_OK_CODE, 0);
  inner.writeUInt32BE(ipToRedirectU32(ip), 2); // -> [base+0x35f144]
  inner.writeUInt16BE(port & 0xffff, 6); // -> word[base+0x35f148]
  inner.writeUInt16BE(0, 8); // pad (high word of 0x35f148)
  inner.writeUInt32BE((token ?? 0) >>> 0, 10); // -> [base+0x35f14c]
  return inner;
}

export function buildLobbySessionLoginOkMessage32Inner(options = {}) {
  const raw = buildLobbySessionLoginOkInner(options);
  return buildMpsClientMessage32Inner({ code: LOBBY_SESSION_LOGIN_OK_CODE, payload: raw.subarray(2) });
}

/**
 * Build a generic conn2 lobby S->C response inner:
 * [u32 BE prefix][u16 BE appCode][payloadBytes].
 * Payload length must match the FUN_004b8b00 receive-object size for the app
 * code. Empty records/lists are represented as a full-size zeroed object.
 * @param {number} code
 * @param {number} payloadLength
 */
export function buildLobbyResponseInner(code, payloadLength = 0) {
  return buildMpsClientMessage32Inner({ code, payload: Buffer.alloc(Math.max(0, payloadLength)) });
}

export function buildSsLoginOkInner({ status = 1 } = {}) {
  return buildSsStatusInner(SS_LOGIN_OK_CODE, status);
}

export function buildSsGameLoginOkInner({ status = 1 } = {}) {
  return buildSsStatusInner(SS_GAME_LOGIN_OK_CODE, status);
}

function buildSsStatusInner(code, status) {
  if (!Number.isInteger(status) || status < 0 || status > 0xff) {
    throw new Error(`invalid SS status byte: ${status}`);
  }
  const inner = Buffer.alloc(4);
  inner.writeUInt16BE(code & 0xffff, 0);
  inner.writeUInt8(status & 0xff, 2);
  return inner;
}

/**
 * Build a conn3 SS status reply in the conn2 "mpsClientMessage32" receive shape
 * [u32 BE prefix=0][u16 BE appCode][u8 status].
 *
 * Hypothesis (G138, this session): like the lobby 0x20xx replies (G122/G123), the
 * conn3 SS replies are consumed through the message32 receive object, whose input
 * method reads a 32-bit field + a 16-bit app code before the payload. A bare
 * [u16 code][u8 status] body is therefore 4 bytes short of the app-code lookup and
 * never clears the client's request/response queue entry (queued 0x0200 -> 0x0201).
 * Opt-in via `LOGH_SS_FORMAT=message32` until proven, then promote to default.
 * @param {number} code SS app code (0x0201 / 0x0206)
 * @param {number} status status byte the handler copies (e.g. 0x004ba347 -> client+0x35f252)
 */
export function buildSsStatusMessage32Inner(code, status = 1) {
  if (!Number.isInteger(status) || status < 0 || status > 0xff) {
    throw new Error(`invalid SS status byte: ${status}`);
  }
  return buildMpsClientMessage32Inner({ code, payload: Buffer.from([status & 0xff]) });
}

export function buildSsLoginOkMessage32Inner({ status = 1 } = {}) {
  return buildSsStatusMessage32Inner(SS_LOGIN_OK_CODE, status);
}

export function buildSsGameLoginOkMessage32Inner({ status = 1 } = {}) {
  return buildSsStatusMessage32Inner(SS_GAME_LOGIN_OK_CODE, status);
}

/**
 * Select the conn3 SS reply inner for a raw SS OK inner, honoring the wire format.
 * 'raw' keeps [u16 code][u8 status][pad]; 'message32' rewraps as the conn2-style
 * [u32 0][u16 code][u8 status]. Pure so the auth-server IO layer stays env-only.
 * @param {{ rawOkInner: Buffer, format?: string }} options
 * @returns {{ ssFormat: 'raw'|'message32', okInner: Buffer }}
 */
export function selectSsResponseInner({ rawOkInner, format } = {}) {
  const ssFormat = format === 'message32' ? 'message32' : 'raw';
  if (ssFormat === 'raw') {
    return { ssFormat, okInner: rawOkInner };
  }
  const code = rawOkInner.readUInt16BE(0);
  const status = rawOkInner.readUInt8(2);
  return { ssFormat, okInner: buildSsStatusMessage32Inner(code, status) };
}

const LOBBY_CHARACTER_CHARGE_FIRST_RECORD_STREAM_OFFSET = 0x01;
const LOBBY_CHARACTER_CHARGE_NAME_UNITS = 0x0d;
const LOBBY_CHARACTER_CHARGE_DESCRIPTION_UNITS = 0x41;
const LOBBY_CHARACTER_CHARGE_GATE_PREFIX_STREAM_BYTES = 0x22;
const LOBBY_CHARACTER_CHARGE_CHARGED_DETAIL_STREAM_BYTES = 0x2b;
const LOBBY_CHARACTER_CHARGE_CARD_KIND = 2;
const LOBBY_CHARACTER_CHARGE_SELECTABLE_DETAIL_COUNT = 1;

/**
 * Build a minimal 0x2004 character-charge response from account/session characters.
 *
 * Static input for `0x0043fd60` accepts at most two records (`count < 3`) and
 * copies them into a destination object with a 0x36c record stride. The wire
 * input is still a compact sequential stream, not a prelaid destination struct:
 * each record starts immediately after the bytes consumed by the previous one.
 * Runtime state `0x2a` later reads the copied object at object offsets 0x04 and
 * 0x370; non-zero ids there are the values passed into `FUN_0051bea0`, which
 * sends the client's `0x2009` LobbySessionLoginRequest.
 *
 * G136 runtime evidence showed the card objects are built enabled, then
 * `FUN_0051f1c0` disables them unless the parsed destination record has status
 * 1/2, card kind `record+0x2a0 == 2`, and selectable/detail count
 * `record+0x2a1 != 0`. Those two destination fields are reached only after the
 * compact stream consumes the zeroed post-description/power blocks, so they must
 * be encoded at the stream cursor rather than at payload offsets 0x2a0/0x2a1.
 *
 * @param {{ characters?: Array<{ id?: number, characterId?: number, status?: number, name?: string, characterName?: string, description?: string, characterDescription?: string }> }} [options]
 */
export function buildLobbyInformationCharacterChargeInner({ characters = [] } = {}) {
  const records = normalizeLobbyCharacterRecords(characters);
  const inner = buildLobbyResponseInner(
    LOBBY_RESP_INFO_CHARACTER_CHARGE_CODE,
    LOBBY_RESP_INFO_CHARACTER_CHARGE_PAYLOAD_BYTES,
  );
  const payload = inner.subarray(6);
  payload.writeUInt8(records.length, 0);
  let cursor = LOBBY_CHARACTER_CHARGE_FIRST_RECORD_STREAM_OFFSET;
  for (const record of records) {
    cursor = writeLobbyCharacterChargeRecord(payload, cursor, record);
  }
  return inner;
}

function writeLobbyCharacterChargeRecord(payload, cursor, record) {
  payload.writeUInt16LE(record.id, cursor);
  cursor += 2;
  payload.writeUInt8(record.status, cursor);
  cursor += 1;
  cursor = writeLobbyUtf16Field(payload, cursor, record.name, LOBBY_CHARACTER_CHARGE_NAME_UNITS);
  cursor = writeLobbyUtf16Field(payload, cursor, record.description, LOBBY_CHARACTER_CHARGE_DESCRIPTION_UNITS);

  cursor += LOBBY_CHARACTER_CHARGE_GATE_PREFIX_STREAM_BYTES;
  payload.writeUInt8(LOBBY_CHARACTER_CHARGE_CARD_KIND, cursor);
  cursor += 1;
  payload.writeUInt8(LOBBY_CHARACTER_CHARGE_SELECTABLE_DETAIL_COUNT, cursor);
  cursor += 1;
  return cursor + LOBBY_CHARACTER_CHARGE_CHARGED_DETAIL_STREAM_BYTES;
}

function normalizeLobbyCharacterRecords(characters) {
  if (!Array.isArray(characters)) {
    throw new Error('lobby characters must be an array');
  }
  if (characters.length > 2) {
    throw new Error(`invalid lobby character-charge record count: ${characters.length}`);
  }
  return characters.map((record, index) => {
    if (typeof record !== 'object' || record === null) {
      throw new Error(`invalid lobby character record at index ${index}`);
    }
    const id = record.characterId ?? record.id;
    if (!Number.isInteger(id) || id <= 0 || id > 0xffff) {
      throw new Error(`invalid lobby character id at index ${index}: ${id}`);
    }
    const status = record.status ?? 1;
    if (!Number.isInteger(status) || status < 1 || status > 2) {
      throw new Error(`invalid lobby character status at index ${index}: ${status}`);
    }
    const name = record.characterName ?? record.name ?? `Character ${id}`;
    const description = record.characterDescription ?? record.description ?? `Character ${id} ready`;
    return { id, status, name, description };
  });
}

function writeLobbyUtf16Field(target, cursor, value, maxUnits) {
  const text = String(value ?? '');
  const units = [...text, '\0'];
  if (units.length > maxUnits) {
    throw new Error(`lobby session string is too long: ${text}`);
  }
  target.writeUInt8(units.length, cursor);
  let next = cursor + 1;
  for (const unit of units) {
    target.writeUInt16LE(unit.codePointAt(0) ?? 0, next);
    next += 2;
  }
  return next;
}

/**
 * Build a minimal named 0x2006 session-list response.
 *
 * Ghidra `0x00444900` first consumes one raw byte, then reads the top-level
 * record count. Each record then consumes a u16 scalar, one raw metadata byte,
 * and two counted UTF-16LE fields (max 13 and 65 units). The remaining nested
 * counts stay zero until their semantics are proven. The metadata byte is not
 * cosmetic: `FUN_00593d90` gates the selectable session list on record status
 * `1` or `2`.
 */
export function buildLobbyInformationSessionInner({
  recordCount = 1,
  sessionId = 1,
  recordStatus = 1,
  sessionName = 'Test',
  sessionDescription = 'Codex Session',
} = {}) {
  if (!Number.isInteger(recordCount) || recordCount < 0 || recordCount > 0x40) {
    throw new Error(`invalid lobby session record count: ${recordCount}`);
  }
  if (!Number.isInteger(sessionId) || sessionId < 0 || sessionId > 0xffff) {
    throw new Error(`invalid lobby session id: ${sessionId}`);
  }
  if (!Number.isInteger(recordStatus) || recordStatus < 0 || recordStatus > 0xff) {
    throw new Error(`invalid lobby session record status: ${recordStatus}`);
  }
  const inner = buildLobbyResponseInner(LOBBY_RESP_INFO_SESSION_CODE, LOBBY_RESP_INFO_SESSION_PAYLOAD_BYTES);
  const payload = inner.subarray(6);
  payload.writeUInt8(0, 0); // raw leading byte consumed before the top-level count
  payload.writeUInt8(recordCount, 1);
  if (recordCount > 0) {
    let cursor = 2;
    payload.writeUInt16LE(sessionId, cursor);
    cursor += 2;
    payload.writeUInt8(recordStatus, cursor);
    cursor += 1; // raw record status/metadata byte
    cursor = writeLobbyUtf16Field(payload, cursor, sessionName, 0x0d);
    writeLobbyUtf16Field(payload, cursor, sessionDescription, 0x41);
  }
  return inner;
}

// Known-good redirect inner captured from a working real-client redirect
// (127.0.0.1:47900, token region intact). The builder patches IP/port over this
// template so the default output is byte-identical to the proven-working frame.
const REDIRECT_TEMPLATE_HEX = '70010000000000000100007fbb1c0000000100000000';
const REDIRECT_IP_OFFSET = 8; // BE u32, octet-packed (see ipToRedirectU32)
const REDIRECT_PORT_OFFSET = 12; // BE u16

/**
 * Read the inner message code (first BE u16 of the inner payload).
 * @param {Buffer} innerPayload
 * @returns {number|null}
 */
export function readInnerCode(innerPayload) {
  if (innerPayload.length < 2) {
    return null;
  }
  return innerPayload.readUInt16BE(0);
}

/**
 * True when the inner payload is a GIN7 login credential (inner code 0x7000).
 * @param {Buffer} innerPayload
 */
export function isLoginCredentialInner(innerPayload) {
  return (
    readInnerCode(innerPayload) === LOGIN_INNER_CODE &&
    innerPayload.length >= 6 &&
    innerPayload.toString('ascii', 2, 6) === GIN7_MAGIC
  );
}

/**
 * Best-effort parse of the GIN7 credential blob. The account is the first
 * length-prefixed UTF-16BE string (count u16 BE @offset 10, chars from @12).
 * The raw blob is retained for exact-match authentication, which avoids relying
 * on the (asymmetric, partially LE) password encoding.
 * @param {Buffer} innerPayload
 * @returns {{ code: number, accountLabel: string, rawHex: string }}
 */
export function parseGin7Credential(innerPayload) {
  if (!isLoginCredentialInner(innerPayload)) {
    throw new Error('inner payload is not a GIN7 login credential');
  }
  let accountLabel = '';
  if (innerPayload.length >= 12) {
    const count = innerPayload.readUInt16BE(10);
    const chars = [];
    let cursor = 12;
    for (let index = 0; index < count && cursor + 2 <= innerPayload.length; index += 1) {
      const unit = innerPayload.readUInt16BE(cursor);
      cursor += 2;
      if (unit === 0) {
        break;
      }
      if (unit >= 0x20 && unit < 0x7f) {
        chars.push(String.fromCharCode(unit));
      }
    }
    accountLabel = chars.join('');
  }
  return { code: LOGIN_INNER_CODE, accountLabel, rawHex: innerPayload.toString('hex') };
}

/**
 * Pack an IPv4 dotted string into the u32 the client's "%d.%d.%d.%d" parser
 * expects: octet[0] in the low byte, octet[3] in the high byte.
 * @param {string} ip
 */
export function ipToRedirectU32(ip) {
  const octets = ip.split('.').map((part) => Number(part));
  if (octets.length !== 4 || octets.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) {
    throw new Error(`invalid IPv4 address: ${ip}`);
  }
  return ((octets[3] << 24) | (octets[2] << 16) | (octets[1] << 8) | octets[0]) >>> 0;
}

/**
 * Build the inner payload for a 0x7001 lobby redirect. Defaults reproduce the
 * proven-working frame (127.0.0.1:47900).
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
    inner.writeUInt32BE(token >>> 0, 16);
  }
  return inner;
}
