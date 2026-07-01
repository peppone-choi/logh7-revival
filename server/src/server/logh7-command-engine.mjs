/**
 * Authoritative in-world command engine — the "승인 / 거부 → 상태 갱신 → Notify 브로드캐스트" core.
 *
 * The relay (logh7-world-relay) blindly rebroadcasts a client's command frame to the others. This
 * engine replaces that with authority: an inbound Command* is parsed, validated against the
 * authoritative world state, applied to that state, and turned into the canonical Notify* the
 * other clients render. The server — not the client — decides whether an action is legal and what
 * its effect is.
 *
 * processCommand returns a decision: { accept, reject?, notifies: [{ inner, target }] } where
 *   target = 'others' (everyone except the actor) | 'all' (including the actor).
 * The caller (auth-server) frames each notify inner and broadcasts per target.
 *
 * Implemented authoritatively now: chat (0x0f1c / 0x0f1d). Movement codes (0x0400 CommandMoveShip,
 * 0x0402, 0xb01 CommandMoveGrid) are validated-then-relayed for now (their 1052-byte wire parse,
 * FUN_004be8f0, is not fully reversed yet); applyShipMove/applyShipTurn provide the authoritative
 * path the move handler will switch to once that parse lands. Everything here is pure + synchronous
 * so it is fully unit-testable without a live client.
 */
import {
  COMMAND_GRID_CHAT_CODE,
  buildCommandGridChatInner,
  buildNotifyMovedGridInner,
  wrapRawInnerAsMessage32,
  buildNotifyMovedShipInner,
  buildNotifyTurnedShipInner,
  buildNotifyAttackedShipInner,
  buildNotifyChangeModeInner,
  buildNotifyMoraleDownInner,
  buildNotifyMovedTroopInner,
  buildNotifyLandCombatInner,
  buildNotifySortieInner,
} from './logh7-login-protocol.mjs';
import {
  COMMAND_WARP_SHIP_CODE,
  COMMAND_ATTACK_SHIP_CODE,
  COMMAND_SHOOT_SHIP_CODE,
  COMMAND_FIGHT_CODE,
  COMMAND_CHANGE_MODE_CODE,
  COMMAND_SORTIE_TROOPS_CODE,
  COMMAND_ATTACK_TROOP_CODE,
  parseInboundAttack,
  parseInboundChangeMode,
  parseInboundSortie,
  computeDamage,
  resolveLandCombat,
} from './logh7-combat-engine.mjs';
// --- internal affairs (内政) domain processors (self-contained modules, each with its own state) ---
import { createPersonnelState, processPersonnel } from './logh7-personnel.mjs';
import { createStrategyState, processStrategy } from './logh7-strategy.mjs';
import { createLogisticsState, processLogistics, LOGISTICS_COMMAND_CODES } from './logh7-logistics.mjs';
import { createSocialState, processSocial, isSocialCommandCode } from './logh7-social.mjs';
import { createBattleOpsState, processBattleOps } from './logh7-battle-ops.mjs';
import { canCommand } from './logh7-morale.mjs';
import { createCommandTargetPool, ensureCommandExecutionTargets } from './logh7-command-targets.mjs';
import { createAccountState, processAccount, isAccountCommandCode } from './logh7-account.mjs';
import { openBattleField, concludeBattle, resolveBattleSurrenders } from './logh7-battle-engine.mjs';

// LOGH_COMBAT_LEADERSHIP=1: 사격(0x405/0x406 ShootShip/AttackShip)·교전(0x0407 CommandFight) 피해 계산에
// 양측 기함 사령관의 統率(leadership)을 주입한다(computeDamage 4번째 opts). 기본 off → 기존 전투 밸런스 완전
// 불변(테스트 보존). ★統率의 캐논 효과는 士気·降伏이지 피해가 아님(이건 P3 설계 확장) — 상세는 logh7-
// combat-engine.computeDamage 주석. 자율(NPC) 사격도 logh7-npc-ai가 같은 플래그로 대칭 적용한다.
const combatLeadershipEnabled = () => process.env.LOGH_COMBAT_LEADERSHIP === '1';
const commandModifierOpts = (state, attackerId, targetId) => {
  if (!combatLeadershipEnabled() || typeof state.getCharacterByFlagship !== 'function') {
    return undefined; // 미주입 → computeDamage가 기존과 동일하게 동작
  }
  const attackerCmdr = state.getCharacterByFlagship(attackerId);
  const targetCmdr = state.getCharacterByFlagship(targetId);
  return {
    attackerCommand: attackerCmdr?.leadership ?? 0,
    targetCommand: targetCmdr?.leadership ?? 0,
  };
};

const PERSONNEL_CODE_LO = 0x0704;
// 0x0709까지가 진급/카드 C->S, 0x070a/0x070b는 S->C Notify(인바운드로 오면 unknown 거부), 0x070c..0x070e는
// 작위(叙爵)/봉토(封土授与·封土直轄) GRANT C->S [P3 opcode]. 셋 다 processPersonnel로 라우팅한다.
const PERSONNEL_CODE_HI = 0x070e;
const STRATEGY_CODE_LO = 0x0900;
const STRATEGY_CODE_HI = 0x0906;
// LOGISTICS_COMMAND_CODES is exported as an array; normalize to a Set for O(1) membership.
const LOGISTICS_CODE_SET = new Set(LOGISTICS_COMMAND_CODES);
// Battle-ops C->S codes (maneuver siblings + fleet/base ops) routed to processBattleOps.
const BATTLE_OPS_CODE_SET = new Set([
  0x0401, 0x0403, 0x040a, // TurnShip / ReverseShip / Stop
  0x0408, 0x0409, 0x040b, 0x040c, 0x040d, 0x040e, 0x0413, 0x0414, 0x0419, 0x041f, 0x0420, 0x0421, 0x0422, // fleet ops
  0x041a, 0x041b, 0x041c, 0x041d, 0x041e, // base ops
]);

/**
 * Route an inbound 内政 (internal-affairs) command to its domain processor. Each domain keeps its OWN
 * in-memory state, lazily created and cached on the world-state object (so it persists across calls
 * without coupling createWorldState to every domain). Returns the domain decision, or null if `innerCode`
 * is not an internal-affairs command (so processCommand falls through to its combat/chat/move handlers).
 */
function routeInternalAffairs({ state, player, connectionId, innerCode, inner }) {
  if (innerCode >= PERSONNEL_CODE_LO && innerCode <= PERSONNEL_CODE_HI) {
    state._personnel ??= createPersonnelState();
    // intelState(첩보/쿠데타 공유 인스턴스)를 ctx에 노출 → 0x0356 빌더가 coup_conduct 표시필드를 isCoupConduct로
    // 시드한다(AU-3, opcode-wiring B-2). state=worldState라 getIntelState로 닿는다(미노출 환경은 undefined→0 불변).
    return processPersonnel({
      state: state._personnel, connectionId, innerCode, inner,
      intelState: state.getIntelState?.() ?? null,
    });
  }
  if (innerCode >= STRATEGY_CODE_LO && innerCode <= STRATEGY_CODE_HI) {
    state._commandTargets ??= createCommandTargetPool();
    ensureCommandExecutionTargets(state._commandTargets, {
      characterId: player.charId,
      unitId: player.charId,
      power: player.powerId ?? 0,
    }, 'strategy-route');
    state._strategy ??= createStrategyState({ targetPool: state._commandTargets });
    return processStrategy({ state: state._strategy, connectionId, innerCode, inner, power: player.powerId ?? 0 });
  }
  if (LOGISTICS_CODE_SET.has(innerCode)) {
    state._logistics ??= createLogisticsState();
    return processLogistics({ state: state._logistics, connectionId, innerCode, inner });
  }
  if (isSocialCommandCode(innerCode)) {
    state._social ??= createSocialState();
    state._social.join?.(connectionId, player.charId);
    return processSocial({ state: state._social, connectionId, innerCode, inner });
  }
  if (BATTLE_OPS_CODE_SET.has(innerCode)) {
    state._battleOps ??= createBattleOpsState();
    return processBattleOps({ state: state._battleOps, connectionId, innerCode, inner });
  }
  if (isAccountCommandCode(innerCode)) {
    state._account ??= createAccountState();
    state._account.join?.(connectionId, { accountId: player.charId });
    return processAccount({ state: state._account, connectionId, innerCode, inner });
  }
  return null;
}

/**
 * 월드진입 시 worldState 캐릭터를 personnelState에 시드한다. 작위/봉토/진급 인사 커맨드(0x0704..0x070e)는
 * personnelState의 로스터를 기준으로 검증·처리하므로, 플레이어가 월드에 들어올 때 해당 캐릭터를 인사
 * 로스터에 등록해야 한다. title/socialClass/fiefs는 worldState.upsertCharacter에서 보관 중이며,
 * 이 함수가 personnelState.addCharacter()로 전달한다. worldState에 없으면 no-op(안전).
 *
 * @param {{ state: ReturnType<import('./logh7-world-state.mjs').createWorldState> }} args
 * @returns {boolean} 시드 여부
 */
export function seedPersonnelFromWorldState({ state }) {
  if (!state || typeof state.listPlayers !== 'function') return false;
  let seeded = false;
  for (const player of state.listPlayers()) {
    const ch = state.getCharacter?.(player.charId);
    if (!ch) continue;
    state._personnel ??= createPersonnelState();
    state._personnel.addCharacter({
      id: ch.id,
      rank: ch.rank ?? 0,
      spot: 0,
      owner: player.connectionId ?? 0,
      achievement: ch.achievement ?? 0,
      title: ch.title ?? null,
      faction: ch.faction ?? null,
      socialClass: ch.socialClass ?? null,
      fiefs: ch.fiefs ?? [],
    });
    seeded = true;
  }
  return seeded;
}

export const COMMAND_SPOT_CHAT_CODE = 0x0f1d;
export const COMMAND_MOVE_SHIP_CODE = 0x0400;
export const COMMAND_PARALLEL_MOVE_SHIP_CODE = 0x0402;
export const COMMAND_MOVE_GRID_CODE = 0x0b01;

export const MAX_CHAT_TEXT = 65; // FUN_004b5600 caps the wide-char message at 0x41
export const MAX_MOVE_UNITS = 32; // Input_CommandMoveShip errors if unit/to_position size "over than 32"

// Trailing move params live at fixed body offsets (independent of unitCount, since the 1052B body is
// fixed-size with zero padding). Decoded from FUN_004be8f0/FUN_004bf4c0 — see docs/logh7-moveship-wire.md.
const MOVE_SPEED_OFF = 0x290; // f32 move speed scalar (param_2[0xa4])
const MOVE_ARRIVAL_HEADING_OFF = 0x294; // f32 final facing on arrival (param_2[0xa5])
const MOVE_FORMATION_COUNT_OFF = 0x298; // u8 formation member count - 1 (param_2[0xa6])
const MOVE_FORMATION_OFFSETS_OFF = 0x29c; // f32[3] table, stride 12 (param_2+0xa7)
const MOVE_UNIT_STRIDE = 20; // 5 dwords per unit entry @16

const finiteOr = (value, fallback = 0) => (Number.isFinite(value) ? value : fallback);

/**
 * Fully parse an inbound CommandMoveShip (0x0400) / CommandParallelMoveShip (0x0402) — FUN_004be8f0 /
 * FUN_004bf320, byte-identical except the move-kind tag. The raw inner is [u16 BE code][body]; the
 * 1052-byte body (little-endian) is: unit count = byte @12, then a unit-entry array @16 (stride 20B /
 * 5 dwords): [u32 shipId][f32 heading][f32 targetX][f32 targetZ][f32 targetY]. Trailing fixed fields:
 * f32 speed @0x290, f32 arrivalHeading @0x294, u8 formationCount @0x298, f32[3] formationOffsets
 * @0x29c. Coordinates are continuous world floats on the XZ plane (same space as NotifyMovedShip
 * 0x0423) — no grid quantization. Returns null if too short. `unitIds` is kept for back-compat.
 * Evidence: docs/logh7-moveship-wire.md (FUN_004c8110 per-unit field map, FUN_004bf4c0 commit).
 */
export function parseInboundMoveShip(inner) {
  const body = inner.subarray(2);
  if (body.length < 16) {
    return null;
  }
  const count = body.readUInt8(12);
  const unitIds = [];
  const units = [];
  for (let i = 0; i < count; i += 1) {
    const off = 16 + i * MOVE_UNIT_STRIDE;
    if (off + 4 > body.length) {
      break;
    }
    const shipId = body.readUInt32LE(off);
    unitIds.push(shipId);
    // Target floats only present when the full 20-byte entry fits (real 1052B body); for a truncated
    // test/probe body that carries ids only, default the pose to the origin so the command still parses.
    const hasPose = off + MOVE_UNIT_STRIDE <= body.length;
    units.push({
      shipId,
      heading: hasPose ? finiteOr(body.readFloatLE(off + 4)) : 0,
      x: hasPose ? finiteOr(body.readFloatLE(off + 8)) : 0,
      z: hasPose ? finiteOr(body.readFloatLE(off + 12)) : 0,
      y: hasPose ? finiteOr(body.readFloatLE(off + 16)) : 0,
    });
  }
  const hasTrailer = body.length >= MOVE_FORMATION_OFFSETS_OFF;
  const speed = hasTrailer ? finiteOr(body.readFloatLE(MOVE_SPEED_OFF)) : 0;
  const arrivalHeading = hasTrailer ? finiteOr(body.readFloatLE(MOVE_ARRIVAL_HEADING_OFF)) : 0;
  const formationCount = hasTrailer ? body.readUInt8(MOVE_FORMATION_COUNT_OFF) : 0;
  const formationOffsets = [];
  for (let i = 0; i < formationCount; i += 1) {
    const off = MOVE_FORMATION_OFFSETS_OFF + i * 12;
    if (off + 12 > body.length) {
      break;
    }
    formationOffsets.push({
      dx: finiteOr(body.readFloatLE(off)),
      dz: finiteOr(body.readFloatLE(off + 8)),
    });
  }
  return { count, unitIds, units, speed, arrivalHeading, formation: { count: formationCount, offsets: formationOffsets } };
}

/**
 * Parse an inbound CommandMoveGrid (0x0b01, 36B / 9 dwords). The raw inner is [u16 BE code][body];
 * the body is 3 header dwords then [u32 unitId @0x0c][u32 destCell @0x10] (inferred — the send-side
 * builder is unsymbolized; the consumer FUN_004bea90 is an empty stub). Returns null if too short.
 * Evidence: docs/logh7-strategic-input-wire.md §2.
 */
// Live 2026-06-30 SendWarp captures can be shorter and diagnostic-only; do
// not read their coordinate/object bytes as authoritative fleet ids.
function u16BeWords(body) {
  const words = [];
  const evenLength = body.length - (body.length % 2);
  for (let offset = 0; offset < evenLength; offset += 2) {
    const value = body.readUInt16BE(offset);
    if (value !== 0) {
      words.push({ offset, value, valueHex: `0x${value.toString(16).padStart(4, '0')}` });
    }
  }
  return words;
}

export function parseInboundMoveGrid(inner) {
  const body = inner.subarray(2);
  if (body.length >= 0x24) {
    return {
      format: 'legacy-grid-dwords',
      unitId: body.readUInt32LE(0x0c),
      destCell: body.readUInt32LE(0x10),
      bodyLength: body.length,
    };
  }
  if (body.length === 0x1f) {
    const screenCoord0 = { x: body.readUInt16BE(0x00), y: body.readUInt16BE(0x02) };
    const screenCoord1 = { x: body.readUInt16BE(0x04), y: body.readUInt16BE(0x06) };
    const commandCoord = { x: body.readUInt16BE(0x0e), y: body.readUInt16BE(0x10) };
    const routeCellCandidate = body.readUInt16BE(0x16);
    const routeTailWord = body.readUInt16BE(0x18);
    return {
      format: 'sendwarp-live-v1',
      unitId: null,
      destCell: null,
      unresolved: true,
      bodyLength: body.length,
      fields: {
        coord0: screenCoord0,
        coord1: screenCoord1,
        actorOrSequence: body.readUInt32BE(0x08),
        commandCoord,
        routeCellCandidate,
        routeCellCandidateHex: `0x${routeCellCandidate.toString(16).padStart(4, '0')}`,
        routeTailWord,
        routeTailWordHex: `0x${routeTailWord.toString(16).padStart(4, '0')}`,
        terminalByte: body.readUInt8(0x1e),
        nonzeroWordsBe: u16BeWords(body),
        rawHex: body.toString('hex'),
        evidence:
          'P3 diagnostic: live 2026-06-30 SendWarp path; candidates are exposed for comparison, not promoted to authoritative fleet/dest ids',
      },
    };
  }
  return null;
}

/**
 * Parse an inbound CommandGridChat/CommandSpotChat inner (client SEND form, G193): the raw inner is
 * [u16 BE code][u32 0][u32 LE time][u8 castType][u8 msgLen][LE wide chars]. Returns the decoded message.
 * Body fields are little-endian: the client (FUN_004be6f0 raw-LE dword memcpy) serializes time and the
 * 16-bit chars LE, and the server's own receive-form builder buildCommandGridChatInner writes LE — the
 * SpotChat sibling (logh7-social.mjs parseInboundSpotChat) also reads LE. A prior BE read here byte-swapped
 * every wide char, so Korean (cp949-typed → UTF-16LE wire) chat came through as mojibake (audit 2026-06-28).
 */
export function parseInboundChat(inner) {
  // inner[0..1] = code (BE transport header), body starts at +2; body multibyte fields are LE.
  const body = inner.subarray(2);
  if (body.length < 10) {
    return null;
  }
  const time = body.readUInt32LE(4);
  const castType = body.readUInt8(8);
  const msgLen = body.readUInt8(9);
  const available = Math.max(0, Math.floor((body.length - 10) / 2));
  const count = Math.min(msgLen, available, MAX_CHAT_TEXT);
  let text = '';
  for (let i = 0; i < count; i += 1) {
    text += String.fromCharCode(body.readUInt16LE(10 + i * 2));
  }
  return { time, castType, msgLen, text };
}

/** Authoritative ship move: mutate state and produce a NotifyMovedShip inner. Null if no such ship. */
export function applyShipMove(state, { shipId, x = 0, y = 0, z = 0, moveParam = 0, stateByte = 0xff }) {
  const ship = state.moveShip(shipId, { x, y, z, moveParam, state: stateByte < 0 ? undefined : stateByte });
  if (!ship) {
    return null;
  }
  return buildNotifyMovedShipInner({ shipId, x, y, z, moveParam, stateByte });
}

/** Authoritative ship turn: mutate state and produce a NotifyTurnedShip inner. Null if no such ship. */
export function applyShipTurn(state, { shipId, heading = 0, field0 = 0, field2 = 0 }) {
  const ship = state.turnShip(shipId, { heading, field0, field2 });
  if (!ship) {
    return null;
  }
  return buildNotifyTurnedShipInner({ shipId, field0, field2 });
}

/**
 * 전투 한 교전(exchange) 해소 직후 전투 종결을 판정하고, 끝났으면 전략모드 복귀 notify를 만든다.
 *
 * 전투가 진행 중일 때만 동작한다(state.isBattleActive()). 현재 그리드에 남은 함선(state.listShips() —
 * 격침 함선은 removeShip으로 이미 빠져 생존자만 남음)에 이번 교전의 격침 id를 더해 concludeBattle로 정산.
 * 한쪽 전멸/공멸이면 state.closeBattle()로 전투 세션을 닫고 0x042f(modeKind=2) 복귀 notify를 반환한다.
 * 아직 두 진영 이상 생존이면 빈 배열(전투 계속). command-engine은 자기 소유가 아니므로 battle-engine의
 * 순수 함수 concludeBattle만 import해 호출한다(계약 준수).
 *
 * @returns {{ inner: Buffer, target: 'all'|'others' }[]} 추가로 브로드캐스트할 종결 notify(없으면 []).
 */
function resolveBattleConclusion(state, { destroyedIds = [], surrenderedIds = [], anchorId = 0 } = {}) {
  if (typeof state.isBattleActive === 'function' && !state.isBattleActive()) {
    return [];
  }
  // 격침도 항복(이탈)도 없으면 전세 변화가 없으므로 정산을 건너뛴다(불필요한 종결 판정 방지). 항복도 적
  // 전투력 제거이므로 마지막 적이 항복하면 종결될 수 있다 → surrenderedIds도 트리거에 포함(3.4↔STEP5 연동).
  if (destroyedIds.length === 0 && surrenderedIds.length === 0) {
    return [];
  }
  const ships = typeof state.listShips === 'function' ? state.listShips() : [];
  const result = concludeBattle({ ships, destroyedIds, anchorId, target: 'all' });
  if (!result.over) {
    return [];
  }
  state.closeBattle?.();
  // notify 객체({inner,code,target})를 command-engine의 {inner,target} 형태로 정규화.
  return result.notifies.map((n) => ({ inner: n.inner, target: n.target ?? 'all' }));
}

// 戦死(旗艦 격침 시 負傷/사망)는 world-state.resolveFlagshipLoss(shipId)로 통합됨 — command-engine(플레이어)
// ·npc-ai(자율 전투) 양쪽이 같은 경로를 쓴다(戦死 일관 적용). 旗艦 아니면 null.
const resolveFlagshipLoss = (state, shipId) => (
  typeof state.resolveFlagshipLoss === 'function' ? state.resolveFlagshipLoss(shipId) : null
);

/**
 * 降伏勧告(3.4): 한 교전 후 살아남은 저사기 적에게, 공격측 기함 사령관의 統率로 항복을 권고한다(서버
 * 내부판정 — 클라 항복 opcode 부재). recommenderShipId가 旗艦이면 그 사령관 統率을 쓰고, 아니면 권고 안 함.
 * 수락된 적은 markSurrendered(비폭력 무력화: surrendered+사기0, pickTarget/NPC가 제외). roll은 권위적
 * state.rng(seed 시 결정론). 와이어/브로드캐스트 신설 없음(무력화는 표적에서 빠지는 것으로 관측).
 * @returns {number[]} 항복 수락된 함선 id 목록
 */
function recommendSurrender(state, recommenderShipId, survivingTargets) {
  if (typeof state.getCharacterByFlagship !== 'function' || !survivingTargets?.length) return [];
  const cmdr = state.getCharacterByFlagship(recommenderShipId); // 공격측 기함 사령관(統率)
  if (!cmdr) return [];
  const roll = typeof state.rng === 'function' ? () => state.rng() : undefined;
  const { surrenders } = resolveBattleSurrenders({ leadership: cmdr.leadership }, survivingTargets, { roll });
  const accepted = [];
  for (const s of surrenders) {
    if (state.markSurrendered(s.id)) accepted.push(s.id);
  }
  return accepted;
}

function devGridMoveFallbackCell() {
  const raw = process.env.LOGH_DEV_GRID_MOVE_FALLBACK_CELL;
  if (raw == null || raw === '') return null;
  const cell = Number(raw);
  if (!Number.isInteger(cell) || cell < 0 || cell >= 5000) return null;
  return cell;
}

function devGridMoveRouteCellCandidate(move) {
  const cell = Number(move?.fields?.routeCellCandidate);
  if (!Number.isInteger(cell) || cell < 0 || cell >= 5000) return null;
  return cell;
}

function ownerByteForPlayer(player = {}) {
  const power = Number(player.powerId);
  if (Number.isInteger(power) && power > 0) return power & 0xff;
  return 0;
}

function selectDevFallbackFleet(state, player) {
  if (typeof state.listFleets !== 'function') return null;
  const fleets = state.listFleets();
  if (!fleets.length) return null;
  const ownerByte = ownerByteForPlayer(player);
  return (
    fleets.find((fleet) => fleet.id === player.charId)
    ?? fleets.find((fleet) => fleet.commander === player.charId)
    ?? fleets.find((fleet) => fleet.owner === player.connectionId)
    ?? (ownerByte > 0 ? fleets.find((fleet) => fleet.owner === ownerByte) : null)
    ?? fleets[0]
  );
}

/**
 * Process an inbound in-world command from `connectionId`.
 * @param {{ state: ReturnType<import('./logh7-world-state.mjs').createWorldState>, connectionId: number, innerCode: number, inner: Buffer }} args
 * @returns {{ accept: boolean, reject?: string, notifies: { inner: Buffer, target: 'self'|'others'|'all' }[] }}
 */
function processCommandCore({ state, connectionId, innerCode, inner }) {
  const player = state.getPlayer(connectionId);
  if (!player) {
    return { accept: false, reject: 'not-in-world', notifies: [] };
  }

  // GridChat(0x0f1c)만 여기서 처리한다. SpotChat(0x0f1d)은 레이아웃이 달라(castType 없음→msgLen@8)
  // social.processSocial의 전용 파서/빌더로 흘려보내야 한다(아래 routeInternalAffairs 경로). 예전엔 둘을
  // 같이 잡아 SpotChat을 GridChat 레이아웃으로 한 바이트 어긋나게 파싱하고 0x0f1c로 되돌려보내던 버그.
  if (innerCode === COMMAND_GRID_CHAT_CODE) {
    const parsed = parseInboundChat(inner);
    const debug = parsed ? { text: parsed.text, msgLen: parsed.msgLen, bodyHex: inner.subarray(2).toString('hex') } : null;
    if (!parsed || parsed.text.length === 0) {
      return { accept: false, reject: 'empty-chat', notifies: [], debug };
    }
    if (parsed.msgLen > MAX_CHAT_TEXT) {
      return { accept: false, reject: 'chat-too-long', notifies: [], debug };
    }

    // Brute-force fallback: a typed `/grid <cell>` moves the player's fleet via the already-proven
    // server-authoritative 0x0b07 NotifyMovedGrid path, bypassing the client's broken click→0x0b01 FSM.
    const gridMatch = parsed.text.match(/^\/grid\s+(\d+)$/i);
    if (gridMatch) {
      const destCell = Number(gridMatch[1]);
      // Pick the fleet that matches the player's char id, else the only/first fleet in the world.
      const fleets = state.listFleets();
      const fleet = fleets.find((f) => f.id === player.charId) ?? fleets[0] ?? null;
      if (!fleet) {
        return { accept: false, reject: 'no-fleet', notifies: [], debug };
      }
state.moveFleet(fleet.id, destCell);
state.recordCommand?.({
connectionId,
innerCode,
accept: true,
units: [fleet.id],
effect: 'grid-chat-fleet-move',
debug: { destCell, source: 'chat-fallback' },
});
const notify = buildNotifyMovedGridInner({ units: [{ unitId: fleet.id, cell: destCell }] });
return { accept: true, units: [fleet.id], notifies: [{ inner: notify, target: 'all' }], debug };
    }

    state.appendChat({
      connectionId,
      charId: player.charId,
      text: parsed.text,
      channel: parsed.castType,
      time: parsed.time,
    });
    // Build the canonical receive-form chat the other clients render (sanitized, server-attributed).
    const notify = buildCommandGridChatInner({
      text: parsed.text,
      channel: parsed.castType,
      time: parsed.time,
      castType: parsed.castType,
    });
    return { accept: true, notifies: [{ inner: notify, target: 'others' }], debug };
  }

  if (innerCode === COMMAND_MOVE_SHIP_CODE || innerCode === COMMAND_PARALLEL_MOVE_SHIP_CODE) {
    // Full authoritative move (FUN_004be8f0 fully reversed — docs/logh7-moveship-wire.md): parse the
    // per-unit target poses, validate against the client's own bound (1..32 units), enforce ownership,
    // apply to authoritative world state, and emit the canonical NotifyMovedShip 0x0423 (+ 0x0424 when
    // facing changes) the OTHER clients render. The server — not the relayed raw command — decides each
    // ship's final position, so positions stay consistent and a forged command can't move a foreign ship.
    const move = parseInboundMoveShip(inner);
    if (!move || move.count === 0 || move.count > MAX_MOVE_UNITS) {
      return { accept: false, reject: 'invalid-move', notifies: [] };
    }
    // Anti-cheat ownership: you may only command ships you own. A ship the server does not know about
    // is allowed (ownership not seeded for it); a known ship owned by someone else is rejected. owner
    // 0 = neutral/unassigned (allowed).
    for (const unitId of move.unitIds) {
      const ship = state.getShip(unitId);
      if (ship && ship.owner !== 0 && ship.owner !== connectionId) {
        return { accept: false, reject: 'not-owner', notifies: [] };
      }
      // 캐논(p442): 저사기/混乱 유닛은 지휘불가. 알려진 함선이 지휘불가면 명령 거부(미시드 함선은 통과).
      if (ship && !canCommand(ship)) {
        return { accept: false, reject: 'low-morale-uncommandable', notifies: [] };
      }
    }
    // Build authoritative notifies from the parsed targets. The coordinate space is identical to
    // 0x0423 (continuous world floats, XZ plane) so the parsed (x,y,z) feed the notify directly.
    const notifies = [];
    for (const unit of move.units) {
      // Apply to state when the ship is known; otherwise still propagate the move (in-world ships are
      // not always pre-seeded). moveParam carries the speed scalar so clients interpolate correctly.
      const moveParam = Math.max(0, Math.round(move.speed)) & 0xffffffff;
      const moved =
        applyShipMove(state, { shipId: unit.shipId, x: unit.x, y: unit.y, z: unit.z, moveParam }) ??
        buildNotifyMovedShipInner({ shipId: unit.shipId, x: unit.x, y: unit.y, z: unit.z, moveParam });
      notifies.push({ inner: moved, target: 'others' });
      // Emit a turn only when the command carries a non-zero heading change.
      if (Number.isFinite(unit.heading) && unit.heading !== 0) {
        const turned =
          applyShipTurn(state, { shipId: unit.shipId, heading: unit.heading }) ??
          buildNotifyTurnedShipInner({ shipId: unit.shipId });
        notifies.push({ inner: turned, target: 'others' });
      }
    }
    return { accept: true, units: move.unitIds, notifies };
  }

  if (innerCode === COMMAND_MOVE_GRID_CODE) {
    // Strategic fleet move (0x0b01, 36B/9 dwords): the player orders a fleet to a destination cell.
    // Authoritative path (docs/logh7-strategic-input-wire.md): parse [hdr 3 dwords][u32 unitId @0x0c]
    // [u32 destCell @0x10], enforce ownership, then send the two packets the real SelectGrid FSM waits
    // on: a byte-faithful 0x0b01 ACK to the mover (event 0x17), and the canonical NotifyMovedGrid
    // 0x0b07 to ALL in-world clients (event 0x16; visible relocation is still live-RE gated).
    // FUN_004bea90 itself is an
    // empty stub, but the ACK still releases the dialog state machine.
    const move = parseInboundMoveGrid(inner);
    if (!move) {
      return { accept: false, reject: 'invalid-grid-move', notifies: [] };
    }
    const ship = Number.isInteger(move.unitId) ? state.getShip(move.unitId) : null;
    if (ship && ship.owner !== 0 && ship.owner !== connectionId) {
      return { accept: false, reject: 'not-owner', notifies: [] };
    }
    let unitId = move.unitId;
    let destCell = move.destCell;
    let fleet = Number.isInteger(unitId) && typeof state.getFleet === 'function' ? state.getFleet(unitId) : null;
    let fallback = null;
    const configuredFallbackCell = fleet ? null : devGridMoveFallbackCell();
    const routeCandidateCell = configuredFallbackCell !== null ? devGridMoveRouteCellCandidate(move) : null;
    const fallbackCell = routeCandidateCell ?? configuredFallbackCell;
    if (!fleet && fallbackCell !== null) {
      const fallbackFleet = selectDevFallbackFleet(state, player);
      if (fallbackFleet) {
        fallback = {
          source: routeCandidateCell !== null
            ? 'LOGH_DEV_GRID_MOVE_FALLBACK_CELL:routeCellCandidate'
            : 'LOGH_DEV_GRID_MOVE_FALLBACK_CELL',
          configuredFallbackCell,
          originalUnitId: move.unitId,
          originalDestCell: move.destCell,
          ...(move.format ? { parsed: move } : {}),
        };
        fleet = fallbackFleet;
        unitId = fallbackFleet.id;
        destCell = fallbackCell;
      }
    }
    if (!fleet && move.unresolved) {
      return {
        accept: false,
        reject: 'unresolved-grid-move-target',
        notifies: [],
        debug: { parsed: move },
      };
    }
    const debug = {
      unitId,
      unitIdHex: `0x${(unitId >>> 0).toString(16).padStart(8, '0')}`,
      destCell,
      destCellHex: `0x${(destCell >>> 0).toString(16).padStart(8, '0')}`,
      hadFleet: Boolean(fleet),
      ...(move.format ? { parsed: move } : {}),
      ...(fallback ? { fallback } : {}),
    };
    if (fleet && typeof state.moveFleet === 'function') {
      state.moveFleet(unitId, destCell);
    }
    state.recordCommand?.({
      connectionId,
      innerCode,
      accept: true,
      units: [unitId],
      effect: 'fleet-grid-move',
      debug,
    });
    const ack = wrapRawInnerAsMessage32(inner);
    const notify = buildNotifyMovedGridInner({ units: [{ unitId, cell: destCell }] });
    return {
      accept: true,
      units: [unitId],
      notifies: [
        { inner: ack, target: 'self' },
        { inner: notify, target: 'all' },
      ],
      debug,
    };
  }

  if (innerCode === COMMAND_ATTACK_SHIP_CODE || innerCode === COMMAND_SHOOT_SHIP_CODE) {
    // SPACE WAR — authoritative fire resolution. The client SENDS its selected attacker ships
    // (CommandShootShip 0x406 = beam volley, CommandAttackShip 0x405 = sustained) and only renders
    // damage when the server broadcasts NotifyAttackedShip 0x426. So the server: validates ownership,
    // picks each attacker's target (nearest enemy-faction living ship), computes authoritative damage
    // (logh7-combat-engine.computeDamage), mutates the target, and broadcasts the canonical 0x0426 to
    // ALL in-world clients (incl. the attacker, who must see the hit). Destroyed ships are logged +
    // removed. A forged command can only fire ships the connection owns.
    const parsed = parseInboundAttack(inner);
    if (!parsed || parsed.count === 0) {
      return { accept: false, reject: 'invalid-attack', notifies: [] };
    }
    const kind = innerCode === COMMAND_SHOOT_SHIP_CODE ? 'shoot' : 'attack';
    const notifies = [];
    const hits = [];
    const casualties = []; // 격침된 旗艦의 戦死 결과(負傷워프/사망) 누적(3.2)
    for (const attackerId of parsed.attackerIds) {
      const attacker = state.getShip(attackerId);
      // Ownership: you may only fire ships you own (owner 0 = neutral/unseeded, allowed for tests).
      if (attacker && attacker.owner !== 0 && attacker.owner !== connectionId) {
        return { accept: false, reject: 'not-owner', notifies: [] };
      }
      // 캐논(p442): 저사기/混乱 함선은 사격 명령 불가.
      if (attacker && !canCommand(attacker)) {
        return { accept: false, reject: 'low-morale-uncommandable', notifies: [] };
      }
      // Explicit target if the command carried one and it is a valid living enemy; else auto-pick.
      let target = parsed.targetId ? state.getShip(parsed.targetId) : null;
      if (!target || target.destroyed || (attacker && target.faction === attacker.faction)) {
        target = state.pickTarget(attackerId);
      }
      if (!attacker || !target) {
        continue; // nothing to shoot at (no seeded ships / no enemy) — accepted, no effect
      }
      const dmg = computeDamage(attacker, target, kind, commandModifierOpts(state, attackerId, target.id));
      state.applyDamage(target.id, dmg);
      state.logCombat({ event: 'attacked', kind, attackerId, targetId: target.id, ...dmg });
      hits.push({ attackerId, targetId: target.id, destroyed: dmg.destroyed });
      notifies.push({
        inner: buildNotifyAttackedShipInner({
          attackerId,
          targetId: target.id,
          weaponType: parsed.weaponType & 0xff,
          armorDamage: dmg.armorDamage,
          zankiDamage: dmg.zankiDamage,
          shieldDamage: dmg.shieldDamage,
          hitLoc: dmg.hitLoc,
        }),
        target: 'all',
      });
      if (dmg.destroyed) {
        const loss = resolveFlagshipLoss(state, target.id); // 旗艦이면 戦死(負傷/사망) 처리
        if (loss) casualties.push(loss);
        state.removeShip(target.id);
      }
    }
    // STEP5 전투 종결: 이번 교전의 격침으로 한쪽이 전멸했으면 전략모드 복귀(0x042f modeKind=2)를 덧붙인다.
    const destroyedIds = hits.filter((h) => h.destroyed).map((h) => h.targetId);
    notifies.push(...resolveBattleConclusion(state, { destroyedIds }));
    return { accept: true, hits, notifies, ...(casualties.length ? { casualties } : {}) };
  }

  if (innerCode === COMMAND_CHANGE_MODE_CODE) {
    // Fleet stance / formation change (and tactical-battle entry marker). Parse the mode + the units,
    // record the player's mode + open a battle session, then broadcast the canonical NotifyChangeMode
    // 0x042f to ALL clients (apply FUN_004c1c30 re-stances every listed unit on each client).
    const parsed = parseInboundChangeMode(inner);
    if (!parsed) {
      return { accept: false, reject: 'invalid-change-mode', notifies: [] };
    }
    state.setPlayerMode(connectionId, parsed.mode);
    state.openBattle({ mode: parsed.mode });
    state.joinBattle(connectionId);
    // LIVE BATTLE-ENTRY GRANT: push the full battle-setup sequence (openBattleField) — place ships
    // (0x349) -> tactics stats (0x33b/0x341/0x343) -> NotifyChangeMode 0x42f spawn poses (flips the
    // client tactical pool on) -> NotifyTactics 0x0f1f (begin). Participants + poses come from the
    // authoritative world state. This is the RE-backed battle-entry message family used by the client
    // FSM; exact original-server sequencing remains a live-client verification target.
    const participants = parsed.units.map((u) => {
      const ship = state.getShip(u.unitId);
      return {
        shipId: u.unitId,
        heading: ship?.heading ?? 0, x: ship?.x ?? 0, z: ship?.z ?? 0, y: ship?.y ?? 0,
        maxShield: ship?.maxShield, shield: ship?.shield, beamPower: ship?.beamPower, morale: ship?.morale,
      };
    });
    const steps = openBattleField({ participants, anchorId: parsed.leaderId, modeKind: parsed.mode });
    const notifies = steps.map((s) => ({ inner: s.inner, target: s.target ?? 'all' }));
    return { accept: true, mode: parsed.mode, notifies };
  }

  if (innerCode === COMMAND_WARP_SHIP_CODE) {
    // Tactical warp jump: same body shape as fire (attacker id array). Without the full 0x0425
    // NotifyWarpedShip layout pinned, treat warp as an authoritative reposition acknowledged via the
    // move notify so other clients still see the jump (placeholder until 0x0425 is fully reversed).
    const parsed = parseInboundAttack(inner);
    if (!parsed || parsed.count === 0) {
      return { accept: false, reject: 'invalid-warp', notifies: [] };
    }
    const notifies = [];
    for (const shipId of parsed.attackerIds) {
      const ship = state.getShip(shipId);
      if (ship && ship.owner !== 0 && ship.owner !== connectionId) {
        return { accept: false, reject: 'not-owner', notifies: [] };
      }
      const moved =
        applyShipMove(state, { shipId, x: ship?.x ?? 0, y: ship?.y ?? 0, z: ship?.z ?? 0 }) ??
        buildNotifyMovedShipInner({ shipId });
      notifies.push({ inner: moved, target: 'others' });
    }
    return { accept: true, units: parsed.attackerIds, notifies };
  }

  if (innerCode === COMMAND_FIGHT_CODE) {
    // Auto-resolved melee/engagement: each side trades fire until one breaks. Resolve as a single
    // exchange between the player's first ship and the nearest enemy, broadcasting the damage notify.
    const parsed = parseInboundAttack(inner);
    if (!parsed) {
      return { accept: false, reject: 'invalid-fight', notifies: [] };
    }
    const notifies = [];
    const destroyedIds = [];
    const casualties = []; // 격침된 旗艦의 戦死 결과(3.2)
    const survivingTargets = []; // 격침되지 않고 살아남은 피격 적(降伏勧告 후보, 3.4)
    let recommenderShipId = 0; // 항복을 권고할 공격측 기함(첫 공격 함선)
    for (const attackerId of parsed.attackerIds) {
      const attacker = state.getShip(attackerId);
      if (attacker && attacker.owner !== 0 && attacker.owner !== connectionId) {
        return { accept: false, reject: 'not-owner', notifies: [] };
      }
      // 캐논(p442): 저사기/混乱 함선은 교전(FIGHT) 명령 불가.
      if (attacker && !canCommand(attacker)) {
        return { accept: false, reject: 'low-morale-uncommandable', notifies: [] };
      }
      const target = state.pickTarget(attackerId);
      if (!attacker || !target) {
        continue;
      }
      if (!recommenderShipId) recommenderShipId = attackerId;
      const dmg = computeDamage(attacker, target, 'fight', commandModifierOpts(state, attackerId, target.id));
      state.applyDamage(target.id, dmg);
      state.lowerMorale(target.id, 15);
      state.logCombat({ event: 'fought', attackerId, targetId: target.id, ...dmg });
      notifies.push({ inner: buildNotifyAttackedShipInner({ attackerId, targetId: target.id, armorDamage: dmg.armorDamage, zankiDamage: dmg.zankiDamage, shieldDamage: dmg.shieldDamage, hitLoc: dmg.hitLoc }), target: 'all' });
      notifies.push({ inner: buildNotifyMoraleDownInner({ shipId: target.id, morale: target.morale }), target: 'all' });
      if (dmg.destroyed) {
        const loss = resolveFlagshipLoss(state, target.id); // 旗艦이면 戦死 처리
        if (loss) casualties.push(loss);
        destroyedIds.push(target.id);
        state.removeShip(target.id);
      } else {
        survivingTargets.push(state.getShip(target.id)); // 살아남음 → 항복 권고 후보
      }
    }
    // 降伏勧告(3.4): 살아남은 저사기 적에게 공격측 기함 사령관 統率로 항복 권고(수락 시 무력화).
    const surrendered = recommendSurrender(state, recommenderShipId, survivingTargets.filter(Boolean));
    // STEP5 전투 종결: 격침 또는 항복(이탈)으로 한쪽이 전투력을 잃었으면 전략모드 복귀를 덧붙인다.
    notifies.push(...resolveBattleConclusion(state, { destroyedIds, surrenderedIds: surrendered }));
    return {
      accept: true,
      notifies,
      ...(casualties.length ? { casualties } : {}),
      ...(surrendered.length ? { surrendered } : {}),
    };
  }

  if (innerCode === COMMAND_SORTIE_TROOPS_CODE || innerCode === COMMAND_ATTACK_TROOP_CODE) {
    // GROUND COMBAT (地上戦): the player sorties troops onto a planet surface; each engages the nearest
    // enemy troop. Server resolves the ground exchange (resolveLandCombat) and broadcasts the canonical
    // NotifySortie 0x437 + NotifyMovedTroop 0x429 + NotifyLandCombat 0x42a to all clients.
    const parsed = parseInboundSortie(inner);
    if (!parsed || parsed.count === 0) {
      return { accept: false, reject: 'invalid-sortie', notifies: [] };
    }
    const notifies = [];
    const results = [];
    for (const troopId of parsed.troopIds) {
      const troop = state.getTroop(troopId);
      if (troop && troop.owner !== 0 && troop.owner !== connectionId) {
        return { accept: false, reject: 'not-owner', notifies: [] };
      }
      if (!troop) {
        continue;
      }
      state.sortieTroop(troopId, {});
      notifies.push({ inner: buildNotifySortieInner({ unitId: troopId }), target: 'all' });
      notifies.push({ inner: buildNotifyMovedTroopInner({ troopId, x: troop.x, y: troop.y, z: troop.z }), target: 'all' });
      const enemy = state.pickTroopTarget(troopId);
      if (enemy) {
        const r = resolveLandCombat(troop, enemy);
        state.applyLandCombat(enemy.id, { strengthAfter: r.strengthAfter, moraleAfter: r.moraleAfter });
        // 방어측 생존 시 반격피해를 공격 부대에도 적용(이전엔 attackerStrengthAfter가 계산만 되고 버려져,
        // 약한 부대가 강한 방어를 무손실로 무한 공격 가능했다 — 결정론 전투모델 일관성 픽스).
        if (!r.defeated && Number.isFinite(r.attackerStrengthAfter)) {
          state.applyLandCombat(troopId, { strengthAfter: r.attackerStrengthAfter, moraleAfter: troop.morale });
        }
        state.logCombat({ event: 'land-combat', attackerId: troopId, defenderId: enemy.id, dealt: r.dealt, defeated: r.defeated });
        results.push({ attackerId: troopId, defenderId: enemy.id, defeated: r.defeated });
        notifies.push({ inner: buildNotifyLandCombatInner({ unitId: enemy.id, result: r.result }), target: 'all' });
      }
    }
    return { accept: true, results, notifies };
  }

  // Internal-affairs (内政) — personnel / strategy / logistics / social. Routed last so the combat,
  // chat and move handlers above keep their existing fast paths (e.g. CommandGridChat/SpotChat).
  const internalAffairs = routeInternalAffairs({ state, player, connectionId, innerCode, inner });
  if (internalAffairs) {
    return internalAffairs;
  }

return { accept: false, reject: 'unknown-command', notifies: [] };
}

function unitsFromDecision(decision = {}) {
if (Array.isArray(decision.units)) return decision.units;
if (Array.isArray(decision.hits)) return decision.hits.flatMap((hit) => [hit.attackerId, hit.targetId]).filter((id) => Number.isInteger(id));
if (Array.isArray(decision.results)) return decision.results.flatMap((result) => [result.attackerId, result.defenderId]).filter((id) => Number.isInteger(id));
return [];
}

function effectForCommand(innerCode, decision = {}) {
if (!decision.accept) return null;
if (innerCode === COMMAND_GRID_CHAT_CODE) return 'grid-chat';
if (innerCode === COMMAND_MOVE_SHIP_CODE || innerCode === COMMAND_PARALLEL_MOVE_SHIP_CODE) return 'ship-move';
if (innerCode === COMMAND_MOVE_GRID_CODE) return 'fleet-grid-move';
if (innerCode === COMMAND_ATTACK_SHIP_CODE || innerCode === COMMAND_SHOOT_SHIP_CODE) return 'ship-attack';
if (innerCode === COMMAND_CHANGE_MODE_CODE) return 'battle-mode-change';
if (innerCode === COMMAND_WARP_SHIP_CODE) return 'ship-warp';
if (innerCode === COMMAND_FIGHT_CODE) return 'ship-fight';
if (innerCode === COMMAND_SORTIE_TROOPS_CODE) return 'troop-sortie';
if (innerCode >= STRATEGY_CODE_LO && innerCode <= STRATEGY_CODE_HI) return 'strategy-command';
if (LOGISTICS_CODE_SET.has(innerCode)) return 'logistics-command';
if (BATTLE_OPS_CODE_SET.has(innerCode)) return 'battle-ops-command';
if (innerCode >= PERSONNEL_CODE_LO && innerCode <= PERSONNEL_CODE_HI) return 'personnel-command';
if (isSocialCommandCode(innerCode)) return 'social-command';
if (isAccountCommandCode(innerCode)) return 'account-command';
return 'command';
}

function recordCommandDecision({ state, connectionId, innerCode, decision }) {
if (!state || typeof state.recordCommand !== 'function' || !decision) return;
state.recordCommand({
connectionId,
innerCode,
accept: decision.accept,
reject: decision.reject ?? null,
units: unitsFromDecision(decision),
effect: effectForCommand(innerCode, decision),
...(decision.debug !== undefined ? { debug: decision.debug } : {}),
});
}

export function processCommand(args) {
const beforeCount = typeof args?.state?.commandLogCount === 'function' ? args.state.commandLogCount() : null;
const decision = processCommandCore(args);
const afterCount = typeof args?.state?.commandLogCount === 'function' ? args.state.commandLogCount() : null;
if (beforeCount != null && afterCount === beforeCount) {
recordCommandDecision({ state: args.state, connectionId: args.connectionId, innerCode: args.innerCode, decision });
}
return decision;
}
