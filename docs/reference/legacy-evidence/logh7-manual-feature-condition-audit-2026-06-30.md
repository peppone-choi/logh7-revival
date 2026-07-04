# LOGH VII Manual Feature / Condition Audit (2026-06-30)

Purpose: turn the manuals into a concrete playable-surface checklist. This is not a completion claim; it is the reference list for what the server/client must expose, what conditions must be enforced, and what remains unverified in live client runs.

## Sources Checked

| Source | Pages | File SHA256 | Text Result | Use |
|---|---:|---|---|---|
| `docs/reference/gin7manual.pdf` | 101 | `ff9b7b638582febba723413d9956f4166aecbc20746cb35bb4afddcef9515080` | same normalized text as unlocked | Canon manual source, encrypted PDF |
| `C:/Users/by0ng/OneDrive/Desktop/gin7manual_unlocked.pdf` | 101 | `9de65bea3306275704343ac6020c1d27b3a97134df3ea438843657d04286b4da` | same normalized text as CD/reference copy | Canon manual source, easier extraction |
| `docs/reference/gin7manual-alt.pdf` | 69 | `1c4cf3db13a172361277264c06ada6e2499be0969494c6557eb84bc4cc005399` | different text | Secondary/alternate manual cross-check |

Normalized text hash for the 101-page pair: `a010f08af14cba72cd3d5b5e70b5cb8181dec4ed446ecd8e850c67b06fbb2408`.

Conclusion: the user-provided unlocked PDF and the repository CD/reference manual are different PDF files but the same manual content. The 69-page `gin7manual-alt.pdf` is the actual alternate content version and should be kept as a secondary check, not silently mixed into P1 canon tables.

## Provenance Grades

| Grade | Meaning |
|---|---|
| P0 | Client EXE/runtime/wire confirmed |
| P1 | Official manual or original asset extraction |
| P2 | Strong reconstruction/inference, not live-confirmed |
| P3 | Development seed or playable placeholder; never present as canon |

## Manual-Required Play Surfaces

| Surface | Manual Basis | Existing Data / Code | Current Verified State | Gap / Next Work |
|---|---|---|---|---|
| Session model | Main p10; alt p10. A session is the shared server world, up to 2000 players, with re-entry restrictions after exclusion/death. | `logh7-session-registry.mjs`, `logh7-auth-server.mjs`, `logh7-public-account-web.mjs`, session list `0x2005->0x2006`, select `0x2009->0x200a`. | Partial. Session list exists, but product requirement is now one default "Iserlohn server" initial session plus DB/memory registry. | Make session registry the single source of truth, remove temporary/Japanese session names, persist or memory-manage selected session. |
| Public signup/account | Revival requirement, not a legacy manual feature. | `logh7-account-registry.mjs`, `logh7-public-account-web.mjs`, account DB hooks. | Partial/needs live validation. | Public user signup must create server DB account, login into legacy client, and set default session selection. |
| Character lifecycle | Main p14-p16; alt p14+. Character has names, sex, birthdate, civil/military classification, rank, peerage/title/origin, birthplace, achievement/evaluation/fame and abilities. | `logh7-character-gen.mjs`, account profile store, create echo `0x1008`, selected character `0x0204`, character records `0x0323`, roster/info `0x034e->0x034f`, compact `0x0356`. | Partial. Create path exists, but user observed created characters not reliably visible/selectable; delete flow can route into play-select and stall. Age label on card is original EXE behavior and should remain. | Persist generated character as real account character, make select/delete/list all hit same registry, verify selected character becomes active in world HUD and command state. |
| Authority/job cards | Main p32-p33; alt p24-p25. All commands execute through duty-authority cards; every character has at least personal and captain cards; max 16 cards. | `strategy-commands.json`, `logh7-dev-command-cards.mjs`, `logh7-command-engine.mjs`, card/command tables `0x0304->0x0305`, `0x0306->0x0307`. | Partial. 81 manual strategy commands are present by category, but target requirements are not canonicalized in the JSON. | Add per-command target/condition schema from manual + EXE. Dev-only category cards may expose all targets, but must be removable after development. |
| Strategy command groups | Main pp68-73; alt has same categories with page shifts. | `server/content/manual/strategy-commands.json`. | Data present: 81 commands across 7 categories. | Command engine must map every command to visible target prompts, eligibility, cost, wait/execute time, and result state changes. |
| Strategic map objects | Main p31 and star chart p101; alt p28+. Systems, planets/fortresses, terrain/space, units, and ownership must be visible. | `galaxy.json`, `galaxy-adjacency.json`, grid/object opcodes `0x0313`, `0x0315`, base/system `0x031c->0x031d`, base state `0x031e->0x031f`. | Partial. Current `galaxy.json` has 85 systems, 300 planets, 6 fortresses, 80 positioned systems. Older audit docs mention 281 planets, so the count/provenance needs reconciliation before canon display. | Show planets, fortresses, system faction/ownership, grid unit counts, and terrain. Recover or explicitly label missing special-body/sargasso/plasma positions. |
| Fleets/ships | Main pp46, 95-99; alt pp41+. Tactical unit taxonomy and ship unit tables. | `ship-units.json`, `ship-stats.json`, unit table `0x0324->0x0325`, ship master `0x030a->0x030b`. | Partial. Manual P1 ship master exists: 52 Empire entries, 12 Alliance entries. Live user observed ship data not surfacing. | Default-on live delivery for ship master and fleet/unit table; verify spec panels and map unit counts in client. |
| Ground troops | Main pp46, 51-52, 100; alt pp41+. Tactical ground units include armored infantry, armored grenadiers, light infantry, plus troop production table. | `troops-deployment.json`, `unit-types-deployments.json`, troop master `0x030c->0x030d`, battle ops. | Data present, delivery incomplete. | Wire troop master normal request path and expose sortie/withdraw/occupation targets. |
| Fighters/weapons/power allocation | Main pp50, 53-55; weapon effects and BEAM/GUN/SHIELD/ENGINE/WARP/SENSOR allocation. | Static builders for fighters `0x030e->0x030f`, arms `0x0310->0x0311`, power distribution `0x0308->0x0309`; `combat-rules.json`. | Partial/P3 in places. Some content is playable seed, not recovered canon. | Recover EXE/static masters where possible. Until then label fighter/arms/power values P3 and do not call them original. |
| Tactical start/end | Main p46; alt p41. Start when friendly and enemy units share the same strategic grid. End when no enemy remains; planet/fortress grids also require full occupation. | `combat-rules.json`, tactical entry notifies `0x0b09/0x0b0a`, tactical unit request/response `0x033a->0x033b`. | Not playable yet. Live verified only mode transition; tactical GUI/object pool still shows NO DATA / empty pool. | Fix tactical import sequence: confirm `0x033a` request or push semantics, ensure `0x033b` resident table is populated before `0x0b0a`, and verify active tactical pool count in client memory. |
| Tactical command authority | Main p47; alt p42. Priority is online characters, then rank, evaluation points, merit points. Transfer requires target outside another flagship command circle and fully stopped. | `combat-rules.json`, battle/command engines. | Mostly design/data, not live-confirmed. | Implement command authority resolver, range-circle gating, stop-state requirement, and visible denial messages. |
| Scouting | Main p49; automatic, no manual scouting command; range/precision depends on unit stats and SENSOR allocation; information shared with allies. | `combat-rules.json`, static power data placeholders. | Not live-confirmed. | Add tactical visibility state and shared allied detection updates. |
| Tactical ship commands | Main p53-p55; alt p50+. Move, turn, parallel movement, reverse, sortie, stop, retreat, fortress cannon. | `combat-rules.json`, `logh7-battle-ops.mjs`, tactical notify families `0x0423`, `0x0424`, `0x0426`, `0x0427`, `0x0429`, `0x042a`, `0x042f`, `0x0437`, `0x0440`. | Mostly not live-confirmed. | Expose command buttons/targets, wire result notifies, and verify tactical GUI receives objects first. |
| Occupation / ground battle | Main pp51-52; alt pp46-49. Planet/fortress occupation requires ground unit flow and defense resolution. | `combat-rules.json`, `logh7-battle-engine.mjs`, `logh7-battle-ops.mjs`. | Partial engine only. | Make troop sortie/return and occupation status visible in base/planet panels and tactical end condition. |
| Personnel/politics/logistics/intelligence | Main pp68-73 command table and org-post tables. | `org-posts.json` Empire 58 / Alliance 63, `strategy-commands.json`, command engine. | Data present, interactions incomplete. | Map personnel commands to posts/ranks/characters; logistics to base resources/packages; politics/intelligence to state changes and proposals/orders. |

## Manual Strategy Command Categories

Current `strategy-commands.json` has the manual command names and timing/cost fields, but no target/condition fields yet.

| Category | Count | Required Target Families |
|---|---:|---|
| `作戦コマンド` | 16 | fleet/outfit, grid/system, base, troop, resources |
| `個人コマンド` | 15 | character, location/base, social target, flagship purchase target |
| `指揮コマンド` | 8 | operation plan, outfit/unit, subordinate character, transport route |
| `兵站コマンド` | 6 | ship/troop/package/resources/base |
| `人事コマンド` | 10 | character, rank, title/peerage, organization post, planet/territory |
| `政治コマンド` | 12 | faction, policy, budget/resource, planet/base, diplomatic target |
| `諜報コマンド` | 14 | character, organization, base/system, intelligence target |

Target families required by the user's dev-card requirement: base/planet/system/celestial, character, outfit/fleet, ship, troop, fighter, weapon, grid cell, resources, operation plan, post, rank, faction/power.

## Opcode / Downlink Coverage To Keep Checking

| Surface | Required Downlink / Flow | Status |
|---|---|---|
| Lobby sessions | `0x2005->0x2006`, `0x2009->0x200a`, optional `0x2003->0x2004` announcement | Partial; needs one Iserlohn default and Korean/non-temp names |
| Account/character creation | `0x1008`, account registry, profile persistence | Partial; create/select/delete live flow still failing user tests |
| Active player in world | `0x0204`, `0x0323`, `0x034e->0x034f`, `0x0356` | Partial; must stop falling back to placeholder emperor/statless records |
| Strategy map/system/base | `0x0313`, `0x0315`, `0x031c->0x031d`, `0x031e->0x031f`, `0x0320->0x0321` | Partial; objects exist in content but are not all visible/owned/count-labeled |
| Fleet/unit table | `0x0324->0x0325`, outfit detail `0x032a->0x032b`, package/unit variants `0x032e->0x032f` | Partial; user observed ship data absent |
| Static masters | `0x030a->0x030b`, `0x030c->0x030d`, `0x030e->0x030f`, `0x0310->0x0311`, `0x0308->0x0309`, `0x0306->0x0307` | Needs normal request-path wiring and provenance labels |
| Tactical mode/object pool | `0x033a->0x033b`, `0x0b09`, `0x0b0a`, tactical notifies | Mode switch only verified; tactical object pool not populated |
| Commands/orders/proposals | Client command opcodes plus dev/admin executor | Data skeleton exists; every command still needs target/eligibility/result mapping |

## Current A0 Checklist

- [ ] Make account/session DB or memory registry authoritative, with exactly one default initial session named as the Iserlohn server.
- [ ] Make public signup create a user account, log in through the legacy credential path, and preselect the default session.
- [ ] Make generated characters real account characters, then verify create/list/select/delete in the live client.
- [ ] Deliver active selected character into world records; no placeholder emperor/statless fallback in normal playable path.
- [ ] Expose all strategic objects: system, planet, fortress, celestial, faction/ownership, grid cell, fleet/unit counts.
- [ ] Wire static masters for ships, troops, fighters, arms, power allocation, and card-command records; mark P3 seeds clearly.
- [ ] Build dev-only authority cards by category, with target prompts and target pools for every manual command family.
- [ ] Fix tactical object import after mode transition; do not count tactical as playable until the client tactical pool is populated and GUI shows units/data.
- [ ] Implement tactical start/end conditions, command authority, scouting, movement/retreat/sortie/stop/fortress-cannon commands.
- [ ] Continue text/display-function RE where labels are mismatched; distinguish client hardcoding from server-supplied text.

## Live Verification Note

Last known live result before this audit: strategy map loads, tactical mode flag can be changed, but tactical GUI/data are not populated. The verified claim is therefore only "mode transition succeeded"; tactical gameplay is still blocked on `0x033b` consumption/import and active tactical pool population.
