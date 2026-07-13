// logh7-world-session.mjs — 인메모리 권위 월드 세션 (이동/채팅)
//
// 클라 thin-renderer: Command* 수신 → 서버 검증 → Notify* 브로드캐스트.
// 순수 상태 모듈; TCP 는 playable-server / harness 가 담당.

import {
  buildWorldEntryInners,
  buildNotifyMovedGridInner,
  buildGridChatInner,
  decodeMoveGridCommand,
  decodeGridChatCommand,
  decodeLobbySessionLoginReq,
  buildLobbySessionLoginOkInner,
  CODE_CMD_MOVE_GRID,
  CODE_CMD_GRID_CHAT,
  CODE_LOBBY_SESSION_LOGIN_REQ,
  CODE_SS_GAME_LOGIN_REQ,
  listWorldEntryCodes,
  buildAdmissionResponseInner,
  buildGridInitializeSpawnInners,
  buildStaticInformationGridInner,
  buildStaticInformationGridTypeInner,
  readMsg32Code,
  CODE_REQ_STATIC_GRID,
  CODE_REQ_STATIC_GRID_TYPE,
  CODE_REQ_STATIC_BASE,
  CODE_REQ_INFORMATION_BASE,
  CODE_REQ_INFORMATION_INSTITUTION,
  CODE_REQ_INFORMATION_WAREHOUSE,
  CODE_REQ_GRID_INIT,
  CODE_REQ_OUTFIT_INFO,
  buildOutfitInfo032b,
  outfitPracticeFromAbility8,
} from './logh7-world-records.mjs';
import {
  getStrategicGridCells,
  getStrategicPaletteObjects,
} from './logh7-galaxy-placement.mjs';
import { buildDeploymentFleetList } from './logh7-deployment-units.mjs';
import {
  buildStaticInformationBaseFromGalaxy,
  findStaticBase,
  readStaticBaseRequest,
} from './logh7-static-base.mjs';
import { buildResponseInformationBaseInner } from './codec/base-record.mjs';
import { buildResponseInformationInstitutionInner } from './codec/institution-record.mjs';
import {
  buildResponseInformationWarehouseInner,
  decodeRequestInformationWarehouse,
} from './codec/warehouse-record.mjs';

/**
 * @typedef {{
 *   connectionId: number,
 *   accountId: string,
 *   characterId: number,
 *   unitId: number,
 *   cell: number,
 *   inWorld: boolean,
 * }} WorldPlayer
 */

export function createWorldSession({
  defaultCell = 2588,
  worldRedirect = { ip: '127.0.0.1', port: 47900, token: 1 },
  // 시드 캐릭터 조회용(선택). enterWorld 가 0x0323 을 실 캐릭터로 채우는 데 사용한다.
  // 없으면 세션 로그인 때 캐시된 플레이어 필드로 폴백(하위호환).
  characterStore = null,
  // LOGH_STRAT_GRID_EARLY=1: world-ready push 에서 0x0313 grid-type 를 조기 방출(reactive 0x0312
  // 응답과 합쳐 ×2). 스펙 §미방출 3(early-grid) 근거. 기본은 env 로 결정(프로덕션 opt-in).
  stratGridEarly = process.env.LOGH_STRAT_GRID_EARLY === '1',
} = {}) {
  /** @type {Map<number, WorldPlayer>} */
  const players = new Map();
  // 0x0f02(RequestGridInitialize)에 스폰 버스트를 첫 요청에만 주입하기 위한 게이트.
  // 두 번째 이후 0x0f02 는 plain 0x0f03 ack 만 돌려준다(중복 스폰 방지).
  /** @type {Set<number>} */
  const gridInitSpawned = new Set();
  /** @type {Array<{seq:number, type:string, from:number, payload:object}>} */
  const eventLog = [];
  let seq = 0;
  let nextUnitId = 1;

  function logEvent(type, from, payload) {
    seq += 1;
    const entry = { seq, type, from, payload };
    eventLog.push(entry);
    return entry;
  }

  /**
   * 세션 선택(0x2009) → 0x200a.
   *
   * 두 경로:
   *  A) 기존 캐릭 로그인: character/id 있음 → player 등록, 호출측이 enterWorld 가능
   *  B) 캐릭 생성: 세션만 선택 (live 2026-07-09 innerLen=4) → 0x200a 만 돌려
   *     생성 폼이 이어지게 함. 더미 캐릭 합성·월드 진입 금지(황제 버그 방지).
   */
  function handleSessionLogin({ connectionId, accountId, inner, character }) {
    const req = decodeLobbySessionLoginReq(inner);
    const characterId = Number(character?.id ?? req.characterId ?? 0) || 0;
    const sessionId = Number(req.sessionId ?? 0) || 0;
    const createPending = !(Number.isInteger(characterId) && characterId > 0);

    if (createPending) {
      // 세션 id 없으면 피커 오클릭 — 그래도 클라 폼 진입을 막지 않기 위해 0x200a 는 보낸다.
      // 생성 경로는 로비 연결을 유지한 채 message32 0x200a 를 받는다
      // (raw 월드 리다이렉트는 월드 진입용; 라이브에서 raw 후 폼 미진입·공지 복귀).
      const pending = {
        connectionId,
        accountId: String(accountId ?? ''),
        characterId: 0,
        sessionId,
        unitId: 0,
        cell: defaultCell,
        inWorld: false,
        createPending: true,
        lastname: '',
        firstname: '',
        power: 0,
        face: 0,
        rank: 0,
        ability8: null,
      };
      players.set(connectionId, pending);
      logEvent('session-login-create-pending', connectionId, { sessionId });
      return {
        player: pending,
        createPending: true,
        responseInner: buildLobbySessionLoginOkInner(worldRedirect),
        responseIsMsg32: true,
      };
    }

    // 영속 캐릭터가 보유한 flagship/unit id를 우선한다. 없을 때만 새 세션 id를 할당한다.
    const storedUnitId = Number(character?.flagship ?? character?.unitId);
    const unitId = Number.isInteger(storedUnitId) && storedUnitId > 0 ? storedUnitId : nextUnitId;
    if (unitId >= nextUnitId) nextUnitId = unitId + 1;

    const player = {
      connectionId,
      accountId: String(accountId ?? ''),
      characterId,
      sessionId,
      unitId,
      cell: character?.cell ?? defaultCell,
      inWorld: false,
      createPending: false,
      lastname: character?.lastname ?? '',
      firstname: character?.firstname ?? '',
      power: character?.power ?? 0,
      face: character?.face ?? 0,
      rank: character?.rank ?? 0,
      ability8: Array.isArray(character?.ability8) ? character.ability8.slice(0, 8) : null,
    };
    players.set(connectionId, player);
    logEvent('session-login', connectionId, { characterId, unitId, sessionId });

    // M3 확정: mps 트랜스포트는 인바운드 앱 메시지를 message32 유닛으로만 받는다.
    // raw 0x200a 는 recv 콜백 도달 전 드롭 → 클라가 리다이렉트를 못 받아 침묵(캐릭터 선택 잔류).
    // 따라서 기존캐릭 경로도 message32 로 보낸다(create-pending 경로와 동일).
    const redirect = buildLobbySessionLoginOkInner(worldRedirect);
    return {
      player,
      createPending: false,
      responseInner: redirect, // message32 0x200a
      responseIsMsg32: true,
    };
  }

  /**
   * account 로 등록된 세션 플레이어를 찾는다(재접속 재바인딩용).
   * 실제 캐릭터 보유 플레이어를 우선, 없으면 create-pending 이라도 반환(가드가 거부).
   */
  function findSessionPlayerByAccount(accountId) {
    if (!accountId) return null;
    const acct = String(accountId);
    let fallback = null;
    for (const p of players.values()) {
      if (p.accountId !== acct) continue;
      if (!p.createPending && p.characterId > 0) return p;
      if (!fallback) fallback = p;
    }
    return fallback;
  }

  /**
   * 월드 진입: 필수 info 레코드 방출 + inWorld=true.
   * SSGameLogin(0x0205) 또는 명시적 enter 호출로 사용.
   *
   * 실클라는 월드 진입 시 로비 소켓을 닫고 새 소켓으로 재접속하므로 connectionId 가
   * 세션로그인 때와 달라진다. 현재 connectionId 에 플레이어가 없으면 account 로
   * 등록된 세션 플레이어를 찾아 현재 connectionId 로 재바인딩한다(플레이어 맵 키 이동).
   */
  function enterWorld({ connectionId, characterId, accountId } = {}) {
    let player = players.get(connectionId);
    if (!player) {
      const rebind = findSessionPlayerByAccount(accountId);
      if (rebind) {
        const fromConnectionId = rebind.connectionId;
        players.delete(fromConnectionId);
        rebind.connectionId = connectionId;
        players.set(connectionId, rebind);
        logEvent('world-rebind', connectionId, {
          fromConnectionId,
          accountId: rebind.accountId,
          characterId: rebind.characterId,
        });
        player = rebind;
      }
    }
    // 캐릭터/세션 자동 생성 금지. handleSessionLogin 으로 등록된(또는 재바인딩된) 플레이어만 월드 진입.
    if (!player) {
      throw new Error(
        `enterWorld: no session player for connection ${connectionId} — refuse synthetic character`,
      );
    }
    if (player.createPending || !(player.characterId > 0 || characterId > 0)) {
      throw new Error(
        `enterWorld: create-pending session (no real character) for connection ${connectionId}`,
      );
    }
    const p = player;
    if (characterId) p.characterId = characterId;
    p.createPending = false;
    p.inWorld = true;

    // 0x0323 실 캐릭터 조회(빈 오브젝트 테이블 크래시 해소): characterStore 가 있으면
    // account 의 실 시드 캐릭터를 characterId 로 찾아 실값(power/ability/이름)을 인코딩한다.
    // 스토어가 없거나 조회 실패면 세션 로그인 때 캐시된 플레이어 필드로 폴백.
    let seed = null;
    if (characterStore && typeof characterStore.getCharacters === 'function' && p.accountId) {
      try {
        const chars = characterStore.getCharacters(p.accountId) ?? [];
        seed = chars.find((c) => Number(c?.id) === Number(p.characterId)) ?? chars[0] ?? null;
      } catch {
        seed = null;
      }
    }
    const seedAbilities = Array.isArray(seed?.ability8) ? seed.ability8 : null;
    if (seed) {
      p.power = Number.isInteger(seed.power) ? seed.power : p.power;
      p.lastname = seed.lastname ?? p.lastname;
      p.firstname = seed.firstname ?? p.firstname;
      p.face = Number.isInteger(seed.face) ? seed.face : p.face;
      p.rank = Number.isInteger(seed.rank) ? seed.rank : p.rank;
      p.ability8 = seedAbilities ? seedAbilities.slice(0, 8) : p.ability8;
    }

    const selectedBase = findStaticBase({ cell: p.cell });
    // 0x0325 유닛 레지스트리 충전: 플레이어 unit[0] + NPC 초기 배치 함대(제국12+동맹12).
    // 빈 레지스트리(@0x7db3c8 activeCount=0) → 마커 클릭 null-deref 크래시 해소.
    const fleets = buildDeploymentFleetList({
      unitId: p.unitId,
      cell: p.cell,
      characterId: p.characterId,
      faction: seed?.power ?? p.power ?? 0,
      spotResolverBase: selectedBase?.id ?? 0,
    });

    const emits = buildWorldEntryInners({
      characterId: p.characterId,
      gridUnitId: p.unitId,
      unitCell: p.cell,
      power: seed?.power ?? p.power ?? 0,
      spot: selectedBase?.id ?? 0,
      fleets,
      lastname: seed?.lastname ?? p.lastname ?? '',
      firstname: seed?.firstname ?? p.firstname ?? '',
      face: Number.isInteger(seed?.face) ? seed.face : (Number.isInteger(p.face) ? p.face : 0),
      rank: Number.isInteger(seed?.rank) ? seed.rank : (Number.isInteger(p.rank) ? p.rank : 0),
      abilities: seedAbilities ?? p.ability8,
      officerCount: Number.isInteger(p.officerCount) ? p.officerCount : 0,
    });
    logEvent('world-enter', connectionId, {
      characterId: p.characterId,
      unitId: p.unitId,
      codes: listWorldEntryCodes(emits),
    });
    return { player: { ...p }, emits, codes: listWorldEntryCodes(emits) };
  }

  /**
   * 권위 이동: 0x0b01 → 상태 갱신 + 0x0b07 브로드캐스트 대상 목록.
   */
  function handleMoveCommand({ connectionId, accountId = null, inner }) {
    const cmd = decodeMoveGridCommand(inner);
    const player = players.get(connectionId);
    if (!player || !player.inWorld) {
      throw new Error('move rejected: not in world');
    }
    if (accountId == null || String(accountId).trim() === '' || !player.accountId) {
      throw new Error('move rejected: account required');
    }
    if (player.accountId !== String(accountId)) {
      throw new Error('move rejected: account not owned');
    }
    const routeCellCandidate = Number(cmd.fields?.routeCellCandidate);
    const fallbackRaw = process.env.LOGH_DEV_GRID_MOVE_FALLBACK_CELL;
    const configuredFallback = typeof fallbackRaw === 'string' && fallbackRaw.trim() !== ''
      ? Number(fallbackRaw)
      : Number.NaN;
    const fallbackCell = Number.isInteger(configuredFallback) && configuredFallback >= 0 && configuredFallback < 5000
      ? configuredFallback
      : null;
    const hasRouteCell = Number.isInteger(routeCellCandidate) && routeCellCandidate >= 0 && routeCellCandidate < 5000;
    if (cmd.unresolved && !hasRouteCell && fallbackCell === null) {
      throw new Error('move rejected: unresolved grid target');
    }
    const unitId = cmd.unitId || player.unitId;
    const cell = cmd.unresolved ? (hasRouteCell ? routeCellCandidate : fallbackCell) : cmd.cell >>> 0;
    // live 31-byte SendWarp의 범위 내 route cell은 decoder가 확정한 목적지로 취급한다.
    const cellSource = cmd.format === 'sendwarp-live-v1' && !cmd.unresolved
      ? 'decoded-route-cell'
      : cmd.unresolved
        ? (hasRouteCell ? 'route-candidate-qa-gated' : 'configured-fallback-qa-gated')
        : 'decoded-cell';
    if (!Number.isInteger(cell) || cell < 0 || cell >= 5000) {
      throw new Error('move rejected: invalid grid cell');
    }
    // 소유 unit 만 이동 (다른 unitId 요청 시 거부)
    if (unitId !== player.unitId) {
      throw new Error(`move rejected: unit ${unitId} not owned by connection ${connectionId}`);
    }
    player.cell = cell;
    const notify = buildNotifyMovedGridInner({
      units: [{ unitId, cell }],
      header: { dword2: connectionId, dword3: cell },
    });
    const recipients = [...players.values()].filter((p) => p.inWorld).map((p) => p.connectionId);
    logEvent('move', connectionId, { unitId, cell, recipients });
    return {
      unitId,
      cell,
      cellSource,
      routeCellCandidate: hasRouteCell ? routeCellCandidate : null,
      configuredFallback: fallbackCell,
      unresolved: !!cmd.unresolved,
      notify,
      recipients,
      playersSnapshot: [...players.values()].map((p) => ({ ...p })),
    };
  }

  /**
   * 권위 채팅: 0x0f1c → 전 월드 세션에 동일 페이로드 브로드캐스트.
   */
  function handleChatCommand({ connectionId, inner }) {
    const cmd = decodeGridChatCommand(inner);
    const player = players.get(connectionId);
    if (!player || !player.inWorld) {
      throw new Error('chat rejected: not in world');
    }
    const notify = buildGridChatInner({
      text: cmd.text,
      channel: cmd.channel,
      time: cmd.time || Date.now() & 0xffffffff,
      castType: cmd.castType,
    });
    const recipients = [...players.values()].filter((p) => p.inWorld).map((p) => p.connectionId);
    logEvent('chat', connectionId, { textLength: cmd.text.length, recipients });
    return { text: cmd.text, notify, recipients };
  }

  /**
   * 인월드 inner 라우터. 응답 목록 { targets, inner, isMsg32 }[] 반환.
   * 알 수 없는 코드는 null (호출자가 silent 또는 로비만 처리).
   */
  function handleWorldInner({ connectionId, accountId, inner }) {
    const buf = Buffer.isBuffer(inner) ? inner : Buffer.from(inner);
    if (buf.length < 2) throw new RangeError('world inner too short');
    // message32 로 들어온 경우 code@4
    let code;
    let rawForDecode = buf;
    if (buf.length >= 6 && buf.readUInt32LE(0) === 0) {
      code = buf.readUInt16BE(4);
      // C→S 는 raw 가 정상; message32 로 오면 body 만 붙여 raw 재구성
      rawForDecode = Buffer.alloc(2 + buf.length - 6);
      rawForDecode.writeUInt16BE(code, 0);
      buf.copy(rawForDecode, 2, 6);
    } else {
      code = buf.readUInt16BE(0);
    }

    if (code === CODE_LOBBY_SESSION_LOGIN_REQ) {
      const result = handleSessionLogin({ connectionId, accountId, inner: rawForDecode });
      return {
        kind: 'session-login',
        responses: [{ targets: [connectionId], inner: result.responseInner, isMsg32: false }],
      };
    }

    if (code === CODE_SS_GAME_LOGIN_REQ) {
      const { emits, codes, player } = enterWorld({ connectionId, accountId });
      return {
        kind: 'world-enter',
        player,
        codes,
        responses: emits.map((innerMsg) => ({
          targets: [connectionId],
          inner: innerMsg,
          isMsg32: true,
        })),
      };
    }

    if (code === CODE_CMD_MOVE_GRID) {
      const result = handleMoveCommand({ connectionId, accountId, inner: rawForDecode });
      return {
        kind: 'move',
        cell: result.cell,
        unitId: result.unitId,
        cellSource: result.cellSource,
        routeCellCandidate: result.routeCellCandidate,
        configuredFallback: result.configuredFallback,
        unresolved: result.unresolved,
        responses: [
          {
            targets: result.recipients,
            inner: result.notify,
            isMsg32: true,
          },
        ],
      };
    }

    if (code === CODE_CMD_GRID_CHAT) {
      const result = handleChatCommand({ connectionId, inner: rawForDecode });
      return {
        kind: 'chat',
        text: result.text,
        responses: [
          {
            targets: result.recipients,
            inner: result.notify,
            isMsg32: true,
          },
        ],
      };
    }

    // 0x0314(RequestStaticInformationGrid) 처리: static-info(0x0315 그리드)만 돌려준다.
    //
    // ★핵심(월드-init 핸드셰이크 복원): 0x0314 에 world-ready push/0x0f03 을 조기 전송하지 않는다.
    //   0x0f03 을 여기서 실으면 클라가 0x0f00→0x0f01→0x0f02→0x0f03 월드-init 핸드셰이크를 건너뛰고
    //   NOW LOADING 에 정지한다(라이브: 클라 수신 0x0304/0x0306/0x0314 후 무요청 정지). 0x0314 는
    //   static-info walk 의 reactive 응답일 뿐 — 스폰은 클라가 스스로 밟는 0x0f02 에 주입한다.
    //
    // reactive 0x0315 는 빈 보드가 아니라 플레이어 함대 cell 을 SPACE(1)로 채운다. value=1 空間은
    //   klass=0 비-마커 terrain — 클라가 앞선 0x0312→0x0313(DEFAULT_SECTOR_GRID_TYPES)에서 이미 받은
    //   팔레트 index 라 별도 팔레트 방출 없이 해석된다(팬텀 성계 dot 없음). 함대 렌더/선택은 0x0325 가
    //   담당하고 cell 은 항행가능 표식일 뿐. 플레이어 없으면 빈 보드 폴백(크래시 방지).
    // 0x0312(RequestStaticInformationGridType) → 0x0313: 정본 갤럭시 팔레트(터레인3 + 성계85 klass=3).
    //   기존 DEFAULT_SECTOR_GRID_TYPES(터레인 3종, 마커 0) 대신 실 성계 오브젝트 테이블을 싣는다.
    //   run-once 스테이징 복사(FUN_004c5350) 전에 이 팔레트가 resident 여야 셀값→마커 해석이 성립.
    if (code === CODE_REQ_STATIC_GRID_TYPE) {
      const typeResp = buildStaticInformationGridTypeInner({ objects: getStrategicPaletteObjects() });
      return {
        kind: 'admission',
        reqCode: code,
        respCode: readMsg32Code(typeResp),
        responses: [{ targets: [connectionId], inner: typeResp, isMsg32: true }],
      };
    }

    if (code === CODE_REQ_STATIC_GRID) {
      const player = players.get(connectionId);
      // 정본 갤럭시 셀(항법공간 + 성계 마커) + 플레이어 함대 cell(SPACE=1, 항행표식).
      const extra = (player && player.unitId > 0 && player.characterId > 0)
        ? [{ cell: player.cell, value: 1 }] // TERRAIN SPACE=1 (klass=1 비-마커)
        : [];
      const cells = getStrategicGridCells(extra);
      const gridResp = buildStaticInformationGridInner({ cells });
      return {
        kind: 'admission',
        reqCode: code,
        respCode: readMsg32Code(gridResp),
        responses: [{ targets: [connectionId], inner: gridResp, isMsg32: true }],
      };
    }

    // 0x031c(RequestStaticInformationBase) → 0x031d: galaxy.json 시스템 정적 마스터.
    // 요청의 선택 id/cell은 첫 레코드로 우선하고, 나머지 시스템도 같은 순서로 붙인다. 0x031d
    // body는 고정 0x520c이므로 85개 시스템 전체가 항상 같은 프레임 안에 들어간다.
    if (code === CODE_REQ_STATIC_BASE) {
      const request = readStaticBaseRequest(rawForDecode);
      const staticBaseResp = buildStaticInformationBaseFromGalaxy(request);
      return {
        kind: 'admission',
        reqCode: code,
        respCode: readMsg32Code(staticBaseResp),
        responses: [{ targets: [connectionId], inner: staticBaseResp, isMsg32: true }],
      };
    }

    // 0x031e/0x0320은 0x031d와 같은 base id로 조인한다. 요청 selector가 있으면 우선하고,
    // 없으면 현재 플레이어 cell을 사용한다. 매칭되지 않는 cell에 id=1을 합성하지 않는다.
    if (code === CODE_REQ_INFORMATION_BASE || code === CODE_REQ_INFORMATION_INSTITUTION) {
      const request = readStaticBaseRequest(rawForDecode);
      const player = players.get(connectionId);
      const fallbackCell = request.selectorStatus === 'absent' ? player?.cell ?? null : null;
      const selected = findStaticBase({
        systemId: request.systemId,
        cell: request.cell ?? fallbackCell,
      });
      const response = code === CODE_REQ_INFORMATION_BASE
        ? buildResponseInformationBaseInner({ bases: selected ? [{ id: selected.id }] : [] })
        : buildResponseInformationInstitutionInner({
          institutions: selected ? [{ id: selected.id, institutions: [] }] : [],
        });
      return {
        kind: 'admission',
        reqCode: code,
        respCode: readMsg32Code(response),
        responses: [{ targets: [connectionId], inner: response, isMsg32: true }],
      };
    }

    // 0x0326은 송신 serializer(0x40c2d0)가 base/outfit 두 u32LE를 정확히 8바이트로 보낸다.
    // 선택 base가 정적 catalog에 있을 때만 조인하고, 재고 정본이 없으므로 base 외 값은 P3 0/empty다.
    // malformed/unknown selector도 player cell로 대체하지 않고 빈 0x0327 하나로 ring을 닫는다.
    if (code === CODE_REQ_INFORMATION_WAREHOUSE) {
      const request = decodeRequestInformationWarehouse(rawForDecode);
      const selected = request ? findStaticBase({ systemId: request.base }) : null;
      const response = buildResponseInformationWarehouseInner(selected ? { base: selected.id } : {});
      return {
        kind: 'admission',
        reqCode: code,
        respCode: readMsg32Code(response),
        responses: [{ targets: [connectionId], inner: response, isMsg32: true }],
      };
    }

    // 0x0f02(RequestGridInitialize) 처리: 첫 요청에 플레이어 스폰 버스트를 주입한다(G164 정본).
    //
    // 근거: 5bd249c logh7-login-session.mjs 2095~ G164 스폰 순서. 직전 0x0f01(WorldInitialize_OK)
    //   world-init reset 이 char count(client+0x36a5dc)를 0 으로 지우므로, 0x0f02 에서 0x0323 을
    //   재전송해 count 를 1 로 복구하고 0x0f03(GridInitialize_OK)로 gridInitialized 를 flip 해 렌더를
    //   트리거한다. 순서: [0x0204 + 0x0325 + 0x0323] → grid extras(0x0313 + 0x0315 플레이어 cell)
    //   → 상세 source(0x031f + 0x0321) → 0x0f03(core 마지막) → 0x0356(post-load delta).
    // 첫 0x0f02에만 — 이후엔 plain 0x0f03 ack.
    // 플레이어 없거나 실 유닛/캐릭터 미보유면 합성 스폰 금지 → plain 0x0f03 폴백.
    if (code === CODE_REQ_GRID_INIT) {
      const player = players.get(connectionId);
      if (player && player.unitId > 0 && player.characterId > 0 && !gridInitSpawned.has(connectionId)) {
        gridInitSpawned.add(connectionId);
        const selectedBase = findStaticBase({ cell: player.cell });
        const spawnInners = buildGridInitializeSpawnInners({
          characterId: player.characterId,
          unitId: player.unitId,
          unitCell: player.cell,
          power: player.power ?? 0,
          spot: selectedBase?.id ?? 0,
          lastname: player.lastname ?? '',
          firstname: player.firstname ?? '',
          face: Number.isInteger(player.face) ? player.face : 0,
          rank: Number.isInteger(player.rank) ? player.rank : 0,
          abilities: Array.isArray(player.ability8) ? player.ability8 : null,
          officerCount: Number.isInteger(player.officerCount) ? player.officerCount : 0,
          // 정본 갤럭시 팔레트/셀 — 스폰 경로가 SPACE-only 로 스테이징을 덮어 마커를 지우지 않게 한다.
          paletteObjects: getStrategicPaletteObjects(),
          staticCells: getStrategicGridCells([{ cell: player.cell, value: 1 }]),
          // 0x0325 유닛 레지스트리 충전(플레이어 unit[0] + NPC 함대) — 그리드진입 시 레지스트리를
          // 실 유닛으로 채워 마커/오브젝트 클릭 null-deref(FUN_004c9a80) 크래시를 해소한다.
          fleets: buildDeploymentFleetList({
            unitId: player.unitId,
            cell: player.cell,
            characterId: player.characterId,
            faction: player.power ?? 0,
            spotResolverBase: selectedBase?.id ?? 0,
          }),
          baseId: selectedBase?.id ?? null,
        });
        logEvent('grid-init-spawn', connectionId, { codes: listWorldEntryCodes(spawnInners) });
        return {
          kind: 'grid-init-spawn',
          reqCode: code,
          responses: spawnInners.map((inner) => ({ targets: [connectionId], inner, isMsg32: true })),
        };
      }
      const ackInner = buildAdmissionResponseInner(code); // plain 0x0f03 (status=1) ack
      return {
        kind: 'admission',
        reqCode: code,
        respCode: readMsg32Code(ackInner),
        responses: [{ targets: [connectionId], inner: ackInner, isMsg32: true }],
      };
    }

    // 0x032a(RequestInformationOutfit) → 0x032b: 旗艦情報/편성 팝업. 플레이어 자기 편성으로 응답.
    //
    // 근거: docs/reference/legacy-evidence/logh7-032a-flagship-wire.md. 요청 5바이트 필드는
    //   미확정(RE unknown) → 파싱하지 않고 플레이어 자기 outfit 으로 응답(RE §5). count≥1 필수.
    // element[0] 값 소스(근거 있는 것만, 날조 금지):
    //   id      = player.unitId (0x0325 unit[0].id = gridUnitId = flagship 링크 대상)
    //   camp    = seed/player faction (진영)
    //   연성치   = outfitPracticeFromAbility8: 指揮/攻撃/防御 3종만 시드 ability8 매핑, 나머지 0
    //   kind/power/index/achievement/strategy_id = 근거 없어 0.
    // 플레이어 미보유/미진입이면 합성 금지 → null(fail-closed). 라우팅 인식은
    //   ADMISSION_DEDICATED_BUILDERS[0x032a] 로 유지되나 실제 응답은 여기서 생성한다.
    if (code === CODE_REQ_OUTFIT_INFO) {
      const player = players.get(connectionId);
      if (!player || !player.inWorld || !(player.characterId > 0)) {
        return null;
      }
      // 시드 ability8 조회(enterWorld 와 동일 경로). 없으면 연성치 0.
      let seed = null;
      if (characterStore && typeof characterStore.getCharacters === 'function' && player.accountId) {
        try {
          const chars = characterStore.getCharacters(player.accountId) ?? [];
          seed = chars.find((c) => Number(c?.id) === Number(player.characterId)) ?? chars[0] ?? null;
        } catch {
          seed = null;
        }
      }
      const ability8 = Array.isArray(seed?.ability8) ? seed.ability8 : null;
      const outfitResp = buildOutfitInfo032b({
        outfits: [{
          id: player.unitId, // 자기 함대 id (0x0325 unit[0].id 와 동일)
          camp: seed?.power ?? player.power ?? 0, // 진영/faction
          practice: outfitPracticeFromAbility8(ability8),
        }],
      });
      return {
        kind: 'admission',
        reqCode: code,
        respCode: readMsg32Code(outfitResp),
        responses: [{ targets: [connectionId], inner: outfitResp, isMsg32: true }],
      };
    }

    // 월드 진입 후 어드미션 핸드셰이크 (NOW LOADING 해제).
    // 8종 월드레코드 수신 후 클라가 0x0304/0x0306/0x0312/0x030a/0x030e/0x0310 등
    // 페이로드 없는 부트스트랩 요청을 보낸다. 대응 응답(code+1)을 안 주면 영구 정지.
    // 근거: docs/reference/restored-from-git/logh7-inworld-progress.md P27/P29.
    const admissionInner = buildAdmissionResponseInner(code);
    if (admissionInner) {
      return {
        kind: 'admission',
        reqCode: code,
        respCode: readMsg32Code(admissionInner),
        responses: [{ targets: [connectionId], inner: admissionInner, isMsg32: true }],
      };
    }

    return null;
  }

  function getPlayer(connectionId) {
    const p = players.get(connectionId);
    return p ? { ...p } : null;
  }

  function listPlayers() {
    return [...players.values()].map((p) => ({ ...p }));
  }

  function getEventLog() {
    return eventLog.slice();
  }

  /** 테스트용: 플레이어를 월드에 직접 배치 */
  /** 테스트/진단용 명시 주입만. 더미 이름·id 자동 채우기 없음. */
  function seedPlayer(player) {
    if (!Number.isInteger(player?.connectionId)) {
      throw new Error('seedPlayer: connectionId required');
    }
    if (!Number.isInteger(player?.characterId) || player.characterId <= 0) {
      throw new Error('seedPlayer: characterId required (no synthetic default)');
    }
    const unitId = Number.isInteger(player.unitId) ? player.unitId : nextUnitId;
    if (unitId >= nextUnitId) nextUnitId = unitId + 1;
    const p = {
      connectionId: player.connectionId,
      accountId: String(player.accountId ?? ''),
      characterId: player.characterId,
      unitId,
      cell: player.cell ?? defaultCell,
      inWorld: player.inWorld ?? true,
      lastname: player.lastname ?? '',
      firstname: player.firstname ?? '',
      power: player.power ?? 0,
      face: player.face ?? 0,
      rank: player.rank ?? 0,
      ability8: Array.isArray(player.ability8) ? player.ability8.slice(0, 8) : null,
    };
    players.set(p.connectionId, p);
    return { ...p };
  }

  return {
    handleSessionLogin,
    enterWorld,
    handleMoveCommand,
    handleChatCommand,
    handleWorldInner,
    getPlayer,
    listPlayers,
    getEventLog,
    seedPlayer,
  };
}
