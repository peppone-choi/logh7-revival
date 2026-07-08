// logh7-lobby-session.mjs — 로비 세션 inner 메시지 라우터
//
// redirect(0x7001) 이후 클라이언트가 연결하는 계정/캐릭터 세션.
// 0x0030 봉투 복호 이후의 "inner" 버퍼를 받아 응답 inner를 반환한다.
//
// S→C message32 형식: [u32 LE 0][u16 BE code][body]  ← codec buildMsg32Inner 동일
//
// 미확정 항목 (RE 추가 확인 필요):
//   - 0x1001 (ResponseInformationAccount) body 레이아웃: 0x1c0 bytes라는 단서만 있음.
//     현재 zero-filled stub. [TODO-1001]
//   - 0x1005 (ResponseCharEntryState) body 레이아웃: 0x20 bytes라는 단서만 있음.
//     현재 zero-filled stub. [TODO-1005]
//
// 라우팅 지원 코드:
//   C→S: 0x1000, 0x1004, 0x1006, 0x1007, 0x1008, 0x2008
//   S→C: 0x1001, 0x1005, 0x1006 echo, 0x1007 echo, 0x1008 ok, 0x2008 ok

import {
  CODE_REQ_INFO_ACCOUNT,
  CODE_RESP_INFO_ACCOUNT,
  CODE_REQ_CHAR_ENTRY_STATE,
  CODE_RESP_CHAR_ENTRY_STATE,
  CODE_CMD_ORIGINAL_CHARGE,
  CODE_CMD_EXTENSION_CHARGE,
  CODE_CMD_GENERATE_CHARGE,
  CODE_LOBBY_CMD_DELETE_CHAR,
  decodeReqInfoAccount,
  encodeResponseInfoAccount,
  decodeOriginalCharReq,
  encodeOriginalCharOk,
  decodeExtensionCharReq,
  encodeExtensionCharOk,
  decodeGenerateCharReq,
  encodeGenerateCharOk,
  decodeLobbyDeleteCharReq,
  encodeLobbyDeleteCharOk,
  readCharMsgCode,
} from './logh7-character-codec.mjs';
import {
  CODE_LOBBY_SESSION_INIT,
  CODE_LOBBY_LOGIN_REQUEST,
  decodeLobbySessionInit,
  decodeLobbyLoginRequest,
  buildLobbyLoginOkInner,
} from './logh7-lobby-login.mjs';

// ─── 내부 헬퍼 ────────────────────────────────────────────────────────────────

/**
 * message32 inner 조립: [u32 LE 0][u16 BE code][body]
 * codec 내부 buildMsg32Inner와 동일 구조.
 */
function buildMsg32(code, body) {
  const out = Buffer.allocUnsafe(6 + body.length);
  out.writeUInt32LE(0, 0);
  out.writeUInt16BE(code, 4);
  body.copy(out, 6);
  return out;
}

// ─── 핸들러 맵 ────────────────────────────────────────────────────────────────

/**
 * 로비 inner 메시지를 라우팅한다.
 *
 * @param {Buffer} inner       C→S inner (code prefix 포함)
 * @param {string|number} accountId   세션 계정 식별자
 * @param {object} store       createCharacterStore 반환 store
 * @returns {Buffer}           S→C message32 inner (응답 없는 코드는 null)
 */
export function handleLobbyInner(inner, accountId, store) {
  const code = readCharMsgCode(inner); // C→S: code at offset 0

  switch (code) {
    case CODE_LOBBY_SESSION_INIT:
      return _handleLobbySessionInit(inner);

    case CODE_LOBBY_LOGIN_REQUEST:
      return _handleLobbyLoginRequest(inner);

    case CODE_REQ_INFO_ACCOUNT:
      return _handleReqInfoAccount(inner, accountId, store);

    case CODE_REQ_CHAR_ENTRY_STATE:
      return _handleReqCharEntryState(inner);

    case CODE_CMD_ORIGINAL_CHARGE:
      return _handleOriginalCharge(inner);

    case CODE_CMD_EXTENSION_CHARGE:
      return _handleExtensionCharge(inner);

    case CODE_CMD_GENERATE_CHARGE:
      return _handleGenerateCharge(inner, accountId, store);

    case CODE_LOBBY_CMD_DELETE_CHAR:
      return _handleDeleteChar(inner, accountId, store);

    default:
      throw new RangeError(
        `handleLobbyInner: 알 수 없는 코드 0x${code.toString(16).padStart(4, '0')}`
      );
  }
}

// ─── 0x0020 LobbySessionInit → (무응답) ──────────────────────────────────────
//
// 로비 재접속 후 클라가 보내는 첫 inner. 서버는 즉시 응답하지 않는다(라이브 근거: G143 +
// trace conn2 — 무응답이 정상이며 클라는 이어서 0x2000 LobbyLoginRequest 를 보낸다).
// 여기서는 프레임 유효성만 검증하고 null(응답 없음)을 반환한다.
function _handleLobbySessionInit(inner) {
  decodeLobbySessionInit(inner); // code/셀렉터 검증
  return null; // silent
}

// ─── 0x2000 LobbyLoginRequest → 0x2001 LobbyLoginOK ──────────────────────────
//
// GIN7 version 4 자격증명(LE). 서버는 0x2001 LobbyLoginOK(raw inner [u16BE 0x2001][u16BE 0])
// 를 회신해야 클라가 다음 단계(0x1000 계정 로스터 요청)로 진행한다.
// ★반환값은 message32 래핑이 아닌 raw inner 다(Input_LobbyLoginOK 는 코드 뒤 2바이트만 읽음).
// 전송 계층이 이 inner 를 0x0030 봉투로 감싸 decipherKey 로 암호화한다
// (buildLobbyLoginOkFrame 사용 또는 세션 전송 경로에서 동일 처리).
function _handleLobbyLoginRequest(inner) {
  decodeLobbyLoginRequest(inner); // GIN7 v4 자격증명 검증(account 추출; 세션 바인딩은 전송 계층 책임)
  return buildLobbyLoginOkInner({ status: 0 });
}

// ─── 0x1000 RequestInformationAccount → 0x1001 ────────────────────────────────

function _handleReqInfoAccount(inner, accountId, store) {
  decodeReqInfoAccount(inner); // code 검증

  // 0x1001 ResponseInformationAccount — 448B 고정크기 LE 바이트 이미지
  // 근거: [CW]§8.1 RE 확정 레이아웃 (encodeResponseInfoAccount 참조)
  const chars = store.getCharacters(accountId);
  return encodeResponseInfoAccount({}, chars);
}

// ─── 0x1004 RequestCharEntryState → 0x1005 ────────────────────────────────────

function _handleReqCharEntryState(inner) {
  // 0x1004 body 없음 (code 검증만)
  if (inner.length < 2) throw new RangeError('0x1004 inner too short');
  const code = inner.readUInt16BE(0);
  if (code !== CODE_REQ_CHAR_ENTRY_STATE) {
    throw new RangeError(`0x1004 expected, got 0x${code.toString(16)}`);
  }

  // TODO-1005: 0x1005 body 레이아웃 RE 미확정.
  // 단서: body = 0x20 bytes.
  // 현재 zero-filled stub.
  const body = Buffer.alloc(0x20); // [TODO-1005] zero-filled placeholder
  return buildMsg32(CODE_RESP_CHAR_ENTRY_STATE, body);
}

// ─── 0x1006 CommandOriginalCharacterCharge ────────────────────────────────────

function _handleOriginalCharge(inner) {
  const { charId } = decodeOriginalCharReq(inner);
  return encodeOriginalCharOk({ charId });
}

// ─── 0x1007 CommandExtensionCharacterCharge ───────────────────────────────────

function _handleExtensionCharge(inner) {
  const { count } = decodeExtensionCharReq(inner);
  return encodeExtensionCharOk({ count, accepted: 1 });
}

// ─── 0x1008 CommandGenerateCharacterCharge (생성) ────────────────────────────

function _handleGenerateCharge(inner, accountId, store) {
  const req = decodeGenerateCharReq(inner);
  // store에 캐릭터 영속
  store.addCharacter(accountId, {
    power: req.power,
    blood: req.blood,
    sex: req.sex,
    lastname: req.lastname,
    firstname: req.firstname,
    face: req.face,
    ability8: req.ability8,
    bonusPoint: req.bonusPoint,
    specialAbilityNum: req.specialAbilityNum,
    title: req.title,
    rank: req.rank,
  });
  return encodeGenerateCharOk({
    requestCategory: req.requestCategory,
    accepted: 1,
    power: req.power,
    blood: req.blood,
    sex: req.sex,
    lastname: req.lastname,
    firstname: req.firstname,
    face: req.face,
    ability8: req.ability8,
    bonusPoint: req.bonusPoint,
    specialAbilityNum: req.specialAbilityNum,
    title: req.title,
    rank: req.rank,
  });
}

// ─── 0x2008 LobbyCommandDeleteCharacter ──────────────────────────────────────

function _handleDeleteChar(inner, accountId, store) {
  const { characterId } = decodeLobbyDeleteCharReq(inner);
  store.deleteCharacter(accountId, characterId);
  return encodeLobbyDeleteCharOk({ characterId });
}
