# LOGH VII — Binary DATA Extract (Lane 5)

Extraction of embedded DATA, strings, and DLL export/import tables from the **auxiliary
binaries** — everything except `G7MTClient.exe` (the game client, already indexed). Covers the
two DirectX setup DLLs (`DSETUP32.dll`, `DSETUP.dll`) plus the Ghidra-exported `G7Start`,
`Gin7UpdateClient`, `BootFirst`, and `setup`.

- **Tool:** `tools/logh7_binary_data.py` (PE-header parser, no external deps + Ghidra-export miner)
- **Output:** `content/extracted/binary-data.json`
- **Rule:** every datum is from the bytes — VAs / file-offsets cited; nothing invented.

## Counts

| Binary | Source | Exports | Import DLLs | Strings | Game-relevant strings |
|---|---|---:|---:|---:|---:|
| DSETUP.dll | PE parse | 18 | 6 | 667 | DirectX API (see below) |
| DSETUP32.dll | PE parse | 6 | 8 | 1,737 code/data (+37,143 EULA omitted) | DirectX API |
| BootFirst | Ghidra | – | 2 | 100 | 5 |
| G7Start | Ghidra | – | 13 | 734 | 22 |
| Gin7UpdateClient | Ghidra | – | 11 | 830 | 113 |
| setup | Ghidra | – | 8 | 559 | 1 (stock InstallShield) |

Totals: **24 DLL exports** parsed, **143 game-relevant strings** classified across the Ghidra exports.

## Top finding — hard-coded update/server config (Gin7UpdateClient)

The updater reads `SERVER.INI` / `update.ini`. Its `.data`/`.rdata` carry the default values and
the full INI key set (VAs from `Gin7UpdateClient/strings.tsv`):

| Datum | Value | VA |
|---|---|---|
| Default server address | `202.8.80.179` | 0x0044a540 |
| Default server port | `47902` | 0x0044a538 |
| Launch target | `.\exe\G7MTClient.exe` | 0x0044a51c |
| User-Agent | `Multiterm Http Library ver.1.0` | 0x0044f2b8 |

INI keys: `SERVER_ADDRESS`, `SERVER_PORT`, `PROXY_ADDRESS`, `PROXY_PORT`, `WORK_DIR`, `TEMP_DIR`,
`BASE_DIR`, `STARTUP_APPNAME`, `UPDATE`, `VERSION`, `LAST_ERROR`, `TITLE_BG`.
Config files: `%sSERVER.INI`, `%supdate.ini`, `UPDATE.LOG`. Self-update file set:
`Gin7UpdateClient.exe` / `.new` / `.old` (managed by `BootFirst`, the launcher).

## Shared net/message stack in the updater

`Gin7UpdateClient` statically links the **same `mt*` / `mps*` networking library as the game
client**, so its `.rdata` exposes the class/error-string vocabulary verbatim:

- Stream: `mtNetStreamOutputBuffer`, `mtNetStreamInputBuffer`, `mtStreamOutputBuffer`, `mtStreamInputBuffer`
- Transport: `mtTCPModule_win32`, `mtHttpMessage`, `mtSendBuffer`, `mtReceiveBuffer`, `mtStack`
- Message: `mpsMessage`, `mpsClientConnection`, `mpsUpdateClientProcessor`, `mpsMessageFactory`
- HTTP headers: ProxyServer, ProxyEnable, Referer, Range, User-Agent, Accept-Encoding, Accept,
  Connection, Location, Transfer-Encoding, Content-Length, Last-Modified
- HTTP methods: CONNECT, TRACE, DELETE, OPTIONS

Imports confirm the raw socket layer: **WSOCK32.DLL** (21 funcs incl. `WSAStartup`, `socket`,
`connect`, `send`, `recv`, `gethostbyname`, `inet_addr`).

## Localization / skin selector tokens

Present in **both** `G7Start` and `Gin7UpdateClient` (DllMain/config selector):

- Languages: `hangeul`, `kanji`, `english`, `roman`
- Menu variants: `hangeulmenu`, `kanjimenu`
- 3D-control skins: `windows`, `C3dHNew`, `C3dLNew`, `C3dNew`

`hangeul`/`kanji`/`english`/`roman` = the four built-in language sets; this corroborates the
String.txt/charset localization path already documented for the client.

## Version info (from VERSIONINFO resources)

| Binary | Company | Description | Copyright | Ver |
|---|---|---|---|---|
| G7Start | ボーステック株式会社 (BOTHTEC Inc.) | 銀河英雄伝説VIIゲームスタータ | Copyright (C) 2004 BOTHTEC | 1,0,0,1 |
| Gin7UpdateClient | ボーステック／株式会社マイクロビジョン (BOTHTEC / MicroVision) | 銀英伝VIIアップデートクライアント | (C) 2004 MicroVision,Inc. | 1,0,0,0 |
| BootFirst | 株式会社 マルチターム (Multiterm Co.,Ltd.) | アップデートクライアント 起動プログラム | Multiterm Co.,Ltd. | 1,0,0,0 |

## G7Start launch/install constants

`exe\G7MTClient.exe` (launch), `Install`, `SETUP.EXE`, `TITLE_BG`, `\DirectX9`,
`.\Gin7UpdateClient.exe`, plus Japanese UI menu strings: インストール (Install),
アンインストール (Uninstall), PDFマニュアル, 終了 (Exit), and DirectX9 install confirmation
dialogs.

## DirectX setup DLLs — identity & API surface

Both DLLs are the **unmodified Microsoft DirectX 9.0 redistributable** bundled with the game
(not LOGH-authored). G7Start imports `DSETUP.DLL` **by ordinal**:

| G7Start import | Resolved export | Purpose |
|---|---|---|
| `DSETUP.DLL #5` | `DirectXSetupA` | run the DirectX9 redist install |
| `DSETUP.DLL #11` | `DirectXSetupGetVersion` | probe the installed DirectX version |

- **DSETUP.dll** (18 exports): the thunk wrapper. `DirectXSetupGetVersion()` reads HKLM DirectX
  `Version`; `LoadDSetup32()` `LoadLibrary`s `\DSETUP32.DLL`. Exports incl. `DirectXSetupA/W`,
  `DirectXRegisterApplicationA/W`, `DirectXSetupIsJapan`, `DirectXSetupIsJapanNec`,
  `DirectXSetupGetEULAA/W`.
- **DSETUP32.dll** (6 exports): the actual installer. 1.8 MB `.rsrc` = multilingual MS DirectX9
  EULA (37,143 strings, stock MS — omitted from JSON, count recorded). References
  `DirectX.cab`, `DXNT.cab`, `directX.inf`, `dxxp.inf`, and a Managed DirectX / .NET v1.0.3705 check.

Both DLLs contain **zero** LOGH-specific strings (verified: no `gineiden`/`銀河`/`G7`/`BOTHTEC`/
`Multiterm` hits) — their value here is the export/import API surface, documenting exactly how
G7Start bootstraps DirectX9.

## `setup` binary

Stock InstallShield bootstrapper (`setup.ini`, `engine32.cab`, `data1.cab`, `Disk1`,
`ISPackFiles.ini`) with multilingual InstallShield-Wizard error strings — no LOGH data tables.

## Reproduce

```bash
python tools/logh7_binary_data.py          # writes content/extracted/binary-data.json
python tools/logh7_binary_data.py --print   # + dump the curated highlights
```
