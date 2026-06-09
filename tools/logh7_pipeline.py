#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Final

from logh7_server_discovery import ServerDiscoverySource, discover_server


SECTOR_SIZE: Final = 2048
PVD_SECTOR: Final = 16
PVD_ROOT_RECORD_OFFSET: Final = 156

JsonValue = str | int | bool | None | list["JsonValue"] | dict[str, "JsonValue"]


@dataclass(frozen=True, slots=True)
class IsoEntry:
    path: str
    extent: int
    size: int
    is_directory: bool


@dataclass(frozen=True, slots=True)
class IsoImage:
    source: Path
    system_identifier: str
    volume_identifier: str
    entries: tuple[IsoEntry, ...]


class PipelineError(Exception):
    pass


class MissingSourceError(PipelineError):
    pass


class InvalidIsoError(PipelineError):
    pass


def _ascii_field(raw: bytes) -> str:
    return raw.decode("ascii", errors="replace").strip()


def _entry_name(raw: bytes) -> str:
    if raw == b"\x00":
        return "."
    if raw == b"\x01":
        return ".."
    name = raw.decode("ascii", errors="replace")
    return name.split(";")[0].lower()


def _read_record(record: bytes, base_path: str) -> IsoEntry:
    name_length = record[32]
    name = _entry_name(record[33 : 33 + name_length])
    path = name if not base_path else f"{base_path}/{name}"
    return IsoEntry(
        path=path,
        extent=int.from_bytes(record[2:6], "little"),
        size=int.from_bytes(record[10:14], "little"),
        is_directory=bool(record[25] & 0x02),
    )


def _directory_entries(data: bytes, base_path: str) -> tuple[IsoEntry, ...]:
    entries: list[IsoEntry] = []
    offset = 0
    while offset < len(data):
        record_length = data[offset]
        if record_length == 0:
            offset = ((offset // SECTOR_SIZE) + 1) * SECTOR_SIZE
            continue
        record = data[offset : offset + record_length]
        entry = _read_record(record, base_path)
        if entry.path not in {".", ".."} and not entry.path.endswith(("/.", "/..")):
            entries.append(entry)
        offset += record_length
    return tuple(entries)


def _read_extent(source: Path, extent: int, size: int) -> bytes:
    with source.open("rb") as handle:
        handle.seek(extent * SECTOR_SIZE)
        return handle.read(size)


def _read_extent_prefix(source: Path, extent: int, size: int, limit: int) -> bytes:
    with source.open("rb") as handle:
        handle.seek(extent * SECTOR_SIZE)
        return handle.read(min(size, limit))


def read_iso(source: Path) -> IsoImage:
    if not source.exists():
        raise MissingSourceError(f"{source} does not exist")

    with source.open("rb") as handle:
        handle.seek(PVD_SECTOR * SECTOR_SIZE)
        descriptor = handle.read(SECTOR_SIZE)

    if len(descriptor) != SECTOR_SIZE or descriptor[1:6] != b"CD001":
        raise InvalidIsoError(f"{source} is not a readable ISO 9660 image")

    root_record_length = descriptor[PVD_ROOT_RECORD_OFFSET]
    root_record = descriptor[PVD_ROOT_RECORD_OFFSET : PVD_ROOT_RECORD_OFFSET + root_record_length]
    root = _read_record(root_record, "")
    pending = list(_directory_entries(_read_extent(source, root.extent, root.size), ""))
    entries: list[IsoEntry] = []

    while pending:
        entry = pending.pop(0)
        entries.append(entry)
        if entry.is_directory:
            child_data = _read_extent(source, entry.extent, entry.size)
            pending.extend(_directory_entries(child_data, entry.path))

    return IsoImage(
        source=source,
        system_identifier=_ascii_field(descriptor[8:40]),
        volume_identifier=_ascii_field(descriptor[40:72]),
        entries=tuple(entries),
    )


def _read_file_bytes(image: IsoImage, path: str) -> bytes | None:
    wanted = path.lower()
    for entry in image.entries:
        if entry.path == wanted and not entry.is_directory:
            return _read_extent(image.source, entry.extent, entry.size)
    return None


def _parse_ini_fields(raw: bytes) -> dict[str, str]:
    text = raw.decode("cp932")
    fields: dict[str, str] = {}
    for line in text.splitlines():
        if "=" not in line:
            continue
        key, value = line.split("=", 1)
        fields[key.strip().lower()] = value.strip()
    return fields


def _cab_kind(raw: bytes) -> str:
    if raw.startswith(b"MSCF"):
        return "microsoft-cab"
    return "installshield-cab"


def _candidate_reason(path: str) -> str:
    if path == "setup.ini":
        return "CP932 InstallShield metadata contains Japanese product, company, and language fields."
    if path == "data1.hdr":
        return "InstallShield header names support, language, and payload groups before CAB extraction."
    if path == "setup.inx":
        return "InstallShield compiled script may contain installer UI strings and install flow logic."
    if path.endswith(".cab"):
        return "InstallShield CAB payload likely contains installed game resources; requires InstallShield-aware extraction."
    if path.endswith(".exe"):
        return "Windows executable may contain launcher strings, icons, or embedded resources."
    return "Candidate file may contain localizable text or patch metadata."


def build_manifest(image: IsoImage) -> dict[str, JsonValue]:
    setup_raw = _read_file_bytes(image, "setup.ini")
    setup_fields = _parse_ini_fields(setup_raw) if setup_raw is not None else {}
    cab_entries = []
    for entry in image.entries:
        if not entry.path.endswith(".cab") or entry.is_directory:
            continue
        raw = _read_extent_prefix(image.source, entry.extent, entry.size, 4)
        cab_entries.append(
            {
                "path": entry.path,
                "size": entry.size,
                "format": _cab_kind(raw),
                "standard_cab": raw.startswith(b"MSCF"),
            }
        )

    interesting_paths = {
        "setup.ini",
        "data1.hdr",
        "setup.inx",
        "data1.cab",
        "data2.cab",
        "g7start.exe",
    }
    candidates = [
        {"path": entry.path, "size": entry.size, "reason": _candidate_reason(entry.path)}
        for entry in image.entries
        if entry.path in interesting_paths
    ]

    return {
        "source": str(image.source),
        "volume": {
            "system": image.system_identifier,
            "identifier": image.volume_identifier,
        },
        "entries": [
            {"path": entry.path, "size": entry.size, "is_directory": entry.is_directory}
            for entry in image.entries
        ],
        "installer": {
            "setup_ini": {
                "encoding": "cp932" if setup_raw is not None else None,
                "app_name": setup_fields.get("appname"),
                "company_name": setup_fields.get("companyname"),
                "default_language": setup_fields.get("default"),
            },
            "cab_archives": cab_entries,
            "rebuild_note": "ISO root can be inspected without extraction; data*.cab uses InstallShield CAB layout when standard_cab is false.",
        },
        "localization_candidates": candidates,
        "patch_pipeline": [
            "Rebuild MODE2/2352 payload with tools/convert_mode2_bin_to_iso.py before inspection.",
            "Inspect ISO root and CP932 setup metadata with this manifest command.",
            "Use an InstallShield-aware extractor for data1.hdr/data*.cab before editing game resources.",
            "Preserve CP932/Japanese language assumptions until a target resource proves a different encoding.",
        ],
    }


def inspect_iso(source: Path, destination: Path) -> None:
    manifest = build_manifest(read_iso(source))
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {destination}")


def write_server_discovery(source: Path, destination: Path) -> None:
    image = read_iso(source)
    discovery = discover_server(
        ServerDiscoverySource(image_source=image.source, read_file_bytes=lambda path: _read_file_bytes(image, path))
    )
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(discovery, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {destination}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Inspect LOGH VII CD artifacts for localization work.")
    subparsers = parser.add_subparsers(dest="command", required=True)
    inspect_parser = subparsers.add_parser("inspect")
    inspect_parser.add_argument("iso", type=Path)
    inspect_parser.add_argument("--out", type=Path, required=True)
    server_parser = subparsers.add_parser("discover-server")
    server_parser.add_argument("iso", type=Path)
    server_parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()

    try:
        match args.command:
            case "inspect":
                inspect_iso(args.iso, args.out)
            case "discover-server":
                write_server_discovery(args.iso, args.out)
            case unreachable:
                raise InvalidIsoError(f"unsupported command: {unreachable}")
    except PipelineError as error:
        print(str(error), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
