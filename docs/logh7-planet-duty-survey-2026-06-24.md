# LOGH VII — Planet Interiors & Duty Cards Survey (2026-06-24)

> **Scope:** In-planet / facility interior locations (행성 내 장소) + Duty cards (직무카드 / 職務カード)
> **Method:** Read/Grep/Glob/Bash across codebase + extracted assets. No code written.
> **Sources:** Server modules, MsgDat/constmsg JSON, binary strings, UI reference docs, asset manifests.

---

## 1. Duty Cards (직무카드 / 職務カード)

### 1.1 What Are They
The right-side panel shown when a unit is selected on the strategic map. Displays:
- Held card count (e.g. "소지 13매")
- Card name (직무: 개인/작전/군무상서)
- Canon description (appointment authority, role summary)
- Command grid (커맨드 그리드): 이동·작전계획·퇴역/참가·첩보/지원·망명·상금투입/설득·반란·사임/체포허가·임명·승진·파면/특별경비·연료보급 + 명령·제안

### 1.2 Server Opcodes (IMPLEMENTED)

| Direction | Code | Name | File | Status |
|-----------|------|------|------|--------|
| C->S | 0x0704 | CommandRankUp | `server/src/server/codec/personnel-records.mjs:39` | ✅ Implemented |
| C->S | 0x0705 | CommandSpeciallyRankUp | `server/src/server/codec/personnel-records.mjs:40` | ✅ Implemented |
| C->S | 0x0706 | CommandRankDown | `server/src/server/codec/personnel-records.mjs:41` | ✅ Implemented |
| C->S | 0x0707 | CommandCardAppointment | `server/src/server/codec/personnel-records.mjs:42` | ✅ Implemented |
| C->S | 0x0708 | CommandCardDismisal | `server/src/server/codec/personnel-records.mjs:43` | ✅ Implemented |
| C->S | 0x0709 | CommandCardResignation | `server/src/server/codec/personnel-records.mjs:44` | ✅ Implemented |
| S->C | 0x070a | NotifyCardLoss | `server/src/server/codec/personnel-records.mjs:46` | ✅ Implemented |
| S->C | 0x070b | NotifyCardLossMovedSpot | `server/src/server/codec/personnel-records.mjs:47` | ✅ Implemented |
| S->C | 0x0356 | NotifyInformationCharacter | `server/src/server/codec/personnel-records.mjs:48` | ✅ Implemented |
| S->C | 0x0358 | NotifyChangeFlagShip | `server/src/server/codec/personnel-records.mjs:49` | ✅ Implemented |
| C->S | 0x034e | RequestCardCharacter | `server/src/server/logh7-login-session.mjs` | ✅ Implemented |
| S->C | 0x034f | ResponseCardCharacter | `server/src/server/logh7-info-records-static.mjs` | ✅ Implemented |

**Personnel domain engine:** `server/src/server/logh7-personnel.mjs` — `createPersonnelState()` + `processPersonnel()`
**Wire codec:** `server/src/server/codec/personnel-records.mjs`
**Command routing:** `server/src/server/logh7-command-engine.mjs` (PERSONNEL_CODE_LO = 0x0704 .. HI = 0x0709)

### 1.3 Seat / Action List Mechanics (IMPLEMENTED)
- `MAX_SEATS_PER_OUTFIT = 16` (`personnel-records.mjs:62`)
- Seat entries stored at character record offset 0x250 (stream position in 0x0356 builder)
- Each seat: `{character: u16, role: u32}` (8 bytes)
- Client apply: FUN_004c5580 appends seat entry to unit+0x274, bumps unit+0x270
- Client remove: FUN_004c0670 removes from seat array

### 1.4 MsgDat Strings (EXTRACTED)
- **Appointment:** "특정 인물에게 새로운 직무 권한을 부여합니다.\n소비 MCP160..." (`msgdat-full.json:1031`)
- **Dismisal:** "특정 인물을 임의의 직무에서 해임합니다.\n소비 MCP160..." (`msgdat-full.json:1036`)
- **Resignation:** "해당 직무 권한을 포기합니다.\n소비 MCP80..." (`msgdat-full.json:1041`)
- **Card list label:** "자신이 소유한 직무 권한 카드 목록" (`msgdat-full.json:1501`)
- **Command list label:** "전략용 직무 권한 커맨드 목록" (`msgdat-full.json:1491`)
- **Facility chief:** "시설부장" (`msgdat-full.json:2446,2756`)
- **Rank descriptions:** 40+ entries for empire/alliance ranks with appointment authorities (`msgdat-full.json:3201-4016`)

### 1.5 TGA Texture Assets (FOUND in installed client)
- `data/image/shokumu_card/shokumu_meirei_teikoku.tga` — Empire command card texture
- `data/image/shokumu_card/shokumu_meirei_doumei.tga` — Alliance command card texture
- `data/image/shokumu_card/shokumu_shokumu_teikoku.tga` — Empire duty card texture
- `data/image/shokumu_card/shokumu_shokumu_doumei.tga` — Alliance duty card texture
- `data/image/shokumu_card/shokumu_parts_1.tga` — Card parts texture 1
- `data/image/shokumu_card/shokumu_parts_2.tga` — Card parts texture 2
- `data/image/icon_*/shokumu.tga` — Icon variants (down/kj/kj_d/mover/normal)

**Location:** Present in `.omo/work/logh7-installed/data/image/shokumu_card/` and `client/vendor/logh7-installed/`

### 1.6 Client Render Chain (RE-VERIFIED)
```
FUN_004b68f0 (mode dispatcher)
  -> FUN_0054e570 (panelKind switch: 1=char, 2=unit, 3=base)
    -> FUN_004ff3c0 (panelKind==2, unit panel setup)
      -> FUN_004fc4e0 (param_2 != 0 gate)
        -> FUN_004f6040 (creates panel type 0x67)
          -> FUN_004f68f0 (fills rows reading PLAYER_INFO+0x270)
```
- **officerCount** at 0x0323 offset 0x93 -> copied to PLAYER_INFO+0x270 by FUN_004c2c80
- Server fix already applied: `buildInformationCharacterRecordInner` writes non-zero officerCount
- **1st blocker:** Texture assets MISSING from playable client (need to copy from installed)
- **2nd blocker:** C002 mode/owner gate may still prevent dequeue (see `logh7-c002-this-correction-2026-06-22`)

### 1.7 Implementation Status: MOSTLY DONE
- ✅ Wire protocol: all 10 opcodes implemented with byte-exact builders
- ✅ Server domain: personnel state + command validation + broadcast notifies
- ✅ MsgDat strings: Korean translations present in `content/extracted/msgdat-full.json`
- ✅ TGA textures: exist in installed client, need deployment to playable
- ⚠️ Client render: blocked by C002 mode gate + possible texture deployment gap
- ⬜ Live verification: pending (needs C002 unblock + texture copy)

---

## 2. In-Planet / Facility Interior Locations (행성 내 장소)

### 2.1 What Are They
The bottom-right "facility interior" panel (施設内ロビー) showing sub-locations within a planet/base:
- **旗艦桟橋** (Flagship Pier)
- **航路管理センター** (Route Control Center)
- **執務室** (Executive Office) — per-rank variants
- **拠点選択** (Base Selection) — info panel with faction/economy data
- **警戒ロビー / 自由ロビー** (Alert Lobby / Free Lobby)

### 2.2 MsgDat Strings (EXTRACTED)

| Japanese | Korean | Location in msgdat-full.json |
|----------|--------|------------------------------|
| 旗艦桟橋 | (not found in ko) | `client/msgdat.json:9274` |
| 航路管理センター | (not found in ko) | `client/msgdat.json:9270` |
| 警戒ロビー | 경계 로비 | `msgdat-full.json:12221` / `constmsg-ko.json:2310` |
| 自由ロビー | 자유 로비 | `msgdat-full.json:12226` / `constmsg-ko.json:2311` |
| 執務室 (multiple) | 집무실 | `msgdat-full.json:12706` ("시설부장 집무실") |
| 皇帝執務室 | (not found) | `client/msgdat.json:9338` |
| 帝国軍最高司令官執務室 | (not found) | `client/msgdat.json:9342` |
| 幕僚総監執務室 | (not found) | `client/msgdat.json:9346` |
| ... 40+ office variants | (partial) | `client/msgdat.json:9338-9470` |

**Note:** The full list of 40+ Japanese office names exists in `content/client/msgdat.json` (indices 9338-9470) but most lack Korean translations in `constmsg-ko.json`. Only "시설부장 집무실" (facility chief office) has a Korean entry.

### 2.3 Server Opcodes for Facility Data (IMPLEMENTED)

| Code | Name | File | Purpose |
|------|------|------|---------|
| 0x031f | ResponseInformationBase | `server/src/server/codec/base-record.mjs` | Base defense/development/ownership scalars |
| 0x0321 | ResponseInformationInstitution | `server/src/server/codec/institution-record.mjs` | Facility list (institution[] + spot[] nested) |
| 0x0320 | RequestInformationInstitution | `server/src/server/logh7-login-session.mjs` | C->S request for 0x0321 |
| 0x031c | RequestStaticInformationBase | `server/src/server/logh7-login-session.mjs` | C->S request for 0x031d |
| 0x031d | ResponseStaticInformationBase | `server/src/server/logh7-login-protocol.mjs` | Static base data (name, position, etc.) |

**Institution record:** 0x8DE4 bytes fixed, nested structure:
- Outer: up to 4 elements (base spot-ids)
- Each element: up to 36 institutions
- Each institution: up to 20 spots

**Builder:** `server/src/server/codec/institution-record.mjs` — `buildResponseInformationInstitutionInner()`

### 2.4 Facility Construction / Management Commands (IMPLEMENTED)

| Code | Name | Description | File |
|------|------|-------------|------|
| 0x0900 | CommandMakePlan | 시설 건설 (facility construction) | `server/src/server/logh7-strategy.mjs` |
| 0x0901 | CommandWithdrawalPlan | 시설 휴지 (facility suspension) | `server/src/server/logh7-strategy.mjs` |
| 0x0902 | CommandAnnouncement | 시설 재가동 (facility restart) | `server/src/server/logh7-strategy.mjs` |
| 0x0903 | CommandCreateOutfit | (outfit creation) | `server/src/server/logh7-strategy.mjs` |
| 0x0904 | CommandDeleteOutfit | (outfit deletion) | `server/src/server/logh7-strategy.mjs` |

**MsgDat strings:**
- "시설 건설\n생산, 방위 등의\n각 시설을 건설합니다" (`msgdat-full.json:1161`)
- "시설 휴지\n시설의 가동을\n일시적으로 휴지합니다" (`msgdat-full.json:1166`)
- "시설 재가동\n휴지 중인 시설의\n가동을 재개합니다" (`msgdat-full.json:1171`)
- "시설 파기\n시설을 파기합니다" (`msgdat-full.json:1176`)

### 2.5 Espionage / Facility Interaction (IMPLEMENTED)

| Code | Name | Description | File |
|------|------|-------------|------|
| 0x0f0b-0x0f1e | Social domain | SpotChat, SpotUnicastChat | `server/src/server/logh7-social.mjs` |
| (internal) | infiltrate | 시설 spot 잠입 | `server/src/server/logh7-espionage.mjs:112` |
| (internal) | intelOp | 시설 정보 절취 | `server/src/server/logh7-espionage.mjs:125` |
| (internal) | sabotage | 잠입 시설 시한폭탄 | `server/src/server/logh7-espionage.mjs:138` |

**MsgDat strings:**
- "특정 시설 내의 스폿에 잠입합니다." (`msgdat-full.json:1381`)
- "특정 시설에서 얻은 정보를 획득하여 본국에 송신합니다." (`msgdat-full.json:1391`)
- "잠입한 전략 시설에 시한폭탄을 설치합니다." (`msgdat-full.json:1396`)
- "행성/요새상의 시설 간을 이동합니다." (`msgdat-full.json:1416`)
- "시설 내의 스폿 간을 이동합니다." (`msgdat-full.json:1421`)

### 2.6 Implementation Status: PARTIALLY DONE
- ✅ Wire protocol: 0x031f/0x0321/0x031d base/institution records implemented
- ✅ Server domain: facility construction (0x0900-0x0904), espionage (infiltrate/intel/sabotage)
- ✅ MsgDat strings: facility construction + espionage commands translated to Korean
- ⚠️ **Interior location names:** 40+ Japanese office names (執務室 variants) NOT translated to Korean
- ⚠️ **Facility interior UI:** No dedicated server opcode for "facility interior scene" — appears to be client-side UI driven by 0x0321 institution data + constmsg strings
- ⬜ **Base Selection panel (拠点選択):** Server data exists (0x031f/0x0321) but client render path for stay.jpg panel not fully verified
- ⬜ **Lobby types (警戒ロビー/自由ロビー):** Only 2 Korean labels found; full facility type catalog may be incomplete

---

## 3. Cross-Cutting Issues

### 3.1 C002 Blocker
Both duty cards AND facility interior navigation depend on the strategic map unit selection -> command window flow (C002). Current status:
- event-9 enqueue works (552 occurrences in live probe)
- dequeue fails due to mode mismatch (mode2 enqueue vs mode0 consume)
- **Workaround:** `/grid <cell>` chat fallback for server-authoritative move (implemented)
- **Real fix:** Needs mode2->0 transition or clean C002 sequence

### 3.2 Texture Asset Gap
- `shokumu_card_*.tga` files exist in installed client but may not be in playable build
- Need to verify: `client/vendor/logh7-installed/data/image/shokumu_card/` vs `.omo/work/logh7-ko-overlay/`

### 3.3 Korean Translation Gap
- Facility interior location names (40+ 執務室 variants) have NO Korean translations
- Only "시설부장 집무실" (facility chief office) is translated
- "경계 로비" / "자유 로비" are the only lobby types with Korean labels

---

## 4. Checklist

### Duty Cards
- [x] Server opcodes identified (10 codes, 0x0704-0x0709/0x070a-0x070b/0x0356/0x0358/0x034e-0x034f)
- [x] Wire builders implemented and byte-verified
- [x] Personnel domain engine (createPersonnelState + processPersonnel) implemented
- [x] Seat/action list mechanics (MAX_SEATS=16, offset 0x250) implemented
- [x] MsgDat strings extracted (appointment/dismisal/resignation descriptions + rank blurbs)
- [x] TGA texture assets located in installed client
- [ ] TGA textures deployed to playable client build
- [ ] Live verification (blocked by C002)

### Facility Interiors
- [x] MsgDat strings extracted (facility construction, espionage, lobby types)
- [x] Server opcodes identified (0x031f/0x0321/0x031d for base/institution data)
- [x] Institution record builder implemented (0x8DE4 nested structure)
- [x] Facility construction commands implemented (0x0900-0x0904)
- [x] Espionage domain implemented (infiltrate/intel/sabotage)
- [ ] 40+ Japanese office names translated to Korean
- [ ] Facility interior UI render path verified live
- [ ] Base Selection panel (拠点選択) render verified

---

## 5. References

- `docs/logh7-original-ui-reference-2026-06-23.md` — UI screenshot catalog (uu3.jpg = office + cards)
- `docs/logh7-ui-card-mdx-investigation-2026-06-23.md` — Card render root cause analysis
- `docs/logh7-c002-this-correction-2026-06-22.md` — C002 mode/owner gate correction
- `server/src/server/codec/personnel-records.mjs` — Full wire codec
- `server/src/server/logh7-personnel.mjs` — Domain engine
- `server/src/server/codec/institution-record.mjs` — Facility record builder
- `content/extracted/msgdat-full.json` — All Korean UI strings
- `content/client/msgdat.json` — All Japanese UI strings (untranslated)
- `content/localization/constmsg-ko.json` — Korean constmsg overlay (only 2 lobby types)
