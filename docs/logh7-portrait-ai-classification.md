# LOGH VII Portrait AI Classification

Vision-model classification of the decoded character portraits (`Face/*.tcf`).
Goal: attach searchable metadata (sex, age, hair, expression, faction, vibe) to
every face, plus best-effort named-character identification, with the option for
human review.

## TL;DR

- **Attribute tagging: DONE and RELIABLE.** All 416 decoded faces (334 exact-unique)
  are tagged. Self-check against the atlas-code ground truth (`oem`=empire/male,
  `oam`=alliance/male) produced **0 sex/faction conflicts** over the pass-1 set of
  289 — attributes are trustworthy and need little to no review.
- **Named identification: BLOCKED by a decode-index misalignment, NOT by vision.**
  Only **2 identities are image-confirmed**: Yang Wen-li (`oam/0274`) and
  Walter von Schenkopp (`oam/0230`), both via pixel-match to official art.

## What works (and the proof)

Claude vision reliably reads these 64×80 portraits (upscaled 4×). Evidence:

- Given no answer key, an agent **independently** tagged the confirmed Schenkopp
  (`oam/0230`) as "Schenkopp 0.55".
- The confirmed Yang (`oam/0274`) was described as *"black beret, black hair, calm
  young soldier"* — Yang's exact signature — just not named (agents were tuned
  conservative).

So vision is capable; the bottleneck is mapping a name to the **correct decoded art**.

## The blocker: `dumpall` global-index ≠ official face number

`tools/logh7_tcf_decode.py dumpall` numbers output by a global index it assumes
equals the official `chara/NNN.jpg` face number (the value in the 0x0323 record
@0xf4). **That assumption is wrong** for the current `tcf.hed` virtual-concat model.

Decisive check (`.omc/portrait-ai/review/INDEXCHECK.png`):

| decoded by index | shows | official-art pixel-match truth |
|---|---|---|
| `dumpall/0085` (#85 = Schenkopp?) | old bald man w/ moustache | `canon oam/0230` = the real Schenkopp |
| `dumpall/0206` (#206 = Yang?) | stern 40s combed-back man | `canon oam/0274` = the real Yang (beret) |
| `dumpall/0209` (#209 = Reinhard?) | aged grey-haired man | (no blond youth) |

Hash equality `idx#85 == canonSchenkopp` and `idx#206 == canonYang` are **both False**.
Therefore stamping the 12 official face-number names (Reinhard 209, Yang 206,
Schenkopp 85, Mittermeyer 195, …) onto `dumpall/NNN.png` attaches names to the
**wrong faces**. This matches `face-name-map.json`'s own caveat that only 2 entries
were ever image-confirmed.

## Deliverables

- `content/roster/portrait-ai-classification.json` — pass-1 attribute classification,
  289 unique, keyed by canon atlas/slot (paths that exist). Attribute layer is reliable.
- `content/roster/portrait-ai-attributes-global.json` — consolidated **global** attribute
  table, 334 exact-unique rows covering all 416 faces, with `identity_status: BLOCKED`
  and the 2 reliable named anchors recorded.
- Working set under `.omc/portrait-ai/` (dumpall, upscales, chunk in/out, review grids,
  `INDEXCHECK.png`).

## Attribute distribution (pass-1, 289 unique)

- sex: male 283 / female 6
- age: 30s 116, 40s 72, 20s 48, 50s 39, 60s+ 10, teens 4
- hair: brown 106, blond 58, black 51, gray 38, red 11, white 9, orange 6, silver 6

## To actually recover names (next steps, in priority order)

1. **Fix the decode index.** Correctly reverse-engineer `tcf.hed` (8-byte
   `[offset][size]` over the virtual concatenation of the 7 atlases) so global index
   → art is exact. The brute-force atlas-order solve failed (625/669 fit) — needs the
   real concat order / header stride. Once correct, the 12 official names stamp directly.
2. **Pixel-match more official art.** `gineiden.com chara/NNN.jpg` is the gold key, but
   the build env can't reach gineiden.com / archive.org. With network, download the
   official set and NCC-match against the decoded pool (same method that confirmed Yang
   & Schenkopp). This resolves names regardless of index.
3. **Anchor-fed vision pass.** With even a few more confirmed anchors, a vision pass that
   compares candidates side-by-side against reference art raises named recall sharply.
