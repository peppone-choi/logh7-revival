# LOGH VII Korean Name Input RE (2026-06-27)

## Scope

Target screen: new-character family/given-name input after native lobby v2 + runtime `charsel-recenter`.

Live baseline:
- Session: `.omo/ui-explorer/charsel-mempatch-98ca-20260627`
- Disk client: canonical 98ca, `RE/.omo/work/logh7-installed/exe/G7MTClient.exe`
- Runtime-only patch: `charsel-recenter`, 38/38 Frida memory patches OK
- Stop verified: `shaVerified:true`, restored SHA `98ca4acd2ec86b657e75b28623bf753029a83d116b052c54ba6e45d4f7952afc`

## Live Findings

ASCII input works:
- Clicked last-name field around `(965,425)`.
- `ui_explorer text TESTABC` rendered `TESTABC`.
- Screenshot: `.omo/ui-explorer/charsel-mempatch-98ca-20260627/shots/022-ascii-lastname.png`

Hangul input does not render through current automation:
- `ui_explorer text 라인` and `text 하르트` left fields visually blank.
- Screenshot: `.omo/ui-explorer/charsel-mempatch-98ca-20260627/shots/019-mempatch-korean-name-entered.png`

Direct Unicode key injection also did not render:
- Sent U+B77C/U+C778 using `SendInput(KEYEVENTF_UNICODE)`.
- OS returned success and foreground hwnd matched the game.
- Screenshot: `.omo/ui-explorer/charsel-mempatch-98ca-20260627/shots/024-024-after-unicode-sendinput.png`

Narrow `movsx -> movzx` diagnostic was live-tested:
- Session: `.omo/ui-explorer/hangul-name-movzx-98ca-20260627`
- Disk client: canonical 98ca, no `LOGH_PRESEED_PLAYER_CHAR`
- Runtime-only patches: `charsel-recenter` 38/38 OK plus `input-edit-char-movzx` at VA `0x004fff65`, actual memory `0f b6 06` OK.
- Hangul text after patch still rendered blank in the first name field.
- Screenshot: `.omo/ui-explorer/hangul-name-movzx-98ca-20260627/shots/009-hangul-lastname-after-movzx.png`
- ASCII `TEST` after patch rendered normally.
- Screenshot: `.omo/ui-explorer/hangul-name-movzx-98ca-20260627/shots/010-ascii-after-movzx.png`
- Stop verified: `shaVerified:true`, restored SHA `98ca4acd2ec86b657e75b28623bf753029a83d116b052c54ba6e45d4f7952afc`.

Conclusion: this is not a field-focus, coordinate, or font-rendering failure. The edit widget accepts ASCII, but the client-side character collection path does not accept the Hangul paths tested. `movzx` also proves that high-bit byte validation alone is insufficient; the remaining blocker is DBCS/IME collection and append routing.

## Decompiled Path

### `FUN_004e7200` Win32/IME dispatcher

Relevant behavior:
- Handles IME messages `0x281`, `0x282`, `0x285`, `0x286`, `0x290`, `0x10d`, `0x10e`, `0x10f`.
- `WM_KEYDOWN` `0x100` routes to `FUN_004ffdc0`.
- `WM_CHAR` `0x102` sets `DAT_02214649=1`, truncates `wParam` to one byte, validates through `FUN_004fff60`, then appends through `FUN_004ffcd0`.
- `WM_IME_CHAR` `0x286` only logs `IME WM_IME_CHAR!!!` and falls through; it does not append text.

Raw bytes at VA `0x004e7200`, file `0x000e7200` begin:

```text
000e7200: 64 a1 00 00 00 00 6a ff 68 d8 2d 66 00 50 a1 4c
000e7210: 46 21 02 64 89 25 00 00 00 00 83 ec 08 50 e8 e3
000e7220: f4 12 00 85 c0 75 05 a2 98 15 c5 00 53 56 8b 74
000e7230: 24 24 8b 46 04 3d 82 02 00 00 bb 01 00 00 00 0f
```

### `FUN_004fff60` character validator

Decompiled behavior:
- Reads `*param_1` as a signed `char`.
- Calls `FUN_00600de9((int)*param_1)`.
- Accepts spaces, LF, CR; CR can be normalized to LF when `param_2 != 0`.

Raw bytes at VA `0x004fff60`, file `0x000fff60`:

```text
000fff60: 56 8b 74 24 08 0f be 06 50 e8 7b 0e 10 00 83 c4
000fff70: 04 48 f7 d8 1a c0 fe c0 75 22 8a 0e 80 f9 20 75
000fff80: 02 b0 01 80 f9 0a 75 02 b0 01 80 f9 0d 75 0d 8a
000fff90: 4c 24 0c 84 c9 b0 01 74 03 c6 06 0a 5e c2 08 00
```

Important byte: `0f be 06` is `movsx eax, byte ptr [esi]`. A byte `>=0x80` becomes a negative-looking 32-bit value before `FUN_00600de9`, which is a bad fit for CP949 lead/trail byte injection.

### `FUN_004ffcd0` text append

Decompiled behavior:
- Requires active edit flag at `param_1+1`.
- Builds a temporary C string from a single byte:
  - `local_c[0] = param_2`
  - `local_c[1] = 0`
- Inserts/appends that string into the edit buffer.

This is a single-byte append path. It does not assemble a DBCS pair before insertion.

### `FUN_00600de9` character classification

Decompiled behavior:
- If `param_1 < 0x100`, checks CRT/MBCS classification tables.
- Else attempts a 2-byte classification path through `FUN_0060af7d`.

But the active `WM_CHAR` caller passes one byte after `movsx`, so CP949 bytes from automation are not naturally assembled into the intended 2-byte path.

### `FUN_00516bf0` chat send pump

This is separate from character-name input, but confirms the known chat-send hazard:
- Before chat send, it pushes `s_Japanese_0076e3fc`.
- Then calls locale/conversion and sends through `FUN_004b5600` or `FUN_004b5690`.

Raw bytes around the locale push at VA `0x00516de4`, file `0x00116de4`:

```text
00116de0: 0f 84 9c 00 00 00 68 fc e3 76 00 53 e8 d0 8e 0e
```

`68 fc e3 76 00` = `push 0x0076e3fc`.

String slot at VA `0x0076e3fc`, file `0x0036e3fc`:

```text
0036e3fc: 4a 61 70 61 6e 65 73 65 00 00 00 00 83 5b 83 8d Japanese.....[..
```

## Current Interpretation

The character-name edit field is an old MBCS edit widget, not a Unicode edit widget.

The tested Hangul paths fail for different reasons:
- `SendInput(KEYEVENTF_UNICODE)` likely produces Unicode `WM_CHAR`; `FUN_004e7200` truncates `wParam` to one byte, losing Hangul.
- `ui_explorer text` CP949 byte-pair `WM_CHAR` enters a one-byte validator/append path. The validator uses signed byte input and the append function inserts one byte at a time.
- `WM_IME_CHAR` exists in the dispatcher but only logs; it is not routed to the append path.
- The live `movsx -> movzx` test keeps ASCII working but still does not render Hangul, so the single-byte append path remains the blocker.

## Patch Implications

Do not treat this as a font patch.

Likely fix directions:
- Input-side shim: convert Hangul text to the client-expected MBCS sequence and inject through the real path that the edit widget can accept, if one exists.
- Client patch: route `WM_IME_CHAR` or a composition-result path into a DBCS-aware append path, not the current single-byte `FUN_004ffcd0`.
- Narrow diagnostic patch candidate: change `FUN_004fff60` at VA `0x004fff65` / file `0x000fff65` from `movsx` (`0f be 06`) to `movzx` (`0f b6 06`) only as a test. This may help high-bit byte validation, but it does not solve DBCS pair assembly by itself.
- Live result: `input-edit-char-movzx` is negative as a standalone fix. Keep it as evidence, not as a default patch.
- Avoid global `Japanese`→`Korean` literal replacement. The same locale/string path is shared with render/conversion code and previous RE flagged it as a regression risk.

Next live test should use a fresh canonical 98ca session, no preseed, and instrument `FUN_004e7200`, `FUN_004fff60`, `FUN_004ffcd0`, plus message IDs/wParam values while using the real Korean IME.
