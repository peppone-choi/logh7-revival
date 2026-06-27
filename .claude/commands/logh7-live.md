---
description: LOGH VII 실클라 라이브검증 (ui_explorer 스플래시대기→드라이브→trace/shot→stop)
argument-hint: "[검증 대상 예: cave 0x0b01 | font | world entry]"
---

Use the **logh7-live** skill — full procedure in `.claude/skills/logh7-live/SKILL.md`. Verify in the real client: `$ARGUMENTS`.

⚠️ Kill stale node first, then `start`, then **wait ~30s for the BOTHTEC/MPS splash** (shot to confirm the lobby) before `create-character`. trace.jsonl is the truth (`0x0f02`=world, `0x0b01`=select-grid). Always `stop` and confirm `shaVerified:true`. The D3D window exposes no windowText — `shot` + Read the PNG before any blind click.
