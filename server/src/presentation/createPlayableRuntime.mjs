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
    // LOGH7-58 전술 진입 시퀀스는 world-enter 말미에 붙이지 않는다(기본 off 유지).
    // 2026-07-17 라이브 A/B(_workspace/liveqa-20260717-logh7-58-staging): world-enter에
    // 0x033b/0x0f1f(전술 arm=1)를 방출하면 클라가 grid-init-spawn(0x0f02) 버스트 ~560ms 뒤
    // read ECONNRESET로 결정적 크래시(2/2 재현). 게이트 off에서는 같은 버스트를 정상 소화하고
    // 전략맵 렌더 + 0x0300 heartbeat가 지속됐다 → 전술 arm이 크래시 트리거다. 전략맵 진입은
    // 전술(battle) arm이 아니므로 world-enter 방출은 의미상으로도 틀렸다. 빈 멤버리스트는
    // 별개의 전략 멤버/유닛 스테이징 데이터 문제다. 전술 시퀀스 codec은 유효하며(matched roster)
    // LOGH_TACTICAL_ENTRY=1로 실험 가능하지만, 올바른 주입 지점을 RE로 확정하기 전까지 기본 off다.
    tacticalEntry: process.env.LOGH_TACTICAL_ENTRY === '1',
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
