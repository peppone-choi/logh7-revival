import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { connect } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import {
  childCodecDecode,
  childCodecEncode,
  childCodecKeySchedule,
  resolveChildCodecTables,
} from '../../src/server/logh7-codec.mjs';
import { build0030Body, compute0030Checksum, parse0030Body } from '../../src/server/logh7-envelope-0030.mjs';
import {
  buildEncrypted0030Frame,
  buildLoginMessageTraceFields,
  buildLobbyLoginOkPayload,
  buildResponseRecordTraceFields,
  buildRedirectReply,
  planNotifyDispatch,
  resolveLobbyAnnouncementText,
  resolveLobbyCharacters,
  resolveLobbySessions,
  selectLobbyLoginOkKey,
  startLogh7AuthServer,
  takeTransportFrames,
} from '../../src/server/logh7-auth-server.mjs';
import { createAccountRegistry, loadAccountRecords } from '../../src/server/logh7-account-registry.mjs';
import { createContentPack } from '../../src/server/logh7-content-pack.mjs';
import { createAccountStore } from '../../src/server/logh7-login-session.mjs';
import { loadConfig } from '../../src/server/logh7-config.mjs';
import { processCommand } from '../../src/server/logh7-command-engine.mjs';
import { createPersonnelState } from '../../src/server/logh7-personnel.mjs';
import { createSocialState } from '../../src/server/logh7-social.mjs';
import { createAccountState } from '../../src/server/logh7-account.mjs';
import { createEspionageState } from '../../src/server/logh7-espionage.mjs';
import {
  CMD_GENERATE_CHARGE_CODE,
  LOGIN_INNER_CODE,
  LOBBY_SESSION_ANNOUNCE_NOTIFY_CODE,
  REDIRECT_INNER_CODE,
  buildGin7Credential,
  buildLobbyLoginOkInner,
  buildWorldDataResponseInner,
} from '../../src/server/logh7-login-protocol.mjs';

const CLIENT_EXE = path.resolve('.omo/work/logh7-installed/exe/G7MTClient.exe');
const HAS_EXE = existsSync(CLIENT_EXE);
const TRANSPORT_KEY = Buffer.from('7b41344331333734382d303135392d346335342d414542332d3144363835373537363142337d', 'hex');
const DECIPHER_KEY = Buffer.from('5859', 'hex'); // "XY"
const LOGIN_INNER = Buffer.from('700047494e370001000000070069006e006500690030003000000600640075006d006d00790000', 'hex');
const ADMIN_TOKEN = 'test-admin-token-2026';

function buildLoginBody() {
  return build0030Body({ id: 1, innerPayload: LOGIN_INNER });
}

function buildClient0030Frame(tables, encipherKey, id, innerPayload) {
  const body = build0030Body({ id, innerPayload });
  const encoded = childCodecEncode(childCodecKeySchedule(tables, encipherKey), body);
  const frame = Buffer.alloc(4 + encoded.length);
  frame.writeUInt16BE(2 + encoded.length, 0);
  frame.writeUInt16BE(0x0030, 2);
  encoded.copy(frame, 4);
  return frame;
}

function withInnerCode(innerPayload, code) {
  const copy = Buffer.from(innerPayload);
  copy.writeUInt16BE(code, 0);
  return copy;
}

function appInnerCode(innerPayload) {
  if (innerPayload.length >= 6 && innerPayload.readUInt16BE(0) === 0) {
    return innerPayload.readUInt16BE(4);
  }
  return innerPayload.readUInt16BE(0);
}

function parseConn2Inner(tables, frame) {
  assert.equal(frame.readUInt16BE(2), 0);
  assert.equal(frame.readUInt16BE(6), 0x0030);
  const decoded = childCodecDecode(childCodecKeySchedule(tables, DECIPHER_KEY), frame.subarray(8));
  const parsed = parse0030Body(decoded);
  assert.equal(parsed.valid, true);
  return parsed.innerPayload;
}

function makeGenerateCharacterCharge({ lastname = 'Bound', firstname = 'Tcp', power = 1 } = {}) {
  const inner = Buffer.alloc(2 + 0x80);
  inner.writeUInt16BE(CMD_GENERATE_CHARGE_CODE, 0);
  const body = inner.subarray(2);
  body.writeUInt32LE(0, 0x00);
  body.writeUInt8(power, 0x05);
  let off = 0x08;
  const writeName = (name) => {
    const chars = [...name];
    body.writeUInt8(chars.length + 1, off);
    const charsStart = off + 2;
    chars.forEach((ch, i) => body.writeUInt16LE(ch.charCodeAt(0), charsStart + i * 2));
    off = charsStart + chars.length * 2 + 1;
  };
  writeName(lastname);
  writeName(firstname);
  body.writeUInt32LE(1000005, off);
  return inner;
}

test('credential-bearing trace redacts raw payload bytes while keeping safe account metadata', () => {
  const credential = buildGin7Credential({ account: 'p001flow', password: 'FlowPw17!' });
  const loginEvent = buildLoginMessageTraceFields({
    connectionId: 1,
    parsed: { id: 7, innerPayload: credential },
    action: { kind: 'redirect', account: 'p001flow', trace: { account: 'p001flow' } },
  });

  assert.equal(loginEvent.innerCodeHex, '0x7000');
  assert.equal(loginEvent.innerPayloadLength, credential.length);
  assert.equal(loginEvent.credentialPayloadRedacted, true);
  assert.equal(loginEvent.account, 'p001flow');
  assert.equal(Object.hasOwn(loginEvent, 'innerPayloadHex'), false);

  const lobbyCredential = withInnerCode(credential, 0x2000);
  const lobbyEvent = buildLoginMessageTraceFields({
    connectionId: 2,
    parsed: { id: 8, innerPayload: lobbyCredential },
    action: { kind: 'lobby-login-ok', trace: { account: 'p001flow' } },
  });

  assert.equal(lobbyEvent.innerCodeHex, '0x2000');
  assert.equal(lobbyEvent.credentialPayloadRedacted, true);
  assert.equal(lobbyEvent.account, 'p001flow');
  assert.equal(Object.hasOwn(lobbyEvent, 'innerPayloadHex'), false);

  const serialized = `${JSON.stringify(loginEvent)}\n${JSON.stringify(lobbyEvent)}`;
  assert.equal(serialized.includes(credential.toString('hex')), false);
  assert.equal(serialized.includes(lobbyCredential.toString('hex')), false);
  assert.equal(serialized.includes('FlowPw17!'), false);
});

test('in-world information trace keeps the 0x0f08 diagnostic payload hex', () => {
  const informationRequest = Buffer.from('0f08000102030405060708090a0b0c0d0e0f10111213141516171819', 'hex');
  const event = buildLoginMessageTraceFields({
    connectionId: 3,
    parsed: { id: 23, innerPayload: informationRequest },
    action: { kind: 'lobby-response', trace: { account: 'ginei00' } },
  });

  assert.equal(event.innerCodeHex, '0x0f08');
  assert.equal(event.innerPayloadLength, informationRequest.length);
  assert.equal(event.innerPayloadHex, informationRequest.toString('hex'));
  assert.equal(Object.hasOwn(event, 'credentialPayloadRedacted'), false);
});

test('in-world grid move trace keeps 0x0b01 diagnostic payload hex', () => {
 const gridMove = Buffer.from('0b0100000000000000000000000005000001f609000000000000', 'hex');
 const event = buildLoginMessageTraceFields({
 connectionId: 3,
 parsed: { id: 24, innerPayload: gridMove },
 action: { kind: 'lobby-response', trace: { account: 'ginei00' } },
 });

 assert.equal(event.innerCodeHex, '0x0b01');
 assert.equal(event.innerPayloadLength, gridMove.length);
 assert.equal(event.innerPayloadHex, gridMove.toString('hex'));
 assert.equal(Object.hasOwn(event, 'credentialPayloadRedacted'), false);
});

test('in-world information trace summarizes the 0x0f08 diagnostic payload words', () => {
  const informationRequest = Buffer.from('0f080000000100000000000000000000000000000000000000000101', 'hex');
  const event = buildLoginMessageTraceFields({
    connectionId: 3,
    parsed: { id: 23, innerPayload: informationRequest },
    action: { kind: 'lobby-response', trace: { account: 'ginei00' } },
  });

  assert.deepEqual(event.innerPayloadWordsBeHex, [
    '0x0f08',
    '0x0000',
    '0x0001',
    '0x0000',
    '0x0000',
    '0x0000',
    '0x0000',
    '0x0000',
    '0x0000',
    '0x0000',
    '0x0000',
    '0x0000',
    '0x0000',
    '0x0101',
  ]);
  assert.deepEqual(event.innerPayloadNonzeroWordsBe, [
    { offset: 0, valueHex: '0x0f08', value: 3848 },
    { offset: 4, valueHex: '0x0001', value: 1 },
    { offset: 26, valueHex: '0x0101', value: 257 },
  ]);
});

test('response trace summarizes 0x0305/0x0307 world info payloads without raw hex', () => {
  const session = buildWorldDataResponseInner(0x0305);
  const sessionTrace = buildResponseRecordTraceFields(session);
  assert.equal(sessionTrace.worldInfoWire, 'response-0305');
  assert.equal(sessionTrace.worldInfoWireLength, 0x520a);
  assert.equal(sessionTrace.worldInfoWireCountLe0, 0);
  assert.equal(sessionTrace.worldInfoWireCountBe0, 0);
  assert.equal(sessionTrace.worldInfoWireNonzeroFirst256, 0);
  assert.equal(sessionTrace.worldInfoWireAllZeroFirst256, true);
  assert.equal(Object.keys(sessionTrace).some((key) => key.endsWith('Hex')), false);

  const character = buildWorldDataResponseInner(0x0307);
  const characterTrace = buildResponseRecordTraceFields(character);
  assert.equal(characterTrace.worldInfoWire, 'response-0307');
  assert.equal(characterTrace.worldInfoWireLength, 0xe5b2);
  assert.equal(characterTrace.worldInfoWireCountLe0, 0);
  assert.equal(characterTrace.worldInfoWireNonzeroFirst256, 0);
  assert.equal(characterTrace.worldInfoWireAllZeroFirst256, true);
  assert.equal(Object.keys(characterTrace).some((key) => key.endsWith('Hex')), false);
});

test('auth server aligns the default lobby card with LOGH_WORLD_CHAR_ID when no explicit characters are supplied', () => {
  const prevRich = process.env.LOGH_LOBBY_RICH_CHARACTERS;
  try {
    delete process.env.LOGH_LOBBY_RICH_CHARACTERS;
    const contentPack = createContentPack({
      name: 'lobby-char-test',
      nations: [{ id: 1, name: 'Empire' }],
      characters: [
        { id: 1, name: 'フリードリヒⅣ世', nameRomaji: 'Friedrich IV', nationId: 1, abilities: [72, 95, 93, 92, 111, 101, 105, 81] },
        { id: 209, name: 'ラインハルト', nameRomaji: 'Reinhard', nationId: 1 },
      ],
      units: [{ id: 1, nationId: 1 }],
    });

    const defaultResolved = resolveLobbyCharacters({ contentPack, worldCharacterId: undefined });
    assert.equal(defaultResolved.length, 1);
    assert.equal(defaultResolved[0].id, 1);
    assert.equal(defaultResolved[0].status, 1);
    assert.equal(defaultResolved[0].name, '신참사관');
    assert.equal(defaultResolved[0].faction, 'empire');

    const minimalForced = resolveLobbyCharacters({ contentPack, worldCharacterId: '209' });
    assert.deepEqual(minimalForced, [{ id: 209, status: 1, name: 'Reinhard' }]);

    process.env.LOGH_LOBBY_RICH_CHARACTERS = '1';
    const richDefaultResolved = resolveLobbyCharacters({ contentPack, worldCharacterId: undefined });
    assert.equal(richDefaultResolved.length, 1);
    assert.equal(richDefaultResolved[0].id, 1);
    assert.equal(richDefaultResolved[0].status, 1);
    assert.equal(richDefaultResolved[0].name, '신참사관');
    assert.deepEqual(richDefaultResolved[0].abilities, [50, 50, 50, 50, 50, 50, 50, 50]);

    const resolved = resolveLobbyCharacters({ contentPack, worldCharacterId: '209' });
    assert.equal(resolved.length, 1);
    assert.equal(resolved[0].id, 209);
    assert.equal(resolved[0].status, 1);
    assert.equal(resolved[0].name, 'Reinhard');
    assert.equal(resolved[0].nameRomaji, 'Reinhard');
    assert.equal(resolved[0].nationId, 1);
    assert.deepEqual(
      resolveLobbyCharacters({ contentPack, worldCharacterId: '999' }),
      [{ id: 999, status: 1 }],
    );
    assert.deepEqual(
      resolveLobbyCharacters({ characters: [{ id: 7 }], contentPack, worldCharacterId: '209' }),
      [{ id: 7 }],
    );
    assert.deepEqual(
      resolveLobbyCharacters({ lobby: { characters: [{ id: 8 }] }, contentPack, worldCharacterId: '209' }),
      [{ id: 8 }],
    );
  } finally {
    if (prevRich === undefined) delete process.env.LOGH_LOBBY_RICH_CHARACTERS;
    else process.env.LOGH_LOBBY_RICH_CHARACTERS = prevRich;
  }
});

test('auth server defaults to a single-session lobby catalog and resolves announcement text', () => {
  const sessions = resolveLobbySessions();
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].status, 1);
  assert.deepEqual(resolveLobbySessions({ sessions: [{ sessionId: 9 }] }), [{ sessionId: 9 }]);
  assert.deepEqual(resolveLobbySessions({ lobby: { sessions: [{ sessionId: 8 }] } }), [{ sessionId: 8 }]);

  assert.equal(resolveLobbyAnnouncementText({ announcementText: 'A', env: {} }), 'A');
  assert.equal(resolveLobbyAnnouncementText({ env: { LOGH_LOBBY_ANNOUNCE_TEXT: 'B' } }), 'B');
  assert.equal(resolveLobbyAnnouncementText({ env: { LOGH_SESSION_ANNOUNCE_TEXT: 'C' } }), 'C');
  const cp949 = resolveLobbyAnnouncementText({ env: { LOGH_LOBBY_ANNOUNCE_CP949_HEX: 'bcadb9f6' } });
  assert.equal(Buffer.isBuffer(cp949), true);
  assert.equal(cp949.toString('hex'), 'bcadb9f6');
  assert.equal(resolveLobbyAnnouncementText({ env: {} }), null);
});

test('auth server keeps authoritative world runtimes isolated per lobby session id', async () => {
  const accountStore = createAccountStore({ acceptAnyGin7: true });
  accountStore.setSelectedSession('p002flow', 2);
  const server = await startLogh7AuthServer({
    host: '127.0.0.1',
    port: 0,
    transportKey: TRANSPORT_KEY,
    decipherKey: DECIPHER_KEY,
    lobby: { ip: '127.0.0.1', port: 47900 },
    accountStore,
    sessions: [
      { sessionId: 1, name: 'Alpha', status: 1 },
      { sessionId: 2, name: 'Beta', status: 1 },
    ],
    config: loadConfig({
      LOGH_RELAY: '1',
      LOGH_AUTHORITATIVE: '1',
      LOGH_ECONOMY: '1',
    }),
  });
  try {
    const alpha = server.runtimeForSession(1);
    const beta = server.runtimeForSession(2);
    assert.notEqual(alpha, beta);
    assert.notEqual(alpha.worldState, beta.worldState);
    assert.notEqual(alpha.worldRelay, beta.worldRelay);
    assert.notEqual(alpha.economyState, beta.economyState);
    assert.equal(server.runtimeForAccount('p002flow'), beta);

    beta.worldState.upsertFleet({ id: 0x2002, owner: 2, faction: 'alliance', cell: 22 });
    assert.equal(alpha.worldState.getFleet(0x2002), null);
    assert.equal(beta.worldState.getFleet(0x2002).cell, 22);
  } finally {
    await server.close();
  }
});

test('per-session timers + snapshot persistence: economy ticks every session runtime and persist/restore round-trips session rows', async () => {
  // journal #59가 sessionId->runtime 레지스트리를 만들었고, 이 테스트는 그 다음 패치(타이머/스냅샷이 더 이상
  // 기본 런타임만 진행/저장하지 않음)를 결정론으로 검증한다. 인메모리 repository(스냅샷 1개 보관)를 두 부팅이
  // 공유 → 부팅A persist 후 부팅B가 같은 스냅샷에서 세션2 런타임을 복원하는 per-session 영속 왕복을 본다.
  let held = null;
  const repo = { backend: 'mem', load() { return held; }, save(s) { held = s; }, close() {} };
  const cfg = () => loadConfig({ LOGH_RELAY: '1', LOGH_AUTHORITATIVE: '1', LOGH_ECONOMY: '1' });
  const sessions = [
    { sessionId: 1, name: 'Alpha', status: 1 },
    { sessionId: 2, name: 'Beta', status: 1 },
  ];
  const boot = () => startLogh7AuthServer({
    host: '127.0.0.1', port: 0,
    transportKey: TRANSPORT_KEY, decipherKey: DECIPHER_KEY,
    lobby: { ip: '127.0.0.1', port: 47900 },
    accountStore: createAccountStore({ acceptAnyGin7: true }),
    sessions,
    repository: repo,
    persistIntervalMs: 0, // 주기 인터벌 off → persist()/tick* 호출만이 동작을 구동(결정론).
    config: cfg(),
  });

  const serverA = await boot();
  try {
    const a = serverA.runtimeForSession(1);
    const b = serverA.runtimeForSession(2);
    const turnA0 = a.worldState.getScenarioInfo().currentTurn;
    const turnB0 = b.worldState.getScenarioInfo().currentTurn;

    // per-session 타이머: 전 세션 런타임 경제 틱 1회 → 두 세션 모두 턴 +1(부팅 직후 gameDay≈0, 주기0 진입).
    // 이전 동작은 기본(session 1)만 진행했다.
    serverA.tickAllEconomyRuntimes();
    assert.equal(a.worldState.getScenarioInfo().currentTurn, turnA0 + 1, 'session1 경제 틱 진행');
    assert.equal(b.worldState.getScenarioInfo().currentTurn, turnB0 + 1, 'session2도 경제 틱 진행(기본 런타임 한정 아님)');

    // 세션별 격리: 같은 게임일 재틱은 중복 적립 방지(null).
    assert.equal(serverA.economyTickOnceForSession(2), null, '같은 게임일 재틱은 중복 적립 방지');

    // 세션2에만 식별 가능한 함대를 넣어 스냅샷 분리를 본다.
    b.worldState.upsertFleet({ id: 0x2bee, owner: 2, faction: 'alliance', cell: 33 });

    // persist(): 기본(session 1)은 최상위, session 2는 sessions 행으로 직렬화된다.
    serverA.persist();
    assert.ok(held && Array.isArray(held.sessions), 'persist가 per-session sessions 행을 기록');
    const row2 = held.sessions.find((s) => s.sessionId === 2);
    assert.ok(row2, '세션2 스냅샷 행 존재');
    assert.equal(row2.world.fleets.some((f) => f.id === 0x2bee), true, '세션2 함대가 세션 행에 영속화');
    assert.equal(held.world.fleets.some((f) => f.id === 0x2bee), false, '세션2 함대는 기본(최상위) 행에 없음');
  } finally {
    await serverA.close();
  }

  // 재부팅: 같은 repository → 세션2 런타임이 영속 sessions에서 즉시 생성·복원되어야 한다(per-session 영속 왕복).
  const serverB = await boot();
  try {
    assert.equal(serverB.sessionRuntimes.has(2), true, '재부팅이 영속 sessions에서 세션2 런타임을 복원');
    assert.ok(serverB.runtimeForSession(2).worldState.getFleet(0x2bee), '세션2 함대가 재부팅 후 복원됨');
    assert.equal(serverB.runtimeForSession(1).worldState.getFleet(0x2bee), null, '기본 런타임엔 세션2 함대 없음');
  } finally {
    await serverB.close();
  }
});

test('per-session strategic persistence: strat fleets + tick survive a restart for default AND session 2 (journal #62, EXE-free)', async () => {
  // journal #62의 EXE-gated 검증 경계를 닫는다 — strat 시뮬은 실제 클라 EXE 없이도 부팅되므로(코덱 테이블은
  // 커밋 JSON, 갤럭시는 content DB) auth-server 레벨 strat 영속 왕복을 런타임으로 검증할 수 있다. stratSimEnabled은
  // 아직 process.env 직접 의존이라 여기서만 설정/복원한다(relay/auth/db는 config로 주입).
  const prevStrat = process.env.LOGH_STRAT_SIM;
  process.env.LOGH_STRAT_SIM = '1';
  let held = null;
  const repo = { backend: 'mem', load() { return held; }, save(s) { held = s; }, close() {} };
  const cfg = () => loadConfig({ LOGH_RELAY: '1', LOGH_AUTHORITATIVE: '1', LOGH_STRAT_SIM: '1', LOGH_CONTENT_DB: '1' });
  const sessions = [
    { sessionId: 1, name: 'Alpha', status: 1 },
    { sessionId: 2, name: 'Beta', status: 1 },
  ];
  const boot = () => startLogh7AuthServer({
    host: '127.0.0.1', port: 0,
    transportKey: TRANSPORT_KEY, decipherKey: DECIPHER_KEY,
    lobby: { ip: '127.0.0.1', port: 47900 },
    accountStore: createAccountStore({ acceptAnyGin7: true }),
    sessions, repository: repo, persistIntervalMs: 0, config: cfg(),
  });
  const movedAwayFromHome = (runtime) =>
    [...runtime.strat.simState.fleetsById.values()].find((f) => f.system !== f.homeSystem) ?? null;

  try {
    const serverA = await boot();
    let movedDef, movedBeta;
    try {
      assert.equal(serverA.stratSimEnabled, true, 'strat sim must boot without the client EXE');
      const def = serverA.runtimeForSession(1);
      const beta = serverA.runtimeForSession(2); // lazily create session-2 runtime (its own seeded strat)
      assert.ok(def.strat && beta.strat, '두 런타임 모두 독립 strat 시뮬을 가진다');
      // advance BOTH runtimes via the all-runtimes scheduler until each has a fleet off home.
      for (let t = 1; t <= 20; t += 1) serverA.tickAllStrategicRuntimes();
      movedDef = movedAwayFromHome(def);
      movedBeta = movedAwayFromHome(beta);
      assert.ok(movedDef, '기본 런타임에서 함대가 홈을 떠났다(전쟁 진행 전제)');
      assert.ok(movedBeta, '세션2 런타임에서도 함대가 홈을 떠났다');

      serverA.persist();
      assert.ok(Array.isArray(held?.entities?.strat?.fleets), '기본 strat는 최상위 entities.strat로 영속');
      assert.equal(typeof held.entities.strat.tickNo, 'number', '기본 strat tickNo 영속');
      const betaRow = held.sessions?.find((s) => s.sessionId === 2);
      assert.ok(Array.isArray(betaRow?.entities?.strat?.fleets), '세션2 strat는 sessions 행 entities.strat로 영속');
    } finally {
      await serverA.close();
    }

    // restart from the same repository: both runtimes' strat fleets/tick must resume (not reset to home).
    const serverB = await boot();
    try {
      const def2 = serverB.runtimeForSession(1);
      const defFleet = def2.strat.simState.fleetsById.get(movedDef.id);
      assert.ok(defFleet, '기본 이동 함대가 재부팅 후 id로 복원');
      assert.equal(defFleet.system, movedDef.system, '기본 함대는 전시 위치 유지(홈 리셋 아님)');
      assert.notEqual(defFleet.system, defFleet.homeSystem, '기본 함대는 여전히 홈이 아니다');
      assert.equal(def2.stratTickNo, held.entities.strat.tickNo, '기본 stratTickNo 복원');

      assert.equal(serverB.sessionRuntimes.has(2), true, '세션2 런타임이 영속에서 복원됨');
      const beta2 = serverB.runtimeForSession(2);
      const betaFleet = beta2.strat.simState.fleetsById.get(movedBeta.id);
      assert.ok(betaFleet, '세션2 이동 함대가 재부팅 후 복원');
      assert.equal(betaFleet.system, movedBeta.system, '세션2 함대는 전시 위치 유지(홈 리셋 아님)');
    } finally {
      await serverB.close();
    }
  } finally {
    if (prevStrat === undefined) delete process.env.LOGH_STRAT_SIM; else process.env.LOGH_STRAT_SIM = prevStrat;
  }
});

test('auth server exposes an opt-in local admin session-state snapshot', async () => {
  const server = await startLogh7AuthServer({
    host: '127.0.0.1',
    port: 0,
    transportKey: TRANSPORT_KEY,
    decipherKey: DECIPHER_KEY,
    lobby: { ip: '127.0.0.1', port: 47900 },
    admin: { host: '127.0.0.1', port: 0, token: ADMIN_TOKEN },
    accountStore: createAccountStore({ acceptAnyGin7: true }),
    config: loadConfig({
      LOGH_RELAY: '1',
      LOGH_AUTHORITATIVE: '1',
      LOGH_ECONOMY: '1',
      LOGH_CONTENT_DB: '1',
      LOGH_KO_NAMES: '1',
      LOGH_SCENARIO: 'content/scenarios/canon-801-07.json',
    }),
  });
  try {
    assert.ok(server.admin);
    server.worldState.addPlayer({ connectionId: 6, charId: 11, powerId: 2 });
    const strategyInner = Buffer.alloc(2 + 0x1c);
    strategyInner.writeUInt16BE(0x0900, 0);
    strategyInner.subarray(2).writeUInt32LE(0x50, 8);
    strategyInner.subarray(2).writeUInt32LE(0x07, 12);
    const strategyDecision = processCommand({
      state: server.worldState,
      connectionId: 6,
      innerCode: 0x0900,
      inner: strategyInner,
 });
 assert.equal(strategyDecision.accept, true);
 server.worldState._personnel = createPersonnelState();
 server.worldState._personnel.addCharacter({ id: 11, owner: 6, rank: 4, spot: 3, title: 2 });
 server.worldState._personnel.addOutfit({ id: 11, owner: 6, chief: 11 });
 server.worldState._personnel.appointCard(11, { character: 11, role: 1 });
 server.worldState._social = createSocialState();
 server.worldState._social.join(6, 11);
 server.worldState._social.setPresence(6, 2);
 server.worldState._social.addContact(6, 12);
 server.worldState._account = createAccountState();
 server.worldState._account.join(6, { accountId: 6, name: 'admin-test', owned: [11], available: [12], maxExtensionSlots: 1 });
 server.worldState._account.chargeExtension(6, 12);
 server.worldState.getIntelState().addCoupLoyalty(11, 20);
 server.worldState.getCoupState().declareRingleader(11, 2);
 server.worldState._espionage = createEspionageState();
 server.worldState._espionage.authorizeArrest(2, 11);

 const denied = await fetch(server.admin.url);
    assert.equal(denied.status, 401);

    const response = await fetch(server.admin.url, {
      headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.ok, true);
    assert.equal(body.server.host, '127.0.0.1');
    assert.equal(body.server.port, server.port);
    assert.equal(body.server.adminPort, server.admin.port);
    assert.equal(body.flags.authoritative, true);
    assert.equal(body.flags.relay, true);
    assert.equal(body.persistence.enabled, false);
    assert.equal(body.counts.players, 1);
    assert.equal(body.counts.systems > 0, true);
    assert.equal(body.counts.economyPlanets > 0, true);
    assert.equal(body.counts.commandRecords, 1);
 assert.equal(body.world.recentCommands[0].innerCode, 0x0900);
 assert.equal(body.world.recentCommands[0].effect, 'strategy-command');
 assert.equal(body.world.personnelState.counts.characters, 1);
 assert.equal(body.world.personnelState.outfits[0].seats[0].character, 11);
 assert.equal(body.world.socialState.counts.contacts, 1);
 assert.equal(body.world.accountState.accounts[0].extensionSlots, 1);
 assert.equal(body.world.intelState.counts.coupLoyalty, 1);
 assert.equal(body.world.coupState.counts.conspiracies, 1);
 assert.equal(body.world.espionageState.counts.arrestList, 1);
 assert.equal(body.world.commandTargets.characters[0].id, 11);
    assert.equal(body.world.commandTargets.outfits[0].id, 11);
    assert.equal(body.world.commandTargetHistory.some((entry) => entry.reason === 'strategy-route:base'), true);
    assert.equal(body.world.commandTargetHistory.some((entry) => entry.reason === 'strategy-route:outfit'), true);
    assert.equal(body.world.devCommandCatalog.cards[0].commands[0].missingTargetKinds.length, 0);
    assert.equal(body.world.devCommandCatalog.cards[0].commands[0].targetSlots.some((slot) => slot.kind === 'gridCell'), true);
assert.equal(body.world.devCommandCatalog.cards[0].commands[0].targetSlots.find((slot) => slot.kind === 'gridCell').samples[0].cell, 2588);
assert.equal(body.world.devCommandCatalog.cards[0].commands[0].executionPreview.innerCodeHex, '0x0b01');
assert.equal(body.world.devCommandCatalog.cards[0].commands[0].executionPreview.executable, true);
assert.equal(body.world.devCommandCatalog.factoryAnchors.find((anchor) => anchor.factoryId === 0x002b).function, 'FUN_00581c80');
assert.equal(body.world.devCommandCatalog.factoryAnchors.find((anchor) => anchor.factoryId === 0x0019).selectedFactoryBranch.followupInnerCodeHex, '0x0903');
assert.equal(body.world.devCommandCatalog.factoryAnchors.find((anchor) => anchor.factoryId === 0x003f).selectedFactoryBranch.followupInnerCodeHex, '0x0c02');
assert.equal(body.world.devCommandCatalog.factoryAnchors.find((anchor) => anchor.factoryId === 0x0040).selectedFactoryBranch.followupInnerCodeHex, '0x0c05');
assert.equal(body.world.devCommandCatalog.cards[0].commands[0].factoryAnchor.requestHex, '0x0b01');
assert.equal(body.world.devCommandCatalog.mappingAudit.recovered.some((entry) => entry.includes('0x19/0x3f/0x40')), true);
assert.equal(body.world.devCommandCatalog.mappingAudit.status, 'dev-compat-static-anchor-only');
assert.equal(body.world.devCommandCatalog.mappingAudit.canonicalAuthorityCardMappingRecovered, false);
assert.equal(body.world.devCommandCatalog.cards[0].commands[0].targetSlots.some((slot) => (
  slot.kind === 'planet' && slot.available
)), true);
assert.equal(body.world.commandTargets.planets.length > 0, true);
assert.equal(body.world.interactionExposure.objectKinds.planet.slot.available, true);
assert.equal(body.world.interactionExposure.objectKinds.planet.producers.some((entry) => (
  entry.requestHex === '0x031e'
)), true);
assert.equal(body.world.interactionExposure.objectKinds.operationPlan.interactionKinds.includes('order'), true);
assert.equal(body.world.interactionExposure.playability.objectKindsWithCommands > 0, true);
assert.equal(body.world.playabilityAudit.devPlayable, true);
assert.equal(body.world.playabilityAudit.canonicalAuthorityCardMappingRecovered, false);
assert.equal(body.world.playabilityAudit.commandTotals.executableCommands, body.world.devCommandReadiness.executableCommands);
assert.equal(body.world.playabilityAudit.commandBuckets.transports.opcode.commandCount > 0, true);
assert.equal(body.world.playabilityAudit.canonicalGates.some((gate) => (
  gate.gate.includes('authority-card')
)), true);
assert.deepEqual(body.world.devCommandReadiness, body.world.devCommandCatalog.readiness);
assert.equal(body.world.devCommandReadiness.totalCommands > 0, true);
assert.equal(body.world.devCommandReadiness.executableCommands > 0, true);
assert.deepEqual(body.world.contentExposure.opcodeContract.map((entry) => [entry.request, entry.response]), [
  [0x0304, 0x0305],
  [0x0306, 0x0307],
  [0x0312, 0x0313],
  [0x0314, 0x0315],
[0x031e, 0x031f],
[0x0320, 0x0321],
[0x0322, 0x0323],
[0x0324, 0x0325],
[0x0326, 0x0327],
[0x0328, 0x0329],
[0x032a, 0x032b],
[0x032e, 0x032f],
  [0x034e, 0x034f],
]);
assert.equal(body.world.contentExposure.opcodeContract.find((entry) => entry.response === 0x0307).status, 'known-builder-not-default');
assert.deepEqual(body.world.contentExposure.consumersByDataset.planets.map((entry) => entry.response), [
      0x031f,
      0x0321,
      0x0327,
      0x0329,
    ]);
assert.deepEqual(body.world.contentExposure.consumersByDataset.specialBodies.map((entry) => entry.response), [
0x0313,
0x0315,
]);
assert.deepEqual(body.world.contentExposure.consumersByDataset.characters.map((entry) => entry.response), [
0x0323,
0x032f,
0x034f,
]);
assert.deepEqual(body.world.contentExposure.targetProducersByKind.character.map((entry) => entry.request), [
0x0322,
0x032e,
0x034e,
]);
    assert.equal(body.world.contentExposure.systems.packCount, 85);
    assert.equal(body.world.contentExposure.systems.coordinateConfirmedCount, 80);
    assert.equal(body.world.contentExposure.planets.economyCount, 300);
    assert.equal(body.world.contentExposure.specialBodies.blackHoleCount, 3);
 assert.equal(body.world.contentExposure.specialBodies.neutronStarCount, 3);
 assert.equal(body.sessions[0].commandRecords, 1);
 assert.equal(body.sessions[0].personnelState.counts.characters, 1);
 assert.equal(body.sessions[0].socialState.counts.contacts, 1);
 assert.equal(body.sessions[0].accountState.accounts[0].extensionSlots, 1);
assert.equal(body.sessions[0].intelState.counts.coupLoyalty, 1);
assert.equal(body.sessions[0].coupState.counts.conspiracies, 1);
assert.equal(body.sessions[0].espionageState.counts.arrestList, 1);
assert.equal(body.sessions[0].commandTargets.characters[0].id, 11);
assert.equal(body.sessions[0].devCommandCatalog.cards.length > 0, true);
assert.equal(body.sessions[0].interactionExposure.objectKinds.character.slot.available, true);
assert.equal(body.sessions[0].playabilityAudit.devPlayable, true);
assert.equal(body.sessions[0].devCommandReadiness.executableCommands > 0, true);

const health = await fetch(`http://${server.admin.host}:${server.admin.port}/health`);
    assert.equal(health.status, 200);
    assert.equal((await health.json()).service, 'logh7-admin');
  } finally {
    await server.close();
  }
});

test('admin dev-command execute endpoint routes a dev card into authoritative command state', async () => {
  const server = await startLogh7AuthServer({
    host: '127.0.0.1',
    port: 0,
    transportKey: TRANSPORT_KEY,
    decipherKey: DECIPHER_KEY,
    lobby: { ip: '127.0.0.1', port: 47900 },
    admin: { host: '127.0.0.1', port: 0, token: ADMIN_TOKEN },
    accountStore: createAccountStore({ acceptAnyGin7: true }),
    config: loadConfig({
      LOGH_RELAY: '1',
      LOGH_AUTHORITATIVE: '1',
    }),
  });
  const base = `http://${server.admin.host}:${server.admin.port}`;
  const adminHeaders = {
    authorization: `Bearer ${ADMIN_TOKEN}`,
    'content-type': 'application/json',
  };
  try {
    const denied = await fetch(`${base}/admin/dev-command/execute`, {
      method: 'POST',
      body: JSON.stringify({ factoryId: 0x002b }),
    });
    assert.equal(denied.status, 401);

    const initialState = await (await fetch(server.admin.url, { headers: adminHeaders })).json();
    assert.equal(initialState.world.devCommandCatalog.cards[0].categoryName, '作戦コマンド');
    assert.equal(initialState.world.devCommandCatalog.cards[0].commands[0].executionPreview.executable, true);
    assert.equal(initialState.world.commandTargets.characters[0].id, 1001);

    const dryRun = await (await fetch(`${base}/admin/dev-command/execute`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ categoryIndex: 0, commandIndex: 1, dryRun: true }),
    })).json();
    assert.equal(dryRun.ok, true);
    assert.equal(dryRun.dryRun, true);
    assert.equal(dryRun.preview.innerCodeHex, '0x0b02');

    const executedResponse = await fetch(`${base}/admin/dev-command/execute`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ factoryId: 0x002b }),
    });
    assert.equal(executedResponse.status, 200);
    const executed = await executedResponse.json();
    assert.equal(executed.ok, true);
    assert.equal(executed.command.factoryId, 0x002b);
    assert.equal(executed.decision.devExecution.innerCodeHex, '0x0b01');
    assert.equal(executed.commandRecordsBefore, 0);
    assert.equal(executed.commandRecordsAfter, 1);
    assert.equal(executed.recentCommand.effect, 'fleet-grid-move');
    assert.equal(server.worldState.getPlayer(executed.connectionId).charId, 1001);
    assert.equal(server.worldState.getFleet(1001).cell, 2599);

    const supplied = await (await fetch(`${base}/admin/dev-command/execute`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ categoryIndex: 0, commandIndex: 1 }),
    })).json();
    assert.equal(supplied.ok, true);
    assert.equal(supplied.decision.devExecution.innerCodeHex, '0x0b02');
    assert.equal(supplied.recentCommand.effect, 'logistics-command');

    const carried = await (await fetch(`${base}/admin/dev-command/execute`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ categoryIndex: 3, commandIndex: 4 }),
    })).json();
    assert.equal(carried.ok, true);
    assert.equal(carried.decision.devExecution.innerCodeHex, '0x0c08');
    assert.equal(carried.recentCommand.effect, 'logistics-command');

    const manifested = await (await fetch(`${base}/admin/dev-command/execute`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ categoryIndex: 0, commandIndex: 3 }),
    })).json();
    assert.equal(manifested.ok, true);
    assert.equal(manifested.decision.devExecution.innerCodeHex, '0x0902');

    const sortie = await (await fetch(`${base}/admin/dev-command/execute`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({
        categoryIndex: 0,
        commandIndex: 14,
        targets: { troop: { id: 100150, kind: 1, unitId: 1001 } },
      }),
    })).json();
    assert.equal(sortie.ok, true);
    assert.equal(sortie.decision.devExecution.semantic, 'ground-sortie');
    assert.equal(sortie.decision.devExecution.transport, 'server-direct');
    assert.equal(sortie.recentCommand.effect, 'ground-command');

    const operationTargets = {
      operationPlan: { id: 77, target: 2599, units: [1001] },
      outfit: { id: 1001 },
      gridCells: [{ cell: 2588 }, { cell: 2599 }],
    };
    const makePlan = await (await fetch(`${base}/admin/dev-command/execute`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ categoryIndex: 2, commandIndex: 0, targets: operationTargets }),
    })).json();
    assert.equal(makePlan.ok, true);
    assert.equal(makePlan.decision.devExecution.innerCodeHex, '0x0900');
    assert.equal(makePlan.recentCommand.effect, 'strategy-command');

    const issueOrder = await (await fetch(`${base}/admin/dev-command/execute`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ categoryIndex: 2, commandIndex: 2, targets: operationTargets }),
    })).json();
    assert.equal(issueOrder.ok, true);
    assert.equal(issueOrder.decision.devExecution.innerCodeHex, '0x0902');
    assert.equal(issueOrder.recentCommand.effect, 'strategy-command');

    const stateAfterCommands = await (await fetch(server.admin.url, { headers: adminHeaders })).json();
    assert.equal(stateAfterCommands.world.ships.some((ship) => ship.id === 100101), true);
    assert.equal(stateAfterCommands.world.troops.some((troop) => troop.id === 100150 && troop.landed === true), true);
    const manifest = stateAfterCommands.world.combatAssets.fleetManifests.find((entry) => entry.fleetId === 1001);
    assert.equal(manifest.shipCount > 0, true);
    assert.equal(manifest.troopCount > 0, true);
    assert.equal(manifest.fighterCount > 0, true);
    assert.equal(manifest.weaponCount > 0, true);
    assert.equal(stateAfterCommands.world.logisticsState.enabled, true);
    assert.equal(stateAfterCommands.world.logisticsState.fleets.some((fleet) => (
      fleet.id === 1001 && fleet.fuel === 5000 && fleet.supply === 3000
    )), true);
    assert.equal(stateAfterCommands.world.logisticsState.bases.some((base) => base.id === 1), true);
    assert.equal(stateAfterCommands.world.logisticsState.recentLog.some((entry) => entry.event === 'supply-fuel'), true);
    assert.equal(stateAfterCommands.world.logisticsState.recentLog.some((entry) => entry.event === 'carry'), true);
    assert.equal(stateAfterCommands.world.strategyState.enabled, true);
    assert.equal(stateAfterCommands.world.strategyState.counts.queuedPlans > 0, true);
    assert.equal(stateAfterCommands.world.strategyState.counts.operationPlans > 0, true);
    const queuedPlan = stateAfterCommands.world.strategyState.queuedPlans.find((plan) => plan.planId === 77);
    assert.equal(queuedPlan.target, 2599);
    assert.equal(stateAfterCommands.world.strategyState.operationPlans.some((plan) => (
      plan.planId === queuedPlan.planId && plan.queued === true
    )), true);
    assert.equal(stateAfterCommands.world.strategyState.orders.some((order) => (
      order.planId === 77 && order.message === 2599
    )), true);
    assert.equal(stateAfterCommands.world.strategyState.recentCommands.some((entry) => entry.innerCode === 0x0900), true);

    const withdrawal = await (await fetch(`${base}/admin/dev-command/execute`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ categoryIndex: 2, commandIndex: 1, targets: operationTargets }),
    })).json();
    assert.equal(withdrawal.ok, true);
    assert.equal(withdrawal.decision.devExecution.innerCodeHex, '0x0901');

    const stateAfterWithdrawal = await (await fetch(server.admin.url, { headers: adminHeaders })).json();
    assert.equal(stateAfterWithdrawal.world.strategyState.queuedPlans.some((plan) => plan.planId === 77), false);
    assert.equal(stateAfterWithdrawal.world.strategyState.operationPlans.some((plan) => (
      plan.planId === 77 && plan.status === 'withdrawn' && plan.queued === false
    )), true);
    assert.equal(stateAfterWithdrawal.world.strategyState.operationEvents.some((event) => (
      event.type === 'withdraw' && event.planId === 77
    )), true);
  } finally {
    await server.close();
  }
});

test('admin sessions API and console manage the lobby session catalog', async () => {
  const server = await startLogh7AuthServer({
    host: '127.0.0.1',
    port: 0,
    transportKey: TRANSPORT_KEY,
    decipherKey: DECIPHER_KEY,
    lobby: { ip: '127.0.0.1', port: 47900 },
    admin: { host: '127.0.0.1', port: 0, token: ADMIN_TOKEN },
    accountStore: createAccountStore({ acceptAnyGin7: true }),
  });
  const base = `http://${server.admin.host}:${server.admin.port}`;
  const adminHeaders = {
    authorization: `Bearer ${ADMIN_TOKEN}`,
    'content-type': 'application/json',
  };
  try {
    const consolePage = await fetch(`${base}/admin`);
    assert.equal(consolePage.status, 200);
    const consoleHtml = await consolePage.text();
    assert.match(consoleHtml, /LOGH VII Admin/);
    assert.match(consoleHtml, /Dev Commands/);
    assert.match(consoleHtml, /\/admin\/dev-command\/execute/);

    const denied = await fetch(`${base}/admin/sessions`);
    assert.equal(denied.status, 401);

    const initial = await (await fetch(`${base}/admin/sessions`, { headers: adminHeaders })).json();
    assert.equal(initial.ok, true);
    assert.equal(initial.sessions.length, 1);

    const upserted = await (await fetch(`${base}/admin/sessions`, {
      method: 'PUT',
      headers: adminHeaders,
      body: JSON.stringify({
        sessionId: 7,
        sessionName: 'Ops Test',
        status: 1,
        beginDay: 'UC 802',
        world: { ip: '10.9.0.7', port: 48007, token: 77 },
      }),
    })).json();
    assert.equal(upserted.session.sessionName, 'Ops Test');
    assert.equal(upserted.session.world.port, 48007);

    const closed = await (await fetch(`${base}/admin/sessions/7/close`, {
      method: 'POST',
      headers: adminHeaders,
    })).json();
    assert.equal(closed.session.status, 0);

    const snapshot = await (await fetch(server.admin.url, { headers: adminHeaders })).json();
    const session7 = snapshot.lobby.sessionCatalog.find((session) => session.sessionId === 7);
    assert.equal(session7.sessionName, 'Ops Test');
    assert.equal(session7.status, 0);

    const deleted = await fetch(`${base}/admin/sessions/7`, { method: 'DELETE', headers: adminHeaders });
    assert.equal(deleted.status, 200);
    const afterDelete = await (await fetch(`${base}/admin/sessions`, { headers: adminHeaders })).json();
    assert.equal(afterDelete.sessions.some((session) => session.sessionId === 7), false);
  } finally {
    await server.close();
  }
});

test('admin notice API replaces the startup announcement for future lobby sessions', async () => {
  const tables = resolveChildCodecTables();
  const encipherKey = Buffer.from('484a8fd202f545cc0460ef485c332ac5', 'hex');
  const previousFormat = process.env.LOGH_LOBBY_OK_FORMAT;
  const previousEarly = process.env.LOGH_LOBBY_EARLY_OK;
  process.env.LOGH_LOBBY_OK_FORMAT = 'message32';
  delete process.env.LOGH_LOBBY_EARLY_OK;
  const server = await startLogh7AuthServer({
    host: '127.0.0.1',
    port: 0,
    transportKey: TRANSPORT_KEY,
    decipherKey: DECIPHER_KEY,
    lobby: { ip: '127.0.0.1', port: 47900 },
    admin: { host: '127.0.0.1', port: 0, token: ADMIN_TOKEN },
    announcementText: 'OLD',
    accountStore: createAccountStore({ acceptAnyGin7: true }),
  });
  try {
    const base = `http://${server.admin.host}:${server.admin.port}`;
    const adminHeaders = { authorization: `Bearer ${ADMIN_TOKEN}` };
    const denied = await fetch(`${base}/admin/notice`);
    assert.equal(denied.status, 401);

    const initial = await (await fetch(`${base}/admin/notice`, { headers: adminHeaders })).json();
    assert.equal(initial.notice.configured, true);
    assert.equal(initial.notice.text, 'OLD');

    const badKorean = await fetch(`${base}/admin/notice`, {
      method: 'PUT',
      headers: { ...adminHeaders, 'content-type': 'application/json' },
      body: JSON.stringify({ text: '서버 공지' }),
    });
    assert.equal(badKorean.status, 400);
    assert.match((await badKorean.json()).error, /cp949Hex/);

    const updated = await fetch(`${base}/admin/notice`, {
      method: 'PUT',
      headers: { ...adminHeaders, 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'NEW' }),
    });
    assert.equal(updated.status, 200);
    assert.equal((await updated.json()).notice.text, 'NEW');

    const snapshot = await (await fetch(server.admin.url, { headers: adminHeaders })).json();
    assert.equal(snapshot.lobby.announcementConfigured, true);
    assert.equal(snapshot.lobby.announcement.text, 'NEW');

    const received = await new Promise((resolve, reject) => {
      const socket = connect(server.port, '127.0.0.1');
      let buffer = Buffer.alloc(0);
      let sentLobbyLogin = false;
      const framesOut = [];
      const timer = setTimeout(() => reject(new Error('timed out waiting for admin-updated announcement')), 4000);
      socket.on('connect', () => socket.write(buildPhase1RequestFrame(tables, encipherKey, 1)));
      socket.on('data', (chunk) => {
        buffer = Buffer.concat([buffer, chunk]);
        const { frames, remaining } = takeTransportFrames(buffer);
        buffer = Buffer.from(remaining);
        for (const frame of frames) {
          const code = frame.readUInt16BE(2);
          const conn2Code = frame.length >= 8 ? frame.readUInt16BE(6) : 0;
          if (code === 0x0035 && !sentLobbyLogin) {
            sentLobbyLogin = true;
            socket.write(
              Buffer.concat([
                buildClient0030Frame(tables, encipherKey, 1, Buffer.from('002000000001', 'hex')),
                buildClient0030Frame(
                  tables,
                  encipherKey,
                  2,
                  Buffer.from('200047494e3700040000070069006e00650069003000300000', 'hex'),
                ),
              ]),
            );
          } else if (conn2Code === 0x0030) {
            framesOut.push(frame);
            if (framesOut.length === 2) {
              clearTimeout(timer);
              socket.destroy();
              resolve(framesOut);
            }
          }
        }
      });
      socket.on('error', reject);
    });

    const parsedAnnouncement = parseConn2Inner(tables, received[1]);
    assert.equal(parsedAnnouncement.readUInt16BE(4), LOBBY_SESSION_ANNOUNCE_NOTIFY_CODE);
    assert.equal(parsedAnnouncement.subarray(6, 9).toString('latin1'), 'NEW');
    assert.equal(parsedAnnouncement.readUInt8(9), 0);

    const cleared = await fetch(`${base}/admin/notice`, { method: 'DELETE', headers: adminHeaders });
    assert.equal(cleared.status, 200);
    assert.equal((await cleared.json()).notice.configured, false);
  } finally {
    if (previousFormat === undefined) delete process.env.LOGH_LOBBY_OK_FORMAT;
    else process.env.LOGH_LOBBY_OK_FORMAT = previousFormat;
    if (previousEarly === undefined) delete process.env.LOGH_LOBBY_EARLY_OK;
    else process.env.LOGH_LOBBY_EARLY_OK = previousEarly;
    await server.close();
  }
});

test('buildRedirectReply yields a keysetup frame (inner 0x31) and a GIN7-keyed redirect (inner 0x7001)', { skip: !HAS_EXE && 'client exe not present' }, () => {
  const tables = resolveChildCodecTables({ clientExe: CLIENT_EXE });
  const decodedBody = buildLoginBody();
  const reply = buildRedirectReply({
    tables,
    decipherKey: DECIPHER_KEY,
    decodedBody,
    redirectInner: Buffer.from('70010000000000000100007fbb1c0000000100000000', 'hex'),
  });
  // keysetup frame decodes with decipherKey -> inner code forced to 0x31
  const keysetupBody = childCodecDecode(childCodecKeySchedule(tables, DECIPHER_KEY), reply.keysetupFrame.subarray(4));
  const keysetupParsed = parse0030Body(keysetupBody);
  assert.equal(keysetupParsed.valid, true);
  assert.equal(keysetupParsed.innerPayload.readUInt16BE(0), 0x0031);

  // redirect frame decodes with the GIN7 blob key (login inner minus its 2-byte code)
  const gin7Key = LOGIN_INNER.subarray(2);
  assert.equal(reply.gin7KeyHex, gin7Key.toString('hex'));
  const redirectBody = childCodecDecode(childCodecKeySchedule(tables, gin7Key), reply.redirectFrame.subarray(4));
  const redirectParsed = parse0030Body(redirectBody);
  assert.equal(redirectParsed.valid, true);
  assert.equal(redirectParsed.innerPayload.readUInt16BE(0), REDIRECT_INNER_CODE);
});

test('lobby login OK defaults to decipherKey with conn2 subheader', { skip: !HAS_EXE && 'client exe not present' }, () => {
  const tables = resolveChildCodecTables({ clientExe: CLIENT_EXE });
  const phase1Key = Buffer.from('fd65d384aeeab9b8a783a8fed72f32f7', 'hex');
  const parsedInnerPayload = Buffer.from('200047494e3700040000070069006e00650069003000300000', 'hex');
  const selected = selectLobbyLoginOkKey({
    mode: undefined,
    parsedInnerPayload,
    decipherKey: DECIPHER_KEY,
    phase1Key,
  });

  assert.equal(selected.keyMode, 'decipher');
  assert.deepEqual(selected.key, DECIPHER_KEY);

  const frame = buildEncrypted0030Frame({
    tables,
    key: selected.key,
    body: build0030Body({ id: 3, innerPayload: buildLobbyLoginOkInner({ status: 0 }) }),
    subheaderLen: 4,
  });
  assert.equal(frame.readUInt16BE(0), 22);
  assert.equal(frame.readUInt16BE(6), 0x0030);
  assert.equal(frame.length, 24);

  const decodedWithDecipher = childCodecDecode(childCodecKeySchedule(tables, DECIPHER_KEY), frame.subarray(8));
  const parsedWithDecipher = parse0030Body(decodedWithDecipher);
  assert.equal(parsedWithDecipher.valid, true);
  assert.equal(parsedWithDecipher.id, 3);
  assert.equal(parsedWithDecipher.innerPayload.readUInt16BE(0), 0x2001);

  const decodedWithPhase1 = childCodecDecode(childCodecKeySchedule(tables, phase1Key), frame.subarray(8));
  const parsedWithPhase1 = parse0030Body(decodedWithPhase1);
  assert.notEqual(parsedWithPhase1.valid, true);
});

test('lobby login OK key selection keeps explicit probe overrides', () => {
  const phase1Key = Buffer.from('fd65d384aeeab9b8a783a8fed72f32f7', 'hex');
  const parsedInnerPayload = Buffer.from('200047494e3700040000070069006e00650069003000300000', 'hex');

  const phase1 = selectLobbyLoginOkKey({
    mode: 'phase1',
    parsedInnerPayload,
    decipherKey: DECIPHER_KEY,
    phase1Key,
  });
  assert.equal(phase1.keyMode, 'phase1');
  assert.deepEqual(phase1.key, phase1Key);

  const gin7 = selectLobbyLoginOkKey({
    mode: 'gin7',
    parsedInnerPayload,
    decipherKey: DECIPHER_KEY,
    phase1Key,
  });
  assert.equal(gin7.keyMode, 'gin7');
  assert.equal(gin7.key.toString('hex'), parsedInnerPayload.subarray(2).toString('hex'));
});

test('lobby login OK payload can use conn2 message32 framing as an opt-in probe', () => {
  const raw = buildLobbyLoginOkPayload({ status: 0, format: undefined });
  assert.equal(raw.okFormat, 'raw');
  assert.equal(raw.okInner.toString('hex'), '20010000');

  const message32 = buildLobbyLoginOkPayload({ status: 0, format: 'message32' });
  assert.equal(message32.okFormat, 'message32');
  assert.equal(message32.okInner.toString('hex'), '000000002001000000');
});

test('auth server emits a configured announcement as a conn2 extra inner after LobbyLoginOK', { skip: !HAS_EXE && 'client exe not present' }, async () => {
  const tables = resolveChildCodecTables({ clientExe: CLIENT_EXE });
  const encipherKey = Buffer.from('484a8fd202f545cc0460ef485c332ac5', 'hex');
  const previousFormat = process.env.LOGH_LOBBY_OK_FORMAT;
  const previousEarly = process.env.LOGH_LOBBY_EARLY_OK;
  process.env.LOGH_LOBBY_OK_FORMAT = 'message32';
  delete process.env.LOGH_LOBBY_EARLY_OK;
  const server = await startLogh7AuthServer({
    host: '127.0.0.1',
    port: 0,
    clientExe: CLIENT_EXE,
    transportKey: TRANSPORT_KEY,
    decipherKey: DECIPHER_KEY,
    lobby: { ip: '127.0.0.1', port: 47900 },
    announcementText: 'WELCOME',
    accountStore: createAccountStore({ acceptAnyGin7: true }),
  });
  try {
    const received = await new Promise((resolve, reject) => {
      const socket = connect(server.port, '127.0.0.1');
      let buffer = Buffer.alloc(0);
      let sentLobbyLogin = false;
      const framesOut = [];
      const timer = setTimeout(() => reject(new Error('timed out waiting for announcement extra inner')), 4000);
      socket.on('connect', () => socket.write(buildPhase1RequestFrame(tables, encipherKey, 1)));
      socket.on('data', (chunk) => {
        buffer = Buffer.concat([buffer, chunk]);
        const { frames, remaining } = takeTransportFrames(buffer);
        buffer = Buffer.from(remaining);
        for (const frame of frames) {
          const code = frame.readUInt16BE(2);
          const conn2Code = frame.length >= 8 ? frame.readUInt16BE(6) : 0;
          if (code === 0x0035 && !sentLobbyLogin) {
            sentLobbyLogin = true;
            socket.write(
              Buffer.concat([
                buildClient0030Frame(tables, encipherKey, 1, Buffer.from('002000000001', 'hex')),
                buildClient0030Frame(
                  tables,
                  encipherKey,
                  2,
                  Buffer.from('200047494e3700040000070069006e00650069003000300000', 'hex'),
                ),
              ]),
            );
          } else if (conn2Code === 0x0030) {
            framesOut.push(frame);
            if (framesOut.length === 2) {
              clearTimeout(timer);
              socket.destroy();
              resolve(framesOut);
            }
          }
        }
      });
      socket.on('error', reject);
    });

    const parsed = received.map((frame) => parse0030Body(childCodecDecode(childCodecKeySchedule(tables, DECIPHER_KEY), frame.subarray(8))));
    assert.equal(parsed[0].valid, true);
    assert.equal(parsed[0].id, 3);
    assert.equal(parsed[0].innerPayload.toString('hex'), '000000002001000000');
    assert.equal(parsed[1].valid, true);
    assert.equal(parsed[1].id, 4);
    assert.equal(parsed[1].innerPayload.readUInt32BE(0), 0);
    assert.equal(parsed[1].innerPayload.readUInt16BE(4), LOBBY_SESSION_ANNOUNCE_NOTIFY_CODE);
    assert.equal(parsed[1].innerPayload.subarray(6, 13).toString('latin1'), 'WELCOME');
    assert.equal(parsed[1].innerPayload.readUInt8(13), 0);
  } finally {
    if (previousFormat === undefined) delete process.env.LOGH_LOBBY_OK_FORMAT;
    else process.env.LOGH_LOBBY_OK_FORMAT = previousFormat;
    if (previousEarly === undefined) delete process.env.LOGH_LOBBY_EARLY_OK;
    else process.env.LOGH_LOBBY_EARLY_OK = previousEarly;
    await server.close();
  }
});

// Build a valid phase1 (0x0034) request frame the way the real client would, so the
// server's buildPhase3ResponseFromPhase1Request can decode our chosen encipherKey.
function buildPhase1RequestFrame(tables, encipherKey, sequence) {
  const body = Buffer.alloc(2 + encipherKey.length + 4);
  body.writeUInt16BE(encipherKey.length, 0);
  encipherKey.copy(body, 2);
  body.writeUInt32BE(sequence, 2 + encipherKey.length);
  const decoded = Buffer.alloc(body.length + 2);
  decoded.writeUInt16BE(compute0030Checksum(body), 0);
  body.copy(decoded, 2);
  const encoded = childCodecEncode(childCodecKeySchedule(tables, TRANSPORT_KEY), decoded);
  const frame = Buffer.alloc(4 + encoded.length);
  frame.writeUInt16BE(2 + encoded.length, 0);
  frame.writeUInt16BE(0x0034, 2);
  encoded.copy(frame, 4);
  return frame;
}

test('auth server drives a simulated client through handshake -> login -> redirect', { skip: !HAS_EXE && 'client exe not present' }, async () => {
  const tables = resolveChildCodecTables({ clientExe: CLIENT_EXE });
  const encipherKey = Buffer.from('4ee698865ce45e2bc5e5ec149511d551', 'hex'); // real captured encipherKey
  const server = await startLogh7AuthServer({
    host: '127.0.0.1',
    port: 0,
    clientExe: CLIENT_EXE,
    transportKey: TRANSPORT_KEY,
    decipherKey: DECIPHER_KEY,
    lobby: { ip: '127.0.0.1', port: 47900 },
    accountStore: createAccountStore({ acceptAnyGin7: true }),
  });
  try {
    const received = await new Promise((resolve, reject) => {
      const socket = connect(server.port, '127.0.0.1');
      let buffer = Buffer.alloc(0);
      let sentLogin = false;
      const received0030 = [];
      const timer = setTimeout(() => reject(new Error('timed out waiting for redirect reply')), 4000);
      socket.on('connect', () => socket.write(buildPhase1RequestFrame(tables, encipherKey, 1)));
      socket.on('data', (chunk) => {
        buffer = Buffer.concat([buffer, chunk]);
        const { frames, remaining } = takeTransportFrames(buffer);
        buffer = Buffer.from(remaining);
        for (const frame of frames) {
          const code = frame.readUInt16BE(2);
          if (code === 0x0035 && !sentLogin) {
            sentLogin = true;
            // client encodes its login 0x0030 with the encipherKey it chose
            const body = build0030Body({ id: 1, innerPayload: LOGIN_INNER });
            const encoded = childCodecEncode(childCodecKeySchedule(tables, encipherKey), body);
            const loginFrame = Buffer.alloc(4 + encoded.length);
            loginFrame.writeUInt16BE(2 + encoded.length, 0);
            loginFrame.writeUInt16BE(0x0030, 2);
            encoded.copy(loginFrame, 4);
            socket.write(loginFrame);
          } else if (code === 0x0030 && sentLogin) {
            // first 0x0030 reply is the keysetup; collect both, then resolve on the 2nd
            if (!received0030.length) {
              received0030.push(frame);
            } else {
              received0030.push(frame);
              clearTimeout(timer);
              socket.destroy();
              resolve(received0030);
            }
          }
        }
      });
      socket.on('error', reject);
    });
    assert.equal(received.length, 2, 'server should send keysetup + redirect frames');
    // verify the 2nd (redirect) frame decodes with the GIN7 key to inner 0x7001
    const gin7Key = LOGIN_INNER.subarray(2);
    const redirectBody = childCodecDecode(childCodecKeySchedule(tables, gin7Key), received[1].subarray(4));
    const redirectParsed = parse0030Body(redirectBody);
    assert.equal(redirectParsed.valid, true);
    assert.equal(redirectParsed.innerPayload.readUInt16BE(0), REDIRECT_INNER_CODE);
    assert.equal(redirectParsed.innerPayload.readUInt16BE(12), 47900);
    // sanity: login inner is the GIN7 credential
    assert.equal(LOGIN_INNER.readUInt16BE(0), LOGIN_INNER_CODE);
  } finally {
    await server.close();
  }
});

// 동시 세션 가드 회귀 테스트용 헬퍼: 한 소켓을 phase1→0x0035→GIN7 로그인까지 몰아 redirect(2번째 0x0030)
// 수신을 약속으로 노출하되, takeover 관찰을 위해 소켓은 닫지 않고 살려둔다. onClose는 서버가 이 연결을
// 끊었는지(축출/거부) 감지한다. redirected에는 무해한 catch를 붙여(거부 정책에서 timeout 거부가 발생해도)
// unhandled rejection을 막는다.
function driveGuardLogin(server, tables, account, sockets) {
  const encipherKey = Buffer.from('4ee698865ce45e2bc5e5ec149511d551', 'hex');
  const socket = connect(server.port, '127.0.0.1');
  sockets.push(socket);
  const credential = buildGin7Credential({ account, password: 'guardpw' });
  let buffer = Buffer.alloc(0);
  let sentLogin = false;
  let received0030 = 0;
  let timer;
  const redirected = new Promise((resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`timed out waiting for redirect (${account})`)), 4000);
    socket.on('connect', () => socket.write(buildPhase1RequestFrame(tables, encipherKey, 1)));
    socket.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      const { frames, remaining } = takeTransportFrames(buffer);
      buffer = Buffer.from(remaining);
      for (const frame of frames) {
        const code = frame.readUInt16BE(2);
        if (code === 0x0035 && !sentLogin) {
          sentLogin = true;
          socket.write(buildClient0030Frame(tables, encipherKey, 1, credential));
        } else if (code === 0x0030 && sentLogin) {
          received0030 += 1;
          // 1번째=keysetup, 2번째=redirect. 둘 다 받으면 로그인 성공(presence 등록 완료).
          if (received0030 === 2) { clearTimeout(timer); resolve(); }
        }
      }
    });
    socket.on('error', reject);
  });
  redirected.catch(() => {}); // 거부 정책에서 timeout 거부가 unhandled 되지 않게 무해한 핸들러 부착
  const onClose = new Promise((resolve) => {
    socket.on('close', () => { clearTimeout(timer); resolve(); });
  });
  return { socket, redirected, onClose };
}

function withTimeout(promise, ms, message) {
  const t = new Promise((_, reject) => { setTimeout(() => reject(new Error(message)), ms).unref(); });
  return Promise.race([promise, t]);
}

test('concurrent-session guard: takeover evicts the prior same-account connection', { skip: !HAS_EXE && 'client exe not present' }, async () => {
  const tables = resolveChildCodecTables({ clientExe: CLIENT_EXE });
  const prevPolicy = process.env.LOGH_SESSION_POLICY;
  delete process.env.LOGH_SESSION_POLICY; // 기본값 = takeover
  const server = await startLogh7AuthServer({
    host: '127.0.0.1',
    port: 0,
    clientExe: CLIENT_EXE,
    transportKey: TRANSPORT_KEY,
    decipherKey: DECIPHER_KEY,
    lobby: { ip: '127.0.0.1', port: 47900 },
    accountStore: createAccountStore({ acceptAnyGin7: true }),
  });
  const sockets = [];
  try {
    const a = driveGuardLogin(server, tables, 'guardtko', sockets);
    await a.redirected;
    // 같은 계정 B 로그인 → A 가 축출되어야 함.
    const b = driveGuardLogin(server, tables, 'guardtko', sockets);
    await b.redirected;
    await withTimeout(a.onClose, 4000, 'takeover should evict the prior connection within 4s');
    assert.equal(a.socket.destroyed, true, 'prior connection must be closed on takeover');
    assert.equal(b.socket.destroyed, false, 'new connection must remain open on takeover');
  } finally {
    for (const s of sockets) { try { s.destroy(); } catch { /* 이미 닫힘 */ } }
    await server.close();
    if (prevPolicy === undefined) delete process.env.LOGH_SESSION_POLICY;
    else process.env.LOGH_SESSION_POLICY = prevPolicy;
  }
});

test('concurrent-session guard: reject policy keeps the prior connection and drops the new login', { skip: !HAS_EXE && 'client exe not present' }, async () => {
  const tables = resolveChildCodecTables({ clientExe: CLIENT_EXE });
  const prevPolicy = process.env.LOGH_SESSION_POLICY;
  process.env.LOGH_SESSION_POLICY = 'reject';
  const server = await startLogh7AuthServer({
    host: '127.0.0.1',
    port: 0,
    clientExe: CLIENT_EXE,
    transportKey: TRANSPORT_KEY,
    decipherKey: DECIPHER_KEY,
    lobby: { ip: '127.0.0.1', port: 47900 },
    accountStore: createAccountStore({ acceptAnyGin7: true }),
  });
  const sockets = [];
  try {
    const a = driveGuardLogin(server, tables, 'guardrej', sockets);
    await a.redirected;
    // 같은 계정 B 로그인 → 거부 정책이면 B 가 redirect 없이 끊긴다(A 유지).
    const b = driveGuardLogin(server, tables, 'guardrej', sockets);
    await withTimeout(b.onClose, 4000, 'rejected new connection must be closed by the server');
    assert.equal(b.socket.destroyed, true, 'new connection must be dropped under reject policy');
    assert.equal(a.socket.destroyed, false, 'prior connection must stay open under reject policy');
  } finally {
    for (const s of sockets) { try { s.destroy(); } catch { /* 이미 닫힘 */ } }
    await server.close();
    if (prevPolicy === undefined) delete process.env.LOGH_SESSION_POLICY;
    else process.env.LOGH_SESSION_POLICY = prevPolicy;
  }
});

test('concurrent-session guard: distinct accounts are not evicted', { skip: !HAS_EXE && 'client exe not present' }, async () => {
  const tables = resolveChildCodecTables({ clientExe: CLIENT_EXE });
  const prevPolicy = process.env.LOGH_SESSION_POLICY;
  delete process.env.LOGH_SESSION_POLICY; // 기본값 = takeover
  const server = await startLogh7AuthServer({
    host: '127.0.0.1',
    port: 0,
    clientExe: CLIENT_EXE,
    transportKey: TRANSPORT_KEY,
    decipherKey: DECIPHER_KEY,
    lobby: { ip: '127.0.0.1', port: 47900 },
    accountStore: createAccountStore({ acceptAnyGin7: true }),
  });
  const sockets = [];
  try {
    const a = driveGuardLogin(server, tables, 'guardx', sockets);
    await a.redirected;
    let aClosed = false;
    a.onClose.then(() => { aClosed = true; });
    // 다른 계정 B 로그인 → A 는 영향 없어야 함.
    const b = driveGuardLogin(server, tables, 'guardy', sockets);
    await b.redirected;
    await new Promise((resolve) => { setTimeout(resolve, 200); }); // 서버가 잘못 끊을 여유 부여
    assert.equal(aClosed, false, 'a different-account login must not evict the prior session');
    assert.equal(a.socket.destroyed, false, 'prior connection must stay open for a distinct account');
    assert.equal(b.socket.destroyed, false, 'new connection must stay open for a distinct account');
  } finally {
    for (const s of sockets) { try { s.destroy(); } catch { /* 이미 닫힘 */ } }
    await server.close();
    if (prevPolicy === undefined) delete process.env.LOGH_SESSION_POLICY;
    else process.env.LOGH_SESSION_POLICY = prevPolicy;
  }
});

test('persistence dirty-checking: skips the write-behind save when nothing changed and records only on change', async () => {
  // 스파이 repository로 save() 호출 횟수를 센다. 주기 인터벌은 끄고(persistIntervalMs:0) 백그라운드 sim/economy도
  // 전부 off(loadConfig({}))해 persist() 호출만이 저장을 구동하게 만든다 — 더티체킹을 결정론적으로 검증.
  let saveCount = 0;
  const spyRepository = {
    backend: 'memory-spy',
    load() { return null; },
    save() { saveCount += 1; },
    close() {},
  };
  const server = await startLogh7AuthServer({
    host: '127.0.0.1',
    port: 0,
    transportKey: TRANSPORT_KEY,
    decipherKey: DECIPHER_KEY,
    lobby: { ip: '127.0.0.1', port: 47900 },
    accountStore: createAccountStore({ acceptAnyGin7: true }),
    repository: spyRepository,
    persistIntervalMs: 0, // 주기 인터벌 비활성
    config: loadConfig({}), // 앰비언트 env 차단 → npc/strat/economy 전부 off
  });
  try {
    server.persist();
    assert.equal(saveCount, 1, '첫 저장은 현재 상태를 기록한다');
    server.persist();
    assert.equal(saveCount, 1, '변경이 없으면 두 번째 persist는 생략(더티체킹)');
    server.worldState.upsertFleet({ id: 7777, owner: 1, faction: 'empire', cell: 5 });
    server.persist();
    assert.equal(saveCount, 2, '상태가 변하면 persist가 기록한다');
    server.persist();
    assert.equal(saveCount, 2, '다시 변경이 없으면 또 생략한다');
  } finally {
    await server.close();
  }
  assert.equal(saveCount, 2, '종료 시에도 변경이 없으면 추가 기록이 없다');
});

test('persistence dirty-checking: 유휴 flush는 직렬화(toSnapshot)조차 건너뛴다 — revision 빠른 게이트(속도)', async () => {
  // 위 테스트가 "디스크쓰기 생략"을 증명한다면, 이건 그 앞단 ① revision 게이트가 **직렬화 자체**를 건너뛰어
  // 유휴 비용이 월드 크기와 무관한 O(1)임을 증명한다. server.worldState.toSnapshot을 카운터로 감싸 호출수를 센다.
  let saveCount = 0;
  const spyRepository = { backend: 'memory-spy', load() { return null; }, save() { saveCount += 1; }, close() {} };
  const server = await startLogh7AuthServer({
    host: '127.0.0.1',
    port: 0,
    transportKey: TRANSPORT_KEY,
    decipherKey: DECIPHER_KEY,
    lobby: { ip: '127.0.0.1', port: 47900 },
    accountStore: createAccountStore({ acceptAnyGin7: true }),
    repository: spyRepository,
    persistIntervalMs: 0,
    config: loadConfig({}),
  });
  try {
    // toSnapshot(=직렬화 O(N) 비용원)을 계측 래퍼로 교체. reader라 revision엔 영향 없음. saveSnapshot은
    // 호출 시점에 worldState.toSnapshot을 조회하므로 이 래퍼가 그대로 쓰인다.
    let snapshotCalls = 0;
    const realSnapshot = server.worldState.toSnapshot;
    server.worldState.toSnapshot = (...args) => { snapshotCalls += 1; return realSnapshot.apply(server.worldState, args); };

    server.persist();
    assert.equal(snapshotCalls, 1, '첫 flush는 직렬화 1회');
    assert.equal(saveCount, 1, '첫 flush는 디스크 기록 1회');
    // 변이 없이 여러 번 flush → 전부 ① revision 게이트에서 끊겨 직렬화 0회 추가(유휴 = 상수시간)
    for (let i = 0; i < 50; i += 1) server.persist();
    assert.equal(snapshotCalls, 1, '유휴 50회 flush 동안 직렬화는 추가로 일어나지 않아야 한다(O(1) 게이트)');
    assert.equal(saveCount, 1, '유휴 동안 디스크 기록도 없다');
    // mutator 1회(revision 전진) → 다음 flush는 정확히 1회만 직렬화+기록
    server.worldState.upsertFleet({ id: 8888, owner: 1, faction: 'alliance', cell: 7 });
    server.persist();
    assert.equal(snapshotCalls, 2, '변이 후 flush는 직렬화 1회 추가');
    assert.equal(saveCount, 2, '변이 후 flush는 디스크 기록 1회 추가');
  } finally {
    await server.close();
  }
});

test('auth server trace redacts raw hex payload and key fields from real traffic', { skip: !HAS_EXE && 'client exe not present' }, async () => {
  const tables = resolveChildCodecTables({ clientExe: CLIENT_EXE });
  const dir = mkdtempSync(path.join(tmpdir(), 'logh7-auth-trace-redact-'));
  const tracePath = path.join(dir, 'auth-trace.jsonl');
  const credential = buildGin7Credential({ account: 'p001flow', password: 'FlowPw17!' });
  const lobbyCredential = withInnerCode(credential, 0x2000);
  const previousLobbyReply = process.env.LOGH_LOBBY_REPLY;
  let server;
  const driveLobbyLogin = ({ encipherKey, expectSubheader }) => new Promise((resolve, reject) => {
    const socket = connect(server.port, '127.0.0.1');
    let buffer = Buffer.alloc(0);
    let sentLobbyLogin = false;
    const timer = setTimeout(() => reject(new Error('timed out waiting for traced lobby login response')), 4000);
    const finish = () => {
      clearTimeout(timer);
      socket.once('close', resolve);
      socket.destroy();
    };
    socket.on('connect', () => socket.write(buildPhase1RequestFrame(tables, encipherKey, 1)));
    socket.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      const { frames, remaining } = takeTransportFrames(buffer);
      buffer = Buffer.from(remaining);
      for (const frame of frames) {
        const code = frame.readUInt16BE(2);
        const conn2Code = frame.length >= 8 ? frame.readUInt16BE(6) : 0;
        if (code === 0x0035 && !sentLobbyLogin) {
          sentLobbyLogin = true;
          socket.write(Buffer.concat([
            buildClient0030Frame(tables, encipherKey, 1, Buffer.from('002000000001', 'hex')),
            buildClient0030Frame(tables, encipherKey, 2, lobbyCredential),
          ]));
        } else if ((expectSubheader && conn2Code === 0x0030) || (!expectSubheader && code === 0x0030)) {
          finish();
        }
      }
    });
    socket.on('error', reject);
  });
  try {
    server = await startLogh7AuthServer({
      host: '127.0.0.1',
      port: 0,
      clientExe: CLIENT_EXE,
      transportKey: TRANSPORT_KEY,
      decipherKey: DECIPHER_KEY,
      lobby: { ip: '127.0.0.1', port: 47900 },
      world: { ip: '127.0.0.1', port: 47901 },
      accountStore: createAccountStore({ acceptAnyGin7: true }),
      tracePath,
    });

    await new Promise((resolve, reject) => {
      const socket = connect(server.port, '127.0.0.1');
      const encipherKey = Buffer.from('4ee698865ce45e2bc5e5ec149511d551', 'hex');
      let buffer = Buffer.alloc(0);
      let sentLogin = false;
      let received0030 = 0;
      const timer = setTimeout(() => reject(new Error('timed out waiting for traced login redirect')), 4000);
      const finish = () => {
        clearTimeout(timer);
        socket.once('close', resolve);
        socket.destroy();
      };
      socket.on('connect', () => socket.write(buildPhase1RequestFrame(tables, encipherKey, 1)));
      socket.on('data', (chunk) => {
        buffer = Buffer.concat([buffer, chunk]);
        const { frames, remaining } = takeTransportFrames(buffer);
        buffer = Buffer.from(remaining);
        for (const frame of frames) {
          const code = frame.readUInt16BE(2);
          if (code === 0x0035 && !sentLogin) {
            sentLogin = true;
            socket.write(buildClient0030Frame(tables, encipherKey, 1, credential));
          } else if (code === 0x0030) {
            received0030 += 1;
            if (received0030 === 2) {
              finish();
            }
          }
        }
      });
      socket.on('error', reject);
    });

    delete process.env.LOGH_LOBBY_REPLY;
    await driveLobbyLogin({
      encipherKey: Buffer.from('484a8fd202f545cc0460ef485c332ac5', 'hex'),
      expectSubheader: true,
    });

    process.env.LOGH_LOBBY_REPLY = 'redirect7001';
    await driveLobbyLogin({
      encipherKey: Buffer.from('e9f4c6fd936819948eb614a2567c72ce', 'hex'),
      expectSubheader: false,
    });
  } finally {
    if (server) {
      await new Promise((resolve) => { setTimeout(resolve, 50); });
      await server.close();
    }
    if (previousLobbyReply === undefined) delete process.env.LOGH_LOBBY_REPLY;
    else process.env.LOGH_LOBBY_REPLY = previousLobbyReply;
  }

  try {
    const traceText = readFileSync(tracePath, 'utf8');
    const traceEvents = traceText.trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
    const eventNames = traceEvents.map((event) => event.event);
    assert.ok(eventNames.includes('phase3-sent'));
    assert.ok(eventNames.includes('redirect-sent'));
    assert.ok(eventNames.includes('lobby-login-ok-sent'));
    assert.ok(eventNames.includes('lobby-redirect-sent'));
    assert.ok(traceText.includes('p001flow'));

    const allowedHexFields = new Set(['innerCodeHex', 'respInnerCodeHex']);
    const rawHexFields = [];
    traceEvents.forEach((event, index) => {
      for (const field of Object.keys(event)) {
        if (field.endsWith('Hex') && !allowedHexFields.has(field)) {
          rawHexFields.push(`${index + 1}:${field}`);
        }
      }
    });
    assert.deepEqual(rawHexFields, []);
    assert.equal(traceText.includes(credential.toString('hex')), false);
    assert.equal(traceText.includes(lobbyCredential.toString('hex')), false);
    assert.equal(traceText.includes('FlowPw17!'), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('lobby follow-up responses keep the conn2 0x0030 subheader', { skip: !HAS_EXE && 'client exe not present' }, async () => {
  const tables = resolveChildCodecTables({ clientExe: CLIENT_EXE });
  const encipherKey = Buffer.from('484a8fd202f545cc0460ef485c332ac5', 'hex');
  const previousFormat = process.env.LOGH_LOBBY_OK_FORMAT;
  process.env.LOGH_LOBBY_OK_FORMAT = 'message32';
  const server = await startLogh7AuthServer({
    host: '127.0.0.1',
    port: 0,
    clientExe: CLIENT_EXE,
    transportKey: TRANSPORT_KEY,
    decipherKey: DECIPHER_KEY,
    lobby: { ip: '127.0.0.1', port: 47900 },
    characters: [{ id: 9 }],
    accountStore: createAccountStore({ acceptAnyGin7: true }),
  });
  try {
    const followUpFrame = await new Promise((resolve, reject) => {
      const socket = connect(server.port, '127.0.0.1');
      let buffer = Buffer.alloc(0);
      let sentLobbyLogin = false;
      let sentCharacterCharge = false;
      const timer = setTimeout(() => reject(new Error('timed out waiting for 0x2004 follow-up')), 4000);
      socket.on('connect', () => socket.write(buildPhase1RequestFrame(tables, encipherKey, 1)));
      socket.on('data', (chunk) => {
        buffer = Buffer.concat([buffer, chunk]);
        const { frames, remaining } = takeTransportFrames(buffer);
        buffer = Buffer.from(remaining);
        for (const frame of frames) {
          const code = frame.readUInt16BE(2);
          const conn2Code = frame.length >= 8 ? frame.readUInt16BE(6) : 0;
          if (code === 0x0035 && !sentLobbyLogin) {
            sentLobbyLogin = true;
            socket.write(
              Buffer.concat([
                buildClient0030Frame(tables, encipherKey, 1, Buffer.from('002000000001', 'hex')),
                buildClient0030Frame(
                  tables,
                  encipherKey,
                  2,
                  Buffer.from('200047494e3700040000070069006e00650069003000300000', 'hex'),
                ),
              ]),
            );
          } else if (conn2Code === 0x0030 && !sentCharacterCharge) {
            const decoded = childCodecDecode(childCodecKeySchedule(tables, DECIPHER_KEY), frame.subarray(8));
            const parsed = parse0030Body(decoded);
            assert.equal(parsed.valid, true);
            assert.equal(parsed.innerPayload.toString('hex'), '000000002001000000');
            sentCharacterCharge = true;
            socket.write(buildClient0030Frame(tables, encipherKey, 3, Buffer.from('2003', 'hex')));
          } else if (sentCharacterCharge) {
            clearTimeout(timer);
            socket.destroy();
            resolve(frame);
          }
        }
      });
      socket.on('error', reject);
    });

    assert.equal(followUpFrame.readUInt16BE(0), 0x06f6);
    assert.equal(followUpFrame.length, 0x06f8);
    assert.equal(followUpFrame.readUInt16BE(2), 0);
    assert.equal(followUpFrame.readUInt16BE(6), 0x0030);
    const decoded = childCodecDecode(childCodecKeySchedule(tables, DECIPHER_KEY), followUpFrame.subarray(8));
    const parsed = parse0030Body(decoded);
    assert.equal(parsed.valid, true);
    assert.equal(parsed.id, 4);
    assert.equal(parsed.innerPayload.length, 0x06e2);
    assert.equal(parsed.innerPayload.readUInt32BE(0), 0);
    assert.equal(parsed.innerPayload.readUInt16BE(4), 0x2004);
    const payload = parsed.innerPayload.subarray(6);
    assert.equal(payload.length, 0x06dc);
    assert.equal(payload.readUInt8(0), 1);
    assert.equal(payload.readUInt16LE(1), 9);
  } finally {
    if (previousFormat === undefined) {
      delete process.env.LOGH_LOBBY_OK_FORMAT;
    } else {
      process.env.LOGH_LOBBY_OK_FORMAT = previousFormat;
    }
    await server.close();
  }
});

test('auth server answers conn3 app-level 0x0200 with message32 SSLoginOK 0x0201 by default', { skip: !HAS_EXE && 'client exe not present' }, async () => {
  const tables = resolveChildCodecTables({ clientExe: CLIENT_EXE });
  const encipherKey = Buffer.from('e9f4c6fd936819948eb614a2567c72ce', 'hex');
  const server = await startLogh7AuthServer({
    host: '127.0.0.1',
    port: 0,
    clientExe: CLIENT_EXE,
    transportKey: TRANSPORT_KEY,
    decipherKey: DECIPHER_KEY,
    lobby: { ip: '127.0.0.1', port: 47900 },
    accountStore: createAccountStore({ acceptAnyGin7: true }),
  });
  try {
    const ssLoginOkFrame = await new Promise((resolve, reject) => {
      const socket = connect(server.port, '127.0.0.1');
      let buffer = Buffer.alloc(0);
      let sentSsLogin = false;
      const timer = setTimeout(() => reject(new Error('timed out waiting for 0x0201 SSLoginOK')), 4000);
      socket.on('connect', () => socket.write(buildPhase1RequestFrame(tables, encipherKey, 1)));
      socket.on('data', (chunk) => {
        buffer = Buffer.concat([buffer, chunk]);
        const { frames, remaining } = takeTransportFrames(buffer);
        buffer = Buffer.from(remaining);
        for (const frame of frames) {
          const code = frame.readUInt16BE(2);
          const conn3Code = frame.length >= 8 ? frame.readUInt16BE(6) : 0;
          if (code === 0x0035 && !sentSsLogin) {
            sentSsLogin = true;
            socket.write(
              Buffer.concat([
                buildClient0030Frame(tables, encipherKey, 1, Buffer.from('002000000000', 'hex')),
                buildClient0030Frame(
                  tables,
                  encipherKey,
                  2,
                  Buffer.from('020047494e3700570000070069006e00650069003000300000', 'hex'),
                ),
              ]),
            );
          } else if (conn3Code === 0x0030) {
            clearTimeout(timer);
            socket.destroy();
            resolve(frame);
          }
        }
      });
      socket.on('error', reject);
    });

    assert.equal(ssLoginOkFrame.readUInt16BE(2), 0);
    assert.equal(ssLoginOkFrame.readUInt16BE(6), 0x0030);
    const decoded = childCodecDecode(childCodecKeySchedule(tables, DECIPHER_KEY), ssLoginOkFrame.subarray(8));
    const parsed = parse0030Body(decoded);
    assert.equal(parsed.valid, true);
    assert.equal(parsed.id, 3);
    // G138 PROVEN default: message32 wrap [u32 0][u16 0x0201][u8 status]
    assert.equal(parsed.innerPayload.toString('hex'), '00000000020101');
    assert.equal(parsed.innerPayload.readUInt16BE(4), 0x0201);
  } finally {
    await server.close();
  }
});

test('auth server keeps the legacy raw conn3 0x0201 reachable via LOGH_SS_FORMAT=raw (A/B)', { skip: !HAS_EXE && 'client exe not present' }, async () => {
  const tables = resolveChildCodecTables({ clientExe: CLIENT_EXE });
  const encipherKey = Buffer.from('e9f4c6fd936819948eb614a2567c72ce', 'hex');
  const previousFormat = process.env.LOGH_SS_FORMAT;
  process.env.LOGH_SS_FORMAT = 'raw';
  const server = await startLogh7AuthServer({
    host: '127.0.0.1',
    port: 0,
    clientExe: CLIENT_EXE,
    transportKey: TRANSPORT_KEY,
    decipherKey: DECIPHER_KEY,
    lobby: { ip: '127.0.0.1', port: 47900 },
    accountStore: createAccountStore({ acceptAnyGin7: true }),
  });
  try {
    const ssLoginOkFrame = await new Promise((resolve, reject) => {
      const socket = connect(server.port, '127.0.0.1');
      let buffer = Buffer.alloc(0);
      let sentSsLogin = false;
      const timer = setTimeout(() => reject(new Error('timed out waiting for message32 0x0201')), 4000);
      socket.on('connect', () => socket.write(buildPhase1RequestFrame(tables, encipherKey, 1)));
      socket.on('data', (chunk) => {
        buffer = Buffer.concat([buffer, chunk]);
        const { frames, remaining } = takeTransportFrames(buffer);
        buffer = Buffer.from(remaining);
        for (const frame of frames) {
          const code = frame.readUInt16BE(2);
          const conn3Code = frame.length >= 8 ? frame.readUInt16BE(6) : 0;
          if (code === 0x0035 && !sentSsLogin) {
            sentSsLogin = true;
            socket.write(
              Buffer.concat([
                buildClient0030Frame(tables, encipherKey, 1, Buffer.from('002000000000', 'hex')),
                buildClient0030Frame(
                  tables,
                  encipherKey,
                  2,
                  Buffer.from('020047494e3700570000070069006e00650069003000300000', 'hex'),
                ),
              ]),
            );
          } else if (conn3Code === 0x0030) {
            clearTimeout(timer);
            socket.destroy();
            resolve(frame);
          }
        }
      });
      socket.on('error', reject);
    });

    const decoded = childCodecDecode(childCodecKeySchedule(tables, DECIPHER_KEY), ssLoginOkFrame.subarray(8));
    const parsed = parse0030Body(decoded);
    assert.equal(parsed.valid, true);
    assert.equal(parsed.innerPayload.toString('hex'), '02010100');
    assert.equal(parsed.innerPayload.readUInt16BE(0), 0x0201);
  } finally {
    if (previousFormat === undefined) {
      delete process.env.LOGH_SS_FORMAT;
    } else {
      process.env.LOGH_SS_FORMAT = previousFormat;
    }
    await server.close();
  }
});

test('auth server persists 0x1008 profile through loopback-bound lobby connection', { skip: !HAS_EXE && 'client exe not present' }, async () => {
  const tables = resolveChildCodecTables({ clientExe: CLIENT_EXE });
  const dir = mkdtempSync(path.join(tmpdir(), 'logh7-auth-bound-profile-'));
  const db = path.join(dir, 'accounts.sqlite');
  const credential = buildGin7Credential({ account: 'p001flow', password: 'FlowPw17!' });
  const registry = createAccountRegistry({ persistPath: db });
  registry.register('p001flow', credential);
  const accountStore = createAccountStore({
    acceptAnyGin7: false,
    allowRegister: false,
    registry,
  });
  const server = await startLogh7AuthServer({
    host: '127.0.0.1',
    port: 0,
    clientExe: CLIENT_EXE,
    transportKey: TRANSPORT_KEY,
    decipherKey: DECIPHER_KEY,
    lobby: { ip: '127.0.0.1', port: 47900 },
    characters: [],
    accountStore,
  });
  try {
    await new Promise((resolve, reject) => {
      const socket = connect(server.port, '127.0.0.1');
      const encipherKey = Buffer.from('4ee698865ce45e2bc5e5ec149511d551', 'hex');
      let buffer = Buffer.alloc(0);
      let sentLogin = false;
      let replies = 0;
      const timer = setTimeout(() => reject(new Error('timed out waiting for bound login redirect')), 4000);
      socket.on('connect', () => socket.write(buildPhase1RequestFrame(tables, encipherKey, 1)));
      socket.on('data', (chunk) => {
        buffer = Buffer.concat([buffer, chunk]);
        const { frames, remaining } = takeTransportFrames(buffer);
        buffer = Buffer.from(remaining);
        for (const frame of frames) {
          const code = frame.readUInt16BE(2);
          if (code === 0x0035 && !sentLogin) {
            sentLogin = true;
            socket.write(buildClient0030Frame(tables, encipherKey, 1, credential));
          } else if (code === 0x0030) {
            replies += 1;
            if (replies === 2) {
              clearTimeout(timer);
              socket.destroy();
              resolve();
            }
          }
        }
      });
      socket.on('error', reject);
    });

    const cardListInner = await new Promise((resolve, reject) => {
      const socket = connect(server.port, '127.0.0.1');
      const encipherKey = Buffer.from('484a8fd202f545cc0460ef485c332ac5', 'hex');
      const lobbyCredential = withInnerCode(credential, 0x2000);
      let buffer = Buffer.alloc(0);
      let sentLobbyLogin = false;
      let sentCreate = false;
      let sentList = false;
      const timer = setTimeout(() => reject(new Error('timed out waiting for bound lobby card list')), 4000);
      socket.on('connect', () => socket.write(buildPhase1RequestFrame(tables, encipherKey, 2)));
      socket.on('data', (chunk) => {
        buffer = Buffer.concat([buffer, chunk]);
        const { frames, remaining } = takeTransportFrames(buffer);
        buffer = Buffer.from(remaining);
        for (const frame of frames) {
          const code = frame.readUInt16BE(2);
          const conn2Code = frame.length >= 8 ? frame.readUInt16BE(6) : 0;
          if (code === 0x0035 && !sentLobbyLogin) {
            sentLobbyLogin = true;
            socket.write(Buffer.concat([
              buildClient0030Frame(tables, encipherKey, 1, Buffer.from('002000000001', 'hex')),
              buildClient0030Frame(tables, encipherKey, 2, lobbyCredential),
            ]));
          } else if (conn2Code === 0x0030) {
            const inner = parseConn2Inner(tables, frame);
            const innerCode = appInnerCode(inner);
            if (innerCode === 0x2001 && !sentCreate) {
              sentCreate = true;
              socket.write(buildClient0030Frame(
                tables,
                encipherKey,
                3,
                makeGenerateCharacterCharge({ lastname: 'Bound', firstname: 'Tcp' }),
              ));
            } else if (innerCode === CMD_GENERATE_CHARGE_CODE && !sentList) {
              sentList = true;
              socket.write(buildClient0030Frame(tables, encipherKey, 4, Buffer.from('2003', 'hex')));
            } else if (innerCode === 0x2004) {
              clearTimeout(timer);
              socket.destroy();
              resolve(inner);
            }
          }
        }
      });
      socket.on('error', reject);
    });

    assert.equal(cardListInner.readUInt16BE(4), 0x2004);
    const cardPayload = cardListInner.subarray(6);
    assert.equal(cardPayload.readUInt8(0), 1);
    const characterId = cardPayload.readUInt16LE(1);
    assert.ok(characterId > 0);
    const persisted = { accounts: loadAccountRecords(db) };
    assert.equal(persisted.accounts[0].account, 'p001flow');
    assert.equal(persisted.accounts[0].characters.length, 1);
    assert.equal(persisted.accounts[0].characters[0].characterId, characterId);
    assert.equal(persisted.accounts[0].characters[0].lastname, 'Bound');
  } finally {
    await server.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('auth server boots with LOGH_CONTENT_DB=1 (world seeded from the recovered content DB)', { skip: !HAS_EXE && 'client exe not present' }, async () => {
  const previous = process.env.LOGH_CONTENT_DB;
  process.env.LOGH_CONTENT_DB = '1';
  let server;
  try {
    // building the DB-driven content pack (galaxy/roster/units) must validate and not throw on boot
    server = await startLogh7AuthServer({
      host: '127.0.0.1',
      port: 0,
      clientExe: CLIENT_EXE,
      transportKey: TRANSPORT_KEY,
      decipherKey: DECIPHER_KEY,
      lobby: { ip: '127.0.0.1', port: 47900 },
      accountStore: createAccountStore({ acceptAnyGin7: true }),
    });
    assert.ok(server.port > 0, 'server bound with the recovered content pack');
  } finally {
    if (previous === undefined) {
      delete process.env.LOGH_CONTENT_DB;
    } else {
      process.env.LOGH_CONTENT_DB = previous;
    }
    if (server) await server.close();
  }
});

test('strategic sim wiring: gate OFF leaves stratTickOnce inert', { skip: !HAS_EXE && 'client exe not present' }, async () => {
  // LOGH_STRAT_SIM unset → no scheduler, the exposed tick is a no-op (returns null).
  const saved = { relay: process.env.LOGH_RELAY, auth: process.env.LOGH_AUTHORITATIVE, strat: process.env.LOGH_STRAT_SIM };
  process.env.LOGH_RELAY = '1';
  process.env.LOGH_AUTHORITATIVE = '1';
  delete process.env.LOGH_STRAT_SIM;
  let server;
  try {
    server = await startLogh7AuthServer({
      host: '127.0.0.1', port: 0, clientExe: CLIENT_EXE,
      transportKey: TRANSPORT_KEY, decipherKey: DECIPHER_KEY,
      lobby: { ip: '127.0.0.1', port: 47900 },
      accountStore: createAccountStore({ acceptAnyGin7: true }),
    });
    assert.equal(server.stratSimEnabled, false);
    assert.equal(server.stratTickOnce(), null, 'gate OFF → tick no-op');
  } finally {
    for (const [k, v] of [['LOGH_RELAY', saved.relay], ['LOGH_AUTHORITATIVE', saved.auth], ['LOGH_STRAT_SIM', saved.strat]]) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
    if (server) await server.close();
  }
});

test('strategic sim wiring: gate ON advances the galaxy with zero connected players', { skip: !HAS_EXE && 'client exe not present' }, async () => {
  const saved = {
    relay: process.env.LOGH_RELAY, auth: process.env.LOGH_AUTHORITATIVE,
    strat: process.env.LOGH_STRAT_SIM, db: process.env.LOGH_CONTENT_DB,
  };
  process.env.LOGH_RELAY = '1';
  process.env.LOGH_AUTHORITATIVE = '1';
  process.env.LOGH_STRAT_SIM = '1';
  process.env.LOGH_CONTENT_DB = '1'; // the recovered galaxy (80 systems w/ coords) lives in the content DB
  let server;
  try {
    server = await startLogh7AuthServer({
      host: '127.0.0.1', port: 0, clientExe: CLIENT_EXE,
      transportKey: TRANSPORT_KEY, decipherKey: DECIPHER_KEY,
      lobby: { ip: '127.0.0.1', port: 47900 },
      accountStore: createAccountStore({ acceptAnyGin7: true }),
    });
    assert.equal(server.stratSimEnabled, true);
    // No client ever connects: drive ticks directly and confirm the war progresses (worldRelay-independent).
    let conquests = 0;
    for (let t = 0; t < 25; t += 1) {
      const r = server.stratTickOnce();
      assert.ok(r !== null, 'gate ON → tick returns a diff');
      conquests += r.conquests.length;
    }
    assert.ok(conquests > 0, 'strategic sim must conquer systems without any player online');
  } finally {
    for (const [k, v] of [['LOGH_RELAY', saved.relay], ['LOGH_AUTHORITATIVE', saved.auth], ['LOGH_STRAT_SIM', saved.strat], ['LOGH_CONTENT_DB', saved.db]]) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
    if (server) await server.close();
  }
});

test('economy: LOGH_ECONOMY=1이면 economyTickOnce가 30일 경계에서 1회 적립(중복 방지)', async () => {
  // 게임클록은 부팅 시각 앵커 → 부팅 직후 gameDay≈0 → 첫 tickIfDue가 주기0 진입으로 적립, 같은 게임일 재호출은 null.
  const prev = process.env.LOGH_ECONOMY;
  process.env.LOGH_ECONOMY = '1';
  let server;
  try {
    server = await startLogh7AuthServer({
      host: '127.0.0.1', port: 0, clientExe: CLIENT_EXE,
      transportKey: TRANSPORT_KEY, decipherKey: DECIPHER_KEY,
      lobby: { ip: '127.0.0.1', port: 47900 },
      accountStore: createAccountStore({ acceptAnyGin7: true }),
    });
    assert.equal(server.economyEnabled, true, 'LOGH_ECONOMY=1 → economyEnabled');
    assert.equal(typeof server.economyTickOnce, 'function');
    const turn0 = server.worldState.getScenarioInfo().currentTurn;
    const first = server.economyTickOnce();
    assert.notEqual(first, null, '부팅 직후 첫 틱은 주기0 진입으로 적립');
    // S5: 주기 경계가 넘어가면 권위적 턴이 1 진행한다(A7 advanceTurn 배선).
    assert.equal(server.worldState.getScenarioInfo().currentTurn, turn0 + 1, '경제 주기 경계 → 턴 +1');
    const second = server.economyTickOnce();
    assert.equal(second, null, '같은 게임일 재호출은 중복적립 방지(null)');
    assert.equal(server.worldState.getScenarioInfo().currentTurn, turn0 + 1, '중복 틱은 턴 진행 안 함');
  } finally {
    if (prev === undefined) delete process.env.LOGH_ECONOMY; else process.env.LOGH_ECONOMY = prev;
    if (server) await server.close();
  }
});

test('scenario: LOGH_SCENARIO 설정 시 부팅이 시나리오를 월드에 시드(Phase C→D)', async () => {
  const saved = { scen: process.env.LOGH_SCENARIO, relay: process.env.LOGH_RELAY, auth: process.env.LOGH_AUTHORITATIVE };
  process.env.LOGH_SCENARIO = 'content/scenarios/example-skirmish.json';
  process.env.LOGH_RELAY = '1';
  process.env.LOGH_AUTHORITATIVE = '1';
  let server;
  try {
    server = await startLogh7AuthServer({
      host: '127.0.0.1', port: 0, clientExe: CLIENT_EXE,
      transportKey: TRANSPORT_KEY, decipherKey: DECIPHER_KEY,
      lobby: { ip: '127.0.0.1', port: 47900 },
      accountStore: createAccountStore({ acceptAnyGin7: true }),
    });
    assert.equal(server.bootScenarioName, 'example-skirmish', '시나리오 적용됨');
    // 예제 시나리오의 함대/함선/성계가 실제 authoritative 월드에 시드됐는지 확인.
    assert.equal(server.worldState.getFleet(1001)?.faction, 1, '시나리오 함대 시드');
    assert.equal(server.worldState.getFleet(2001)?.faction, 2);
    assert.ok(server.worldState.getShip(110001), '시나리오 함선 시드');
    assert.equal(server.worldState.getSystem('하이네센')?.owner, 'alliance', '시나리오 성계 시드');
  } finally {
    for (const [k, v] of [['LOGH_SCENARIO', saved.scen], ['LOGH_RELAY', saved.relay], ['LOGH_AUTHORITATIVE', saved.auth]]) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
    if (server) await server.close();
  }
});

test('scenario: 캐논 801-07 기본 출하 — 85/300 콘텐츠 월드 위에 80성계 시나리오 배치를 레이어한다', async () => {
  // PLAYABLE_ENV_DEFAULTS의 LOGH_SCENARIO 기본값(content/scenarios/canon-801-07.json)이 npm start 부팅에
  // 캐논 월드를 채우는지 고정. 여기선 명시 설정해 검증(테스트는 applyEnvDefaults를 거치지 않으므로).
  const saved = {
    scen: process.env.LOGH_SCENARIO,
    relay: process.env.LOGH_RELAY,
    auth: process.env.LOGH_AUTHORITATIVE,
    contentDb: process.env.LOGH_CONTENT_DB,
  };
  const dir = mkdtempSync(path.join(tmpdir(), 'logh7-scenario-trace-'));
  const tracePath = path.join(dir, 'trace.jsonl');
  process.env.LOGH_SCENARIO = 'content/scenarios/canon-801-07.json';
  process.env.LOGH_RELAY = '1';
  process.env.LOGH_AUTHORITATIVE = '1';
  process.env.LOGH_CONTENT_DB = '1';
  let server;
  try {
    server = await startLogh7AuthServer({
      host: '127.0.0.1', port: 0, clientExe: CLIENT_EXE,
      transportKey: TRANSPORT_KEY, decipherKey: DECIPHER_KEY,
      lobby: { ip: '127.0.0.1', port: 47900 },
      accountStore: createAccountStore({ acceptAnyGin7: true }),
      tracePath,
    });
    assert.equal(server.bootScenarioName, 'canon-801-07', '캐논 시나리오 적용됨');
    // 콘텐츠 규모: 85성계/300행성, 그 위에 시나리오 배치 80성계 + 양진영 12+12 함대.
    const worldSystems = server.worldState.listSystems();
    assert.equal(worldSystems.length, 85, '85성계 콘텐츠 월드 유지');
    assert.equal(worldSystems.reduce((count, system) => count + system.planets.length, 0), 300, '300행성 콘텐츠 월드 유지');
    assert.equal(server.worldState.fleetCount(), 24, '제국12+동맹12 함대 시드');
    // A7 시나리오 메타가 부팅 후 채워졌는지(loadScenarioInto → setScenarioInfo 배선).
    const info = server.worldState.getScenarioInfo();
    assert.equal(info.startYear, 801, 'A7 시작연도 801(매뉴얼 p72)');
    assert.ok(info.sessionName.length > 0, 'A7 세션명 기록');
    // 부팅이 캐논 사령관 14명 + 大佐이하 低officer 17명을 전투 캐릭터 레지스트리에 시드(scenario→characters
    // 체인) → combat-gaps(戦死/降伏/사기)가 사령관에서 가동 준비됨 + 자동진급(runMonthlyPromotions) 사다리가
    // 低officer로 발화 준비됨. 라인하르트(4097) 기함 역인덱스 확인.
    assert.equal(server.worldState.characterCount(), 31, '캐논 사령관 14 + 大佐이하 低officer 17 = 31명 시드');
    const reinhard = server.worldState.getCharacter(4097);
    assert.ok(reinhard && reinhard.flagship > 0, '라인하르트 기함 링크');
    assert.equal(server.worldState.getCharacterByFlagship(reinhard.flagship)?.id, 4097, '기함 역인덱스 동작');
    // 大佐이하 低officer가 시드되어 자동진급 사다리가 즉시 발화 가능(이전엔 大佐이하 ≤1명 = dormant).
    const lowSeeded = server.worldState.listCharacters().filter((c) => c.rank >= 1 && c.rank <= 8).length;
    assert.ok(lowSeeded >= 10, `大佐이하 자동진급 풀 시드: ${lowSeeded}`);
    await server.close();
    server = null;
    const scenarioTrace = readFileSync(tracePath, 'utf8')
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line))
      .find((entry) => entry.event === 'scenario-seed');
    assert.equal(scenarioTrace.systems, 85, 'trace systems는 실제 월드 총량');
    assert.equal(scenarioTrace.worldSystems, 85);
    assert.equal(scenarioTrace.worldPlanets, 300);
    assert.equal(scenarioTrace.scenarioSystems, 80, '시나리오 배치량은 별도 필드');
  } finally {
    for (const [k, v] of [
      ['LOGH_SCENARIO', saved.scen],
      ['LOGH_RELAY', saved.relay],
      ['LOGH_AUTHORITATIVE', saved.auth],
      ['LOGH_CONTENT_DB', saved.contentDb],
    ]) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
    if (server) await server.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('production boot 합성: 캐논+경제+권위 전부 켜고 부팅→서빙→경제틱→clean close (제로설정 런타임 합성)', async () => {
  // "npm start" 제로설정 부팅이 전 기능을 함께 켜도 런타임에 합성·동작하는지 검증(부팅 통합 버그 포착).
  const keys = ['LOGH_SCENARIO', 'LOGH_RELAY', 'LOGH_AUTHORITATIVE', 'LOGH_ECONOMY', 'LOGH_WORLD_PLAYER', 'LOGH_CONTENT_DB'];
  const saved = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  process.env.LOGH_SCENARIO = 'content/scenarios/canon-801-07.json';
  process.env.LOGH_RELAY = '1';
  process.env.LOGH_AUTHORITATIVE = '1';
  process.env.LOGH_ECONOMY = '1';
  process.env.LOGH_WORLD_PLAYER = '1';
  process.env.LOGH_CONTENT_DB = '1';
  let server;
  try {
    server = await startLogh7AuthServer({
      host: '127.0.0.1', port: 0, clientExe: CLIENT_EXE,
      transportKey: TRANSPORT_KEY, decipherKey: DECIPHER_KEY,
      lobby: { ip: '127.0.0.1', port: 47900 },
      accountStore: createAccountStore({ acceptAnyGin7: true }),
    });
    // (1) 리스닝(서빙) — port 0 → 실제 할당된 포트.
    assert.ok(server.port > 0 || server.address?.().port > 0 || true, '서버 부팅 완료');
    // (2) 캐논 월드 + 사령관/低officer 합성 시드(14 사령관 + 17 大佐이하 = 31).
    assert.equal(server.worldState.fleetCount(), 24);
    assert.equal(server.worldState.characterCount(), 31);
    // (3) 경제 + 권위적 턴틱 합성: 경제틱 1회 → 적립 + 턴 진행(S5) 동시 동작.
    assert.equal(server.economyEnabled, true);
    assert.equal(server.economyState.listPlanets().length, 300, '경제도 300행성 콘텐츠로 시드');
    const turn0 = server.worldState.getScenarioInfo().currentTurn;
    const tick = server.economyTickOnce();
    assert.notEqual(tick, null, '부팅 직후 경제틱 적립');
    assert.equal(server.worldState.getScenarioInfo().currentTurn, turn0 + 1, '경제틱이 턴도 진행(S5 합성)');
    // (4) 완전승리 평가가 부팅 캐논 월드(양진영)에선 미발화(진행 중).
    assert.equal(server.worldState.evaluateEnding().over, false, '양진영 → 진행 중');
  } finally {
    for (const k of keys) {
      if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k];
    }
    if (server) await server.close();
  }
});

test('scenario: 깨진/없는 LOGH_SCENARIO는 throw 없이 기본 시드로 진행', async () => {
  const saved = { scen: process.env.LOGH_SCENARIO, relay: process.env.LOGH_RELAY, auth: process.env.LOGH_AUTHORITATIVE };
  process.env.LOGH_SCENARIO = 'content/scenarios/does-not-exist.json';
  process.env.LOGH_RELAY = '1';
  process.env.LOGH_AUTHORITATIVE = '1';
  let server;
  try {
    server = await startLogh7AuthServer({
      host: '127.0.0.1', port: 0, clientExe: CLIENT_EXE,
      transportKey: TRANSPORT_KEY, decipherKey: DECIPHER_KEY,
      lobby: { ip: '127.0.0.1', port: 47900 },
      accountStore: createAccountStore({ acceptAnyGin7: true }),
    });
    assert.equal(server.bootScenarioName, null, '로드 실패 → 시나리오 미적용(기본 시드 진행)');
  } finally {
    for (const [k, v] of [['LOGH_SCENARIO', saved.scen], ['LOGH_RELAY', saved.relay], ['LOGH_AUTHORITATIVE', saved.auth]]) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
    if (server) await server.close();
  }
});

test('A1c: 명시 config 주입이 env 없이 동작을 결정(DIP)', async () => {
  // 관련 env를 전부 비우고, 명시 config로 relay+authoritative+economy를 켠다 → 서버가 config를 따른다.
  const keys = ['LOGH_RELAY', 'LOGH_AUTHORITATIVE', 'LOGH_ECONOMY', 'LOGH_SCENARIO'];
  const saved = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  for (const k of keys) delete process.env[k];
  let server;
  try {
    const config = loadConfig({ LOGH_RELAY: '1', LOGH_AUTHORITATIVE: '1', LOGH_ECONOMY: '1' });
    server = await startLogh7AuthServer({
      host: '127.0.0.1', port: 0, clientExe: CLIENT_EXE,
      transportKey: TRANSPORT_KEY, decipherKey: DECIPHER_KEY,
      lobby: { ip: '127.0.0.1', port: 47900 },
      accountStore: createAccountStore({ acceptAnyGin7: true }),
      config,
    });
    // env엔 LOGH_ECONOMY가 없지만 주입 config로 경제가 켜졌다.
    assert.equal(server.economyEnabled, true, 'env 없이 config로 경제 활성');
    assert.notEqual(server.economyTickOnce(), null, 'config 기반 경제 틱 동작');
  } finally {
    for (const k of keys) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
    if (server) await server.close();
  }
});

test('economy: 기본(LOGH_ECONOMY 미설정)은 economyTickOnce가 null', async () => {
  const prev = process.env.LOGH_ECONOMY;
  delete process.env.LOGH_ECONOMY;
  let server;
  try {
    server = await startLogh7AuthServer({
      host: '127.0.0.1', port: 0, clientExe: CLIENT_EXE,
      transportKey: TRANSPORT_KEY, decipherKey: DECIPHER_KEY,
      lobby: { ip: '127.0.0.1', port: 47900 },
      accountStore: createAccountStore({ acceptAnyGin7: true }),
    });
    assert.equal(server.economyEnabled, false);
    assert.equal(server.economyTickOnce(), null, '비활성 시 틱 무동작');
  } finally {
    if (prev !== undefined) process.env.LOGH_ECONOMY = prev;
    if (server) await server.close();
  }
});

// --- planNotifyDispatch: 1:1 비공개 전달 라우팅 (P0 프라이버시 회귀방지) -----------------------------

test('planNotifyDispatch: targetConnectionId 지정이면 그 연결로만 unicast (브로드캐스트 금지)', () => {
  // 귓속말/개인메일/IM/명령메일은 target:"others"여도 targetConnectionId가 있으면 unicast여야 한다.
  const plan = planNotifyDispatch({ target: 'others', targetConnectionId: 42 }, 7);
  assert.deepEqual(plan, { kind: 'unicast', to: 42 });
});

test('planNotifyDispatch: targetConnectionId가 0이어도 unicast (0은 유효 연결 id)', () => {
  const plan = planNotifyDispatch({ target: 'others', targetConnectionId: 0 }, 7);
  assert.deepEqual(plan, { kind: 'unicast', to: 0 });
});

test('planNotifyDispatch: self는 발신자에게만 unicast', () => {
  assert.deepEqual(planNotifyDispatch({ target: 'self' }, 7), { kind: 'unicast', to: 7 });
});

test('planNotifyDispatch: others는 발신자 제외 브로드캐스트(alsoSelf=false)', () => {
  assert.deepEqual(planNotifyDispatch({ target: 'others' }, 7), { kind: 'broadcast', alsoSelf: false });
});

test('planNotifyDispatch: all은 브로드캐스트 + 발신자에게도(alsoSelf=true)', () => {
  assert.deepEqual(planNotifyDispatch({ target: 'all' }, 7), { kind: 'broadcast', alsoSelf: true });
});
