// Presentation 조립 — TCP playable + Application(CQRS/ORM)

import { createGameApplication, DEFAULT_DB_PATH } from '../application/GameApplication.mjs';
import { createPlayableServer } from '../server/logh7-playable-server.mjs';
import { loadAccountRegistry, DEFAULT_ACCOUNTS_PATH } from '../server/logh7-account-auth.mjs';
import { createWorldSession } from '../server/logh7-world-session.mjs';

/**
 * 3티어 런타임: ORM 캐릭터 스토어 + 권위 월드 + TCP 서버.
 */
export function createPlayableRuntime({
  port = 47900,
  host = '127.0.0.1',
  dbPath = DEFAULT_DB_PATH,
  accountsPath = DEFAULT_ACCOUNTS_PATH,
  tracePath = null,
  logger = console,
  transportKey = undefined,
  decipherKey = undefined,
} = {}) {
  const app = createGameApplication({ dbPath });

  // JSON 계정 파일과 SQLite accounts 동기 시드
  const { accounts } = loadAccountRegistry(accountsPath);
  for (const a of accounts) {
    app.ensureAccount({ accountId: a.accountId, password: a.password });
  }

  const characterStore = app.createCharacterStoreAdapter();
  const worldSession = createWorldSession({
    worldRedirect: { ip: host === '0.0.0.0' ? '127.0.0.1' : host, port, token: 1 },
  });

  const server = createPlayableServer({
    port,
    host,
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
