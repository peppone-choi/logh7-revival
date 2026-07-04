# LOGH VII Display Function Audit (2026-06-30)

Scope: every Ghidra-exported function that references at least one known text/display marker.

Markers:
- `FUN_00503560`
- `FUN_00503610`
- `FUN_004eac60`
- `FUN_00522010`
- `FUN_00503a10`
- `FUN_00502780`

Summary:
- functions: 203
- withConstMsg: 108
- withSetText: 57
- withAssetRefs: 46
- withPatches: 28
- constmsgNoDataStatic: 5
- constmsgNoTableStatic: 0

Core Pipeline:
- `0x004eac60`: ansi_to_wide_text
- `0x004ea8b0`: wide_text_buffer_copy
- `0x004eaaf0`: wide_text_buffer_assign
- `0x00503560`: ui_control_set_text
- `0x00503610`: ui_control_append_or_alt_text
- `0x00522010`: constmsg_lookup

## All Candidate Functions

| # | VA | Function | Screen/role guess | Text setters | ConstMsg calls | Assets/strings | Existing patches | Risk flags |
|---:|---|---|---|---:|---|---|---|---|
| 1 | `0x004010a0` | `FUN_004010a0` | shared/ui helper | 0 |  | MICROVISION |  |  |
| 2 | `0x004b01d0` | `FUN_004b01d0` | network/session data formatting | 0 |  |  |  |  |
| 3 | `0x004ba2b0` | `FUN_004ba2b0` | network/session data formatting | 0 |  | LGLoginNG OK<br>LGLoginOK OK<br>LobbySessionLoginNG OK<br>LobbySessionLoginOK OK<br>+12 | earlygrid-ringclear.json@0x004bae19<br>strat-source-mode.json@0x004bb173 | already-patched |
| 4 | `0x004beba0` | `FUN_004beba0` | network/session data formatting | 0 | g0x76:dynamic<br>g0x76/s0x4:ok | %s%s%s |  | lookup-wrapper-or-formatter |
| 5 | `0x004bece0` | `FUN_004bece0` | network/session data formatting | 0 | g0x76:dynamic |  |  | lookup-wrapper-or-formatter |
| 6 | `0x004c0670` | `FUN_004c0670` | network/session data formatting | 0 | g0x76:dynamic<br>g0x76:dynamic |  |  | lookup-wrapper-or-formatter |
| 7 | `0x004c13a0` | `FUN_004c13a0` | network/session data formatting | 0 | g0x76:dynamic |  |  | lookup-wrapper-or-formatter |
| 8 | `0x004c14a0` | `FUN_004c14a0` | network/session data formatting | 0 | g0x76:dynamic |  |  | lookup-wrapper-or-formatter |
| 9 | `0x004c15a0` | `FUN_004c15a0` | network/session data formatting | 0 | g0x76:dynamic |  |  | lookup-wrapper-or-formatter |
| 10 | `0x004c1680` | `FUN_004c1680` | network/session data formatting | 0 | g0x76:dynamic |  |  | lookup-wrapper-or-formatter |
| 11 | `0x004c1700` | `FUN_004c1700` | network/session data formatting | 0 |  |  |  |  |
| 12 | `0x004c1990` | `FUN_004c1990` | network/session data formatting | 0 | g0x76:dynamic |  |  | lookup-wrapper-or-formatter |
| 13 | `0x004c1b20` | `FUN_004c1b20` | network/session data formatting | 0 | g0x76:dynamic<br>g0x76:dynamic |  |  | lookup-wrapper-or-formatter |
| 14 | `0x004c2a80` | `FUN_004c2a80` | network/session data formatting | 0 | g0x76:dynamic |  |  | lookup-wrapper-or-formatter |
| 15 | `0x004c8c90` | `FUN_004c8c90` | network/session data formatting | 0 | g0x18:dynamic |  |  | lookup-wrapper-or-formatter |
| 16 | `0x004c8cb0` | `FUN_004c8cb0` | network/session data formatting | 0 | g0x3:dynamic |  |  | lookup-wrapper-or-formatter |
| 17 | `0x004c8cd0` | `FUN_004c8cd0` | network/session data formatting | 0 | g0x6:dynamic |  |  | lookup-wrapper-or-formatter |
| 18 | `0x004c8cf0` | `FUN_004c8cf0` | network/session data formatting | 0 | g0x4a:dynamic |  |  | lookup-wrapper-or-formatter |
| 19 | `0x004c8d10` | `FUN_004c8d10` | network/session data formatting | 0 | g0x49:dynamic |  |  | lookup-wrapper-or-formatter |
| 20 | `0x004c8d30` | `FUN_004c8d30` | network/session data formatting | 0 | g0x12:dynamic |  |  | lookup-wrapper-or-formatter |
| 21 | `0x004c8d50` | `FUN_004c8d50` | network/session data formatting | 0 | g0x4:dynamic |  |  | lookup-wrapper-or-formatter |
| 22 | `0x004c8d70` | `FUN_004c8d70` | network/session data formatting | 0 | g0x5:dynamic |  |  | lookup-wrapper-or-formatter |
| 23 | `0x004c8da0` | `FUN_004c8da0` | network/session data formatting | 0 | g0x53:dynamic |  |  | lookup-wrapper-or-formatter |
| 24 | `0x004c8dc0` | `FUN_004c8dc0` | network/session data formatting | 0 | g0x55:dynamic |  |  | lookup-wrapper-or-formatter |
| 25 | `0x004c8ed0` | `FUN_004c8ed0` | network/session data formatting | 0 | g0x56:dynamic |  |  | lookup-wrapper-or-formatter |
| 26 | `0x004c9100` | `FUN_004c9100` | network/session data formatting | 0 | g0x15:dynamic |  |  | lookup-wrapper-or-formatter |
| 27 | `0x004ce350` | `FUN_004ce350` | network/session data formatting | 0 |  |  |  |  |
| 28 | `0x004eaaf0` | `FUN_004eaaf0` | shared/ui helper | 2 |  |  |  | record-or-hardcoded-text |
| 29 | `0x004eac60` | `FUN_004eac60` | shared/ui helper | 0 |  | Japanese |  |  |
| 30 | `0x004f4a80` | `FUN_004f4a80` | shared/ui helper | 0 | g0x65/s0x6:ok<br>g0x63/s0x3:ok<br>g0x67/s0x8:ok<br>g0x65/s0x4:ok<br>g0x65/s0x5:ok<br>g0x65/s0x7:ok | /../data/image/shokumu_card/shokumu_meirei_te...<br>/../data/image/shokumu_card/shokumu_meirei_do...<br>/../data/image/shokumu_card/shokumu_shokumu_t...<br>/../data/image/shokumu_card/shokumu_shokumu_d...<br>+1 |  | lookup-wrapper-or-formatter, screen-resource |
| 31 | `0x004f5cb0` | `FUN_004f5cb0` | shared/ui helper | 0 | g0x65:dynamic<br>g0x63/s0x4:ok<br>g0x63:dynamic | [%s] %s<br>%s : %s |  | lookup-wrapper-or-formatter |
| 32 | `0x004f6040` | `FUN_004f6040` | shared/ui helper | 0 | g0x63/s0x3:ok | /../data/image/shokumu_card/shokumu_shokumu_t...<br>/../data/image/shokumu_card/shokumu_shokumu_d... |  | lookup-wrapper-or-formatter, screen-resource |
| 33 | `0x004f6f60` | `FUN_004f6f60` | shared/ui helper | 0 |  | T-Pos = (%.1f, %.1f, %.1f)<br>R-Rot = (%.1f, %.1f, %.1f)<br>R-Pos = (%.1f, %.1f, %.1f)<br>          or SHIFT + Mouse Right-Click |  |  |
| 34 | `0x004fc4e0` | `FUN_004fc4e0` | shared/ui helper | 0 | g0x65/s0x0:ok<br>g0x65/s0x1:ok<br>g0x65/s0x2:ok<br>g0x65/s0x3:ok | /../data/image/shokumu_card/shokumu_parts_1.tga<br>/../data/image/shokumu_card/shokumu_parts_2.tga |  | lookup-wrapper-or-formatter, screen-resource |
| 35 | `0x004fd100` | `FUN_004fd100` | shared/ui helper | 0 |  |  |  |  |
| 36 | `0x004fe930` | `FUN_004fe930` | shared/ui helper | 0 |  |  |  |  |
| 37 | `0x004fef90` | `FUN_004fef90` | shared/ui helper | 1 |  | GetID[%d]=%d<br>NotifyInformationCharacter Receive / g_Strate...<br>NortifySearch Receive / g_StrategyClient.Upda...<br>StrategySequence Init/Update\n<br>+3 |  | record-or-hardcoded-text |
| 38 | `0x004ff3c0` | `FUN_004ff3c0` | shared/ui helper | 0 |  |  |  |  |
| 39 | `0x00501b10` | `FUN_00501b10` | shared/ui helper | 0 |  |  |  |  |
| 40 | `0x00501c80` | `FUN_00501c80` | shared/ui helper | 0 |  |  |  |  |
| 41 | `0x00501d60` | `FUN_00501d60` | shared/ui helper | 0 |  |  |  |  |
| 42 | `0x00502220` | `FUN_00502220` | shared/ui helper | 0 | g0x0:dynamic |  |  |  |
| 43 | `0x00502510` | `FUN_00502510` | shared/ui helper | 0 |  |  |  |  |
| 44 | `0x00502780` | `FUN_00502780` | shared/ui helper | 0 |  |  |  |  |
| 45 | `0x00503560` | `FUN_00503560` | shared/ui helper | 2 |  |  |  | record-or-hardcoded-text |
| 46 | `0x00503610` | `FUN_00503610` | shared/ui helper | 1 |  |  |  | record-or-hardcoded-text |
| 47 | `0x00503a10` | `FUN_00503a10` | shared/ui helper | 0 |  |  |  |  |
| 48 | `0x00505ae0` | `FUN_00505ae0` | shared/ui helper | 0 |  |  |  |  |
| 49 | `0x00506610` | `FUN_00506610` | shared/ui helper | 0 |  |  |  |  |
| 50 | `0x00507b10` | `FUN_00507b10` | shared/ui helper | 0 |  |  |  |  |
| 51 | `0x00507f20` | `FUN_00507f20` | shared/ui helper | 0 |  |  |  |  |
| 52 | `0x00508840` | `FUN_00508840` | shared/ui helper | 0 |  |  |  |  |
| 53 | `0x00508890` | `FUN_00508890` | shared/ui helper | 0 |  |  |  |  |
| 54 | `0x005088e0` | `FUN_005088e0` | shared/ui helper | 0 |  |  |  |  |
| 55 | `0x00508930` | `FUN_00508930` | shared/ui helper | 0 |  |  |  |  |
| 56 | `0x00508f60` | `FUN_00508f60` | shared/ui helper | 0 |  |  |  |  |
| 57 | `0x0050c180` | `FUN_0050c180` | shared/ui helper | 0 |  |  |  |  |
| 58 | `0x0050c880` | `FUN_0050c880` | shared/ui helper | 0 | g0x0:dynamic |  |  |  |
| 59 | `0x0050d230` | `FUN_0050d230` | shared/ui helper | 0 | g0x76:dynamic<br>g0x76:dynamic<br>g0x76:dynamic<br>g0x76:dynamic<br>g0x76:dynamic<br>g0x76:dynamic<br>g0x76:dynamic<br>g0x76:dynamic<br>+38 | %s\n%s |  |  |
| 60 | `0x005123b0` | `FUN_005123b0` | common window/dialog | 6 | <br><br>g0x78:dynamic<br>g0x78:dynamic<br>g0x78:dynamic<br>g0x78:dynamic<br><br><br>+2 | /../data/image/soukan/soukan_parts.tga<br>/../data/image/window/window_parts.tga<br>/../data/image/trush/status_window.tga<br>/../data/image/Face/OFM0003A.tga<br>+3 | soukan-hud-native-layout.json@0x00512571<br>soukan-hud-native-layout.json@0x00512579<br>soukan-hud-native-layout.json@0x005126d1<br>soukan-hud-native-layout.json@0x005126d9<br>+4 | screen-resource, already-patched |
| 61 | `0x005148b0` | `FUN_005148b0` | common window/dialog | 3 |  | /../data/image/window/window_parts.tga<br>/../data/image/window/resize_window_parts.tga<br>/../data/image/chat/chat_parts.tga<br>/../data/image/window/beta_window.tga |  | record-or-hardcoded-text, screen-resource |
| 62 | `0x00515950` | `FUN_00515950` | shared/ui helper | 0 |  |  |  |  |
| 63 | `0x005159e0` | `FUN_005159e0` | shared/ui helper | 4 |  | /../data/image/chat/chat_parts.tga | chat-target-labels-ko.json@0x00516038 | record-or-hardcoded-text, screen-resource, already-patched |
| 64 | `0x00516830` | `FUN_00516830` | shared/ui helper | 0 |  | /../data/image/chat/chat_parts.tga |  | screen-resource |
| 65 | `0x00516bf0` | `FUN_00516bf0` | shared/ui helper | 12 |  | Japanese<br>CHAT_TEXTBUF_MAXSIZE over!!! |  | record-or-hardcoded-text |
| 66 | `0x005171d0` | `FUN_005171d0` | shared/ui helper | 1 |  |  |  | record-or-hardcoded-text |
| 67 | `0x00517310` | `FUN_00517310` | common window/dialog | 0 |  | /../data/image/window/window_parts.tga |  | screen-resource |
| 68 | `0x00517af0` | `FUN_00517af0` | shared/ui helper | 0 | g0x76/s0x0:ok |  |  | lookup-wrapper-or-formatter |
| 69 | `0x00517b60` | `FUN_00517b60` | shared/ui helper | 0 |  |  |  |  |
| 70 | `0x00517bf0` | `FUN_00517bf0` | shared/ui helper | 1 |  |  |  | record-or-hardcoded-text |
| 71 | `0x00517cd0` | `FUN_00517cd0` | shared/ui helper | 0 |  |  |  |  |
| 72 | `0x00517db0` | `FUN_00517db0` | shared/ui helper | 1 |  |  |  | record-or-hardcoded-text |
| 73 | `0x00517f30` | `FUN_00517f30` | shared/ui helper | 0 |  |  |  |  |
| 74 | `0x00518060` | `FUN_00518060` | shared/ui helper | 0 |  | /../data/image/chat/chat_parts.tga<br>/../data/image/window/menu_parts.tga |  | screen-resource |
| 75 | `0x005183c0` | `FUN_005183c0` | common window/dialog | 0 |  | /../data/image/window/window_parts.tga |  | screen-resource |
| 76 | `0x005187b0` | `FUN_005187b0` | common window/dialog | 1 |  | /../data/image/window/window_parts.tga<br>/../data/image/soukan/soukan_bar.tga<br>/../data/image/window/resize_window_parts.tga |  | record-or-hardcoded-text, screen-resource |
| 77 | `0x00519330` | `FUN_00519330` | common window/dialog | 0 |  | /../data/image/window/window_parts.tga |  | screen-resource |
| 78 | `0x00519ac0` | `FUN_00519ac0` | shared/ui helper | 0 |  |  |  |  |
| 79 | `0x00519c50` | `FUN_00519c50` | shared/ui helper | 0 |  |  |  |  |
| 80 | `0x0051a020` | `FUN_0051a020` | common window/dialog | 0 |  | /../data/image/window/window_parts.tga |  | screen-resource |
| 81 | `0x0051a370` | `FUN_0051a370` | shared/ui helper | 2 |  | InputFromCommandLine<br>CHANGESERVER__SS2LG<br>CERTIFICATION SS ERROR<br>CERTIFICATION SS OK<br>+12 | lobby-fullscreen-display.json@0x0051a750<br>lobby-fullscreen-display.json@0x0051a755<br>lobby-fullscreen-display.json@0x0051a8ff<br>lobby-fullscreen-display.json@0x0051a904<br>+18 | record-or-hardcoded-text, already-patched |
| 82 | `0x0051bc20` | `FUN_0051bc20` | shared/ui helper | 0 |  |  |  |  |
| 83 | `0x0051c930` | `FUN_0051c930` | lobby/session/character menu | 0 | g0x6c:dynamic |  |  | lookup-wrapper-or-formatter |
| 84 | `0x0051ca30` | `FUN_0051ca30` | lobby/session/character menu | 0 |  |  |  |  |
| 85 | `0x0051cda0` | `FUN_0051cda0` | common window/dialog | 6 | g0x4d/s0x0:ok<br>g0x4d/s0x1:ok<br>g0x4d/s0x2:ok<br>g0x4d/s0x3:ok<br>g0x4d/s0x4:ok<br>g0x4d/s0x5:ok | /../data/image/window/window_parts.tga | login-native-layout.json@0x0051cf92<br>login-native-layout.json@0x0051cf9a<br>login-native-layout.json@0x0051cff1<br>login-native-layout.json@0x0051cff9<br>+27 | screen-resource, already-patched |
| 86 | `0x0051d580` | `FUN_0051d580` | lobby/game menu | 8 | g0x4e/s0x0:ok<br>g0x4e/s0x1:ok<br>g0x4e/s0x2:ok<br>g0x4e/s0x3:ok<br>g0x4e/s0x4:ok<br>g0x4e/s0x5:ok<br>g0x4e/s0x6:ok<br>g0x4e/s0x7:ok | /../data/image/gamemenu/menu_parts.tga | brightbtn.json@0x0051d653<br>brightbtn.json@0x0051d66c<br>brightbtn.json@0x0051d685 | screen-resource, already-patched |
| 87 | `0x0051dc00` | `FUN_0051dc00` | lobby/game menu | 0 |  | /../data/image/gamemenu/menu_parts.tga | charsel-recenter.json@0x0051dcb4<br>charsel-recenter.json@0x0051dcbc<br>gamemenu-right-native-layout.json@0x0051dc08<br>gamemenu-right-native-layout.json@0x0051dc0f<br>+1 | screen-resource, already-patched |
| 88 | `0x0051dd80` | `FUN_0051dd80` | lobby/game menu | 1 | g0x4e/s0x8:ok | /../data/image/gamemenu/menu_parts.tga | charsel-recenter.json@0x0051e131<br>charsel-recenter.json@0x0051e139<br>gamemenu-right-native-layout.json@0x0051dd8a<br>gamemenu-right-native-layout.json@0x0051dd8f<br>+2 | screen-resource, already-patched |
| 89 | `0x0051e580` | `FUN_0051e580` | lobby/game menu | 7 | g0x4e/s0x9:ok<br>g0x4e/s0xc:ok<br>g0x4e/s0xe:ok | /../data/image/gamemenu/menu_parts.tga<br>/../data/image/face/unknownface.tga | charsel-native-layout.json@0x0051e589<br>charsel-native-layout.json@0x0051e594<br>charsel-native-layout.json@0x0051e599<br>charsel-native-layout.json@0x0051e59f<br>+3 | screen-resource, already-patched |
| 90 | `0x0051f1c0` | `FUN_0051f1c0` | lobby/session/character menu | 0 |  |  |  |  |
| 91 | `0x0051f310` | `FUN_0051f310` | lobby/session/character menu | 20 | g0x4e/s0xf:ok<br>g0x4e/s0x10:ok<br>g0x4e/s0x11:ok<br>g0x4e/s0x12:ok<br>g0x4e/s0x13:ok<br>g0x4e/s0x14:ok<br>g0x4e/s0x15:ok<br>g0x4e/s0x16:ok<br>+2 |  |  |  |
| 92 | `0x0051f8b0` | `FUN_0051f8b0` | lobby/game menu | 13 | g0x4e/s0x19:ok<br>g0x4e/s0x1a:ok<br>g0x4e/s0x1b:ok<br>g0x4e/s0x1d:ok<br>g0x4e/s0x1e:ok<br>g0x4e/s0x1f:ok<br>g0x4e/s0x1c:ok<br>g0x4e/s0x1d:ok<br>+5 | /../data/image/window/window_parts.tga<br>/../data/image/gamemenu/menu_parts.tga | charsel-content-inset.json@0x0051fcc7<br>charsel-content-inset.json@0x00520cf0<br>charsel-content-inset.json@0x00520a92<br>charsel-recenter.json@0x0051fcc7<br>+12 | screen-resource, already-patched |
| 93 | `0x00520e60` | `FUN_00520e60` | lobby/session/character menu | 0 |  |  |  |  |
| 94 | `0x00521170` | `FUN_00521170` | lobby/session/character menu | 0 |  |  |  |  |
| 95 | `0x00521220` | `FUN_00521220` | lobby/session/character menu | 0 |  |  |  |  |
| 96 | `0x00521710` | `FUN_00521710` | lobby/session/character menu | 0 | g0x5:dynamic |  |  | lookup-wrapper-or-formatter |
| 97 | `0x00522010` | `FUN_00522010` | shared/ui helper | 0 | int param_1,uint param_2,uint param_3 |  |  | lookup-wrapper-or-formatter |
| 98 | `0x00529110` | `FUN_00529110` | common window/dialog | 0 | <br><br><br><br><br><br> | /../data/image/window/window_parts.tga |  | lookup-wrapper-or-formatter, screen-resource |
| 99 | `0x0052d180` | `FUN_0052d180` | shared/ui helper | 4 | g0x16/s0x8:ok<br>g0x16/s0x4:ok<br>g0x16/s0x7:ok<br>g0x16/s0x4:ok<br>g0x16/s0x4:ok |     %s |  |  |
| 100 | `0x0052deb0` | `FUN_0052deb0` | common window/dialog | 0 | <br> | /../data/image/window/window_parts.tga<br>/../data/image/window/sentaku_dd_window.tga |  | lookup-wrapper-or-formatter, screen-resource |
| 101 | `0x0052f700` | `FUN_0052f700` | shared/ui helper | 0 | <br><br><br><br><br><br><br><br>+9 |  |  | lookup-wrapper-or-formatter |
| 102 | `0x00530c00` | `FUN_00530c00` | strategy map/panels | 0 | g0x16/s0xb:ok<br>g0x16/s0xc:ok<br>g0x16/s0xd:ok<br>g0x16/s0xe:ok |  |  | lookup-wrapper-or-formatter |
| 103 | `0x005312b0` | `FUN_005312b0` | strategy map/panels | 0 |  |  |  |  |
| 104 | `0x00531b90` | `FUN_00531b90` | strategy map/panels | 0 | g0x16/s0x22:ok<br>g0x16/s0x22:ok<br>g0x16/s0x1f:ok<br>g0x16/s0x1f:ok | %3d%s |  | lookup-wrapper-or-formatter |
| 105 | `0x00531eb0` | `FUN_00531eb0` | strategy map/panels | 0 |  | %s %d |  | lookup-wrapper-or-formatter |
| 106 | `0x005329c0` | `FUN_005329c0` | strategy map/panels | 0 | g0x16:dynamic<br>g0x16/s0x17:ok<br>g0x16/s0x2b:ok<br>g0x16/s0x19:ok<br>g0x16/s0x19:ok<br>g0x16:dynamic<br>g0x16:dynamic<br>g0x16/s0x2f:ok<br>+36 |  |  | lookup-wrapper-or-formatter |
| 107 | `0x00533500` | `FUN_00533500` | strategy map/panels | 0 | g0x16/s0x38:ok<br>g0x16/s0x37:ok<br>g0x16/s0x36:ok<br>g0x16/s0x35:ok<br>g0x16:dynamic<br>g0x16:dynamic<br>g0x16/s0x38:ok<br>g0x16/s0x37:ok<br>+5 |  |  | lookup-wrapper-or-formatter |
| 108 | `0x00535300` | `FUN_00535300` | strategy map/panels | 0 |  |  |  |  |
| 109 | `0x00535390` | `FUN_00535390` | strategy map/panels | 0 |  |  |  |  |
| 110 | `0x00535990` | `FUN_00535990` | common window/dialog | 0 | <br><br><br><br><br><br><br><br>+17 | /../data/image/window/window_parts.tga |  | lookup-wrapper-or-formatter, screen-resource |
| 111 | `0x00539ce0` | `FUN_00539ce0` | strategy map/panels | 0 | g0x16/s0x4b:ok<br>g0x16/s0x4b:ok |  |  | lookup-wrapper-or-formatter |
| 112 | `0x0053aa80` | `FUN_0053aa80` | strategy map/panels | 4 | g0x16/s0x3a:ok<br>g0x16/s0x40:ok<br>g0x16/s0x3a:ok<br>g0x16/s0x40:ok<br>g0x16/s0x3a:ok<br>g0x16/s0x40:ok | %03d/100 |  |  |
| 113 | `0x0053ad30` | `FUN_0053ad30` | strategy map/panels | 6 |  |  |  |  |
| 114 | `0x0053b4b0` | `FUN_0053b4b0` | strategy map/panels | 5 | g0x16/s0x4d:ok<br>g0x16/s0x4e:ok<br>g0x16/s0x4f:ok<br>g0x16/s0x50:ok<br>g0x16/s0x51:ok |  |  |  |
| 115 | `0x0053ba30` | `FUN_0053ba30` | strategy map/panels | 0 |  |  |  |  |
| 116 | `0x0053c1e0` | `FUN_0053c1e0` | strategy map/panels | 2 | <br><br><br> | OrderSuggestType Error! |  |  |
| 117 | `0x0053cc30` | `FUN_0053cc30` | strategy map/panels | 0 | g0x16/s0x57:ok<br>g0x16/s0x56:ok | %s %s<br>%d/%2d/%2d %02d:%02d |  | lookup-wrapper-or-formatter |
| 118 | `0x0053d2b0` | `FUN_0053d2b0` | common window/dialog | 0 | <br><br><br> | /../data/image/window/window_parts.tga |  | lookup-wrapper-or-formatter, screen-resource |
| 119 | `0x0053f2d0` | `FUN_0053f2d0` | common window/dialog | 0 | <br><br><br><br><br><br><br><br>+6 | /../data/image/window/window_parts.tga | galaxy-screen-grid-format-msgdat-boundaryfix.json@0x00543386<br>galaxy-screen-grid-format-msgdat-boundaryfix.json@0x00543389<br>galaxy-screen-grid-format-msgdat-boundaryfix.json@0x0054338b<br>galaxy-screen-starname-msgdat-boundaryfix.json@0x00541622<br>+1 | lookup-wrapper-or-formatter, screen-resource, already-patched |
| 120 | `0x00543570` | `FUN_00543570` | strategy map/panels | 3 |  |  |  | record-or-hardcoded-text |
| 121 | `0x005444c0` | `FUN_005444c0` | strategy map/panels | 3 | g0x16/s0x72:ok<br>g0x16/s0x79:ok<br>g0x16/s0x7a:ok<br>g0x16/s0x7a:ok<br>g0x16/s0x74:ok | %s%s%s |  |  |
| 122 | `0x00544b20` | `FUN_00544b20` | strategy map/panels | 3 | g0x16:dynamic<br><br>g0x16:dynamic<br><br><br><br><br><br>+2 | %s%3d%s | tactical-grid-msgdat-boundaryfix.json@0x00544b9f<br>tactical-grid-msgdat-boundaryfix.json@0x00544c81<br>tactical-grid-msgdat-boundaryfix.json@0x00544d1c<br>tactical-grid-msgdat-boundaryfix.json@0x00544ede<br>+3 | already-patched |
| 123 | `0x00545630` | `FUN_00545630` | strategy map/panels | 3 | g0x16:dynamic<br>g0x16:dynamic<br>g0x16:dynamic<br>g0x16:dynamic<br>g0x16:dynamic |  |  |  |
| 124 | `0x0054b420` | `FUN_0054b420` | world HUD/entity display | 0 | g0x25:dynamic | /../data/image/window/menu_parts.tga |  | screen-resource |
| 125 | `0x0054b6d0` | `FUN_0054b6d0` | common window/dialog | 0 |  | /../data/image/window/window_parts.tga |  | screen-resource |
| 126 | `0x0054ba80` | `FUN_0054ba80` | world HUD/entity display | 0 |  |  |  |  |
| 127 | `0x0054be80` | `FUN_0054be80` | world HUD/entity display | 0 |  |  |  |  |
| 128 | `0x0054bee0` | `FUN_0054bee0` | world HUD/entity display | 0 |  |  |  |  |
| 129 | `0x0054bf40` | `FUN_0054bf40` | world HUD/entity display | 1 | <br><br><br><br><br><br> |  |  |  |
| 130 | `0x0054c4b0` | `FUN_0054c4b0` | world HUD/entity display | 0 | <br> |  |  |  |
| 131 | `0x0054c950` | `FUN_0054c950` | world HUD/entity display | 2 | g0x48:dynamic<br>g0x48:dynamic<br>g0x5:dynamic<br>g0x1a:dynamic<br>g0x1a:dynamic<br>g0x1a:dynamic<br>g0x11:dynamic<br>g0xf:dynamic<br>+6 | %-20s |  |  |
| 132 | `0x0054d4e0` | `FUN_0054d4e0` | world HUD/entity display | 4 | g0x1:dynamic<br>g0x2:dynamic<br>g0x63:dynamic<br>g0x53:dynamic<br>g0x55:dynamic<br>g0x26:dynamic<br>g0x78:dynamic<br>g0x26:dynamic<br>+14 | %-20s<br>%d%4d%4d%4d%4d%4d%4d%4d%4d%4d%4d |  |  |
| 133 | `0x0054e760` | `FUN_0054e760` | world HUD/entity display | 0 |  | /../data/image/window/baloon_parts.tga |  | screen-resource |
| 134 | `0x0054eda0` | `FUN_0054eda0` | world HUD/entity display | 0 | g0x6b/s0x0:ok<br>g0x6b/s0x1:ok |  |  | lookup-wrapper-or-formatter |
| 135 | `0x0054ef40` | `FUN_0054ef40` | world HUD/entity display | 0 |  |  |  |  |
| 136 | `0x0054f4e0` | `FUN_0054f4e0` | lobby/game menu | 1 | g0x6a/s0x1:ok | /../data/image/gamemenu/menu_parts.tga |  | screen-resource |
| 137 | `0x0054f680` | `FUN_0054f680` | common window/dialog | 8 | g0x6a:dynamic<br>g0x6a/s0x10:no-data<br>g0x6a/s0x11:no-data<br>g0x6a/s0x12:no-data<br>g0x6a/s0x13:no-data<br>g0x6a/s0x14:no-data<br>g0x6a/s0x15:no-data<br>g0x6a/s0x9:no-data<br>+1 | /../data/image/window/window_parts.tga<br>/../data/image/window/menu_parts.tga | mission-msgdat-subidfix.json@0x0054f843<br>mission-msgdat-subidfix.json@0x0054f868<br>mission-msgdat-subidfix.json@0x0054f922<br>mission-msgdat-subidfix.json@0x0054f9c4<br>+8 | constmsg-no-data, screen-resource, already-patched |
| 138 | `0x00550a00` | `FUN_00550a00` | world HUD/entity display | 2 |  |  |  | record-or-hardcoded-text |
| 139 | `0x00550b80` | `FUN_00550b80` | world HUD/entity display | 0 | g0x6a/s0x1:ok<br>g0x6a/s0x2:ok<br>g0x6a/s0x0:ok |  |  |  |
| 140 | `0x0056ebf0` | `FUN_0056ebf0` | shared/ui helper | 0 | g0x67/s0x0:ok<br>g0x67/s0x1:ok | /../data/image/window/dialog_parts.tga | dlgfix.json@0x0056f304<br>dlgfix.json@0x0056f39a | lookup-wrapper-or-formatter, screen-resource, already-patched |
| 141 | `0x0056fb40` | `FUN_0056fb40` | shared/ui helper | 0 |  |  |  |  |
| 142 | `0x005751b0` | `FUN_005751b0` | command/selection panels | 0 |  |  |  |  |
| 143 | `0x00575680` | `FUN_00575680` | common window/dialog | 1 |  | /../data/image/window/window_parts.tga |  | record-or-hardcoded-text, screen-resource |
| 144 | `0x00576aa0` | `FUN_00576aa0` | command/selection panels | 1 |  |  |  | record-or-hardcoded-text |
| 145 | `0x00576ad0` | `FUN_00576ad0` | command/selection panels | 0 |  |  |  |  |
| 146 | `0x00577660` | `FUN_00577660` | command/selection panels | 0 |  |  |  |  |
| 147 | `0x005780f0` | `FUN_005780f0` | common window/dialog | 0 | <br><br><br><br><br><br><br><br>+2 | /../data/image/window/window_parts.tga<br>/../data/image/window/sentaku_dd_window.tga |  | lookup-wrapper-or-formatter, screen-resource |
| 148 | `0x0057a1f0` | `FUN_0057a1f0` | command/selection panels | 0 | g0x11:dynamic<br>g0x1a/s0x3:ok<br>g0x1a/s0x18:ok<br>g0x1a/s0x17:ok<br>g0x1a/s0x15:ok<br>g0x1a/s0xa:ok<br>g0x1a/s0xc:ok<br>g0x62/s0x0:ok<br>+9 |  |  | lookup-wrapper-or-formatter |
| 149 | `0x0057a5d0` | `FUN_0057a5d0` | command/selection panels | 0 | g0x4e:dynamic<br>g0x19/s0x1:ok | %s%s\n%s    %s |  | lookup-wrapper-or-formatter |
| 150 | `0x0057a830` | `FUN_0057a830` | command/selection panels | 0 | g0x16/s0x64:ok | %s    %d%s%d<br>%s      %d%s%d\n%s    %d%s%d<br>%s %d%s%d<br>%s      %d%s%d\n%s    %d%s%d\n%s    %d%s%d<br>+2 |  | lookup-wrapper-or-formatter |
| 151 | `0x0057aa90` | `FUN_0057aa90` | command/selection panels | 0 | g0x5f:dynamic<br>g0x5f/s0x6:no-data<br>g0x5f/s0x5:no-data<br>g0x5f/s0x4:no-data<br>g0x5f/s0x12:no-data<br>g0x5f/s0x11:no-data<br>g0x5f/s0x10:no-data<br>g0x5f/s0xf:no-data<br>+13 | -------------- |  | constmsg-no-data, lookup-wrapper-or-formatter |
| 152 | `0x0057af30` | `FUN_0057af30` | command/selection panels | 0 | g0x2e/s0x16:no-data<br>g0x2e/s0xa:ok<br>g0x2e/s0x14:ok<br>g0x2e/s0x8:ok<br>g0x2e/s0x12:ok<br>g0x2e/s0x6:ok<br>g0x2e/s0x10:ok<br>g0x2e/s0x4:ok<br>+8 | \n%-12s%7d(%7d) %-16s%5d(%5d)\n%-16s%5d(%5d) ... |  | constmsg-no-data, lookup-wrapper-or-formatter |
| 153 | `0x0057b640` | `FUN_0057b640` | command/selection panels | 0 | g0x61/s0x0:ok | %s %s(%d) |  | lookup-wrapper-or-formatter |
| 154 | `0x0057b8e0` | `FUN_0057b8e0` | command/selection panels | 0 | g0x16:dynamic<br>g0x16:dynamic |  |  | lookup-wrapper-or-formatter |
| 155 | `0x0057bbc0` | `FUN_0057bbc0` | command/selection panels | 0 | g0x16:dynamic<br>g0x16:dynamic |  |  | lookup-wrapper-or-formatter |
| 156 | `0x0057bd90` | `FUN_0057bd90` | command/selection panels | 0 | g0x16:dynamic<br>g0x16:dynamic |  |  | lookup-wrapper-or-formatter |
| 157 | `0x0057c100` | `FUN_0057c100` | command/selection panels | 0 |  |  |  | lookup-wrapper-or-formatter |
| 158 | `0x0057c250` | `FUN_0057c250` | command/selection panels | 0 | <br><br>g0x16:dynamic |  |  | lookup-wrapper-or-formatter |
| 159 | `0x0057d0a0` | `FUN_0057d0a0` | command/selection panels | 0 |  |  |  | lookup-wrapper-or-formatter |
| 160 | `0x0057d6a0` | `FUN_0057d6a0` | command/selection panels | 0 | <br><br> | %s%s %s |  | lookup-wrapper-or-formatter |
| 161 | `0x0058d140` | `FUN_0058d140` | HUD/detail panels | 0 | g0x67:dynamic<br>g0x68:dynamic<br>g0x68/s0x9:no-data<br>g0x68/s0x8:no-data<br>g0x68/s0x7:no-data<br>g0x68/s0x6:no-data<br>g0x68/s0x5:no-data<br>g0x68/s0x4:no-data<br>+4 |      %-2d      %-2d      %-2d      %-2d\n    ...<br>%s    %s    %s    %s\n%s    %s    %s    %s\n%...<br>%-4d\n<br>%-4d             %-4d<br>+2 | hud-character-status-msgdatfix.json@0x0058d3b7<br>hud-character-status-msgdatfix.json@0x0058d3b9<br>hud-msgdat-groupfix.json@0x0058d560<br>hud-msgdat-groupfix.json@0x0058d56f<br>+9 | constmsg-no-data, lookup-wrapper-or-formatter, already-patched |
| 162 | `0x0058d850` | `FUN_0058d850` | HUD/detail panels | 0 |  |  |  |  |
| 163 | `0x0058ee70` | `FUN_0058ee70` | HUD/detail panels | 0 | g0x68:dynamic<br>g0x68/s0x14:no-data<br>g0x68/s0x13:no-data<br>g0x68/s0x12:no-data<br>g0x68/s0x11:no-data<br>g0x68/s0x10:no-data<br>g0x68:dynamic<br>g0x68:dynamic<br>+2 | %s %s<br>%-4d\n<br>%-4d             %-4d<br>     %-2d      %-2d      %-2d      %-2d\n    ...<br>+1 | hud-msgdat-groupfix.json@0x0058effa<br>hud-msgdat-groupfix.json@0x0058f01d<br>hud-msgdat-groupfix.json@0x0058f037<br>hud-msgdat-groupfix.json@0x0058f052<br>+6 | constmsg-no-data, lookup-wrapper-or-formatter, already-patched |
| 164 | `0x0058fc20` | `FUN_0058fc20` | HUD/detail panels | 0 | g0x14:dynamic<br>g0x12:dynamic | /../data/image/window/menu_parts.tga |  | screen-resource |
| 165 | `0x00591aa0` | `FUN_00591aa0` | HUD/detail panels | 0 |  |  |  |  |
| 166 | `0x00593dd0` | `FUN_00593dd0` | lobby/game menu | 5 | g0x4e/s0xe:ok | /../data/image/window/window_parts.tga<br>/../data/image/gamemenu/menu_parts.tga |  | screen-resource |
| 167 | `0x005946d0` | `FUN_005946d0` | character creation/profile | 12 |  |  |  | record-or-hardcoded-text |
| 168 | `0x00594c20` | `FUN_00594c20` | character creation/profile | 0 |  |  |  |  |
| 169 | `0x00594f20` | `FUN_00594f20` | character creation/profile | 0 | g0x4e/s0x59:ok<br>g0x4e/s0x4f:ok<br>g0x4e/s0x5a:ok<br>g0x4e/s0x4c:ok<br>g0x4e/s0x5b:ok<br>g0x4e/s0x5b:ok<br>g0x4e/s0x62:ok<br>g0x4e/s0x59:ok<br>+3 | ORIGINAL CHARGE MISSTAKE!!!!<br>ORIGINAL CHARGE OK!! |  | lookup-wrapper-or-formatter |
| 170 | `0x00595d30` | `FUN_00595d30` | character creation/profile | 0 |  |  |  |  |
| 171 | `0x00595e00` | `FUN_00595e00` | character creation/profile | 0 |  |  |  |  |
| 172 | `0x00595f00` | `FUN_00595f00` | character creation/profile | 0 |  |  |  |  |
| 173 | `0x00595f80` | `FUN_00595f80` | character creation/profile | 0 |  |  |  |  |
| 174 | `0x005960b0` | `FUN_005960b0` | character creation/profile | 0 |  |  |  |  |
| 175 | `0x00596130` | `FUN_00596130` | character creation/profile | 0 |  |  |  |  |
| 176 | `0x00596260` | `FUN_00596260` | character creation/profile | 2 | g0xf/s0x2:ok<br>g0xf/s0x3:ok |  |  |  |
| 177 | `0x00596630` | `FUN_00596630` | character creation/profile | 0 |  |  |  |  |
| 178 | `0x005969b0` | `FUN_005969b0` | character creation/profile | 0 |  |  |  |  |
| 179 | `0x00596c70` | `FUN_00596c70` | character creation/profile | 3 | g0x4e/s0x10:ok<br>g0x4e/s0x3f:ok<br>g0x4e/s0x40:ok |  |  |  |
| 180 | `0x00596f90` | `FUN_00596f90` | character creation/profile | 0 |  |  |  |  |
| 181 | `0x00597150` | `FUN_00597150` | character creation/profile | 0 |  |  |  |  |
| 182 | `0x005972c0` | `FUN_005972c0` | character creation/profile | 1 |  |  |  | record-or-hardcoded-text |
| 183 | `0x00597380` | `FUN_00597380` | character creation/profile | 2 |  |  |  | record-or-hardcoded-text |
| 184 | `0x00597720` | `FUN_00597720` | character creation/profile | 0 | g0x4e:dynamic<br>g0x1:dynamic<br>g0x5:dynamic<br>g0x4e:dynamic<br>g0x55:dynamic<br>g0x26:dynamic |  |  |  |
| 185 | `0x00597a00` | `FUN_00597a00` | character creation/profile | 0 | g0x3:dynamic |  |  | lookup-wrapper-or-formatter |
| 186 | `0x00597ac0` | `FUN_00597ac0` | character creation/profile | 0 |  |  |  |  |
| 187 | `0x00597b20` | `FUN_00597b20` | character creation/profile | 9 | g0x1:dynamic<br>g0x5:dynamic<br>g0xf:dynamic<br>g0x3:dynamic<br>g0x4e/s0x3f:ok<br>g0x4e/s0x40:ok<br>g0x4e/s0x10:ok |  |  |  |
| 188 | `0x00597e30` | `FUN_00597e30` | character creation/profile | 0 |  |  |  |  |
| 189 | `0x00597ea0` | `FUN_00597ea0` | character creation/profile | 2 |  |  |  | record-or-hardcoded-text |
| 190 | `0x00597ff0` | `FUN_00597ff0` | character creation/profile | 0 |  |  |  |  |
| 191 | `0x005983c0` | `FUN_005983c0` | character creation/profile | 2 |  |  |  | record-or-hardcoded-text |
| 192 | `0x005989f0` | `FUN_005989f0` | character-create/profile gamemenu | 5 | g0x4e/s0x2c:ok<br>g0x4e/s0x2d:ok<br>g0x4e/s0x2e:ok<br>g0x4e/s0x50:ok<br>g0x4e/s0x2f:ok | /../data/image/gamemenu/menu_parts.tga | charsel-content-inset.json@0x00598bd2<br>charsel-content-y-inset.json@0x00598bda<br>charsel-recenter.json@0x00598bd2<br>charsel-recenter.json@0x00598bda | screen-resource, already-patched |
| 193 | `0x00598ff0` | `FUN_00598ff0` | character-create/profile gamemenu | 5 | g0x4e/s0x35:ok<br>g0x4e/s0x36:ok<br>g0x4e/s0x37:ok<br>g0x4e/s0x50:ok<br>g0x4e/s0x2f:ok | /../data/image/gamemenu/menu_parts.tga | charsel-content-inset.json@0x005991d2<br>charsel-recenter.json@0x005991d2<br>charsel-recenter.json@0x005991da | screen-resource, already-patched |
| 194 | `0x005995f0` | `FUN_005995f0` | character-create/profile gamemenu | 7 | g0x4e/s0x30:ok<br>g0xf/s0x2:ok<br>g0xf/s0x4:ok<br>g0xf/s0x0:ok<br>g0xf/s0x1:ok<br>g0x4e/s0x50:ok<br>g0x4e/s0x2f:ok | /../data/image/gamemenu/menu_parts.tga | charsel-content-inset.json@0x005997d2<br>charsel-recenter.json@0x005997d2<br>charsel-recenter.json@0x005997da | screen-resource, already-patched |
| 195 | `0x00599e10` | `FUN_00599e10` | character-create/profile gamemenu | 8 | g0x4e/s0x38:ok<br>g0x4e/s0x51:ok<br>g0x4e/s0x52:ok<br>g0x4e/s0x53:ok<br>g0x4e/s0x39:ok<br>g0x4e/s0x3a:ok<br>g0x4e/s0x50:ok<br>g0x4e/s0x2f:ok | /../data/image/gamemenu/menu_parts.tga | charsel-content-inset.json@0x00599f70<br>charsel-recenter.json@0x00599f70<br>charsel-recenter.json@0x00599f78 | screen-resource, already-patched |
| 196 | `0x0059a5e0` | `FUN_0059a5e0` | character-create/profile gamemenu | 5 | g0x4e/s0x3d:ok<br>g0x4e/s0x3e:ok<br>g0x4e/s0x54:ok<br>g0x4e/s0x50:ok<br>g0x4e/s0x2f:ok | /../data/image/window/window_parts.tga<br>/../data/image/gamemenu/menu_parts.tga | charsel-content-inset.json@0x0059a861<br>charsel-recenter.json@0x0059a861<br>charsel-recenter.json@0x0059a869 | screen-resource, already-patched |
| 197 | `0x0059b090` | `FUN_0059b090` | character-create/profile gamemenu | 5 | g0x4e/s0x41:ok<br>g0x4e/s0x50:ok<br>g0x4e/s0x2f:ok<br>g0x4e/s0x42:ok<br>g0x4e/s0x43:ok | /../data/image/gamemenu/menu_parts.tga<br>/../data/image/face/unknownface.tga | charsel-content-inset.json@0x0059b457<br>charsel-recenter.json@0x0059b457<br>charsel-recenter.json@0x0059b45f | screen-resource, already-patched |
| 198 | `0x0059b970` | `FUN_0059b970` | character-create/profile gamemenu | 12 | g0x4e/s0x45:ok<br>g0x4e/s0x46:ok<br>g0x4e/s0x55:ok<br>g0x4e/s0x56:ok<br>g0x4e/s0x57:ok<br>g0x4e:dynamic<br>g0x4e/s0x50:ok<br>g0x4e/s0x2f:ok | /../data/image/window/window_parts.tga<br>/../data/image/gamemenu/menu_parts.tga | charsel-content-inset.json@0x0059bc41<br>charsel-recenter.json@0x0059bc41<br>charsel-recenter.json@0x0059bc49 | screen-resource, already-patched |
| 199 | `0x0059c940` | `FUN_0059c940` | character-create/profile gamemenu | 4 | g0x4e/s0x4b:ok<br>g0x4e/s0x39:ok<br>g0x4e/s0x50:ok<br>g0x4e/s0x2f:ok | /../data/image/gamemenu/menu_parts.tga | charsel-content-inset.json@0x0059ca9f<br>charsel-recenter.json@0x0059ca9f<br>charsel-recenter.json@0x0059caa7 | screen-resource, already-patched |
| 200 | `0x0059cee0` | `FUN_0059cee0` | character-create/profile gamemenu | 3 | g0x4e/s0x47:ok<br>g0x4e/s0x50:ok<br>g0x4e/s0x2f:ok | /../data/image/gamemenu/menu_parts.tga | charsel-content-inset.json@0x0059cfa4<br>charsel-recenter.json@0x0059cfa4<br>charsel-recenter.json@0x0059cfac | screen-resource, already-patched |
| 201 | `0x0059d200` | `FUN_0059d200` | character-create/profile gamemenu | 3 | g0x4e/s0x48:ok<br>g0x4e/s0x50:ok<br>g0x4e/s0x2f:ok | /../data/image/gamemenu/menu_parts.tga | charsel-content-inset.json@0x0059d2c3<br>charsel-recenter.json@0x0059d2c3<br>charsel-recenter.json@0x0059d2cb | screen-resource, already-patched |
| 202 | `0x0059d520` | `FUN_0059d520` | character-create/profile gamemenu | 15 | g0x4e/s0x4c:ok<br>g0x4e/s0x4e:ok<br>g0x4e/s0x4d:ok<br>g0x4e:dynamic<br>g0x4e:dynamic<br>g0x4e/s0x58:ok | /../data/image/gamemenu/menu_parts.tga<br>/../data/image/face/unknownface.tga | charsel-content-inset.json@0x0059d71a<br>charsel-recenter.json@0x0059d71a<br>charsel-recenter.json@0x0059d722 | screen-resource, already-patched |
| 203 | `0x0059df00` | `FUN_0059df00` | character-create/profile gamemenu | 18 | g0x4e/s0x2a:ok<br>g0x4e/s0x71:ok<br>g0x4e/s0x2b:ok<br>g0x4e/s0x70:ok<br>g0x4e/s0x72:ok<br>g0x4e:dynamic<br>g0x4e/s0x69:ok<br>g0x4e/s0x6c:ok<br>+9 | /../data/image/window/window_parts.tga<br>/../data/image/gamemenu/menu_parts.tga | charsel-content-inset.json@0x0059e66c<br>charsel-recenter.json@0x0059e66c<br>charsel-recenter.json@0x0059e674 | screen-resource, already-patched |

## Static ConstMsg Boundary Failures

- `0x0054f680` `FUN_0054f680` (common window/dialog)
  - group=106 subId=16 count=6 status=no-data
  - group=106 subId=17 count=6 status=no-data
  - group=106 subId=18 count=6 status=no-data
  - group=106 subId=19 count=6 status=no-data
  - group=106 subId=20 count=6 status=no-data
  - group=106 subId=21 count=6 status=no-data
  - group=106 subId=9 count=6 status=no-data
  - group=106 subId=9 count=6 status=no-data
- `0x0057aa90` `FUN_0057aa90` (command/selection panels)
  - group=95 subId=6 count=4 status=no-data
  - group=95 subId=5 count=4 status=no-data
  - group=95 subId=4 count=4 status=no-data
  - group=95 subId=18 count=4 status=no-data
  - group=95 subId=17 count=4 status=no-data
  - group=95 subId=16 count=4 status=no-data
  - group=95 subId=15 count=4 status=no-data
  - group=95 subId=14 count=4 status=no-data
  - group=95 subId=13 count=4 status=no-data
  - group=95 subId=12 count=4 status=no-data
  - group=95 subId=11 count=4 status=no-data
  - group=95 subId=10 count=4 status=no-data
  - group=95 subId=9 count=4 status=no-data
  - group=95 subId=8 count=4 status=no-data
  - group=95 subId=7 count=4 status=no-data
  - group=95 subId=22 count=4 status=no-data
  - group=95 subId=21 count=4 status=no-data
  - group=95 subId=20 count=4 status=no-data
  - group=95 subId=19 count=4 status=no-data
- `0x0057af30` `FUN_0057af30` (command/selection panels)
  - group=46 subId=22 count=21 status=no-data
- `0x0058d140` `FUN_0058d140` (HUD/detail panels)
  - group=104 subId=9 count=3 status=no-data
  - group=104 subId=8 count=3 status=no-data
  - group=104 subId=7 count=3 status=no-data
  - group=104 subId=6 count=3 status=no-data
  - group=104 subId=5 count=3 status=no-data
  - group=104 subId=4 count=3 status=no-data
  - group=104 subId=3 count=3 status=no-data
- `0x0058ee70` `FUN_0058ee70` (HUD/detail panels)
  - group=104 subId=20 count=3 status=no-data
  - group=104 subId=19 count=3 status=no-data
  - group=104 subId=18 count=3 status=no-data
  - group=104 subId=17 count=3 status=no-data
  - group=104 subId=16 count=3 status=no-data

## Notes

- `dynamic` ConstMsg calls require live MsgDat lookup tracing because the group/subId is read from runtime data.
- `record-or-hardcoded-text` means the function sets visible text without a literal ConstMsg call in the same function; follow its input record or caller.
- Existing patches are mapped by patch VA into the Ghidra function range, so this table shows which display functions already have surgical client fixes.
