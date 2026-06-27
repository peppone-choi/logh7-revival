/**
 * Authoritative internal-affairs PERSONNEL (人事 / cards) DOMAIN engine — the
 * "appoint / dismiss / promote / demote → validate → mutate roster → broadcast notify" core.
 *
 * 이 파일은 인사 도메인의 "상태 + 처리부"만 남긴 상위 shim 이다. 순수 와이어 코덱(메시지 코드/와이어 상수/
 * 파서/빌더/0x356 스트림 디코더)은 codec/personnel-records.mjs 로 분리했고, 여기서 필요한 것만 import 해
 * 쓴다. 기존 import 경로를 100% 보존하려고 codec/personnel-records.mjs 의 export 표면을 그대로 다시
 * re-export 한다(아래 `export *`). 의존 방향은 단방향(도메인 → codec); codec 은 도메인을 import 하지 않는다.
 *
 * The LOGH VII client is a thin renderer for personnel actions: it SENDS a personnel command
 * (CommandRankUp 0x704 / CommandSpeciallyRankUp 0x705 / CommandRankDown 0x706 /
 * CommandCardAppointment 0x707 / CommandCardDismisal 0x708 / CommandCardResignation 0x709) and
 * only mutates its own card/seat tables when the server broadcasts the matching S->C record:
 * NotifyCardLoss 0x70a / NotifyCardLossMovedSpot 0x70b / NotifyInformationCharacter 0x356 /
 * NotifyChangeFlagShip 0x358. So the SERVER owns the personnel roster, the per-outfit seat tables,
 * and the rank ladder. This module:
 *   - validates rank bounds + seat ownership/capacity against an in-memory roster (createPersonnelState),
 *   - mutates that roster,
 *   - and routes the six inbound commands through processPersonnel(ctx) → S→C notifies.
 *
 * The parsers / builders / wire constants it uses come from codec/personnel-records.mjs (re-exported
 * below). The lead wires the 0x704..0x709 range to processPersonnel in logh7-command-engine.mjs.
 * createPersonnelState + processPersonnel are pure + synchronous => fully unit-testable.
 */

import {
  titleName,
  titleRank,
  validateGrantTitle,
  validateGrantFief,
  applyGrantFief,
  applyRevokeFief,
  fiefIncome,
} from './logh7-imperial-titles.mjs';
import { canPromoteTo, autoPromoteLadders } from './logh7-rank-ladder.mjs';
import { normalizeFaction } from './logh7-rank-table.mjs';
import {
  MIN_RANK,
  MAX_RANK,
  MAX_SEATS_PER_OUTFIT,
  COMMAND_RANK_UP_CODE,
  COMMAND_SPECIALLY_RANK_UP_CODE,
  COMMAND_RANK_DOWN_CODE,
  COMMAND_CARD_APPOINTMENT_CODE,
  COMMAND_CARD_DISMISAL_CODE,
  COMMAND_CARD_RESIGNATION_CODE,
  COMMAND_GRANT_TITLE_CODE,
  COMMAND_GRANT_FIEF_CODE,
  COMMAND_REVOKE_FIEF_CODE,
  parseInboundRankUp,
  parseInboundSpeciallyRankUp,
  parseInboundRankDown,
  parseInboundCardAppointment,
  parseInboundCardDismisal,
  parseInboundCardResignation,
  parseInboundGrantTitle,
  parseInboundGrantFief,
  buildNotifyCardLossInner,
  buildNotifyCardLossMovedSpotInner,
  buildNotifyChangeFlagShipInner,
  buildNotifyInformationCharacterInner,
} from './codec/personnel-records.mjs';
import { buildResponseInformationBaseInner } from './logh7-base-record.mjs';

// 순수 코덱 전체(코드/와이어 상수/파서/빌더/스트림 디코더 + buildLobbyResponseInner passthrough)를 그대로
// 다시 re-export → 기존 import 경로(command-engine·auth-server·login-session·login-protocol·테스트 2종)를
// 한 줄도 안 건드리고 100% 보존한다. 단방향: 도메인(이 파일) → codec.
export * from './codec/personnel-records.mjs';

/**
 * Resolve a character's held peerage title to the displayed titlename string for the 0x0356 delta.
 * The personnel state character carries `title` as the ladder rank (0=untitled .. 7=commoner) or a
 * name string; titleName() maps it to the 작위명 the client renders. Returns null (not '') when the
 * char has no title so the 0x356 builder leaves the titlename unset rather than clearing it.
 */
function characterTitleName(ch) {
  if (!ch || ch.title == null) return null;
  const name = titleName(ch.title);
  return name.length > 0 ? name : null;
}

// ---------------------------------------------------------------------------------------------------
// STATE — the authoritative personnel roster: characters (rank/spot/owner/achievement) and outfits
// (per-outfit seat array + chief). createPersonnelState() builds an empty roster; helpers seed/query/
// mutate it. process() validates against it.
// ---------------------------------------------------------------------------------------------------

/**
 * @typedef {{ id:number, rank:number, spot:number, owner:number, achievement:number }} PersonnelChar
 * @typedef {{ id:number, owner:number, chief:number, seats:{ character:number, role:number }[] }} Outfit
 * @typedef {{ id:number, owner:number, economy:number, taxRatePct:number|null }} FiefBase
 */

/** Create an empty authoritative personnel roster. */
export function createPersonnelState() {
  /** @type {Map<number, PersonnelChar>} */
  const characters = new Map();
  /** @type {Map<number, Outfit>} */
  const outfits = new Map();
  /** @type {Map<number, FiefBase>} 봉토(封土) 가능한 거점(행성/요새) 소유 레지스트리. owner 0 = 帝室直轄. */
  const bases = new Map();

  return {
    characters,
    outfits,
    bases,

    /** Seed/replace a character. owner 0 = neutral (any connection may command it). `title` = the held
     * peerage ladder rank (0=untitled .. 7=commoner) or a name string; default null = untitled.
     * `socialClass`('noble'|'commoner'|null) = 출신 계급(작위 수여 게이트 validateGrantTitle 용); `fiefs` =
     * 보유 봉토 base id 배열(봉토 수여/직할로 갱신). */
    addCharacter({
      id, rank = MIN_RANK, spot = 0, owner = 0, achievement = 0, title = null, faction = null,
      socialClass = null, fiefs = [],
    }) {
      const ch = { id: id >>> 0, rank, spot, owner, achievement, title, faction, socialClass, fiefs: [...fiefs] };
      characters.set(ch.id, ch);
      return ch;
    },
    getCharacter(id) {
      return characters.get(id >>> 0) ?? null;
    },
    /**
     * 특정 계급의 인원수(진영 일치분만). 정원캡(§B5 4.4) 강제용 — faction이 empire/alliance로 정규화되는
     * 캐릭터만 센다(중립/미지정은 사다리 정원에 포함하지 않음). excludeId는 카운트에서 제외(진급 당사자).
     */
    countAtRank(rank, faction, excludeId = null) {
      const f = normalizeFaction(faction);
      if (!f) return 0;
      let n = 0;
      for (const ch of characters.values()) {
        // excludeId가 null/생략이면 아무도 제외 안 함(이전엔 null>>>0===0이라 id 0 캐릭터가 항상 제외되던 footgun).
        if (excludeId != null && ch.id === (excludeId >>> 0)) continue;
        if (ch.rank === rank && normalizeFaction(ch.faction) === f) n += 1;
      }
      return n;
    },

    /** Seed/replace an outfit (unit) with an empty seat array. */
    addOutfit({ id, owner = 0, chief = 0 }) {
      const outfit = { id: id >>> 0, owner, chief, seats: [] };
      outfits.set(outfit.id, outfit);
      return outfit;
    },
    getOutfit(id) {
      return outfits.get(id >>> 0) ?? null;
    },

    /** Append a card to an outfit's seat array (cap MAX_SEATS_PER_OUTFIT). Returns the seat or null. */
    appointCard(outfitId, { character, role = 0, chief = null }) {
      const outfit = outfits.get(outfitId >>> 0);
      if (!outfit || outfit.seats.length >= MAX_SEATS_PER_OUTFIT) {
        return null;
      }
      const seat = { character: character >>> 0, role: role >>> 0 };
      outfit.seats.push(seat);
      if (chief != null) {
        outfit.chief = chief >>> 0;
      }
      return seat;
    },

    /**
     * Remove a card (by character id) from whichever outfit holds it. Returns { outfit, owner } of the
     * outfit it was removed from, or null when the card is not seated anywhere.
     */
    removeCard(characterId) {
      const cid = characterId >>> 0;
      for (const outfit of outfits.values()) {
        const idx = outfit.seats.findIndex((s) => s.character === cid);
        if (idx >= 0) {
          outfit.seats.splice(idx, 1);
          return { outfit, owner: outfit.owner };
        }
      }
      return null;
    },

    /** Set a character's rank + (optionally) spot. Returns the char or null if unknown. */
    setRank(characterId, rank, spot = null) {
      const ch = characters.get(characterId >>> 0);
      if (!ch) {
        return null;
      }
      ch.rank = rank;
      if (spot != null) {
        ch.spot = spot >>> 0;
      }
      return ch;
    },

    /**
     * 月間 자동진급(캐논 §5.3): 각 사다리(faction×track×rank, 大佐 이하)의 5법칙 #1을 다음 계급으로 진급한다.
     * 자동진급자의 功績은 목표 사다리의 **평균 功績**으로 설정(캐논 — 수동진급의 →0과 구분). 목표 정원 초과면
     * 보류(autoPromoteLadders의 canPromoteTo). 적용된 진급 목록을 반환한다(호출자가 0x356 브로드캐스트 가능).
     * trackOf: 캐릭터→'military'|'political'(미지정 시 전원 military). 무유저 갤럭시 월간 훅에서 호출 가능.
     * @returns {Array<{charId:number, fromRank:number, toRank:number}>}
     */
    runMonthlyPromotions({ maxAutoRank = 8, trackOf = () => 'military' } = {}) {
      const all = [...characters.values()];
      const promotions = autoPromoteLadders(all, { maxAutoRank, trackOf });
      for (const p of promotions) {
        const ch = characters.get(p.charId >>> 0);
        if (!ch) continue;
        // 목표 계급 사다리의 평균 功績 산정(진급 적용 전 기준).
        const targetPeers = all.filter((c) => (Number(c.rank) || 0) === p.toRank && normalizeFaction(c.faction) === normalizeFaction(ch.faction));
        const avg = targetPeers.length
          ? Math.round(targetPeers.reduce((s, c) => s + (Number(c.achievement) || 0), 0) / targetPeers.length)
          : 0;
        ch.rank = p.toRank;
        ch.achievement = avg; // 캐논: 자동진급자는 목표 사다리 평균 功績
      }
      return promotions.map((p) => ({ charId: p.charId, fromRank: p.fromRank, toRank: p.toRank }));
    },

    /**
     * 인물 功績(achievement) 적립/차감(순수 로스터 변경). delta>0이면 가산, 음수면 차감(0 미만으로는 내려가지
     * 않음 — 功績은 비음수). 작전 결과 정산(掃討 격침·占領/防衛 보너스 등)이 발령 사령관의 功績에 적립되는
     * 경로의 1차 원시 연산. 진급 5법칙(법칙1 功績)에 그대로 반영된다. 알 수 없는 캐릭터면 null.
     * @param {number} characterId
     * @param {number} delta 적립할 功績 점수(소수는 반올림)
     * @returns {(PersonnelChar|null)}
     */
    addAchievement(characterId, delta = 0) {
      const ch = characters.get(characterId >>> 0);
      if (!ch) {
        return null;
      }
      const d = Math.round(Number(delta) || 0);
      ch.achievement = Math.max(0, (Number(ch.achievement) || 0) + d);
      return ch;
    },

    /**
     * Grant/clear a character's peerage title (작위). `title` = ladder rank (1=공작 .. 7=평민) or a name
     * string; null clears it. Pure roster mutation — the caller is responsible for the validateGrantTitle
     * gate (logh7-imperial-titles.mjs) and for re-broadcasting the 0x0356 character delta. Returns the
     * char or null if unknown.
     */
    setTitle(characterId, title) {
      const ch = characters.get(characterId >>> 0);
      if (!ch) {
        return null;
      }
      ch.title = title;
      return ch;
    },

    /** Seed/replace a fief-eligible base(거점). owner 0 = 帝室直轄(미봉토). `economy`/`taxRatePct` feed
     * fiefIncome(); both default to null so the income tuning falls back to the module defaults. */
    addBase({ id, owner = 0, economy = null, taxRatePct = null }) {
      const base = { id: id >>> 0, owner: owner >>> 0, economy, taxRatePct };
      bases.set(base.id, base);
      return base;
    },
    getBase(id) {
      return bases.get(id >>> 0) ?? null;
    },
    /** Set a base's owner (lord id, or 0 = 直轄). Returns the base or null if unknown. */
    setBaseOwner(baseId, ownerId) {
      const base = bases.get(baseId >>> 0);
      if (!base) {
        return null;
      }
      base.owner = ownerId >>> 0;
      return base;
    },

    /** Move a character to a spot. Returns the char or null. */
    moveSpot(characterId, spot) {
      const ch = characters.get(characterId >>> 0);
      if (!ch) {
        return null;
      }
      ch.spot = spot >>> 0;
      return ch;
    },
  };
}

// ---------------------------------------------------------------------------------------------------
// process() — the validate → mutate → broadcast entry the lead routes 0x0704..0x0709 to.
// ---------------------------------------------------------------------------------------------------

const rankInBounds = (rank) => Number.isInteger(rank) && rank >= MIN_RANK && rank <= MAX_RANK;

/**
 * Ownership check: a connection may command character `id` only when the char is unknown (not seeded),
 * neutral (owner 0), or owned by this connection. Mirrors the combat-engine ownership guard.
 */
function ownsCharacter(state, characterId, connectionId) {
  const ch = state.getCharacter(characterId);
  return !ch || ch.owner === 0 || ch.owner === connectionId;
}

function ownsOutfit(state, outfitId, connectionId) {
  const outfit = state.getOutfit(outfitId);
  return !outfit || outfit.owner === 0 || outfit.owner === connectionId;
}

/**
 * Process an inbound personnel command from `connectionId`. Validates (rank bounds, seat ownership +
 * capacity), mutates the authoritative roster, and returns the S→C notifies the other/all clients
 * render.
 *
 * `intelState`(옵셔널)는 첩보/쿠데타 공유 상태(world.getIntelState) — 주어지면 0x0356 빌더의 coup_conduct
 * 표시필드를 isCoupConduct(charId)로 시드한다. 미지정(null)이면 모든 coupConduct=0(기존 동작 불변, AU-3).
 *
 * @param {{ state: ReturnType<createPersonnelState>, connectionId: number, innerCode: number, inner: Buffer, intelState?: any, decisiveVictory?: boolean }} args
 * @returns {{ accept: boolean, reject?: string, notifies: { inner: Buffer, target: 'others'|'all' }[] }}
 */
export function processPersonnel({ state, connectionId, innerCode, inner, intelState = null, decisiveVictory = false }) {
  // coup_conduct(叛意 모의 표시) 시드 헬퍼: intelState가 있으면 캐릭터의 叛乱忠誠度→0/1 플래그, 없으면 null
  // (빌더가 0으로 처리 → 기존 동작 불변). 완전승리(decisiveVictory) 진영은 isCoupConduct가 0 반환(표시 게이트).
  const coupConductOf = (characterId) =>
    intelState ? intelState.isCoupConduct(characterId, { decisiveVictory }) : null;
  switch (innerCode) {
    case COMMAND_CARD_APPOINTMENT_CODE: {
      // APPOINT a card into a seat (mirror client apply FUN_004c5580: append {card,role} to seat array,
      // set chief). Validate the actor owns the target outfit and the seat array isn't full (≤16).
      const cmd = parseInboundCardAppointment(inner);
      if (!cmd) {
        return { accept: false, reject: 'invalid-card-appointment', notifies: [] };
      }
      if (!ownsOutfit(state, cmd.targetOutfit, connectionId)) {
        return { accept: false, reject: 'not-owner', notifies: [] };
      }
      // Auto-seed an outfit so a forged/unseeded id still has a roster home (owner = actor).
      if (!state.getOutfit(cmd.targetOutfit)) {
        state.addOutfit({ id: cmd.targetOutfit, owner: connectionId });
      }
      const seat = state.appointCard(cmd.targetOutfit, {
        character: cmd.cardCharacter, role: cmd.seatRole, chief: cmd.chiefSpot,
      });
      if (!seat) {
        return { accept: false, reject: 'seat-full', notifies: [] };
      }
      state.moveSpot(cmd.cardCharacter, cmd.chiefSpot);
      // Broadcast the updated character (0x356) + the outfit's live state (0x358) to ALL viewers.
      const ch = state.getCharacter(cmd.cardCharacter);
      return {
        accept: true,
        outfit: cmd.targetOutfit,
        notifies: [
          {
            inner: buildNotifyInformationCharacterInner({
              characterId: cmd.cardCharacter, spot: cmd.chiefSpot, rank: ch?.rank ?? null,
              coupConduct: coupConductOf(cmd.cardCharacter),
            }),
            target: 'all',
          },
          {
            inner: buildNotifyChangeFlagShipInner({
              outfit: cmd.targetOutfit, character: cmd.chiefSpot, troopUnits: state.getOutfit(cmd.targetOutfit).seats.length,
            }),
            target: 'all',
          },
        ],
      };
    }

    case COMMAND_CARD_DISMISAL_CODE:
    case COMMAND_CARD_RESIGNATION_CODE: {
      // DISMISS (0x708) / RESIGN (0x709): remove the card from its seat, relocate the char to move_spot.
      // Broadcast NotifyCardLoss (0x70a) so every holder shifts it out of the seat array; if the spot
      // also moved, NotifyCardLossMovedSpot (0x70b).
      const cmd =
        innerCode === COMMAND_CARD_DISMISAL_CODE ? parseInboundCardDismisal(inner) : parseInboundCardResignation(inner);
      if (!cmd) {
        return { accept: false, reject: innerCode === COMMAND_CARD_DISMISAL_CODE ? 'invalid-card-dismisal' : 'invalid-card-resignation', notifies: [] };
      }
      // The card id to vacate: dismissal carries both target_character + card; resignation only `card`.
      const characterId = innerCode === COMMAND_CARD_DISMISAL_CODE ? cmd.targetCharacter : cmd.card;
      if (!ownsCharacter(state, characterId, connectionId)) {
        return { accept: false, reject: 'not-owner', notifies: [] };
      }
      const removed = state.removeCard(characterId);
      state.moveSpot(characterId, cmd.moveSpot);
      const owner = removed?.owner ?? 0;
      const notifies = [
        {
          inner: buildNotifyCardLossInner({ owner, cardId: characterId & 0xffff, silent: false, time: cmd.time }),
          target: 'all',
        },
      ];
      if (cmd.moveSpot) {
        notifies.push({
          inner: buildNotifyCardLossMovedSpotInner({ owner, spotX: cmd.moveSpot, spotY: 0, time: cmd.time }),
          target: 'all',
        });
      }
      return { accept: true, character: characterId, notifies };
    }

    case COMMAND_RANK_UP_CODE: {
      // PROMOTE by merit: validate the new rank is on the ladder (1..14), apply rank + spot move,
      // broadcast the updated character (0x356). move_character[] = the extra ids to re-push.
      const cmd = parseInboundRankUp(inner);
      if (!cmd) {
        return { accept: false, reject: 'invalid-rank-up', notifies: [] };
      }
      if (!rankInBounds(cmd.targetRank)) {
        return { accept: false, reject: 'rank-out-of-bounds', notifies: [] };
      }
      // The promoted char is the first refresh id (move_character[0]); fall back to none.
      const targetId = cmd.moveCharacters[0] ?? 0;
      if (targetId && !ownsCharacter(state, targetId, connectionId)) {
        return { accept: false, reject: 'not-owner', notifies: [] };
      }
      // 정원캡(§B5 4.4): 실 진영(empire/alliance) 캐릭터는 목표 계급 정원이 차 있으면 진급 불가
      // (元帥5/上級大将5[제국]/大将10/中将20/少将40/准将80, 大佐이하 무제한). 중립/미지정 진영은 캡 없음.
      if (targetId) {
        const tgt = state.getCharacter(targetId);
        const faction = normalizeFaction(tgt?.faction);
        if (faction && !canPromoteTo(cmd.targetRank, faction, state.countAtRank(cmd.targetRank, faction, targetId))) {
          return { accept: false, reject: 'rank-full', notifies: [] };
        }
      }
      if (targetId) {
        state.setRank(targetId, cmd.targetRank, cmd.moveSpot);
        // 캐논 §5.6: 昇進 시 功績→0(승급자가 새 계급에서 상대순위 바닥부터 시작 — 사다리 모델 기반).
        const promoted = state.getCharacter(targetId);
        if (promoted) promoted.achievement = 0;
      }
      const notifies = buildCharacterRefreshNotifies(state, cmd.moveCharacters, { rank: cmd.targetRank, spot: cmd.moveSpot, coupConductOf });
      return { accept: true, targetRank: cmd.targetRank, notifies };
    }

    case COMMAND_RANK_DOWN_CODE: {
      // DEMOTE: validate rank ladder, apply to target_character, broadcast 0x356.
      const cmd = parseInboundRankDown(inner);
      if (!cmd) {
        return { accept: false, reject: 'invalid-rank-down', notifies: [] };
      }
      if (!rankInBounds(cmd.targetRank)) {
        return { accept: false, reject: 'rank-out-of-bounds', notifies: [] };
      }
      if (!ownsCharacter(state, cmd.targetCharacter, connectionId)) {
        return { accept: false, reject: 'not-owner', notifies: [] };
      }
      state.setRank(cmd.targetCharacter, cmd.targetRank, cmd.moveSpot);
      // 캐논 §5.6: 降等 시 功績→100(강등자가 낮은 계급에서 상대순위 최상위로 들어감).
      const demoted = state.getCharacter(cmd.targetCharacter);
      if (demoted) demoted.achievement = 100;
      const notifies = [
        {
          inner: buildNotifyInformationCharacterInner({
            characterId: cmd.targetCharacter, rank: cmd.targetRank, spot: cmd.moveSpot,
            title: characterTitleName(state.getCharacter(cmd.targetCharacter)),
            coupConduct: coupConductOf(cmd.targetCharacter),
          }),
          target: 'all',
        },
      ];
      return { accept: true, targetCharacter: cmd.targetCharacter, targetRank: cmd.targetRank, notifies };
    }

    case COMMAND_SPECIALLY_RANK_UP_CODE: {
      // SPECIAL/mass promotion funded by spending other chars' achievement. Validate the jump rank,
      // debit each down_achievement entry, set the promoted char's rank, broadcast 0x356 for the target
      // (+ each debited char so their merit display updates).
      const cmd = parseInboundSpeciallyRankUp(inner);
      if (!cmd) {
        return { accept: false, reject: 'invalid-specially-rank-up', notifies: [] };
      }
      if (!rankInBounds(cmd.targetGotoRank)) {
        return { accept: false, reject: 'rank-out-of-bounds', notifies: [] };
      }
      if (!ownsCharacter(state, cmd.targetCharacter, connectionId)) {
        return { accept: false, reject: 'not-owner', notifies: [] };
      }
      // 정원캡(§B5 4.4): 抜擢도 목표 계급 정원이 차 있으면 불가(일반 진급과 동일 — 캡은 목표 계급의 제약).
      // 이전엔 抜擢이 canPromoteTo를 건너뛰어 元帥를 정원 초과로 무제한 생성 가능했다.
      {
        const tgt = state.getCharacter(cmd.targetCharacter);
        const faction = normalizeFaction(tgt?.faction);
        if (faction && !canPromoteTo(cmd.targetGotoRank, faction, state.countAtRank(cmd.targetGotoRank, faction, cmd.targetCharacter))) {
          return { accept: false, reject: 'rank-full', notifies: [] };
        }
      }
      // Debit each funder's achievement (clamped at 0). 자기 소유 캐릭터만 펀딩 — 적/타진영 功績을 위조
      // 패킷으로 임의 차감하던 인가 갭을 닫음(소유 아니면 스킵).
      for (const entry of cmd.downAchievement) {
        if (!ownsCharacter(state, entry.character, connectionId)) continue;
        const ch = state.getCharacter(entry.character);
        if (ch) {
          ch.achievement = Math.max(0, ch.achievement - entry.achievement);
        }
      }
      state.setRank(cmd.targetCharacter, cmd.targetGotoRank, cmd.moveSpot || null);
      const notifies = [
        {
          inner: buildNotifyInformationCharacterInner({
            characterId: cmd.targetCharacter, rank: cmd.targetGotoRank, spot: cmd.moveSpot || null,
            title: characterTitleName(state.getCharacter(cmd.targetCharacter)),
            coupConduct: coupConductOf(cmd.targetCharacter),
          }),
          target: 'all',
        },
      ];
      for (const entry of cmd.downAchievement) {
        notifies.push({
          inner: buildNotifyInformationCharacterInner({
            characterId: entry.character, title: characterTitleName(state.getCharacter(entry.character)),
            coupConduct: coupConductOf(entry.character),
          }),
          target: 'all',
        });
      }
      return { accept: true, targetCharacter: cmd.targetCharacter, targetRank: cmd.targetGotoRank, notifies };
    }

    case COMMAND_GRANT_TITLE_CODE:
      return processGrantTitle({ state, connectionId, inner });

    case COMMAND_GRANT_FIEF_CODE:
    case COMMAND_REVOKE_FIEF_CODE:
      return processFief({ state, connectionId, innerCode, inner });

    default:
      return { accept: false, reject: 'unknown-personnel-command', notifies: [] };
  }
}

// ---------------------------------------------------------------------------------------------------
// 작위(叙爵) / 봉토(封土授与·封土直轄) GRANT 어댑터 — imperial-titles.mjs 순수 검증기/적용기를 명령엔진에
// 라우팅한다. RE 확정 와이어 오프셋(작위명 0x0356 titlename @parentage+0x57, 봉토소유 0x031f elem+0x04,
// 캐릭터 spot_owner @0x20)만 사용한다. opcode 자체는 P3(borrowed) — codec 상수 주석 참조.
// ---------------------------------------------------------------------------------------------------

/**
 * 叙爵(작위 수여): validateGrantTitle 게이트(귀족 출신 + 최소 계급) 통과 시 setTitle 후 0x0356을 'all'
 * 브로드캐스트한다. 동맹(alliance)은 작위 체계가 없으므로 거부한다(characterTitleName이 동맹이면 null을
 * 반환하는 것과 정합 — login-session.mjs). ch.rank를 함께 실어 작위 델타가 계급을 0으로 덮지 않게 한다.
 */
function processGrantTitle({ state, connectionId, inner }) {
  const cmd = parseInboundGrantTitle(inner);
  if (!cmd) {
    return { accept: false, reject: 'invalid-grant-title', notifies: [] };
  }
  if (!ownsCharacter(state, cmd.targetCharacter, connectionId)) {
    return { accept: false, reject: 'not-owner', notifies: [] };
  }
  const ch = state.getCharacter(cmd.targetCharacter);
  if (!ch) {
    return { accept: false, reject: 'unknown-character', notifies: [] };
  }
  // 동맹은 작위 없음(P1, 매뉴얼) — 작위 수여는 제국 전용. faction 미지정(중립)은 통과시킨다(테스트/무진영 시드).
  if (normalizeFaction(ch.faction) === 'alliance') {
    return { accept: false, reject: 'alliance-has-no-title', notifies: [] };
  }
  // 와이어 new_title은 사다리 byte(1=공작 .. 7=평민, 0x1008 create-form `title` 인코딩 [코드주석 P3 가정]).
  // validateGrantTitle은 작위 '이름'을 기대하므로 titleName()으로 환산해 게이트에 넘기고, 환산 결과를 그대로
  // 저장한다(characterTitleName→titleName round-trip 일관). 평민(7)/미지정(0)은 작위명이 빈 문자열 → 거부.
  const titleNameResolved = titleName(cmd.newTitle);
  if (!titleNameResolved) {
    return { accept: false, reject: 'title-gate', reason: 'no peerage title for that ladder value', notifies: [] };
  }
  // 게이트: validateGrantTitle은 socialClass==='commoner'면 거부 + newTitle이 사다리에 있어야 함.
  const gate = validateGrantTitle({ target: { socialClass: ch.socialClass, rankId: ch.rank }, newTitle: titleNameResolved });
  if (!gate.ok) {
    return { accept: false, reject: 'title-gate', reason: gate.reason, notifies: [] };
  }
  state.setTitle(cmd.targetCharacter, cmd.newTitle);
  const updated = state.getCharacter(cmd.targetCharacter);
  return {
    accept: true,
    targetCharacter: cmd.targetCharacter,
    newTitle: cmd.newTitle,
    notifies: [
      {
        inner: buildNotifyInformationCharacterInner({
          characterId: cmd.targetCharacter,
          rank: updated?.rank ?? null, // 계급 보존(작위 델타가 rank를 0으로 덮지 않게)
          title: characterTitleName(updated),
        }),
        target: 'all',
      },
    ],
  };
}

/**
 * 封土授与(봉토 수여) / 封土直轄(직할 환수): validateGrantFief 게이트(남작 이상 작위 + 미소유 거점) 통과 시
 * base.owner를 영주 id(직할이면 0)로 바꾸고 lord.fiefs를 갱신한다. 반영 = (1) 캐릭터 0x0356 spot_owner@0x20,
 * (2) 봉토 base의 0x031f ResponseInformationBase owner(elem+0x04) + 영주 세수입(budget[0]@elem+0x13c).
 * RE 확정 오프셋만 사용; 세율×economy 수입식은 P3 튜닝(fiefIncome).
 */
function processFief({ state, connectionId, innerCode, inner }) {
  const grant = innerCode === COMMAND_GRANT_FIEF_CODE;
  const cmd = parseInboundGrantFief(inner);
  if (!cmd) {
    return { accept: false, reject: grant ? 'invalid-grant-fief' : 'invalid-revoke-fief', notifies: [] };
  }
  if (!ownsCharacter(state, cmd.targetCharacter, connectionId)) {
    return { accept: false, reject: 'not-owner', notifies: [] };
  }
  const lord = state.getCharacter(cmd.targetCharacter);
  if (!lord) {
    return { accept: false, reject: 'unknown-character', notifies: [] };
  }
  // 봉토 base는 미리 시드돼 있어야 한다(직할/소유 추적). 미시드면 直轄(owner 0)로 자동 시드한다.
  if (!state.getBase(cmd.baseId)) {
    state.addBase({ id: cmd.baseId, owner: 0 });
  }
  const base = state.getBase(cmd.baseId);

  if (grant) {
    // 게이트: 남작 이상 작위(canHoldFief) + base 미소유. lord.title(사다리 rank)을 titleRank로 환산해 전달.
    const lordTitleRank = typeof lord.title === 'number' ? lord.title : titleRank(lord.title);
    const gate = validateGrantFief({ target: { title: lordTitleRank }, base: { id: base.id, owner: base.owner } });
    if (!gate.ok) {
      return { accept: false, reject: 'fief-gate', reason: gate.reason, notifies: [] };
    }
    const applied = applyGrantFief(base, lord);
    state.setBaseOwner(base.id, applied.base.owner);
    lord.fiefs = applied.lord.fiefs;
  } else {
    // 直轄(revoke): 이 영주가 보유한 봉토만 환수 가능(소유 불일치면 거부).
    if (base.owner !== lord.id) {
      return { accept: false, reject: 'not-lords-fief', notifies: [] };
    }
    const applied = applyRevokeFief(base, lord);
    state.setBaseOwner(base.id, applied.base.owner);
    lord.fiefs = applied.lord.fiefs;
  }

  // 영주 봉토 총수입(P3 튜닝) — 보유 봉토 base의 economy/taxRatePct로 계산해 봉토 base record budget[0]에 싣는다.
  const fiefRecords = (lord.fiefs ?? []).map((id) => state.getBase(id)).filter(Boolean);
  const income = fiefIncome(fiefRecords);
  return {
    accept: true,
    targetCharacter: cmd.targetCharacter,
    baseId: cmd.baseId,
    granted: grant,
    income,
    notifies: [
      // (1) 영주 캐릭터 델타: spot_owner@0x20 = 영주 id(직할이면 0). 계급/작위 보존.
      {
        inner: buildNotifyInformationCharacterInner({
          characterId: cmd.targetCharacter,
          spotOwner: grant ? lord.id : 0,
          rank: lord.rank ?? null,
          title: characterTitleName(lord),
        }),
        target: 'all',
      },
      // (2) 봉토 base 레코드: owner(elem+0x04) = 영주 id, 세수입은 budget[0](elem+0x13c)에 반영(둘 다 P0 오프셋).
      {
        inner: buildResponseInformationBaseInner({
          bases: [{ id: base.id, field04: base.owner & 0xff, budget: [income >>> 0] }],
        }),
        target: 'all',
      },
    ],
  };
}

/**
 * Build one 0x356 NotifyInformationCharacter per id in `moveCharacters` (the refresh list). The first
 * id is the action's primary target and receives the new rank/spot; the rest are plain re-pushes.
 * `coupConductOf`(옵셔널) = charId→0/1 coup_conduct 표시 시드(intelState 미배선이면 null 반환→빌더 0 처리).
 */
function buildCharacterRefreshNotifies(state, moveCharacters, { rank = null, spot = null, coupConductOf = null } = {}) {
  const notifies = [];
  moveCharacters.forEach((id, i) => {
    const ch = state.getCharacter(id);
    notifies.push({
      inner: buildNotifyInformationCharacterInner({
        characterId: id,
        rank: i === 0 ? rank : ch?.rank ?? null,
        spot: i === 0 ? spot : ch?.spot ?? null,
        // A promotion delta must preserve the held peerage title, else the HUD's 작위명 clears on rank-up.
        title: characterTitleName(ch),
        coupConduct: typeof coupConductOf === 'function' ? coupConductOf(id) : null,
      }),
      target: 'all',
    });
  });
  return notifies;
}
