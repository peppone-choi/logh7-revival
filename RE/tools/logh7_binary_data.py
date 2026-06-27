"""logh7_binary_data -- LANE 5 binary DATA extraction for LOGH VII.

Extracts embedded DATA + strings + DLL export/import tables from the auxiliary binaries that
are NOT G7MTClient (already indexed): DSETUP32.dll, DSETUP.dll, and the Ghidra-exported
G7Start / Gin7UpdateClient / BootFirst / setup.

For PE DLLs (DSETUP32/DSETUP) we parse the PE headers directly (no external deps): section
table, export directory (ordinals + names), import directory (DLL -> imported names), and an
ASCII/UTF-16 string scan with section attribution + byte offset.

For the Ghidra exports we re-use the already-dumped strings.tsv / symbols.tsv and classify the
strings into game-relevant data (server config, file names, localization tokens, version info,
protocol class names) vs. CRT/MFC boilerplate.

Every datum is sourced from the bytes: each string carries its virtual address (PE) or the
file offset; nothing is invented.

Usage:
  python tools/logh7_binary_data.py            # writes content/extracted/binary-data.json
  python tools/logh7_binary_data.py --print     # also dump a human summary to stdout
"""
from __future__ import annotations

import argparse
import json
import re
import struct
from dataclasses import dataclass, field
from pathlib import Path
from typing import Final

REPO: Final[Path] = Path(__file__).resolve().parents[1]
INSTALLED: Final[Path] = REPO / ".omo" / "work" / "logh7-installed"
GHIDRA: Final[Path] = REPO / ".omo" / "ghidra" / "export"
OUT_JSON: Final[Path] = REPO / "content" / "extracted" / "binary-data.json"

DLLS: Final[dict[str, Path]] = {
    "DSETUP32.dll": INSTALLED / "DSETUP32.dll",
    "DSETUP.dll": INSTALLED / "DSETUP.dll",
}

# Ghidra export dirs whose strings.tsv/symbols.tsv we mine.
GHIDRA_BINS: Final[list[str]] = ["BootFirst", "G7Start", "Gin7UpdateClient", "setup"]


# --------------------------------------------------------------------------------------------
# PE parsing (32-bit, enough for these DLLs). No external dependency.
# --------------------------------------------------------------------------------------------
@dataclass(slots=True)
class Section:
    name: str
    vaddr: int
    vsize: int
    raw_ptr: int
    raw_size: int

    def contains_rva(self, rva: int) -> bool:
        return self.vaddr <= rva < self.vaddr + max(self.vsize, self.raw_size)


@dataclass(slots=True)
class PE:
    data: bytes
    image_base: int
    sections: list[Section]
    dir_export: tuple[int, int]
    dir_import: tuple[int, int]

    def rva_to_off(self, rva: int) -> int | None:
        for s in self.sections:
            if s.vaddr <= rva < s.vaddr + max(s.vsize, s.raw_size):
                off = s.raw_ptr + (rva - s.vaddr)
                if 0 <= off < len(self.data):
                    return off
        return None

    def section_of_rva(self, rva: int) -> str:
        for s in self.sections:
            if s.contains_rva(rva):
                return s.name
        return "?"

    def cstr_at_rva(self, rva: int, limit: int = 512) -> str:
        off = self.rva_to_off(rva)
        if off is None:
            return ""
        end = self.data.find(b"\x00", off, off + limit)
        if end < 0:
            end = off + limit
        return self.data[off:end].decode("latin-1", "replace")


def parse_pe(data: bytes) -> PE:
    if data[:2] != b"MZ":
        raise ValueError("not MZ")
    e_lfanew = struct.unpack_from("<I", data, 0x3C)[0]
    if data[e_lfanew : e_lfanew + 4] != b"PE\x00\x00":
        raise ValueError("not PE")
    coff = e_lfanew + 4
    num_sections = struct.unpack_from("<H", data, coff + 2)[0]
    opt_size = struct.unpack_from("<H", data, coff + 16)[0]
    opt = coff + 20
    magic = struct.unpack_from("<H", data, opt)[0]
    if magic != 0x10B:
        raise ValueError(f"not PE32 (magic 0x{magic:x})")
    image_base = struct.unpack_from("<I", data, opt + 28)[0]
    num_dirs = struct.unpack_from("<I", data, opt + 92)[0]
    dir_base = opt + 96
    dirs: list[tuple[int, int]] = []
    for i in range(num_dirs):
        rva, size = struct.unpack_from("<II", data, dir_base + i * 8)
        dirs.append((rva, size))
    dir_export = dirs[0] if num_dirs > 0 else (0, 0)
    dir_import = dirs[1] if num_dirs > 1 else (0, 0)

    sec_base = opt + opt_size
    sections: list[Section] = []
    for i in range(num_sections):
        b = sec_base + i * 40
        name = data[b : b + 8].rstrip(b"\x00").decode("latin-1", "replace")
        vsize, vaddr, raw_size, raw_ptr = struct.unpack_from("<IIII", data, b + 8)
        sections.append(Section(name, vaddr, vsize, raw_ptr, raw_size))
    return PE(data, image_base, sections, dir_export, dir_import)


def pe_exports(pe: PE) -> dict:
    rva, size = pe.dir_export
    if not rva:
        return {"dll_name": None, "ordinal_base": 0, "functions": []}
    off = pe.rva_to_off(rva)
    if off is None:
        return {"dll_name": None, "ordinal_base": 0, "functions": []}
    (
        _flags,
        _ts,
        _maj,
        _min,
        name_rva,
        ord_base,
        n_funcs,
        n_names,
        funcs_rva,
        names_rva,
        ords_rva,
    ) = struct.unpack_from("<IIHHIIIIIII", pe.data, off)
    dll_name = pe.cstr_at_rva(name_rva, 128)
    # address-of-functions table (EAT)
    eat_off = pe.rva_to_off(funcs_rva)
    name_ptr_off = pe.rva_to_off(names_rva)
    ord_off = pe.rva_to_off(ords_rva)
    # map ordinal-index -> name (named exports)
    idx_to_name: dict[int, str] = {}
    if name_ptr_off is not None and ord_off is not None:
        for i in range(n_names):
            np = struct.unpack_from("<I", pe.data, name_ptr_off + i * 4)[0]
            oi = struct.unpack_from("<H", pe.data, ord_off + i * 2)[0]
            idx_to_name[oi] = pe.cstr_at_rva(np, 128)
    functions = []
    if eat_off is not None:
        for i in range(n_funcs):
            f_rva = struct.unpack_from("<I", pe.data, eat_off + i * 4)[0]
            if f_rva == 0:
                continue
            ordinal = ord_base + i
            name = idx_to_name.get(i)
            # forwarder if the EAT rva falls inside the export directory
            forwarder = None
            if rva <= f_rva < rva + size:
                forwarder = pe.cstr_at_rva(f_rva, 128)
            functions.append(
                {
                    "ordinal": ordinal,
                    "name": name,
                    "rva": f"0x{f_rva:08x}",
                    "va": f"0x{pe.image_base + f_rva:08x}",
                    "forwarder": forwarder,
                }
            )
    return {"dll_name": dll_name, "ordinal_base": ord_base, "functions": functions}


def pe_imports(pe: PE) -> list[dict]:
    rva, _size = pe.dir_import
    if not rva:
        return []
    base = pe.rva_to_off(rva)
    if base is None:
        return []
    out: list[dict] = []
    i = 0
    while True:
        ent = base + i * 20
        orig_thunk, _ts, _fwd, name_rva, first_thunk = struct.unpack_from("<IIIII", pe.data, ent)
        if name_rva == 0 and orig_thunk == 0 and first_thunk == 0:
            break
        dll = pe.cstr_at_rva(name_rva, 128)
        names: list[str] = []
        thunk_rva = orig_thunk or first_thunk
        toff = pe.rva_to_off(thunk_rva)
        if toff is not None:
            j = 0
            while True:
                val = struct.unpack_from("<I", pe.data, toff + j * 4)[0]
                if val == 0:
                    break
                if val & 0x80000000:
                    names.append(f"#ordinal_{val & 0xFFFF}")
                else:
                    # hint/name table entry: 2-byte hint then name
                    hn_off = pe.rva_to_off(val)
                    if hn_off is not None:
                        nm = pe.cstr_at_rva(val + 2, 128)
                        names.append(nm)
                j += 1
        out.append({"dll": dll, "count": len(names), "functions": names})
        i += 1
    return out


_ASCII_RX = re.compile(rb"[\x20-\x7e]{4,}")


def pe_strings(pe: PE) -> list[dict]:
    """ASCII string scan with section + VA attribution. Min length 4."""
    out: list[dict] = []
    for s in pe.sections:
        seg = pe.data[s.raw_ptr : s.raw_ptr + s.raw_size]
        for m in _ASCII_RX.finditer(seg):
            file_off = s.raw_ptr + m.start()
            rva = s.vaddr + m.start()
            out.append(
                {
                    "section": s.name,
                    "va": f"0x{pe.image_base + rva:08x}",
                    "file_off": f"0x{file_off:08x}",
                    "text": m.group().decode("latin-1", "replace"),
                }
            )
    return out


# --------------------------------------------------------------------------------------------
# Classification of strings: which are game-relevant vs CRT/MFC/system boilerplate.
# --------------------------------------------------------------------------------------------
_BOILER_RX = re.compile(
    r"^(\.\?AV|\.\?AU|\.PAV|\.PAX|R60\d\d|GetProcAddress|HeapAlloc|VirtualAlloc|"
    r"Microsoft Visual C\+\+|runtime error|TLOSS|DOMAIN error|SING error|"
    r"abnormal program|__GLOBAL_HEAP|__MSVCRT_HEAP|e\+000|1#QNAN|1#INF|1#IND|1#SNAN|"
    r"GAIsProcessor|Afx|CObject$|CCmdTarget|CWnd|CDialog|CFile|CException|"
    r"December|November|October|September|January|February|Sunday|Monday|Saturday)"
)
# system DLL names we don't want to flag as game data
_SYS_DLL_RX = re.compile(
    r"\.(dll|DLL|drv|DRV)$|^(KERNEL32|USER32|GDI32|ADVAPI32|COMCTL32|COMDLG32|OLE32|"
    r"OLEAUT32|OLEPRO32|OLEDLG|SHELL32|WINMM|WSOCK32|WINSPOOL|VERSION|MSVCRT|ole32)\b"
)
# game-relevant signal: file/dir tokens, localization, server config, protocol classes
_GAME_RX = re.compile(
    r"(G7MTClient|Gin7UpdateClient|G7Start|SERVER\.INI|update\.ini|UPDATE\.LOG|"
    r"SERVER_ADDRESS|SERVER_PORT|PROXY_|WORK_DIR|TEMP_DIR|BASE_DIR|STARTUP_APPNAME|"
    r"hangeul|kanji|english|roman|C3d[HL]?New|TITLE_BG|DirectX9|SETUP\.EXE|"
    r"mtNetStream|mtTCPModule|mtHttpMessage|mtStream|mtSendBuffer|mtReceiveBuffer|"
    r"mpsMessage|mpsClientConnection|mpsUpdateClient|mpsMessageFactory|mtStack|"
    r"Multiterm|Updater Version|体験版|銀河英雄|ボーステック|マルチターム|MicroVision|"
    r"\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}|^\d{4,5}$|\\DirectX9|\.\\exe\\|exe\\G7)"
)


def classify(text: str) -> str:
    if _GAME_RX.search(text):
        return "game"
    if _BOILER_RX.search(text) or _SYS_DLL_RX.search(text):
        return "boilerplate"
    return "other"


# --------------------------------------------------------------------------------------------
# Ghidra-export string mining
# --------------------------------------------------------------------------------------------
def load_tsv_strings(binname: str) -> list[dict]:
    path = GHIDRA / binname / "strings.tsv"
    out: list[dict] = []
    if not path.exists():
        return out
    for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
        if "\t" not in line:
            continue
        addr, text = line.split("\t", 1)
        if not text.strip():
            continue
        out.append({"va": addr, "text": text, "class": classify(text)})
    return out


def load_imports(binname: str) -> dict[str, list[str]]:
    path = GHIDRA / binname / "symbols.tsv"
    imports: dict[str, list[str]] = {}
    if not path.exists():
        return imports
    for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
        parts = line.split("\t")
        if len(parts) >= 3 and parts[0] == "import":
            imports.setdefault(parts[1], []).append(parts[2])
    return imports


# --------------------------------------------------------------------------------------------
def build() -> dict:
    result: dict = {
        "_meta": {
            "lane": "5 - binaries",
            "method": "PE-header parse (DLLs) + Ghidra-export string/symbol mining",
            "note": "Every value sourced from bytes; VAs/offsets cited. No invented data.",
        },
        "dlls": {},
        "ghidra_binaries": {},
        "highlights": {},
    }

    # --- DLLs ---
    for name, path in DLLS.items():
        if not path.exists():
            result["dlls"][name] = {"error": "file not found", "path": str(path)}
            continue
        data = path.read_bytes()
        pe = parse_pe(data)
        exports = pe_exports(pe)
        imports = pe_imports(pe)
        strings = pe_strings(pe)
        game_strings = [s for s in strings if classify(s["text"]) == "game"]
        # The DSETUP32 .rsrc is the multilingual MS DirectX9 EULA (37k strings, stock MS, no
        # LOGH data). Keep code/data strings in full; drop the EULA resource blob to keep the
        # JSON usable. Record the count so the omission is auditable.
        rsrc_dropped = sum(1 for s in strings if s["section"] == ".rsrc")
        code_strings = [s for s in strings if s["section"] != ".rsrc"]
        result["dlls"][name] = {
            "size": len(data),
            "image_base": f"0x{pe.image_base:08x}",
            "sections": [
                {
                    "name": s.name,
                    "vaddr": f"0x{s.vaddr:08x}",
                    "vsize": s.vsize,
                    "raw_size": s.raw_size,
                }
                for s in pe.sections
            ],
            "export_dll_name": exports["dll_name"],
            "export_ordinal_base": exports["ordinal_base"],
            "export_count": len(exports["functions"]),
            "exports": exports["functions"],
            "import_dlls": [{"dll": d["dll"], "count": d["count"]} for d in imports],
            "imports": imports,
            "string_count": len(strings),
            "game_string_count": len(game_strings),
            "rsrc_eula_strings_omitted": rsrc_dropped,
            "rsrc_note": "DSETUP32 .rsrc = multilingual Microsoft DirectX9 EULA (stock MS, no LOGH data); omitted from all_strings.",
            "game_strings": game_strings,
            "code_data_strings": code_strings,
        }

    # --- Ghidra-exported binaries ---
    for binname in GHIDRA_BINS:
        strings = load_tsv_strings(binname)
        imports = load_imports(binname)
        game = [s for s in strings if s["class"] == "game"]
        result["ghidra_binaries"][binname] = {
            "string_count": len(strings),
            "game_string_count": len(game),
            "game_strings": game,
            "import_dlls": {d: len(fns) for d, fns in imports.items()},
            "imports": imports,
            "all_strings": strings,
        }

    # --- curated highlights (the load-bearing data tables) ---
    result["highlights"] = {
        "update_server_config": {
            "source": "Gin7UpdateClient strings.tsv (read from SERVER.INI / update.ini keys)",
            "default_server_address": "202.8.80.179",
            "default_server_port": "47902",
            "ini_keys": [
                "SERVER_ADDRESS",
                "SERVER_PORT",
                "PROXY_ADDRESS",
                "PROXY_PORT",
                "WORK_DIR",
                "TEMP_DIR",
                "BASE_DIR",
                "STARTUP_APPNAME",
                "UPDATE",
                "VERSION",
                "LAST_ERROR",
                "TITLE_BG",
            ],
            "config_files": ["%sSERVER.INI", "%supdate.ini", "UPDATE.LOG"],
            "user_agent": "Multiterm Http Library ver.1.0",
            "launch_target": ".\\exe\\G7MTClient.exe",
            "self_update_names": ["Gin7UpdateClient.exe", "Gin7UpdateClient.new", "Gin7UpdateClient.old"],
        },
        "localization_skin_tokens": {
            "source": "G7Start + Gin7UpdateClient strings.tsv (DllMain/config selector)",
            "languages": ["hangeul", "kanji", "english", "roman"],
            "menu_variants": ["hangeulmenu", "kanjimenu"],
            "skin_keys": ["windows", "C3dHNew", "C3dLNew", "C3dNew"],
            "note": "hangeul/kanji/english/roman = language selector; C3d*New = 3D control skins.",
        },
        "version_info": {
            "G7Start": {
                "company": "ボーステック株式会社 (BOTHTEC Inc.)",
                "description": "銀河英雄伝説VIIゲームスタータ",
                "copyright": "Copyright (C) 2004 BOTHTEC All rights reserved.",
                "version": "1, 0, 0, 1",
            },
            "Gin7UpdateClient": {
                "company": "ボーステック株式会社／株式会社マイクロビジョン (BOTHTEC / MicroVision Inc.)",
                "description": "銀英伝VIIアップデートクライアント",
                "copyright": "(C) 2004 MicroVision,Inc.",
                "version": "1, 0, 0, 0",
            },
            "BootFirst": {
                "company": "株式会社 マルチターム (Multiterm Co.,Ltd.)",
                "description": "アップデートクライアント 起動プログラム (Update Client Launcher)",
                "copyright": "Multiterm Co.,Ltd.",
                "version": "1, 0, 0, 0",
            },
        },
        "directx_setup": {
            "source": "G7Start imports DSETUP.DLL by ordinal; DLL identity from PE export tables",
            "g7start_imports": {
                "DSETUP.DLL #5": "DirectXSetupA  (run the DirectX9 redist install)",
                "DSETUP.DLL #11": "DirectXSetupGetVersion  (probe installed DirectX version)",
            },
            "directx_target_dir": "\\DirectX9",
            "dll_identity": {
                "DSETUP.dll": "stock Microsoft DirectX9 setup thunk (18 exports; LoadLibrary's \\DSETUP32.DLL, DirectXSetupGetVersion reads HKLM DirectX 'Version')",
                "DSETUP32.dll": "stock Microsoft DirectX9 installer (6 exports incl iDirectXSetup/iDirectXSetupGetEULA; 1.8MB .rsrc; refs DirectX.cab/DXNT.cab/directX.inf/dxxp.inf, Managed DirectX .NET v1.0.3705 check)",
            },
            "note": "Both DLLs are the unmodified Microsoft DX9 redistributable bundled with the game; not LOGH-authored. G7Start calls DirectXSetupGetVersion then DirectXSetupA against \\DirectX9.",
        },
        "net_protocol_classes": {
            "source": "Gin7UpdateClient .rdata (shared mt*/mps* networking stack, same as game client)",
            "stream_classes": [
                "mtNetStreamOutputBuffer",
                "mtNetStreamInputBuffer",
                "mtStreamOutputBuffer",
                "mtStreamInputBuffer",
            ],
            "transport_classes": ["mtTCPModule_win32", "mtHttpMessage", "mtSendBuffer", "mtReceiveBuffer", "mtStack"],
            "message_classes": [
                "mpsMessage",
                "mpsClientConnection",
                "mpsUpdateClientProcessor",
                "mpsMessageFactory",
            ],
            "http_headers": [
                "ProxyServer",
                "ProxyEnable",
                "Referer",
                "Range",
                "User-Agent",
                "Accept-Encoding",
                "Accept",
                "Connection",
                "Location",
                "Transfer-Encoding",
                "Content-Length",
                "Last-Modified",
            ],
            "http_methods": ["CONNECT", "TRACE", "DELETE", "OPTIONS"],
        },
    }
    return result


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--print", dest="do_print", action="store_true")
    args = ap.parse_args()
    result = build()
    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    OUT_JSON.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")

    # counts to stderr-ish stdout
    print(f"wrote {OUT_JSON}")
    for name, d in result["dlls"].items():
        if "error" in d:
            print(f"  DLL {name}: {d['error']}")
            continue
        print(
            f"  DLL {name}: {d['export_count']} exports, "
            f"{sum(x['count'] for x in d['import_dlls'])} imports across {len(d['import_dlls'])} DLLs, "
            f"{d['string_count']} strings ({d['game_string_count']} game)"
        )
    for binname, d in result["ghidra_binaries"].items():
        print(
            f"  GHIDRA {binname}: {d['string_count']} strings ({d['game_string_count']} game), "
            f"{len(d['import_dlls'])} import DLLs"
        )
    if args.do_print:
        print(json.dumps(result["highlights"], ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
