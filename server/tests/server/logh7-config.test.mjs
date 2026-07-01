// logh7-config: env → 구조화 config 매핑, playable 기본값 적용, .env 로더 검증.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  loadConfig,
  applyEnvDefaults,
  loadDotEnv,
  parseBool,
  PLAYABLE_ENV_DEFAULTS,
} from '../../src/server/logh7-config.mjs';

// --- 감사 2026-06-20: parseBool 통일(server isEnabled와 동일 규칙) + asInt 빈문자열 가드 ------------

test('parseBool: 1/true/yes/on(대소문자 무관) + boolean true → true, 그 외/빈값 → fallback', () => {
  for (const v of ['1', 'true', 'TRUE', 'yes', 'YES', 'on', 'ON', true]) {
    assert.equal(parseBool(v), true, `${v} → true`);
  }
  for (const v of ['0', 'false', 'no', 'off', '', undefined, null, false]) {
    assert.equal(parseBool(v), false, `${v} → false`);
  }
  assert.equal(parseBool(undefined, true), true, 'fallback 적용');
});

test('config asInt: 빈문자열 env는 0이 아니라 기본값 사용', () => {
  // 빈 LOGH_ECONOMY_INTERVAL_MS → 0이 아닌 기본값(5000)으로 떨어져야 한다.
  const cfg = loadConfig({ LOGH_ECONOMY_INTERVAL_MS: '' });
  assert.notEqual(cfg.gameplay.economyIntervalMs, 0, '빈문자열이 0으로 새지 않음');
  assert.ok(cfg.gameplay.economyIntervalMs > 0);
});

test('loadConfig는 env를 구조화 config로 매핑한다 (bool/int/str)', () => {
  const env = {
    LOGH_AUTHORITATIVE: '1',
    LOGH_STRAT_TERRAIN: '1',
    LOGH_STRAT_SIM_INTERVAL_MS: '12345',
    LOGH_LOBBY_OK_FORMAT: 'message32',
    LOGH_ACCOUNT_DB: '/tmp/a.sqlite',
  };
  const cfg = loadConfig(env);
  assert.equal(cfg.gameplay.authoritative, true);
  assert.equal(cfg.strategic.terrain, true);
  assert.equal(cfg.strategic.galaxy, false); // 미설정 → 기본 false
  assert.equal(cfg.strategic.simIntervalMs, 12345);
  assert.equal(cfg.comms.lobbyOkFormat, 'message32');
  assert.equal(cfg.persistence.accountDb, '/tmp/a.sqlite');
});

test('loadConfig: 경제 게이트 + 틱 주기 매핑', () => {
  const cfg = loadConfig({ LOGH_ECONOMY: '1', LOGH_ECONOMY_INTERVAL_MS: '8000' });
  assert.equal(cfg.gameplay.economy, true);
  assert.equal(cfg.gameplay.economyIntervalMs, 8000);
  assert.equal(loadConfig({}).gameplay.economy, false, '빈 env면 off');
  assert.equal(loadConfig({}).gameplay.economyIntervalMs, 5000, '기본 주기 5s');
});

test('loadConfig: 시나리오 경로 매핑(opt-in)', () => {
  assert.equal(loadConfig({}).content.scenarioPath, null, '미설정이면 null');
  assert.equal(loadConfig({ LOGH_SCENARIO: 'content/scenarios/x.json' }).content.scenarioPath, 'content/scenarios/x.json');
});

test('제로설정 부팅: 경제는 playable 기본값으로 default-ON', () => {
  const env = {};
  applyEnvDefaults(env);
  assert.equal(env.LOGH_ECONOMY, '1', 'npm start면 경제 켜짐');
  assert.equal(loadConfig(env).gameplay.economy, true);
});

test('제로설정 부팅: post-load rich character downlink는 기본 ON', () => {
  const env = {};
  applyEnvDefaults(env);
  const cfg = loadConfig(env);
  assert.equal(env.LOGH_POSTLOAD_PLAYER_RECORD, '1');
  assert.equal(env.LOGH_POSTLOAD_RICH_CHARACTER, '1');
  assert.equal(env.LOGH_POSTLOAD_ACTION_LIST_SEATS, '1');
  assert.equal(env.LOGH_POSTLOAD_UNIT_STREAM_WIRE, undefined);
  assert.equal(env.LOGH_PLAYER_FOCUS_CELL, '1');
  assert.equal(env.LOGH_PLANET_BASE_RECORDS, '1');
  assert.equal(cfg.world.postloadPlayerRecord, true);
  assert.equal(cfg.world.postloadRichCharacter, true);
  assert.equal(cfg.world.postloadActionListSeats, true);
  assert.equal(cfg.world.planetBaseRecords, true);
  assert.equal(cfg.world.baseParameterNotify, false);
  assert.equal(loadConfig({ LOGH_PROVISIONAL_BASE_PARAMETER_NOTIFY: '1' }).world.baseParameterNotify, true);
});

test('loadConfig 기본값: 빈 env면 보수적 off/기본', () => {
  const cfg = loadConfig({});
  assert.equal(cfg.gameplay.authoritative, false);
  assert.equal(cfg.strategic.terrain, false);
  assert.equal(cfg.strategic.fleetObjectValue, 3);
  assert.equal(cfg.world.charId, 1);
  assert.equal(cfg.persistence.accountDb, null);
  assert.equal(cfg.persistence.snapshotBackend, 'sqlite');
  assert.equal(cfg.persistence.snapshotPath, 'logh7-runtime/state/world-state.sqlite');
  assert.equal(cfg.persistence.snapshotSeedJson, null);
});

test('loadConfig: JSON snapshot path is seed-only, SQLite path remains runtime persistence', () => {
  const legacy = loadConfig({ LOGH_SNAPSHOT_PATH: '.omo/state/world-snapshot.json' });
  assert.equal(legacy.persistence.snapshotPath, 'logh7-runtime/state/world-state.sqlite');
  assert.equal(legacy.persistence.snapshotSeedJson, '.omo/state/world-snapshot.json');

  const explicit = loadConfig({
    LOGH_SQLITE_PATH: 'runtime/state.sqlite',
    LOGH_SNAPSHOT_SEED_JSON: 'content/initial-world.json',
    LOGH_ACCOUNT_SEED_JSON: 'content/initial-accounts.json',
  });
  assert.equal(explicit.persistence.snapshotPath, 'runtime/state.sqlite');
  assert.equal(explicit.persistence.snapshotSeedJson, 'content/initial-world.json');
  assert.equal(explicit.persistence.accountSeedJson, 'content/initial-accounts.json');
});

test('applyEnvDefaults는 미설정 키만 채우고 명시값은 보존한다', () => {
  const env = { LOGH_STRAT_TERRAIN: '0' }; // 운영자가 명시적으로 끔
  applyEnvDefaults(env);
  assert.equal(env.LOGH_STRAT_TERRAIN, '0', '명시값은 덮어쓰지 않음');
  assert.equal(env.LOGH_STRAT_GALAXY, '1', '미설정 키는 playable 기본값으로 채움');
  assert.equal(env.LOGH_AUTHORITATIVE, '1');
assert.equal(env.LOGH_ACTION_LIST_CATEGORY, '0');
assert.equal(env.LOGH_COMMAND_TABLE_PRELOAD_PROBE, '0');
assert.equal(env.LOGH_DEV_COMMAND_GRANT_ALL, '0');
assert.equal(env.LOGH_STATIC_SHIPS, '1');
assert.equal(env.LOGH_STATIC_SHIPS_LIMIT, '1');
assert.equal(env.LOGH_STATIC_TROOPS, '0');
  assert.equal(env.LOGH_STATIC_FIGHTERS, '0');
  assert.equal(env.LOGH_STATIC_ARMS, '0');
  assert.equal(env.LOGH_STATIC_POWER_DISTRIBUTION, '0');
  assert.equal(env.LOGH_STATIC_MASTER_PLAYABLE_SEED, '0');
  // playable 프리셋의 모든 키가 결과 env에 존재한다.
  for (const key of Object.keys(PLAYABLE_ENV_DEFAULTS)) {
    assert.ok(env[key] !== undefined, `${key} 채워짐`);
  }
});

test('loadDotEnv: .env를 파싱하되 실제 env가 우선, 없는 파일은 무동작', () => {
  const dir = mkdtempSync(join(tmpdir(), 'logh7-env-'));
  const file = join(dir, '.env');
  try {
    writeFileSync(
      file,
      '# 주석\nLOGH_MODS_DIR=mymods\nLOGH_AUTHORITATIVE="0"\n\nLOGH_KO_NAMES=1\n',
      'utf8',
    );
    const env = { LOGH_AUTHORITATIVE: '1' }; // 실제 셸 env가 이미 설정
    loadDotEnv(env, file);
    assert.equal(env.LOGH_AUTHORITATIVE, '1', '실제 env가 .env보다 우선');
    assert.equal(env.LOGH_MODS_DIR, 'mymods', '.env의 미설정 키는 채움');
    assert.equal(env.LOGH_KO_NAMES, '1', '따옴표 없는 값');
    // 없는 파일은 무동작 + 입력 env 그대로 반환.
    const env2 = { X: '1' };
    assert.equal(loadDotEnv(env2, join(dir, 'nope.env')), env2);
    assert.deepEqual(env2, { X: '1' });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('우선순위 체인: 실제 env > .env > playable 프리셋', () => {
  const dir = mkdtempSync(join(tmpdir(), 'logh7-env-'));
  const file = join(dir, '.env');
  try {
    // .env가 STRAT_GALAXY를 끄려 시도, STRAT_TERRAIN은 셸 env가 끔.
    writeFileSync(file, 'LOGH_STRAT_GALAXY=0\nLOGH_MODS_DIR=fromdotenv\n', 'utf8');
    const env = { LOGH_STRAT_TERRAIN: '0' };
    loadDotEnv(env, file); // .env: galaxy=0, mods=fromdotenv (terrain은 셸이 선점)
    applyEnvDefaults(env); // 프리셋: 나머지 채움
    assert.equal(env.LOGH_STRAT_TERRAIN, '0', '셸 env 우선');
    assert.equal(env.LOGH_STRAT_GALAXY, '0', '.env가 프리셋 이김');
    assert.equal(env.LOGH_MODS_DIR, 'fromdotenv');
    assert.equal(env.LOGH_AUTHORITATIVE, '1', '셸/.env 둘 다 없으면 프리셋');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
