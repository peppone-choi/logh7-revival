// logh7-character-store.test.mjs — CharacterStore CRUD + 파일 영속 테스트

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createCharacterStore } from '../src/server/logh7-character-store.mjs';

// 테스트용 임시 디렉터리 생성
function makeTmpStore() {
  const dir = mkdtempSync(join(tmpdir(), 'logh7-store-'));
  const path = join(dir, 'chars.json');
  return { dir, path, store: createCharacterStore(path) };
}

// ─── getCharacters ────────────────────────────────────────────────────────────

test('빈 계정의 캐릭터 목록은 빈 배열', () => {
  const { store } = makeTmpStore();
  assert.deepEqual(store.getCharacters('acc1'), []);
});

// ─── addCharacter ─────────────────────────────────────────────────────────────

test('캐릭터 추가 후 목록에 포함됨', () => {
  const { store } = makeTmpStore();
  const rec = store.addCharacter('acc1', { lastname: 'Yang', firstname: 'Wenli' });
  assert.equal(rec.lastname, 'Yang');
  assert.equal(typeof rec.id, 'number');

  const list = store.getCharacters('acc1');
  assert.equal(list.length, 1);
  assert.equal(list[0].id, rec.id);
});

test('여러 계정에 독립 캐릭터 저장', () => {
  const { store } = makeTmpStore();
  store.addCharacter('acc1', { lastname: 'Reinhard' });
  store.addCharacter('acc2', { lastname: 'Mittermeyer' });

  assert.equal(store.getCharacters('acc1').length, 1);
  assert.equal(store.getCharacters('acc2').length, 1);
  assert.equal(store.getCharacters('acc1')[0].lastname, 'Reinhard');
});

test('id는 캐릭터마다 고유하게 증가', () => {
  const { store } = makeTmpStore();
  const a = store.addCharacter('acc1', { lastname: 'A' });
  const b = store.addCharacter('acc1', { lastname: 'B' });
  assert.notEqual(a.id, b.id);
  assert.ok(b.id > a.id);
});

// ─── deleteCharacter ──────────────────────────────────────────────────────────

test('존재하는 캐릭터 삭제 → true 반환, 목록에서 제거됨', () => {
  const { store } = makeTmpStore();
  const rec = store.addCharacter('acc1', { lastname: 'Reuenthal' });
  const deleted = store.deleteCharacter('acc1', rec.id);
  assert.equal(deleted, true);
  assert.equal(store.getCharacters('acc1').length, 0);
});

test('없는 캐릭터 삭제 → false 반환', () => {
  const { store } = makeTmpStore();
  assert.equal(store.deleteCharacter('acc1', 9999), false);
});

test('다른 계정 캐릭터 id로 삭제 시도 → false', () => {
  const { store } = makeTmpStore();
  const rec = store.addCharacter('acc1', { lastname: 'Kircheis' });
  assert.equal(store.deleteCharacter('acc2', rec.id), false);
  assert.equal(store.getCharacters('acc1').length, 1); // acc1 캐릭터 보존
});

// ─── 파일 영속 ────────────────────────────────────────────────────────────────

test('추가 후 새 store 인스턴스에서 재로드 가능', () => {
  const { path } = makeTmpStore();
  const s1 = createCharacterStore(path);
  s1.addCharacter('acc1', { lastname: 'Oberstein' });

  const s2 = createCharacterStore(path); // 재로드
  const list = s2.getCharacters('acc1');
  assert.equal(list.length, 1);
  assert.equal(list[0].lastname, 'Oberstein');
});

test('삭제 후 재로드 시 반영됨', () => {
  const { path } = makeTmpStore();
  const s1 = createCharacterStore(path);
  const rec = s1.addCharacter('acc1', { lastname: 'Bittenfeld' });
  s1.deleteCharacter('acc1', rec.id);

  const s2 = createCharacterStore(path);
  assert.equal(s2.getCharacters('acc1').length, 0);
});

test('storePath 없어도 자동 생성', () => {
  const dir = mkdtempSync(join(tmpdir(), 'logh7-store-'));
  const path = join(dir, 'sub', 'chars.json'); // sub 디렉터리 미존재
  const store = createCharacterStore(path);
  store.addCharacter('acc1', { lastname: 'Wahlen' });

  const s2 = createCharacterStore(path);
  assert.equal(s2.getCharacters('acc1').length, 1);
});

test('getCharacters 반환값 변경이 내부 상태에 영향 없음', () => {
  const { store } = makeTmpStore();
  store.addCharacter('acc1', { lastname: 'Lutz' });
  const list = store.getCharacters('acc1');
  list.push({ id: 999, lastname: 'Fake' }); // 외부 변형
  assert.equal(store.getCharacters('acc1').length, 1); // 내부 상태 불변
});
