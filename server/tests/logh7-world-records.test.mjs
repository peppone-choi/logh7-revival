import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  CODE_INFO_CHARACTER,
  CODE_INFO_CHARACTER_BYTES,
  CODE_INFO_UNIT,
  CODE_INFO_UNIT_BYTES,
  CODE_NOTIFY_MOVED_GRID,
  CODE_NOTIFY_MOVED_GRID_BYTES,
  CODE_SS_CHARACTER_ID,
  CODE_SS_LOGIN_OK,
  CODE_SS_GAME_LOGIN_OK,
  CODE_TX_SIMPLE_DATA_BEGIN,
  CODE_TX_SIMPLE_DATA_END,
  CODE_NOTIFY_SIMPLE_CHAR_ENTRY,
  CODE_NOTIFY_SIMPLE_CHAR_ENTRY_BYTES,
  CODE_CMD_GRID_CHAT,
  CODE_CMD_GRID_CHAT_BYTES,
  CODE_LOBBY_SESSION_LOGIN_OK,
  buildInformationCharacterInner,
  buildInformationUnitInner,
  buildSsCharacterIdInner,
  buildSsLoginOkInner,
  buildSsGameLoginOkInner,
  buildCharacterRosterTransaction,
  buildNotifyMovedGridInner,
  buildGridChatInner,
  buildWorldEntryInners,
  buildLobbySessionLoginOkRaw,
  buildAdmissionResponseInner,
  isAdmissionRequestCode,
  buildEmptyWalkerInner,
  STATIC_INFO_BODY_SIZES,
  decodeMoveGridCommand,
  decodeGridChatCommand,
  decodeLobbySessionLoginReq,
  listWorldEntryCodes,
  readMsg32Code,
  msg32Body,
} from '../src/server/logh7-world-records.mjs';

test('0x0323 character record is message32 with 724B body and id/flagship anchors', () => {
  const inner = buildInformationCharacterInner({
    characterId: 7,
    gridUnitId: 42,
    lastname: 'Reinhard',
    firstname: 'Lohengramm',
    face: 1,
  });
  assert.equal(readMsg32Code(inner), CODE_INFO_CHARACTER);
  const body = msg32Body(inner);
  assert.equal(body.length, CODE_INFO_CHARACTER_BYTES);
  assert.equal(body.readUInt32LE(0x00), 7);
  assert.equal(body.readUInt32LE(0x24), 42);
  assert.equal(body.readUInt8(0x7d), 1); // parentage_len
});

test('0x0325 unit record is fixed 52804B with count and unit id', () => {
  const inner = buildInformationUnitInner({ unitId: 5, unitCount: 1, cell: 2588 });
  assert.equal(readMsg32Code(inner), CODE_INFO_UNIT);
  const body = msg32Body(inner);
  assert.equal(body.length, CODE_INFO_UNIT_BYTES);
  assert.equal(body.readUInt16LE(0), 1);
  assert.equal(body.readUInt32LE(4), 5);
});

test('0x0b07 NotifyMovedGrid is 580B with unit@0x14 LE', () => {
  const inner = buildNotifyMovedGridInner({ units: [{ unitId: 1, cell: 2597 }] });
  assert.equal(readMsg32Code(inner), CODE_NOTIFY_MOVED_GRID);
  const body = msg32Body(inner);
  assert.equal(body.length, CODE_NOTIFY_MOVED_GRID_BYTES);
  assert.equal(body.readUInt8(0x12), 1);
  assert.equal(body.readUInt32LE(0x14), 1);
  assert.equal(body.readUInt32LE(0x18), 2597);
});

test('0x0f1c grid chat round-trips text via shipped builders/parsers', () => {
  const built = buildGridChatInner({ text: 'hello', channel: 1, time: 123 });
  assert.equal(readMsg32Code(built), CODE_CMD_GRID_CHAT);
  assert.equal(msg32Body(built).length, CODE_CMD_GRID_CHAT_BYTES);
  const decoded = decodeGridChatCommand(built);
  assert.equal(decoded.text, 'hello');
  assert.equal(decoded.channel, 1);
});

test('world entry emits required codes with proven sizes', () => {
  const emits = buildWorldEntryInners({ characterId: 3, gridUnitId: 9 });
  const codes = listWorldEntryCodes(emits);
  // 0x0204, 0x0323, 0x0325, 0x0301, 0x0f01, 0x0f03, 0x0315, 0x0206
  assert.ok(codes.includes(CODE_SS_CHARACTER_ID));
  assert.ok(codes.includes(CODE_INFO_CHARACTER));
  assert.ok(codes.includes(CODE_INFO_UNIT));
  assert.ok(codes.includes(CODE_SS_GAME_LOGIN_OK));
  assert.ok(codes.includes(0x0301));
  assert.ok(codes.includes(0x0f01));
  assert.ok(codes.includes(0x0f03));
  assert.ok(codes.includes(0x0315));
  // 코드로 조회 (0x0206 이 선두라 위치 고정 금지)
  const charRec = emits.find((i) => listWorldEntryCodes([i])[0] === CODE_INFO_CHARACTER);
  const unitRec = emits.find((i) => listWorldEntryCodes([i])[0] === CODE_INFO_UNIT);
  assert.equal(msg32Body(charRec).length, 0x2d4);
  assert.equal(msg32Body(unitRec).length, 0xce44);
  const grid = emits.find((i) => listWorldEntryCodes([i])[0] === 0x0315);
  assert.equal(msg32Body(grid).length, 0x138c);
  assert.equal(msg32Body(emits.find((i) => listWorldEntryCodes([i])[0] === 0x0f01))[0], 1);
});

test('0x0201 SSLoginOK is message32 with status byte', () => {
  const inner = buildSsLoginOkInner({ status: 0 });
  assert.equal(readMsg32Code(inner), CODE_SS_LOGIN_OK);
  assert.equal(msg32Body(inner).length, 1);
  assert.equal(msg32Body(inner)[0], 0);
});

test('character roster transaction 0x1200/0x120f/0x1201 gate fields', () => {
  const frames = buildCharacterRosterTransaction({ characters: [] });
  assert.equal(frames.length, 3);
  assert.equal(readMsg32Code(frames[0]), CODE_TX_SIMPLE_DATA_BEGIN);
  assert.equal(msg32Body(frames[0]).length, 0x24);
  assert.equal(readMsg32Code(frames[1]), CODE_NOTIFY_SIMPLE_CHAR_ENTRY);
  assert.equal(msg32Body(frames[1]).length, CODE_NOTIFY_SIMPLE_CHAR_ENTRY_BYTES);
  // empty account: group=2 and group=3 gate records
  assert.equal(msg32Body(frames[1])[0], 2);
  assert.equal(msg32Body(frames[1])[4], 2); // GROUP @ record0+0
  assert.equal(msg32Body(frames[1]).readUInt32LE(8), 0); // THRESHOLD @ record0+4
  assert.equal(msg32Body(frames[1])[4 + 0x128], 3); // GROUP record1
  assert.equal(readMsg32Code(frames[2]), CODE_TX_SIMPLE_DATA_END);
  assert.equal(msg32Body(frames[2]).length, 1);

  const withChar = buildCharacterRosterTransaction({
    characters: [{ id: 7, name: 'Test' }],
  });
  assert.equal(msg32Body(withChar[1])[0], 1);
  assert.equal(msg32Body(withChar[1]).readUInt32LE(12), 7); // id @ record+8
});

test('0x2009/0x200a session login codec', () => {
  const req = Buffer.alloc(10);
  req.writeUInt16BE(0x2009, 0);
  req.writeUInt32LE(2, 2);
  req.writeUInt32LE(15, 6);
  const decoded = decodeLobbySessionLoginReq(req);
  assert.equal(decoded.sessionId, 2);
  assert.equal(decoded.characterId, 15);
  const ok = buildLobbySessionLoginOkRaw({ ip: '127.0.0.1', port: 47900, token: 9 });
  assert.equal(ok.readUInt16BE(0), CODE_LOBBY_SESSION_LOGIN_OK);
  assert.equal(ok.readUInt16BE(6), 47900);
  assert.equal(ok.readUInt32BE(10), 9);

  // create 경로 라이브 실측: innerLen=4 → session only, characterId=0
  const short = Buffer.alloc(4);
  short.writeUInt16BE(0x2009, 0);
  short.writeUInt16LE(1, 2);
  const dShort = decodeLobbySessionLoginReq(short);
  assert.equal(dShort.sessionId, 1);
  assert.equal(dShort.characterId, 0);

  // 6B: session u32 only
  const mid = Buffer.alloc(6);
  mid.writeUInt16BE(0x2009, 0);
  mid.writeUInt32LE(2, 2);
  const dMid = decodeLobbySessionLoginReq(mid);
  assert.equal(dMid.sessionId, 2);
  assert.equal(dMid.characterId, 0);
});

test('0x0b01 move command decode reads unitId and cell', () => {
  const inner = Buffer.alloc(10);
  inner.writeUInt16BE(0x0b01, 0);
  inner.writeUInt32LE(11, 2);
  inner.writeUInt32LE(3001, 6);
  const cmd = decodeMoveGridCommand(inner);
  assert.equal(cmd.unitId, 11);
  assert.equal(cmd.cell, 3001);
});

// ─── static-info 어드미션: 풀사이즈 0채움 body (over-read 크래시 수정) ──────────
//
// 클라 사이저 FUN_004b8b00: static-info 응답은 opcode별 고정크기 프레이밍.
// 빈 body 로 응답하면 클라가 recv 버퍼 앞으로 over-read → access violation.
// 각 응답 opcode 의 body 는 반드시 표 크기 그대로여야 한다 (RE 확정).

test('STATIC_INFO_BODY_SIZES matches client sizer FUN_004b8b00 (RE 확정)', () => {
  assert.equal(STATIC_INFO_BODY_SIZES[0x0305], 0x520a);
  assert.equal(STATIC_INFO_BODY_SIZES[0x0307], 0xe5b2);
  assert.equal(STATIC_INFO_BODY_SIZES[0x0309], 0x055c);
  assert.equal(STATIC_INFO_BODY_SIZES[0x030b], 0x6d64);
  assert.equal(STATIC_INFO_BODY_SIZES[0x030d], 0x0184);
  assert.equal(STATIC_INFO_BODY_SIZES[0x030f], 0x0034);
  assert.equal(STATIC_INFO_BODY_SIZES[0x0311], 0x01b0);
  assert.equal(STATIC_INFO_BODY_SIZES[0x0313], 0x138c);
  assert.equal(STATIC_INFO_BODY_SIZES[0x0315], 0x138c);
  assert.equal(STATIC_INFO_BODY_SIZES[0x031d], 0x520c);
});

test('buildEmptyWalkerInner emits full-size zero-filled body for static-info opcodes', () => {
  for (const [opStr, size] of Object.entries(STATIC_INFO_BODY_SIZES)) {
    const op = Number(opStr);
    // 전용 빌더가 있는 0x0313/0x0315 는 별도 검증 (여기선 walker 경로만)
    if (op === 0x0313 || op === 0x0315) continue;
    const inner = buildEmptyWalkerInner(op);
    assert.equal(readMsg32Code(inner), op);
    const body = msg32Body(inner);
    assert.equal(body.length, size, `0x${op.toString(16)} body size`);
    assert.equal(inner.length, 6 + size, `0x${op.toString(16)} inner total`);
    // 전부 0 (빈 테이블, 콘텐츠 미승격)
    assert.ok(body.every((b) => b === 0), `0x${op.toString(16)} zero-filled`);
  }
});

test('buildEmptyWalkerInner keeps empty body for pure-ack codes not in size table', () => {
  const inner = buildEmptyWalkerInner(0x7abc);
  assert.equal(readMsg32Code(inner), 0x7abc);
  assert.equal(msg32Body(inner).length, 0);
});

test('buildAdmissionResponseInner: each admission request → full-size static-info response', () => {
  const cases = [
    { req: 0x0304, resp: 0x0305, size: 0x520a, allZero: true },
    { req: 0x0306, resp: 0x0307, size: 0xe5b2, allZero: true },
    { req: 0x0308, resp: 0x0309, size: 0x055c, allZero: true }, // 신규(정지 원인)
    { req: 0x030a, resp: 0x030b, size: 0x6d64, allZero: true },
    { req: 0x030c, resp: 0x030d, size: 0x0184, allZero: true }, // 신규
    { req: 0x030e, resp: 0x030f, size: 0x0034, allZero: true },
    { req: 0x0310, resp: 0x0311, size: 0x01b0, allZero: true },
    { req: 0x031c, resp: 0x031d, size: 0x520c, allZero: true },
    // 전용 빌더: 고정 크기 동일, body 는 헤더 포함이라 all-zero 아님
    { req: 0x0312, resp: 0x0313, size: 0x138c, allZero: false },
    { req: 0x0314, resp: 0x0315, size: 0x138c, allZero: false },
  ];
  for (const { req, resp, size, allZero } of cases) {
    const inner = buildAdmissionResponseInner(req);
    assert.ok(inner, `0x${req.toString(16)} must route (not null)`);
    assert.equal(readMsg32Code(inner), resp, `0x${req.toString(16)} → 0x${resp.toString(16)}`);
    const body = msg32Body(inner);
    assert.equal(body.length, size, `0x${resp.toString(16)} body size`);
    assert.equal(inner.length, 6 + size, `0x${resp.toString(16)} inner total = 6 + N`);
    if (allZero) {
      assert.ok(body.every((b) => b === 0), `0x${resp.toString(16)} zero-filled empty table`);
    }
  }
  // 0x0313 grid-type: payload[0]=count=0 (empty)
  assert.equal(msg32Body(buildAdmissionResponseInner(0x0312)).readUInt8(0), 0);
  // 미확인 코드는 여전히 null
  assert.equal(buildAdmissionResponseInner(0x7abc), null);
});

test('isAdmissionRequestCode covers every static-info req (incl. 신규 0x0308/0x030c), rejects non-admission', () => {
  const reqCodes = [
    0x0304, 0x0306, 0x0308, 0x030a, 0x030c, 0x030e, 0x0310, 0x0312, 0x0314, 0x031c,
  ];
  for (const req of reqCodes) {
    assert.equal(isAdmissionRequestCode(req), true, `0x${req.toString(16)} must be admission req`);
  }
  // 신규 정지 원인 코드가 lobby 로 새지 않도록 명시 검증
  assert.equal(isAdmissionRequestCode(0x0308), true);
  assert.equal(isAdmissionRequestCode(0x030c), true);
  // 응답(홀수) opcode 나 무관 코드는 어드미션 요청이 아님
  assert.equal(isAdmissionRequestCode(0x0309), false);
  assert.equal(isAdmissionRequestCode(0x030d), false);
  assert.equal(isAdmissionRequestCode(0x2009), false);
  assert.equal(isAdmissionRequestCode(0x7abc), false);
});
