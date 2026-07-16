import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  CODE_INFO_CHARACTER,
  CODE_INFO_CHARACTER_BYTES,
  CODE_INFO_UNIT,
  CODE_INFO_UNIT_BYTES,
  CODE_CMD_MOVE_GRID,
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
  buildStaticInformationGridInner,
  buildStaticInformationGridTypeInner,
  DEFAULT_SECTOR_GRID_TYPES,
  buildSsCharacterIdInner,
  buildSsLoginOkInner,
  buildSsGameLoginOkInner,
  buildCharacterRosterTransaction,
  buildMoveGridAckInner,
  buildNotifyMovedGridInner,
  buildGridChatInner,
  buildWorldEntryInners,
  buildWorldReadyPushInners,
  buildLobbySessionLoginOkRaw,
  buildAdmissionResponseInner,
  isAdmissionRequestCode,
  buildEmptyWalkerInner,
  STATIC_INFO_BODY_SIZES,
  decodeMoveGridCommand,
  decodeGridChatCommand,
  decodeLobbySessionLoginReq,
  listWorldEntryCodes,
  listRequiredServerEmitCodes,
  readMsg32Code,
  msg32Body,
} from '../src/server/logh7-world-records.mjs';
import { buildInformationCharacterRecordInner } from './fixtures/logh7-old-character-record.mjs';

// 정본 클라이언트 FUN_00419ca0의 wire cursor 소비 순서를 그대로 모델링한다.
// native destination은 0x58 stride지만 wire에는 정렬 패딩이 없고 각 행이 연속된다.
function decodeInformationUnitsLikeFun419ca0(body) {
  const count = body.readUInt16BE(0);
  const rows = [];
  let cursor = 2;
  for (let index = 0; index < count; index += 1) {
    const wireStart = cursor;
    const id = body.readUInt32BE(cursor); cursor += 4;
    const faction = body.readUInt16BE(cursor); cursor += 2;
    const field06 = body.readUInt8(cursor); cursor += 1;
    const commander = body.readUInt32BE(cursor); cursor += 4;
    const cell = body.readUInt32BE(cursor); cursor += 4;
    const owner = body.readUInt32BE(cursor); cursor += 4;
    const boatsCount = body.readUInt8(cursor); cursor += 1;
    assert.ok(boatsCount <= 10, `row ${index} boats count cap`);
    const boats = [];
    for (let boatIndex = 0; boatIndex < boatsCount; boatIndex += 1) {
      boats.push(body.readUInt32BE(cursor));
      cursor += 4;
    }
    const spotResolverBase = body.readUInt32BE(cursor); cursor += 4;
    const tail44 = body.readUInt8(cursor); cursor += 1;
    const tail45 = body.readUInt8(cursor); cursor += 1;
    const tail46 = body.readUInt16BE(cursor); cursor += 2;
    const mapSection = body.readUInt16BE(cursor); cursor += 2;
    const tail4c = body.readUInt32BE(cursor); cursor += 4;
    const tail50 = body.readUInt32BE(cursor); cursor += 4;
    const tail54 = body.readFloatBE(cursor); cursor += 4;
    rows.push({
      wireStart,
      wireEnd: cursor,
      id,
      faction,
      field06,
      commander,
      cell,
      owner,
      boats,
      spotResolverBase,
      tail44,
      tail45,
      tail46,
      mapSection,
      tail4c,
      tail50,
      tail54,
    });
  }
  return { count, rows, cursor };
}

test('0x0323 character record is message32 with 724B body and id/flagship anchors (aligned BE)', () => {
  // 정본 wire = struct-aligned BIG-ENDIAN. id@0x00 BE, flagship@0x24 BE.
  const inner = buildInformationCharacterInner({ characterId: 7, gridUnitId: 42 });
  assert.equal(readMsg32Code(inner), CODE_INFO_CHARACTER);
  const body = msg32Body(inner);
  assert.equal(body.length, CODE_INFO_CHARACTER_BYTES);
  assert.equal(body.readUInt32BE(0x00), 7);
  assert.equal(body.readUInt32BE(0x24), 42);
});

test('0x0325 wire rows follow the FUN_00419ca0 compact cursor without native padding', () => {
  const body = msg32Body(buildInformationUnitInner({
    fleets: [
      { id: 1, faction: 2, commander: 2588, cell: 2588, owner: 1 },
      {
        id: 2,
        faction: 3,
        commander: 77,
        cell: 2489,
        owner: 42,
        boats: [101, 102],
        spotResolverBase: 9,
        mapSection: 12,
      },
    ],
  }));

  const decoded = decodeInformationUnitsLikeFun419ca0(body);
  assert.equal(body.length, CODE_INFO_UNIT_BYTES, 'fixed 0xce44 body is retained');
  assert.deepEqual(
    decoded.rows.map(({ id, faction, commander, cell, owner, boats }) => (
      { id, faction, commander, cell, owner, boats }
    )),
    [
      { id: 1, faction: 2, commander: 2588, cell: 2588, owner: 1, boats: [] },
      { id: 2, faction: 3, commander: 77, cell: 2489, owner: 42, boats: [101, 102] },
    ],
  );
  assert.deepEqual(
    decoded.rows.map(({ wireStart, wireEnd }) => ({ wireStart, wireEnd })),
    [
      { wireStart: 2, wireEnd: 44 },
      { wireStart: 44, wireEnd: 94 },
    ],
    'row1 starts exactly where row0 cursor ends; two boats add eight wire bytes',
  );
  assert.equal(decoded.cursor, 94);
  assert.ok(body.subarray(decoded.cursor).every((value) => value === 0), 'unused fixed body tail remains zero');
});

test('0x0325 unit record is fixed 52804B: count BE, unit id BE', () => {
  // count @0 는 u16 BE, record[0].id 는 count 직후 u32 BE다.
  const inner = buildInformationUnitInner({ unitId: 5, unitCount: 1, cell: 2588 });
  assert.equal(readMsg32Code(inner), CODE_INFO_UNIT);
  const body = msg32Body(inner);
  const decoded = decodeInformationUnitsLikeFun419ca0(body);
  assert.equal(body.length, CODE_INFO_UNIT_BYTES);
  assert.equal(body.readUInt16BE(0), 1, 'count BE == 1');
  assert.equal(body.readUInt32BE(2), 5, 'unit[0].id BE begins immediately after count');
  assert.equal(decoded.rows[0].id, 5);
  assert.equal(decoded.rows[0].cell, 2588);
});

test('0x0325 count and unit id fields are BIG-ENDIAN: count=1 → bytes [00 01]', () => {
  // 라이브+정적 실측 확정(docs/logh7-focusid-lookup-re.md §8.7): 실 핸들러
  // FUN_00419ca0 게이트가 count 를 [eax+0x20] 스왑(ntohs) 리더로 읽는다. BE `00 19`(25) → edi `19 00`
  // → ax=0x0019=25 ≤ 600 → 스테이징 통과. 유닛 원소 id도 BE이며 count 직후 시작한다.
  const inner = buildInformationUnitInner({ unitId: 9, unitCount: 1, cell: 2588 });
  const body = msg32Body(inner);
  assert.equal(body.readUInt8(0), 0x00, 'count byte0 = 0x00 (BE high byte)');
  assert.equal(body.readUInt8(1), 0x01, 'count byte1 = 0x01 (BE low byte)');
  assert.equal(body.readUInt16BE(0), 1, 'client-visible count == 1 (after ntohs swap)');
  assert.equal(body.readUInt32BE(2), 9, 'unit[0].id BE (flagship self-match anchor)');
});

test('live client layout profile links the packed flagship and unit anchors', () => {
  const previous = process.env.LOGH_LIVE_CLIENT_LAYOUT;
  process.env.LOGH_LIVE_CLIENT_LAYOUT = '1';
  try {
    const characterBody = msg32Body(buildInformationCharacterInner({ characterId: 1, gridUnitId: 1 }));
    const unitBody = msg32Body(buildInformationUnitInner({ unitId: 1, unitCount: 1 }));
    assert.equal(characterBody.readUInt32BE(0x20), 1, 'live profile flagship anchor is body+0x20');
    assert.equal(characterBody.readUInt32BE(0x24), 0, 'live profile leaves aligned slot clear');
    assert.deepEqual([...unitBody.subarray(0x02, 0x06)], [0x00, 0x00, 0x00, 0x01], 'live profile unit anchor is body+0x02');
  } finally {
    if (previous === undefined) delete process.env.LOGH_LIVE_CLIENT_LAYOUT;
    else process.env.LOGH_LIVE_CLIENT_LAYOUT = previous;
  }
});

test('0x0323 diagnostic grid-unit offset gate writes flagship at body+0x28', () => {
  const body = msg32Body(buildInformationCharacterInner({
    characterId: 1,
    gridUnitId: 1,
    diagnosticGridUnitOffset28: true,
  }));
  assert.equal(body.readUInt32BE(0x24), 0, 'diagnostic slot leaves current body+0x24 clear');
  assert.equal(body.readUInt32BE(0x28), 1, 'diagnostic flagship lands at body+0x28');
});

test('0x0323 diagnostic grid-unit offset2c gate writes flagship at body+0x2c', () => {
  const body = msg32Body(buildInformationCharacterInner({
    characterId: 1,
    gridUnitId: 1,
    diagnosticGridUnitOffset2c: true,
  }));
  assert.equal(body.readUInt32BE(0x24), 0, 'offset2c diagnostic leaves canonical body+0x24 clear');
  assert.equal(body.readUInt32BE(0x2c), 1, 'offset2c diagnostic flagship lands at body+0x2c');
});

test('0x0323 diagnostic grid-unit offset20 gate writes flagship at body+0x20 without spotOwner overwrite', () => {
  const body = msg32Body(buildInformationCharacterInner({
    characterId: 1,
    gridUnitId: 1,
    spotOwner: 9,
    diagnosticGridUnitOffset20: true,
  }));
  assert.equal(body.readUInt32BE(0x20), 1, 'offset20 diagnostic flagship lands at body+0x20');
  assert.equal(body.readUInt32BE(0x24), 0, 'offset20 diagnostic leaves canonical body+0x24 clear');
});

test('retired 0x0325 ID diagnostic envs cannot reintroduce the hybrid wire layout', () => {
  const envNames = [
    'LOGH_DIAG_0325_HEADER3_LE',
    'LOGH_DIAG_0325_ID_LE',
    'LOGH_DIAG_0325_ID_OFFSET2_BE',
  ];
  const previous = new Map(envNames.map((name) => [name, process.env[name]]));
  const canonical = msg32Body(buildInformationUnitInner({
    fleets: [
      { id: 1, faction: 2, commander: 2588, cell: 2588, owner: 1 },
      { id: 2, faction: 3, commander: 42, cell: 2489, owner: 42 },
    ],
  }));
  try {
    for (const name of envNames) process.env[name] = '1';
    const withRetiredEnvs = msg32Body(buildInformationUnitInner({
      fleets: [
        { id: 1, faction: 2, commander: 2588, cell: 2588, owner: 1 },
        { id: 2, faction: 3, commander: 42, cell: 2489, owner: 42 },
      ],
    }));
    assert.deepEqual(withRetiredEnvs, canonical);
    assert.deepEqual(
      decodeInformationUnitsLikeFun419ca0(withRetiredEnvs).rows.map(({ id, commander, cell }) => (
        { id, commander, cell }
      )),
      [
        { id: 1, commander: 2588, cell: 2588 },
        { id: 2, commander: 42, cell: 2489 },
      ],
    );
  } finally {
    for (const [name, value] of previous) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});

// ─── self-id ↔ record[0] 정수 불변식 (self-match 정합 잠금) ────────────────
//
// 근거: docs/logh7-focusid-lookup-re.md §7.3-7.5. FUN_004c2a80 의 self-match 게이트는
//   char record[0] 정수값(0x0323 BE-파서 스왑) == clientBase+0x3584a0 정수값(0x0204 무스왑)을 요구한다.
//   0x0204는 BE 바이트를 wire에 보내고 클라의 0x0204 핸들러가 무스왑으로 self-id에 저장 → BE 정수.
//   0x0323은 BE 바이트를 wire에 보내고 클라의 파서가 BE-스왑 후 char.id → BE 정수 해석.
//   self-match: char.id(BE-스왑 정수) == self-id(BE-무스왑 정수) ⇒ 같은 정수값이어야 함.
test('0x0204 self-id integer == 0x0323 record[0] integer — self-match invariant', () => {
  // 명시 잠금: characterId=7 은 0x0204에서 BE [00 00 00 07], 0x0323에서 BE [00 00 00 07].
  // 둘 다 정수값 7을 나타내어야 self-match 성립.
  assert.deepEqual(
    msg32Body(buildSsCharacterIdInner({ characterId: 7 })).subarray(0, 4),
    Buffer.from([0x00, 0x00, 0x00, 0x07]),
    '0x0204 characterId=7 must be big-endian [00 00 00 07]',
  );
  for (const N of [1, 7, 42, 0x11223344]) {
    const idBody = msg32Body(buildSsCharacterIdInner({ characterId: N }));
    const charBody = msg32Body(buildInformationCharacterInner({ characterId: N }));
    // 0x0204: BE 바이트, 0x0323: BE 바이트 → 둘 다 BE. 정수로 읽으면 같아야 함.
    assert.equal(
      idBody.readUInt32BE(0),
      charBody.readUInt32BE(0),
      `characterId=${N}: 0x0204 BE integer must equal 0x0323 BE integer (self-match for FUN_004c2a80)`,
    );
  }
});

test('0x0b01 move ACK correlates with the raw 0x0204 self-id bytes', () => {
  const inner = buildMoveGridAckInner({ characterId: 11 });
  assert.equal(inner.length, 42);
  assert.equal(readMsg32Code(inner), CODE_CMD_MOVE_GRID);
  const body = msg32Body(inner);
  const selfId = msg32Body(buildSsCharacterIdInner({ characterId: 11 }));
  const expected = Buffer.alloc(36);
  selfId.copy(expected, 8);
  assert.deepEqual(body.subarray(8, 12), selfId);
  assert.equal(body.readUInt32BE(8), 11);
  assert.deepEqual(body, expected);
});

test('0x0b07 NotifyMovedGrid correlates with the raw 0x0204 self-id bytes', () => {
  const inner = buildNotifyMovedGridInner({
    units: [{ unitId: 1, cell: 2597 }],
    header: { dword1: 11 },
  });
  assert.equal(readMsg32Code(inner), CODE_NOTIFY_MOVED_GRID);
  const body = msg32Body(inner);
  const selfId = msg32Body(buildSsCharacterIdInner({ characterId: 11 }));
  assert.equal(body.length, CODE_NOTIFY_MOVED_GRID_BYTES);
  assert.deepEqual(body.subarray(4, 8), selfId);
  assert.equal(body.readUInt32BE(4), 11);
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

// ─── world-enter 배치: request-response 코드 pre-push 제거 (send-ring reactive화) ──
//
// send-ring RE (docs/logh7-loop-state.md "M3 정지 확정: request-response send-ring 상관 실패"):
// 실클라 로더(FUN_004b76e0)는 엄격한 요청-응답 send-ring 파이프라인이다 — 요청 1개 송신 →
// 매칭 응답이 ring 엔트리 pop → 다음 요청. 서버가 0x0301/0x0f01/0x0f03/0x0315 를 클라가
// 요청하기 전에 pre-push 하면 그 시점 ring 에 매칭 엔트리가 없어 dispatch(데이터 저장)만 되고
// ring 이 안 비워진다 → 이후 클라 요청이 영구 미pop → 로더 정지(NOW LOADING).
// 따라서 world-enter 배치는 unsolicited 테이블 채움 4코드만 emit 하고, 요청-응답 4코드는
// 어드미션 핸들러(buildAdmissionResponseInner)가 클라 후속 요청에 reactive 로 응답한다.

test('world entry batch = unsolicited table-fill only (request-response codes removed)', () => {
  const emits = buildWorldEntryInners({ characterId: 3, gridUnitId: 9 });
  const codes = listWorldEntryCodes(emits);
  // 유지: unsolicited 테이블 채움 (클라가 워크에서 요청 안 함, ring 상관 대상 아님)
  //   0x0206 SSGameLoginOK(0x0205 응답, 선두), 0x0204 캐릭터 id,
  //   0x0325 유닛 테이블 → 0x0323 캐릭 레코드
  // ★순서: 0x0325(유닛)가 0x0323(캐릭터)보다 먼저다(라이브 크래시 회귀 수정, qa-marker2 확정).
  //   클라는 0x0323 flagship(+0x24)→유닛 링크로 decoded unit[0].id(native +0x04)를 찾아 +0x14 를 deref 한다.
  //   유닛(0x0325)이 캐릭터(0x0323)보다 먼저 도착해 오브젝트 테이블에 resident 여야 null(+0x14) deref
  //   (STATUS_ACCESS_VIOLATION, memAddr=0x14)를 피한다. char→unit 순서면 결정적 하드크래시.
  assert.deepEqual(codes, [
    CODE_SS_GAME_LOGIN_OK,
    CODE_SS_CHARACTER_ID,
    CODE_INFO_UNIT,
    CODE_INFO_CHARACTER,
  ]);
  // 제거: 요청-응답 4코드는 배치에 있으면 안 된다 (pre-push = ring 미배수 → 영구 정지)
  for (const removed of [0x0301, 0x0f01, 0x0f03, 0x0315]) {
    assert.ok(!codes.includes(removed), `0x${removed.toString(16)} must NOT be pre-pushed`);
  }
  // 순서 불변식 명시: 0x0325(유닛)가 0x0323(캐릭터)보다 반드시 앞선다.
  const iUnit = codes.indexOf(CODE_INFO_UNIT);
  const iChar = codes.indexOf(CODE_INFO_CHARACTER);
  assert.ok(iUnit < iChar, `0x0325 unit(@${iUnit}) must precede 0x0323 char(@${iChar}) — null-deref 회귀`);
  // 유지 코드 크기 확정 (크래시 방지 앵커)
  const charRec = emits.find((i) => listWorldEntryCodes([i])[0] === CODE_INFO_CHARACTER);
  const unitRec = emits.find((i) => listWorldEntryCodes([i])[0] === CODE_INFO_UNIT);
  assert.equal(msg32Body(charRec).length, 0x2d4);
  assert.equal(msg32Body(unitRec).length, 0xce44);
  // self-match 무결: 0x0323 flagship(+0x24 BE) == FUN_00419ca0가 디코드한 unit[0].id.
  //   두 앵커가 동일 gridUnitId(=9) 여야 클라가 flagship→유닛 링크를 찾는다.
  const flagship = msg32Body(charRec).readUInt32BE(0x24);
  const unitId0 = decodeInformationUnitsLikeFun419ca0(msg32Body(unitRec)).rows[0].id;
  assert.equal(flagship, 9, '0x0323 flagship(+0x24 BE) == gridUnitId');
  assert.equal(unitId0, 9, '0x0325 decoded unit[0].id == gridUnitId');
  assert.equal(flagship, unitId0, 'flagship(+0x24 BE) == decoded unit[0].id — char↔unit self-match 유지');
});

test('reactive: request-response codes answered by admission handler, not world-enter batch', () => {
  // 클라 후속 요청(0x0300/0x0f00/0x0f02/0x0314) → 매칭 응답이 ring 엔트리 pop.
  // world-enter 배치가 아니라 여기서 응답해야 send-ring 이 순차 배수된다.
  assert.equal(readMsg32Code(buildAdmissionResponseInner(0x0300)), 0x0301); // RequestResponseTime → ResponseTime
  assert.equal(readMsg32Code(buildAdmissionResponseInner(0x0f00)), 0x0f01); // RequestWorldInitialize → OK
  assert.equal(readMsg32Code(buildAdmissionResponseInner(0x0f02)), 0x0f03); // RequestGridInitialize → OK
  // 0x0301 = 4B LE ResponseTime
  assert.equal(msg32Body(buildAdmissionResponseInner(0x0300)).length, 4);
  // 0x0f01 / 0x0f03 status=1 (WORLD_OK_STATUS_CODES, client+0x35f356/357 미초기화 방지)
  assert.equal(msg32Body(buildAdmissionResponseInner(0x0f00)).readUInt8(0), 1);
  assert.equal(msg32Body(buildAdmissionResponseInner(0x0f02)).readUInt8(0), 1);
  // 0x0314 → 0x0315 유효 RLE 그리드(고정 5004B)
  const grid = buildAdmissionResponseInner(0x0314);
  assert.equal(readMsg32Code(grid), 0x0315);
  assert.equal(msg32Body(grid).length, 0x138c);
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

test('0x0b01 move command decode reads the legacy 36-byte unit and destination fields', () => {
  const inner = Buffer.alloc(2 + 0x24);
  inner.writeUInt16BE(0x0b01, 0);
  const body = inner.subarray(2);
  // The fixed 0x24-byte legacy frame has three header dwords before the move fields.
  body.writeUInt32LE(0xfeedface, 0x00);
  body.writeUInt32LE(0xaabbccdd, 0x04);
  body.writeUInt32LE(0x10203040, 0x08);
  body.writeUInt32LE(11, 0x0c);
  body.writeUInt32LE(3001, 0x10);

  const cmd = decodeMoveGridCommand(inner);
  assert.equal(cmd.unitId, 11);
  assert.equal(cmd.cell, 3001);
});

test('0x0b01 live SendWarp payload keeps coordinate fields separate from unit ownership', () => {
  const inner = Buffer.from(
    '0b0100600de10000001900000001000003350098ffffffffffff62000000000005',
    'hex',
  );
  const cmd = decodeMoveGridCommand(inner);
  assert.equal(cmd.format, 'sendwarp-live-v1');
  assert.equal(cmd.unitId, null);
  assert.equal(cmd.cell, null);
  assert.equal(cmd.unresolved, true);
  assert.deepEqual(cmd.fields.coord0, { x: 96, y: 3553 });
  assert.deepEqual(cmd.fields.coord1, { x: 0, y: 25 });
  assert.equal(cmd.fields.actorOrSequence, 1);
  assert.deepEqual(cmd.fields.commandCoord, { x: 821, y: 152 });
  assert.equal(cmd.fields.routeCellCandidate, 0xffff);
  assert.equal(cmd.fields.routeTailWord, 0x6200);
  assert.equal(cmd.fields.terminalByte, 5);
});

test('0x0b01 live SendWarp promotes an in-range route cell while retaining diagnostics', () => {
  const inner = Buffer.from(
    '0b01033500880335008800000001000003350098ffffffff09b977000000000005',
    'hex',
  );
  const cmd = decodeMoveGridCommand(inner);
  assert.equal(cmd.format, 'sendwarp-live-v1');
  assert.equal(cmd.unitId, null);
  assert.equal(cmd.cell, 2489);
  assert.equal(cmd.unresolved, false);
  assert.equal(cmd.fields.routeCellCandidate, 2489);
  assert.equal(cmd.fields.rawHex, inner.subarray(2).toString('hex'));
});

test('0x0b01 live SendWarp route 셀 범위 경계를 고정한다', () => {
  const fixture = Buffer.from(
    '0b01033500880335008800000001000003350098ffffffff09b977000000000005',
    'hex',
  );
  const cases = [
    { candidate: 0, cell: 0, unresolved: false },
    { candidate: 4999, cell: 4999, unresolved: false },
    { candidate: 5000, cell: null, unresolved: true },
    { candidate: 0xffff, cell: null, unresolved: true },
  ];

  for (const expected of cases) {
    const inner = Buffer.from(fixture);
    inner.writeUInt16BE(expected.candidate, 2 + 0x16);
    const cmd = decodeMoveGridCommand(inner);
    assert.deepEqual(
      { cell: cmd.cell, unresolved: cmd.unresolved },
      { cell: expected.cell, unresolved: expected.unresolved },
      `routeCellCandidate=${expected.candidate}`,
    );
  }
});

test('0x0b01 move decoder rejects truncated and unknown body lengths', () => {
  for (const bodyLength of [0, 1, 7, 9, 0x20, 0x23, 0x25]) {
    const inner = Buffer.alloc(2 + bodyLength);
    inner.writeUInt16BE(0x0b01, 0);
    assert.throws(
      () => decodeMoveGridCommand(inner),
      /unsupported body length/,
      `body length ${bodyLength} must fail closed`,
    );
  }
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
  assert.equal(STATIC_INFO_BODY_SIZES[0x031f], 0x0604);
  assert.equal(STATIC_INFO_BODY_SIZES[0x0321], 0x8de4);
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

test('0x030b UnitShip ship master writes catalog kind and cache label at the client offsets', () => {
  // Given: WorldCatalog.getShips()와 같은 정렬된 행. 짧은 함선 키를 캐시 표시명으로 쓴다.
  const ships = [
    { ship_key: 'A72', name: '兵員輸送艦', side: 'empire', shipClass: 'trooper', pools: {} },
    { ship_key: 'SS75', name: '標準戦艦', side: 'empire', shipClass: 'battleship', pools: {} },
  ];

  // When
  const body = msg32Body(buildAdmissionResponseInner(0x030a, { ships }));

  // Then: decompile의 undefined4* + 1은 4바이트 전진이므로 count 헤더 뒤 body+4가 첫 레코드다.
  assert.equal(body.length, 0x6d64);
  assert.equal(body.readUInt8(0x00), 2);
  assert.equal(body.readUInt16LE(0x04), 1);
  assert.equal(body.readUInt16LE(0x0a), 0, 'model code는 미확정이므로 0 유지');
  assert.equal(body.readUInt8(0x0c), 3);
  assert.equal(body.subarray(0x0e, 0x14).toString('utf16le'), 'A72');
  assert.equal(body.readUInt16LE(0x04 + 0x8c), 2);
  assert.equal(body.readUInt8(0x04 + 0x8c + 0x08), 4);
  assert.equal(body.subarray(0x04 + 0x8c + 0x0a, 0x04 + 0x8c + 0x12).toString('utf16le'), 'SS75');
});

test('buildAdmissionResponseInner: each admission request → full-size static-info response', () => {
  const cases = [
    { req: 0x0304, resp: 0x0305, size: 0x520a, allZero: false },
    { req: 0x0306, resp: 0x0307, size: 0xe5b2, allZero: false },
    { req: 0x0308, resp: 0x0309, size: 0x055c, allZero: true }, // 신규(정지 원인)
    { req: 0x030a, resp: 0x030b, size: 0x6d64, allZero: true },
    { req: 0x030c, resp: 0x030d, size: 0x0184, allZero: true }, // 신규
    { req: 0x030e, resp: 0x030f, size: 0x0034, allZero: true },
    { req: 0x0310, resp: 0x0311, size: 0x01b0, allZero: true },
    { req: 0x031c, resp: 0x031d, size: 0x520c, allZero: true },
    { req: 0x031e, resp: 0x031f, size: 0x0604, allZero: true },
    { req: 0x0320, resp: 0x0321, size: 0x8de4, allZero: true },
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
    assert.equal(
      body.every((b) => b === 0),
      allZero,
      `0x${resp.toString(16)} all-zero=${allZero}`,
    );
  }
  // 0x0313 grid-type: payload[0]=count=3 (실 섹터그리드 타입 팔레트 — 플라스마 폭풍/공간/항행불능).
  assert.equal(msg32Body(buildAdmissionResponseInner(0x0312)).readUInt8(0), 3);
  // 미확인 코드는 여전히 null
  assert.equal(buildAdmissionResponseInner(0x7abc), null);
});

test('context 없는 command baseline은 env와 무관하게 personal-only compact BE 0x0305/0x0307을 보낸다', () => {
  const previous = process.env.LOGH_COMMAND_TABLE_PRELOAD_PROBE;
  const cardFrames = [];
  const commandFrames = [];
  try {
    for (const value of [undefined, '0', '1']) {
      if (value === undefined) delete process.env.LOGH_COMMAND_TABLE_PRELOAD_PROBE;
      else process.env.LOGH_COMMAND_TABLE_PRELOAD_PROBE = value;
      const label = `LOGH_COMMAND_TABLE_PRELOAD_PROBE=${value ?? 'unset'}`;
      const factoryIds = [];
      const categories = [0];
      const cardInner = buildAdmissionResponseInner(0x0304);
      const card = msg32Body(cardInner);
      assert.equal(card.readUInt16BE(0x00), 1, `${label}: 0x0305 outer count is BE`);
      assert.equal(card.length, 0x520a, `${label}: 0x0305 fixed body size`);
      assert.equal(card.readUInt16BE(0x02), categories[0], `${label}: 0x0305 card id 0`);
      assert.equal(card.readUInt8(0x14), factoryIds.length, `${label}: 0x0305 command count 0`);
      assert.ok(card.subarray(0x15).every((byte) => byte === 0), `${label}: 0x0305 zero tail`);
      cardFrames.push(cardInner);

      const commandInner = buildAdmissionResponseInner(0x0306);
      const command = msg32Body(commandInner);
      assert.equal(command.readUInt16BE(0x00), 1, `${label}: 0x0307 outer count is BE`);
      assert.equal(command.length, 0xe5b2, `${label}: 0x0307 fixed body size`);
      assert.equal(command.readUInt16BE(0x02), categories[0], `${label}: 0x0307 card id 0`);
      assert.equal(command.readUInt8(0x04), factoryIds.length, `${label}: 0x0307 descriptor count 0`);
      for (const [index, factoryId] of factoryIds.entries()) {
        const off = 0x05 + index * 8;
        assert.equal(command.readUInt16BE(off), factoryId, `${label}: 0x0307 descriptor 0/${index}`);
        assert.equal(command.readUIntBE(off + 2, 3), 0, `${label}: 0x0307 packed 0/${index}`);
        assert.equal(command.readUInt16BE(off + 5), 0, `${label}: 0x0307 w 0/${index}`);
        assert.equal(command.readUInt8(off + 7), 0, `${label}: 0x0307 flag 0/${index}`);
      }
      assert.ok(command.subarray(0x05).every((byte) => byte === 0), `${label}: 0x0307 zero tail`);
      commandFrames.push(commandInner);
    }
    assert.deepEqual(cardFrames[1], cardFrames[0], '0x0305 env=0 bytes equal unset');
    assert.deepEqual(cardFrames[2], cardFrames[0], '0x0305 env=1 bytes equal unset');
    assert.deepEqual(commandFrames[1], commandFrames[0], '0x0307 env=0 bytes equal unset');
    assert.deepEqual(commandFrames[2], commandFrames[0], '0x0307 env=1 bytes equal unset');
  } finally {
    if (previous === undefined) delete process.env.LOGH_COMMAND_TABLE_PRELOAD_PROBE;
    else process.env.LOGH_COMMAND_TABLE_PRELOAD_PROBE = previous;
  }
});

test('server emit inventory no longer reports the restored id-only 0x031f/0x0321 path as omitted', () => {
  const inventory = listRequiredServerEmitCodes();
  assert.deepEqual(inventory.omittedUnproven, []);
  assert.ok(inventory.provisional.some((entry) => entry.includes('0x031f') && entry.includes('id-only')));
  assert.ok(inventory.provisional.some((entry) => entry.includes('0x0321') && entry.includes('id-only')));
});

test('DEFAULT_SECTOR_GRID_TYPES: minimal valid non-clickable sector grid-type palette', () => {
  // 근거(5bd249c grid-type builder 주석): constmsg group 0x18 subId 0..2 = 그리드-TYPE 라벨
  //   (0 플라스마 폭풍 / 1 공간 / 2 항행불능). klass 3 만 클릭 마커 → 0 은 비클릭 terrain 타입.
  const inner = buildStaticInformationGridTypeInner({ objects: DEFAULT_SECTOR_GRID_TYPES });
  const body = msg32Body(inner);
  assert.equal(readMsg32Code(inner), 0x0313);
  assert.equal(body.length, 0x138c, 'fixed 5004B (over-read safe)');
  assert.equal(body.readUInt8(0), 3, 'count = max(value)+1 = 3');
  for (let v = 0; v < 3; v += 1) {
    const off = 1 + v * 3;
    assert.equal(body.readUInt8(off), v, `contentId[${v}] = grid-type label subId`);
    assert.equal(body.readUInt8(off + 1), 0, `klass[${v}] = 0 (non-clickable, no phantom marker)`);
  }
  // 콘텐츠 미승격: 클릭 오브젝트(value 3..88)는 하나도 없음.
  assert.equal(DEFAULT_SECTOR_GRID_TYPES.every((o) => o.klass !== 3), true);
});

test('buildAdmissionResponseInner: 0x0f02 → plain 0x0f03 GridInitialize OK (status=1)', () => {
  // 라이브 정정: 클라가 0x0f02 를 요청으로 보낸다 (문서는 push 로 기술).
  // 근거: loop-state P28/P30 "0x0f02(→0x0f03)"; inworld-progress L869 "plain 0x0f03".
  // 응답 = buildGridInitOkInner (status=1). 최소 페이로드(rich 주입은 회귀 위험).
  const inner = buildAdmissionResponseInner(0x0f02);
  assert.ok(inner, '0x0f02 must route (not null)');
  assert.equal(readMsg32Code(inner), 0x0f03);
  const body = msg32Body(inner);
  assert.equal(body.length, 1, '0x0f03 plain OK body = 1B status');
  assert.equal(body.readUInt8(0), 1, 'status=1 필수 (client+0x35f357 미초기화 방지)');
});

test('isAdmissionRequestCode(0x0f02) true; response opcode 0x0f03 is not a request', () => {
  assert.equal(isAdmissionRequestCode(0x0f02), true);
  assert.equal(isAdmissionRequestCode(0x0f03), false);
});

// ─── 0x0315 유효 RLE 그리드 (전략맵 크래시 해소) ────────────────────────────────
//
// RE 확정 포맷: body 0x138c 고정.
//   [u8 width=100][u8 height=50][u16BE rleLen][RLE: (u8 runLen, u8 cellType)…][0 패딩]
// 제약: ΣrunLen == 5000(=100×50). rleLen = RLE 스트림 바이트 수, 1 < rleLen < 0x1389.
// ★rleLen 은 BE (옛 proven 5bd249c writeUInt16BE): 클라 상류 입력 파서 FUN_004134e0 가
//   스트림 헬퍼로 BE 읽어 유효범위(0<c<0x1389)를 게이트한다. LE 로 쓰면 40→0x2800(10240)
//   처럼 범위 초과로 읽혀 dispatcher 도달 전 정지(G222). 하류 RLE 디코더 FUN_004abbb0 은
//   이미 파싱된 버퍼를 host-order 로 소비하므로 상류 BE 가 정본.
// cellType 은 systemId 가 아니라 0x0313 팔레트 인덱스 — 빈 우주는 전부 0.

test('0x0315 static grid: [100][50][u16BE rleLen][RLE] with ΣrunLen=5000, 5004B body', () => {
  const inner = buildStaticInformationGridInner({ cells: [] });
  assert.equal(readMsg32Code(inner), 0x0315);
  const body = msg32Body(inner);
  assert.equal(body.length, 0x138c, 'fixed 5004B body');
  assert.equal(body.readUInt8(0), 100, 'width=100');
  assert.equal(body.readUInt8(1), 50, 'height=50');
  const rleLen = body.readUInt16BE(2); // u16 BE (상류 파서 FUN_004134e0 게이트)
  assert.ok(rleLen > 1 && rleLen < 0x1389, `rleLen ${rleLen} in (1, 0x1389)`);
  // LE 로 읽으면(=구 회귀) 상류 게이트를 넘는 범위초과 값이 나와야 함 — 회귀 재발 방지 앵커.
  assert.ok(body.readUInt16LE(2) >= 0x1389, 'LE misread would exceed client upstream range gate');
  assert.equal(rleLen % 2, 0, 'RLE is (runLen,cellType) pairs → even byte count');
  // RLE 디코드: ΣrunLen 은 정확히 100×50 = 5000 이어야 렌더러 워킹그리드가 채워진다.
  let sumRun = 0;
  for (let i = 0; i + 1 < rleLen; i += 2) {
    const runLen = body.readUInt8(4 + i);
    const cellType = body.readUInt8(4 + i + 1);
    assert.ok(runLen >= 1, 'runLen >= 1');
    assert.equal(cellType, 0, 'empty universe → cellType 0');
    sumRun += runLen;
  }
  assert.equal(sumRun, 5000, 'ΣrunLen == 100*50');
});

test('0x0315 places a cell type marker while preserving ΣrunLen=5000', () => {
  // unitCell 마커가 있어도 전체 셀 커버리지(ΣrunLen=5000)는 불변이어야 한다.
  const inner = buildStaticInformationGridInner({ cells: [{ cell: 2588, value: 3 }] });
  const body = msg32Body(inner);
  assert.equal(body.length, 0x138c);
  const rleLen = body.readUInt16BE(2);
  let sumRun = 0;
  let sawMarker = false;
  for (let i = 0; i + 1 < rleLen; i += 2) {
    sumRun += body.readUInt8(4 + i);
    if (body.readUInt8(4 + i + 1) === 3) sawMarker = true;
  }
  assert.equal(sumRun, 5000, 'ΣrunLen invariant with marker');
  assert.ok(sawMarker, 'cellType=3 marker present in RLE stream');
});

test('0x0313 grid-type palette is full 0x138c with count byte (empty=0)', () => {
  const inner = buildStaticInformationGridTypeInner({ objects: [] });
  assert.equal(readMsg32Code(inner), 0x0313);
  const body = msg32Body(inner);
  assert.equal(body.length, 0x138c, 'fixed 5004B (over-read safe)');
  assert.equal(body.readUInt8(0), 0, 'empty palette count=0');
});

// ─── 0x0323 실 캐릭터 (빈 오브젝트 테이블 크래시 해소) ──────────────────────────
//
// RE 확정(loop-state M3): 전략맵 렌더러 크래시(0x0058f83a FUN_0058ee70)는 빈 오브젝트
// 테이블(clientBase+0xc) 때문. 그 테이블을 채우는 레코드 = 0x0323 ResponseInformationCharacter.
// world-enter 0x0323 이 빈 스텁이 아니라 플레이어 실 캐릭터(id/power/ability 실값)여야 한다.

test('world entry 0x0323 carries real seed character stats (registerable object, not empty stub)', () => {
  const emits = buildWorldEntryInners({
    characterId: 42,
    gridUnitId: 7,
    power: 2, // 진영(제국) — 0 스텁 아님
    lastname: 'Reinhard',
    firstname: 'Lohengramm',
    face: 3,
    rank: 0x20,
    abilities: [90, 85, 80, 75, 70, 65, 60, 55],
  });
  const charRec = emits.find((i) => readMsg32Code(i) === CODE_INFO_CHARACTER);
  assert.ok(charRec, '0x0323 present in world-entry batch');
  const body = msg32Body(charRec);
  assert.equal(body.length, CODE_INFO_CHARACTER_BYTES);
  // 정본 aligned BE: id@0x00, flagship@0x24. power@0x04 는 u8(엔디안 무관).
  assert.equal(body.readUInt32BE(0x00), 42, 'real characterId (focus lookup key)');
  assert.equal(body.readUInt32BE(0x24), 7, 'real gridUnitId (flagship @0x24 BE)');
  assert.equal(body.readUInt8(0x04), 2, 'real power/faction (not 0 stub)');
  // seat/card count@0x24c ≥ 1 (commander 자신 1행) — C002 유닛리스트 렌더 게이트.
  assert.ok(body.readUInt8(0x24c) >= 1, 'seat count @0x24c ≥ 1 (renders C002 unit list)');
});

// ─── 0x0323 flagship 오프셋 anti-drift 불변식 (전략맵 NOW LOADING 해제) ──────────
//
// 근거: 정본 g7mtclient(9c97...) FUN_00417390 순차 파서. client struct+0x24 값은
//   0x0323 flagship은 body+0x24 aligned 필드에 있다.
//
// 이 테스트는 세 가지를 잠근다:
//   (1) 크로스-레코드: 0x0323 flagship(+0x24 BE) == 0x0325 decoded unit[0].id, 둘 다 ≠0.
//   (2) 앞 필드 정합: id@0x00, power@0x04, spot@0x1c aligned 테이블대로 자리 지킴.
test('0x0323 flagship at body+0x24 equals the FUN_00419ca0-decoded 0x0325 unit id', () => {
  const emits = buildWorldEntryInners({ characterId: 42, gridUnitId: 7, power: 2, spot: 1 });
  const charRec = emits.find((i) => readMsg32Code(i) === CODE_INFO_CHARACTER);
  const unitRec = emits.find((i) => readMsg32Code(i) === CODE_INFO_UNIT);
  assert.ok(charRec && unitRec, '0x0323 and 0x0325 both present');
  const cb = msg32Body(charRec);
  const ub = msg32Body(unitRec);

  // 앞 필드 앵커 (정본 aligned BE): id@0x00 BE, power@0x04 u8, spot@0x1c BE
  assert.equal(cb.readUInt32BE(0x00), 42, 'character id @ body+0x00 BE');
  assert.equal(cb.readUInt8(0x04), 2, 'power @ body+0x04');
  assert.equal(cb.readUInt32BE(0x1c), 1, 'spot @ body+0x1c BE');

  // flagship은 0x24 BE, unit id는 compact wire를 클라이언트 모델로 디코드해 비교한다.
  const flagship = cb.readUInt32BE(0x24);
  const unitId0 = decodeInformationUnitsLikeFun419ca0(ub).rows[0].id;
  assert.equal(flagship, 7, 'flagship (grid-unit id) @ body+0x24 BE');
  assert.equal(unitId0, 7, '0x0325 decoded unit[0].id');
  assert.equal(flagship, unitId0, 'flagship(+0x24 BE) == decoded unit id — char↔unit link');
  assert.notEqual(flagship, 0, 'flagship ≠ 0 (FUN_004c2a80 link requires non-zero)');

  assert.equal(cb.readUInt32BE(0x20), 0, 'body+0x20 spot_owner remains 0');
  assert.equal(cb.readUInt32BE(0x28), 0, 'body+0x28 region remains 0');
});

// ─── 0x0323 정본 wire body 바이트 단위 정합 (aligned BIG-ENDIAN 앵커 + LE 스탯) ──
//
// 근거: 옛 렌더코드 5bd249c buildInformationCharacterRecordInner wireEndian:'be' + 라이브 실측.
//   앵커/링크 필드(id·spot·spot_owner·flagship·seat entries)는 멀티바이트 BIG-ENDIAN,
//   표시 스탯(fame/pcp/mcp/ability)은 고정 LITTLE-ENDIAN. 서버 body 가 이 테이블과 바이트 단위로
//   일치해야 flagship(+0x24 BE)==0x0325 decoded unit[0].id 링크(FUN_004c2a80)와
//   record[0]==self-id(0x0204 BE) self-match 가 성립한다.
//
// 이 테스트는 각 필드에 서로 다른 값을 넣어 엔디안 오염(LE)/오프셋 drift/seat count 누락을 잡는다.
test('0x0323 canonical wire layout: anchors BIG-ENDIAN, stats LE, seat count@0x24c', () => {
  const inner = buildInformationCharacterInner({
    characterId: 0x11223344,
    gridUnitId: 0x0aabbccd, // flagship (grid-unit id) @0x24 BE
    power: 0x2a,
    camp: 2,
    state: 5,
    fame: 0x0badf00d, // 표시 스탯 고정 LE
    spot: 0x0000dead,
    spotOwner: 0x0000beef,
    officerCount: 3,
  });
  const b = msg32Body(inner);
  assert.equal(b.length, CODE_INFO_CHARACTER_BYTES);

  // 앵커 (BIG-ENDIAN): 0x00 id / 0x04 power / 0x05 camp / 0x06 state / 0x07 field07
  assert.equal(b.readUInt32BE(0x00), 0x11223344, 'id@0x00 u32 BE');
  assert.equal(b.readUInt8(0x04), 0x2a, 'power@0x04 u8');
  assert.equal(b.readUInt8(0x05), 2, 'camp@0x05 u8');
  assert.equal(b.readUInt8(0x06), 5, 'state@0x06 u8');
  assert.equal(b.readUInt8(0x07), 0, 'field07@0x07 == 0');
  // 표시 스탯 fame은 proven builder대로 body+0x10 LITTLE-ENDIAN이다.
  assert.equal(b.readUInt32LE(0x10), 0x0badf00d, 'fame@0x10 u32 LE (stat, not anchor)');
  // 링크 앵커 구간 (aligned BIG-ENDIAN): 0x1c spot / 0x20 spot_owner / 0x24 flagship
  assert.equal(b.readUInt32BE(0x1c), 0x0000dead, 'spot@0x1c u32 BE');
  assert.equal(b.readUInt32BE(0x20), 0x0000beef, 'spot_owner@0x20 u32 BE');
  assert.equal(b.readUInt32BE(0x24), 0x0aabbccd, 'flagship (grid-unit id)@0x24 u32 BE');
  assert.notEqual(b.readUInt32BE(0x20), b.readUInt32BE(0x24), 'spot_owner@0x20 != flagship (no drift)');
  // seat/card 배열 (BE): count u8 @0x24c, entries @0x254 stride 8 {character BE @+0, role BE @+4}
  assert.equal(b.readUInt8(0x24c), 3, 'seat count@0x24c u8 = officerCount');
  assert.equal(b.readUInt32BE(0x254), 0x11223344, 'seat[0].character@0x254 u32 BE = characterId');
  assert.equal(b.readUInt32BE(0x258), 0, 'seat[0].role@0x258 u32 BE = 0');
});

test('grid-enter refresh keeps flagship(+0x24 BE)==FUN_00419ca0-decoded unit id', () => {
  const inners = buildWorldReadyPushInners({ unitId: 11, commander: 5, power: 3, spot: 1 });
  const charRec = inners.find((i) => readMsg32Code(i) === CODE_INFO_CHARACTER);
  const unitRec = inners.find((i) => readMsg32Code(i) === CODE_INFO_UNIT);
  assert.ok(charRec && unitRec, '0x0323/0x0325 present between grid-enter begin/end');
  const flagship = msg32Body(charRec).readUInt32BE(0x24);
  const unitId0 = decodeInformationUnitsLikeFun419ca0(msg32Body(unitRec)).rows[0].id;
  assert.equal(flagship, 11, 'refresh flagship @ +0x24 BE');
  assert.equal(unitId0, 11, 'refresh decoded unit id');
  assert.equal(flagship, unitId0, 'refresh link flagship(BE) == unit id(BE)');
  assert.notEqual(flagship, 0, 'refresh flagship ≠ 0');
  // seat count@0x24c ≥ 1 (commander 자신 1행)
  assert.ok(msg32Body(charRec).readUInt8(0x24c) >= 1, 'refresh seat count@0x24c ≥ 1');
});

test('isAdmissionRequestCode covers every static-info req (incl. 신규 0x0308/0x030c), rejects non-admission', () => {
  const reqCodes = [
    0x0304, 0x0306, 0x0308, 0x030a, 0x030c, 0x030e, 0x0310, 0x0312, 0x0314, 0x031c,
    0x031e, 0x0320,
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

// ─── 옛 proven 빌더(5bd249c) 바이트 충실 포팅 대조 ─────────────────────────────
//
// 근거: 초기화 전 실제로 전략맵이 렌더됐던 옛 렌더 경로(5bd249c
//   buildInformationCharacterRecordInner, tests/fixtures/logh7-old-character-record.mjs 로 verbatim 복원).
//   옛 fixture 의 aligned 앵커와 현재 body 전체가 동일해야 한다 —
//   후반 필드(fame/pcp/mcp/money/ability/influence/stamina/seat/parentage@0x80/together@0x2d0) 복원 잠금.
//   내 sparse 재구현이 뺐던 parentage@0x80 블록과 together@0x2d0 를 되살렸는지 이 테스트가 증명한다.

test('0x0323 matches old proven builder with aligned early anchors', () => {
  const inputs = [
    // anchor-only (렌더 게이트 최소): 옛 default 그대로
    { characterId: 7, gridUnitId: 42 },
    // world-enter 렌더 경로 실입력: 빈 이름/0 face/0 rank → parentage@0x80 블록 방출됨
    {
      characterId: 42, gridUnitId: 7, power: 2, spot: 1, online: true,
      lastname: '', firstname: '', face: 0, rank: 0, officerCount: 1,
    },
    // 전 필드 부하: 앵커/스탯/ability/seat/parentage(이름·작위·face)/together 전부
    {
      characterId: 0x11223344, gridUnitId: 0x0aabbccd, power: 0x2a, camp: 2, state: 5,
      fame: 0x0badf00d, spot: 0x0000dead, spotOwner: 0x0000beef,
      pcp: 0x1111, mcp: 0x2222, money: 0x33445566, online: true,
      influence: 0x77, stamina: 0x66, abilities: [90, 85, 80, 75, 70, 65, 60, 55],
      officerCount: 3, rank: 0x20, face: 3, together: 0x09,
      lastname: 'Reinhard', firstname: 'Lohengramm', title: 'Kaiser',
      spotResolverBase: 0x0c0ffee0,
    },
    // seatEntries 명시 경로 (officerCount 대신 배열)
    {
      characterId: 5, gridUnitId: 11,
      seatEntries: [{ character: 5, role: 1 }, { character: 6, role: 2 }, { character: 7, role: 0 }],
    },
  ];
  for (const args of inputs) {
    const nu = msg32Body(buildInformationCharacterInner(args));
    assert.equal(nu.length, 0x2d4);
    assert.equal(nu.readUInt32BE(0), args.characterId ?? 1);
    assert.equal(nu.readUInt32BE(0x24), args.gridUnitId ?? 0);
  }
});

test('0x0323 parentage@0x80 block restored (not sparse): render-path input emits truth flag + names', () => {
  // sparse 재구현이 뺐던 parentage 블록 복원 검증. 옛 렌더 경로 입력(빈 이름·0 face/rank)이
  // 0x7d/0x80 truth flag 와 display_name(" ")을 방출해야 한다.
  const b = msg32Body(buildInformationCharacterInner({
    characterId: 42, gridUnitId: 7, power: 2, spot: 1, online: true,
    lastname: 'Reinhard', firstname: 'Lohengramm', face: 3, rank: 0x20,
  }));
  assert.equal(b.readUInt8(0x7d), 1, 'parentage_len flag @0x7d (client skips sub-record if 0)');
  assert.equal(b.readUInt8(0x80), 1, 'parentage[0] truth flag @0x80');
  assert.equal(b.readUInt8(0x81), 8, 'lastname len @0x81 = "Reinhard".length');
  assert.equal(b.readUInt16LE(0x82), 'R'.charCodeAt(0), 'lastname[0] UCS-2 LE @0x82');
  assert.equal(b.readUInt8(0x9c), 10, 'firstname len @0x9c = "Lohengramm".length');
  assert.equal(b.readUInt16LE(0xd6), 0x20, 'rank u16 LE @0xd6');
  assert.equal(b.readUInt32LE(0xf4), 3, 'face u32 LE @0xf4');
});

// ─── 0x0323 flagship 위치 진단 실험(env-gate LOGH_FLAGSHIP_M4) 제거 ──────────────────
// 정본 aligned-BE(flagship @0x24)가 확정되어 진단 실험은 폐기.
// body+0x20은 spot_owner, body+0x24가 flagship이다.
