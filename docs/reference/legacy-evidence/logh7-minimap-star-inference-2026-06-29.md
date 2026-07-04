# LOGH VII Minimap Star Inference

Date: 2026-06-29

## Scope

This note records a P3 visual-inference pass for the five coordinate-pending star systems:

- `アンウレガルラ` (`contentId=13`)
- `ケープホーン` (`contentId=32`)
- `コブラヴェルデ` (`contentId=34`)
- `ニーベルング` (`contentId=52`)
- `モンサルヴァール` (`contentId=75`)

No server data, DB data, or canonical `galaxy.json` coordinates were changed.

## Sources

- HUD minimap crop: `docs/reference/ui-catalog/toshichan.my.coocan.jp/976091_map.jpg`
- Full strategy screenshot crosscheck: `docs/reference/ui-catalog/toshichan.my.coocan.jp/74fcc3_strategy.jpg`
- Manual star chart: `docs/reference/gin7manual-saved-starchart.pdf`, page 101
- Current positioned data: `server/content/galaxy.json`
- Current passable mask: `server/content/galaxy-passable-cells.json`

Generated artifacts live under `RE/.omo/ghidra/minimap/`.

## Results

The first minimap subtraction produced 27 numbered review candidates. The user visually accepted:

`9, 11, 12, 13, 14, 15, 16, 17, 18, 19`

and rejected all other numbered candidates as not stars.

The manual was re-extracted independently:

- `acceptedStarDots=80`
- `rejectedAnnotationMarkers=80`

`server/content/galaxy.json` has 80 positioned systems and 5 coordinate-pending systems. Therefore all ten accepted minimap clusters cannot be new systems. At least five accepted clusters must be either minimap parse noise, minimap-only decoration, or corrected/minimap-render positions for existing 80 systems.

## Reconciliation

Most likely remaining missing-system candidates:

| Candidate | Game cell | Side | Passable | Nearest existing positioned system |
|---:|---:|---|---|---|
| 9 | `(17,43)` | alliance-left | yes | `ポリスーン` at distance `4.472` |
| 11 | `(23,39)` | alliance-left | yes | `ライガール` at distance `3.162` |
| 12 | `(31,8)` | alliance-left | yes | `シヴァ` at distance `3.162` |
| 13 | `(37,37)` | alliance-left | yes | `ガンダルヴァ` at distance `3.606` |
| 19 | `(77,19)` | empire-right | yes | `ヤヴァンハール` at distance `5.831` |

Most likely existing-80 correction/noise block:

| Candidate | Game cell | Passable | Nearby existing systems |
|---:|---:|---|---|
| 14 | `(59,6)` | yes | `ビルロスト`, `アムリッツァ`, `イゼルローン` |
| 15 | `(59,16)` | yes | `アムリッツァ`, `イゼルローン`, `ヴァンステイド` |
| 16 | `(60,20)` | yes | `ヴァンステイド`, `アムリッツァ`, `トラーバッハ` |
| 17 | `(60,25)` | no | `トラーバッハ`, `ヴァンステイド`, `アルメントフベール` |
| 18 | `(61,31)` | yes | `アルメントフベール`, `トラーバッハ`, `アイゼンヘルツ` |

Rationale: `14-18` form a near-vertical strip along the central boundary and align with the row band of existing Empire/corridor systems. This pattern is more consistent with a projection/render duplicate or central-boundary parsing artifact than with five independent missing systems. Candidate `17` is additionally blocked by the current passable mask, so it is unsafe as a new marker without terrain changes.

## Open Issue

The remaining five candidates create a `4 left / 1 right` distribution. That conflicts with the weak name-theme prior that both `ニーベルング` and `モンサルヴァール` are Empire-like names. Because name-theme is only P3, do not force a name assignment yet.

Name-theme refinement:

| Name | Theme | Theme-side inference |
|---|---|---|
| `アンウレガルラ` | ancient Mesopotamian/Sumerian-like myth name | alliance-like |
| `ケープホーン` | real-world geography/toponym, Cape Horn | alliance-like |
| `コブラヴェルデ` | Verde/geography-flavored name; echoes `リオ・ヴェルデ` | alliance-like |
| `ニーベルング` | Nibelung / Germanic-Wagneric legend | empire-like |
| `モンサルヴァール` | Montsalvat/Monsalvat: real-world artists' colony/place name in Australia; name also appears in Grail/Parsifal/Wagner context and is described as Catalan for "Saved Mount" | alliance-leaning under the `4 left / 1 right` five-candidate constraint; not as strongly Empire-coded as `ニーベルング` |

So the current best P3 reading is close to the user's intuition: if the reconciled five candidates are correct, the only strongly Empire-like missing name is `ニーベルング`; the other four can plausibly sit on the Alliance side by the existing broad myth/geography/place-name pattern. Exact left-side ordering remains unresolved.

External note: the English Wikipedia page for Montsalvat describes it as an artists' community in Eltham, Melbourne, and its etymology section ties the name to both Grail/Parsifal/Wagner usage and Catalan "Saved Mount." This supports treating `モンサルヴァール` as culturally mixed/place-name themed rather than strictly Empire/Germanic.

Next evidence needed:

- another independent strategy HUD minimap screenshot, or
- live capture of the canonical client after 80-system and experimental 85-system overlays, or
- a deliberately gated server overlay that can A/B `14-18` as corrected existing coordinates versus `9/11/12/13/19` as new systems.

## Artifacts

- `RE/.omo/ghidra/minimap/minimap_review_candidates_numbered.json`
- `RE/.omo/ghidra/minimap/minimap_user_filtered_star_candidates.json`
- `RE/.omo/ghidra/minimap/manual_json_minimap_candidate_compare.json`
- `RE/.omo/ghidra/minimap/minimap_existing80_cluster_match.json`
- `RE/.omo/ghidra/minimap/minimap_candidate_count_reconciliation.json`
- `RE/.omo/ghidra/minimap/minimap_missing_system_assignment_p3_v2.json`
- `RE/.omo/ghidra/minimap/missing_system_name_theme_classification.json`
- `RE/.omo/ghidra/minimap/minimap_reconciled_five_candidates.png`
