# LOGH VII — POST / 職務 → ALLOWED-ACTIONS Permission Matrix

What each official post (직위/職務) in 銀河英雄伝説Ⅶ can actually do: the command
categories and specific powers it grants, grouped by faction and scope, with a
reverse "command → who can issue it" index for all 81 strategy commands.

## Provenance tags (read this first)

Every claim is tagged so RE-confirmed facts are never confused with lore-derived inference:

- **P0** — RE-confirmed gate. A check enforced in the client decompile
  (`.omo/ghidra/export/G7MTClient`) or the authoritative server
  (`src/server/*.mjs`). Cited by Ghidra `FUN_…` address or `file:line`.
- **P1** — Official manual / in-game canon. Stated verbatim in the gin7 manual
  (`.omo/work/gin7manual.txt`) or the game's own `constmsg.dat` post-description
  strings (`content/extracted/msgdat-full.json`, group 0x06). Cited by manual
  page or constmsg record id.
- **P2** — Manual candidate. Strongly implied by P1 text but not stated as an
  explicit grant (e.g. a power named in a post's description without "권한/직권").
- **P3** — Inferred. Our design reading, not present in any source. **Never
  treat P3 as original/confirmed.**

### The single most important finding (P0 / P1)

The whole permission system is driven by ONE mechanism, stated in the manual
(p.26, "職務権限カード") and mirrored in the wire format:

> 『銀河英雄伝説Ⅶ』では、全てのコマンドは「**職務権限カード**」というものを通して
> 実行されます。…全てのキャラクターは最低限「個人」「艦長」のカードを持っています。
> …1 キャラクター当たりの職務権限カードの最大保有枚数は **16 枚** が上限。
> — gin7manual.txt p.26 (P1)

So a post does NOT grant powers directly — it grants a **job-authority card**
whose command set the holder may then execute. Consequences:

- Every character has `個人` (individual) + `艦長/함장` (captain) cards → basic
  move/operational commands, regardless of post (manual p.26, P1).
- Command **groups** are bound to **card types**, not to ranks (manual p.26–27, P1):
  - 作戦コマンド群 → `艦長カード` (all characters)
  - 個人コマンド群 → `個人カード` (all characters)
  - 指揮コマンド群 → military-operations cards (fleet/HQ command posts)
  - 兵站コマンド群 → `艦隊司令官カード` etc. (the post commanding that fleet)
  - 人事コマンド群 → personnel-authority cards (HQ / ministry posts)
  - 政治コマンド群 → "国家の中枢を握る職務権限カード" (national-core posts)
  - 諜報コマンド群 → security / intelligence posts
- The 16-card cap is **RE-confirmed**: server `MAX_SEATS_PER_OUTFIT = 16`
  (`src/server/logh7-personnel.mjs:55`), and the wire seat array in
  `NotifyInformationCharacter` 0x0356 caps `seatCount > 16` → reject
  (`logh7-personnel.mjs:223`); client apply `FUN_004c5580` caps `unit+0x270` at
  0x10. (P0)

### What the server actually enforces today (P0) vs. what the manual says (P1)

The authoritative server (`logh7-command-engine.mjs` and domain modules) gates
in-world commands on **ownership + faction + value-bounds ONLY**. It does **not**
yet check the actor's post/card before allowing a personnel/strategy/political
command. Concretely:

- Personnel 0x0704–0x0709: gated on `ownsCharacter`/`ownsOutfit` (connection owns
  the target) + `rankInBounds (1..14)` — `logh7-personnel.mjs:677,683,701`. **No
  post/card check.** (P0 = these are the only gates present)
- Strategy 0x0900–0x0906: scoped by `power` (faction id) only —
  `logh7-strategy.mjs:359,403`. No post check. (P0)
- In-world combat/move 0x0400/0x0405/0x0b01…: gated on ship/troop **ownership**
  (`owner === connectionId`) — `logh7-command-engine.mjs:283,354,481`. (P0)

Therefore: the **post → command-category** rows below are **P1 (manual/constmsg
canon)**, and the **per-command post gate** is **P1/P3** unless a server/client
gate is cited. The card mechanic that *would* enforce them is P0-confirmed in
shape (16-seat array, appoint/dismiss opcodes) but the *authority semantics*
(which card carries which command, who may appoint whom) are **not yet enforced
in code** — they live in the manual and the constmsg descriptions.

---

## 1. Sources used

| Source | Path | What it gives |
|---|---|---|
| Manual org charts | `.omo/work/gin7manual.txt` p.27 (Empire), p.28 (Alliance) | full org-structure trees |
| Manual card mechanic | gin7manual.txt p.26 | 職務権限カード, command groups → card types |
| Manual command appendix | gin7manual.txt "別表 戦略コマンド一覧表" (idx ≈54200) | 81 commands, category, CP cost, effect |
| Posts table | `content/manual/org-posts.json` (`_source: 別表 組織構成表`) | 60 Empire + 61 Alliance posts, org, capacity, min/max rank |
| Commands table | `content/manual/strategy-commands.json` (`_source: 別表 戦略コマンド一覧表`) | 81 commands, category, cost |
| Rank ladder | `content/roster/ranks.json` | 14-rung ladder per faction |
| Post titles (KO) | `constmsg.dat` group 0x03, rec 190–450 | localized post names |
| Post descriptions (KO) | `constmsg.dat` group 0x06, rec 498–758 | **appointment authority + explicit powers** |
| Institutions | `constmsg.dat` group 0x04, rec 451–476 | org/institution names |
| Appointment verbs | `constmsg.dat` group 0x0b/0x0c, rec 827–832 | 위임/승인/거부, 발령 가능/불가 |
| Personnel-action menu | `constmsg.dat` group 0x12, rec 850–946 | full 97-action master list |
| Battle command gates | `constmsg.dat` group 0x00, rec 0–3 | 기함용/전대용/사령관만/요새 사령관만 |
| Server personnel engine | `src/server/logh7-personnel.mjs` | 0x0704–0x070b opcodes, gates |
| Server command router | `src/server/logh7-command-engine.mjs` | which opcode → which domain |

`constmsg.dat` records were extracted Korean-localized (cp949); group→record
mapping via `layout.offsetTable` in `content/extracted/msgdat-full.json`
(group N = records `offsetTable[N].value … offsetTable[N+1].value`).

---

## 2. POST → ALLOWED-ACTIONS matrix

Columns: **Post (KO / JP)** | **scope** | **allowed command CATEGORIES** |
**notable specific powers** | **source**.

Scope key: `national` = state-wide policy; `hq` = central military HQ/staff;
`fleet` = field-unit command; `staff` = adviser/aide; `planet` = planetary
governance; `individual` = personal/title.

Command-category key: STR = 작전(operations), CMD = 指揮(command), LOG = 兵站
(logistics), PER = 人事(personnel), POL = 政治(political), INT = 諜報
(intelligence), IND = 個人(individual). Every post additionally gets **IND +
STR** via the universal 個人/艦長 cards (manual p.26, P1) — omitted from rows
below for brevity unless it is the *only* grant.

### 2A. EMPIRE — 銀河帝国 (org chart: gin7manual.txt p.27, P1)

#### National / sovereign (scope = national)

| Post (KO / JP) | Categories | Notable powers | Source |
|---|---|---|---|
| 황제 / 皇帝 | POL (all) | Supreme power; by convention holds 帝国軍最고사령관 + 帝国宰相 in person (親政). Appoints 군무상서·통수본부총장·우주함대사령장관 **directly** (황제가 직접 임명). | constmsg 0x06 rec 499; titles rec 191 (P1) |
| 제국 재상 / 帝国宰相 | POL (all) | Top civil officer; **권한: 내각 조직(form cabinet)**. Appoints 국무상서·내무·재무·궁내·사법·전례·과학 상서 + 서기관장. | constmsg 0x06 rec 503; rec 504–511 each say "제국재상에 의해 임명" (P1) |
| 국무상서 / 国務尚書 | POL | **권한: 행성총독 임면권** (appoint/dismiss planetary governors). Often holds 帝国宰相 "대리". Appoints 페잔 고등판무관. | constmsg 0x06 rec 504, 512 (P1) |
| 내무상서 / 内務尚書 | POL/INT | **직권: 대령 이하 군인 체포·처단** (arrest/execute ≤Captain). Civilian control internal investigation. | constmsg 0x06 rec 505 (P1) |
| 재무상서 / 財務尚書 | POL | **권한: 과세율 변경** (change tax rate). Economy. | constmsg 0x06 rec 506 (P1) |
| 사법상서 / 司法尚書 | POL/INT | **권한: 정치가 체포·처단** (arrest/execute politicians). Supreme judiciary. | constmsg 0x06 rec 508 (P1) |
| 궁내·전례·과학 상서 / 宮内·典礼·科学尚書 | — | Nominal posts ("거의 명목상의 직위"). No effective grant. | constmsg 0x06 rec 507, 509, 510 (P1) |
| 내각 서기관장 / 内閣書記官長 | staff | Assists 국무상서. | constmsg 0x06 rec 511 (P1) |

#### Central military HQ (scope = hq)

| Post (KO / JP) | Categories | Notable powers | Source |
|---|---|---|---|
| 제국군 최고사령관 / 帝国軍最高司令官 | CMD/PER | Supreme military command (황제의 군사권 분여). Appoints 제도 방위 사령관. | constmsg 0x06 rec 500, 554 (P1) |
| 막료총감 / 幕僚総監 | PER | **각 함대 참모장 임면권**; checks 군무상서's personnel power. Appoints 대본영 참모, 함대 참모장. | constmsg 0x06 rec 501, 539 (P1) |
| 대본영 참모 / 大本営参謀 | staff | Emperor's-staff + close-aide function. | constmsg 0x06 rec 502 (P1) |
| 군무상서 / 軍務尚書 (제국군 삼장관) | PER (all) | **Controls most of military personnel**; appoints 차관·인사국장·조사국장·참사관, 헌병총감, 장갑척탄병총감, 과학기술총감, 사관학교장, **함대 사령관·부사령관**, 수송/순찰 사령, 요새 사령관, 제도 수비대 지휘관. Appointed by Emperor directly. | constmsg 0x06 rec 515; rec 516–518,530,532,534,535,537,538,542,545,549,555 (P1) |
| 군무성 차관 / 軍務省次官 | PER | Assists 군무상서; appoints 군무성 참사관. Gateway to 군무상서. | constmsg 0x06 rec 516, 519 (P1) |
| 군무성 인사국장 / 軍務省人事局長 | PER | Manages ≤대령 personnel (fully manualized → low discretion). Appoints 페잔 주재 무관. | constmsg 0x06 rec 517, 514 (P1) |
| 군무성 조사국장 / 軍務省調査局長 | INT | Controls 통합정찰국 → all imperial intelligence. **Appoints 첩보관**. | constmsg 0x06 rec 518, 556 (P1) |
| 통수본부 총장 / 統帥本部総長 (삼장관) | CMD/PER | Force-org + operation planning for 우주함대. **작전과 과장 임면권**; usually concurrently holds 작전1과장. Appointed by Emperor. | constmsg 0x06 rec 520, 522–524 (P1) |
| 통수본부 차장 / 統帥本部次長 | CMD/staff | Admin chief; gateway to 총장. Appoints 통수본부 참모. | constmsg 0x06 rec 521, 525 (P1) |
| 통수본부 작전1/2/3과 과장 | CMD | Plan fleet (1과) / transport·patrol·ground (2과) / 독행함 (3과) force-org + ops. | constmsg 0x06 rec 522, 523, 524 (P1) |
| 우주함대 사령장관 / 宇宙艦隊司令長官 (삼장관) | CMD | **Operates 우주함대** per 통수본부 plans; leads troops in person on major ops. Appoints 총참모장. Appointed by Emperor. | constmsg 0x06 rec 526, 528 (P1) |
| 우주함대 부사령장관 | CMD | Operates 수송함대·순찰대. Appointed by Emperor. | constmsg 0x06 rec 527 (P1) |
| 우주함대 총참모장 / 総参謀長 | CMD/staff | Operates 독행함; **우주함대 참모 임명 직권**. | constmsg 0x06 rec 528 (P1) |
| 헌병총감 / 憲兵総監 | INT/PER | **원수 이외의 군인 체포·구속 권한**; empire-wide security. | constmsg 0x06 rec 530 (P1) |
| 장갑척탄병 총감 / 装甲擲弾兵総監 | CMD | Heads all ground forces. **Appoints 지상부대 지휘관**. | constmsg 0x06 rec 532, 548 (P1) |
| 과학기술 총감 / 科学技術総監 | — | Nominal. | constmsg 0x06 rec 534 (P1) |
| 사관학교장 / 士官学校長 | CMD(강의/講義) | Heads academy (受講/講義/兵棋演習 venue). | constmsg 0x06 rec 535; cmd "受講/講義 士官学校でのみ" (P1) |

#### Field units (scope = fleet) — 兵站(LOG) + 指揮(CMD) via fleet cards

| Post (KO / JP) | Categories | Notable powers | Source |
|---|---|---|---|
| 함대 사령관 / 艦隊司令官 | CMD/LOG | Direct field command, **충분한 재량권** over up to 18,000 ships; appoints 함대 참모, 함대 사령관 부관. | constmsg 0x06 rec 537, 540 (P1); LOG group → 艦隊司令官カード manual p.27 (P1) |
| 함대 부사령관 / 副司令官 | CMD/LOG | Second; often leads a 分艦隊. | constmsg 0x06 rec 538 (P1) |
| 함대 참모장 / 参謀長 | staff | Leads staff; right to report directly to 대본영. | constmsg 0x06 rec 539 (P1) |
| 함대 참모 / 参謀 | staff | Staff aide. | constmsg 0x06 rec 540 (P1) |
| 수송함대 사령관 / 輸送艦隊司令官 | CMD/LOG | Up to 6,900 ships; logistics backbone. | constmsg 0x06 rec 542 (P1) |
| 순찰대 사령 / 巡察隊司令 | CMD/LOG | Up to 900 ships; small-op / home-guard main force. | constmsg 0x06 rec 545 (P1) |
| 지상부대 지휘관 / 地上部隊指揮官 | CMD(ground) | Up to 900 ships + 90,000 troops; ground-war main force. | constmsg 0x06 rec 548 (P1) |
| 요새 사령관 / 要塞司令官 | CMD/LOG | Commands all fixed guns (incl. 要塞포) + logistics. Appoints 요새 수비대 지휘관, 요새 사무총감. **(`要塞 사령관만` battle-gate)** | constmsg 0x06 rec 549, 550, 551; group 0x00 rec 3 "요새 사령관만 사용 가능" (P1+P0-string) |

#### Planetary / capital (scope = planet)

| Post (KO / JP) | Categories | Notable powers | Source |
|---|---|---|---|
| 행성 총독 / 惑星総督 | POL/CMD | **Planet's supreme ruler**: economy + security + defense; may be a serving officer (무관 가능). **Appoints 행성 수비대 지휘관**. | constmsg 0x06 rec 552, 553 (P1) |
| 제도 방위 사령관 / 帝都防衛司令官 | POL(local) | Capital police + economy/production; **no military command authority**. | constmsg 0x06 rec 554 (P1) |
| 근위병 총감 / 近衛兵総監 | CMD | Commands 근위병 (imperial guard), up to 300,000; defends capital. | constmsg 0x06 rec 555 (P1) |
| 첩보관 / 諜報官 | INT | Infiltrates enemy state; espionage (capacity 50). | constmsg 0x06 rec 556 (P1) |

#### Individual / title (scope = individual)

| Post (KO / JP) | Categories | Notable powers | Source |
|---|---|---|---|
| 개인 / 個人 | IND | Universal 個人 card: 이동/회견/受講 etc. | constmsg 0x06 rec 498; manual p.26 (P1) |
| 함장 / 艦長 | STR | Universal 艦長 card: flagship operations. **(`기함용 커맨드`)** | constmsg 0x06 rec 557; group 0x00 rec 0 "기함용 커맨드" (P1+P0-string) |
| 공작…남작 / 公爵…男爵 | POL(noble) | Hereditary; **봉토·사병 소유 등 특권** → enables 叙爵/封土授与/狩猟. | constmsg 0x06 rec 558–562 (P1) |
| 봉토 / 封土 | — | Noble fief; taxes go to the lord (封土授与/封土直轄 targets). | constmsg 0x06 rec 564 (P1) |
| 정치가 / 政治家 | POL(limited) | Retired-to-politics state; can 志願 back to military. | constmsg 0x06 rec 565; cmd 志願 (P1) |
| 맹주 / 盟主 (coup) | CMD/POL | Coup leader; on success **may ascend to Emperor**. | constmsg 0x06 rec 566 (P1) |

### 2B. ALLIANCE — 自由惑星同盟 (org chart: gin7manual.txt p.28, P1)

#### National (scope = national) — 最高評議会 elected/appointed

| Post (KO / JP) | Categories | Notable powers | Source |
|---|---|---|---|
| 의장 / 議長 | POL (all) | Supreme power; elected by assembly. **Appoints every 위원장 + 통합작전본부장 + 후방근무본부 etc.** | constmsg 0x06 rec 630; rec 631–641 "의장에 의해 임명" (P1) |
| 부의장 / 副議長 | POL | Council member; acts for 의장 in absence. | constmsg 0x06 rec 631 (P1) |
| 국무위원장 / 国務委員長 | POL | **지사 임명 포함 내정 전반 권한** (domestic incl. governor appointment). Appoints 페잔 변무관, 지사, 첩보관(via 정보부장 chain). | constmsg 0x06 rec 632, 642, 688, 690 (P1) |
| 국방위원장 / 国防委員長 | POL/PER | **국방 전반 광범위 권한**; commands entire military; appoints 통합작전본부장, 후방근무본부장, **all 국방위원회 부장 (인사·전략·방위·정보·통신·장비·시설·경리·교육·위생)**, 과학기술본부장. | constmsg 0x06 rec 633; rec 645,651,654,656–666 (P1) |
| 재정위원장 / 財政委員長 | POL | **과세율 변경 권한**. | constmsg 0x06 rec 634 (P1) |
| 법질서위원장 / 法秩序委員長 | POL/INT | **정치가 체포·처단 권한**; supreme judiciary. | constmsg 0x06 rec 635 (P1) |
| 천연자원·인적자원·경제개발·지역사회·정보교통 위원장 | POL | Resource / mobilization / economy / regional / info+transport portfolios. | constmsg 0x06 rec 636–640 (P1) |
| 서기 / 書記 | staff | Assists 의장 only. | constmsg 0x06 rec 641 (P1) |

#### Central military HQ (scope = hq)

| Post (KO / JP) | Categories | Notable powers | Source |
|---|---|---|---|
| 통합작전본부장 / 統合作戦本部長 | CMD/PER | Top uniformed officer; force-org + operation planning + personnel; appoints 제1/2/3차장, 참사관, 육전총감부장. | constmsg 0x06 rec 645–650 (P1) |
| 통합작전본부 제1/2/3차장 | CMD | Plan transport·patrol (1) / 독립함 (2) / whole-army replenishment (3). | constmsg 0x06 rec 646, 647, 648 (P1) |
| 육전총감부장 / 陸戦総監部長 | CMD(ground)/PER | Ground-force personnel + ops; **appoints 지상부대 지휘관**. | constmsg 0x06 rec 650, 684 (P1) |
| 후방근무본부장 / 後方勤務本部長 | LOG/INT | All supply + home security; **appoints 헌병사령관**. | constmsg 0x06 rec 651, 655 (P1) |
| 헌병사령관 / 憲兵司令官 | INT/PER | **모든 계급의 군인 체포·구속 권한** (all ranks — stronger than Empire's 헌병총감). | constmsg 0x06 rec 655 (P1) |
| 사열부장 / 査閲部長 | INT | Internal security investigation of the military. | constmsg 0x06 rec 656 (P1) |
| 인사부장 / 人事部長 | PER | **중령 이하 처단·서훈** (≤Commander discipline/decoration). | constmsg 0x06 rec 658 (P1) |
| 방위부장 / 防衛部長 | CMD | Manages domestic garrisons; **appoints 행성/수도 수비대 지휘관**. | constmsg 0x06 rec 659, 689, 691 (P1) |
| 정보부장 / 情報部長 | INT | Controls 전략작전국 → all alliance intelligence; **appoints 첩보관**. | constmsg 0x06 rec 660, 692 (P1) |
| 장비부장 / 装備部長 | LOG | Equipment selection + force-org for 함대/수송/순찰. | constmsg 0x06 rec 662 (P1) |
| 시설부장 / 施設部長 | LOG/CMD | **Appoints 요새 사령관**. | constmsg 0x06 rec 663, 685 (P1) |
| 교육부장 / 教育部長 | PER | **Appoints 사관학교장**. | constmsg 0x06 rec 665, 671 (P1) |
| 전략·통신·경리·위생 부장 | — | Largely nominal ("거의 명목상의 직위"). | constmsg 0x06 rec 657, 661, 664, 666 (P1) |
| 과학기술본부장 / 科学技術本部長 | — | Nominal. | constmsg 0x06 rec 654 (P1) |

#### Field units (scope = fleet) — same shape as Empire

| Post (KO / JP) | Categories | Notable powers | Source |
|---|---|---|---|
| 우주함대 사령장관 / 宇宙艦隊司令長官 | CMD | Operates fleets per 통합작전본부 plans; **함대 사령관 인사권**; leads in person. | constmsg 0x06 rec 667, 729; appoints 673,678,681 (P1) |
| 우주함대 부사령장관·총참모장·참모 | CMD/staff | Operate transport·patrol / 독립함; 참모 임명 직권. | constmsg 0x06 rec 668, 669, 670 (P1) |
| 함대 사령관 / 艦隊司令官 | CMD/LOG | Up to 18,000 ships, 충분한 재량권; appoints 함대 사령관 부관. | constmsg 0x06 rec 673, 677 (P1) |
| 수송함대 사령관 / 순찰대 사령 | CMD/LOG | Up to 6,900 / 900 ships. | constmsg 0x06 rec 678, 681 (P1) |
| 지상부대 지휘관 / 요새 사령관 | CMD(ground)/LOG | 90,000 troops / all fixed guns + logistics. | constmsg 0x06 rec 684, 685 (P1) |

#### Planetary / capital (scope = planet)

| Post (KO / JP) | Categories | Notable powers | Source |
|---|---|---|---|
| 지사 / 知事 | POL | Planet's supreme ruler (economy+security+defense); **현역 군인 임명 불가** (no serving officer — explicit Alliance/Empire divergence vs 惑星総督) except wartime 군정. | constmsg 0x06 rec 688, 750 (P1) |
| 수도 사정관 / 首都司政官 | POL(local) | Capital police + economy; **no military command**. | constmsg 0x06 rec 690 (P1) |
| 첩보관 / 諜報官 | INT | Disguised infiltration / espionage (capacity 50). | constmsg 0x06 rec 692 (P1) |

#### Phezzan / pirate / lord (cross-faction)

| Post (KO / JP) | Categories | Notable powers | Source |
|---|---|---|---|
| 자치영주 / 自治領主 (Phezzan) | POL/diplo | Formal imperial vassal lord; huge economic influence over both states; grants diplomatic privileges to resident 변무관/판무관. | constmsg 0x06 rec 758 (P1) |
| 페잔 주재 고등판무관/변무관 / 駐在弁務官 | POL/INT/diplo | Diplomacy front + de-facto espionage; resident posting. | constmsg 0x06 rec 512 (Emp), 642 (All) (P1) |
| 우주 해적 / 宇宙海賊 | — | Raids merchant shipping; appears on both fronts. | constmsg 0x06 rec 757 (P1) |

> Empire↔Alliance structural symmetry note: the Empire's coup ("反乱군") branch
> reuses the imperial cabinet titles (constmsg rec 568–629) because a successful
> 맹주 ascends to Emperor; the Alliance coup ascends to 議長 (rec 695).

---

## 3. Reverse index — COMMAND → who can issue it (all 81 strategy commands)

For each of the 81 commands in `content/manual/strategy-commands.json`: the card
type that carries it (manual p.26 group→card binding, P1), the post(s) that hold
that card, and the **gate provenance**. CP cost from the manual appendix (P1).

Gate-provenance column: **RE** = a server/client check exists (cited); **MAN** =
manual states the holder/venue; **INF** = our inference from the group→card rule.

### 작전 コマンド群 — 艦長カード (ALL characters) — manual p.26 (P1)

> "全てのキャラクターが共通して保有…ほとんどが艦長カードに収められています。"
> Issuer = **any character** (everyone holds 艦長). Wire family: 0x0400–0x041e
> (battle-ops), gated on **ship ownership** only (RE: `command-engine.mjs:283`,
> `battle-ops` opcodes). Some sub-commands are flagship-only / squadron-only /
> commander-only (RE-string gates, group 0x00 rec 0–3).

| Command (JP) | CP | Issuer | Gate prov. | Source |
|---|---|---|---|---|
| ワープ航行 | 40 | any (艦長) | RE-ownership | strat-cmd; group 0x00 |
| 燃料補給 | 160 | any (艦長) | INF | strat-cmd |
| 星系内航行 | 160 | any (艦長) | INF | strat-cmd |
| 軍紀維持 | 80 | any (艦長) | INF | strat-cmd |
| 航宙/陸戦/空戦訓練, 陸戦/空戦戦術訓練 | 80 | any (艦長) | INF | strat-cmd |
| 警戒出動 | 160 | any (艦長, with 陸戦隊) | INF | strat-cmd |
| 武力鎮圧 | 160 | any (艦長) | INF (lowers govt support) | strat-cmd |
| 分列行進 | 160 | any (艦長) | INF | strat-cmd |
| 徴発 | 160 | any (艦長, occupier) | INF | strat-cmd |
| 特別警備 | 160 | any (艦長) | INF | strat-cmd |
| 陸戦隊出撃 / 陸戦隊撤収 | 80 | any (艦長) | RE (0x0421-family sortie, ownership) | strat-cmd; command-engine.mjs:469 |

Flagship/squadron/commander sub-gates inside the 作戦 set (RE-string,
`constmsg.dat` group 0x00; in-battle authority opcode 0x0420
`COMMAND_CHANGE_AUTHORITY` / 0x0421 `COMMAND_MISSION`, `battle-ops`):
- 기함용 커맨드 (rec 0) — flagship-card commands.
- 전대용 커맨드 (rec 1) — squadron commands.
- **사령관만 사용 가능 (rec 2)** — commander-only (e.g. 임무[0x0421], 소속 변경[0x0420]).
- **요새 사령관만 사용 가능 (rec 3)** — fortress-commander-only (요새포 0x0419).
Provenance: **P0** that these strings exist and that 0x0420/0x0421 are distinct
opcodes; **P1/P3** for the exact command→string binding (binding not yet enforced
in our server).

### 個人 コマンド群 — 個人カード (ALL characters) — manual p.26 (P1)

| Command (JP) | CP | Issuer | Gate prov. | Source |
|---|---|---|---|---|
| 遠距離移動 / 近距離移動 | 10 / 5 | any (個人) | INF | strat-cmd |
| 退役 | 160 | any military | MAN (then 30G-day 志願 lock) | strat-cmd |
| 志願 | 160 | any 政治家 | MAN (→ rank 少佐, flagship→戦艦) | strat-cmd |
| 亡命 | 320 | any | MAN | strat-cmd |
| 会見 | 10 | any (co-located) | INF | strat-cmd |
| 受講 / 兵棋演習 | 160 / 10 | any **at 士官学校** | MAN (venue gate) | strat-cmd "士官学校でのみ" |
| 叛意 / 謀議 / 説得 / 叛乱 / 参加 | 640/640/640/640/160 | any (coup actors) | MAN | strat-cmd; constmsg rec 566 |
| 資金投入 | 80 | any | MAN (地方資金庫/信任/支持 boxes) | strat-cmd appendix |
| 旗艦購入 | 80 | any | MAN (costs evaluation pts) | strat-cmd |

### 指揮 コマンド群 — military-operations cards (HQ + fleet command posts) — manual p.26 (P1)

> "主に軍事作戦を取り仕切る職務権限カードに収められています。" Wire: 0x0900–0x0906
> (strategy), gated on **faction(power)** only (RE: `strategy.mjs:359,403`).

| Command (JP) | CP | Issuer (post) | Gate prov. | Source |
|---|---|---|---|---|
| 作戦計画 | 10–1280 | 통수본부/통합작전본부 + 우주함대 사령장관 (operations cards) | RE-faction; post = MAN | strat-cmd; constmsg rec 520,526,645,667 |
| 作戦撤回 | 5–320 | same operations-card holders | RE-faction; MAN | strat-cmd |
| 発令 | 1–320 | same (assign units to active op) | RE-faction; MAN | strat-cmd; manual p.27 |
| 部隊結成 | 320 | fleet/HQ command card | RE (0x0903 CreateOutfit, strategy.mjs) | strat-cmd |
| 部隊解散 | 160 | fleet/HQ command card | RE (0x0906 DeleteOutfit) | strat-cmd |
| 講義 | 160 | 사관학교장/교관 **at 士官学校** | MAN (venue) | strat-cmd "士官学校でのみ" |
| 輸送計画 / 輸送中止 | 80 | 수송함대/후방근무 logistics card | MAN | strat-cmd |

### 兵站 コマンド群 — 艦隊司令官カード (the post commanding that fleet) — manual p.26 (P1)

> "［艦隊司令官カード］など、当該の艦隊を指揮するカードに収められています."
> Wire: 0x0b00–0x0c0c (logistics). Issuer = the fleet's commander (함대/수송/순찰
> 사령관, 요새 사령관). Gate = INF (no post check in `logistics.mjs`; ownership-shaped).

| Command (JP) | CP | Issuer (post) | Gate prov. | Source |
|---|---|---|---|---|
| 完全修理 / 完全補給 | 160 | fleet commander (艦隊司令官 card) | INF | strat-cmd; manual p.27 |
| 再編成 / 補充 | 160 | fleet commander | INF | strat-cmd |
| 搬出入 / 割当 | 160 | fleet commander / 요새 사령관 | INF | strat-cmd |

### 人事 コマンド群 — personnel-authority cards (HQ/ministry posts) — manual p.26 (P1)

> Wire: 0x0704–0x0709 (personnel). Server gates = **ownership + rank-bounds(1..14)
> ONLY** (RE: `personnel.mjs:701,786,810`); **the actor-post gate below is the
> MANUAL rule, NOT enforced in code.**

| Command (JP) | CP | Issuer (post) — manual authority | Gate prov. | Source |
|---|---|---|---|---|
| 昇進 (top-of-ladder +1) | 160 | personnel-card post (군무상서 / 인사부장 chain) | RE: 0x0704, rank≤14 (`personnel.mjs:786`); post = MAN | strat-cmd; constmsg rec 515,658 |
| 抜擢 (arbitrary +1) | 640 | same / higher personnel post | RE: 0x0705; post = MAN | strat-cmd |
| 降等 (arbitrary −1) | 320 | same | RE: 0x0706 (`personnel.mjs:801`); post = MAN | strat-cmd |
| 叙爵 | 160 | 황제/제국재상 (noble grant) | MAN | strat-cmd; constmsg rec 558 |
| 叙勲 | 160 | 인사부장/군무상서 (decoration) | MAN | strat-cmd; constmsg rec 658 |
| 任命 (grant a post) | 160 | the appointing post per chain (§2 "…에 의해 임명") | RE: 0x0707 CardAppointment (`personnel.mjs:703`, apply FUN_004c5580); appointer = MAN | strat-cmd; constmsg rec 504–556, 631–692 |
| 罷免 (dismiss) | 160 | the appointing post (임면권 holders: 막료총감, 국무상서…) | RE: 0x0708 CardDismisal (`personnel.mjs:746`); MAN | strat-cmd; constmsg rec 501,504 |
| 辞任 (resign) | 80 | the post-holder themselves | RE: 0x0709 CardResignation (`personnel.mjs:747`) | strat-cmd |
| 封土授与 / 封土直轄 | 640 | 황제/제국재상 (≥男爵 target) | MAN | strat-cmd; constmsg rec 564 |

Appointment-authority verbs the UI exposes for these: 위임(delegate) / 승인 /
거부 (group 0x0b rec 827–829), 발령 가능 / 발령 불가 (group 0x0c rec 831–832) —
**P0** that these gate states exist in the data.

### 政治 コマンド群 — national-core cards (의장/재상/위원장 posts) — manual p.26 (P1)

> "国家の中枢を握る職務権限カードに収められています." Issuer = national post that
> owns the portfolio. Wire: present in 0x12 action menu (rec 860–871); not yet a
> distinct server domain → Gate = MAN.

| Command (JP) | CP | Issuer (post) | Gate prov. | Source |
|---|---|---|---|---|
| 夜会 / 狩猟 / 会談 / 談話 | 320 | any noble/politician (influence play); 狩猟 needs 封土 | MAN | strat-cmd; constmsg rec 558 |
| 演説 | 320 | national/political post | MAN | strat-cmd |
| 国家目標 | 320 | 황제/제국재상 ‖ 의장 | MAN | strat-cmd; constmsg rec 503,630 |
| 納入率変更 | 320 | 재무상서 ‖ 재정위원장 (tax) | MAN | strat-cmd; constmsg rec 506,634 |
| 関税率変更 | 320 | 재무상서 ‖ 재정위원장 (tariff) | MAN | strat-cmd; constmsg rec 506,634 |
| 分配 | 320 | budget-holding national post | MAN | strat-cmd |
| 処断 | 320 | 내무/사법상서 ‖ 법질서/인사위원장 (arrest-execute権) | MAN | strat-cmd; constmsg rec 505,508,635,658 |
| 外交 | 320 | 페잔 판무관/변무관, 자치영주 | MAN | strat-cmd; constmsg rec 512,758 |
| 統治目標 | 80 | 행성총독 ‖ 지사 (per-planet) | MAN | strat-cmd; constmsg rec 552,688 |

### 諜報 コマンド群 — security/intelligence cards — manual p.26 (P1)

> Two sub-roles: military-discipline (一斉捜索…逮捕) held by 헌병/내무/사법; and
> espionage (潜入…破壊工作) held by **첩보관** (constmsg rec 556,692). Present in
> 0x12 action menu rec 918–931. Gate = MAN.

| Command (JP) | CP | Issuer (post) | Gate prov. | Source |
|---|---|---|---|---|
| 一斉捜索 | 160 | 헌병/internal-security post | MAN | strat-cmd; constmsg rec 530,655 |
| 逮捕許可 | 800 | 내무/사법상서 ‖ 법질서위원장 | MAN | strat-cmd; constmsg rec 505,508,635 |
| 執行命令 | 800 | same (delegate arrest authority) | MAN | strat-cmd |
| 逮捕命令 | 160 | the delegated executor | MAN | strat-cmd |
| 査閲 | 160 | 사열부장 / 감찰관 (detect coup) | MAN | strat-cmd; constmsg rec 656 |
| 襲撃 / 監視 | 160 | 첩보관 (vs enemy faction) | MAN | strat-cmd; constmsg rec 556 |
| 潜入工作 / 脱出工作 / 情報工作 / 破壊工作 / 煽動工作 / 侵入工作 / 帰還工作 | 160–320 | **첩보관** (espionage card) | MAN | strat-cmd; constmsg rec 556,692 |

---

## 4. Beyond the 81 — the full 97-action master menu (constmsg group 0x12)

The game's own action menu (`constmsg.dat` group 0x12, rec 850–946) lists **97**
actions — the 81 manual commands plus 16 internal-affairs / city-management actions
not in the manual appendix: 세율 변경(880), 시설 건설/휴지/재가동/폐기(881–884),
함정 건조(885), 모병(886), 예산 배분(887), 조사(888), 항로 무역(889), 선단 무역
(890), 엔진 건설(891), 메시지 변경(892), plus battle commands 출항(910)/색적(909).
These are governor/minister economic powers (P1, in-game data) wired to the
base-management records (0x031f/0x0321/0x0327/0x0329 per MEMORY) — issuer = the
planetary/fortress economic post (행성총독/지사/요새 사무총감) or the relevant
national minister. **P1** that the actions exist; **P3** for exact post binding.

---

## 5. Open items / confidence ceiling

- **Post→command-card binding is P1/P3, not P0.** The manual states the
  group→card-type rule (p.26) and each post's appointment chain + named powers
  (constmsg 0x06), but our server enforces only ownership + faction + rank-bounds.
  A future `card-authority` gate (does actor hold the card that carries this
  command?) would promote these rows toward P0; the 16-seat array (0x356 / server
  `MAX_SEATS_PER_OUTFIT`) is the P0-confirmed substrate for it.
- **No client-side post gate exists** — confirmed by decompile sweep: opcodes
  0x0704–0x0709 are C→S, the client is permissive and the server is authoritative
  (Explore agent over `.omo/ghidra/export/G7MTClient`). The "사령관만 사용 가능"
  strings (group 0x00 rec 2/3) are UI labels; the enforcing comparison is
  server-side and **not yet reversed**.
- **Manual page citations**: org charts gin7manual.txt p.27 (Empire) / p.28
  (Alliance); card mechanic + command-group→card mapping p.26; command appendix
  別表 戦略コマンド一覧表 (post-p.54 region of the txt extract). The OCR'd
  `gin7manual_djvu.txt` is lossy; the curated `content/manual/*.json`
  (`_source` = the same 別表 appendices) is the reliable machine-readable copy.
- **첩보관 espionage binding** (P1, constmsg rec 556/692) is the clearest 1:1
  command-set↔post mapping and the best candidate to enforce first.
