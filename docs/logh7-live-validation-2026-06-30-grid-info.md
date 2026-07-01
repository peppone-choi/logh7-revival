# 2026-06-30 Live Validation: Grid/System Info Exposure

## Scope

정보 메뉴 `0x0f08 -> 0x0f09` 경로에서 격자 함선 수, 격자 국적, 성계 국적이 서버 trace와 후속 data push로 노출되는지 확인했다.

## Verified Live Client

- Client SHA256: `bc5e932212e790981c648c7b60acfbba06c0fdd5b8d7f583ef123fac71b098ad`
- Server PID: `27896`
- Client PID: `18904`
- Port: `47900`
- Screenshot: `RE/.omo/ui-explorer/session/shots/110-110-click-character-info.png`

## Verified Trace

Latest `infoPanel` trace:

- `targetBaseId`: `70`
- `systemId`: `70`
- `systemOwner`: `3`
- `systemFaction`: `empire`
- `gridCell`: `2588`
- `gridOwner`: `3`
- `gridFaction`: `empire`
- `gridShipCount`: `1`
- `gridOutfitCount`: `1`
- `extraCodes`: `0x031d`, `0x031f`, `0x0321`, `0x0327`, `0x0329`, `0x0325`, `0x034f`, `0x032d`, `0x032b`, `0x032f`

## Code/Test Lock

- `server/src/server/logh7-login-session.mjs`
  - `0x0f08` info-panel response includes grid/system ownership trace fields.
  - `0x0f08` extra pushes now include `0x034f ResponseCardCharacter` in addition to `0x0325` and `0x032d`.
- `server/tests/server/logh7-login-session.test.mjs`
  - `login session 0x0f08 exposes grid ship count plus grid/system ownership records`
  - asserts `0x0325`, `0x034f`, `0x032d`, non-empty `0x034f`, and grid/system ownership fields.

## Still Open

- Lower-right live HUD can still render the selected system ownership as `소속 불명`; trace and records are now present, but the immediate HUD projection path needs another RE pass.
- Character info card opens and receives data, but the visible first row can still show the temporary name `1`; this is separate from the grid/system ownership trace and should be fixed through the 724-byte character record/name source path.
