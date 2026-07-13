// logh7-strategy-command-catalog.test.mjs — 81 전략명령 카탈로그 + 권한 게이트 골격 계약.
//
// 카탈로그(server/content/generated/logh7-strategy-command-catalog.json)가 별표 정본
// strategy-commands.json 과 일치하고, 각 명령이 권한 검증 allow/deny 경로를 갖는지 확인한다.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  loadStrategyCommandCatalog,
  listStrategyCommands,
  getStrategyCommand,
  authorizeStrategyCommand,
  executeStrategyCommand,
  DENY,
} from '../src/domain/strategy-command-catalog.mjs';
import { CAPTAIN_NAVIGATION_COMMAND_FACTORY_IDS } from '../src/domain/authority-cards.mjs';

const MANUAL = join(dirname(fileURLToPath(import.meta.url)), '..', 'content', 'manual');
const manualCommands = JSON.parse(readFileSync(join(MANUAL, 'strategy-commands.json'), 'utf8')).commands;

const CATEGORY_KEYS = new Set(['STR', 'IND', 'CMD', 'LOG', 'PER', 'POL', 'INT']);
const EXPECTED_COUNTS = { STR: 16, IND: 15, CMD: 8, LOG: 6, PER: 10, POL: 12, INT: 14 };

test('카탈로그는 별표 81 명령을 카테고리별 정수로 담는다', () => {
  const catalog = loadStrategyCommandCatalog();
  assert.equal(catalog.commands.length, 81);
  assert.equal(catalog._counts.total, 81);
  assert.deepEqual(catalog._counts.by_category, EXPECTED_COUNTS);
});

test('slug 은 유일하고 category_key 는 유효하다', () => {
  const slugs = new Set();
  for (const cmd of listStrategyCommands()) {
    assert.ok(!slugs.has(cmd.slug), `duplicate slug ${cmd.slug}`);
    slugs.add(cmd.slug);
    assert.ok(CATEGORY_KEYS.has(cmd.category_key), `bad category_key ${cmd.category_key}`);
  }
  assert.equal(slugs.size, 81);
});

test('각 명령은 필수 정본·provenance 필드를 갖는다', () => {
  for (const cmd of listStrategyCommands()) {
    for (const field of ['name_ja', 'category_ja', 'category_key', 'required_card_ja', 'desc_ja']) {
      assert.ok(cmd[field] != null && String(cmd[field]).length > 0, `${cmd.slug} missing ${field}`);
    }
    assert.ok(Number.isInteger(cmd.cost_cp), `${cmd.slug} cost_cp not int`);
    assert.ok(Array.isArray(cmd.sources) && cmd.sources.length > 0, `${cmd.slug} missing sources`);
    assert.ok(cmd.cp_timing_prov.startsWith('P1'), `${cmd.slug} cp not P1`);
    assert.ok(typeof cmd.factory_id_prov === 'string', `${cmd.slug} missing factory prov`);
  }
});

test('CP·타이밍은 별표 strategy-commands.json 과 정확히 일치한다', () => {
  // 카탈로그는 별표를 단일 정본으로 재사용해야 한다(값 재입력·표류 금지).
  const byName = new Map(listStrategyCommands().map((c) => [c.name_ja, c]));
  assert.equal(byName.size, manualCommands.length);
  for (const src of manualCommands) {
    const cmd = byName.get(src.name_ja);
    assert.ok(cmd, `catalog missing ${src.name_ja}`);
    assert.equal(cmd.cost_cp, src.cost_cp, `${src.name_ja} cost_cp mismatch`);
    assert.equal(cmd.wait_time, src.wait_time, `${src.name_ja} wait_time mismatch`);
    assert.equal(cmd.exec_time, src.exec_time, `${src.name_ja} exec_time mismatch`);
    assert.equal(cmd.desc_ja, src.desc, `${src.name_ja} desc mismatch`);
  }
});

test('factory id 는 라이브 확정 2건만 정본, 나머지는 unresolved', () => {
  const resolved = listStrategyCommands().filter((c) => c.factory_id != null);
  assert.equal(resolved.length, 2);
  const warp = getStrategyCommand('ワープ航行');
  const inSystem = getStrategyCommand('星系内航行');
  assert.equal(warp.factory_id, 0x2b);
  assert.equal(inSystem.factory_id, 0x2d);
  // authority-cards 도메인의 확정 매핑과 카탈로그가 어긋나지 않아야 한다.
  assert.deepEqual(
    [warp.factory_id, inSystem.factory_id].sort((a, b) => a - b),
    [...CAPTAIN_NAVIGATION_COMMAND_FACTORY_IDS].sort((a, b) => a - b),
  );
  for (const cmd of listStrategyCommands()) {
    if (cmd.factory_id == null) assert.equal(cmd.factory_id_prov, 'unresolved', `${cmd.slug}`);
  }
});

// ── 권한 게이트 골격: allow / deny 경로 ──

function fullyProvisionedActor(cmd) {
  return {
    power: 2,
    rank: cmd.required_rank ?? 14,
    posts: cmd.issuer_posts,
    cardGroups: [cmd.category_key],
    pcp: 1_000_000,
    mcp: 1_000_000,
    atVenue: cmd.venue_ja ?? null,
    hasFief: true,
  };
}

// 빈 액터로도 통과하는(현 골격상 진짜 무제약) 명령: 보편카드 + CP풀 미확정/무비용 +
// 장소·봉토·계급 요건 없음. 정직한 분류이며 다음 배치에서 CP풀이 확정되면 게이트가 생긴다.
function isUniversallyPermitted(cmd) {
  const cost = cmd.cp_variable && cmd.cp_range ? cmd.cp_range[0] : cmd.cost_cp;
  const cpGated = cmd.cp_pool != null && cost > 0;
  return cmd.shared_by_all_characters
    && !cpGated
    && !cmd.venue_ja
    && !cmd.requires_fief
    && cmd.required_rank == null;
}

test('모든 명령: 완비 액터는 권한을 통과한다(allow 경로)', () => {
  for (const cmd of listStrategyCommands()) {
    const verdict = authorizeStrategyCommand(cmd.slug, fullyProvisionedActor(cmd));
    assert.ok(verdict.allowed, `${cmd.slug}(${cmd.name_ja}) denied: ${verdict.denies}`);
  }
});

test('모든 명령: 빈 액터는 거부되거나(deny 경로) 무제약으로 분류된다', () => {
  const emptyActor = { power: 2, rank: 14, posts: [], cardGroups: [], pcp: 0, mcp: 0, atVenue: null, hasFief: false };
  let permitted = 0;
  for (const cmd of listStrategyCommands()) {
    const verdict = authorizeStrategyCommand(cmd.slug, emptyActor);
    if (isUniversallyPermitted(cmd)) {
      assert.ok(verdict.allowed, `${cmd.slug} expected universally permitted`);
      permitted += 1;
    } else {
      assert.ok(!verdict.allowed, `${cmd.slug}(${cmd.name_ja}) should have a deny lever`);
      assert.ok(verdict.denies.length > 0);
    }
  }
  // 현 골격상 무제약은 개인 커맨드 일부(보편카드·CP풀 미확정)로 한정된다.
  assert.ok(permitted > 0 && permitted <= 15, `unexpected universally-permitted count ${permitted}`);
});

test('알 수 없는 명령은 UNKNOWN_COMMAND 로 거부된다', () => {
  const verdict = authorizeStrategyCommand('NOPE_99', fullyProvisionedActor({ category_key: 'STR' }));
  assert.equal(verdict.allowed, false);
  assert.deepEqual(verdict.denies, [DENY.UNKNOWN_COMMAND]);
});

test('실행은 스텁: 통과분은 not-implemented, 미통과분은 denied', () => {
  const warp = getStrategyCommand('ワープ航行');
  const ok = executeStrategyCommand(warp.slug, fullyProvisionedActor(warp));
  assert.equal(ok.status, 'not-implemented');
  assert.equal(ok.slug, warp.slug);

  const denied = executeStrategyCommand(warp.slug, { power: 2, mcp: 0 });
  assert.equal(denied.status, 'denied');
  assert.deepEqual(denied.denies, [DENY.INSUFFICIENT_CP]);
});
