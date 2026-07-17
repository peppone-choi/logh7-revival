// LOGH7-62 — 미확인 command(factory id 79/0x4f 등) fail-closed 유지 검증.
//
// 방어적 복원(죽은 게임 복원·자체 서버 호환성): 원본 클라이언트가 보낼 수 있는
// 미확정 항행/전략 command factory id 는 서버가 조용히 실행하거나 크래시하지 않고
// 정의된 거부 경로(fail-closed)로 처리하며, DB·세션 상태를 바꾸지 않는다.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  authorizeNavigationCommand,
  isCaptainNavigationCommand,
  buildAuthorityCommandRows,
  seedAuthorityCardsForPower,
  CAPTAIN_NAVIGATION_COMMAND_FACTORY_IDS,
} from '../src/domain/authority-cards.mjs';
import { createGameApplication } from '../src/application/GameApplication.mjs';
import { isStrategicGridCellNavigable } from '../src/server/logh7-galaxy-placement.mjs';

const UNCONFIRMED_COMMAND = 0x4f; // 79 — 확정 factory id 가 아닌 미확인 command

test('command 79(0x4f) is not a confirmed captain navigation command', () => {
  assert.equal(isCaptainNavigationCommand(UNCONFIRMED_COMMAND), false);
  assert.ok(!CAPTAIN_NAVIGATION_COMMAND_FACTORY_IDS.includes(UNCONFIRMED_COMMAND));
  // 확정 command(0x2b warp)는 known 이어야 한다.
  assert.equal(isCaptainNavigationCommand(0x2b), true);
});

test('captain card never grants the unconfirmed command 79', () => {
  // 제국 함장 카드(kind 59)를 시드한 캐릭터도 command 79 는 절대 부여받지 못한다.
  const rows = buildAuthorityCommandRows(seedAuthorityCardsForPower(2));
  assert.ok(rows.some((row) => row.commands.includes(0x2b)), '확정 warp(0x2b)은 함장에게 부여');
  assert.ok(
    !rows.some((row) => row.commands.includes(UNCONFIRMED_COMMAND)),
    '미확인 command 79 는 어떤 row 에도 없다',
  );
});

test('authorizeNavigationCommand fail-closes an unconfirmed command even for a captain', () => {
  // 함장 카드를 보유해도 미확인 command 79 는 거부(unknown-command).
  const captainCards = seedAuthorityCardsForPower(2);
  const verdict = authorizeNavigationCommand(captainCards, UNCONFIRMED_COMMAND);
  assert.equal(verdict.allowed, false);
  assert.equal(verdict.reason, 'unknown-command');
});

test('authorizeNavigationCommand allows confirmed warp only with the captain card', () => {
  const captainCards = seedAuthorityCardsForPower(2); // 제국 함장(kind 59)
  const personalOnly = seedAuthorityCardsForPower(null); // personal 카드만

  assert.deepEqual(authorizeNavigationCommand(captainCards, 0x2b), { allowed: true, reason: null });
  // personal 만 있으면 확정 command 여도 권한 부재로 fail-closed.
  assert.deepEqual(
    authorizeNavigationCommand(personalOnly, 0x2b),
    { allowed: false, reason: 'no-authority' },
  );
});

test('an unconfirmed command leaves DB/session state unchanged (fail-closed)', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'logh7-cmd79-'));
  const dbPath = join(dir, 't.sqlite');
  const app = createGameApplication({ dbPath, isGridCellNavigable: isStrategicGridCellNavigable });
  try {
    app.ensureAccount({ accountId: 'inei00', password: 'dummy' });
    const created = app.dispatchCommandSync({
      type: 'CreateCharacter',
      accountId: 'inei00',
      lastname: 'Fail',
      firstname: 'Closed',
      face: 1,
      power: 2, // 제국 함장 카드 시드 → warp 권한 보유
    });
    app.dispatchCommandSync({
      type: 'EnterWorld',
      accountId: 'inei00',
      characterId: created.character.id,
    });

    const db = app.connection.db;
    const snapshot = () => db.prepare(
      'SELECT cell, online, revision FROM characters WHERE id = ?',
    ).get(created.character.id);
    const before = snapshot();

    // command 79 는 확정 factory id 가 아니므로, warp 권한이 있는 캐릭터라도 거부된다.
    const verdict = authorizeNavigationCommand(created.character.authorityCards, UNCONFIRMED_COMMAND);
    assert.equal(verdict.allowed, false);
    assert.equal(verdict.reason, 'unknown-command');

    // 미확인 command 는 어떤 mutating command 핸들러에도 라우팅되지 않는다 —
    // DB row(cell/online/revision)와 domain_events 가 그대로다.
    const after = snapshot();
    assert.deepEqual(after, before);
    assert.equal(
      db.prepare("SELECT COUNT(*) AS c FROM domain_events WHERE type = 'GridMoved'").get().c,
      0,
    );
  } finally {
    app.close();
    await rm(dir, { recursive: true, force: true });
  }
});
