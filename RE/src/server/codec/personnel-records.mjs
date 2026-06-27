/**
 * [L2 코덱 레이어] 순수 와이어 코덱 모듈 — 인사(人事 / cards) 패밀리(0x0704..0x0709 / 0x070a·0x070b·0x0356·0x0358).
 *
 * 이 파일은 logh7-personnel.mjs 에서 "기능 무변경"으로 분리한 순수 코덱이다. 상수/파서/빌더/디코더의
 * 바이트 오프셋·stride·size·로직을 1비트도 바꾸지 않았고, import 경로만 ../ 로 한 단계 상향했다. node:fs
 * 의존이 전혀 없는 순수 모듈이며, 인메모리 로스터(createPersonnelState)와 도메인 처리부(processPersonnel)는
 * 상위 shim logh7-personnel.mjs 에 남아 있다(단방향: 도메인 → codec. 의존 역전 금지).
 *
 * 기존 import 경로 보존: 원래 위치 src/server/logh7-personnel.mjs 가 이 모듈을 그대로 re-export 한다.
 *
 * ============================================================================================
 * Authoritative internal-affairs PERSONNEL (人事 / cards) WIRE CODEC — the pure
 * "parse personnel command" / "build S→C notify" half of the personnel domain.
 *
 * The LOGH VII client is a thin renderer for personnel actions: it SENDS a personnel command
 * (CommandRankUp 0x704 / CommandSpeciallyRankUp 0x705 / CommandRankDown 0x706 /
 * CommandCardAppointment 0x707 / CommandCardDismisal 0x708 / CommandCardResignation 0x709) and
 * only mutates its own card/seat tables when the server broadcasts the matching S->C record:
 * NotifyCardLoss 0x70a (remove a card from a seat array), NotifyCardLossMovedSpot 0x70b (card lost
 * + spot relocation), NotifyInformationCharacter 0x356 (full character delta), and
 * NotifyChangeFlagShip 0x358 (the outfit's live state record). This module supplies:
 *   - the message CODES + wire-size constants,
 *   - the six personnel command parsers (offsets per docs/logh7-proto-personnel-strategy.md §2),
 *   - the S→C notify builders (0x70a/0x70b/0x356/0x358),
 *   - and the 0x356 stream decoder.
 *
 * EVIDENCE (Ghidra G7MTClient, index .omo/ghidra/export/G7MTClient) — see the spec doc for the full
 * per-field tables with vtable readers (FUN_006105b0=u8 / 00610600=u16 / 00610650=u32 / 006106f0=i16),
 * the get_length formulas, and the apply fns (CardAppointment apply FUN_004c5580 appends an 8-byte
 * seat entry {card id, role} to unit+0x274 and bumps unit+0x270; NotifyCardLoss apply FUN_004c0670
 * removes it; NotifyCardLossMovedSpot apply FUN_004c0790 writes the new spot at unit+0x40/+0x44).
 *
 * Pure + synchronous => fully unit-testable.
 * ============================================================================================
 */

import { buildLobbyResponseInner, buildMpsClientMessage32Inner } from '../logh7-login-protocol.mjs';

// ---- personnel (人事 / cards) message codes (docs/logh7-proto-personnel-strategy.md §1 dispatch table) ----
export const COMMAND_RANK_UP_CODE = 0x0704; // C->S CommandRankUp          (≤160B, get_length 0x1a + count*4)
export const COMMAND_SPECIALLY_RANK_UP_CODE = 0x0705; // C->S CommandSpeciallyRankUp  (≤16168B)
export const COMMAND_RANK_DOWN_CODE = 0x0706; // C->S CommandRankDown        (≤168B, 0x1d + count*4)
export const COMMAND_CARD_APPOINTMENT_CODE = 0x0707; // C->S CommandCardAppointment (40B fixed, apply FUN_004c5580)
export const COMMAND_CARD_DISMISAL_CODE = 0x0708; // C->S CommandCardDismisal    (≤160B, 0x1d + count*4)
export const COMMAND_CARD_RESIGNATION_CODE = 0x0709; // C->S CommandCardResignation (≤156B)

export const NOTIFY_CARD_LOSS_CODE = 0x070a; // S->C NotifyCardLoss            (12B: owner, silent, u16 card)
export const NOTIFY_CARD_LOSS_MOVED_SPOT_CODE = 0x070b; // S->C NotifyCardLossMovedSpot   (16B: owner, x, y)

// 작위(叙爵)·봉토(封土授与/封土直轄) GRANT 커맨드 — personnel 패밀리(0x0704..0x070b) 옆 미사용 코드를 빌렸다.
// [PROVENANCE P3] 별도 와이어 opcode가 RE로 확정되지 않았다. post-permissions.md §3은 叙爵=constmsg rec 558,
// 封土授与/直轄=rec 564 를 P1 액션메뉴(group 0x12)로 들지만, 클라가 보내는 송신 opcode 번호는 reverse 되지
// 않았다(0x12 action 메뉴 항목일 뿐 distinct C->S opcode 미확인). 0x070a/0x070b는 이미 S->C Notify로 쓰이므로
// 그 다음 0x070c/0x070d/0x070e를 인바운드 GRANT로 배정한다 — 라이브 trace로 실제 송신 opcode를 캡처하면
// 이 상수만 교체하면 된다(파서/처리부 셰이프는 진급(0x0704) body와 동형이라 불변).
export const COMMAND_GRANT_TITLE_CODE = 0x070c; // C->S GrantTitle (叙爵) [P3 opcode]
export const COMMAND_GRANT_FIEF_CODE = 0x070d; // C->S GrantFief (封土授与) [P3 opcode]
export const COMMAND_REVOKE_FIEF_CODE = 0x070e; // C->S RevokeFief (封土直轄, 직할 환수) [P3 opcode]
export const NOTIFY_INFORMATION_CHARACTER_CODE = 0x0356; // S->C NotifyInformationCharacter compact stream
export const NOTIFY_CHANGE_FLAGSHIP_CODE = 0x0358; // S->C NotifyChangeFlagShip      (92B outfit-state record)

// Wire sizes (S->C records) — dispatch ceilings from FUN_004b8b00 / recv dword copies in FUN_004ba2b0.
export const NOTIFY_CARD_LOSS_BYTES = 12; // recv copies 3 dwords to &DAT_004327b0
export const NOTIFY_CARD_LOSS_MOVED_SPOT_BYTES = 16; // recv copies 4 dwords to &DAT_004327bc
export const COMMAND_CARD_APPOINTMENT_BYTES = 0x28; // recv copies 10 dwords, then FUN_004c5580 appends seat entry
export const NOTIFY_INFORMATION_CHARACTER_BYTES = 0x2d8; // 728-byte client-side object after FUN_0042c7e0 parses the stream
export const NOTIFY_CHANGE_FLAGSHIP_BYTES = 0x5c; // 92 — recv copies 0x17 dwords to &DAT_004332d0

// Rank ladder bounds (LOGH VII has 14 ranks; spec §2 "1..14 rank ladder"). gin7 manual = 14 階級.
export const MIN_RANK = 1;
export const MAX_RANK = 14;
// Seat array cap: CardAppointment apply caps unit+0x270 at 0x10 (16 cards per outfit). spec §2.4.
export const MAX_SEATS_PER_OUTFIT = 16;
// move_character[] refresh-id array is bounded at 32 (u8 count, loop bound). spec §2.1.
export const MAX_MOVE_CHARACTERS = 32;
// down_achievement_character[] is bounded at 2000 (u16 count, 0x7d0). spec §2.2.
export const MAX_DOWN_ACHIEVEMENT = 2000;

function characterCodes(value, max) {
  if (value == null) return [];
  return [...String(value)].slice(0, max).map((ch) => ch.charCodeAt(0) & 0xffff);
}

function writeUtf16CodeStream(parts, codes, wireEndian = 'be') {
  for (const code of codes) {
    const item = Buffer.alloc(2);
    if (wireEndian === 'le') item.writeUInt16LE(code & 0xffff, 0);
    else item.writeUInt16BE(code & 0xffff, 0);
    parts.push(item);
  }
}

function writePstr16Stream(parts, value, max = 13, wireEndian = 'be') {
  const codes = characterCodes(value ?? '', max);
  parts.push(Buffer.from([codes.length & 0xff]));
  writeUtf16CodeStream(parts, codes, wireEndian);
}

function streamU8(parts, value) {
  parts.push(Buffer.from([(value ?? 0) & 0xff]));
}

function streamU16(parts, value, wireEndian = 'be') {
  const item = Buffer.alloc(2);
  if (wireEndian === 'le') item.writeUInt16LE((value ?? 0) & 0xffff, 0);
  else item.writeUInt16BE((value ?? 0) & 0xffff, 0);
  parts.push(item);
}

function streamU32(parts, value, wireEndian = 'be') {
  const item = Buffer.alloc(4);
  if (wireEndian === 'le') item.writeUInt32LE((value ?? 0) >>> 0, 0);
  else item.writeUInt32BE((value ?? 0) >>> 0, 0);
  parts.push(item);
}

function streamBytes(parts, value, length) {
  const item = Buffer.alloc(length);
  if (Buffer.isBuffer(value)) value.copy(item, 0, 0, Math.min(value.length, length));
  parts.push(item);
}

export function decodeNotifyInformationCharacterStream(payload, { wireEndian = 'be' } = {}) {
  if (!Buffer.isBuffer(payload)) return null;
  const out = Buffer.alloc(NOTIFY_INFORMATION_CHARACTER_BYTES);
  let off = 0;
  const need = (size) => off + size <= payload.length;
  const readU8 = () => {
    if (!need(1)) return null;
    const value = payload.readUInt8(off);
    off += 1;
    return value;
  };
  const readU16 = () => {
    if (!need(2)) return null;
    const value = wireEndian === 'le' ? payload.readUInt16LE(off) : payload.readUInt16BE(off);
    off += 2;
    return value;
  };
  const readU32 = () => {
    if (!need(4)) return null;
    const value = wireEndian === 'le' ? payload.readUInt32LE(off) : payload.readUInt32BE(off);
    off += 4;
    return value;
  };
  const putU8 = (at) => {
    const value = readU8();
    if (value == null) return false;
    out.writeUInt8(value, at);
    return true;
  };
  const putU16 = (at) => {
    const value = readU16();
    if (value == null) return false;
    out.writeUInt16LE(value, at);
    return true;
  };
  const putU32 = (at) => {
    const value = readU32();
    if (value == null) return false;
    out.writeUInt32LE(value, at);
    return true;
  };
  const putPstr16 = (lenAt, charsAt, max = 13) => {
    const count = readU8();
    if (count == null || count > max) return false;
    out.writeUInt8(count, lenAt);
    for (let i = 0; i < count; i += 1) {
      const value = readU16();
      if (value == null) return false;
      out.writeUInt16LE(value, charsAt + i * 2);
    }
    return true;
  };

  if (!putU8(0x00)) return null;
  if (!putU32(0x04)) return null;
  if (!putU8(0x08)) return null;
  if (!putU8(0x09)) return null;
  if (!putU8(0x0a)) return null;
  if (!putU8(0x0b)) return null;
  if (!putU32(0x0c)) return null;
  if (!putU8(0x10)) return null;
  if (!putU8(0x11)) return null;
  if (!putU32(0x14)) return null;
  if (!putU16(0x18)) return null;
  if (!putU32(0x1c)) return null;
  if (!putU32(0x20)) return null;
  if (!putU32(0x24)) return null;
  if (!putU32(0x28)) return null;
  if (!putPstr16(0x2c, 0x2e, 13)) return null;
  if (!putU32(0x48)) return null;
  if (!putU32(0x4c)) return null;
  if (!putU32(0x50)) return null;
  if (!putU32(0x54)) return null;
  if (!putU32(0x58)) return null;
  if (!putU32(0x5c)) return null;
  if (!putU16(0x60)) return null;
  if (!putU8(0x62)) return null;
  if (!putU8(0x63)) return null;
  if (!putU8(0x64)) return null;
  if (!putU8(0x65)) return null;
  if (!putU8(0x66)) return null;
  if (!putU8(0x67)) return null;
  if (!putU8(0x68)) return null;
  if (!putU32(0x6c)) return null;
  if (!need(0x10)) return null;
  payload.copy(out, 0x70, off, off + 0x10);
  off += 0x10;
  if (!putU8(0x80)) return null;
  const parentageCount = readU8();
  if (parentageCount == null || parentageCount > 2) return null;
  out.writeUInt8(parentageCount, 0x81);
  for (let i = 0; i < parentageCount; i += 1) {
    const base = 0x85 + i * 0x84;
    if (!putU8(base - 1)) return null;
    if (!putPstr16(base, base + 1, 13)) return null;
    if (!putPstr16(base + 0x1b, base + 0x1d, 13)) return null;
    if (!putPstr16(base + 0x37, base + 0x39, 13)) return null;
    if (!putU16(base + 0x53)) return null;
    if (!putU16(base + 0x55)) return null;
    if (!putPstr16(base + 0x57, base + 0x59, 13)) return null;
    if (!putU32(base + 0x73)) return null;
    if (!putU32(base + 0x77)) return null;
    if (!putU32(base + 0x7b)) return null;
    if (!putU32(base + 0x7f)) return null;
  }
  for (let i = 0; i < 8; i += 1) {
    if (!putU16(0x18c + i * 4)) return null;
    if (!putU16(0x18e + i * 4)) return null;
  }
  if (!putU8(0x1ac)) return null;
  if (!putU8(0x1ad)) return null;
  const specialCount = readU8();
  if (specialCount == null || specialCount > 0x50) return null;
  out.writeUInt8(specialCount, 0x1ae);
  for (let i = 0; i < specialCount; i += 1) {
    if (!putU16(0x1b0 + i * 2)) return null;
  }
  const seatCount = readU8();
  if (seatCount == null || seatCount > MAX_SEATS_PER_OUTFIT) return null;
  out.writeUInt8(seatCount, 0x250);
  for (let i = 0; i < seatCount; i += 1) {
    if (!putU16(0x254 + i * 8)) return null;
    if (!putU32(0x258 + i * 8)) return null;
  }
  if (!putU8(0x2d4)) return null;
  return { object: out, consumed: off, trailing: payload.length - off };
}

// Shared personnel command header: 4 dwords (time + 3 header/context dwords). spec §2.
const PERSONNEL_HEADER = 0x10;

/** Read a u32[] of `count` ids from `body` at `off` (stride 4); stops at buffer end. */
function readU32Array(body, off, count) {
  const out = [];
  for (let i = 0; i < count; i += 1) {
    const at = off + i * 4;
    if (at + 4 > body.length) {
      break;
    }
    out.push(body.readUInt32LE(at));
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------
// PARSERS (C->S). All bodies little-endian; inner = [u16 BE code][body], so parse body=inner.subarray(2).
// ---------------------------------------------------------------------------------------------------

/**
 * Parse CommandRankUp 0x704 (spec §2.1, parser FUN_0043c150, get_length 0x1a + count*4). Promote a
 * card by merit. Body: time@0x00, hdr1..3@0x04..0x0c, target_rank u8@0x10, achievement u32@0x14,
 * move_spot u32@0x18, move_character_size u8@0x1c, move_character[] u32 @0x20 stride 4. Null if short.
 */
export function parseInboundRankUp(inner) {
  const body = inner.subarray(2);
  if (body.length < 0x1d) {
    return null;
  }
  const targetRank = body.readUInt8(0x10);
  const achievement = body.readUInt32LE(0x14);
  const moveSpot = body.readUInt32LE(0x18);
  const moveCount = Math.min(body.readUInt8(0x1c), MAX_MOVE_CHARACTERS);
  const moveCharacters = readU32Array(body, 0x20, moveCount);
  return { time: body.readUInt32LE(0x00), targetRank, achievement, moveSpot, moveCharacters };
}

/**
 * Parse CommandSpeciallyRankUp 0x705 (spec §2.2, parser FUN_0043c710, get_length
 * 0x1b + downAch*8 + 5 + moveChar*4). Mass/special promotion funded by spending other chars'
 * achievement. Body: time@0x00, hdr1..3, target_character u32@0x10, target_goto_rank u8@0x14,
 * achievement u32@0x18, down_achievement_character_size u16@0x1c, down_achievement_character[]
 * {u32 character,u32 achievement} @0x20 stride 8, then move_spot u32, move_character_size u8,
 * move_character[] u32. Null if short.
 */
export function parseInboundSpeciallyRankUp(inner) {
  const body = inner.subarray(2);
  if (body.length < 0x1e) {
    return null;
  }
  const targetCharacter = body.readUInt32LE(0x10);
  const targetGotoRank = body.readUInt8(0x14);
  const achievement = body.readUInt32LE(0x18);
  const downCount = Math.min(body.readUInt16LE(0x1c), MAX_DOWN_ACHIEVEMENT);
  const downAchievement = [];
  let off = 0x20;
  for (let i = 0; i < downCount; i += 1) {
    if (off + 8 > body.length) {
      break;
    }
    downAchievement.push({ character: body.readUInt32LE(off), achievement: body.readUInt32LE(off + 4) });
    off += 8;
  }
  // trailing move_spot (u32) + move_character_size (u8) + move_character[] (u32), present iff body long enough.
  let moveSpot = 0;
  let moveCharacters = [];
  if (off + 5 <= body.length) {
    moveSpot = body.readUInt32LE(off);
    const moveCount = Math.min(body.readUInt8(off + 4), MAX_MOVE_CHARACTERS);
    moveCharacters = readU32Array(body, off + 5, moveCount);
  }
  return { time: body.readUInt32LE(0x00), targetCharacter, targetGotoRank, achievement, downAchievement, moveSpot, moveCharacters };
}

/**
 * Parse CommandRankDown 0x706 (spec §2.3, parser FUN_0043d080, get_length 0x1d + count*4). Demote a
 * card. Body: time@0x00, hdr1..3, target_rank u8@0x10, target_character u32@0x14,
 * exec_character_achievement u32@0x18, rankchanged_character_achievement u32@0x1c, move_spot u32@0x20,
 * move_character_size u8@0x24, move_character[] u32 @0x28 stride 4. Null if short.
 */
export function parseInboundRankDown(inner) {
  const body = inner.subarray(2);
  if (body.length < 0x25) {
    return null;
  }
  const targetRank = body.readUInt8(0x10);
  const targetCharacter = body.readUInt32LE(0x14);
  const execAchievement = body.readUInt32LE(0x18);
  const achievement = body.readUInt32LE(0x1c);
  const moveSpot = body.readUInt32LE(0x20);
  const moveCount = Math.min(body.readUInt8(0x24), MAX_MOVE_CHARACTERS);
  const moveCharacters = readU32Array(body, 0x28, moveCount);
  return { time: body.readUInt32LE(0x00), targetRank, targetCharacter, execAchievement, achievement, moveSpot, moveCharacters };
}

/**
 * Parse CommandCardAppointment 0x707 (spec §2.4, 40B fixed, apply FUN_004c5580 — highest playability).
 * Appoint a card to a seat. Body: time@0x00, hdr1..3@0x04..0x0c, target_outfit u32@0x10, hdr4 u32@0x14,
 * card_character u32@0x18, seat_role u32@0x1c, chief_spot u32@0x20, tail u32@0x24. Null if short.
 */
export function parseInboundCardAppointment(inner) {
  const body = inner.subarray(2);
  if (body.length < 0x24) {
    return null;
  }
  return {
    time: body.readUInt32LE(0x00),
    targetOutfit: body.readUInt32LE(0x10),
    cardCharacter: body.readUInt32LE(0x18),
    seatRole: body.readUInt32LE(0x1c),
    chiefSpot: body.readUInt32LE(0x20),
  };
}

/**
 * Parse CommandCardDismisal 0x708 (spec §2.5, parser FUN_0043da60, get_length 0x1d + count*4). Dismiss
 * a card from a seat. Body: time@0x00, hdr1..3, target_character u32@0x10, card u32@0x14, move_spot
 * u32@0x18, move_character_size u8@0x1c, move_character[] u32 @0x20 stride 4. Null if short.
 */
export function parseInboundCardDismisal(inner) {
  const body = inner.subarray(2);
  if (body.length < 0x1d) {
    return null;
  }
  const targetCharacter = body.readUInt32LE(0x10);
  const card = body.readUInt32LE(0x14);
  const moveSpot = body.readUInt32LE(0x18);
  const moveCount = Math.min(body.readUInt8(0x1c), MAX_MOVE_CHARACTERS);
  const moveCharacters = readU32Array(body, 0x20, moveCount);
  return { time: body.readUInt32LE(0x00), targetCharacter, card, moveSpot, moveCharacters };
}

/**
 * Parse CommandCardResignation 0x709 (spec §2.6, parser FUN_0043e020, get_length FUN_0043b820).
 * Voluntary resignation. Body: time@0x00, hdr1..3, card u32@0x10, move_spot u32@0x14,
 * move_character_size u8@0x18, move_character[] u32 @0x1c stride 4. Null if short.
 */
export function parseInboundCardResignation(inner) {
  const body = inner.subarray(2);
  if (body.length < 0x19) {
    return null;
  }
  const card = body.readUInt32LE(0x10);
  const moveSpot = body.readUInt32LE(0x14);
  const moveCount = Math.min(body.readUInt8(0x18), MAX_MOVE_CHARACTERS);
  const moveCharacters = readU32Array(body, 0x1c, moveCount);
  return { time: body.readUInt32LE(0x00), card, moveSpot, moveCharacters };
}

/**
 * Parse GrantTitle 0x070c (叙爵 — 작위 수여). [PROVENANCE: opcode P3 (borrowed, not RE-reversed); body
 * SHAPE reuses the personnel header convention — header dwords @0x00..0x0c, then the grant fields].
 * Body: time@0x00, hdr1..3@0x04..0x0c, new_title u8@0x10 (ladder 1=공작 .. 7=평민), target_character
 * u32@0x14. Mirrors parseInboundRankUp's first two fields by offset so a future RE pin is a 1-line swap.
 * Returns null if short.
 */
export function parseInboundGrantTitle(inner) {
  const body = inner.subarray(2);
  if (body.length < 0x18) {
    return null;
  }
  return {
    time: body.readUInt32LE(0x00),
    newTitle: body.readUInt8(0x10),
    targetCharacter: body.readUInt32LE(0x14),
  };
}

/**
 * Parse GrantFief 0x070d (封土授与 — 봉토 수여) / RevokeFief 0x070e (封土直轄 — 직할 환수). [PROVENANCE:
 * opcode P3 (borrowed); body SHAPE = personnel header convention]. Body: time@0x00, hdr1..3@0x04..0x0c,
 * target_character u32@0x10 (the lord), base_id u32@0x14 (planet/fortress fief). Same layout for grant
 * and revoke (revoke clears base ownership). Returns null if short.
 */
export function parseInboundGrantFief(inner) {
  const body = inner.subarray(2);
  if (body.length < 0x18) {
    return null;
  }
  return {
    time: body.readUInt32LE(0x00),
    targetCharacter: body.readUInt32LE(0x10),
    baseId: body.readUInt32LE(0x14),
  };
}

// ---------------------------------------------------------------------------------------------------
// BUILDERS (S->C). 0x70a/0x70b are bare [u16 BE code][LE body] receive records (the dispatch copies
// raw dwords); 0x356/0x358 are message32-wrapped objects (like the lobby/conn3 replies). Per spec §2.7,
// §2.8, §4.1, §4.2.
// ---------------------------------------------------------------------------------------------------

/**
 * Build NotifyCardLoss 0x70a (spec §2.7, 12B, apply FUN_004c0670). Removes a card from the seat array
 * `unit+0x274` of every unit whose owner == `owner`. Body: hdr/time u32@0x00, owner u32@0x04, silent
 * u8@0x08 (0 = play UI sound), card_id u16@0x0a. Receive form = bare [u16 BE code][LE 12B body].
 */
export function buildNotifyCardLossInner({ owner = 0, cardId = 0, silent = false, time = 0 } = {}) {
  const inner = Buffer.alloc(2 + NOTIFY_CARD_LOSS_BYTES);
  inner.writeUInt16BE(NOTIFY_CARD_LOSS_CODE & 0xffff, 0);
  const body = inner.subarray(2);
  body.writeUInt32LE(time >>> 0, 0x00);
  body.writeUInt32LE(owner >>> 0, 0x04);
  body.writeUInt8(silent ? 1 : 0, 0x08);
  body.writeUInt16LE(cardId & 0xffff, 0x0a);
  return inner;
}

/**
 * Build the 0x707 CardAppointment wire body. Live G006 C002 QA showed that post-load S->C injection
 * of this body can be visible in server trace without reaching the native dispatcher/apply path, so
 * callers must not treat this builder alone as proof of client-side appointment application.
 */
export function buildCardAppointmentInner({
  time = 0,
  actor = 0,
  header2 = 0,
  header3 = 0,
  targetOutfit = 0,
  header4 = 0,
  cardCharacter = 0,
  seatRole = 0,
  chiefSpot = 0,
  tail = 0,
} = {}) {
  const body = Buffer.alloc(COMMAND_CARD_APPOINTMENT_BYTES);
  body.writeUInt32LE(time >>> 0, 0x00);
  body.writeUInt32LE(actor >>> 0, 0x04);
  body.writeUInt32LE(header2 >>> 0, 0x08);
  body.writeUInt32LE(header3 >>> 0, 0x0c);
  body.writeUInt32LE(targetOutfit >>> 0, 0x10);
  body.writeUInt32LE(header4 >>> 0, 0x14);
  body.writeUInt32LE(cardCharacter >>> 0, 0x18);
  body.writeUInt32LE(seatRole >>> 0, 0x1c);
  body.writeUInt32LE(chiefSpot >>> 0, 0x20);
  body.writeUInt32LE(tail >>> 0, 0x24);
  return buildMpsClientMessage32Inner({ code: COMMAND_CARD_APPOINTMENT_CODE, payload: body });
}

/**
 * Build NotifyCardLossMovedSpot 0x70b (spec §2.8, 16B, apply FUN_004c0790). Updates the matched unit's
 * position pair (unit+0x40/+0x44) — the card's seat relocated. Body: hdr/time u32@0x00, owner u32@0x04,
 * spot_x_or_a u32@0x08, spot_y_or_b u32@0x0c. Receive form = bare [u16 BE code][LE 16B body].
 */
export function buildNotifyCardLossMovedSpotInner({ owner = 0, spotX = 0, spotY = 0, time = 0 } = {}) {
  const inner = Buffer.alloc(2 + NOTIFY_CARD_LOSS_MOVED_SPOT_BYTES);
  inner.writeUInt16BE(NOTIFY_CARD_LOSS_MOVED_SPOT_CODE & 0xffff, 0);
  const body = inner.subarray(2);
  body.writeUInt32LE(time >>> 0, 0x00);
  body.writeUInt32LE(owner >>> 0, 0x04);
  body.writeUInt32LE(spotX >>> 0, 0x08);
  body.writeUInt32LE(spotY >>> 0, 0x0c);
  return inner;
}

/**
 * Build NotifyChangeFlagShip 0x358 (spec §4.2, 92B, recv copies 0x17 dwords to &DAT_004332d0, apply
 * FUN_005266e0). Despite the name this carries the outfit's live combat/logistics state. Wire order
 * (printer FUN_0042f930): character u32@0x00, hdr1 u32@0x04, kind u16@0x08, mode u8@0x0a, grid u32@0x0c,
 * outfit u32@0x10, boarding_ship u32@0x14, troop_units u8@0x18, then base/morale/rebellion/damaged/
 * destroyed/supplies/mobilization/cruising. The trailing field byte offsets after troop_units depend on
 * the in-memory troop array stride (spec open-question §6, confidence medium); we pack them contiguously
 * from 0x1c in the printed order so the high-confidence head (char..boarding_ship..troop_units) is exact.
 * message32-wrapped (S->C conn3 record).
 */
export function buildNotifyChangeFlagShipInner({
  character = 0, kind = 0, mode = 0, grid = 0, outfit = 0, boardingShip = 0, troopUnits = 0,
  base = 0, moraleMax = 0, rebellion = 0, damaged = 0, destroyed = 0, supplies = 0, mobilization = 0,
  cruising = 0,
} = {}) {
  const body = Buffer.alloc(NOTIFY_CHANGE_FLAGSHIP_BYTES);
  body.writeUInt32LE(character >>> 0, 0x00);
  body.writeUInt16LE(kind & 0xffff, 0x08);
  body.writeUInt8(mode & 0xff, 0x0a);
  body.writeUInt32LE(grid >>> 0, 0x0c);
  body.writeUInt32LE(outfit >>> 0, 0x10);
  body.writeUInt32LE(boardingShip >>> 0, 0x14);
  body.writeUInt8(troopUnits & 0xff, 0x18);
  // trailing logistics block (contiguous after troop_units; confidence-medium byte offsets per spec §6).
  body.writeUInt32LE(base >>> 0, 0x1c);
  body.writeUInt8(moraleMax & 0xff, 0x20);
  body.writeUInt8(rebellion & 0xff, 0x21);
  body.writeUInt16LE(damaged & 0xffff, 0x22);
  body.writeUInt16LE(destroyed & 0xffff, 0x24);
  body.writeUInt32LE(supplies >>> 0, 0x28);
  body.writeUInt32LE(mobilization >>> 0, 0x2c);
  body.writeFloatLE(cruising, 0x30);
  return buildMpsClientMessage32Inner({ code: NOTIFY_CHANGE_FLAGSHIP_CODE, payload: body });
}

/**
 * Build NotifyInformationCharacter 0x356 as the compact stream consumed by FUN_0042c7e0. The client
 * expands this stream into a 728-byte in-memory object before FUN_004b8850 enqueues it for
 * FUN_004ba2b0/FUN_004c0400. Sending the expanded object directly shifts every variable-length field.
 */
export function buildNotifyInformationCharacterInner({
  characterId = 1, gridUnitId = 0, power = null, spot = null, spotOwner = null, abilities = null,
  online = false, camp = null, state = null, fame = null, pcp = null, mcp = null, money = null,
  influence = null, stamina = null, blood = null, lastname = null, firstname = null, displayName = null, rank = null, title = null, face = null,
  seatEntries = null, coupConduct = null, spotResolverBase = null, wireEndian = 'be',
} = {}) {
  const parts = [];
  const nativeDisplayName = displayName ?? (lastname != null && firstname != null ? `${lastname} ${firstname}` : lastname ?? firstname);
  const trayNameCodes = characterCodes(nativeDisplayName ?? '', 13);
  const resolvedSpotOwner = Number.isInteger(spotOwner) ? spotOwner : gridUnitId;

  streamU8(parts, 1); // type/valid flag @0x00
  streamU32(parts, characterId, wireEndian); // id @0x04
  streamU8(parts, Number.isInteger(power) ? power : 0);
  streamU8(parts, Number.isInteger(camp) ? camp : 0);
  streamU8(parts, Number.isInteger(state) ? state : 0);
  streamU8(parts, 0); // reserved @0x0b
  streamU32(parts, Number.isInteger(spot) ? spot : 0, wireEndian);
  streamU8(parts, 0); // birthday_month
  streamU8(parts, 0); // birthday_day
  streamU32(parts, Number.isInteger(fame) ? fame : 0, wireEndian);
  streamU16(parts, 0, wireEndian); // max_of_special
  streamU32(parts, Number.isInteger(spot) ? spot : 0, wireEndian); // return_base
  streamU32(parts, Number.isInteger(spot) ? spot : 0, wireEndian);
  streamU32(parts, Number.isInteger(resolvedSpotOwner) ? resolvedSpotOwner : 0, wireEndian);
  streamU32(parts, gridUnitId, wireEndian);
  streamU8(parts, trayNameCodes.length);
  writeUtf16CodeStream(parts, trayNameCodes, wireEndian);

  streamU32(parts, 0, wireEndian); // strategy
  // coup_conduct(叛意 모의 표시): 기존엔 0 하드코딩 → intel.createIntelState 누적값을 옵셔널로 시드(AU-3,
  // opcode-wiring B-2). 미지정(null)이면 0 그대로라 기본 동작 불변. 스트림 위치=strategy 다음(parser→0x4c).
  streamU32(parts, Number.isInteger(coupConduct) ? coupConduct : 0, wireEndian); // coup_conduct
  streamU32(parts, Number.isInteger(pcp) ? pcp : 0, wireEndian);
  streamU32(parts, Number.isInteger(mcp) ? mcp : 0, wireEndian);
  streamU32(parts, 0, wireEndian);
  streamU32(parts, 0, wireEndian); // evaluation
  streamU16(parts, 0, wireEndian); // sendmail
  streamU8(parts, 0); // ai_operation
  streamU8(parts, 0); // ai_strategy
  streamU8(parts, 0); // ai_commanded
  streamU8(parts, 0); // ai_suggested
  streamU8(parts, 0); // ai_announcement
  streamU8(parts, 0); // ai_tactics
  streamU8(parts, online ? 1 : 0);
  streamU32(parts, Number.isInteger(money) ? money : 0, wireEndian);
  streamBytes(parts, null, 0x10); // decoration bitset
  streamU8(parts, 0); // arrested

  const resolvedDisplayName = nativeDisplayName;
  const hasTitle = title != null && String(title).length > 0;
  const hasParentage = lastname != null || firstname != null || resolvedDisplayName != null
    || Number.isInteger(rank) || hasTitle || Number.isInteger(face);
  streamU8(parts, hasParentage ? 1 : 0);
  if (hasParentage) {
    streamU8(parts, 1); // truth
    writePstr16Stream(parts, lastname ?? '', 13, wireEndian);
    writePstr16Stream(parts, firstname ?? '', 13, wireEndian);
    writePstr16Stream(parts, resolvedDisplayName ?? '', 13, wireEndian);
    streamU16(parts, Number.isInteger(blood) ? blood : 0, wireEndian);
    streamU16(parts, Number.isInteger(rank) ? rank : 0, wireEndian);
    // titlename (작위명): the peerage ladder name (logh7-imperial-titles.mjs). Previously hardcoded ''
    // so a promotion/title-change 0x356 delta never refreshed the HUD title; now it follows `title`.
    writePstr16Stream(parts, hasTitle ? String(title) : '', 13, wireEndian); // title
    streamU32(parts, Number.isInteger(face) ? face : 0, wireEndian);
    streamU32(parts, 0, wireEndian); // rival
    // Expands to native source +0x100 and is copied to PLAYER_INFO +0x120. FUN_004c9170 uses this value
    // with institution kind 0x10 to resolve the current spot without clearing the flagship/gridUnit link.
    streamU32(parts, Number.isInteger(spotResolverBase) ? spotResolverBase : 0, wireEndian); // myhome / spot resolver base
    streamU32(parts, 0, wireEndian); // achievement
  }

  for (let i = 0; i < 8; i += 1) {
    streamU16(parts, Array.isArray(abilities) ? abilities[i] ?? 0 : 0, wireEndian);
    streamU16(parts, 0, wireEndian);
  }
  streamU8(parts, Number.isInteger(influence) ? influence : 0);
  streamU8(parts, Number.isInteger(stamina) ? stamina : 0);
  streamU8(parts, 0); // special_ability count
  const seats = Array.isArray(seatEntries) ? seatEntries.slice(0, MAX_SEATS_PER_OUTFIT) : [];
  streamU8(parts, seats.length);
  for (const entry of seats) {
    const character = Number(entry?.character ?? entry?.characterId ?? entry?.cardId ?? entry?.id ?? 0);
    const role = Number(entry?.role ?? entry?.seatRole ?? 0);
    streamU16(parts, Number.isInteger(character) ? character : 0, wireEndian);
    streamU32(parts, Number.isInteger(role) ? role : 0, wireEndian);
  }
  streamU8(parts, 0);
  return buildMpsClientMessage32Inner({ code: NOTIFY_INFORMATION_CHARACTER_CODE, payload: Buffer.concat(parts) });
}

// 프레이밍 헬퍼 passthrough re-export — 호출자가 일반 lobby 레코드를 만들 수 있게(기존 표면 보존).
export { buildLobbyResponseInner };
