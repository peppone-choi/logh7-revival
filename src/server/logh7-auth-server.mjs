// LOGH VII authoritative login server (the *solved* login -> lobby-redirect flow).
//
// Pipeline per connection (all reverse-engineered & validated against the real client):
//   1. client -> 0x0034 (phase1)  : server replies 0x0035 (phase3) and learns the
//      per-connection encipherKey (used to decode the client's 0x0030 bodies).
//   2. client -> 0x0036 (confirm) : no reply needed.
//   3. client -> 0x0030 / inner 0x7000 (GIN7 credential) : server authenticates against
//      the in-memory account store, then drives the client to the lobby exactly as the
//      proven g134 sequence does:
//        frame A "keysetup": the login body with its inner code forced to 0x31, encoded
//          with decipherKey. The client's router routes inner 0x31 into keysetup, which
//          installs the GIN7 blob as the next child-codec key.
//        frame B "redirect": inner 0x7001 (lobby IP/port/token), encoded with that same
//          GIN7 blob key (== the client's own credential payload, loginInner[2:]).
//      The client then closes this connection and reconnects to the lobby server.
//
// Transport framing / crypto reuse logh7-codec + logh7-envelope-0030; auth/state logic
// reuse logh7-login-session. This module is just the IO wiring.

import { createServer as createTcpServer } from 'node:net';
import { createWriteStream } from 'node:fs';
import path from 'node:path';

import {
  buildPhase3ResponseFromPhase1Request,
  childCodecDecode,
  childCodecEncode,
  childCodecKeySchedule,
  extractChildCodecStaticTables,
} from './logh7-codec.mjs';
import { build0030Body, parse0030Body } from './logh7-envelope-0030.mjs';
import {
  LOBBY_LOGIN_OK_CODE,
  buildLobbyLoginOkInner,
  buildMpsClientMessage32Inner,
  wrapRawInnerAsMessage32,
  buildCommandGridChatInner,
  buildServerListInner,
  selectSsResponseInner,
} from './logh7-login-protocol.mjs';
import { createAccountStore, createLoginSession } from './logh7-login-session.mjs';
import { runNpcTick, behaviorProfile } from './logh7-npc-ai.mjs';
import { createWorldRelay, isRelayCommandCode } from './logh7-world-relay.mjs';
import { createWorldState } from './logh7-world-state.mjs';
import { processCommand } from './logh7-command-engine.mjs';
import { createContentPack } from './logh7-content-pack.mjs';
import { CANON_CONTENT } from './logh7-canon-content.mjs';
import { openContentSource } from './logh7-content-source.mjs';
import { buildContentPackDataFromSource } from './logh7-content-adapter.mjs';

const PHASE1_CODE = 0x0034;
const TRANSPORT_0030 = 0x0030;
const KEYSETUP_INNER_CODE = 0x0031;
const DEFAULT_LOBBY_CHARACTERS = Object.freeze([{ id: 1 }]);

/** Build a transport-0x0030 frame whose body is child-codec encoded under `key`. */
export function buildEncrypted0030Frame({ tables, key, body, subheaderLen = 0 }) {
  // The lobby connection (conn2) parse context carries a header-size field [transport+0x12]=4
  // (login conn = 0): its router reads the transport code at readptr + that offset and computes the
  // decode length as frameLen - offset - 2. So a lobby 0x0030 frame must be
  // [u16 len][subheaderLen bytes][u16 0x0030][encoded body], with len counting subheader+code+body.
  // (RE: frida router-code probe — conn2 reads code 4 bytes too far without the subheader.)
  const encoded = childCodecEncode(childCodecKeySchedule(tables, key), body);
  const frame = Buffer.alloc(4 + subheaderLen + encoded.length);
  frame.writeUInt16BE(subheaderLen + 2 + encoded.length, 0);
  frame.writeUInt16BE(TRANSPORT_0030, 2 + subheaderLen); // subheader bytes stay zero
  encoded.copy(frame, 4 + subheaderLen);
  return frame;
}

export function selectLobbyLoginOkKey({ mode, parsedInnerPayload, decipherKey, phase1Key }) {
  const keyMode = mode === 'gin7' ? 'gin7' : mode === 'phase1' ? 'phase1' : 'decipher';
  const key =
    keyMode === 'gin7'
      ? Buffer.from(parsedInnerPayload.subarray(2))
      : keyMode === 'phase1'
        ? phase1Key
        : decipherKey;
  return { keyMode, key };
}

export function buildLobbyLoginOkPayload({ status = 0, format } = {}) {
  const okFormat = format === 'message32' ? 'message32' : 'raw';
  const rawInner = buildLobbyLoginOkInner({ status });
  const message32Payload = Buffer.from([status & 0xff, 0, 0]);
  const okInner =
    okFormat === 'message32'
      ? buildMpsClientMessage32Inner({ code: LOBBY_LOGIN_OK_CODE, payload: message32Payload })
      : rawInner;
  return { okFormat, okInner };
}

/** Split a TCP byte stream into [u16 len][u16 code][body] frames (len counts code+body). */
export function takeTransportFrames(buffer) {
  const frames = [];
  let offset = 0;
  while (buffer.length - offset >= 4) {
    const declaredLength = buffer.readUInt16BE(offset);
    const totalLength = declaredLength + 2;
    if (totalLength < 4 || buffer.length - offset < totalLength) {
      break;
    }
    frames.push(buffer.subarray(offset, offset + totalLength));
    offset += totalLength;
  }
  return { frames, remaining: buffer.subarray(offset) };
}

/**
 * Compute the server's reply frames for the authenticated login redirect, mirroring
 * the proven g134 keysetup+redirect pair. Pure (no IO) for unit-testing.
 * @returns {{ keysetupFrame: Buffer, redirectFrame: Buffer, gin7KeyHex: string }}
 */
export function buildRedirectReply({ tables, decipherKey, decodedBody, redirectInner }) {
  const parsed = parse0030Body(decodedBody);
  if (!parsed.valid) {
    throw new Error(`cannot build redirect reply from invalid 0x0030 body: ${parsed.reason}`);
  }
  const keysetupInner = Buffer.from(parsed.innerPayload);
  keysetupInner.writeUInt16BE(KEYSETUP_INNER_CODE, 0);
  const keysetupFrame = buildEncrypted0030Frame({
    tables,
    key: decipherKey,
    body: build0030Body({ id: parsed.id, innerPayload: keysetupInner }),
  });
  // The keysetup installs the GIN7 blob (login inner minus its 2-byte code) as the
  // next cipher key; the redirect must be encoded with that same key.
  const gin7Key = Buffer.from(parsed.innerPayload.subarray(2));
  const redirectFrame = buildEncrypted0030Frame({
    tables,
    key: gin7Key,
    body: build0030Body({ id: parsed.id, innerPayload: redirectInner }),
  });
  return { keysetupFrame, redirectFrame, gin7KeyHex: gin7Key.toString('hex') };
}

function writeTrace(stream, event) {
  if (stream !== null) {
    stream.write(`${JSON.stringify({ at: new Date().toISOString(), ...event })}\n`);
  }
}

function appCodeForTrace(innerPayload) {
  if (innerPayload.length >= 6 && innerPayload.readUInt16BE(0) === 0) {
    return innerPayload.readUInt16BE(4);
  }
  return innerPayload.readUInt16BE(0);
}

/**
 * Start the authoritative login server.
 * @param {{
 *   host: string, port: number, clientExe: string,
 *   transportKey: Buffer, decipherKey: Buffer,
 *   lobby: { ip?: string, port?: number, token?: number|null },
 *   world?: { ip?: string, port?: number, token?: number|null },
 *   characters?: Array<{ id?: number, characterId?: number }>,
 *   accountStore?: ReturnType<typeof createAccountStore>,
 *   tracePath?: string,
 * }} options
 */
export async function startLogh7AuthServer({
  host,
  port,
  clientExe,
  transportKey,
  decipherKey,
  lobby,
  world,
  characters,
  accountStore = createAccountStore(),
  tracePath,
}) {
  const tables = extractChildCodecStaticTables(clientExe);
  const traceStream = tracePath === undefined ? null : createWriteStream(path.resolve(tracePath), { flags: 'a' });
  let nextConnectionId = 1;
  const lobbyCharacters = characters ?? lobby?.characters ?? DEFAULT_LOBBY_CHARACTERS;
  // G168/G169 in-world multiplayer relay: shared across connections. A connection registers when
  // it reaches the world (conn3 SS); an in-world command (CommandGridChat/MoveShip/...) is
  // rebroadcast to every other in-world connection, re-framed with that connection's own key + id.
  // Opt-in via LOGH_RELAY=1 so the proven single-client world-load flow (G164) is never perturbed.
  const relayEnabled = process.env.LOGH_RELAY === '1';
  const worldRelay = createWorldRelay();
  // G-impl: authoritative in-world engine (opt-in, requires LOGH_RELAY). When on, an inbound in-world
  // command is validated + applied to shared world state and the server broadcasts the canonical
  // Notify* it decides (vs the blind relay re-broadcasting the raw frame). Shared across connections.
  const authoritativeEnabled = relayEnabled && process.env.LOGH_AUTHORITATIVE === '1';
  const worldState = createWorldState();
  // Authored server data (the world data the lost original server used to hold). Drives which units
  // spawn into the tactical pool (0x33b). Defaults to the in-code baseline skirmish; opt into the
  // recovered content DB (galaxy/roster/ships from logh7-content-db) with LOGH_CONTENT_DB=1.
  let contentPack;
  if (process.env.LOGH_CONTENT_DB === '1') {
    const source = openContentSource({});
    contentPack = createContentPack(buildContentPackDataFromSource(source));
    source.close();
  } else {
    contentPack = createContentPack(CANON_CONTENT);
  }
  // Seed authoritative ship state from the content pack so ownership checks have ground truth. Each
  // ship starts neutral (owner 0); a player claims their nation's ships when they enter the world.
  if (authoritativeEnabled) {
    for (const u of contentPack.units) {
      // faction/shipClass (when the content provides them) make the ship combat-capable: fire commands
      // target the OPPOSING faction and damage scales by class (logh7-combat-engine). Absent fields
      // fall back to neutral faction 0 / cruiser stats, so existing content keeps working.
      worldState.upsertShip({
        id: u.id, owner: 0, x: u.x, y: u.y, z: u.z, heading: u.heading,
        faction: u.faction ?? u.nation ?? u.powerId ?? 0,
        shipClass: u.shipClass ?? u.class ?? 'cruiser',
      });
    }
    // seed the strategic map (recovered galaxy: systems start owned by their canon faction)
    worldState.seedSystems(contentPack.systems ?? []);
  }

  // NPC AI (G-impl): drive the canon characters the player does NOT control. Opt-in via LOGH_NPC_AI=1
  // (requires LOGH_AUTHORITATIVE world state). Each tick every NPC-held ship (owner 0, faction != 0)
  // acts per its commander profile and the server broadcasts the resulting Notify* to all in-world
  // players — so a lone player gets a live opponent (de-facto solo play) and battles have both sides act.
  const npcAiEnabled = authoritativeEnabled && process.env.LOGH_NPC_AI === '1';
  const npcTickMs = Math.max(50, Number(process.env.LOGH_NPC_AI_INTERVAL_MS ?? '500'));
  const defaultNpcProfile = behaviorProfile({});
  // One NPC tick: only meaningful with in-world players to receive the broadcasts. Notifies target
  // 'all' (no actor connection) -> deliver to every registered connection (broadcast sentinel -1).
  const runNpcTickOnce = () => {
    if (!npcAiEnabled || worldRelay.size() === 0) {
      return { notifies: [], actions: [] };
    }
    const result = runNpcTick(worldState, { defaultProfile: defaultNpcProfile });
    for (const { inner } of result.notifies) {
      worldRelay.broadcast(-1, inner);
    }
    if (result.actions.length > 0) {
      writeTrace(traceStream, { event: 'npc-tick', actions: result.actions.length, notifies: result.notifies.length });
    }
    return result;
  };
  let npcTickHandle = null;
  if (npcAiEnabled) {
    npcTickHandle = setInterval(runNpcTickOnce, npcTickMs);
    npcTickHandle.unref?.(); // the AI loop alone must not keep the event loop (and tests) alive
  }

  const server = createTcpServer((socket) => {
    // Latency: the protocol is dominated by tiny (20-30B) frames and strict request/response
    // pairing, so Nagle batching only adds dead time before each reply reaches the client.
    socket.setNoDelay(true);
    const connectionId = nextConnectionId;
    nextConnectionId += 1;
    const session = createLoginSession({ accountStore, lobby, world, characters: lobbyCharacters, contentPack });
    let phase1Key = null;
    // Monotonic S->C body id. The client's decipher_message sequence gate (0x645eda) accepts an
    // inbound frame only when id > [cipher+0x20] (the last-accepted inbound id), then stores it.
    // So every S->C 0x0030 reply on a connection must carry a strictly-increasing id; hardcoding
    // parsed.id breaks as soon as we send multiple replies (e.g. the lobby 0x2001/0x2004/0x2006/0x200a
    // chain). We seed/advance from the highest client id seen and consume one id per reply.
    let nextReplyId = 1;
    const takeReplyId = () => {
      const id = nextReplyId;
      nextReplyId += 1;
      return id;
    };
    // Send unsolicited follow-up frames (already-final message32 inners) after a response,
    // each as its own decipherKey-encoded 0x0030 frame with a monotonic id (G145 world push:
    // 0x0204 char id, 0x0323 character record). subheaderLen matches the triggering branch.
    const sendExtraInners = (extraInners, subheaderLen) => {
      if (!Array.isArray(extraInners)) {
        return;
      }
      for (const extraInner of extraInners) {
        const extraId = takeReplyId();
        const extraFrame = buildEncrypted0030Frame({
          tables,
          key: decipherKey,
          body: build0030Body({ id: extraId, innerPayload: extraInner }),
          subheaderLen,
        });
        socket.write(extraFrame);
        writeTrace(traceStream, {
          event: 'extra-inner-sent',
          connectionId,
          replyId: extraId,
          respInnerCodeHex: `0x${appCodeForTrace(extraInner).toString(16).padStart(4, '0')}`,
          respLen: extraInner.length,
          subheaderLen,
          frameBytes: extraFrame.length,
        });
      }
    };
    // G169 relay wiring: register this connection so other in-world players' commands reach it.
    // sendInner re-frames a (message32) inner as a decipherKey 0x0030 frame with this connection's
    // own monotonic id + lobby subheader, exactly like a normal conn3 server->client reply.
    let registeredInWorld = false;
    let relayTestSent = false;
    const registerInWorld = () => {
      if (registeredInWorld || !relayEnabled) {
        return;
      }
      registeredInWorld = true;
      const lobbySubheaderLen = Number(process.env.LOGH_LOBBY_SUBHEADER ?? '4');
      worldRelay.register(connectionId, (inner) => {
        const frame = buildEncrypted0030Frame({
          tables,
          key: decipherKey,
          body: build0030Body({ id: takeReplyId(), innerPayload: inner }),
          subheaderLen: lobbySubheaderLen,
        });
        socket.write(frame);
        writeTrace(traceStream, {
          event: 'relay-deliver',
          connectionId,
          respInnerCodeHex: `0x${inner.readUInt16BE(4).toString(16).padStart(4, '0')}`,
          frameBytes: frame.length,
        });
      });
      if (authoritativeEnabled) {
        // Assign this player a nation (round-robin over the content pack — a placeholder for a real
        // team/side select) and claim that nation's ships so the ownership rule can enforce them.
        const nations = contentPack.nations;
        const nation = nations[worldState.playerCount() % nations.length];
        worldState.addPlayer({ connectionId, charId: connectionId, powerId: nation.id });
        for (const u of contentPack.unitsForNation(nation.id)) {
          worldState.claimShip(u.id, connectionId);
        }
        writeTrace(traceStream, { event: 'world-join', connectionId, powerId: nation.id, ships: contentPack.unitsForNation(nation.id).length });
      }
      writeTrace(traceStream, { event: 'relay-register', connectionId, peers: worldRelay.size() });
    };
    // Broadcast a command engine's notifies per target: 'others' = everyone but the actor, 'all' =
    // including the actor (the thin client only applies an effect when it receives the Notify).
    const dispatchNotifies = (notifies) => {
      let delivered = 0;
      for (const { inner, target } of notifies) {
        if (target === 'self') {
          // originator-only reply (account/info request answers) — never broadcast to others.
          delivered += worldRelay.send(connectionId, inner) ? 1 : 0;
          continue;
        }
        delivered += worldRelay.broadcast(connectionId, inner);
        if (target === 'all') {
          worldRelay.send(connectionId, inner);
        }
      }
      return delivered;
    };
    let pending = Buffer.alloc(0);
    writeTrace(traceStream, {
      event: 'connection',
      connectionId,
      remoteAddress: socket.remoteAddress,
      remotePort: socket.remotePort,
    });

    socket.on('data', (chunk) => {
      pending = Buffer.concat([pending, chunk]);
      const { frames, remaining } = takeTransportFrames(pending);
      pending = Buffer.from(remaining);
      for (const frame of frames) {
        const code = frame.readUInt16BE(2);
        if (code === PHASE1_CODE) {
          try {
            const reply = buildPhase3ResponseFromPhase1Request({ clientExe, transportKey, requestFrame: frame, decipherKey });
            phase1Key = reply.phase1Key;
            session.markHandshakeComplete();
            socket.write(reply.frame);
            writeTrace(traceStream, { event: 'phase3-sent', connectionId, phase1KeyHex: reply.phase1KeyHex });
            // Proactive lobby OK (G179 timing fix): conn2's recv pump only polls during the handshake
            // window (~5ms) and stops before the reply to 0x2000 arrives, so the late 0x2001 is never
            // read and the lobby FSM times out. Send the 0x2001 RIGHT AFTER phase3 (gated to the lobby
            // connection = connId>=2) so it lands in conn2's recv buffer while the pump is still polling,
            // exactly like conn1's keysetup+redirect arriving in one recv. The 0x2001 consumer 0x4bdb70
            // sets the success flag regardless of FSM state, so an early flag-set survives to state7.
            // Opt-in (LOGH_LOBBY_PROACTIVE_OK=1): send the 0x2001 RIGHT AFTER phase3, encoded with the
            // per-connection phase1Key the client just installed (symmetric Blowfish), so it lands in
            // conn2's recv buffer during the post-handshake polling window AND decodes. Proven via live
            // probe to pass decipher (baseline 0->1); but the lobby SCENE dispatcher still doesn't
            // consume it, so this alone does not set the success flag.
            if (process.env.LOGH_LOBBY_PROACTIVE_OK === '1' && connectionId >= 2) {
              const proactiveId = takeReplyId();
              socket.write(
                buildEncrypted0030Frame({
                  tables,
                  key: phase1Key,
                  body: build0030Body({ id: proactiveId, innerPayload: buildLobbyLoginOkInner({ status: 0 }) }),
                  subheaderLen: Number(process.env.LOGH_LOBBY_SUBHEADER ?? '4'),
                }),
              );
              writeTrace(traceStream, { event: 'lobby-proactive-ok-sent', connectionId, replyId: proactiveId });
            }
          } catch (error) {
            writeTrace(traceStream, { event: 'phase3-error', connectionId, message: error.message });
          }
          continue;
        }
        if (code === TRANSPORT_0030 && phase1Key !== null) {
          let decoded;
          try {
            decoded = childCodecDecode(childCodecKeySchedule(tables, phase1Key), frame.subarray(4));
          } catch (error) {
            writeTrace(traceStream, { event: 'decode-error', connectionId, message: error.message });
            continue;
          }
          const parsed = parse0030Body(decoded);
          if (!parsed.valid) {
            writeTrace(traceStream, { event: 'invalid-0030', connectionId, reason: parsed.reason });
            continue;
          }
          // Keep our outbound id strictly ahead of the client's ids so replies clear the gate.
          if (parsed.id + 1 > nextReplyId) {
            nextReplyId = parsed.id + 1;
          }
          const action = session.onInnerMessage(parsed.innerPayload);
          writeTrace(traceStream, {
            event: 'login-message',
            connectionId,
            innerCodeHex: `0x${parsed.innerPayload.readUInt16BE(0).toString(16).padStart(4, '0')}`,
            innerPayloadHex: parsed.innerPayload.toString('hex'),
            id: parsed.id,
            actionKind: action.kind,
            account: action.account ?? null,
          });
          // G169 in-world relay (opt-in). Register conn3 (world) connections on their SS handshake,
          // then rebroadcast any in-world command (chat/move) to the other players. The client sends
          // these inners raw ([u16 code][payload]); recipients consume conn3 frames in the message32
          // form, so re-wrap before relaying. (Live framing validation awaits two in-world clients.)
          if (relayEnabled) {
            if (action.kind === 'ss-response') {
              registerInWorld();
            }
            if (registeredInWorld) {
              const inboundCode = parsed.innerPayload.readUInt16BE(0);
              if (isRelayCommandCode(inboundCode)) {
                if (authoritativeEnabled) {
                  // Authoritative path: validate + apply + broadcast the canonical Notify the engine
                  // decides (vs blindly echoing the client's frame).
                  const decision = processCommand({
                    state: worldState,
                    connectionId,
                    innerCode: inboundCode,
                    inner: parsed.innerPayload,
                  });
                  const delivered = decision.accept ? dispatchNotifies(decision.notifies) : 0;
                  writeTrace(traceStream, {
                    event: 'authoritative-command',
                    connectionId,
                    innerCodeHex: `0x${inboundCode.toString(16).padStart(4, '0')}`,
                    accept: decision.accept,
                    reject: decision.reject ?? null,
                    delivered,
                  });
                } else {
                  const relayInner = wrapRawInnerAsMessage32(parsed.innerPayload);
                  const delivered = worldRelay.broadcast(connectionId, relayInner);
                  writeTrace(traceStream, {
                    event: 'relay-broadcast',
                    connectionId,
                    innerCodeHex: `0x${inboundCode.toString(16).padStart(4, '0')}`,
                    delivered,
                  });
                }
              }
              // G192 relay self-test: once 2+ players are in the world, this connection broadcasts a
              // server-built CommandGridChat (0x0f1c) to the OTHER players so it appears on their
              // screens — an end-to-end demo of the relay delivering an in-world message between
              // players, without needing the chat-UI. One-shot per connection, opt-in LOGH_RELAY_TEST=1.
              if (process.env.LOGH_RELAY_TEST === '1' && !relayTestSent && worldRelay.size() >= 2) {
                relayTestSent = true;
                const chat = buildCommandGridChatInner({ text: `RELAY OK conn${connectionId}` });
                const delivered = worldRelay.broadcast(connectionId, chat);
                writeTrace(traceStream, { event: 'relay-test-broadcast', connectionId, delivered });
              }
            }
          }
          if (action.kind === 'redirect') {
            const reply = buildRedirectReply({ tables, decipherKey, decodedBody: decoded, redirectInner: action.redirectInner });
            const frames = [reply.keysetupFrame, reply.redirectFrame];
            // LOGH_SEND_SERVERLIST experiment (workflow ws2xffdw9): the bare 0x7001 redirect stamps
            // the login->lobby signal *(0x76bbe4)=0xFFFFFFFF (the lobby FSM's -1 fail sentinel). The
            // 0x7002 serverlist branch (0x4ac758) instead sets it to byte[inner+2]=a valid channel
            // index. Append a 0x7002 frame (gin7-keyed like the redirect, monotonic id) AFTER the
            // redirect so the valid index wins and ids stay strictly increasing.
            let serverListSent = false;
            if (process.env.LOGH_SEND_SERVERLIST === '1') {
              const gin7Key = Buffer.from(reply.gin7KeyHex, 'hex');
              const serverListInner = buildServerListInner({ index: Number(process.env.LOGH_SERVERLIST_INDEX ?? '0') });
              frames.push(
                buildEncrypted0030Frame({
                  tables,
                  key: gin7Key,
                  body: build0030Body({ id: takeReplyId(), innerPayload: serverListInner }),
                }),
              );
              serverListSent = true;
            }
            socket.write(Buffer.concat(frames));
            writeTrace(traceStream, {
              event: 'redirect-sent',
              connectionId,
              account: action.account,
              matchedBy: action.matchedBy,
              lobby,
              gin7KeyHex: reply.gin7KeyHex,
              serverListSent,
            });
          } else if (action.kind === 'lobby-response') {
            // Lobby RPC reply on the same open connection (decipherKey "XY", never close).
            const replyId = takeReplyId();
            const lobbySubheaderLen = Number(process.env.LOGH_LOBBY_SUBHEADER ?? '4');
            const okFrame = buildEncrypted0030Frame({
              tables,
              key: decipherKey,
              body: build0030Body({ id: replyId, innerPayload: action.okInner }),
              subheaderLen: lobbySubheaderLen,
            });
            socket.write(okFrame);
            writeTrace(traceStream, {
              event: 'lobby-response-sent',
              connectionId,
              replyId,
              respInnerCodeHex: `0x${appCodeForTrace(action.okInner).toString(16).padStart(4, '0')}`,
              respLen: action.okInner.length,
              subheaderLen: lobbySubheaderLen,
              frameBytes: okFrame.length,
            });
            sendExtraInners(action.extraInners, lobbySubheaderLen);
          } else if (action.kind === 'ss-response') {
            const replyId = takeReplyId();
            const ssSubheaderLen = Number(process.env.LOGH_SS_SUBHEADER ?? '4');
            // G138 (PROVEN): conn3 SS replies must use the conn2-style message32 wrap
            // [u32 0][u16 code][u8 status]; the raw [u16 code][u8 status] form left the client's
            // request/response queue (queued 0x0200 -> 0x0201) pending under BOTH subheader 0 and 4.
            // With message32, the real client set ssLoginOk/cipherReady/sessionReady/ssGameLoginOk/
            // cipherGate=1 and advanced 0x0200->0x0201->0x0205->0x0206->0x0304 (world "NOW LOADING").
            // message32 is therefore the default; LOGH_SS_FORMAT=raw keeps the old form for A/B.
            const { ssFormat, okInner } = selectSsResponseInner({
              rawOkInner: action.okInner,
              format: process.env.LOGH_SS_FORMAT ?? 'message32',
            });
            const okFrame = buildEncrypted0030Frame({
              tables,
              key: decipherKey,
              body: build0030Body({ id: replyId, innerPayload: okInner }),
              subheaderLen: ssSubheaderLen,
            });
            socket.write(okFrame);
            writeTrace(traceStream, {
              event: 'ss-response-sent',
              connectionId,
              replyId,
              respInnerCodeHex: `0x${appCodeForTrace(okInner).toString(16).padStart(4, '0')}`,
              respLen: okInner.length,
              ssFormat,
              subheaderLen: ssSubheaderLen,
              frameBytes: okFrame.length,
            });
            sendExtraInners(action.extraInners, ssSubheaderLen);
          } else if (action.kind === 'lobby-redirect') {
            // Workflow w8fyp5tg1 (high conf): the lobby stage is a redirect hop, not a terminal
            // 0x2001. Reply to inner 0x2000 with a 0x7001 redirect (routed to the session redirect
            // handler FUN_0x4adbe0) so the client opens conn3 to the world server.
            // G150 showed the lobby conn REJECTS the login-style forced-0x31 keysetup, so the
            // default ("bare") path sends inner 0x7001 encoded with decipherKey, no keysetup frame.
            // LOGH_LOBBY_KEYSETUP=1 selects the alternative keysetup+redirect pair (login-style).
            if (process.env.LOGH_LOBBY_KEYSETUP === '1') {
              const reply = buildRedirectReply({ tables, decipherKey, decodedBody: decoded, redirectInner: action.redirectInner });
              socket.write(Buffer.concat([reply.keysetupFrame, reply.redirectFrame]));
              writeTrace(traceStream, {
                event: 'lobby-redirect-sent',
                connectionId,
                variant: 'keysetup',
                world,
                gin7KeyHex: reply.gin7KeyHex,
              });
            } else {
              const redirectFrame = buildEncrypted0030Frame({
                tables,
                key: decipherKey,
                body: build0030Body({ id: parsed.id, innerPayload: action.redirectInner }),
              });
              socket.write(redirectFrame);
              writeTrace(traceStream, {
                event: 'lobby-redirect-sent',
                connectionId,
                variant: 'bare-decipher',
                world,
                redirectInnerHex: action.redirectInner.toString('hex'),
              });
            }
          } else if (action.kind === 'lobby-login-ok') {
            // Reply to inner 0x2000 with inner 0x2001 LobbyLoginOK (workflow wicdkooh5, byte-verified):
            // consumer 0x4bdb70 sets the success flag *(0x7ccffc)+0x35837b=1 that lobby FSM wait-state 7
            // (getter 0x51be40) polls to advance — keeping conn2 alive instead of parking in watchdog
            // 0x6c -> teardown. status 0 = OK (0x2002 / non-zero would be a reject path). Encoded with
            // decipherKey "XY" and a MONOTONIC id so it clears the decipher sequence gate (0x645eda).
            const status = Number(process.env.LOGH_LOBBY_OK_STATUS ?? '0');
            // LOGH_LOBBY_OK_INNER_HEX overrides the whole inner (format-sweep escape hatch).
            const builtOk = buildLobbyLoginOkPayload({ status, format: process.env.LOGH_LOBBY_OK_FORMAT });
            const okInner = process.env.LOGH_LOBBY_OK_INNER_HEX
              ? Buffer.from(process.env.LOGH_LOBBY_OK_INNER_HEX, 'hex')
              : builtOk.okInner;
            const okFormat = process.env.LOGH_LOBBY_OK_INNER_HEX ? 'hex' : builtOk.okFormat;
            const okReplyId = takeReplyId();
            // LOGH_LOBBY_OK_KEY: 'gin7' encodes the 0x2001 with the GIN7 blob from the client's own
            // 0x2000 credential (inner[2:]) instead of decipherKey "XY". Hypothesis (G193): the client
            // self-installs its lobby credential as the S->C decode key when it sends 0x2000 (like the
            // login conn keys to the 0x7000 blob), so a "XY"-encoded 0x2001 decodes to garbage and is
            // dropped at the 0x0030 decode (0x613193) before reaching decipher.
            if (process.env.LOGH_LOBBY_OK_KEYSETUP === '1') {
              // Hypothesis (G195): conn2 self-installs the 0x2000 GIN7 blob as its S->C decode key,
              // so the 0x2001 must be preceded by a keysetup (force 0x2000 inner -> 0x31, decipherKey)
              // and encoded with that GIN7 blob — exactly like conn1's keysetup+redirect. Reuse
              // buildRedirectReply with the 0x2001 inner. Now that conn2 stays open (router-teardown
              // patch), retest this (G150 rejected it only because conn2 closed instantly back then).
              const reply = buildRedirectReply({ tables, decipherKey, decodedBody: decoded, redirectInner: okInner });
              socket.write(Buffer.concat([reply.keysetupFrame, reply.redirectFrame]));
              writeTrace(traceStream, {
                event: 'lobby-login-ok-sent',
                connectionId,
                variant: 'keysetup',
                okInnerHex: okInner.toString('hex'),
                gin7KeyHex: reply.gin7KeyHex,
              });
            } else {
              const { keyMode: okKeyMode, key: okKey } = selectLobbyLoginOkKey({
                mode: process.env.LOGH_LOBBY_OK_KEY,
                parsedInnerPayload: parsed.innerPayload,
                decipherKey,
                phase1Key,
              });
              const lobbySubheaderLen = Number(process.env.LOGH_LOBBY_SUBHEADER ?? '4');
              const okFrame = buildEncrypted0030Frame({
                tables,
                key: okKey,
                body: build0030Body({ id: okReplyId, innerPayload: okInner }),
                subheaderLen: lobbySubheaderLen,
              });
              socket.write(okFrame);
              writeTrace(traceStream, {
                event: 'lobby-login-ok-sent',
                connectionId,
                replyId: okReplyId,
                okInnerHex: okInner.toString('hex'),
                status,
                okFormat,
                keyMode: okKeyMode,
                subheaderLen: lobbySubheaderLen,
                frameBytes: okFrame.length,
              });
            }
          }
        }
      }
    });
    socket.on('error', (error) => writeTrace(traceStream, { event: 'socket-error', connectionId, message: error.message }));
    socket.on('end', () => writeTrace(traceStream, { event: 'peer-fin', connectionId, note: 'client sent FIN (client-initiated close)' }));
    socket.on('close', (hadError) => {
      session.close();
      if (registeredInWorld) {
        worldRelay.unregister(connectionId);
        if (authoritativeEnabled) {
          worldState.releaseShipsOf(connectionId);
          worldState.removePlayer(connectionId);
        }
      }
      writeTrace(traceStream, { event: 'close', connectionId, hadError });
    });
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, resolve);
  });
  const address = server.address();
  const boundPort = typeof address === 'object' && address !== null ? address.port : port;
  return {
    host,
    port: boundPort,
    // Exposed for deterministic testing: run a single NPC tick (broadcasts to in-world connections).
    npcTickOnce: runNpcTickOnce,
    npcAiEnabled,
    close: () =>
      new Promise((resolve, reject) => {
        if (npcTickHandle) {
          clearInterval(npcTickHandle);
          npcTickHandle = null;
        }
        server.close((error) => {
          if (error) {
            traceStream?.end();
            reject(error);
            return;
          }
          if (traceStream === null) {
            resolve();
            return;
          }
          traceStream.end(resolve);
        });
      }),
  };
}
