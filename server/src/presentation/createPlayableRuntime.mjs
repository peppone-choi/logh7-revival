// Presentation 조립 — TCP playable + Application(CQRS/ORM)

import { createGameApplication, DEFAULT_DB_PATH } from '../application/GameApplication.mjs';
import {
  createPlayableServer,
  validateAdvertisedEndpoint,
} from '../server/logh7-playable-server.mjs';
import { loadAccountRegistry, DEFAULT_ACCOUNTS_PATH } from '../server/logh7-account-auth.mjs';
import { isStrategicGridCellNavigable } from '../server/logh7-galaxy-placement.mjs';
import { createWorldSession } from '../server/logh7-world-session.mjs';

/**
 * 3티어 런타임: ORM 캐릭터 스토어 + 권위 월드 + TCP 서버.
 */
export function createPlayableRuntime({
  port = 47900,
  host = '127.0.0.1',
  advertisedEndpoint = undefined,
  dbPath = DEFAULT_DB_PATH,
  accountsPath = DEFAULT_ACCOUNTS_PATH,
  tracePath = null,
  logger = console,
  transportKey = undefined,
  decipherKey = undefined,
} = {}) {
  // DB/계정 시드를 만지기 전에 광고 endpoint를 fail-closed 검증한다.
  const validatedAdvertisedEndpoint = validateAdvertisedEndpoint(advertisedEndpoint);
  // 정본 production client는 0x0323/0x0325 packed link layout을 쓴다. 명시적 0은 보존한다.
  if (process.env.LOGH_LIVE_CLIENT_LAYOUT === undefined) process.env.LOGH_LIVE_CLIENT_LAYOUT = '1';
  const app = createGameApplication({ dbPath, isGridCellNavigable: isStrategicGridCellNavigable });

  // JSON 계정 파일과 SQLite accounts 동기 시드
  const loopbackHost = host === '127.0.0.1' || host === '::1' || host === 'localhost';
  const { accounts } = loadAccountRegistry(accountsPath, {
    seedIfMissing: loopbackHost || process.env.LOGH_ALLOW_DEV_ACCOUNTS === '1',
  });
  for (const a of accounts) {
    app.ensureAccount({ accountId: a.accountId, password: a.password });
  }

  const characterStore = app.createCharacterStoreAdapter();
  const worldRedirect = validatedAdvertisedEndpoint == null
    ? { ip: host === '0.0.0.0' ? '127.0.0.1' : host, port, token: 1 }
    : { ...validatedAdvertisedEndpoint, token: 1 };
  const worldSession = createWorldSession({
    characterStore,
    dispatchCommandSync: app.dispatchCommandSync,
    // 원본 클라이언트 라이브에서 20행 이상은 정지하므로 검증된 선두 19행만 보낸다.
    ships: app.worldCatalog.getShips().slice(0, 19),
    worldRedirect,
    // LOGH7-58 유닛 스테이징: 실 유저 경로는 world-enter 말미에 전술 진입 시퀀스
    // ([0x0325,0x0323,0x033b,0x0f1f arm])를 방출해야 클라 FSM이 state 2로 진행한다(DAT_009d2fa8 충전).
    // 2026-07-17 라이브 진단: 게이트 off 기본값 때문에 실행 서버가 0x033b/0x0f1f를 한 번도
    // 보내지 않아 fleet 스테이징이 정체됐다. production runtime에서는 기본 on으로 배선한다
    // (LOGH_LIVE_CLIENT_LAYOUT 선례와 동일). LOGH_TACTICAL_ENTRY=0 이면 명시적으로 끌 수 있다(라이브 롤백용).
    tacticalEntry: process.env.LOGH_TACTICAL_ENTRY !== '0',
  });

  const server = createPlayableServer({
    port,
    host,
    advertisedEndpoint: validatedAdvertisedEndpoint,
    tracePath,
    logger,
    transportKey,
    decipherKey,
    characterStore,
    accountsPath,
    worldSession,
  });

  return {
    app,
    server,
    worldSession,
    characterStore,
    async listen() {
      await server.listen();
      return this;
    },
    async close() {
      await server.close();
      app.close();
    },
    address() {
      return server.address();
    },
  };
}
