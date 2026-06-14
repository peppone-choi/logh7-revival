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
  CHARACTER_NAME_MAX_UNITS,
  MAX_ENTRY_CHARACTERS,
  SS_GAME_LOGIN_REQUEST_CODE,
  SS_LOGIN_REQUEST_CODE,
  SS_REQ_TIME_CODE,
  buildLobbyInformationCharacterChargeInner,
  buildGenerateCharacterChargeOkInner,
  parseGenerateCharacterCharge,
  buildLobbyResponseInner,
  buildLobbyLoginOkInner,
  buildLobbyInformationSessionInner,
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
  buildNotifyEnterGridBeginInner,
  buildNotifyEnterGridEndInner,
  buildResponseTimeInner,
  buildWorldDataResponseInner,
  isLoginCredentialInner,
  parseGin7Credential,
  readInnerCode,
} from './logh7-login-protocol.mjs';
import { validateCreateFace } from './logh7-face-codec.mjs';
import { isValidAccountLabel } from './logh7-account-registry.mjs';

// conn3 world-build crash fix (G145): the client never requests 0x0203/0x0322 before it
// crashes, so we PUSH the player character unsolicited. 0x0204 (selected char id) goes out
// with the 0x0206 SSGameLoginOK; the 724-byte 0x0323 record (matching char id) goes out with
// the 0x0f03 GridInitialize_OK so it lands in the world-build window (after the state-0xf
// reset of client+0x36a5dc, before placement state 0x10). LOGH_WORLD_CHAR_ID overrides the id.
const SS_REQ_GRID_INITIALIZE_CODE = 0x0f02; // C->S RequestGridInitialize, answer 0x0f03
const worldCharId = () => Number(process.env.LOGH_WORLD_CHAR_ID ?? '1');

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

// G173 grid-enter experiment: after the world loads (G164), push NotifyEnterGridBegin (0xb09) +
// NotifyEnterGridEnd (0xb0a) to drive the in-grid placement FUN_004c2a80(1)/FUN_004c32a0(1), which
// rebuild the grid (client+0x126718) from the already-resident session/unit data. Live probe (G167)
// showed mode (client+0x126711) == 2, the value the 0xb0a handler requires to run placement. We
// inject on RequestInformationMessengerStat (0x0f06), the last world-init request before the idle
// 0x0300 loop, so the world is fully built. Opt-in via LOGH_GRID_ENTER=1.
const SS_REQ_MESSENGER_STAT_CODE = 0x0f06; // C->S, answer 0x0f07
const gridEnterEnabled = () => process.env.LOGH_GRID_ENTER === '1';

// G180 strategic sector map: 0x0314 RequestStaticInformationGrid -> 0x0315 ResponseStaticInformationGrid.
// The 0x0315 grid (RLE [u8 w][u8 h][u16 rleCount][run,value pairs]) is RLE-decoded (FUN_004abbb0) and
// copied (FUN_004c5350) into the strategic sector grid client+0x2c03cc (100x50 byte cells, read by
// FUN_004c8bc0). We normally send it empty/1x1, leaving the sector map blank. Answer with a real
// 100x50 grid so the strategic map structure populates. Opt-in via LOGH_STRAT_GRID=1.
const SS_REQ_STATIC_GRID_CODE = 0x0314; // C->S, answer 0x0315
const stratGridEnabled = () => process.env.LOGH_STRAT_GRID === '1';
// G200 controllable fleet: place the local player's fleet as a clickable sector OBJECT. The object
// table (0x0313) carries one class-3 marker at object value `FLEET_OBJECT_VALUE`; the cell grid
// (0x0315) carries that value at the fleet's cell (col,row). Together they satisfy the click→0x0b01
// enablement gate G4 (a selectable fleet object in the sector tables). Opt-in via LOGH_STRAT_FLEET=1
// (independent of LOGH_STRAT_GRID, which sends the bare empty grid). See docs/logh7-strategic-map-wire.md.
const stratFleetEnabled = () => process.env.LOGH_STRAT_FLEET === '1';
const FLEET_OBJECT_VALUE = Number(process.env.LOGH_FLEET_OBJECT_VALUE ?? '3'); // placeable range 3..88
const fleetCell = () => ({
  col: Number(process.env.LOGH_FLEET_COL ?? '50'),
  row: Number(process.env.LOGH_FLEET_ROW ?? '25'),
});
// G196: push the 0x33b tactical unit table so clientBase+0x4271a8 is resident before grid-enter.
// On its own this does NOT populate the tactical pool 0x126718 (FUN_004c32a0 also gates on mode
// byte 0x126711==0, which no message sets); the live B2 experiment pairs this with a 0x126711=0
// memory poke. Gated so the proven G164 world-load flow is unaffected by default.
const tacticsUnitEnabled = () => process.env.LOGH_TACTICS_UNIT === '1';

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
 *   acceptAnyGin7: when true (default for the skeleton), any well-formed GIN7
 *   credential authenticates using its parsed account label. This lets the real
 *   client through login while the persistent account DB is not yet wired; flip
 *   it off to enforce exact credential matching against the seeded accounts.
 */
export function createAccountStore({ accounts = [], acceptAnyGin7 = true, registry = null, allowRegister = false } = {}) {
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
    /**
     * @param {Buffer} innerPayload GIN7 credential inner (code 0x7000)
     * @returns {{ ok: true, account: string, matchedBy: 'credential'|'gin7-any' } | { ok: false, reason: string }}
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
      // First sight of an account registers it (binding the credential blob); thereafter the same
      // credential must verify, so a wrong password is rejected (0x7001 redirect is withheld).
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
 * }} options
 */
export function createLoginSession({ accountStore, lobby, world, characters, contentPack = null }) {
  let phase = LOGIN_PHASES.CONNECTED;
  let account = null;
  // Working copy so 新キャラクターの作成 (CommandGenerateCharacterCharge 0x1008) can append the new
  // character; the client then re-requests 0x2003→0x2004 and the new card renders. Each character
  // carries an id; new ids continue past the highest seeded id.
  const lobbyCharacters = [...(characters ?? lobby?.characters ?? [])];
  const charIdOf = (c) => Number(c?.id ?? c?.characterId ?? 0);
  let nextCharId = lobbyCharacters.reduce((max, c) => Math.max(max, charIdOf(c)), 0) + 1;
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
          return { kind: 'lobby-login-ok', okInner: buildLobbyLoginOkInner({ status: 0 }) };
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
        return { kind: 'lobby-login-ok', okInner: buildLobbyLoginOkInner({ status: 0 }) };
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
        if (process.env.LOGH_WORLD_PUSH === '1') {
          action.extraInners = [buildSsCharacterIdResponseInner({ characterId: worldCharId() })];
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
          const charId = worldCharId();
          const unitId = charId;
          // G184: large frames are NOT dropped by size — the 52KB 0x0325 sent HERE (0x0f02) processes
          // fine (unitCount @0x41a364 became non-zero in G167/G180). The 5KB 0x0315 only failed when
          // sent at 0x0314 during the early-walk 58KB+21KB burst. So the strategic grid (0x0315) is
          // injected HERE too (LOGH_STRAT_GRID=1), at the proven post-walk timing, before 0x0f03.
          // G187 ordering discriminator: send the 5KB 0x0315 FIRST (it failed at 3rd position in
          // G184 while 52KB 0x0325 at 1st position succeeded) to test position vs content.
          const extraInners = [];
          if (stratFleetEnabled()) {
            // Place the player's fleet as a clickable sector object: object table (0x0313) holds a
            // class-3 marker at FLEET_OBJECT_VALUE; the cell grid (0x0315) carries that value at the
            // fleet's cell. byte0 = charId so the marker links to the player's character record.
            const { col, row } = fleetCell();
            extraInners.push(
              buildStaticInformationGridTypeInner({
                objects: [{ value: FLEET_OBJECT_VALUE, contentId: charId & 0xff, klass: 3, variant: 0 }],
              }),
            );
            extraInners.push(
              buildStaticInformationGridInner({
                width: 100,
                height: 50,
                cells: [{ col, row, value: FLEET_OBJECT_VALUE }],
              }),
            );
          } else if (stratGridEnabled()) {
            extraInners.push(buildStaticInformationGridInner({ width: 100, height: 50, gridType: 0 }));
          }
          extraInners.push(buildInformationUnitRecordInner({ unitId, unitCount: 1 }));
          // enrich the 0x0323 record with the character's recovered 8-ability block when the content
          // pack knows this character (LOGH_CONTENT_DB path). Default CANON content carries no
          // ability_8 array, so this stays the proven minimal record (id@0 + flagship@0x24).
          const worldChar = contentPack?.characterById?.(charId) ?? null;
          extraInners.push(buildInformationCharacterRecordInner({
            characterId: charId,
            gridUnitId: unitId,
            abilities: worldChar?.abilities ?? null,
            // ASCII-safe romaji name when known (sidesteps the unresolved u16 name encoding); only the
            // famous cast carries romaji, others fall through to the nameless minimal record.
            lastname: worldChar?.nameRomaji ?? null,
            // portrait (Face/*.tcf id) assigned by the content pack → 0x0323 face field @0xf4.
            face: Number.isInteger(worldChar?.portraitIndex) ? worldChar.portraitIndex : null,
          }));
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
          return {
            kind: 'lobby-response',
            okInner: buildSsCharacterIdResponseInner({ characterId: charId }),
            extraInners,
          };
        }
        // Answer 0x0f03 GridInitialize_OK (status 1). LOGH_WORLD_PUSH=1 also pushes the 724-byte
        // 0x0323 character record (matching char id) for the world-placement experiment (G145/G146).
        const action = { kind: 'lobby-response', okInner: buildWorldDataResponseInner(0x0f03) };
        if (process.env.LOGH_WORLD_PUSH === '1') {
          action.extraInners = [buildInformationCharacterRecordInner({ characterId: worldCharId() })];
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
      if (innerCode === SS_REQ_MESSENGER_STAT_CODE && gridEnterEnabled()) {
        // G173 grid-enter: answer 0x0f07 then push 0xb09 + 0xb0a so the client places the player's
        // fleet into the grid (FUN_004c32a0 reads the resident session/unit data). okInner is the
        // normal 0x0f07 ack; the grid-enter notifies follow, 0xb0a last (it triggers placement).
        return {
          kind: 'lobby-response',
          okInner: buildWorldDataResponseInner(0x0f07),
          extraInners: [
            buildNotifyEnterGridBeginInner({ value: 1 }),
            buildNotifyEnterGridEndInner({ value: 1 }),
          ],
        };
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
        return {
          kind: 'lobby-response',
          okInner: buildLobbyInformationCharacterChargeInner({ characters: lobbyCharacters }),
        };
      }
      // 新キャラクターの作成 (create new character): CommandGenerateCharacterCharge 0x1008. Parse the
      // packed request, authoritatively validate (names ≤13, account char cap), assign a new id,
      // append it so the next 0x2003→0x2004 card list shows it, and echo 0x1008 OK. The lobby-side
      // 0x2007 / account-side 0x1006/0x1007 are sibling register commands; we accept them as no-op OKs
      // (the authoritative char list is what the card screen reads). See docs/logh7-character-creation-wire.md.
      if (innerCode === CMD_GENERATE_CHARGE_CODE) {
        const req = parseGenerateCharacterCharge(innerPayload);
        if (!req) {
          return { kind: 'lobby-response', okInner: buildGenerateCharacterChargeOkInner({ characterId: 0, status: 0 }) };
        }
        const nameTooLong =
          req.lastname.length > CHARACTER_NAME_MAX_UNITS || req.firstname.length > CHARACTER_NAME_MAX_UNITS;
        // Authoritative face gate: the creation picker only offers G-group faces, so a player-created
        // character must not carry an O-group (canon-reserved) or undecodable face. See logh7-face-codec.
        const faceCheck = validateCreateFace(req.face);
        if (nameTooLong || !faceCheck.ok || lobbyCharacters.length >= MAX_ENTRY_CHARACTERS) {
          // Reject by echoing a status-0 OK (the client's create-result post-proc treats 0 as failure).
          return { kind: 'lobby-response', okInner: buildGenerateCharacterChargeOkInner({ characterId: 0, status: 0 }) };
        }
        const characterId = nextCharId;
        nextCharId += 1;
        const fullName = `${req.lastname}${req.firstname ? ` ${req.firstname}` : ''}`.trim();
        // The 0x2004 card name field is capped at 13 UCS-2 units (LOBBY_CHARACTER_CHARGE_NAME_UNITS);
        // keep the lastname (or a 13-char truncation) for the card, the full record retains both names.
        const cardName = (req.lastname || fullName || `Char${characterId}`).slice(0, CHARACTER_NAME_MAX_UNITS);
        lobbyCharacters.push({
          id: characterId,
          status: 1,
          name: cardName,
          fullName,
          lastname: req.lastname,
          firstname: req.firstname,
          power: req.power,
          blood: req.blood,
          sex: req.sex,
          face: req.face,
          abilities: req.abilities,
          bonusPoint: req.bonusPoint,
          title: req.title,
          rank: req.rank,
        });
        return { kind: 'lobby-response', okInner: buildGenerateCharacterChargeOkInner({ characterId, status: 1 }) };
      }
      // Sibling register/charge commands — accept as no-op OK echoes (authoritative list already updated
      // by the create handler). 0x2008 LobbyCommandDeleteCharacter carries [u32 session_id] to remove.
      if (innerCode === CMD_EXTENSION_CHARGE_CODE || innerCode === CMD_ORIGINAL_CHARGE_CODE) {
        return { kind: 'lobby-response', okInner: buildLobbyResponseInner(innerCode, 0x08) };
      }
      if (innerCode === LOBBY_CMD_EXTENSION_CHARGE_CODE) {
        return { kind: 'lobby-response', okInner: buildLobbyResponseInner(LOBBY_CMD_EXTENSION_CHARGE_CODE, 0x08) };
      }
      if (innerCode === LOBBY_CMD_DELETE_CHARACTER_CODE) {
        const body = innerPayload.subarray(2);
        if (body.length >= 4) {
          const targetId = body.readUInt32LE(0);
          const idx = lobbyCharacters.findIndex((c) => charIdOf(c) === targetId);
          if (idx >= 0) {
            lobbyCharacters.splice(idx, 1);
          }
        }
        return { kind: 'lobby-response', okInner: buildLobbyResponseInner(LOBBY_CMD_DELETE_CHARACTER_CODE, 0x08) };
      }
      if (innerCode === LOBBY_REQ_INFO_SESSION_CODE) {
        return {
          kind: 'lobby-response',
          okInner: buildLobbyInformationSessionInner({ recordCount: 1 }),
        };
      }
      if (innerCode === LOBBY_SESSION_LOGIN_REQUEST_CODE) {
        // 0x2009 LobbySessionLoginRequest -> 0x200a carrying the WORLD endpoint (workflow wicdkooh5):
        // consumer 0x4bdc2e populates [base+0x35f144 IP/+0x35f148 port/+0x35f14c token] and sets the
        // world-ready flag 0x35837c; the lobby FSM then opens conn3 to that endpoint. The world target
        // defaults to the lobby (same host:port) so the local e2e reconnects right back to this server.
        return {
          kind: 'lobby-response',
          okInner: buildLobbySessionLoginOkMessage32Inner({
            ip: world?.ip ?? lobby?.ip ?? '127.0.0.1',
            port: world?.port ?? lobby?.port ?? 47900,
            token: world?.token ?? 0,
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
      phase = LOGIN_PHASES.REDIRECTED;
      return {
        kind: 'redirect',
        account: auth.account,
        matchedBy: auth.matchedBy,
        redirectInner: buildRedirectInner(lobby ?? {}),
      };
    },
    close() {
      phase = LOGIN_PHASES.CLOSED;
    },
  };
}
