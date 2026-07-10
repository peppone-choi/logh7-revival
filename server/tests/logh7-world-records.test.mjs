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
  DEFAULT_SECTOR_GRID_TYPES,
  buildSsCharacterIdInner,
  buildSsLoginOkInner,
  buildSsGameLoginOkInner,
  buildCharacterRosterTransaction,
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
  readMsg32Code,
  msg32Body,
} from '../src/server/logh7-world-records.mjs';
import { buildInformationCharacterRecordInner } from './fixtures/logh7-old-character-record.mjs';

test('0x0323 character record is message32 with 724B body and id/flagship anchors (aligned BE)', () => {
  // 정본 wire = struct-aligned BIG-ENDIAN (옛 렌더코드 5bd249c wireEndian:be + 라이브 실측). id@0x00 BE, flagship@0x24 BE.
  const inner = buildInformationCharacterInner({ characterId: 7, gridUnitId: 42 });
  assert.equal(readMsg32Code(inner), CODE_INFO_CHARACTER);
  const body = msg32Body(inner);
  assert.equal(body.length, CODE_INFO_CHARACTER_BYTES);
  assert.equal(body.readUInt32BE(0x00), 7);
  assert.equal(body.readUInt32BE(0x24), 42);
});

test('0x0325 unit record is fixed 52804B with count and unit id (aligned BE)', () => {
  // 0x0325 도 info-record 계열 → aligned BE (count·id). flagship(0x0323 +0x24)과 동일 BE 로 링크.
  const inner = buildInformationUnitInner({ unitId: 5, unitCount: 1, cell: 2588 });
  assert.equal(readMsg32Code(inner), CODE_INFO_UNIT);
  const body = msg32Body(inner);
  assert.equal(body.length, CODE_INFO_UNIT_BYTES);
  assert.equal(body.readUInt16BE(0), 1);
  assert.equal(body.readUInt32BE(4), 5);
});

// ─── self-id ↔ record[0] 바이트오더 불변식 (self-match 정합 잠금) ────────────────
//
// 근거: docs/logh7-objtable-gate-re.md §1-2. FUN_004c2a80 의 self-match 게이트는
//   char record[0](0x0323 body+0x00) == clientBase+0x3584a0(0x0204 self-id) 를 요구한다.
//   0x0204(buildSsCharacterIdInner)와 0x0323 record[0] 은 둘 다 BIG-ENDIAN 이어야 두 바이트열이
//   동일해 self-match 가 성립하고 mode-0(objTable slot0 기록 → 전략맵 렌더)이 호출된다.
//   정본 = both BE (옛 렌더코드 5bd249c wireEndian:be). characterId=7 → [00 00 00 07].
test('0x0204 self-id bytes == 0x0323 record[0] bytes (both BE) — self-match invariant', () => {
  // 명시 잠금: characterId=7 은 BE 로 [00 00 00 07] (LE 였다면 [07 00 00 00]).
  assert.deepEqual(
    msg32Body(buildSsCharacterIdInner({ characterId: 7 })).subarray(0, 4),
    Buffer.from([0x00, 0x00, 0x00, 0x07]),
    '0x0204 characterId=7 must be big-endian [00 00 00 07]',
  );
  for (const N of [1, 7, 42, 0x11223344]) {
    const idBody = msg32Body(buildSsCharacterIdInner({ characterId: N }));
    const charBody = msg32Body(buildInformationCharacterInner({ characterId: N }));
    assert.deepEqual(
      idBody.subarray(0, 4),
      charBody.subarray(0, 4),
      `characterId=${N}: 0x0204 body[0..3] must equal 0x0323 record[0] byte-for-byte (both BE)`,
    );
  }
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
  // 0x0313 grid-type: payload[0]=count=3 (실 섹터그리드 타입 팔레트 — 플라스마 폭풍/공간/항행불능).
  assert.equal(msg32Body(buildAdmissionResponseInner(0x0312)).readUInt8(0), 3);
  // 미확인 코드는 여전히 null
  assert.equal(buildAdmissionResponseInner(0x7abc), null);
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
  assert.equal(body.readUInt32BE(0x24), 7, 'real gridUnitId (flagship @0x24 BE, aligned)');
  assert.equal(body.readUInt8(0x04), 2, 'real power/faction (not 0 stub)');
  // seat/card count@0x24c ≥ 1 (commander 자신 1행) — C002 유닛리스트 렌더 게이트.
  assert.ok(body.readUInt8(0x24c) >= 1, 'seat count @0x24c ≥ 1 (renders C002 unit list)');
});

// ─── 0x0323 flagship 오프셋 anti-drift 불변식 (전략맵 NOW LOADING 해제) ──────────
//
// 근거: docs/logh7-objtable-gate-re.md §3 — 클라 case 0x0323 파서는 body 를 struct-aligned
//   LITTLE-ENDIAN 으로 읽는다. flagship 은 aligned LE record body offset 0x24 (u32 LE)에서,
//   0x0325 unit[0].id 는 body offset 0x04(u32 LE)에서 읽어 char↔unit 링크(FUN_004c2a80)를 만든다.
//   flagship 이 ±1 dword 로 밀리거나 BE 로 뒤집히면 record+0x24≠unitId → 링크 실패 → NOW LOADING 정지.
//
// 이 테스트는 세 가지를 잠근다:
//   (1) 크로스-레코드: 0x0323 flagship(+0x24 LE) == 0x0325 unit[0].id(+0x04 LE), 둘 다 ≠0.
//   (2) anti-drift: flagship 은 정확히 0x24 에만. 인접 0x20(spot_owner)/0x28(flagship_name_len)
//       dword 는 0 — flagship 이 ±1 dword 로 새지 않았음을 증명.
//   (3) 앞 필드 정합: id@0x00, power@0x04, spot@0x1c 이 aligned LE 테이블대로 자리 지킴.
test('0x0323 flagship lands at body+0x24 (aligned BE) == 0x0325 unit id (+0x04 BE), no drift', () => {
  const emits = buildWorldEntryInners({ characterId: 42, gridUnitId: 7, power: 2, spot: 1 });
  const charRec = emits.find((i) => readMsg32Code(i) === CODE_INFO_CHARACTER);
  const unitRec = emits.find((i) => readMsg32Code(i) === CODE_INFO_UNIT);
  assert.ok(charRec && unitRec, '0x0323 and 0x0325 both present');
  const cb = msg32Body(charRec);
  const ub = msg32Body(unitRec);

  // 앞 필드 앵커 (정본 aligned BE): id@0x00 BE, power@0x04 u8, spot@0x1c BE
  assert.equal(cb.readUInt32BE(0x00), 42, 'character id @ body+0x00 BE');
  assert.equal(cb.readUInt8(0x04), 2, 'power @ body+0x04');
  assert.equal(cb.readUInt32BE(0x1c), 1, 'spot @ body+0x1c BE (aligned, not drifted)');

  // flagship 정확히 0x24 BE, unit id 정확히 0x04 BE, 크로스-레코드 동일·≠0
  const flagship = cb.readUInt32BE(0x24);
  const unitId0 = ub.readUInt32BE(0x04);
  assert.equal(flagship, 7, 'flagship (grid-unit id) @ body+0x24 BE');
  assert.equal(unitId0, 7, '0x0325 unit[0].id @ body+0x04 BE');
  assert.equal(flagship, unitId0, 'flagship(+0x24) == unit id(+0x04) — char↔unit link');
  assert.notEqual(flagship, 0, 'flagship ≠ 0 (FUN_004c2a80 link requires non-zero)');

  // anti-drift: 인접 dword 는 0 (flagship 이 ±1 dword 로 밀리지 않았음)
  assert.equal(cb.readUInt32BE(0x20), 0, 'body+0x20 (spot_owner) is 0 — flagship not −1 dword');
  assert.equal(cb.readUInt32BE(0x28), 0, 'body+0x28 region is 0 — flagship not +1 dword');
});

// ─── 0x0323 정본 wire body 바이트 단위 정합 (struct-aligned BIG-ENDIAN 앵커 + LE 스탯) ──
//
// 근거: 옛 렌더코드 5bd249c buildInformationCharacterRecordInner wireEndian:'be' + 라이브 실측.
//   앵커/링크 필드(id·spot·spot_owner·flagship·seat entries)는 멀티바이트 BIG-ENDIAN,
//   표시 스탯(fame/pcp/mcp/ability)은 고정 LITTLE-ENDIAN. 서버 body 가 이 테이블과 바이트 단위로
//   일치해야 flagship(+0x24 BE)==0x0325 unit[0].id(+0x04 BE) 링크(FUN_004c2a80)와
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
  // 표시 스탯 (고정 LITTLE-ENDIAN): 0x10 fame
  assert.equal(b.readUInt32LE(0x10), 0x0badf00d, 'fame@0x10 u32 LE (stat, not anchor)');
  // 링크 앵커 구간 (BIG-ENDIAN): 0x1c spot / 0x20 spot_owner / 0x24 flagship
  assert.equal(b.readUInt32BE(0x1c), 0x0000dead, 'spot@0x1c u32 BE');
  assert.equal(b.readUInt32BE(0x20), 0x0000beef, 'spot_owner@0x20 u32 BE');
  assert.equal(b.readUInt32BE(0x24), 0x0aabbccd, 'flagship (grid-unit id)@0x24 u32 BE');
  assert.notEqual(b.readUInt32BE(0x20), b.readUInt32BE(0x24), 'spot_owner@0x20 != flagship (no drift)');
  // seat/card 배열 (BE): count u8 @0x24c, entries @0x254 stride 8 {character BE @+0, role BE @+4}
  assert.equal(b.readUInt8(0x24c), 3, 'seat count@0x24c u8 = officerCount');
  assert.equal(b.readUInt32BE(0x254), 0x11223344, 'seat[0].character@0x254 u32 BE = characterId');
  assert.equal(b.readUInt32BE(0x258), 0, 'seat[0].role@0x258 u32 BE = 0');
});

test('grid-enter refresh (0x0b09/0x0325/0x0323/0x0b0a) keeps flagship(+0x24 BE)==unit id(+0x04 BE)', () => {
  const inners = buildWorldReadyPushInners({ unitId: 11, commander: 5, power: 3, spot: 1 });
  const charRec = inners.find((i) => readMsg32Code(i) === CODE_INFO_CHARACTER);
  const unitRec = inners.find((i) => readMsg32Code(i) === CODE_INFO_UNIT);
  assert.ok(charRec && unitRec, '0x0323/0x0325 present between grid-enter begin/end');
  const flagship = msg32Body(charRec).readUInt32BE(0x24);
  const unitId0 = msg32Body(unitRec).readUInt32BE(0x04);
  assert.equal(flagship, 11, 'refresh flagship @ +0x24 BE');
  assert.equal(unitId0, 11, 'refresh unit id @ +0x04 BE');
  assert.equal(flagship, unitId0, 'refresh link flagship==unit id');
  assert.notEqual(flagship, 0, 'refresh flagship ≠ 0');
  // seat count@0x24c ≥ 1 (commander 자신 1행)
  assert.ok(msg32Body(charRec).readUInt8(0x24c) >= 1, 'refresh seat count@0x24c ≥ 1');
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

// ─── 옛 proven 빌더(5bd249c) 바이트 충실 포팅 대조 ─────────────────────────────
//
// 근거: 초기화 전 실제로 전략맵이 렌더됐던 옛 렌더 경로(5bd249c
//   buildInformationCharacterRecordInner, tests/fixtures/logh7-old-character-record.mjs 로 verbatim 복원).
//   현재 buildInformationCharacterInner 는 이 옛 빌더와 같은 입력에 대해 byte-identical 이어야 한다 —
//   전 필드(fame/pcp/mcp/money/ability/influence/stamina/seat/parentage@0x80/together@0x2d0) 복원 잠금.
//   내 sparse 재구현이 뺐던 parentage@0x80 블록과 together@0x2d0 를 되살렸는지 이 테스트가 증명한다.

test('0x0323 new builder == old proven 5bd249c builder, byte-identical (all fields, both endians)', () => {
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
    for (const wireEndian of ['be', 'le']) {
      const nu = msg32Body(buildInformationCharacterInner({ ...args, wireEndian }));
      const old = buildInformationCharacterRecordInner({ ...args, wireEndian }).subarray(6);
      assert.equal(nu.length, 0x2d4);
      assert.equal(old.length, 0x2d4);
      assert.deepEqual(
        nu,
        old,
        `byte-identical mismatch (wireEndian=${wireEndian}, args=${JSON.stringify(args)})`,
      );
    }
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

// ─── 0x0323 flagship -4 위치 실험(env-gate LOGH_FLAGSHIP_M4) 제거 ──────────────────
// Frida wire 실측 + re-analyst decompile 로 정본 aligned LE(flagship @0x24)가 확정되어 진단 실험은 폐기.
// 0x24 가 이제 정본 위치이며 무조건 flagship 을 담는다(위 canonical wire / anti-drift 테스트가 잠금).
