import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createWorldSession } from '../src/server/logh7-world-session.mjs';
import {
  CODE_NOTIFY_MOVED_GRID,
  CODE_INFO_CHARACTER,
  CODE_LOBBY_SESSION_LOGIN_OK,
  CODE_SS_GAME_LOGIN_REQ,
  CODE_SS_GAME_LOGIN_OK,
  CODE_SS_CHARACTER_ID,
  CODE_RESP_TIME,
  CODE_WORLD_INIT_OK,
  CODE_INFO_UNIT,
  CODE_NOTIFY_ENTER_GRID_BEGIN,
  CODE_NOTIFY_ENTER_GRID_END,
  CODE_GRID_INIT_OK,
  CODE_REQ_STATIC_GRID,
  buildWorldReadyPushInners,
  isAdmissionRequestCode,
  readMsg32Code,
  msg32Body,
} from '../src/server/logh7-world-records.mjs';
import {
  runLoginSuccessPath,
  runLoginWorldMpSequence,
  SAMPLE_CREDENTIAL_INNER,
} from '../src/server/logh7-playable-pipeline.mjs';
import { parseGin7CredentialInner } from '../src/server/logh7-gin7-credential.mjs';

test('enterWorld emits character/unit records and marks inWorld', () => {
  const world = createWorldSession();
  world.seedPlayer({ connectionId: 1, characterId: 5, unitId: 8, inWorld: false });
  const { emits, codes, player } = world.enterWorld({ connectionId: 1 });
  assert.equal(player.inWorld, true);
  assert.ok(codes.includes(CODE_INFO_CHARACTER));
  assert.ok(emits.length >= 4);
  assert.equal(world.getPlayer(1).inWorld, true);
});

test('enterWorld encodes real seed character from characterStore into 0x0323 (crash fix)', () => {
  // 전략맵 크래시 해소: 0x0323 이 빈 스텁이 아니라 characterStore 의 실 시드 캐릭터여야
  // 클라 오브젝트 테이블(clientBase+0xc)이 채워지고 focus lookup 이 성공한다.
  const characterStore = {
    getCharacters: (acct) =>
      acct === 'inei00'
        ? [{
            id: 7,
            power: 2,
            lastname: 'Reinhard',
            firstname: 'Lohengramm',
            face: 3,
            rank: 0x20,
            ability8: [90, 85, 80, 75, 70, 65, 60, 55],
          }]
        : [],
  };
  const world = createWorldSession({ characterStore });
  world.seedPlayer({ connectionId: 1, accountId: 'inei00', characterId: 7, unitId: 8, inWorld: false });
  const { emits } = world.enterWorld({ connectionId: 1, accountId: 'inei00' });
  const charRec = emits.find((i) => readMsg32Code(i) === CODE_INFO_CHARACTER);
  assert.ok(charRec, '0x0323 present');
  const body = msg32Body(charRec);
  // 정본 aligned BE: id@0x00 BE, power@0x04 u8.
  assert.equal(body.readUInt32BE(0x00), 7, 'real characterId from store');
  assert.equal(body.readUInt8(0x04), 2, 'real power/faction from store (not 0 stub)');
});

test('0x2009 create-pending (no character) returns 0x200a without inventing char', () => {
  const world = createWorldSession();
  const short = Buffer.alloc(4);
  short.writeUInt16BE(0x2009, 0);
  short.writeUInt16LE(1, 2);
  const login = world.handleSessionLogin({
    connectionId: 3,
    accountId: 'inei00',
    inner: short,
    character: null,
  });
  assert.equal(login.createPending, true);
  assert.equal(login.player.characterId, 0);
  assert.equal(login.player.sessionId, 1);
  // 생성 경로: message32 [u32 0][u16BE 0x200a][body]
  assert.equal(login.responseIsMsg32, true);
  assert.equal(login.responseInner.readUInt32LE(0), 0);
  assert.equal(login.responseInner.readUInt16BE(4), 0x200a);
  assert.throws(
    () => world.enterWorld({ connectionId: 3 }),
    /create-pending/,
  );
});

test('existing-character session login returns 0x200a as message32 (not raw)', () => {
  // M3: mps 트랜스포트는 인바운드 앱 메시지를 message32 유닛으로만 받는다.
  // raw 0x200a 는 recv 콜백 도달 전 드롭 → 클라가 리다이렉트를 못 받아 침묵.
  const world = createWorldSession();
  const req = Buffer.alloc(10);
  req.writeUInt16BE(0x2009, 0);
  req.writeUInt32LE(1, 2);
  req.writeUInt32LE(7, 6);
  const login = world.handleSessionLogin({
    connectionId: 1,
    accountId: 'inei00',
    inner: req,
    character: { id: 7, unitId: 3, cell: 2588 },
  });
  assert.equal(login.createPending, false);
  assert.equal(login.responseIsMsg32, true);
  // message32: [u32LE 0][u16BE 0x200a][body]
  assert.equal(login.responseInner.readUInt32LE(0), 0);
  assert.equal(login.responseInner.readUInt16BE(4), CODE_LOBBY_SESSION_LOGIN_OK);
});

test('0x0205 SSGameLoginRequest batch emits 0x0206 before 0x0204', () => {
  // M3: recv 필터가 0x0206(0x35837e) 미세팅 시 0x0204 를 드롭 → 0x0205 재트리거.
  // 월드 진입 배치에서 0x0206 이 0x0204·나머지 레코드보다 먼저여야 한다.
  const world = createWorldSession();
  world.seedPlayer({ connectionId: 1, characterId: 5, unitId: 8, inWorld: false });
  const req = Buffer.alloc(2);
  req.writeUInt16BE(CODE_SS_GAME_LOGIN_REQ, 0);
  const result = world.handleWorldInner({ connectionId: 1, accountId: 'a', inner: req });
  assert.equal(result.kind, 'world-enter');
  const codes = result.responses.map((r) => readMsg32Code(r.inner));
  const i206 = codes.indexOf(CODE_SS_GAME_LOGIN_OK);
  const i204 = codes.indexOf(CODE_SS_CHARACTER_ID);
  assert.ok(i206 >= 0, '0x0206 present in batch');
  assert.ok(i204 >= 0, '0x0204 present in batch');
  assert.ok(i206 < i204, `0x0206 (@${i206}) must precede 0x0204 (@${i204})`);
});

// ─── 월드 진입 후 어드미션 핸드셰이크 (NOW LOADING 해제) ────────────────────────
// 근거: docs/reference/restored-from-git/logh7-inworld-progress.md P27/P29 라이브 트레이스.
// 8종 월드레코드 수신 후 클라가 0x0304(2B, 페이로드 없음)를 보낸다. 이전엔
// handleWorldInner 가 라우팅 안 해 "알 수 없는 코드 0x0304" → NOW LOADING 영구 정지.

test('handleWorldInner routes admission 0x0304 → empty 0x0305 walker', () => {
  const world = createWorldSession();
  world.seedPlayer({ connectionId: 1, characterId: 5, unitId: 8, inWorld: true });
  const req = Buffer.alloc(2);
  req.writeUInt16BE(0x0304, 0);
  const result = world.handleWorldInner({ connectionId: 1, accountId: 'a', inner: req });
  assert.ok(result, '0x0304 must be routed (not null)');
  assert.equal(result.kind, 'admission');
  assert.equal(result.responses.length, 1);
  assert.equal(readMsg32Code(result.responses[0].inner), 0x0305);
  assert.deepEqual(result.responses[0].targets, [1]);
  assert.equal(result.responses[0].isMsg32, true);
});

test('handleWorldInner routes admission 0x0306 → 0x0307', () => {
  const world = createWorldSession();
  world.seedPlayer({ connectionId: 1, characterId: 5, unitId: 8, inWorld: true });
  const req = Buffer.alloc(2);
  req.writeUInt16BE(0x0306, 0);
  const result = world.handleWorldInner({ connectionId: 1, accountId: 'a', inner: req });
  assert.ok(result, '0x0306 must be routed');
  assert.equal(result.kind, 'admission');
  assert.equal(readMsg32Code(result.responses[0].inner), 0x0307);
});

test('handleWorldInner routes 0x0314 → single 0x0315 static-only (fixed 5004B framing)', () => {
  const world = createWorldSession();
  world.seedPlayer({ connectionId: 1, characterId: 5, unitId: 8, inWorld: true });
  const req = Buffer.alloc(2);
  req.writeUInt16BE(0x0314, 0);
  const result = world.handleWorldInner({ connectionId: 1, accountId: 'a', inner: req });
  assert.ok(result, '0x0314 must be routed');
  // 문서(logh7-render-interaction-contract L179): 고정 5004B [u8 w][u8 h][u16LE rle]...
  // ★static-only: world-ready push/0x0f03 을 싣지 않는다(월드-init 핸드셰이크 복원 — 스폰은 0x0f02).
  assert.equal(result.responses.length, 1, '0x0314 emits only static-info 0x0315 (no push)');
  assert.equal(readMsg32Code(result.responses[0].inner), 0x0315);
  assert.equal(msg32Body(result.responses[0].inner).length, 0x138c);
});

test('handleWorldInner routes admission 0x0312 → 0x0313 (정본 갤럭시 팔레트, 성계 klass=3)', () => {
  const world = createWorldSession();
  world.seedPlayer({ connectionId: 1, characterId: 5, unitId: 8, inWorld: true });
  const req = Buffer.alloc(2);
  req.writeUInt16BE(0x0312, 0);
  const result = world.handleWorldInner({ connectionId: 1, accountId: 'a', inner: req });
  assert.ok(result, '0x0312 must be routed');
  assert.equal(readMsg32Code(result.responses[0].inner), 0x0313);
  // 고정 5004B; payload[0]=count=max(value)+1. 정본 갤럭시 팔레트(터레인 0..2 + 성계 3..87).
  const body = msg32Body(result.responses[0].inner);
  assert.equal(body.length, 0x138c);
  const count = body.readUInt8(0);
  assert.ok(count > 3 && count < 0x65, `성계 포함 count(${count})>3 이고 <101`);
  // 배경 value 0 = 항법불가(klass 0) — 팬텀 클릭 마커 금지.
  assert.equal(body.readUInt8(1 + 0 * 3 + 1), 0, 'value 0 배경 = klass 0 비클릭');
  // 空間 value 1 = 항법가능(klass 1).
  assert.equal(body.readUInt8(1 + 1 * 3 + 1), 1, 'value 1 空間 = klass 1 항법가능');
  // 첫 성계 value 3 = 클릭 마커(klass 3).
  assert.equal(body.readUInt8(1 + 3 * 3 + 1), 3, 'value 3 성계 = klass 3 마커');
  // klass=3 마커가 다수 존재해야(성계 배치 증명).
  let markers = 0;
  for (let v = 3; v < count; v += 1) {
    if (body.readUInt8(1 + v * 3 + 1) === 3) markers += 1;
  }
  assert.ok(markers >= 80, `성계 마커 다수 배치 (실제 ${markers})`);
});

test('handleWorldInner admission works with message32-framed request too', () => {
  // 클라 재구성 경로: message32 [u32LE 0][u16BE code][body]
  const world = createWorldSession();
  world.seedPlayer({ connectionId: 1, characterId: 5, unitId: 8, inWorld: true });
  const req = Buffer.alloc(6);
  req.writeUInt32LE(0, 0);
  req.writeUInt16BE(0x0304, 4);
  const result = world.handleWorldInner({ connectionId: 1, accountId: 'a', inner: req });
  assert.ok(result);
  assert.equal(readMsg32Code(result.responses[0].inner), 0x0305);
});

// ─── static-info 완주 후 월드-init 핸드셰이크 (0x0300 / 0x0f00) ────────────────
// 근거: docs/reference/restored-from-git/logh7-inworld-progress.md P28/P30 라이브 트레이스
// (static-info 완주 후 0x0308→0x0309, 0x030c→0x030d, 0x0300→0x0301, 0x0f00→0x0f01, 0x0f02 push;
//  strategic HUD 도달). 이전엔 0x0300 이 handleWorldInner 분기 없음 → lobby 로 새어 "알 수 없는
//  코드" → 클라가 0x0301 응답 무한 대기(NOW LOADING 정지).

test('handleWorldInner routes 0x0300 RequestResponseTime → 0x0301 ResponseTime', () => {
  const world = createWorldSession();
  world.seedPlayer({ connectionId: 1, characterId: 5, unitId: 8, inWorld: true });
  const req = Buffer.alloc(2);
  req.writeUInt16BE(0x0300, 0);
  const result = world.handleWorldInner({ connectionId: 1, accountId: 'a', inner: req });
  assert.ok(result, '0x0300 must be routed (not null — else it leaks to lobby)');
  assert.equal(result.responses.length, 1);
  assert.equal(readMsg32Code(result.responses[0].inner), CODE_RESP_TIME);
  // 0x0301 body = 4B LE start time (buildResponseTimeInner 재사용)
  assert.equal(msg32Body(result.responses[0].inner).length, 4);
  assert.deepEqual(result.responses[0].targets, [1]);
  assert.equal(result.responses[0].isMsg32, true);
});

test('handleWorldInner routes 0x0300 when message32-framed too', () => {
  const world = createWorldSession();
  world.seedPlayer({ connectionId: 1, characterId: 5, unitId: 8, inWorld: true });
  const req = Buffer.alloc(6);
  req.writeUInt32LE(0, 0);
  req.writeUInt16BE(0x0300, 4);
  const result = world.handleWorldInner({ connectionId: 1, accountId: 'a', inner: req });
  assert.ok(result);
  assert.equal(readMsg32Code(result.responses[0].inner), CODE_RESP_TIME);
});

test('isAdmissionRequestCode(0x0300) is true so playable-server routes it to world (not lobby)', () => {
  assert.equal(isAdmissionRequestCode(0x0300), true);
});

test('handleWorldInner routes 0x0f00 RequestWorldInitialize → 0x0f01 WorldInitialize OK (status=1)', () => {
  const world = createWorldSession();
  world.seedPlayer({ connectionId: 1, characterId: 5, unitId: 8, inWorld: true });
  const req = Buffer.alloc(2);
  req.writeUInt16BE(0x0f00, 0);
  const result = world.handleWorldInner({ connectionId: 1, accountId: 'a', inner: req });
  assert.ok(result, '0x0f00 must be routed');
  assert.equal(readMsg32Code(result.responses[0].inner), CODE_WORLD_INIT_OK);
  // WORLD_OK_STATUS_CODES: status=1 필수 (client+0x35f356)
  assert.equal(msg32Body(result.responses[0].inner).readUInt8(0), 1);
});

test('isAdmissionRequestCode(0x0f00) is true (world-init handshake routes to world)', () => {
  assert.equal(isAdmissionRequestCode(0x0f00), true);
});

// ─── 0x0f02 RequestGridInitialize → 스폰 버스트(G164) + grid-enter 괄호, 0x0f03 맨 마지막 ──
// 월드-init 핸드셰이크 복원: 스폰(플레이어 유닛/캐릭터)은 0x0314 가 아니라 클라가 스스로 밟는
// 0x0f02 에 주입한다. 순서 [0x0204 → 0x0b09(begin) → 0x0325 + 0x0323 → 0x0b0a(end)] →
// grid extras(0x0313 + 0x0315) → 0x0f03(맨 마지막). 첫 0x0f02 에만(gridInitSpawned 게이트).
//
// ★grid-enter 괄호 배선(logh7-0325-loader-gate.md): 클라 유닛 레지스트리 벌크 적재(FUN_004c2a80)는
//   오직 0x0b0a(NotifyEnterGridEnd) 수신 시에만 실행된다. 0x0325/0x0323 은 스테이징/캐릭터 테이블만
//   채우고, 0x0b0a 가 없으면 렌더 레지스트리로 옮겨지지 않아 activeCount=0 → 마커클릭 null-deref.
//   불변식: 0x0325·0x0323 은 반드시 0x0b09(begin)와 0x0b0a(end) 사이. 0x0b09 는 0x0323 앞
//   (begin 이 char count 리셋 → 0x0323 이 재충전 → 0x0b0a 가 적재 트리거).

test('handleWorldInner first 0x0f02 injects spawn burst with grid-enter brackets, 0x0f03 LAST (G164)', () => {
  const world = createWorldSession();
  world.seedPlayer({ connectionId: 1, characterId: 5, unitId: 8, cell: 2588, inWorld: true });
  const req = Buffer.alloc(2);
  req.writeUInt16BE(0x0f02, 0);
  const result = world.handleWorldInner({ connectionId: 1, accountId: 'a', inner: req });
  assert.ok(result, '0x0f02 must be routed (not null — else it leaks to lobby, NOW LOADING stall)');
  assert.equal(result.kind, 'grid-init-spawn');
  const codes = result.responses.map((r) => readMsg32Code(r.inner));
  assert.deepEqual(codes, [
    CODE_SS_CHARACTER_ID,        // 0x0204
    CODE_NOTIFY_ENTER_GRID_BEGIN, // 0x0b09 (begin, char count 리셋)
    CODE_INFO_UNIT,              // 0x0325
    CODE_INFO_CHARACTER,         // 0x0323 (char 재충전)
    CODE_NOTIFY_ENTER_GRID_END,  // 0x0b0a (적재 트리거 FUN_004c2a80)
    0x0313,                      // grid-type 팔레트
    0x0315,                      // cell grid (플레이어 함대 cell)
    CODE_GRID_INIT_OK,           // 0x0f03 (맨 마지막)
  ], 'spawn burst: 0x0204 → 0x0b09 → 0x0325+0x0323 → 0x0b0a → grid extras → 0x0f03 LAST');
  assert.equal(codes[codes.length - 1], CODE_GRID_INIT_OK, '0x0f03 must be LAST');
  assert.equal(codes.filter((c) => c === CODE_GRID_INIT_OK).length, 1, '0x0f03 exactly once');
  assert.equal(msg32Body(result.responses[codes.length - 1].inner).readUInt8(0), 1, '0x0f03 status=1');
  // grid-enter 괄호 불변식: begin < unit < char < end (0x0325/0x0323 이 begin/end 사이).
  const iBegin = codes.indexOf(CODE_NOTIFY_ENTER_GRID_BEGIN);
  const iUnit = codes.indexOf(CODE_INFO_UNIT);
  const iChar = codes.indexOf(CODE_INFO_CHARACTER);
  const iEnd = codes.indexOf(CODE_NOTIFY_ENTER_GRID_END);
  assert.ok(iBegin < iUnit, `0x0b09 begin(@${iBegin}) must precede 0x0325 unit(@${iUnit})`);
  assert.ok(iUnit < iChar, `0x0325 unit(@${iUnit}) must precede 0x0323 char(@${iChar})`);
  assert.ok(iChar < iEnd, `0x0323 char(@${iChar}) must precede 0x0b0a end(@${iEnd})`);
  // begin/end body value=0 (value=1 은 char count 리셋만이 아니라 잘못된 상태 — 검증된 안전 경로는 0).
  const beginRec = result.responses.find((r) => readMsg32Code(r.inner) === CODE_NOTIFY_ENTER_GRID_BEGIN).inner;
  const endRec = result.responses.find((r) => readMsg32Code(r.inner) === CODE_NOTIFY_ENTER_GRID_END).inner;
  assert.equal(msg32Body(beginRec).readUInt8(0), 0, '0x0b09 body value=0');
  assert.equal(msg32Body(endRec).readUInt8(0), 0, '0x0b0a body value=0');
  // flagship↔unit 정합: 0x0323 flagship(+0x24 BE) == 0x0325 unit[0].id(+0x04 BE).
  const unitRec = result.responses.find((r) => readMsg32Code(r.inner) === CODE_INFO_UNIT).inner;
  const charRec = result.responses.find((r) => readMsg32Code(r.inner) === CODE_INFO_CHARACTER).inner;
  assert.equal(msg32Body(charRec).readUInt32BE(0x24), msg32Body(unitRec).readUInt32BE(0x04));
  for (const r of result.responses) {
    assert.deepEqual(r.targets, [1]);
    assert.equal(r.isMsg32, true);
  }
});

test('handleWorldInner second 0x0f02 returns plain 0x0f03 ack (spawn gated to first)', () => {
  const world = createWorldSession();
  world.seedPlayer({ connectionId: 1, characterId: 5, unitId: 8, cell: 2588, inWorld: true });
  const req = Buffer.alloc(2);
  req.writeUInt16BE(0x0f02, 0);
  world.handleWorldInner({ connectionId: 1, accountId: 'a', inner: req }); // 첫 요청: 스폰 버스트
  const result = world.handleWorldInner({ connectionId: 1, accountId: 'a', inner: req }); // 재요청: ack
  assert.equal(result.kind, 'admission');
  assert.equal(result.responses.length, 1, 'gate: 두 번째 0x0f02 는 ack 만');
  assert.equal(readMsg32Code(result.responses[0].inner), 0x0f03);
  assert.equal(msg32Body(result.responses[0].inner).readUInt8(0), 1, '0x0f03 status=1');
});

test('handleWorldInner 0x0f02 without in-world player also returns plain 0x0f03', () => {
  const world = createWorldSession();
  const req = Buffer.alloc(2);
  req.writeUInt16BE(0x0f02, 0);
  const result = world.handleWorldInner({ connectionId: 9, accountId: 'z', inner: req });
  assert.ok(result, '0x0f02 still routed even without player');
  assert.equal(result.responses.length, 1);
  assert.equal(readMsg32Code(result.responses[0].inner), 0x0f03);
});

test('handleWorldInner routes 0x0f02 when message32-framed too (spawn burst)', () => {
  const world = createWorldSession();
  world.seedPlayer({ connectionId: 1, characterId: 5, unitId: 8, cell: 2588, inWorld: true });
  const req = Buffer.alloc(6);
  req.writeUInt32LE(0, 0);
  req.writeUInt16BE(0x0f02, 4);
  const result = world.handleWorldInner({ connectionId: 1, accountId: 'a', inner: req });
  assert.ok(result);
  const codes = result.responses.map((r) => readMsg32Code(r.inner));
  assert.equal(codes[0], CODE_SS_CHARACTER_ID, '0x0f02 burst starts with 0x0204');
  assert.equal(codes[codes.length - 1], 0x0f03, '0x0f03 last');
});

// ─── 0x0f06 RequestInformationMessengerStatus → 0x0f07 (idle 파이프라인 해제) ──
// 근거: docs/reference/legacy-evidence/logh7-0f06-wire.md (정본 EXE RE)
// 클라 0x0f06 을 보낼 때 응답 0x0f07 을 미결 큐에 등록. 응답 없으면 큐 정지
// (이후 모든 요청 송신 차단 → idle 크래시). 0x0f07 바디는 29900B zero-fill.
// 클라가 파싱하지 않음(핸들러 빈 스텁) → 내용 정확도 불필요, 도착만 필요.

test('handleWorldInner routes 0x0f06 RequestInformationMessengerStatus → 0x0f07', () => {
  const world = createWorldSession();
  world.seedPlayer({ connectionId: 1, characterId: 5, unitId: 8, inWorld: true });
  const req = Buffer.alloc(2);
  req.writeUInt16BE(0x0f06, 0);
  const result = world.handleWorldInner({ connectionId: 1, accountId: 'a', inner: req });
  assert.ok(result, '0x0f06 must be routed (not null — else idle queue stalls)');
  assert.equal(result.kind, 'admission');
  assert.equal(result.responses.length, 1);
  assert.equal(readMsg32Code(result.responses[0].inner), 0x0f07);
  assert.deepEqual(result.responses[0].targets, [1]);
  assert.equal(result.responses[0].isMsg32, true);
});

test('0x0f07 response body is exactly 29900 bytes (0x74cc) of zeros', () => {
  const world = createWorldSession();
  world.seedPlayer({ connectionId: 1, characterId: 5, unitId: 8, inWorld: true });
  const req = Buffer.alloc(2);
  req.writeUInt16BE(0x0f06, 0);
  const result = world.handleWorldInner({ connectionId: 1, accountId: 'a', inner: req });
  const body = msg32Body(result.responses[0].inner);
  assert.equal(body.length, 0x74cc, 'body length exactly 29900');
  assert.equal(body.length, 29900, 'body length exactly 29900 (decimal)');
  // 검증: 모든 바이트가 0
  for (let i = 0; i < body.length; i += 1) {
    assert.equal(body.readUInt8(i), 0, `byte[${i}] must be 0`);
  }
});

test('isAdmissionRequestCode(0x0f06) is true (idle queue depends on routing)', () => {
  // 미배선 시 lobby 로 새어 queue depth 무한 증가 → 로그 flooding + 클라 송신 정지
  assert.equal(isAdmissionRequestCode(0x0f06), true);
});

test('isAdmissionRequestCode(0x0f02) is true so playable-server routes it to world (not lobby)', () => {
  assert.equal(isAdmissionRequestCode(0x0f02), true);
});

// ─── 0x032a RequestInformationOutfit → 0x032b (旗艦情報/편성 팝업) ─────────────
// 근거: docs/reference/legacy-evidence/logh7-032a-flagship-wire.md (정본 EXE RE)
// 0x032a 수신 → 0x032b 응답(2804B 고정, count≥1). count=0 이면 클라가 표시 함수를
// 안 불러 창이 빈다. 자기 편성이므로 count=1 + element[0]=플레이어 기함/편성.
// element(28B) 오프셋(요소 base 상대): id u32@0x00, camp u8@0x06,
//   practice_command@0x12, practice_offence@0x13, practice_defence@0x14 (형제 0x03xx 와 동일 BE).
// 연성치 매핑(정확 漢字만): command←ability8[4](指揮), offence←ability8[6](攻撃), defence←ability8[7](防御).

test('handleWorldInner routes 0x032a RequestInformationOutfit → 0x032b', () => {
  const world = createWorldSession();
  world.seedPlayer({ connectionId: 1, characterId: 5, unitId: 8, power: 2, inWorld: true });
  const req = Buffer.alloc(2);
  req.writeUInt16BE(0x032a, 0);
  const result = world.handleWorldInner({ connectionId: 1, accountId: 'a', inner: req });
  assert.ok(result, '0x032a must be routed (not null — else popup never opens & client retries)');
  assert.equal(result.kind, 'admission');
  assert.equal(result.responses.length, 1);
  assert.equal(readMsg32Code(result.responses[0].inner), 0x032b);
  assert.deepEqual(result.responses[0].targets, [1]);
  assert.equal(result.responses[0].isMsg32, true);
});

test('0x032b response body is exactly 2804 bytes (0xaf4) with count=1', () => {
  const world = createWorldSession();
  world.seedPlayer({ connectionId: 1, characterId: 5, unitId: 8, power: 2, inWorld: true });
  const req = Buffer.alloc(2);
  req.writeUInt16BE(0x032a, 0);
  const result = world.handleWorldInner({ connectionId: 1, accountId: 'a', inner: req });
  const body = msg32Body(result.responses[0].inner);
  assert.equal(body.length, 0xaf4, 'body length exactly 2804 (0xaf4)');
  assert.equal(body.length, 2804, 'body length exactly 2804 (decimal)');
  assert.equal(body.readUInt8(0), 1, 'count field @0x00 must be 1 (0 → empty popup)');
});

test('0x032b element[0] carries player fleet id + faction + mapped practice (BE) from seed', () => {
  // 자기 편성 팝업: id=플레이어 unit[0].id(=gridUnitId), camp=faction,
  // 연성치는 정확 漢字 매핑(指揮/攻撃/防御)만 채우고 나머지는 근거없어 0.
  const characterStore = {
    getCharacters: (acct) =>
      acct === 'inei00'
        ? [{
            id: 7,
            power: 2,
            ability8: [90, 85, 80, 75, 70, 65, 60, 55],
          }]
        : [],
  };
  const world = createWorldSession({ characterStore });
  world.seedPlayer({ connectionId: 1, accountId: 'inei00', characterId: 7, unitId: 8, power: 2, inWorld: true });
  const req = Buffer.alloc(2);
  req.writeUInt16BE(0x032a, 0);
  const result = world.handleWorldInner({ connectionId: 1, accountId: 'inei00', inner: req });
  const body = msg32Body(result.responses[0].inner);
  const base = 4; // OUTFIT_HEADER: element[0] = body+4
  assert.equal(body.readUInt32BE(base + 0x00), 8, 'element id (BE) == player unit[0].id');
  assert.equal(body.readUInt8(base + 0x06), 2, 'camp == player faction');
  // 정확 漢字 매핑: command(指揮)=ability8[4]=70, offence(攻撃)=ability8[6]=60, defence(防御)=ability8[7]=55
  assert.equal(body.readUInt8(base + 0x12), 70, 'practice_command <- ability8[4] (指揮)');
  assert.equal(body.readUInt8(base + 0x13), 60, 'practice_offence <- ability8[6] (攻撃)');
  assert.equal(body.readUInt8(base + 0x14), 55, 'practice_defence <- ability8[7] (防御)');
  // 대응 능력치 없는 연성치는 0 (날조 금지)
  assert.equal(body.readUInt8(base + 0x10), 0, 'practice_warp = 0 (no basis)');
  assert.equal(body.readUInt8(base + 0x11), 0, 'practice_speed = 0 (機動≠速度)');
  assert.equal(body.readUInt8(base + 0x16), 0, 'practice_search = 0 (情報≠索敵)');
});

test('isAdmissionRequestCode(0x032a) is true so playable-server routes it to world (not lobby)', () => {
  assert.equal(isAdmissionRequestCode(0x032a), true);
});

test('handleWorldInner still returns null for a genuinely unknown code', () => {
  const world = createWorldSession();
  world.seedPlayer({ connectionId: 1, characterId: 5, unitId: 8, inWorld: true });
  const req = Buffer.alloc(2);
  req.writeUInt16BE(0x7abc, 0);
  const result = world.handleWorldInner({ connectionId: 1, accountId: 'a', inner: req });
  assert.equal(result, null);
});

test('reconnect: enterWorld on a new connectionId rebinds session player by account', () => {
  // 실클라는 월드 진입 시 로비 소켓(conn2)을 닫고 새 소켓(conn3)으로 재접속한다.
  // handleSessionLogin 은 플레이어를 conn2 에 등록했지만 enterWorld 는 conn3 에서 온다.
  // account 기준으로 세션 플레이어를 찾아 현재 connectionId 로 재바인딩해야 한다.
  const world = createWorldSession();
  const req = Buffer.alloc(10);
  req.writeUInt16BE(0x2009, 0);
  req.writeUInt32LE(1, 2);
  req.writeUInt32LE(7, 6);
  world.handleSessionLogin({
    connectionId: 2,
    accountId: 'inei00',
    inner: req,
    character: { id: 7, unitId: 3, cell: 2588 },
  });
  // conn2 는 닫혔고 conn3 으로 0x0205/enterWorld 도착 — account 로 재바인딩
  const req205 = Buffer.alloc(2);
  req205.writeUInt16BE(CODE_SS_GAME_LOGIN_REQ, 0);
  const result = world.handleWorldInner({ connectionId: 3, accountId: 'inei00', inner: req205 });
  assert.equal(result.kind, 'world-enter');
  assert.equal(result.player.connectionId, 3);
  assert.equal(result.player.characterId, 7);
  assert.equal(result.player.inWorld, true);
  // 플레이어 맵도 conn3 으로 이동, conn2 는 비워짐
  assert.equal(world.getPlayer(3)?.characterId, 7);
  assert.equal(world.getPlayer(2), null);
});

test('reconnect guard: unknown account on new connection still refuses synthetic character', () => {
  const world = createWorldSession();
  const req = Buffer.alloc(10);
  req.writeUInt16BE(0x2009, 0);
  req.writeUInt32LE(1, 2);
  req.writeUInt32LE(7, 6);
  world.handleSessionLogin({
    connectionId: 2,
    accountId: 'inei00',
    inner: req,
    character: { id: 7, unitId: 3, cell: 2588 },
  });
  // 미상 account 의 새 연결은 재바인딩 대상 없음 → 예외 유지
  assert.throws(
    () => world.enterWorld({ connectionId: 9, accountId: 'ghost99' }),
    /no session player/,
  );
  // account 자체가 미상(null)이면 여전히 거부
  assert.throws(
    () => world.enterWorld({ connectionId: 9 }),
    /no session player/,
  );
});

test('reconnect guard: create-pending account cannot enter world on rebind', () => {
  // account 는 알지만 실제 캐릭터 없이 create-pending 만 등록된 경우 월드 진입 거부.
  const world = createWorldSession();
  const short = Buffer.alloc(4);
  short.writeUInt16BE(0x2009, 0);
  short.writeUInt16LE(1, 2);
  world.handleSessionLogin({
    connectionId: 2,
    accountId: 'inei00',
    inner: short,
    character: null,
  });
  assert.throws(
    () => world.enterWorld({ connectionId: 3, accountId: 'inei00' }),
    /create-pending/,
  );
});

test('authoritative move updates cell and notifies both sessions', () => {
  const world = createWorldSession();
  world.seedPlayer({ connectionId: 1, characterId: 1, unitId: 1, cell: 2588, inWorld: true });
  world.seedPlayer({ connectionId: 2, characterId: 2, unitId: 2, cell: 100, inWorld: true });

  const moveInner = Buffer.alloc(10);
  moveInner.writeUInt16BE(0x0b01, 0);
  moveInner.writeUInt32LE(1, 2);
  moveInner.writeUInt32LE(2597, 6);

  const result = world.handleMoveCommand({ connectionId: 1, inner: moveInner });
  assert.equal(result.cell, 2597);
  assert.equal(world.getPlayer(1).cell, 2597);
  assert.equal(world.getPlayer(2).cell, 100); // observer unchanged
  assert.ok(result.recipients.includes(1));
  assert.ok(result.recipients.includes(2));
  assert.equal(readMsg32Code(result.notify), CODE_NOTIFY_MOVED_GRID);
  assert.equal(msg32Body(result.notify).readUInt32LE(0x14), 1);
  assert.equal(msg32Body(result.notify).readUInt32LE(0x18), 2597);
});

test('move rejects when not in world', () => {
  const world = createWorldSession();
  world.seedPlayer({ connectionId: 1, characterId: 1, unitId: 1, inWorld: false });
  const moveInner = Buffer.alloc(10);
  moveInner.writeUInt16BE(0x0b01, 0);
  moveInner.writeUInt32LE(1, 2);
  moveInner.writeUInt32LE(1, 6);
  assert.throws(() => world.handleMoveCommand({ connectionId: 1, inner: moveInner }), /not in world/);
});

test('chat broadcasts to dual in-world sessions', () => {
  const world = createWorldSession();
  world.seedPlayer({ connectionId: 1, characterId: 1, unitId: 1, inWorld: true });
  world.seedPlayer({ connectionId: 2, characterId: 2, unitId: 2, inWorld: true });
  const chatRaw = Buffer.alloc(2 + 0x8c);
  chatRaw.writeUInt16BE(0x0f1c, 0);
  chatRaw.writeUInt32LE(0, 2);
  chatRaw.writeUInt32LE(0, 6);
  chatRaw.writeUInt8(0, 10);
  chatRaw.writeUInt8(2, 11); // msgLen
  chatRaw.writeUInt16LE('O'.charCodeAt(0), 12);
  chatRaw.writeUInt16LE('K'.charCodeAt(0), 14);
  const result = world.handleChatCommand({ connectionId: 1, inner: chatRaw });
  assert.equal(result.text, 'OK');
  assert.deepEqual(result.recipients.sort(), [1, 2]);
});

test('shipped login-success path decodes keysetup 0x0031 and redirect 0x7001', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'logh7-login-'));
  const { writeFile } = await import('node:fs/promises');
  const accountsPath = join(dir, 'accounts.json');
  await writeFile(accountsPath, JSON.stringify({ accounts: [{ accountId: 'inei00', password: 'dummy' }] }), 'utf8');
  try {
    const result = runLoginSuccessPath({ accountsPath });
    assert.equal(result.ok, true);
    assert.equal(result.keysetupInnerCode, 0x0031);
    assert.equal(result.redirectInnerCode, 0x7001);
    const cred = parseGin7CredentialInner(SAMPLE_CREDENTIAL_INNER);
    assert.equal(result.account, cred.account);
    assert.ok(result.gin7KeyHex.length > 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('full login→roster→world→move pipeline (shipped codecs) dual-session', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'logh7-pipe-'));
  try {
    const { writeFile } = await import('node:fs/promises');
    const accountsPath = join(dir, 'accounts.json');
    await writeFile(accountsPath, JSON.stringify({ accounts: [{ accountId: 'inei00', password: 'dummy' }] }), 'utf8');
    const result = runLoginWorldMpSequence({
      storePath: join(dir, 'chars.json'),
      accountsPath,
      moveCell: 2600,
      dualSessions: true,
      seedCharacter: {
        power: 1,
        lastname: 'Fixture',
        firstname: 'One',
        face: 1,
        rank: 0x0d,
      },
    });
    assert.equal(result.ok, true);
    assert.equal(result.login.redirectInnerCode, 0x7001);
    assert.ok(result.worldEntryCodes.includes(0x0323));
    assert.ok(result.worldEntryCodes.includes(0x0325));
    assert.equal(result.move.cell, 2600);
    assert.ok(result.move.recipients.includes(2));
    assert.equal(result.move.notifyBytes, 0x244);
    const mover = result.players.find((p) => p.connectionId === 1);
    assert.equal(mover.cell, 2600);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// ─── 월드-ready push 시퀀스 (NOW LOADING 해제) ─────────────────────────────────
// 근거: docs/logh7-loop-state.md "M3 블로커 해법 발견: 서버가 world-ready 시퀀스를 PUSH해야"
//   + docs/reference/restored-from-git/logh7-live-world-entry-2026-06-23.md:9 성공 트레이스
//   + docs/reference/legacy-evidence/logh7-render-interaction-contract.md:102 grid-enter 계약.
// 클라가 0x0304/0x0306/0x0314 3요청 후 NOW LOADING 에서 정지 → 서버가 그리드진입+월드초기화를
// 능동 push 해야 해제. 계약(render-contract L102): "0x0b09/0x0b0a grid-enter begin/end,
//   with 0x0325/0x0323 refreshed between begin/end". 즉 0x0325(유닛)와 0x0323(캐릭터 refresh)는
//   반드시 begin/end 괄호 **사이**에 온다 — 유닛/오브젝트 테이블 갱신이 begin/end 안에서 일어나야
//   그리드가 플레이어 유닛을 배치. 클라 0x0314(→0x0315) 직후 순서:
//   0x0b09(begin) → 0x0325(유닛) + 0x0323(캐릭터 refresh) → 0x0b0a(end, 렌더 트리거) → 0x0f03(GridInit OK).
// 순서 엄수: 0x0f03(월드초기화)는 반드시 0x0b0a 이후 (render-contract: 조기 push 크래시).

test('buildWorldReadyPushInners pushes 0x0325×1 + 0x0323×1 inside 0x0b09/0x0b0a with flagship↔unit alignment', () => {
  // M3 수정 확정(docs/logh7-loop-state.md "0x0323 flagship(+0x24)=0x0325 unit id(+0x04) 정합"):
  // 클라 FUN_004c2a80 는 선택 char 의 flagship(+0x24)을 unit id(+0x04)와 링크해 플레이어 오브젝트를
  // 빌드한다. 링크가 성립하면 오브젝트 테이블(clientBase+0xc)이 채워져 NOW LOADING 이 해제된다.
  // 이전 P7 ×2 재전송은 정합이 아니라 타이밍 추측이었고 중복 스텁을 만든다 — 각 레코드 정확히 1회로
  // 되돌리되 정합(flagship==unit id)과 count≥1 을 계약으로 고정한다.
  const inners = buildWorldReadyPushInners({ unitId: 8, unitCell: 2588, commander: 5 });
  const codes = inners.map((i) => readMsg32Code(i));
  // 계약 순서(render-contract L102): begin → 0x0325(유닛) + 0x0323(캐릭터) → end → grid-init OK.
  assert.deepEqual(codes, [
    CODE_NOTIFY_ENTER_GRID_BEGIN,
    CODE_INFO_UNIT,
    CODE_INFO_CHARACTER,
    CODE_NOTIFY_ENTER_GRID_END,
    CODE_GRID_INIT_OK,
  ]);
  const iBegin = codes.indexOf(CODE_NOTIFY_ENTER_GRID_BEGIN);
  const iEnd = codes.indexOf(CODE_NOTIFY_ENTER_GRID_END);
  const iInit = codes.indexOf(CODE_GRID_INIT_OK);
  // 각 정확히 1회 (×2 아님 — 중복 스텁 방지)
  assert.equal(codes.filter((c) => c === CODE_INFO_UNIT).length, 1, '0x0325 exactly once');
  assert.equal(codes.filter((c) => c === CODE_INFO_CHARACTER).length, 1, '0x0323 exactly once');
  for (let i = 0; i < codes.length; i += 1) {
    if (codes[i] === CODE_INFO_UNIT || codes[i] === CODE_INFO_CHARACTER) {
      assert.ok(i > iBegin && i < iEnd, `refresh @${i} must sit between begin/end`);
    }
  }
  assert.ok(iInit > iEnd, '0x0f03 world-init must come AFTER 0x0b0a (early push crashes)');
  // ★정합(정본 aligned BE): 0x0323 flagship(body+0x24 BE) == 0x0325 unit[0].id(body+0x04 BE) AND count≥1.
  const unitRec = inners.find((i) => readMsg32Code(i) === CODE_INFO_UNIT);
  const charRec = inners.find((i) => readMsg32Code(i) === CODE_INFO_CHARACTER);
  const unitBody = msg32Body(unitRec);
  const charBody = msg32Body(charRec);
  assert.ok(unitBody.readUInt16BE(0x00) >= 1, '0x0325 count ≥ 1 (unit array non-empty, BE)');
  assert.equal(unitBody.readUInt32BE(0x04), 8, 'unit[0].id(+0x04 BE) = real fleet id');
  assert.equal(
    charBody.readUInt32BE(0x24),
    unitBody.readUInt32BE(0x04),
    'char flagship(+0x24 BE) must equal unit[0].id(+0x04 BE) — client char→flagship→unit link',
  );
});

test('buildWorldReadyPushInners without commander still pushes 0x0325×1 (no char record)', () => {
  const inners = buildWorldReadyPushInners({ unitId: 8, unitCell: 2588, commander: 0 });
  const codes = inners.map((i) => readMsg32Code(i));
  assert.equal(codes.filter((c) => c === CODE_INFO_UNIT).length, 1, '0x0325 exactly once w/o commander');
  assert.equal(codes.filter((c) => c === CODE_INFO_CHARACTER).length, 0, '0x0323 requires commander>0');
});

test('buildWorldReadyPushInners early-grid (LOGH_STRAT_GRID_EARLY) prepends real 0x0313 before begin', () => {
  const inners = buildWorldReadyPushInners({ unitId: 8, commander: 5, includeEarlyGridType: true });
  const codes = inners.map((i) => readMsg32Code(i));
  assert.equal(codes[0], 0x0313, 'early 0x0313 grid-type comes first (before 0x0b09)');
  assert.ok(codes.indexOf(0x0313) < codes.indexOf(CODE_NOTIFY_ENTER_GRID_BEGIN), 'grid-type before begin');
  const gridType = inners[0];
  assert.equal(msg32Body(gridType).length, 0x138c);
  assert.ok(msg32Body(gridType).readUInt8(0) > 0, 'early grid-type carries real palette (count>0)');
});

test('buildWorldReadyPushInners requires a real unitId (no synthetic id)', () => {
  assert.throws(() => buildWorldReadyPushInners({ unitId: 0 }));
});

// 0x0315 RLE body(고정 5004B: [u8 w][u8 h][u16LE rleLen][(runLen,cellType)…])를 5000셀 배열로 디코드.
function decodeStaticGrid(body) {
  const w = body.readUInt8(0);
  const h = body.readUInt8(1);
  const rleLen = body.readUInt16LE(2);
  const cells = [];
  let off = 4;
  const end = 4 + rleLen;
  while (off + 1 < end && cells.length < w * h) {
    const run = body.readUInt8(off);
    const value = body.readUInt8(off + 1);
    off += 2;
    for (let i = 0; i < run; i += 1) cells.push(value);
  }
  return { w, h, cells };
}

test('handleWorldInner 0x0314 는 정본 갤럭시 셀(성계 마커 + 항법공간)을 0x0315 로 싣는다 (no push)', () => {
  // 월드-init 핸드셰이크 복원: 0x0314 는 static-info(0x0315)만 돌려준다. world-ready push/0x0f03 을
  // 여기 실으면 클라가 0x0f00→0x0f02 를 건너뛰고 NOW LOADING 에 정지한다. 스폰은 0x0f02 로 이동.
  const world = createWorldSession();
  world.seedPlayer({ connectionId: 1, characterId: 5, unitId: 8, cell: 2588, inWorld: true });
  const req = Buffer.alloc(2);
  req.writeUInt16BE(CODE_REQ_STATIC_GRID, 0); // 0x0314
  const result = world.handleWorldInner({ connectionId: 1, accountId: 'a', inner: req });
  assert.ok(result, '0x0314 must be routed');
  assert.equal(result.kind, 'admission');
  const codes = result.responses.map((r) => readMsg32Code(r.inner));
  assert.deepEqual(codes, [0x0315], '0x0314 = single static-info 0x0315 (no world-ready push, no 0x0f03)');
  const gridBody = msg32Body(result.responses[0].inner);
  assert.equal(gridBody.length, 0x138c);
  const grid = decodeStaticGrid(gridBody);
  assert.equal(grid.cells.length, 5000, 'ΣrunLen == 100*50 (full coverage, no crash)');
  // 85개 성계 마커 셀(value≥3) + 다수 항법공간(value 1). 플레이어 스폰 cell 2588=ヴァルハラ 성계.
  const markers = grid.cells.filter((v) => v >= 3).length;
  assert.equal(markers, 85, '85개 성계 마커 셀 배치');
  assert.ok(grid.cells.filter((v) => v === 1).length > 3000, '항법공간 셀 다수');
  assert.notEqual(grid.cells[2588], 0, '플레이어 스폰 cell 항법가능(배경 0 아님)');
  assert.deepEqual(result.responses[0].targets, [1]);
  assert.equal(result.responses[0].isMsg32, true);
});

test('handleWorldInner 0x0314 는 플레이어 없어도 갤럭시 마커를 싣는다 (성계는 플레이어 무관)', () => {
  const world = createWorldSession();
  const req = Buffer.alloc(2);
  req.writeUInt16BE(CODE_REQ_STATIC_GRID, 0);
  const result = world.handleWorldInner({ connectionId: 9, accountId: 'z', inner: req });
  assert.ok(result, '0x0314 still routed even without player');
  const codes = result.responses.map((r) => readMsg32Code(r.inner));
  assert.deepEqual(codes, [0x0315], 'no player → reactive 0x0315 only');
  const grid = decodeStaticGrid(msg32Body(result.responses[0].inner));
  assert.equal(grid.cells.length, 5000, 'Σrun 5000 불변식');
  assert.equal(grid.cells.filter((v) => v >= 3).length, 85, '플레이어 없어도 85 성계 마커');
});

// ─── 정적정보 워크 전 요청 응답 커버리지 + wire 크기 정합 (NOW LOADING 게이트) ────
// 근거: docs/logh7-now-loading-gate-re.md §5 워크 전송 순서 표.
// 클라 로더(FUN_004b76e0)는 각 요청의 짝 응답을 "정확한 코드 + 정확한 고정 크기"로 받아야
// 대기 응답 큐(clientBase+0x357ec0)가 팝되어 다음 스텝으로 진행한다(FUN_004ba2b0 tail:
// 코드 정확일치 + owner-id -1/self). 정적정보 응답 핸들러는 전부 owner-id=-1 이므로
// stuck 은 오직 (A) 코드 불일치 또는 (B) 크기 불일치(recv 프레이밍 붕괴)로만 발생.
// 아래 표는 워크의 전 요청→응답과 클라 사이저(FUN_004b8b00) 고정 body 크기를 잠근다.
//
// [req, resp, respBodyBytes] — §5 워크 전송 순서대로. 0x0314→0x0315 가 현재 블로커 지점.
const STATIC_INFO_WALK = [
  [0x0304, 0x0305, 0x520a], // InformationSession walker (21002B)
  [0x0306, 0x0307, 0xe5b2], // Duty walker (58802B)
  [0x0314, 0x0315, 0x138c], // ★ ResponseStaticInformationGrid (라이브 정지 지점, 5004B)
  [0x0312, 0x0313, 0x138c], // ResponseStaticInformationGridType (5004B)
  [0x030a, 0x030b, 0x6d64], // 28004B
  [0x0310, 0x0311, 0x01b0], // 432B
  [0x030e, 0x030f, 0x0034], // 52B
  [0x031c, 0x031d, 0x520c], // static-base (21004B)
  [0x0308, 0x0309, 0x055c], // 1372B
  [0x030c, 0x030d, 0x0184], // 388B
  [0x0300, 0x0301, 0x0004], // ResponseTime (4B LE start time)
  [0x0f00, 0x0f01, 0x0001], // WorldInitialize_OK (status=1)
  [0x0f02, 0x0f03, 0x0001], // GridInitialize_OK (status=1)
];

test('static-info walk: every walk request routes to its exact paired response with client-table wire size', () => {
  for (const [req, resp, bytes] of STATIC_INFO_WALK) {
    const world = createWorldSession();
    world.seedPlayer({ connectionId: 1, characterId: 5, unitId: 8, cell: 2588, inWorld: true });
    const reqBuf = Buffer.alloc(2);
    reqBuf.writeUInt16BE(req, 0);
    const result = world.handleWorldInner({ connectionId: 1, accountId: 'a', inner: reqBuf });
    const rh = `0x${req.toString(16)}`;
    const sh = `0x${resp.toString(16)}`;
    assert.ok(result, `${rh} must be routed (not null — else it leaks to lobby → no response → NOW LOADING stall)`);
    const frames = result.responses.map((r) => ({ code: readMsg32Code(r.inner), bytes: msg32Body(r.inner).length }));
    const paired = frames.find((f) => f.code === resp);
    assert.ok(paired, `${rh} → ${sh}: paired response present (got ${frames.map((f) => '0x' + f.code.toString(16)).join(',')})`);
    assert.equal(paired.bytes, bytes, `${sh} body must be ${bytes}B (client fixed-size framing) — got ${paired.bytes}`);
  }
});

test('static-info walk: pure reactive codes emit exactly one paired frame (no early-send desync)', () => {
  // 0x0f02 만 의도적 스폰 버스트(G164, 다중 프레임 — 0x0f03 맨 마지막). 나머지는 요청당 정확히
  // 1 프레임(짝 응답)이어야 한다. 조기전송(예: 0x0314 에 0x0f03 동봉)은 워크 큐 헤드가 기대하는
  // 코드와 불일치해 매칭 실패 → 큐 안 비워짐 → 다음 스텝 정지(desync). 요청-응답 페어링 강제.
  for (const [req, resp] of STATIC_INFO_WALK) {
    if (req === 0x0f02) continue; // 의도적 스폰 버스트 — 별도 테스트가 순서/유일성 검증
    const world = createWorldSession();
    world.seedPlayer({ connectionId: 1, characterId: 5, unitId: 8, cell: 2588, inWorld: true });
    const reqBuf = Buffer.alloc(2);
    reqBuf.writeUInt16BE(req, 0);
    const result = world.handleWorldInner({ connectionId: 1, accountId: 'a', inner: reqBuf });
    const rh = `0x${req.toString(16)}`;
    assert.equal(result.responses.length, 1, `${rh} emits exactly one reactive frame (no batch/early-send)`);
    assert.equal(readMsg32Code(result.responses[0].inner), resp, `${rh} single frame = 0x${resp.toString(16)}`);
  }
});

test('static-info walk: isAdmissionRequestCode true for all walk request codes (routed to world, not lobby)', () => {
  // playable-server 는 isAdmissionRequestCode 로 world/lobby 라우팅을 가른다. false 면 lobby 로
  // 새어 응답 없음 → 클라가 짝 응답을 무한 대기(NOW LOADING). 전 요청 코드가 world 로 가야 한다.
  for (const [req] of STATIC_INFO_WALK) {
    assert.equal(
      isAdmissionRequestCode(req),
      true,
      `0x${req.toString(16)} must route to world (else lobby leak → no response → NOW LOADING)`,
    );
  }
});
