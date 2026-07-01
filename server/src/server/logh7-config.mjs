// LOGH VII 서버 설정 — 단일 진실 공급원(single source of truth).
//
// 배경: 서버 동작이 ~65개 `LOGH_*` env 플래그로 login-session / auth-server / login-protocol 곳곳에서
// 산발적으로 읽힌다. 그래서 맨몸 부팅은 플레이 불가(전부 off가 기본)이고 설정이 흩어져 있다. 이 모듈은
// 3-레이어 재아키텍처(플랜 Phase A1)의 첫 단계다:
//
//   1. `loadConfig(env)`가 env 플래그를 하나의 구조화·타입화된 config 객체로 매핑한다. 앱 레이어는
//      `process.env.*` 직접 읽기 대신 `config.*`를 소비하도록 점진 이관한다(A1c).
//   2. `PLAYABLE_ENV_DEFAULTS` + `applyEnvDefaults`가 제로설정 부팅 경로(`npm start` → serveAuth)에
//      env 없이도 완전 플레이 가능한 서버를 제공한다. env가 항상 프리셋보다 우선하므로, 명시적으로
//      `LOGH_*`를 세팅하는 테스트/도구는 동작이 그대로 유지되어 799 테스트 묶음에 영향이 없다.
//   3. `loadDotEnv`가 저장소 루트의 `.env` 파일을 읽어 운영자 override를 받는다.
//      우선순위: 실제 셸 env > `.env` 파일 > playable 프리셋 (각 단계는 미설정 키만 채움).
//
// 데이터 등급 참고: playable 프리셋은 프로젝트가 실제로 라이브 구동해 온 설정
// (docs/SESSION-HANDOFF-2026-06-19.md) + 캐논 콘텐츠/현지화/authoritative 토글이다. 각 항목은
// override 가능하며 아래에 개별 주석으로 설명한다.

import { existsSync, readFileSync } from 'node:fs';

// 공유 불리언 파서(server.mjs의 isEnabled와 동일 규칙으로 통일 — 이전엔 config는 '1'/'true'만, server는
// '1'/'true'/'yes'/'on'을 받아 같은 env를 모듈마다 다르게 해석했다). boolean true/false도 그대로 처리.
export const parseBool = (value, fallback = false) => {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
};
const asBool = parseBool;
const asInt = (value, fallback) => {
  // 빈문자열/undefined는 fallback(이전엔 Number('')===0이라 빈 env가 0이 되어 fallback을 못 탔다).
  if (value === undefined || value === null || value === '') return fallback;
  const n = Number(value);
  return Number.isInteger(n) ? n : fallback;
};
const asStr = (value, fallback) => (value === undefined || value === '' ? fallback : value);
const isSqlitePath = (value) => typeof value === 'string' && /\.(sqlite|sqlite3|db)$/iu.test(value);

/**
 * 검증된 playable env 기본값. 제로설정 부팅(serveAuth/`npm start`)에서 운영자가 세팅하지 않은 키에만
 * 적용되어, env 없이 `node logh7-server.mjs serve-auth`만으로 플레이 가능한 월드에 도달한다. 각 키는
 * 환경변수로 명시하면 override 된다. 여기 없는 것(실험·프로브·튜닝)은 보수적 off/최소 기본값을 유지한다.
 */
export const PLAYABLE_ENV_DEFAULTS = Object.freeze({
  // User-facing zero-config defaults: npm start creates/uses these without CLI args or env.
  LOGH_ACCOUNT_DB: 'state/accounts.sqlite',
  // --- 로비/월드 핸드셰이크 포맷 + 타이밍 (라이브 검증) ---
  LOGH_LOBBY_OK_FORMAT: 'message32',
  LOGH_SS_FORMAT: 'message32',
  LOGH_LOBBY_EARLY_OK: '1',
  // --- 월드 진입 + 플레이어 앵커 (HUD 포커스, 유닛/위치) ---
  LOGH_WORLD_PLAYER: '1',
  LOGH_POSTLOAD_PLAYER_RECORD: '1',
  LOGH_POSTLOAD_RICH_CHARACTER: '1',
  // Proven command-admission seed: imports the player's action-list seat so
  // SelectGrid has at least one actionable row after world entry.
  LOGH_POSTLOAD_ACTION_LIST_SEATS: '1',
  // Playable shim: bind seats to the temporary command card table below.
  // Replace these with recovered canon card/factory mappings later.
LOGH_ACTION_LIST_CATEGORY: '0',
// 2026-06-29 live: nonzero generic 0x0305 command-card preload stalls at NOW LOADING
// and does not populate the native command table. Keep this diagnostic opt-in only.
LOGH_COMMAND_TABLE_PRELOAD_PROBE: '0',
LOGH_DEV_COMMAND_GRANT_ALL: '0',
  LOGH_PLAYER_FOCUS_CELL: '1',
  LOGH_FULL_UNIT_LOCATION: '1',
  LOGH_GRID_ENTER: '1',
  // Surface planet/fortress base records alongside the parent star-system records.
  // This keeps the playable path from degenerating into a stars-only strategic read model.
  LOGH_PLANET_BASE_RECORDS: '1',
// 2026-06-29 live: static master ON bundle reaches 0x0f01 then the client exits
// before 0x0f02. Keep each master opt-in until isolated by live bisection.
LOGH_STATIC_SHIPS: '1',
LOGH_STATIC_SHIPS_LIMIT: '1',
LOGH_STATIC_TROOPS: '0',
LOGH_STATIC_FIGHTERS: '0',
LOGH_STATIC_ARMS: '0',
LOGH_STATIC_POWER_DISTRIBUTION: '0',
LOGH_STATIC_MASTER_PLAYABLE_SEED: '0',
  // --- 전략맵: 캐논 갤럭시 + 섹터 그리드 + 지형 (RE+매뉴얼 확정) ---
  LOGH_STRAT_GALAXY: '1',
  LOGH_STRAT_GRID: '1',
  LOGH_STRAT_GRID_EARLY: '1',
  LOGH_STRAT_TERRAIN: '1',
  LOGH_STRAT_FLEET: '1',
  // --- authoritative 멀티플레이 (서버가 커맨드 검증 + 릴레이) ---
  LOGH_RELAY: '1',
  LOGH_AUTHORITATIVE: '1',
  // --- 내정·경제 (서버 내부 상태, 클라 와이어 노출 없음 → default-ON 안전) ---
  LOGH_ECONOMY: '1',
  // --- 콘텐츠 + 한글 현지화 ---
  LOGH_CONTENT_DB: '1',
  LOGH_KO_NAMES: '1',
  // 캐논 801-07 시작 시나리오를 기본 출하(제로설정 npm start → 80성계 + 12제국/12동맹 함대 + 세션 메타).
  // 경로는 repo 루트 상대(npm start의 cwd=패키지 루트). 부재 시 graceful(콘텐츠팩 시드만, file-not-found).
  LOGH_SCENARIO: 'content/scenarios/canon-801-07.json',
  // --- 영속성: 인메모리 authoritative + 스냅샷 덤프/부팅 로드 ---
  LOGH_PERSIST: '1',
});

/**
 * `defaults`의 각 키를, `env`에 현재 미설정인 경우에만 세팅한다. `env`를 반환.
 * 제로설정 부팅 경로에서 사용하며, 운영자가 명시한 env가 항상 우선한다.
 * @param {Record<string,string|undefined>} env
 * @param {Record<string,string>} [defaults]
 */
export function applyEnvDefaults(env = process.env, defaults = PLAYABLE_ENV_DEFAULTS) {
  for (const [key, value] of Object.entries(defaults)) {
    if (env[key] === undefined) env[key] = value;
  }
  return env;
}

/**
 * `.env` 파일(KEY=VALUE, `#` 주석, 선택적 따옴표)을 읽어 `env`에 적용한다. 운영자 override 경로.
 * 미설정 키만 채우므로 **실제 셸 env가 항상 `.env`보다 우선**한다. 파일이 없으면 무동작. `env` 반환.
 * (loadConfig 전에 호출 → 이후 applyEnvDefaults로 프리셋이 나머지를 채움: 셸 env > .env > 프리셋)
 * @param {Record<string,string|undefined>} [env]
 * @param {string} [file] 저장소 루트 기준 `.env` 경로
 */
export function loadDotEnv(env = process.env, file = '.env') {
  if (!existsSync(file)) return env;
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    return env;
  }
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    // 양끝 따옴표 제거(단순 케이스). 셸 env가 우선하므로 미설정 키만 채운다.
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (env[key] === undefined) env[key] = value;
  }
  return env;
}

/**
 * 환경변수를 하나의 구조화된 config 객체로 매핑. 순수 함수: `env`를 읽어 평범한 객체를 반환하며 IO/변이
 * 없음. 앱 레이어는 `process.env` 직접 읽기 대신 이걸 소비하도록 이관한다.
 * @param {Record<string,string|undefined>} [env]
 */
export function loadConfig(env = process.env) {
  return {
    crypto: {
      transportKeyHex: asStr(env.LOGH_TRANSPORT_KEY_HEX, undefined),
      decipherKeyHex: asStr(env.LOGH_DECIPHER_KEY_HEX, undefined),
    },
    gameplay: {
      authoritative: asBool(env.LOGH_AUTHORITATIVE),
      relay: asBool(env.LOGH_RELAY),
      relayTest: asBool(env.LOGH_RELAY_TEST),
      // 멀티플레이 함대 가시성(2:2 제국2·동맹2). ON이면 (C1)월드진입 시 플레이어 함대를 공유 worldState에
      // 등록하고 (C2)신규 입장자↔기존 전원 함대를 0x0325로 상호 push, (C3)req.power를 권위 진영으로 일원화한다.
      // 기본 OFF로 검증된 단일클라 월드로드(1107 그린) 경로를 절대 흔들지 않음 — 라이브 4클라에서만 ON.
      mpVisibility: asBool(env.LOGH_MP_VISIBILITY),
      npcSeed: asBool(env.LOGH_NPC_SEED),
      npcAi: asBool(env.LOGH_NPC_AI),
      npcAiIntervalMs: asInt(env.LOGH_NPC_AI_INTERVAL_MS, 5000),
      // 내정·경제: 행성 세수 30게임일틱 누적(서버 내부, 라이브 불필요). 제로설정 부팅에서 default-ON.
      economy: asBool(env.LOGH_ECONOMY),
      economyIntervalMs: asInt(env.LOGH_ECONOMY_INTERVAL_MS, 5000),
    },
    strategic: {
      galaxy: asBool(env.LOGH_STRAT_GALAXY),
      grid: asBool(env.LOGH_STRAT_GRID),
      gridEarly: asBool(env.LOGH_STRAT_GRID_EARLY),
      gridObjectPreload: asBool(env.LOGH_STRAT_GRID_OBJECT_PRELOAD),
      terrain: asBool(env.LOGH_STRAT_TERRAIN),
      fleet: asBool(env.LOGH_STRAT_FLEET),
      fleetObjectValue: asInt(env.LOGH_FLEET_OBJECT_VALUE, 3),
      sim: asBool(env.LOGH_STRAT_SIM),
      simIntervalMs: asInt(env.LOGH_STRAT_SIM_INTERVAL_MS, 60000),
    },
    world: {
      player: asBool(env.LOGH_WORLD_PLAYER),
      charId: asInt(env.LOGH_WORLD_CHAR_ID, 1),
      gridEnter: asBool(env.LOGH_GRID_ENTER),
      fullUnitLocation: asBool(env.LOGH_FULL_UNIT_LOCATION),
      postloadPlayerRecord: asBool(env.LOGH_POSTLOAD_PLAYER_RECORD),
      postloadRichCharacter: asBool(env.LOGH_POSTLOAD_RICH_CHARACTER),
      postloadActionListSeats: asBool(env.LOGH_POSTLOAD_ACTION_LIST_SEATS),
      importBases: asBool(env.LOGH_WORLD_IMPORT_BASES),
      planetBaseRecords: asBool(env.LOGH_PLANET_BASE_RECORDS),
      baseEconomy: asBool(env.LOGH_BASE_ECONOMY),
      baseParameterNotify: asBool(env.LOGH_PROVISIONAL_BASE_PARAMETER_NOTIFY),
      staticShips: asBool(env.LOGH_STATIC_SHIPS),
    },
    comms: {
      lobbyOkFormat: asStr(env.LOGH_LOBBY_OK_FORMAT, undefined),
      ssFormat: asStr(env.LOGH_SS_FORMAT, undefined),
      lobbyEarlyOk: asBool(env.LOGH_LOBBY_EARLY_OK),
    },
    content: {
      useDb: asBool(env.LOGH_CONTENT_DB),
      koNames: asBool(env.LOGH_KO_NAMES),
      modsDir: asStr(env.LOGH_MODS_DIR, undefined),
      scenarioPath: asStr(env.LOGH_SCENARIO, null), // 월드 시작상태 시나리오 JSON 경로(opt-in, Phase C)
    },
    persistence: {
      accountDb: asStr(env.LOGH_ACCOUNT_DB, null),
      accountSeedJson: asStr(env.LOGH_ACCOUNT_SEED_JSON, null),
      allowRegister: asBool(env.LOGH_ACCOUNT_DB_ALLOW_REGISTER),
      snapshotEnabled: env.LOGH_PERSIST !== '0',
      snapshotBackend: asStr(env.LOGH_REPOSITORY_BACKEND ?? env.LOGH_PERSIST_BACKEND, 'sqlite'),
      snapshotPath: asStr(
        env.LOGH_SQLITE_PATH ?? (isSqlitePath(env.LOGH_SNAPSHOT_PATH) ? env.LOGH_SNAPSHOT_PATH : undefined),
        'logh7-runtime/state/world-state.sqlite',
      ),
      snapshotSeedJson: asStr(
        env.LOGH_SNAPSHOT_SEED_JSON ??
          env.LOGH_WORLD_SEED_JSON ??
          (isSqlitePath(env.LOGH_SNAPSHOT_PATH) ? undefined : env.LOGH_SNAPSHOT_PATH),
        null,
      ),
    },
  };
}
