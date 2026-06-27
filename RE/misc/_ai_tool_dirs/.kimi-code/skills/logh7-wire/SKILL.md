---
name: logh7-wire
description: Build and decode LOGH VII authoritative-server wire records at byte-exact, RE-confirmed offsets (0x0313/0x0315 strategic grid, 0x0323 character, 0x0325 unit, 0x031f base economy, 0x030b ship class, 0x2006 session). Use when emitting or fixing a server record the decompiled client parses, or reconciling a server builder against the client parser. Triggers: "와이어", "0x0323", "byte offset", "레코드 빌더", "info record", "message32".
---

# LOGH VII — Wire Records

The authoritative Node server (`src/server/*.mjs`) emits records the decompiled client parses. We own the server, so we own the data — but only if the bytes match what the client reads.

## Iron rule: offsets come from the CLIENT PARSER, not a guess
Every field offset must trace to the parser function. Known anchors: `0x031f`=FUN_00414c70, `0x0323` char serializer FUN_00419300, `0x0356` parser FUN_0042c7e0, `0x30b` ship FUN_004109a0, `0x0315` grid FUN_004abbb0. When a label is unresolved, keep the **RE-pinned offset** but mark the name `PROVISIONAL` and write 0 (don't fabricate a value that could corrupt the panel). Cross-check the server builder against the parser before trusting a panel will render.

## Format notes
- Many records are **fixed-size** (FUN_004b8b00 size table): 0x0313/0x0315 are zero-padded to **5004 bytes**, RLE intact. Don't change the framed length — only cell/field values.
- **message32 wrapping**: lobby/session responses wrap the inner as `[u32 BE 0][u16 BE code][LE body]`. Session-list inner must be PACKED sequential (a fixed 0x14c stride broke the picker: parser bailed `name_size>13`).
- `0x0315` terrain map = per-cell grid-type: **0=plasma storm, 1=space, 2=非航行/non-navigable, 4+index=object**. The server sets impassable terrain by writing cell value 2 (see strategic-map-wire docs).
- Strings are **UCS-2/UTF-16LE on the wire** (≤13 chars for names); `.rsrc` strings are UTF-16LE too — see [[logh7-localize]].
- **0x0337 is double-assigned** (battle ResponseTacticsCharacter vs base NotifyBaseParameter) — isolate before wiring base-economy live.

## Method
1. [[logh7-re]] the parser → exact offsets + field types + fixed size.
2. Implement the builder writing only RE-confirmed fields; grade every value (P0 wire / P1 manual / P2 IV-EX / P3 placeholder).
3. Add an oracle test asserting byte offsets (`tests/server/*.test.mjs`).
4. Confirm the panel renders real values via [[logh7-live]] (a unit test ≠ the client accepting the frame).
