# LOGH VII EXE Function Audit (2026-06-30)

Scope: every function in every available Ghidra EXE export, not only text setters.

- Full JSONL: `C:\Users\by0ng\OneDrive\Desktop\logh7-revival\RE\.omo\exe-function-audit-20260630\all-functions.jsonl`
- Per-EXE JSONL/TSV directory: `C:\Users\by0ng\OneDrive\Desktop\logh7-revival\RE\.omo\exe-function-audit-20260630`
- Total functions: 18485

## Executable Coverage

| EXE/export | Functions | With strings | With ConstMsg | With patches | Top categories |
|---|---:|---:|---:|---:|---|
| `BootFirst` | 78 | 1 | 0 | 0 | uncategorized=65, protocol_stream=5, text_display=4, file_resource=3, process_thread=3, error_assert_log=3, mfc_crt_runtime=1 |
| `G7MTClient` | 13800 | 933 | 108 | 43 | uncategorized=8822, mfc_crt_runtime=3650, protocol_stream=1373, error_assert_log=451, ui_layout_scene=217, text_display=203, file_resource=67, crypto_codec=66 |
| `G7Start` | 1723 | 13 | 0 | 0 | uncategorized=1368, protocol_stream=228, mfc_crt_runtime=84, error_assert_log=34, text_display=32, file_resource=23, ui_layout_scene=19, process_thread=5 |
| `Gin7UpdateClient` | 2453 | 99 | 0 | 0 | uncategorized=2033, protocol_stream=257, mfc_crt_runtime=66, error_assert_log=50, file_resource=36, network_socket=36, text_display=26, ui_layout_scene=17 |
| `setup` | 431 | 41 | 0 | 0 | uncategorized=283, error_assert_log=60, file_resource=36, protocol_stream=30, text_display=18, registry_config=10, process_thread=9, ui_layout_scene=6 |

## G7MTClient Patched Function Owners

| VA | Function | Patch count | Patch descriptors |
|---|---|---:|---|
| `0x0051cda0` | `FUN_0051cda0` | 31 | login-native-layout.json, login-native-layout.json, login-native-layout.json, login-native-layout.json, login-native-layout.json, login-native-layout.json, login-native-layout.json, login-native-layout.json |
| `0x0051c980` | `FUN_0051c980` | 26 | lobby-native-layout-v2.json, lobby-native-layout-v2.json, lobby-native-layout-v2.json, lobby-native-layout-v2.json, lobby-native-layout-v2.json, lobby-native-layout-v2.json, lobby-native-layout-v2.json, lobby-native-layout-v2.json |
| `0x0051a370` | `FUN_0051a370` | 22 | lobby-fullscreen-display.json, lobby-fullscreen-display.json, lobby-fullscreen-display.json, lobby-fullscreen-display.json, lobby-res.json, lobby-res.json, lobby-res.json, lobby-res.json |
| `0x0066acc3` | `Unwind@0066acc3` | 17 | chat-target-labels-ko.json, font-atlas-face.json, font-face.json, hud-hardcoded-stat-labels-ko.json, login-title-ko.json, sector-label-hardcoded-ko.json, sector-label-hardcoded-ko.json, session-select-hardcoded-ko.json |
| `0x0051f8b0` | `FUN_0051f8b0` | 16 | charsel-content-inset.json, charsel-content-inset.json, charsel-content-inset.json, charsel-recenter.json, charsel-recenter.json, charsel-recenter.json, charsel-recenter.json, charsel-recenter.json |
| `0x0058d140` | `FUN_0058d140` | 13 | hud-character-status-msgdatfix.json, hud-character-status-msgdatfix.json, hud-msgdat-groupfix.json, hud-msgdat-groupfix.json, hud-msgdat-groupfix.json, hud-msgdat-groupfix.json, hud-msgdat-groupfix.json, hud-msgdat-groupfix.json |
| `0x0054f680` | `FUN_0054f680` | 12 | mission-msgdat-subidfix.json, mission-msgdat-subidfix.json, mission-msgdat-subidfix.json, mission-msgdat-subidfix.json, mission-msgdat-subidfix.json, mission-msgdat-subidfix.json, mission-msgdat-subidfix.json, mission-msgdat-subidfix.json |
| `0x0058ee70` | `FUN_0058ee70` | 10 | hud-msgdat-groupfix.json, hud-msgdat-groupfix.json, hud-msgdat-groupfix.json, hud-msgdat-groupfix.json, hud-msgdat-groupfix.json, hud-msgdat-groupfix.json, hud-msgdat-groupfix.json, hud-msgdat-groupfix.json |
| `0x005123b0` | `FUN_005123b0` | 8 | soukan-hud-native-layout.json, soukan-hud-native-layout.json, soukan-hud-native-layout.json, soukan-hud-native-layout.json, soukan-hud-native-layout.json, soukan-hud-native-layout.json, soukan-hud-native-layout.json, soukan-hud-native-layout.json |
| `0x0051e580` | `FUN_0051e580` | 7 | charsel-native-layout.json, charsel-native-layout.json, charsel-native-layout.json, charsel-native-layout.json, charsel-native-layout.json, charsel-recenter.json, charsel-recenter.json |
| `0x00544b20` | `FUN_00544b20` | 7 | tactical-grid-msgdat-boundaryfix.json, tactical-grid-msgdat-boundaryfix.json, tactical-grid-msgdat-boundaryfix.json, tactical-grid-msgdat-boundaryfix.json, tactical-grid-msgdat-boundaryfix.json, tactical-grid-msgdat-boundaryfix.json, tactical-grid-msgdat-boundaryfix.json |
| `0x0051dd80` | `FUN_0051dd80` | 6 | charsel-recenter.json, charsel-recenter.json, gamemenu-right-native-layout.json, gamemenu-right-native-layout.json, gamemenu-right-native-layout.json, gamemenu-right-native-layout.json |
| `0x0051dc00` | `FUN_0051dc00` | 5 | charsel-recenter.json, charsel-recenter.json, gamemenu-right-native-layout.json, gamemenu-right-native-layout.json, gamemenu-right-native-layout.json |
| `0x0053f2d0` | `FUN_0053f2d0` | 5 | galaxy-screen-grid-format-msgdat-boundaryfix.json, galaxy-screen-grid-format-msgdat-boundaryfix.json, galaxy-screen-grid-format-msgdat-boundaryfix.json, galaxy-screen-starname-msgdat-boundaryfix.json, galaxy-screen-starname-msgdat-boundaryfix.json |
| `0x00595e70` | `FUN_00595e70` | 4 | charsel-content-inset.json, charsel-content-y-inset.json, charsel-recenter.json, charsel-recenter.json |
| `0x005989f0` | `FUN_005989f0` | 4 | charsel-content-inset.json, charsel-content-y-inset.json, charsel-recenter.json, charsel-recenter.json |

## Category Meaning

- `text_display`: `FUN_00522010`, `FUN_004eac60`, `FUN_004ea8b0`, `FUN_004eaaf0`, `FUN_00503560`, `FUN_00503610`
- `ui_layout_scene`: `FUN_00503a10`, `FUN_00502780`, `FUN_00502940`, `FUN_00502eb0`, `data/image`, `.par`
- `network_socket`: `recv`, `send`, `socket`, `connect`, `bind`, `listen`
- `protocol_stream`: `+ 0x1c`, `+ 0x20`, `+ 0x24`, `0x2004`, `0x2006`, `0x0f`
- `render_d3d`: `Direct3D`, `D3D`, `IDirect3D`, `DrawPrimitive`, `SetTexture`, `CreateTexture`
- `input`: `GetAsyncKeyState`, `GetKeyState`, `keyboard`, `mouse`, `WM_KEY`, `WM_LBUTTON`
- `file_resource`: `CreateFile`, `ReadFile`, `WriteFile`, `CloseHandle`, `fopen`, `fread`
- `registry_config`: `RegOpenKey`, `RegCreateKey`, `RegQueryValue`, `RegSetValue`, `HKEY_`, `SOFTWARE`
- `process_thread`: `CreateProcess`, `ShellExecute`, `WinExec`, `CreateThread`, `ExitProcess`, `TerminateProcess`
- `crypto_codec`: `Blowfish`, `cipher`, `encrypt`, `decrypt`, `FUN_006140c0`, `FUN_00614220`
- `error_assert_log`: `FUN_005923a0`, `assert`, `Error`, `Invalid`, `NO DATA`, `NO TABLE`
- `mfc_crt_runtime`: `CWnd`, `CDialog`, `CString`, `__Cxx`, `operator_new`, `FUN_0064`

## Verification Note

This is a static whole-function inventory. Function semantics marked by category are evidence hints from decompile text, strings, imports, and patch ownership; gameplay-critical byte layouts still require focused RE and live client validation before changing server/client behavior.
