// LOGH VII — Nest+Drizzle 마이그레이션 Phase 1 accounts 슬라이스 패리티 테스트.
// 실행: `npm run test:drizzle` (= node --import tsx --test). `npm run test:server`(*.test.mjs glob)에는
// 잡히지 않으므로 기존 1069은 불변, 본 테스트는 별도 tsx 레인이다.
//
// 증명: Drizzle(better-sqlite3) 영속화가 기존 node:sqlite 레지스트리 영속화와
//   (1) Drizzle 자체 왕복, (2) Drizzle가 node-기록 DB를 동일 판독, (3) node가 Drizzle-기록 DB를
//   동일 판독, (4) on-disk 스키마(PRAGMA table_info) 동일, (5) Drizzle 스키마 컬럼명 일치
// 임을 byte/shape 수준에서 확인한다 → "node:sqlite 경로는 패리티까지 폴백 유지" 게이트.

import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { getTableConfig } from 'drizzle-orm/sqlite-core';

import { loadAccountRecords, persistAccountRecords } from '../../../src/server/logh7-account-registry.mjs';
import { accounts } from '../../../src/app/persistence/accounts.schema.js';
import {
  loadAccountRecordsDrizzle,
  persistAccountRecordsDrizzle,
} from '../../../src/app/persistence/drizzle-account-persistence.js';

// 입력은 비정렬·null createdAt·다양한 characters를 포함한다(로더는 ORDER BY account로 정렬).
const RECORDS = [
  {
    account: 'carol',
    salt: '22'.repeat(16),
    hash: '33'.repeat(32),
    createdAt: '2026-06-20T12:34:56.000Z',
    characters: [
      { id: 7, name: 'C' },
      { id: 8, name: 'D' },
    ],
  },
  { account: 'alice', salt: '00'.repeat(16), hash: '11'.repeat(32), createdAt: '2026-06-21T00:00:00.000Z', characters: [{ id: 1, name: 'A' }] },
  { account: 'bob', salt: 'ab'.repeat(16), hash: 'cd'.repeat(32), createdAt: null, characters: [] },
];

const EXPECTED = [
  { account: 'alice', salt: '00'.repeat(16), hash: '11'.repeat(32), createdAt: '2026-06-21T00:00:00.000Z', characters: [{ id: 1, name: 'A' }] },
  { account: 'bob', salt: 'ab'.repeat(16), hash: 'cd'.repeat(32), createdAt: null, characters: [] },
  {
    account: 'carol',
    salt: '22'.repeat(16),
    hash: '33'.repeat(32),
    createdAt: '2026-06-20T12:34:56.000Z',
    characters: [
      { id: 7, name: 'C' },
      { id: 8, name: 'D' },
    ],
  },
];

function tableInfo(persistPath: string): unknown[] {
  const db = new DatabaseSync(persistPath);
  try {
    return db.prepare('PRAGMA table_info(accounts)').all();
  } finally {
    db.close();
  }
}

test('Drizzle persist→load round-trips account records (sorted, characters, null createdAt)', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'logh7-drz-rt-'));
  const p = path.join(dir, 'accounts.sqlite');
  try {
    persistAccountRecordsDrizzle(p, RECORDS);
    assert.deepEqual(loadAccountRecordsDrizzle(p), EXPECTED);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('Drizzle reads a node:sqlite-written accounts DB identically to the node:sqlite loader', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'logh7-drz-xr-'));
  const p = path.join(dir, 'accounts.sqlite');
  try {
    persistAccountRecords(p, RECORDS); // node:sqlite write
    assert.deepEqual(loadAccountRecordsDrizzle(p), loadAccountRecords(p));
    assert.deepEqual(loadAccountRecordsDrizzle(p), EXPECTED);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('node:sqlite reads a Drizzle-written accounts DB identically to a node:sqlite-written one', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'logh7-drz-xw-'));
  const nodePath = path.join(dir, 'node.sqlite');
  const drzPath = path.join(dir, 'drizzle.sqlite');
  try {
    persistAccountRecords(nodePath, RECORDS);
    persistAccountRecordsDrizzle(drzPath, RECORDS);
    assert.deepEqual(loadAccountRecords(drzPath), loadAccountRecords(nodePath));
    assert.deepEqual(loadAccountRecords(drzPath), EXPECTED);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('Drizzle and node:sqlite produce an identical accounts table schema (PRAGMA table_info)', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'logh7-drz-schema-'));
  const nodePath = path.join(dir, 'node.sqlite');
  const drzPath = path.join(dir, 'drizzle.sqlite');
  try {
    persistAccountRecords(nodePath, RECORDS);
    persistAccountRecordsDrizzle(drzPath, RECORDS);
    assert.deepEqual(tableInfo(drzPath), tableInfo(nodePath));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('Drizzle accounts schema declares exactly the on-disk columns', () => {
  const colNames = getTableConfig(accounts)
    .columns.map((column) => column.name)
    .sort();
  assert.deepEqual(colNames, ['account', 'characters_json', 'created_at', 'hash', 'salt']);
});
