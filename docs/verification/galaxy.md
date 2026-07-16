# Galaxy Domain Verification — LOGH VII Revival

**Verdict: mostly-trustworthy.** The system names and the map coordinates are
genuinely sourced (not AI-invented). Planet names are ~68% attested. Faction is
partly verified. The earlier "json은 ai가 만든 것" warning is only partially
justified for this domain: the *structure* (80 systems, coordinates) is real,
but ~89 planet names and 46 faction labels have **no ground-truth source**.

## Sources used (ground truth)

| Source | What it gives | Trust |
| --- | --- | --- |
| `content/extracted/msgdat-full.json` | Decoded client `data/MsgDat/*.dat` strings (4,847 non-empty records) | Trustworthy (task-declared 100% byte-verified) |
| `.omo/work/manual.layout.txt` | Official manual text (101 pages) | Trustworthy |
| `gin7manual.pdf` page 101 | Star-map figure + **80 `/Text` annotations** with Rect coords | Trustworthy (positions), contents encrypted |
| `ROOT/data/model/strategy/Null_galaxy.mdx` | Client 3D galaxy index | Trustworthy |
| `ROOT/data/model/strategy/galaxy.mdx` | Galaxy visual map model (galaxy.lwo, bitmaps) | Trustworthy |

`ROOT = .omo/work/installed/____________s___/____`

## JSON under test

`content/galaxy.json` — 80 systems, 281 planets, 6 fortresses; each system has
`system`, `planets[{name,orbit}]`, `fortresses[]`, `rect`, `cx`, `cy`,
`faction`, `page:101`. `_source` claims: *"gin7manualsaved.pdf 星系図 special
Text annotations (80 systems)"*.

## Findings

### 1. System names — VERIFIED (80/80)
All 80 katakana system names appear verbatim in the decoded client MsgDat
corpus. 59/80 also appear in the manual body text. These are real game systems.

### 2. Coordinates (rect / cx / cy) — VERIFIED SOURCE (not AI-invented)
The PDF manual page 101 (the galaxy star map) carries exactly **80 `/Text`
annotation objects** (`/Subtype/Text`), matching the JSON's claimed source.
Comparing the JSON `cx` values to the PDF annotation rect centers:

- `cx`: sorted distributions fit **m = 1.0000, c = 0.00, max error = 0.00** (exact)
- `cy`: **m = 1.0002, c = −59.62, max error 56** (perfect monotone linear; constant
  offset from a different y-origin/flip convention)
- All rects are uniform 20×22 boxes in **both** the PDF and the JSON.

Conclusion: the coordinates were genuinely extracted from the 80 page-101 Text
annotations. They are **NOT fabricated**. (Annotation `/Contents` are
RC4-encrypted in the raw stream, so the names-from-annotation link could not be
re-decoded here, but all 80 names are independently confirmed via MsgDat.)

### 3. Planet names — PARTIALLY ATTESTED (192/281)
- In manual text: **192/281**
- In MsgDat strings: only 10/281 (planets are mostly not message strings)
- Attested in *either* source: **192/281 (68%)**
- **Attested NOWHERE: 89/281 (32%)** → AI_INVENTED candidates.
  Examples: `バグタプール`, `スボルヴェア`, `エイクロン`, `カスケード`,
  `バラトループ1`, `バラトループ2` (numeric suffixes — clearly synthesized),
  plus a Hindu-mythology cluster (`パールヴァティ`, `ガンガー`, `ナンディ`,
  `アナンタ`, `ヴァルナ`) under the Indian-themed ルンビーニ region — plausible
  but unsupported by any ground-truth source.

### 4. System→planet/fortress pairings — VERIFIED (manual p75 deployment table)
The manual "部隊初期配置情報" table (p75) gives authoritative system→planet and
system→fortress pairings. 34 deployment pairings checked; **all 34 match the
JSON** (4 apparent mismatches are katakana transcription variants:
ニブルヘイム/ニヴルヘイム, ルイトボルディング/ルイトポルディング, バルドレ/バルドル,
ヴィテルスバッハ/ヴィッテルスバッハ, フリングホルニ/フリングオルニ).

### 5. Fortresses — VERIFIED names (6/6 in manual)
| JSON fortress | System | MsgDat | Manual | Note |
| --- | --- | --- | --- | --- |
| ルドミラ | ロフォーテン | no | yes | manual p75 |
| ダヤン・ハーン | ポリスーン | no | yes | manual p75 |
| イゼルローン | イゼルローン | yes | yes | |
| ガイエスブルク | アイゼンヘルツ | no | yes | manual spells it both ガイエスブルク and ガイエスブルグ |
| レンテンベルグ | フレイア | no | yes | manual p75 |
| ガルミッシュ | キフォイザー | no | yes | manual p75 |

All 6 are real LOGH fortresses present in the manual deployment tables.

### 6. Faction — PARTIALLY VERIFIED
- **34 systems** match the manual p75 deployment army split (帝国軍 = empire,
  同盟軍 = alliance) **exactly, 0 mismatches**.
- **フェザーン = neutral** is confirmed by manual p41 ("フェザーン自治領は中立").
- **46 systems** have faction = lore-inferred with **no source attestation**.
- IMPORTANT: faction does **NOT** correspond to the page-101 map marker colors
  (green left / cyan right). The JSON has empire systems on the left side
  (太陽系, シリウス, ヴェガ, イゼルローン…) and alliance systems on the right —
  i.e. faction is assigned by canon, not read off the colored map.

### 7. Client 3D index (Null_galaxy.mdx) — has NO names
`Null_galaxy.mdx` enumerates **79** star nodes named generically
`star_01_G … star_79_G` (suffix = spectral class: 21×M, 19×G, 17×K, 8×F, 7×A,
5×B, 2×O) plus `bh_01..03` (black holes) and `ns_01..03` (neutron stars). It
contains **zero** Japanese system/planet/fortress names. So the binary geography
index attests a **count of 79 stars** (vs JSON's 80 systems) but cannot attest
any name. `galaxy.mdx` is only the visual map (`galaxy.lwo`, bitmaps, 2 layers).

## Classification tally

| Class | Count | Items |
| --- | --- | --- |
| VERIFIED | 80 system names + 192 planet names + 6 fortress names + 34 faction labels + all 80 coordinate records | names confirmed in MsgDat/manual; coords match PDF annotations |
| MISMATCH | 0 | (transcription variants only, not value errors) |
| AI_INVENTED | 89 planet names + 46 faction labels | no ground-truth source anywhere |
| MANUAL_ONLY | — | manual planet/fortress names that ARE present in JSON (no JSON omissions found) |
| UNVERIFIABLE | orbit indices (1..N), exact faction for 46 systems | no source enumerates orbital order; `_planet_order` is a self-described heuristic |

## Notes / caveats
- `page:101` in every record refers to the manual PDF page that holds the star
  map annotations — consistent and correct.
- `orbit` values: the manual lists planets per system but does not number their
  orbital order; the JSON's own `_planet_order` field admits it is *inferred*
  ("evidenced by numbered systems + capital orbit variance"). Treat orbit as
  UNVERIFIABLE.
- Binary star count is 79; JSON system count is 80. The discrepancy is because
  one JSON "system" is フェザーン (neutral hub) and the mdx may model it
  differently, or the mdx omits one. Not resolvable from available sources.
