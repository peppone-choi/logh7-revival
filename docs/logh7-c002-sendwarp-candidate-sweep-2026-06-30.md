# LOGH VII C002 SendWarp Candidate Sweep - 2026-06-30

Purpose: compare multiple accepted target-grid clicks on the same dev-only C002 route before promoting any short `sendwarp-live-v1` field to authoritative `destCell`.

## Commands

```bash
cd RE
python -m tools.logh7_c002_playable_route --session ..\.omo\ui-explorer\c002-playable-route-target-inside-1300x500-20260630 --server-root ..\server --stop-existing --stop-at-end --trace-timeout 20 --start-settle 16 --lobby-settle 3 --character-settle 8 --target-settle 4 --confirm-settle 4 --inject-seconds 2.5 --target-grid-cell 1300,500
python -m tools.logh7_c002_playable_route --session ..\.omo\ui-explorer\c002-playable-route-target-inside-900x600-20260630 --server-root ..\server --stop-existing --stop-at-end --trace-timeout 20 --start-settle 16 --lobby-settle 3 --character-settle 8 --target-settle 4 --confirm-settle 4 --inject-seconds 2.5 --target-grid-cell 900,600
```

## Results

| target click | accepted | raw `0x0b01` payload | `routeCellCandidate` | `routeTailWord` |
| --- | --- | --- | --- | --- |
| `1100,455` | yes | `033500880335008800000001000003350098ffffffff09b977000000000005` | `0x09b9` | `0x7700` |
| `1300,500` | yes | `033500880335008800000001000003350098ffffffff0a1f79000000000005` | `0x0a1f` | `0x7900` |
| `900,600` | yes | `033500880335008800000001000003350098ffffffff0a1b82000000000005` | `0x0a1b` | `0x8200` |
| `1800,445` | no | no `0x0b01`; only `0x0300 -> 0x0301` | n/a | n/a |

## Interpretation

- `routeCellCandidate` is target-dependent and is now the leading `destCell` candidate for `sendwarp-live-v1`.
- Parser status remains `unitId:null`, `destCell:null`, and `unresolved:true`; promotion needs a follow-up RE/probe tying this field to the selected native grid cell.
- `routeTailWord` also varies, but its semantics are still unknown.
- This remains a dev-only injected resident command-table route; it does not prove canonical authority-card/factory admission.

## Dev Fallback Recheck - 2026-06-30 20:50 KST

After the server fallback changed to prefer `routeCellCandidate` only when the existing dev gate `LOGH_DEV_GRID_MOVE_FALLBACK_CELL` is set, this live run verified that the playable route now moves to the clicked candidate instead of the static fallback cell:

```bash
cd RE
python -m tools.logh7_c002_playable_route --session ..\.omo\ui-explorer\c002-playable-route-routecell-fallback-1300x500-20260630 --server-root ..\server --stop-existing --stop-at-end --trace-timeout 20 --start-settle 16 --lobby-settle 3 --character-settle 8 --target-settle 4 --confirm-settle 4 --inject-seconds 2.5 --target-grid-cell 1300,500
```

Verified:

- `verification.ok:true`.
- `0x0b01` accepted as `fleet-grid-move`.
- `parsed.fields.routeCellCandidate:2591` (`0x0a1f`).
- `debug.destCell:2591` (`0x00000a1f`).
- Raw payload: `033500880335008800000001000003350098ffffffff0a1f70000000000005`.
