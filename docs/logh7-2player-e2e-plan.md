# 2-Player Full E2E Plan — signup → download → play → both-sides battle (Task #7)

Goal (user, 2026-06-14): one server, two players sign up, get the distribution, play, and
**battle between both sides**. Test as far as is actually possible and document where it blocks.

## Confirmed READY (evidence)

- **Signup (#5 done)**: `createAccountRegistry` + `createAccountStore({registry, allowRegister})`;
  serve-auth `--account-db <path>` (or `LOGH_ACCOUNT_DB`) enables TOFU register/verify. Two distinct
  GIN7 account labels register independently. (tests/server/logh7-account-registry.test.mjs)
- **Server-side 2-player battle relay (READY)**: `src/server/logh7-world-relay.mjs` —
  `RELAY_COMMAND_CODES` includes combat `0x0405 CommandAttackShip` / `0x0406 CommandShootShip`;
  the auth-server resolves damage authoritatively (logh7-combat-engine) and `broadcast()`s
  `NotifyAttackedShip 0x0426` to every other in-world connection. Enabled by
  `LOGH_RELAY=1 LOGH_AUTHORITATIVE=1 LOGH_CONTENT_DB=1`. So A's fire → server damage → B sees 0x0426.
- **World entry (G164)**: unmodified client reaches WORLD via the auth-server (login→lobby→SS→world)
  with `LOGH_LOBBY_OK_FORMAT=message32 LOGH_SS_FORMAT=message32 LOGH_WORLD_PLAYER=1`.
- **Distribution**: `python tools/logh7_pipeline.py package-installed .omo/work/logh7-installed
  --overlay .omo/work/logh7-ko-overlay --out .../logh7-ko-installed.zip` (image-free zip).

## Known FRONTIER / blockers (honest)

- **In-world fleet controllability**: after world load the player is in the strategic sector view
  but `gridActive(0x126718)=0`, grid slots 0 — a GUI click does NOT emit `0x0400/0x0b01`, and a
  tactical-fire `0x0405/0x0406` needs mode byte `client+0x126711==0` (live measured ==2). So a human
  CANNOT yet ISSUE combat from the GUI. This is a live-RE task, independent of the (ready) server.
- **2-client live GUI**: Win32 foreground-steal makes two simultaneous auto-driven clients fragile
  (ui_explorer drives one window). Needs manual window placement OR a 2-client harness.

## Test ladder (run as far as possible, record the stop point)

1. **Two accounts sign up** — `LOGH_ACCOUNT_DB=.omo/work/e2e-accounts.json LOGH_RELAY=1
   LOGH_AUTHORITATIVE=1 LOGH_CONTENT_DB=1 npm run server:auth`; drive 2 logins with distinct GIN7
   labels; assert both register (registry file has 2 accounts).
2. **Download/install** — build the ko zip, unzip to two separate client trees.
3. **Both reach world** — launch client A and client B (two `logh7_ui_explorer` sessions on distinct
   `--session` dirs, ONE shared external server on :47900); screenshot both at WORLD.
4. **Both-sides battle** — the GUI-issue blocker means we test the battle PATH two ways:
   - (a) **Authoritative path proof (no GUI dep)**: inject `0x0405/0x0406` for A's fleet via the
     server/relay test harness → assert `0x0426` is broadcast to B (server tests already cover the
     resolution; the live relay delivers it to B's socket). Proves "both sides see combat damage".
   - (b) **Live GUI issue (frontier)**: attempt the grid-enter mode transition
     (`0x126711=0`) so A's click emits `0x0405`; if it still can't, document the exact stop point.

## Harness need

ui_explorer handles ONE client (+ its own spawned server). For #7 either: extend it with a
`--no-server`/`--attach` mode + `--session B` so a 2nd client attaches to one external
`server:auth`, OR add a dedicated 2-client driver. The server must be the single external
relay-enabled instance (not ui_explorer's auto-spawn) to share world state between both clients.
