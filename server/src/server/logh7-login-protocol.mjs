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

// Account-family ROSTER-PRIMING requests (workflow wndew4jop, high conf). The character-management
// screen (새 캐릭터 작성 / 오리지널 추첨) runs these on the lobby connection BEFORE the creation form is
// reachable; the matching responses (request+1) already exist in logh7-account.mjs. They were being
// swallowed by the generic world walker (buildWorldDataResponseInner(innerCode+1)) with ZERO counts,
// which fails the client roster gate FUN_00597ff0 and bounces the scene to back-state 0x29. Answer
// them EXPLICITLY (above the walker) with NON-EMPTY rosters. correlator FUN_004b78a0 kind→code:
// kind8=0x1000→0x1001, kind9=0x1002→0x1003, kind10=0x1004→0x1005.
export const REQ_INFO_ACCOUNT_CODE = 0x1000; // C->S RequestInformationAccount, answer 0x1001
export const REQ_UNCHARGE_CHARACTER_CODE = 0x1002; // C->S RequestUnChargeCharacter, answer 0x1003 (gating)
export const REQ_CHARACTER_ENTRY_STATE_CODE = 0x1004; // C->S RequestCharacterEntryState, answer 0x1005

// SysSessionAnnounceNotify (서버 공지 / サーバーからのお知らせ): an UNSOLICITED S->C push that fills the
// title-menu announce panel (label constmsg #2437/0x0985). No C->S request — the server pushes it after
// lobby login. Code recovered (workflow wndew4jop, MEDIUM conf) from the client Sys-family name table
// @VA0x0078b4a8 idx25, base 0x1fea anchored by SysLobby* idx29-32 = 0x2007-0x200a. Siblings: 0x2002
// Countdown, 0x2004 Mail, 0x1ff5 NotifyInformationSession. Body = CP949-encoded NUL-terminated text
// (renderer is MultiByteToWideChar cp949; UTF-8/SJIS bytes blank the panel).
export const LOBBY_SESSION_ANNOUNCE_NOTIFY_CODE = 0x2003; // S->C SysSessionAnnounceNotify (numerically reuses 0x2003 on a separate Sys parser)

// Info-panel READ request codes (workflow w2xh1y4z6, high conf). Opening an in-game info panel makes
// the client send a Request* inner = (responseCode - 1) whose body is a length-prefixed id list. These
// are otherwise answered ZERO-filled by the generic walker, leaving panels blank. request = response-1.
export const REQ_INFO_CHARACTER_CODE = 0x0322; // C->S RequestInformationCharacter, answer 0x0323 (724B card)
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

function writeWireU16(buffer, value, offset, wireEndian = 'le') {
  if (wireEndian === 'be') buffer.writeUInt16BE(value & 0xffff, offset);
  else buffer.writeUInt16LE(value & 0xffff, offset);
}

function writeWireU32(buffer, value, offset, wireEndian = 'le') {
  if (wireEndian === 'be') buffer.writeUInt32BE(value >>> 0, offset);
  else buffer.writeUInt32LE(value >>> 0, offset);
}

/** 0x0204 SSCharacterIDResponce: 4-byte LE char id stored at client+0x3584a0. */
export function buildSsCharacterIdResponseInner({ characterId = 1, wireEndian = 'le' } = {}) {
  const payload = Buffer.alloc(4);
  writeWireU32(payload, characterId, 0, wireEndian);
  return buildMpsClientMessage32Inner({ code: SS_RESP_CHARACTER_ID_CODE, payload });
}

/**
 * 0x0323 ResponseInformationCharacter: one 724-byte character record. Field [0..3] is the
 * char id compared to client+0x3584a0 (must match); [0x24..0x27] grid/unit id (0 = skip the
 * inner unit match). Everything else zero is the minimal placeable record.
 */
export function buildInformationCharacterRecordInner({
  characterId = 1, gridUnitId = 0, power = null, spot = null, spotOwner = null, abilities = null, online = false,
  camp = null, state = null, fame = null, pcp = null, mcp = null, money = null, influence = null, stamina = null,
  officerCount = null,
  lastname = null, firstname = null, displayName = null, rank = null, title = null, face = null,
  seatEntries = null, spotResolverBase = null, together = null,
  wireEndian = 'le',
} = {}) {
  const inner = buildLobbyResponseInner(SS_RESP_INFO_CHARACTER_RECORD_CODE, SS_RESP_INFO_CHARACTER_RECORD_BYTES);
  const payload = inner.subarray(6);
  const writeRecordU16 = (value, offset) => payload.writeUInt16LE((value ?? 0) & 0xffff, offset);
  const writeRecordU32 = (value, offset) => payload.writeUInt32LE((value ?? 0) >>> 0, offset);
  // proven anchors (G164 world load): id@0x00, flagship/grid-unit id@0x24
  writeWireU32(payload, characterId, 0x00, wireEndian);
  writeWireU32(payload, gridUnitId, 0x24, wireEndian);
  // optional real fields at the binary-evidenced 0x0323 offsets (docs/logh7-info-records-wire.md)
  if (Number.isInteger(power)) payload.writeUInt8(power & 0xff, 0x04); // 陣営/faction id
  if (Number.isInteger(camp)) payload.writeUInt8(camp & 0xff, 0x05);
  if (Number.isInteger(state)) payload.writeUInt8(state & 0xff, 0x06);
  if (Number.isInteger(fame)) writeRecordU32(fame, 0x10);
  if (Number.isInteger(spot)) writeWireU32(payload, spot, 0x1c, wireEndian); // current system id
  if (Number.isInteger(spotOwner)) writeWireU32(payload, spotOwner, 0x20, wireEndian);
  if (Number.isInteger(pcp)) writeRecordU32(pcp, 0x50);
  if (Number.isInteger(mcp)) writeRecordU32(mcp, 0x54);
  if (online) payload.writeUInt8(1, 0x64);
  if (Number.isInteger(money)) writeRecordU32(money, 0x68);
  // ability_8 @0x188: 8 entries of {point u16, experience u16}, canonical order
  // 統率/政治/運用/情報 (PCP) + 指揮/機動/攻撃/防御 (MCP). We fill the `point` (the stat value).
  if (Array.isArray(abilities)) {
    for (let i = 0; i < 8 && i < abilities.length; i += 1) {
      writeRecordU16(abilities[i] ?? 0, 0x188 + i * 4);
    }
  }
  if (Number.isInteger(influence)) payload.writeUInt8(influence & 0xff, 0x1a8);
  
  // 0x1a9 u8 = 체력(体力/stamina). 클라 문자열 s_stamina_ @0x761088, 0x0323 레코드 오프셋 확정.
  // 미지정 시 0이라 생성 캐릭이 체력 0 게이지로 표시됐다(라이브 QA 버그) → 호출처에서 만체력 전달.
  if (Number.isInteger(stamina)) payload.writeUInt8(stamina & 0xff, 0x1a9);
  // 0x0323 card/seat array: this single field is BOTH the duty-card list AND the officer count.
  // RE confirms FUN_004c2c80 copies *(byte*)(record+0x24c) to PLAYER_INFO+0x270 (Ghidra shows it as
  // `param_3[0x93]` because param_3 is int*, so byte offset = 0x93*4 = 0x24c). The C002 unit-list
  // panel FUN_004f68f0 then reads PLAYER_INFO+0x270 as the row count.
  // Array layout: count u8 @0x24c, entries @0x254 stride 8 = {character/id u32 @+0, role u32 @+4}, max 16.
  // The byte at 0x250 is a 4-byte gap for the 0x0323 record; the separate 0x0356 delta uses count@0x250.
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
  // parentage[0] sub-record @0x80 (stride 0x84): names + rank + face at the documented rel. offsets.
  // FUN_004c9170 also reads the copied live field PLAYER_INFO+0x120 (source +0x100) when resolving the
  // current office/spot. Populate it only when the caller has a RE-backed base/spot key.
  // Names are u16-char pascal strings (len byte + u16 chars, max 13).
  const P0 = 0x80;
  const writePstr16 = (str, lenOff, charsOff) => {
    const codes = [...String(str)].slice(0, CHARACTER_NAME_MAX_UNITS);
    payload.writeUInt8(codes.length, lenOff);
    for (let i = 0; i < codes.length; i += 1) {
      // Text fields follow the client's UCS-2/UTF-16LE string readers even when
      // live-memory numeric anchors require BE bytes on the same 0x0323 record.
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
  // titlename (작위명) pascal string: len u8 @P0+0x58 (=0xd8), u16[13] chars @P0+0x5a (=0xda).
  // Offsets are P0 (docs/logh7-info-records-wire.md parentage[] sub-record +0x58/+0x5a). The string
  // itself maps to the peerage ladder name (logh7-imperial-titles.mjs); empty/null leaves len 0.
  if (title != null && String(title).length > 0) writePstr16(String(title), P0 + 0x58, P0 + 0x5a);
  if (Number.isInteger(face)) writeRecordU32(face, P0 + 0x74); // face @0xf4
  if (Number.isInteger(spotResolverBase)) writeRecordU32(spotResolverBase, P0 + 0x80); // source +0x100 -> PLAYER_INFO +0x120
  // FUN_00419300 prints this final scalar as `together=`; FUN_004c2c80 copies
  // it to PLAYER_INFO+0x2f4 for HUD/party-state consumers.
  if (Number.isInteger(together)) payload.writeUInt8(together & 0xff, 0x2d0);
  return inner;
}

// --- Lobby character-roster TRANSACTION (0x1200 → 0x120f → 0x1201) ---
// This is the bulk transaction that fills the client's character-roster count at clientBase+0x554da4,
// the count the lobby buttons 새 캐릭터 작성 / 오리지널 추첨 / 캐릭터 삭제 gate on (RE-corrected: NOT 0x1002/0x1003,
// NOT 0x2004 — those have no send / zero readers). Verified against Ghidra (imagebase 0x400000):
//   - Dispatcher FUN_004ba2b0 case 0x1200 copies 9 dwords to +0x48744c → FUN_004c1dd0 (sets reset
//     flag +0x487472); case 0x120f copies 0x1ce9 dwords to +0x495578 → filler FUN_004c1f10; case
//     0x1201 copies 1 byte to +0x487470 → FUN_004c1e50 (commit).
//   - Filler FUN_004c1f10 reads payload { u8 count @+0x00; records @+0x04 }, record stride 0x128 (296
//     bytes = 0x4a dwords), copies up to 600 into clientBase+0x554da8, sets clientBase+0x554da4=count.
//     The 0x487472 flag (set by 0x1200) makes the first 0x120f reset the count to 0 before appending.
//   - Gate FUN_00597ff0 (called by FUN_00597ea0): requires count≥1 AND ≥1 record where the GROUP byte
//     == DAT_022283c0 (FUN_00597ea0 sets it to 2, retried with 3) AND the THRESHOLD dword ≤ DAT_022284dc.
//     PINNED in-record offsets (FUN_00597ff0: `puVar8 = clientBase+0x554dac; ... DAT_022283c0 ==
//     (byte)puVar8[-1] && *puVar8 <= DAT_022284dc; puVar8 += 0x4a`): record base = +0x554da8 + i*0x128,
//     so GROUP byte @ record+0x00 (== puVar8[-1] == byte at +0x554da8) and THRESHOLD dword @ record+0x04
//     (== *puVar8 == dword at +0x554dac). DAT_022284dc is a read-only .data ceiling, so THRESHOLD=0
//     (≤ any non-negative ceiling) always passes; GROUP=2 matches DAT_022283c0 on the first try.
export const TRANSACTION_SIMPLE_DATA_BEGIN_CODE = 0x1200; // S->C reset accumulators (FUN_004c1dd0)
export const TRANSACTION_SIMPLE_DATA_BEGIN_BYTES = 0x24; // 36 (fixed body, FUN_004b8b00)
export const NOTIFY_SIMPLE_INFO_CHARACTER_ENTRY_CODE = 0x120f; // S->C roster-entry fill (FUN_004c1f10)
export const NOTIFY_SIMPLE_INFO_CHARACTER_ENTRY_BYTES = 0x73a4; // fixed body (FUN_004b8b00)
export const TRANSACTION_SIMPLE_DATA_END_CODE = 0x1201; // S->C commit/flip (FUN_004c1e50)
export const TRANSACTION_SIMPLE_DATA_END_BYTES = 0x01; // 1 (fixed body, FUN_004b8b00)
export const SIMPLE_INFO_CHARACTER_ENTRY_STRIDE = 0x128; // 296 (filler copy stride, FUN_004c1f10)
export const SIMPLE_INFO_CHARACTER_ENTRY_HEADER = 4; // [u8 count @0][3 pad] before record[0] (records @+0x04)
export const SIMPLE_INFO_CHARACTER_ENTRY_GROUP = 2; // record+0x00 GROUP byte (== DAT_022283c0, passes 1st try)
export const SIMPLE_INFO_CHARACTER_ENTRY_MAX = 600; // FUN_004c1f10 copy cap (clientBase+0x554da4 < 600)

/** 0x1200 TransactionSimpleDataBegin — resets the roster count (sets flag clientBase+0x487472, FUN_004c1dd0). */
export function buildTransactionSimpleDataBeginInner() {
  return buildLobbyResponseInner(TRANSACTION_SIMPLE_DATA_BEGIN_CODE, TRANSACTION_SIMPLE_DATA_BEGIN_BYTES);
}

/** 0x1201 TransactionSimpleDataEnd — commits the roster, closing the transaction (FUN_004c1e50). */
export function buildTransactionSimpleDataEndInner() {
  return buildLobbyResponseInner(TRANSACTION_SIMPLE_DATA_END_CODE, TRANSACTION_SIMPLE_DATA_END_BYTES);
}

/**
 * 0x120f NotifySimpleInformationCharacterEntry — the bulk roster-fill the buttons gate on. Body is the
 * fixed 0x73a4-byte object: [u8 count][3 pad][record × count], each record 296B (stride 0x128). The
 * filler FUN_004c1f10 appends each record to clientBase+0x554da8 and sets the count clientBase+0x554da4.
 *
 * Each record is written so it PASSES the gate FUN_00597ff0 (count≥1 AND ≥1 record with the right
 * group/threshold): GROUP byte = 2 @ record+0x00 (matches DAT_022283c0 on the first try) and THRESHOLD
 * dword = 0 @ record+0x04 (≤ DAT_022284dc). Best-effort display fields are written at the next dwords
 * (id @ record+0x08, name as a u16-char pascal string @ record+0x0c) — the gate ignores them, but the
 * form benefits from a real id/name. count is clamped to 600 (the filler's copy cap).
 *
 * @param {{ characters?: Array<{ id?: number, characterId?: number, name?: string, group?: number,
 *   threshold?: number }> }} [options]
 */
export function buildNotifySimpleInformationCharacterInner({ characters = [] } = {}) {
  const inner = buildLobbyResponseInner(
    NOTIFY_SIMPLE_INFO_CHARACTER_ENTRY_CODE,
    NOTIFY_SIMPLE_INFO_CHARACTER_ENTRY_BYTES,
  );
  const payload = inner.subarray(6);
  const list = Array.isArray(characters) ? characters : [];
  const count = Math.min(list.length, SIMPLE_INFO_CHARACTER_ENTRY_MAX);
  payload.writeUInt8(count & 0xff, 0); // [u8 count @0], 3 pad bytes stay zero
  for (let i = 0; i < count; i += 1) {
    const off = SIMPLE_INFO_CHARACTER_ENTRY_HEADER + i * SIMPLE_INFO_CHARACTER_ENTRY_STRIDE;
    if (off + SIMPLE_INFO_CHARACTER_ENTRY_STRIDE > payload.length) {
      break; // never write past the fixed buffer
    }
    const record = list[i] ?? {};
    // GATE FIELDS (verified offsets — the only ones FUN_00597ff0 reads):
    payload.writeUInt8((record.group ?? SIMPLE_INFO_CHARACTER_ENTRY_GROUP) & 0xff, off + 0x00); // GROUP byte
    payload.writeUInt32LE((record.threshold ?? 0) >>> 0, off + 0x04); // THRESHOLD dword (0 ≤ ceiling)
    // BEST-EFFORT display fields (gate ignores these; the form lists them):
    const id = Number(record.characterId ?? record.id ?? 0);
    payload.writeUInt32LE(id >>> 0, off + 0x08); // entity id (after the gate fields)
    if (record.name != null) {
      const codes = [...String(record.name)].slice(0, CHARACTER_NAME_MAX_UNITS);
      payload.writeUInt8(codes.length, off + 0x0c); // name length byte
      for (let j = 0; j < codes.length; j += 1) {
        payload.writeUInt16LE(codes[j].charCodeAt(0) & 0xffff, off + 0x0e + j * 2); // u16 chars
      }
    }
  }
  return inner;
}

/**
 * Build the full character-roster transaction [Begin(0x1200), Entry(0x120f)…, End(0x1201)] for a set of
 * characters, splitting into multiple 0x120f messages when the roster exceeds the per-message cap (600).
 * The returned inners are emitted in order; after the transaction the client's roster count
 * clientBase+0x554da4 is the total (≥1 with a passing record), so the lobby menu buttons enable.
 * @param {{ characters?: Array<object> }} [options]
 * @returns {Buffer[]} ordered framed inners: [Begin, ...Entry chunks, End]
 */
export function buildCharacterRosterTransaction({ characters = [] } = {}) {
  const list = Array.isArray(characters) ? characters : [];
  const frames = [buildTransactionSimpleDataBeginInner()];
  if (list.length === 0) {
    // Always emit at least one passing record so the gate's count≥1 / group match is satisfied even for
    // a brand-new (empty) account; otherwise the form bounces (count 0 → scene back-state).
    frames.push(buildNotifySimpleInformationCharacterInner({ characters: [{}] }));
  } else {
    for (let i = 0; i < list.length; i += SIMPLE_INFO_CHARACTER_ENTRY_MAX) {
      frames.push(
        buildNotifySimpleInformationCharacterInner({
          characters: list.slice(i, i + SIMPLE_INFO_CHARACTER_ENTRY_MAX),
        }),
      );
    }
  }
  frames.push(buildTransactionSimpleDataEndInner());
  return frames;
}

export const SS_RESP_INFO_UNIT_CODE = 0x0325; // S->C ResponseInformationUnit (unit table)
export const SS_RESP_INFO_UNIT_BYTES = 0xce44; // 52804
export const SS_RESP_INFO_UNIT_STRIDE = 0x58; // 88 — per-unit element stride (clientBase+0x41a368)
export const SS_RESP_INFO_UNIT_HEADER = 4; // [u16 count][u16 pad] before unit[0] (element[0] @ payload+4)
export const SS_RESP_INFO_UNIT_MAX = 600; // 최대 함대/unit 수 (클라 파서 reject: "information_size > 600", 0x763848)
export const UNIT_BOATS_MAX = 10; // troop_units cap (client parser FUN_00419ca0/FUN_00419fd0: "> 10")

// ---------------------------------------------------------------------------
// 0x0325 unit-table element (0x58 / 88 bytes) — WIRE LAYOUT IS P0.
//
// Field OFFSETS + TYPES are dual-parser-proven from the client G7MTClient.exe: the binary parser
// FUN_00419ca0 and the text parser FUN_00419fd0 walk the SAME 0x58-byte element with identical field
// order (stream vtable: *+0x1c=u32, *+0x20=u16, *+0x24=u8, *+0xc=float). The element base is
// `payload + 4` (id@B+0x00, matching the proven world-entry anchor FUN_004c2a80: char flagship@0x24
// == unit[0].id). Offsets are relative to the element base B:
//   B+0x00 u32  id (anchor)                 B+0x14 u8   boats(troop_units) count, cap 10
//   B+0x04 u16  field_b04 (faction/state)   B+0x18 u32[] boats(troop_units) id array (stride 4)
//   B+0x06 u16  name region                 B+0x40 u32  field_40 (spot/base resolver on local spawn)
//   B+0x08 u32  field_08 (commander cand.)  B+0x44 u16  name2 region
//   B+0x0c u32  field_0c (cell candidate)   B+0x48 u16  field_48 (mapSection candidate)
//   B+0x10 u32  field_10 (owner candidate)  B+0x4c u32 / B+0x50 u32 / B+0x54 float (numeric tail)
//
// The VALUE SEMANTICS of the mid-element numeric fields (which slot is "commander" vs "supply" vs
// "cell" vs "owner/faction") are NOT independently symbolized in the export — the dump-label
// serializer that would name them is server-side, not compiled into the client. So this builder
// maps the A2 fleet entity onto the proven slots, but those value-to-slot assignments + the values
// themselves are **P3 reconstructed** (see docs/logh7-re-coverage-matrix.md). Only id@B+0x00 and the
// boats(troop_units) count/array region are role-pinned. Wire LAYOUT = P0; value SOURCE = P3 seed.
// 2026-06-21 live RE pinned one local-spawn consumer: FUN_004c2c80 reads unit+0x40 and FUN_004b5be0
// stores it into strategyManager+0x358; FUN_004c9170 then uses that selected base to resolve the
// HUD spot. `spotResolverBase` therefore overrides the legacy `supply` seed for this slot.
const UNIT_ELEM = {
  ID: 0x00, // u32 — proven anchor
  FACTION: 0x04, // u16 — field_b04
  COMMANDER: 0x08, // u32 — field_08
  CELL: 0x0c, // u32 — field_0c (strategic sector cell row*100+col)
  OWNER: 0x10, // u32 — field_10
  BOATS_COUNT: 0x14, // u8 — troop_units count (role-pinned, cap 10)
  BOATS_ARRAY: 0x18, // u32[] — troop_units ids (role-pinned)
  SPOT_RESOLVER_BASE: 0x40, // u32 — field_40
  MAP_SECTION: 0x48, // u16 — field_48
};

/**
 * 0x0325 ResponseInformationUnit: the world unit table. Dispatcher case 0x325 copies the whole
 * payload to clientBase+0x41a364: native memory is [u16 unitCount][u16 pad][unit[0]
 * (stride 0x58)][unit[1]]..., but the parser stream reads count first and then unit[0]
 * immediately. `wireLayout: 'parser-stream'` therefore omits the native 2-byte pad on the wire.
 * Each unit's id is the leading u32 of its 0x58-byte record (clientBase+0x41a368 for unit[0]).
 * This matters because FUN_004c2a80's LOCAL-player spawn (FUN_004c2c80(0, sessionRecord)) only
 * runs inside `if (unitCount != 0)` AND requires a unit whose id == the character record[9]
 * (0x0323 gridUnitId). So a single unit with id == gridUnitId is the minimal table that lets the
 * player be placed into PLAYER_INFO during world entry. (G160 live test: with unitCount 0 the
 * local spawn is skipped and the HUD crashes at 0x58f83a.)
 *
 * A1: the per-unit element is the full 0x58-byte record (layout P0, dual-parser proven — see
 * UNIT_ELEM above). By DEFAULT (no `fleets` given) this writes ONLY id@B+0x00 + count, byte-identical
 * to the minimal count/id unit stub, so the proven G164 world-load path is unperturbed. Pass `fleets` (from
 * the world-state A2 entities) to fill the full element fields (boats/commander/supply/cell/owner/
 * faction/mapSection). Those values are P3 seeds; only the field layout is P0.
 *
 * @param {{ unitId?: number, unitCount?: number, wireEndian?: 'le'|'be', countWireEndian?: 'le'|'be',
 *   wireLayout?: 'native'|'parser-stream',
 *   fleets?: Array<{ id:number, owner?:number, faction?:number, commander?:number, cell?:number,
 *     boats?:number[], supply?:number, spotResolverBase?:number, mapSection?:number }> }} [options]
 */
export function buildInformationUnitRecordInner({
  unitId = 1,
  unitCount = 1,
  wireEndian = 'le',
  countWireEndian = wireEndian,
  wireLayout = 'native',
  fleets = null,
} = {}) {
  const inner = buildLobbyResponseInner(SS_RESP_INFO_UNIT_CODE, SS_RESP_INFO_UNIT_BYTES);
  const payload = inner.subarray(6);
  const list = Array.isArray(fleets) ? fleets : null;
  const streamWire = wireLayout === 'parser-stream';
  const valueEndian = streamWire ? 'be' : wireEndian;
  const countEndian = streamWire ? 'be' : countWireEndian;
  const unitBase = (index) => (streamWire ? 2 : SS_RESP_INFO_UNIT_HEADER) + index * SS_RESP_INFO_UNIT_STRIDE;
  const writeUnitU16 = (value, offset, endian = valueEndian) => {
    const n = (value ?? 0) & 0xffff;
    if (endian === 'be') payload.writeUInt16BE(n, offset);
    else payload.writeUInt16LE(n, offset);
  };
  const writeUnitU32 = (value, offset) => {
    const n = (value ?? 0) >>> 0;
    if (valueEndian === 'be') payload.writeUInt32BE(n, offset);
    else payload.writeUInt32LE(n, offset);
  };
  if (!list) {
    // Minimal form: id@element[0]+0x00 + count only. Keeps extra unit fields out of the
    // proven world-load path.
    writeUnitU16(unitCount, 0, countEndian); // clientBase+0x41a364 unit count
    writeUnitU32(unitId, unitBase(0) + UNIT_ELEM.ID); // unit[0].id @0x41a368 after parse
    return inner;
  }
  // Full-element form (A1): write one 0x58-byte element per fleet from the A2 world-state entities.
  const count = Math.min(list.length, SS_RESP_INFO_UNIT_MAX); // client cap: "information_size > 600"
  writeUnitU16(count, 0, countEndian); // clientBase+0x41a364 unit count
  for (let i = 0; i < count; i += 1) {
    const base = unitBase(i);
    if (base + SS_RESP_INFO_UNIT_STRIDE > payload.length) {
      break; // never write past the fixed 52804-byte buffer
    }
    const f = list[i] ?? {};
    writeUnitU32(f.id ?? 0, base + UNIT_ELEM.ID); // anchor (P0)
    writeUnitU16(f.faction ?? 0, base + UNIT_ELEM.FACTION); // P3 slot
    writeUnitU32(f.commander ?? 0, base + UNIT_ELEM.COMMANDER); // P3 slot
    writeUnitU32(f.cell ?? 0, base + UNIT_ELEM.CELL); // P3 slot
    writeUnitU32(f.owner ?? 0, base + UNIT_ELEM.OWNER); // P3 slot
    const boats = Array.isArray(f.boats) ? f.boats.slice(0, UNIT_BOATS_MAX) : [];
    payload.writeUInt8(boats.length & 0xff, base + UNIT_ELEM.BOATS_COUNT); // troop_units count (role-pinned)
    for (let b = 0; b < boats.length; b += 1) {
      writeUnitU32(boats[b] ?? 0, base + UNIT_ELEM.BOATS_ARRAY + b * 4);
    }
    writeUnitU32(f.spotResolverBase ?? f.supply ?? 0, base + UNIT_ELEM.SPOT_RESOLVER_BASE);
    writeUnitU16(f.mapSection ?? 0, base + UNIT_ELEM.MAP_SECTION); // P3 slot
  }
  return inner;
}

/**
 * 0x0315 ResponseStaticInformationGrid terrain map. Payload = [u8 width][u8 height]
 * [u16 BE rleByteCount][rle pairs (run,value)]; sum(run) must equal width*height. The
 * client RLE-decodes it (FUN_004abbb0) into a width*height grid-type cell map.
 */
/**
 * 0x0315 ResponseStaticInformationGrid — the strategic CELL GRID (RLE). Decoded by FUN_004abbb0:
 * `[u8 w][u8 h][u16 BE rleByteCount]{[u8 run][u8 value]}…`, validated `sum(run) == w*h`. A non-zero cell
 * value `v` (3..88) is an index into the 0x0313 object table (`objectTable[v*3]`), so placing value
 * `v` at a cell makes that cell render/click the object whose record is at index `v`. The wire record
 * is a FIXED 5004-byte size (FUN_004b8b00 size table), so buildLobbyResponseInner zero-pads the
 * payload to 5004. The message-object input helper reads the count as BE wire into the parsed
 * buffer; the downstream RLE decoder then sees the host-order value and ignores trailing zero pad.
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
  grid: prebuiltGrid = null,
} = {}) {
  const w = width & 0xff;
  const h = height & 0xff;
  // 2D 그리드를 row-major(row*w + col)로 구성한 뒤 RLE(run-length, run은 255 상한)로 인코딩한다.
  // 호출자가 완성된 그리드를 통째로 넘길 수 있고(지형 인코더가 100×50 보드에 사용), 그 외 호출자는 균일한
  // `fillValue`로 채운 뒤 `cells` 예외만 찍는다.
  let grid;
  if (prebuiltGrid && prebuiltGrid.length === w * h) {
    grid = Uint8Array.from(prebuiltGrid, (v) => v & 0xff);
  } else {
    grid = new Uint8Array(w * h).fill(fillValue & 0xff);
    for (const { col, row, value } of cells) {
      if (col >= 0 && col < w && row >= 0 && row < h) {
        grid[row * w + col] = value & 0xff;
      }
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
  // pair 영역은 고정 5004바이트 레코드 안에 들어가야 하고(4바이트 헤더 뒤 5000바이트), 클라 RLE 디코더
  // (FUN_004abbb0)는 rleByteCount < 0x1389(5001)을 요구한다. 매우 파편화된 지형 맵은 이론상 넘칠 수 있으니,
  // 조용히 잘라내(=디코더의 sum(run)==w*h 검증을 깨뜨려 그리드 전체가 버려짐) 버리지 말고 크게 실패시킨다.
  // 100×50 항행/차단/마커 보드는 ~1.2KB로 인코딩되어 예산 안에 충분히 들어간다.
  if (pairs.length > payload.length - 4) {
    throw new RangeError(`0x0315 RLE overflow: ${pairs.length} pair bytes exceed ${payload.length - 4} (grid too fragmented to fit the fixed record)`);
  }
  // rleCount is the byte length of the pair region. The input parser at 0x004134e0 reads this
  // through the stream helper, so the wire is BE; the parsed buffer is later consumed by the LE
  // RLE decoder at 0x004abbb0.
  payload.writeUInt16BE(pairs.length, 2);
  Buffer.from(pairs).copy(payload, 4);
  return inner;
}

/**
 * 0x0313 ResponseStaticInformationGridType — the strategic OBJECT TABLE: 1-byte count followed by
 * count × 3-byte records (the client copies the parsed 301-byte buffer into a FIXED 5004-byte record). Per object
 * record at index `v` (= cell value 3..88): byte0 = content-table record id (→ FUN_00522010(0x18,…),
 * the marker's label/link), byte1 = object class (ONLY `3` is placed as a clickable sector marker),
 * byte2 = sprite/color variant (valid 0..6, 8). A fleet placed at cell value `v` needs both this
 * object record (class 3) AND the 0x0315 cell carrying value `v`.
 *
 * `objects` = [{ value, contentId, klass = 3, variant = 0 }] (value 3..88). Evidence:
 * docs/logh7-strategic-map-wire.md §1/§3 (FUN_004c5350 split, FUN_004d3bd0 placement gate).
 */
// constmsg group 0x18 subIds 0..2 are grid-TYPE labels (0=プラズマ嵐/플라스마 폭풍, 1=空間/공간,
// 2=航行不能/항행 불능 그리드); real system names start at subId 3 (アイゼンヘルツ). A class-3 clickable
// marker resolves byte0 via FUN_00522010(0x18, byte0), so a byte0 of 0/1/2 renders a grid-type label as
// if it were a star system (the reported "공간 그리드" phantom). docs/logh7-strategic-map-wire.md §5.
const GRID_TYPE_LABEL_MAX_SUBID = 2;
// P3 display-convention guard: redirect a class-3 marker's grid-type-label byte0 to subId 3 (first real
// system name) so a clickable marker can never render a grid-type label. Not original server data.
function safeMarkerContentId(id, klass) {
  const b = id & 0xff;
  return klass === 3 && b <= GRID_TYPE_LABEL_MAX_SUBID ? GRID_TYPE_LABEL_MAX_SUBID + 1 : b;
}

export function buildStaticInformationGridTypeInner({ objects = [] } = {}) {
  const inner = buildLobbyResponseInner(SS_RESP_STATIC_GRID_TYPE_CODE, SS_RESP_STATIC_GRID_BYTES);
  const payload = inner.subarray(6);
  const normalized = [];
  for (const { value, contentId = 0, klass = 3, variant = 0 } of objects) {
    if (value < 0 || value > 99) {
      continue;
    }
    normalized.push({ value, contentId, klass, variant });
  }
  const count = normalized.length === 0 ? 0 : Math.max(...normalized.map((object) => object.value)) + 1;
  payload.writeUInt8(count, 0);
  // The input parser at 0x00413050 treats byte 0 as count and helper-reads records sequentially
  // into payload offsets `1 + i*3`; keep zero filler records so cell value `v` resolves to index v.
  for (const { value, contentId, klass, variant } of normalized) {
    const off = 1 + value * 3;
    payload.writeUInt8(contentId & 0xff, off);
    payload.writeUInt8(klass & 0xff, off + 1);
    payload.writeUInt8(variant & 0xff, off + 2);
  }
  return inner;
}

const MANUAL_STAR_CHART_PAGE = 101;

function usesManualStarChartAnnotationFrame(system) {
  const page = Number(system?.page ?? system?.mapPage ?? system?.map_page ?? system?.map?.page);
  return page === MANUAL_STAR_CHART_PAGE
    || system?.coordinateFrame === 'manual-pdf-page-101-raw-rotated-90'
    || system?.coordinateFrame === 'manual-pdf-page-101-annotation-transposed';
}

export function strategicGalaxyProjectionPoint(system = {}) {
  const cx = Number(system.cx ?? system.mapCx ?? system.map?.cx);
  const cy = Number(system.cy ?? system.mapCy ?? system.map?.cy);
  if (!Number.isFinite(cx) || !Number.isFinite(cy)) return null;
  if (usesManualStarChartAnnotationFrame(system)) {
    return { x: cy, y: cx };
  }
  return { x: cx, y: cy };
}

export const STRATEGIC_GRID_WIDTH = 100;
export const STRATEGIC_GRID_HEIGHT = 50;

// --- 지형 셀값 스킴 (RE-확정 + 매뉴얼 p31 + constmsg group 0x18 검증, 2026-06-19) ---
// 0x0315 셀값 V는 0x0313 오브젝트 테이블의 인덱스일 뿐이다. 셀의 동작은 전적으로 objectTable[V].byte1(class)이
// 결정한다: byte1 ∈ {1,3}일 때만 항행 가능(FUN_004d6310 게이트, 클라측 — 차단 타깃은 0x0b01을 아예 안 보냄),
// 그 외는 진입 불가. byte0 = constmsg group-0x18 라벨 subId(검증됨: 0=プラズマ嵐/플라스마 폭풍, 1=空間/공간,
// 2=航行不能/항행불능, 3+=성계명). 매뉴얼 p31: プラズマ嵐/サルガッソ는 地形障害 — 어떤 유닛도 진입 불가
// (정적, 航行不能과 동일; 라벨만 다름). 그래서 지형 3종 + 마커를 인코딩하되, 차단 지형들은 동일한 진입불가
// 동작을 공유한다.
// SARGASSO(サルガッソ): プラズマ嵐과 함께 매뉴얼 p31에 나오는 地形障害(진입불가). 종전엔 일반 航行不能(2)에
// 뭉뚱그렸으나, 별도 오브젝트 값으로 분리해 와이어에서 구분 가능하게 한다. 값 89는 성계/함대 마커 범위(3..88)
// 위쪽이라 충돌하지 않고, 오브젝트 테이블 값 상한(0..99, buildStaticInformationGridTypeInner)도 만족한다.
// 특수천체(special_bodies): Null_galaxy.mdx scene-graph에 bh_NN(블랙홀) 3개 + ns_NN(중성자별) 3개가
// 명명 노드로 존재한다(content/extracted/model-galaxy-stars.json special_bodies, P1 = 존재·개수 확정).
// 단 그 노드 인덱스는 "map node order, NOT galaxy.json system order"라 어떤 성계/셀에 속하는지는 캐논
// 매핑이 없다(P3 = 셀 배치 미확정). 그래서 빌더는 호출자가 셀을 줄 때만 인코딩하고, galaxy.json에는
// 개수만 P1로 기록하고 좌표는 추측하지 않는다(P0 승격 금지). 동작상 블랙홀/중성자별은 進入不可 장애물로
// 취급한다(프라즈마/사르가소와 동일 class blocked; 캐논 group-0x18 전용 라벨 없음 → 航行不能 라벨 재사용).
// 값은 성계 마커 범위(4..88, =4+index)·사르가소(89) 위의 빈 슬롯 BH=90/NS=91을 쓴다(셀값 u8 상한 만족,
// 마커와 비충돌). 둘 다 별개 오브젝트 값이라 BH/NS/사르가소/프라즈마가 서로 구분된다.
export const TERRAIN_VALUE = Object.freeze({ PLASMA: 0, SPACE: 1, NON_NAVIGABLE: 2, SARGASSO: 89, BLACK_HOLE: 90, NEUTRON_STAR: 91 });
// 오브젝트 class(byte1): 1 = 항행 가능 빈 공간, 3 = 클릭 가능 마커(성계/함대); 그 외 값은 전부 차단.
const TERRAIN_CLASS_SPACE = 1;
const TERRAIN_CLASS_BLOCKED = 2; // {1,3}이 아니면 차단; 2는 가독성을 위해 航行不能 subId와 맞춤
// byte0 라벨 subId (constmsg group 0x18, P1 — content/client/msgdat.json group 0x18로 검증).
const TERRAIN_LABEL_PLASMA = 0;
const TERRAIN_LABEL_SPACE = 1;
const TERRAIN_LABEL_NON_NAVIGABLE = 2;
// サルガッソ 라벨 subId: 캐논 group-0x18에 サルガッソ 전용 subId가 없으므로(0=プラズマ嵐/1=空間/2=航行不能/3+=성계명)
// 航行不能(2)을 재사용한다 — 진입불가라는 의미는 캐논과 일치하고, "사르가소"라는 분리는 오브젝트 *값*(89)이
// 담당한다. [P3: 라벨 subId는 서버 표시 관례, 캐논 데이터 아님.]
const TERRAIN_LABEL_SARGASSO = 2;
// 블랙홀/중성자별 라벨 subId: 캐논 group-0x18에 전용 라벨이 없으므로 航行不能(2)을 재사용한다(사르가소와 동일
// 관례). "특수천체"라는 분리는 오브젝트 *값*(BH=88, NS=87)이 담당한다. [P3: 라벨 subId는 서버 표시 관례.]
const TERRAIN_LABEL_BLACK_HOLE = 2;
const TERRAIN_LABEL_NEUTRON_STAR = 2;

/**
 * Canon sector cell for a system: the page-101 星系図 dot projected onto the 100×50 grid by the
 * pixel-lattice origin (content/galaxy.json `canonCol`/`canonRow`, derived in
 * .omo/work/galaxy-extract/canon-positions.json). When present this is the AUTHORITATIVE cell —
 * the old min-max linear normalization warps the two faction regions into the non-navigable black
 * gap, so canon cells take precedence and the linear projection is the fallback for inputs (probes,
 * tests) that carry no canon col/row. Returns null when the system has no integer canon cell.
 * @param {{canonCol?:number, canonRow?:number, canon_col?:number, canon_row?:number,
 *   col?:number, row?:number}} system
 */
export function strategicGalaxyCanonCell(system = {}) {
  const col = Number(system.canonCol ?? system.canon_col);
  const row = Number(system.canonRow ?? system.canon_row);
  if (!Number.isInteger(col) || !Number.isInteger(row)) return null;
  if (col < 0 || col >= STRATEGIC_GRID_WIDTH || row < 0 || row >= STRATEGIC_GRID_HEIGHT) return null;
  return { col, row };
}

/**
 * Parse the content/galaxy-passable-cells.json `rowRangesByRow` shape (or a plain array of
 * [col,row] pairs / {col,row} objects) into a Set of "col,row" keys. The set is the navigable
 * (teal grid + faction corridor) sector mask recovered from the 星系図 pixel fill; the grid builder
 * uses it so collision nudges and the fleet cell never land in non-navigable black space. Returns an
 * empty set for null/unrecognized input (callers treat an empty mask as "no restriction").
 * @param {*} source
 */
export function parsePassableCells(source) {
  const set = new Set();
  if (source == null) return set;
  const ranges = source.rowRangesByRow ?? (source.passable && source.passable.rowRangesByRow);
  if (ranges && typeof ranges === 'object') {
    for (const [rowKey, rowRanges] of Object.entries(ranges)) {
      const row = Number(rowKey);
      if (!Number.isInteger(row)) continue;
      for (const range of Array.isArray(rowRanges) ? rowRanges : []) {
        const [a, b] = range;
        const lo = Number(a);
        const hi = Number(b);
        if (!Number.isInteger(lo) || !Number.isInteger(hi)) continue;
        for (let col = lo; col <= hi; col += 1) set.add(`${col},${row}`);
      }
    }
    return set;
  }
  const list = Array.isArray(source) ? source : (Array.isArray(source.passableCells) ? source.passableCells : null);
  if (list) {
    for (const cell of list) {
      let col;
      let row;
      if (Array.isArray(cell)) { [col, row] = cell; } else if (cell && typeof cell === 'object') { col = cell.col; row = cell.row; }
      col = Number(col);
      row = Number(row);
      if (Number.isInteger(col) && Number.isInteger(row)) set.add(`${col},${row}`);
    }
  }
  return set;
}

/**
 * Deterministic PRNG (mulberry32). 같은 seed → 같은 스트림. logh7-strategic-sim의 것과 동일 구현(I/O·시계 없음)
 * — 두 모듈이 서로를 import하지 않게 여기서도 로컬로 둔다(순환 의존 회피, 둘 다 순수함수라 동작 동일).
 * @param {number} seed
 * @returns {() => number} [0,1) 부동소수 생성기
 */
function plasmaMulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 4방향 인접 그래프에서 `passable \ blocked`의 연결요소 개수를 센다(flood-fill). 캐논 항행 마스크 자체가
 * 진영 분리(이제르론·페잔 회랑으로만 이어진 두 반쪽 + 마스크 잡음 셀들) 때문에 단일 요소가 아니라서,
 * "연결성 유지"는 "요소 개수가 늘지 않음"으로 판정한다(아래 generatePlasmaCells).
 * @param {Set<string>} passable  "col,row" 키 집합(항행 가능 마스크)
 * @param {Set<string>} [blocked] passable 중 차단으로 막을 셀들
 * @returns {number} passable\blocked의 연결요소 개수
 */
export function countPassableComponents(passable, blocked = new Set()) {
  const open = new Set();
  for (const key of passable) {
    if (!blocked.has(key)) open.add(key);
  }
  const seen = new Set();
  let components = 0;
  for (const start of open) {
    if (seen.has(start)) continue;
    components += 1;
    seen.add(start);
    const stack = [start];
    while (stack.length > 0) {
      const cur = stack.pop();
      const [c, r] = cur.split(',').map(Number);
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nk = `${c + dc},${r + dr}`;
        if (open.has(nk) && !seen.has(nk)) {
          seen.add(nk);
          stack.push(nk);
        }
      }
    }
  }
  return components;
}

/**
 * `passable \ blocked`가 모두 서로 도달 가능(단일 연결요소)한지 검사한다. 마스크가 본래 단일 요소인
 * 합성/테스트 입력에서 쓰기 좋은 편의 함수. 실 캐논 마스크는 다요소이므로 generatePlasmaCells는
 * countPassableComponents의 "증가 없음" 불변식을 쓴다.
 * @param {Set<string>} passable
 * @param {Set<string>} [blocked]
 * @returns {boolean}
 */
export function isPassableConnected(passable, blocked = new Set()) {
  return countPassableComponents(passable, blocked) <= 1;
}

/**
 * プラズマ嵐 셀을 절차적으로(결정론 seed) 생성한다. 같은 (seed, 입력) → 같은 셀 집합.
 *
 * 제약(사용자 설계, 매뉴얼 p31 기반):
 *   ① 회랑 행(이제르론 row12 · 페잔 row38 등 corridorRows)에는 두지 않는다 — 회랑이 막히면 진영간 단절.
 *   ② 80성계 셀(systemCells)에는 두지 않는다 — 성계 마커를 덮으면 안 됨.
 *   ③ 수도 셀(capitalCells, 제국 2588 · 동맹 2014 등)에는 두지 않는다.
 *   ④ 연결성 유지: 후보를 차단해도 남은 항행 셀이 전부 서로 도달 가능해야 한다(isPassableConnected). 영역
 *      완전차단 금지.
 *
 * 절차: passable 마스크에서 위 제약을 통과하는 후보 셀을 결정론 순서(정렬)로 만들고, 시드 RNG로 셔플한 뒤
 * count(12..24)개를 하나씩 시도해 ④를 깨지 않는 셀만 채택한다(누적 차단셋으로 BFS). count개 못 채우면
 * 채워진 만큼만 반환한다.
 *
 * @param {{ passable:Set<string>, systemCells?:Iterable<string>, capitalCells?:Iterable<string>,
 *   corridorRows?:Iterable<number>, seed?:number, count?:number, minCount?:number, maxCount?:number }} opts
 * @returns {Set<string>} 채택된 플라즈마 셀 "col,row" 키 집합
 */
export function generatePlasmaCells({
  passable,
  systemCells = [],
  capitalCells = [],
  corridorRows = [],
  seed = 1,
  count = null,
  minCount = 12,
  maxCount = 24,
} = {}) {
  const result = new Set();
  if (!(passable instanceof Set) || passable.size === 0) return result;
  const avoid = new Set();
  for (const k of systemCells) avoid.add(String(k));
  for (const k of capitalCells) avoid.add(String(k));
  const corridorRowSet = new Set();
  for (const r of corridorRows) {
    const n = Number(r);
    if (Number.isInteger(n)) corridorRowSet.add(n);
  }
  // 후보 = passable \ (성계·수도·회랑행). 결정론 순서를 위해 정렬한다.
  const candidates = [];
  for (const key of passable) {
    if (avoid.has(key)) continue;
    const [c, r] = key.split(',').map(Number);
    if (!Number.isInteger(c) || !Number.isInteger(r)) continue;
    if (corridorRowSet.has(r)) continue;
    candidates.push(key);
  }
  candidates.sort((a, b) => {
    const [ac, ar] = a.split(',').map(Number);
    const [bc, br] = b.split(',').map(Number);
    return ar - br || ac - bc;
  });
  // 시드 RNG로 결정론 셔플(Fisher–Yates).
  const rng = plasmaMulberry32((seed >>> 0) || 1);
  for (let i = candidates.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = candidates[i];
    candidates[i] = candidates[j];
    candidates[j] = tmp;
  }
  // 목표 개수: count가 주어지면 그대로, 아니면 [minCount,maxCount]에서 결정론 선택.
  const lo = Math.max(0, Math.min(minCount, maxCount));
  const hi = Math.max(lo, Math.max(minCount, maxCount));
  const target = Number.isInteger(count)
    ? Math.max(0, count)
    : lo + Math.floor(rng() * (hi - lo + 1));
  // 연결성 기준 = 마스크 본래 연결요소 개수. 캐논 마스크는 회랑·잡음 때문에 단일 요소가 아니므로(다요소),
  // "영역 완전차단 금지"는 "플라즈마를 빼도 요소 개수가 늘지 않음"으로 판정한다(어떤 셀도 영역을 끊지 못함).
  const baseComponents = countPassableComponents(passable, new Set());
  // 후보를 하나씩 시도: 누적 차단셋에 넣어도 요소 개수가 늘지 않으면 채택.
  for (const key of candidates) {
    if (result.size >= target) break;
    result.add(key);
    if (countPassableComponents(passable, result) > baseComponents) {
      result.delete(key); // 이 셀은 영역을 끊으므로 버린다.
    }
  }
  return result;
}

/**
 * Strategic galaxy grid: project the recovered star systems (content/galaxy.json) onto the 100×50
 * sector grid so the client's strategic map renders ~80 clickable system markers instead of just the
 * lone fleet. Returns { objectInner (0x0313 object table), cellInner (0x0315 cell grid) }.
 *
 * Each system gets an object value 4..83 (capped to ≤85 systems so values stay ≤88, the placeable
 * range), klass=3 (the ONLY class drawn as a clickable marker), and a spectral-class marker variant
 * when recovered (O/B/A/F/G/K/M -> 0..6). Legacy/probe inputs without a spectral field keep the old
 * faction-derived fallback; a present-but-null spectral field uses the unknown/special slot 8.
 *
 * Cell placement: when a system carries a canon cell (`canonCol`/`canonRow`, the page-101 星系図 dot
 * projected onto the 100×50 grid — see content/galaxy.json + .omo/work/galaxy-extract/canon-positions.json)
 * that cell is used DIRECTLY. This replaces the old min-max linear normalization, which warped the two
 * faction regions toward the centre and dropped stars into the non-navigable black gap. Systems with no
 * canon cell fall back to the linear projection (`displayX=contentCy`, `displayY=contentCx` — the
 * page-101 annotation frame is already y-flipped/icon-anchored, so applying `842-contentCy` here would
 * double-mirror the map). Duplicate cells are nudged (col++ wrap, then row++); when a `passableCells`
 * mask is supplied the nudge skips non-navigable cells so two systems never collide and no marker lands
 * in black space. When `fleetCell` is given the player fleet object is also emitted (value=`fleetValue`,
 * klass=3) and is likewise snapped to the nearest free passable cell.
 *
 * @param {{ systems?: Array<{cx:number, cy:number, faction?:string, spectralClass?:string|null,
 *     canonCol?:number, canonRow?:number}>,
 *   fleetCell?: {col:number,row:number}|null,
 *   fleetValue?: number, fleetContentId?: number,
 *   passableCells?: Set<string>|null }} opts
 */
export const STRATEGIC_SPECTRAL_VARIANTS = Object.freeze({ O: 0, B: 1, A: 2, F: 3, G: 4, K: 5, M: 6 });

function hasSpectralField(system) {
  return system != null && (
    Object.hasOwn(system, 'spectralClass')
    || Object.hasOwn(system, 'spectral_class')
    || Object.hasOwn(system, 'starClass')
    || Object.hasOwn(system, 'stellarClass')
  );
}

export function strategicMarkerVariantForSystem(system = {}) {
  const rawClass = system.spectralClass ?? system.spectral_class ?? system.starClass ?? system.stellarClass;
  if (typeof rawClass === 'string') {
    const cls = rawClass.trim().toUpperCase();
    if (Object.hasOwn(STRATEGIC_SPECTRAL_VARIANTS, cls)) return STRATEGIC_SPECTRAL_VARIANTS[cls];
  }
  if (hasSpectralField(system)) return 8;
  const explicit = Number(system.markerVariant ?? system.variant);
  if (Number.isInteger(explicit) && explicit >= 0 && explicit <= 8) return explicit;
  if (system.faction === 'empire') return 1;
  if (system.faction === 'alliance') return 2;
  return 0;
}

export function buildStrategicGalaxyGrid({ systems = [], fleetCell = null, fleetValue = 3, fleetContentId = 0, fleetAsMarker = false, passableCells = null, terrain = false, plasmaCells = null, sargassoCells = null, blackHoleCells = null, neutronStarCells = null } = {}) {
  // Cap to ≤85 systems so the assigned object values (4 + index) stay ≤88 (the placeable cell range).
  // 로스터는 85개 캐논 성계를 담을 수 있으나 좌표를 가진 건 80개뿐 — 좌표 미확정 성계(constmsg group-0x18
  // sub 13/32/34/52/75: 이름은 권위지만 매뉴얼 dot 부재)는 grid 마커를 받지 않는다. canon 셀이 없으면 선형
  // min-max 폴백으로 항행불능 셀에 떨어지므로, 좌표를 절대 지어내지 않고 grid 마커에서 제외해 roster=85,
  // grid 마커=80을 유지한다.
  const list = systems.slice(0, 85)
    .map((system) => ({ system, canon: strategicGalaxyCanonCell(system), point: strategicGalaxyProjectionPoint(system) }))
    .filter(({ system, canon, point }) => {
      // coordinatePending 성계는 우연히 cx/cy가 생기더라도 canon 셀이 없으면 grid 밖에 둔다(선형 폴백 차단).
      if (system?.coordinatePending === true) return canon != null;
      return canon != null || point != null;
    });
  const contentIdFor = (system, index) => {
    const raw = system?.contentId
      ?? system?.markerContentId
      ?? system?.constmsgGroup18Id
      ?? system?.constmsgGroup18SubId;
    const n = Number(raw);
    if (Number.isInteger(n) && n >= 0 && n <= 0xff) return n;
    return index & 0xff;
  };
  const mask = passableCells instanceof Set && passableCells.size > 0 ? passableCells : null;
  const isPassable = (col, row) => !mask || mask.has(`${col},${row}`);
  const used = new Set(); // occupied "col,row" keys for collision resolution
  // Snap (col,row) to the nearest free cell: nudge col (wrap within 0..99), then row, staying in bounds,
  // skipping cells that are already taken OR (when a mask is supplied) non-navigable. Falls back to the
  // raw cell after a full sweep so a fully-masked grid degrades to the old behaviour instead of looping.
  const placeCell = (startCol, startRow) => {
    let col = Math.max(0, Math.min(STRATEGIC_GRID_WIDTH - 1, startCol | 0));
    let row = Math.max(0, Math.min(STRATEGIC_GRID_HEIGHT - 1, startRow | 0));
    for (let i = 0; i < STRATEGIC_GRID_WIDTH * STRATEGIC_GRID_HEIGHT; i += 1) {
      if (!used.has(`${col},${row}`) && isPassable(col, row)) break;
      col += 1;
      if (col >= STRATEGIC_GRID_WIDTH) { col = 0; row += 1; if (row >= STRATEGIC_GRID_HEIGHT) row = 0; }
    }
    used.add(`${col},${row}`);
    return { col, row };
  };
  const objects = [];
  const cells = [];
  if (list.length > 0) {
    // Linear-projection extent is only needed for systems WITHOUT a canon cell (probe/legacy inputs).
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const { point } of list) {
      if (point == null) continue;
      if (point.x < minX) minX = point.x;
      if (point.x > maxX) maxX = point.x;
      if (point.y < minY) minY = point.y;
      if (point.y > maxY) maxY = point.y;
    }
    const spanX = (maxX - minX) || 1; // guard against a single column of systems
    const spanY = (maxY - minY) || 1;
    list.forEach(({ system, canon, point }, index) => {
      const value = 4 + index; // 4..83
      let startCol;
      let startRow;
      if (canon != null) {
        // AUTHORITATIVE: canon 星系図 cell goes in directly (no linear warp).
        startCol = canon.col;
        startRow = canon.row;
      } else {
        startCol = 2 + Math.round(((point.x - minX) / spanX) * (STRATEGIC_GRID_WIDTH - 1 - 4));
        startRow = 2 + Math.round(((point.y - minY) / spanY) * (STRATEGIC_GRID_HEIGHT - 1 - 4));
      }
      const { col, row } = placeCell(startCol, startRow);
      objects.push({ value, contentId: contentIdFor(system, index), klass: 3, variant: strategicMarkerVariantForSystem(system) });
      cells.push({ col, row, value });
    });
  }
  if (fleetCell && fleetAsMarker) {
    // ⚠️ LEGACY/오인 경로 (기본 off, docs/logh7-fleet-render-re.md §1.1 P0 반박):
    // 오브젝트테이블(0x0313/0x0315)에는 "함대" 클래스가 없다 — byte1∈{1=빈공간,3=성계마커}만 유효하고,
    // 함대를 klass-3 값으로 박으면 클라는 그 셀을 **성계 인덱스**로 취급해 가짜 성계 dot로 렌더한다
    // (스프라이트·클릭 없음). 함대 렌더/선택은 별도 unit 엔티티 경로(0x0325 → PLAYER_INFO → own-fleet
    // cell)에서만 일어난다. 그래서 기본은 마커를 찍지 않고(fleetAsMarker=false), 함대 셀의 항행성은
    // terrain SPACE(byte1=1)가 담당한다. 이 분기는 옛 동작 재현/회귀 비교용으로만 남겨둔다.
    objects.push({ value: fleetValue, contentId: safeMarkerContentId(fleetContentId, 3), klass: 3, variant: 0 });
    const { col, row } = placeCell(fleetCell.col, fleetCell.row);
    cells.push({ col, row, value: fleetValue });
  }
  if (terrain) {
    // 지형 인코딩 (기본 off; 기존 호출자는 0 배경의 마커-only 보드를 유지하는데 — RE상 그 0 배경 자체가
    // 항행 불가다). on이면 모든 셀에 의도된 지형 타입을 부여해 보드에 "실제로 이동 가능한 빈 공간"이 생긴다
    // (클라 항행성 게이트는 objectTable[V].byte1을 보므로, 레코드 없는 값-0 배경은 조용히 진입불가 = 유력한
    // 0x0b01 이동 블로커).
    //   항행 마스크 셀 -> SPACE (1, class 1)         : 空間グリッド, 함대가 워프해 들어갈 수 있는 유일한 셀
    //   플라즈마 셀   -> PLASMA (0, class blocked)   : プラズマ嵐, 절차적 地形障害 (매뉴얼 p31, 위치는 랜덤)
    //   사르가소 셀   -> SARGASSO (89, class blocked): サルガッソ, 고정 地形障害 (매뉴얼 p31, 회랑 일대 고정)
    //   그 외 전부    -> NON_NAVIGABLE (2, blocked)  : 航行不能 (바깥 void)
    //   성계 / 함대   -> 각자의 마커 값 (class 3)     : 그대로, 마지막에 찍어 항상 우선
    const W = STRATEGIC_GRID_WIDTH;
    const H = STRATEGIC_GRID_HEIGHT;
    const gridBuf = new Uint8Array(W * H).fill(TERRAIN_VALUE.NON_NAVIGABLE);
    const stamp = (set, value) => {
      if (!(set instanceof Set)) return;
      for (const key of set) {
        const [c, r] = key.split(',').map(Number);
        if (Number.isInteger(c) && Number.isInteger(r) && c >= 0 && c < W && r >= 0 && r < H) {
          gridBuf[r * W + c] = value;
        }
      }
    };
    stamp(mask, TERRAIN_VALUE.SPACE); // 복구된 星系図 마스크 위에 항행 가능 빈 공간
    const plasma = plasmaCells instanceof Set ? plasmaCells : (plasmaCells ? parsePassableCells(plasmaCells) : null);
    stamp(plasma, TERRAIN_VALUE.PLASMA); // 절차적 플라즈마 폭풍 장애물(진입불가, 별도 라벨)
    const sargasso = sargassoCells instanceof Set ? sargassoCells : (sargassoCells ? parsePassableCells(sargassoCells) : null);
    stamp(sargasso, TERRAIN_VALUE.SARGASSO); // 고정 사르가소 장애물(진입불가, プラズマ嵐와 구분되는 별도 값)
    // 특수천체(블랙홀/중성자별): 호출자가 셀을 주면 進入不可 장애물로 스탬프(별개 값 90/91). 캐논 셀 배치가
    // 없으면(기본 null) 아무것도 안 찍는다 — galaxy.json은 개수만 P1로 기록하고 좌표를 추측하지 않는다.
    const blackHole = blackHoleCells instanceof Set ? blackHoleCells : (blackHoleCells ? parsePassableCells(blackHoleCells) : null);
    stamp(blackHole, TERRAIN_VALUE.BLACK_HOLE); // 블랙홀(進入不可)
    const neutronStar = neutronStarCells instanceof Set ? neutronStarCells : (neutronStarCells ? parsePassableCells(neutronStarCells) : null);
    stamp(neutronStar, TERRAIN_VALUE.NEUTRON_STAR); // 중성자별(進入不可)
    for (const { col, row, value } of cells) {
      gridBuf[row * W + col] = value & 0xff; // 마커가 지형보다 우선
    }
    objects.push({ value: TERRAIN_VALUE.SPACE, contentId: TERRAIN_LABEL_SPACE, klass: TERRAIN_CLASS_SPACE, variant: 0 });
    objects.push({ value: TERRAIN_VALUE.NON_NAVIGABLE, contentId: TERRAIN_LABEL_NON_NAVIGABLE, klass: TERRAIN_CLASS_BLOCKED, variant: 0 });
    if (plasma && plasma.size > 0) {
      objects.push({ value: TERRAIN_VALUE.PLASMA, contentId: TERRAIN_LABEL_PLASMA, klass: TERRAIN_CLASS_BLOCKED, variant: 0 });
    }
    if (sargasso && sargasso.size > 0) {
      // サルガッソ: 진입불가(class ∉ {1,3}). 별도 오브젝트 값(89)으로 プラズマ嵐와 구분되며, 라벨 subId는
      // 캐논에 サルガッソ가 없어 航行不能(2)을 재사용한다(P3 표시 관례).
      objects.push({ value: TERRAIN_VALUE.SARGASSO, contentId: TERRAIN_LABEL_SARGASSO, klass: TERRAIN_CLASS_BLOCKED, variant: 0 });
    }
    if (blackHole && blackHole.size > 0) {
      // 블랙홀: 進入不可(class blocked). 별도 값(90), 라벨 subId는 캐논 전용 라벨 부재로 航行不能(2) 재사용.
      objects.push({ value: TERRAIN_VALUE.BLACK_HOLE, contentId: TERRAIN_LABEL_BLACK_HOLE, klass: TERRAIN_CLASS_BLOCKED, variant: 0 });
    }
    if (neutronStar && neutronStar.size > 0) {
      // 중성자별: 進入不可(class blocked). 별도 값(91), 라벨 subId는 航行不能(2) 재사용.
      objects.push({ value: TERRAIN_VALUE.NEUTRON_STAR, contentId: TERRAIN_LABEL_NEUTRON_STAR, klass: TERRAIN_CLASS_BLOCKED, variant: 0 });
    }
    return {
      objectInner: buildStaticInformationGridTypeInner({ objects }),
      cellInner: buildStaticInformationGridInner({ width: W, height: H, grid: gridBuf }),
    };
  }
  return {
    objectInner: buildStaticInformationGridTypeInner({ objects }),
    cellInner: buildStaticInformationGridInner({ width: STRATEGIC_GRID_WIDTH, height: STRATEGIC_GRID_HEIGHT, cells }),
  };
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
 * 0x0b07 NotifyMovedGrid: authoritative strategic move candidate. `units` = [{ unitId, cell }] (≤70).
 * The real client accepts the record through FUN_004bee20 -> FUN_00517cd0 -> event 0x16; persistent
 * unit/PLAYER_INFO/cell mutation is still live-RE gated. Evidence: docs/logh7-strategic-input-wire.md §3.
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
 * packed SEND form (serializer FUN_00405ea0 / parser FUN_004066f0). Raw inner is [u16 BE code][body].
 *
 * Re-derived from a LIVE unmodified-client capture (lastname "Reinhard" / firstname "Lohengramm");
 * see docs/logh7-character-creation-wire.md §2.1. The earlier doc table listed FIXED name slots
 * (lastname@0x0c, firstname@0x28). The real wire is **packed**: the names are NUL-terminated
 * UTF-16LE strings written back-to-back, so every field after a name shifts by that name's length.
 * The fixed HEADER is also tighter than the old table assumed (power@0x05, not @0x08). Layout:
 *   @0x00 u32 request_category
 *   @0x04 u8  (pad / reserved)
 *   @0x05 u8  power   (faction id)
 *   @0x06 u8  blood   (origin/bloodline)
 *   @0x07 u8  sex
 *   @0x08 u8  lastname_len  (units INCLUDING the NUL terminator → real chars = len-1, cap ≤ 0xe)
 *   @0x09 u8  (pad, keeps chars u16-aligned)
 *   @0x0a u16[real] lastname (UTF-16LE), then ONE NUL byte, then immediately firstname_len/firstname.
 *   …then the fixed tail (face u32, ability_8[8], bonus_point, title, rank) follows the packed names.
 * In the live capture the whole post-firstname tail is zero, so face=0 / abilities all 0.
 * Returns null if the buffer is too short to hold the fixed header + both name length bytes.
 */
export function parseGenerateCharacterCharge(inner) {
  const body = inner.subarray(2);
  // Minimum: fixed header (0x08) + lastname_len + at least its pad byte. The packed tail can be
  // shorter than the old 0x5c fixed-slot total because names are variable-length, not reserved.
  if (body.length < 0x0a) {
    return null;
  }
  // Packed name reader: u8 length (counts the NUL terminator) + pad byte, then `len-1` UTF-16LE
  // chars, then a single NUL byte. Returns the decoded string and the offset of the NEXT field.
  const readPackedName = (lenOff, maxUnits) => {
    const rawLen = body.readUInt8(lenOff);
    const real = Math.min(rawLen > 0 ? rawLen - 1 : 0, maxUnits);
    const charsStart = lenOff + 2; // skip len(u8) + pad(u8) → chars are u16-aligned
    let name = '';
    for (let i = 0; i < real; i += 1) {
      const off = charsStart + i * 2;
      if (off + 2 > body.length) {
        break;
      }
      name += String.fromCharCode(body.readUInt16LE(off));
    }
    // The next length byte sits right after the chars + the terminator's low byte (odd boundary).
    const nextOff = charsStart + (rawLen > 0 ? rawLen - 1 : 0) * 2 + 1;
    return { name, nextOff };
  };
  const requestCategory = body.readUInt32LE(0x00);
  const power = body.readUInt8(0x05);
  const blood = body.readUInt8(0x06);
  const sex = body.readUInt8(0x07);
  const last = readPackedName(0x08, CHARACTER_NAME_MAX_UNITS);
  const first = readPackedName(last.nextOff, CHARACTER_NAME_MAX_UNITS);
  // Fixed tail follows the packed firstname. Read defensively — the live capture's tail is all
  // zeros, so any field beyond the buffer reads as 0.
  const u8At = (off) => (off < body.length ? body.readUInt8(off) : 0);
  const u32At = (off) => (off + 4 <= body.length ? body.readUInt32LE(off) : 0);
  const tail = first.nextOff;
  const abilities = [];
  for (let i = 0; i < 8; i += 1) {
    abilities.push(u8At(tail + 4 + i));
  }
  return {
    requestCategory,
    power,
    blood,
    sex,
    lastname: last.name,
    firstname: first.name,
    face: u32At(tail),
    abilities,
    bonusPoint: u8At(tail + 12),
    title: u8At(tail + 14),
    rank: u8At(tail + 15),
  };
}

export function buildGenerateCharacterChargeOkInner({
  requestInner = null,
  requestCategory = null,
  accepted = true,
  character = null,
} = {}) {
  const inner = buildLobbyResponseInner(CMD_GENERATE_CHARGE_CODE, CMD_GENERATE_CHARGE_OK_BYTES);
  const payload = inner.subarray(6);
  const requestBody = requestInner ? requestInner.subarray(2) : null;
  if (!character && requestBody && requestBody.length > 0) {
    requestBody.copy(payload, 0, 0, Math.min(requestBody.length, payload.length));
  }
  const category = requestCategory ?? (requestBody && requestBody.length >= 4 ? requestBody.readUInt32LE(0) : 0);
  payload.writeUInt32LE(category >>> 0, 0);
  payload.writeUInt8(accepted ? 1 : 0, 4);
  const writeByte = (value, offset) => payload.writeUInt8((value ?? 0) & 0xff, offset);
  const writeStreamU16 = (value, offset) => payload.writeUInt16BE((value ?? 0) & 0xffff, offset);
  const writeStreamU32 = (value, offset) => payload.writeUInt32BE((value ?? 0) >>> 0, offset);
  const writePackedPstr16 = (value, lenOff) => {
    if (value == null) {
      writeByte(0, lenOff);
      return lenOff + 1;
    }
    const chars = [...String(value)].slice(0, CHARACTER_NAME_MAX_UNITS);
    writeByte(chars.length + 1, lenOff);
    const charsOff = lenOff + 1;
    for (let i = 0; i < chars.length; i += 1) {
      payload.writeUInt16BE(chars[i].charCodeAt(0) & 0xffff, charsOff + i * 2);
    }
    payload.writeUInt16BE(0, charsOff + chars.length * 2);
    const nextOff = charsOff + (chars.length + 1) * 2;
    return nextOff;
  };
  if (character) {
    writeByte(character.createPower ?? character.power, 0x05);
    writeByte(character.blood, 0x06);
    writeByte(character.sex, 0x07);
    let cursor = writePackedPstr16(character.lastname ?? character.name, 0x08);
    cursor = writePackedPstr16(character.firstname, cursor);
    writeStreamU32(character.createUnknown44, cursor);
    writeByte(character.birthMonth, cursor + 4);
    writeByte(character.birthDay, cursor + 5);
    writeStreamU32(character.face, cursor + 6);
    if (Array.isArray(character.abilities)) {
      for (let i = 0; i < 8 && i < character.abilities.length; i += 1) {
        writeByte(character.abilities[i], cursor + 10 + i);
      }
    }
    writeByte(character.bonusPoint, cursor + 18);
    writeByte(character.specialAbilityNum, cursor + 19);
    writeByte(character.title, cursor + 20);
    const createRankSubId = character.createRankSubId ?? character.rankSubId ?? character.createRank;
    if (createRankSubId != null && createRankSubId > 0) {
      writeByte(createRankSubId, cursor + 21);
    }
    writeByte(character.flagshipType, cursor + 22);
    writeStreamU16(character.flagshipKind, cursor + 23);
    const flagNameOff = cursor + 25;
    const checkOff = writePackedPstr16(character.flagshipName, flagNameOff);
    if (checkOff < payload.length) {
      writeByte(character.check, checkOff);
    }
    // The runtime destination has a fixed check byte at +0x7c after parser expansion.
    // Keep the padded slot populated too; the sequential byte above is what FUN_004066f0 consumes.
    writeByte(character.check, 0x7c);
  }
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
export const SS_RESP_TACTICS_INFO_BYTES = 0x79e4; // 31204 dispatcher receive-buffer cap, not wire body length.
export const TACTICS_UNIT_ENTRY_HEADER_BYTES = 2; // wire count u16 only; parser adds resident padding.
export const TACTICS_UNIT_ENTRY_STRIDE = 0x34; // FUN_00421f80 advances each UnitShip record by 52 bytes.

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
const list = units.length ? units : [{}];
const count = Math.min(list.length, 600);
const inner = buildLobbyResponseInner(SS_RESP_TACTICS_INFO_CODE, SS_RESP_TACTICS_INFO_BYTES);
const body = inner.subarray(6);
  body.writeUInt16BE(count & 0xffff, 0); // clientBase+0x4271a8 unit count
for (let i = 0; i < count; i += 1) {
const {
  unitId = 1, id, shipId, controllable = 1, morale, confusion = 0, mapSection,
x = 0, y = 0, z = 0, heading = 0, direction,
    anchorId, anchorUnitId, currentId, currentUnitId,
    detachmentLeader, detachmentLeaderId, detachmentX, detachmentY, detachmentZ,
detachmentDirection, detachmentHeading, search = 0,
} = list[i];
const unit = (id ?? shipId ?? unitId) >>> 0;
const base = TACTICS_UNIT_ENTRY_HEADER_BYTES + i * TACTICS_UNIT_ENTRY_STRIDE;
if (base + TACTICS_UNIT_ENTRY_STRIDE > body.length) break;
    body.writeUInt32BE(unit, base + 0x00);
body.writeUInt8(Math.max(0, Math.min(0xff, Math.round(controllable ?? morale ?? 1))) & 0xff, base + 0x04);
body.writeUInt8(Math.max(0, Math.min(0xff, Math.round(confusion))) & 0xff, base + 0x05);
    body.writeUInt32BE((mapSection ?? unit) >>> 0, base + 0x06);
    body.writeFloatBE(Number.isFinite(x) ? x : 0, base + 0x0a);
    body.writeFloatBE(Number.isFinite(y) ? y : 0, base + 0x0e);
    body.writeFloatBE(Number.isFinite(z) ? z : 0, base + 0x12);
    // FUN_004c32a0 passes dword[6] to FUN_004c1d20 param_4, which becomes tacticalEntry+0x24 current link id.
    body.writeUInt32BE((anchorId ?? anchorUnitId ?? currentId ?? currentUnitId ?? unit) >>> 0, base + 0x16);
    body.writeUInt32BE((detachmentLeader ?? detachmentLeaderId ?? 0) >>> 0, base + 0x1a);
    body.writeFloatBE(Number.isFinite(detachmentX) ? detachmentX : 0, base + 0x1e);
    body.writeFloatBE(Number.isFinite(detachmentY) ? detachmentY : 0, base + 0x22);
    body.writeFloatBE(Number.isFinite(detachmentZ) ? detachmentZ : 0, base + 0x26);
    const dir = Number.isFinite(direction) ? direction : heading;
    const detDir = Number.isFinite(detachmentDirection) ? detachmentDirection : Number.isFinite(detachmentHeading) ? detachmentHeading : dir;
    body.writeFloatBE(Number.isFinite(detDir) ? detDir : 0, base + 0x2a);
    body.writeUInt8(Math.max(0, Math.min(0xff, Math.round(search))) & 0xff, base + 0x2e);
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
export const WORLD_OK_STATUS_CODES = new Set([0x0f01, 0x0f03, 0x0317, 0x0f09]);

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

/**
 * Build a SysSessionAnnounceNotify (0x2003) inner: the unsolicited S->C server-notice push that fills
 * the title-menu 서버 공지 panel. The client renderer is MultiByteToWideChar with codepage 949, so the
 * body MUST be CP949 bytes, NUL-terminated. Accepts either:
 *   - a Buffer of pre-encoded CP949 bytes (the caller owns the encoding; no JS iconv dependency), or
 *   - a string, which is encoded as Latin-1/ASCII (CP949 is ASCII-transparent for the < 0x80 range;
 *     non-ASCII codepoints in a string would need a CP949 table — pass a Buffer for Korean text).
 * message32-framed: [u32 BE 0][u16 BE 0x2003][cp949 body + NUL].
 *
 * NOTE (workflow wndew4jop, MEDIUM conf): code 0x2003 is inference-only and numerically collides with
 * the conn2 LOBBY_REQ_INFO_CHARACTER_CHARGE request (a different Sys parser). The push must be A/B
 * verified on a live client before being claimed working; it is env-gated off by default.
 * @param {{ text?: string|Buffer }} [options]
 */
export function buildSysSessionAnnounceNotifyInner({ text = '' } = {}) {
  let bodyBytes;
  if (Buffer.isBuffer(text)) {
    bodyBytes = text;
  } else {
    // CP949 is ASCII-transparent below 0x80; for a Latin-1 ASCII notice this is byte-correct. Korean
    // text must be supplied pre-encoded as a Buffer (see the env loader in logh7-auth-server.mjs).
    bodyBytes = Buffer.from(String(text), 'latin1');
  }
  const payload = Buffer.alloc(bodyBytes.length + 1); // + NUL terminator
  bodyBytes.copy(payload, 0);
  // payload[last] already 0 (alloc zero-fills) = NUL terminator
  return buildMpsClientMessage32Inner({ code: LOBBY_SESSION_ANNOUNCE_NOTIFY_CODE, payload });
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
const LOBBY_CHARACTER_CHARGE_DETAIL_NAME_UNITS = 0x0d;
const LOBBY_CHARACTER_CHARGE_CARD_KIND = 2;
const LOBBY_CHARACTER_CHARGE_SELECTABLE_DETAIL_COUNT = 1;
const LOBBY_CHARACTER_CHARGE_DISPLAY_AGE_SECONDS_PER_YEAR = 0x01e13380;
const DEFAULT_LOBBY_CHARACTER_DISPLAY_AGE_YEARS = 18;

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
 * @param {{ characters?: Array<{
 *   id?: number, characterId?: number, status?: number, name?: string, characterName?: string,
 *   description?: string, characterDescription?: string, power?: number|string, camp?: number|string,
 *   nationId?: number, nation_id?: number, faction?: string, generated?: number, sex?: number,
 *   birthdayMonth?: number, birthday_month?: number, birthdayDay?: number, birthday_day?: number,
 *   state?: number, abilities?: number[], lastname?: string, firstname?: string, displayName?: string,
 * }>} [options]
 */
export function buildLobbyInformationCharacterChargeInner({ characters = [] } = {}) {
  const records = normalizeLobbyCharacterRecords(characters);
  const inner = buildLobbyResponseInner(
    LOBBY_RESP_INFO_CHARACTER_CHARGE_CODE,
    LOBBY_RESP_INFO_CHARACTER_CHARGE_PAYLOAD_BYTES,
  );
  const payload = inner.subarray(6);
  payload.writeUInt8(records.length, 0);
  // 와이어는 컴팩트 순차 스트림이다(클라 0x0043fd60이 소비하며 0x36c 스트라이드 목적지로 복사).
  // 각 레코드는 직전 레코드가 소비한 바이트 바로 뒤에서 시작한다(고정 스트라이드 아님).
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
  cursor = writeLobbyUtf16FieldBE(payload, cursor, record.name, LOBBY_CHARACTER_CHARGE_NAME_UNITS);
  cursor = writeLobbyUtf16FieldBE(payload, cursor, record.description, LOBBY_CHARACTER_CHARGE_DESCRIPTION_UNITS);

  cursor += LOBBY_CHARACTER_CHARGE_GATE_PREFIX_STREAM_BYTES;
  payload.writeUInt8(LOBBY_CHARACTER_CHARGE_CARD_KIND, cursor);
  cursor += 1;
  payload.writeUInt8(LOBBY_CHARACTER_CHARGE_SELECTABLE_DETAIL_COUNT, cursor);
  cursor += 1;
  return writeLobbyChargedCharacterDetail(payload, cursor, record);
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
    const power = lobbyPowerByte(record.power ?? record.nationId ?? record.nation_id ?? record.faction) ?? 1;
    const camp = lobbyPowerByte(record.camp ?? record.campId ?? record.camp_id) ?? power;
    const lastname = lobbyDetailFieldText(
      record.cardHeaderName
      ?? record.headerName
      ?? record.displayName
      ?? record.display_name
      ?? record.fullName
      ?? record.lastname
      ?? record.lastName
      ?? record.familyName
      ?? name,
    );
    const firstname = lobbyDetailFieldText(record.firstname ?? record.firstName ?? '');
    const displayName = lobbyDetailFieldText(record.displayName ?? record.display_name ?? record.characterName ?? name);
    return {
      id,
      status,
      name,
      description,
      power,
      camp,
      generated: lobbyByte(record.generated ?? record.isGenerated ?? 1),
      sex: lobbyByte(record.sex ?? 0),
      birthdayMonth: lobbyByte(record.birthdayMonth ?? record.birthday_month ?? record.birthMonth ?? 1),
      birthdayDay: lobbyByte(record.birthdayDay ?? record.birthday_day ?? record.birthDay ?? 1),
      displayAgeSeconds: lobbyCardDisplayAgeSeconds(record),
      state: lobbyByte(record.state ?? 1),
      abilities: lobbyAbility8(record.abilities),
      lastname,
      firstname,
      displayName,
    };
  });
}

function lobbyDetailFieldText(value) {
  return [...String(value ?? '')].slice(0, LOBBY_CHARACTER_CHARGE_DETAIL_NAME_UNITS - 1).join('');
}

function writeLobbyChargedCharacterDetail(payload, cursor, record) {
  payload.writeUInt32BE(record.id, cursor);
  cursor += 4;
  payload.writeUInt8(record.power, cursor);
  cursor += 1;
  payload.writeUInt8(record.camp, cursor);
  cursor += 1;
  payload.writeUInt8(record.generated, cursor);
  cursor += 1;
  payload.writeUInt8(record.sex, cursor);
  cursor += 1;
  payload.writeUInt8(record.birthdayMonth, cursor);
  cursor += 1;
  payload.writeUInt8(record.birthdayDay, cursor);
  cursor += 1;
  payload.writeUInt32BE(record.displayAgeSeconds, cursor);
  cursor += 4;
  payload.writeUInt8(record.state, cursor);
  cursor += 1;
  for (const ability of record.abilities) {
    payload.writeUInt16BE(ability, cursor);
    cursor += 2;
  }
  cursor = writeLobbyUtf16FieldBE(payload, cursor, record.lastname, LOBBY_CHARACTER_CHARGE_DETAIL_NAME_UNITS);
  cursor = writeLobbyUtf16FieldBE(payload, cursor, record.firstname, LOBBY_CHARACTER_CHARGE_DETAIL_NAME_UNITS);
  cursor = writeLobbyUtf16FieldBE(payload, cursor, record.displayName, LOBBY_CHARACTER_CHARGE_DETAIL_NAME_UNITS);
  return cursor;
}

function lobbyInt(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function lobbyByte(value) {
  const n = lobbyInt(value);
  return n == null ? 0 : Math.max(0, Math.min(0xff, n));
}

function lobbyU32(value) {
  const n = lobbyInt(value);
  return n == null ? 0 : n >>> 0;
}

function lobbyCardDisplayAgeSeconds(record) {
  const explicitSeconds = record.ageSeconds ?? record.age_seconds;
  if (explicitSeconds != null) return lobbyU32(explicitSeconds);
  const years = record.ageYears ?? record.age;
  if (years != null) {
    return Math.min(
      0xffffffff,
      Math.max(0, lobbyU32(years)) * LOBBY_CHARACTER_CHARGE_DISPLAY_AGE_SECONDS_PER_YEAR,
    ) >>> 0;
  }
  return lobbyU32(record.reserved ?? record.unknownDword ?? DEFAULT_LOBBY_CHARACTER_DISPLAY_AGE_YEARS * LOBBY_CHARACTER_CHARGE_DISPLAY_AGE_SECONDS_PER_YEAR);
}

function lobbyPowerByte(value) {
  if (value == null) return null;
  const n = lobbyInt(value);
  if (n != null) {
    if (n === 0x500) return 1;
    if (n === 0x501) return 2;
    if (n === 0x502) return 3;
    return n >= 1 && n <= 0xff ? n & 0xff : null;
  }
  const key = String(value).trim().toLowerCase();
  if (key === 'empire' || key === 'imperial' || key === '帝国' || key === '제국') return 1;
  if (key === 'alliance' || key === 'fpa' || key === 'free planets' || key === 'free planets alliance' || key === '同盟' || key === '동맹') return 2;
  if (key === 'neutral' || key === 'phezzan' || key === 'フェザーン' || key === '페잔') return 3;
  return null;
}

function lobbyAbility8(abilities) {
  const out = Array.isArray(abilities) ? abilities.slice(0, 8).map((v) => lobbyU32(v) & 0xffff) : [];
  while (out.length < 8) out.push(0);
  return out;
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

function writeLobbyUtf16FieldBE(target, cursor, value, maxUnits) {
  const text = String(value ?? '');
  const bodyUnits = [...text].slice(0, Math.max(0, maxUnits - 1));
  const units = [...bodyUnits, '\0'];
  target.writeUInt8(units.length, cursor);
  let next = cursor + 1;
  for (const unit of units) {
    target.writeUInt16BE(unit.codePointAt(0) ?? 0, next);
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
  sessions = null,
} = {}) {
  // Backward-compatible: a single fixed record (recordCount/sessionId/...) unless `sessions` is given.
  // `sessions` (workflow wndew4jop, 세션 변경) is the multi-record form: [{ sessionId, name, description,
  // status }]. status 1|2 makes a record selectable (client gate FUN_00593d90). record[0]'s on-wire
  // byte layout is unchanged so the existing single-record hex assertion still passes.
  const records = Array.isArray(sessions)
    ? sessions.map((s, i) => ({
        sessionId: Number.isInteger(s?.sessionId) ? s.sessionId : i + 1,
        status: Number.isInteger(s?.status) ? s.status : 1,
        name: s?.name ?? s?.sessionName ?? 'Test',
        description: s?.description ?? s?.sessionDescription ?? 'Codex Session',
      }))
    : Array.from({ length: recordCount }, () => ({
        sessionId,
        status: recordStatus,
        name: sessionName,
        description: sessionDescription,
      }));
  if (records.length > 0x40) {
    throw new Error(`invalid lobby session record count: ${records.length}`);
  }
  for (const r of records) {
    if (!Number.isInteger(r.sessionId) || r.sessionId < 0 || r.sessionId > 0xffff) {
      throw new Error(`invalid lobby session id: ${r.sessionId}`);
    }
    if (!Number.isInteger(r.status) || r.status < 0 || r.status > 0xff) {
      throw new Error(`invalid lobby session record status: ${r.status}`);
    }
  }
  const inner = buildLobbyResponseInner(LOBBY_RESP_INFO_SESSION_CODE, LOBBY_RESP_INFO_SESSION_PAYLOAD_BYTES);
  const payload = inner.subarray(6);
  payload.writeUInt8(0, 0); // raw leading byte consumed before the top-level count
  payload.writeUInt8(records.length, 1);
  let cursor = 2;
  for (const r of records) {
    payload.writeUInt16LE(r.sessionId, cursor);
    cursor += 2;
    payload.writeUInt8(r.status, cursor);
    cursor += 1; // raw record status/metadata byte
    cursor = writeLobbyUtf16Field(payload, cursor, r.name, 0x0d);
    cursor = writeLobbyUtf16Field(payload, cursor, r.description, 0x41);
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

export function isGin7CredentialInner(innerPayload) {
  const code = readInnerCode(innerPayload);
  return (
    (code === LOGIN_INNER_CODE || code === LOBBY_LOGIN_REQUEST_CODE || code === SS_LOGIN_REQUEST_CODE) &&
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
  if (!isGin7CredentialInner(innerPayload)) {
    throw new Error('inner payload is not a GIN7 login credential');
  }
  let accountLabel = '';
  if (innerPayload.length >= 12) {
    const compactLobbyCredential = readInnerCode(innerPayload) !== LOGIN_INNER_CODE && innerPayload.readUInt16BE(6) === 0x0057;
    const count = compactLobbyCredential ? innerPayload.readUInt16BE(8) : innerPayload.readUInt16BE(10);
    const chars = [];
    let cursor = compactLobbyCredential ? 10 : 12;
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
  return { code: readInnerCode(innerPayload), accountLabel, rawHex: innerPayload.toString('hex') };
}

// The GIN7 credential ENCODER (inverse of parseGin7Credential) lives in a sibling module so the
// asymmetric/partly-LE password encoding is documented in one place; re-exported here so callers
// import the builder beside its decoder.
export { buildGin7Credential } from './logh7-gin7-credential.mjs';

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
