// 멀티플레이 함대 가시성(2:2 제국2·동맹2) 오라클 — 감사 확정 갭의 서버측 동작을 검증한다.
//   C2 broadcast : 신규 입장자 함대를 기존 전원에 push + 기존 함대를 입장자에 push (worldRelay 가짜 콜백)
//   C3 faction   : req.power(클라 power 바이트)를 콘텐츠팩 nation으로 일원화(round-robin 대체)
//   C4 loopback  : 루프백 계정 바인딩 키를 (IP,port)로 격리(같은 머신 4클라 충돌 방지)
// 게이트 LOGH_MP_VISIBILITY가 OFF면 기존 동작이 그대로다(별도 OFF 단언 + 1107 그린).
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  loopbackBindingKey,
  nationForPowerByte,
} from '../../src/server/logh7-auth-server.mjs';
import { createWorldState } from '../../src/server/logh7-world-state.mjs';
import { createWorldRelay } from '../../src/server/logh7-world-relay.mjs';
import { buildInformationUnitRecordInner } from '../../src/server/logh7-login-protocol.mjs';

// 0x0325 parser-stream 와이어에서 함대 id 목록을 디코드한다(검증용 최소 디코더).
// 레이아웃: payload[0..1]=u16 BE count, 이후 unit[i]는 offset 2 + i*0x58, 각 element id=u32 BE @ +0x00.
function decodeUnitFleetIds(inner) {
  assert.equal(inner.readUInt16BE(4), 0x0325, '0x0325 ResponseInformationUnit 코드');
  const payload = inner.subarray(6);
  const count = payload.readUInt16BE(0);
  const ids = [];
  for (let i = 0; i < count; i += 1) {
    const base = 2 + i * 0x58;
    if (base + 4 > payload.length) break;
    ids.push(payload.readUInt32BE(base));
  }
  return { count, ids };
}

// auth-server의 syncMultiplayerFleets 핵심 로직(순수 합성)을 재현한다 — 실제 코드와 동일한 builder/relay를
// 쓰되 0x0030 프레이밍/소켓만 가짜 콜백으로 대체. (a)입장자 함대 broadcast + (b)기존 함대를 입장자에 push.
function syncMultiplayerFleets({ worldState, worldRelay, connectionId, myFleetId, pushToJoiner }) {
  const allFleets = worldState.listFleets();
  const myFleet = allFleets.find((f) => f.id === myFleetId);
  if (!myFleet) return null;
  // (a) joiner -> 기존 전원
  const joinerInner = buildInformationUnitRecordInner({ wireLayout: 'parser-stream', fleets: [myFleet] });
  const deliveredToPeers = worldRelay.broadcast(connectionId, joinerInner);
  // (b) 기존 전원 -> joiner
  const existingFleets = allFleets.filter((f) => f.id !== myFleetId);
  if (existingFleets.length > 0) {
    const existingInner = buildInformationUnitRecordInner({ wireLayout: 'parser-stream', fleets: existingFleets });
    pushToJoiner(existingInner);
  }
  return { deliveredToPeers, existingFleets: existingFleets.length };
}

test('C2: 두 입장자 world-join — joiner는 기존 함대를 받고 기존 클라는 joiner 함대를 받는다(상호 가시)', () => {
  const worldState = createWorldState();
  const worldRelay = createWorldRelay();
  // 가짜 연결 콜백: 각 연결이 relay로 받은 inner를 수집.
  const received = { 10: [], 20: [] };
  worldRelay.register(10, (inner) => received[10].push(inner));
  worldRelay.register(20, (inner) => received[20].push(inner));

  // --- 입장자 #1(제국, conn 10): 함대 등록 후 동기화. 기존 함대 없음 → joiner push 없음. ---
  worldState.upsertFleet({ id: 0xa001, commander: 101, faction: 1, cell: 2588, owner: 1, mapSection: 70 });
  const pushedToConn10 = [];
  const r1 = syncMultiplayerFleets({
    worldState, worldRelay, connectionId: 10, myFleetId: 0xa001,
    pushToJoiner: (inner) => pushedToConn10.push(inner),
  });
  assert.equal(r1.deliveredToPeers, 1, 'conn 20에 broadcast(아직 빈 함대 받는 쪽)');
  // conn20이 conn10의 함대(0xa001)를 받았다.
  assert.equal(received[20].length, 1);
  assert.deepEqual(decodeUnitFleetIds(received[20][0]).ids, [0xa001]);
  assert.equal(r1.existingFleets, 0, '첫 입장자에겐 기존 함대 없음');
  assert.equal(pushedToConn10.length, 0, 'joiner push 없음(기존 함대 0)');

  // --- 입장자 #2(동맹, conn 20): 함대 등록 후 동기화. 기존(conn10) 함대를 joiner에 push. ---
  worldState.upsertFleet({ id: 0xb002, commander: 202, faction: 2, cell: 2014, owner: 2, mapSection: 7 });
  const pushedToConn20 = [];
  const r2 = syncMultiplayerFleets({
    worldState, worldRelay, connectionId: 20, myFleetId: 0xb002,
    pushToJoiner: (inner) => pushedToConn20.push(inner),
  });
  // conn10이 conn20의 함대(0xb002)를 broadcast로 받았다(joiner -> 기존).
  assert.equal(r2.deliveredToPeers, 1);
  assert.equal(received[10].length, 1);
  assert.deepEqual(decodeUnitFleetIds(received[10][0]).ids, [0xb002]);
  // conn20(joiner)이 기존 함대(conn10의 0xa001)를 push로 받았다(기존 -> joiner).
  assert.equal(r2.existingFleets, 1);
  assert.equal(pushedToConn20.length, 1);
  assert.deepEqual(decodeUnitFleetIds(pushedToConn20[0]).ids, [0xa001]);
});

test('C2: 4클라(제국2·동맹2) — 마지막 입장자는 기존 3함대 전부를 받고, 기존 3클라는 입장자 함대를 받는다', () => {
  const worldState = createWorldState();
  const worldRelay = createWorldRelay();
  const received = { 1: [], 2: [], 3: [], 4: [] };
  for (const id of [1, 2, 3, 4]) worldRelay.register(id, (inner) => received[id].push(inner));

  // 제국2(conn1,2)·동맹2(conn3,4) 순차 입장.
  const fleets = [
    { conn: 1, fleetId: 0xf001, faction: 1 },
    { conn: 2, fleetId: 0xf002, faction: 1 },
    { conn: 3, fleetId: 0xf003, faction: 2 },
    { conn: 4, fleetId: 0xf004, faction: 2 },
  ];
  const pushed = { 1: [], 2: [], 3: [], 4: [] };
  for (const { conn, fleetId, faction } of fleets) {
    worldState.upsertFleet({ id: fleetId, commander: conn * 10, faction, cell: 100 + conn, owner: faction, mapSection: conn });
    syncMultiplayerFleets({
      worldState, worldRelay, connectionId: conn, myFleetId: fleetId,
      pushToJoiner: (inner) => pushed[conn].push(inner),
    });
  }

  // 마지막 입장자(conn4)는 push로 기존 3함대(0xf001..0xf003)를 받았다.
  assert.equal(pushed[4].length, 1);
  assert.deepEqual(decodeUnitFleetIds(pushed[4][0]).ids.sort(), [0xf001, 0xf002, 0xf003]);
  // conn1은 자기 입장 후 conn2/3/4 입장 broadcast를 순차로 3번 받았다(상호 가시 완성).
  assert.equal(received[1].length, 3);
  assert.deepEqual(received[1].flatMap((inner) => decodeUnitFleetIds(inner).ids).sort(), [0xf002, 0xf003, 0xf004]);
  // worldState엔 4함대가 모두 공유됨(권위적 단일 출처).
  assert.equal(worldState.fleetCount(), 4);
});

test('C2 leave: 떠난 함대를 worldState에서 제거하고 남은 테이블을 re-broadcast하면 다른 클라가 드롭한다', () => {
  const worldState = createWorldState();
  const worldRelay = createWorldRelay();
  const received = { 1: [], 2: [] };
  worldRelay.register(1, (inner) => received[1].push(inner));
  worldRelay.register(2, (inner) => received[2].push(inner));
  worldState.upsertFleet({ id: 0xc001, faction: 1, cell: 10 });
  worldState.upsertFleet({ id: 0xc002, faction: 2, cell: 20 });

  // conn1 leave: 0xc001 제거 후 남은 테이블 re-broadcast.
  worldState.removeFleet(0xc001);
  const remainingInner = buildInformationUnitRecordInner({ wireLayout: 'parser-stream', fleets: worldState.listFleets() });
  const delivered = worldRelay.broadcast(1, remainingInner);

  assert.equal(delivered, 1, 'conn2에 갱신 테이블 전달(자기 제외)');
  assert.equal(worldState.fleetCount(), 1);
  const decoded = decodeUnitFleetIds(received[2][0]);
  assert.deepEqual(decoded.ids, [0xc002], '떠난 함대(0xc001)는 빠지고 0xc002만 남음');
});

test('C3 nationForPowerByte: power 바이트를 콘텐츠팩 nation으로 일원화(기본팩 id=클라 power 코드)', () => {
  const defaultNations = [
    { id: 0x500, name: 'Galactic Empire' },
    { id: 0x501, name: 'Free Planets Alliance' },
  ];
  assert.equal(nationForPowerByte(defaultNations, 1).id, 0x500, 'power 1=제국 -> 0x500');
  assert.equal(nationForPowerByte(defaultNations, 2).id, 0x501, 'power 2=동맹 -> 0x501');
  // 커스텀 팩(id가 power 코드와 무관)은 이름으로 진영 추정.
  const customNations = [
    { id: 11, name: '은하제국(Empire)' },
    { id: 22, name: '자유행성동맹 Alliance' },
  ];
  assert.equal(nationForPowerByte(customNations, 1).id, 11, '이름으로 제국 매칭');
  assert.equal(nationForPowerByte(customNations, 2).id, 22, '이름으로 동맹 매칭');
  // 매핑 불가(0/미지/빈 배열) -> null(호출부가 round-robin 폴백).
  assert.equal(nationForPowerByte(defaultNations, 0), null, 'power 0 -> null');
  assert.equal(nationForPowerByte(defaultNations, 3), null, '미지 power -> null');
  assert.equal(nationForPowerByte([], 1), null, '빈 nations -> null');
});

test('C4 reconcileWorldNation: ss-response 조기등록(제국)을 캐릭터 생성 후 동맹으로 정정(함선 소유 재배정·멱등)', () => {
  // ★라이브 2026-06-22 확정 버그: registerInWorld가 ss-response(0x0200 세션연결) 시점에 호출되는데, 캐릭터
  // 생성(0x1008 requestCategory0=진영선택)보다 17초 먼저라 그 순간 worldPlayerInfo().power가 기본(제국) 시드
  // 캐릭터의 power다 → 동맹 클라까지 전부 제국(powerId 0x500)으로 등록됨(4클라 world-join 전부 1280). 캐릭터
  // 생성 후 worldPlayerInfo().power가 확정되면 reconcileWorldNation이 등록 nation·함선 소유를 정정한다.
  const worldState = createWorldState();
  const nations = [
    { id: 0x500, name: 'Galactic Empire' },
    { id: 0x501, name: 'Free Planets Alliance' },
  ];
  // 콘텐츠팩 stub: 진영별 유닛(제국 2척·동맹 2척)을 worldState에 시드.
  const unitsByNation = { 0x500: [{ id: 0xe001 }, { id: 0xe002 }], 0x501: [{ id: 0xa001 }, { id: 0xa002 }] };
  const unitsForNation = (nid) => unitsByNation[nid] ?? [];
  for (const nid of [0x500, 0x501]) {
    for (const u of unitsForNation(nid)) worldState.upsertShip({ id: u.id, faction: nid === 0x500 ? 1 : 2 });
  }
  // auth-server reconcileWorldNation 핵심(순수 재현 — 실제 worldState/nationForPowerByte 사용). 반환=실제로 정정했는지.
  const reconcile = (connectionId, powerByte) => {
    const nation = nationForPowerByte(nations, powerByte);
    if (!nation) return false; // 매핑 실패 → round-robin 유지.
    const player = worldState.getPlayer(connectionId);
    if (!player || player.powerId === nation.id) return false; // 이미 정합 → no-op.
    worldState.releaseShipsOf(connectionId);
    worldState.addPlayer({ connectionId, charId: connectionId, powerId: nation.id });
    for (const u of unitsForNation(nation.id)) worldState.claimShip(u.id, connectionId);
    return true;
  };
  const ownedBy = (conn) => worldState.listShips().filter((s) => s.owner === conn).map((s) => s.id).sort();

  // --- 1) registerInWorld 조기실행(ss-response, 캐릭터 생성 전): 동맹 클라(conn 12)가 기본 제국으로 등록. ---
  worldState.addPlayer({ connectionId: 12, charId: 12, powerId: 0x500 });
  for (const u of unitsForNation(0x500)) worldState.claimShip(u.id, 12);
  assert.equal(worldState.getPlayer(12).powerId, 0x500, '조기등록=제국(버그 상태)');
  assert.deepEqual(ownedBy(12), [0xe001, 0xe002], '제국 함선이 동맹 클라에 잘못 claim');

  // --- 2) 동맹 캐릭터 생성 후 reconcile: worldPlayerInfo().power=2 → 동맹으로 정정. ---
  assert.equal(reconcile(12, 2), true, '불일치 → 정정 동작');
  assert.equal(worldState.getPlayer(12).powerId, 0x501, '정정 후=동맹');
  assert.deepEqual(ownedBy(12), [0xa001, 0xa002], '동맹 함선이 재claim');
  assert.equal(worldState.getShip(0xe001).owner, 0, '이전 제국 함선은 neutral로 해제');

  // --- 3) 멱등: 같은 power로 다시 reconcile하면 no-op(재배정 없음). ---
  assert.equal(reconcile(12, 2), false, '이미 정합 → no-op');

  // --- 4) 제국 클라(conn 9)는 제국→제국이라 reconcile이 no-op(정상 진영은 불필요한 재배정 없음). ---
  worldState.addPlayer({ connectionId: 9, charId: 9, powerId: 0x500 });
  assert.equal(reconcile(9, 1), false, '제국 플레이어 power=1 → 이미 0x500 → no-op');
  assert.equal(worldState.getPlayer(9).powerId, 0x500, '제국 그대로');
});

test('C4 loopbackBindingKey: 기본은 IP-only(핸드오프 보존), isolate=true면 (IP,port)로 격리', () => {
  // 기본(isolate=false): 같은 IP의 모든 연결이 같은 키 → redirect→world 단일클라 핸드오프 보존.
  assert.equal(loopbackBindingKey({ remoteAddress: '127.0.0.1', remotePort: 5001 }), '127.0.0.1');
  assert.equal(loopbackBindingKey({ remoteAddress: '127.0.0.1', remotePort: 5002 }), '127.0.0.1');
  assert.equal(
    loopbackBindingKey({ remoteAddress: '127.0.0.1', remotePort: 5001 }),
    loopbackBindingKey({ remoteAddress: '127.0.0.1', remotePort: 5002 }),
    'isolate OFF: 같은 IP의 두 연결은 동일 키(기존 동작)',
  );
  // isolate=true(멀티플레이): 같은 머신(127.0.0.1) 4클라가 포트로 격리 → 서로의 바인딩을 덮지 않음.
  const k1 = loopbackBindingKey({ remoteAddress: '127.0.0.1', remotePort: 5001 }, true);
  const k2 = loopbackBindingKey({ remoteAddress: '127.0.0.1', remotePort: 5002 }, true);
  assert.equal(k1, '127.0.0.1:5001');
  assert.equal(k2, '127.0.0.1:5002');
  assert.notEqual(k1, k2, 'isolate ON: 포트가 다르면 키가 격리됨(4클라 충돌 방지)');
});
