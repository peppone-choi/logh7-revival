// 애플리케이션 커맨드/쿼리 핸들러 (CQRS)

import { timingSafeEqual } from 'node:crypto';
import {
  createAccountEntity,
  createCharacterEntity,
  setCharacterCell,
  setCharacterOnline,
  ensureUnitId,
} from '../domain/entities.mjs';

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
 *           queryBus: ReturnType<import('./bus.mjs').createQueryBus> }} buses
 */
export function registerGameHandlers({ commandBus, queryBus }) {
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
    if (!character.online) throw new Error('not in world');
    const unitId = ensureUnitId(character);
    if (cmd.unitId != null && cmd.unitId !== unitId) {
      throw new Error('unit not owned');
    }
    setCharacterCell(character, cmd.cell >>> 0);
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

  queryBus.register('GetFleetAtCell', (q, { uow, db }) => {
    // 읽기 모델: world_fleet 테이블
    const rows = db.prepare(
      'SELECT unit_id, character_id, account_id, cell, revision FROM world_fleet WHERE cell = ?',
    ).all(q.cell >>> 0);
    return { fleets: rows };
  });
}
