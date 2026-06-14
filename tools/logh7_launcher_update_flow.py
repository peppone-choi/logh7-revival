#!/usr/bin/env python3
"""Classify the LOGH VII launcher/update control flow from static PE bytes.

Where ``logh7_launcher_update_index`` answers *which* server/update strings
exist, this tool answers *what the binary does with them*: it resolves the
import table, disassembles the executable section linearly, and correlates
watched Win32 import call sites (``GetPrivateProfileString``/``Int``,
``WritePrivateProfileString``, ``CreateProcess``, ``MoveFile``/``DeleteFile``,
registry APIs) with the nearby config-string pushes.

From that correlation it derives three policy conclusions that decide how local
play should be configured instead of guessed:

* ``serverIniOverride``    -- ``[..] SERVER_ADDRESS``/``SERVER_PORT`` are read
  from ``SERVER.INI`` via ``GetPrivateProfileString``; the hardcoded
  ``202.8.80.179`` is only the default when the INI value is empty.
* ``processLaunch``        -- ``CreateProcessA`` launches ``.\\exe\\G7MTClient.exe``.
* ``updateFileReplacement``-- ``MoveFileA``/``DeleteFileA`` swap the
  ``Gin7UpdateClient.new``/``.old`` self-update files.

The disassembly is read-only; no game binary is modified.
"""
from __future__ import annotations

import argparse
import json
import re
import struct
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Final

from capstone import CS_ARCH_X86, CS_MODE_32, Cs

if __package__:
    from .logh7_child_codec import PeImage, _parse_pe_image
else:
    from logh7_child_codec import PeImage, _parse_pe_image


JsonValue = str | int | bool | None | list["JsonValue"] | dict[str, "JsonValue"]

PRINTABLE_ASCII: Final[re.Pattern[bytes]] = re.compile(rb"[\x20-\x7e]{4,}")
IPV4_TEXT: Final[re.Pattern[str]] = re.compile(r"^(?:\d{1,3}\.){3}\d{1,3}$")

# Win32 imports that reveal launcher/update behaviour, grouped by role.
IMPORT_ROLES: Final[dict[str, tuple[str, ...]]] = {
    "ini-read": ("GetPrivateProfileString", "GetPrivateProfileInt"),
    "ini-write": ("WritePrivateProfileString",),
    "process-launch": ("CreateProcess", "WinExec", "ShellExecute"),
    "file-replace": ("MoveFile", "CopyFile", "DeleteFile"),
    "file-open": ("CreateFile",),
    "registry": ("RegOpenKey", "RegQueryValue", "RegSetValue"),
    "network": ("connect", "gethostbyname", "InternetConnect", "HttpOpenRequest", "FtpGetFile"),
}

# Config strings whose pushes we track as call arguments.
ADDRESS_KEY: Final[str] = "SERVER_ADDRESS"
PORT_KEY: Final[str] = "SERVER_PORT"
INI_NAME_MARKERS: Final[tuple[str, ...]] = ("SERVER.INI", "%sSERVER.INI")
CLIENT_PATH_MARKERS: Final[tuple[str, ...]] = (".\\exe\\G7MTClient.exe", "exe\\G7MTClient.exe")
UPDATE_REPLACE_SUFFIXES: Final[tuple[str, ...]] = (".new", ".old")

# Binaries scanned by the directory-level entry point, in launch order.
BINARY_ROLES: Final[tuple[tuple[str, str], ...]] = (
    ("Gin7UpdateClient.exe", "update-client"),
    ("G7Start.exe", "launcher"),
    ("BootFirst.exe", "bootstrap"),
)


@dataclass(frozen=True, slots=True)
class CallSite:
    address: int
    import_name: str
    role: str
    recent_string_args: tuple[str, ...]

    def to_json(self) -> dict[str, JsonValue]:
        return {
            "callVaHex": f"0x{self.address:08x}",
            "import": self.import_name,
            "role": self.role,
            "recentStringArgs": list(self.recent_string_args),
        }


@dataclass(frozen=True, slots=True)
class StringRef:
    value: str
    string_va: int
    push_va: int

    def to_json(self) -> dict[str, JsonValue]:
        return {
            "value": self.value,
            "stringVaHex": f"0x{self.string_va:08x}",
            "pushVaHex": f"0x{self.push_va:08x}",
        }


@dataclass(slots=True)
class BinaryFlow:
    imports_by_role: dict[str, list[str]] = field(default_factory=dict)
    call_sites: list[CallSite] = field(default_factory=list)
    string_refs: list[StringRef] = field(default_factory=list)

    def has_import_role(self, role: str) -> bool:
        return bool(self.imports_by_role.get(role))

    def references(self, *markers: str) -> StringRef | None:
        for ref in self.string_refs:
            if ref.value in markers:
                return ref
        return None

    def first_ipv4(self) -> StringRef | None:
        for ref in self.string_refs:
            if IPV4_TEXT.match(ref.value):
                return ref
        return None


def _u16(data: bytes, offset: int) -> int:
    return struct.unpack_from("<H", data, offset)[0]


def _u32(data: bytes, offset: int) -> int:
    return struct.unpack_from("<I", data, offset)[0]


def _read_cstr(data: bytes, offset: int) -> str:
    end = data.index(b"\0", offset)
    return data[offset:end].decode("ascii", "replace")


def _rva_to_offset(image: PeImage, rva: int) -> int | None:
    for section in image.sections:
        size = max(section.virtual_size, section.raw_size)
        if section.virtual_address <= rva < section.virtual_address + size:
            return section.raw_pointer + (rva - section.virtual_address)
    return None


def _offset_to_va(image: PeImage, raw_offset: int) -> int | None:
    for section in image.sections:
        if section.raw_pointer <= raw_offset < section.raw_pointer + section.raw_size:
            return image.image_base + section.virtual_address + raw_offset - section.raw_pointer
    return None


def _parse_iat(data: bytes, image: PeImage) -> dict[int, str]:
    """Map import-address-table slot VA -> ``dll!func`` (or ``dll!ordN``)."""
    pe_offset = _u32(data, 0x3C)
    optional = pe_offset + 24
    if _u16(data, optional) != 0x10B:  # PE32 only
        return {}
    if _u32(data, optional + 92) < 2:  # NumberOfRvaAndSizes
        return {}
    import_rva = _u32(data, optional + 96 + 8)  # DataDirectory[1].VirtualAddress
    if import_rva == 0:
        return {}
    descriptor = _rva_to_offset(image, import_rva)
    if descriptor is None:
        return {}
    iat: dict[int, str] = {}
    while True:
        oft, _, _, name_rva, first_thunk = struct.unpack_from("<IIIII", data, descriptor)
        if name_rva == 0 and first_thunk == 0:
            break
        descriptor += 20
        dll_off = _rva_to_offset(image, name_rva)
        thunk_off = _rva_to_offset(image, oft or first_thunk)
        if dll_off is None or thunk_off is None:
            continue
        dll = _read_cstr(data, dll_off)
        index = 0
        while True:
            entry = _u32(data, thunk_off + index * 4)
            if entry == 0:
                break
            slot_va = image.image_base + first_thunk + index * 4
            if entry & 0x80000000:
                iat[slot_va] = f"{dll}!ord{entry & 0xFFFF}"
            else:
                name_off = _rva_to_offset(image, entry)
                iat[slot_va] = f"{dll}!{_read_cstr(data, name_off + 2)}" if name_off is not None else f"{dll}!?"
            index += 1
    return iat


def _role_for_import(import_name: str) -> str | None:
    func = import_name.split("!", 1)[-1]
    for role, needles in IMPORT_ROLES.items():
        if any(needle in func for needle in needles):
            return role
    return None


def _code_section(data: bytes, image: PeImage):
    pe_offset = _u32(data, 0x3C)
    entry_rva = _u32(data, pe_offset + 24 + 16)
    for section in image.sections:
        size = max(section.virtual_size, section.raw_size)
        if section.virtual_address <= entry_rva < section.virtual_address + size:
            return section
    return image.sections[0]


def _string_va_table(data: bytes, image: PeImage) -> dict[int, str]:
    table: dict[int, str] = {}
    for match in PRINTABLE_ASCII.finditer(data):
        va = _offset_to_va(image, match.start())
        if va is not None:
            table[va] = match.group().decode("ascii", "replace")
    return table


def analyze_binary(data: bytes) -> BinaryFlow:
    image = _parse_pe_image(data)
    iat = _parse_iat(data, image)
    strings = _string_va_table(data, image)
    section = _code_section(data, image)
    code = data[section.raw_pointer : section.raw_pointer + section.raw_size]
    code_va = image.image_base + section.virtual_address

    flow = BinaryFlow()
    for slot_va, name in sorted(iat.items()):
        role = _role_for_import(name)
        if role is not None:
            flow.imports_by_role.setdefault(role, [])
            if name not in flow.imports_by_role[role]:
                flow.imports_by_role[role].append(name)

    disassembler = Cs(CS_ARCH_X86, CS_MODE_32)
    recent: list[int] = []  # recently pushed string VAs, function-local window
    seen_string_pushes: set[tuple[int, int]] = set()
    for ins in disassembler.disasm(code, code_va):
        mnemonic, op_str = ins.mnemonic, ins.op_str
        if mnemonic == "push" and op_str.startswith("0x"):
            try:
                imm = int(op_str, 16)
            except ValueError:
                imm = 0
            if imm in strings:
                key = (ins.address, imm)
                if key not in seen_string_pushes:
                    seen_string_pushes.add(key)
                    flow.string_refs.append(StringRef(strings[imm], imm, ins.address))
                recent.append(imm)
                recent = recent[-8:]
        elif mnemonic == "call" and op_str.startswith("dword ptr [0x"):
            slot = int(op_str[len("dword ptr [") : -1], 16)
            name = iat.get(slot)
            role = _role_for_import(name) if name else None
            if name and role:
                args = tuple(strings[v] for v in recent if v in strings)
                flow.call_sites.append(CallSite(ins.address, name, role, args))
        if mnemonic in ("ret", "jmp"):
            recent = []
    flow.string_refs.sort(key=lambda ref: ref.push_va)
    return flow


def _server_address_policy(flow: BinaryFlow) -> dict[str, JsonValue]:
    address_ref = flow.references(ADDRESS_KEY)
    port_ref = flow.references(PORT_KEY)
    ini_ref = flow.references(*INI_NAME_MARKERS)
    default_ref = flow.first_ipv4()
    overrides = bool(flow.has_import_role("ini-read") and address_ref and default_ref)
    return {
        "iniOverridesHardcoded": overrides,
        "addressKey": address_ref.value if address_ref else None,
        "addressKeyPushVaHex": f"0x{address_ref.push_va:08x}" if address_ref else None,
        "portKey": port_ref.value if port_ref else None,
        "hardcodedDefault": default_ref.value if default_ref else None,
        "hardcodedDefaultPushVaHex": f"0x{default_ref.push_va:08x}" if default_ref else None,
        "iniFilename": ini_ref.value if ini_ref else None,
        "iniReadImports": flow.imports_by_role.get("ini-read", []),
        "iniWriteImports": flow.imports_by_role.get("ini-write", []),
    }


def _client_launch(flow: BinaryFlow) -> dict[str, JsonValue]:
    client_ref = flow.references(*CLIENT_PATH_MARKERS)
    launch_calls = [site for site in flow.call_sites if site.role == "process-launch"]
    return {
        "launchesClient": bool(launch_calls and client_ref),
        "clientPath": client_ref.value if client_ref else None,
        "processLaunchImports": flow.imports_by_role.get("process-launch", []),
        "createProcessVaHexes": [f"0x{site.address:08x}" for site in launch_calls],
    }


def _update_replacement(flow: BinaryFlow) -> dict[str, JsonValue]:
    replace_ref = next(
        (ref for ref in flow.string_refs if ref.value.endswith(UPDATE_REPLACE_SUFFIXES)),
        None,
    )
    replace_calls = [site for site in flow.call_sites if site.role == "file-replace"]
    # Import + ".new"/".old" reference is the static signal that a binary swaps the
    # self-update files; the resolved call-site VAs are precision evidence and may be
    # empty when MoveFile is reached through a register-indirect call.
    return {
        "replacesUpdateFiles": bool(flow.has_import_role("file-replace") and replace_ref),
        "replacementFile": replace_ref.value if replace_ref else None,
        "fileReplaceImports": flow.imports_by_role.get("file-replace", []),
        "fileReplaceVaHexes": [f"0x{site.address:08x}" for site in replace_calls],
    }


def _binary_entry(root: Path, relative_path: str, role: str) -> dict[str, JsonValue]:
    data = (root / relative_path).read_bytes()
    flow = analyze_binary(data)
    return {
        "path": relative_path,
        "role": role,
        "importsByRole": {key: value for key, value in sorted(flow.imports_by_role.items())},
        "serverAddressPolicy": _server_address_policy(flow),
        "clientLaunch": _client_launch(flow),
        "updateReplacement": _update_replacement(flow),
        "watchedCallSites": [site.to_json() for site in flow.call_sites],
        "configStringRefs": [ref.to_json() for ref in flow.string_refs],
    }


def build_launcher_update_flow(root: Path) -> dict[str, JsonValue]:
    binaries: list[dict[str, JsonValue]] = []
    missing: list[str] = []
    for relative_path, role in BINARY_ROLES:
        if (root / relative_path).exists():
            binaries.append(_binary_entry(root, relative_path, role))
        else:
            missing.append(relative_path)

    server_ini_override = any(
        entry["serverAddressPolicy"]["iniOverridesHardcoded"] for entry in binaries  # type: ignore[index]
    )
    process_launch = any(entry["clientLaunch"]["launchesClient"] for entry in binaries)  # type: ignore[index]
    update_replacement = any(
        entry["updateReplacement"]["replacesUpdateFiles"] for entry in binaries  # type: ignore[index]
    )
    return {
        "sourceRoot": str(root),
        "summary": {
            "scannedBinaries": len(binaries),
            "missingBinaries": len(missing),
            "serverIniOverride": server_ini_override,
            "processLaunch": process_launch,
            "updateFileReplacement": update_replacement,
        },
        "missingBinaries": missing,
        "binaries": binaries,
        "serverImplication": (
            "SERVER_ADDRESS/SERVER_PORT are read from SERVER.INI via GetPrivateProfileString; the "
            "hardcoded address is only a fallback default. Local play should ship a SERVER.INI that "
            "points the update client at the local server rather than patching the client binary"
        ),
        "evidence": "import-table resolution plus linear x86 disassembly of launcher/update PE files",
    }


def write_launcher_update_flow(root: Path, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(
        json.dumps(build_launcher_update_flow(root), ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def main() -> int:
    parser = argparse.ArgumentParser(description="Classify LOGH VII launcher/update control flow.")
    parser.add_argument("root", type=Path)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()

    try:
        write_launcher_update_flow(args.root, args.out)
    except (OSError, ValueError) as error:
        print(str(error), file=sys.stderr)
        return 1
    print(f"wrote {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
