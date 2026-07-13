import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { createGameApplication } from '../src/application/GameApplication.mjs';
import {
  buildAdmissionResponseInner,
  msg32Body,
  readMsg32Code,
} from '../src/server/logh7-world-records.mjs';
import { createWorldSession } from '../src/server/logh7-world-session.mjs';
import { createCharacterStore } from '../src/server/logh7-character-store.mjs';

function parse0305(inner) {
  assert.equal(readMsg32Code(inner), 0x0305);
  const body = msg32Body(inner);
  const count = body.readUInt16BE(0);
  const rows = [];
  let cursor = 2;
  for (let ordinal = 0; ordinal < count; ordinal += 1) {
    const id = body.readUInt16BE(cursor);
    const commandCount = body.readUInt8(cursor + 0x12);
    const commands = Array.from(
      { length: commandCount },
      (_, index) => body.readUInt16BE(cursor + 0x13 + index * 2),
    );
    rows.push({ id, commands });
    cursor += 0x13 + commandCount * 2;
  }
  return rows;
}

function parse0307(inner) {
  assert.equal(readMsg32Code(inner), 0x0307);
  const body = msg32Body(inner);
  const count = body.readUInt16BE(0);
  const rows = [];
  let cursor = 2;
  for (let ordinal = 0; ordinal < count; ordinal += 1) {
    const id = body.readUInt16BE(cursor);
    const commandCount = body.readUInt8(cursor + 2);
    const commands = Array.from(
      { length: commandCount },
      (_, index) => body.readUInt16BE(cursor + 3 + index * 8),
    );
    rows.push({ id, commands });
    cursor += 3 + commandCount * 8;
  }
  return rows;
}

function cardsForKinds(kinds) {
  return kinds.map((kind, ordinal) => ({
    ordinal,
    kind,
    spot: 0,
    provenance: 'test',
  }));
}

function assertPaddedRows(rows, maxKind, { captainKind = null } = {}) {
  assert.equal(rows.length, maxKind + 1);
  assert.deepEqual(rows.map((row) => row.id), Array.from({ length: maxKind + 1 }, (_, id) => id));
  for (let ordinal = 0; ordinal <= maxKind; ordinal += 1) {
    const expected = ordinal === captainKind ? [0x002b, 0x002d] : [];
    assert.deepEqual(rows[ordinal].commands, expected, `ordinal ${ordinal} command grant`);
  }
  assert.ok(rows.every((row) => !row.commands.includes(0x0041)), '0x41 has no canonical card grant');
  assert.ok(rows.every((row) => !row.commands.includes(0x0043)), '0x43 has no canonical card grant');
}

test('0305/0307 pad every runtime ordinal through empire card kind 59', () => {
  const context = { authorityCards: cardsForKinds([0, 59]) };

  assertPaddedRows(parse0305(buildAdmissionResponseInner(0x0304, context)), 59, { captainKind: 59 });
  assertPaddedRows(parse0307(buildAdmissionResponseInner(0x0306, context)), 59, { captainKind: 59 });
});

test('0305/0307 pad every runtime ordinal through alliance card kind 195', () => {
  const context = { authorityCards: cardsForKinds([0, 195]) };

  assertPaddedRows(parse0305(buildAdmissionResponseInner(0x0304, context)), 195, { captainKind: 195 });
  assertPaddedRows(parse0307(buildAdmissionResponseInner(0x0306, context)), 195, { captainKind: 195 });
});

test('0305/0307 without player context use deterministic personal-only rows', () => {
  assertPaddedRows(parse0305(buildAdmissionResponseInner(0x0304)), 0);
  assertPaddedRows(parse0307(buildAdmissionResponseInner(0x0306)), 0);
});

test('unproven rebel captain variants receive no navigation command grants', () => {
  const context = { authorityCards: cardsForKinds([0, 123, 257]) };

  assertPaddedRows(parse0305(buildAdmissionResponseInner(0x0304, context)), 257);
  assertPaddedRows(parse0307(buildAdmissionResponseInner(0x0306, context)), 257);
});

test('world admission preserves the selected player authority card context', () => {
  const world = createWorldSession();
  world.seedPlayer({
    connectionId: 7,
    characterId: 99,
    unitId: 9,
    authorityCards: cardsForKinds([0, 59]),
  });
  const request = (code) => {
    const inner = Buffer.alloc(2);
    inner.writeUInt16BE(code, 0);
    return world.handleWorldInner({ connectionId: 7, accountId: 'test', inner }).responses[0].inner;
  };

  assert.deepEqual(world.getPlayer(7).authorityCards.map((card) => card.kind), [0, 59]);
  assertPaddedRows(parse0305(request(0x0304)), 59, { captainKind: 59 });
  assertPaddedRows(parse0307(request(0x0306)), 59, { captainKind: 59 });
});

test('new ORM characters seed power-specific authority cards and survive reopen', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'logh7-authority-create-'));
  const dbPath = join(dir, 'authority.sqlite');
  const app = createGameApplication({ dbPath, seed: false });
  try {
    app.ensureAccount({ accountId: 'cards', password: 'x' });
    const store = app.createCharacterStoreAdapter();
    const empire = store.addCharacter('cards', {
      lastname: 'Empire', firstname: 'Captain', power: 2,
    });
    const alliance = store.addCharacter('cards', {
      lastname: 'Alliance', firstname: 'Captain', power: 3,
    });
    const unknown = store.addCharacter('cards', {
      lastname: 'Unknown', firstname: 'Power', power: 7,
    });

    assert.deepEqual(empire.authorityCards.map((card) => card.kind), [0, 59]);
    assert.deepEqual(alliance.authorityCards.map((card) => card.kind), [0, 195]);
    assert.deepEqual(unknown.authorityCards.map((card) => card.kind), [0]);
    assert.deepEqual(empire.authorityCards.map((card) => card.ordinal), [0, 1]);
    assert.ok(empire.authorityCards.every((card) => card.provenance.length > 0));
    app.close();

    const reopened = createGameApplication({ dbPath, seed: false });
    try {
      const cards = reopened.createCharacterStoreAdapter().getCharacters('cards');
      assert.deepEqual(cards.find((card) => card.id === empire.id).authorityCards.map((card) => card.kind), [0, 59]);
      assert.deepEqual(cards.find((card) => card.id === alliance.id).authorityCards.map((card) => card.kind), [0, 195]);
      assert.deepEqual(cards.find((card) => card.id === unknown.id).authorityCards.map((card) => card.kind), [0]);
    } finally {
      reopened.close();
    }
  } finally {
    try { app.close(); } catch { /* 이미 닫힌 연결 */ }
    await rm(dir, { recursive: true, force: true });
  }
});

test('database open backfills authority cards for characters created before the card table', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'logh7-authority-backfill-'));
  const dbPath = join(dir, 'legacy.sqlite');
  const legacy = new DatabaseSync(dbPath);
  legacy.exec(`
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
  `);
  const insert = legacy.prepare(`
    INSERT INTO characters(account_id, power, lastname, firstname, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  insert.run('legacy', 2, 'Old', 'Empire', 1, 1);
  insert.run('legacy', 3, 'Old', 'Alliance', 1, 1);
  insert.run('legacy', 8, 'Old', 'Unknown', 1, 1);
  legacy.close();

  const app = createGameApplication({ dbPath, seed: false });
  try {
    const characters = app.createCharacterStoreAdapter().getCharacters('legacy');
    assert.deepEqual(characters.map((character) => character.authorityCards.map((card) => card.kind)), [
      [0, 59],
      [0, 195],
      [0],
    ]);
    const rows = app.connection.db.prepare(`
      SELECT character_id, ordinal, kind, spot, provenance
      FROM character_authority_cards
      ORDER BY character_id, ordinal
    `).all();
    assert.deepEqual(rows.map((row) => row.kind), [0, 59, 0, 195, 0]);
    assert.ok(rows.every((row) => row.provenance.length > 0));
  } finally {
    app.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test('authority card input rejects more than 16 entries and invalid kinds', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'logh7-authority-invalid-'));
  const app = createGameApplication({ dbPath: join(dir, 'invalid.sqlite'), seed: false });
  try {
    app.ensureAccount({ accountId: 'invalid', password: 'x' });
    const store = app.createCharacterStoreAdapter();
    assert.throws(
      () => store.addCharacter('invalid', {
        lastname: 'Too', firstname: 'Many', power: 2,
        authorityCards: Array.from({ length: 17 }, (_, kind) => ({ kind, spot: 0, provenance: 'test' })),
      }),
      /at most 16 authority cards/,
    );
    assert.throws(
      () => store.addCharacter('invalid', {
        lastname: 'Bad', firstname: 'Kind', power: 2,
        authorityCards: [{ kind: 300, spot: 0, provenance: 'test' }],
      }),
      /kind must be an integer from 0 to 299/,
    );
  } finally {
    app.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test('JSON character store uses the same authority card shape for create and legacy reload', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'logh7-authority-json-'));
  const createdPath = join(dir, 'created.json');
  const legacyPath = join(dir, 'legacy.json');
  try {
    const createdStore = createCharacterStore(createdPath);
    const created = createdStore.addCharacter('json', {
      lastname: 'JSON', firstname: 'Empire', power: 2,
    });
    assert.deepEqual(created.authorityCards.map((card) => card.kind), [0, 59]);
    assert.deepEqual(
      createCharacterStore(createdPath).getCharacters('json')[0].authorityCards.map((card) => card.kind),
      [0, 59],
    );

    await writeFile(legacyPath, JSON.stringify({
      nextId: 2,
      accounts: {
        legacy: [{ id: 1, lastname: 'JSON', firstname: 'Alliance', power: 3 }],
      },
    }), 'utf8');
    const legacy = createCharacterStore(legacyPath).getCharacters('legacy')[0];
    assert.deepEqual(legacy.authorityCards.map((card) => card.kind), [0, 195]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
