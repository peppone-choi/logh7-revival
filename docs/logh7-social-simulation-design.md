# LOGH VII Social Simulation Design

**Date**: 2026-07-17  
**Approved direction**: Path A (Original client binary patch) confirmed; Path B (Companion web dashboard) deprecated.

---

## Executive Summary

The LOGH VII revival implements a **3-layer social-economic simulation** to restore gameplay depth the original game deliberately left unimplemented (cf. official manual p9: "経済関連は現在未実装"). All user-facing social data must render within the original client UI (the 1st product, canonical oracle); companion dashboards serve debug support only.

This is **restoration + creation**: we inherit the 1st product's render-field constraints; we create the economic/political/social systems that feed those fields. Provenance tagging ensures creative content does not masquerade as canon.

---

## Design Principles

1. **Original client as 1st product**: All social state appears in existing render paths. No companion web UI required for gameplay.
2. **Canon-aware scope**: The original deliberately left economy unimplemented. Filling this is **design (non-restoration) and requires per-feature approval**.
3. **Fail-closed safety**: Simulation failures (zero-fill) must not break playability. Events-first, projection fallback to zero.
4. **Provenance tracking**: Every created value tagged `_provenance` (extracted|setting|design) and `_canon` (true|false) to prevent scope creep.

---

## 3-Layer Architecture

### Layer 1: Render Fields (No patch required)

**Scope**: Fields the original client already parses and renders. Extraction + filling zero/defaults only.

| Field | Offset | Type | Notes |
|-------|--------|------|-------|
| Territory owner | 0x031f elem+0x04 | u8 | Galaxy affiliation (empire/faction ID) |
| Governor | 0x0323 indirect | u16 ref | Ruler/admin appointment via reverse lookup |
| Territory class | elem+0x175 | u8 | Strategic value, resources |
| Budget array | elem+0x140 | [u32; N] | State income/allocation |
| Commodity array | elem+0x24 | [u32; M] | Supply reserves (food, rare, labor) |
| Facilities/Fortress | 0x0321 | u8 flags | Infrastructure (shipyard, farm, etc.) |

**Renderer**: FUN_0057aa90 (unique, legacy reference).

**Provenance**: Territory ownership, class, facilities are **extracted canon**. Budget/commodity arrays are **design** (fill with server simulation defaults + approval).

---

### Layer 2: Server Simulation (No patch, events-only mutation)

**Scope**: Tick-based game-state evolution. Single-writer eventlog ensures consistency and replay capability.

#### Architecture
- **Tick definition**: 1 in-game day = 1 simulation tick (decoupled from tactical loop).
- **Event sourcing**: All mutations via append-only event log. Handlers emit only domain events, never direct state mutation.
- **Projection model**: Read-model builders consume events → Layer 1 fields (Budget, Commodity) + Layer 3 parameters (population/food-security scalars).
- **Bounded context**: `social-economy` (separate from combat/session hotpath; failures do not affect core gameplay).

#### Event Types
| Event | Domain | Effect | Canon? |
|-------|--------|--------|--------|
| ProductionTicked | Economy | Territory produces goods based on class/facilities | Design (rates approved per-territory) |
| SupplyConsumed | Logistics | Population consumes food; triggers unrest if deficit | Design |
| PopulationChanged | Demographics | Birth/death/migration; affected by food/health/morale | Design |
| BudgetAllocated | Finance | Governor distributes state income; affects production tax | Design |
| GovernorAppointed | Politics | Ruler replaces administrator; skill affects efficiency | Extracted (original gov mechanics) |
| ApprovalShifted | Politics | Population sentiment changes (food shortage, rebellion, victory) | Design (thresholds approved) |
| FacilityConstructed | Infrastructure | New shipyard/farm added; requires budget+time | Design |

#### Single-Writer Tick
- **Ownership**: One async task per world-session consumes the event queue, applies business rules in order, emits results.
- **No locks**: Events are immutable; projections read-only until next tick.
- **Idempotent design**: Ticks re-runnable for replay; no side effects outside event log.

---

### Layer 3: Client UI Patches (Binary modification required)

**Scope**: Parameters the original client **parses but does not bind to UI widgets**. Requires patched render paths.

#### NotifyBaseParameter Cache (Opcode 0x0337 / 0x4a)

| Parameter | Offset in cache | Type | Notes | Render status |
|-----------|-----------------|------|-------|----------------|
| Population | +0x00 | u32 | Territory inhabitants | **Parsed, UI unbound** |
| Food security | +0x04 | u32 | Surplus/deficit days | **Parsed, UI unbound** |
| Civil order | +0x08 | u32 | Unrest/crime level (0–100) | **Parsed, UI unbound** |
| Ideology support | +0x0C | u32 | Ruler popularity (0–100) | **Parsed, UI unbound** |
| Religious faction | +0x10 | u32 | Faith affinity (0–100) | **Parsed, UI unbound** |
| Trade price index | +0x14 | u32 | Commodity inflation (100 = baseline) | **Parsed, UI unbound** |

**Dispatcher gap**: NotifyBaseParameter → No opcode handler registered. Client receives; no widget updates.

**Patch strategy**:
1. Add NotifyBaseParameter handler that updates in-memory mirror.
2. Per-widget patch: Bind parameter to existing territory panel, finances panel, etc.
3. Minimal-invasiveness rule: Reuse existing render calls; avoid new function inlines (Frida constraint: no mid-function hooks without crash risk).

**Approval gate**: Each patch → separate human review (security, crash risk, scope).

---

## Data & Simulation Architecture

### Bounded Context: `social-economy`

**File structure** (planned):
```
server/src/domain/social-economy/
  events/          # Event definitions
  projections/     # Read-model builders
  commands/        # Tick simulation logic
  entities/        # Territory, Governor, Commodity aggregates
  specs/           # Approval-gated configuration
```

### Seams (Pre-implementation verification)

Critical integration points to verify before coding:

| Seam | File | Purpose |
|------|------|---------|
| UnitOfWork | server/src/infrastructure/persistence/UnitOfWork.mjs | Event append + transaction boundary |
| GameApplication | server/src/application/GameApplication.mjs | Session lifecycle; tick scheduler |
| WorldSession | server/src/server/logh7-world-session.mjs | Game loop entry; tick trigger |
| WorldRecords | logh7-world-records.mjs | Projection query interface |

### Provenance & Approval

Every value carries metadata:
```json
{
  "territory_id": 42,
  "budget": 5000,
  "_provenance": "design",
  "_canon": false,
  "_approval_ref": "LOGH7-XXX",
  "_created_at": "2026-07-17T00:00:00Z"
}
```

**Fallback safety**: Projection failure → zero-fill for all Layer 3 parameters. Layer 1 (render fields) must never fail; they are extracted canon.

---

## Lineage & Rebaselining Gate (Critical decision point)

### Current Baseline
- **EXE hash**: Original CD client, no patches.
- **Image base**: FUN_0057aa90 (renderer).

### Patched Lineage Procedure (Human approval required)

Whenever we apply a client patch:

1. **Patch as reproducible transform**: Record as byte-diff or script (no hand-edited binaries blessed as canon). New hash = canonical+patch_transform deterministically regenerated in CI.

2. **Lineage manifest**: Add node to `docs/logh7-client-lineage-current.md`:
   ```
   parent_hash: <original>
   patch_manifest: [{ name: "0x4a-notifybase-handler", target: FUN_XXXX, transform: "..." }]
   new_hash: <sha256>
   new_image_base: <adjusted-base>
   sentinel_set: [0xABC123, ...]
   provenance: "patch for Layer3 NotifyBaseParameter UI binding"
   approval_ref: "LOGH7-YYY (human PR review)"
   ```

3. **Gate expansion**: Extend EXE verification gate from "hash in {original}" to "hash in {original, patch_v1, patch_v2, ...}". Each hash binds a capability profile (e.g., patch_v1 enables Layer3 rendering; original does not).

4. **Backward compatibility**: Original EXE remains authorized; patched and original coexist.

5. **Audit trail**: All patches in version control; CI re-derives hash to verify integrity.

---

## Phased Roadmap

### Phase 1 (Weeks 1–2): Render-field population
**Goal**: Layer 1 complete. Playability unaffected; foundation for Phases 2+.

- Extract canon: Territory ownership (0x031f), class, facilities, governor identity.
- Create defaults: Budget/commodity arrays (design, per-approval). Populate projection.
- No client patches; no rebaselining needed.
- **Approval gate**: Per-territory defaults (quick review, no security risk).

### Phase 2 (Months 1–3): Server-side simulation
**Goal**: Tick loop, event log, projections. Layer 1 fields respond to game progression.

- Implement `social-economy` bounded context (events, commands, projections).
- Integrate with world-session tick scheduler.
- Test: Event replay, zero-fill fallback, no playability impact.
- **Approval gate**: Simulation rules (economic balance, faction dynamics).

### Phase 3 (Open-ended, parallel track): Client patches
**Goal**: Layer 3 UI widgets. Long-term, non-blocking.

- **First**: Prove rebaselining procedure with **minimal patch** (e.g., unlock 1 already-parsed parameter that is currently unbound).
  - Lock in: patch transform, lineage node, new hash verification, CI gate expansion.
  - Human review & approval.
- **Then**: Expand per-parameter as resources allow (civil order widget, ideology panel, trade price ticker, etc.).
- Each patch → separate lineage entry, separate approval.

---

## Risk & Unknowns

### Critical RE gaps (Layer 1 prerequisite)

1. **0x031f population/food/order scalar offsets**: Client decompile incomplete. Need live export or Frida trace to confirm exact field positions within NotifyBaseParameter cache.
2. **Warehouse endian/tag/scale**: Grade C (unverified). Affects commodity array interpretation.
3. **Governor reverse-lookup integrity**: 0x0323 parsing needs validation against in-game roster.

**Mitigation**: Phase 1 gates on 0x031f verification (live-qa + Frida if needed).

### Scope & effort

- **Full vision** (all territories, dynamic election, religion mechanics, trade wars): Multi-year.
- **MVP scope** (Layer 1 + Layer 2 base; Layer 3 minimal patch): Weeks–months depending on RE unknowns.
- **Playability-critical path** (M4): Movement, Warp, combat. Social sim is parallel, non-blocking.

---

## Decision Summary

| Decision | Outcome | Approval |
|----------|---------|----------|
| **Client patch vs. companion web** | Path A (binary patch, in-client only) | 2026-07-17 user |
| **Scope: fill original unimplemented economy** | Yes; explicitly non-restoration, tag as design/non-canon | 2026-07-17 user |
| **Patch distribution** | Each patch → lineage node, deterministic CI verification, rebaselining gate | Pending human review |
| **Fallback on sim failure** | Zero-fill Layer 3; Layer 1 must never fail | Architecture invariant |

---

## Next Steps

1. **Confirm RE baseline** (0x031f offsets) via live-qa + Frida.
2. **Approve rebaselining procedure**: Human PR review of patch-transform + lineage-node pattern.
3. **Phase 1 sprint**: Territory extraction, budget/commodity defaults.
4. **Parallel**: Phase 2 event-log scaffolding (no changes to core game loop yet).
