// 애플리케이션 커맨드/쿼리 핸들러 (CQRS)

import { timingSafeEqual } from 'node:crypto';
import {
  createAccountEntity,
  createCharacterEntity,
  setCharacterAuthorityCards,
  setCharacterCell,
  setCharacterOnline,
  ensureUnitId,
} from '../domain/entities.mjs';
import {
  buildAuthorityCommandRows,
  grantAuthorityCard,
  revokeAuthorityCard,
} from '../domain/authority-cards.mjs';

function safeEqualString(a, b) {
  const ba = Buffer.from(String(a), 'utf8');
  const bb = Buffer.from(String(b), 'utf8');
  if (ba.length !== bb.length) {
    const n = Math.max(ba.length, bb.length, 1);
    const pa = Buffer.alloc(n);
    const pb = Buffer.alloc(n);
    ba.copy(pa);
    bb.copy(pb);
    timingSafeEqual(pa, pb);
    return false;
  }
  return timingSafeEqual(ba, bb);
}

/**
 * @param {{ commandBus: ReturnType<import('./bus.mjs').createCommandBus>,
 *           queryBus: ReturnType<import('./bus.mjs').createQueryBus>,
 *           isGridCellNavigable: (cell: number) => boolean }} buses
 */
export function registerGameHandlers({ commandBus, queryBus, isGridCellNavigable }) {
  // ── Commands ─────────────────────────────────────────────────────────────

  commandBus.register('EnsureDevAccount', (cmd, { uow }) => {
    let account = uow.findAccountByAccountId(cmd.accountId);
    if (!account) {
      account = uow.persistAccount(createAccountEntity({
        accountId: cmd.accountId,
        password: cmd.password ?? 'dummy',
      }));
      uow.flush();
    }
    return { ok: true, accountId: account.accountId };
  });

  commandBus.register('AuthenticateAccount', (cmd, { uow }) => {
    const account = uow.findAccountByAccountId(cmd.accountId);
    if (!account) {
      return { ok: false, reason: 'invalid-credentials' };
    }
    if (!safeEqualString(account.password, cmd.password ?? '')) {
      return { ok: false, reason: 'invalid-credentials' };
    }
    return { ok: true, accountId: account.accountId };
  });

  commandBus.register('CreateCharacter', (cmd, { uow }) => {
    const account = uow.findAccountByAccountId(cmd.accountId);
    if (!account) throw new Error('account not found');
    // 자동/더미 캐릭 금지. 요청 필드만 반영(빈 이름·황제 폴백은 createCharacterEntity 가 거절).
    const character = uow.persistCharacter(createCharacterEntity({
      accountId: cmd.accountId,
      power: cmd.power ?? 0,
      blood: cmd.blood ?? 0,
      sex: cmd.sex ?? 0,
      lastname: cmd.lastname ?? '',
      firstname: cmd.firstname ?? '',
      face: cmd.face ?? 0,
      rank: cmd.rank ?? 0,
      cell: cmd.cell ?? 0,
      ability8: cmd.ability8 ?? null,
      authorityCards: cmd.authorityCards,
    }));
    uow.flush();
    ensureUnitId(character);
    character._dirty = true;
    uow.flush();
    uow.registerEvent('CharacterCreated', { id: character.id, accountId: character.accountId });
    uow.flush();
    return { ok: true, character: { ...character } };
  });

  commandBus.register('DeleteCharacter', (cmd, { uow }) => {
    uow.deleteCharacter(cmd.accountId, cmd.characterId);
    // deleteCharacter 는 즉시 SQL — 이벤트만 flush
    uow.flush();
    return { ok: true };
  });

  // 권한카드 부여/회수. 도메인 게이트가 승인 kind(0/59/195)만 허용하고
  // setCharacterAuthorityCards 가 UoW dirty-flush 경로로 영속한다.
  commandBus.register('GrantAuthorityCard', (cmd, { uow }) => {
    const character = uow.findCharacterById(cmd.characterId);
    if (!character) throw new Error('character not found');
    setCharacterAuthorityCards(
      character,
      grantAuthorityCard(character.authorityCards, cmd.kind, { spot: cmd.spot ?? 0 }),
    );
    uow.flush();
    return { ok: true, authorityCards: character.authorityCards.map((card) => ({ ...card })) };
  });

  commandBus.register('RevokeAuthorityCard', (cmd, { uow }) => {
    const character = uow.findCharacterById(cmd.characterId);
    if (!character) throw new Error('character not found');
    setCharacterAuthorityCards(
      character,
      revokeAuthorityCard(character.authorityCards, cmd.kind),
    );
    uow.flush();
    return { ok: true, authorityCards: character.authorityCards.map((card) => ({ ...card })) };
  });

  commandBus.register('EnterWorld', (cmd, { uow }) => {
    const character = uow.findCharacterById(cmd.characterId);
    if (!character) throw new Error('character not found');
    if (character.accountId !== String(cmd.accountId)) {
      throw new Error('character not owned');
    }
    setCharacterOnline(character, true);
    ensureUnitId(character);
    uow.flush();
    return {
      ok: true,
      character: { ...character },
      unitId: character.unitId,
      cell: character.cell,
    };
  });

  commandBus.register('MoveGrid', (cmd, { uow }) => {
    const character = uow.findCharacterById(cmd.characterId);
    if (!character) throw new Error('character not found');
    if (cmd.accountId == null || String(cmd.accountId).trim() === '') {
      throw new Error('account required');
    }
    if (character.accountId !== String(cmd.accountId)) {
      throw new Error('character not owned');
    }
    if (!character.online) throw new Error('not in world');
    if (!buildAuthorityCommandRows(character.authorityCards)
      .some((row) => row.commands.includes(0x2b))) {
      throw new Error('warp authority required');
    }
    const unitId = ensureUnitId(character);
    if (cmd.unitId != null && cmd.unitId !== unitId) {
      throw new Error('unit not owned');
    }
    const cell = Number(cmd.cell);
    if (!Number.isInteger(cell) || cell < 0 || cell >= 5000) {
      throw new Error('invalid grid cell');
    }
    if (!isGridCellNavigable(cell)) {
      throw new Error('grid cell not navigable');
    }
    setCharacterCell(character, cell);
    uow.registerEvent('GridMoved', {
      characterId: character.id,
      unitId,
      cell: character.cell,
    });
    uow.flush();
    return { ok: true, unitId, cell: character.cell, characterId: character.id };
  });

  // ── Queries ──────────────────────────────────────────────────────────────

  queryBus.register('GetAccountCharacters', (q, { uow }) => {
    const list = uow.findCharactersByAccount(q.accountId);
    return { characters: list.map((c) => ({ ...c })) };
  });

  queryBus.register('GetCharacter', (q, { uow }) => {
    const c = uow.findCharacterById(q.characterId);
    return { character: c ? { ...c } : null };
  });

  // ── 정적 세계 카탈로그 쿼리 (시드된 참조 테이블) ─────────────────────────
  queryBus.register('GetGalaxySystems', (_q, { worldCatalog }) => {
    return { systems: worldCatalog.getGalaxySystems() };
  });

  queryBus.register('GetInitialDeployment', (_q, { worldCatalog }) => {
    return { deployment: worldCatalog.getInitialDeployment() };
  });

  queryBus.register('GetShips', (_q, { worldCatalog }) => {
    return { ships: worldCatalog.getShips() };
  });

  queryBus.register('GetFortresses', (_q, { worldCatalog }) => {
    return { fortresses: worldCatalog.getFortresses() };
  });

  queryBus.register('GetFactions', (_q, { worldCatalog }) => {
    return { factions: worldCatalog.getFactions() };
  });

  queryBus.register('GetRanks', (_q, { worldCatalog }) => {
    return { ranks: worldCatalog.getRanks() };
  });

  queryBus.register('GetAbilities', (_q, { worldCatalog }) => {
    return { abilities: worldCatalog.getAbilities() };
  });

  queryBus.register('GetCanonCharacters', (_q, { worldCatalog }) => {
    return { characters: worldCatalog.getCanonCharacters() };
  });

  queryBus.register('GetFleetAtCell', (q, { uow, db }) => {
    // 읽기 모델: world_fleet 테이블
    const rows = db.prepare(
      'SELECT unit_id, character_id, account_id, cell, revision FROM world_fleet WHERE cell = ?',
    ).all(q.cell >>> 0);
    return { fleets: rows };
  });
}
