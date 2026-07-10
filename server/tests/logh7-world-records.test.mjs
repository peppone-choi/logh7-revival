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
  assert.equal(body.readUInt32LE(0x20), 42); // flagship (구 0x24, -4 정렬)
  assert.equal(body.readUInt8(0x79), 1); // parentage_len (구 0x7d)
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
  assert.equal(body.readUInt32LE(0x20), 7, 'real gridUnitId (flagship @0x20, -4 정렬)');
  assert.equal(body.readUInt8(0x04), 2, 'real power/faction (not 0 stub)');
  assert.equal(body.readUInt16LE(0x184), 90, 'real ability[0] forwarded (구 0x188)');
  assert.equal(body.readUInt16LE(0x184 + 4 * 7), 55, 'real ability[7] forwarded');
});

// ─── 0x0323 flagship 오프셋 정렬 불변식 (전략맵 NOW LOADING 근본수정) ──────────
//
// 근거: A/B 실험(구 LOGH_FLAGSHIP_M4)으로 서버 body 가 클라 와이어보다 flagship 이후 +4 밀려
//   있음이 증명됨 — 서버가 spot@0x1c 다음에 클라 와이어에 없는 여분 필드(spot_owner, 값 0)를
//   써서 flagship·이름·스탯 전부를 +4 로 밀어 malformed 로 만들었다. spot_owner 를 제거하고
//   flagship(0x24→0x20) 이후 모든 필드를 -4 시프트해 클라 와이어와 정렬한다.
//   클라 와이어: spot@0x1c → flagship@0x20 → name_len@0x24 → name@0x26 → ….
//   0x0325 unit[0].id 는 body offset 0x04. char↔unit 링크(FUN_004c2a80)는 flagship==unit id.
//
// 이 테스트는 네 가지를 잠근다:
//   (1) 크로스-레코드: 0x0323 flagship(+0x20) == 0x0325 unit[0].id(+0x04), 둘 다 ≠0.
//   (2) anti-drift: flagship 은 정확히 0x20 에만. spot_owner 잔재 없음 — spot@0x1c 바로 뒤가 flagship.
//   (3) 앞 필드 정합: id@0x00, power@0x04, spot@0x1c 가 클라 필드맵대로 자리 지킴.
//   (4) 크기 불변: body 총 0x2d4(724B).
test('0x0323 flagship lands at body+0x20 == 0x0325 unit id (+0x04), -4 aligned (no spot_owner)', () => {
  const emits = buildWorldEntryInners({ characterId: 42, gridUnitId: 7, power: 2, spot: 1 });
  const charRec = emits.find((i) => readMsg32Code(i) === CODE_INFO_CHARACTER);
  const unitRec = emits.find((i) => readMsg32Code(i) === CODE_INFO_UNIT);
  assert.ok(charRec && unitRec, '0x0323 and 0x0325 both present');
  const cb = msg32Body(charRec);
  const ub = msg32Body(unitRec);

  // 크기 불변 (클라가 고정 0x2d4 기대)
  assert.equal(cb.length, CODE_INFO_CHARACTER_BYTES, 'char body 총 0x2d4 (724B) 불변');

  // 앞 필드 앵커 (flagship 이전은 시프트 없음)
  assert.equal(cb.readUInt32LE(0x00), 42, 'character id @ body+0x00');
  assert.equal(cb.readUInt8(0x04), 2, 'power @ body+0x04');
  assert.equal(cb.readUInt32LE(0x1c), 1, 'spot @ body+0x1c (not drifted)');

  // flagship 정확히 0x20 (spot 바로 뒤, spot_owner 제거됨), unit id 0x04, 크로스-레코드 동일·≠0
  const flagship = cb.readUInt32LE(0x20);
  const unitId0 = ub.readUInt32LE(0x04);
  assert.equal(flagship, 7, 'flagship (grid-unit id) @ body+0x20');
  assert.equal(unitId0, 7, '0x0325 unit[0].id @ body+0x04');
  assert.equal(flagship, unitId0, 'flagship(+0x20) == unit id(+0x04) — char↔unit link');
  assert.notEqual(flagship, 0, 'flagship ≠ 0 (FUN_004c2a80 link requires non-zero)');

  // anti-drift: 구 0x24(spot_owner 있을 때 flagship 위치)는 이제 name_len 구간 = 0
  assert.equal(cb.readUInt32LE(0x24), 0, 'body+0x24 (flagship_name_len region) is 0 — no +4 drift');
  // 0x14 max_of_special 영역이 u32 로 넘쳐 0x18/0x1c 를 밀지 않았음(spot@0x1c 이미 검증됨)
  assert.equal(cb.readUInt32LE(0x18), 0, 'body+0x18 (return_base) is 0 — max_of_special did not overflow');
});

// ─── 0x0323 정본 wire body 바이트 단위 정합 (클라 case 0x323 raw-asm 확정 테이블) ──
//
// 근거: docs/logh7-loop-state.md "M3 정본 파서 테이블 확정(raw asm): 0x0323 = 고정 LITTLE-ENDIAN".
//   클라 dispatcher case 0x323 은 전부 고정 오프셋 native MOV (LITTLE-ENDIAN) 로 읽는다.
//   서버 body 가 이 테이블과 바이트 단위로 일치해야 flagship(+0x24)==0x0325 unit[0].id(+0x04)
//   링크(FUN_004c2a80)가 성립해 NOW LOADING 이 해제된다.
//
// 이 테스트는 각 필드에 서로 다른 값을 넣어 엔디안 오염/오프셋 drift/타입 오류(u16↔u32)를 잡는다.
test('0x0323 canonical wire layout: every field LE at -4 aligned offsets, max_of_special is u16', () => {
  const inner = buildInformationCharacterInner({
    characterId: 0x11223344,
    gridUnitId: 0x0aabbccd, // flagship (grid-unit id) @0x20 (-4 정렬, 구 0x24)
    power: 0x2a,
    camp: 2,
    state: 5,
    beginSessionAge: 0x01020304,
    birthdayMonth: 4,
    birthdayDay: 26,
    fame: 0x0badf00d,
    maxOfSpecial: 0x1234, // u16 — 반드시 0x16 pad / 0x18 return_base 를 밀지 않아야
    returnBase: 0x55667788,
    spot: 0x0000dead,
    strategy: 0x00112233,
    coupConduct: 0x44556677,
    coup: 0x08009900,
  });
  const b = msg32Body(inner);
  assert.equal(b.length, CODE_INFO_CHARACTER_BYTES);

  // 0x00 id / 0x04 power / 0x05 camp / 0x06 state / 0x07 pad
  assert.equal(b.readUInt32LE(0x00), 0x11223344, 'id@0x00 u32 LE');
  assert.equal(b.readUInt8(0x04), 0x2a, 'power@0x04 u8');
  assert.equal(b.readUInt8(0x05), 2, 'camp@0x05 u8');
  assert.equal(b.readUInt8(0x06), 5, 'state@0x06 u8');
  assert.equal(b.readUInt8(0x07), 0, 'pad@0x07 == 0');
  // 0x08 begin_session_age / 0x0c bday / 0x0e pad
  assert.equal(b.readUInt32LE(0x08), 0x01020304, 'begin_session_age@0x08 u32 LE');
  assert.equal(b.readUInt8(0x0c), 4, 'birthday_month@0x0c u8');
  assert.equal(b.readUInt8(0x0d), 26, 'birthday_day@0x0d u8');
  assert.equal(b.readUInt16LE(0x0e), 0, 'pad@0x0e == 0');
  // 0x10 fame / 0x14 max_of_special (u16!) / 0x16 pad / 0x18 return_base
  assert.equal(b.readUInt32LE(0x10), 0x0badf00d, 'fame@0x10 u32 LE');
  assert.equal(b.readUInt16LE(0x14), 0x1234, 'max_of_special@0x14 u16 LE');
  assert.equal(b.readUInt16LE(0x16), 0, 'pad@0x16 == 0 (max_of_special is u16, no overflow)');
  assert.equal(b.readUInt32LE(0x18), 0x55667788, 'return_base@0x18 u32 LE');
  // 0x1c spot / 0x20 flagship (spot_owner 제거, -4 정렬) — 링크 앵커 구간
  assert.equal(b.readUInt32LE(0x1c), 0x0000dead, 'spot@0x1c u32 LE');
  assert.equal(b.readUInt32LE(0x20), 0x0aabbccd, 'flagship (grid-unit id)@0x20 u32 LE (구 0x24)');
  assert.notEqual(b.readUInt32LE(0x1c), b.readUInt32LE(0x20), 'spot@0x1c != flagship (인접, no drift)');
  assert.equal(b.readUInt32LE(0x24), 0, 'name_len region@0x24 == 0 (flagshipName 없음)');
  // 0x40 strategy / 0x44 coup_conduct / 0x48 coup (-4 정렬, 구 0x44/0x48/0x4c)
  assert.equal(b.readUInt32LE(0x40), 0x00112233, 'strategy@0x40 u32 LE');
  assert.equal(b.readUInt32LE(0x44), 0x44556677, 'coup_conduct@0x44 u32 LE');
  assert.equal(b.readUInt32LE(0x48), 0x08009900, 'coup@0x48 u32 LE');
});

test('grid-enter refresh (0x0b09/0x0325/0x0323/0x0b0a) keeps flagship(+0x24)==unit id(+0x04)', () => {
  const inners = buildWorldReadyPushInners({ unitId: 11, commander: 5, power: 3, spot: 1 });
  const charRec = inners.find((i) => readMsg32Code(i) === CODE_INFO_CHARACTER);
  const unitRec = inners.find((i) => readMsg32Code(i) === CODE_INFO_UNIT);
  assert.ok(charRec && unitRec, '0x0323/0x0325 present between grid-enter begin/end');
  const flagship = msg32Body(charRec).readUInt32LE(0x20);
  const unitId0 = msg32Body(unitRec).readUInt32LE(0x04);
  assert.equal(flagship, 11, 'refresh flagship @ +0x20 (-4 정렬)');
  assert.equal(unitId0, 11, 'refresh unit id @ +0x04');
  assert.equal(flagship, unitId0, 'refresh link flagship==unit id');
  assert.notEqual(flagship, 0, 'refresh flagship ≠ 0');
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

// ─── 0x0323 flagship -4 정렬 근본수정 회귀 잠금 (구 env-gate LOGH_FLAGSHIP_M4 대체) ──
// A/B 실험(env-gate)이 flagship=wire[0x20] 을 증명한 뒤 근본수정으로 대체됨: spot_owner 제거 +
// flagship 이후 전 필드 -4. 이 테스트는 spot@0x1c 유지 + flagship@0x20 + 구 0x24=0(name_len) +
// 크기 0x2d4 불변을 잠근다.
test('0x0323 default layout: flagship @body+0x20, spot@0x1c 유지, 0x24 zeroed, size 0x2d4', () => {
  const inner = buildInformationCharacterInner({ characterId: 7, gridUnitId: 42, spot: 3 });
  const body = msg32Body(inner);
  assert.equal(body.length, CODE_INFO_CHARACTER_BYTES, 'body 총 0x2d4 (724B) 불변');
  assert.equal(body.readUInt32LE(0x1c), 3, 'spot @ body+0x1c 유지 (flagship 이전 시프트 없음)');
  assert.equal(body.readUInt32LE(0x20), 42, 'flagship @ body+0x20 (-4 정렬, 구 0x24)');
  assert.equal(body.readUInt32LE(0x24), 0, 'body+0x24 (구 flagship 위치, 이제 name_len) == 0');
});
