---
name: logh7-localize
description: Localize the LOGH VII client to natural Korean — String.txt (cp949), .rsrc menus/dialogs (UTF-16LE), and the GDI font face — and write/clean any Korean UI/doc text so it reads human, not machine-translated. Triggers: "한글화", "현지화", "cp949", "폰트", "메뉴 일어", "rsrc", "humanizer", "어색한 한국어".
---

# LOGH VII — Korean Localization + Humanizer

Two jobs: (1) get Korean BYTES into the client correctly, (2) make the Korean READ naturally.

## 1. Getting Korean into the client (RE-confirmed)
- **Font face is one global string** `"MS UI Gothic"` @ VA `0x0077402c` (16-byte slot, both `CreateFontA` sites read it). Swap to `"맑은 고딕"`/`"Malgun Gothic"` in place (same-length, no cave) → all text re-renders. charset/quality already correct: `push -0x7f`(0x81 HANGEUL) + `push 4`(ANTIALIASED). Tool: `tools/logh7_encode_font_face.py`. See [[logh7-patch]].
- **`.rsrc` strings (menus/dialogs) are UTF-16LE**, NOT ACP — so they render regardless of the machine codepage. Patch via `tools/logh7_rsrc_patch.py` (RT_MENU/RT_DIALOG/RT_STRING, full section reserialize; DLGITEMTEMPLATE DWORD-alignment must be rebuilt on length change).
- **String.txt = cp949**; in-game text is GDI ANSI (`TextOutA`/`DrawTextA`, no W APIs). The machine ACP being UTF-8 (65001) is the real wall for ANSI splits — force ko-KR locale rather than re-encoding.
- Verify Korean actually renders with [[logh7-live]] (not just bytes).

## 2. Humanizer — write Korean that doesn't smell like AI
Apply when authoring or reviewing Korean UI strings, translations, or docs. Detect + fix (severity S1>S2>S3), preserving meaning:
- **Punctuation**: cut excessive commas (AI 61% vs human 26%), English-style comma placement, colon overuse.
- **Translation-ese (worst offenders)**: `~에 대해`, passive abuse `~되어진다`/`~되어`, over-hedging `~할 수 있습니다` everywhere, literal English word order.
- **Vocabulary**: replace generic predicates (`중요하다`, `다양한`, `효과적으로`), overused sino-Korean, needless plurals (`~들`).
- **Structure**: break monotone sentence rhythm; avoid the reflexive three-part list and connector overuse (`또한`, `그리고` chains).
- Keep game tone consistent (terse, military/strategic register fits LOGH); keep proper nouns (오딘/하이네센/이젤론) exact.

Grade translations P3 unless sourced from a canon/official KR release; keep JP↔KR differing by TEXT only (same binary, swapped strings/face) — that is the project goal.
