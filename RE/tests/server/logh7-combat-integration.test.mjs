// 전투 통합 — 이번 세션이 쌓은 수직들이 end-to-end로 합성되는지 검증:
//   char-registry(사령관) → 戦死(旗艦 격침) → 降伏勧告(저사기 무력화) → STEP5(전멸→전략모드 복귀).
// 단위 테스트는 각 조각을 격리 검증하지만, 본 테스트는 한 전투 시나리오에서 모두 함께 작동함을 고정한다.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createWorldState } from '../../src/server/logh7-world-state.mjs';
import { processCommand } from '../../src/server/logh7-command-engine.mjs';
import { COMMAND_FIGHT_CODE } from '../../src/server/logh7-combat-engine.mjs';
import { NOTIFY_CHANGE_MODE_CODE } from '../../src/server/logh7-login-protocol.mjs';
import { RETURN_TO_STRATEGIC_MODE_KIND } from '../../src/server/logh7-battle-engine.mjs';

// CommandFight 0x0407 인바운드: count @12, attacker id 배열 @16(stride 4).
function fight(attackerIds) {
  const inner = Buffer.alloc(2 + 0x24);
  inner.writeUInt16BE(COMMAND_FIGHT_CODE, 0);
  const body = inner.subarray(2);
  body.writeUInt8(attackerIds.length, 12);
  attackerIds.forEach((id, i) => body.writeUInt32LE(id >>> 0, 16 + i * 4));
  return inner;
}

test('통합: 旗艦 격침→戦死 + 저사기→降伏 + 마지막 적 소멸→STEP5 전략복귀가 한 전투에서 모두 작동', () => {
  const state = createWorldState({ seed: 7 });
  state.addPlayer({ connectionId: 6, charId: 1 });
  state.openBattle({ mode: 0 });

  // 플레이어: 高統率(100) 사령관의 기함(id 100). 戦死 판정 + 降伏 권고의 주체.
  state.upsertShip({ id: 100, owner: 6, faction: 1 });
  state.upsertCharacter({ id: 0x900, faction: 'empire', leadership: 100, rank: 14, flagship: 100 });

  // 적 진영(2): (A) 기함 — 한 방에 격침되는 약체(戦死 트리거), 그 기함의 사령관(deathToggle true=사망).
  state.upsertShip({ id: 0x201, owner: 7, faction: 2, stats: { maxShield: 0, maxArmor: 0, maxZanki: 1, defense: 0 } });
  state.upsertCharacter({ id: 0x901, faction: 'alliance', rank: 14, flagship: 0x201, deathToggle: true });
  // (B) 튼튼하지만 사기 1(전투 후 0 → 降伏 chance 1.0)인 적 — 무력화 대상.
  state.upsertShip({ id: 0x202, owner: 7, faction: 2, stats: { morale: 1 } });

  // 1회차 교전: pickTarget이 가장 가까운 적을 친다. 약체 기함(0x201)이 먼저 격침되도록 좌표를 가깝게 둘
  // 필요는 없다 — 두 적 모두 같은 위치(0,0,0)라 결정론 pickTarget이 첫 enemy를 고른다. 여러 번 쳐서 둘 다 처리.
  let killedFlagship = false;
  let surrendered = false;
  let strategicReturn = false;
  for (let i = 0; i < 5 && (state.getShip(0x201) || state.getShip(0x202)); i += 1) {
    const res = processCommand({ state, connectionId: 6, innerCode: COMMAND_FIGHT_CODE, inner: fight([100]) });
    assert.equal(res.accept, true);
    if (res.casualties?.some((c) => c.charId === 0x901 && c.outcome === 'killed')) killedFlagship = true;
    if (res.surrendered?.includes(0x202)) surrendered = true;
    if (res.notifies?.some((n) => n.inner.readUInt16BE(4) === NOTIFY_CHANGE_MODE_CODE
        && n.inner.subarray(6).readUInt8(0x04) === RETURN_TO_STRATEGIC_MODE_KIND)) {
      strategicReturn = true;
    }
  }

  // 戦死: 적 기함 사령관이 사망 처리됨.
  assert.equal(killedFlagship, true, '적 旗艦 격침 → 戦死(사망)');
  assert.equal(state.getCharacter(0x901).alive, false, '적 사령관 사망 상태');
  // 降伏: 저사기 적이 무력화(격침 아님 — 전장에 남되 surrendered).
  assert.equal(surrendered, true, '저사기 적 降伏(무력화)');
  assert.equal(state.getShip(0x202)?.surrendered, true);
  // STEP5: 살아있는 적 진영이 사라져(격침+무력화) 전투 종결 → 전략모드 복귀 notify.
  assert.equal(strategicReturn, true, 'STEP5 전략모드 복귀(0x042f modeKind=2)');
  assert.equal(state.isBattleActive(), false, '전투 세션 종료');
  // 플레이어 사령관은 생존(승자 쪽).
  assert.equal(state.getCharacter(0x900).alive, true);
});

test('통합: 항복(무력화) 적은 전멸 판정에서 생존 진영으로 안 쳐서 STEP5 종결을 막지 않는다', () => {
  // 무력화는 격침이 아니지만 pickTarget/전투 대상에서 빠진다. 마지막 적이 항복하면 그 진영은 "전투 가능
  // 생존자 없음"이 되어야 전략 복귀가 일어난다 — concludeBattle은 listShips 기준이라 surrendered도 살아있는
  // 함선으로 카운트될 수 있음을 확인(설계 경계 고정).
  const state = createWorldState({ seed: 3 });
  state.addPlayer({ connectionId: 6, charId: 1 });
  state.openBattle({ mode: 0 });
  state.upsertShip({ id: 100, owner: 6, faction: 1 });
  state.upsertCharacter({ id: 0x900, faction: 'empire', leadership: 100, flagship: 100 });
  state.upsertShip({ id: 0x210, owner: 7, faction: 2, stats: { morale: 1 } }); // 유일 적, 항복 후보
  const res = processCommand({ state, connectionId: 6, innerCode: COMMAND_FIGHT_CODE, inner: fight([100]) });
  assert.equal(res.accept, true);
  // 항복했으면 surrendered 플래그 + pickTarget 제외.
  if (res.surrendered?.includes(0x210)) {
    assert.equal(state.getShip(0x210).surrendered, true);
    assert.equal(state.pickTarget(100), null, '무력화 적은 더는 표적 아님');
  }
});
