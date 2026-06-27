/**
 * Authoritative space-war (tactical combat) engine — the "사격/공격 → 피해 판정 → 격침" core.
 *
 * The LOGH VII client is a thin renderer: it SENDS a fire command (CommandShootShip 0x406 /
 * CommandAttackShip 0x405) and only shows damage when the server broadcasts NotifyAttackedShip
 * (0x426). So the server owns combat truth. This module:
 *   - parses the tactical battle commands (Attack/Shoot/Warp/Fight/ChangeMode),
 *   - resolves authoritative damage against ship combat stats,
 *   - and supplies the wire field shape for the damage/notify builders.
 *
 * EVIDENCE (Ghidra G7MTClient, index .omo/ghidra/export/G7MTClient):
 *   - dispatch FUN_004b8b00: 0x404/0x405/0x406 body = 0x90/0x98/0x98, parser FUN_004bfc40.
 *   - FUN_004bfc40 reads unitCount = body byte @12, then a unit-id array @16 stride 4 (u32 each),
 *     stamping a fire timer (entity+0x5c0/0x5bc) per attacking ship — same header shape as MoveShip.
 *   - NotifyAttackedShip 0x426 apply = FUN_004c0df0 (case 0x426 in FUN_004ba2b0 copies 7 dwords/28B):
 *       body @0x04 u32 attackerId, @0x08 u8 weaponType (FUN_004c7790 -> beam effect FUN_004b3460),
 *       @0x0c u32 targetId, @0x10 u16 armorDmg, @0x12 u16 zankiDmg, @0x14 u8 hitLoc(<6), @0x16 u16 shieldDmg.
 *     The client sets each pool to (max - wireValue): armor -> entity+0x8d4 (max = shipClass+0x218),
 *     zanki(残機) -> entity+0x8d8 (max = shipClass+0x218), shield -> via shipClass+0x288. So the wire
 *     carries CUMULATIVE damage and the client derives current = max - cumulative.
 *   - ChangeMode 0x411 / NotifyChangeMode 0x42f (664B, apply FUN_004c1c30): per-unit formation/stance
 *     change (NOT the strategic<->tactical battle-mode byte 0x126711 — that is the grid-enter FSM).
 *
 * NOTE ON THE DAMAGE FORMULA: only the *client* binary survives, and it merely RENDERS the server's
 * numbers (current = max - wireValue). The original server's exact damage formula is therefore not
 * recoverable by RE. The formula here is an authoritative SERVER DESIGN choice — deterministic,
 * tunable, and faithful to the three on-wire pools (shield -> armor -> zanki). See docs/logh7-proto-
 * battle-fire.md and docs/logh7-combat-server-contract.md.
 *
 * Pure + synchronous => fully unit-testable without a live client.
 */

import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

// ---- in-world combat message codes (confirmed: docs/logh7-protocol-master.md / message-catalog.json) ----
export const COMMAND_WARP_SHIP_CODE = 0x0404; // C->S CommandWarpShip   (body 0x90, FUN_004bfc40)
export const COMMAND_ATTACK_SHIP_CODE = 0x0405; // C->S CommandAttackShip (body 0x98, FUN_004bfc40)
export const COMMAND_SHOOT_SHIP_CODE = 0x0406; // C->S CommandShootShip  (body 0x98, FUN_004bfc40) — beam volley
export const COMMAND_FIGHT_CODE = 0x0407; // C->S CommandFight       (body 0x24, FUN_004c1070) — auto-resolve melee
export const COMMAND_CHANGE_MODE_CODE = 0x0411; // C->S CommandChangeMode  (body 0x98, FUN_004be8c0) — fleet stance
export const COMMAND_STOP_CODE = 0x040a; // C->S CommandStop        (body 0x114)
export const COMMAND_TURN_SHIP_CODE = 0x0401; // C->S CommandTurnShip    (body 0x114, FUN_004bef70)

export const NOTIFY_WARPED_SHIP_CODE = 0x0425; // S->C NotifyWarpedShip   (body 0x90)
export const NOTIFY_ATTACKED_SHIP_CODE = 0x0426; // S->C NotifyAttackedShip (body 0x1c = 28B)
export const NOTIFY_FOUGHT_CODE = 0x0427; // S->C NotifyFought       (body, 4 dwords applied)
export const NOTIFY_AIR_BATTLE_CODE = 0x0428; // S->C NotifyAirBattle    (body 0x18, 6 dwords)
export const NOTIFY_CHANGE_MODE_CODE = 0x042f; // S->C NotifyChangeMode   (body 0x298 = 664B)
export const NOTIFY_MORALE_DOWN_CODE = 0x0440; // S->C NotifyMoraleDown   (body 0xc)

// ---- ground combat (地上戦) ----
export const COMMAND_SORTIE_TROOPS_CODE = 0x040f; // C->S CommandSortieTroops   (body 0x94, FUN_004be8c0)
export const COMMAND_EVACUATE_TROOPS_CODE = 0x0410; // C->S CommandEvacuateTroops (body 0x90)
export const COMMAND_ATTACK_TROOP_CODE = 0x0412; // C->S CommandSortie/troop assault (body 0x90)

export const MAX_COMBAT_UNITS = 32; // "unit_size over than 32" guard (Input_Command{Shoot,Attack,Warp}Ship)
export const MAX_HIT_LOCATION = 6; // FUN_004c0df0: hitLoc must be < 6 (per-part flags entity+0x8e0..0x8e5)

const COMBAT_HEADER = 16; // unitCount @12, unit-id array @16 (stride 4) — shared with MoveShip header
const ATTACK_UNIT_STRIDE = 4; // FUN_004bfc40: piVar3 += 1 (one u32 id per unit, no per-unit pose)
const ATTACK_TARGET_OFF = 0x94; // CommandAttack/ShootShip: target id at a FIXED body offset (param_2[0x25]),
//                                 independent of unitCount — confirmed docs/logh7-proto-battle-fire.md §1.

const u16 = (v) => Math.max(0, Math.min(0xffff, Math.round(v))) & 0xffff;

/**
 * Default ship-class combat stats. Modeled on the three on-wire pools the client renders. These are
 * SERVER-side balance values (the client only renders current = max - cumulativeDamage); override per
 * ship via world-state. Loosely sourced from content/manual/ship-units.json roles.
 * @typedef {{ maxArmor:number, maxZanki:number, maxShield:number, beamPower:number, defense:number, morale:number }} ShipClassStats
 */
export const DEFAULT_SHIP_STATS = Object.freeze({
  maxArmor: 1200, // entity+0x8d4 pool max (shipClass+0x218)
  maxZanki: 1000, // entity+0x8d8 残機 pool max (shipClass+0x218)
  maxShield: 600, // shield pool max (shipClass+0x288)
  beamPower: 220, // offensive output (server balance)
  defense: 80, // damage mitigation (server balance)
  morale: 100, // 士気; NotifyMoraleDown reduces it
});

/** Canonical per-class overrides keyed by a coarse class tag (extend from ship-units.json). */
export const SHIP_CLASS_STATS = Object.freeze({
  flagship: { maxArmor: 2600, maxZanki: 1, maxShield: 1400, beamPower: 520, defense: 220, morale: 120 },
  battleship: { maxArmor: 1800, maxZanki: 1400, maxShield: 900, beamPower: 360, defense: 140, morale: 100 },
  cruiser: { maxArmor: 1200, maxZanki: 1000, maxShield: 600, beamPower: 220, defense: 80, morale: 100 },
  destroyer: { maxArmor: 700, maxZanki: 600, maxShield: 320, beamPower: 150, defense: 50, morale: 95 },
  carrier: { maxArmor: 1500, maxZanki: 1200, maxShield: 500, beamPower: 120, defense: 90, morale: 100 },
  fortress: { maxArmor: 30000, maxZanki: 1, maxShield: 12000, beamPower: 4000, defense: 800, morale: 200 },
});

// Full per-ship-type catalog (every LOGH VII ship from the manual roster), loaded lazily from
// content/ship-stats.json (generated by tools/logh7_ship_stats.py). Keyed by ship `key` (e.g. "SS75")
// AND by class archetype. Cached after first read; pure archetype path still works without the file.
let _shipCatalog = null;
function loadShipCatalog() {
  if (_shipCatalog !== null) {
    return _shipCatalog;
  }
  _shipCatalog = new Map();
  try {
    // Lazy, dependency-free: read the JSON next to the repo content/ dir at call time.
    const url = new URL('../../content/ship-stats.json', import.meta.url);
    const text = require('node:fs').readFileSync(url, 'utf8');
    for (const s of JSON.parse(text).ships ?? []) {
      if (!s.key) continue;
      // The catalog (tools/logh7_ship_stats.py) holds REAL manual numbers, but armor/shield are NULL where
      // the manual OCR is corrupt (the tool refuses to guess). Keep ONLY non-null real values; the archetype
      // (shipClass) supplies a documented default for the genuinely-missing fields. So combat uses real
      // zanki(=unit_count)/beam/defense where they survive, and a transparent class default otherwise.
      const pools = s.pools ?? s; // tolerate both the nested-pools schema and a flat one
      const real = {};
      for (const k of ['maxArmor', 'maxZanki', 'maxShield', 'beamPower', 'defense', 'morale']) {
        if (typeof pools[k] === 'number' && Number.isFinite(pools[k]) && pools[k] > 0) {
          real[k] = pools[k];
        }
      }
      _shipCatalog.set(s.key, { shipClass: s.shipClass, real });
    }
  } catch {
    // catalog absent (tests / minimal deploy): archetype defaults still resolve every ship.
  }
  return _shipCatalog;
}

/**
 * Resolve a ship's combat stats by its catalog `key` (a real ship type, e.g. "SS75" 標準戦艦) OR by a
 * class archetype tag (flagship/battleship/cruiser/destroyer/carrier/fortress). Layering (most→least
 * authoritative): real manual numbers from the catalog → the ship's class archetype default → the global
 * DEFAULT_SHIP_STATS. So EVERY ship has complete stats, real where the manual survives, documented default
 * where the manual OCR is corrupt (the catalog marks which fields are real in its _raw block).
 */
export function shipClassStats(shipClassOrKey) {
  const entry = loadShipCatalog().get(shipClassOrKey);
  if (entry) {
    const arch = SHIP_CLASS_STATS[entry.shipClass] ?? {};
    return { ...DEFAULT_SHIP_STATS, ...arch, ...entry.real };
  }
  return { ...DEFAULT_SHIP_STATS, ...(SHIP_CLASS_STATS[shipClassOrKey] ?? {}) };
}

/**
 * Parse the shared body of CommandWarpShip 0x404 / CommandAttackShip 0x405 / CommandShootShip 0x406.
 * Raw inner = [u16 BE code][body]. Body (FUN_004bfc40): unitCount = u8 @12, then attacker ship ids at
 * @16 stride 4 (u32). The 8-byte trailer after the id array (@ header+stride*count .. body end) is
 * read best-effort as an optional explicit target/aim (the dispatch parser only stamps fire timers;
 * the authoritative server resolves targets itself — see resolveVolley). Returns null if too short.
 */
export function parseInboundAttack(inner) {
  const body = inner.subarray(2);
  if (body.length < COMBAT_HEADER) {
    return null;
  }
  const count = Math.min(body.readUInt8(12), MAX_COMBAT_UNITS);
  const attackerIds = [];
  for (let i = 0; i < count; i += 1) {
    const off = COMBAT_HEADER + i * ATTACK_UNIT_STRIDE;
    if (off + 4 > body.length) {
      break;
    }
    attackerIds.push(body.readUInt32LE(off));
  }
  // The targeted enemy id sits at a FIXED offset 0x94 (param_2[0x25]) — not after the id array. The
  // server may still auto-pick if it is 0/invalid. Weapon/aim is not in the command (the server/notify
  // sets weaponType); kept 0 here.
  const targetId = body.length >= ATTACK_TARGET_OFF + 4 ? body.readUInt32LE(ATTACK_TARGET_OFF) : 0;
  return { count, attackerIds, targetId, weaponType: 0 };
}

/**
 * Parse CommandChangeMode 0x411 (fleet stance/formation change). Body (FUN_004be8c0 -> FUN_004be7c0,
 * NotifyChangeMode apply FUN_004c1c30): u8 mode @4, u32 leaderId @8, u8 unitCount @12, then unit
 * entries @16 stride 20 (5 dwords): [u32 unitId][3 dwords stance params][...]. Returns null if short.
 */
export function parseInboundChangeMode(inner) {
  const body = inner.subarray(2);
  if (body.length < COMBAT_HEADER) {
    return null;
  }
  const mode = body.readUInt8(4);
  const leaderId = body.readUInt32LE(8);
  const count = Math.min(body.readUInt8(12), MAX_COMBAT_UNITS);
  const units = [];
  for (let i = 0; i < count; i += 1) {
    const off = COMBAT_HEADER + i * 20;
    if (off + 4 > body.length) {
      break;
    }
    units.push({ unitId: body.readUInt32LE(off) });
  }
  return { mode, leaderId, count, units };
}

/**
 * Resolve one ship's fire against one target — the authoritative damage model (SERVER design; the
 * wire only carries the resulting pool damages). Shield absorbs first, then armor, then zanki (残機).
 * `kind` 'shoot' = beam volley (full beam power), 'attack' = sustained (heavier), 'fight' = melee.
 * Returns the wire-ready CUMULATIVE damages plus the post-hit pool snapshot and a destroyed flag.
 *
 * @param {{ beamPower:number }} attacker
 * @param {{ armor:number, maxArmor:number, zanki:number, maxZanki:number, shield:number, maxShield:number, defense:number, armorPerShip?:number }} target
 */
export function computeDamage(attacker, target, kind = 'shoot', opts = {}) {
  const kindFactor = kind === 'attack' ? 1.5 : kind === 'fight' ? 1.25 : 1.0;
  let raw = Math.max(1, Math.round((attacker?.beamPower ?? DEFAULT_SHIP_STATS.beamPower) * kindFactor));
  // 사령관 統率(leadership, PCP index0) 전투 변조 — SERVER DESIGN 밸런스(P3 추정 확장, 캐논 수치 아님).
  // opts 미주입(기본 {})이면 완전 무효 → 기존 호출/테스트 동작 보존.
  // ★캐논 주의: 매뉴얼(docs/logh7-manual-canon.md p14-15)상 統率의 명시 효과는 艦隊最大士気·降伏勧告成功率
  // 이지 직접 전투피해가 아니다(그 캐논 효과는 state.lowerMorale·resolveBattleSurrenders에 이미 구현).
  // 이 피해 변조는 "유능한 사령관의 함대가 더 효과적으로 교전"이라는 게임설계 확장일 뿐 캐논 메커니즘이 아니므로
  // 호출자(command-engine/npc-ai)가 LOGH_COMBAT_LEADERSHIP=1일 때만 주입한다(off-by-default, 기본 밸런스 불변).
  // 보수적 곡선: 統率 100 기준 공격 +25%(raw*=1+L/400)·방어 def+25(def+=L/4).
  const attackerCommand = Math.max(0, Number(opts?.attackerCommand) || 0);
  const targetCommand = Math.max(0, Number(opts?.targetCommand) || 0);
  if (attackerCommand > 0) {
    raw = Math.max(1, Math.round(raw * (1 + attackerCommand / 400)));
  }
  // Defense mitigates incoming damage (diminishing): effective = raw * 100/(100+defense).
  const def = Math.max(0, (target?.defense ?? 0) + targetCommand / 4);
  let incoming = Math.max(1, Math.round((raw * 100) / (100 + def)));

  // 1) shield soaks first.
  const shield = Math.max(0, target?.shield ?? 0);
  const shieldHit = Math.min(shield, incoming);
  const shieldAfter = shield - shieldHit;
  incoming -= shieldHit;

  // 2) armor (装甲 buffer, entity+0x8d4) takes the leftover next.
  const armor = Math.max(0, target?.armor ?? 0);
  const armorHit = Math.min(armor, incoming);
  const armorAfter = armor - armorHit;
  incoming -= armorHit;

  // 3) hull / 残機 (entity+0x8d8) takes the overflow once shield+armor are breached. When it reaches
  //    zero the ship is destroyed (shield -> armor -> zanki is the three-pool cascade the wire carries).
  const zanki = Math.max(0, target?.zanki ?? 0);
  const zankiAfter = incoming > 0 ? Math.max(0, zanki - incoming) : zanki;

  const destroyed = zankiAfter <= 0;
  const hitLoc = (shieldAfter > 0 ? 0 : armorAfter > 0 ? 1 : 2) % MAX_HIT_LOCATION;
  return {
    kind,
    raw,
    shieldAfter,
    armorAfter,
    zankiAfter,
    // wire CUMULATIVE damages (client renders current = max - cumulative):
    shieldDamage: u16((target?.maxShield ?? DEFAULT_SHIP_STATS.maxShield) - shieldAfter),
    armorDamage: u16((target?.maxArmor ?? DEFAULT_SHIP_STATS.maxArmor) - armorAfter),
    zankiDamage: u16((target?.maxZanki ?? DEFAULT_SHIP_STATS.maxZanki) - zankiAfter),
    hitLoc,
    destroyed,
  };
}

/**
 * Parse a CommandSortieTroops 0x40f / EvacuateTroops 0x410 / Sortie 0x412 body — identical header shape
 * to the fire commands (unitCount @0xc, unit-id array @0x10 stride 4; no @0x94 target). Evidence:
 * docs/logh7-proto-battle-fleetops.md §1 (FUN_004be8c0/FUN_004be7c0, Input_CommandSortieTroops FUN_0049f860).
 */
export function parseInboundSortie(inner) {
  const parsed = parseInboundAttack(inner);
  if (!parsed) {
    return null;
  }
  return { count: parsed.count, troopIds: parsed.attackerIds };
}

/**
 * Resolve one ground-combat exchange (地上戦) between an attacking troop and a defending troop. Like ship
 * combat, the formula is a deterministic SERVER design (the client renders the result). A troop has
 * { strength, morale, defense }. Returns the post-exchange snapshot + result code (1 attacker win / 2
 * defender win / 0 ongoing) for NotifyLandCombat 0x42a.
 *
 * @param {{ strength:number, morale:number }} attacker
 * @param {{ strength:number, morale:number, defense:number, maxStrength?:number }} defender
 */
export function resolveLandCombat(attacker, defender) {
  const atkPower = Math.max(1, Math.round((attacker?.strength ?? 100) * (0.5 + (attacker?.morale ?? 100) / 200)));
  const def = Math.max(0, defender?.defense ?? 0);
  const dealt = Math.max(1, Math.round((atkPower * 100) / (100 + def)));
  const strengthAfter = Math.max(0, (defender?.strength ?? 100) - dealt);
  const moraleAfter = Math.max(0, (defender?.morale ?? 100) - Math.ceil(dealt / 10));
  const defeated = strengthAfter <= 0;
  // counter-attack chips the attacker when the defender survives.
  const counter = defeated ? 0 : Math.max(1, Math.round(((defender?.strength ?? 0) * 0.3) / Math.max(1, atkPower / 50)));
  const attackerStrengthAfter = Math.max(0, (attacker?.strength ?? 100) - counter);
  // result 우선순위(JSDoc 계약 충족): 공격측 전멸 → 2(방어측 승리), 방어측 전멸 → 1(공격측 점령), 둘 다 생존 → 0.
  // (이전엔 1/0만 반환해 캐논 '수비 성공으로 공격부대 격퇴'(2)를 클라가 표현 못 했다.)
  const result = attackerStrengthAfter <= 0 ? 2 : defeated ? 1 : 0;
  return {
    dealt,
    strengthAfter,
    moraleAfter,
    attackerStrengthAfter,
    defeated,
    result,
  };
}
