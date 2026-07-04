# LOGH VII — Master Content Catalog & Add-Content Cookbook

Status: synthesized from per-category content RE (CONTENT + adversarial VERDICT), all primary
claims verified against the actual content files AND the client consumer (file:line + Ghidra
addr). Verifier corrections are incorporated; refuted/imprecise claims are dropped or fixed inline.

Provenance tiers used throughout:

- **P0** — decompiled wire layout / caps (client binary, byte-exact).
- **P1** — genuine shipped client artifact (portrait pixels, in-game string-table names, model scene-graphs).
- **P2** — manual/cross-game reconstruction (gin7 manual, IV-EX decode, PDF page-101 coords).
- **P3** — invented/procedural seed (gameplay hp/attack, planet economy, fortress 0-1000 stats).
- **lost-original** — original LOGH VII *server* data; never archived (roster/stats/galaxy DB/scenario OOB).

**NEVER** label P2/P3 reconstruction as "original server data."

Cleanup note: the old modding architecture document was removed during 2026-07-03 cleanup. Use `docs/logh7-architecture-operations-current.md` for the current mod/remaster layer summary.

Mod layers (current summary in `docs/logh7-architecture-operations-current.md`): **A** = server-content (JSON/JS the Node server
emits), **B** = asset-file drop-in (loose data/ files), **C** = localization (MsgDat/String.txt/text-shim),
**D** = client binary patch. Prefer A/B over D. Exceeding any client cap WITHOUT the matching D-patch
makes the client parser bail on the **entire** message.

---

## 1. Master table

| Category | What exists (counts) | Defined-in (kind) | Client consumer (opcode / fn) | Key caps | Add layer |
|---|---|---|---|---|---|
| **Characters / roster** | roster 99 (97 w/ stats, 12 face anchors); +manual 75, official 12 (face anchors only, 0 stats), canon-extra 10; O-group portrait pool ~299 frames / 396 codes; G-group create pool 264 codes; calibrated face registry 45 | character-roster.json + roster/* (P2/P3); TCF portraits (P1); 0x0323 layout (P0); original roster (lost) | 0x0323 ResponseInformationCharacter, 724B; dispatch FUN_004ba2b0 case 0x323; parse FUN_00417390; own-char FUN_004c2a80 | record 724B fixed; names ≤13 UCS-2; special_ability ≤80; card ≤16; entry ≤5/account; roster card ≤64; world ~600; ability_8 fixed 8; **flagship@0x24 == unit.id@0x00** | **A** (content). D only to exceed atlas caps oem199/oam95/o99 or 64/5 gates |
| **Ships / units** | ship-stats 63 (52 emp + 11 all); manual ship-units 64; runtime SHIP_CLASSES 9; models 273 (261 mdx + 12 mds); constmsg ship names ~176 | ship-stats.json (P2); SHIP_CLASSES hp/atk P3; mdx/mds (P1 scene-graph); mdx mesh (lost) | 0x0325 unit elem (FUN_004ba2b0 case 0x325, 0xce44); 0x30b ship-class master (case 0x30b, 0x6d64, **zero-stub today**); model loader FUN_004dd6a0 | units ≤600; boats/fleet ≤10; ship classes ≤200; name ≤13; flagship==unit.id; faction from COMMANDER char not unit owner | **A** (stats-only, reuse model). B blocked (new mdx mesh) |
| **Galaxy** | 80 systems / 281 planets / 6 fortresses; 79 spectral + 6 special bodies; 100×50 grid (5000 cells) | galaxy.json (P2 coords); fortresses.json (P3 stats); model-galaxy-stars (P1); economy (P3); server galaxy DB (lost) | 0x0313 object table (FUN_00413050); 0x0315 RLE grid (FUN_004abbb0); 0x031d/0x031f base; placement FUN_004d3bd0 | value range 3..88; objects ≤100; ≤85 markers/board; klass byte1==3 only; variant {0..6,8→class7}; base elems ≤4; grids fixed 5004B | **A** (galaxy.json + buildStrategicGalaxyGrid). B blocked (new 3D body) |
| **Nations / fleets / economy** | 3 powers (emp 0x500/all 0x501/Phezzan 0x502); 80 systems by faction (39/40/1); 6 fortresses; 1 fleet/named-char; budget/economy P3 | NATION_META (server); galaxy/economy (P3); InformationSessionPower roster (lost / **0 built**) | lobby 0x2006 power (FUN_00444900); in-world InformationSessionPower (FUN_004301d0); NotifyBaseParameter (FUN_00438390, NOT dispatcher-routed) | **powers/session EXACTLY 2**; fleet roster ≤14/nation; leaders ≤3; budget ≤6; nations ≤64 (record family); units ≤600 | **A** (content). 3rd playable belligerent = D. In-world ≤14-fleet emitter UNBUILT |
| **Messages / strings** | 22 MsgDat files / 9582 records (4653 non-empty); constmsg 3199 (60 cmd tooltips); 125 tokens; schema 8 groups; String.txt fragment 127/13; KO overlay 60 ids | msgdat-full / client/* / String.txt (P1 client-asset); constmsg-ko (P2/P3) | master loader FUN_00521dc0; HFWR reader FUN_00522060 (magic 0x52574648); String.txt FUN_004ea180 | per-file cp932/cp949 ANSI (not UTF-8); records NUL-term, fixed-index slots; group sub-id ≤0xff; name ≤13 | **B** (edit existing ids — encoder EXISTS). +C text-shim for UTF-8. Add-new-id needs new packer + usually A |
| **Commands / personnel** | 81 manual commands; 121 org-posts; 28 ranks (14×2); 52 medals (15 icons); 38 unit-types + 65 deployments; 8 personnel opcodes; 59 hardcoded CommandXXX | manual/* + roster/* (P2/P3); medals name_ja (P1); personnel.mjs (server); CommandXXX classes (lost) | opcode↔class FUN_004ba2b0 + FUN_004b8b00; RankUp FUN_0043c300; action-list FUN_004c0400; CardAppoint FUN_004c5580 | move_character ≤32; card seats ≤16; roster ≤64; medals 52 used / 128-bit field; **commands NOT data-addable** | **A** (ranks/posts/medals/rebalance). **D** for a new command verb |
| **Scenarios / sessions** | 2 default sessions (Amritsar/Vermilion); world-clock factory; DEFAULT_CONTENT 2 nations/2 units, CANON 3/8; worldBySession map (0 default) | scenario-session/auth-server (server); content-pack/canon (P3); original scenario OOB (lost) | 0x2006 picker FUN_00444900 (0x5304); world handoff 0x2009; power dest FUN_004301d0 | sessions ≤64; **powers EXACTLY 2**; session_name ≤13; begin_day ≤65; super_man ≤13; payload fixed 0x5304 | **A** (sessions + content-pack). 3rd belligerent = D. Per-nation lobby fleet-roster wire UNPINNED |
| **Institutions / items** | facilities 152 labels (94 names + 8 access-state + 8 ability); 98 posts; 52 medals; special-ability id→name table = 0; warehouse/package P3 default-0 | schema/msgdat/medals (P1); all-names/org-posts (P2); 0x0321 scalar names PROVISIONAL; warehouse values (lost) | 0x0321 (FUN_004167f0, 0x8DE4); 0x0327 warehouse (FUN_0041a870, 0x300); 0x0329 package (FUN_0041b280, 0x154); decoration FUN_00419300 | 0x0321 bases ≤4 / inst ≤36 / spots ≤20; decoration 128-bit (MSB-first); special_ability ≤80; ships ≤99 / troops ≤24 / other ≤3 | **A** (institutions/rooms/medals/warehouse). Special-ability names blocked (no enum) |
| **Assets (audio/models/textures/UI)** | audio 20 (7 ogg + 13 wav); models 418 (406 mdx + 12 mds); textures 930 (921 bmp + 9 tga); PE .rsrc 2 dialog + 1 menu + 22 string tables | install assets (P1 client-asset); inventories (P2/P3); sound path table 0x0076cd90 (P1) | WAV FUN_00621ef0; OGG FUN_00622f20; model FUN_004dd6a0; D3DX8 texture; DialogBoxParamA | sound table FIXED 20 slots; WAV fmt cksize 0x10..0xFF; OGG must be real Vorbis; textures pow2, fixed filename; mdx mesh NOT decoded | **B** (replace audio/texture, scene-graph swap). New mesh blocked; new sound slot / dialog = D |

---

## 2. Per-category schema + ADD-CONTENT recipe

### 2.1 Characters / roster / portraits

**Schema (0x0323, 724B = 0x2d4, P0).** Key fields (offset/type): `id u32@0x00`; `power u8@0x04`
(faction); `camp u8@0x05`; `fame u32@0x10`; `return_base u32@0x18`; `spot u32@0x1c`;
`flagship u32@0x24` (**MUST equal unit.id@0x00** or FUN_004c2a80 won't place the fleet);
`flagship_name_len u8@0x28 (≤13)` + `u16[13]@0x2a`; server pcp/mcp `@0x50/@0x54`;
`money u32@0x68`; `decoration_bits u8[16]@0x6c` (128 bits, MSB-first per byte);
`parentage[2] stride 0x84 @0x80` (wire count ≤1; sub-record lastname/firstname/display ≤13,
blood, rank, titlename ≤13, **face u32@+0x74**); `ability_8[8] @0x188 stride 4 = {point u16,
experience u16}` FIXED 8 (manual order 統率/政治/運用/情報/指揮/機動/攻撃/防御 is EXTERNAL attribution);
`special_ability_len u8@0x1aa (≤80)` + `u16[80]@0x1ac`; `card_len u8@0x24c (gate <0x11, NOT 0x250)`
+ `card[16]@0x254 stride 8`.

Content-file shape (character-roster.json → adapter): `{id, name(=name_ja), nameRomaji, nameKo,
nationId(=NATION_ID[faction]), rank, abilities:[tochi,seiji,unei,joho,shiki,kido,kogeki,bogyo]
→ ability_8@0x188, portraitIndex(=face codec value)→parentage[].face@+0x74}`.

O-group portrait record (logh7-original-officers.mjs): `{id:0x4000+i, name:String(i+1) placeholder,
isCanon:true, identityRecovered:false, nationId(oem=0x500/oam=0x501/o=0x502), abilities:[50×8],
portraitIndex:encodeFace(atlas,index)}`.

**Consumer (P0):** parse FUN_00417390; dispatch/size FUN_004ba2b0 case 0x323 (writes
clientBase+0x36a8b4+count*0x2d4) / FUN_004b8b00 → 0x2d4; own-char FUN_004c2a80 (raw u32 equality
vs clientBase+0x3584a0, **no range check** — id space incl 0x4000+ is unconstrained); portrait
atlas reader FUN_005924c0 (oem gate `199<index`, oam dir +0x640, o dir +0xaf0); face codec
FUN_00592c30 (bases oem0 / o10000 / oam100000 / gem1000000, %1000 index).

**Caps:** entry chars ≤5; extension ≤2; ResponseCardCharacter roster ≤64; card/char ≤16;
special_ability ≤80; world roster ~600; all name fields ≤13 UCS-2; ability_8 fixed 8; atlas index
caps **oem ≤199 / oam ≤95 / o ≤99**; G-group is create-only (validateCreateFace rejects O-group).

**ADD recipe (Layer A — fits caps + existing portraits, zero client RE):**

1. Append a record to `content/character-roster.json` (or `canon-extra.json` for hand-authored canon):
   `{id, name_ja, name_romaji (ASCII-safe), faction, rank, stats{8 abilities 0-100}, face_value}`.
   `nationId` from `NATION_ID[faction]`; abilities in **wire order** `[tochi,seiji,unei,joho,shiki,kido,kogeki,bogyo]`.
   Keep ids ≥0x4000 to avoid server-side opcode collision (NOT a client cap — own-char compare is
   raw equality; canon-extra.json's existing 0x10xx/0x20xx ids are harmless on the client).
2. Portrait: reuse a shipped face → `face_value = encodeFace(atlas,index)` for an existing O/G slot.
3. `buildContentPackDataFromSource` (adapter:211-297) maps the record into the 0x0323 record; clamp
   ALL caps before emit; `maskCanonNames` defaults true → names ship as placeholders `'1'..'N'`.
4. Provenance: tag name/stats P2/P3 (`originalServerData:false`). Portrait pixels are P1
   (identity-unmapped); wire layout/caps P0.

**Escalate to Layer D only** to exceed atlas caps (199/95/99) or the 64-card / 5-entry gates.
New portrait ART needs a **TCF packer that does not yet exist** (only logh7_tcf_decode.py).

**Blocked-on-RE:** u16 non-ASCII name encoding (cp932/UCS-2 path) — why `nameRomaji` is the safe field
and masking defaults on. Identity mapping for the ~299 O-group portraits is lost-original; only 45 are P2-calibrated.

---

### 2.2 Ships / units

**Schema.** ship-stats.json row: `{key, name, side:'empire'|'alliance', shipClass, pools{maxArmor,
maxZanki(=unit_count), maxShield, beamPower, defense, morale}, _raw{...full OCR block...}}`. 0x30b
ship-class master: count u8 @0 + ≤200 records stride 0x8c=140B; per record kind u16@0, name_len u8@0x08, name ≤13 @0x0a,
8 named u16 stats @0x54 (armorFront/Side/Back, shield, shieldCap, beamPower, AA, crew), speed f32@0x6c,
11 u16 tail @0x7c (cost, resources, unitCount, gun, missile…); wire 0x6d64 = 4+200*140. 0x0325 unit
element stride 0x58=88B: `id u32@0x00 (ANCHOR == char.flagship@0x24)`, faction_state u16@0x04,
boats_count u8@0x14 (≤10), boats_array u32[≤10]@0x18; table @clientBase+0x41a368, max 600, wire 0xce44.

**Consumer (P0):** 0x0325 FUN_004ba2b0 case 0x325 / FUN_004b8b00 0xce44 (count<0x259, boats gate
`10<count` 0x7637f4); 0x30b case 0x30b / 0x6d64 (outer count <0xc9 = max 200, name<13 @0x762ea8);
model loader FUN_004dd6a0 (whole-file read, ext dispatch FUN_005de8a0 .mds / FUN_005de500 .mdx).
Faction from COMMANDER char (power@0x04 via FUN_004c32a0), NOT unit owner@0x10 (P3, unread as nation id).

**ADD recipe (Layer A — stats-only class reusing an existing model):**

0. **Current live gate:** `LOGH_STATIC_SHIPS=1` wires the populated 0x30b builder. Normal play sends the
   live-safe 19-row prefix because the real client currently stalls at 20+ rows; `LOGH_STATIC_SHIPS_LIMIT`
   and `LOGH_STATIC_SHIPS_ONLY` intentionally bypass that cap for RE isolation.
1. Append to `content/ship-stats.json .ships[]` (carries manual-grounded pools/_raw) and/or extend
   `SHIP_CLASSES` (adapter:135) for runtime fleet seeding. Note: SHIP_CLASSES hp/attack/defense are
   **P3 invented** and are NOT projected onto the 0x30b wire — `shipStatToUnitShip` pulls from
   ship-stats.json pools/_raw. Editing SHIP_CLASSES hp changes fleet seeding, not the client stat card.
2. `shipStatToUnitShip(entry, kind)` maps armor/shield/beam/gun/missile/AA/crew/cost/unitCount/speed
   onto the 0x30b slots; clamp name to 13 UCS-2.
3. 0x0325 fleet element: boats_array = member ship ids (≤10); one element/fleet with flagship@0x24 == unit.id@0x00.
4. Map the new kind → one of the 273 `data/model/Ship/*.mdx` (model-ship.json gives faction tags) so it renders.
5. Provenance: hull numbers P2, invented gameplay numbers P3.

**Blocked-on-RE:** brand-new 3D GEOMETRY (Layer B) — mdx/mds polygon mesh (descriptor[2..9]
vertex/face/UV arrays) NOT byte-mapped (only scene-graph/node directory decoded). Stats-only classes
reusing existing models are NOT blocked.

---

### 2.3 Galaxy

**Schema.** galaxy.json system = `{system, planets[{name,orbit}], fortresses, rect[4], page,
faction, cx, cy, in_iv_ex, is_corridor}` (NO grid/col/row — projection computed). 0x0313 object table:
`[u8 count][count × 3-byte records]` fixed 5004B; per object at index v (=cell value 3..88):
byte0=content-record id (resolved via FUN_00522010(0x18,byte0) → constmsg group-0x18 label),
byte1=object class (**ONLY ==3 placed as clickable marker**), byte2=sprite/color variant
(valid {0..6,8}; 8→stored class7 black hole). 0x0315 cell grid:
`[u8 w=100][u8 h=50][u16 BE rleByteCount]{[u8 run][u8 value]}…`, sum(run)==w*h, fixed 5004B.
0x031d StaticBase stride 0x3c (name ≤13, astronomy); 0x031f Base stride 0x180 max 4.

**Consumer (P0):** 0x0313 FUN_00413050 (count<0x65); 0x0315 RLE FUN_004abbb0; cell accessor
FUN_004c8b70; value-range gate FUN_004c8bc0 (`2 < v < 0x59`); placement FUN_004d3bd0 (byte1==3 gate,
byte2 variant, byte0→label). Builders: buildStaticInformationGridTypeInner (login-protocol.mjs:617),
buildStaticInformationGridInner (:555), buildStrategicGalaxyGrid (:706, caps systems.slice(0,85)).

**ADD recipe (Layer A):**

1. Append to `content/galaxy.json .systems[]` with cx/cy (manual-PDF page-101 frame; projection
   displayX=cy, displayY=cx), planets, faction. Add KO rows to `systems-ko.json` / `planets-ko.json`.
   No grid/col/row needed.
2. Marker auto-renders: buildStrategicGalaxyGrid assigns value 4+index, klass=3, variant=spectral slot.
   To LABEL it, set byte0 to a real constmsg group-0x18 subId **≥3** (subId 0..2 are grid-TYPE labels
   plasma-storm/space/non-navigable; a class-3 marker with byte0<3 renders a phantom grid-type label —
   `safeMarkerContentId` guard, login-protocol.mjs:612). Add a constmsg overlay row (Layer C) and join
   by name, or pass contentId explicitly.
3. Fortress: append to `content/fortresses.json` with `system` (name_ja join key); the projector
   (logh7-fortress.mjs:92) emits {value,contentId,klass:3,variant} on the next free object value (caller
   owns the shared 3..88 space, drops if >88).
4. Keep markers ≤85/board (value ≤88); fixed 5004B frames; enable via `LOGH_STRAT_GALAXY=1`.

**Known pre-existing bug to fix:** the spectral join (login-session.mjs:204-211) joins
stellarTypes[index] **positionally** to galaxy.json[index], but model-galaxy-stars.json index is
MAP-NODE order (79 rows vs 80 systems) — so spectral variants are mostly mis-assigned and system 79
gets null. Correct = derive a node→system mapping from Null_galaxy.mdx node positions vs galaxy.json cx/cy.

**Blocked-on-RE:** new 3D star/planet BODIES (Layer B MDX). Also unresolved: which byte2 icon slot
renders a FORTRESS sprite (needs live probe); the 6 `special_bodies[]` (bh_01..03/ns_01..03) are never
projected (the variant-8 black-hole path IS reachable via `strategicMarkerVariantForSystem`, but
dedicated special-body emission is unwired).

---

### 2.4 Nations / fleets / economy

**Schema.** NATION_META (server bookkeeping, P3): `{id(0x500/0x501/0x502), name, color(0/1/2),
budget(200k/180k/150k), capital}` — NOT a wire struct. In-world nation = InformationSessionPower
(FUN_004301d0, session sub-record): `power+0x28 u8 fleet_roster_count (gate <0xe ≤14)`,
`power+0x2a u16[≤14] fleet_roster`, `power+0x7d u8 leader_count (<3 ≤3)`, `power+0x80 parentage[≤3]
stride 0x84`, EXACTLY 2 powers/session. Economy = NotifyBaseParameter (FIXED 0x4a=74B, **NOT
dispatcher-routed** — server/debug serializer only): time@0, grid@4, base@8, budget_count@0xc (gate
<7 ≤6), budget[≤6]@0x10, population@0x28, food@0x40, etc. Economy reaches the panel via 0x031f /
0x1204, not NotifyBaseParameter.

**Consumer (P0):** lobby 0x2006 power FUN_00444900 (`while iStack_174 < 2` — exactly 2);
in-world FUN_004301d0; economy parse FUN_00438390 (budget gate <7). A separate record-family
power-count gate exists (`<0x41` ≤64, content-pack.mjs:18 MAX_NATIONS) distinct from the session-list's
hard "exactly 2."

**ADD recipe (Layer A):**

1. Edit NATION_META (adapter:148-152) — id/color/budget/capital (budget P3, not a wire cap).
2. Add fleets by appending characters (each → one unit in units[], adapter:308-325) with
   flagship@0x24==unit.id@0x00; OR populate the in-world ≤14-fleet roster — but **first build the
   missing emitter** for `@power+0x2a` / `@power+0x80` (FUN_004301d0 layout), which no server code writes.
3. Economy: append a system to `content/planet-economy.json`; `planetToBaseParameter →
   buildNotifyBaseParameterInner` emits the 0x4a record (budget ≤6).
4. Fortress: append to fortresses.json + place it as a galaxy.json marker.
5. **3rd faction (Phezzan etc.):** tag systems/characters with neutral 0x502; **never add a 3rd
   session power** — FUN_00444900's `<2` loop makes a 3rd playable belligerent impossible without Layer D.

**Blocked-on-RE:** the in-world InformationSessionPower nation-roster record (≤14 fleets, ≤3 leaders)
has its LAYOUT/caps fully RE-confirmed but **no server builder emits it**, and the exact PACKED wire
framing (it's a session sub-record, not a standalone case) is unwired — the one piece of fresh work
needed for national numbered fleets (per-character unit fleets already work via 0x0325).

---

### 2.5 Messages / strings

**Schema (HFWR, byte-exact, P0).** 16-byte header `[magic 0x52574648 'HFWR'][?][textPointerCount=
record count][offsetTableCount]`; offset table = offsetTableCount × u32 (entries are **record-index /
group boundaries, NOT byte offsets**), padded to `(count+3)&~3`; payloadOffset = 16 +
alignedOffsetTableCount*4; then textPointerCount NUL-terminated cp932/cp949 records back-to-back.
GFWR (g7sw) = 16B header (0x52574647) + UTF-16LE records. A `$token$` in a record is a server-fill
field (125 distinct tokens), not static text.

**Consumer (P0):** master loader FUN_00521dc0 (constmsg.dat, then messages_%d.dat ×9 group0,
messages_com_%d.dat ×2 group4, messages_tac group5); HFWR reader FUN_00522060 (magic check, return
0xfffffffe on mismatch); record pointer table FUN_00522235 (NUL-scan); String.txt FUN_004ea180.

**ADD recipe:**

- **EDIT existing record text (Layer B — TOOL EXISTS, safest).** Use
  `tools/logh7_msgdat_encode.py` (`localize_hfwr` / `build_hfwr`) — round-trip-proven byte-exact
  (a length-changing edit preserves count/magic/offset-table verbatim; offset table is record indices
  not byte offsets, so it is untouched). For KO: extend `content/localization/constmsg-ko.json`
  (currently **60** ids, 1281..3087) and apply each translation to its constmsg.dat slot.
- **ADD a new record id (genuinely unbuilt):** `build_hfwr` raises on count changes, so appending an
  id needs new packer code — append NUL-terminated record(s), bump textPointerCount@0x08 (+offsetTableCount@0x0C
  if crossing a group, ≤0xff/group), re-pad the offset table. A new id only works if the server/engine
  actually looks it up — record id = fixed semantic slot — so a truly new message usually **also needs
  a Layer-A server emit**.
- **UTF-8 / true Korean:** records are cp932/cp949 ANSI only; non-codepage text needs the **Layer-C
  text-shim DLL** (TextOutA/DrawTextA → MultiByteToWideChar(CP_UTF8) + CJK TTF).

(Verifier corrections folded in: encoder already exists — the "build logh7_msgdat_pack.py" claim is
dropped; KO overlay is 60 not 59; extracted records carry only `{id,encoding,text,tokens}` — byte
offset/length live only in the file-level layout object.)

---

### 2.6 Commands / personnel / ranks / posts / medals

**Schema.** Ranks: `rank u16` on char record (no client range check; 14-rung×2-faction ladder is
manual convention). Medals: `decoration_bits[16] @char+0x6c` = 128-bit field, **MSB-first per byte**
(serializer FUN_00419300 tests `(0x7f - uVar5)`). Personnel opcodes 0x0704-0x070b (6 inbound + 2
notifies). Strategic commands map onto **59 hardcoded Input_/Output_CommandXXX** classes, opcode↔class
baked into FUN_004ba2b0 + FUN_004b8b00.

**Consumer (P0):** RankUp FUN_0043c300 (CSV split, move_character ≤32 @0x7658f8); live action-list
FUN_004c0400 (count @rec+0x250, rows @rec+0x258 stride 8, re-request 0x356); CardAppointment apply
FUN_004c5580 (seat @iVar1+0x274+count*8, ≤16).

**ADD recipe (Layer A — ranks/posts/medals are pure content; client just renders what the server sends):**

1. Rebalance an existing command: edit cost_cp/wait/exec/effect in command-engine/personnel keyed by
   the existing opcode (strategy-commands.json is documentation). No client change.
2. Ranks: edit `content/roster/ranks.json`; server writes rank u16 onto 0x0323.
3. Org-posts: edit `content/manual/org-posts.json`; appointment (0x0707)/dismissal (0x0708) validated
   server-side against capacity + min/max_rank.
4. **Medals:** edit `content/roster/medals.json`; set decoration bit @char+0x6c. **Use MSB-first
   mapping** — seed via `body[(0x7f-bit)>>3] |= 1<<((0x7f-bit)&7)`, NOT a naive `1<<bit` (that lights the
   wrong medal). Stay within bits 0-127 (52 used). New icon art = Layer B (m_fNNN.tga under data/image/Medal/).
5. Respect move_character ≤32, card seats ≤16, roster ≤64.

**NOT data-addable — a new command VERB needs Layer D:** 59 hardcoded CommandXXX classes, each with a
fixed opcode wired into the dispatcher/size tables + its own compiled parser. There is no command table
loaded from a file; you can re-parameterize an existing command's effect (A) but not introduce a 60th opcode (D).

(Verifier note: medal name_ja strings resolve in content/client/msgdat.json + logh7-content.db, NOT in
dat-tables.json — that file is a per-FILE summary with no string-id map.)

---

### 2.7 Scenarios / sessions

**Schema.** Session row: `{sessionId:u16, sessionName ≤13, status 1|2, beginDay ≤65, term:u32,
ending 0|1, powers:[{id,superMan ≤13,d0,d1,d2}×2]}`. Per-session world content-pack: `{name,
nations[≤64], units[≤600], characters, fleets[≤14/nation]}` with char.power/camp/spot setting faction
+ char.flagship==unit.id. World-clock factory `createScenarioState({...})` (default 'LOGH VII'/796/2 powers).

**Consumer (P0):** 0x2006 picker FUN_00444900 (count <0x41 ≤64; `while < 2` exactly 2 powers;
session_name <0xe; begin_day <0x42; super_man <0xe; payload FIXED 0x5304 zero-padded); world handoff
0x2009 → [base+0x35f144 IP / +0x35f148 port / +0x35f14c token].

**ADD recipe (Layer A):**

1. Add rows to `DEFAULT_SESSIONS` (auth-server.mjs:59) or pass `sessions:[...]` /
   `worldBySession` to `startLogh7AuthServer`. status 1|2 = selectable. ≤64 rows, names ≤13, beginDay ≤65,
   exactly 2 power slots. The builder **throws on every cap violation** (scenario-session.mjs:189-239),
   so a server-authored scenario CANNOT emit a payload that bails the client.
2. Author the start setup as a content-pack (validate via `createContentPack` — mirrors client caps,
   fails fast): nations (2 powers, Phezzan neutral), fleets/units (≤600, boats ≤10), per-char
   power/camp/spot for faction + territory.
3. Wire `worldBySession[sessionId] = {ip,port,token}` so selecting the row (0x2009) routes to the world.
4. `buildInformationSessionInner({sessions})` already emits the byte-correct 0x5304 payload
   (oracle-tested, 13/13). Verify live: stop→start(login)→trace 0x2006→ui_explorer click.

**Blocked-on-RE:** richer faction OOB in the LOBBY ROW (per-nation fleet roster u16[≤14] @power+0x2a,
leaders[≤3] @power+0x80) is INERT — the current packed power body packs only `[id][d0][d1][d2]+super_man+
zero-ending`; the roster/leaders wire layout inside FUN_00444900's SEEK_CUR reads is not pinned. In-world
start setups (fleets/territory via 0x0313/0x0315/0x0323/0x0325) are NOT blocked. 3rd playable belligerent = D.

---

### 2.8 Institutions / facilities / rooms / items / decorations

**Schema (P0 layout; institution/spot scalar NAMES PROVISIONAL).** 0x0321
ResponseInformationInstitution = FIXED 0x8DE4 (36324B): count (≤4) + 4 outer slots stride 0x2378
(B+0x00 base-spot-id, B+0x04 institution_count ≤36, B+0x08 institution[j] stride 0xfc); institution J:
J+0x00 u16 (likely facility-name catalog id), J+0x04 u32, J+0x08 spot_count ≤20, J+0x0c spot[k] stride
0xc; spot S: S+0x00 u16 (room-name catalog id), S+0x04 u32, S+0x08 u16 (likely access-state 0-7).
0x0327 Warehouse FIXED 0x300/768B (ships ≤99 @0xe stride6, troops ≤24 @0x262, supplies/food/mineral).
0x0329 Package FIXED 0x154/340B (other_package ≤3, troop_package ≤24).

**Consumer (P0):** 0x0321 FUN_004ba2b0 case 0x321 (copies 0x2379 dwords; caps 0x763504 ≤4 / 0x7634a8
≤36 / 0x763460 ≤20); parsers FUN_004167f0 + FUN_00416bd0; world-import FUN_004c4170. Decoration:
FUN_00419300 over 128 bits @0x6c (MSB-first). Warehouse FUN_0041a870; Package FUN_0041b280 (both with
HIGH-confidence names from compiled dump serializers).

**ADD recipe (Layer A):**

1. Add institution + room entries to the content pack (institutions[]/rooms[] via inferred catalogs,
   threaded login-session.mjs:753). Set `nameCatalogId` to an existing constmsg/msgdat label id
   (~2300-2453 block) so the client shows a real name; a NEW name = add a constmsg label first (A/C).
2. Build the per-base record via `buildInstitutionSeedElements` / `buildResponseInformationInstitutionInner`,
   clamping ≤4 bases / ≤36 inst / ≤20 spots (builders already `.slice()` to these).
3. **Decorations:** set the 16-byte decoration_bits @0x6c, **MSB-first** (`(0x7f-bit)` mapping), for each
   medals.json `bit` held (≤51 used). Wire into the 0x0323 builder (currently zeroed, personnel.mjs:536).
4. Warehouse/package items: pass ships/troops/other/troop arrays within caps 99/24/3/24 + supplies/food/
   mineral to the warehouse/package builders — P3 procedural seed (no original source).

**Caveats:** institution/spot scalar field SEMANTICS are PROVISIONAL — a wrong scalar renders a
blank/garbled panel but does NOT crash (offsets/strides P0). Decoration + warehouse/package NAMES are
HIGH-confidence (labeled serializers). **Special-ability id→name table does not exist** (0 enum;
only scattered msgdat labels) — keep special_ability count 0 until an id→name catalog is mined.

**Blocked-on-RE:** byte-correct facility content (which scalar is facility-kind vs name-catalog-id vs
access-state) needs a live A/B trace of 0x0321 (req 0x0320). Special abilities by name need an id→name
catalog mined from the client. Decorations + warehouse/package names NOT blocked.

---

### 2.9 Assets (audio / models / textures / UI)

**Schema.** WAV = RIFF/WAVE PCM (fmt cksize 0x10..0xFF). OGG = real Ogg/Vorbis. Sound enum→path table
= FIXED 20-entry × 0x100 ASCII path array in EXE .data 0x0076cd90..0x0076e090 (7 ogg + 13 wav,
enum=slot index). MDX/MDS = memory-image scene-graph: header 10 descriptor pairs; descriptor[0].count =
node count (decoded); named node directory @0x58 stride 0xE8 (foff = ptr - desc0.ptr + 0x58, 418/418);
descriptor[2..9] = geometry/surface arrays (NOT byte-mapped = mesh gap). Textures = BMP/TGA (D3DX8
content-magic dispatch). Dialogs = RT_DIALOG/RT_MENU/RT_STRING in PE .rsrc.

**Consumer (P0):** WAV FUN_00621ef0 (magics + gate 0xf<cksize<0x100); OGG FUN_00622f20 (Vorbis check,
0xffffff7c on mismatch); model FUN_004dd6a0 (whole-file read, ext dispatch FUN_005de8a0/.mds,
FUN_005de500/.mdx); texture D3DX8 (GetImageInfo content-driven); dialog DialogBoxParamA (IAT 0x0075be78).

**ADD recipe (Layer B — drop-in, READY):**

1. **Audio:** drop a replacement .ogg (Ogg/Vorbis stereo 44.1k) / .wav (RIFF/WAVE PCM, fmt cksize
   <0x100) over `data/sound/{BGM,SE}/<exact-name>`. Keep the baked filename.
2. **Textures:** drop a pow2 BMP/TGA/PNG/DDS over `data/model/images/{Lo,Mid,Hi}/<exact-name>` —
   format free (content-magic dispatch), filename unchanged.
3. **Model scene-graph swap:** edit/replace an existing .mdx/.mds preserving descriptor[0].count ==
   0xE8-stride node count.

**Layer D (not loose-file):** adding a NEW sound enum slot (extend the 20-entry 0x100 path table) or
editing dialogs (PE .rsrc via ResHacker, SHA-pin + backup).

**Blocked-on-RE:** NEW 3D model GEOMETRY — descriptor[2..9] vertex/face/UV arrays not byte-mapped.
Next step: decompile the caller-chain into FUN_004d3bd0 + FUN_005de500/FUN_005de8a0 to see how each
node's geometry ptr+count walks into D3D8 CreateVertexBuffer/SetStreamSource, then byte-map descriptor[2].
Audio, textures, dialogs are NOT blocked.

---

## 3. What blocks fuller content modding

| # | Blocker | Affects | Next concrete RE step |
|---|---|---|---|
| 1 | **MDX/MDS polygon mesh** (descriptor[2..9] vertex/face/UV arrays not byte-mapped) | new 3D ships, planets, galaxy bodies | Decompile FUN_004d3bd0 + FUN_005de500/FUN_005de8a0 caller-chain → trace node geometry ptr+count into D3D8 CreateVertexBuffer/SetStreamSource, then byte-map descriptor[2] surface records |
| 2 | **Client-hardcoded command opcodes** (59 CommandXXX classes, opcode↔class baked into FUN_004ba2b0/FUN_004b8b00) | any brand-new command verb | Layer D: patch dispatcher + size tables to register a new code, author Input_/Output_ parser in the binary (avoid — re-use an existing opcode) |
| 3 | **u16 non-ASCII character-name encoding** (cp932/UCS-2 path unresolved) | non-ASCII display names ship as romaji/placeholder; `maskCanonNames` defaults true | Pin the u16 name write/read path in the 0x0323 char-create flow against the client name parser |
| 4 | **In-world InformationSessionPower roster emitter UNBUILT** (≤14 fleets @power+0x2a, ≤3 leaders @power+0x80; layout RE-confirmed) | per-nation numbered fleets at the national/lobby layer | Pin the PACKED wire framing inside FUN_00444900's SEEK_CUR reads; build the server emitter |
| 5 | **0x30b ship-class master is a zero-stub** (builder exists, not wired) | seeded ship classes never reach the client | Replace the WORLD_RESPONSE_OBJECT_SIZES 0x030b stub (login-protocol.mjs:1239) with the populated `buildUnitShip` builder |
| 6 | **0x0321 facility scalar semantics PROVISIONAL** (which scalar = name-id vs facility-kind vs access-state) | byte-correct facility/room content (wrong scalar = blank panel, no crash) | Live A/B trace of 0x0321 (req 0x0320) to pin J+0x00/J+0x04/S+0x00/S+0x04/S+0x08 |
| 7 | **special_ability id→name catalog does not exist** (0 enum) | adding special abilities by name (keep count 0 today) | Mine an id→name table from the client (only scattered msgdat 特殊技能/特殊能力 labels exist) |
| 8 | **Spectral join bug** (positional stellarTypes[index]↔galaxy.json[index], 79 vs 80, map-node order) | strategic-map star colors mostly mis-assigned | Derive a node→system mapping from Null_galaxy.mdx node positions vs galaxy.json cx/cy before assigning byte2 |
| 9 | **Sound enum→path binder loop bound INFERRED** (not decompiled) | adding a NEW sound slot (replacement is fine) | Decompile the binder that immediates 0x0076cd90 and walks stride 0x100 to find the table bound |
| 10 | **Lobby-row per-nation fleet roster wire UNPINNED** | richer faction OOB in the session picker row | Pin the roster/leaders region against FUN_00444900's actual SEEK_CUR reads |

---

## 4. Ready to build now (ordered content-add tooling)

1. **Mod loader + cap validator** — `mods/<mod>/{content,scenarios,localization,assets}/` loader with a
   JSON-schema cap validator mirroring docs/logh7-data-structures-re.md §3 (names ≤13, ≤600 units, ≤14
   fleets, ≤4 base elems, 2 powers, ≤16 cards, ≤80 special_ability, ≤64 sessions, flagship==unit.id).
   Highest leverage: turns every Layer-A add into validated, cap-safe content. (Build-order item 1 in
   current architecture note; not yet rebuilt in the new pipeline.)
2. **0x30b ship-class wiring** (blocker #5) — replace the zero-stub with `buildUnitShip`; unblocks all
   stats-only ship classes reaching the client. Small, self-contained.
3. **TCF packer + atlas-expand** — `tools/logh7_tcf_pack.py` (inverse of logh7_tcf_decode.py:
   64×80 PNG → 256-color palette → 18B header + bottom-up indices → rebuild tcf.hed), round-trip-verified;
   plus `tools/client_patches/face-atlas-expand.json` (Layer D) only when exceeding oem199/oam95/o99.
4. **Texture pipeline** — pow2 PNG/BMP/TGA→DDS batch over data/model/images/{Lo,Mid,Hi} (pure Layer B
   drop-in, content-magic dispatch; no client change). Lowest risk.
5. **Scenario + roster editors** — JSON authoring UI over DEFAULT_SESSIONS / worldBySession +
   character-roster.json / ship-stats.json / galaxy.json, emitting through the existing
   buildInformationSessionInner + content-pack path with the cap validator from #1.
6. **Localization packer** — already partly exists (`tools/logh7_msgdat_encode.py` edits existing ids,
   round-trip-proven). Extend with: (a) constmsg-ko.json batch apply, (b) an add-new-id mode (bump
   textPointerCount/offsetTableCount), (c) the Layer-C UTF-8 text-shim for true-Korean glyphs.
7. **In-world nation fleet-roster emitter** (blocker #4) — once the FUN_004301d0 packed framing is
   pinned, build the ≤14-fleet / ≤3-leader emitter for national numbered fleets.

---

### Provenance reminder

Real portrait pixels, in-game string-table names, and model scene-graphs are **P1**. Wire layouts/caps
are **P0**. Everything reconstructed — roster names/stats, galaxy coords, fortress stats, planet
economy, scenario OOB, gameplay hp/attack — is **P2/P3** and the original LOGH VII *server* data is
**lost-original**. Never relabel P2/P3 as original server data.
