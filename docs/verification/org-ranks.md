# Verification Report — Organizations / Posts / Ranks / Abilities / Growth / Nations / Social Classes

Domain owner: org-ranks verification agent
Date: 2026-06-14
Verdict: **mostly-trustworthy** (4 field-level mismatches + 1 invented rank found; all other values match ground truth)

## Ground-truth sources used
- `gin7manual.pdf` p13–14 — character parameter/ability definitions, 爵位, 出自, growth rules (vision + `.omo/work/manual.layout.txt` pages 14–15)
- `gin7manual.pdf` p34–35 — 功績と階級: rank-ladder laws, person limits, 人事権 (layout pages 35–36)
- `gin7manual.pdf` p55–57 — 別表 帝国軍組織構成表 (empire org/post table) — **read via vision** (PDF pages 56–58)
- `gin7manual.pdf` p61–63 — 別表 同盟軍組織構成表 (alliance org/post table) — **read via vision** (PDF pages 62–64)
- Binary `data/MsgDat/constmsg.dat` (via trustworthy `content/extracted/msgdat-full.json`):
  - rank ladder = records **479 (元帥, top) → 497 (二等兵, bottom)**
  - ability names = records **759–766**

## JSON / tables checked
- `content/manual/org-posts.json` — empire (58) + alliance (63) posts
- `content/logh7-content.db` tables: `ranks`, `abilities`, `growth_rules`, `nations`, `social_classes`, `posts`, `roster`

---

## 1. Abilities (8) — VERIFIED (with one inherited manual typo)

Binary `constmsg.dat` recs 759–766 list exactly 8 abilities in order:
**統率, 政治, 運営, 情報, 指揮, 機動, 攻撃, 防御** — matches `abilities` table in content.db and manual p13–14.

- The standalone string `運用` does NOT exist in the binary; the ability is `運営`.
- The manual's own CP-growth list (p14) prints `PCP:[統率][政治][運用][情報]` using **運用**, while the parameter table on the same/prior page uses **運営**. This is a **manual internal inconsistency**, not an AI error. content.db `growth_rules` row 5 faithfully reproduces the manual's `運用`. Classified VERIFIED.

## 2. Rank ladder (military) — 1 AI-INVENTED rank

Binary `constmsg.dat` is authoritative: **19 military ranks** (recs 479→497):

`元帥 / 上級大将 / 大将 / 中将 / 少将 / 准将 / 大佐 / 中佐 / 少佐 / 大尉 / 中尉 / 少尉 / 准尉 / 曹長 / 軍曹 / 伍長 / 上等兵 / 一等兵 / 二等兵`

- **AI_INVENTED:** content.db `ranks` has **20** rows because it inserted **兵長** (id=4) between 上等兵 and 伍長. `兵長` does NOT exist anywhere in the binary (the sequence is 伍長→上等兵 directly). Manual p13 only fixes the endpoints (二等兵 bottom, 元帥 top) and does not enumerate enlisted ranks, so the manual neither confirms nor denies — but the binary definitively excludes 兵長.
- 上級大将 is **empire-only**: manual p34 person-limit table omits it for 同盟軍, and the alliance org table never uses it (verified: no alliance post lists 上級大将). VERIFIED.
- The **politician** rank ladder is mentioned (manual p34: ladders split 軍人用/政治家用) but never enumerated in manual or binary → ladder names UNVERIFIABLE beyond "shares military names." content.db only stored the military ladder.

## 3. Person limits & ladder laws — VERIFIED
Manual p34 person limits exactly match content.db `growth_rules` row 9:
empire 元帥5/上級大将5/大将10/中将20/少将40/准将80/大佐以下=無制限; alliance same minus 上級大将.
Five ladder laws (功績→爵位[帝国のみ]→勲章[未実装]→影響力→全パラメータ合計) match manual p34. VERIFIED.

## 4. Posts — empire 58 / alliance 63

Spot-checked every distinct org block against the vision-read tables.

### Empire — 1 MISMATCH (国務尚書)
| Post | JSON | Ground truth (manual p56) | Verdict |
|---|---|---|---|
| 国務尚書 | min=元帥, max=元帥 | merged **政治家** cell — **no rank requirement** | MISMATCH |

All other empire posts (大本営参謀 cap10 准将~元帥, 軍務省次官 上級大将~元帥, 艦隊参謀 cap6 大尉~元帥, 諜報官 cap50 少尉~大佐, 惑星総督 either/准将~元帥, etc.) — **VERIFIED**.

### Alliance — 3 MISMATCH + 2 folded-name issues
| Post | JSON | Ground truth (manual p63/64) | Verdict |
|---|---|---|---|
| 経理部長 | min=少将,max=元帥,military | merged **政治家** cell — no rank, politician | MISMATCH |
| 教育部長 | min=少将,max=元帥,military | merged **政治家** cell — no rank, politician | MISMATCH |
| 衛生部長 | min=少将,max=元帥,military | merged **政治家** cell — no rank, politician | MISMATCH |
| 防衛司令部 惑星守備隊指揮官 | post_ja folds org prefix | post=**惑星守備隊指揮官**, org=防衛司令部 | MISMATCH (naming) |
| 防衛司令部 首都防衛指揮官 | post_ja folds org prefix | post=**首都防衛指揮官**, org=防衛司令部 | MISMATCH (naming) |

Root cause for the 3 rank mismatches: the JSON column-extended the 少将 rank from 装備部長/施設部長 (which DO require 少将) onto the last three 国防委員会 posts, but the manual places 経理/教育/衛生部長 in a single merged **政治家** cell (no rank). All other alliance posts VERIFIED (統合作戦本部長 min blank/max元帥, 宇宙艦隊司令長官 min blank/max元帥, 艦隊司令官 少将~元帥, 知事/首都司政官 politician, 諜報官 cap50 少尉~大佐, etc.).

## 5. Nations — VERIFIED
content.db `nations`: empire=銀河帝国, alliance=自由惑星同盟, neutral=フェザーン自治領. Matches manual/binary. (No `corridor` row present despite schema comment allowing it — not an error, just unused.)

## 6. Social classes / 出自 — VERIFIED
Manual p13: empire 出自 = 貴族/帝国騎士/平民/亡命者; alliance = 市民/亡命者. content.db `social_classes` matches exactly (6 rows). VERIFIED.
- 爵位 (帝国軍のみ): manual lists 公爵/侯爵/伯爵/子爵/男爵/帝国騎士 but states "5種類" — a **manual internal count ambiguity** (6 names vs "5 types"). Flagged, not an AI error.

## 7. Roster — UNVERIFIABLE in this domain
content.db `roster` (75 rows) maps posts→holder names→ranks. The post names and rank/kind structure are consistent with the verified org table, but the **holder character names** (フリードリヒⅣ世, リヒテンラーデ, ローエングラム…) are sourced from the character-name table (`content/extracted/all-names.json`, where リヒテンラーデ/ローエングラム DO appear) — that is the **character-roster domain**, not org-structure. Holder→post assignments are not part of the manual org tables and are left UNVERIFIABLE here (defer to character-roster agent).

---

## Summary counts
- VERIFIED: 8 abilities, 19-rank ladder structure (binary), person limits, ladder laws, 人事権, growth rules, 3 nations, 6 social classes, ~115/121 post field-sets.
- MISMATCH: 4 (国務尚書 rank; 経理/教育/衛生部長 rank+kind) + 2 folded post-name/org cases.
- AI_INVENTED: 1 (rank 兵長 in content.db `ranks`).
- MANUAL_ONLY (missing from content.db): politician rank ladder enumeration is impossible (manual gives none), 爵位 table & 出自 are in manual; content.db `social_classes` has 出自 but **no nobility-title (爵位) table** → MANUAL_ONLY gap.
- UNVERIFIABLE: roster holder assignments (character domain); politician ladder names.

Verified ground-truth data written to `content/verified/org-ranks.json`.
