from __future__ import annotations

import hashlib
import json
import struct
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True, slots=True)
class PeHeader:
    machine: int
    image_base: int
    entry_point: int
    subsystem: int


def write_pe_inventory(root: Path, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(build_pe_inventory(root), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def build_pe_inventory(root: Path) -> dict[str, object]:
    entries = [_entry(root, path) for path in _pe_paths(root)]
    return {
        "sourceRoot": str(root),
        "summary": {
            "peFiles": len(entries),
            "highPriority": sum(1 for entry in entries if entry["priority"] == "high"),
            "mediumPriority": sum(1 for entry in entries if entry["priority"] == "medium"),
            "lowPriority": sum(1 for entry in entries if entry["priority"] == "low"),
        },
        "peFiles": entries,
        "triageRule": (
            "prioritize the main game client first, then launch/update binaries that can rewrite config, "
            "select servers, or prepare the runtime; DirectX setup redistributables are compatibility inputs"
        ),
    }


def _pe_paths(root: Path) -> list[Path]:
    paths = [path for path in root.rglob("*") if path.suffix.lower() in {".exe", ".dll"}]
    return sorted(paths, key=lambda path: path.relative_to(root).as_posix().lower())


def _entry(root: Path, path: Path) -> dict[str, object]:
    raw = path.read_bytes()
    header = _parse_header(raw)
    rel = path.relative_to(root).as_posix()
    role, priority = _role_priority(rel)
    return {
        "path": rel,
        "extension": path.suffix.lower(),
        "size": len(raw),
        "sha256": hashlib.sha256(raw).hexdigest(),
        "machineHex": f"0x{header.machine:04x}",
        "imageBaseHex": f"0x{header.image_base:08x}",
        "entryPointHex": f"0x{header.entry_point:08x}",
        "subsystem": _subsystem_name(header.subsystem),
        "role": role,
        "priority": priority,
    }


def _parse_header(data: bytes) -> PeHeader:
    if len(data) < 0x40 or data[:2] != b"MZ":
        raise ValueError("PE inventory source is not a PE image")
    pe_offset = _u32(data, 0x3C)
    if len(data) < pe_offset + 0x78 or data[pe_offset : pe_offset + 4] != b"PE\0\0":
        raise ValueError("PE inventory source is not a PE image")
    optional = pe_offset + 24
    entry_rva = _u32(data, optional + 16)
    image_base = _u32(data, optional + 28)
    return PeHeader(
        machine=_u16(data, pe_offset + 4),
        image_base=image_base,
        entry_point=image_base + entry_rva,
        subsystem=_u16(data, optional + 68),
    )


def _role_priority(relative_path: str) -> tuple[str, str]:
    name = Path(relative_path).name.lower()
    if name == "g7mtclient.exe":
        return "main game client", "high"
    if name == "g7start.exe":
        return "launcher", "medium"
    if name == "gin7updateclient.exe":
        return "update client", "medium"
    if name in {"dsetup.dll", "dsetup32.dll"}:
        return "DirectX setup compatibility library", "low"
    if name == "bootfirst.exe":
        return "installer bootstrap helper", "low"
    return "support binary", "medium"


def _subsystem_name(value: int) -> str:
    match value:
        case 2:
            return "windows-gui"
        case 3:
            return "windows-console"
        case _:
            return f"unknown-{value}"


def _u16(data: bytes, offset: int) -> int:
    return struct.unpack_from("<H", data, offset)[0]


def _u32(data: bytes, offset: int) -> int:
    return struct.unpack_from("<I", data, offset)[0]
