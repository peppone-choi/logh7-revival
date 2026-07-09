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
  readMsg32Code,
} from './logh7-world-records.mjs';

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
} = {}) {
  /** @type {Map<number, WorldPlayer>} */
  const players = new Map();
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

    const unitId = character?.flagship ?? character?.unitId ?? nextUnitId;
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

    const emits = buildWorldEntryInners({
      characterId: p.characterId,
      gridUnitId: p.unitId,
      unitCell: p.cell,
      power: seed?.power ?? p.power ?? 0,
      spot: 1,
      lastname: seed?.lastname ?? p.lastname ?? '',
      firstname: seed?.firstname ?? p.firstname ?? '',
      face: Number.isInteger(seed?.face) ? seed.face : (Number.isInteger(p.face) ? p.face : 0),
      rank: Number.isInteger(seed?.rank) ? seed.rank : (Number.isInteger(p.rank) ? p.rank : 0),
      abilities: seedAbilities,
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
  function handleMoveCommand({ connectionId, inner }) {
    const cmd = decodeMoveGridCommand(inner);
    const player = players.get(connectionId);
    if (!player || !player.inWorld) {
      throw new Error('move rejected: not in world');
    }
    const unitId = cmd.unitId || player.unitId;
    const cell = cmd.cell >>> 0;
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
    logEvent('chat', connectionId, { text: cmd.text, recipients });
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
      const result = handleMoveCommand({ connectionId, inner: rawForDecode });
      return {
        kind: 'move',
        cell: result.cell,
        unitId: result.unitId,
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

    // 월드 진입 후 어드미션 핸드셰이크 (NOW LOADING 해제).
    // 8종 월드레코드 수신 후 클라가 0x0304/0x0306/0x0312/0x0314/0x030a/0x030e/0x0310 등
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
