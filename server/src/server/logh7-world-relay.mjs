/**
 * Server-wide relay registry for in-world multiplayer (G168).
 *
 * The LOGH VII client receives OTHER players' in-world actions via the SAME message codes it
 * sends — Command* classes (CommandGridChat 0x0f1c, CommandMoveShip 0x0400, CommandMoveGrid, ...)
 * are registered in the client's receive factory FUN_004b8b00 as well as serialized on send
 * (G167). So the authoritative server does not need to reimplement game logic to get players to
 * see each other: it relays each in-world command frame from the originating connection to every
 * other in-world connection, re-framed with that connection's own cipher key + monotonic reply id.
 *
 * This module is the cross-connection registry + broadcast; the per-connection 0x0030 framing is
 * supplied by the auth-server via the `sendInner` callback each connection registers.
 */

/**
 * In-world command codes a client sends that must be relayed to the other players. Chat is the
 * safest first relay (pure text, no shared game state). Movement/combat commands are included so
 * the relay covers the full in-world action set; the server may additionally validate/transform
 * them once authoritative world state exists.
 */
export const RELAY_COMMAND_CODES = new Set([
  0x0b01, // CommandMoveGrid (STRATEGIC fleet move on the sector map) -> 36B/9 dwords, FUN_004bea90.
  //         The core strategic-multiplayer action: relaying it makes other players see a fleet move.
  0x0f1c, // CommandGridChat (grid/sector chat) -> 140B: [type?][senderId][text<=65]
  0x0f1d, // CommandSpotChat (spot chat)
  0x0400, // CommandMoveShip (TACTICAL move, in a battle grid)
  0x0402, // CommandParallelMoveShip (tactical formation move)
  // --- space war (tactical combat), authoritative resolution in logh7-command-engine ---
  0x0404, // CommandWarpShip   (tactical warp jump)
  0x0405, // CommandAttackShip (sustained fire) -> server resolves damage -> NotifyAttackedShip 0x0426
  0x0406, // CommandShootShip  (beam volley)    -> server resolves damage -> NotifyAttackedShip 0x0426
  0x0407, // CommandFight      (auto-resolved engagement) -> 0x0426 + NotifyMoraleDown 0x0440
  0x0411, // CommandChangeMode (fleet stance/formation + battle entry) -> NotifyChangeMode 0x042f
  // --- ground combat (地上戦) ---
  0x040f, // CommandSortieTroops (deploy troops to surface) -> NotifySortie 0x437 + NotifyLandCombat 0x42a
  0x0412, // CommandSortie/troop assault -> ground-combat resolution
  // --- internal affairs (内政): personnel / strategy / logistics / social — routed to domain processors ---
  0x0704, 0x0705, 0x0706, 0x0707, 0x0708, 0x0709, // personnel: rank up/down, card appoint/dismiss/resign
  0x0900, 0x0901, 0x0902, 0x0903, 0x0906, // strategy: make/withdraw plan, announce, create/delete outfit
  0x0b00, 0x0b02, 0x0b03, 0x0b04, 0x0b05, 0x0b06, // strategic map: move base, supply fuel, search, load/unload troop, switch mode
  0x0c00, 0x0c01, 0x0c02, 0x0c05, 0x0c08, 0x0c0b, 0x0c0c, // logistics: repair/supply/reorg/supplement/carry/assign
  0x0e00, // institutions: move institution spot
  0x0f0b, 0x0f0c, 0x0f0d, 0x0f0e, 0x0f0f, // social: mail address, messenger
  0x0f10, 0x0f11, 0x0f12, 0x0f13, 0x0f14, // social: mail send/read/delete/order-suggest
  0x0f16, 0x0f17, 0x0f18, 0x0f19, 0x0f1a, 0x0f1b, 0x0f1e, // social: settings + spot unicast chat
  // --- battle ops (maneuver siblings + fleet/base ops) -> processBattleOps ---
  0x0401, 0x0403, 0x040a, // TurnShip / ReverseShip / Stop
  0x0408, 0x0409, 0x040b, 0x040c, 0x040d, 0x040e, 0x0413, 0x0414, 0x0419, 0x041f, 0x0420, 0x0421, 0x0422,
  0x041a, 0x041b, 0x041c, 0x041d, 0x041e, // base ops
  // --- account ---
  0x1006, 0x1007, // CommandOriginal/Extension CharacterCharge
]);

/** @returns true if `innerCode` is an in-world command that should be relayed to other players. */
export function isRelayCommandCode(innerCode) {
  return RELAY_COMMAND_CODES.has(innerCode);
}

/**
 * Create a relay registry. Connections register a `sendInner(inner)` callback when they enter the
 * world and unregister on close. `broadcast` delivers an already-decoded inner buffer to every
 * registered connection except the sender.
 */
export function createWorldRelay() {
  /** @type {Map<number, (inner: Buffer) => void>} */
  const clients = new Map();

  return {
    register(connectionId, sendInner) {
      if (typeof sendInner !== 'function') {
        throw new TypeError('sendInner must be a function');
      }
      clients.set(connectionId, sendInner);
    },
    unregister(connectionId) {
      clients.delete(connectionId);
    },
    has(connectionId) {
      return clients.has(connectionId);
    },
    /** Deliver `inner` to one specific connection (used for 'all'-target notifies incl. the actor). */
    send(connectionId, inner) {
      const sendInner = clients.get(connectionId);
      if (!sendInner) {
        return false;
      }
      try {
        sendInner(inner);
        return true;
      } catch {
        return false;
      }
    },
    size() {
      return clients.size;
    },
    /**
     * Relay `inner` to every registered connection except `fromConnectionId`.
     * A failing recipient is skipped (its connection may be tearing down) so one dead socket
     * never blocks delivery to the others. Returns the number of recipients reached.
     */
    broadcast(fromConnectionId, inner) {
      let delivered = 0;
      for (const [connectionId, sendInner] of clients) {
        if (connectionId === fromConnectionId) {
          continue;
        }
        try {
          sendInner(inner);
          delivered += 1;
        } catch {
          // recipient socket is gone / mid-teardown; skip it.
        }
      }
      return delivered;
    },
  };
}
