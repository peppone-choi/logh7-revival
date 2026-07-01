// logh7-repository: 영속성 포트(memory/sqlite) + JSON seed + world-state 스냅샷 라운드트립 검증.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRepository, composeSnapshot, SNAPSHOT_VERSION } from '../../src/server/logh7-repository.mjs';
import { createWorldState } from '../../src/server/logh7-world-state.mjs';
import { createStrategyState } from '../../src/server/logh7-strategy.mjs';
import { createLogisticsState } from '../../src/server/logh7-logistics.mjs';
import { createPersonnelState } from '../../src/server/logh7-personnel.mjs';
import { createSocialState } from '../../src/server/logh7-social.mjs';
import { createAccountState } from '../../src/server/logh7-account.mjs';
import { createEspionageState } from '../../src/server/logh7-espionage.mjs';

test('memory backend: save→load 라운드트립', () => {
  const repo = createRepository({ backend: 'memory' });
  assert.equal(repo.load(), null, '초기엔 비어 있음');
  const snap = { version: 1, world: { a: 1 } };
  repo.save(snap);
  assert.deepEqual(repo.load(), snap);
  repo.close();
});

test('JSON snapshot seed is read only until SQLite has a runtime snapshot', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'logh7-repo-'));
  const dbPath = join(dir, 'state', 'world.sqlite');
  const seedPath = join(dir, 'seed', 'world.seed.json');
  try {
    const seedSnap = composeSnapshot({ world: { ships: [{ id: 7 }] }, savedAt: 1234 });
    const runtimeSnap = composeSnapshot({ world: { ships: [{ id: 8 }] }, savedAt: 5678 });
    mkdirSync(join(dir, 'seed'), { recursive: true });
    writeFileSync(seedPath, JSON.stringify(seedSnap), 'utf8');

    const repo = createRepository({ backend: 'sqlite', path: dbPath, seedPath });
    assert.deepEqual(repo.load(), seedSnap, '빈 SQLite는 seed JSON에서 초기 상태를 읽음');
    repo.save(runtimeSnap);
    assert.ok(existsSync(dbPath), 'SQLite DB 파일 생성됨');
    assert.deepEqual(repo.load(), runtimeSnap, '한 번 저장되면 SQLite 런타임 스냅샷이 seed보다 우선');
    repo.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('sqlite backend: 단일 스냅샷을 DB 파일에 저장하고 재시작 후 로드한다', () => {
  const dir = mkdtempSync(join(tmpdir(), 'logh7-repo-'));
  const path = join(dir, 'state', 'world.sqlite');
  try {
    const repo = createRepository({ backend: 'sqlite', path });
    assert.equal(repo.load(), null, '초기 DB는 비어 있음');
    const snap = composeSnapshot({
      world: { players: [{ connectionId: 1, charId: 209 }] },
      entities: { economy: { nations: [{ faction: 'empire', treasury: 1200 }] } },
      savedAt: 5678,
    });
    repo.save(snap);
    assert.ok(existsSync(path), 'SQLite DB 파일 생성됨');
    assert.deepEqual(repo.load(), snap, '같은 프로세스에서 동일 복원');
    repo.close();

    const reopened = createRepository({ backend: 'sqlite', path });
    assert.deepEqual(reopened.load(), snap, '재오픈 후 동일 복원');
    reopened.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('알 수 없는 backend는 throw, 후순위 backend는 save에서 명확히 실패', () => {
  assert.throws(() => createRepository({ backend: 'nope' }), /알 수 없는 repository backend/);
  assert.throws(() => createRepository({ backend: 'json' }), /JSON은 seedPath로만/);
  const pg = createRepository({ backend: 'postgres' });
  assert.throws(() => pg.save({}), /미구현/);
});

test('composeSnapshot은 버전/타임스탬프를 붙인다', () => {
  const snap = composeSnapshot({ world: { x: 1 }, entities: { nations: [] }, savedAt: 99 });
  assert.equal(snap.version, SNAPSHOT_VERSION);
  assert.equal(snap.savedAt, 99);
  assert.deepEqual(snap.world, { x: 1 });
  assert.deepEqual(snap.entities, { nations: [] });
});

test('world-state toSnapshot/restore: Map·Set·배열 라운드트립', () => {
  const ws = createWorldState();
  ws.addPlayer({ connectionId: 5, charId: 2, powerId: 1, mode: 2 });
  ws.appendChat({ connectionId: 5, charId: 2, text: '안녕', channel: 0, time: 10 });
  // 함대 1기(직접 Map에 넣는 대신 공개 API 사용).
  if (typeof ws.upsertFleet === 'function') {
    ws.upsertFleet({ id: 0x01000007, owner: 5, faction: 0, commander: 2, cell: 2550, boats: [1, 2], supply: 50, mapSection: 0 });
  }
  ws._strategy = createStrategyState();
  ws._strategy.enqueuePlan(1, { planId: 44, target: 0x0102, owner: 5 });
  ws._strategy.recordOrder(1, { target: 0x0102, message: 7, connectionId: 5 });
  ws._logistics = createLogisticsState();
  ws._logistics.upsertBase({ id: 0x7001, owner: 5, fuel: 900, troops: [31] });
  ws._logistics.upsertFleet({ id: 0x01000007, owner: 5, fuel: 120, fuelCap: 900, troops: [31] });
  ws._personnel = createPersonnelState();
  ws._personnel.addCharacter({ id: 2, owner: 5, rank: 4, spot: 9, title: 3, fiefs: [0x7001] });
  ws._personnel.addOutfit({ id: 0x01000007, owner: 5, chief: 2 });
  ws._personnel.appointCard(0x01000007, { character: 2, role: 1 });
  ws._personnel.addBase({ id: 0x7001, owner: 2, economy: 123, taxRatePct: 15 });
  ws._social = createSocialState();
  ws._social.join(5, 2);
  ws._social.setPresence(5, 3);
  ws._social.addContact(5, 44);
  ws._social.storeMail(5, { recipientId: 2, category: 1, text: 'order', raw: Buffer.from([1, 2, 3]) });
  ws._account = createAccountState();
  ws._account.join(5, { accountId: 500, name: 'acct', owned: [2], available: [3], maxExtensionSlots: 2 });
  ws._account.chargeExtension(5, 10);
  ws.getIntelState().addCoupLoyalty(2, 30);
  ws.getIntelState().addUnitLoyalty(0x01000007, 40);
  ws.getIntelState().setRebellion(0x01000007, 2);
  ws.getCoupState().declareRingleader(2, 1);
  ws._espionage = createEspionageState();
  ws._espionage.authorizeArrest(1, 2);
  ws._espionage.delegateEnforcement(1, 5);
  ws._espionage.arrestOrder(1, 5, 2, { coLocated: true });
  ws._espionage.surveil(5, 2);
  const snap = ws.toSnapshot();
  assert.equal(snap.players.length, 1);
  assert.equal(snap.players[0].connectionId, 5);
  assert.equal(snap.chatLog.length, 1);
  assert.ok(Array.isArray(snap.battle.participants), 'Set은 배열로 직렬화');
  assert.equal(snap.strategy.plans[0].plans[0].planId, 44);
  assert.equal(snap.logistics.bases[0].fuel, 900);
  assert.equal(snap.personnel.characters[0].title, 3);
  assert.equal(snap.social.players[0].contacts[0], 44);
  assert.equal(snap.account.accounts[0].extensionSlots, 1);
  assert.equal(snap.intel.coupLoyalty[0][1], 30);
  assert.equal(snap.coup.conspiracies[0].mastermindId, 2);
  assert.equal(snap.espionage.detained[0].id, 2);

  // 새 인스턴스로 복원 → 동일 상태.
  const restored = createWorldState();
  restored.restore(snap);
  assert.equal(restored.getPlayer(5)?.charId, 2);
  assert.equal(restored.chatCount(), 1);
  assert.equal(restored._strategy.plans.get(1)[0].target, 0x0102);
  assert.equal(restored._strategy.orders[0].message, 7);
  assert.equal(restored._logistics.getBase(0x7001).troops.has(31), true);
  assert.equal(restored._logistics.getFleet(0x01000007).fuel, 120);
  assert.equal(restored._personnel.getCharacter(2).title, 3);
  assert.equal(restored._personnel.getOutfit(0x01000007).seats[0].character, 2);
  assert.equal(restored._social.getContacts(5)[0], 44);
  assert.equal(restored._social.getInbox(5)[0].raw.equals(Buffer.from([1, 2, 3])), true);
  assert.equal(restored._account.get(5).extensionSlots, 1);
  assert.equal(restored.getIntelState().getUnitLoyalty(0x01000007), 40);
  assert.equal(restored.getCoupState().getConspiracy(2).members.has(2), true);
  assert.equal(restored._espionage.isDetained(2), true);
  assert.equal(restored._espionage.surveilTarget(5), 2);
  assert.deepEqual(restored.toSnapshot(), snap, '복원 후 재덤프가 동일');
});

test('repository 기본 운영 경로: SQLite로 world-state를 영속화하고 새 인스턴스에 로드', () => {
  const dir = mkdtempSync(join(tmpdir(), 'logh7-repo-'));
  try {
    const repo = createRepository({ path: join(dir, 'world.sqlite') });
    const ws = createWorldState();
    ws.addPlayer({ connectionId: 9, charId: 3 });
    ws.appendChat({ connectionId: 9, charId: 3, text: 'hi', channel: 0, time: 1 });
    repo.save(composeSnapshot({ world: ws.toSnapshot() }));

    const loaded = repo.load();
    const ws2 = createWorldState();
    ws2.restore(loaded.world);
    assert.equal(ws2.getPlayer(9)?.charId, 3);
    assert.equal(ws2.chatCount(), 1);
    repo.close();

    const reopened = createRepository({ path: join(dir, 'world.sqlite') });
    const loadedAgain = reopened.load();
    const ws3 = createWorldState();
    ws3.restore(loadedAgain.world);
    assert.equal(ws3.getPlayer(9)?.charId, 3);
    assert.equal(ws3.chatCount(), 1);
    reopened.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
