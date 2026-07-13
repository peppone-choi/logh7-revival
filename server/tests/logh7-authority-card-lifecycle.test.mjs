// 권한카드 생명주기 — seed/revoke 계약, 트랜잭션 원자성, grant/revoke 커맨드
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { createGameApplication } from '../src/application/GameApplication.mjs';
import { openDatabase } from '../src/infrastructure/persistence/Database.mjs';
import { createCharacterStore } from '../src/server/logh7-character-store.mjs';
import {
  resolveAuthorityCards,
  grantAuthorityCard,
  revokeAuthorityCard,
  GRANTABLE_CARD_KINDS,
  NORMAL_EMPIRE_CAPTAIN_CARD_KIND,
  NORMAL_ALLIANCE_CAPTAIN_CARD_KIND,
  PERSONAL_CARD_KIND,
} from '../src/domain/authority-cards.mjs';

async function tempDir(prefix) {
  return mkdtemp(join(tmpdir(), prefix));
}

// ── 1. authorityCards: [] 계약 ─────────────────────────────────────────────

test('resolveAuthorityCards: 필드 부재(undefined/null)는 power별 canonical grant를 시드한다', () => {
  for (const absent of [undefined, null]) {
    const empire = resolveAuthorityCards(absent, 2);
    assert.deepEqual(
      empire.map((card) => card.kind),
      [PERSONAL_CARD_KIND, NORMAL_EMPIRE_CAPTAIN_CARD_KIND],
      '제국(power=2)은 personal + 제국 함장 카드',
    );
    const alliance = resolveAuthorityCards(absent, 3);
    assert.deepEqual(
      alliance.map((card) => card.kind),
      [PERSONAL_CARD_KIND, NORMAL_ALLIANCE_CAPTAIN_CARD_KIND],
      '동맹(power=3)은 personal + 동맹 함장 카드',
    );
    const neutral = resolveAuthorityCards(absent, 1);
    assert.deepEqual(neutral.map((card) => card.kind), [PERSONAL_CARD_KIND], '그 외는 personal만');
  }
});

test('resolveAuthorityCards: 명시적 빈 배열은 의도적 revoke — 카드 없음을 유지한다', () => {
  assert.deepEqual(resolveAuthorityCards([], 2), [], 'power=2여도 시드하지 않는다');
  assert.deepEqual(resolveAuthorityCards([], 3), [], 'power=3여도 시드하지 않는다');
});

test('명시적 빈 배열 revoke가 ORM store 재오픈 후에도 유지된다', async () => {
  const dir = await tempDir('logh7-revoke-orm-');
  const dbPath = join(dir, 't.sqlite');
  try {
    const app = createGameApplication({ dbPath, seed: false });
    await app.dispatchCommand({ type: 'EnsureDevAccount', accountId: 'acct', password: 'x' });
    const created = await app.dispatchCommand({
      type: 'CreateCharacter',
      accountId: 'acct',
      power: 2,
      lastname: 'Revoked',
      firstname: 'Pilot',
      authorityCards: [],
    });
    assert.equal(created.ok, true);
    assert.deepEqual(created.character.authorityCards, [], '생성 즉시 카드 없음');
    const characterId = created.character.id;
    app.close();

    // 재오픈: legacy backfill 이 카드 0장 캐릭터를 다시 시드하면 안 된다.
    const reopened = createGameApplication({ dbPath, seed: false });
    try {
      const { character } = await reopened.dispatchQuery({ type: 'GetCharacter', characterId });
      assert.ok(character, '캐릭터가 존재한다');
      assert.deepEqual(character.authorityCards, [], '재오픈 후에도 카드 없음(revoke 유지)');
      const seeded = reopened.connection.db
        .prepare('SELECT authority_cards_seeded FROM characters WHERE id = ?')
        .get(characterId);
      assert.equal(seeded.authority_cards_seeded, 1, '신규 insert 는 seeded=1');
    } finally {
      reopened.close();
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('명시적 빈 배열 revoke가 JSON store 재로드 후에도 유지된다', async () => {
  const dir = await tempDir('logh7-revoke-json-');
  const storePath = join(dir, 'characters.json');
  try {
    const store = createCharacterStore(storePath);
    const record = store.addCharacter('acct', {
      power: 2,
      lastname: 'Revoked',
      firstname: 'Pilot',
      authorityCards: [],
    });
    assert.deepEqual(record.authorityCards, [], '추가 즉시 카드 없음');

    const reloaded = createCharacterStore(storePath);
    const [loaded] = reloaded.getCharacters('acct');
    assert.deepEqual(loaded.authorityCards, [], '재로드 후에도 카드 없음(revoke 유지)');

    // 대조군: 필드가 없는 레코드는 여전히 시드된다.
    const seededRecord = store.addCharacter('acct', {
      power: 2,
      lastname: 'Seeded',
      firstname: 'Pilot',
    });
    assert.deepEqual(
      seededRecord.authorityCards.map((card) => card.kind),
      [PERSONAL_CARD_KIND, NORMAL_EMPIRE_CAPTAIN_CARD_KIND],
      '필드 부재는 canonical grant 시드',
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// ── 2. 트랜잭션 원자성 (fault injection) ────────────────────────────────────

test('legacy backfill 중간 insert 실패 시 전부 롤백된다(부분 저장 0행)', async () => {
  const dir = await tempDir('logh7-backfill-tx-');
  const dbPath = join(dir, 't.sqlite');
  try {
    // kind CHECK 를 0..10 으로 좁힌 legacy DB — 제국 Captain kind 59 가 중간에 터진다.
    const legacy = new DatabaseSync(dbPath);
    legacy.exec(`
      CREATE TABLE schema_version (version INTEGER NOT NULL);
      INSERT INTO schema_version(version) VALUES (3);
      CREATE TABLE characters (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        account_id TEXT NOT NULL,
        power INTEGER NOT NULL DEFAULT 1,
        blood INTEGER NOT NULL DEFAULT 0,
        sex INTEGER NOT NULL DEFAULT 0,
        lastname TEXT NOT NULL DEFAULT '',
        firstname TEXT NOT NULL DEFAULT '',
        face INTEGER NOT NULL DEFAULT 1,
        rank INTEGER NOT NULL DEFAULT 13,
        unit_id INTEGER,
        cell INTEGER NOT NULL DEFAULT 2588,
        online INTEGER NOT NULL DEFAULT 0,
        ability8_json TEXT,
        created_at INTEGER NOT NULL,
        revision INTEGER NOT NULL DEFAULT 0,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE character_authority_cards (
        character_id INTEGER NOT NULL,
        ordinal INTEGER NOT NULL CHECK (ordinal BETWEEN 0 AND 15),
        kind INTEGER NOT NULL CHECK (kind BETWEEN 0 AND 10),
        spot INTEGER NOT NULL CHECK (spot BETWEEN 0 AND 4294967295),
        provenance TEXT NOT NULL CHECK (length(provenance) > 0),
        PRIMARY KEY (character_id, ordinal),
        UNIQUE (character_id, kind),
        FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
      );
      -- id=1: power=1 → personal(kind 0) 만, CHECK 통과.
      INSERT INTO characters(account_id, power, created_at, updated_at) VALUES ('a', 1, 1, 1);
      -- id=2: power=2 → personal(0) 성공 후 제국 Captain(59) 이 CHECK 위반.
      INSERT INTO characters(account_id, power, created_at, updated_at) VALUES ('a', 2, 1, 1);
    `);
    legacy.close();

    assert.throws(() => openDatabase({ dbPath }), /CHECK|constraint/i, 'backfill 이 실패를 전파한다');

    // 롤백 검증: 먼저 성공했던 id=1 의 personal 카드까지 전부 사라져야 한다.
    const verify = new DatabaseSync(dbPath);
    try {
      const { c } = verify.prepare('SELECT COUNT(*) AS c FROM character_authority_cards').get();
      assert.equal(c, 0, '부분 저장 0행 — 전체 롤백');
      const seeded = verify.prepare(
        'SELECT COUNT(*) AS c FROM characters WHERE authority_cards_seeded = 1',
      ).get();
      assert.equal(seeded.c, 0, 'seeded 마킹도 롤백');
    } finally {
      verify.close();
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('flush() 중 뒤의 dirty 엔티티가 던지면 앞 캐릭터의 카드 교체가 롤백된다', async () => {
  const dir = await tempDir('logh7-flush-tx-');
  const dbPath = join(dir, 't.sqlite');
  const app = createGameApplication({ dbPath, seed: false });
  try {
    await app.dispatchCommand({ type: 'EnsureDevAccount', accountId: 'acct', password: 'x' });
    const first = await app.dispatchCommand({
      type: 'CreateCharacter',
      accountId: 'acct',
      power: 2,
      lastname: 'First',
      firstname: 'Pilot',
    });
    await app.dispatchCommand({
      type: 'CreateCharacter',
      accountId: 'acct',
      power: 2,
      lastname: 'Second',
      firstname: 'Pilot',
    });
    const firstId = first.character.id;
    const cardsBefore = app.connection.db
      .prepare('SELECT COUNT(*) AS c FROM character_authority_cards WHERE character_id = ?')
      .get(firstId).c;
    assert.equal(cardsBefore, 2, '제국 캐릭터는 카드 2장으로 시작');

    app.withUnitOfWork((uow) => {
      const [a, b] = uow.findCharactersByAccount('acct');
      // a: 정상 revoke — flush 앞부분에서 DELETE 가 실행된다.
      a.authorityCards = [];
      a._dirty = true;
      // b: 도메인 검증을 우회한 손상 카드 — replaceAuthorityCards 가 flush 뒤쪽에서 던진다.
      b.authorityCards = [{ ordinal: 0, kind: 9999, spot: 0, provenance: 'fault-injection' }];
      b._dirty = true;
      assert.throws(() => uow.flush(), /kind/i, 'flush 가 실패를 전파한다');
    });

    const cardsAfter = app.connection.db
      .prepare('SELECT COUNT(*) AS c FROM character_authority_cards WHERE character_id = ?')
      .get(firstId).c;
    assert.equal(cardsAfter, 2, '앞 캐릭터의 카드 교체(DELETE)가 롤백됨');
  } finally {
    app.close();
    await rm(dir, { recursive: true, force: true });
  }
});

// ── 3. grant / revoke API ──────────────────────────────────────────────────

test('grantAuthorityCard: 승인 kind만 허용, 멱등', () => {
  assert.deepEqual(GRANTABLE_CARD_KINDS, [0, 59, 195], 'P0/P1 근거가 있는 kind만');

  let cards = resolveAuthorityCards([], 2);
  cards = grantAuthorityCard(cards, PERSONAL_CARD_KIND);
  cards = grantAuthorityCard(cards, NORMAL_EMPIRE_CAPTAIN_CARD_KIND);
  assert.deepEqual(cards.map((c) => c.kind), [0, 59]);
  assert.deepEqual(cards.map((c) => c.ordinal), [0, 1]);

  const again = grantAuthorityCard(cards, NORMAL_EMPIRE_CAPTAIN_CARD_KIND);
  assert.deepEqual(again, cards, 'grant 는 멱등');

  // 반란군 variant 는 camp 근거가 없어 거부한다.
  assert.throws(() => grantAuthorityCard(cards, 123), /grantable/i, '반란 kind 123 거부');
  assert.throws(() => grantAuthorityCard(cards, 257), /grantable/i, '반란 kind 257 거부');
});

test('revokeAuthorityCard: ordinal 을 0..n-1 로 재압축한다', () => {
  const cards = resolveAuthorityCards(undefined, 3);
  assert.deepEqual(cards.map((c) => c.kind), [0, 195]);
  const revoked = revokeAuthorityCard(cards, PERSONAL_CARD_KIND);
  assert.deepEqual(revoked.map((c) => c.kind), [195]);
  assert.deepEqual(revoked.map((c) => c.ordinal), [0], 'ordinal 재압축');
  assert.deepEqual(revokeAuthorityCard(revoked, 195), [], '전부 revoke 가능');
  assert.deepEqual(revokeAuthorityCard(cards, 99), cards, '없는 kind revoke 는 무변화');
});

test('GrantAuthorityCard/RevokeAuthorityCard 커맨드가 변경을 영속한다', async () => {
  const dir = await tempDir('logh7-grant-cmd-');
  const dbPath = join(dir, 't.sqlite');
  try {
    const app = createGameApplication({ dbPath, seed: false });
    await app.dispatchCommand({ type: 'EnsureDevAccount', accountId: 'acct', password: 'x' });
    const created = await app.dispatchCommand({
      type: 'CreateCharacter',
      accountId: 'acct',
      power: 3,
      lastname: 'Grant',
      firstname: 'Target',
      authorityCards: [],
    });
    const characterId = created.character.id;

    const granted = await app.dispatchCommand({
      type: 'GrantAuthorityCard',
      characterId,
      kind: NORMAL_ALLIANCE_CAPTAIN_CARD_KIND,
    });
    assert.equal(granted.ok, true);
    assert.deepEqual(granted.authorityCards.map((c) => c.kind), [195]);

    // 미승인 kind 거부
    await assert.rejects(
      app.dispatchCommand({ type: 'GrantAuthorityCard', characterId, kind: 123 }),
      /grantable/i,
      '반란 kind 는 커맨드 레벨에서도 거부',
    );
    // 존재하지 않는 캐릭터 거부
    await assert.rejects(
      app.dispatchCommand({ type: 'GrantAuthorityCard', characterId: 9999, kind: 0 }),
      /character not found/i,
    );
    await assert.rejects(
      app.dispatchCommand({ type: 'RevokeAuthorityCard', characterId: 9999, kind: 0 }),
      /character not found/i,
    );
    app.close();

    // 재오픈 후 grant 가 살아있다.
    const reopened = createGameApplication({ dbPath, seed: false });
    try {
      const { character } = await reopened.dispatchQuery({ type: 'GetCharacter', characterId });
      assert.deepEqual(character.authorityCards.map((c) => c.kind), [195], 'grant 영속');

      const revoked = await reopened.dispatchCommand({
        type: 'RevokeAuthorityCard',
        characterId,
        kind: NORMAL_ALLIANCE_CAPTAIN_CARD_KIND,
      });
      assert.equal(revoked.ok, true);
      assert.deepEqual(revoked.authorityCards, [], 'revoke 반영');

      const after = await reopened.dispatchQuery({ type: 'GetCharacter', characterId });
      assert.deepEqual(after.character.authorityCards, [], 'revoke 영속');
    } finally {
      reopened.close();
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
