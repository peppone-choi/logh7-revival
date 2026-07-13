// logh7-character-store.mjs — 계정별 캐릭터 CRUD + 파일 영속 (원자적 쓰기)
//
// 인터페이스:
//   createCharacterStore(storePath) → store
//   store.getCharacters(accountId)           → CharRecord[]
//   store.addCharacter(accountId, charData)  → CharRecord (id 자동 배정)
//   store.deleteCharacter(accountId, charId) → boolean
//
// 영속 형식: JSON { accounts: { [accountId]: CharRecord[] } }
// 원자적 쓰기: temp 파일 write → rename (플랫폼 rename 원자성 활용)

import { readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  normalizeAuthorityCards,
  seedAuthorityCardsForPower,
} from '../domain/authority-cards.mjs';

/**
 * @typedef {{ id: number, [key: string]: any }} CharRecord
 */

/**
 * 캐릭터 store 팩토리.
 *
 * @param {string} storePath  JSON 저장 경로 (없으면 자동 생성)
 * @returns {CharacterStore}
 */
export function createCharacterStore(storePath) {
  // 초기 로드
  let data = _load(storePath);
  let authorityBackfilled = false;
  for (const records of Object.values(data.accounts)) {
    if (!Array.isArray(records)) continue;
    for (const record of records) {
      if (record.authorityCards == null) authorityBackfilled = true;
      record.authorityCards = normalizeAuthorityCards(
        record.authorityCards ?? seedAuthorityCardsForPower(record.power),
      );
    }
  }

  function _load(path) {
    try {
      const raw = readFileSync(path, 'utf8');
      const parsed = JSON.parse(raw);
      // 최소 구조 보장
      if (!parsed || typeof parsed.accounts !== 'object') {
        return { accounts: {}, nextId: 1 };
      }
      if (typeof parsed.nextId !== 'number') parsed.nextId = 1;
      return parsed;
    } catch {
      return { accounts: {}, nextId: 1 };
    }
  }

  function _save() {
    const dir = dirname(storePath);
    mkdirSync(dir, { recursive: true });
    const tmp = storePath + '.tmp';
    writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
    renameSync(tmp, storePath);
  }

  if (authorityBackfilled) _save();

  /** 계정의 캐릭터 목록 반환 (없으면 빈 배열) */
  function getCharacters(accountId) {
    const key = String(accountId);
    return (data.accounts[key] ?? []).map((record) => ({
      ...record,
      authorityCards: record.authorityCards.map((card) => ({ ...card })),
    }));
  }

  /**
   * 캐릭터 추가.  charData는 임의 필드 허용; id는 store가 배정.
   * @param {string|number} accountId
   * @param {object} charData
   * @returns {CharRecord}
   */
  function addCharacter(accountId, charData) {
    const key = String(accountId);
    if (!data.accounts[key]) data.accounts[key] = [];
    const id = data.nextId;
    data.nextId += 1;
    const record = {
      ...charData,
      id,
      authorityCards: normalizeAuthorityCards(
        charData.authorityCards ?? seedAuthorityCardsForPower(charData.power),
      ),
    };
    data.accounts[key].push(record);
    _save();
    return {
      ...record,
      authorityCards: record.authorityCards.map((card) => ({ ...card })),
    };
  }

  /**
   * 캐릭터 삭제.
   * @param {string|number} accountId
   * @param {number} charId
   * @returns {boolean} 삭제됐으면 true
   */
  function deleteCharacter(accountId, charId) {
    const key = String(accountId);
    const list = data.accounts[key];
    if (!list) return false;
    const before = list.length;
    data.accounts[key] = list.filter(c => c.id !== charId);
    const deleted = data.accounts[key].length < before;
    if (deleted) _save();
    return deleted;
  }

  return { getCharacters, addCharacter, deleteCharacter };
}
