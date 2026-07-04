# LOGH VII Manual — Canon Game-Design Reference (P1)

**Data grade: P1 (official gin7 manual, 101 pages).** Every number, threshold, and table below is sourced from the official *Legend of the Galactic Heroes VII* (銀河英雄伝説VII) manual with page citations. Where a value was lost or scrambled by PDF/OCR extraction it is flagged **(extraction-uncertain)**. Where the original game shipped a feature unimplemented, the manual's own "現在未実装" note is preserved.

Canonical Japanese terms are kept with an English gloss on first use, since the server wire records and content packs key off the original terms.

---

## 1. Overview, Sessions & Victory (pp. 9–13)

### 1.1 Two-mode game structure (p9, p12)
LOGH VII is split into two modes that run on **one shared clock**:
- **Strategy Game (戦略ゲーム)** — national administration (国家経営), production (生産), military movement, personnel (人事), and ordinary character movement. (p12)
- **Tactical Game (戦術ゲーム)** — fleet battle (戦闘) and planet occupation (惑星占領). (p12)

The tactical game is **triggered** by entering the same grid as an enemy-force unit, and **ends** when only one faction's units remain. (p12) Planet/fortress grids additionally require full occupation before the battle ends (see §6.1). A character inside a tactical game **cannot input any strategy command** for the duration. (p12)

### 1.2 Victory requires more than military force (p9)
You must beat the enemy in direct combat, but final victory is impossible without non-military attention. National administration and military spending are funded by **taxes collected from each planet (各惑星から徴収する税金)** — so economy management is critical. **The original left economy-related features unimplemented (経済関連は現在未実装).** (p9)

Logistics: repeated battles damage ships (艦艇) and deplete materiel (物資), so **rear-area transport (後方からの輸送)** sustains the front. (p9)

### 1.3 Player role & progression (p9)
The player is **one appearing character (1登場キャラクター)** in the LOGH world. You climb rank (階級) by accumulating **merit/achievement (功績)** in both strategic and tactical play, take key posts (要職), and contribute to your faction's win.

**Faction abbreviations (p9):** 銀河帝国 (Galactic Empire) → 「帝国軍」(Imperial forces); 自由惑星同盟 (Free Planets Alliance) → 「同盟軍」(Alliance forces).

### 1.4 Sessions (p10)
- A **Session (セッション)** is the shared virtual space for all users on one host. All commands are **processed server-side (authoritative)** and results returned. (p10)
- **Max players per session = 2000.** (p10)
- **Real-time progression at 24× real time (実時間の24倍).** (p10)

| Real time | In-game time |
|---|---|
| 1 sec | 24 sec |
| 1 min (60 s) | 24 min |
| 1 hour (60 min) | 24 hours = 1 in-game day |
| 24 hours | 24 days |
| 30 hours | 30 days = 1 month (1ヶ月) |

Tactical battles run concurrently on this clock — **no global pause** for other players. (p10)

**Session re-entry restriction (復帰制限) on exclusion/death (p10):** When re-registering to the same session, (1) you **cannot use an original (canon) character**, and (2) you may only return to the **faction you belonged to at the moment of exclusion**.

**Session termination & restart (p10):** A session auto-ends when a win/loss condition is met, then **as a rule restarts from initial conditions**.

### 1.5 Character types (p11)
- **Original Character (オリジナルキャラクター)** — appeared in the source work; **parameters pre-set**.
- **Generate Character (ジェネレートキャラクター)** — player-created within rule limits; free name and face CG (顔CG).
- Unchosen canon characters are AI-controlled. **AI functionality was unimplemented in the original (AI機能は現在未実装).** (p11)

**Original-character assignment (p11):**
- Eligibility review (担当条件の審査) at session start and mid-session join; each canon character has **per-character unlock conditions**.
- Contested picks resolved by **lottery (抽選)**.
- Original characters **cannot be carried over at all** (session-bound).
- Selecting an original character **consumes fame points** (see §5.2). (p34)

**Generate-character inheritance (p11):**
- Normally session-bound; **exception**: a character that earned ≥ a threshold of **evaluation points (評価ポイント)** can carry over to the next session.
- Carried over: **age (年齢), each parameter, and rank (階級)**.
- **Hard age cap on inheritance = 60 years.**

**Generate-character deletion (p12)** — allowed only when **ALL** hold:
1. Rank ≤ **Colonel (大佐以下)**.
2. In own room in residential quarter (居住区) or hotel.
3. No active **persistent command** such as **燃料補給 (refuel)** or **戦略索敵 (strategic recon)**.

### 1.6 Win/loss conditions (p12–13)
The game ends and is evaluated when **any one** of these is met (p12):
1. An enemy **capital planet (首都惑星)** is occupied.
2. A regular-army faction's controlled systems (incl. **capital system 首都星系**) drop to **≤ 3 systems**.
3. Neither of the above by **00:00 on 27 July, Universal Calendar year 801 (宇宙暦801年7月27日)**.

**Four evaluation tiers** (each awards different end-of-session merit 功績 points):

| Tier | Conditions |
|---|---|
| **Decisive Victory (決定的勝利)** | ALL of: pop ≥ 90% of in-session population; ship-unit ratio ≥ 10× enemy; **no coup (クーデター)** at session end; (Empire only) a holder of the **Emperor (皇帝)** or **Imperial Supreme Commander** card has moved to the **enemy capital system** (p12–13) |
| **Limited Victory (限定的勝利)** | Victory achieved but **≥ 1 Decisive condition unmet** (p13) |
| **Local Victory (局地的勝利)** | Session ended by means other than capital capture, AND your in-session population exceeds enemy's. **Population tie → Local Victory for the Alliance.** (p13) |
| **Defeat (敗北)** | Inferior in all victory conditions (p13) |

---

## 2. Characters & Parameters (pp. 14–18)

### 2.1 Parameter set (p14–15)
Descriptive fields, progression fields, and the 8 ability stats. Strengthened by accumulating experience. *(Maps to the 0x0323 character record schema.)*

**Descriptive fields (p14):**

| Field | Notes |
|---|---|
| 氏名 (name) | Generate chars choose freely; **global name uniqueness enforced** |
| 性別 (sex) | **Purely cosmetic** — no post or ability difference between male/female |
| 生年月日 (birthdate) | Stored once; displayed in 帝国歴 (Empire) or 宇宙歴 (Alliance) by faction |
| 分類 (classification) | Enum **{政治家 politician, 軍人 military}**; auto-updates on 転身 (role conversion) |
| 階級 (rank) | Ladder from **二等兵 (Private 2nd) … 元帥 (Marshal)** |
| 爵位 (peerage) | **Empire only.** Text says "5 kinds" but lists six: 公爵/侯爵/伯爵/子爵/男爵/帝国騎士. Treat the 5 peerages as Duke/Marquis/Count/Viscount/Baron and 帝国騎士 (Imperial Knight) as distinct standing **(extraction-uncertain count/list mismatch)** |
| 出自 (origin) | Faction-gated: **Empire {貴族, 帝国騎士, 平民, 亡命者}; Alliance {市民, 亡命者}** |
| 出身地 (birthplace) | **Default respawn** location if sunk and no return point set |

**Progression fields (p14):**

| Field | Meaning |
|---|---|
| 功績 (achievement points) | Per-current-rank; promotion/demotion by **relative ranking among same-rank peers**, not an absolute threshold (presumably reset on rank change) |
| 評価ポイント (evaluation points) | **Per-session** reputation |
| 名声ポイント (fame points) | **Persistent, player/account-level** reputation spanning sessions |

### 2.2 The 8 abilities — PCP & MCP families (p14–15)
**PCP family (civil/political): 統率 / 政治 / 運用 / 情報.** **MCP family (military/command): 指揮 / 機動 / 攻撃 / 防御.** Spending PCP command points raises one of the 4 PCP-ability XPs; spending MCP raises one of the 4 MCP-ability XPs. (p15)

| Ability (family) | Effects |
|---|---|
| **統率 Leadership (PCP)** | In a 要職: affects 徴税額 (tax revenue) & 政府支持率 (govt approval). For fleet commander: 艦隊最大士気 (max morale) & 降伏勧告成功率 (surrender-recommendation rate) (p14–15) |
| **政治 Politics (PCP)** | Higher → easier to gather citizen support (p15) |
| **運用 Administration (PCP)** | Affects planet governance (惑星の統治) (p15) |
| **情報 Intelligence (PCP)** | Affects spy activity (スパイ活動) & tactical 索敵能力 (detection) (p15) |
| **指揮 Command (MCP)** | Higher → subordinate ships act more quickly; governs command-range-circle regrowth (p15, p48) |
| **機動 Mobility (MCP)** | Higher → more agile ship-handling (操艦); governs Reverse-command speed (p15, p53) |
| **攻撃 Attack (MCP)** | Commander/staff → fleet attack power; defense commander → planet anti-ship (対艦) defense (p15) |
| **防御 Defense (MCP)** | Commander/staff → fleet defense; defense commander → planet anti-occupation defense (p15) |

### 2.3 Character growth (p15)
**Provisional spec (現在暫定的な仕様).** Two elements:

**(A) Age effect (年齢効果):** Each **month**, young chars (若年) have a chance of a **positive** ability change; mature chars (壮年) have a chance of a **negative** change. Both bounded by **fixed cap/floor**. *(Exact age cutoffs, probabilities, and caps not given — must be sourced elsewhere.)*

**(B) Experience via CP:** Each strategic command spends CP. **CP used is accumulated**; per fixed quantum, **+1 XP** to one ability (gated by command's PCP/MCP type). At **100 XP → ability +1, XP resets to 0**. **CP consumed via substitution (代用) is NOT counted.** *(Per-command CP-type table is not printed on these pages — only PCP/MCP grouping.)*

### 2.4 Communications (pp. 16–18)
Three channels: **Mail (メール), Messenger (メッセンジャー), Chat (チャット).** (p16)

**Mail (p16):**
- Addresses per character = **1 personal + 1 per held 職務権限カード** (job-authority card). Example: Yang holding 2 job cards → 3 addresses total.
- Receivable anywhere in **strategic** mode; **suspended while in a tactical battle**.
- Personal address obtained via the **[名刺交換] (business-card exchange)** chat command (opt-in).
- **Address book cap = 100**; user-deletable; reply allowed to unregistered senders.
- **Defection (亡命) wipes the entire address book.**
- **Mailbox cap = 120**; full inbox blocks new delivery until deletions.

**Messenger (p17):**
- Strictly **1:1**. Switching partners requires teardown then new connect.
- FSM: {idle, calling (1 outstanding), connected}. New call cancels prior call; calling while connected drops the connection.
- Accepting one incoming call auto-cancels all other pending incoming calls.

**Chat (p17–18):**
- Default audience = **same スポット (spot)** zones (home/自宅, 会議室, 酒場). Same-部隊 members can chat across spots if in the **same grid**.
- **In tactical mode only:** chat broadcasts to all friendly (自陣営) characters in the same grid.
- Chat commands: **[名刺交換]** pushes personal mail address to partner; **[キャラクター情報取得]** views partner's character info (maps to a 0x0323-style record view).

---

## 3. Screens & Controls (pp. 19–26)

*Mostly client-side; only the server-relevant facts are flagged.*

### 3.1 Strategy screen (pp. 19–21)
- **Main View** grid scale: **one grid side = 100 light-years (100光年)**; all strategic movement is grid-quantized. (p19)
- Scroll: cursor-to-edge auto-scrolls (4 directions). **Strategy zoom:** wheel toward = OUT, wheel away = IN. (p19)
- Galaxy Map area cursor = minimap navigation. (p20)
- **Job-Authority Card tab (④):** ALL command execution flows from held cards; 提案/命令 (Proposal/Order) distinction is part of the authority model. (p20)
- **Same-Spot Character tab (⑤):** server tracks spot occupancy roster (maps to character record spot@0x1c). (p20)
- System icons: messenger/info/mail/system; the **mail icon changes on new mail** (server pushes a new-mail flag). (p20)
- System window: ゲーム終了 / サウンド設定 / ゲーム設定. (p21)
- Chat window: upper row = system, lower row = chat. (p21)

### 3.2 Information window — 7 types (p20, p23)
キャラクター情報, 旗艦情報, 戦隊情報, 部隊情報, 惑星要塞情報, 国家情報, 地形情報. *(Map to server info-record families: 0x0323 character, flagship, squadron, unit, 0x031f base/fortress economy, nation, 0x0315 terrain.)*

### 3.3 Tactical screen & flagship energy (pp. 22–25)
**Tactical zoom is REVERSED vs strategy:** wheel toward = IN, wheel away = OUT. (p23)

**Flagship energy panel (操艦パネル) (p24):** total energy is **fixed/limited**, split across **6 systems**:

| System | Effect when allocation raised |
|---|---|
| **BEAM** | ↑ laser attack power + ↓ recharge (充填) time |
| **GUN** | ↑ gun attack power |
| **SHIELD** | ↑ shield regen across the flagship's **4 directional facings** |
| **ENGINE** | ↑ tactical movement speed |
| **WARP** | Required to **retreat**; **max allocation** lets you retreat from outside the tactical-map circle |
| **SENSOR** | ↑ detection range / discovery probability of distant units |

**Tactical chat scopes (3, server-resolved) (p25):** 【全体】All in battle (friend+foe), 【艦隊】same-fleet only, 【同陣営】allied-only.

**Command-range circle (コマンドレンジサークル) (p22):** double-clicking the flagship selects all subordinates inside the circle — defines which subordinate units a flagship may command.

### 3.4 Tactical command set (p26)
Keybindings are client-side and the p26 shortcut table is **heavily reflowed by extraction (low confidence on per-key pairings)**. The **server-relevant command set** is: **Move / Parallel-Move / Turn / Stop; Attack [salvo/continuous/stop]; Fire [beam/gun/missile]; Air-combat (空戦); Defense; Formation (7 types); Repair; Supply.**

**7 formations (隊列変更):** 紡錘 Spindle, 艦種1, 艦種2, 混成1 Mixed1, 混成2 Mixed2, 三列 Three-column, plus 隊列解除 (disband). Formation type is a server-authoritative fleet attribute. **(extraction-uncertain per-key mapping)**

---

## 4. Strategy Basics: Cards, Command Points & Organizations (pp. 27–30)

### 4.1 Job-authority cards (職務権限カード) (p27, p32)
- ALL commands execute **through** a held job-authority card.
- Every character always holds the **個人 (Personal)** and **艦長 (Captain)** cards → basic commands like [移動]/[ワープ航行].
- **Max held per character = 16 cards.**

### 4.2 Command points (CP) (p27)
Two pools per character: **政略コマンドポイント (PCP)** and **軍事コマンドポイント (MCP)**.

| Rule | Detail |
|---|---|
| Cost | Each command specifies `{pointType: PCP|MCP, cost: N}` |
| Zero-cost | `cost==0` commands run unlimited regardless of balance |
| Recovery rate | Every **2 game-hours = 5 real minutes**, **even offline** |
| Recovery amount | Function of **政治 (Politics)** and **運営 (Management)** stats |
| Suspension | CP does **not** recover while in a tactical battle; accrual resumes at battle end |
| Substitution (代用) | If correct pool insufficient, pay from the other pool at **2× cost**; substituted CP is excluded from XP accumulation (§2.3) |

### 4.3 Command timing (p28)
- **実行待機時間 (execution wait time)** — delay from input to start.
- **実行所要時間 (execution required time)** — duration from start to completion.

### 4.4 Command groups (p28)
| Group | Scope / typical card |
|---|---|
| 作戦コマンド群 (Operations) | Flagship-unit ops; Captain card (universal) |
| 個人コマンド群 (Personal) | In-system movement + individual actions; Personal card (universal) |
| 指揮コマンド群 (Command) | Operation planning, fleet formation; military-ops cards |
| 兵站コマンド群 (Logistics) | Supply + unit reorg; Fleet Commander card |
| 人事コマンド群 (Personnel) | Promote/demote/appoint |
| 政治コマンド群 (Politics) | Faction budget, national goals; top government cards |
| 諜報コマンド群 (Intelligence) | Discipline (investigate/arrest) + espionage (infiltration) |

### 4.5 Organization structure (pp. 29–30)
Posts are grouped into named organizations; proposal/order routing is per-organization. (p29) Empire and Alliance are **faction-symmetric** — model once, label per faction. Equivalences (p29–30):

| Empire | Alliance |
|---|---|
| 統帥本部 (Supreme Command HQ) | 統合作戦本部 (Joint Operations HQ) |
| 帝国宰相 / 尚書 (Chancellor / ministers) | 議長 / 委員長 (Chairman / committee chairs) |
| 惑星総督 (Planetary Governor) | 知事 (Governor) |
| 総合偵察局 | 戦略作戦局 (intel bureau, both 諜報官 ×50) |

**Shared identical templates** (both factions): 艦隊 (Fleet, **6 staff slots**), 輸送艦隊 (Transport Fleet), 巡察隊 (Patrol Squadron), 地上部隊 (Ground Force), 要塞 (Fortress), and the Fezzan attaché trio (高等弁務官 / 補佐官 / 武官). Notable slot counts: 大本営参謀 ×10, 軍務省参事官 ×10, 宇宙艦隊参謀 (Empire ×10 / Alliance ×1), 統帥本部監察官 ×10, 諜報官 ×50, 士官学校教官 ×10. (Full per-role roster in §11.)

---

## 5. Personnel, Rank & Promotion (pp. 33–37, 46)

### 5.1 Two point systems (p33–34)
- **Evaluation points (評価ポイント)** — per-session; convert to fame at session end.
- **Fame points (名声ポイント)** — persistent, player-level.

### 5.2 Point flow
**Evaluation points increase (p34):**
- Tactical: destroy an enemy unit OR occupy enemy planet/fortress.
- Faction victory: scaled by **final rank** — **character must be alive**.
- **Death of a 准将 (Brigadier) or higher:** fixed value by rank at death, **independent of win/loss**.

**Fame points:** **increase** by converting end-of-session evaluation points (p34); **decrease** by selecting an original character (p34).

Tactical achievement points are tallied **every 30 in-game days**, ranked, and converted to evaluation points by ranking. (p46)

### 5.3 Rank ladder (階級ラダー) (p35)
- Within a rank, characters are ordered **descending by 功績**. **Separate ladders for 軍人 (military) and 政治家 (politician).**
- **Auto monthly promotion (大佐以下):** the **#1** of each ladder is auto-promoted on the **1st of each REAL month**.
- **30-game-day check (大佐以下):** qualifying chars auto-promote/demote with no input. Auto-**promoted** chars get the **average merit of the target ladder** (instead of 0). (p36)

**Ladder ordering — five laws (p35):**
1. More 功績 first.
2. Higher 爵位 (noble title) first — **Galactic Empire military only**.
3. Highest decoration order — **decorations currently unimplemented (skip).**
4. Higher 影響力 (influence) first.
5. Sum of all parameter values.

### 5.4 Rank headcount caps (p35)

| Rank | Empire | Alliance |
|---|---|---|
| 元帥 (Marshal) | 5 | 5 |
| 上級大将 (Senior Admiral) | 5 | — (rank not used) |
| 大将 (Admiral) | 10 | 10 |
| 中将 (Vice Admiral) | 20 | 20 |
| 少将 (Rear Admiral) | 40 | 40 |
| 准将 (Brigadier) | 80 | 80 |
| 大佐以下 (Colonel & below) | unlimited | unlimited |

### 5.5 Personnel authority (人事権) by rank tier (p36)

| Rank band | Empire authority | Alliance authority |
|---|---|---|
| 元帥 | 皇帝 (Emperor) | 国防委員長 (Natl Defense Cmte Chair) |
| 上級大将～准将 | 軍務尚書 (Minister of Military Affairs) | 国防委員長 |
| 大佐以下 | 軍務省人事局長 | 国防委員会人事局長 |

*(Alliance 元帥-tier holder mapping is **extraction-uncertain**.)* Self rank-change can be requested via 提案 (proposal). (p36)

### 5.6 Promotion / demotion mechanics (p36)
**Promotion (昇進):** insert at **bottom of the next-rank-up ladder**; **merit → 0**; lose all cards **except 個人 / 艦長 / 封土**.

**Demotion (降等/降格):** insert at **bottom of the next-rank-down ladder**; **merit → 100**; lose all cards except 個人 / 艦長 / 封土. 30-game-day auto-demotion check for 大佐以下.

### 5.7 Flagship change (p37)
Flagship **type set by rank at creation**; on any rank change, the flagship swaps to one matching the **new rank**. **Provisional spec.**

### 5.8 Appointment authority (p37)
- Authority flows **top-down** by post hierarchy; higher post holds both 任命 (appoint) and 罷免 (dismiss).
- Every post except the apex is dismissable — even an original char's starting post.
- **Appointment validation:** target rank must be within the post's allowed range AND **strictly lower than the appointer's own rank**.

---

## 6. Strategy: Grids, Movement & Warp (pp. 31–33)

### 6.1 Grid system (p31)
- Grid cell = **100 ly**; all strategic movement in grid units. (p19, p31)
- **Grid types:** 空間グリッド (space, empty), 星系グリッド (star-system), 航行不能グリッド (non-navigable — no unit may enter).

**Grid entry restrictions:**

| Restriction | Rule |
|---|---|
| Unit-count cap | **≤ 300 units per faction per grid**, **including ground troops/garrisons**; **all-or-nothing** fleet entry (a 部隊 needs headroom for all its units) |
| Faction-count cap | **≤ 2 factions per grid**; regular-army vs rebel-army counted **separately** |
| Lone-flagship (独行艦) | A solo flagship cannot enter a star-system grid containing non-lone enemy units or an enemy planet/fortress — **except** if friendlies are present and a tactical game is in progress |
| Terrain | **プラズマ嵐 (plasma storm)** and **サルガッソ・スペース (Sargasso space)** grids are **impassable to all ships** |

### 6.2 Warp navigation (p32)
- Movement between grids = **warp (ワープ航行)**.
- To **enter a star-system grid you must first warp to an adjacent grid** — no single long-range warp into a system.
- **Warp error (誤差):** long-distance warps may deviate to a **random adjacent space grid**.
- **Warp cost:** consumes **航続 (cruising range/fuel)**; a warp **requires 航続 ≥ 100**.

### 6.3 Movement command hierarchy (4 tiers) (p32–33)

| Scope | Command | Card | Term |
|---|---|---|---|
| Between grids (space) | **[ワープ航行]** Warp Nav | Captain | — |
| Between planets in same system | **[寄港]** Dock | Captain | 星系間航行 |
| Between facilities on a planet | **[遠距離移動]** Long-distance Move | Personal | — |
| Between spots/rooms in a facility | **[近距離移動]** Short-distance Move | Personal | — |

---

## 7. Strategy: Operation Plans & Orders (pp. 38–40)

### 7.1 Operation plan (作戦計画) (p38)
A faction sets a strategic objective from **3 types**: 占領 (occupation), 防衛 (defense), 掃討 (sweep).

**Merit effect:** acting in accordance grants a **bonus point** on top of normal kill merit. (p38)

**Four plan fields (p38):** 作戦目的 (purpose), 目標星系 (target system), 作戦参加艦艇ユニット数 (participating ship-unit count), 発動予定時期 (scheduled activation timing).

**Target constraints by purpose (p38):**
- **占領 (occupation):** target system must have **only other-faction** planets/fortresses; targets enemy system.
- **防衛 (defense):** target must have **≥ 1 own** planet/fortress; hold for a fixed period.
- **掃討 (sweep):** any system; **may only target 独行艦 (lone ships)**.

**CP cost** of one operation-plan command varies with 発動予定時期. *(No numeric table on these pages; see §10 for the 10–1280 range.)* (p38)

### 7.2 Planning restrictions (p39)
- **Auto-withdrawal:** if target conditions become unmeetable, the plan is **auto-cancelled and deleted immediately**.
- **No duplicate target system per card:** one job-authority card cannot have two plans on the same system, regardless of purpose/timing.
- **Global cap:** sum of participatingShipUnitCount across all pending+active plans **≤ faction's total effective ship units**.
- If unit losses make an active plan infeasible, **new plan creation is locked out** until resolved.

### 7.3 Issuing orders (発令) (p39)
- The **drafting post and the issuing post are separate departments** (both factions).
- 発令 assigns concrete 部隊 up to the plan's count; **blocked until scheduledActivationTime is reached**.
- **Operation start trigger:** any assigned unit/lone-ship **reaches the target system**. Merit eligibility begins at start.
- **Duration:** auto-ends **30 in-game days** after issuance; **作戦撤回 (withdraw)** by the drafter ends it immediately.

### 7.4 Operation results (p40)

| Type | Evaluation | Reward |
|---|---|---|
| **占領 Occupation** | At start + 30 in-game days | All planets/fortresses controlled → **full** bonus to all issued 部隊; ≥ 1 controlled → **~50%** |
| **防衛 Defense** | At start + 30 in-game days | All held → **full** bonus; ≥ 1 lost to enemy → **~50%** |
| **掃討 Sweep** | During the 30-day window | **+1 bonus point per enemy ship sunk within 400 ly** of the target system |

---

## 8. Logistics, Production & Warehouses (pp. 41–45)

### 8.1 Phezzan & production (p41)
- **Phezzan Autonomous Region (フェザーン自治領) is NEUTRAL**; violating neutrality / armed occupation imposes a **special penalty**. **Phezzan occupation currently unimplemented.**
- **Ship production** only at planets/fortresses with an **arsenal (造兵工廠)**.
- **Soldier production** by conscription (募兵) from population on any habitable, populated planet — **but manual recruitment reduces that planet's tax income**.
- **Crew/troop proficiency (修練度), 4 tiers:** Elite / Veteran / Normal / Green. **Newly produced = Green.** Improves via training or combat.
- **Automatic production:** ships and soldiers auto-produce continuously until ownership changes; **no role can toggle it** in this version; **auto-produced units do NOT affect tax** (unlike manual 募兵). The per-planet **自動生産品目一覧表** is an appendix table (§11.6).

### 8.2 Warehouses (p42)
- **惑星倉庫 (planet warehouse):** managed by **central government**; completed production auto-deposits here.
- **部隊倉庫 (unit warehouse):** per-unit; **only the owning unit** moves items.
- **Patrol squadrons & ground units share ONE pooled unit warehouse** (not per-unit isolated).
- Fractional/partial-strength units in the unit warehouse **auto-merge** on reorganize/replenish. **(extraction-uncertain OCR phrasing)**

### 8.3 Allocation (割当) (p43)
- Moves items from planet warehouse → unit warehouse; **prerequisite for replenish/reorganize**.
- **Authority table:**

| Role | 艦隊 | 巡察隊 | 輸送艦隊 | 地上部隊 |
|---|---|---|---|---|
| 統帥本部作戦一課長 | ○ | × | × | × |
| 統帥本部作戦二課長 | × | ○ | ○ | ○ |
| 統合作戦本部第三次長 | ○ | ○ | ○ | ○ |

- **Mutual-exclusion lock:** allocation cannot run while any unit is reorganizing/replenishing, and vice-versa (also 搬出入 load/unload).

### 8.4 Reorganization (再編成) (p44)
Bidirectional unit transfer between corps and unit warehouse; fills vacancies / recomposes. **Each ship class has a required crew-unit count** — reorganization must satisfy it.

### 8.5 Replenishment (補充) (p44–45)
- Refills combat-depleted ship & crew counts.
- **One ship-type per execution** (no batching multiple types).
- **Source must be exactly the same ship class** as destination (e.g., 巡航艦Ⅰ型 needs 巡航艦Ⅰ型 stock).
- **Crew auto-replenished** alongside ships, computed from each class's **乗員効率 (crew efficiency)** value.
- **Block:** if the unit warehouse has **zero crew units**, ships would be unmanned → 决定 (Confirm) disabled.
- **Merchant ships (商船) require no crew** — exempt from crew rules.

---

## 9. Tactical: Units, Scouting & Combat (pp. 46–55)

### 9.1 Tactical lifecycle (p46)
- **Start:** friendly + enemy unit share a grid.
- **End:** no enemy unit remains; **planet/fortress grids also require full occupation**.

### 9.2 Unit taxonomy (p46)
Three tactical unit classes (plus strategic management units): **陸戦隊ユニット (ground), 旗艦ユニット (flagship), 艦艇ユニット (warship).**

- **Ground units (3 types):** 装甲兵 (armored infantry), 装甲擲弾兵 (armored grenadier), 軽装陸戦兵 (light landing infantry).
- **Flagship unit = 1 ship.** Named flagships (e.g. ヴィルヘルミナ, パトロクロス) vs generic flagships derived from regular warship classes.
- **1 warship unit = 300 ships (300隻).**
- **11 warship classes:** 戦艦, 高速戦艦 *(Empire only)*, 巡航艦, 打撃巡航艦 *(Alliance only)*, 駆逐艦, 戦闘艇母艦, 雷撃艇母艦 *(Empire only)*, 揚陸艦, 輸送艦, 兵員輸送艦, 工作艦. Each subdivides into Roman-numeral subtypes (戦艦Ⅰ型 etc.); detailed stats in §12.

### 9.3 Command authority in battle (p47)
- On battle entry, **same-部隊 units auto-assign 指揮権**; commanders share control.
- **Distribution priority:** (1) online → (2) higher rank → (3) more eval points → (4) more achievement points.
- **Transfer of command** requires the target unit to be **outside any command-range circle** AND **fully idle/stopped**.

### 9.4 Command-range circle (コマンドレンジサークル) (p47–48)
- Command origin = **flagship unit** (targets 艦隊/輸送艦隊/巡察隊/独行艦/地上部隊) or **defense HQ** (targets garrison).
- Flagship-self commands and personal commands **bypass** the circle.
- Issuance limited to **same-戦隊 units inside the circle**; **low-morale/disordered units cannot be commanded**.
- Radius **grows over time to a per-flagship cap**, **resets to 0 on each command issuance**.
- **Expansion rate = f(指揮 stat); maximum value = f(flagship performance).**
- **独行艦 (lone ship) has no command-range circle.**
- All commands have a **0–20 s startup delay** (remaining-time bar). Out-of-range units finish any existing order then hold position.

### 9.5 Scouting (索敵) (p49)
- **Automatic and continuous** for all flagships/warships/defense HQ — no scout command.
- **Range** = unit stat + **[SENSOR]** allocation. **Accuracy** = f(distance, target type, unit stat); **stationary units get a concentrated-scouting accuracy bonus**.
- **Stealth (索敵回避)** is a per-unit stat; **stationary units gain an electronic-warfare evasion bonus**.
- **Fog-of-war is shared** across all friendly characters in a battle; on a contested target, **any success wins** (success OR failure → success).

### 9.6 Ship attack & weapons (p50)
- **Line-of-fire (射線判定):** beam/gun/missile blocked by a friendly ship (incl. mobile fortress) or obstructing terrain.
- **Weapons (material reduction from attacks currently unimplemented):**
  - **Beam/Gun** — effective mid/near; gun consumes supplies = ship's **ガン消費** value.
  - **Missile** — effective long-range; consumes supplies = **ミサイル消費** value.
  - **Fighter (戦闘艇)** — low attack but slows ship targets / repels enemy fighters; **launch costs flat 10 supplies**. **Fighters currently unimplemented.**
- **Fortress cannon (要塞砲):** piercing — **auto-hits every unit (friend or foe)** along the line of fire; only terrain blocks it. Charge-then-auto-fire on a chosen direction.

### 9.7 Ground battle (地上戦) (p51)
- Triggered by dropping a **landing-force (陸戦隊)** onto a planet/fortress (ship must carry it). Resolves in a per-body **地上戦ボックス (ground-battle box)**.
- **Box cap = 30 units/faction**; these **still count** toward the 300/faction grid cap.
- **Defense bar:** 30 deployed units = **100%**.
- Procedure: anchor ship → **[陸戦隊出撃]** → auto-start if enemy ground units present.
- **Eligible landing-force types by planet type** *(planet type currently unimplemented)*:

| Planet type | Eligible |
|---|---|
| Normal | 装甲兵 / 装甲擲弾兵 / 軽装陸戦兵 |
| Gas/special | 装甲擲弾兵 / 軽装陸戦兵 |
| Fortress | 装甲擲弾兵 / 軽装陸戦兵 |

### 9.8 Occupation processing (auto, on enemy ground units = 0) (p51–52)
- **Card transfer:** defeated faction loses planet-specific cards (惑星総督/守備隊指揮官/封土); occupier gains them (inert until appointed).
- **Garrison surrender:** defeated garrison ground units treated as **annihilated**.
- **Emergency sortie:** defeated chars force-launched to **anchored** state above the body.
- **Confiscation:** warehouse supplies → occupier; **in-build and stored ships destroyed**.
- **Facilities** → occupier.
- **Jurisdiction:** Empire-occupied bodies become **Imperial-House direct domain (帝室直轄領)**.

### 9.9 Units & damage (p52)
- **Flagship unit:** 1 hull; normal/damaged; repaired by **工作艦**; destruction removes it from the match.
- **Ship unit:** 300-hull stack; per-hull normal/damaged; attrition removes hulls **one at a time**; repaired by 工作艦.
- **Cargo** scales with surviving hull fraction. Carried ground units auto-redistribute on loss but are **wiped if hulls drop below a threshold** *(threshold not given)*.

### 9.10 Death (戦死) (p52)
- **Death is the player's choice.** Default on flagship destruction: **injury (負傷) + instant warp to the return planet (帰還惑星)**, not death. **Combat death currently unimplemented.**
- Return planet set via System Settings → Game Settings → Return Planet Setting.

### 9.11 Ship commands — timing table (pp. 53–55)
Wait/Duration in seconds; hotkeys client-side.

| Command | Wait | Duration | Notes |
|---|---|---|---|
| 移動 Move (f) | 5 | 0 | Move to position |
| 旋回 Turn (s) | 5 | 0 | Rotate keeping formation |
| 平行移動 Parallel Move (d) | 5 | 0 | Facing unchanged; speed **50%** of full |
| 反転 Reverse | 10 | 0 | 180° in place; speed scales with **機動** |
| 撤退命令 Retreat | 5 | 2.5 min | Warp out; requires unit **outside radar circle**; applies to squadron units within max command-range at start; **grounded landing-forces stay behind** |
| 隊列命令 Formation (v) | 5 | 0 | Persistent grouping until broken |
| 攻撃命令 Attack (r) | 5 | 0 | Auto-fire in-range enemies; **excludes planets/fortresses** |
| 射撃命令 Fire (e) | 5 | 0 | One-off targeted attack |
| 空戦命令 Air-combat (w) | 5 | 0 | Fighter attack; auto anti-ship vs intercept by target type |
| 陸戦隊出撃 Landing Sortie | 5 | 20 | Drop (if anchored) vs sortie (if stationed); needs carried landing-force |
| 陸戦隊撤収 Landing Withdrawal | 5 | 20 | Re-embarks grounded landing-forces |
| 態勢変更 Posture Change | 10 | 0 | See postures below |
| 出撃 Sortie | 5 | 20 **per unit** | Total = N×20 s; ships before flagships; type order random |
| 停止命令 Stop | 0 | 0 | Cancels active ship command, halts all |

**4 postures (態勢) (p54):** 航行 (Navigation, normal); 碇泊 (Anchor, satellite orbit); 駐留 (Station, descended into body); **戦闘 (Combat: +attack, −sensor range, +morale-loss rate)**.

**Planet/fortress commands (p55):** usable only by the **defense-HQ administrator who is the defense commander**; command-circle regrowth = f(character ability).

| Command | Wait | Duration | Notes |
|---|---|---|---|
| 要塞砲射撃 Fortress-cannon Fire | 5 | 0 | Piercing AoE; can friendly-fire |
| 停止命令 Stop | 0 | 0 | Cancels active planet/fortress command |

---

## 10. Strategic Command Table (pp. 68–74)

**Columns:** コマンド種別 (category), コマンド (name), 消費CP, 実行待機時間 (wait), 実行所要時間 (duration), 解説. Times are in-game time. Total of **78 commands** across 7 categories. **Lowest fixed CP = 5 (近距離移動); highest fixed = 800 (逮捕許可/執行命令); highest possible = 1280 (作戦計画 max). Lowest nonzero anywhere = 1 (発令 min).**

### 10.1 Warp & Operations (作戦コマンド) (p68–69)

| Command | CP | Wait | Dur | Effect |
|---|---|---|---|---|
| ワープ航行 Warp Nav | 40 (base) | 0 (base) | — | Move to any grid; CP & wait **scale with distance**; space only |
| 燃料補給 Refuel | 160 | 8 | **48–960** | Replenish warp fuel; **persistent command** (deletion gate) |
| 星系内航行 Intra-system Nav | 160 | 8 | 0 | Move between planets in a system grid |
| 軍紀維持 Maintain Discipline | 80 | 0 | 0 | ↑ 軍紀維持度, ↓ 混乱発生率 |
| 航宙訓練 Space-flight Training | 80 | 0 | 0 | ↑ unit 訓練度 |
| 陸戦訓練 Ground Training | 80 | 0 | 0 | ↑ ground training |
| 空戦訓練 Air Training | 80 | 0 | 0 | ↑ air training |
| 陸戦戦術訓練 Ground Tactical Training | 80 | 0 | 0 | Grants ground tactical skill |
| 空戦戦術訓練 Air Tactical Training | 80 | 0 | 0 | Grants air tactical skill |
| 警戒出動 Alert Sortie | 160 | 24 | 0 | ↑ 治安維持率 via stationed troops |
| 武力鎮圧 Armed Suppression | 160 | 24 | 0 | ↑ security but **may lower 政府支持率** |
| 分列行進 Parade March | 160 | 24 | 0 | ↑ 政府支持率 |
| 徴発 Requisition | 160 | 24 | 0 | Seize 軍需物資 from captured enemy body |
| 特別警備 Special Guard | 160 | 0 | **24** | Strengthen a specific alert spot |
| 陸戦隊出撃 Ground Troops Sortie | 80 | 0 | 0 | Station all ground troops down |
| 陸戦隊撤収 Ground Troops Withdrawal | 80 | 0 | 0 | Re-embark all ground troops |

### 10.2 Personal (個人コマンド) (p69–70)

| Command | CP | Effect |
|---|---|---|
| 遠距離移動 Long-distance Move | 10 | Between facilities |
| 近距離移動 Short-distance Move | **5** | Between spots (cheapest) |
| 退役 Retire | 160 | 軍人→政治家; **30-game-day lockout on 志願** |
| 志願 Volunteer | 160 | 政治家→軍人; rank → **少佐 (Major)**, flagship → **戦艦** |
| 亡命 Defection | 320 | Defect; detained at enemy capital awaiting 処断; wipes address book |
| 会見 Meeting | 10 | ↑ 友好度 with same-spot person |
| 受講 Attend Course | 160 | ↑ ability params; **士官学校 only** |
| 兵棋演習 Wargame | 10 | Simulator tactical training; 士官学校 only |
| 叛意 Coup Ringleader | 640 | Become coup mastermind |
| 謀議 Conspiracy | 640 | Recruit same-spot person to coup |
| 説得 Persuade | 640 | ↑ 叛乱忠誠度 of own units |
| 叛乱 Execute Coup | 640 | Trigger the coup |
| 参加 Join Coup | 160 | Follower joins a recruited coup |
| 資金投入 Fund Injection | 80 | Private funds → 地方資金庫 / 信任ボックス / 支持ボックス |
| 旗艦購入 Buy Flagship | 80 | New flagship; **also consumes 評価ポイント** |

### 10.3 Command/Staff (指揮コマンド) (p70–71)

| Command | CP | Effect |
|---|---|---|
| 作戦計画 Operation Plan | **10–1280** | Formulate strategic objective |
| 作戦撤回 Cancel Operation | 5–320 | Cancel a planned op |
| 発令 Issue Order | **1–320** | Assign units to an active op |
| 部隊結成 Form Unit | 320 | Organize units into a 部隊 |
| 部隊解散 Disband Unit | 160 | Disband a stationed 部隊 |
| 講義 Give Lecture | 160 | Buff 受講 attendees' params; lasts **120 in-game min** or until leaving spot; 士官学校 only |
| 輸送計画 Transport Plan | 80 | Create transport package → 輸送倉庫 |
| 輸送中止 Cancel Transport | 80 | Cancel a transport plan |

### 10.4 Logistics (兵站コマンド) (p71)

| Command | CP | Effect |
|---|---|---|
| 完全修理 Full Repair | 160 | Repair flagship + all ships; **consumes ALL the 部隊's 軍需物資** |
| 完全補給 Full Resupply | 160 | Resupply 軍需物資 to a 部隊 |
| 再編成 Reorganize | 160 | Revise 部隊 unit composition |
| 補充 Replenish | 160 | Refill ships + crew + supplies |
| 搬出入 Load/Unload | 160 | Load/unload a transport package |
| 割当 Allocate | 160 | Planet/fortress stock → per-force stock |

### 10.5 Personnel (人事コマンド) (p71–72)

| Command | CP | Effect |
|---|---|---|
| 昇進 Promote | 160 | Promote **ladder #1** by one rank |
| 抜擢 Selective Promotion | 640 | Promote any **non-#1** by one rank |
| 降等 Demotion | 320 | Demote any non-#1 by one rank |
| 叙爵 Confer Peerage | 160 | Grant 爵位 to qualifying noble; **Empire only** |
| 叙勲 Award Medal | 160 | Award 勲章 to qualifying char |
| 任命 Appoint | 160 | Grant a 職務権限カード |
| 罷免 Dismiss | 160 | Remove from an office |
| 辞任 Resign | 80 | Relinquish own card |
| 封土授与 Grant Fief | 640 | To 男爵+ noble; **Empire only** |
| 封土直轄 Revert Fief | 640 | Fief → direct control; Empire only |

### 10.6 Political (政治コマンド) (p72–73)

| Command | CP | Effect |
|---|---|---|
| 夜会 Soirée | 320 | At capital mansion; alters 影響力 |
| 狩猟 Hunt | 320 | At fief mansion; alters 影響力 + guest 友好度 |
| 会談 Conference | 320 | Hotel talks; alters 影響力 |
| 談話 Conversation | 320 | Hotel chat; alters 友好度 + 影響力 |
| 演説 Speech | 320 | Plaza speech; alters 影響力 + local 政府支持率 |
| 国家目標 National Objective | 320 | Nation-level strategic goal |
| 納入率変更 Change Delivery Rate | 320 | Per-planet tax delivery rate |
| 関税率変更 Change Tariff Rate | 320 | Per-commodity tariff |
| 分配 Distribute Aid | 320 | National budget → planet aid |
| 処断 Pass Judgment | 320 | Adjudicate imprisoned chars |
| 外交 Diplomacy | 320 | Negotiate with Fezzan |
| 統治目標 Governance Objective | 80 | Planet-level objective (cheapest political) |

### 10.7 Intelligence (諜報コマンド) (p73–74)

| Command | CP | Effect |
|---|---|---|
| 一斉捜索 Mass Search | 160 | Locate a person on a body |
| 逮捕許可 Arrest Authorization | **800** | Add own-faction person to arrest list |
| 執行命令 Enforcement Order | **800** | Delegate arrest authority for arrest-listed persons |
| 逮捕命令 Arrest Order | 160 | Arrest a co-located target (same spot / same force in grid) |
| 査閲 Inspection | 160 | Detect coup signs |
| 襲撃 Raid | 160 | Assault same-spot **enemy-faction** person |
| 監視 Surveillance | 160 | Persistent watch (until detected) |
| 潜入工作 Infiltration | 160 | Infiltrate a facility spot |
| 脱出工作 Escape | 160 | Escape an infiltrated spot |
| 情報工作 Intelligence Op | 160 | Steal facility intel → home |
| 破壊工作 Sabotage | 160 | Plant time bomb in infiltrated facility |
| 煽動工作 Agitation | 160 | ↓ target 政府支持率 |
| 侵入工作 Intrusion | 320 | Enter enemy body |
| 帰還工作 Return Op | 320 | Exfiltrate agent home |

**Wait/Duration note (p68–74):** all nonzero timers are in the 作戦コマンド category (燃料補給 wait 8 dur 48–960; 星系内航行 wait 8; 警戒出動/武力鎮圧/分列行進/徴発 wait 24; 特別警備 dur 24). All personal/command/logistics/personnel/political/intel commands resolve instantly (wait 0, dur 0); durations like 講義 120 min, 退役 30-day lockout, 監視 until-detected live in the descriptions.

---

## 11. Appendix A: Faction Organizations & Initial Cards (pp. 56–67)

**Universal appointment cap (p56, p62):** even within an allowed range, you cannot appoint a character whose rank is **≥ the appointer's own**.

**Role registry schema:** `{dept (所属), role (役職名), quota (定員), minRank (最低階級), maxRank (最高階級), appointedBy, class (軍人/政治家)}`. Most military roles cap at 元帥.

### 11.1 Empire roles (帝国軍, pp. 56–58)

| Dept | Role | Quota | Min rank | Appointed by / notes |
|---|---|---|---|---|
| 皇宮 | 皇帝 Emperor | 1 | — | Goldenbaum 490 yrs; usually concurrently Supreme Cmdr + Chancellor |
| 皇宮 | 帝国軍最高司令官 Supreme Cmdr | 1 | 元帥 | Emperor's delegated military authority |
| 皇宮 | 幕僚総監 Chief of Imperial HQ | 1 | 元帥 | By Supreme Cmdr; appoints fleet chiefs-of-staff |
| 皇宮 | 大本営参謀 HQ Staff | 10 | 准将 | By 幕僚総監 |
| 皇宮 | 帝国宰相 Chancellor | 1 | 元帥 | Organizes Cabinet; often 国務尚書 acts **(uncertain rank)** |
| 内閣 | 国務尚書 Min. of State | 1 | 政治家 | By Chancellor; **appoints Planetary Governors** |
| 内閣 | 内務尚書 Home Affairs | 1 | 政治家 | **Arrests soldiers ≤ 大佐** |
| 内閣 | 財務尚書 Finance | 1 | 政治家 | **Changes tax rate** |
| 内閣 | 宮内尚書 Imperial Household | 1 | 政治家 | Nominal post |
| 内閣 | 司法尚書 Justice | 1 | 政治家 | **Arrests politicians** |
| 内閣 | 典礼尚書 Ceremonies | 1 | 政治家 | Nominal |
| 内閣 | 科学尚書 Science | 1 | 政治家 | Nominal |
| 内閣 | 内閣書記官長 Chief Cabinet Sec | 1 | 政治家 | Assists 国務尚書 |
| 駐フェザーン | 高等弁務官 High Commissioner | 1 | 政治家 | By Chancellor; intel/diplomacy |
| 駐フェザーン | 補佐官 Aide | 1 | — | By 国務尚書 |
| 駐フェザーン | 武官 Military Attaché | 1 | 少尉 | By 軍務省人事局長 |
| 軍務省 | 軍務尚書 Min. Military Affairs | 1 | 元帥 | **Appointed directly by Emperor**; military HR pinnacle |
| 軍務省 | 次官 Vice-Minister | 1 | 上級大将 | |
| 軍務省 | 人事局長 Personnel Director | 1 | 中将 | Manages rank ≤ 大佐; appoints Phezzan attaché |
| 軍務省 | 調査局長 Investigation Director | 1 | 中将 | **Appoints 諜報官 (spies)** |
| 軍務省 | 参事官 Councilor | 10 | 准将 | By Vice-Minister |
| 統帥本部 | 総長 Chief | 1 | 元帥 | **By Emperor**; appoints ops chiefs; usually holds Ops-1 |
| 統帥本部 | 次長 Vice-Chief | 1 | 上級大将 | By 軍務尚書 |
| 統帥本部 | 作戦一課長 Ops-1 Chief | 1 | 大将 | Plans **fleet** ops |
| 統帥本部 | 作戦二課長 Ops-2 Chief | 1 | 中将 | Plans transport/patrol/ground ops |
| 統帥本部 | 作戦三課長 Ops-3 Chief | 1 | 少将 | Plans **independent-ship** ops |
| 統帥本部 | 監察官 Inspector | 10 | 准将 | By Vice-Chief |
| 宇宙艦隊司令部 | 司令長官 CinC | 1 | 元帥 | By Supreme Cmdr *(p60 card table says by Emperor — discrepancy)* |
| 宇宙艦隊司令部 | 副司令長官 Deputy CinC | 1 | 元帥 | By Supreme Cmdr |
| 宇宙艦隊司令部 | 総参謀長 Chief of Gen Staff | 1 | 中将 | Appoints Space Fleet staff |
| 宇宙艦隊司令部 | 参謀 Staff | 10 | 准将 | By 総参謀長 |
| 憲兵本部 | 憲兵総監 Provost Marshal Gen | 1 | 上級大将 | **Arrests all soldiers except 元帥** |
| 憲兵本部 | 副総監 Deputy | 1 | 中将 | |
| 装甲擲弾兵総監部 | 総監 Inspector Gen | 1 | 上級大将 | Appoints Ground Force Cmdr |
| 装甲擲弾兵総監部 | 副総監 Deputy | 1 | 中将 | |
| 科学技術総監部 | 総監 Inspector Gen | 1 | 上級大将 | Nominal |
| 帝国軍士官学校 | 校長 Commandant | 1 | 大将 | By 軍務尚書 |
| 帝国軍士官学校 | 教官 Instructor | 10 | 曹長 | Lowest minRank role |
| 艦隊 | 司令官 Fleet Cmdr | 1 | 中将 | By 軍務尚書; fleet ≤ **18,000 ships** |
| 艦隊 | 副司令官 | 1 | 少将 | |
| 艦隊 | 参謀長 Chief of Staff | 1 | 少将 | By 幕僚総監 |
| 艦隊 | 参謀 Staff | 6 | 大尉 | By Fleet Cmdr |
| 艦隊 | 司令官副官 Adjutant | 1 | 中尉 | |
| 輸送艦隊 | 司令官 | 1 | 中将 | By Vice-Minister; ≤ **6,900 ships** |
| 輸送艦隊 | 副司令官 | 1 | 少将 | |
| 輸送艦隊 | 司令官副官 | 1 | 中尉 | |
| 巡察隊 | 司令 | 1 | 准将 | By Vice-Minister; ≤ **900 ships** |
| 巡察隊 | 副司令 | 1 | 准将 | |
| 巡察隊 | 司令副官 | 1 | 中尉 | |
| 地上部隊 | 指揮官 Ground Force Cmdr | 1 | 少佐 | By 装甲擲弾兵総監; ≤ **900 ships + 90,000 men** |
| 要塞 | 司令官 Fortress Cmdr | 1 | 中将 | By 軍務尚書; commands 要塞砲 |
| 要塞 | 守備隊指揮官 | 1 | 少佐 | By Fortress Cmdr |
| 要塞 | 事務総監 Admin Director | 1 | 少将 | Fortress economy/production |
| 各惑星 (非首都) | 惑星総督 Governor | 1 | 政治家 OR 准将 | **Military may hold (Empire-specific)** |
| 防衛司令部 | 惑星守備隊指揮官 | 1 | 少佐 | By Governor; ≤ **300,000 men** |
| 首都惑星政庁 | 帝都防衛司令官 | 1 | 大将 | By Supreme Cmdr; **no military command** |
| 首都惑星政庁 | 近衛兵総監 Imperial Guard Gen | 1 | 上級大将 | ≤ **300,000 men** |
| 統合偵察局 | 諜報官 Spy | 50 | 少尉 | **maxRank = 大佐** (rare cap); by 調査局長 |

### 11.2 Empire org-chart notes (p59)
- **Discrepancy:** org chart shows 軍務省参事官 quota 《1》 but org table (p56) says 10 — flag for verification.
- Appointment tree (top-down, abridged): 皇帝 → {最高司令官, 宰相, 軍務尚書, 統帥本部総長}; 最高司令官 → {幕僚総監, 宇宙艦隊正/副司令長官, 帝都防衛司令官}; 宰相 → cabinet ministers + Phezzan High Commissioner; 軍務尚書 → ministry directors + inspectors-general + 艦隊/要塞 commanders; 統帥本部総長 → ops chiefs.

### 11.3 Empire initial card holders (p60–61, **medium confidence — OCR layout**)
Faction head = **フリードリヒⅣ世 (Friedrich IV)**, Emperor (also Supreme Cmdr). 帝国宰相/国務尚書 = リヒテンラーデ; 財務尚書 = ゲルラッハ; Phezzan High Commissioner = レムシャイト; 軍務尚書 = エーレンベルグ元帥; 統帥本部総長/Ops-1 = シュタインホフ元帥; 宇宙艦隊司令長官/総参謀長 = G.ミュッケンベルガー元帥; 幕僚総監 = クラーゼン元帥; 憲兵総監 + 装甲擲弾兵総監 = オフレッサー上級大将; 科学技術総監 = シャフト大将; 軍務省人事局長 = アーベントロート中将. Reinhard (ローエングラム中将) starts as a fleet commander at **中将**; キルヒアイス少佐 = his Fleet-Commander's-Adjutant. Initial fleets: 第1–第6, 第8, 第10, 第12; patrol squadrons: 第4/5/29/44/53/54/55; fortress: イゼルローン要塞 (Stockhausen). Other named generals: グライフス, オッペンハイマー, ハウプト, メルカッツ, ミッターマイヤー少将, ロイエンタール少将, レンネンカンプ少将, ホフマイスター, フレーゲル, ゼークト, ランズベルク中将.

### 11.4 Alliance roles (同盟軍, pp. 62–64)

| Dept | Role | Quota | Min rank | Appointed by / notes |
|---|---|---|---|---|
| 最高評議会 | 議長 Chairman | 1 | 政治家 | Supreme power; appoints council |
| 最高評議会 | 副議長 Vice-Chairman | 1 | 政治家 | |
| 最高評議会 | 国務委員長 State Affairs Chair | 1 | 政治家 | **Appoints Governors** |
| 最高評議会 | 国防委員長 Natl Defense Chair | 1 | 政治家 | **Civilian head over whole military**; appoints top military |
| 最高評議会 | 財政委員長 Finance Chair | 1 | 政治家 | **Changes tax rate** |
| 最高評議会 | 法秩序委員長 Law&Order Chair | 1 | 政治家 | **Arrests politicians** |
| 最高評議会 | 天然資源 / 人的資源 / 経済開発 / 地域社会開発 / 情報交通委員長 | 1 each | 政治家 | Economy/HR/info committees |
| 最高評議会 | 書記 Secretary | 1 | 政治家 | |
| 駐フェザーン | 弁務官 / 補佐官 | 1 each | 政治家 | By 国務委員長 |
| 駐フェザーン | 武官 Attaché | 1 | 少尉 | By 国防委員長 |
| 統合作戦本部 | 本部長 Director | 1 | 大将 | By 国防委員長; top uniformed officer **(rank uncertain)** |
| 統合作戦本部 | 第一次長 1st Vice-Dir | 1 | 大将 | Transport/patrol ops |
| 統合作戦本部 | 第二次長 2nd Vice-Dir | 1 | 大将 | Independent-ship ops |
| 統合作戦本部 | 第三次長 3rd Vice-Dir | 1 | 大将 | Army-wide **補充 (replenishment)** planning |
| 統合作戦本部 | 参事官 Councilor | 10 | 准将 | |
| 統合作戦本部 | 陸戦総監部長 Ground Combat Dir | 1 | 中将 | Appoints Ground Force Cmdr |
| 後方勤務本部 | 本部長 Director | 1 | 大将 | By 国防委員長; appoints MP Cmdr |
| 後方勤務本部 | 次長 Vice-Dir | 1 | 中将 | |
| 後方勤務本部 | 参事官 Councilor | 10 *(chart says 1)* | 准将 | |
| 国防委員会 | 科学技術本部長 | 1 | 中将 | Nominal |
| 国防委員会 | 憲兵司令官 MP Cmdr | 1 | 准将 | By 後方勤務本部長; **arrests ALL soldiers (incl. 元帥)** |
| 国防委員会 | 査閲部長 Inspection Dir | 1 | 中将 | |
| 国防委員会 | 戦略部長 Strategy Dir | 1 | 中将 | Nominal |
| 国防委員会 | 人事部長 Personnel Dir | 1 | 中将 | Honors for ≤ 中佐 |
| 国防委員会 | 防衛部長 Defense Dir | 1 | 中将 | **Appoints garrison/capital-defense cmdrs** |
| 国防委員会 | 情報部長 Intelligence Dir | 1 | 少将 | **Appoints 諜報官** |
| 国防委員会 | 通信部長 | 1 | 少将 | Nominal |
| 国防委員会 | 装備部長 Equipment Dir | 1 | 少将 | Fleet/transport/patrol unit organization |
| 国防委員会 | 施設部長 Facilities Dir | 1 | 少将 | **Appoints Fortress Cmdr** |
| 国防委員会 | 経理 / 教育 / 衛生部長 | 1 each | — **(rank not printed, extraction-uncertain)** | 教育部長 appoints Academy Commandant |
| 宇宙艦隊司令部 | 司令長官 CinC | 1 | 元帥 | By 国防委員長; **also holds Fleet-Cmdr personnel authority** |
| 宇宙艦隊司令部 | 副司令長官 | 1 | 大将 | |
| 宇宙艦隊司令部 | 総参謀長 | 1 | 中将 | Appoints fleet staff |
| 同盟軍士官学校 | 校長 | 1 | 中将 | By 教育部長 |
| 同盟軍士官学校 | 教官 | 10 | 曹長 | |
| 艦隊 | 司令官 Fleet Cmdr | 1 | **少将** | **By CinC** (lower minRank than Empire's 中将); ≤ 18,000 ships |
| 艦隊 | 副司令官 | 1 | 准将 | |
| 艦隊 | 参謀長 | 1 | 准将 | **By 総参謀長** |
| 艦隊 | 参謀 | 6 | 大尉 | **By 総参謀長** |
| 艦隊 | 司令官副官 | 1 | 中尉 | |
| 輸送艦隊 | 司令官 | 1 | 准将 | By CinC; ≤ 6,900 ships |
| 輸送艦隊 | 副司令官 | 1 | 大佐 **(uncertain)** | |
| 輸送艦隊 | 司令官副官 | 1 | 中尉 | |
| 巡察隊 | 司令 | 1 | 准将 | By CinC; ≤ 900 ships |
| 巡察隊 | 副司令 | 1 | 大佐 **(uncertain)** | |
| 巡察隊 | 司令副官 | 1 | 中尉 | |
| 地上部隊 | 指揮官 | 1 | 少佐 | By 陸戦総監部長; ≤ 900 ships + 90,000 men |
| 要塞 | 司令官 | 1 | 中将 | **By 施設部長** |
| 要塞 | 守備隊指揮官 | 1 | 少佐 | |
| 要塞 | 事務総監 | 1 | 大佐 | |
| 各惑星 (非首都) | 知事 Governor | 1 | 政治家 | **Active military barred (opposite of Empire)** |
| 防衛司令部 | 惑星守備隊指揮官 | 1 | 少佐 | **By 防衛部長**; ≤ 300,000 men |
| 首都惑星政庁 | 首都司政官 Capital Admin | 1 | 政治家 | No military command |
| 首都惑星防衛司令部 | 首都防衛指揮官 | 1 | 大佐 | ≤ 300,000 men |
| 戦略作戦局 | 諜報官 Spy | 50 | 少尉 | maxRank = 大佐; by 情報部長 |

### 11.5 Alliance initial card holders (p66–67, **medium confidence**)
Faction head = **サンフォード (Sanford)**, 議長. 国防委員長 = トリューニヒト; 財政委員長 = レベロ; 人的資源委員長 = ホワン; (情報交通委員長 / Phezzan 弁務官 = ウィンザー / ヘンスロー, **mapping OCR-ambiguous**); 統合作戦本部長 = シトレ元帥; 後方勤務本部長 = ドーソン大将; 宇宙艦隊司令長官 = ロボス元帥; 総参謀長 = D.グリーンヒル大将. Initial fleets 1–12 (commanders 中将, vice-cmdrs 少将): パエッタ, パストーレ, ビュコック, アル・サレム, ウランフ, ボロディン, etc. (exact fleet-number↔name pairing **partly ambiguous**; Yang not yet a fleet commander at start). Patrol squadrons: 第11/16/21/26/31/36/46/56. Other named generals: ロックウェル, グローブナー, ホーランド中将, ムーア中将, マリネッティ准将, カールセン少将.

### 11.6 Cross-faction appendix facts (pp. 56–64)
**Strategic unit caps (canon):** 艦隊 ≤ 18,000 ships; 輸送艦隊 ≤ 6,900; 巡察隊 ≤ 900; 地上部隊 ≤ 900 ships + 90,000 men; 惑星守備隊 / 首都防衛 ≤ 300,000 men.

**Tax-rate authority:** Empire 財務尚書 / Alliance 財政委員長 *(economy unimplemented in original)*.

**Arrest matrix:** Empire 内務尚書 (≤ 大佐), 司法尚書 (politicians), 憲兵総監 (all except 元帥); Alliance 法秩序委員長 (politicians), 憲兵司令官 (**all incl. 元帥**).

**Key appointer divergences:** Fleet Commander — Empire by 軍務尚書 vs Alliance by CinC. Fleet Chief-of-Staff/Staff — Empire by 幕僚総監/Fleet-Cmdr vs Alliance both by 総参謀長. Fortress Cmdr — Empire by 軍務尚書 vs Alliance by 施設部長. Planetary Garrison Cmdr — Empire by Governor vs Alliance by 防衛部長. **Encode appointment edges separately per faction.**

---

## 12. Appendix B: Ship Performance Tables

### 12.1 Stat-column schema (pp. 79–89 Empire, pp. 90–99 Alliance)
Both factions' ship tables share the same columns: 建造工期 (build days), 必要乗組員 (req. crew), ユニット数出力 (unit-count/pool), 索敵範囲 (sensor, 万km), 最高速度 (km/1G-sec), 装甲 前/側/後 (armor F/S/R), シールド 防護値/容量 *(flagship only)*, ビーム破壊力, ガン破壊力/消費, ミサイル破壊力/消費, 対空破壊力, 戦闘艇/雷撃艇搭載数, 物資搭載量, 修理消費物資 (per ship). Slash values are `power/supply-cost`. `-` = canonical absence; `·` = no token in the PDF text layer (treat as missing, **not** zero). *(Maps to ResponseStaticInformationUnitShip 0x030b / content/ship-stats.json.)*

**Extraction note:** per-variant tables print only the stats a variant changes; the standard/flagship column carries the fullest block. Empire numbers below were recovered by spatial PDF clustering and reconcile with `content/ship-stats.json _raw`. **Alliance numeric tables (pp. 90–99) were flattened into a linear stream by extraction — per-cell mapping is NOT recoverable, so Alliance numbers are quoted as-seen and flagged (extraction-uncertain); cross-check against ship-stats.json before encoding.**

### 12.2 Empire flagship stats (recovered)

| Class (型) | Unit out | Speed | Armor R/S/F | Shield guard/cap | Beam | Gun | Missile | AA | Sensor | Repair |
|---|---|---|---|---|---|---|---|---|---|---|
| 標準戦艦 SS75 | 390 | (lost) | (lost) | 70/30 | 48 | 100 | 80 | 80 | — | — |
| 高速戦艦 PK86 | 410 | 23,000 | side 15 | 70/28 | — | — | 100 | — | — | — |
| 巡航艦 SK80 | 260 | 23,000 | — | 50/25 | — | — | 60 | — | — | — |
| 駆逐艦 Z82 | 200 | 30,000 | 2/4/8 | 30/19 | — | 104 | 50 | 50 | 2,400 | 40 |
| 高速艇 K86 | 170 | 27,000 | 2/5/7 | 20/19 | — | 24 | 40 | 40 | 4,000 | 20 |
| 民間船 (旗艦) | — | 10,000 | 4/8/20 | 20/16 | — | — | 10 | 30 | 2,400 | — |

*(SS75 armor/speed flagship cells OCR-lost; PK86 max armor 48 interpolated.)* **(extraction-uncertain on lost cells)**

### 12.3 Empire variant lore & deltas (pp. 79–89)
Per-class variant descriptions are preserved as design modifiers (high confidence on lore, medium on numbers):

- **戦艦 SS75a–g (p79):** Ⅱ=photon cannon (beam 64), Ⅲ=close railcannon (no missile, armor 12/20/34), Ⅳ=missile-spec, Ⅴ=high-speed (armor 9/17/28, 21k), Ⅵ=composite armor (14/22/36), Ⅶ=aviation battleship (+Walküre, 4 fighters), Ⅷ=automated (~20% crew cut). Build days: Ⅰ=90/Ⅱ=110/Ⅴ=100/Ⅷ=110.
- **高速戦艦 PK86a–g (p80):** Ⅱ=long-range beam, Ⅲ=missile raider, Ⅳ=24k high-speed, Ⅴ=bow composite armor, Ⅵ=fast aviation battleship, Ⅶ=recon/stealth (no fighters), Ⅷ=close railcannon.
- **巡航艦 SK80a–g (p81):** Ⅱ=laser-H missile raider (no fighters), Ⅲ=light cruiser (25k), Ⅳ=composite armor, Ⅴ=aviation, Ⅵ=recon/stealth, Ⅶ=long-endurance, Ⅷ=automated (~33% crew cut).
- **駆逐艦 Z82a–g (p82):** Ⅱ=patrol destroyer, Ⅲ=long-range sensor, Ⅳ=high-speed (31k), Ⅴ=ultra-fast (no missile), Ⅵ=laser-H raider, Ⅶ=missile gunship, Ⅷ=stealth recon. Speed Z82 = 30,000.
- **戦闘艇母艦 FR88/a/b (p83):** refit of GIS12 hull; carries 10–12 fighters; no fleet command. Ⅳ uses low-output engine (10,000 speed).
- **雷撃艇母艦 TR88/a/b/c (p84):** GIS12 refit + torpedo-boat hangar; Ⅳ = fast (20,000).
- **工作艦 A76/a/b (p85):** unarmed repair ship; Ⅱ=more repair material (1,600), Ⅲ=fast, Ⅳ=slow emergency build.
- **輸送艦 A74/a/b/c (p86):** cargo ≤ **500,000 t**; loadage 20,000; Ⅱ=civilian, Ⅲ=+AA, Ⅳ=fast (cargo↓).
- **兵員輸送艦 A72/a/b/c (p87):** carries ~**500 armed troops**; Ⅱ=+self-defense missile, Ⅲ=fast, Ⅳ=armor↑.
- **揚陸艦 A78/a/b/c (p88):** flagship variant = landing **command ship**; Ⅱ=+missile, Ⅲ=fast, Ⅳ=armor↑.
- **民間船 / 商船 (p89):** merchant = modular cargo/passenger hauler (4,000 loadage), unarmed.

### 12.4 Alliance ship classes (pp. 90–99, lore high / numbers extraction-uncertain)
Year-coded classes (counterparts to Empire):

- **標準戦艦 787年型 (p90):** photon cannon + laser-H missile + fighters; main capital ship vs SS75. Recurring standard tuple armor 30/18/10, beam 5,600, speed 22,000 **(uncertain)**. Variants: Ⅱ=new railcannon/armor↑, Ⅲ=long-range (no fighters), Ⅳ=快速戦艦 (light/fast), Ⅴ=armor↑/internal hangar, Ⅵ=recon, Ⅶ=wartime cheap, Ⅷ=無人艦 (25% crew, no fighters, ramming-blockade).
- **巡航艦 795年型 (p91):** neutron missile + photon pulse + fighters; ≈ SK80 except missiles. Variants Ⅱ=no fighters/armor↑, Ⅲ=laser-H long-range, Ⅳ=高速巡航艦, Ⅴ=composite armor, Ⅵ/Ⅶ=recon (Ⅶ cost = battleship), Ⅷ=フリゲート艦 escort.
- **打撃巡航艦 794年型 (p92):** Alliance-only; from 790-type, **3× missile output**, no beam/fighters. **レダ級偵察巡航艦 (Leda-class)** = recon variant. Ⅲ=armor↑/missiles↓, Ⅳ=wartime cheap.
- **駆逐艦 796年型 (p93):** **6 photon pulse cannons**, no fighters, minimal shield/sensor. Variants: Ⅱ=+missile, Ⅲ=near-zero armor/fast, Ⅳ=armor↑, Ⅴ=corvette, Ⅵ=stealth recon, Ⅶ=AA destroyer, Ⅷ=wartime (4-shot missiles, **~½ build time**).
- **戦闘艇母艦 796年型 (p94):** carries **100 Spartanian fighters**; gunnery ≈ 787 battleship. Ⅱ=no bow cannon (disguised), Ⅲ=armor↓/fast, Ⅳ=armor↑.
- **工作艦 793年型 (p95):** field repair of all Alliance ships. Ⅱ=light/fast, Ⅲ=slow, Ⅳ=more repair material.
- **輸送艦 792年型 (p96):** ~2× flagship length; cargo ≤ **500,000 t**. Ⅱ=civilian, Ⅲ=convoy-only, Ⅳ=fast/cargo↓.
- **兵員輸送艦 788年型 (p97):** requisitioned high-speed merchants; carries ~**600 armed troops**. Ⅱ=+missile, Ⅲ=fast, Ⅳ=armor↑(weak).
- **揚陸艦 795年型 (p98):** flagship = landing command ship. **Year discrepancy: base says 795-type, variants Ⅱ–Ⅳ say 786-type (extraction-uncertain).** Ⅳ=anti-fortress (carries 装甲擲弾兵 only, **cannot carry 装甲兵 vehicles**).
- **民間船 / 商船 (p99):** weakest class; merchant = modular hauler.

---

## 13. Appendix C: Soldier (Troop) Units & Galaxy Map (pp. 100–101)

### 13.1 Troop unit stats (p100)
Columns: 訓練課程 (training cost), 陸戦攻撃力 (ground attack), 陸戦防御力 (ground defense). Same catalog both factions.

| Unit | Training | Atk | Def | Notes |
|---|---|---|---|---|
| 軽装陸戦兵 Light Infantry | 60 | 10 | 10 | Both factions |
| 艦隊乗組員 Fleet Crew | 120 | — | — | No ground stats (non-combatant manning) |
| 装甲擲弾兵 Armored Grenadier | 180 | 20 | 20 | Both factions |
| 装甲兵 Armored Soldier | 240 | 50 | 50 | **Highest producible** (50/50) |
| 近衛兵 Imperial Guard (Empire) | 300 | 20 | 20 **(extraction-uncertain pairing)** | **Not currently produced** |
| 薔薇の騎士 Rosen Ritter (Alliance) | 900 | 30 | 30 | **Not currently produced** |
| 擲弾兵教導 Grenadier Instructors (Empire) | 900 | 30 | 30 | Empire counterpart of Rosen Ritter; **not currently produced** |

**Production footnote (p100):** 近衛兵 / 擲弾兵教導 / 薔薇の騎士 are **not currently produced** — they exist as stat entries but are excluded from the buildable roster (existing units may still fight). **(Stat-column mapping medium confidence — verify before seeding.)**

### 13.2 Galaxy map (p101)
Page 101 is the **星系図 (galaxy map)** — a vector graphic with positional dots and Text-annotation star-system labels. **No body text in the markdown extraction.** Per project canon, p101 was recovered separately from the PDF vector layer (dots + annotations, **Y-flip correction**) into `content/galaxy.json` — **not** from the text file. Source = the `logh7-galaxy-positions` skill / `content/galaxy.json`.

### 13.3 Initial deployment tables (pp. 75–78) — extraction caveat
Pages 75–78 (部隊初期配置 + 自動生産品目) are OCR of side-by-side two-column (帝国軍|同盟軍) tables that the extractor **flattened into one sequential column**, interleaving factions and splitting multi-ship lists across lines. **The catalog of VALUES is reliable; the exact PAIRING (which planet ↔ which ships/troops, which faction column) is NOT.** Before encoding production/deployment, cross-check against the original 2-column scan or the repo's `content/galaxy.json` + `content/ship-stats.json`. Confirmed: auto-production crew column is uniformly **艦隊乗組員**; ground-troop column ∈ {軽装陸戦兵, 装甲擲弾兵, 装甲兵}; many planets auto-produce **軽装陸戦兵 only** (garrison colonies); fortress/capital (Iserlohn, Odin, Heinessen) are the heaviest producers. **Do NOT treat p75–78 pairings as byte-exact canon.**

---

## 14. Server Implementation Map

Grouped by server module. ✅ = directly implementable from these P1 facts; ⚠️ = facts suggest **likely NOT yet implemented** (per serverRelevance notes / original-game "未実装" flags / extraction gaps).

### logh7-world-state
- ✅ Game clock at **24× real time** (2 game-hours = 5 real min); dates drive CP regen + 30-day ticks + the 801-07-27 deadline.
- ✅ Session lifecycle: end on capital-capture / ≤3-systems / deadline; restart from initial conditions.
- ✅ Win/loss evaluation (4 tiers, Decisive/Limited/Local/Defeat) including the pop-tie→Alliance rule and Empire-only capital-card-presence check.
- ✅ Strategic grid model: 100 ly cells, 3 grid types, **300/faction unit cap**, **2-faction cap** (regular vs rebel distinct), terrain impassability (plasma storm / Sargasso) — aligns with 0x0313/0x0315 (terrain type2 already observed).
- ✅ Spot/facility occupancy tracking; respawn default = birthplace / return-planet.
- ✅ Occupation state transitions (card transfer, confiscation, facility transfer, Imperial-House jurisdiction).
- ⚠️ **Economy** (tax from planets, tax/tariff/aid commands, 政府支持率, 治安維持率, 影響力) — manual itself says **economy 未実装** in the original; rules are specified but likely a major unimplemented surface.
- ⚠️ **Coup/revolt subsystem** (叛意/謀議/説得/叛乱/参加/査閲, 叛乱忠誠度, decisive-victory "no coup" gate) — full ruleset given, likely not yet built.
- ⚠️ **Phezzan neutrality + occupation penalty** — explicitly **未実装** in original.
- ⚠️ **Espionage state** (infiltration/intel/sabotage/agitation/intrusion, arrest list, 拘禁/処断) — likely not implemented.
- ⚠️ **Warp-error deviation** and **航続 ≥ 100** fuel gating — movement-validation detail likely missing.

### logh7-command-engine
- ✅ Command-point model: PCP/MCP pools, per-command `{type, cost}`, zero-cost bypass, **2× substitution**, offline regen, battle-time suspension.
- ✅ Full **78-command CP/wait/duration table** (§10) as canonical price/timing data — including variable ranges (作戦計画 10–1280, 発令 1–320, 燃料補給 dur 48–960).
- ✅ Command gating by held **職務権限カード** (16-card cap; baseline 個人+艦長).
- ✅ Movement command taxonomy (4 tiers; warp adjacency rule; star-system staging).
- ✅ Allocation/reorg/replenish mutual-exclusion locks; replenish single-type + same-class source + crew-auto + crew-shortage block.
- ✅ Tactical ship commands with exact wait/duration timers (§9.11) — maps to 0x0400/0x0423/0x0424 family.
- ⚠️ **Operation-plan / 発令 pipeline** (drafting≠issuing separation, target validation, global unit cap, 30-day results, sweep 400-ly per-kill bonus) — detailed but likely not fully wired.
- ⚠️ **CP→ability XP accumulation** (per-quantum +1, 100→stat+1, exclude 代用) — provisional growth path likely missing.
- ⚠️ **Command-range-circle** resource (grow-to-cap, reset-on-issue, 指揮-driven rate, 0–20s startup) — tactical command-authority detail likely missing.

### logh7-battle-engine
- ✅ Tactical start/end triggers (grid co-occupation; planet/fortress occupation-to-end).
- ✅ Flagship 6-system energy budget (BEAM/GUN/SHIELD-4-facing/ENGINE/WARP/SENSOR) and posture system (4 postures; Combat trade-offs).
- ✅ Line-of-fire occlusion; piercing fortress-cannon friendly-fire; per-shot ammo (ガン消費/ミサイル消費).
- ✅ Ground battle (30/faction box, defense bar, planet-type eligibility, garrison annihilation).
- ✅ Unit damage model (flagship 1-hull; ship 300-hull attrition; 工作艦 repair; cargo scaling).
- ✅ Automatic scouting (shared fog-of-war, success-OR-wins, stationary bonuses, SENSOR allocation).
- ✅ Eval/merit awards on kill/occupy and rank-keyed death award (准将+).
- ⚠️ **Fighters (戦闘艇)** — explicitly **未実装** in original (flat-10 launch cost, slow/intercept effects).
- ⚠️ **Combat death (戦死)** toggle — explicitly **未実装** (default = injure+warp).
- ⚠️ **Surrender-recommendation (降伏勧告)** and morale (艦隊最大士気, low-morale uncommandable) — likely partial/missing.

### logh7-personnel
- ✅ Character record schema (0x0323): descriptive + progression + 8 abilities (PCP/MCP).
- ✅ Rank ladders (per-rank, per-track military/politician), **5-law comparator** (skip decorations), **rank headcount caps** (§5.4), personnel-authority-by-tier (§5.5).
- ✅ Promote/demote mechanics (merit→0 / →100, card-revoke-except-個人/艦長/封土), auto monthly (#1) + 30-day checks.
- ✅ Appointment validation (range + strictly-lower-than-appointer); top-down 任命/罷免.
- ✅ Faction org registries (§11) with per-role quota/minRank/appointer; faction-divergent appointment edges.
- ✅ Two-currency system (per-session evaluation vs persistent fame; original-char selection spends fame).
- ✅ Class-change commands (退役/志願 with 少佐+戦艦 reset, 30-day lockout); defection detain/judge flow.
- ⚠️ **Peerage (爵位) & fief (封土) systems** (Empire-only 叙爵/封土授与/封土直轄, 公爵…帝国騎士) — likely not implemented.
- ⚠️ **Decorations (叙勲/勲章)** — manual says decorations **unimplemented**; ladder law 3 must be skipped.
- ⚠️ **Age-effect monthly drift** + flagship-by-rank auto-swap (both flagged **provisional**) — likely not implemented.
- ⚠️ **Arrest/discipline authority matrix** + **NPC AI** for unchosen canon chars (AI **未実装**).
- ⚠️ **Relations** (友好度, 影響力 via 会見/夜会/狩猟/会談/談話) — likely missing.

### logh7-content-pack
- ✅ Faction naming + symmetric org templates; strategic unit caps (fleet 18,000 / transport 6,900 / patrol 900 / ground 900+90,000 / garrison 300,000).
- ✅ 11 warship classes + 3 faction-exclusives; subtype catalog; **Empire ship-stat tables** (§12.2–12.3) → 0x030b / ship-stats.json (armor/shield/beam/gun/missile/AA/speed/crew/term/repair/loadage/fighter).
- ✅ Troop unit catalog with attack/defense/training (§13.1); **exclude 近衛兵/擲弾兵教導/薔薇の騎士 from production**.
- ✅ Ship lore modifiers (variant deltas) for per-subtype stats.
- ⚠️ **Alliance ship numeric tables** — extraction-scrambled; cross-check `ship-stats.json` before trusting numbers.
- ⚠️ **Per-planet auto-production catalog** (自動生産品目一覧表, pp. 76–78) and **initial deployment** (p75) — values reliable, pairings **not**; require re-OCR / galaxy.json cross-check before encoding the production tick.
- ⚠️ **Crew-efficiency (乗員効率)** per ship class and per-class required-crew counts — referenced but numbers not in these pages.

### Comms / server (logh7-server, logh7-account-registry, logh7-login-session)
- ✅ Session capacity cap (2000), authoritative command processing, session re-entry restriction.
- ✅ Mail (1 personal + per-card addresses, 100-book cap, 120-inbox cap, defection wipe, tactical suspend), Messenger (1:1 FSM), Chat (spot/grid/tactical scopes; 3 tactical channels).
- ✅ Persistent fame at account level (logh7-account-registry); original-char eligibility + lottery (login-session).
- ⚠️ Mail/Messenger/Chat are server-relayed comms features — verify whether the full address-book + 名刺交換 + new-mail-flag push are implemented (likely partial).

### Cross-module flags (most likely unimplemented per facts)
1. **Economy** (taxes, tariffs, aid, approval/security/influence) — original 未実装.
2. **AI** for unchosen canon characters — original 未実装.
3. **Fighters & combat death** — original 未実装.
4. **Phezzan occupation** — original 未実装.
5. **Coup, espionage, arrest/judgment** subsystems — full rules given, likely unbuilt.
6. **Peerage/fief/decorations** (Empire honors) — likely unbuilt; decorations 未実装.
7. **Operation-plan/発令 lifecycle**, **CP→XP growth**, **command-range-circle**, **age drift** — detailed but likely missing.
8. **Auto-production & initial-deployment data tables** — extraction pairings unverified; do not encode without cross-check.

---

## 22. 좌표 재추출 결과 — galaxy 행성명 17 교정 · 초기배치 인코딩 (2026-06-19)

> `gin7manual.pdf` 좌표 재추출(PyMuPDF) + 적대적 재검증(`docs/logh7-content-verify-adversarial.md`) 결과를 캐논 콘텐츠 파일에 반영한 기록. p75 部隊初期配置는 회전=0 정상 가로 텍스트라 좌표 비닝으로 완전 재현(uncertain 0).

### 22.1 `content/initial-deployment.json` 신규 (P1)
- 구조 `{imperial,alliance}.{fleet[],patrol[],ground[]}`. fleet=`unit`키(병합셀 페어는 두 함대 모두 동일 system/planet — 셀 vertical offset +3.8px 페어 전파로 추출). patrol/ground=`{from,to}` 범위.
- 유닛카운트(검증): **제국 fleet12/patrol59/ground60, 동맹 fleet12/patrol60/ground60.**
- **제국 patrol 第48 = 매뉴얼 source gap** 보존(47-47 → 49-49 직행, 텍스트검색 第48 0회).
- **제국 patrol 第53~60 = 매뉴얼 system/planet 공란** → `{from:53,to:60,system:null,planet:null,note:"blank in manual"}`.
- 요새(イゼルローン/ガイエスブルク/レンテンベルク/ガルミッシュ/ルドミラ)는 `planet_type:"fortress"`(`content/fortresses.json` 정합).
- galaxy.json으로 system명 정규화, 매뉴얼 상이 표기는 `system_raw`/`planet_raw` 보존(14건). 정규화 매핑(매뉴얼→galaxy): シュバーラ→シュパーラ, ニブルヘイム→ニヴルヘイム, バルドレ→バルドル, ルイトボルディング→ルイトポルディング, ロフォーデン→ロフォーテン, ヴィテルスバッハ→ヴィッテルスバッハ, ヴィレンンシュタイン→ヴィレンシュタイン, サンア・アナ→サンタ・アナ(OCR단편).

### 22.2 KNOWN cross-source MISMATCH — フレイア/レンテンベルク
- 배치표(p75)는 제국 第6·7艦隊 및 第41~43巡察隊 HQ를 **フレイア / レンテンベルク**로 인쇄하나, `content/galaxy.json`의 フレイア 행성목록(p101 星系図 주석)엔 レンテンベルク **부재**(=別 행성). 값은 **인쇄 그대로 기록**(initial-deployment.json planet=レンテンベルク, fortresses.json `fortress_rentenberg`도 system=フレイア). フレイア 행성목록 재검증 시 revisit.

### 22.3 `content/galaxy.json` 행성명 17 탁점/전사 교정 (P1) — 및 **하류 전파 필요(미완)**
- 매뉴얼 철자가 더 정확(auto-production §2 verified). 적용 방향 = **현 galaxy 철자 → 매뉴얼 철자**(17건, `"name"` 라인만 최소 diff):
  ギンヌンガガガブ→ギンヌンガガプ · テルモビュレー→テルモピュレー · ラブンストラップ→ラヴンストラップ · ニーダー・ヴィンデンボルン→ニーダー・ヴィンディンゲ · ヴァルテンキルヒェン→パルテンキルヒェン · イーヴァンルディ→イーヴァルディ · カバール→カパール · フリングオルニ→フリングホルニ · ヒミンギョルグ→ヒミンビョルグ · ギャランホルン→ギャラルホルン · ボーデルスベルグ→ボーデルスベルク · タフテ・ジャムジード→タフテ・ジャムシード · アバダナ→アパダナ · ビエヴェッタ→ピエヴェッタ · ボルケーゼ→ボルゲーゼ · バグタプール→バクタプール · スボルヴェア→スヴォルヴェア.
  - ⚠️ 과제 프롬프트의 예시 화살표(`バクタプール→バグタプール` 등)는 content-verify §2의 `↔` pair 식별을 단방향으로 옮겨 적은 것으로 보이며, **권위 규칙은 "매뉴얼이 더 정확"**이라 위 방향(현 galaxy→매뉴얼)이 유일하게 정합. 17건 모두 현 galaxy 철자만 존재·매뉴얼 철자 부재로 방향 무모호.
- **⚠️ 하류 전파 필요(이 트랙 ownership 밖이라 미적용)**: 위 17건은 **`jp`-key sidecar `content/names/planets-ko.json`**(jp→ko 281엔트리)와 **2개 테스트**가 옛 철자에 하드코딩됨. galaxy 교정 후 17 행성의 `name_ko` 룩업이 **전부 null로 silent 회귀**(룩업 = `planetKoByJa.get(name_ja)` 정확일치, `src/server/logh7-content-source.mjs:60`). 테스트로 잡히는 건 `バグタプール`(→`バクタプール`) 1건이라 **server suite 2건 fail**:
  - `tests/server/logh7-content-pack.test.mjs` — "recovered content DB drives a valid content pack" (manual planet names stay orbit-ordered with KO labels)
  - `tests/server/logh7-strategic-grid-provenance.test.mjs:96~101` — lumbini.planets 기대값
  **필요 후속(별도 ownership 트랙)**: (a) `content/names/planets-ko.json`의 해당 17 `jp` 키를 매뉴얼 철자로 갱신(ko 음차는 기존값 유지 가능 — 테스트가 `바구타푸루`를 그대로 기대), (b) 위 2 테스트 기대값을 `バクタプール`로 갱신. 적용 전까지 `npm run test:server` = 917/919.
