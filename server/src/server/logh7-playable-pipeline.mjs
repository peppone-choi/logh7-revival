// logh7-playable-pipeline.mjs — 출하 코덱/세션으로 로그인→월드→MP 시퀀스
// 데이터 경로는 실 서버와 동일: server/data/logh7-accounts.json, logh7-characters.json

import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';

import {
  decryptBuffer,
  expandChildCodecKey,
  loadChildCodecTables,
} from './logh7-child-codec.mjs';
import {
  build0030Body,
  parse0030Body,
  readInnerCode,
} from './logh7-envelope-0030.mjs';
import {
  KEYSETUP_INNER_CODE,
  REDIRECT_INNER_CODE,
  LOGIN_NG_INNER_CODE,
  buildLoginResponseFrames,
  buildLoginNgResponseFrame,
  buildRedirectInner,
} from './logh7-login-response.mjs';
import {
  CODE_LOBBY_LOGIN_OK,
  buildLobbyLoginOkInner,
} from './logh7-lobby-login.mjs';
import { handleLobbyInner } from './logh7-lobby-session.mjs';
import { createCharacterStore } from './logh7-character-store.mjs';
import { createWorldSession } from './logh7-world-session.mjs';
import {
  CODE_INFO_CHARACTER,
  CODE_INFO_UNIT,
  CODE_SS_CHARACTER_ID,
  CODE_SS_GAME_LOGIN_OK,
  CODE_NOTIFY_MOVED_GRID,
  CODE_CMD_MOVE_GRID,
  CODE_LOBBY_SESSION_LOGIN_OK,
  readMsg32Code,
  msg32Body,
} from './logh7-world-records.mjs';
import { CODE_RESP_INFO_ACCOUNT } from './logh7-character-codec.mjs';
import {
  verifyGin7Login,
  loadAccountRegistry,
  DEFAULT_ACCOUNTS_PATH,
  DEFAULT_CHARACTERS_PATH,
} from './logh7-account-auth.mjs';

/** 대표 GIN7 자격증명 (account inei00 / password dummy) — 기존 테스트·실클라 벡터 */
export const SAMPLE_CREDENTIAL_INNER = Buffer.from(
  '700047494e370001000000070069006e006500690030003000000600640075006d006d00790000',
  'hex',
);

/** 잘못된 비밀번호 GIN7 (account inei00 / password wrong) — fail-closed 검증용 */
export function buildBadPasswordCredentialInner() {
  // 0x7000 + GIN7 + ver1 + flags0 + accountUnits 7 BE + "inei00\0" UTF16BE + passwordUnits LE + "wrong\0" UTF16LE
  // 수동 조립
  const account = 'inei00';
  const password = 'wrong';
  const parts = [];
  const head = Buffer.alloc(12);
  head.writeUInt16BE(0x7000, 0);
  head.write('GIN7', 2, 4, 'ascii');
  head.writeUInt16BE(1, 6);
  head.writeUInt16BE(0, 8);
  head.writeUInt16BE(account.length + 1, 10); // units incl NUL
  parts.push(head);
  const acc = Buffer.alloc((account.length + 1) * 2);
  for (let i = 0; i < account.length; i += 1) acc.writeUInt16BE(account.charCodeAt(i), i * 2);
  parts.push(acc);
  const pwLen = Buffer.alloc(2);
  pwLen.writeUInt16LE(password.length + 1, 0);
  parts.push(pwLen);
  const pw = Buffer.alloc((password.length + 1) * 2);
  for (let i = 0; i < password.length; i += 1) pw.writeUInt16LE(password.charCodeAt(i), i * 2);
  parts.push(pw);
  return Buffer.concat(parts);
}

/**
 * 출하 로그인 경로: 계정 검증 후 성공 프레임 또는 fail-closed NG.
 */
export function runLoginSuccessPath({
  tables = loadChildCodecTables(),
  decipherKey = Buffer.from('5859', 'hex'),
  credentialInner = SAMPLE_CREDENTIAL_INNER,
  frameId = 1,
  accountsPath = DEFAULT_ACCOUNTS_PATH,
} = {}) {
  // 계정 파일 존재 보장
  loadAccountRegistry(accountsPath);

  const auth = verifyGin7Login(credentialInner, accountsPath);
  const decodedBody = (() => {
    try {
      return build0030Body({ id: frameId, inner: credentialInner });
    } catch (error) {
      return null;
    }
  })();

  if (!auth.ok) {
    // fail-closed: 성공 쌍(0x0031+0x7001) 없음. 파싱 가능한 body 면 0x7002, 아니면 거부 사유만.
    let ng = null;
    if (decodedBody) {
      try {
        const { ngFrame, innerCode } = buildLoginNgResponseFrame({
          decodedBody,
          decipherKey,
          tables,
        });
        const ngBody = decryptBuffer(ngFrame.subarray(4), expandChildCodecKey(decipherKey, tables));
        const ngParsed = parse0030Body(ngBody);
        ng = {
          frameBytes: ngFrame.length,
          innerCode: readInnerCode(ngParsed.inner),
          expectedInnerCode: innerCode,
        };
        if (ng.innerCode !== LOGIN_NG_INNER_CODE) {
          throw new Error(`NG code mismatch 0x${ng.innerCode.toString(16)}`);
        }
      } catch {
        ng = { frameBytes: 0, innerCode: null, parseFailed: true };
      }
    }
    return {
      ok: false,
      failClosed: true,
      reason: auth.reason,
      account: auth.account ?? null,
      keysetupInnerCode: null,
      redirectInnerCode: null,
      loginNg: ng,
    };
  }

  // 성공 경로
  const body = build0030Body({ id: frameId, inner: credentialInner });
  const { keysetupFrame, redirectFrame, gin7KeyHex } = buildLoginResponseFrames({
    tables,
    decipherKey,
    decodedBody: body,
    redirectInner: buildRedirectInner({ ip: '127.0.0.1', port: 47900, token: 1 }),
  });

  const ksBody = decryptBuffer(keysetupFrame.subarray(4), expandChildCodecKey(decipherKey, tables));
  const ksParsed = parse0030Body(ksBody);
  const ksInnerCode = readInnerCode(ksParsed.inner);
  if (ksInnerCode !== KEYSETUP_INNER_CODE) {
    throw new Error(`expected keysetup 0x0031, got 0x${ksInnerCode.toString(16)}`);
  }

  const gin7Key = Buffer.from(credentialInner.subarray(2));
  const rdBody = decryptBuffer(redirectFrame.subarray(4), expandChildCodecKey(gin7Key, tables));
  const rdParsed = parse0030Body(rdBody);
  const rdInnerCode = readInnerCode(rdParsed.inner);
  if (rdInnerCode !== REDIRECT_INNER_CODE) {
    throw new Error(`expected redirect 0x7001, got 0x${rdInnerCode.toString(16)}`);
  }

  return {
    ok: true,
    failClosed: false,
    reason: null,
    account: auth.account,
    keysetupInnerCode: ksInnerCode,
    redirectInnerCode: rdInnerCode,
    gin7KeyHex,
    keysetupFrameBytes: keysetupFrame.length,
    redirectFrameBytes: redirectFrame.length,
  };
}

/**
 * 로그인 성공 + 실패(잘못된 비번) + 기형 자격증명을 한 트랜스크립트로.
 */
export function runLoginRoundtripWithFailClosed(options = {}) {
  const accountsPath = options.accountsPath ?? DEFAULT_ACCOUNTS_PATH;
  loadAccountRegistry(accountsPath);

  const success = runLoginSuccessPath({
    ...options,
    credentialInner: SAMPLE_CREDENTIAL_INNER,
    accountsPath,
  });
  const badPassword = runLoginSuccessPath({
    ...options,
    credentialInner: buildBadPasswordCredentialInner(),
    accountsPath,
    frameId: 2,
  });
  const malformed = runLoginSuccessPath({
    ...options,
    credentialInner: Buffer.from('deadbeef', 'hex'),
    accountsPath,
    frameId: 3,
  });

  if (!success.ok) throw new Error(`expected success login, got ${success.reason}`);
  if (badPassword.ok || !badPassword.failClosed) throw new Error('bad password must fail-closed');
  if (malformed.ok || !malformed.failClosed) throw new Error('malformed must fail-closed');

  return {
    ok: true,
    success,
    badPassword,
    malformed,
  };
}

/**
 * 캐릭터 목록 + 월드 진입 + 이동 MP.
 * storePath 기본: 실 서버 DEFAULT_CHARACTERS_PATH (server/data/).
 * isolationPath 가 true 이면 유저 data 를 더럽히지 않도록 동일 스키마의 임시 파일만 사용
 * (검증 스크립트가 명시할 때만 — 기본은 실 경로).
 */
export function runLoginWorldMpSequence({
  storePath = DEFAULT_CHARACTERS_PATH,
  accountsPath = DEFAULT_ACCOUNTS_PATH,
  accountId = 'inei00',
  moveCell = 2597,
  dualSessions = true,
  isolationPath = false,
  /** 테스트 전용: 호출자가 명시한 캐릭터만 시드. 없으면 스토어에 이미 있어야 함(자동 생성 없음). */
  seedCharacter = null,
} = {}) {
  const resolvedStore = isolationPath
    ? join(tmpdir(), `logh7-characters-${randomBytes(4).toString('hex')}.json`)
    : (storePath ?? DEFAULT_CHARACTERS_PATH);

  if (!resolvedStore || typeof resolvedStore !== 'string') {
    throw new Error('storePath required (use DEFAULT_CHARACTERS_PATH)');
  }

  const store = createCharacterStore(resolvedStore);
  const world = createWorldSession({ defaultCell: 2588 });

  const login = runLoginSuccessPath({ accountsPath });
  if (!login.ok) throw new Error(`login failed: ${login.reason}`);

  const lobbyOk = buildLobbyLoginOkInner({ status: 0 });
  if (readInnerCode(lobbyOk) !== CODE_LOBBY_LOGIN_OK) {
    throw new Error('lobby login ok code');
  }

  // 캐릭터 자동 생성 금지. 테스트는 seedCharacter 로 명시 시드, 프로덕션은 스토어/0x1008 만.
  if (seedCharacter) {
    store.addCharacter(accountId, seedCharacter);
  }
  const chars = store.getCharacters(accountId);
  if (chars.length === 0) {
    throw new Error(
      `no characters for account "${accountId}" — refuse auto-create; pass seedCharacter or use 0x1008 create path`,
    );
  }
  const character = chars[0];

  const reqInfo = Buffer.alloc(2);
  reqInfo.writeUInt16BE(0x1000, 0);
  const rosterInner = handleLobbyInner(reqInfo, accountId, store);
  const rosterCode = rosterInner.readUInt16BE(4);
  if (rosterCode !== CODE_RESP_INFO_ACCOUNT) {
    throw new Error(`roster code 0x${rosterCode.toString(16)}`);
  }

  const sessionReq = Buffer.alloc(10);
  sessionReq.writeUInt16BE(0x2009, 0);
  sessionReq.writeUInt32LE(1, 2);
  sessionReq.writeUInt32LE(character.id, 6);
  const session = world.handleSessionLogin({
    connectionId: 1,
    accountId,
    inner: sessionReq,
    character: {
      id: character.id,
      lastname: character.lastname,
      firstname: character.firstname,
      face: character.face,
      power: character.power,
      rank: character.rank,
      unitId: 1,
      cell: 2588,
    },
  });
  if (readInnerCode(session.responseInner) !== CODE_LOBBY_SESSION_LOGIN_OK) {
    throw new Error('session login ok');
  }

  const entered = world.enterWorld({ connectionId: 1 });
  const codes = entered.codes;
  for (const need of [
    CODE_SS_CHARACTER_ID,
    CODE_INFO_CHARACTER,
    CODE_INFO_UNIT,
    CODE_SS_GAME_LOGIN_OK,
    0x0301,
    0x0f01,
    0x0f03,
    0x0315,
  ]) {
    if (!codes.includes(need)) throw new Error(`world entry missing 0x${need.toString(16)}`);
  }
  const charRec = entered.emits.find((i) => readMsg32Code(i) === CODE_INFO_CHARACTER);
  if (msg32Body(charRec).length !== 0x2d4) throw new Error('0x0323 size');
  const unitRec = entered.emits.find((i) => readMsg32Code(i) === CODE_INFO_UNIT);
  if (msg32Body(unitRec).length !== 0xce44) throw new Error('0x0325 size');

  let second = null;
  if (dualSessions) {
    world.seedPlayer({
      connectionId: 2,
      accountId: 'observer',
      characterId: 99,
      unitId: 99,
      cell: 1000,
      inWorld: true,
    });
    second = world.getPlayer(2);
  }

  const moveInner = Buffer.alloc(10);
  moveInner.writeUInt16BE(CODE_CMD_MOVE_GRID, 0);
  moveInner.writeUInt32LE(entered.player.unitId, 2);
  moveInner.writeUInt32LE(moveCell, 6);
  const move = world.handleMoveCommand({ connectionId: 1, inner: moveInner });
  if (move.cell !== moveCell) throw new Error('move cell not applied');
  if (readMsg32Code(move.notify) !== CODE_NOTIFY_MOVED_GRID) throw new Error('notify code');
  if (msg32Body(move.notify).length !== 0x244) throw new Error('0x0b07 size');
  if (dualSessions && !move.recipients.includes(2)) {
    throw new Error('second session did not observe move notify');
  }
  if (world.getPlayer(1).cell !== moveCell) throw new Error('authoritative cell not updated');

  return {
    ok: true,
    storePath: resolvedStore,
    accountsPath,
    login,
    lobbyOkCode: CODE_LOBBY_LOGIN_OK,
    accountId,
    characterId: character.id,
    rosterCode,
    worldEntryCodes: codes,
    worldEntryCodeHex: codes.map((c) => `0x${c.toString(16).padStart(4, '0')}`),
    move: {
      unitId: move.unitId,
      cell: move.cell,
      recipients: move.recipients,
      notifyCode: CODE_NOTIFY_MOVED_GRID,
      notifyBytes: msg32Body(move.notify).length,
    },
    players: world.listPlayers(),
    observer: second,
    eventLog: world.getEventLog(),
  };
}

/** MP 액션을 두 번 연속 실행해 일관성 검증 (동일 셀 시퀀스). */
export function runMpActionTwice({
  cells = [2597, 2601],
  storePath = DEFAULT_CHARACTERS_PATH,
  accountsPath = DEFAULT_ACCOUNTS_PATH,
  seedCharacter = null,
} = {}) {
  const runs = [];
  for (let i = 0; i < cells.length; i += 1) {
    const r = runLoginWorldMpSequence({
      storePath,
      accountsPath,
      moveCell: cells[i],
      dualSessions: true,
      isolationPath: false,
      // 2회차부터는 스토어에 이미 있음 — 1회만 시드
      seedCharacter: i === 0 ? seedCharacter : null,
    });
    runs.push({
      run: i + 1,
      ok: r.ok,
      moveCell: r.move.cell,
      notifyBytes: r.move.notifyBytes,
      recipients: r.move.recipients,
      worldEntryCodes: r.worldEntryCodeHex,
    });
  }
  if (runs.length !== 2) throw new Error('expected 2 runs');
  if (!runs[0].ok || !runs[1].ok) throw new Error('mp run failed');
  if (runs[0].notifyBytes !== runs[1].notifyBytes) throw new Error('notify size inconsistent');
  if (runs[0].worldEntryCodes.join() !== runs[1].worldEntryCodes.join()) {
    throw new Error('world entry codes inconsistent');
  }
  return { ok: true, runs };
}
