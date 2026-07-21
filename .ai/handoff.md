# Agent Handoff

## 2026-07-21 FIX pass (not just re-confirm)

### Code fixes shipped
1. **0x031f LE multi-byte** (`codec/base-record.mjs`): case 799 raw-copies body → id must be **LE** for `FUN_0057aa90` native match. BE id made `*piVar15==7` fail → full panel NO DATA. class_@+0x175 default 0 after LE float.
2. **Character id≠1** (DB): `characters.id` **1→1001** (皇帝 slot collision). name Test/Pilot, ability8 starter band, unit_id 1001. `sqlite_sequence.characters=1000`. JSON store `nextId` default **1001**.
3. **0x0323 zero-fill ability path** (`world-session`): all-zero ability8 → starter [55..56] + pcp100/stamina80 (only that branch).

### Live partial proof
- Lobby char card: **Test / TestPilot** + non-zero stats (shots-fix2/01-charsel.png).
- Strategy re-enter after this pass: harness double-click flaky (stuck on char select); server has LE encode ready. Restart server (PID was 28276) + manual ゲーム開始→card dbl recommended.

### Tests
`node --test` system-detail + static-base + world-records + world-session → **143 pass**.

### Still open
- Fleet marker / 0x032e (not fixed this pass).
- Full strategy HUD after LE fix needs successful world re-enter.

## 2026-07-21 UI checklist P0→P1→P2 ultragoal (ledger complete; fix pass above)

- Plan: `.omc/ultragoal/plans/ui-checklist-p0-p1-p2/`
- **G003 MapOwnerShipCount**: **Unknown** — probe log under goal scratch + checklist Gap; no invented wire.
- **G004 FleetMarker032e**: **Blocked+evidence** — 0x0325 commander=cell path already shipped; live markers 0 / 0x032e=0.
- **G005 CommandGridOrbit**: **BLOCKED** (depends G004); S-JC-04 / S-MV-10/11 documented.
- **G006 TacticalFacilitySweep**: T-*/P-* UNSEEN/N/A/BLOCKED with tactical OFF reasons.
- **G007 ChecklistHandoff**: `docs/logh7-ui-screen-checklist-current.md`, this file, key-facts, current-state.
- **G008**: focused server tests exit 0; quality evidence in scratch.

### Code touched
- `server/src/server/codec/base-record.mjs`
- `server/src/server/logh7-static-base.mjs`
- `server/src/server/logh7-world-records.mjs`
- `server/src/server/logh7-world-session.mjs`
- `server/tests/logh7-system-detail-records.test.mjs`
- `server/tests/logh7-static-base.test.mjs`
- `server/tests/logh7-world-records.test.mjs`

### Verify
```
cd server && node --test tests/logh7-system-detail-records.test.mjs tests/logh7-static-base.test.mjs tests/logh7-world-records.test.mjs
# exit 0
```

### Next (human / parent plan)
1. Restart sole server + client; re-shot S-BP / S-IV after G001/G002.
2. RE fleet marker render gate (why 0x0325 does not paint icons).
3. Resume standing-backlog G003 0x032f after selectable marker.

Never: force push, secrets, data delete, `.codex/config.toml`, kill live client mid-RE, tactical ON without human.
