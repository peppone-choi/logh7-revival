// LOGH VII login-server domain layer: connection state machine + in-memory
// account store (the CQRS "read model" for authentication).
//
// Design (docs/logh7-server-architecture.md): authoritative state lives in
// memory; the DB is for durability only and is NOT on this hot path. This module
// is pure (no IO) so it is unit-testable and reusable by any transport; the TCP
// server (logh7-auth-server.mjs) performs the handshake/crypto and calls in here.

import {
  LOBBY_LOGIN_REQUEST_CODE,
  LOBBY_REQ_INFO_CHARACTER_CHARGE_CODE,
  LOBBY_REQ_INFO_SESSION_CODE,
  LOBBY_RESP_INFO_SESSION_CODE,
  LOBBY_SESSION_INIT_CODE,
  LOBBY_SESSION_LOGIN_OK_CODE,
  LOBBY_SESSION_LOGIN_REQUEST_CODE,
  CMD_GENERATE_CHARGE_CODE,
  CMD_EXTENSION_CHARGE_CODE,
  CMD_ORIGINAL_CHARGE_CODE,
  LOBBY_CMD_EXTENSION_CHARGE_CODE,
  LOBBY_CMD_DELETE_CHARACTER_CODE,
  REQ_INFO_ACCOUNT_CODE,
  REQ_UNCHARGE_CHARACTER_CODE,
  REQ_CHARACTER_ENTRY_STATE_CODE,
  REQ_INFO_CHARACTER_CODE,
  CHARACTER_NAME_MAX_UNITS,
  MAX_ENTRY_CHARACTERS,
  SS_GAME_LOGIN_REQUEST_CODE,
  SS_LOGIN_REQUEST_CODE,
  SS_REQ_TIME_CODE,
  buildLobbyInformationCharacterChargeInner,
  buildLobbyInformationSessionInner,
  buildGenerateCharacterChargeOkInner,
  parseGenerateCharacterCharge,
  buildLobbyResponseInner,
  buildLobbyLoginOkInner,
  buildLobbySessionLoginOkMessage32Inner,
  buildRedirectInner,
  buildSsGameLoginOkInner,
  buildSsLoginOkInner,
  buildSsCharacterIdResponseInner,
  buildInformationCharacterRecordInner,
  buildInformationUnitRecordInner,
  buildResponseTacticsInformationInner,
  buildStaticInformationGridInner,
  buildStaticInformationGridTypeInner,
  buildStrategicGalaxyGrid,
  TERRAIN_VALUE,
  parsePassableCells,
  generatePlasmaCells,
  buildNotifyEnterGridBeginInner,
  buildNotifyEnterGridEndInner,
  buildNotifyMovedGridInner,
  buildResponseTimeInner,
  buildWorldDataResponseInner,
  buildCharacterRosterTransaction,
  buildSysSessionAnnounceNotifyInner,
  isLoginCredentialInner,
  parseGin7Credential,
  readInnerCode,
} from './logh7-login-protocol.mjs';
import {
  buildResponseInformationAccountInner,
  buildResponseUnChargeCharacterInner,
  buildResponseCharacterEntryStateInner,
  buildResponseMessengerStatusInner,
  parseInboundOriginalCharacterCharge,
} from './logh7-account.mjs';
import {
  buildStaticInformationBaseInner,
  buildInformationOutfitInner,
  buildStaticInformationCardInner,
} from './logh7-info-records.mjs';
import {
  buildResponseInformationBaseInner,
  economyBaseRecord,
  loadBaseEconomyContent,
} from './logh7-base-record.mjs';
import { buildResponseInformationInstitutionInner } from './logh7-institution-record.mjs';
import {
  buildResponseInformationWarehouseInner,
  buildResponseInformationPackageInner,
} from './logh7-warehouse-record.mjs';
import { buildInformationSessionInner } from './logh7-scenario-session.mjs';
import {
  buildCardCharacterInner,
  buildInformationGridInner,
  buildInformationOutfitPartyInner,
  buildStaticInformationUnitShipInner,
  buildStaticInformationCardCommandInner,
  createInfoRecordsStaticState,
} from './logh7-info-records-static.mjs';
import { buildCardAppointmentInner, buildNotifyInformationCharacterInner } from './logh7-personnel.mjs';
import { buildSimpleInfoTransaction } from './logh7-simple-info.mjs';
import {
  buildNotifyBaseParameterInner,
  planetToBaseParameter,
} from './logh7-base-economy.mjs';
import { validateCreateFace } from './logh7-face-codec.mjs';
import { resolveCreatedAbilities } from './logh7-ability-seed.mjs';
import { isValidAccountLabel } from './logh7-account-registry.mjs';
import { buildInstitutionSeedElements, characterDisplayName, constmsgGroupSubIdsByText } from './logh7-inferred-content.mjs';
import { normalizeFaction, rankId, clampRankId } from './logh7-rank-table.mjs';
import { titleName } from './logh7-imperial-titles.mjs';
import { openBattleField, buildNotifyTacticsInner, buildBattleEntryParticipants } from './logh7-battle-engine.mjs';
import { readFileSync } from 'node:fs';

// conn3 world-build crash fix (G145): the client never requests 0x0203/0x0322 before it
// crashes, so we PUSH the player character unsolicited. 0x0204 (selected char id) goes out
// with the 0x0206 SSGameLoginOK; the 724-byte 0x0323 record (matching char id) goes out with
// the 0x0f03 GridInitialize_OK so it lands in the world-build window (after the state-0xf
// reset of client+0x36a5dc, before placement state 0x10). LOGH_WORLD_CHAR_ID overrides the id.
const SS_REQ_GRID_INITIALIZE_CODE = 0x0f02; // C->S RequestGridInitialize, answer 0x0f03
// 만체력(滿体力): 생성 캐릭이 체력 0으로 표시되던 버그 수정용 기본값(P3 서버설계). 0x0323 레코드
// 0x1a9 u8 = 体力(stamina). 캐릭터가 명시 stamina를 안 가지면 만체력으로 시드해 게이지가 0이 아니게 한다.
const STAMINA_FULL = 100;
const worldCharId = () => Number(process.env.LOGH_WORLD_CHAR_ID ?? '1');
const worldUnitId = () => positiveIntegerEnv(process.env.LOGH_WORLD_UNIT_ID, 1);
// 멀티플레이 2:2 테스트(LOGH_MP_ACCOUNT_ROSTER): 계정 라벨 → 월드 정체성 매핑을 파싱한다.
// 형식 = JSON 객체 { "<account>": { "char": <int>, "unit": <int>, "power": 1|2 }, ... }.
// autologin은 캐릭터 생성을 건너뛰어 모든 클라가 기본 char/unit/power(1/1/제국)로 겹치므로(라이브 확인),
// 이 매핑으로 각 연결이 자기 계정의 distinct char/unit/진영(power 1=제국·2=동맹)으로 월드에 진입한다.
// 파싱 실패/미설정이면 null → 기존 동작 완전 불변. 값은 정수만 채택(불량 항목은 조용히 무시).
const parseAccountRoster = (raw) => {
  if (typeof raw !== 'string' || raw.trim().length === 0) return null;
  let obj;
  try {
    obj = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!obj || typeof obj !== 'object') return null;
  const map = new Map();
  for (const [account, entry] of Object.entries(obj)) {
    if (!entry || typeof entry !== 'object') continue;
    const char = Number(entry.char);
    const unit = Number(entry.unit);
    const power = Number(entry.power);
    map.set(account, {
      char: Number.isInteger(char) && char > 0 ? char : null,
      unit: Number.isInteger(unit) && unit > 0 ? unit : null,
      power: Number.isInteger(power) && power >= 1 ? power : null,
    });
  }
  return map.size > 0 ? map : null;
};
const positiveIntegerEnv = (value, fallback) => {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : fallback;
};

// Ship-class master (0x30b) source. createInfoRecordsStaticState() maps content/ship-stats.json (63
// hulls, P1 manual) through shipStatToUnitShip → state.shipClasses, already in the 0x30b wire field
// shape (kind/name/armorFront/shield/.../speed). Cached lazily (single content read, no side effects)
// and only consulted under the LOGH_STATIC_SHIPS gate. Live QA 2026-06-21 showed the client advances
// through post-load at 19 rows but stalls at 20+, so normal play uses a 19-row cap while LIMIT/ONLY stay
// uncapped for RE bisection.
const LIVE_SAFE_STATIC_SHIP_CAP = 19;
let staticShipState = null;
const shipMasterClasses = () => {
  if (staticShipState === null) staticShipState = createInfoRecordsStaticState({ load: true });
  return Array.isArray(staticShipState.shipClasses) ? staticShipState.shipClasses : [];
};
const parsePositiveIntegerListEnv = (value) => {
  if (value === undefined || value === null || value === '') return [];
  return String(value)
    .split(',')
    .map((part) => Number(part.trim()))
    .filter((n) => Number.isInteger(n) && n > 0);
};
const staticShipMasterClasses = () => {
  const ships = shipMasterClasses();
  const only = parsePositiveIntegerListEnv(process.env.LOGH_STATIC_SHIPS_ONLY);
  const selected = only.length > 0
    ? only.map((oneBasedIndex) => ships[oneBasedIndex - 1]).filter(Boolean)
    : ships;
  const limit = positiveIntegerEnv(process.env.LOGH_STATIC_SHIPS_LIMIT, 0);
  if (limit > 0) return selected.slice(0, limit);
  if (only.length > 0) return selected;
  const safeCap = positiveIntegerEnv(process.env.LOGH_STATIC_SHIPS_SAFE_CAP, LIVE_SAFE_STATIC_SHIP_CAP);
  return selected.slice(0, safeCap);
};

// G159/G163 proper (un-patched) world load: the world-build crash is the HUD FUN_0058ee70 reading
// the null-page global [0x80] when FUN_004c7290(focusId) returns 0 — i.e. no PLAYER_INFO slot
// (clientBase+0xc, stride 0x370, id at slot+0x24) matches the focused/selected char. Spawning one
// slot clears it: (1) 0x0204 sets the selected char id at clientBase+0x3584a0; (2) 0x0325 gives a
// unit table (FUN_004c2a80's local placement is gated on unitCount != 0); (3) one 0x0323 record
// with record[0]==char id and record[9]==unit id makes dispatcher FUN_004ba2b0 case 0x323 append
// a session record whose count==1 triggers FUN_004c2c80, writing a PLAYER_INFO slot with
// slot[0x24]=record[0]. Then FUN_004c7290(charId) returns non-null and the [0x80] read is skipped.
// TIMING (G162 memory probe): injecting at 0x0f00 is wiped — the world-init FSM tick resets
// client+0x36a5dc and memsets PLAYER_INFO after responseWorldInitialized flips. So we inject on
// the 2nd 0x0300 RequestTime (post world+grid init, just before the HUD reads PLAYER_INFO).
// Gated by LOGH_WORLD_PLAYER=1 (separate from the legacy G146 LOGH_WORLD_PUSH). Verify with the
// PRISTINE (unpatched) client + tools/logh7_player_info_probe.py.
const worldPlayerEnabled = () => process.env.LOGH_WORLD_PLAYER === '1';
// 캐논 NPC를 월드 진입(0x0f02) 시 권위적 0x0323 레코드로 시드해 위계(직위·계급·진영)를 채운다. 그러면
// 클라 HUD가 외톨이 플레이어를 "황제"로 폴백하지 못한다. 레거시 단일-레코드 카운트 테스트가 정확히 1개
// 0x0323을 기대하므로 기본 OFF로 두고, 라이브 기동 설정에서 LOGH_SEED_CANON_NPCS=1로 켠다(테스트 무수정 그린).
const seedCanonNpcsEnabled = () => process.env.LOGH_SEED_CANON_NPCS === '1';
// 프레임 예산 보호: 0x0f02 버스트에 NPC 0x0323을 무한정 넣으면 G184 스톨/크래시 위험. 상한을 둔다.
const canonNpcSeedCap = () => {
  const n = Number(process.env.LOGH_SEED_CANON_NPCS_MAX);
  return Number.isInteger(n) && n > 0 ? n : 24;
};
// P84 live trace: 0x031f/0x0321 are the actual sources FUN_004c4170 copies into the
// strategic selection list. Keep an escape hatch for comparing against the old minimal path.
const worldImportBaseRecordsEnabled = () => process.env.LOGH_WORLD_IMPORT_BASES !== '0';
// 0x031f base-economy payload gate. M2-1 라이브 승격(2026-06-22): 기본 ON 으로 올렸다. 이전엔 기본 OFF 라
// 일반 세션의 기지관리 경제 패널이 id+owner 만 받아 NO DATA 로 그려졌다. 이제 PULL(0x031e→0x031f)·
// PUSH(world-import@0x0f02) 두 경로 모두 기본으로 다섯 HIGH-confidence(P0 byte-offset) supply/budget 배열
// (budget[0]=Σindustry·commodity[0]=거주가능수·budgeting[0]=행성수)을 content/planet-economy.json 에서
// 채워 보낸다. 명시적으로 LOGH_BASE_ECONOMY='0' 일 때만 OFF(레거시 id+owner 시드, 회귀 비교용 escape hatch).
// 스칼라(人口/食料/治安/思想/宗教/支持率)는 여기서 건드리지 않는다 — 절대 오프셋이 PROVISIONAL 이라 0 으로
// 남기고, 그 6종은 별개 레코드 NotifyBaseParameter 0x0337(logh7-base-economy.mjs, population@0x28/food@0x40
// CONFIRMED)가 담당한다(역할 분리, 충돌 금지). 0x604 프레임 자체는 P84 라이브 트레이스가 정상 처리 확인.
const baseEconomyEnabled = () => process.env.LOGH_BASE_ECONOMY !== '0';
const earlyWorldLocationEnabled = () => process.env.LOGH_EARLY_WORLD_LOCATION === '1';
const actionListSeatsEnabled = () => process.env.LOGH_ACTION_LIST_SEATS === '1';
const postloadActionListSeatsEnabled = () => process.env.LOGH_POSTLOAD_ACTION_LIST_SEATS === '1';
const actionListCategory = () => {
  if (process.env.LOGH_ACTION_LIST_CATEGORY === undefined) return null;
  const n = Number(process.env.LOGH_ACTION_LIST_CATEGORY);
  return Number.isInteger(n) && n >= 0 && n <= 0xffff ? n : null;
};
const actionListAppointmentEnabled = () => process.env.LOGH_ACTION_LIST_APPOINTMENT === '1';
const c002OfficerCount = () => {
  if (process.env.LOGH_C002_OFFICER_COUNT === undefined) return null;
  const n = Number(process.env.LOGH_C002_OFFICER_COUNT);
  return Number.isInteger(n) && n >= 0 && n <= 0x10 ? n : null;
};
const postloadUnitWireEndian = () => (process.env.LOGH_POSTLOAD_UNIT_ENDIAN === 'be' ? 'be' : 'le');
const unitWireLayout = () => (process.env.LOGH_UNIT_STREAM_WIRE === '1' ? 'parser-stream' : 'native');
const postloadUnitWireLayout = () => (
  process.env.LOGH_POSTLOAD_UNIT_STREAM_WIRE === '1' ? 'parser-stream' : unitWireLayout()
);

// In-world character-roster push (RE-corrected lobby-button gate). The lobby buttons 새 캐릭터 작성 /
// 오리지널 추첨 / 캐릭터 삭제 gate on the client's roster count at clientBase+0x554da4, filled EXCLUSIVELY by
// the bulk transaction 0x1200 → 0x120f → 0x1201 (filler FUN_004c1f10; gate FUN_00597ff0 needs count≥1
// and ≥1 record with GROUP byte 2 / THRESHOLD ≤ ceiling). The transaction is injected on the SS
// game-login path (prereq = SS-login flags set by 0x201/0x206) as extraInners, AFTER the 0x0206
// SSGameLoginOK. Gated by LOGH_ROSTER_PUSH=1 (default OFF) so the proven world-entry path is untouched.
const rosterPushEnabled = () => process.env.LOGH_ROSTER_PUSH === '1';

// G173 grid-enter experiment: after the world loads (G164), push NotifyEnterGridBegin (0xb09) +
// NotifyEnterGridEnd (0xb0a) to drive the in-grid placement FUN_004c2a80(1)/FUN_004c32a0(1), which
// rebuild the grid (client+0x126718) from the already-resident session/unit data. Live probe (G167)
// showed mode (client+0x126711) == 2, the value the 0xb0a handler requires to run placement. We
// inject on RequestInformationMessengerStat (0x0f06), the last world-init request before the idle
// 0x0300 loop, so the world is fully built. Opt-in via LOGH_GRID_ENTER=1.
const SS_REQ_MESSENGER_STAT_CODE = 0x0f06; // C->S, answer 0x0f07
const gridEnterEnabled = () => process.env.LOGH_GRID_ENTER === '1';
// G211 충돌 해소(2026-06-21, C002 라이브 RE): value=0 grid-enter는 own-fleet 마커 linkage(FUN_004c2a80)에
// 필요하지만 StrategySequence를 안 켜 event-9(클릭확정)가 안 난다. 0xb0a end는 +0x4376ec(=0xb09 value byte0)
// ==0이면 linkage, !=0이면 StrategySequence(DAT_007ccffc+4=1) 시작이라 배타적이다. 그래서 value=0 grid-enter
// 직후 value=1 재-grid-enter를 순차로 보내 둘 다 충족(함대 마커 + 클릭확정). 기본 off(라이브 검증 게이트).
const stratSeqStartEnabled = () => process.env.LOGH_STRAT_SEQ_START === '1';
// 0x0317(ResponseInformationGrid) 셀렉터 레버 (C002 mode2 라이브-prep, 2026-06-26). 캐논 서버는 0x0317을
// 보내지 않아(login-session은 0x0315만) 클라 clientBase+0x35f358 grid dword가 미설정 → mode 분기(FUN_004b68f0
// at +0x35f35a: byte!=0 → iVar7=1, byte==0 → iVar7=2)가 mode2 고정 추정. 이 레버는 월드 도달 후 0x0317을
// 지정 grid u32(LOGH_GRID_SELECTOR_VALUE)로 1회 푸시해 byte[2]=(grid>>16)&0xff = 0x35f35a 셀렉터를 제어한다.
// ★주의: 0x35f35a가 실제 mode 분기인지 라이브 미확정(객체 식별오인 2회 전례) — byte-correct emit만 보장하고
// 실제 mode2 유발은 라이브 probe로 확인. 기본 OFF, 기존 deferred probe(battle/fleet-move/state-transition)와
// 무충돌(postloadExtras에만 추가, deferredBattleInners 필드 미사용).
const gridSelectorProbeEnabled = () => process.env.LOGH_GRID_SELECTOR_PROBE === '1';
// 푸시할 grid dword 값(u32). byte[2]=(value>>16)&0xff 가 0x35f35a 셀렉터로 들어간다. 예: 0x00010000 → byte[2]=1.
const gridSelectorValue = () => (Number(process.env.LOGH_GRID_SELECTOR_VALUE ?? '0') >>> 0);
// C002-인접 실험(서버-주도 전술맵 진입 probe). 클라가 0x0411 CommandChangeMode를 보내지 않아도(인-월드
// 입력 레이어 미해결: 0x0b01과 동일 블로커) 서버가 grid-enter 직후 openBattleField 시퀀스
// (0x349 위치→0x33b/0x341/0x343 전술상태→0x42f NotifyChangeMode[modeKind=0]→0x0f1f NotifyTactics)를
// 푸시해 클라를 전술 풀로 전환시키는지 라이브로 검증한다. 0x42f는 Notify(서버→클라)라 클라 입력 없이
// 강제 가능 → 0x0b01 입력블로커를 우회. 기본 OFF(월드로드 회귀 방지). 캐논 시퀀싱·정확 전술좌표는 P2(라이브 튜닝).
const battleEntryProbeEnabled = () => process.env.LOGH_BATTLE_ENTRY_PROBE === '1';
// 지연(ms): grid-enter 즉시 푸시는 전략 씬 렌더 전에 0x42f가 들어가 렌더를 깨뜨림이 라이브로 확정(control
// 대조). 따라서 배틀 시퀀스를 deferredBattleInners로 넘겨 서버가 전략맵 렌더 후 이 지연만큼 뒤 푸시한다.
const battleEntryProbeDelayMs = () => Math.max(0, Number(process.env.LOGH_BATTLE_ENTRY_DELAY_MS ?? '8000'));
// 서버 권위적 함대 이동 probe(LOGH_FLEET_MOVE_PROBE=1, 기본 OFF): 인바운드 0x0b01(클라 command-UI,
// C002로 미작동) 없이 서버가 0x0b07 NotifyMovedGrid를 grid-enter 후 지연 푸시해 플레이어 함대를 인접
// 셀로 권위적 이동시킨다. 클라 command-UI 우회한 "맵 이동" 라이브 검증용. 코어 무영향(게이트 OFF 기본).
const fleetMoveProbeEnabled = () => process.env.LOGH_FLEET_MOVE_PROBE === '1';
const fleetMoveProbeDelayMs = () => Math.max(0, Number(process.env.LOGH_FLEET_MOVE_DELAY_MS ?? '10000'));
const fleetMoveProbeDestDelta = () => Number(process.env.LOGH_FLEET_MOVE_DELTA ?? '1');
// 상태전환(전략↔전술) arm probe(LOGH_STATE_TRANSITION_PROBE=1, 기본 OFF). docs/logh7-game-state-change-re-2026-06-25.md
// AXIS2(로드-트리거, 서버푸시 가능). 서버가 월드 도달 후 0x0f1f NotifyTactics(arg0 byte0=1)를 1회 지연 푸시한다.
// 클라 파서 FUN_004c1b20: param_2(=arg0 payload)의 *param_2=='\x01'이면 전략맵 활성(+0x2a58f8≠0) 위에서
//   +0x357e8c=2(전술 arm)·+0x357e88=0x3f800000(1.0f)·*param_1=1·+4=1 = 클릭/패치/Frida 없이 상태전환 시작.
//   byte0≠1이면 +0x357e8c=0(전략 복귀). RE 확정 레이아웃만 사용(추측 데이터 P0 승격 금지).
// ★battleEntryProbe/fleetMoveProbe와 같은 deferredBattleInners 필드를 쓰므로 동시 활성 시 충돌 — 이 레버는
//   그 둘이 모두 OFF일 때만 적용한다(상호배타). 코어 무영향(게이트 OFF 기본).
const stateTransitionProbeEnabled = () => process.env.LOGH_STATE_TRANSITION_PROBE === '1';
const stateTransitionProbeDelayMs = () => Math.max(0, Number(process.env.LOGH_STATE_TRANSITION_DELAY_MS ?? '9000'));
// arg0 byte0: 1=전술 arm(기본), 0=전략 복귀. arg1은 LOW(side/phase), 기본 0.
const stateTransitionProbeArg0 = () => Number(process.env.LOGH_STATE_TRANSITION_ARG0 ?? '1') >>> 0;
const stateTransitionProbeArg1 = () => Number(process.env.LOGH_STATE_TRANSITION_ARG1 ?? '0') >>> 0;
const postloadRichCharacterEnabled = () => process.env.LOGH_POSTLOAD_RICH_CHARACTER === '1';
const postloadSimpleInfoEnabled = () => process.env.LOGH_POSTLOAD_SIMPLE_INFO === '1';
const postloadPlayerRecordEnabled = () =>
  process.env.LOGH_POSTLOAD_PLAYER_RECORD === '1' || postloadRichCharacterEnabled();
const buildActiveMessengerStatusInner = (characterId) =>
  buildResponseMessengerStatusInner({ entries: [{ charId: characterId, status: 1 }] });

// G180 strategic sector map: 0x0314 RequestStaticInformationGrid -> 0x0315 ResponseStaticInformationGrid.
// The 0x0315 grid (RLE [u8 w][u8 h][u16 rleCount][run,value pairs]) is RLE-decoded (FUN_004abbb0) and
// copied (FUN_004c5350) into the strategic sector grid client+0x2c03cc (100x50 byte cells, read by
// FUN_004c8bc0). We normally send it empty/1x1, leaving the sector map blank. Answer with a real
// 100x50 grid so the strategic map structure populates. Opt-in via LOGH_STRAT_GRID=1.
const SS_REQ_STATIC_GRID_CODE = 0x0314; // C->S, answer 0x0315
const SS_REQ_STATIC_GRID_TYPE_CODE = 0x0312; // C->S, answer 0x0313 (object table)
const stratGridEnabled = () => process.env.LOGH_STRAT_GRID === '1';
// 전략 그리드 지형 인코딩: 복구된 星系図 마스크 위엔 空間(항행, class 1), 그 외엔 航行不能(차단),
// plasmaCells엔 プラズマ嵐(차단, 별도 라벨)을 내보낸다. 이게 없으면 마커 외 보드 전체가 class-0 = 조용히
// 진입불가(RE FUN_004d6310)라 함대가 워프할 곳이 없다. needsLive: 0x0f02 그리드 페이로드를 바꾸므로,
// 기본 on 하기 전 월드 진입 + 실제 0x0b01을 검증할 것.
const stratTerrainEnabled = () => process.env.LOGH_STRAT_TERRAIN === '1';
// G200 controllable fleet: place the local player's fleet as a clickable sector OBJECT. The object
// table (0x0313) carries one class-3 marker at object value `FLEET_OBJECT_VALUE`; the cell grid
// (0x0315) carries that value at the fleet's cell (col,row). Together they satisfy the click→0x0b01
// enablement gate G4 (a selectable fleet object in the sector tables). Opt-in via LOGH_STRAT_FLEET=1
// (independent of LOGH_STRAT_GRID, which sends the bare empty grid). See docs/logh7-strategic-map-wire.md.
const stratFleetEnabled = () => process.env.LOGH_STRAT_FLEET === '1';
const fullUnitLocationEnabled = () => process.env.LOGH_FULL_UNIT_LOCATION === '1';
// 멀티플레이 함대 가시성(2:2). ON이면 월드진입 시 플레이어 함대를 공유 worldState.upsertFleet로 등록해
// 다른 클라가 0x0325로 받아 볼 수 있게 한다(C1). 기본 OFF로 단일클라 월드로드(1107 그린) 불변.
const mpVisibilityEnabled = () => process.env.LOGH_MP_VISIBILITY === '1';
const FLEET_OBJECT_VALUE = Number(process.env.LOGH_FLEET_OBJECT_VALUE ?? '3'); // placeable range 3..88
// 신규 사관의 시작 함대가 놓이는 진영 수도 셀 — page-101 星系図 dot 셀(content/galaxy.json
// canonCol/canonRow, buildStrategicGalaxyGrid의 canon 경로와 일치시켜 함대가 수도 마커 위에 정확히 놓임).
// 제국 = オーディン(성계 ヴァルハラ, spot 70 -> canon 88,25 = cellId 2588);
// 동맹 = ハイネセン(성계 バーラト, spot 7 -> canon 14,20 = cellId 2014). [P1: 수도 정체성=매뉴얼/캐논;
// 셀=캐논 星系図 dot.] 두 canon 셀 모두 passable 마스크 내부다.
// 2026-06-21 정정: 이전 (86,25)/(12,21)은 page-101 별점 재추출 전 좌표라 stale였다(제국 col 2칸·동맹 col/row
// 어긋남). 레거시 (50,25)=2550 기본값은 임의의 중립역 별이라 진영 수도가 아니다. 카메라 cave는 추후
// --cell-mem로 플레이어의 *현재* 셀을 동적으로 읽어야 한다; 여기선 시작 셀만 고정한다.
// canon 일치 회귀 가드: tests/server/logh7-faction-capital-canon.test.mjs (galaxy.json과 직접 대조).
export const FACTION_CAPITAL = {
  empire: { spot: 70, col: 88, row: 25 },
  alliance: { spot: 7, col: 14, row: 20 },
};
const fleetCell = (faction = null) => {
  const cap = FACTION_CAPITAL[faction] ?? null; // faction-aware default; null -> legacy (back-compat for callers/tests)
  return {
    col: Number(process.env.LOGH_FLEET_COL ?? cap?.col ?? '50'),
    row: Number(process.env.LOGH_FLEET_ROW ?? cap?.row ?? '25'),
  };
};
// G201 galaxy register: inject the 80 recovered star systems into the strategic grid so the sector map
// shows ~80 clickable system markers (not just the lone fleet). Raw galaxy.json is the fallback path for
// live login sessions that have not been wired to a recovered content pack. Keep its marker metadata in
// sync with the content adapter so the actual 0x0313/0x0315 session path does not collapse star types to
// faction tint. Opt-in via LOGH_STRAT_GALAXY=1.
const stratGalaxyEnabled = () => process.env.LOGH_STRAT_GALAXY === '1';
const stratGridEarlyEnabled = () => process.env.LOGH_STRAT_GRID_EARLY === '1';
const stratGridObjectPreloadEnabled = () =>
  process.env.LOGH_STRAT_GRID_OBJECT_PRELOAD === '1' ||
  (stratGridEarlyEnabled() && process.env.LOGH_STRAT_GRID_OBJECT_PRELOAD !== '0');
let cachedGalaxySystems = null;
// G220 canon grid: the navigable (teal grid + faction corridor) sector mask recovered from the page-101
// 星系図 (content/galaxy-passable-cells.json). buildStrategicGalaxyGrid uses it so canon system cells and
// the player fleet never collide onto, or get nudged into, the non-navigable black gap. Cached + tolerant
// of a missing file (empty set = no restriction, falls back to raw canon/linear cells).
let cachedPassableCells = null;
const galaxyPassableCells = () => {
  if (cachedPassableCells) return cachedPassableCells;
  try {
    const data = JSON.parse(readFileSync(new URL('../../content/galaxy-passable-cells.json', import.meta.url), 'utf8'));
    cachedPassableCells = parsePassableCells(data);
  } catch {
    cachedPassableCells = new Set();
  }
  return cachedPassableCells;
};
// プラズマ嵐(plasma-storm) 셀: 진입불가 地形障害(매뉴얼 p31). 사용자 설계 판단 = 셀 위치는 *랜덤*(고정 아님).
// 따라서 정적 파일 로드 대신 결정론 시드 RNG로 절차생성한다(generatePlasmaCells, login-protocol.mjs). 같은 seed
// → 같은 셀(테스트 재현성). 제약: ①회랑 행(galaxy.json _method.oneCellCorridorRows, 기본 row12·38) ②80성계 셀
// ③진영 수도 셀 회피, ④연결성 유지(영역 완전차단 금지). seed = env LOGH_PLASMA_SEED 또는 고정 기본값.
const PLASMA_DEFAULT_SEED = 0x10791; // 고정 기본 시드(재현성). LOGH_PLASMA_SEED로 덮어쓸 수 있음.
const plasmaSeed = () => {
  const n = Number(process.env.LOGH_PLASMA_SEED);
  return Number.isFinite(n) ? (Math.trunc(n) >>> 0) || PLASMA_DEFAULT_SEED : PLASMA_DEFAULT_SEED;
};
// 회랑 행(이제르론·페잔 1칸 회랑) — galaxy.json _method.oneCellCorridorRows에서 읽고, 없으면 [12,38] 폴백.
let cachedCorridorRows = null;
const galaxyCorridorRows = () => {
  if (cachedCorridorRows) return cachedCorridorRows;
  try {
    const data = JSON.parse(readFileSync(new URL('../../content/galaxy-passable-cells.json', import.meta.url), 'utf8'));
    const rows = data?._method?.oneCellCorridorRows;
    cachedCorridorRows = Array.isArray(rows) && rows.length > 0 ? rows.map(Number).filter(Number.isInteger) : [12, 38];
  } catch {
    cachedCorridorRows = [12, 38];
  }
  return cachedCorridorRows;
};
// 80성계의 캐논 셀(canonCol/canonRow) — 플라즈마가 성계 마커를 덮지 않게 회피 목록으로 쓴다.
const galaxySystemCellKeys = () => {
  const keys = [];
  for (const sys of galaxySystems()) {
    const c = Number(sys?.canonCol);
    const r = Number(sys?.canonRow);
    if (Number.isInteger(c) && Number.isInteger(r)) keys.push(`${c},${r}`);
  }
  return keys;
};
// 진영 수도 셀(제국 88,25 = 2588 · 동맹 14,20 = 2014) — 플라즈마 회피.
const galaxyCapitalCellKeys = () =>
  Object.values(FACTION_CAPITAL).map((cap) => `${cap.col},${cap.row}`);
let cachedPlasmaCells = null;
const galaxyPlasmaCells = () => {
  if (cachedPlasmaCells) return cachedPlasmaCells;
  cachedPlasmaCells = generatePlasmaCells({
    passable: galaxyPassableCells(),
    systemCells: galaxySystemCellKeys(),
    capitalCells: galaxyCapitalCellKeys(),
    corridorRows: galaxyCorridorRows(),
    seed: plasmaSeed(),
    minCount: 12,
    maxCount: 24,
  });
  return cachedPlasmaCells;
};
// サルガッソ(sargasso) 셀: 진입불가 地形障害(매뉴얼 p31). プラズマ嵐와 달리 위치가 *고정*이고, 캐논상 이제르론
// 회랑 일대에 놓인다. 별도 파일(content/galaxy-sargasso-cells.json)이 있으면 그걸 쓰고, 없으면 회랑 행 바로
// 바깥(회랑을 막지 않는 인접 항행셀)에 결정론적으로 고정 배치한다. プラズマ嵐와는 distinct 오브젝트 값(89)으로
// 와이어에서 구분된다(buildStrategicGalaxyGrid TERRAIN_VALUE.SARGASSO). [P3: 고정 좌표는 서버 설계 관례.]
let cachedSargassoCells = null;
const galaxySargassoCells = () => {
  if (cachedSargassoCells) return cachedSargassoCells;
  try {
    const data = JSON.parse(readFileSync(new URL('../../content/galaxy-sargasso-cells.json', import.meta.url), 'utf8'));
    cachedSargassoCells = parsePassableCells(data);
    return cachedSargassoCells;
  } catch {
    // 폴백: 이제르론 회랑 행(첫 corridorRow, 기본 12) 바로 위/아래 항행셀 중 회랑·성계·수도를 피한 고정 2셀.
    const passable = galaxyPassableCells();
    const avoid = new Set([...galaxySystemCellKeys(), ...galaxyCapitalCellKeys()]);
    const corridorRows = new Set(galaxyCorridorRows());
    const result = new Set();
    const iserlohnRow = galaxyCorridorRows()[0] ?? 12;
    // 회랑 행 인근(±1행)에서 회랑/성계/수도를 피한 항행셀을 결정론 순서(col 오름차순)로 최대 2개 고른다.
    for (const dr of [-1, 1]) {
      const row = iserlohnRow + dr;
      if (corridorRows.has(row)) continue;
      const cols = [];
      for (const key of passable) {
        const [c, r] = key.split(',').map(Number);
        if (r === row && !avoid.has(key)) cols.push(c);
      }
      cols.sort((a, b) => a - b);
      if (cols.length > 0) result.add(`${cols[Math.floor(cols.length / 2)]},${row}`); // 회랑 중앙쯤
      if (result.size >= 2) break;
    }
    cachedSargassoCells = result;
    return cachedSargassoCells;
  }
};
const loadGalaxyStellarTypes = () => {
  const data = JSON.parse(readFileSync(new URL('../../content/extracted/model-galaxy-stars.json', import.meta.url), 'utf8'));
  if (!Array.isArray(data.stars)) return [];
  return data.stars.map((star) => ({
    index: Number.isInteger(star?.index) ? star.index : null,
    spectralClass: typeof star?.spectral_class === 'string' ? star.spectral_class.toUpperCase() : null,
  }));
};
const normalizeSpectralClass = (value) => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toUpperCase();
  return /^[OBAFGKM]$/u.test(normalized) ? normalized : null;
};
const galaxySystems = () => {
  if (cachedGalaxySystems) return cachedGalaxySystems;
  try {
    const systems = JSON.parse(readFileSync(new URL('../../content/galaxy.json', import.meta.url), 'utf8')).systems;
    const stellarTypes = loadGalaxyStellarTypes();
    const msgdat = JSON.parse(readFileSync(new URL('../../content/extracted/msgdat-full.json', import.meta.url), 'utf8'));
    const msgdatOriginal = JSON.parse(readFileSync(new URL('../../content/client/msgdat.json', import.meta.url), 'utf8'));
    const markerIdsByName = new Map([
      ...constmsgGroupSubIdsByText(msgdat, 0x18),
      ...constmsgGroupSubIdsByText(msgdatOriginal, 0x18, { layoutSource: msgdat }),
    ]);
    cachedGalaxySystems = systems.map((system, index) => {
      const star = stellarTypes[index] ?? null;
      const chartSpectralClass = normalizeSpectralClass(system.spectral_class ?? system.spectralClass ?? null);
      return {
        ...system,
        contentId: markerIdsByName.get(system.system ?? system.name_ja ?? system.name) ?? null,
        spectralClass: chartSpectralClass ?? star?.spectralClass ?? null,
      };
    });
    return cachedGalaxySystems;
  } catch {
    cachedGalaxySystems = [];
    return [];
  }
};
// G196: push the 0x33b tactical unit table so clientBase+0x4271a8 is resident before grid-enter.
// On its own this does NOT populate the tactical pool 0x126718 (FUN_004c32a0 also gates on mode
// byte 0x126711==0, which no message sets); the live B2 experiment pairs this with a 0x126711=0
// memory poke. Gated so the proven G164 world-load flow is unaffected by default.
const tacticsUnitEnabled = () => process.env.LOGH_TACTICS_UNIT === '1';

// In-game READ-MODEL request codes (직무/정보 카드, workflow w2xh1y4z6). Opening these panels makes most
// panel requests use Request* = (responseCode - 1) with a length-prefixed id list; the generic walker
// answers ZERO-FILLED objects. Each panel branch below must stay separate from the 0x0304 world/session
// walker, which is not the personnel static-card command table. request = response - 1.
const REQ_CARD_CHARACTER_CODE = 0x034e; // C->S, answer 0x034f ResponseCardCharacter (≤64 × 724B records)
const REQ_INFO_SESSION_CODE = 0x0304; // C->S, answer 0x0305 InformationSession (world/session list)
const REQ_STATIC_INFORMATION_UNIT_SHIP_CODE = 0x030a; // C->S, answer 0x030b ResponseStaticInformationUnitShip (함선마스터)
const REQ_STATIC_INFORMATION_BASE_CODE = 0x031c; // C->S, answer 0x031d ResponseStaticInformationBase
const REQ_INFORMATION_BASE_CODE = 0x031e;
const REQ_INFORMATION_OUTFIT_CODE = 0x032a; // C->S, answer 0x032b ResponseInformationOutfit
const REQ_INFORMATION_OUTFIT_PARTY_CODE = 0x032e; // C->S, answer 0x032f ResponseInformationOutfitParty
const REQ_INFORMATION_UNIT_CODE = 0x0324; // C->S, answer 0x0325 ResponseInformationUnit
const REQ_INFORMATION_INSTITUTION_CODE = 0x0320; // C->S, answer 0x0321 ResponseInformationInstitution
const REQ_INFORMATION_WAREHOUSE_CODE = 0x0326; // C->S, answer 0x0327 ResponseInformationWarehouse (보급창고)
const REQ_INFORMATION_PACKAGE_CODE = 0x0328; // C->S, answer 0x0329 ResponseInformationPackage (수송)
const REQ_WORLD_INFO_CHARACTER_CODE = 0x0306; // C->S walker slot, answer 0x0307.
const COMMAND_TABLE_PRELOAD_CARD_ID = 0;
const COMMAND_TABLE_PRELOAD_COMMAND_IDS = Object.freeze([0x002b, 0x0041]);
const commandTablePreloadProbeEnabled = () => process.env.LOGH_COMMAND_TABLE_PRELOAD_PROBE === '1';
// 0x305 카드 마스터 = 전략 명령 메뉴 행의 출처. 클라 FUN_004f5cb0가 record+0x14(command_count u8)/
// +0x16(factory ids u16, LE)을 읽어 행을 렌더한다(렌더 widget id = factory+0x43). canonical 빌더
// (RE확정 LE 포맷, 단위테스트 보유)로 카드 1장 + 명령 factory id를 emit한다.
// ⚠이전 hand-rolled 빌더는 BE + 오프셋 오류(count BE, ids@0x15)로 클라 파서(LE, ids@0x16)와 어긋나
// 명령 테이블이 빈 채로 남았다(2026-06-21 RE로 정정). 플래그(LOGH_COMMAND_TABLE_PRELOAD_PROBE) 게이트라
// 기본 world-load는 불변.
const buildCommandTablePreloadCardInner = () =>
  buildStaticInformationCardInner({
    cards: [{ id: COMMAND_TABLE_PRELOAD_CARD_ID, commands: [...COMMAND_TABLE_PRELOAD_COMMAND_IDS] }],
  });
// 0x307 per-card command descriptor 테이블(보조). canonical 빌더로 동일 카드의 명령 디스크립터를 emit.
const buildCommandTablePreloadCommandInner = () =>
  buildStaticInformationCardCommandInner({
    cards: [{
      cardId: COMMAND_TABLE_PRELOAD_CARD_ID,
      commands: COMMAND_TABLE_PRELOAD_COMMAND_IDS.map((id) => ({ id })),
    }],
  });

/** @typedef {'connected'|'handshake-complete'|'authenticated'|'redirected'|'rejected'|'closed'} LoginPhase */

export const LOGIN_PHASES = Object.freeze({
  CONNECTED: 'connected',
  HANDSHAKE_COMPLETE: 'handshake-complete',
  AUTHENTICATED: 'authenticated',
  REDIRECTED: 'redirected',
  REJECTED: 'rejected',
  LOBBY: 'lobby',
  LOBBY_AUTHENTICATED: 'lobby-authenticated',
  SS: 'ss',
  SS_AUTHENTICATED: 'ss-authenticated',
  CLOSED: 'closed',
});

/**
 * In-memory account store. Read model for authentication.
 *
 * @param {{ accounts?: Array<{ account: string, credentialHex?: string }>, acceptAnyGin7?: boolean }} [options]
 *   acceptAnyGin7: when true, any well-formed GIN7 credential authenticates using
 *   its parsed account label. This is an opt-in legacy/skeleton mode; the default
 *   is false (strict), so credentials must match a seeded account or a wired
 *   registry.
 */
export function createAccountStore({ accounts = [], acceptAnyGin7 = false, registry = null, allowRegister = false } = {}) {
  const byCredential = new Map();
  const byAccount = new Map();
  for (const record of accounts) {
    const normalized = { account: record.account, credentialHex: record.credentialHex ?? null };
    byAccount.set(record.account, normalized);
    if (normalized.credentialHex !== null) {
      byCredential.set(normalized.credentialHex.toLowerCase(), normalized);
    }
  }
  return {
    get size() {
      return byAccount.size;
    },
    getAccount(account) {
      return byAccount.get(account) ?? null;
    },
    getProfileCharacters(account) {
      if (typeof registry?.getProfileCharacters !== 'function') return [];
      return registry.getProfileCharacters(account).map((profile) => ({
        ...profile,
        id: profile.characterId,
        status: 1,
        worldPower: profile.power,
        check: 1,
      }));
    },
    addProfileCharacter(account, character) {
      if (typeof registry?.addProfileCharacter !== 'function') return null;
      return registry.addProfileCharacter(account, character);
    },
    removeProfileCharacter(account, characterId) {
      if (typeof registry?.removeProfileCharacter !== 'function') return false;
      return registry.removeProfileCharacter(account, characterId);
    },
    /**
     * @param {Buffer} innerPayload GIN7 credential inner (code 0x7000)
     * @returns {{ ok: true, account: string, matchedBy: 'credential'|'gin7-any'|'password'|'registered' } | { ok: false, reason: string }}
     */
    authenticate(innerPayload) {
      if (!isLoginCredentialInner(innerPayload)) {
        return { ok: false, reason: 'not a GIN7 login credential' };
      }
      const exact = byCredential.get(innerPayload.toString('hex').toLowerCase());
      if (exact !== undefined) {
        return { ok: true, account: exact.account, matchedBy: 'credential' };
      }
      // Real signup (회원가입): when a persistent registry is wired, the account label governs.
      // Strict mode requires an out-of-band registry record; the optional allowRegister path keeps
      // legacy Trust-On-First-Use capture compatibility.
      if (registry) {
        const parsed = parseGin7Credential(innerPayload);
        const account = parsed.accountLabel;
        // A single generic reason for every failure (+ equal-cost hashing) so a caller cannot tell a
        // missing account from a wrong password from a malformed label (anti-enumeration; review 2026-06-14).
        const GENERIC_FAIL = 'authentication failed';
        if (!isValidAccountLabel(account)) {
          registry.dummyVerify(innerPayload);
          return { ok: false, reason: GENERIC_FAIL };
        }
        if (registry.has(account)) {
          const verified = registry.verify(account, innerPayload);
          if (verified.ok) {
            return { ok: true, account, matchedBy: 'password' };
          }
          return { ok: false, reason: GENERIC_FAIL };
        }
        if (allowRegister) {
          // Trust-On-First-Use registration (no separate signup opcode exists). LAN-trusted only.
          registry.register(account, innerPayload, { createdAt: new Date().toISOString() });
          return { ok: true, account, matchedBy: 'registered' };
        }
        registry.dummyVerify(innerPayload);
        return { ok: false, reason: GENERIC_FAIL };
      }
      if (acceptAnyGin7) {
        const parsed = parseGin7Credential(innerPayload);
        const account = parsed.accountLabel.length > 0 ? parsed.accountLabel : 'unknown';
        return { ok: true, account, matchedBy: 'gin7-any' };
      }
      return { ok: false, reason: 'credential not registered' };
    },
  };
}

/**
 * Create a login-connection state machine.
 *
 * @param {{
 *   accountStore: ReturnType<typeof createAccountStore>,
 *   lobby: { ip?: string, port?: number, token?: number|null },
 *   world?: { ip?: string, port?: number, token?: number|null },
 *   characters?: Array<{ id?: number, characterId?: number }>,
 *   sessions?: Array<object>|null,
 *   worldBySession?: Record<string, { ip?: string, port?: number, token?: number|null }>|null,
 *   announcementText?: string|Buffer|null,
 *   boundAccount?: string|null,
 * }} options
 */
export function createLoginSession({
  accountStore,
  lobby,
  world,
  worldState = null, // (옵션) 권위적 월드 상태 — 주어지면 월드진입 시 플레이어 캐릭터를 전투 레지스트리에 시드.
  characters,
  contentPack = null,
  sessions = null,
  worldBySession = null,
  announcementText = null,
  boundAccount = null,
  connectionId = 0, // (옵션) 이 연결의 유일 키 — 멀티플레이에서 connection별 distinct in-world 함대 id 파생에 쓴다.
}) {
  let phase = LOGIN_PHASES.CONNECTED;
  let account = typeof boundAccount === 'string' && boundAccount.length > 0 ? boundAccount : null;
  let announcementSent = false;
  // 멀티플레이 2:2 계정 로스터(LOGH_MP_ACCOUNT_ROSTER): 이 연결의 계정 라벨로 월드 정체성{char,unit,power}을
  // 조회한다. account는 인증 시점(0x7000)에 갱신되므로 call-time에 평가한다(생성 시점 null이어도 OK).
  const accountRoster = parseAccountRoster(process.env.LOGH_MP_ACCOUNT_ROSTER);
  const accountIdentity = () => (account && accountRoster ? accountRoster.get(account) ?? null : null);
  const accountPowerByte = () => {
    const id = accountIdentity();
    return id && Number.isInteger(id.power) ? id.power : null;
  };
  const accountFactionKey = () => {
    const p = accountPowerByte();
    if (p === 1) return 'empire';
    if (p === 2) return 'alliance';
    return null;
  };
  const hasAnnouncementText = (text) => {
    if (Buffer.isBuffer(text)) return text.length > 0;
    return text !== null && text !== undefined && String(text).length > 0;
  };
  const withTrace = (action, trace = {}) => ({
    ...action,
    trace: { account: account ?? null, ...trace },
  });
  const buildLobbyLoginOkAction = ({ includeAnnouncement = true } = {}) => {
    const action = { kind: 'lobby-login-ok', okInner: buildLobbyLoginOkInner({ status: 0 }) };
    if (includeAnnouncement && !announcementSent && hasAnnouncementText(announcementText)) {
      announcementSent = true;
      action.extraInners = [buildSysSessionAnnounceNotifyInner({ text: announcementText })];
    }
    return withTrace(action);
  };
  // Working copy so 新キャラクターの作成 (CommandGenerateCharacterCharge 0x1008) can append the new
  // character; the client then re-requests 0x2003→0x2004 and the new card renders. Each character
  // carries an id; new ids continue past the highest seeded id.
  const lobbyCharacters = [...(characters ?? lobby?.characters ?? [])];
  const charIdOf = (c) => Number(c?.id ?? c?.characterId ?? 0);
  const profileKeyForTrace = (characterId) => (
    account && Number.isInteger(characterId) && characterId > 0 ? `${account}:${characterId}` : null
  );
  const characterTrace = (characterId, trace = {}) => {
    const id = Number(characterId);
    const profileKey = profileKeyForTrace(id);
    return {
      ...trace,
      ...(Number.isInteger(id) && id > 0 ? { characterId: id } : {}),
      ...(profileKey ? { profileKey } : {}),
    };
  };
  const characterListTrace = () => {
    const characterIds = lobbyCharacters.map(charIdOf).filter((id) => Number.isInteger(id) && id > 0);
    const profileKeys = characterIds.map(profileKeyForTrace).filter((key) => key !== null);
    return {
      characterIds,
      profileKeys,
    };
  };
  let nextCharId = lobbyCharacters.reduce((max, c) => Math.max(max, charIdOf(c)), 0) + 1;
  const refreshNextCharId = () => {
    nextCharId = lobbyCharacters.reduce((max, c) => Math.max(max, charIdOf(c)), 0) + 1;
  };
  const loadAccountProfileCharacters = () => {
    if (!account || typeof accountStore?.getProfileCharacters !== 'function') return;
    const profileCharacters = accountStore.getProfileCharacters(account);
    for (const character of profileCharacters) {
      const id = charIdOf(character);
      if (id > 0 && !lobbyCharacters.some((entry) => charIdOf(entry) === id)) {
        lobbyCharacters.push(character);
      }
    }
    if (generatedCharacterId === 0) {
      // 월드 진입 시 활성 캐릭터 = "가장 최근에 생성한" 프로필 캐릭터로 잡는다.
      // 근본(2026-06-25 사용자 보고 "예전에 억지로 만든 캐릭 그대로야"): 월드 진입은 캐릭 생성(0x1008)을 처리한
      // 로비 세션과는 별개의 conn3 세션 인스턴스라 generatedCharacterId가 0으로 시작하고, 여기서 프로필을
      // 다시 로드한다. 이전 구현은 profileCharacters의 *첫(가장 오래된)* id를 골라(getProfileCharacters는
      // 생성 순서대로 반환) 방금 만든 캐릭이 아니라 옛 캐릭이 월드에 스폰됐다. createdAt(있으면)로 가장 최근
      // 생성분을 고르고, 동률/누락이면 배열 끝(addProfileCharacter가 append)·그다음 최대 id 순으로 폴백한다.
      const newestProfile = profileCharacters
        .filter((c) => charIdOf(c) > 0)
        .reduce((best, c) => {
          if (!best) return c;
          const bt = Date.parse(best?.createdAt ?? '') || 0;
          const ct = Date.parse(c?.createdAt ?? '') || 0;
          if (ct !== bt) return ct > bt ? c : best; // 더 최근 createdAt 우선
          return charIdOf(c) >= charIdOf(best) ? c : best; // 동률이면 더 큰(나중) id 우선
        }, null);
      const newestProfileId = newestProfile ? charIdOf(newestProfile) : 0;
      if (newestProfileId > 0) generatedCharacterId = newestProfileId;
    }
    refreshNextCharId();
  };

  // The character the player charged via the 오리지널 추첨 (0x1006). When set, the world-entry path uses it
  // as the active character id so the chosen canon candidate renders in-world.
  let chargedCharacterId = 0;
  let generatedCharacterId = 0;
  let generateCharacterDraft = null;
  if (account) {
    loadAccountProfileCharacters();
  }
  const activeCharacterId = () => chargedCharacterId || generatedCharacterId || accountIdentity()?.char || worldCharId();
  // 멀티플레이(2:2) distinct 함대: 계정 로스터 없이 같은 머신 4클라가 모두 worldUnitId()=1을 쓰면
  // worldState.upsertFleet가 같은 fleet 1을 덮어써 마커가 1개로 붕괴한다(가시성/전투 테스트 불가).
  // connectionId(연결별 유일 키)를 기준 unit id에 오프셋해 4개의 distinct 함대를 등록한다 — 진영(power)·
  // 캐릭터 진영은 그대로 생성 캐릭터에서 해석하므로 '가짜 로스터'가 아니라 실제 per-connection 함대 슬롯
  // 배정이다. 게이트 OFF(단일클라)면 connectionId 무시→기존 worldUnitId()(1107 그린 경로) 불변.
  const mpDistinctUnitId = () =>
    mpVisibilityEnabled() && Number.isInteger(connectionId) && connectionId > 0
      ? worldUnitId() + connectionId
      : null;
  // 계정 로스터가 unit을 주면 그것을, 아니면 멀티플레이 distinct unit, 아니면 기존 env 기본(worldUnitId)을 쓴다.
  // 월드진입 0x0325 그리드-유닛 id(char+0x24 바인딩)와 戦死 판정 flagship 링크에 동일 적용해 클라 자기바인딩과
  // 어긋나지 않게 한다(세 사용처 1247·1413·worldPlayerInfo 모두 이 함수 경유→일관).
  const sessionWorldUnitId = () => accountIdentity()?.unit ?? mpDistinctUnitId() ?? worldUnitId();
  const actionListCategoryDword = () => {
    const category = actionListCategory();
    if (category == null) return null;
    // FUN_004f6b00 uses the low u16, but a zero first dword is normalized away in 0x0356.
    return category === 0 ? 0x10000 : category;
  };
  const activeSeatEntries = (characterId = activeCharacterId(), options = {}) => {
    const officerCount = c002OfficerCount();
    if (officerCount != null && officerCount > 0) {
      return Array.from({ length: officerCount }, () => ({ character: characterId, role: 0 }));
    }
    const categoryDword = actionListCategoryDword();
    if (categoryDword != null) {
      return [{ character: categoryDword, role: 0 }];
    }
    const postload = options?.postload === true;
    const enabled = actionListSeatsEnabled() || (postload && postloadActionListSeatsEnabled());
    return enabled ? [{ character: characterId, role: 0 }] : [];
  };
  // 오리지널 캐릭터 추첨 (lottery) candidate cache: the ids offered to the player by the character-management
  // screen. The later 0x1006 CommandOriginalCharacterCharge is validated against this set. Seeded lazily
  // from the canon content pack (when present) the first time the roster-priming requests are answered.
  let lotteryCandidates = null;
  const drawLotteryCandidates = () => {
    if (lotteryCandidates) return lotteryCandidates;
    const pool = Array.isArray(contentPack?.characters) ? contentPack.characters : [];
    // Prefer ids the account does NOT already own; fall back to the head of the pool. Draw up to 5
    // (the 第一~第五候補 slots) so the picker paints; deterministic head-pick keeps it unit-testable.
    const ownedIds = new Set(lobbyCharacters.map(charIdOf));
    const available = pool.map((c) => Number(c?.id)).filter((id) => Number.isInteger(id) && id > 0 && !ownedIds.has(id));
    lotteryCandidates = (available.length > 0 ? available : pool.map((c) => Number(c?.id)).filter((id) => Number.isInteger(id) && id > 0)).slice(0, 5);
    return lotteryCandidates;
  };
  // The roster the 새 캐릭터 작성 screen primes from: the account's existing characters PLUS the lottery
  // candidate ids, so the screen paints AND offers creation even for a brand-new (empty) account.
  const rosterCharIds = () => {
    const owned = lobbyCharacters.map(charIdOf).filter((id) => id > 0);
    const candidates = drawLotteryCandidates();
    // de-dup, owned first
    const seen = new Set(owned);
    const merged = [...owned];
    for (const id of candidates) {
      if (!seen.has(id)) {
        seen.add(id);
        merged.push(id);
      }
    }
    // The roster gate FUN_00597ff0 needs count >= 1; when truly empty, offer at least a placeholder id
    // so the screen paints and the creation form becomes reachable.
    return merged.length > 0 ? merged : [1];
  };
  const simpleInfoCharacterRecords = () => {
    const seen = new Set();
    const records = [];
    const add = (candidate, forcedId = null) => {
      const id = Number(forcedId ?? candidate?.id ?? candidate?.characterId ?? 0);
      if (!Number.isInteger(id) || id <= 0 || seen.has(id)) {
        return;
      }
      seen.add(id);
      records.push({ characterId: id });
    };

    const activeId = activeCharacterId();
    add(contentPack?.characterById?.(activeId) ?? lobbyCharacters.find((c) => charIdOf(c) === activeId) ?? null, activeId);
    for (const ch of Array.isArray(contentPack?.characters) ? contentPack.characters : []) add(ch);
    for (const ch of lobbyCharacters) add(ch);
    return records;
  };
  // The fleet's 0x0313 byte0 is a constmsg group-0x18 LABEL index (resolved client-side via
  // FUN_00522010(0x18, byte0)), NOT a char/unit id. Passing charId here indexed grid-type labels —
  // charId 1 -> subId 1 = 空間グリッド/공간 그리드, the reported phantom. Label the fleet with its home
  // system's group-0x18 contentId when resolvable, else the first real system subId (3). There is no
  // canon 'fleet' entry in group 0x18, so this is a P3 display convention, not original server data.
  // docs/logh7-strategic-map-wire.md §5.
  const fleetHomeContentId = () => {
    const id = activeCharacterId();
    const ch = (typeof contentPack?.characterById === 'function' ? contentPack.characterById(id) : null)
      ?? lobbyCharacters.find((c) => charIdOf(c) === id) ?? null;
    const spot = Number(ch?.spot);
    const systems = galaxySystems();
    const bySpot = Number.isInteger(spot) && spot > 0 ? systems[spot - 1]?.contentId : null;
    return Number.isInteger(bySpot) && bySpot >= 3 && bySpot <= 0xff ? bySpot : 3;
  };
  const strategicGalaxyGridInners = () => {
    const { col, row } = playerFleetCell();
    return buildStrategicGalaxyGrid({
      systems: galaxySystems(),
      fleetCell: { col, row },
      fleetValue: FLEET_OBJECT_VALUE,
      fleetContentId: fleetHomeContentId(),
      passableCells: galaxyPassableCells(),
      terrain: stratTerrainEnabled(),
      plasmaCells: stratTerrainEnabled() ? galaxyPlasmaCells() : null,
      sargassoCells: stratTerrainEnabled() ? galaxySargassoCells() : null,
    });
  };
  const integerOrNull = (value) => {
    const n = Number(value);
    return Number.isFinite(n) ? Math.trunc(n) : null;
  };
  const positiveIntOr = (value, fallback) => {
    const n = integerOrNull(value);
    return n != null && n > 0 ? n : fallback;
  };
  const byteOrNull = (value) => {
    const n = integerOrNull(value);
    return n != null && n >= 0 ? n & 0xff : null;
  };
  const clientPowerByte = (value) => {
    if (value == null) return null;
    const n = integerOrNull(value);
    if (n != null) {
      if (n === 0x500) return 1;
      if (n === 0x501) return 2;
      if (n === 0x502) return 3;
      return n >= 1 && n <= 0xff ? n & 0xff : null;
    }
    const faction = normalizeFaction(value);
    if (faction === 'empire') return 1;
    if (faction === 'alliance') return 2;
    const s = typeof value === 'string' ? value.trim().toLowerCase() : '';
    if (s === 'neutral' || s === 'phezzan' || s === 'フェザーン' || s === '페잔') return 3;
    return null;
  };
  // 기지/성계 0x031f elem+0x04 owner 바이트: 클라 기지 패널이 ==2 동맹, ==3 제국으로 읽는다(RE). 제국=3,
  // 동맹=2, 그 외(중립/페잔/미상)=1. 이는 캐릭터 power 바이트(제국=1)와 다륾으로 별도 매핑한다.
  const baseOwnerByteFromFaction = (value) => {
    const f = normalizeFaction(value);
    if (f === 'empire') return 3;
    if (f === 'alliance') return 2;
    return 1;
  };
  const characterPowerByte = (character = null) => (
    clientPowerByte(
      character?.worldPower ?? character?.clientPower ?? character?.faction ?? character?.power
        ?? character?.nationId ?? character?.nation_id,
    )
  );
  const characterFactionKey = (character = null) => {
    const normalized = normalizeFaction(character?.faction ?? character?.factionKey);
    if (normalized) return normalized;
    const power = characterPowerByte(character);
    if (power === 1) return 'empire';
    if (power === 2) return 'alliance';
    return null;
  };
  // Faction-aware home placement: a new officer's fleet starts at the faction capital (Odin/Heinessen),
  // not the legacy placeholder cell. Resolves the active player's faction then maps to FACTION_CAPITAL.
  const activePlayerFactionKey = () => {
    // 계정 로스터(2:2 멀티)가 진영을 지정하면 최우선(동맹 플레이어가 empire 폴백으로 떨어지지 않게).
    const acct = accountFactionKey();
    if (acct) return acct;
    const id = activeCharacterId();
    const ch = (typeof contentPack?.characterById === 'function' ? contentPack.characterById(id) : null)
      ?? lobbyCharacters.find((c) => charIdOf(c) === id) ?? null;
    // 라이브 월드 진입 플레이어는 항상 진영이 있다. 해석 실패 시 중립역(50,25)으로 떨어지지 않게
    // 부트스트랩 기본값(commandline-bootstrap=power1=제국)인 'empire'로 폴백한다. 명시적 fleetCell(null)
    // 테스트 경로는 그대로 레거시 셀을 받는다(폴백은 activePlayerFactionKey 경유 라이브 경로에만 적용).
    return characterFactionKey(ch) ?? 'empire';
  };
  const playerFleetCell = () => fleetCell(activePlayerFactionKey());
  const characterRankId = (character = null) => {
    const direct = integerOrNull(character?.rank);
    if (direct != null && direct > 0) return direct;
    const resolved = rankId(character?.rank, { faction: characterFactionKey(character) });
    return resolved?.id ?? null;
  };
  // Resolve a character's held peerage title (작위) to the 작위명 string written to the 0x0323/0x0356
  // record's titlename field. `character.title` is the 0x1008 create-form ladder id (0=untitled ..
  // 7=commoner) or a name string; titleName() maps it to the displayed name (logh7-imperial-titles.mjs).
  // Empire-only: the Free Planets Alliance has no peerage, so a non-empire character never shows a title.
  const characterTitleName = (character = null) => {
    if (!character || character.title == null) return null;
    if (characterFactionKey(character) === 'alliance') return null;
    const name = titleName(character.title);
    return name.length > 0 ? name : null;
  };
  // 생성 캐릭의 작위(0x1008 form title 바이트)를 신참용으로 클램프한다. 사다리는 1=공작(최고)..7=평민.
  // 고위 작위(공작/후작/백작/자작=rank 1..4)는 절대 기본 부여하지 않는다 — 명시적 하급 작위(남작 이하=
  // rank>=5)만 통과시키고 그 외엔 0(작위 없음)으로 떨어뜨린다. 신참 사관은 평민 출신이 기본이라 함당.
  const clampPlayerTitle = (title) => {
    const t = Number(title);
    if (!Number.isInteger(t) || t <= 0) return 0; // 미설정/무효 → 작위 없음.
    if (t >= 5 && t <= 7) return t; // 남작(5)/제국기사(6)/평민(7)만 신참 허용.
    return 0; // 공작~자작(1..4)은 신참에게 절대 부여하지 않음.
  };
  const createFactionKey = (power) => (Number(power) === 3 ? 'alliance' : 'empire');
  const createWorldPowerByte = (power) => (createFactionKey(power) === 'alliance' ? 2 : 1);
  const initialCreateRankSubId = () => 0x0d;
  const initialCharacterRankId = (power) => (createFactionKey(power) === 'alliance' ? 4 : 3);
  const activeCharacterRecord = (id) => (
    contentPack?.characterById?.(id) ?? lobbyCharacters.find((c) => charIdOf(c) === id) ?? null
  );
  // 자동황제 폴백 차단: real-login 신규생성/계정/charged/명시 LOGH_WORLD_CHAR_ID가 하나도 없으면
  // activeCharacterId()가 worldCharId()(=1)로 폴백해 캐논 최상위 인물(황제 스탬프 대상)을 그대로 입는다
  // ("억지 dummy 캐릭"이 황제로 연결되는 근본). 그 경우 플레이어 표시 레코드를 합성 하급사관으로 대체한다.
  // id는 불변(grid/unit/base/seed-id 전부 worldCharId 그대로 → 광역 회귀 없음), 플레이어 0x0323의
  // name/rank/faction/abilities만 신참으로. 진짜 생성/계정/명시 경로는 hasRealPlayerChar()=true라 불변.
  const hasRealPlayerChar = () =>
    chargedCharacterId > 0 ||
    generatedCharacterId > 0 ||
    (accountIdentity()?.char ?? 0) > 0 ||
    process.env.LOGH_WORLD_CHAR_ID != null;
  const synthFallbackPlayer = (id) => ({
    id,
    status: 1,
    name: '신임 사관',
    fullName: '신임 사관',
    lastname: '신임 사관',
    firstname: '',
    faction: 'empire',
    power: 1,
    worldPower: 1,
    sex: 0,
    blood: 0,
    abilities: resolveCreatedAbilities({ abilities: [], power: 1, blood: 0 }),
    stamina: STAMINA_FULL,
    title: 0, // 작위 없음(평민) — 절대 고위작위/황제 아님
    rank: initialCharacterRankId(1), // 제국 신참 계급
    createRankSubId: initialCreateRankSubId(),
    check: 1,
  });
  // 플레이어 char 레코드 단일 소스. real-char면 실레코드.
  // 폴백(real-char 없음)일 때: activeCharacterRecord가 **캐논 레코드를 반환할 때만**(=contentPack 로드 →
  // char 1 = sovereign(황제) 위험) 합성 하급사관으로 대체. null(contentPack 미로드)이면 기존 동작 유지
  // (상위에서 "Character N" 중립 placeholder = 황제 아님)이라 건드리지 않는다.
  const playerRecord = (id) => {
    if (hasRealPlayerChar()) return activeCharacterRecord(id);
    // 실제 생성/로비 캐릭이 있으면 그대로(생성 흐름 보호 — 이게 우선).
    const lobbyRec = lobbyCharacters.find((c) => charIdOf(c) === id) ?? null;
    if (lobbyRec) return lobbyRec;
    // 로비 캐릭 없이 contentPack 캐논 레코드(=char 1 sovereign/황제 위험)로만 떨어질 때만 합성 하급사관.
    const canonRec = (typeof contentPack?.characterById === 'function' ? contentPack.characterById(id) : null) ?? null;
    return canonRec ? synthFallbackPlayer(id) : null;
  };
  // 시드 가능한 캐논 NPC 목록을 구한다(플레이어 charId 제외). 제국·동맹 양 진영(nationId 0x500/0x501)에서
  // 가져와 distinct id별로 모으고, 직위(post_ja)가 있는 인물을 우선해 위계가 의미를 갖게 한다. 상한(cap)으로
  // 프레임 예산을 지킨다. 최상위 군주(제국 元帥/사령장관급 1명)에 "황제"(최상위 칭호)를 스탬프해 클라 HUD가
  // 플레이어가 아닌 NPC를 정점으로 인식하게 한다. 각 NPC는 distinct: id·placeholder name('1'..'N')·face 코드·
  // 직위/진영이 콘텐츠 어댑터에서 이미 분리 배정됨.
  const EMPIRE_NATION_ID = 0x500;
  const ALLIANCE_NATION_ID = 0x501;
  const seedableCanonNpcs = (excludeCharId, cap) => {
    if (typeof contentPack?.charactersForNation !== 'function') return [];
    const empire = contentPack.charactersForNation(EMPIRE_NATION_ID) ?? [];
    const alliance = contentPack.charactersForNation(ALLIANCE_NATION_ID) ?? [];
    const all = [...empire, ...alliance].filter((c) => c && charIdOf(c) !== excludeCharId);
    // 직위 보유 인물 우선(위계 의미), 그다음 와이어 계급 높은 순. 결정론적 정렬.
    all.sort((a, b) => {
      const ap = a.postJa ? 0 : 1;
      const bp = b.postJa ? 0 : 1;
      if (ap !== bp) return ap - bp;
      return (b.wireRank ?? 0) - (a.wireRank ?? 0);
    });
    const picked = all.slice(0, Math.max(0, cap | 0));
    // 최상위 군주: 가장 계급 높은 제국 인물 1명에게 "황제"(작위 사다리 밖 최상위 칭호) 스탬프.
    const sovereign = picked.find((c) => c.nationId === EMPIRE_NATION_ID && (c.wireRank ?? 0) >= 1)
      ?? picked.find((c) => c.nationId === EMPIRE_NATION_ID)
      ?? null;
    return picked.map((c) => (c === sovereign ? { ...c, sovereignTitle: '황제' } : c));
  };
  // 캐논 NPC 와이어 계급 클램프: wireRank(콘텐츠팩이 rank_ja→id 해석)를 우선 쓰되, 유효 사다리 범위
  // (1..14=RANK_MAX)로 클램프한다. 미해석이면 characterRankId(npc) 폴백도 동일 클램프. 사다리 밖
  // 값(0/음수/14 초과)이 와이어 rank 필드(@0xd6)에 새어 HUD가 빈/엉뚱 계급을 그리는 것을 막는다.
  const clampedNpcRank = (npc) => {
    const raw = Number.isInteger(npc.wireRank) ? npc.wireRank : characterRankId(npc);
    return raw != null && raw > 0 ? clampRankId(raw) : 0; // 0=미설정(계급 없음)은 그대로 둔다.
  };
  // 캐논 NPC 표시명 unmask 게이트: 매뉴얼이 직접 문서화한 인물(manualDocumented=P1)만 캐논명을
  // 권위적으로 노출(P0 승격)한다. 그 외(DB 추측명 포함)는 추측 데이터를 권위적으로 드러내지 않도록
  // 익명 마스크('Character N')로 폴백한다 — 추측명 P0 승격 금지 원칙.
  const npcSeedDisplayName = (npc) => {
    if (npc.manualDocumented === true) {
      const canon = characterDisplayName(npc);
      if (canon) return canon;
    }
    return `Character ${npc.id}`;
  };
  const currentLocationFields = (character = null) => {
    const ownerSeed = character?.spotOwner ?? character?.spot_owner ?? characterPowerByte(character);
    const capitalSpot = FACTION_CAPITAL[characterFactionKey(character)]?.spot ?? 1;
    const rawSpot = process.env.LOGH_WORLD_SPOT_ID ?? character?.currentSpot ?? character?.spot;
    const spot = positiveIntOr(rawSpot, capitalSpot);
    const legacyProfileSpot =
      process.env.LOGH_WORLD_SPOT_ID === undefined &&
      character?.currentSpot == null &&
      Number(character?.spot) === 1 &&
      capitalSpot !== 1;
    return {
      spot: legacyProfileSpot ? capitalSpot : spot,
      spotOwner: positiveIntOr(process.env.LOGH_WORLD_SPOT_OWNER ?? ownerSeed, 1),
    };
  };
  const findCreatePhaseFace = (body) => {
    let best = null;
    for (let off = 4; off + 4 <= body.length; off += 1) {
      const le = body.readUInt32LE(off);
      const be = body.readUInt32BE(off);
      const value = le >= 1000000 && le <= 1999999 ? le : be;
      if (value >= 1000000 && value <= 1999999) {
        best = {
          face: value,
          birthMonth: off >= 2 ? body.readUInt8(off - 2) : 0,
          birthDay: off >= 1 ? body.readUInt8(off - 1) : 0,
        };
      }
    }
    return best;
  };
  const findLastPackedCreateName = (body) => {
    let best = '';
    for (let lenOff = 4; lenOff + 3 < body.length; lenOff += 1) {
      const rawLen = body.readUInt8(lenOff);
      if (rawLen < 2 || rawLen > CHARACTER_NAME_MAX_UNITS + 1) continue;
      const chars = rawLen - 1;
      const charsOff = lenOff + 2;
      if (charsOff + chars * 2 > body.length) continue;
      let value = '';
      let printable = true;
      for (let i = 0; i < chars; i += 1) {
        const code = body.readUInt16LE(charsOff + i * 2);
        if (code < 0x20) {
          printable = false;
          break;
        }
        value += String.fromCharCode(code);
      }
      if (printable) best = value;
    }
    return best;
  };
  const updateGenerateDraftFromPhase = (requestCategory, innerPayload) => {
    const character = generateCharacterDraft?.character ?? null;
    if (!character) return;
    const body = innerPayload.subarray(2);
    if (requestCategory === 1) {
      const faceFields = findCreatePhaseFace(body);
      if (faceFields) {
        character.face = faceFields.face;
        if (faceFields.birthMonth >= 1 && faceFields.birthMonth <= 12) {
          character.birthMonth = faceFields.birthMonth;
        }
        if (faceFields.birthDay >= 1 && faceFields.birthDay <= 31) {
          character.birthDay = faceFields.birthDay;
        }
      }
    } else if (requestCategory === 3) {
      const flagshipName = findLastPackedCreateName(body);
      if (flagshipName) {
        character.flagshipName = flagshipName;
      }
    }
  };
  const buildGenerateDraftOk = (requestInner = null, requestCategory = null) => (
    buildGenerateCharacterChargeOkInner({
      requestInner,
      requestCategory,
      accepted: (generateCharacterDraft?.status ?? 0) === 1,
      character: generateCharacterDraft?.character ?? null,
    })
  );
  const saveGeneratedProfile = (character) => {
    if (!account || !character || typeof accountStore?.addProfileCharacter !== 'function') return null;
    return accountStore.addProfileCharacter(account, {
      characterId: charIdOf(character),
      name: character.name,
      displayName: character.fullName || character.name,
      lastname: character.lastname,
      firstname: character.firstname,
      faction: character.faction,
      power: characterPowerByte(character),
      blood: character.blood,
      sex: character.sex,
      face: character.face,
      abilities: character.abilities,
      rank: characterRankId(character),
      spot: character.spot,
      spotOwner: character.spotOwner,
      createdAt: character.createdAt,
    });
  };
  const fleetCellId = () => {
    const { col, row } = playerFleetCell();
    return Math.max(0, Math.trunc(Number(row) || 0) * 100 + Math.trunc(Number(col) || 0));
  };
  // 월드진입 시 플레이어 본인 캐릭터를 권위적 전투 캐릭터 레지스트리에 시드한다(worldState 주입 시만).
  // flagship=unitId(0x0325 grid-unit id == char+0x24, RE 월드진입 바인딩 키)이므로 戦死(旗艦 격침) 판정이
  // 이 함선↔사령관 링크로 플레이어 기함을 인식한다. leadership=統率(abilities[0]). 실 플레이어 데이터라 갭 없음.
  // deathToggle은 게임설정(0x0500 미확정)이라 기본 false(負傷워프); returnPlanet은 전략층 미정→null.
  const seedPlayerCharacter = (charId, unitId) => {
    if (!worldState || typeof worldState.upsertCharacter !== 'function' || !charId) return;
    const ch = playerRecord(charId);
    // 계정 로스터(2:2 멀티)가 진영을 지정하면 그 진영으로 시드(로스터 char가 콘텐츠팩에 없어도 戦死 판정이
    // 적/아군을 올바로 가르도록). 미설정이면 캐릭터 레코드의 faction 그대로.
    const acctFaction = accountFactionKey();
    worldState.upsertCharacter({
      id: charId,
      faction: acctFaction ?? ch?.faction ?? 'neutral',
      leadership: Array.isArray(ch?.abilities) ? (Number(ch.abilities[0]) || 0) : 0,
      rank: ch ? (characterRankId(ch) || 0) : 0,
      flagship: unitId,
      returnPlanet: null,
      deathToggle: false,
    });
    // C1 (멀티플레이 함대 가시성, 게이트 ON): 플레이어 함대를 공유 worldState에 등록한다. id=unitId(=char+0x24
    // 그리드-유닛 id, 0x0325 월드진입 바인딩 키)라서 다른 클라가 0x0325 unit 레코드로 이 함대를 그대로 렌더한다.
    // cell=focus cell(row*100+col), faction=req.power 유래 클라 power 바이트(1=제국·2=동맹), commander=charId.
    // 게이트 OFF면 upsertCharacter만(기존 1107 그린 경로 불변). docs/logh7-implementation-specs.md §MP.
    if (mpVisibilityEnabled() && typeof worldState.upsertFleet === 'function') {
      const location = currentLocationFields(ch);
      // 계정 로스터(2:2 멀티) 진영 power로 함대 faction/owner/cell을 일원화 — autologin 기본(제국 겹침) 해소.
      const acctPower = accountPowerByte();
      const acctCap = acctFaction ? FACTION_CAPITAL[acctFaction] : null;
      worldState.upsertFleet({
        id: unitId,
        commander: charId,
        faction: acctPower ?? characterPowerByte(ch) ?? 0,
        cell: fleetCellId(),
        owner: acctPower ?? location.spotOwner,
        mapSection: acctCap?.spot ?? location.spot,
      });
    }
  };
  // ── pre-seed 레버(off-default, LOGH_PRESEED_PLAYER_CHAR=1): 신규 캐릭 등록 확인 다이얼로그가
  // 합성 입력으로 안 닫히는 라이브 블로커(저널 #17)를 우회한다. 빈 계정에 캐논 캐릭 1개를 미리 시드해
  // 두면, 클라가 세션 조인(0x0200) 후 생성 화면 대신 기존 캐릭 카드(0x2004)를 받아 선택→월드진입할 수
  // 있는지 라이브로 시험할 수 있다. 카드/월드 빌더는 무수정, 캐릭 형태는 0x1008 생성 캐릭과 동일.
  if (process.env.LOGH_PRESEED_PLAYER_CHAR === '1' && lobbyCharacters.length === 0) {
    const power = Number(process.env.LOGH_PRESEED_POWER || 2) === 3 ? 3 : 2; // 2=제국 / 3=동맹
    const wp = createWorldPowerByte(power);
    const seeded = {
      id: 1, status: 1, name: 'Reinhard', fullName: 'Reinhard von Lohengram',
      lastname: 'Lohengram', firstname: 'Reinhard', power, createPower: power,
      worldPower: wp, faction: createFactionKey(power),
      blood: 0, sex: 0, face: 0,
      abilities: resolveCreatedAbilities({ abilities: undefined, power, blood: 0 }),
      stamina: STAMINA_FULL, bonusPoint: 0,
      title: clampPlayerTitle(0), rank: initialCharacterRankId(power),
      createRankSubId: initialCreateRankSubId(),
      birthMonth: 0, birthDay: 0, flagshipName: '', flagshipType: 0, flagshipKind: 0, check: 1,
    };
    const loc = currentLocationFields({ worldPower: wp });
    seeded.spot = loc.spot;
    seeded.spotOwner = loc.spotOwner;
    lobbyCharacters.push(seeded);
    const sp = saveGeneratedProfile(seeded);
    if (sp?.createdAt) seeded.createdAt = sp.createdAt;
    refreshNextCharId();
  }
  // 0x0325 unit 레코드의 officer(함대 배속 사관/하위유닛) 필드 = troop_units 배열(B+0x14 count / B+0x18 u32[] ids,
  // cap 10). 이중 파서(FUN_00419ca0 binary / FUN_00419fd0 text)로 확정된 위치이며, 사령관은 commander 슬롯(B+0x08).
  // 권위 출처는 worldState의 함대 엔티티(upsertFleet({boats,commander}))뿐이다 — 엔티티에 사관 배속이 없으면
  // 절대 날조하지 않고 빈 배열로 둔다(P3 금지). 엔티티가 있을 때만 실제 boats/commander를 와이어로 투영한다.
  const fleetOfficerProjection = (unitId) => {
    const fleet = (worldState && typeof worldState.getFleet === 'function')
      ? worldState.getFleet(unitId)
      : null;
    if (!fleet) return null;
    const boats = Array.isArray(fleet.boats)
      ? fleet.boats.map((v) => Number(v) >>> 0).filter((v) => v > 0).slice(0, 10)
      : [];
    const commander = Number(fleet.commander) > 0 ? Number(fleet.commander) >>> 0 : null;
    if (boats.length === 0 && commander == null) return null;
    return { boats, commander };
  };
  const localFleetRecord = ({ unitId, characterId, location }) => {
    // worldState 함대 엔티티가 있으면 실제 배속 사관(boats)·사령관을 officer 필드로 투영한다.
    const officer = fleetOfficerProjection(unitId);
    return [{
      id: unitId,
      faction: location.spotOwner,
      // P0-02 candidate (LOGH_PLAYER_FOCUS_CELL=1, default OFF): the strategic-map inline current-source is
      // source+0x320 == optionalRecord+0x08 (the unit's commander slot). Case 0x325 -> FUN_004c2c80(mode=1)
      // never writes the inline source, so DAT_007cd04c+0x11178 stays 0 and FUN_004d6310 rejects every click
      // (no natural 0x0b01). Seeding +0x08 with the player's home cell (row*100+col) is the server-side attempt
      // to make the current cell non-empty. OFF keeps the proven world-entry bytes (commander=charId).
      // 우선순위: focus-cell 게이트 > worldState 사령관 > 기본 characterId. docs/logh7-implementation-specs.md §6.
      commander: process.env.LOGH_PLAYER_FOCUS_CELL === '1'
        ? fleetCellId()
        : (officer?.commander ?? characterId),
      cell: fleetCellId(),
      owner: location.spotOwner,
      // officer(troop_units) 배속 사관 ids — worldState 엔티티에 있을 때만(없으면 빈 배열, 날조 금지).
      boats: officer?.boats ?? [],
      // Live RE 2026-06-21: FUN_004c2c80 copies unit+0x40 into strategyManager+0x358.
      // FUN_004c9170 uses that base id to resolve the lower-right HUD spot string.
      spotResolverBase: location.spot,
      mapSection: location.spot,
    }];
  };
  const unitFleetsForLocation = ({ unitId, characterId, location }) => (
    fullUnitLocationEnabled() ? localFleetRecord({ unitId, characterId, location }) : null
  );
  const characterHudFields = (character = null) => ({
    camp: byteOrNull(character?.camp ?? characterPowerByte(character)),
    state: positiveIntOr(character?.state ?? character?.entryState, 2),
    fame: positiveIntOr(character?.fame ?? character?.renown, 1),
    pcp: positiveIntOr(character?.pcp ?? character?.pcpPoints ?? character?.politicalCommandPoints, 1200),
    mcp: positiveIntOr(character?.mcp ?? character?.mcpPoints ?? character?.militaryCommandPoints, 1200),
    money: positiveIntOr(character?.money ?? character?.funds, 50000),
    influence: positiveIntOr(character?.influence ?? character?.influenceRank, 1) & 0xff,
    // 体力(stamina) @0x1a9: 미지정이면 만체력으로 시드(생성 캐릭 체력 0 게이지 버그 수정). 캐릭터가
    // stamina를 명시하면 그 값(0 포함)을 쓰되, 기본은 0이 아닌 만체력이라 HUD 게이지가 정상 표시된다.
    stamina: positiveIntOr(character?.stamina, STAMINA_FULL) & 0xff,
  });
  // 행성/요새를 기지 레코드에 추가하는 실험 게이트. 기본 OFF — 라이브 검증 전까지 기존 동작 불변.
  const planetBaseRecordsEnabled = () => process.env.LOGH_PLANET_BASE_RECORDS === '1';
  const staticBaseRecords = () => {
    const systems = Array.isArray(contentPack?.systems) ? contentPack.systems : [];
    return systems.slice(0, 80).map((system, index) => {
      const id = positiveIntOr(system?.id, index + 1);
      return {
        id,
        grid: positiveIntOr(system?.grid ?? system?.gridId, id),
        name: system?.name ?? `System ${id}`,
        name_ko: system?.name_ko ?? system?.nameKo ?? null,
        economySystemName: system?.name ?? `System ${id}`,
        class_: Array.isArray(system?.fortresses) && system.fortresses.length > 0 ? 2 : 1,
        owner: baseOwnerByteFromFaction(system?.faction),
      };
    });
  };
  // 성계 객체(system)에서 행성/요새 기지 시드를 펼친다. id 공간은 성계와 충돌하지 않게
  // systemId*1000 + orbit(행성) / systemId*1000 + 900 + idx(요새)로 할당.
  const planetBaseSeeds = (system) => {
    if (!system) return [];
    const sysId = positiveIntOr(system?.id, 0);
    const sysName = system?.name ?? '';
    const sysGrid = positiveIntOr(system?.grid ?? system?.gridId, sysId);
    const owner = baseOwnerByteFromFaction(system?.faction);
    const planets = Array.isArray(system?.planets) ? system.planets : [];
    const seeds = [];
    for (let i = 0; i < planets.length; i += 1) {
      const p = planets[i];
      const orbit = Number(p?.orbit) || (i + 1);
      seeds.push({
        id: sysId * 1000 + orbit,
        grid: sysGrid,
        name: p?.name_ja ?? p?.name ?? `Planet ${i + 1}`,
        name_ko: p?.name_ko ?? null,
        economySystemName: sysName,
        class_: 3, // P3 guess: planet; RE 라이브 검증 필요
        isPlanet: true,
        owner,
      });
    }
    const fortresses = Array.isArray(system?.fortresses) ? system.fortresses : [];
    for (let i = 0; i < fortresses.length; i += 1) {
      const f = fortresses[i];
      seeds.push({
        id: sysId * 1000 + 900 + i,
        grid: sysGrid,
        name: typeof f === 'string' ? f : (f?.name_ja ?? f?.name ?? `Fortress ${i + 1}`),
        name_ko: f?.name_ko ?? null,
        economySystemName: sysName,
        class_: 2, // fortress
        isPlanet: false,
        owner,
      });
    }
    return seeds;
  };
  // RE: 0x031f elem+0x175 class/type — 0=성계, 1=요새, 2=행성, 3=기지.
  // contentPack class_는 1=성계/2=요새/3=행성이므로 -1 매핑한다.
  const baseClassToPanelType = (class_) => {
    if (class_ === 1) return 0; // system/star
    if (class_ === 2) return 1; // fortress
    if (class_ === 3) return 2; // planet
    return 0;
  };
  const informationBaseSeed = (base) => ({
    id: base.id,
    name: base.name,
    name_ko: base.name_ko ?? null,
    // RE: 0x031f elem+0x04는 진영/owner 바이트(2=동맹,3=제국), class_가 아니다.
    b04: base.owner ?? 1,
    b05: 0,
    b175: baseClassToPanelType(base.class_),
    economySystemName: base.economySystemName ?? base.name,
    isPlanet: base.isPlanet ?? false,
  });
  const currentSpotId = () => currentLocationFields(activeCharacterRecord(activeCharacterId())).spot;
  const defaultSelectedBaseId = (systems) => (
    positiveIntOr(process.env.LOGH_SELECTED_BASE_ID, systems[systems.length - 1]?.id ?? null)
  );
  const informationBaseRecords = (primaryId = null) => {
    const systems = staticBaseRecords();
    const wanted = positiveIntOr(primaryId, currentSpotId());
    const shouldPreloadSelected = primaryId == null || wanted === currentSpotId() || process.env.LOGH_SELECTED_BASE_ID !== undefined;
    const selected = shouldPreloadSelected ? defaultSelectedBaseId(systems) : null;
    const ordered = [];
    const seen = new Set();
    const add = (base) => {
      if (!base || seen.has(base.id)) return;
      seen.add(base.id);
      ordered.push(base);
    };
    const wantedSystem = systems.find((base) => base.id === wanted) ?? null;
    add(wantedSystem);
    // LOGH_PLANET_BASE_RECORDS=1: 현재 성계에 속한 행성/요새도 기지 목록에 노출해
    // 拠点選択 패널에서 행성을 선택할 수 있게 한다. 기본 OFF.
    if (planetBaseRecordsEnabled() && wantedSystem) {
      const rawSystem = Array.isArray(contentPack?.systems)
        ? contentPack.systems.find((s) => positiveIntOr(s?.id, 0) === wantedSystem.id)
        : null;
      for (const p of planetBaseSeeds(rawSystem)) add(p);
    }
    add(systems.find((base) => base.id === selected) ?? null);
    for (const base of systems) add(base);
    return ordered.slice(0, 4).map(informationBaseSeed);
  };
  // content/planet-economy.json loaded once per session (systemName -> planets[]). Read lazily so a server
  // without the economy pack still runs (empty map). Reused by both the PULL (0x031e) and PUSH (world-import)
  // 0x031f paths; only consulted when LOGH_BASE_ECONOMY=1.
  let baseEconomyMap = null;
  const baseEconomy = () => {
    if (baseEconomyMap === null) baseEconomyMap = loadBaseEconomyContent();
    return baseEconomyMap;
  };
  // Project a seed record ({ id, name, b04, b175, ... }) onto the 0x031f builder input. Default path (gate OFF)
  // preserves the proven id+owner+class bytes exactly. Gate ON enriches with the five P0 supply/budget
  // arrays from the system's planets (joined by name); scalars stay 0 (PROVISIONAL offsets). field04/field179
  // carry the RE-confirmed owner/class bytes so the gate never regresses the existing assertions.
  const baseRecordForBuilder = (base) => {
    const owner = { id: base.id, field04: base.b04, field05: base.b05, field179: base.b175 };
    if (!baseEconomyEnabled()) return owner;
    const lookupName = base.economySystemName ?? base.name;
    const planets = lookupName ? baseEconomy().get(lookupName) : null;
    const enriched = economyBaseRecord(planets, owner);
    return enriched ?? owner;
  };
  const firstPlanetSeedOfSystem = (rawSystem) => {
    for (const seed of planetBaseSeeds(rawSystem)) {
      if (seed.isPlanet) return seed;
    }
    return null;
  };
  // 현재 spot(성계)의 첫 행성으로 0x0337 NotifyBaseParameter를 빌드. 행성 기지 시드가 활성화돼 있으면
  // 행성 ID를 base로 사용하고, 아니면 기존처럼 성계의 첫 행성을 사용한다.
  const baseParamForSpot = (spotId, gridOverride = null) => {
    if (!baseEconomyEnabled()) return null;
    const baseRecs = staticBaseRecords();
    const systemRec = baseRecs.find((b) => b.id === spotId);
    if (!systemRec) return null;
    const rawSystem = Array.isArray(contentPack?.systems)
      ? contentPack.systems.find((s) => positiveIntOr(s?.id, 0) === systemRec.id)
      : null;
    const planetSeed = firstPlanetSeedOfSystem(rawSystem);
    const economyName = planetSeed?.economySystemName ?? systemRec.name;
    const planets = economyName ? baseEconomy().get(economyName) : null;
    if (!planets?.length) return null;
    const planet = planetSeed
      ? (planets.find((p) => (p?.name_ja ?? p?.name) === planetSeed.name) ?? planets[0])
      : planets[0];
    return buildNotifyBaseParameterInner(planetToBaseParameter(planet, {
      grid: gridOverride ?? fleetCellId(),
      base: planetSeed?.id ?? spotId,
    }));
  };
  const informationBaseBuilderRecords = (primaryId = null) => informationBaseRecords(primaryId).map(baseRecordForBuilder);
  const worldImportBaseSourceInners = () => {
    const bases = informationBaseBuilderRecords(currentSpotId());
    if (bases.length === 0) {
      bases.push({ id: activeCharacterId(), field04: 1 });
    }
    const institutionContent = Array.isArray(contentPack?.institutions) ? contentPack.institutions : [];
    const roomContent = Array.isArray(contentPack?.rooms) ? contentPack.rooms : [];
    const institutionSeeds = bases.flatMap((base) => buildInstitutionSeedElements({
      baseId: base.id || activeCharacterId(),
      institutions: institutionContent,
      rooms: roomContent,
      spotKey: base.id || activeCharacterId(),
    }));
    // 0x0337 NotifyBaseParameter: 기지관리 경제 패널의 人口/食料/治安/思想/宗教/支持率을 채운다.
    // 게이트: baseEconomyEnabled() (기본 ON, LOGH_BASE_ECONOMY='0'일 때만 OFF).
    // 데이터 소스: content/planet-economy.json에서 현재 기지의 첫 행성을 읽어 planetToBaseParameter로 변환.
    const baseParamInner = baseParamForSpot(currentSpotId(), fleetCellId());
    const inners = [
      buildResponseInformationBaseInner({ bases }),
      buildResponseInformationInstitutionInner({ institutions: institutionSeeds }),
    ];
    if (baseParamInner) inners.push(baseParamInner);
    return inners;
  };
  return {
    get phase() {
      return phase;
    },
    get account() {
      return account;
    },
    /** Transport handshake (0x0034/0x0035/0x0036) completed by the codec layer. */
    markHandshakeComplete() {
      if (phase === LOGIN_PHASES.CONNECTED) {
        phase = LOGIN_PHASES.HANDSHAKE_COMPLETE;
      }
      return phase;
    },
    /**
     * Process a decoded inner message from a transport-0x0030 frame.
     * @param {Buffer} innerPayload
     * @returns {{ kind: 'redirect', account: string, matchedBy: string, redirectInner: Buffer }
     *           | { kind: 'reject', reason: string }
     *           | { kind: 'ignore', reason: string }}
     */
    onInnerMessage(innerPayload) {
      if (phase === LOGIN_PHASES.CLOSED) {
        return { kind: 'ignore', reason: 'session is closed' };
      }
      const innerCode = readInnerCode(innerPayload);
      // Lobby connection (post-redirect) flow. The client sends 0x0020 (session init)
      // expecting NO immediate reply (G143); staying silent makes it advance to 0x2000
      // (LobbyLoginRequest), which we answer with 0x2001 LobbyLoginOK.
      if (innerCode === LOBBY_SESSION_INIT_CODE) {
        const initSelector = innerPayload.length >= 6 ? innerPayload.readUInt32BE(2) : null;
        if (initSelector === 0) {
          phase = LOGIN_PHASES.SS;
          return { kind: 'ss-init-silent', reason: 'conn3 SS session init acknowledged silently' };
        }
        phase = LOGIN_PHASES.LOBBY;
        // Timing-race fix (G177): the lobby FSM closes conn2 ~4ms after we reply to 0x2000, before
        // conn2's recv pump reads the late 0x2001. LOGH_LOBBY_EARLY_OK sends the 0x2001 LobbyLoginOK
        // immediately on the client's 0x0020 (lobby init) so it lands while the pump is actively
        // draining the handshake — the 0x2001 consumer 0x4bdb70 sets the success flag regardless of
        // FSM state, so an early flag-set lets state7 advance instead of timing out.
        if (process.env.LOGH_LOBBY_EARLY_OK === '1') {
          // Keep server-notice pushes for the real 0x2000 login request. The early OK is a timing flag-set
          // while the title/menu scene may not yet be ready to consume the announce panel payload.
          return buildLobbyLoginOkAction({ includeAnnouncement: false });
        }
        return { kind: 'lobby-init-silent', reason: 'lobby session init acknowledged silently' };
      }
      if (innerCode === LOBBY_LOGIN_REQUEST_CODE) {
        phase = LOGIN_PHASES.LOBBY_AUTHENTICATED;
        // Workflow wicdkooh5 (high conf, byte-verified): inner 0x7001 is INERT on the lobby session
        // (case 0x4bdca6 just stores a blob, no redirect). The advance is gated solely on success
        // flag *(0x7ccffc)+0x35837b, set ONLY by the inner-0x2001 consumer 0x4bdb70. So the reply to
        // 0x2000 must be 0x2001 LobbyLoginOK (status 0); the lobby->world redirect comes later as a
        // 0x200a (handled in the 0x2009 branch). The auth-server assigns a monotonic S->C id so this
        // passes the decipher sequence gate (0x645eda: id > [cipher+0x20]).
        // LOGH_LOBBY_REPLY=redirect7001 keeps the (proven-inert) 0x7001 path reachable for A/B only.
        if (process.env.LOGH_LOBBY_REPLY === 'redirect7001') {
          return { kind: 'lobby-redirect', redirectInner: buildRedirectInner(world ?? lobby ?? {}) };
        }
        return buildLobbyLoginOkAction();
      }
      if (innerCode === SS_LOGIN_REQUEST_CODE) {
        phase = LOGIN_PHASES.SS_AUTHENTICATED;
        return { kind: 'ss-response', okInner: buildSsLoginOkInner({ status: 1 }) };
      }
      if (innerCode === SS_GAME_LOGIN_REQUEST_CODE) {
        // G146: pushing 0x0204 here (unsolicited, before the client requests 0x0203) is an
        // OPT-IN experiment (LOGH_WORLD_PUSH=1) — in a live run it perturbed the SS sequence
        // (client re-sent 0x0205) and did not clear the world-build crash, so it is gated off
        // by default until the consumption/timing is confirmed by instrumentation.
        const action = { kind: 'ss-response', okInner: buildSsGameLoginOkInner({ status: 1 }) };
        const extraInners = [];
        if (process.env.LOGH_WORLD_PUSH === '1') {
          extraInners.push(buildSsCharacterIdResponseInner({ characterId: activeCharacterId() }));
        }
        if (rosterPushEnabled()) {
          // Push the character-roster transaction (0x1200 → 0x120f → 0x1201) so clientBase+0x554da4 is
          // filled (count≥1, ≥1 record group=2) before the lobby menu buttons are used. The roster is
          // the account's existing characters (best-effort id/name); an empty account still gets one
          // gate-passing record so the buttons enable. Verified offsets: GROUP @record+0x00,
          // THRESHOLD @record+0x04 (FUN_00597ff0); filler FUN_004c1f10; dispatcher FUN_004ba2b0.
          const roster = lobbyCharacters
            .map((c) => ({ id: charIdOf(c), name: c?.name ?? c?.fullName ?? c?.lastname ?? null }))
            .filter((c) => c.id > 0);
          extraInners.push(...buildCharacterRosterTransaction({ characters: roster }));
        }
        if (extraInners.length > 0) {
          action.extraInners = extraInners;
        }
        return action;
      }
      if (innerCode === SS_REQ_GRID_INITIALIZE_CODE) {
        // G164 player spawn timing: inject the spawn on RequestGridInitialize (0x0f02), sending
        // 0x0204 + 0x0325 + 0x0323 FIRST and the 0x0f03 GridInitialize_OK ack LAST. This is the
        // tightest pre-render, post-reset window: the world-init reset already fired at 0x0f01
        // (G162: it zeroes client+0x36a5dc), so the 0x0323 here brings count back to 1 and it
        // SURVIVES (no later reset before the HUD render). The frame that flips gridInitialized
        // (via 0x0f03) runs FUN_004c2a80, which rebuilds PLAYER_INFO from the session array (now
        // count=1, unit gate satisfied by 0x0325) BEFORE the HUD reads it — so FUN_004c7290
        // returns non-null and the [0x80] crash is skipped. (The 2nd-0x0300 inject was one frame
        // too late: the HUD renders before the network reply is drained.)
        if (worldPlayerEnabled()) {
          // Prefer the lottery-charged candidate (오리지널 추첨 0x1006) so the chosen canon character
          // renders in-world; otherwise the env/default world char id.
          const charId = activeCharacterId();
          const unitId = sessionWorldUnitId();
          seedPlayerCharacter(charId, unitId); // 戦死 판정용 플레이어 사령관 시드(flagship=unitId 링크)
          const location = currentLocationFields(playerRecord(charId));
          // G184: large frames are NOT dropped by size — the 52KB 0x0325 sent HERE (0x0f02) processes
          // fine (unitCount @0x41a364 became non-zero in G167/G180). The 5KB 0x0315 only failed when
          // sent at 0x0314 during the early-walk 58KB+21KB burst. So the strategic grid (0x0315) is
          // injected HERE too (LOGH_STRAT_GRID=1), at the proven post-walk timing, before 0x0f03.
          // G187 ordering discriminator: send the 5KB 0x0315 FIRST (it failed at 3rd position in
          // G184 while 52KB 0x0325 at 1st position succeeded) to test position vs content.
          const extraInners = [];
          const activeRecord = playerRecord(charId);
          if (worldImportBaseRecordsEnabled()) {
            extraInners.push(...worldImportBaseSourceInners());
          }
          const earlyGalaxyGridOwnsLiveTable = stratGalaxyEnabled() && stratGridEarlyEnabled();
          if (!earlyGalaxyGridOwnsLiveTable && stratGalaxyEnabled()) {
            // Register the 80 recovered star systems as clickable sector markers, plus the player fleet.
            // Object table (0x0313) is pushed BEFORE the cell grid (0x0315), matching the fleet ordering.
            const { objectInner, cellInner } = strategicGalaxyGridInners();
            extraInners.push(objectInner);
            extraInners.push(cellInner);
          } else if (!earlyGalaxyGridOwnsLiveTable && stratFleetEnabled()) {
            // 함대-only 보드(갤럭시 off, 함대 on 폴백). docs/logh7-fleet-render-re.md §1.1 P0 반박에 따라
            // 함대를 klass-3 마커로 박지 않는다 — 오브젝트테이블엔 함대 클래스가 없어 klass-3은 가짜 성계
            // dot로 오인 렌더된다. 대신 함대 셀을 SPACE(byte1=1, 항행 가능·마커 없음)로 둬서 함대가 워프해
            // 있을 수 있는 항행 셀만 만든다. 함대 자체 렌더/선택은 직후의 0x0325 unit 레코드 경로가 담당한다.
            const { col, row } = playerFleetCell();
            extraInners.push(
              buildStaticInformationGridTypeInner({
                objects: [{ value: TERRAIN_VALUE.SPACE, contentId: TERRAIN_VALUE.SPACE, klass: TERRAIN_VALUE.SPACE, variant: 0 }],
              }),
            );
            extraInners.push(
              buildStaticInformationGridInner({
                width: 100,
                height: 50,
                cells: [{ col, row, value: TERRAIN_VALUE.SPACE }],
              }),
            );
          } else if (!earlyGalaxyGridOwnsLiveTable && stratGridEnabled()) {
            extraInners.push(buildStaticInformationGridInner({ width: 100, height: 50, gridType: 0 }));
          }
          extraInners.push(buildInformationUnitRecordInner({
            unitId,
            unitCount: 1,
            wireLayout: unitWireLayout(),
            fleets: unitFleetsForLocation({ unitId, characterId: charId, location }),
          }));
          const displayName = characterDisplayName(activeRecord ?? {}) ?? `Character ${charId}`;
          // Keep this world-init record minimal, but do send a valid parentage display name; otherwise
          // the lower-left HUD can fall through to stale client strings. Rich fields remain post-load only.
          // The experimental action-list/card slots at +0x250/+0x254 are opt-in only.
          extraInners.push(buildInformationCharacterRecordInner({
            characterId: charId,
            gridUnitId: unitId,
            power: characterPowerByte(activeRecord),
            camp: byteOrNull(activeRecord?.camp ?? characterPowerByte(activeRecord)),
            officerCount: 5, // C002 unit-list 패널 행 수 (PLAYER_INFO+0x270) — G001 사이클 5
            lastname: displayName,
            displayName,
            spotResolverBase: location.spot,
            spot: earlyWorldLocationEnabled() ? location.spot : null,
            spotOwner: earlyWorldLocationEnabled() ? location.spotOwner : null,
            seatEntries: activeSeatEntries(charId),
            rank: characterRankId(activeRecord),
            // The in-world lower-left HUD must key off display_name/rank. Japanese reference screens
            // show name+rank/post there; sending peerage/post text here can make the HUD fall through
            // to strings like "황제" in the name slot. Keep titlename for info/personnel lanes only.
            title: null,
            wireEndian: 'be',
          }));
          // 캐논 NPC 위계 시드(LOGH_SEED_CANON_NPCS, 기본 ON): 플레이어 외 캐논 인물을 권위적 0x0323
          // 레코드로 월드에 채워, 클라 HUD가 외톨이 플레이어를 "황제"로 폴백하는 근본을 제거한다(상위
          // 직위·계급·작위를 점유하는 인물이 존재하게). 와이어 레이아웃 무변경 — 같은 빌더에 inner만 추가.
          // 프레임 예산을 위해 canonNpcSeedCap()으로 상한. 진영명/직위/임시 O군 초상(P2)/spot을 NPC 데이터에서.
          if (seedCanonNpcsEnabled() && typeof contentPack?.charactersForNation === 'function') {
            const npcs = seedableCanonNpcs(charId, canonNpcSeedCap());
            for (const npc of npcs) {
              const npcLoc = currentLocationFields(npc);
              // 표시명: 매뉴얼 문서화 인물만 캐논명 unmask(P0), 그 외엔 익명 마스크(추측명 P0 승격 금지).
              const npcName = npcSeedDisplayName(npc);
              extraInners.push(buildInformationCharacterRecordInner({
                characterId: npc.id,
                power: characterPowerByte(npc),
                camp: byteOrNull(npc.camp ?? characterPowerByte(npc)),
                lastname: npcName,
                displayName: npcName,
                spotResolverBase: npcLoc.spot,
                spot: earlyWorldLocationEnabled() ? npcLoc.spot : null,
                spotOwner: earlyWorldLocationEnabled() ? npcLoc.spotOwner : null,
                // 캐논 NPC는 콘텐츠팩이 해석한 와이어 계급 id(wireRank)를 우선 사용(rank_ja→id) + 유효
                // 사다리 범위(1..14)로 클램프. 없으면 characterRankId 폴백(역시 클램프).
                rank: clampedNpcRank(npc),
                // info/personnel 레인용 작위명(정보 패널에서만): 군주는 "황제"(최상위 칭호)를, 그 외엔 미해석.
                title: npc.sovereignTitle ?? characterTitleName(npc),
                face: Number.isInteger(npc.faceCode) ? npc.faceCode : undefined,
                wireEndian: 'be',
              }));
            }
          }
          // G196 tactical-unit table (0x33b): the units FUN_004c32a0 places into the tactical pool
          // once mode==0. Driven by the authored server-data content pack when present (so spawned
          // units = the scenario's fleets); falls back to a single player-controllable unit matching
          // the unit table above.
          if (tacticsUnitEnabled()) {
            extraInners.push(
              contentPack
                ? contentPack.buildTacticsUnitTableInner()
                : buildResponseTacticsInformationInner({
                    units: [{ unitId, controllable: 1, mapSection: unitId }],
                  }),
            );
          }
          extraInners.push(buildWorldDataResponseInner(0x0f03));
          return withTrace({
            kind: 'lobby-response',
            okInner: buildSsCharacterIdResponseInner({ characterId: charId, wireEndian: 'be' }),
            extraInners,
          }, characterTrace(charId));
        }
        // Answer 0x0f03 GridInitialize_OK (status 1). LOGH_WORLD_PUSH=1 also pushes the 724-byte
        // 0x0323 character record (matching char id) for the world-placement experiment (G145/G146).
        const action = { kind: 'lobby-response', okInner: buildWorldDataResponseInner(0x0f03) };
        if (process.env.LOGH_WORLD_PUSH === '1') {
          const charId = worldCharId();
          action.extraInners = [buildInformationCharacterRecordInner({
            characterId: charId,
            seatEntries: activeSeatEntries(charId),
          })];
        }
        return action;
      }
      // 0x0300 RequestTime: the client syncs the game clock. Answer 0x0301 ResponseTime
      // with a NON-ZERO server start time (G143) — the generic empty walker returned
      // startTime=0, the suspected world-build crash (zero/invalid game clock fed to
      // FUN_004c5a30). Must precede the generic walk below.
      // G180/G184: 0x0314 RequestStaticInformationGrid answered by the generic empty walker below;
      // the REAL 100x50 grid is injected at 0x0f02 instead (early-walk burst dropped it at 0x0314).
      if (innerCode === SS_REQ_TIME_CODE) {
        return { kind: 'lobby-response', okInner: buildResponseTimeInner() };
      }
      // G210 strategic-grid SNAPSHOT-GUARD fix: the strategic cell/object tables are copied
      // staging->live by FUN_004c5350, a RUN-ONCE copier guarded by clientBase+0x2c03c0. That copy is
      // fired by the world-reset chain FUN_004c2a30 <- FUN_004b76e0 <- FUN_004b68f0 — the client SCENE /
      // render state machine, NOT a network message. So the snapshot can fire as soon as the strategic
      // scene first renders, capturing WHATEVER is in staging (clientBase+0x3f444c cells / +0x3f57d4
      // objects) AT THAT MOMENT and freezing it into live (+0x2c03cc / +0x2c1755). The guard then makes
      // every later 0x0315/0x0313 a no-op for LIVE.
      //
      // LIVE FRIDA PROOF (clientBase=0x12cc3020): guard 0x2c03c0 already == 1; live cells = 27 scattered
      // values up to 121 (>88 = NOT placeable objects) = uninitialised staging memory frozen by the
      // snapshot, NOT the server grid; live object table = 1 stale class-3 record. The server's grid is a
      // verified-perfect 81-cell / 81-object frame (decoding buildStrategicGalaxyGrid with the exact
      // FUN_004abbb0 algorithm yields 81 cells, values 3..83, sum==5000, VALID) — but it was pushed at
      // 0x0f02, AFTER the scene snapshot, so it never reached live. The empty walker 0x0315 (w=0,h=0,
      // rleCount=0) makes FUN_004abbb0 return WITHOUT writing, so it does NOT even clear the garbage.
      //
      // FIX: answer the FIRST strategic-grid requests (0x0312 GridType -> 0x0313 object table, 0x0314
      // Grid -> 0x0315 cell grid) with the REAL galaxy grid, so valid data lands in staging BEFORE the
      // run-once scene snapshot fires. The 0x0f02 push is kept as a redundant refresh (harmless; it just
      // can't reach live once the guard is set). Object table (0x0313) is sent on its own request; the
      // cell grid (0x0315) is sent with the object table prepended as an extraInner so both staging
      // buffers are populated together regardless of which request the client issues first.
      if (
        (innerCode === SS_REQ_STATIC_GRID_TYPE_CODE || innerCode === SS_REQ_STATIC_GRID_CODE) &&
        worldPlayerEnabled() &&
        stratGalaxyEnabled() &&
        // DISABLED by default (G210b): LIVE-PROVEN that answering 0x0314 with a NON-EMPTY 0x0315 (real RLE
        // grid) STALLS the world-init walk — it halts after 0x0314->0x0315 and never reaches 0x0f02. The
        // empty walker 0x0315 is a decode no-op so the walk continues; a real decode does not. Removing the
        // sibling extraInner did NOT help, so the stall is the real cell-grid payload itself, not the extra
        // frame. Since the snapshot (FUN_004c5350) is scene-timed, the real grid must instead reach LIVE via
        // a CLIENT-SIDE guard-clear (clear clientBase+0x2c03c0 after the 0x0f02 push so the snapshot re-runs)
        // — a binary patch tracked in docs/logh7-inworld-backlog.md (A0). Keep this server path for then.
        stratGridEarlyEnabled()
      ) {
        const { objectInner, cellInner } = strategicGalaxyGridInners();
        // LIVE REGRESSION (G210a): sending the sibling grid as an extraInner here STALLS the world-init
        // walk at 0x0314 (trace: walk halts after 0x0314->0x0315 + 0x0313 extra, never reaches 0x0f02 —
        // the unrequested extra frame doesn't drain the client's walk send-queue, same failure class as
        // the old 0x0304 populated-body stall). FIX: answer each grid request with a SINGLE real-data frame, the
        // exact shape the generic empty walker used (which never stalled) — just with the real grid. The
        // client requests BOTH 0x0312 and 0x0314 in the walk, so both staging buffers fill across the two
        // single-frame replies, before the scene-timed snapshot (FUN_004c5350) freezes staging->live.
        if (innerCode === SS_REQ_STATIC_GRID_TYPE_CODE) {
          return { kind: 'lobby-response', okInner: objectInner }; // 0x0312 -> real 0x0313 object table
        }
        return { kind: 'lobby-response', okInner: cellInner }; // 0x0314 -> real 0x0315 cell grid
      }
      if (innerCode === SS_REQ_MESSENGER_STAT_CODE && gridEnterEnabled()) {
        // G173 grid-enter: answer 0x0f07 then push 0xb09 + 0xb0a so the client places the player's
        // fleet into the grid (FUN_004c32a0 reads the resident session/unit data). okInner is the
        // normal 0x0f07 ack; the grid-enter notifies follow, 0xb0a last (it triggers placement).
        // FIX A (G211, nodata-re): 0xb09 NotifyEnterGridBegin RESETS the client char-record count
        // (clientBase+0x36a5dc) to 0, so the 0x0325/0x0323 sent back at 0x0f02 are no longer resident
        // when 0xb0a triggers FUN_004c2a80(1) to build the player-slot world entity (clientBase+0xc).
        // Without that entity FUN_004c7290()==0 and the in-world HUD shows "이미 탈퇴하셨습니다" + NO DATA.
        // Re-sending the unit (0x0325) + character (0x0323) records BETWEEN begin and end can rebuild
        // PLAYER_INFO, but live QA showed malformed/partial fields may leak path-like garbage into the HUD.
        // Keep the proven-safe default to begin/end only; expose record replay as an explicit experiment.
        const charId = activeCharacterId();
        const unitId = sessionWorldUnitId();
        seedPlayerCharacter(charId, unitId); // 戦死 판정용 플레이어 사령관 시드(flagship=unitId 링크)
        const worldChar = playerRecord(charId);
        const location = currentLocationFields(worldChar);
        const displayName = characterDisplayName(worldChar ?? {});
        const baseCharacterRecord = {
          characterId: charId,
          gridUnitId: unitId,
          power: characterPowerByte(worldChar),
          camp: byteOrNull(worldChar?.camp ?? characterPowerByte(worldChar)),
          officerCount: 5, // C002 unit-list 패널 행 수 (PLAYER_INFO+0x270) — G001 사이클 5
          spot: location.spot,
          spotOwner: location.spotOwner,
          spotResolverBase: location.spot,
          wireEndian: 'be',
          seatEntries: activeSeatEntries(charId, { postload: true }),
        };
        const characterRecord = postloadRichCharacterEnabled()
          ? {
              ...baseCharacterRecord,
              abilities: resolveCreatedAbilities({
                abilities: worldChar?.abilities ?? null,
                power: characterPowerByte(worldChar) ?? 0,
                blood: worldChar?.blood ?? worldChar?.origin ?? 0,
              }),
              ...characterHudFields(worldChar),
              lastname: displayName,
              displayName,
              rank: characterRankId(worldChar),
              // See the early 0x0f02 record: post-load HUD refreshes should not overwrite the
              // visible character name with peerage/post text.
              title: null,
              face: Number.isInteger(worldChar?.portraitIndex) ? worldChar.portraitIndex : null,
            }
          : baseCharacterRecord;
        const postloadExtras = [
          // value=0 (NOT 1): client FUN_004ba2b0 case 0xb0a runs the required FUN_004c2a80(1)
          // PLAYER_INFO↔unit linkage ONLY when client+0x4376ec==0 (binary-proven via Ghidra). value=1
          // took the wrong camera/zoom branch and left the fleet marker non-selectable; value=0 makes
          // the strategic fleet marker clickable so a click emits CommandMoveGrid 0x0b01.
          buildNotifyEnterGridBeginInner({ value: 0 }),
        ];
        if (postloadPlayerRecordEnabled()) {
          postloadExtras.push(
            // FIX (G211 / inworld-operation-re 2026-06-19): 0xb09가 char-record count(+0x36a5dc)를 0으로
            // 리셋하므로, 0xb0a의 FUN_004c2a80(1) PLAYER_INFO↔unit linkage가 record[0]==client+0x3584a0
            // (selectedChar)를 매칭하려면 selectedChar(0x0204)도 begin↔end 사이에 재전송해야 한다. 재RE
            // 워크플로 유력원인 = 이 selectedChar 미재전송(0x0325/0x0323은 이미 재전송 중). 검증된 world-entry
            // 순서(0x0204→0x0325→0x0323)대로 먼저 push. 4바이트 char id라 HUD garbage 위험 없음.
            buildSsCharacterIdResponseInner({ characterId: charId, wireEndian: 'be' }),
            buildInformationUnitRecordInner({
              unitId,
              unitCount: 1,
              wireEndian: postloadUnitWireEndian(),
              wireLayout: postloadUnitWireLayout(),
              fleets: unitFleetsForLocation({ unitId, characterId: charId, location }),
            }),
            buildInformationCharacterRecordInner(characterRecord),
          );
        }
        postloadExtras.push(buildNotifyEnterGridEndInner({ value: 0 }));
        if (stratSeqStartEnabled()) {
          // 순차 2단계: value=1 재-grid-enter → 0xb0a end가 +0x4376ec!=0 else분기 → StrategySequence(+4=1)
          // 시작 → FUN_004fef90 state machine → event-9 자동 enqueue → 클릭확정(0x0b01) 가능. value=0
          // 함대 linkage는 위 end(value:0)에서 이미 적용됨(배타적 두 분기를 순차로 둘 다).
          postloadExtras.push(
            buildNotifyEnterGridBeginInner({ value: 1 }),
            buildNotifyEnterGridEndInner({ value: 1 }),
          );
        }
        if (gridSelectorProbeEnabled()) {
          // 0x0317 셀렉터 레버: byte[2]=(value>>16)&0xff = clientBase+0x35f35a 셀렉터 → FUN_004b68f0 mode 분기
          // 라이브 관측용(1회). deferred 아닌 postloadExtras(즉시) — single-dword라 렌더 stall 위험 없음.
          postloadExtras.push(buildInformationGridInner({ grid: gridSelectorValue() }));
        }
        if (postloadRichCharacterEnabled()) {
          postloadExtras.push(
            // 0x0323 seeds the world/session record; 0x356 is the post-load delta path that refreshes
            // g_StrategyCommandTray.Update after the player slot exists. Action-list seats stay opt-in.
            buildNotifyInformationCharacterInner({ ...characterRecord, wireEndian: 'be' }),
          );
          if (postloadSimpleInfoEnabled()) {
            postloadExtras.push(...buildSimpleInfoTransaction({ character: simpleInfoCharacterRecords() }));
          }
        }
        if (actionListAppointmentEnabled()) {
          const categoryDword = actionListCategoryDword();
          if (categoryDword != null) {
            postloadExtras.push(
              // Experimental C002 discriminator only: live QA showed this extra 0x0707 can appear in
              // trace without entering the native dispatcher/apply path.
              buildCardAppointmentInner({
                actor: charId,
                targetOutfit: unitId,
                cardCharacter: categoryDword,
                seatRole: 0,
                chiefSpot: location.spot,
              }),
            );
          }
        }
        const gridEnterAction = withTrace({
          kind: 'lobby-response',
          okInner: buildActiveMessengerStatusInner(activeCharacterId()),
          extraInners: postloadExtras,
        }, characterTrace(charId));
        if (battleEntryProbeEnabled()) {
          // 서버-주도 전술맵 진입 probe: 자기 유닛 1기를 전술 필드 기본 중심에 배치하고 0x42f
          // NotifyChangeMode(modeKind=0)로 전술 풀을 켠다. unitId는 0x0325로 이미 클라에 알려진 자기 유닛.
          // ★라이브 확정: 이 시퀀스를 grid-enter extraInners(즉시)에 넣으면 전략 씬 렌더 전에 0x42f가 들어가
          // 전략맵 렌더가 멈춤(control 대조로 입증). 따라서 deferredBattleInners로 분리해 서버가 전략맵
          // 렌더 후 지연 푸시하게 한다. 정확 전술좌표·시퀀싱은 라이브 후속(P2).
          // ★전술맵 렌더 조건: placeholder 단일 함선은 전술 데이터 불완전으로 stall(메모리 확정).
          // worldState 전술 함선(LOGH_NPC_SEED 시드 양진영 함대 포함)을 COMPLETE participant로 전달해
          // 완전 전술 데이터(좌표 + 6방향 실드/빔건 비-제로 + 함장 로스터)를 구성한다(buildBattleEntryParticipants).
          // ★tacticsArg0=1: 0x0f1f 소비처 FUN_004c1b20가 *param_2==1일 때만 전술 engage(+0x357e8c=2)로 분기.
          //   기본(0)은 strategic-return(else) 분기라 전술 풀이 켜지지 않음(RE-확정).
          const { participants, characters } = buildBattleEntryParticipants(worldState, {
            unitId, character: charId, cap: 12, center: 100, scale: 8,
          });
          const battleSteps = openBattleField({
            participants,
            characters,
            anchorId: unitId,
            modeKind: 0,
            tacticsArg0: 1,
          });
          // ★갭2 해소: 전술 0x33b 유닛테이블(buildTacticsInformationUnitShipInner)을 클라
          // populator FUN_004c32a0가 해석하려면, 각 0x33b 유닛이 0x325 유닛테이블(+0x41a368, id로
          // stride 0x58 매칭)·0x323 캐릭레코드(+0x36a5dc count 게이트)와 cross-match돼야 한다.
          // 둘 중 하나라도 비면 유닛이 LAB_004c3a13로 스킵→NOW LOADING 정체(docs §0x33b cross-dep).
          // 따라서 배틀 참가 전원의 0x325 유닛 + 0x323 캐릭 레코드를 battleSteps 앞에 prepend한다.
          // 매칭 키: participant.shipId == 0x33b ships[].id == 0x325 fleets[].id == 0x323 characterId(함장).
          // 0x325 fleets[].id를 participant.shipId로 두어 0x33b id와 동일하게 정렬(cross-match 보장).
          const toU32 = (v) => (Number.isFinite(v) ? (v >>> 0) : 0);
          const rosterFleets = participants.map((p) => ({
            id: toU32(p.shipId),
            characterId: toU32(p.character) || charId,
            // 함장 char id가 0x323 count 게이트에 맞물리도록 commander로도 노출.
            commander: toU32(p.character) || charId,
            spotResolverBase: location.spot,
            mapSection: location.spot,
          }));
          // 0x325 유닛테이블 1개(참가 전원). 기존 world-entry 0x0f02 호출과 같은 빌더·인자 형태 미러링.
          const rosterUnitInner = buildInformationUnitRecordInner({
            unitId,
            unitCount: rosterFleets.length,
            wireLayout: postloadUnitWireLayout(),
            wireEndian: postloadUnitWireEndian(),
            fleets: rosterFleets,
          });
          // 0x323 캐릭 레코드들(참가 함장 전원 + 플레이어). characters[]가 비어 있으면 최소 플레이어
          // 함장 1명은 보장(0x36a5dc count>0). 데이터 값(power/camp 등)은 worldState 산출 그대로 — 승격 금지.
          const rosterCharIds = characters.length ? characters : [charId];
          const rosterCharInners = rosterCharIds.map((cid) => {
            const worldChar = (typeof worldState?.getCharacter === 'function')
              ? worldState.getCharacter(cid)
              : null;
            return buildInformationCharacterRecordInner({
              characterId: cid,
              gridUnitId: unitId,
              power: characterPowerByte(worldChar),
              camp: byteOrNull(worldChar?.camp ?? characterPowerByte(worldChar)),
              rank: characterRankId(worldChar),
              wireEndian: 'be',
            });
          });
          gridEnterAction.deferredBattleInners = [
            rosterUnitInner,
            ...rosterCharInners,
            ...battleSteps.map((step) => step.inner),
          ];
          gridEnterAction.deferredBattleDelayMs = battleEntryProbeDelayMs();
        }
        if (fleetMoveProbeEnabled()) {
          // 서버 권위적 함대 이동: own 셀 → 인접 셀로 0x0b07 지연 푸시(클라 command-UI 우회).
          const destCell = (fleetCellId() + fleetMoveProbeDestDelta()) >>> 0;
          gridEnterAction.deferredBattleInners = [
            buildNotifyMovedGridInner({ units: [{ unitId, cell: destCell }] }),
          ];
          gridEnterAction.deferredBattleDelayMs = fleetMoveProbeDelayMs();
        }
        // 상태전환 arm probe: battle/fleet-move probe가 모두 OFF일 때만(같은 deferredBattleInners 필드 공유).
        // 서버가 월드 도달 후 0x0f1f NotifyTactics(arg0 byte0=1)를 1회 지연 푸시 → 전략맵 위에서 전술 arm.
        if (stateTransitionProbeEnabled() && !battleEntryProbeEnabled() && !fleetMoveProbeEnabled()) {
          gridEnterAction.deferredBattleInners = [
            buildNotifyTacticsInner({ arg0: stateTransitionProbeArg0(), arg1: stateTransitionProbeArg1() }),
          ];
          gridEnterAction.deferredBattleDelayMs = stateTransitionProbeDelayMs();
        }
        return gridEnterAction;
      }
      // 2026-06-15: the unmodified client never sends 0x0f07 (MessengerStat) in the world walk, so the
      // grid-enter notifies above never fire and the fleet marker stays non-selectable. Route the SAME
      // grid-enter onto 0x0f06 — the last world-init request the client DOES send, AFTER the 0x0f02
      // spawn — so the FUN_004c2a80(1) PLAYER_INFO↔unit linkage runs (via 0xb0a value=0) and a strategic
      // click then emits CommandMoveGrid 0x0b01. okInner matches the generic walk's (innerCode+1) reply.
      if (innerCode === 0x0f06 && gridEnterEnabled()) {
        const charId = activeCharacterId();
        return withTrace({
          kind: 'lobby-response',
          okInner: buildActiveMessengerStatusInner(charId),
          extraInners: [
            buildNotifyEnterGridBeginInner({ value: 0 }),
            buildNotifyEnterGridEndInner({ value: 0 }),
            ...(stratSeqStartEnabled()
              ? [
                  // 순차 2단계: value=1 재-grid-enter → StrategySequence(+4=1) 시작 → event-9 → 클릭확정
                  buildNotifyEnterGridBeginInner({ value: 1 }),
                  buildNotifyEnterGridEndInner({ value: 1 }),
                ]
              : []),
            // 0x0317 셀렉터 레버(라이브-prep): byte[2]=(value>>16)&0xff → clientBase+0x35f35a → mode 분기 관측.
            ...(gridSelectorProbeEnabled()
              ? [buildInformationGridInner({ grid: gridSelectorValue() })]
              : []),
          ],
        }, characterTrace(charId));
      }
      if (innerCode === SS_REQ_MESSENGER_STAT_CODE) {
        const charId = activeCharacterId();
        return withTrace({
          kind: 'lobby-response',
          okInner: buildActiveMessengerStatusInner(charId),
        }, characterTrace(charId));
      }
      // ── Account-family ROSTER PRIMING (새 캐릭터 작성 / 오리지널 추첨, workflow wndew4jop) ────────────
      // The character-management screen runs these three account-family RPCs BEFORE the creation form is
      // reachable. They were being swallowed by the generic walker below with ZERO-count payloads, which
      // fails the client roster gate FUN_00597ff0 (count 0 → scene bounces to back-state 0x29). These
      // explicit branches MUST precede the walker. Answer with NON-EMPTY rosters (the gating one is
      // 0x1002 → 0x1003 ResponseUnChargeCharacter, which MUST carry count >= 1) sourced from the
      // account's characters + the canon/lottery candidate pool, so the screen paints AND offers creation.
      if (innerCode === REQ_INFO_ACCOUNT_CODE) {
        const owned = lobbyCharacters.map(charIdOf).filter((id) => id > 0);
        return {
          kind: 'lobby-response',
          okInner: buildResponseInformationAccountInner({
            accountId: 0,
            name: account ?? '',
            ownedCharacterCount: owned.length,
            maxCharacters: MAX_ENTRY_CHARACTERS,
          }),
        };
      }
      if (innerCode === REQ_UNCHARGE_CHARACTER_CODE) {
        return {
          kind: 'lobby-response',
          okInner: buildResponseUnChargeCharacterInner({ available: rosterCharIds() }),
        };
      }
      if (innerCode === REQ_CHARACTER_ENTRY_STATE_CODE) {
        const ownedCount = lobbyCharacters.map(charIdOf).filter((id) => id > 0).length;
        return {
          kind: 'lobby-response',
          okInner: buildResponseCharacterEntryStateInner({
            activeCharacterId: 0,
            entered: 0,
            availableSlots: Math.max(0, MAX_ENTRY_CHARACTERS - ownedCount),
            ownedCount,
          }),
        };
      }
      // 오리지널 캐릭터 추첨 confirm: CommandOriginalCharacterCharge 0x1006 (workflow wndew4jop). The player
      // picked a lottery candidate; charge it. Validate the id against the offered candidate set, set it
      // as the world character so the later 0x0204/0x0323 path renders the canon character, and echo a
      // 0x1006 OK whose body is >= 6 dwords with a non-zero success marker (consumer FUN_004be760 copies
      // 6 dw and prints ORIGINAL CHARGE OK!! when the marker is set; a status-0/empty echo = MISSTAKE).
      // MUST precede the generic walker: innerCode+1 = 0x1007 IS in WORLD_RESPONSE_OBJECT_SIZES, so the
      // walker would otherwise swallow 0x1006 with a zero-body 0x1007 (= MISSTAKE).
      if (innerCode === CMD_ORIGINAL_CHARGE_CODE) {
        const parsed = parseInboundOriginalCharacterCharge(innerPayload);
        const candidates = drawLotteryCandidates();
        const charged = parsed ? parsed.characterId >>> 0 : 0;
        const ok = charged > 0 && (candidates.length === 0 || candidates.includes(charged));
        const okInner = buildLobbyResponseInner(CMD_ORIGINAL_CHARGE_CODE, 0x18);
        if (ok) {
          chargedCharacterId = charged;
          okInner.writeUInt32LE(charged, 6); // dword0 = charged char id
          okInner.writeUInt32LE(1, 10); // dword1 = success marker (non-zero → ORIGINAL CHARGE OK!!)
        }
        // On reject the body stays all-zero (status 0 → MISSTAKE).
        return { kind: 'lobby-response', okInner };
      }
      // ── Info-panel READ requests (in-game 캐릭터 정보 카드, workflow w2xh1y4z6) ───────────────────────
      // Opening an info panel makes the client send Request* = (responseCode - 1) with a length-prefixed
      // id list; the generic walker answers ZERO-filled (blank panel). Wire the 0x0322 → 0x0323 character
      // card from the content pack so the panel paints a real (canon-named) record. request body =
      // [u16 count][u32 id × count]; we read the first id (the selected char the client compares at
      // client+0x3584a0). MUST precede the walker. Other panel codes still fall through to the walker.
      if (innerCode === REQ_INFO_CHARACTER_CODE) {
        const body = innerPayload.subarray(2);
        const reqId = body.length >= 6 ? body.readUInt32LE(2) : body.length >= 4 ? body.readUInt32LE(0) : worldCharId();
        const ch = contentPack?.characterById?.(reqId) ?? null;
        // Fall back to a player-CREATED character (lobbyCharacters): the content pack only knows canon
        // characters, so a freshly created char's house-rule-seeded abilities (0x1008 handler) surface
        // on its 0x0323 record only via this fallback — otherwise the panel would read all-zero stats.
        const created = ch ? null : lobbyCharacters.find((c) => charIdOf(c) === reqId) ?? null;
        const location = currentLocationFields(ch ?? created);
        const displayName = characterDisplayName(ch ?? created ?? {}) ?? created?.lastname ?? null;
        return withTrace({
          kind: 'lobby-response',
          okInner: buildInformationCharacterRecordInner({
            characterId: reqId,
            gridUnitId: reqId,
            power: characterPowerByte(ch ?? created),
            spot: location.spot,
            spotOwner: location.spotOwner,
            seatEntries: activeSeatEntries(reqId),
            abilities: ch?.abilities ?? created?.abilities ?? null,
            ...characterHudFields(ch ?? created),
            lastname: displayName,
            displayName,
            rank: characterRankId(ch ?? created),
            title: characterTitleName(ch ?? created),
            face: Number.isInteger(ch?.portraitIndex)
              ? ch.portraitIndex
              : Number.isInteger(created?.face) ? created.face : null,
          }),
        }, characterTrace(reqId));
      }
      // ── DUTY/PERSONNEL CARD READ + remaining info-panel reads (직무카드/정보패널, workflow w2xh1y4z6) ──
      // Mirror the 0x0322 pattern: each Request* = (responseCode-1) carries a length-prefixed id list
      // ([u16 count][u32 id × count]); we read the first id when one panel keys to a single record. The
      // builders source from the content pack so the panels paint non-empty data instead of the walker's
      // ZERO-filled object. Each branch MUST precede the generic walker.
      const firstReqId = () => {
        const body = innerPayload.subarray(2);
        return body.length >= 6 ? body.readUInt32LE(2) : body.length >= 4 ? body.readUInt32LE(0) : 0;
      };
      // 0x031c -> 0x031d ResponseStaticInformationBase (system/base master). Unlike 0x0304, this
      // response has its own decoded fixed object and can be default-on: it preserves the expected
      // 0x520c payload size while replacing the walker's all-zero table with recovered system names.
      if (innerCode === REQ_STATIC_INFORMATION_BASE_CODE) {
        // 0x031d 정적 기지 마스터: 기본적으로 성계 전체를 날리되, LOGH_PLANET_BASE_RECORDS=1이면
        // 요청된 성계(또는 현재 spot 성계)의 행성/요새도 같이 담아 이름 조회가 가능하게 한다.
        const wantId = firstReqId();
        const baseList = (() => {
          if (!planetBaseRecordsEnabled()) return staticBaseRecords();
          const systems = Array.isArray(contentPack?.systems) ? contentPack.systems : [];
          const targetSpot = wantId > 0 ? wantId : currentSpotId();
          const targetSystem = staticBaseRecords().find((b) => b.id === targetSpot)
            ?? staticBaseRecords().find((b) => Math.trunc(b.id / 1000) === Math.trunc(targetSpot / 1000));
          const rawTarget = targetSystem
            ? systems.find((s) => positiveIntOr(s?.id, 0) === targetSystem.id)
            : null;
          const expanded = [];
          const seen = new Set();
          const add = (b) => { if (b && !seen.has(b.id)) { seen.add(b.id); expanded.push(b); } };
          if (targetSystem) {
            add(targetSystem);
            for (const p of planetBaseSeeds(rawTarget)) add(p);
          }
          for (const b of staticBaseRecords()) add(b);
          return expanded.slice(0, 350);
        })();
        return { kind: 'lobby-response', okInner: buildStaticInformationBaseInner({ bases: baseList }) };
      }
      if (innerCode === REQ_INFORMATION_BASE_CODE) {
        // RE-confirmed byte-exact builder (logh7-base-record.mjs): id@elem+0x00, field04@elem+0x04.
        // baseRecordForBuilder maps the legacy seed ({ id, name, b04, ... }) to the builder input
        // ({ id, field04 }) and, under LOGH_BASE_ECONOMY=1, enriches it with the five P0 supply/budget
        // arrays from content/planet-economy.json (scalars stay 0 — PROVISIONAL offsets).
        const wantId = firstReqId();
        const seed = informationBaseBuilderRecords(wantId > 0 ? wantId : null);
        // Request-id matching: 0x031e body is a length-prefixed id list ([u16 count][u32 id...]); when the
        // client asks for a specific base, surface that record first so elem[0] keys to the requested id.
        const bases = wantId > 0
          ? [...seed.filter((b) => b.id === wantId), ...seed.filter((b) => b.id !== wantId)].slice(0, 4)
          : seed;
        if (bases.length === 0) {
          bases.push({ id: wantId || worldCharId(), field04: 1 });
        }
        // 0x0337 NotifyBaseParameter extraInner: 기지관리 경제 패널의 人口/食料/治安/思想/宗教/支持率.
        // 게이트: baseEconomyEnabled() (기본 ON). 데이터 소스: planet-economy.json에서 요청 기지의 첫 행성.
        const targetId = wantId > 0 ? wantId : currentSpotId();
        const baseParamInner = baseParamForSpot(targetId, fleetCellId());
        return {
          kind: 'lobby-response',
          okInner: buildResponseInformationBaseInner({ bases }),
          extraInners: baseParamInner ? [baseParamInner] : undefined,
        };
      }
      // 직무카드 personnel roster: a batch of up to 64 full 724-byte character sheets (a faction's officer
      // pool). Seeded from the content pack's canon characters so the duty card paints real names/abilities.
      if (innerCode === REQ_CARD_CHARACTER_CODE) {
        const roster = Array.isArray(contentPack?.characters) ? contentPack.characters : [];
        const characters = roster.slice(0, 64).map((ch) => ({
          characterId: Number(ch?.id) || 0,
          gridUnitId: Number(ch?.id) || 0,
          power: characterPowerByte(ch),
          abilities: ch?.abilities ?? null,
          ...characterHudFields(ch),
          lastname: characterDisplayName(ch),
          displayName: characterDisplayName(ch),
          rank: characterRankId(ch),
          title: characterTitleName(ch),
          face: Number.isInteger(ch?.portraitIndex) ? ch.portraitIndex : null,
        }));
        // Always answer non-empty: when the pack has no characters, seed one minimal card so the duty
        // screen paints (count >= 1) instead of bouncing on the empty walker object.
        if (characters.length === 0) {
          characters.push({
            characterId: worldCharId(),
            gridUnitId: worldCharId(),
            ...characterHudFields(),
          });
        }
        return { kind: 'lobby-response', okInner: buildCardCharacterInner({ characters }) };
      }
      // 0x0304 -> 0x0305 is the world/session-list walker slot. The generic reply intentionally stays
      // zero-filled; 2026-06-17 wire tracing showed the earlier "Friedrich IV" dispatcher tail came from
      // a reused receive buffer, not from server wire bytes. Do not treat that stale tail as payload proof.
      //
      // LOGH_COMMAND_TABLE_PRELOAD_PROBE=1: explicit probe only. Keep the normal empty walker 0x0305 as
      // okInner, then push a populated static-card 0x0305 extra for card 0. The paired 0x0307 must be
      // returned on the later 0x0306 walker request; otherwise the normal empty 0x0306->0x0307 response
      // overwrites the preloaded table before FUN_004c4a10 promotes it.
      //
      // G006 marker-preload probe: the client asks 0x0314 (cell grid) before 0x0312 (object table) on the
      // world-init walk. If the scene snapshot fires in that gap, live cells hold the server grid but the
      // object table is still stale, so class-3 marker counts collapse. Keep the size-correct 0x0305 walker
      // reply, but optionally preload the 0x0313 object table before the first 0x0314.
      if (innerCode === REQ_INFO_SESSION_CODE) {
        const extraInners = [];
        if (worldPlayerEnabled() && stratGalaxyEnabled() && stratGridObjectPreloadEnabled()) {
          const { objectInner } = strategicGalaxyGridInners();
          extraInners.push(objectInner);
        }
        if (commandTablePreloadProbeEnabled()) {
          // 채운 0x305 카드를 walker okInner로 **직접** 보낸다. 이전(빈 walker okInner + 카드 extra)에선
          // 카드가 staging(+0x3e0c8c)을 차지 못해(라이브 dump: tbl+0x1e=빈 walker status byte만) 명령행 0이었다.
          // 1카드면 body[0]=count=1이라 walker의 status-OK(body[0]=1, init flag latch) 의미도 그대로 충족.
          // 플래그(LOGH_COMMAND_TABLE_PRELOAD_PROBE) 게이트 → 기본 world-load 불변.
          return { kind: 'lobby-response', okInner: buildCommandTablePreloadCardInner(), extraInners };
        }
        if (extraInners.length > 0) {
          return {
            kind: 'lobby-response',
            okInner: buildWorldDataResponseInner(REQ_INFO_SESSION_CODE + 1),
            extraInners,
          };
        }
      }
      if (innerCode === REQ_WORLD_INFO_CHARACTER_CODE && commandTablePreloadProbeEnabled()) {
        return { kind: 'lobby-response', okInner: buildCommandTablePreloadCommandInner() };
      }
      // 0x032a → 0x032b ResponseInformationOutfit (fleet roster summary). One outfit per content unit so
      // the 内政 personnel/training screen lists real fleets; falls back to a single seeded outfit.
      if (innerCode === REQ_INFORMATION_OUTFIT_CODE) {
        const units = Array.isArray(contentPack?.units) ? contentPack.units : [];
        const outfits = units.slice(0, 100).map((u, i) => ({
          id: Number(u?.id) || i + 1,
          power: clientPowerByte(u?.power ?? u?.faction ?? u?.nationId) ?? 0,
          index: i,
        }));
        if (outfits.length === 0) outfits.push({ id: worldCharId(), index: 0 });
        return { kind: 'lobby-response', okInner: buildInformationOutfitInner({ outfits }) };
      }
      // 0x032e → 0x032f ResponseInformationOutfitParty (full fleet composition). Keyed to the requested
      // outfit id; seeds the player's character as the commanding officer so the party panel is non-empty.
      if (innerCode === REQ_INFORMATION_OUTFIT_PARTY_CODE) {
        const outfitId = firstReqId() || worldCharId();
        const ch = contentPack?.characterById?.(outfitId) ?? null;
        return {
          kind: 'lobby-response',
          okInner: buildInformationOutfitPartyInner({
            outfit: outfitId,
            characters: [{ id: outfitId, kind: 0, rank: 0, name: characterDisplayName(ch) }],
          }),
        };
      }
      // 0x0324 → 0x0325 ResponseInformationUnit (world unit table). The requested unit (or the world char)
      // as a single placeable unit, matching the proven 0x0f02 spawn unit-table shape.
      if (innerCode === REQ_INFORMATION_UNIT_CODE) {
        const unitId = firstReqId() || worldCharId();
        const location = currentLocationFields(activeCharacterRecord(activeCharacterId()));
        return {
          kind: 'lobby-response',
          okInner: buildInformationUnitRecordInner({
            unitId,
            unitCount: 1,
            wireLayout: unitWireLayout(),
            fleets: unitFleetsForLocation({ unitId, characterId: activeCharacterId(), location }),
          }),
        };
      }
      // 0x0320 → 0x0321 ResponseInformationInstitution (facilities per base). Seeds one base with one
      // facility so the institution panel paints (count >= 1) instead of the empty walker object.
      if (innerCode === REQ_INFORMATION_INSTITUTION_CODE) {
        // RE-confirmed byte-exact builder (logh7-institution-record.mjs) fixes the legacy +4/−4 nested
        // offset bug: outer id@elem+0x00, institution_count@elem+0x04, institution[0]@elem+0x08, each
        // institution field00(u16)@+0x00/field04(u32)@+0x04/spot_count@+0x08/spot[0]@+0x0c, each spot
        // field00(u16)@+0x00/field04(u32)@+0x04/field08(u16)@+0x08. Map the legacy seed: kind→field00,
        // d04→field04; spot w00→field00, w04→field04, d08→field08. Keep one minimal seeded element.
        const baseId = firstReqId() || worldCharId();
        const institutionSeeds = buildInstitutionSeedElements({
          baseId,
          institutions: Array.isArray(contentPack?.institutions) ? contentPack.institutions : [],
          rooms: Array.isArray(contentPack?.rooms) ? contentPack.rooms : [],
          spotKey: baseId,
        });
        return {
          kind: 'lobby-response',
          okInner: buildResponseInformationInstitutionInner({
            institutions: institutionSeeds,
          }),
        };
      }
      // 0x0326 → 0x0327 ResponseInformationWarehouse (base STOCKPILE: supplies/food/mineral + reserve
      // ships[]/troops[]). RE-confirmed byte-exact builder (logh7-warehouse-record.mjs): the dispatcher
      // (case 0x327) copies a FIXED 0xc0 dwords = 0x300 body, so this is a small frame with no client
      // factory drop → live-safe. Keyed to the requested base id (P0 offset 0x00); economy values stay 0
      // (P3 — no fabrication) until the world-state seeds them through the builder's named fields.
      if (innerCode === REQ_INFORMATION_WAREHOUSE_CODE) {
        const baseId = firstReqId() || worldCharId();
        return {
          kind: 'lobby-response',
          okInner: buildResponseInformationWarehouseInner({ base: baseId }),
        };
      }
      // 0x0328 → 0x0329 ResponseInformationPackage (in-transit TRANSFER manifest: other_package[]/
      // troop_package[]). RE-confirmed byte-exact builder (logh7-warehouse-record.mjs): the dispatcher
      // (case 0x329) copies a FIXED 0x55 dwords = 0x154 body → small frame, live-safe. Keyed to the
      // requested source base id (P0 offset 0x00); the package arrays stay empty (P3) until seeded.
      if (innerCode === REQ_INFORMATION_PACKAGE_CODE) {
        const baseId = firstReqId() || worldCharId();
        return {
          kind: 'lobby-response',
          okInner: buildResponseInformationPackageInner({ base: baseId }),
        };
      }
      // 0x030a → 0x030b ResponseStaticInformationUnitShip (함선마스터, M2-2). RE-confirmed P0 chain:
      // request emitter FUN_004b78a0 case 0x27 sends 0x030a and blocks on 0x030b; dispatcher
      // FUN_004ba2b0 case 0x30b unpacks count u8 + ≤200 × 0x8c records into client base+0x413600;
      // parser FUN_004109a0 bails if name_len > 13. The builder buildStaticInformationUnitShipInner is
      // byte-exact (logh7-info-records-static.test.mjs). Gated by LOGH_STATIC_SHIPS=1: ON → populated
      // master; OFF (default) → fall through to the generic walker's size-correct zero-fill 0x30b
      // (count=0), preserving the proven world-init path. This branch MUST precede the generic walker.
      if (innerCode === REQ_STATIC_INFORMATION_UNIT_SHIP_CODE && process.env.LOGH_STATIC_SHIPS === '1') {
        return { kind: 'lobby-response', okInner: buildStaticInformationUnitShipInner({ ships: staticShipMasterClasses() }) };
      }
      // Conn3 world-init walk (G139/G140). At "NOW LOADING" the client drives a long
      // sequence of Information/Notify request/response pairs across families 0x03/0x04/
      // 0x05/0x07/0x09/0x0b/0x0c/0x0e/0x0f/0x10/0x12, blocking on each paired (code+1)
      // reply. Answer every known request with the minimal empty message32 object sized
      // by FUN_004b8b00, reusing the conn2 lobby-response framing (decipherKey + subheader).
      // This branch sits AFTER the handshake handlers (0x0020/0x2000.../0x0200/0x0205),
      // which return early, and the GIN7 login (0x7000, whose 0x7001 is intentionally not
      // in the table). Unknown codes fall through to 'ignore' so the stall point is visible;
      // real session/character/map data fills these objects later.
      const worldInner = buildWorldDataResponseInner(innerCode + 1);
      if (worldInner !== null) {
        return { kind: 'lobby-response', okInner: worldInner };
      }
      // Lobby RPC follow-ups (same connection, never close): the client drives these
      // and blocks until answered (workflow wl0krbnls). Response payloads use the
      // full FUN_004b8b00 receive-object size; zeros mean empty data for now.
      if (innerCode === LOBBY_REQ_INFO_CHARACTER_CHARGE_CODE) {
        return withTrace({
          kind: 'lobby-response',
          okInner: buildLobbyInformationCharacterChargeInner({ characters: lobbyCharacters }),
        }, characterListTrace());
      }
      // 新キャラクターの作成 (create new character): CommandGenerateCharacterCharge 0x1008. The OK body is
      // a 128-byte packed parser stream; the server keeps the assigned id in lobby/world state.
      if (innerCode === CMD_GENERATE_CHARGE_CODE) {
        const req = parseGenerateCharacterCharge(innerPayload);
        if (!req) {
          return withTrace({
            kind: 'lobby-response',
            okInner: buildGenerateCharacterChargeOkInner({ requestInner: innerPayload, accepted: false }),
          }, { requestCategory: null, createAccepted: false });
        }
        if (req.requestCategory !== 0) {
          updateGenerateDraftFromPhase(req.requestCategory, innerPayload);
          const status = generateCharacterDraft?.status ?? 0;
          if (status === 1) {
            const savedProfile = saveGeneratedProfile(generateCharacterDraft?.character ?? null);
            if (savedProfile?.createdAt && generateCharacterDraft?.character && !generateCharacterDraft.character.createdAt) {
              generateCharacterDraft.character.createdAt = savedProfile.createdAt;
            }
          }
          if (req.requestCategory === 4 && status === 1) {
            const characterId = generateCharacterDraft?.characterId ?? 0;
            generatedCharacterId = characterId;
            const okInner = buildGenerateDraftOk(innerPayload, req.requestCategory);
            generateCharacterDraft = null;
            return withTrace(
              { kind: 'lobby-response', okInner },
              characterTrace(characterId, { requestCategory: req.requestCategory, createAccepted: true }),
            );
          }
          return withTrace(
            { kind: 'lobby-response', okInner: buildGenerateDraftOk(innerPayload, req.requestCategory) },
            characterTrace(generateCharacterDraft?.characterId ?? 0, {
              requestCategory: req.requestCategory,
              createAccepted: status === 1,
            }),
          );
        }
        const nameTooLong =
          req.lastname.length > CHARACTER_NAME_MAX_UNITS || req.firstname.length > CHARACTER_NAME_MAX_UNITS;
        // Authoritative face gate: the creation picker only offers G-group faces, so a player-created
        // character must not carry an O-group (canon-reserved) or undecodable face. See logh7-face-codec.
        const faceCheck = validateCreateFace(req.face);
        if (nameTooLong || !faceCheck.ok || lobbyCharacters.length >= MAX_ENTRY_CHARACTERS) {
          generateCharacterDraft = { characterId: 0, status: 0 };
          return withTrace({
            kind: 'lobby-response',
            okInner: buildGenerateCharacterChargeOkInner({
              requestInner: innerPayload,
              requestCategory: req.requestCategory,
              accepted: false,
            }),
          }, { requestCategory: req.requestCategory, createAccepted: false });
        }
        const characterId = nextCharId;
        nextCharId += 1;
        const fullName = `${req.lastname}${req.firstname ? ` ${req.firstname}` : ''}`.trim();
        // The 0x2004 card name field is capped at 13 UCS-2 units (LOBBY_CHARACTER_CHARGE_NAME_UNITS);
        // keep the lastname (or a 13-char truncation) for the card, the full record retains both names.
        const cardName = (req.lastname || fullName || `Char${characterId}`).slice(0, CHARACTER_NAME_MAX_UNITS);
        // House-rule ability SEED (fixes live "기준 0"): the creation FORM's per-ability BASE is a
        // client-local widget default the server cannot feed, so a created character arrives with all
        // 8 abilities = 0. Stamp the deterministic origin-derived BASE (content/roster/ability-seed.json)
        // onto the registered character so its authoritative 0x0323 record (ability_8 @0x188) carries
        // non-zero canon-shaped stats. The player's submitted abilities win when any is non-zero.
        const abilities = resolveCreatedAbilities({ abilities: req.abilities, power: req.power, blood: req.blood });
        const faction = createFactionKey(req.power);
        const worldPower = createWorldPowerByte(req.power);
        const location = currentLocationFields({ worldPower });
        const createdCharacter = {
          id: characterId,
          status: 1,
          name: cardName,
          fullName,
          lastname: req.lastname,
          firstname: req.firstname,
          power: req.power,
          createPower: req.power,
          worldPower,
          faction,
          blood: req.blood,
          sex: req.sex,
          face: req.face,
          abilities,
          // 만체력 시드: 생성 폼은 체력 기본값을 클라가 서버로 보내지 않아 생성 캐릭이 체력 0 게이지로
          // 표시됐다(라이브 QA 버그). 권위적 레코드(0x0323 0x1a9 / 0x0356)에 만체력을 박아 0이 아니게 한다.
          stamina: STAMINA_FULL,
          bonusPoint: req.bonusPoint,
          // 플레이어는 신참 사관으로 출발한다 — 절대 작위(특히 공작=rank1)나 황제로 시작하지 않는다.
          // 작위 사다리는 1=공작(최고)..7=평민. 생성 폼이 명시적으로 하급 작위(남작 이하=rank>=5)를 고르지
          // 않는 한 무작위(untitled)로 강제한다. 따라서 기본값은 0(작위 없음)이고, 고위 작위(rank 1..4)는
          // 절대 부여되지 않는다(서버 권위적 클램프). 이것이 채워진 NPC 위계와 함께 클라 HUD가 플레이어를
          // "황제"로 폴백하지 못하게 한다.
          title: clampPlayerTitle(req.title),
          rank: req.rank > 0 ? req.rank : initialCharacterRankId(req.power),
          createRankSubId: initialCreateRankSubId(),
          spot: location.spot,
          spotOwner: location.spotOwner,
          birthMonth: 0,
          birthDay: 0,
          flagshipName: '',
          flagshipType: 0,
          flagshipKind: 0,
          check: 1,
        };
        lobbyCharacters.push(createdCharacter);
        const savedProfile = saveGeneratedProfile(createdCharacter);
        if (savedProfile?.createdAt) {
          createdCharacter.createdAt = savedProfile.createdAt;
        }
        generatedCharacterId = characterId;
        generateCharacterDraft = { characterId, status: 1, character: createdCharacter };
        return withTrace(
          { kind: 'lobby-response', okInner: buildGenerateDraftOk(innerPayload, req.requestCategory) },
          characterTrace(characterId, { requestCategory: req.requestCategory, createAccepted: true }),
        );
      }
      // Sibling register command — accept as a no-op OK echo (authoritative list already updated by the
      // create handler). NOTE: 0x1006 (original charge) is handled ABOVE the generic walker because the
      // walker (innerCode+1 → 0x1007, which IS in WORLD_RESPONSE_OBJECT_SIZES) would otherwise swallow it.
      if (innerCode === CMD_EXTENSION_CHARGE_CODE) {
        return { kind: 'lobby-response', okInner: buildLobbyResponseInner(innerCode, 0x08) };
      }
      if (innerCode === LOBBY_CMD_EXTENSION_CHARGE_CODE) {
        return { kind: 'lobby-response', okInner: buildLobbyResponseInner(LOBBY_CMD_EXTENSION_CHARGE_CODE, 0x08) };
      }
      // 캐릭터 삭제 (LobbyCommandDeleteCharacter 0x2008). 클라 빌더 FUN_0043f070이 단일 필드
      // session_id(=캐릭 id, *param_1)를 [u32]로 보낸다(RE 확인). 이 핸들러는 ①작업 중인 로비 로스터에서
      // 빼고 ②계정 프로필(영속)에서도 제거한다 — 둘 다 안 하면 재로그인 시 삭제한 캐릭이 프로필에서 도로
      // 로드돼(loadAccountProfileCharacters) 되살아난다(사용자 보고: "Reinhard 삭제→새로"가 안 됨).
      if (innerCode === LOBBY_CMD_DELETE_CHARACTER_CODE) {
        const body = innerPayload.subarray(2);
        let removedId = 0;
        if (body.length >= 4) {
          const targetId = body.readUInt32LE(0);
          const idx = lobbyCharacters.findIndex((c) => charIdOf(c) === targetId);
          if (idx >= 0) {
            lobbyCharacters.splice(idx, 1);
            removedId = targetId;
          }
          // 계정 프로필 영속 로스터에서도 제거(로비 로스터에 없던 경우라도 프로필엔 남아 있을 수 있다).
          if (account && typeof accountStore?.removeProfileCharacter === 'function') {
            if (accountStore.removeProfileCharacter(account, targetId)) removedId = targetId;
          }
        }
        if (removedId > 0) {
          // 삭제한 캐릭이 활성/추첨 선택이었으면 선택을 비워, 재생성·재진입이 옛 id로 묶이지 않게 한다.
          if (generatedCharacterId === removedId) generatedCharacterId = 0;
          if (chargedCharacterId === removedId) chargedCharacterId = 0;
          // 다음 생성 id는 항상 단조 증가하도록 둔다(이미 발급된 id 재사용 방지 → 재생성=distinct).
          // refreshNextCharId는 현 로스터 max+1만 주므로, 삭제로 줄어든 max보다 작아지지 않게 보호한다.
          const compacted = lobbyCharacters.reduce((max, c) => Math.max(max, charIdOf(c)), 0) + 1;
          nextCharId = Math.max(nextCharId, compacted);
        }
        return withTrace(
          { kind: 'lobby-response', okInner: buildLobbyResponseInner(LOBBY_CMD_DELETE_CHARACTER_CODE, 0x08) },
          characterTrace(removedId, { deletedCharacterId: removedId || null }),
        );
      }
      if (innerCode === LOBBY_REQ_INFO_SESSION_CODE) {
        // 세션 변경 (session list, workflow wndew4jop): return the configured session catalog so the picker
        // shows real choices (each status 1|2 to be selectable per FUN_00593d90). Defaults to a single
        // session to preserve today's behavior; pass >= 2 via the `sessions` option to enable changing.
        const sessionRecords = Array.isArray(sessions) && sessions.length > 0
          ? sessions.map((s, i) => ({
            sessionId: s?.sessionId ?? s?.id ?? i + 1,
            sessionName: s?.sessionName ?? s?.name ?? `Session ${i + 1}`,
            status: s?.status ?? 1,
            beginDay: s?.beginDay ?? s?.begin_day,
            term: s?.term ?? 0,
            ending: s?.ending ?? 0,
            powers: s?.powers,
          }))
          : [{ sessionId: 1, sessionName: 'LOGH VII', status: 1, beginDay: 'UC 796' }];
        const requestVariant = innerPayload.length >= 3 ? innerPayload.readUInt8(2) : null;
        // 0x2006 builder (RE-VERIFIED 2026-06-16): the live client sends 0x2005 with a sub-arg byte (0x02
        // then 0x01). The real parser FUN_00444900 reads the body as a PACKED, sequential SEEK_CUR stream
        // (every read = FUN_00610420(dst,n,0,mode=2); the 0x14c "stride" is only the in-memory destination
        // struct, NOT the wire). buildInformationSessionInner now emits that packed layout (it previously
        // laid the body at the 0x14c strides, which made the parser bail at session_name_size>13 on the
        // first record → the session-select row showed 0 rows; see logh7-scenario-session.test.mjs oracle).
        // Default 'auto' uses that packed builder for EVERY variant. The OLD partial packed builder
        // (buildLobbyInformationSessionInner) is reachable only via LOGH_LOBBY_SESSION_LAYOUT=compact|legacy
        // for instrumentation; it carries a NUL-inflated length (latent bug for max-length names).
        const sessionLayout = process.env.LOGH_LOBBY_SESSION_LAYOUT ?? 'auto';
        const useCompactLobbySession =
          sessionLayout === 'compact' ||
          sessionLayout === 'legacy';
        if (useCompactLobbySession) {
          // Opt-in A/B only: one current-session record in the OLD partial packed shape (description maps
          // to begin_day; NUL-inflated length). Retained so the pre-RE layout stays reachable.
          const compactRecords = requestVariant === 0x02 ? sessionRecords.slice(0, 1) : sessionRecords;
          return {
            kind: 'lobby-response',
            okInner: buildLobbyInformationSessionInner({
              sessions: compactRecords.map((s) => ({
                sessionId: s.sessionId,
                status: s.status,
                name: s.sessionName,
                description: s.beginDay ?? 'UC 796',
              })),
            }),
          };
        }
        // 0x2006 wire is the PACKED layout the parser consumes + fixed 0x5304 size. REFUTED experiment:
        // shrinking it to the used length (NOPAD) did NOT make the client consume it (a 677B 0x2006 also
        // left the picker FSM halted at the idx-2 preload, no variant-01 follow-up) → the block is NOT a
        // recv-frame-size cap but the recv-pump count-drain/match of the 0x2006 (see lobbyfsm client patch).
        return {
          kind: 'lobby-response',
          okInner: buildInformationSessionInner({ sessions: sessionRecords }),
        };
      }
      if (innerCode === LOBBY_SESSION_LOGIN_REQUEST_CODE) {
        // 0x2009 LobbySessionLoginRequest -> 0x200a carrying the WORLD endpoint (workflow wicdkooh5):
        // consumer 0x4bdc2e populates [base+0x35f144 IP/+0x35f148 port/+0x35f14c token] and sets the
        // world-ready flag 0x35837c; the lobby FSM then opens conn3 to that endpoint. The world target
        // defaults to the lobby (same host:port) so the local e2e reconnects right back to this server.
        // 세션 변경: when a `worldBySession` map is supplied, the selected session id (request body
        // [u32 LE @+2]) routes to that session's distinct world endpoint; otherwise the single `world`.
        const sessionId = innerPayload.length >= 6 ? innerPayload.readUInt32LE(2) : 0;
        const target = (worldBySession && worldBySession[sessionId]) || world || lobby || {};
        return {
          kind: 'lobby-response',
          okInner: buildLobbySessionLoginOkMessage32Inner({
            ip: target.ip ?? lobby?.ip ?? '127.0.0.1',
            port: target.port ?? lobby?.port ?? 47900,
            token: target.token ?? 0,
          }),
        };
      }
      if (phase === LOGIN_PHASES.REDIRECTED) {
        return { kind: 'ignore', reason: 'no input expected after login redirect' };
      }
      if (!isLoginCredentialInner(innerPayload)) {
        return { kind: 'ignore', reason: 'login connection only accepts the GIN7 credential (inner 0x7000)' };
      }
      const auth = accountStore.authenticate(innerPayload);
      if (!auth.ok) {
        phase = LOGIN_PHASES.REJECTED;
        return { kind: 'reject', reason: auth.reason };
      }
      account = auth.account;
      loadAccountProfileCharacters();
      phase = LOGIN_PHASES.REDIRECTED;
      return {
        kind: 'redirect',
        account: auth.account,
        matchedBy: auth.matchedBy,
        redirectInner: buildRedirectInner(lobby ?? {}),
      };
    },
    // C2/C3 (멀티플레이): 월드진입한 플레이어의 권위적 함대 식별 정보. auth-server가 신규 입장자 함대를
    // broadcast하고 req.power를 worldState player powerId로 일원화하는 데 쓴다(round-robin 대체). 진영
    // power 바이트(1=제국·2=동맹)는 활성 캐릭터(생성 시 req.power 유래)에서 해석한다.
    worldPlayerInfo() {
      const charId = activeCharacterId();
      const ch = activeCharacterRecord(charId);
      const location = currentLocationFields(ch);
      // 계정 로스터가 있으면 진영 power/unit을 그것으로 일원화(autologin 기본 char/unit/제국 겹침 해소).
      const acctPower = accountPowerByte();
      return {
        charId,
        unitId: sessionWorldUnitId(),
        power: acctPower ?? characterPowerByte(ch) ?? 0,
        cell: fleetCellId(),
        owner: acctPower ?? location.spotOwner,
        mapSection: location.spot,
      };
    },
    close() {
      phase = LOGIN_PHASES.CLOSED;
    },
  };
}
