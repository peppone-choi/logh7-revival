#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from logh7_iso import InvalidIsoError, IsoImage, PipelineError, read_extent_prefix, read_file_bytes, read_iso
from logh7_packager import PackageError, package_installed_tree
from logh7_server_discovery import ServerDiscoverySource, discover_server


JsonValue = str | int | bool | None | list["JsonValue"] | dict[str, "JsonValue"]


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
    setup_raw = read_file_bytes(image, "setup.ini")
    setup_fields = _parse_ini_fields(setup_raw) if setup_raw is not None else {}
    cab_entries = []
    for entry in image.entries:
        if not entry.path.endswith(".cab") or entry.is_directory:
            continue
        raw = read_extent_prefix(image.source, entry.extent, entry.size, 4)
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
        ServerDiscoverySource(image_source=image.source, read_file_bytes=lambda path: read_file_bytes(image, path))
    )
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(discovery, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {destination}")


def _add_inspect_parser(subparsers: argparse._SubParsersAction[argparse.ArgumentParser]) -> None:
    inspect_parser = subparsers.add_parser("inspect")
    inspect_parser.add_argument("iso", type=Path)
    inspect_parser.add_argument("--out", type=Path, required=True)


def _add_server_parser(subparsers: argparse._SubParsersAction[argparse.ArgumentParser]) -> None:
    server_parser = subparsers.add_parser("discover-server")
    server_parser.add_argument("iso", type=Path)
    server_parser.add_argument("--out", type=Path, required=True)


def _add_package_parser(subparsers: argparse._SubParsersAction[argparse.ArgumentParser]) -> None:
    package_parser = subparsers.add_parser("package-installed")
    package_parser.add_argument("installed_tree", type=Path)
    package_parser.add_argument("--overlay", type=Path)
    package_parser.add_argument("--out", type=Path, required=True)
    package_parser.add_argument("--manifest-out", type=Path, required=True)


def main() -> int:
    parser = argparse.ArgumentParser(description="Inspect and package LOGH VII artifacts for localization work.")
    subparsers = parser.add_subparsers(dest="command", required=True)
    _add_inspect_parser(subparsers)
    _add_server_parser(subparsers)
    _add_package_parser(subparsers)
    args = parser.parse_args()

    try:
        match args.command:
            case "inspect":
                inspect_iso(args.iso, args.out)
            case "discover-server":
                write_server_discovery(args.iso, args.out)
            case "package-installed":
                package_installed_tree(args.installed_tree, args.overlay, args.out, args.manifest_out)
                print(f"wrote {args.out}")
                print(f"wrote {args.manifest_out}")
            case unreachable:
                raise InvalidIsoError(f"unsupported command: {unreachable}")
    except (PipelineError, PackageError) as error:
        print(str(error), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
