---
name: logh7-wire
description: Build and decode LOGH VII authoritative-server wire records at byte-exact, RE-confirmed offsets. Use when emitting or fixing records parsed by the real client.
---

# LOGH VII Wire Records

The canonical Node server lives in `server/src/server/*.mjs`. It emits records parsed by the decompiled client, so offsets must come from the client parser, not guesses.

## Known Parser Anchors

- `0x0315` strategic grid parser: `FUN_004abbb0`
- `0x031f` base economy parser: `FUN_00414c70`
- `0x0323` character record consumer/serializer path: `FUN_00419300`
- `0x0325` unit/fleet record path: parser-stream layout in current server tests
- `0x0356` rich character/update parser: `FUN_0042c7e0`
- `0x030b` ship class parser: `FUN_004109a0`
- `0x2006` session-list response: fixed client size table in `FUN_004b8b00`

## Rules

- Keep unresolved fields at the RE-pinned offset, mark labels `PROVISIONAL`, and write 0 rather than fabricating values.
- Preserve fixed record sizes. `0x0313` and `0x0315` are padded to 5004 bytes.
- Lobby/session responses use message32 wrapping: `[u32 BE 0][u16 BE code][LE body]`.
- `0x0315` terrain values: `0` plasma storm, `1` space, `2` non-navigable, `4 + index` object marker.
- Wire strings used by these records are generally UTF-16LE/UCS-2. Resource strings are UTF-16LE; `String.txt` is cp949.
- `0x0337` is collision-prone. Do not promote provisional base-parameter emission until the real route is RE-confirmed.

## Method

1. Use `logh7-re` to pin parser offsets and field types.
2. Implement the builder in `server/` writing only RE-confirmed fields.
3. Add byte-offset oracle tests under `server/tests/server/`.
4. Confirm the real panel/client behavior with `logh7-live` before claiming a user-facing result.
