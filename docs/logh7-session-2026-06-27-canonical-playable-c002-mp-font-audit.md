# LOGH VII 2026-06-27 ?몄뀡 湲곕줉 ??canonical playable / C002 / MP / ?고듃

??臾몄꽌???대쾲 ?몄뀡?먯꽌 ?ㅼ젣濡????됰룞怨?利앷굅瑜??쒖꽌?濡??④릿?? ?대씪?댁뼵??吏꾨떒 湲곗?? ?ъ슜???뺤젙 ??**?뺤떇 canonical playable EXE ?⑥씪 湲곗?**?쇰줈 怨좎젙?쒕떎.

## Current authority update (2026-06-29)

- Current canonical playable SHA256 is `bc5e932212e790981c648c7b60acfbba06c0fdd5b8d7f583ef123fac71b098ad`.
- `.omo/work/logh7-installed/exe/G7MTClient.exe` and `.omo/work/logh7-ko-overlay/exe/G7MTClient.playable.exe` both currently hash to that value.
- Older `365b7e98...`, `992dc7e2...`, `a7f4f80f...`, and `98ca4acd...` entries below are historical waypoints, not the current authority.
- Live diagnostics must launch the installed game EXE through `RE/tools/logh7_ui_explorer.py` with canonical server root `server/` (`--server-root ..\server` from `RE/`), start/login windowed by default, no blanket `node.exe` kill, and no `LOGH_PRESEED_PLAYER_CHAR` unless explicitly testing a bypass.

## 湲곗?

- ?뺤떇 ?ㅽ뻾 ??? `.omo/work/logh7-ko-overlay/exe/G7MTClient.playable.exe`
- ?ㅼ튂 ?ㅽ뻾 ??? `.omo/work/logh7-installed/exe/G7MTClient.exe`
- 기준 SHA256: `bc5e932212e790981c648c7b60acfbba06c0fdd5b8d7f583ef123fac71b098ad`
- `RE/tools/logh7_client_exe.py`?????뚯씪??`CANONICAL_PLAYABLE_EXE` / `canonical-playable`濡??쇰꺼留곹븳??
- `.omo/ghidra/bin/G7MTClient.exe`??諛붾땺??RE reference?대ŉ ?쇱씠釉?吏꾨떒 ??곸씠 ?꾨땲??
- `.omo/work/logh7-ko-overlay/exe/G7MTClient.exe` ??以묎컙 ?곗텧 EXE???뺤떇 吏꾨떒 ??곸뿉???쒖쇅?쒕떎.
- ?댁쟾 ?몄뀡 珥덈컲 湲곗? SHA `992dc7e25...`, 以묎컙 湲곗? `a7f4f80f...`, ?댁쟾 canonical `98ca4acd...`??historical waypoint?? ?댄썑 ?뺤떇 湲곗?? ??`79142d12...`??

## ?됰룞 濡쒓렇

1. ?꾨줈?앺듃 而⑦뀓?ㅽ듃瑜??ы솗?명뻽??
   - `AGENTS.md`, `server/AGENTS.md`, `RE/tools/AGENTS.md`
   - `.codex/skills/logh7-live`, `logh7-re`, `logh7-wire`, `logh7-patch`, `logh7-localize`
   - `.claude/skills/logh7-live`, `logh7-re`, `logh7-wire`, `logh7-patch`
   - `$logh7-loop`?쇰뒗 蹂꾨룄 Codex skill? ?꾩옱 ?몄뀡???놁뼱??`docs/logh7-loop-state.md`瑜?猷⑦봽 ?곹깭 ?먯옣?쇰줈 ?ъ슜?덈떎.

2. 理쒖떊 猷⑦봽 ?곹깭瑜??щ룆?덈떎.
   - ???#17: ?좉퇋 罹먮┃???깅줉 ?ㅼ씠?쇰줈洹멸? ?⑹꽦/?섎뱶?⑥뼱 ?낅젰?쇰줈 ?ロ엳吏 ?딆븘 ?붾뱶 吏꾩엯 遺덇?.
   - ???#18: `LOGH_PRESEED_PLAYER_CHAR=1`濡?罹먮┃???앹꽦 ?ㅼ씠?쇰줈洹몃? ?고쉶???붾뱶 吏꾩엯 ?깃났, R1 probe濡?`selector=0`, `selectedChar=1`, `own_cell=2588`, `mode_byte=2` ?뺤씤.
   - ???#19: L1 ?덈쾭濡?mode0 ?꾨떖? 媛?ν븯吏留??붾㈃? 3D ?⑥꽑酉곗씠硫?`0x0b01`? 誘몃컻??
   - ???#20: `0x0b01` ?≪떊 泥댁씤? `FUN_005737d0 -> FUN_004b48d0 -> FUN_004b78a0 case 0x3a`, ?듭떖 ?꾩젣??`0x67` unit-list 援ъ꽦怨?`FUN_004fd7a0`???щ컮瑜?mode ?몄텧.
   - 怨쇨굅 C002 湲곕줉???щ?議고뻽?? 2026-06-21??紐낅졊?뚯씠釉??먯꺑 promote race, 2026-06-23??`0x0b07` ?쒕쾭 ?몄떆留뚯쑝濡쒕뒗 C002 醫낃껐 遺덇? ?먯젙怨?理쒖떊 `0x67`/`0x0356` 媛?ㅼ씠 ?쒕줈 異⑸룎?섏? ?딅뒗吏 ?뺤씤?덈떎.

3. Python live/RE ?섏〈?깆쓣 蹂닿컯?덈떎.
   - `frida`, `pywin32`瑜??ㅼ튂?덈떎.
   - `RE/.omo`媛 猷⑦듃 `.omo`瑜?蹂대룄濡?junction??留뚮뱾?덈떎. 紐⑹쟻? RE ?꾧뎄??湲곗〈 寃쎈줈 媛?뺤쓣 ?ㅼ젣 workspace 援ъ“? 留욎텛??寃껋씠??

4. canonical playable 湲곕낯 寃쎈줈濡?live C002 ?몄뀡???ㅽ뻾?덈떎.
   - ?몄뀡: `.omo/ui-explorer/c002-rich-0356-20260627`
   - `--patched-exe` ?놁씠 湲곕낯 `canonical-playable` launch plan???ъ슜?덈떎.
   - ?쒕쾭 root: `server/`
   - 二쇱슂 env: `LOGH_PRESEED_PLAYER_CHAR=1`, `LOGH_POSTLOAD_RICH_CHARACTER=1`, `LOGH_STRAT_GALAXY=1`, `LOGH_STRAT_GRID_EARLY=1`, `LOGH_STRAT_TERRAIN=1`, `LOGH_WORLD_PLAYER=1`, `LOGH_FULL_UNIT_LOCATION=1`, `LOGH_GRID_ENTER=1`
   - `LOGH_GRID_SELECTOR_PROBE=0`, `LOGH_STRAT_SEQ_START=0`?쇰줈 mode2 ?좎?.

5. live UI 議곗옉???섑뻾?덈떎.
   - 濡쒕퉬 ?ㅽ겕由곗꺑: `.omo/ui-explorer/c002-rich-0356-20260627/shots/002-lobby-ready.png`
   - 寃뚯엫 ?쒖옉 ?대┃: `(155,248)`
   - 罹먮┃??移대뱶 ?대┃: `(883,348)`
   - ?붾뱶 吏꾩엯 ?ㅽ겕由곗꺑: `.omo/ui-explorer/c002-rich-0356-20260627/shots/005-world-entry.png`
   - `0x0f02`瑜??뺤씤?덇퀬, ?꾨왂留?HUD ?뚮뜑???≪븞 ?뺤씤?덈떎.

6. `LOGH_POSTLOAD_RICH_CHARACTER=1`??live ?④낵瑜??뺤씤?덈떎.
   - trace??`0x0356` ?≪떊 1?뚭? ?⑥븯??
   - `recordWire:"compact-0356"`, `recordWireLength:161`, `recordId04Le:1`, `recordGridUnit24Le:1`, `recordGridUnit28Le:1`.
   - ???몄뀡? 湲곗〈 臾몄젣???"rich character ?덈쾭瑜???耳쒓퀬 C002瑜??먮떒????援먯젙??泥?live ?뺤씤?대떎.

7. R1 probe瑜??ㅽ뻾?덈떎.
   - `selector_35f35a=0`
   - `selectedChar_3584a0=1`
   - `mode_byte_126711=2`
   - `poller_126718=0`
   - `own_cell_11178=2588`
   - `dispatch_latch_358374_80=[1,1,1,1,1,0,1,1,1,1,1,1,0]`
   - 寃곕줎: rich `0x0356`? ?섏떊?먯?留?mode2???좎??먮떎.

8. unit-list `0x67` live slot 吏곸젒 ?뺤씤? ?꾨즺?섏? 紐삵뻽??
   - 而ㅼ뒪? Frida one-shot???ㅻ뒭寃?遺숈씠???덉쑝??洹??쒖젏??client pid媛 ?대? ?놁뼱 `no pid`媛 ?섏솕??
   - ?곕씪???대쾲 ?몄뀡??誘멸?利??듭떖? "rich `0x0356` ?댄썑 `FUN_004fc4a0/FUN_004f6680`???ㅼ젣濡?`0x67`??梨꾩썱?붽?"?대떎.

9. live ?몄뀡??`stop`?쇰줈 醫낅즺?덈떎.
   - `shaVerified:true`
   - 蹂듭썝 SHA: `992dc7e25c4d7c3c982f1d2e6d9de904c733208ae9b28ddab162ef51aa076a0c`
   - `restoredClientKind: canonical-playable`

10. C002 愿???뺤쟻 RE瑜??ы솗?명뻽??
    - `FUN_004f6680`: `FUN_0050cf40(0x67)`??null?대㈃ 利됱떆 bail. `param_2`??1..3?댁뼱???섎ŉ, row/list 援ъ꽦? ?ш린??吏꾪뻾?쒕떎.
    - `FUN_004fd7a0`: mode ?꾩씠 以?`FUN_004f6680`???몄텧?쒕떎.
    - `FUN_005737d0`: SelectGrid 怨꾩뿴?먯꽌 `FUN_004b48d0`?쇰줈 ?댁뼱吏???≪떊 吏곸쟾 泥댁씤?대ŉ, `widget+0x28` latch? target hit-test媛 ?꾩슂?섎떎.
    - `RE/tools/logh7_hud_lifecycle_watch.py`???ㅼ쓬 live?먯꽌 `FUN_004fc4e0`, `FUN_004fc4a0`, `FUN_004fd560`, `FUN_004fd7a0`, `FUN_004f6680`, `FUN_005024b0`????踰덉뿉 蹂대뒗 ?꾧뎄濡??곹빀?섎떎怨??뺤씤?덈떎.

11. ?고듃 寃쎈줈瑜??먭??덈떎.
    - canonical playable EXE??global GDI face slot? `Pretendard`??
    - repo/workspace?먮뒗 ?ㅼ젣 `.ttf/.otf/.ttc` ?고듃 ?뚯씪???녿떎.
    - `RE/fonts`? `.omo/work/logh7-installed/fonts`?먮뒗 `.gitkeep`, `OFL.txt`, `PRETENDARD-MANIFEST.json`留??덈떎.
    - Windows ?쒖뒪?쒖뿉??`malgun.ttf`, `malgunbd.ttf`, `malgunsl.ttf`媛 ?덉쑝??Pretendard???뺤씤?섏? ?딆븯??
    - `RE/tools/logh7_ui_explorer.py`??`AddFontResourceExW`濡?bundled fonts瑜??깅줉?섎젮 ?섏?留? ?꾩옱 寃??root??font file???놁뼱 `fonts-not-found`媛 ?쒕떎.
    - 寃곕줎: "?고듃媛 ??癒밸뒗" 1李??먯씤? EXE媛 ?붽뎄?섎뒗 `Pretendard` ?뚯씪???ㅼ튂/?숇큺/?깅줉?섏? ?딆? ?곹깭?? canonical EXE瑜?諛붽씀??臾몄젣媛 ?꾨땲???뺤떇 諛고룷 ?고듃 payload/?ㅼ튂 臾몄젣??

12. ?ъ슜???뺤젙 ??留뚮뱺 Malgun 吏꾨떒 ?곗텧臾쇱쓣 ?먭린?덈떎.
    - `RE/tools/client_patches/font-face-malgun.json` ??젣.
    - `.omo/work/G7MTClient.malgun-playable.exe` ??젣.
    - `.omo/work/G7MTClient.malgun-playable.playable-manifest.json` ??젣.
    - ?댄썑 ?먯튃: 吏꾨떒쨌?좎?쨌?대뱶誘쇱? 紐⑤몢 ?뺤떇 canonical playable EXE濡쒕쭔 吏꾩엯?쒕떎.

13. ?뺤떇 EXE 紐⑸줉怨?SHA瑜??뺤씤?덈떎. (????ぉ ?묒꽦 ?뱀떆 湲곗??쇰줈 ?꾨옒 `992dc7e2...` 媛믪? historical?대ŉ, ?뱀떆 湲곗?? `98ca4acd...`??? 理쒖떊 湲곗?? ??Current authority瑜??곕Ⅸ??)
    - `.omo/work/logh7-ko-overlay/exe/G7MTClient.playable.exe` = `992dc7e2...` (`canonical-playable`, historical at this step)
    - `.omo/work/logh7-installed/exe/G7MTClient.exe` = `992dc7e2...` (`canonical-playable`, historical at this step)
    - `.omo/ghidra/bin/G7MTClient.exe` = `2848be76...` (`vanilla-installed`, RE reference)
    - `.omo/work/logh7-ko-overlay/exe/G7MTClient.exe` = `07b6c07a...` (以묎컙 ?곗텧臾? ?뺤떇 吏꾨떒 湲곗? ?꾨떂)

14. MP ?쒕쾭/?섎꽕???덈꺼 寃利앹쓣 ?ㅽ뻾?덈떎.
    - `python -m tools.logh7_multiclient_test selftest`: 18/18 pass.
    - `node --test tests/server/logh7-mp-fleet-visibility.test.mjs tests/server/logh7-command-engine.test.mjs tests/server/logh7-world-relay.test.mjs`: 41/41 pass.
    - ??寃利앹? ?쒕쾭/?섎꽕??濡쒖쭅 寃利앹씠硫? ?꾩쭅 ?뺤떇 EXE 2~4?대씪 live MP 寃利앹? ?꾨땲??

15. ?묒뾽 ?몃━ ?곹깭瑜??뺤씤?덈떎.
    - `.omo/work/logh7-installed/exe/dgVoodoo.conf`, `window2.dat`, `window3.dat`媛 ui_explorer display/window ?ㅼ젙?쇰줈 蹂寃쎈릱??
    - canonical playable EXE SHA???좎??쒕떎.

16. ?ъ슜???뺤젙 ??canonical playable濡쒕쭔 異붽? live watcher ?몄뀡???ㅽ뻾?덈떎.
    - ?몄뀡: `.omo/ui-explorer/c002-rich-0356-hudlife-20260627`
    - `runClientKind: canonical-playable`, `runClientSha: 992dc7e25c4d7c3c982f1d2e6d9de904c733208ae9b28ddab162ef51aa076a0c`
    - `fontRegistration: {"attempted": false, "reason": "fonts-not-found"}`
    - `RE/tools/logh7_hud_lifecycle_watch.py`瑜?90珥??좊?李⑺뻽??
    - 濡쒕퉬?믨쾶?꾩떆?묒? ?깃났?덉쑝??移대뱶 ?대┃ ?꾩뿉 ?대씪?댁뼵?멸? 醫낅즺?섏뼱 `ECONNRESET`??諛쒖깮?덈떎.
    - `stop` 寃곌낵 `shaVerified:true`, canonical playable SHA 蹂듭썝 ?뺤씤.
    - watcher output: `.omo/ui-explorer/c002-rich-0356-hudlife-20260627/hud-lifecycle.jsonl`, 12 events. ???ㅼ튂? ?쇰? `objectGateSet`留??④퀬, ?붾뱶 吏꾩엯 ??醫낅즺??`FUN_004fc4e0/FUN_004f6680` C002 lifecycle 利앷굅???녿떎.

17. ?고듃 ?먮┝ ?꾩긽???ㅽ겕由곗꺑怨??ㅼ젙?쇰줈 ?뺤씤?덈떎.
    - ?ㅽ겕由곗꺑: `.omo/ui-explorer/c002-rich-0356-hudlife-20260627/shots/001-after-login.png`, `002-game-start.png`
    - ?댁긽?? screenshot `(1924,1084)`, `GraphicConfig.txt`??`ScreenWidth=1920`, `ScreenHeight=1080`.
    - `dgVoodoo.conf` ?꾩옱 媛? `ScalingMode=stretched`, `Resampling=lanczos-3`, `Filtering=16`, `Antialiasing=4x`, `FullscreenAttributes=fake`.
    - ?먯젙: ?묒? UI ?쒓????먮━寃?蹂댁씠??吏곸젒 ?먯씤? `Pretendard` payload 遺?щ줈 ?명븳 GDI fallback 媛?μ꽦怨? dgVoodoo stretch/lanczos/AA ?꾩쿂由ш? 2D UI ?띿뒪?멸퉴吏 遺?쒕읇寃??뺣??섎뒗 ?④낵媛 寃뱀튇 寃껋쑝濡?蹂댁씤?? EXE 援먯껜媛 ?꾨땲???뺤떇 ?고듃 payload 蹂듦뎄 + display/filter ?ㅼ젙 A/B媛 ?ㅼ쓬 ?뺤씤?대떎.

18. ?섎꽕???뺤떇 EXE 李⑥씠瑜??ъ젏寃?덈떎.
    - ?섎꽕?ㅻ뒗 overlay source EXE瑜?吏곸젒 ?ㅽ뻾?섏? ?딄퀬 installed tree??`exe/G7MTClient.exe`瑜?cwd `installed/exe`濡??ㅽ뻾?쒕떎.
    - 洹?cwd?먮뒗 `data/`, `GraphicConfig.txt`, `D3D8.dll`, `dgVoodoo.conf`, ??濡쒖뺄 `fonts/`媛 ?덈떎.
    - overlay??`G7MTClient.playable.exe`留?吏곸젒 ?ㅽ뻾?섎㈃ sidecar 由ъ냼?ㅺ? 鍮좎졇 ?쇰? UI ?대?吏媛 源⑥쭏 ???덈떎.
    - `window_parts.tga`媛 ?쒕븣 32bpp upscale蹂?4194322B)?쇰줈 諛붾뚯뼱 lobby/window 9-slice瑜?源⑤뜕 ?곹깭瑜??뺤씤?덇퀬, ?꾩옱 installed tree???먮낯 8bpp ?ш린(263186B)濡?蹂듦뎄?먮떎.

19. ?고듃 raw-byte瑜??ㅼ떆 ?뺤씤?덈떎.
    - primary GDI UI face: `VA 0x0077402c/file 0x0037402c = Pretendard`.
    - D3D glyph atlas face: `VA 0x0076e240/file 0x0036e240`媛 ?댁쟾 canonical?먯꽌??CP949 `援대┝`(`b1 bc b8 b2 00...`)?댁뿀??
    - `FUN_004b07c0` ?먯떆 紐낅졊 `bf 40 e2 76 00`??atlas face ?щ’ ?ъ씤?곕? 蹂듭궗?섍퀬, `FUN_004b0960`????face濡?`CreateFontA`瑜??몄텧?쒕떎.
    - 肄붾뱶 ?ъ씤?곕? 諛붽씀吏 ?딄퀬 `0x0076e240` ?곗씠???щ’留?`Pretendard`濡?諛붽씀???몄씠 blast radius媛 媛???묐떎怨??먮떒?덈떎.

20. `font-atlas-face` ?⑥튂瑜?異붽??덈떎.
    - ?좉퇋 ?꾧뎄: `RE/tools/logh7_encode_font_atlas_face.py`.
    - ?좉퇋 descriptor: `RE/tools/client_patches/font-atlas-face.json`.
    - `RE/tools/logh7_build_playable_client.py` DEFAULT_STACK??`font-atlas-face`瑜?異붽??덈떎.
    - `RE/tools/logh7_client_exe.py`, `RE/tools/logh7_installed_tree.py`, 愿??unittest 湲곕? SHA/stack??媛깆떊?덈떎.
    - `RE/tools/client_patches/font-face.json`, `font-cleartype.json`, `logh7_encode_font_face.py`??"?⑥씪/sole face" ?쒗쁽???뺤젙?덈떎.

21. canonical playable???щ퉴??諛고룷?덈떎.
    - `python -m tools.logh7_build_playable_client`
    - `python -m tools.logh7_build_playable_client --deploy`
    - ??SHA256: `a7f4f80ff334cf01b81df1f5cfe75366f480400d373355e6631be01bb038f5a8`.
    - `.omo/work/logh7-ko-overlay/exe/G7MTClient.playable.exe`, `.omo/work/logh7-installed/exe/G7MTClient.exe`, `.omo/work/logh7-installed/exe/G7MTClient.exe.uiexplorer`媛 媛숈? SHA濡?留욎떠議뚮떎.
    - ??face ?щ’(`0x0037402c`, `0x0036e240`)??紐⑤몢 `Pretendard` bytes?꾩쓣 ?뺤씤?덈떎.

22. deploy 以?`String.txt` ?먯긽 ?щ컻 諛⑹? 踰꾧렇瑜?怨좎낀??
    - 湲곗〈 deploy merge??installed `String.txt`瑜?湲곗??쇰줈 ?쇱븘, ?대? ?먯긽??0B/5B ?뚯씪???덉쑝硫?overlay瑜?嫄곗쓽 ?껋뼱踰꾨┫ ???덉뿀??
    - ?먮낯??鍮꾩뿀嫄곕굹 overlay蹂대떎 吏㏃쑝硫?overlay ?꾩껜瑜??곕룄濡?`logh7_build_playable_client.py`瑜??섏젙?덈떎.
    - installed `String.txt`???ㅼ떆 866B濡?蹂듦뎄?먮떎. ?댁쟾 5B backup? ?좊ː?섏? ?딅뒗??

23. GDI live watcher濡??뺤떇 EXE font face瑜?寃利앺뻽??
    - ?ㅽ뻾: `RE/tools/logh7_gdi_font_watch.py --spawn-exe .omo/work/logh7-installed/exe/G7MTClient.exe --seconds 8`.
    - 濡쒓렇: `.omo/ui-explorer/font-gdi-after-atlas-20260627/gdi-font-spawn.jsonl`.
    - `fontRegistration`: `attempted=true`, `ok=true`, `fontCount=57`, `loaded=135`.
    - `font-created` 31嫄??꾨? face=`Pretendard`, faceHex=`50726574656e6461726400`.
    - `援대┝` hex(`b1bcb8b2`)??0嫄?
    - primary UI callstack `0x4aee13`, atlas callstack `0x4b0bbd` ?묒そ??Pretendard濡??뺤씤?먮떎.

24. ?뚯뒪?몃? ?ㅽ뻾?덈떎.
    - `python -m tools.logh7_encode_font_atlas_face --selftest`: PASS.
    - `python -m unittest tools.tests.test_logh7_client_exe tools.tests.test_logh7_encode_font_face`: 11/11 PASS.
    - `python -m unittest tools.tests.test_logh7_client_exe tools.tests.test_logh7_installed_tree tools.tests.test_logh7_encode_font_face`: 13/14 PASS.
    - ?ㅽ뙣 1嫄댁? `RE/content/logh7-content.db` 遺?щ줈 `PlayerRuntimeError`媛 ???섍꼍 ?낅젰 臾몄젣??

25. ?쒓? ?낅젰/異쒕젰/吏꾪뻾 臾몄젣瑜?遺꾨━?덈떎.
    - 濡쒓렇??罹먮┃???앹꽦 text automation? ASCII `keybd_event`, 鍮껦SCII CP949 `WM_CHAR/PostMessageA` 寃쎈줈??
    - ?몄썡??梨꾪똿 ?낅젰? `GetAsyncKeyState`/`GetKeyboardState` polling?대씪 `WM_CHAR`媛 蹂댁씠吏 ?딆쓣 ???덈떎.
    - 湲곗〈 P0-03 RE??梨꾪똿 ?≪떊? `setlocale("Japanese")`?묬P932 蹂?섏쓣 ?誘濡??쒓? wire媛 ?먯긽?????덈떎.
    - ?좉퇋 罹먮┃ ?앹꽦 ??"???섏뼱媛?? ?띿뒪???낅젰 ?ㅽ뙣 ?섎굹濡??⑥젙?섏? ?딅뒗?? ?깅줉 ?뺤씤 ?ㅼ씠?쇰줈洹?GenerateCharacterFinish opcode/UI router 寃쎈줈? 寃고빀??釉붾줈而ㅻ줈 蹂닿퀬 RE瑜??댁뼱媛꾨떎.
    - ?ъ슜??吏?쒖뿉 ?곕씪 `LOGH_PRESEED_PLAYER_CHAR=1`? 湲곕낯 ?댁쁺/?좎?/?대뱶誘?寃쎈줈?먯꽌 ?쒓굅?섍퀬, 寃⑸━ 吏꾨떒???뚮쭔 紐낆떆?곸쑝濡??대떎.

26. dgVoodoo 濡쒓퀬/?먮┝ ?먯씤???щ텇由ы뻽??
    - windowed 罹≪쿂?먮뒗 ?고븯??`dgVoodoo` 濡쒓퀬媛 蹂댁?怨? 湲곗〈 conf??`WatermarkDisplayDuration=0` 二쇱꽍? `0 or undefined means infinite time`?댁뿀??
    - 寃곕줎: `dgVoodooWatermark=false`媛 ?뱀젙 紐⑤뱶?먯꽌 臾댁떆?섎㈃ duration 0 ?뚮Ц??濡쒓퀬媛 臾댄븳 ?쒖떆?????덈떎.
    - `RE/tools/logh7_ui_explorer.py`??borderless ?ㅼ젙??`FullScreenMode=false`, `ScalingMode=centered`, `Resampling=pointsampled`, `Filtering=appdriven`, `Antialiasing=off`, `RTTexturesForceScaleAndMSAA=false`, `SmoothedDepthSampling=false`, `WatermarkDisplayDuration=1`濡?諛붽엥??
    - 1920x1200 紐⑤땲?곗뿉??borderless 李쎌? 16:9 aspect-fit `[0,60,1920,1140]`濡?留욎텛?꾨줉 `_aspect_fit_rect`瑜?異붽??덈떎.

27. ?뺤떇 launcher? no-watermark ?꾧뎄??媛숈? ?뺤콉?쇰줈 留욎톬??
    - `RE/tools/launcher/LOGH7Launcher.cs`: borderless mode?먯꽌 ?섎꽕?ㅼ? 媛숈? sharp ?ㅼ젙???곌퀬, window瑜?16:9 aspect-fit?쒕떎.
    - `RE/tools/logh7_dgvoodoo_nowatermark.py`: `WatermarkDisplayDuration=1`??寃利?議곌굔???ы븿?덈떎.
    - stock dgVoodoo template 寃쎈줈 `.omo/work/dgVoodoo2_87_2/dgVoodoo.conf`媛 ?꾩옱 workspace???놁뼱 ?ㅽ뻾 遺덈뒫?댁뿀?쇰?濡? installed `.original`/current conf濡?fallback?섍쾶 怨좎낀??
    - `python -m tools.logh7_dgvoodoo_nowatermark`: PASS, output conf SHA `809cf5cb4b1da2007dd6599b3cd1ac43e6884be64e35a6bffc11535e4c42ced4`.
    - `RE/tools/logh7_graphics_config.py --no-watermark`??duration 1???곌쾶 ?덈떎.

28. `charsel-recenter` DEFAULT ?몄엯???섎룎?몃떎.
    - subagent/臾몄꽌 ?ъ젏寃 寃곌낵 `charsel-recenter.json`? 38?ъ씠??broad patch?닿퀬 `verifiedFlag=false`??
    - 理쒖떊 臾몄꽌???쇰뵒???⑤꼸 live-confirm 媛믪? X=676?몃뜲 ?꾩옱 descriptor??X=604濡??섎룎由??곹깭?? DEFAULT???ｌ쑝硫?"UI媛 ?댁긽?댁쭊" ?꾪뿕???덈떎.
    - ?곕씪??DEFAULT_STACK? `lobby-native-layout-v2`源뚯?留??좎??섍퀬 `charsel-recenter`???ㅼ쓬 live ?꾨낫濡?蹂대쪟?덈떎.

29. launchable 14px-ish canonical ?꾨낫瑜?留뚮뱾?덈떎.
    - `font-readable-size.json`: primary GDI site `6a0c -> 6a0e`, atlas site `25feff0000 -> 83c0019090`.
    - `RE/tools/logh7_build_playable_client.py` DEFAULT_STACK??`font-atlas-face`, `font-readable-size`, `lobby-native-layout-v2`瑜??ы븿?섍퀬 `charsel-recenter`???쒖쇅?덈떎.
    - 鍮뚮뱶/諛고룷 SHA: `98ca4acd2ec86b657e75b28623bf753029a83d116b052c54ba6e45d4f7952afc`.
    - `.omo/work/logh7-ko-overlay/exe/G7MTClient.playable.exe`, `.omo/work/logh7-installed/exe/G7MTClient.exe`, `.uiexplorer` 紐⑤몢 媛숈? SHA.

30. 98ca live borderless visual A/B瑜??섑뻾?덈떎.
    - ?몄뀡: `.omo/ui-explorer/borderless-sharp-98ca-20260627`.
    - runClientKind=`canonical-playable`, runClientSha=`98ca4acd...`.
    - `fontRegistration`: `attempted=true`, `ok=true`, `fontCount=57`, `loaded=135`.
    - `windowDisplay`: monitorRect `[0,0,1920,1200]`, targetAspect `16:9`, windowRect `[0,60,1920,1140]`, clientRect `[0,0,1920,1080]`.
    - screenshot `shots/001-after-login.png`: ?고븯??dgVoodoo 濡쒓퀬 ?놁쓬.
    - screenshot `shots/002-lobby-wait.png`: 濡쒕퉬 硫붾돱/?⑤꼸??以묒븰?쇰줈 ?ㅼ뼱?붽퀬 濡쒓퀬 ?놁쓬.
    - stop 寃곌낵 `shaVerified:true`, restoredSha=`98ca4acd...`.

31. 16px-ish ?꾨낫??留뚮뱾?덉?留?live??留됲삍??
    - ?꾨낫 諛붿씠?? primary `6a0c -> 6a10`, atlas `25feff0000 -> 83c0039090`.
    - ?꾨낫 SHA: `e49749a9a825c8599a414bf6fdb23e99d40ad4cb8ba89df4608c3c8960286edc`.
    - `ui_explorer start`媛 WinError 4551濡??ㅽ뙣?덈떎.
    - Code Integrity event 3033/3077: Python??`G7MTClient.exe`瑜?load?섎젮 ?덉쑝??Enterprise signing level requirements瑜?留뚯”?섏? 紐삵븿, Policy ID `{0283ac0f-fff1-49ae-ada1-8a933130cad6}`.
    - ?곕씪??16px-ish??"諛붿씠??鍮뚮뱶 媛?? live 遺덇?" ?꾨낫濡쒕쭔 湲곕줉?섍퀬 ?뺤떇 canonical? ?ㅽ뻾 寃利앸맂 98ca濡??섎룎?몃떎.

32. ?쒕챸 ?고쉶 ?쒕룄??以묐떒?섍퀬 ?뺣━?덈떎.
    - CurrentUser code-signing cert瑜?Root/TrustedPublisher???ｊ퀬 ?뚯뒪???щ낯 ?쒕챸???쒕룄?덉쑝??`Set-AuthenticodeSignature` ?묒뾽???덉젙?곸쑝濡??앸굹吏 ?딆븘 以묐떒?덈떎.
    - ?꾩떆 cert store ??ぉ(CurrentUser My/Root/TrustedPublisher), `.cer`, `G7MTClient.sign*.exe` ?뚯뒪???뚯씪? ??젣?덈떎.
    - ?쒖뒪???꾩껜(LocalMachine) ?좊ː ??μ냼??嫄대뱶由ъ? ?딆븯??

33. 留덉?留?寃利앹쓣 ?섑뻾?덈떎.
    - 理쒖쥌 canonical SHA: `98ca4acd2ec86b657e75b28623bf753029a83d116b052c54ba6e45d4f7952afc`.
    - installed EXE raw bytes: primary size `6a0e`, atlas site `83c0019090`, charsel site???먮낯 `c74424302c010000`(DEFAULT ?쒖쇅 ?뺤씤).
    - `python -m unittest tools.tests.test_logh7_client_exe tools.tests.test_logh7_ui_explorer`: 24/24 PASS.
    - `python -m unittest tools.tests.test_logh7_installed_tree`: 湲곗〈 `RE/content/logh7-content.db` 遺?щ줈 1 fail, ?섎㉧吏 pass.
    - 怨좎븘 ui_explorer node PID 23704??session.json???녿뒗 `port 47900` ?쒕쾭?꾩쓣 ?뺤씤?섍퀬 ?대떦 PID留?醫낅즺?덈떎. 留덉?留??뺤씤?먯꽌 node/G7MTClient ?꾨줈?몄뒪 ?놁쓬.

34. 猷⑦봽 ?ш컻 ??而⑦뀓?ㅽ듃瑜??ㅼ떆 ?쎄퀬, ?쒕툕?먯씠?꾪듃 6媛?寃곌낵瑜?紐⑤몢 ?섏쭛?덈떎.
    - ?쎌? ?덉감: `AGENTS.md`, `docs/logh7-loop-state.md`, `.codex/skills/logh7-re/SKILL.md`, `.codex/skills/logh7-live/SKILL.md`, `.codex/skills/logh7-wire/SKILL.md`, `.codex/skills/logh7-patch/SKILL.md`.
    - 臾몄꽌 ?몃깽?좊━: `docs/logh7-master-roadmap-2026-06-26.md`, `docs/logh7-mp-roadmap-2026-06-23.md`, `docs/logh7-completion-matrix-2026-06-26-v2.md`, `docs/logh7-remaster-roadmap-2026-06-26.md`, `docs/logh7-outstanding-work-2026-06-25.md`, `docs/SESSION-HANDOFF-2026-06-26.md`, `docs/logh7-strategic-input-wire.md`, C002 deep-RE 臾몄꽌援곗쓣 ?ㅼ떆 ?議고뻽??
    - ?쒕툕?먯씠?꾪듃 寃곕줎: MP ?꾨즺 ?뺤쓽??4-client strict-auth/faction/world-entry/user-originated command/server-authoritative/persistence proof?닿퀬, C002??`0x67` unit-list/HUD admission 誘명솗?몄씠 ?⑥? ?듭떖 釉붾줈而ㅻ떎. canonical playable 沅뚯쐞 SHA??`98ca4acd...`; `LOGH_PRESEED_PLAYER_CHAR`??launcher/default?먮뒗 ?녾퀬 吏꾨떒??env??肉먯씠??
    - ?고듃/濡쒓퀬 寃곕줎: current EXE??primary/atlas face媛 紐⑤몢 Pretendard?닿퀬, ?⑥? ?묎쾶 蹂댁엫? 14px 蹂댁닔 ?⑥튂? dgVoodoo/display-mode ?곹뼢?대떎. windowed 濡쒓퀬??`WatermarkDisplayDuration=0`????臾댄븳 ?쒖떆?????덇퀬, borderless live?먯꽌??濡쒓퀬媛 ?놁뿀??

35. no-preseed canonical live?먯꽌 ??罹먮┃???뚮줈?곗? UI 醫뚰몴瑜??ы솗?명뻽??
    - ?몄뀡: `.omo/ui-explorer/nopreseed-create-input-20260627`, runClientSha=`98ca4acd...`, `LOGH_PRESEED_PLAYER_CHAR` 誘몄꽕??
    - trace??`characterIds:[1]`, `profileKeys:["dummy:1"]`? preseed媛 ?꾨땲??湲곗〈 `dummy` 怨꾩젙 ?꾨줈???붿〈 ?곗씠?곕떎. ?꾩쟾 ?좉퇋 怨꾩젙 ?뚯뒪?몄뿉??fresh account/account-db 寃⑸━媛 ?꾩슂?섎떎.
    - 湲곗〈 automation??`??罹먮┃???묒꽦` ?대┃ `(155,305)`? ?꾩옱 native lobby v2?먯꽌 鍮?怨듦컙???뚮??? live screenshot `shots/003-create-menu-new-character.png`? ?섎룞 ?대┃?쇰줈 ?ㅼ젣 踰꾪듉? `(574,407)` 遺洹쇱엫???뺤씤?덈떎.
    - ?몄뀡 ?좏깮 row??湲곗〈 `(880,343)` 怨꾩뿴???꾨땲??row1 以묒떖 `(1090,425)` 遺洹쇱씠?덈떎.
    - ?먮낯 98ca?먯꽌 ?대쫫 ?낅젰 ?붾㈃? screenshot `shots/035-maybe-name-screen-current.png` 湲곗??쇰줈 ?낅젰 ?⑤꼸???ㅻⅨ履?諛곌꼍 諛뽰쑝濡?諛?? ?ъ슜??吏?곸쿂???대쫫/???낅젰???⑤꼸??踰쀬뼱?щ떎.
    - stop 寃곌낵 `shaVerified:true`, restoredSha=`98ca4acd...`.

36. ?섎꽕??醫뚰몴瑜?live 湲곗??쇰줈 怨좎낀??
    - `RE/tools/logh7_ui_flow.py`: `create-menu-new-character` ?대┃??`(574,407)`濡?蹂寃?
    - `RE/tools/logh7_ui_flow.py`: `_session_row_point(1)`??`(1090,425)`, ??媛꾧꺽 115px濡?蹂寃?
    - `RE/tools/tests/test_logh7_ui_explorer.py`: `test_create_character_uses_current_native_lobby_coordinates` 異붽?.
    - 寃利? `cd RE && python -m unittest tools.tests.test_logh7_ui_explorer` = 17/17 PASS.

37. `charsel-recenter`瑜??ы븿???붿뒪???꾨낫瑜?留뚮뱾?덉?留?Code Integrity媛 留됱븯??
    - 鍮뚮뱶: DEFAULT_STACK + `charsel-recenter`, ?꾨낫 `.omo/work/logh7-ko-overlay/exe/G7MTClient.charsel-current.exe`.
    - ?꾨낫 SHA: `253f27778aa86ad11b9d34e7fa29aaf7d62134473b686b42af227cbe35f5f1d4`.
    - `ui_explorer start --patched-exe ...G7MTClient.charsel-current.exe`??WinError 4551濡??ㅽ뙣?덈떎.
    - ?ㅽ뙣 以??⑥? node???ы듃/PID瑜??뺤씤????PID 8600留?醫낅즺?덈떎. blanket node kill? ?섏? ?딆븯??
    - ?ㅽ뙣濡??????installed EXE??`G7MTClient.playable.exe`?먯꽌 ?ㅼ떆 蹂듭궗?덇퀬, installed/overlay SHA 紐⑤몢 `98ca4acd...`濡?蹂듭썝 ?뺤씤?덈떎.

38. ?붿뒪??EXE瑜?諛붽씀吏 ?딄퀬 live 硫붾え由ъ뿉 patch descriptor瑜??곸슜?섎뒗 吏꾨떒 ?꾧뎄瑜?異붽??덈떎.
    - ?좉퇋 ?꾧뎄: `RE/tools/logh7_runtime_patch_apply.py`.
    - 紐⑹쟻: Smart App Control????EXE hash瑜?留됱쓣 ?? ?대? ?ㅽ뻾 以묒씤 canonical 98ca ?꾨줈?몄뒪 硫붾え由ъ뿉 descriptor bytes留?Frida濡??곸슜?쒕떎.
    - ?몄뀡: `.omo/ui-explorer/charsel-mempatch-98ca-20260627`, runClientSha=`98ca4acd...`, disk EXE??canonical 98ca ?좎?.
    - 紐낅졊: `python -m tools.logh7_runtime_patch_apply --session .omo/ui-explorer/charsel-mempatch-98ca-20260627 --patch charsel-recenter --out .../runtime-patch-charsel.json`.
    - 寃곌낵: output JSON 湲곗? `patch-applied` 38/38 OK, 留덉?留?`runtime-patch-complete`. 珥덇린 肄섏넄 異쒕젰? CP949媛 patch note??dash瑜?紐?李띿뼱 exit 1?댁뿀?쇰굹, patch ?곸슜怨?JSON 湲곕줉? ?깃났?덈떎. ?댄썑 肄섏넄 print瑜?`ensure_ascii=True`濡?怨좎낀??
    - 寃利? `cd RE && python -m py_compile tools/logh7_runtime_patch_apply.py` PASS.

39. runtime `charsel-recenter`????罹먮┃??UI ?꾩튂 臾몄젣瑜??ш쾶 以꾩?吏留?DEFAULT ?밴꺽? 蹂대쪟?쒕떎.
    - screenshot `shots/003-new-character-mempatch.png`: ?몄뀡 ?좏깮 移대뱶 UI媛 ?ㅻⅨ履?諛곌꼍 ?⑤꼸 ?덉쑝濡??ㅼ뼱?붾떎.
    - screenshot `shots/014-mempatch-name-screen-newpos.png`: ???대쫫 ?낅젰 ?⑤꼸???ㅻⅨ履?諛곌꼍 ?덉뿉 ?ㅼ뼱?붾떎. ?먮낯 98ca??諛붽묑 諛由쇱? ?ы쁽?섏? ?딆븯??
    - ?? recenter ??faction/next/field 醫뚰몴媛 諛붾뚯뿀?? live 湲곗? ???faction `(905,425)/(905,541)`, ?ㅼ쓬 `(1068,693)`, ???대쫫 field `(965,425)/(965,507)`.
    - `charsel-recenter.json`? ?ъ쟾??broad 38-site patch?닿퀬 `verifiedFlag=false`?대ŉ, 理쒖떊 臾몄꽌???쇰뵒??X=676怨?descriptor X=604 遺덉씪移섍? ?⑥븘 DEFAULT_STACK?먮뒗 ?ｌ? ?딅뒗??

40. ?대쫫 ?낅젰 臾몄젣瑜??고듃/醫뚰몴 臾몄젣? 遺꾨━?덈떎.
    - 媛숈? mempatch ?대쫫 ?낅젰 ?붾㈃?먯꽌 ASCII `TESTABC`?????낅젰???蹂댁??? screenshot `shots/022-ascii-lastname.png`.
    - 媛숈? field??`ui_explorer text ?쇱씤` / `text ?섎Ⅴ????鍮??붾㈃?쇰줈 ?⑥븯?? screenshot `shots/019-mempatch-korean-name-entered.png`.
    - 吏곸젒 `SendInput(KEYEVENTF_UNICODE)`濡?U+B77C/U+C778??蹂대깉怨?OS???깃났??諛섑솚?덉?留??붾㈃?먮뒗 諛섏쁺?섏? ?딆븯?? screenshot `shots/024-024-after-unicode-sendinput.png`.
    - 寃곕줎: field focus? ASCII path???묐룞?쒕떎. ?쒓? ?ㅽ뙣???고듃 ?뚮뜑留?臾몄젣媛 ?꾨땲??罹먮┃???앹꽦 edit widget??IME/臾몄옄 ?섏쭛 寃쎈줈 臾몄젣?? ?ㅼ쓬 RE ??곸? `FUN_004e7200`, `FUN_004fff60`, `FUN_004ffdc0`, `FUN_00516bf0`, create finish/confirm ?쇱슦?곕떎.

41. dgVoodoo/logo/display-mode瑜??뺤떇 launcher 湲곕낯 寃쎈줈?먮룄 留욎톬??
    - ?꾩옱 installed/root dgVoodoo conf 紐⑤몢 `WatermarkDisplayDuration=1`, `dgVoodooWatermark=false`, `3DfxWatermark=false`, borderless sharp setting?쇰줈 ?뺤씤?덈떎.
    - `RE/tools/launcher/LOGH7Launcher.cs`: `DefaultDisplayMode`瑜?`fullscreen`?먯꽌 `borderless`濡?蹂寃쏀뻽?? ?섎꽕??湲곕낯媛믨낵 ?뺤떇 launcher 湲곕낯媛믪쓣 留욎떠 "?섎꽕?ㅻ뒗 ?좊챸?쒕뜲 ?뺤떇 exe???먮┝/濡쒓퀬/UI 李⑥씠"媛 ?섎뒗 湲곕낯 寃쎈줈瑜?以꾩씤??
    - `RE/tools/tests/test_client_package_client.py`, `RE/tools/tests/test_logh7_installed_tree.py`: launcher source媛 `DefaultDisplayMode = "borderless"`? `WatermarkDisplayDuration = "1"`???ы븿?섎뒗吏 寃?ы븯?꾨줉 媛깆떊?덈떎.
    - ?뺤쟻 ?뺤씤: `Select-String`?먯꽌 `DefaultDisplayMode = "borderless"`, `WatermarkDisplayDuration`, `dgVoodooWatermark=false` ?뺤씤.

42. 寃利앷낵 ?뺣━瑜??섑뻾?덈떎.
    - `cd RE && python -m unittest tools.tests.test_logh7_ui_explorer` = 17/17 PASS.
    - `cd RE && python -m unittest tools.tests.test_logh7_ui_explorer tools.tests.test_logh7_installed_tree` = ui_explorer 17媛쒕뒗 PASS, installed-tree 泥?耳?댁뒪??湲곗〈 `RE/content/logh7-content.db` 遺?щ줈 fail.
    - `cd RE && python -m unittest tools.tests.test_client_package_client` = ?꾩옱 checkout??`client` Python package媛 ?놁뼱 `ModuleNotFoundError: No module named 'client'`.
    - `.omo/ui-explorer/charsel-mempatch-98ca-20260627` stop 寃곌낵 `shaVerified:true`, restoredSha=`98ca4acd...`.
    - 留덉?留??뺤씤?먯꽌 `G7MTClient` ?꾨줈?몄뒪 ?놁쓬, `47900` listener ?놁쓬, installed/overlay EXE SHA 紐⑤몢 `98ca4acd...`.

43. ?쒓? ?대쫫 ?낅젰 寃쎈줈瑜?redex ?붿뺨?뚯씪怨?raw bytes濡??ы솗?명뻽??
    - ?좉퇋 洹쇨굅 臾몄꽌: `docs/logh7-korean-name-input-re-2026-06-27.md`.
    - `FUN_004e7200`: `WM_CHAR(0x102)`留?`FUN_004fff60`/`FUN_004ffcd0` 寃쎈줈濡??ㅼ뼱媛怨? `WM_IME_CHAR(0x286)`? `IME WM_IME_CHAR!!!` 濡쒓렇 ??append?섏? ?딅뒗??
    - `FUN_004e7200`? `WM_CHAR`??`wParam`??`*(undefined1 *)(msg+8)`濡?1諛붿씠?몃쭔 痍⑦븯誘濡?Unicode Hangul `WM_CHAR`???섏쐞 1諛붿씠?몃줈 ?섎┛??
    - `FUN_004fff60` raw bytes `0f be 06`? `movsx eax, byte ptr [esi]`??CP949 lead/trail泥섎읆 `>=0x80`??byte瑜?signed ?뺤옣?쒕떎.
    - `FUN_004ffcd0`? `local_c[0]=param_2; local_c[1]=0` ?⑥씪 byte C-string??append?쒕떎. DBCS pair瑜?議곕┰?섏? ?딅뒗??
    - `FUN_00516bf0` chat send path??蹂꾨룄 臾몄젣吏留?`push 0x0076e3fc`(`Japanese`) raw bytes `68 fc e3 76 00`? string slot `4a 61 70 61 6e 65 73 65 00`???뺤씤?덈떎.
    - 寃곕줎: ?쒓? ?대쫫 ?낅젰? ?고듃 ?⑥튂媛 ?꾨땲??IME/DBCS edit widget ?⑥튂 臾몄젣?? `movsx->movzx`??吏꾨떒 ?꾨낫??肉먯씠硫? `WM_IME_CHAR` ?먮뒗 composition result瑜?DBCS-aware append濡??쇱슦?낇븯??履쎌씠 蹂??⑥튂 ?꾨낫??

44. `movsx->movzx` 吏꾨떒 ?⑥튂瑜?canonical 98ca live?먯꽌 寃利앺뻽??
    - ?좉퇋 descriptor: `RE/tools/client_patches/input-edit-char-movzx.json`.
    - descriptor byte site??Rawls 媛먯궗 寃곌낵??留욎떠 VA `0x004fff65` / file `0x000fff65`, original `0fbe06`, patched `0fb606`?쇰줈 怨좎젙?덈떎. 理쒖큹 異붿젙 `0x004fff68`? ?由?offset?댁뿀??
    - ?몄뀡: `.omo/ui-explorer/hangul-name-movzx-98ca-20260627`, runClientSha=`98ca4acd...`, no-preseed, `LOGH_POSTLOAD_RICH_CHARACTER=1`, borderless canonical path.
    - runtime patch 紐낅졊?쇰줈 `charsel-recenter` 38/38 OK? `input-edit-char-movzx` 1/1 OK瑜??뺤씤?덈떎. ?붿뒪??EXE??諛붽씀吏 ?딆븯??
    - `text ?쇱씤` ??screenshot `shots/009-hangul-lastname-after-movzx.png`???ъ쟾??blank???
    - 媛숈? field??ASCII `TEST`??screenshot `shots/010-ascii-after-movzx.png`?먯꽌 ?뺤긽 ?쒖떆?먮떎.
    - 寃곕줎: `movzx`??standalone fix媛 ?꾨땲?? 怨좊퉬??byte validation蹂대떎 ???ㅼ쓽 IME/DBCS 議곕┰怨?single-byte append媛 ?ㅼ젣 釉붾줈而ㅻ떎.
    - stop 寃곌낵 `shaVerified:true`, restoredSha=`98ca4acd...`.

45. C002 `0x67` unit-list live 利앷굅瑜??↔린 ?꾪빐 watcher瑜?蹂닿컯?덈떎.
    - `RE/tools/logh7_hud_lifecycle_watch.py`: `0x004f6040` ?꾩슜 read-only ??異붽?. `dataArg`, `dataArg+0x270` S32/U8, `+0x26c/+0x274`, bytes `+0x260`, 而⑦뀒?대꼫 before/after, `slot67ByFormula`, `slot67ByLegacyOffset`??湲곕줉?쒕떎.
    - `0x004fe890` ??異붽?. `slotId==0x67`????widget/list ?앹꽦 ?몄텧??parent, descriptor, rowCount, outArray, flags, retval??湲곕줉?쒕떎.
    - `0x0050cf40` ??異붽?. `idx==0x67` 議고쉶 諛섑솚媛믨낵 而⑦뀒?대꼫 ?곹깭瑜?湲곕줉?쒕떎.
    - `RE/tools/logh7_selectgrid_snapshot.py`? `RE/tools/logh7_hud_admission_watch.py`: `payloadCount270U8` / `currentPayloadCount270U8`瑜?異붽???1諛붿씠??count ?댁꽍??媛숈씠 ?④릿??

46. ?섏젙??RE ?꾧뎄瑜?寃利앺뻽??
    - `cd RE; python -m py_compile tools/logh7_hud_lifecycle_watch.py tools/logh7_selectgrid_snapshot.py tools/logh7_hud_admission_watch.py` PASS.
    - `cd RE; python -m unittest tools.tests.test_logh7_hud_lifecycle_watch tools.tests.test_logh7_selectgrid_snapshot tools.tests.test_logh7_hud_admission_watch` = 10/10 PASS.

47. 蹂닿컯 watcher濡?no-preseed natural C002 live瑜??ㅽ뻾?덈떎.
    - ?몄뀡: `.omo/ui-explorer/c002-slot67-watch-98ca-20260627`.
    - launch: canonical playable SHA `98ca4acd...`, `--display-mode borderless`, no `LOGH_PRESEED_PLAYER_CHAR`, env `LOGH_POSTLOAD_RICH_CHARACTER=1`, `LOGH_STRAT_GALAXY=1`, `LOGH_STRAT_GRID_EARLY=1`, `LOGH_STRAT_TERRAIN=1`, `LOGH_WORLD_PLAYER=1`, `LOGH_FULL_UNIT_LOCATION=1`, `LOGH_GRID_ENTER=1`.
    - 湲곗〈 `dummy:1` card??`0x2004` trace濡쒕뒗 ?대젮?붿?留?UI panel?먮뒗 移대뱶媛 蹂댁씠吏 ?딆븯?? ???`create-character` ASCII ?뚮줈?곕줈 `TEST C002 / FLAG` characterId `2`瑜??앹꽦?덈떎.
    - preseed ?놁씠 `0x1008` category `0..4`媛 紐⑤몢 `createAccepted:true`濡??듦낵?덇퀬, world-entry媛 ?댁뼱議뚮떎. `0x0204`, `0x0325`, `0x0b0a`, `0x0356`源뚯? ?뺤씤?덈떎.
    - `0x0356`??characterId `2`, `recordGridUnit24Le=1`, `recordGridUnit28Le=1`濡??≪떊?먮떎.
    - R1 probe: `selector_35f35a=0`, `selectedChar_3584a0=2`, `mode_byte_126711=2`, `own_cell_11178=2588`.

48. C002 `0x67` unit-list ?앹꽦 ?щ?瑜?live濡??뺤젙?덈떎.
    - watcher events: 1025媛? `hook-installed` 9媛?紐⑤몢 ?ㅼ튂.
    - `unitListPanelBuild-enter/leave-004f6040` 媛?1??
    - `widgetListCreate-enter/leave-004fe890-slot67` 媛?1?? `slotId=103`, `rowCount=1`, `retval=0xf230918`.
    - `widgetSlotLookup-leave-0050cf40-slot67` 878?? 理쒖큹 `retval=0xf230918`, `slot67ByFormula=0xf230918`.
    - ?곕씪??湲곗〈 "0x67 ?щ’??null?대씪 0x0b01?????섍컙?? 媛?ㅼ? ???몄뀡 湲곗? 諛섏쬆?먮떎. ?? active selection payload??蹂꾧컻??

49. C002 ?ㅽ뙣 ?꾩튂瑜????ㅻ줈 醫곹삍??
    - post-world `logh7_selectgrid_snapshot`: `fieldMode126711=2`, `focusChar3584a0=2`, `unitCount41a364=1`, `char0.id00=2`, `unit0.id00=1`.
    - 媛숈? snapshot?먯꽌 active selection? `listCount188=0`, `payloadCount270=0`, `payloadCount270U8=0`, `currentPayloadCount270=0`, `rows=[]`.
    - 留?以묒븰 own-cell 履?click? trace ?놁쓬. ?고븯??`?뚯냽 ?⑤?` panel click? `0x0f08` request / `0x0f09` response瑜?留뚮뱾?덉?留?`0x0b01`? 留뚮뱾吏 ?딆븯?? trace ?꾩껜 `0x0b01` ?⑤룆 寃?됱? 異쒕젰 ?놁쓬.
    - 寃곕줎: C002???꾩옱 釉붾줈而ㅻ뒗 `0x0356` ?≪떊?대굹 `0x67` ?앹꽦 ?먯껜媛 ?꾨땲?? ?앹꽦??0x67/list媛 post-world active selection payload/command row/SelectGrid submode latch濡??댁뼱吏吏 ?딅뒗 援ш컙?대떎. ?ㅼ쓬 RE??`FUN_004f6680` ?댄썑 selection payload import/activation, `FUN_004f68f0`, `FUN_004f6600`, `FUN_005015f0`, `FUN_005737d0` ?몄텧??寃쎈줈瑜??ㅼ떆 醫곹엺??
    - stop 寃곌낵 `shaVerified:true`, restoredSha=`98ca4acd...`. 留덉?留??뺤씤?먯꽌 `G7MTClient` ?꾨줈?몄뒪? `47900` listener ?놁쓬, installed/overlay EXE SHA 紐⑤몢 `98ca4acd...`.

50. dgVoodoo logo removal and official launcher path were rechecked on 2026-06-28.
    - Live session: `.omo/ui-explorer/dgvoodoo-logo-check-98ca-20260628`.
    - Command path: `RE/tools/logh7_ui_explorer.py --display-mode borderless --no-login`, launching installed `exe/G7MTClient.exe` from installed/exe after copying canonical overlay `G7MTClient.playable.exe`.
    - Canonical EXE SHA stayed `98ca4acd2ec86b657e75b28623bf753029a83d116b052c54ba6e45d4f7952afc` for both installed and overlay game EXEs.
    - Screenshots `shots/001-initial.png` and `shots/002-logo-after-10s.png` show no bottom-right dgVoodoo watermark.
    - `python -m tools.logh7_dgvoodoo_nowatermark` verified `Version=0x287`, `dgVoodooWatermark=false`, `3DfxWatermark=false`, `WatermarkDisplayDuration=1`.
    - First `ui_explorer stop` hit transient `WinError 1224` during EXE restore after the client had exited; immediate checks showed no `G7MTClient`, no `47900` listener, and both game EXE hashes already restored. A second `stop` completed with `shaVerified:true`.
    - Recompiled installed `LOGH7Launcher.exe` directly from `RE/tools/launcher/LOGH7Launcher.cs` with PowerShell `Add-Type`, because `python -m tools.logh7_build_player_launcher` still fails on missing `RE/content/logh7-content.db`.
    - Installed launcher rebuilt from source. The binary SHA was a compile-output receipt only and is not a stable authority.
    - `LOGH7Launcher.exe --check` and `LOGH7Launcher.exe --client-smoke` both exited 0. After launcher smoke, active `exe/dgVoodoo.conf` still had borderless sharp/no-watermark values: `FullScreenMode=false`, `ScalingMode=centered`, `Resampling=pointsampled`, `WindowedAttributes=borderless`, `FullscreenAttributes=fake`, `Filtering=appdriven`, `Antialiasing=off`, `RTTexturesForceScaleAndMSAA=false`, `SmoothedDepthSampling=false`, `3DfxWatermark=false`, `3DfxSplashScreen=false`, `dgVoodooWatermark=false`.
    - Rawls read-only audit confirmed active code/tests no longer set `WatermarkDisplayDuration=0` or leave watermark true; stale `0` remains only in backup configs.

51. C002 admission-discriminator live session was closed and verified.
    - Session: `.omo/ui-explorer/c002-admission-discriminator-98ca-20260628`.
    - `python -m tools.logh7_ui_explorer --session .omo/ui-explorer/c002-admission-discriminator-98ca-20260628 stop` returned `shaVerified:true`, `restoredClientKind=canonical-playable`, restored SHA `98ca4acd2ec86b657e75b28623bf753029a83d116b052c54ba6e45d4f7952afc`.
    - Final local checks showed no `G7MTClient` or `node` process, no `47900` listener, and installed/overlay game EXEs both at SHA `98ca4acd2ec86b657e75b28623bf753029a83d116b052c54ba6e45d4f7952afc`.

52. C002 discriminator artifacts were aggregated.
    - Trace contains world-entry `0x0204`, `0x0325`, `0x0b0a`, `0x0356`.
    - `0x0356` was `compact-0356` for character `2`, with `recordGridUnit24Le=1` and `recordGridUnit28Le=1`.
    - Trace contains two `0x0f08 -> 0x0f09` pairs and no `0x0b01`.
    - `selectgrid-snapshot.jsonl` stayed inactive across all click labels: `fieldMode=2`, `focusChar=2`, `unitCount=1`, `commandRows=24`, `selectedD5=-1`, `categoryD6=-1`, `listCount188=0`, `payloadCount270=0`, `payloadCount270U8=0`, `rows=0`.
    - `selectgrid-state.jsonl` recorded two `sendCorrelator-004b78a0-enter` events. Both had `arg2=48 (0x30)`, not movement case `0x3a`.
    - `hud-admission.jsonl` recorded `hudGate`, `selectionHitTest`, and `commandRowHit`, but no runtime `selectionImport`, `commandBuild`, `factoryDispatch`, or `selectGridFactory`.

53. The SelectGrid state watcher was hardened to label dispatch cases.
    - File: `RE/tools/logh7_selectgrid_state_watch.py`.
    - New field: `dispatchCaseInfo(arg2)` on send-path entries.
    - Known labels: `0x30 = case30-observed-info-path` from live C002 `0x0f08/0x0f09` correlation; `0x3a = case3a-grid-move`, request `0x0b01`, response `0x0b07`.
    - Test updated: `RE/tools/tests/test_logh7_selectgrid_state_watch.py`.
    - Verification: `cd RE; python -m py_compile tools/logh7_selectgrid_state_watch.py` PASS.
    - Verification: `cd RE; python -m unittest tools.tests.test_logh7_selectgrid_state_watch` = 2/2 PASS.

54. Focused C002 evidence note was added.
    - New doc: `docs/logh7-c002-admission-discriminator-2026-06-28.md`.
    - Conclusion recorded there and in `docs/logh7-loop-state.md` journal #28: C002 is now blocked after `0x0356` and after slot `0x67`; the missing step is client-side admission/import into active selection and the SelectGrid command factory.

55. C002 postload action-list seat lever was live-tested.
    - Session: `.omo/ui-explorer/c002-postload-seats-98ca-20260628`.
    - Start command used installed/canonical playable path through `RE/tools/logh7_ui_explorer.py`, `--display-mode borderless`, no `LOGH_PRESEED_PLAYER_CHAR`.
    - Env added `LOGH_POSTLOAD_ACTION_LIST_SEATS=1` on top of `LOGH_POSTLOAD_RICH_CHARACTER=1`, `LOGH_STRAT_GALAXY=1`, `LOGH_STRAT_GRID_EARLY=1`, `LOGH_STRAT_TERRAIN=1`, `LOGH_WORLD_PLAYER=1`, `LOGH_FULL_UNIT_LOCATION=1`, `LOGH_GRID_ENTER=1`.
    - Start output: `runClientKind=canonical-playable`, installed/source SHA `98ca4acd2ec86b657e75b28623bf753029a83d116b052c54ba6e45d4f7952afc`, server PID `20756`, client PID `9840`.
    - Natural create-character completed: character `2`, `TEST S028 / FLAG`, categories `0..4`, then world-entry.
    - Post-load trace included `0x0b09`, `0x0204`, `0x0325`, `0x0323`, `0x0b0a`, `0x0356`.
    - `0x0356 compact-0356` carried `recordSeatCount250=1`, `recordSeatChar254=2`, `recordSeatRole258=0`.

56. RE corrected the active selection count source.
    - `FUN_004f68f0` stores PLAYER_INFO at selection-list `+0x18a` and copies `*(payload+0x270)` into `selectionList[0x188]`.
    - `FUN_004f6040` still creates slot `0x67`, but row count is later controlled by the PLAYER_INFO payload count.
    - Server path already had the needed env lever: `LOGH_POSTLOAD_ACTION_LIST_SEATS=1` via `activeSeatEntries(..., { postload:true })`.
    - Superseded on 2026-06-28: rich `0x0356` without post-load seats did leave the action payload incomplete, but later no-preseed runs with `LOGH_POSTLOAD_ACTION_LIST_SEATS=1` proved `PLAYER_INFO+0x270=1`, `selection.listCount188=1`, and one primary/secondary row. The current C002 wall is admission/controller gating, not payload absence.

57. SelectGrid snapshot proved `PLAYER_INFO+0x270` was revived.
    - `postload-seats-before-clicks`: `fieldMode=2`, `focusChar=2`, `unitCount=1`, `hudMode=1`.
    - Selection state: `listCount188=1`, `payloadCount270=1`, `payloadCount270U8=1`, `currentPayloadCount270=1`.
    - One row existed: primary ptr `0xd8545e4`, secondary ptr `0xd8554fc`, both width `316`, height `32`.
    - Command table existed with `rowCountD4=24`, but `selectedD5=-1`, `categoryD6=-1`.

58. Click probes showed the next wall is UI admission, not data fill.
    - Clicked info-panel, command-oval, own-cell center, left selection row candidates, and right command button candidates.
    - Trace summary after probes: `0x0b01=0`, `0x0b07=0`, `0x0f08=5`, `0x0f09=5`, `0x0356=1`.
    - Snapshots after clicks still had `listSelected189=-1`, `selectedD5=-1`, `categoryD6=-1`.
    - Map selected cells changed, proving DirectInput/map projection was active, but the HUD selection/command admission did not advance.

59. Admission watcher narrowed the failed client branch.
    - `logh7_selectgrid_state_watch.py` produced `224` events.
    - `logh7_hud_admission_watch.py` reached `24000` events.
    - Tag counts included `selectionHitTest-enter/leave` and `commandRowHit-enter/leave`, but no `factoryDispatch`, `commandBuild`, or `selectGridFactory` transition.
    - `command-row-*` target roles were `0` hits.
    - `selection-primary/secondary` roles were observed, but `FUN_005015f0(..., eventKind=2)` returned false and `listSelected189` stayed `-1`.
    - `FUN_004f58c0` RE explains command failure: command rows are scanned only when `*(activeCommandRoot+4) != 0`; live `command.activeGate04=0`, `activeGate05=0`, `rowCountD4=24`.

60. Server trace field was clarified to avoid 0x0323/0x0356 offset confusion.
    - File changed: `server/src/server/logh7-auth-server.mjs`.
    - Added `recordSeatCount24c` for fixed `0x0323` records.
    - Kept `recordSeatCount250` for compatibility; interpret `+0x250` as the compact `0x0356` expanded native-object count.
    - Verification: `cd server; node --test tests/server/logh7-login-session.test.mjs tests/server/logh7-server.test.mjs` = 146/146 PASS.

61. C002 postload-seats live session was closed and verified.
    - `python -m tools.logh7_ui_explorer --session ..\.omo\ui-explorer\c002-postload-seats-98ca-20260628 stop` returned `shaVerified:true`, `restoredClientKind=canonical-playable`.
    - Restored SHA: `98ca4acd2ec86b657e75b28623bf753029a83d116b052c54ba6e45d4f7952afc`.
    - Final checks showed no `G7MTClient`, no session `node`, no `47900` listener.
    - Installed and overlay game EXEs both matched SHA `98ca4acd2ec86b657e75b28623bf753029a83d116b052c54ba6e45d4f7952afc`.

62. Documentation was updated with the new C002 frontier.
    - `docs/logh7-loop-state.md` journal #29 added.
    - `docs/logh7-c002-admission-discriminator-2026-06-28.md` gained the postload action-list seats follow-up.
    - Current conclusion: data supply is now proven through `0x0356`, `0x67`, and `PLAYER_INFO+0x270`; remaining C002 work is `FUN_005015f0` selection hit-test/coordinate-parent transform and command root `+4` activation.

63. Current docs/roadmap/reference context was re-indexed and split across subagents.
    - Main context read: `logh7-re`, `logh7-wire`, `logh7-live`, `logh7-patch`, `logh7-localize`, and `logh7-extract` skill procedures.
    - Lagrange checked roadmap/prompt drift: current authority is canonical SHA `98ca4acd...`, C002 UI admission after `+0x270`, and stale docs still mention `992dc7e2` / old `0x0b07` uncertainty.
    - Goodall checked C002 RE/server: `FUN_004f6600` row hit-test is live, `FUN_004f58c0` is blocked by command root `+4`, and `FUN_00502ea0` is the direct `+4` writer.
    - Ptolemy checked fonts/UI/reference images: both primary UI and D3D atlas font slots are currently Pretendard; remaining blur should be treated as display-mode/filtering/size unless a fresh GDI watcher proves otherwise. The 134-image reference catalog has no obvious original name-entry panel screenshot.

64. C002 gate-discriminator tooling was extended.
    - File changed: `RE/tools/logh7_hud_hit_test_gate_watch.py`.
    - It now classifies `selection-primary-*`, `selection-secondary-*`, `command-root`, and `command-row-*` targets, not only HUD mode targets.
    - It records `selection.listSelected189`, `command.activeGate04/05`, `rowCountD4`, `selectedD5`, and `categoryD6` around watched hit tests.
    - It hooks `FUN_00502ea0` (`+4` writer) and `FUN_005024e0` (`+0x15` writer), recording caller VA, target, requested value, and before/after gate state.
    - Test updated: `RE/tools/tests/test_logh7_hud_hit_test_gate_watch.py`.
    - Verification: `cd RE; python -m py_compile tools/logh7_hud_hit_test_gate_watch.py` PASS.
    - Verification: `cd RE; python -m unittest tools.tests.test_logh7_hud_hit_test_gate_watch tools.tests.test_logh7_hud_admission_watch tools.tests.test_logh7_hud_event_queue_watch` = 10/10 PASS.

65. Canonical C002 gate-writer live session was started.
    - Session: `.omo/ui-explorer/c002-gate-writers-98ca-20260628`.
    - Command used `RE/tools/logh7_ui_explorer.py start` from `RE`, installed game EXE path, server root `server`, port `47900`, and `--display-mode borderless`.
    - No `LOGH_PRESEED_PLAYER_CHAR` was set.
    - Env: `LOGH_ACCEPT_ANY_GIN7=1`, `LOGH_POSTLOAD_RICH_CHARACTER=1`, `LOGH_POSTLOAD_ACTION_LIST_SEATS=1`, `LOGH_STRAT_GALAXY=1`, `LOGH_STRAT_GRID_EARLY=1`, `LOGH_STRAT_TERRAIN=1`, `LOGH_WORLD_PLAYER=1`, `LOGH_FULL_UNIT_LOCATION=1`, `LOGH_GRID_ENTER=1`.
    - Start receipt: server PID `22180`, client PID `9188`, `runClientKind=canonical-playable`, SHA `98ca4acd2ec86b657e75b28623bf753029a83d116b052c54ba6e45d4f7952afc`.

66. Lobby and world entry were driven through the real EXE.
    - Shot `002-lobby-ready.png` showed lobby.
    - Clicked game start at `(575,350)` and the character card at `(1090,455)`.
    - Existing profile `dummy:1` was used; this was not a preseed env path.
    - Trace included `0x0200`, `0x0204`, `0x0313`, `0x0325`, `0x0b0a`, and `0x0356 compact-0356`.
    - `0x0356` had `recordSeatCount250=1`, `recordSeatChar254=1`, `recordSeatRole258=0`.

67. Pre-click SelectGrid snapshot proved the active row was filled.
    - Snapshot file: `.omo/ui-explorer/c002-gate-writers-98ca-20260628/selectgrid-snapshot.jsonl`.
    - `fieldMode126711=2`, `gridActive126710=1`, `worldActive2a58f8=65537`, `focusChar3584a0=1`.
    - `unitCount41a364=1`, `selection.listCount188=1`, `payloadCount270=1`, `payloadCount270U8=1`.
    - One selection row existed: primary ptr `0xd84d5e4`, secondary ptr `0xd84e4fc`, width `316`, height `32`.
    - Command root existed with `rowCountD4=24`, `selectedD5=-1`, `categoryD6=-1`.

68. Three read-only watchers were attached.
    - `logh7_hud_admission_watch.py`: 23,945 events, cleanup OK.
    - `logh7_hud_hit_test_gate_watch.py`: 6,423 events, cleanup OK.
    - `logh7_hud_event_queue_watch.py`: 18,000 events, cleanup OK.
    - No force-gate/debug patch flag was used.

69. C002 click probes were executed under watcher coverage.
    - Clicked own visible cell `(965,552)`, selection-list candidate `(150,770)`, command oval `(1625,945)`, command row candidates `(1620,985)` and `(1620,1017)`, red planet `(1858,445)`, and empty grid `(1120,465)`.
    - Server trace after the full session: `0x0356=1`, `0x0f08=4`, `0x0f09=4`, `0x0b01=0`, `0x0b07=0`.
    - The clicks proved info-path selection still works, but no movement request originated.

70. Gate-writer watcher result was aggregated.
    - `selection-primary-0=249`, `selection-secondary-0=249`, `hudMode2Primary=249`, `hudMode4Primary=249`, `hudMode6Fallback=1241`, `hudMode2Fallback=1241`.
    - `inputHitTest-gate-005015f0` count `3478`; `retvalLow8=0` for all samples.
    - `selectionChanges=0`, `commandChanges=0`.
    - `activeGateWrite-leave-00502ea0` was observed 96 times at caller `0x50658b`, but not on the command root role.
    - `targetGate15Write-leave-005024e0` was observed 96 times; no event opened `listSelected189` or command selection.

71. Admission and event-queue result was aggregated.
    - `selectionHitTest-enter/leave-004f6600`: 249 each.
    - `selectionHitTest` returned `1` for all 249 leave samples.
    - `commandRowHit-enter/leave-004f58c0`: 249 each.
    - `commandRowHit` returned `0` for all 249 leave samples.
    - Event queue dequeue codes stayed in `2`, `9`, `11`, `13`; only two enqueue entries existed and both were event code `22`, not SelectGrid movement.
    - Conclusion: the row exists and its lower-level selection hit-test succeeds, but the higher-level input admission path rejects the event before `listSelected189` and command root `+4` change.

72. C002 live session was stopped and verified.
    - `ui_explorer stop` returned `shaVerified:true`.
    - Restored/current kind: `canonical-playable`.
    - Installed and overlay EXEs both matched SHA `98ca4acd2ec86b657e75b28623bf753029a83d116b052c54ba6e45d4f7952afc`.
    - Final checks showed no `G7MTClient`, no `node`, and no `47900` listener.

73. dgVoodoo logo and sharpness settings were rechecked from active config/code.
    - Installed `dgVoodoo.conf` has `dgVoodooWatermark=false`, `3DfxWatermark=false`, `3DfxSplashScreen=false`.
    - `WatermarkDisplayDuration=1` is a fallback cap if watermark display were enabled; dgVoodoo's comment says `0` or undefined means infinite duration.
    - Borderless sharp preset remains `ScalingMode=centered`, `Resampling=pointsampled`, `Filtering=appdriven`, `Antialiasing=off`, `RTTexturesForceScaleAndMSAA=false`, `SmoothedDepthSampling=false`.
    - If a logo is visible, current evidence points to a wrong cwd or isolated overlay launch without installed `D3D8.dll`/`dgVoodoo.conf`, not to the canonical installed EXE path.

74. Fresh GDI font watcher proved Pretendard is active in the canonical EXE.
    - Ran `RE/tools/logh7_gdi_font_watch.py --spawn-exe RE/.omo/work/logh7-installed/exe/G7MTClient.exe`.
    - Output: `.omo/ui-explorer/font-gdi-spawn-98ca-20260628/gdi-font.jsonl`.
    - Font registration: attempted/OK, `57` font files, `135` faces loaded.
    - `font-created`: 31/31 face `Pretendard`.
    - `ExtTextOutA`: 125/125 current face `Pretendard`.
    - Primary observed height was `14`, quality `5`, charset `-127`.
    - Therefore the current "not Pretendard" suspicion is disproven for canonical 98ca; remaining visual complaint is size/layout/display-mode filtering.

75. dgVoodoo receipt tooling was tightened.
    - File changed: `RE/tools/logh7_ui_explorer.py`.
    - `dgVoodooDisplay` now reports `resampling`, `threeDfxWatermark`, `threeDfxSplashScreen`, `dgVoodooWatermark`, `filtering`, `antialiasing`, `rtTexturesForceScaleAndMSAA`, and `smoothedDepthSampling`, not only display mode and watermark duration.
    - Test updated: `RE/tools/tests/test_logh7_ui_explorer.py`.
    - Verification: `cd RE; python -m py_compile tools/logh7_ui_explorer.py` PASS.
    - Verification: `cd RE; python -m unittest tools.tests.test_logh7_ui_explorer` = 17/17 PASS.

76. Current prompts, roadmap state, and subagent audits were re-read for the continued goal.
    - Re-indexed `docs/`, `.claude/commands`, `.claude/workflows`, `.claude/agents`, and project LOGH7 skills from the current worktree.
    - Read-only subagents audited roadmap drift, C002 RE, and font/UI/dgVoodoo state.
    - Consensus: C002 remains the blocker for interactive user-originated MP; observer/server-push MP can be tested separately.
    - Consensus: canonical authority is SHA `98ca4acd2ec86b657e75b28623bf753029a83d116b052c54ba6e45d4f7952afc`.

77. `FUN_005015f0` was re-read from decompile and canonical raw bytes.
    - Redex and `logh7_disasm_range.py` were run against the canonical playable EXE.
    - Event-2 path order was confirmed: target `+8`, queued-event fast path, controller `+5`, target `+0x15`, geometry `FUN_005025f0`, occlusion/peer gates, then event-specific latch such as target `+0xb00`.
    - Event-2 `target+0xb00` check is visible in disassembly around VA `0x005018cd`.

78. Existing gate-writer live log was re-parsed for exact rejection stage.
    - Source: `.omo/ui-explorer/c002-gate-writers-98ca-20260628/hud-hit-test-gates.jsonl`.
    - `selection-primary-0` and `selection-secondary-0`: 498 total `FUN_005015f0(2, row, ...)` samples.
    - All 498 had `retvalLow8=0`.
    - Row state in those samples: `valid08=1`, `flag15=1`, `gateB00=0`, `gateB01=0`, `gateB02=0`.
    - Controller state in those samples: `controllerGate05=0`.
    - No nested `pointRectHit-gate-005025f0`, `occlusionPrimary-gate-0050c180`, or `occlusionPeer-gate-00501d60` events occurred for those selection rows.
    - Conclusion: selection-row rejection occurs before geometry/occlusion and before the final `row+0xb00` event-2 latch check.

79. Existing writer samples were re-parsed.
    - `controllerGateWrite-005024b0` was seen only for other controllers at caller `0x506594`, inside `FUN_00506280`.
    - The selection hit-test controller seen during row admission was `0xf260e40`, and it stayed `+5=0`.
    - `activeGateWrite-leave-00502ea0` sampled other targets, not the command root role.
    - This explains why `listSelected189` never changed and why command root `+4` stayed closed.

80. RE correction was recorded.
    - `FUN_004f6600` is `void`; previous shorthand about its return value must not be used as success evidence.
    - The real selection success evidence is the write to `selectionList+0x624` / `listSelected189`.
    - That write did not occur in the canonical gate-writer live session.

81. Gate watcher was extended for the next live discriminator.
    - File changed: `RE/tools/logh7_hud_hit_test_gate_watch.py`.
    - `uiObjectState` now includes `eventKeys470`, `hasEvent2`, `hasEvent9`, and `hasEvent0b`.
    - New hook: `FUN_00507f20` logged as `interactionLatchLoop-enter/leave-00507f20`.
    - The hook records controller state, row state, selection/command summaries, input globals, and `+0xb00/+0xb01/+0xb02` before/after.

82. Gate watcher tests were updated.
    - File changed: `RE/tools/tests/test_logh7_hud_hit_test_gate_watch.py`.
    - Added assertions for `0x00507f20`, event queue key fields, and the latch-loop leave tag.

83. Verification was run.
    - `cd RE; python -m py_compile tools/logh7_hud_hit_test_gate_watch.py` PASS.
    - `cd RE; python -m unittest tools.tests.test_logh7_hud_hit_test_gate_watch tools.tests.test_logh7_hud_admission_watch tools.tests.test_logh7_hud_event_queue_watch` = 10/10 PASS.

84. dgVoodoo logo/sharpness was rechecked in the live canonical session.
    - Session: `.omo/ui-explorer/c002-latch-loop-98ca-20260628`.
    - `python -m tools.logh7_ui_explorer ... info` confirmed installed game EXE mode, canonical SHA `98ca4acd2ec86b657e75b28623bf753029a83d116b052c54ba6e45d4f7952afc`, and `displayMode=borderless`.
    - Active `dgVoodoo.conf` had `FullScreenMode=false`, `ScalingMode=centered`, `Resampling=pointsampled`, `WindowedAttributes=borderless`, `FullscreenAttributes=fake`, `Filtering=appdriven`, `Antialiasing=off`, `RTTexturesForceScaleAndMSAA=false`, `SmoothedDepthSampling=false`, `dgVoodooWatermark=false`, `3DfxWatermark=false`, `3DfxSplashScreen=false`.
    - Screenshot `shots/006-logo-recheck-live.png` showed no bottom-right dgVoodoo logo.
    - dgVoodoo's config comment was checked: `WatermarkDisplayDuration=0` or undefined means infinite duration if a watermark is enabled, so the active `1` value is intentional.

85. A no-watermark generator regression was found and fixed.
    - `RE/tools/logh7_dgvoodoo_nowatermark.py` still generated the old blurry remaster preset: `ScalingMode=stretched`, `Resampling=lanczos-3`, `Filtering=16`, `Antialiasing=4x`.
    - The generator now emits the same sharp borderless preset as `ui_explorer` and `LOGH7Launcher`: point-sampled, app-driven filtering, no AA, no forced RT texture scaling/MSAA, no smoothed depth sampling.
    - `RE/tools/client_patches/dgvoodoo-nowatermark.json` was rewritten as readable ASCII and now documents `sharpBorderless`.
    - Added `RE/tools/tests/test_logh7_dgvoodoo_nowatermark.py` to lock logo-off + sharp-borderless behavior.
    - Verification: `cd RE; python -m json.tool tools/client_patches/dgvoodoo-nowatermark.json`, `python -m py_compile tools/logh7_dgvoodoo_nowatermark.py`, `python -m unittest tools.tests.test_logh7_dgvoodoo_nowatermark tools.tests.test_logh7_ui_explorer` = 18/18 PASS.
    - Generator output: `watermarkOff=PASS`, `sharpBorderless=PASS`, SHA `0622de26d90d325046be2b8af8ba552e2aca85b4e292dfdf6b096a176c5aa6b9`.

86. The latest C002 live session was driven without preseed.
    - Start env included `LOGH_POSTLOAD_RICH_CHARACTER=1`, `LOGH_POSTLOAD_ACTION_LIST_SEATS=1`, `LOGH_STRAT_GALAXY=1`, `LOGH_STRAT_GRID_EARLY=1`, `LOGH_STRAT_TERRAIN=1`, `LOGH_WORLD_PLAYER=1`, `LOGH_FULL_UNIT_LOCATION=1`, `LOGH_GRID_ENTER=1`.
    - `LOGH_PRESEED_PLAYER_CHAR` was not present.
    - Lobby screenshot `shots/002-lobby-ready.png` was inspected, then game start and character card clicks entered the world.
    - Trace included `0x0f02`, `0x0f06/0x0f07`, `0x0b09/0x0b0a`, and `0x0356 compact-0356`.

87. C002 snapshot after world load confirmed the data path is filled.
    - `selectgrid-snapshot-world.json` showed `fieldMode126711=2`, `gridActive126710=1`, `worldActive2a58f8=65537`.
    - Selection state: `listCount188=1`, `payloadCount270=1`, `payloadCount270U8=1`, one primary/secondary row.
    - Command state: `rowCountD4=24`, `selectedD5=-1`, `categoryD6=-1`, `activeGate04=0`, `activeGate05=0`.
    - Trace counts included `0x0356=1`, `0x0f08=3`, `0x0f09=3` before the click probe, and no `0x0b01`/`0x0b07`.

88. C002 latch/gate watchers were attached and read back.
    - Watchers: `logh7_hud_hit_test_gate_watch.py`, `logh7_hud_admission_watch.py`, `logh7_hud_event_queue_watch.py`.
    - Output sizes/events: hit-test gates 5297 events, admission 13014 events, event queue 9883 events; all cleanup-free.
    - `selection-primary-0` and `selection-secondary-0` each had 135 `FUN_005015f0` samples.
    - All selection samples had `gate05=0`, `flag15=1`, empty event queue keys, no `hasEvent2`, and `retvalLow8=0`.
    - `eventQueueDequeue` stayed on codes `2`, `9`, `11`, `13`; the only enqueue was event `22`, not SelectGrid move.
    - `listSelected189`, `command.selectedD5`, and `command.categoryD6` stayed `-1`; trace still had no `0x0b01`.

89. The live session was stopped and restored.
    - After the first selection-row click the client process exited before the later command click sequence could run; subsequent click attempts failed with `client window not found for pid 10108`.
    - `ui_explorer stop` returned `shaVerified:true`, restored SHA `98ca4acd2ec86b657e75b28623bf753029a83d116b052c54ba6e45d4f7952afc`.
    - Final process/port checks showed no `G7MTClient`, no server PID `4344`, no `47900` listener.
    - Installed and overlay game EXEs both matched canonical SHA `98ca4acd2ec86b657e75b28623bf753029a83d116b052c54ba6e45d4f7952afc`.

90. Subagent results were collected and closed.
    - C002 event/root audit: event kind `2` is an immediate hit-test click pulse, with `target+0xb00` produced through `FUN_004e96f0 -> FUN_0050c750 -> FUN_00507b10 -> FUN_00507f20`; no direct `FUN_00501e30(2, ...)` enqueue producer was found.
    - C002 natural-flow audit: the confirmed path remains `0x0356 -> FUN_004f68f0 -> FUN_004f6600 -> FUN_004f6b00/FUN_004f5cb0 -> FUN_004f58c0 -> FUN_004f93c0 -> FUN_00581c80 -> FUN_005737d0 -> FUN_004b78a0 case 0x3a -> 0x0b01`.
    - Font/UI/dgVoodoo audit: no-logo is solved for the canonical installed sidecar path; Pretendard usage is live-proven, while small text, borderless scaling, and create-character panel overflow remain separate visual/layout work.

91. A new canonical root-gate session was launched.
    - Session: `.omo/ui-explorer/c002-rootgate-98ca-20260628`.
    - Executable authority: installed `RE/.omo/work/logh7-installed/exe/G7MTClient.exe`, canonical playable SHA `98ca4acd2ec86b657e75b28623bf753029a83d116b052c54ba6e45d4f7952afc`.
    - Display receipt: `displayMode=borderless`, `ScalingMode=centered`, `Resampling=pointsampled`, `Filtering=appdriven`, `Antialiasing=off`, `RTTexturesForceScaleAndMSAA=false`, `SmoothedDepthSampling=false`.
    - Watermark receipt: `dgVoodooWatermark=false`, `3DfxWatermark=false`, `3DfxSplashScreen=false`, `WatermarkDisplayDuration=1`.
    - No `LOGH_PRESEED_PLAYER_CHAR` was used.

92. The no-preseed world flow was driven again.
    - Start env included `LOGH_POSTLOAD_RICH_CHARACTER=1`, `LOGH_POSTLOAD_ACTION_LIST_SEATS=1`, `LOGH_STRAT_GALAXY=1`, `LOGH_STRAT_GRID_EARLY=1`, `LOGH_STRAT_TERRAIN=1`, `LOGH_WORLD_PLAYER=1`, `LOGH_FULL_UNIT_LOCATION=1`, `LOGH_GRID_ENTER=1`.
    - Game-start and character-card flow entered the world.
    - Natural create-character path created character `2`.
    - Trace confirmed `0x0204`, `0x0325`, `0x0b0a`, and `0x0356 compact-0356`.
    - The `0x0356` record carried `recordSeatCount250=1`, `recordSeatChar254=2`, `recordSeatRole258=0`.

93. A root-gate snapshot was captured.
    - Snapshot file: `.omo/ui-explorer/c002-rootgate-98ca-20260628/selectgrid-snapshot-rootgate.jsonl`.
    - `fieldMode126711=2`, `gridActive126710=1`, `worldActive2a58f8=65537`, `focusChar3584a0=2`.
    - `unitCount41a364=1`, `selection.listPage187=1`, `selection.listCount188=1`.
    - `payloadCount270=1`, `currentPayloadCount270=1`.
    - One primary/secondary selection row existed.
    - Command state stayed `rowCountD4=24`, `selectedD5=-1`, `categoryD6=-1`, `activeGate04=0`, `activeGate05=0`.

94. The hit-test gate watcher was attached and exercised.
    - Watcher output: `.omo/ui-explorer/c002-rootgate-98ca-20260628/hud-hit-test-rootgate.jsonl`.
    - Watcher completed 18,623 events with cleanup errors `[]`.
    - Selection row samples totalled 1102.
    - All selection row `FUN_005015f0(2, row, ...)` samples returned `retvalLow8=0`.
    - Selection root/controller stayed closed: `rootState.gate04=0`, `rootState.gate05=0`.
    - Row target was enabled (`flag15=1`), but event keys were empty.

95. Root-open timing hooks produced negative evidence.
    - No `selectionImportApply-enter/leave-004f68f0` events fired during the attached interval.
    - No `selectionTabApply-enter/leave-004f6680` events fired during the attached interval.
    - No `commandTabApply-enter/leave-004f59e0` events fired during the attached interval.
    - No `hudModeSet-enter/leave-004fd7a0` events fired during the attached interval.
    - Interpretation: the watcher attached after the import/open moment, and no later UI-mode/tab refresh reopened the root during the click probes.

96. Root-gate click probes were run.
    - Selection-row click at `(1800,986)` produced `0x0f08 -> 0x0f09`.
    - Command-row click at `(1625,985)` produced no movement request.
    - Trace still had no `0x0b01` and no `0x0b07`.
    - `listSelected189`, `command.selectedD5`, and `command.categoryD6` remained unselected.

97. Static RE and live result were reconciled.
    - `FUN_005015f0` event kind `2` gates target `+8`, queued-event fast path, controller/root `+5`, target `+0x15`, geometry/occlusion, then final click pulse `target+0xb00`.
    - Current live samples fail at the closed controller/root stage before selection success.
    - `FUN_004f6600` is still the selection-row consumer, and success evidence is the write to `selectionList+0x624`.
    - `FUN_004f58c0` remains blocked because command root `+4` never opens.

98. The root-gate live session was stopped and verified.
    - `ui_explorer stop` returned `shaVerified:true`.
    - Restored/current kind: `canonical-playable`.
    - Restored SHA matched `98ca4acd2ec86b657e75b28623bf753029a83d116b052c54ba6e45d4f7952afc`.
    - Final checks showed no `G7MTClient` process and no `47900` listener.

99. Documentation was updated for the handoff.
    - Added journal #34 to `docs/logh7-loop-state.md`.
    - Added the root-gate follow-up to `docs/logh7-c002-admission-discriminator-2026-06-28.md`.
    - Added this action log continuation to `docs/logh7-session-2026-06-27-canonical-playable-c002-mp-font-audit.md`.
    - Current next live target is to attach before or at the first `0x0356` import and capture the first `FUN_004f68f0 -> FUN_004f6680` root-open timing.

100. Current watcher verification was re-run after documentation.
    - `cd RE; python -m unittest tools.tests.test_logh7_hud_hit_test_gate_watch tools.tests.test_logh7_hud_admission_watch tools.tests.test_logh7_hud_event_queue_watch` = 10/10 PASS.
    - `cd RE; python -m py_compile tools/logh7_hud_hit_test_gate_watch.py` PASS.

101. Active dgVoodoo installed config was re-read for the logo answer.
    - File checked: `RE/.omo/work/logh7-installed/exe/dgVoodoo.conf`.
    - `dgVoodooWatermark=false`, `3DfxWatermark=false`, `3DfxSplashScreen=false`.
    - `WatermarkDisplayDuration=1`.
    - Sharpness keys remain `ScalingMode=centered`, `Resampling=pointsampled`, `Filtering=appdriven`, `Antialiasing=off`, `RTTexturesForceScaleAndMSAA=false`, `SmoothedDepthSampling=false`.
    - Therefore a visible dgVoodoo logo implies the game was launched from a path/cwd that did not load this installed sidecar config.

102. Current LOGH VII skills and prior context were re-read before the next live run.
    - Used project LOGH7 procedure files for live, RE, and patch work.
    - Kept the user constraint that diagnostics must use the game EXE path, not a separate harness-only path.
    - Kept the no-blanket-node-kill rule; lifecycle cleanup used `ui_explorer stop` only.

103. Three subagents were used for cross-checking.
    - C002 RE agent checked the import/root functions and recommended `0x004fc4a0`, `0x004f68f0`, `0x004f6680`, `0x00502ea0`, `0x005024b0`, `0x004fd7a0`, `0x00506280`, and `0x004fd100`.
    - Live-procedure agent recommended early lifecycle attach in the lobby, full hit-test attach only after world entry, no preseed, and mandatory SHA stop verification.
    - Font/UI agent confirmed no-logo is solved on the installed sidecar path, Pretendard face is live-proven, and small text/layout remain separate visual work.

104. The hit-test/root watcher was extended for early attach.
    - File changed: `RE/tools/logh7_hud_hit_test_gate_watch.py`.
    - Added `--lifecycle-only` and `--max-events`.
    - Lifecycle-only skips noisy hit-test/geometry/latch hooks and keeps import/tab/root writer hooks, so it can attach before game-start.
    - Added `layoutOpenUpdate` hook for `FUN_00506280`.
    - Added `hudInformationRefresh` hook for `FUN_004fc4a0`.
    - Added change-only hook for `FUN_004fd100`.
    - Added `selection-root` classification and `payload+0x270` state logging.

105. Watcher tests were updated and run.
    - File changed: `RE/tools/tests/test_logh7_hud_hit_test_gate_watch.py`.
    - Added assertions for `--max-events`, `--lifecycle-only`, `0x00506280`, `0x004fc4a0`, `0x004fd100`, `selection-root`, `payloadArgState`, and `count270S32`.
    - Verification: `cd RE; python -m py_compile tools/logh7_hud_hit_test_gate_watch.py` PASS.
    - Verification: `cd RE; python -m unittest tools.tests.test_logh7_hud_hit_test_gate_watch tools.tests.test_logh7_hud_admission_watch tools.tests.test_logh7_hud_event_queue_watch` = 11/11 PASS.

106. A canonical early-root live session was launched.
    - Session: `.omo/ui-explorer/c002-earlyroot-98ca-20260628`.
    - Start command used `RE/tools/logh7_ui_explorer.py` from `RE` with `--server-root ..\server`, port `47900`, and `--display-mode borderless`.
    - Env included `LOGH_ACCEPT_ANY_GIN7=1`, `LOGH_POSTLOAD_RICH_CHARACTER=1`, `LOGH_POSTLOAD_ACTION_LIST_SEATS=1`, `LOGH_STRAT_GALAXY=1`, `LOGH_STRAT_GRID_EARLY=1`, `LOGH_STRAT_TERRAIN=1`, `LOGH_WORLD_PLAYER=1`, `LOGH_FULL_UNIT_LOCATION=1`, `LOGH_GRID_ENTER=1`.
    - `LOGH_PRESEED_PLAYER_CHAR` was not present.
    - Canonical playable SHA was `98ca4acd2ec86b657e75b28623bf753029a83d116b052c54ba6e45d4f7952afc`.
    - Start receipt reported sharp no-logo dgVoodoo settings: `ScalingMode=centered`, `Resampling=pointsampled`, `Filtering=appdriven`, `Antialiasing=off`, `RTTexturesForceScaleAndMSAA=false`, `SmoothedDepthSampling=false`, `dgVoodooWatermark=false`, `3DfxWatermark=false`, `3DfxSplashScreen=false`.

107. The lifecycle-only watcher was attached before game start.
    - Output: `.omo/ui-explorer/c002-earlyroot-98ca-20260628/hud-lifecycle-earlyroot.jsonl`.
    - Watcher duration was 240 seconds, poll 500 ms, max events 120000.
    - It completed 811 events with cleanup errors `[]`.

108. The lobby-to-world path was driven and inspected.
    - Lobby screenshot `shots/002-earlyroot-lobby-before-flow.png` was inspected; no logo was visible.
    - Game-start click used the actual visible button coordinate around `(574,349)`.
    - Character card click at `(1100,455)` entered world.
    - Trace reached `0x0200`, `0x0204`, `0x0f02`, `0x0325`, `0x0b0a`, and `0x0356 compact-0356`.
    - The `0x0356` record carried `recordSeatCount250=1`, `recordSeatKind254=1`, `recordSeatChar254=1`, `recordSeatRole258=0`, and `postloadActionListSeatsEnv="1"`.
    - World screenshot `shots/005-earlyroot-world-after-0356.png` was inspected; world map and UI were visible and no logo was visible.

109. The early-root snapshot confirmed data fill.
    - Snapshot file: `.omo/ui-explorer/c002-earlyroot-98ca-20260628/selectgrid-snapshot-earlyroot.jsonl`.
    - `fieldMode126711=2`, `gridActive126710=1`, `worldActive2a58f8=65537`, `focusChar3584a0=1`, `unitCount41a364=1`.
    - Selection state: `listPage187=1`, `listCount188=1`, `listSelected189=-1`, `payloadCount270=1`, `currentPayloadCount270=1`.
    - One primary/secondary selection row existed.
    - Command state: `activeGate04=0`, `activeGate05=0`, `rowCountD4=24`, `selectedD5=-1`, `categoryD6=-1`.

110. The early lifecycle log produced the key C002 finding.
    - Selection root `0xf240e40` opened through `FUN_00506280` at returnVa `0x004f658f`.
    - The associated root writers were `FUN_00502ea0` returnVa `0x0050658b` and `FUN_005024b0` returnVa `0x00506594`.
    - They moved root `+4/+5` from `0/0` to `1/1`.
    - Immediately after that, `FUN_004f6680(1)` ran and closed the same selection root back to `0/0`.
    - Later `0x0356 -> FUN_004fc4a0 -> FUN_004f68f0` imports filled or preserved list count `1`, but kept invoking `FUN_004f6680(1)` while the root stayed closed.

111. The static tab table was checked against the live result.
    - Canonical EXE bytes at `DAT_0066f130 + tab*0x208` showed tab0 first dword `0xffffffff`, tab1 first dword `0xffffffff`, tab2 first dword `0x00000000`, tab3 first dword `0x00000000`.
    - `FUN_004f6680` closes root `+4/+5` when the selected tab's first dword is `-1`.
    - The live requested tab was `1`, so the observed close is explained.
    - `FUN_004fd7a0` live requested mode `1`; the static mode2 branch would call `FUN_004f6680(3 - bVar9)`, selecting valid tab `2` or `3`.

112. A short full watcher and click probe were run after world entry.
    - Output: `.omo/ui-explorer/c002-earlyroot-98ca-20260628/hud-hit-test-after-earlyroot.jsonl`.
    - It completed 14,045 events with cleanup errors `[]`.
    - `selection-primary-0` and `selection-secondary-0` each had 403 event-kind-2 samples.
    - All samples had `retvalLow8=0`, controller `+5=0`, row `flag15=1`, and `b00=0`.
    - Selection-row click at `(1800,986)` produced `0x0300` immediately and final trace later had `0x0f08/0x0f09`.
    - Command-row click at `(1625,985)` produced no movement request.
    - Final trace counts: `0x0356=1`, `0x0f08=2`, `0x0f09=2`, `0x0b01=0`, `0x0b07=0`.

113. The early-root session was stopped and verified.
    - `ui_explorer stop` returned `shaVerified:true`.
    - Restored/current kind was `canonical-playable`.
    - Restored SHA matched `98ca4acd2ec86b657e75b28623bf753029a83d116b052c54ba6e45d4f7952afc`.
    - Final checks showed no `G7MTClient` and no `47900` listener.

114. Server action-list category levers were inspected.
    - `server/src/server/logh7-login-session.mjs` has real levers, not only trace echo: `LOGH_ACTION_LIST_CATEGORY`, `LOGH_ACTION_LIST_SEATS`, and `LOGH_POSTLOAD_ACTION_LIST_SEATS` flow through `activeSeatEntries()`.
    - `LOGH_ACTION_LIST_CATEGORY=0` becomes `0x10000` in the full `0x0323` record, while the compact/native `0x0356` low u16 still appears as `0`.
    - The levers alter `0x0323`/`0x0356` action-list seat/category bytes; they are not yet proven to change the client UI tab/mode request that selected invalid tab `1`.
    - Next use should be a documented A/B discriminator, not a claimed fix.

115. Documentation was updated for the handoff.
    - Added journal #35 to `docs/logh7-loop-state.md`.
    - Added the early-root follow-up to `docs/logh7-c002-admission-discriminator-2026-06-28.md`.
    - Added this action log continuation to `docs/logh7-session-2026-06-27-canonical-playable-c002-mp-font-audit.md`.
    - Current next C002 target is to prove what natural condition makes `FUN_004fd7a0` / `FUN_004f6680` request valid tab `2` or `3`, or why the post-load path remains stuck on invalid tab `1`.

116. The stale action-list note in loop-state was corrected.
    - Old 2026-06-21 text said `LOGH_ACTION_LIST_CATEGORY/SEATS/POSTLOAD_ACTION_LIST_SEATS` were trace echo only.
    - Current server inspection showed `activeSeatEntries()` really emits those values into `0x0323`/`0x0356`.
    - The old line was kept as historical context but marked stale/2026-06-28 corrected.

117. Static RE was continued for the valid-tab condition.
    - `python tools\logh7_redex.py grep "FUN_004fd7a0"` found callers `FUN_004fc4a0`, `FUN_004fc4e0`, `FUN_004fd100`, and `FUN_004fd560`.
    - `FUN_004fd7a0` was re-read by redex.
    - `FUN_004f6680` was re-read by redex.
    - `FUN_004fc4a0`, `FUN_004fc4e0`, `FUN_004fd100`, and `FUN_004fd560` were re-read by redex.

118. Static RE conclusion was recorded.
    - `FUN_004fd7a0` always resets command/selection tabs through `FUN_004f59e0(1)` and `FUN_004f6680(1)` before branch-specific handling.
    - Only the `HUD+0xf4 == 2` branch calls `FUN_004f6680(3 - bVar9)`, selecting valid tab `2` or `3`.
    - `FUN_004fc4a0` imports `0x0356` data, saves the current `HUD+0xf4`, clears it, and replays the saved mode through `FUN_004fd7a0(savedMode,0)`.
    - Therefore the early-root live `requestedMode=1` means the HUD was already in mode 1 before the import refresh, not that `0x0356` itself selected mode 1.

119. The natural mode2 entry path was identified.
    - `FUN_004fd100` per-frame tail can call `FUN_004fd7a0(2,1)` when `FUN_005015f0(2, *(HUD+0x14), ...)` succeeds.
    - It can also reach mode2 through the `HUD+0x28` fallback when current `HUD+0xf4==1`.
    - Older live notes already showed these HUD mode targets could have empty event queues / `b00=0`, so the next live must focus on the mode target event producer, not only populated selection rows.

120. Documentation was updated again after static RE.
    - Added journal #36 to `docs/logh7-loop-state.md`.
    - Added the mode2/valid-tab follow-up to `docs/logh7-c002-admission-discriminator-2026-06-28.md`.
    - Added this action-log continuation.
    - Current next live pass/fail condition is natural `FUN_004fd7a0(2,1)` followed by `FUN_004f6680(2/3)`.

121. The mode-target watcher was extended before the next live pass.
    - File changed: `RE/tools/logh7_hud_hit_test_gate_watch.py`.
    - Added read-only hooks for `FUN_00501e30` event queue enqueue and `FUN_00501ed0` event queue dequeue.
    - Added `eventQueueEnqueueSamples` filtering for watched targets and event codes `2`, `9`, `0x0b`, `0x16`, `0x17`, `0x18`, and `0x22`.
    - Added `modeTargetSummary()` and emitted both `mode` and legacy `modeTargets` in `watch-ready`.
    - File changed: `RE/tools/tests/test_logh7_hud_hit_test_gate_watch.py`.
    - Added assertions for `0x00501e30`, `0x00501ed0`, `modeTargetSummary`, and enqueue/dequeue event tags.
    - Verification: `cd RE; python -m py_compile tools\logh7_hud_hit_test_gate_watch.py` PASS.
    - Verification: `cd RE; python -m unittest tools.tests.test_logh7_hud_hit_test_gate_watch tools.tests.test_logh7_hud_admission_watch tools.tests.test_logh7_hud_event_queue_watch` = 11/11 PASS.

122. A canonical mode2 live session was launched.
    - Session: `.omo/ui-explorer/c002-mode2-target-98ca-20260628`.
    - Start command used `RE/tools/logh7_ui_explorer.py` with `--server-root ..\server`, port `47900`, and `--display-mode borderless`.
    - Env included `LOGH_ACCEPT_ANY_GIN7=1`, `LOGH_POSTLOAD_RICH_CHARACTER=1`, `LOGH_POSTLOAD_ACTION_LIST_SEATS=1`, `LOGH_STRAT_GALAXY=1`, `LOGH_STRAT_GRID_EARLY=1`, `LOGH_STRAT_TERRAIN=1`, `LOGH_WORLD_PLAYER=1`, `LOGH_FULL_UNIT_LOCATION=1`, and `LOGH_GRID_ENTER=1`.
    - `LOGH_PRESEED_PLAYER_CHAR` was not present.
    - Start receipt showed canonical source/run SHA `98ca4acd2ec86b657e75b28623bf753029a83d116b052c54ba6e45d4f7952afc`.
    - Start receipt also showed no-logo/sharp dgVoodoo keys: `dgVoodooWatermark=false`, `3DfxWatermark=false`, `3DfxSplashScreen=false`, `ScalingMode=centered`, `Resampling=pointsampled`, `Filtering=appdriven`, `Antialiasing=off`.

123. The lobby-to-world flow was driven.
    - Lobby-ready screenshot showed the lobby and no dgVoodoo logo.
    - Game-start click used `(574,349)`.
    - Character card click used `(1100,455)`.
    - Trace entered world and sent post-load records including `0x0f02`, `0x0f06->0x0f07`, `0x0b09`, `0x0204`, `0x0325`, `0x0323`, `0x0b0a`, and `0x0356`.
    - `0x0356 compact-0356` carried `recordSeatCount250=1`, `recordSeatKind254=1`, `recordSeatChar254=1`, `recordSeatRole258=0`, `postloadActionListSeatsEnv="1"`.
    - World screenshot `shots/005-world-after-0356.png` showed the strategy map, world HUD, and no dgVoodoo logo.

124. Mode and SelectGrid state were captured after world entry.
    - `logh7_c002_mode_probe --r1` showed `selector_35f35a=0`, `mode_byte_126711=2`, `selectedChar_3584a0=1`, `own_cell_11178=2588`.
    - Snapshot `selectgrid-snapshot-mode2-before.jsonl` showed `gridActive126710=1`, `worldActive2a58f8=65537`, `fieldMode126711=2`, and `focusChar3584a0=1`.
    - Selection state: `listCount188=1`, `payloadCount270=1`, `payloadCount270U8=1`, `currentPayloadCount270=1`, and one primary/secondary row.
    - Command state: `activeGate04=0`, `activeGate05=0`, `rowCountD4=24`, `selectedD5=-1`, `categoryD6=-1`.

125. The first full mode-target watcher was run.
    - Output: `.omo/ui-explorer/c002-mode2-target-98ca-20260628/hud-hit-test-mode2-targets.jsonl`.
    - It completed 29,563 events with cleanup errors `[]`.
    - `watch-ready` showed `hudMode2Primary` and `hudMode4Primary` valid but invisible/disabled.
    - `hudMode2Fallback` and `hudMode6Fallback` were visible/enabled.
    - Clicked `hudMode2Fallback` center `(82,16)`, `hudMode6Fallback` center `(249,16)`, hidden `hudMode2Primary` center `(165,47)`, and logical command row `(57,146)`.
    - Only the first visible mode2 fallback click produced a wire request, and it was `0x0f08 -> 0x0f09`, not `0x0b01`.

126. The second watcher isolated visible map/object clicks.
    - Output: `.omo/ui-explorer/c002-mode2-target-98ca-20260628/hud-hit-test-visible-objects.jsonl`.
    - It completed 33,747 events with cleanup errors `[]`.
    - Clicked own/central system `(965,548)`, right fleet panel `(1795,965)`, left fleet info `(180,1005)`, blue system `(423,354)`, and red system `(1863,447)`.
    - Blue system click produced `0x0f08 -> 0x0f09`.
    - Other clicks produced no movement request.
    - No click produced `0x0b01` or `0x0b07`.

127. Watcher logs were summarized.
    - First watcher tag counts included 6600 `inputHitTest-gate-005015f0`, 6600 `eventQueueDequeue-enter-00501ed0`, 4696 `pointRectHit-gate-005025f0`, and exactly 1 `eventQueueEnqueue-enter-00501e30`.
    - Second watcher tag counts included 7578 `inputHitTest-gate-005015f0`, 7578 `eventQueueDequeue-enter-00501ed0`, 5398 `pointRectHit-gate-005025f0`, and exactly 1 `eventQueueEnqueue-enter-00501e30`.
    - Both enqueues were event code `22` (`0x16`), `returnVa=0x00517d2d`, target `0x1218d2b0`, target roles `[]`, rect `0,0,512,32`.
    - Mode targets still had no queued event `2`, `9`, or `0xb`.
    - No `hudModeSet`, `selectionTabApply`, or `commandTabApply` event fired during the probes beyond hook installation/initial frame state.

128. Final server trace was checked.
    - Movement counts stayed `0x0b01=0`, `0x0b07=0`.
    - Info/status counts were `0x0f08=3`, `0x0f09=3`.
    - `0x0356=1` stayed present.
    - The observed client-originated payload for `0x0f08` was `0f080000000100000000000000000000000000000000000000000101`.

129. Subagents were used for independent cross-checks.
    - RE subagent confirmed `0x00517d2d` is inside `FUN_00517cd0` after `FUN_00501e30(0x16, ...)`.
    - RE subagent identified direct callers `FUN_004c2620 -> FUN_00517cd0(0x0f08, ...)` and `FUN_004c2660 -> FUN_00517cd0(0x0f09, ...)`.
    - RE subagent contrasted that with the SelectGrid chain `FUN_005737d0 -> FUN_004b48d0 -> FUN_004b78a0(arg2=0x3b -> case 0x3a) -> 0x0b01`.
    - Font/UI subagent confirmed the dgVoodoo logo is solved on the installed sidecar path and the remaining small/blurred feel is likely native 1920x1080 plus current 14px-ish font size, not missing Pretendard.
    - Server/wire subagent confirmed current `0x0f09` is a one-byte generic/status response and should not be treated as command unlock.

130. The canonical session was stopped and verified.
    - First `ui_explorer stop` hit a transient Windows file-lock (`WinError 32`) while restoring the EXE after the game process had exited.
    - A process check showed no remaining `G7MTClient`.
    - A second `ui_explorer stop` completed with `shaVerified:true`.
    - Restored kind was `canonical-playable`.
    - Restored SHA matched `98ca4acd2ec86b657e75b28623bf753029a83d116b052c54ba6e45d4f7952afc`.
    - Final checks showed no `G7MTClient` process and no `47900` listener.

131. Event22 payload instrumentation was added after the live result.
    - File changed: `RE/tools/logh7_hud_hit_test_gate_watch.py`.
    - Added `readBytesHex(address, length)`.
    - `eventQueueEnqueue-enter-00501e30` now includes `payloadBytes34`, a 0x34-byte raw hex copy of the enqueue payload pointer.
    - File changed: `RE/tools/tests/test_logh7_hud_hit_test_gate_watch.py`.
    - Added assertions for `readBytesHex` and `payloadBytes34`.
    - Verification: `cd RE; python -m py_compile tools\logh7_hud_hit_test_gate_watch.py` PASS.
    - Verification: `cd RE; python -m unittest tools.tests.test_logh7_hud_hit_test_gate_watch tools.tests.test_logh7_hud_admission_watch tools.tests.test_logh7_hud_event_queue_watch` = 11/11 PASS.

132. Static/server context was rechecked after the live result.
    - `FUN_004fef90` redex still shows `0x0356` is consumed in strategy sequence case 1 by `FUN_004fc4a0`.
    - Current server `0x0307` trace in this session remained the all-zero/generic static information body path, not a proven command unlock.
    - Existing roadmap notes still warn that `0x0305/0x0307` alone has timing/admission pitfalls; the immediate live evidence is event22/0x0f08, not SelectGrid.

133. Documentation was updated for the handoff.
    - Added journal #37 to `docs/logh7-loop-state.md`.
    - Added the mode-target/event22 follow-up to `docs/logh7-c002-admission-discriminator-2026-06-28.md`.
    - Added this action-log continuation.
    - Current next C002 target is to capture `payloadBytes34` for event22 or resume the older positive-control command-row path that reaches `FUN_00581c80` before stalling short of `FUN_005737d0`.

134. Current authority and stale docs were rechecked.
    - Re-read the LOGH7 live/localize/RE/patch/wire skills after compaction.
    - Re-read `AGENTS.md`, `$logh7-loop` prompts, live standard docs, current loop state, and this session log.
    - Confirmed the current installed and overlay playable EXEs both hash to `98ca4acd2ec86b657e75b28623bf753029a83d116b052c54ba6e45d4f7952afc`.

135. Subagent outputs were consolidated.
    - Docs/prompt audit confirmed stale `992dc7e2`/`a7f4f80f`, stale `payload+0x270=0`, and stale `tools/logh7_ui_explorer.py` references.
    - RE audit confirmed event22/`0x0f08` is separate from the SelectGrid send chain.
    - Font/UI audit confirmed Pretendard face slots are present and the remaining issue is size/display/layout, not missing face.
    - MP/server audit confirmed server-side `0x0b07`/relay paths still need a real two-client consume/render smoke.

136. A canonical no-preseed event22 payload live session was run.
    - Session: `.omo/ui-explorer/c002-event22-payload-98ca-20260628`.
    - Start used `RE/tools/logh7_ui_explorer.py` from `RE` with `--server-root ..\server`, port `47900`, and `--display-mode borderless`.
    - Env included `LOGH_ACCEPT_ANY_GIN7=1`, `LOGH_POSTLOAD_RICH_CHARACTER=1`, `LOGH_POSTLOAD_ACTION_LIST_SEATS=1`, `LOGH_STRAT_GALAXY=1`, `LOGH_STRAT_GRID_EARLY=1`, `LOGH_STRAT_TERRAIN=1`, `LOGH_WORLD_PLAYER=1`, `LOGH_FULL_UNIT_LOCATION=1`, and `LOGH_GRID_ENTER=1`.
    - `LOGH_PRESEED_PLAYER_CHAR` was not set.

137. The live flow and data state were verified.
    - Lobby screenshot showed no dgVoodoo logo.
    - Game-start click used `(574,349)` and character card click used `(1100,455)`.
    - Trace reached world and contained `0x0356=1`, `0x0f02=1`.
    - `logh7_selectgrid_snapshot` showed mode2 with `selection.listCount188=1`, `payloadCount270=1`, `currentPayloadCount270=1`, one primary/secondary row, and `command.rowCountD4=24`.

138. The event22 payload watcher was run.
    - Output: `.omo/ui-explorer/c002-event22-payload-98ca-20260628/hud-hit-test-event22-payload.jsonl`.
    - Clicks on visible systems/map regions produced `0x0f08 -> 0x0f09`, not `0x0b01`.
    - Selection primary/secondary event-kind 2 samples still returned `retvalLow8=0`.
    - The captured enqueue had `eventCode=22`, `returnVa=0x00517d2d`, and a 0x34-byte `payloadBytes34` dump.

139. The captured payload was decoded.
    - `payloadBytes34=2806350309334277000f7105010000000000000000000000ffffff7fdcfa1a00285c6000280635032020e70c090f000030902c0d`.
    - Little-endian dword decode proves `payload+0x2c == 0x00000f09`.
    - `payload+0x30` is the domain/object pointer, so event22 is carrying the `0x0f09` info/status wrapper, not SelectGrid movement.

140. Static RE was rechecked against that payload.
    - `FUN_00517cd0` builds the 0x34-byte event payload and calls `FUN_00501e30(0x16, target, local_34)`.
    - `FUN_004c2620` wraps `0x0f08`; `FUN_004c2660` wraps `0x0f09`.
    - `FUN_004bee20` is a separate `0x0b07` wrapper path gated by `+0x2a58f8`.
    - Therefore the current click path is an info/status request path, not the SelectGrid chain.

141. dgVoodoo logo removal was re-read from active config.
    - Active `.omo/work/logh7-installed/exe/dgVoodoo.conf` has `dgVoodooWatermark=false`, `3DfxWatermark=false`, `3DfxSplashScreen=false`, and `WatermarkDisplayDuration=1`.
    - Sharp borderless keys remain `ScalingMode=centered`, `Resampling=pointsampled`, `Filtering=appdriven`, `Antialiasing=off`.
    - Latest lobby/world screenshots also showed no dgVoodoo logo.
    - If the logo appears, the likely cause is launching from a path/cwd that does not load the installed `D3D8.dll` and `dgVoodoo.conf` sidecars.

142. The session was stopped and verified.
    - `ui_explorer stop` completed with `shaVerified:true`.
    - Final checks showed no `G7MTClient` process and no `47900` listener.
    - Installed and overlay playable EXEs still matched SHA `98ca4acd2ec86b657e75b28623bf753029a83d116b052c54ba6e45d4f7952afc`.

143. Prompt and reference docs were updated.
    - `.claude`/`.codex` live skill descriptions now say `RE/tools/logh7_ui_explorer.py`.
    - `.claude/workflows/logh7-loop.js` now points live proof at `RE/tools/logh7_ui_explorer.py`.
    - `AGENTS.md`, `docs/logh7-live-test-standard.md`, and `docs/logh7-live-flow-plan-2026-06-26.md` now carry the current 98ca/no-preseed/no-blanket-node authority.
    - `docs/logh7-loop-state.md` now has journal #38 for event22 payload decode and the dgVoodoo logo answer.

144. The user's font description was reclassified.
    - User described the font as too small and as if only the outer stroke exists with an empty center.
    - Existing GDI proof still says canonical 98ca is using Pretendard, so the working hypothesis changed from "missing Pretendard" to "Pretendard + current raster settings do not survive the LOGH atlas conversion."

145. Static RE re-read the two font render paths.
    - `FUN_004aec70` is the primary UI `CreateFontA` path.
    - `FUN_004b07c0` initializes the D3D glyph atlas face/size.
    - `FUN_004b0960` renders dynamic glyphs into a 16bpp DIB, then extracts alpha from `byte >> 4`.
    - Canonical byte checks: primary quality `0x000aeddc=6a05`; atlas quality `0x000b0b91=6a05`; primary size `0x000ea1c6=6a0e`; atlas size `0x000b0869=83c0019090`; both face slots are `Pretendard`.

146. A non-live raster comparison tool was added.
    - File added: `RE/tools/logh7_font_raster_compare.py`.
    - It registers the bundled Pretendard fonts, draws cp949 strings with Windows GDI into 16bpp/32bpp DIBs, and reproduces LOGH VII's atlas alpha extraction.
    - Verification: `python -m py_compile RE\tools\logh7_font_raster_compare.py` PASS.

147. Raster comparisons were generated without running the game.
    - Main output: `.omo/font-raster-compare-20260628/font-raster-compare.png`.
    - Additional outputs: `.omo/font-raster-compare-20260628-betel/` and `.omo/font-raster-compare-20260628-name/`.
    - Result: `Pretendard 14 q5 w400 atlas-current` had only about `393-430/1000` solid alpha ratio, while `Pretendard 14 q4`, `Pretendard 16 q4`, `Pretendard 16 q4 w600`, and `Gulim 14 q4` reached `1000/1000`.
    - Interpretation: ClearType on the atlas path creates mostly partial-alpha/subpixel pixels that the old 4-bit extraction turns into gray outline-looking glyphs.

148. A narrow atlas-only candidate patch was added.
    - File added: `RE/tools/client_patches/font-atlas-antialias.json`.
    - It applies after `font-cleartype` and changes only `FUN_004b0960` atlas quality `6a05 -> 6a04` at `VA 0x004b0b91/file 0x000b0b91`.
    - It keeps primary UI ClearType, Pretendard face, HANGEUL_CHARSET, and current 14px-ish atlas size.

149. The candidate was built and byte-verified.
    - Built `.omo/work/logh7-ko-overlay/exe/G7MTClient.font-atlas-antialias.exe`.
    - Candidate SHA: `b11c6ad31891f038577728fbbba5c35155a5d091a27c9e6887d9c02070efa95a`.
    - Byte check passed: primary quality `6a05`, atlas quality `6a04`, atlas face `Pretendard`, primary size `6a0e`, atlas size `83c0019090`.

150. Direct candidate EXE launch was blocked.
    - `ui_explorer start --patched-exe ..\.omo\work\logh7-ko-overlay\exe\G7MTClient.font-atlas-antialias.exe` failed with `WinError 4551`.
    - This is the same Windows Code Integrity / Smart App Control class of blocker seen with the previous 16px candidate.
    - No live visual verdict was claimed for the candidate.

151. Future live work was explicitly deferred.
    - User asked to postpone live verification as much as possible and to avoid taking over the foreground while they use the PC.
    - A background worker was spawned to implement a non-live `ui_explorer` runtime-patch path: canonical on-disk 98ca, Frida spawn suspended, write descriptor bytes to memory, then resume.
    - That worker was instructed not to start the live game, not to click/type, and not to kill `node.exe`.

152. Loop state was updated.
    - Added journal #39 to `docs/logh7-loop-state.md`.
    - Current font fix plan: first test atlas-only `q5 -> q4`; if still too small, test 16px or modest atlas weight; live verification remains the final step.

153. The failed candidate-launch server residue was cleaned up safely.
    - After the `WinError 4551` client launch failure, port `47901` was still listening.
    - `Get-CimInstance Win32_Process -Filter "ProcessId = 25228"` proved PID `25228` was exactly `node src/server/logh7-server.mjs serve-auth --port 47901 --trace ...font-atlas-antialias-live-20260628\trace.jsonl`.
    - `ui_explorer stop` could not clean it because no `session.json` had been saved before the client launch failure.
    - Terminated only PID `25228`; no blanket `node.exe` kill was used.
    - Follow-up `Get-NetTCPConnection -LocalPort 47901` returned no listener.

154. Background worker implemented the runtime-patch launch path.
    - Files changed by worker: `RE/tools/logh7_ui_explorer.py`, `RE/tools/tests/test_logh7_ui_explorer.py`.
    - New CLI: `start --runtime-patch NAME` repeatable.
    - Runtime patch mode uses Frida `spawn -> attach -> script load/write -> resume` against the installed canonical `G7MTClient.exe`.
    - It reuses patch descriptor semantics from `RE/tools/logh7_runtime_patch_apply.py`.
    - It rejects `--runtime-patch` with `--patched-exe` or `--lobby-unblock-patch`.
    - It requires installed client SHA to remain canonical `98ca4acd2ec86b657e75b28623bf753029a83d116b052c54ba6e45d4f7952afc`.
    - Session state records `runtimePatch` with patch names, byte events, `ok`, and raw events.
    - No live game launch was run by the worker.

155. Runtime-patch worker changes were reviewed and verified.
    - Reviewed diff for `RE/tools/logh7_ui_explorer.py` and `RE/tools/tests/test_logh7_ui_explorer.py`.
    - Verification: `python -m py_compile RE\tools\logh7_ui_explorer.py RE\tools\tests\test_logh7_ui_explorer.py` PASS.
    - Verification: `cd RE; python -m unittest tools.tests.test_logh7_ui_explorer` = 21/21 PASS.
    - Final process/port check showed no `G7MTClient`, no `47900`, and no `47901` listener.

156. Loop state was updated again.
    - Added journal #40 to `docs/logh7-loop-state.md`.
    - The next font live A/B, when allowed, is canonical 98ca plus `--runtime-patch font-atlas-antialias`, not a direct new EXE launch.

157. User explicitly deferred live verification to the end.
    - No live game client was launched in this follow-up.
    - Work was limited to background-safe static inspection, redex queries, code guard changes, tests, and docs.

158. Runtime-patch implementation was reviewed for pre-resume safety.
    - Re-read `RE/tools/logh7_ui_explorer.py` runtime-patch helpers and launch branch.
    - Confirmed runtime mode keeps on-disk `G7MTClient.exe` canonical, rejects `--patched-exe` and `--lobby-unblock-patch`, imports Frida before server/client launch, and kills only the spawned client/server PIDs on pre-resume failure.

159. Frida local API compatibility was checked without launching the game.
    - Command: `python -c "import frida, inspect; ... inspect.signature(frida.core.Device.spawn)"`.
    - Result: Frida `17.15.3`; `Device.spawn(program, ..., cwd=...)` supports the `cwd` parameter used by `ui_explorer`.

160. Runtime patch byte guard was hardened.
    - File changed: `RE/tools/logh7_runtime_patch_apply.py`.
    - `_load_patch()` now preserves descriptor `originalHex` and lowercases both `originalHex` and `patchedHex`.
    - Generated Frida JS now reads process bytes before writing, emits `original`, `before`, `beforeOk`, and `wrote`, skips the write on mismatch, and marks the patch event `ok=false`.

161. Runtime-patch unit coverage was expanded.
    - File changed: `RE/tools/tests/test_logh7_ui_explorer.py`.
    - Added checks that incomplete receipts fail, the descriptor loader preserves the `originalHex` guard, and a guard failure kills the suspended fake Frida process without calling `resume()`.

162. Non-live verification passed.
    - `python -m py_compile RE\tools\logh7_runtime_patch_apply.py RE\tools\logh7_ui_explorer.py RE\tools\tests\test_logh7_ui_explorer.py` PASS.
    - `cd RE; python -m unittest tools.tests.test_logh7_ui_explorer` PASS, 23/23.

163. C002 SelectGrid path was rechecked through redex.
    - `FUN_00581c80` builds the SelectGrid object tree and installs `SendWarpCommand` plus `ReceiveResult` with request/response `0x0b01/0x0b07`.
    - `FUN_005737d0` remains the send node that calls `FUN_004b48d0`.
    - `FUN_004b78a0` case `0x3a` still maps to request `0x0b01`, response `0x0b07`.

164. Event22 was reclassified again as non-movement.
    - Redex re-read `FUN_00517cd0`: it builds a local `0x34`-byte payload and calls `FUN_00501e30(0x16, FUN_00502780(0,0), local_34)`.
    - Direct callers include `FUN_004c2620 -> 0x0f08`, `FUN_004c2660 -> 0x0f09`, and `FUN_004bee20 -> 0x0b07`.
    - Therefore the observed event22 path is a domain/status wrapper, not the user-originated SelectGrid sender. The existing `logh7_hud_hit_test_gate_watch.py` already dumps `payloadBytes34` for the final live check.

165. Loop state was updated again.
    - Added journal #41 to `docs/logh7-loop-state.md`.
    - The next allowed live pass should avoid generic map/system click repetition and either capture `payloadBytes34` with the existing watcher or resume the command-row positive-control path to `FUN_00581c80 -> FUN_005737d0`.

166. Two read-only subagents audited the current non-live state.
    - Runtime patch audit: no game launch, no `ui_explorer`, no edits, no process actions. It confirmed the suspended runtime-patch path is basically correct, but flagged missing-`originalHex` descriptors and partial-write risk in the standalone attach helper.
    - C002 audit: no game launch, no `ui_explorer`, no edits, no process actions. It concluded the next live target should be the command-row positive-control/SelectGrid path, not another event22 payload run.

167. Runtime patch preflight was made fail-closed.
    - File changed: `RE/tools/logh7_runtime_patch_apply.py`.
    - `_load_patch()` now requires `originalHex`, checks equal even byte lengths, and lowercases hex.
    - The Frida JS now preflights all patch sites first. If any `before` bytes do not match `originalHex`, no site is written; events include `preflightOk`.

168. Runtime patch tests were updated again.
    - File changed: `RE/tools/tests/test_logh7_ui_explorer.py`.
    - Added coverage for missing `originalHex` descriptors and all-before-write JS markers (`allBeforeOk`, `preflightOk`).
    - Verification: `python -m py_compile RE\tools\logh7_runtime_patch_apply.py RE\tools\tests\test_logh7_ui_explorer.py` PASS.
    - Verification: `cd RE; python -m unittest tools.tests.test_logh7_ui_explorer` PASS, 24/24.

169. C002 DAT state boundary was rechecked statically.
    - Redex `grep DAT_009d2a3c` and `grep DAT_009d2a40` still find only `FUN_00570a10`.
    - `FUN_00570a10` consumes `DAT_009d2a3c`; when it is `2`, it copies `DAT_009d2a40` into `widget+0x34`, calls `FUN_00517db0()`, and returns `3`.
    - This matches `docs/logh7-movemode-re.md`: the direct client writer is absent. The next non-live target is the server-response decoder or memcpy source that fills the `0x009d2a30` state block (`state+0x0c`/`state+0x10`).

170. Docs were updated for the audit results.
    - Added journal #42 to `docs/logh7-loop-state.md`.
    - Updated `docs/logh7-c002-admission-discriminator-2026-06-28.md` with the positive-control priority and `DAT_009d2a3c/40` boundary.
    - Updated `docs/logh7-font-remaster.md` with the stricter runtime preflight behavior and 24/24 test result.

171. Final non-live cleanliness checks passed.
    - Re-ran `python -m py_compile RE\tools\logh7_runtime_patch_apply.py RE\tools\logh7_ui_explorer.py RE\tools\tests\test_logh7_ui_explorer.py` PASS.
    - Re-ran `cd RE; python -m unittest tools.tests.test_logh7_ui_explorer` PASS, 24/24.
    - `_load_patch("font-atlas-antialias")` reports `originalHex=6a05`, `patchedHex=6a04`; generated JS contains `allBeforeOk` and `preflightOk`, and no longer contains the loose `original === '' ||` guard.
    - `Get-Process G7MTClient,G7Start,Gin7UpdateClient` returned no process.
    - `Get-NetTCPConnection -LocalPort 47900,47901` returned no listener.

172. Live was resumed for the font/display check after user approval.
    - First run used session `.omo/ui-explorer/font-atlas-antialias-runtime-98ca-20260628`, canonical installed EXE SHA `98ca4acd...`, runtime patch `font-atlas-antialias`, but server port `47902`.
    - Runtime patch receipt was good (`0x004b0b91: 6a05 -> 6a04`, `preflightOk:true`), but login showed `NO DATA` because the client still looked at fixed `47900`.
    - This proved `ui_explorer` and the real EXE are equivalent only when the fixed port/CWD/sidecar environment also matches, not merely when SHA matches.
    - The wrong-port session was stopped; `shaVerified:true`.

173. Correct-port live was rerun.
    - Session: `.omo/ui-explorer/font-atlas-antialias-runtime-98ca-47900-20260628`.
    - Command used `--port 47900`, installed canonical playable EXE, runtime patch `font-atlas-antialias`, and no preseed.
    - Trace reached `0x7000`, redirect to `127.0.0.1:47900`, lobby `0x0020/0x2000 -> 0x2001`, character list `0x2003 -> 0x2004`, session list `0x2005 -> 0x2006`.
    - Screenshot `shots/002-lobby-after-settle.png` showed the lobby without `NO DATA`.
    - Stop result restored and verified the session-start canonical SHA.

174. Font/display decisions were implemented.
    - `RE/tools/client_patches/font-atlas-antialias.json` was promoted from candidate to default-stack patch after live runtime verification.
    - `RE/tools/client_patches/font-readable-size.json` was changed from 14px-ish bytes to 16px-ish bytes: primary `6a0c -> 6a10`, atlas `25feff0000 -> 83c0039090`.
    - `RE/tools/logh7_build_playable_client.py` DEFAULT_STACK now includes `font-atlas-antialias` after `font-cleartype`.
    - `RE/tools/logh7_installed_tree.py` and relevant tests were updated to include that patch in the required playable stack.

175. Login window and cursor behavior were fixed.
    - `RE/tools/logh7_ui_explorer.py` now defaults `start --display-mode` to `windowed`.
    - `display --mode borderless` remains available for the larger play surface after login.
    - Added cursor clip policy `auto|on|off`; default `auto` clips in borderless/fullscreen and releases in windowed/stop.
    - `ui_explorer --runtime-patch` now rejects non-`47900` ports before launch.
    - `RE/tools/launcher/LOGH7Launcher.cs` now uses `DefaultDisplayMode = "windowed"`, `DefaultCursorClip = "auto"`, supports `--cursor-clip`, and releases `ClipCursor` on exit.

176. Canonical playable was rebuilt and deployed.
    - Command: `cd RE; python -m tools.logh7_build_playable_client --deploy`.
    - New SHA: `5aa1e00a35bd62c065bab3d3144496747d907b10a05ea80a54b82a1bb03bd443`.
    - Overlay playable, installed `G7MTClient.exe`, and `.uiexplorer` backup all match the new SHA.
    - `RE/tools/logh7_client_exe.py` and `RE/tools/tests/test_logh7_client_exe.py` were updated to the new canonical SHA.

177. Verification was run.
    - `cd RE; python -m py_compile tools/logh7_ui_explorer.py tools/logh7_build_playable_client.py tools/logh7_client_exe.py tools/logh7_installed_tree.py` PASS.
    - `cd RE; python -m unittest tools.tests.test_logh7_ui_explorer tools.tests.test_logh7_client_exe` PASS, 33/33.
    - Byte check on installed EXE: atlas quality `0x000b0b91=6a04`, primary size `0x000ea1c6=6a10`, atlas size `0x000b0869=83c0039090`.
    - Broader install/package test run remains blocked by missing `RE/content/logh7-content.db` and absent root `client/` package in this checkout.

178. Current-authority docs/prompts were updated.
    - `AGENTS.md`, `.codex/skills/logh7-live/SKILL.md`, `.claude/skills/logh7-live/SKILL.md`, `docs/logh7-live-test-standard.md`, `docs/logh7-live-flow-plan-2026-06-26.md`, `docs/logh7-master-roadmap-2026-06-26.md`, and `docs/logh7-mp-roadmap-2026-06-23.md` now point to canonical SHA `79142d12...` and the windowed-login/borderless-display/cursor-clip policy.
    - `docs/logh7-loop-state.md` journal #43 records the live parity finding and canonical rebuild.

## ?꾩옱 ?먯젙

- C002 理쒖떊: `LOGH_POSTLOAD_ACTION_LIST_SEATS=1`??耳?canonical no-preseed live?먯꽌 `PLAYER_INFO+0x270=1`, `selection.listCount188=1`, one primary/secondary row源뚯? ?댁븘?щ떎. 理쒖떊 early-root live??selection root媛 ?ㅼ젣濡?`FUN_00506280`?먯꽌 `+4/+5=1/1`濡??대━吏留? 怨㏓컮濡?`FUN_004f6680(1)`??invalid tab1 ?뺤쓽(`DAT_0066f130 + 1*0x208` 泥?dword `-1`) ?뚮Ц??root瑜?`0/0`?쇰줈 ?ル뒗?ㅺ퀬 醫곹삍?? ?뺤쟻 RE??valid tab `2/3`? `FUN_004fd7a0`??mode2 branch?먯꽌留??대┛?? ?곕씪???⑥? 釉붾줈而ㅻ뒗 `HUD+0x14`/`HUD+0x28` mode2 target??event/latch producer媛 ???먯뿰 `FUN_004fd7a0(2,1)`??留뚮뱾吏 紐삵븯?붿???
- C002: `LOGH_POSTLOAD_RICH_CHARACTER=1`怨?`LOGH_POSTLOAD_ACTION_LIST_SEATS=1` 議고빀??`0x0356`, `0x67` widget/list, `PLAYER_INFO+0x270=1`, primary/secondary selection row, `command.rowCountD4=24`源뚯? 梨꾩슦??寃껋? live濡??뺤씤?먮떎. ?⑥? 釉붾줈而ㅻ뒗 payload 遺?ш? ?꾨땲??row/controller admission怨?command-root/SelectGrid ?꾩씠(`FUN_00581c80` -> `FUN_005737d0` -> `0x0b01`)??
- MP: ?쒕쾭??relay/authoritative/visibility 寃쎈줈???뚯뒪?몃줈 ?듦낵?덈떎. ?뺤떇 EXE 湲곕컲 硫?고겢???ㅼ쬆? ?ㅼ쓬 ?④퀎??
- ?고듃: primary UI face? atlas face 紐⑤몢 `Pretendard`濡?live GDI 寃利앸릱?? "?섎꽕?ㅻ룄 Pretendard媛 ?꾨땲?? 臾몄젣??atlas face ?붿〈 `援대┝`???먯씤?댁뿀怨? ?꾩옱 canonical playable?먯꽌???닿껐?먮떎.
- ?고듃 ?먮┝/?ш린: borderless stretch/filter/AA ?먮┝怨?dgVoodoo 濡쒓퀬??98ca live?먯꽌 媛쒖꽑/?쒓굅 ?뺤씤. ?꾩옱 launchable? 14px-ish媛 ?곸슜?섏?留??ъ슜??湲곗??쇰줈 ?덈Т ?묐떎. 16px-ish ?꾨낫??Smart App Control??unsigned EXE ?ㅽ뻾??留됱븘 live 誘멸?利앹씠誘濡? ?ㅼ쓬 ?고듃 ?묒뾽? launchable/canonical 鍮뚮뱶 寃쎈줈?먯꽌 ?쒕챸/?ㅽ뻾 李⑤떒 臾몄젣瑜?癒쇱? ?닿껐?댁빞 ?쒕떎.
- UI ?대?吏: harness??installed tree cwd? sidecar 由ъ냼?ㅻ? 媛뽰텣?? overlay playable EXE瑜?吏곸젒 ?ㅽ뻾?섎㈃ 由ъ냼?ㅺ? 鍮좎졇 源⑥쭏 ???덈떎. `window_parts.tga` 32bpp upscale breakage???먮낯 蹂듦뎄 ?곹깭??
- ?낅젰: ?쒓? ?낅젰/異쒕젰/吏꾪뻾? ?고듃? 蹂꾧컻?? live `movsx->movzx` 吏꾨떒??standalone fix媛 ?꾨땲?덈떎. `WM_CHAR` ?먮룞?낅젰, `WM_IME_CHAR`/composition result, ?몄썡??polling, 梨꾪똿 CP932 ?≪떊, 罹먮┃???깅줉 ?뺤씤 ?ㅼ씠?쇰줈洹?寃쎈줈瑜??섎닠 RE?쒕떎.
- ?먯튃: ?댄썑 live/client 吏꾨떒? `G7MTClient.playable.exe` / ?ㅼ튂 ?몃━ `G7MTClient.exe` SHA `79142d12...`留??ъ슜?쒕떎.

## ?ㅼ쓬 ?묒뾽

1. ?뺤떇 EXE ?⑥씪 湲곗??쇰줈 live C002瑜??ㅼ떆 ?ㅽ뻾?쒕떎.
   - 理쒖떊 湲곗? env?먮뒗 `LOGH_POSTLOAD_ACTION_LIST_SEATS=1`???ы븿?쒕떎.
   - ?ㅼ쓬 紐⑺몴???⑥닚 `0x67`/`+0x270` ?뺤씤?대굹 selection-row ?대┃ 諛섎났???꾨땲??`HUD+0x14`/`HUD+0x28` mode2 target????`FUN_004fd7a0(2,1)`??留뚮뱾吏 紐삵븯?붿? ?뺤씤?섎뒗 寃껋씠??
   - watcher??mode target蹂?`valid08`, controller `+5`, target `+0x15`, event queue keys, `+0xb00`, `FUN_00501e30`, `FUN_005024b0`, `FUN_005024e0`, `FUN_00507f20`, `FUN_004fd100`, `FUN_004fd7a0`, `FUN_004f6680`???④퍡 ?〓뒗??
   - 紐⑺몴: natural `FUN_004fd7a0(2,1)` ??`FUN_004f6680(2/3)` ??selection root `+4/+5` ?좎? ??`listSelected189 -> command.activeGate04 -> SelectGrid` ?꾩씠 以??대뒓 ?④퀎媛 ?딄린?붿? ?뺤젙?쒕떎.

2. ?뺤떇 EXE 2?대씪 MP smoke瑜??ㅽ뻾?쒕떎.
   - ?쒕쾭 env: `LOGH_AUTHORITATIVE=1`, `LOGH_RELAY=1`, `LOGH_MP_VISIBILITY=1`
   - 紐⑺몴: ??client媛 world-entry???꾨떖?섍퀬 peer fleet visibility trace媛 `0x0325/0x0426` ?먮뒗 relay-deliver濡?蹂댁씠?붿? ?뺤씤.
   - ?? client clone??canonical playable SHA?먯꽌 留뚮뱾?댁빞 ?쒕떎.

3. ?쒓? ?낅젰/異쒕젰/吏꾪뻾 RE瑜??댁뼱媛꾨떎.
   - `FUN_004e7200`, `FUN_004fff60`, `FUN_004ffdc0`, `FUN_00516bf0`, create finish/confirm ?쇱슦?곕? raw byte + decompile濡??ы솗?명븳??
   - 濡쒓렇??罹먮┃ ?앹꽦 ?띿뒪?? ?몄썡??梨꾪똿, 罹먮┃ ?앹꽦 ???뺤씤 ?ㅼ씠?쇰줈洹몃? 媛곴컖 蹂꾨룄 臾몄젣濡?利앷굅?뷀븳??

4. ?고듃 16px-ish ?꾨낫瑜??ㅼ떆 蹂대젮硫?癒쇱? Smart App Control/?쒕챸 ?뺤콉???닿껐?쒕떎.
   - e497 ?꾨낫??諛붿씠??鍮뚮뱶 媛?ν븯??WinError 4551濡?live blocked.
   - ?닿껐 ?꾩뿉??98ca launchable canonical??湲곗??쇰줈 C002/MP 濡쒕뱶留듭쓣 ?댁뼱媛꾨떎.

