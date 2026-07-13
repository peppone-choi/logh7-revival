// Unit of Work + Identity Map (Hibernate Session 축소판)

import {
  createAccountEntity,
  createCharacterEntity,
  assignAccountId,
  assignCharacterId,
} from '../../domain/entities.mjs';
import { normalizeAuthorityCards } from '../../domain/authority-cards.mjs';

/**
 * @param {{ db: import('node:sqlite').DatabaseSync }} connection openDatabase() 결과
 */
export function createUnitOfWork(connection) {
  const { db } = connection;
  /** @type {Map<string, object>} */
  const identityMap = new Map();
  /** @type {object[]} */
  const newEntities = [];
  /** @type {Array<{type:string,payload:object}>} */
  const events = [];
  let active = true;

  function keyOf(type, id) {
    return `${type}:${id}`;
  }

  function track(entity) {
    if (entity.id != null) {
      identityMap.set(keyOf(entity._type, entity.id), entity);
    }
    return entity;
  }

  function registerNew(entity) {
    entity._dirty = true;
    newEntities.push(entity);
    return entity;
  }

  function registerEvent(type, payload) {
    events.push({ type, payload });
  }

  // ── Account ──────────────────────────────────────────────────────────────

  function findAccountByAccountId(accountId) {
    const cached = [...identityMap.values()].find(
      (e) => e._type === 'Account' && e.accountId === String(accountId),
    );
    if (cached) return cached;
    const row = db.prepare(
      'SELECT id, account_id, password, created_at, revision, updated_at FROM accounts WHERE account_id = ?',
    ).get(String(accountId));
    if (!row) return null;
    return track(createAccountEntity({
      id: row.id,
      accountId: row.account_id,
      password: row.password,
      createdAt: row.created_at,
      revision: row.revision,
    }));
  }

  function persistAccount(account) {
    return registerNew(account);
  }

  // ── Character ────────────────────────────────────────────────────────────

  function findAuthorityCardsByCharacterId(characterId) {
    return db.prepare(`
      SELECT ordinal, kind, spot, provenance
      FROM character_authority_cards
      WHERE character_id = ?
      ORDER BY ordinal
    `).all(characterId).map((row) => ({
      ordinal: row.ordinal,
      kind: row.kind,
      spot: row.spot,
      provenance: row.provenance,
    }));
  }

  function replaceAuthorityCards(character) {
    const cards = normalizeAuthorityCards(character.authorityCards);
    character.authorityCards = cards;
    db.prepare('DELETE FROM character_authority_cards WHERE character_id = ?').run(character.id);
    const insert = db.prepare(`
      INSERT INTO character_authority_cards(character_id, ordinal, kind, spot, provenance)
      VALUES (?, ?, ?, ?, ?)
    `);
    for (const card of cards) {
      insert.run(character.id, card.ordinal, card.kind, card.spot, card.provenance);
    }
  }

  function findCharactersByAccount(accountId) {
    const rows = db.prepare(
      `SELECT id, account_id, power, blood, sex, lastname, firstname, face, rank,
              unit_id, cell, online, ability8_json, created_at, revision, updated_at
       FROM characters WHERE account_id = ? ORDER BY id`,
    ).all(String(accountId));
    return rows.map((row) => {
      const k = keyOf('Character', row.id);
      if (identityMap.has(k)) return identityMap.get(k);
      const entity = createCharacterEntity({
        id: row.id,
        accountId: row.account_id,
        power: row.power,
        blood: row.blood,
        sex: row.sex,
        lastname: row.lastname,
        firstname: row.firstname,
        face: row.face,
        rank: row.rank,
        unitId: row.unit_id,
        cell: row.cell,
        online: row.online === 1,
        ability8: row.ability8_json ? JSON.parse(row.ability8_json) : null,
        authorityCards: findAuthorityCardsByCharacterId(row.id),
        createdAt: row.created_at,
        revision: row.revision,
      });
      entity._dirty = false;
      return track(entity);
    });
  }

  function findCharacterById(id) {
    const k = keyOf('Character', id);
    if (identityMap.has(k)) return identityMap.get(k);
    const row = db.prepare(
      `SELECT id, account_id, power, blood, sex, lastname, firstname, face, rank,
              unit_id, cell, online, ability8_json, created_at, revision, updated_at
       FROM characters WHERE id = ?`,
    ).get(id);
    if (!row) return null;
    const entity = createCharacterEntity({
      id: row.id,
      accountId: row.account_id,
      power: row.power,
      blood: row.blood,
      sex: row.sex,
      lastname: row.lastname,
      firstname: row.firstname,
      face: row.face,
      rank: row.rank,
      unitId: row.unit_id,
      cell: row.cell,
      online: row.online === 1,
      ability8: row.ability8_json ? JSON.parse(row.ability8_json) : null,
      authorityCards: findAuthorityCardsByCharacterId(row.id),
      createdAt: row.created_at,
      revision: row.revision,
    });
    entity._dirty = false;
    return track(entity);
  }

  function persistCharacter(character) {
    return registerNew(character);
  }

  function deleteCharacter(accountId, characterId) {
    db.prepare('DELETE FROM characters WHERE account_id = ? AND id = ?').run(
      String(accountId),
      characterId,
    );
    identityMap.delete(keyOf('Character', characterId));
    registerEvent('CharacterDeleted', { accountId, characterId });
  }

  // ── Flush (Hibernate flush) ──────────────────────────────────────────────

  function flush() {
    if (!active) throw new Error('UnitOfWork closed');
    db.exec('BEGIN IMMEDIATE');
    try {
      for (const entity of newEntities) {
        if (entity._type === 'Account' && entity.id == null) {
          const info = db.prepare(
            `INSERT INTO accounts(account_id, password, created_at, revision, updated_at)
             VALUES (?,?,?,?,?)`,
          ).run(entity.accountId, entity.password, entity.createdAt, entity.revision, entity.updatedAt);
          assignAccountId(entity, Number(info.lastInsertRowid));
          entity._dirty = false;
          track(entity);
        } else if (entity._type === 'Character' && entity.id == null) {
          const info = db.prepare(
            `INSERT INTO characters(
               account_id, power, blood, sex, lastname, firstname, face, rank,
               unit_id, cell, online, ability8_json, created_at, revision, updated_at
             ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          ).run(
            entity.accountId,
            entity.power,
            entity.blood,
            entity.sex,
            entity.lastname,
            entity.firstname,
            entity.face,
            entity.rank,
            entity.unitId,
            entity.cell,
            entity.online ? 1 : 0,
            entity.ability8 ? JSON.stringify(entity.ability8) : null,
            entity.createdAt,
            entity.revision,
            entity.updatedAt,
          );
          assignCharacterId(entity, Number(info.lastInsertRowid));
          if (entity.unitId == null) {
            entity.unitId = entity.id;
            db.prepare('UPDATE characters SET unit_id = ? WHERE id = ?').run(entity.id, entity.id);
          }
          replaceAuthorityCards(entity);
          entity._dirty = false;
          track(entity);
        }
      }
      newEntities.length = 0;

      for (const entity of identityMap.values()) {
        if (!entity._dirty) continue;
        if (entity._type === 'Account') {
          db.prepare(
            `UPDATE accounts SET password=?, revision=?, updated_at=? WHERE id=?`,
          ).run(entity.password, entity.revision, entity.updatedAt, entity.id);
        } else if (entity._type === 'Character') {
          db.prepare(
            `UPDATE characters SET
               power=?, blood=?, sex=?, lastname=?, firstname=?, face=?, rank=?,
               unit_id=?, cell=?, online=?, ability8_json=?, revision=?, updated_at=?
             WHERE id=?`,
          ).run(
            entity.power,
            entity.blood,
            entity.sex,
            entity.lastname,
            entity.firstname,
            entity.face,
            entity.rank,
            entity.unitId,
            entity.cell,
            entity.online ? 1 : 0,
            entity.ability8 ? JSON.stringify(entity.ability8) : null,
            entity.revision,
            entity.updatedAt,
            entity.id,
          );
          replaceAuthorityCards(entity);
          // world_fleet 프로젝션 (읽기 모델 CQRS)
          if (entity.unitId != null) {
            db.prepare(
              `INSERT INTO world_fleet(unit_id, character_id, account_id, cell, revision, updated_at)
               VALUES (?,?,?,?,?,?)
               ON CONFLICT(unit_id) DO UPDATE SET
                 character_id=excluded.character_id,
                 account_id=excluded.account_id,
                 cell=excluded.cell,
                 revision=excluded.revision,
                 updated_at=excluded.updated_at`,
            ).run(
              entity.unitId,
              entity.id,
              entity.accountId,
              entity.cell,
              entity.revision,
              entity.updatedAt,
            );
          }
        }
        entity._dirty = false;
      }

      const insertEvent = db.prepare(
        'INSERT INTO domain_events(type, payload_json, created_at) VALUES (?,?,?)',
      );
      for (const ev of events) {
        insertEvent.run(ev.type, JSON.stringify(ev.payload), Date.now());
      }
      events.length = 0;

      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }

  function clear() {
    identityMap.clear();
    newEntities.length = 0;
    events.length = 0;
  }

  function close() {
    clear();
    active = false;
  }

  return {
    findAccountByAccountId,
    persistAccount,
    findCharactersByAccount,
    findCharacterById,
    persistCharacter,
    deleteCharacter,
    registerEvent,
    flush,
    clear,
    close,
    getIdentityMapSize: () => identityMap.size,
  };
}
