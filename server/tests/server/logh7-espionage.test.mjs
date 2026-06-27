// logh7-espionage: 첩보 공작 — 체포 매트릭스(逮捕許可/執行命令/逮捕命令) + 침투(潜入/情報/破壊/脱出) +
// 단발(煽動/監視/襲撃) 상태머신 검증. 순수(roll 주입).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createEspionageState,
  AGITATION_BASE_DROP,
} from '../../src/server/logh7-espionage.mjs';

test('체포 매트릭스: 리스트+권한+동소 모두 충족해야 체포', () => {
  const s = createEspionageState();
  // 리스트 미등재 → 거부.
  assert.equal(s.arrestOrder(1, 100, 200, { coLocated: true }).reason, 'not-listed');
  s.authorizeArrest(1, 200);
  // 권한 없음 → 거부.
  assert.equal(s.arrestOrder(1, 100, 200, { coLocated: true }).reason, 'no-authority');
  s.delegateEnforcement(1, 100);
  // 동소 아님 → 거부.
  assert.equal(s.arrestOrder(1, 100, 200, { coLocated: false }).reason, 'not-co-located');
  // 전부 충족 → 체포.
  assert.equal(s.arrestOrder(1, 100, 200, { coLocated: true }).arrested, true);
  assert.equal(s.isDetained(200), true);
});

test('체포 매트릭스: 진영 분리 + 석방', () => {
  const s = createEspionageState();
  s.authorizeArrest(1, 200);
  assert.equal(s.isArrestListed(1, 200), true);
  assert.equal(s.isArrestListed(2, 200), false, '진영2엔 미등재');
  s.delegateEnforcement(1, 100);
  s.arrestOrder(1, 100, 200, { coLocated: true });
  assert.equal(s.release(200), true);
  assert.equal(s.isDetained(200), false);
});

test('潜入工作: 성공률=情報 vs 治安, 실패=발각', () => {
  const s = createEspionageState();
  const ok = s.infiltrate(100, 'fortA', { intel: 100, security: 0, roll: 0 });
  assert.equal(ok.success, true);
  assert.equal(ok.detected, false);
  assert.equal(s.isInfiltrated(100), true);
  // 실패 시 발각 + 미잠입.
  const bad = s.infiltrate(101, 'fortA', { intel: 0, security: 100, roll: 0.99 });
  assert.equal(bad.success, false);
  assert.equal(bad.detected, true);
  assert.equal(s.isInfiltrated(101), false);
});

test('情報工作: 잠입 필요, 실패 시 발각+잠입해제', () => {
  const s = createEspionageState();
  assert.equal(s.intelOp(100, { roll: 0 }).reason, 'not-infiltrated');
  s.infiltrate(100, 'fortA', { intel: 100, roll: 0 });
  assert.equal(s.intelOp(100, { intel: 100, security: 0, roll: 0 }).success, true);
  assert.equal(s.isInfiltrated(100), true, '성공 시 잠입 유지');
  // 실패 → 발각 + 잠입 해제.
  const f = s.intelOp(100, { intel: 0, security: 100, roll: 0.99 });
  assert.equal(f.success, false);
  assert.equal(f.detected, true);
  assert.equal(s.isInfiltrated(100), false);
});

test('破壊工作: 성공 시 planted, 실패 시 발각+해제', () => {
  const s = createEspionageState();
  s.infiltrate(100, 'fortA', { intel: 100, roll: 0 });
  const ok = s.sabotage(100, { intel: 100, security: 0, roll: 0 });
  assert.equal(ok.success, true);
  assert.equal(s.infiltrations.get(100).planted, true);
  // 새 에이전트 실패.
  s.infiltrate(101, 'fortB', { intel: 100, roll: 0 });
  const bad = s.sabotage(101, { intel: 0, security: 100, roll: 0.99 });
  assert.equal(bad.success, false);
  assert.equal(s.isInfiltrated(101), false);
});

test('脱出工作: 성공/발각 모두 spot 이탈', () => {
  const s = createEspionageState();
  assert.equal(s.escape(100, { roll: 0 }).reason, 'not-infiltrated');
  s.infiltrate(100, 'fortA', { intel: 100, roll: 0 });
  const e = s.escape(100, { intel: 100, security: 0, roll: 0 });
  assert.equal(e.success, true);
  assert.equal(s.isInfiltrated(100), false);
  // 발각 탈출도 이탈.
  s.infiltrate(101, 'fortA', { intel: 100, roll: 0 });
  const e2 = s.escape(101, { intel: 0, security: 100, roll: 0.99 });
  assert.equal(e2.success, false);
  assert.equal(e2.detected, true);
  assert.equal(s.isInfiltrated(101), false);
});

test('煽動工作: 支持率↓ (情報 비례, 0..100 클램프)', () => {
  const s = createEspionageState();
  const a = s.agitate(50, { intel: 0 });
  assert.equal(a.drop, AGITATION_BASE_DROP);
  assert.equal(a.support, 50 - AGITATION_BASE_DROP);
  // 情報 높을수록 더 떨어짐.
  assert.ok(s.agitate(50, { intel: 100 }).drop > s.agitate(50, { intel: 0 }).drop);
  // 하한 0.
  assert.equal(s.agitate(2, { intel: 100 }).support, 0);
});

test('監視: 등록/조회/해제', () => {
  const s = createEspionageState();
  assert.equal(s.surveilTarget(100), null);
  s.surveil(100, 200);
  assert.equal(s.surveilTarget(100), 200);
  assert.equal(s.unsurveil(100), true);
  assert.equal(s.surveilTarget(100), null);
});

test('襲撃: 성공률=情報 vs 표적저항, 실패=발각', () => {
  const s = createEspionageState();
  assert.equal(s.raid(100, 200, { intel: 100, targetResistance: 0, roll: 0 }).success, true);
  const bad = s.raid(100, 200, { intel: 0, targetResistance: 100, roll: 0.99 });
  assert.equal(bad.success, false);
  assert.equal(bad.detected, true);
});

// --- 감사 2026-06-20: 一斉捜索/侵入工作/帰還工作 (캐논 諜報 3종 추가) -------------------------------

test('一斉捜索 massSearch: 성공 시 located 등록(동소 판정 선행)', () => {
  const s = createEspionageState();
  assert.equal(s.isLocated(200), false);
  assert.equal(s.massSearch(200, { searcherIntel: 100, concealment: 0, roll: 0 }).found, true);
  assert.equal(s.isLocated(200), true);
  // 실패 시 미등록.
  assert.equal(s.massSearch(201, { searcherIntel: 0, concealment: 100, roll: 0.99 }).found, false);
  assert.equal(s.isLocated(201), false);
});

test('侵入工作 intrusion: 성공 시 적 body 진입 등록, 실패=발각', () => {
  const s = createEspionageState();
  assert.equal(s.intrusion(100, 'enemyFleet', { intel: 100, roll: 0 }).success, true);
  assert.equal(s.isIntruded(100), true);
  const bad = s.intrusion(101, 'enemyFleet', { intel: 0, security: 100, roll: 0.99 });
  assert.equal(bad.success, false);
  assert.equal(bad.detected, true);
  assert.equal(s.isIntruded(101), false);
});

test('帰還工作 returnOp: 잠입/침입 모두 해제(본국 송환), 미배치면 reason', () => {
  const s = createEspionageState();
  assert.equal(s.returnOp(100, { roll: 0 }).reason, 'not-deployed');
  s.infiltrate(100, 'fortA', { intel: 100, roll: 0 });
  s.intrusion(100, 'enemyFleet', { intel: 100, roll: 0 });
  const r = s.returnOp(100, { intel: 100, roll: 0 });
  assert.equal(r.success, true);
  assert.equal(s.isInfiltrated(100), false);
  assert.equal(s.isIntruded(100), false);
});
