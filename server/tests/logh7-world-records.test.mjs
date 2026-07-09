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
  buildStaticInformationGridInner,
  buildStaticInformationGridTypeInner,
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
  //   0x0206 SSGameLoginOK(0x0205 응답, 선두), 0x0204 캐릭터 id, 0x0323 캐릭 레코드,
  //   0x0325 유닛 테이블
  assert.deepEqual(codes, [
    CODE_SS_GAME_LOGIN_OK,
    CODE_SS_CHARACTER_ID,
    CODE_INFO_CHARACTER,
    CODE_INFO_UNIT,
  ]);
  // 제거: 요청-응답 4코드는 배치에 있으면 안 된다 (pre-push = ring 미배수 → 영구 정지)
  for (const removed of [0x0301, 0x0f01, 0x0f03, 0x0315]) {
    assert.ok(!codes.includes(removed), `0x${removed.toString(16)} must NOT be pre-pushed`);
  }
  // 유지 코드 크기 확정 (크래시 방지 앵커)
  const charRec = emits.find((i) => listWorldEntryCodes([i])[0] === CODE_INFO_CHARACTER);
  const unitRec = emits.find((i) => listWorldEntryCodes([i])[0] === CODE_INFO_UNIT);
  assert.equal(msg32Body(charRec).length, 0x2d4);
  assert.equal(msg32Body(unitRec).length, 0xce44);
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
// RE 확정 포맷(FUN_004abbb0): body 0x138c 고정.
//   [u8 width=100][u8 height=50][u16LE rleLen][RLE: (u8 runLen, u8 cellType)…][0 패딩]
// 제약: ΣrunLen == 5000(=100×50). rleLen = RLE 스트림 바이트 수, 1 < rleLen < 0x1389.
// cellType 은 systemId 가 아니라 0x0313 팔레트 인덱스 — 빈 우주는 전부 0.

test('0x0315 static grid: [100][50][u16LE rleLen][RLE] with ΣrunLen=5000, 5004B body', () => {
  const inner = buildStaticInformationGridInner({ cells: [] });
  assert.equal(readMsg32Code(inner), 0x0315);
  const body = msg32Body(inner);
  assert.equal(body.length, 0x138c, 'fixed 5004B body');
  assert.equal(body.readUInt8(0), 100, 'width=100');
  assert.equal(body.readUInt8(1), 50, 'height=50');
  const rleLen = body.readUInt16LE(2); // u16 LE (RE 확정)
  assert.ok(rleLen > 1 && rleLen < 0x1389, `rleLen ${rleLen} in (1, 0x1389)`);
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
  const rleLen = body.readUInt16LE(2);
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
  assert.equal(body.readUInt32LE(0x00), 42, 'real characterId (focus lookup key)');
  assert.equal(body.readUInt32LE(0x24), 7, 'real gridUnitId');
  assert.equal(body.readUInt8(0x04), 2, 'real power/faction (not 0 stub)');
  assert.equal(body.readUInt16LE(0x188), 90, 'real ability[0] forwarded');
  assert.equal(body.readUInt16LE(0x188 + 4 * 7), 55, 'real ability[7] forwarded');
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
