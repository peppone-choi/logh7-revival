# LOGH VII UI Coordinate Map (current live baseline)

All coordinates are client-window pixels for `ui_explorer` clicks. Always confirm with a fresh `shot` before clicking because the D3D8 window exposes no useful UI text.

## Current Authority

- Canonical playable EXE SHA256: `bc5e932212e790981c648c7b60acfbba06c0fdd5b8d7f583ef123fac71b098ad`
- Live driver: run from `RE/` with `python -m tools.logh7_ui_explorer --server-root ../server`
- Default start/login display: windowed
- Borderless mode is an opt-in post-login/play-surface mode and enables cursor clipping via `cursor-clip=auto`

## Lobby

Latest live measurements from the native lobby layout:

| Target | Coordinate | Evidence/notes |
|---|---:|---|
| Login button | `(352, 347)` | Historical stable login hit |
| New character | `(574, 407)` | Reconfirmed in lobby regression pass #78 |
| Original character lottery | `(575, 465)` | Reconfirmed in lobby regression pass #38 |
| Delete character | `(575, 523)` | Opens local delete-card picker |
| Back button in session/delete screens | `(1105, 742)` | Clean back path returns to lobby if no card is selected |

The main lobby notice/content container is visually inside the right panel in current screenshots.

## Lobby-Derived Character/Session Screens

The issue was not the main lobby notice panel. It was the content block used by session picker / character creation / name-entry screens drifting outside the right panel and over the left menu. The default playable stack includes `charsel-recenter`, `charsel-content-inset` for the 8-step creation form X placement, and `charsel-content-y-inset` for the two stale create-step Y anchors. The inset patches leave the session cards alone and move labels, input boxes, radio rows, and bottom buttons inside the native panel.

Latest live confirmation:

- Lobby main screen
- New-character session picker
- Original-character session picker
- Faction / gender / origin steps
- Character name-entry panel
- Flagship-name panel

Evidence:

- `.omo/ui-explorer/lobby-content-inset-2d96-20260628` on canonical SHA `2d96061f...`.
- `.omo/ui-explorer/lobby-container-2d96-20260629` on canonical SHA `2d96061f...`: `002-lobby-ready.png`, `003-open-new-character.png`, `005-open-original-character.png`, `012-faction-next.png`, `015-lastname-click.png`, and `024-flagship-click.png`.
- `.omo/ui-explorer/lobby-content-y-inset-fc70-20260629` on the pre-promotion canonical SHA `fc703145...` with runtime patch `charsel-content-y-inset`: `006-faction-empire.png`, `009-origin-next.png`, and `020-flagship-text.png` show the instruction/content container inside the right panel.
- Current installed/overlay official EXEs hash to `bc5e9322...` and contain the promoted `charsel-content-y-inset` bytes plus the caller-gated `charsel-confirm-dialog-inset` return-site hook. The confirm-dialog inset has been retuned from `+116px` to `+180px` so the final registration dialog's left edge sits inside the native right panel instead of on the panel boundary. Live evidence: `.omo/ui-explorer/lobby-confirm-inset-bc5e-final-20260629/shots/022-register.png`.

The `charsel-content-inset` patch moves only the 8-step form content by +116 px on X:
old name-entry input boxes `x=862..1064` (center 963) -> new `x=978..1180`
(center 1079). Session-card layout is unchanged and remains inside the panel.

The `charsel-content-y-inset` patch then moves the two remaining stale create-step anchors from `Y=242` to `Y=280`. Current automation hit points moved by the same +38 px on the affected controls.

Current create-character automation hit points, calibrated against that inset content:

| Target | Coordinate | Evidence/notes |
|---|---:|---|
| Session row 1 | `(1090, 425)` | session-card center; rows stride by about 115 px |
| Empire radio | `(1021, 464)` | right-panel faction content |
| Alliance radio | `(1021, 580)` | right-panel faction content |
| Step next/register | `(1184, 731)` | right button inside bottom pair |
| Final register confirm | `(1015, 596)` | "결정" button in the inset generic confirmation dialog |
| Last name input | `(1080, 462)` | name-entry first text box center |
| First name input | `(1080, 543)` | name-entry second text box center |
| Portrait first slot | `(444, 344)` | accepted in the 2026-06-29 full create flow after Y inset |
| Flagship input | `(781, 506)` | accepted in the 2026-06-29 full create flow; visually inside the right panel |

## Delete Flow Caveat

Back works before a card is selected. Selecting a visible card in delete mode currently routes into the normal `0x2009` character/session selection path instead of a confirmed delete request. Do not treat delete-card selection as working deletion until the delete opcode/router path is RE-confirmed.

## Strategy/World Reminder

`0x0f08 -> 0x0f09` traffic is not movement proof. Natural strategic movement requires a user-originated `0x0b01` request and corresponding response/broadcast evidence.
