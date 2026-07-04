# LOGH VII Medal Korean List And Production Order - 2026-07-04

## Source

- Generated catalog: `server/content/generated/logh7-medal-mining-catalog.json`
- Original Japanese source: `server/content/client/msgdat.json` / `constmsg.dat` ids `767..818`
- Korean localized source: `server/content/extracted/dat-tables.json` ids `767..818`
- Alliance flag reference: `client-unity/Assets/ArtSource/reference/logh7-alliance-flag-pentagon-reference.png`
- Imperial crest reference: `client-unity/Assets/ArtSource/reference/logh7-imperial-double-eagle-reference.jpg`
- Imperial crest masks: `client-unity/Assets/ArtSource/reference/imperial-crest/`
- Imperial ship authority: `server/content/extracted/model-ship.json` plus `.omo/work/logh7-installed/data/model/Ship/GE/`; decoded `Thumbnail/Ship` images are proof-only for large medal ship motifs.
- Current Imperial source-lock manifest: `server/content/generated/logh7-imperial-medal-source-lock-manifest.json`

## Production Order

1. Alliance: upscale/remaster the existing 15 original icons `m_f001..m_f015` first.
2. Alliance: if the UI needs distinct art for medals beyond those 15 icon stems, create variants that preserve the same quality and use the central gold pentagon emblem from the Alliance flag.
3. Empire: create new medals from the 26 original Empire medal names. Use the exact supplied Imperial double-eagle crest when a crest appears. Use original Empire ship data for ship motifs; final large ship art requires `Ship/GE` MDX render/extract, while decoded thumbnails may only be composition proof.
4. Do not copy real-world medals, national insignia, swastikas, SS runes, Nazi symbols, hate symbols, or exact Iron Cross forms.

## Current Upscale Base

- Command: `npm --prefix server run remaster:alliance-medals-4x`
- Output: `client-unity/Assets/ArtSource/remaster/alliance-medals-4x/m_f001_4x.png..m_f015_4x.png`
- Manifest: `server/content/generated/logh7-alliance-medal-upscale-manifest.json`
- Method: deterministic Pillow LANCZOS 4x plus light sharpen, 80x80 to 320x320. This is a reproducible base pass, not the final AI/super-resolution cleanup.

## Galactic Empire Medals

| ID | Korean Name | Production |
| --- | --- | --- |
| 767 | 대쌍두독수리훈장 | create-name-driven-imperial-medal |
| 768 | 쌍두독수리무훈장 | create-name-driven-imperial-medal |
| 769 | 은하제국 대십자장 | create-name-driven-imperial-medal |
| 770 | 공일급 기사십자장 | create-name-driven-imperial-medal |
| 771 | 공이급 기사십자장 | create-name-driven-imperial-medal |
| 772 | 공일급 십자장 | create-name-driven-imperial-medal |
| 773 | 공이급 십자장 | create-name-driven-imperial-medal |
| 774 | 공일급 전공장 | create-name-driven-imperial-medal |
| 775 | 공이급 전공장 | create-name-driven-imperial-medal |
| 776 | 공삼급 전공장 | create-name-driven-imperial-medal |
| 777 | 공사급 전공장 | create-name-driven-imperial-medal |
| 778 | 공오급 전공장 | create-name-driven-imperial-medal |
| 779 | 원정부대 종군기장 | create-name-driven-imperial-medal |
| 780 | 전투공적기장 | create-name-driven-imperial-medal |
| 781 | 전상장 | create-name-driven-imperial-medal |
| 782 | 특별전공메달1 | create-name-driven-imperial-medal |
| 783 | 특별전공메달2 | create-name-driven-imperial-medal |
| 784 | 특별전공메달3 | create-name-driven-imperial-medal |
| 785 | 특별전공메달4 | create-name-driven-imperial-medal |
| 786 | 특별전공메달5 | create-name-driven-imperial-medal |
| 787 | 특별전공메달6 | create-name-driven-imperial-medal |
| 788 | 특별전공메달7 | create-name-driven-imperial-medal |
| 789 | 특별전공메달8 | create-name-driven-imperial-medal |
| 790 | 특별전공메달9 | create-name-driven-imperial-medal |
| 791 | 특별전공메달10 | create-name-driven-imperial-medal |
| 792 | 참모기장 | create-name-driven-imperial-medal |

## Free Planets Alliance Medals

| ID | Korean Name | Production |
| --- | --- | --- |
| 793 | 아레 하이네센 특별훈공대장 | upscale-original |
| 794 | 구엔 킴 호아 특별훈공대장 | upscale-original |
| 795 | 자유행성동맹 최고평의회 명예훈장 | upscale-original |
| 796 | 공화국 전쟁훈장 | upscale-original |
| 797 | 공화국 영예훈장 | upscale-original |
| 798 | 자유전사 일등훈장 | upscale-original |
| 799 | 자유전사 이등훈장 | upscale-original |
| 800 | 자유전사 3등 훈장 | upscale-original |
| 801 | 1등 영예 훈장 | upscale-original |
| 802 | 2등 영예 훈장 | upscale-original |
| 803 | 3등 영예 훈장 | upscale-original |
| 804 | 린 파오 기장 | upscale-original |
| 805 | 유스프 토파롤 기장 | upscale-original |
| 806 | 군무공로 기장 | upscale-original |
| 807 | 명예부상 훈장 | upscale-original |
| 808 | 특별전공 메달 1 | create-variant-if-unique-icon-needed |
| 809 | 특별전공 메달 2 | create-variant-if-unique-icon-needed |
| 810 | 특별전공 메달 3 | create-variant-if-unique-icon-needed |
| 811 | 특별전공 메달 4 | create-variant-if-unique-icon-needed |
| 812 | 특별전공 메달 5 | create-variant-if-unique-icon-needed |
| 813 | 특별전공 메달 6 | create-variant-if-unique-icon-needed |
| 814 | 특별전공 메달 7 | create-variant-if-unique-icon-needed |
| 815 | 특별전공 메달 8 | create-variant-if-unique-icon-needed |
| 816 | 특별전공 메달 9 | create-variant-if-unique-icon-needed |
| 817 | 특별전공 메달 10 | create-variant-if-unique-icon-needed |
| 818 | 참모 기장 | create-variant-if-unique-icon-needed |
## 2026-07-04 Art QA Update

- Direct Real-ESRGAN upscale was tested and rejected for production quality; do not promote `.omo/work/rejected-art/alliance-medals-ai-realesrgan-20260704-qa-fail/`.
- Alliance `793` Ale Heinessen and `794` Nguyen Kim Hoa now use user-supplied face references as medal bas-relief inspiration. `795` Free Planets Alliance Supreme Council Medal of Honor uses Alliance flag color/ribbon language and the gold pentagon emblem.
- Current Alliance high-honor outputs: `client-unity/Assets/ArtSource/remaster/alliance-foundation-medals-1024/`; manifest `server/content/generated/logh7-alliance-foundation-medal-redraw-manifest.json`.
- Imperial QA correction: `client-unity/Assets/ArtSource/remaster/imperial-medal-prototypes-1024/779-expeditionary-campaign-source-locked-crest-ship-prototype.png` shows the crest explicitly and uses original Empire ship thumbnail data as proof. Its manifest records `121` Empire model records, `120` `Ship/GE` file records, `117` `Ship/GE` MDX records, `3` `Ship/GE` MDS records, and `39` MDX render-queue hulls; thumbnail relief is not final large-detail quality.
- Imperial crest assets must come from `client-unity/Assets/ArtSource/reference/imperial-crest/`, derived from the supplied double-eagle reference. Generated crest substitutes are invalid.
- Imperial ship motifs must use original Empire ship data. Current decoded references: `client-unity/Assets/ArtSource/reference/logh7-ship-thumbnail-contact-sheet.png` and `client-unity/Assets/ArtSource/reference/empire-ships/`. Current corrected prototypes: `client-unity/Assets/ArtSource/remaster/imperial-medal-prototypes-1024/`.
- Remaining art work: expand corrected Imperial composition from prototypes `767` and `779` to all `767..792`; for large ship details, prefer GE MDX-derived renders over tiny thumbnail reliefs.
