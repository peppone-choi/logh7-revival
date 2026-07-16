// 애플리케이션 루트 — 3티어 중 Application 조립 (CQRS + UoW)

import {
  createAccountEntity,
  createCharacterEntity,
  ensureUnitId,
  setCharacterCell,
} from '../domain/entities.mjs';
import { openDatabase, DEFAULT_DB_PATH } from '../infrastructure/persistence/Database.mjs';
import { createUnitOfWork } from '../infrastructure/persistence/UnitOfWork.mjs';
import { loadWorldSeed, DEFAULT_SEED_DIR } from '../infrastructure/persistence/WorldSeedLoader.mjs';
import { createWorldCatalog } from '../infrastructure/persistence/WorldCatalog.mjs';
import { createCommandBus, createQueryBus } from './bus.mjs';
import { registerGameHandlers } from './handlers.mjs';

/**
 * 게임 서버 애플리케이션 컨텍스트.
 * Presentation 은 이 객체에 커맨드/쿼리만 위임한다.
 */
export function createGameApplication({
  dbPath = DEFAULT_DB_PATH,
  seedDir = DEFAULT_SEED_DIR,
  seed = true,
  isGridCellNavigable = () => false,
} = {}) {
  const connection = openDatabase({ dbPath });
  const worldCatalog = createWorldCatalog(connection);
  // 부팅 시 정적 세계 적재 (멱등 — 재부팅해도 중복 없음). seed:false 로 비활성.
  if (seed) {
    loadWorldSeed({ connection, seedDir });
  }
  const commandBus = createCommandBus();
  const queryBus = createQueryBus();
  registerGameHandlers({ commandBus, queryBus, isGridCellNavigable });

  function withUnitOfWork(fn) {
    const uow = createUnitOfWork(connection);
    try {
      return fn(uow, connection.db);
    } finally {
      uow.close();
    }
  }

  function dispatchCommandSync(command) {
    return withUnitOfWork((uow, db) => commandBus.execute(command, { uow, db, worldCatalog }));
  }

  async function dispatchCommand(command) {
    return dispatchCommandSync(command);
  }

  async function dispatchQuery(query) {
    return withUnitOfWork((uow, db) => queryBus.execute(query, { uow, db, worldCatalog }));
  }

  /**
   * 기존 lobby handleLobbyInner 가 기대하는 character store 인터페이스.
   * ORM/UoW 위에 어댑터로 올린다.
   */
  function createCharacterStoreAdapter() {
    return {
      getCharacters(accountId) {
        const uow = createUnitOfWork(connection);
        try {
          return uow.findCharactersByAccount(accountId).map((c) => ({
            id: c.id,
            power: c.power,
            blood: c.blood,
            sex: c.sex,
            lastname: c.lastname,
            firstname: c.firstname,
            face: c.face,
            rank: c.rank,
            unitId: c.unitId,
            cell: c.cell,
            ability8: c.ability8,
            authorityCards: c.authorityCards.map((card) => ({ ...card })),
          }));
        } finally {
          uow.close();
        }
      },
      addCharacter(accountId, charData) {
        const uow = createUnitOfWork(connection);
        try {
          if (!uow.findAccountByAccountId(accountId)) {
            uow.persistAccount(createAccountEntity({
              accountId,
              password: 'dummy',
            }));
            uow.flush();
          }
          const character = uow.persistCharacter(createCharacterEntity({
            accountId,
            power: charData.power,
            blood: charData.blood,
            sex: charData.sex,
            lastname: charData.lastname,
            firstname: charData.firstname,
            face: charData.face,
            rank: charData.rank,
            cell: charData.cell,
            ability8: charData.ability8,
            authorityCards: charData.authorityCards,
          }));
          uow.flush();
          ensureUnitId(character);
          character._dirty = true;
          uow.flush();
          return {
            id: character.id,
            power: character.power,
            blood: character.blood,
            sex: character.sex,
            lastname: character.lastname,
            firstname: character.firstname,
            face: character.face,
            rank: character.rank,
            unitId: character.unitId,
            cell: character.cell,
            ability8: character.ability8,
            authorityCards: character.authorityCards.map((card) => ({ ...card })),
          };
        } finally {
          uow.close();
        }
      },
      deleteCharacter(accountId, charId) {
        const uow = createUnitOfWork(connection);
        try {
          uow.deleteCharacter(accountId, charId);
          return true;
        } finally {
          uow.close();
        }
      },
      updateCharacterCell(accountId, charId, cell) {
        const uow = createUnitOfWork(connection);
        try {
          const character = uow.findCharacterById(charId);
          if (!character || character.accountId !== String(accountId)) return false;
          setCharacterCell(character, cell);
          uow.flush();
          return true;
        } finally {
          uow.close();
        }
      },
    };
  }

  /** 개발 계정 시드 (JSON accounts 와 동기화용) */
  function ensureAccount({ accountId, password }) {
    return withUnitOfWork((uow) => {
      let account = uow.findAccountByAccountId(accountId);
      if (!account) {
        account = uow.persistAccount(createAccountEntity({ accountId, password }));
        uow.flush();
      }
      return { accountId: account.accountId };
    });
  }

  return {
    connection,
    worldCatalog,
    dbPath: connection.path,
    commandBus,
    queryBus,
    dispatchCommand,
    dispatchCommandSync,
    dispatchQuery,
    withUnitOfWork,
    createCharacterStoreAdapter,
    ensureAccount,
    close() {
      connection.close();
    },
  };
}

export { DEFAULT_DB_PATH };
