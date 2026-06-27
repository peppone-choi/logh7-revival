#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Final

if __package__:
    from .logh7_child_codec import PeImage, _parse_pe_image
else:
    from logh7_child_codec import PeImage, _parse_pe_image


JsonValue = str | int | bool | None | list["JsonValue"] | dict[str, "JsonValue"]
PRINTABLE_ASCII: Final[re.Pattern[bytes]] = re.compile(rb"[\x20-\x7e]{4,}")
IPV4_TEXT: Final[re.Pattern[str]] = re.compile(r"^(?:\d{1,3}\.){3}\d{1,3}$")


@dataclass(frozen=True, slots=True)
class BinarySpec:
    relative_path: str
    role: str


@dataclass(frozen=True, slots=True)
class Needle:
    value: str
    category: str


@dataclass(frozen=True, slots=True)
class Finding:
    category: str
    value: str
    raw_offset: int
    virtual_address: int | None

    def to_json(self) -> dict[str, JsonValue]:
        return {
            "category": self.category,
            "value": self.value,
            "encoding": "ascii",
            "rawOffsetHex": f"0x{self.raw_offset:08x}",
            "virtualAddressHex": _hex_or_none(self.virtual_address),
        }


BINARY_SPECS: Final[tuple[BinarySpec, ...]] = (
    BinarySpec("Gin7UpdateClient.exe", "update-client"),
    BinarySpec("G7Start.exe", "launcher"),
    BinarySpec("BootFirst.exe", "bootstrap"),
)

NEEDLES: Final[tuple[Needle, ...]] = (
    Needle("SERVER_PORT", "server-config"),
    Needle("SERVER_ADDRESS", "server-config"),
    Needle("%sSERVER.INI", "server-config"),
    Needle("SERVER.INI", "server-config"),
    Needle("UPDATE", "server-config"),
    Needle("http://", "update-transport"),
    Needle("ftp://", "update-transport"),
    Needle("HTTP/%d.%d", "update-transport"),
    Needle("ProxyServer", "update-transport"),
    Needle("http", "update-transport"),
    Needle("ftp:", "update-transport"),
    Needle(".\\exe\\G7MTClient.exe", "client-launch"),
    Needle("exe\\G7MTClient.exe", "client-launch"),
    Needle(".\\Gin7UpdateClient.exe", "update-launch"),
    Needle(".\\Gin7UpdateClient.new", "update-replacement"),
    Needle("Gin7UpdateClient.new", "update-replacement"),
    Needle(".\\Gin7UpdateClient.old", "update-replacement"),
    Needle("Gin7UpdateClient.old", "update-replacement"),
    Needle("UPDATE.LOG", "update-logging"),
    Needle("UpdateClient.err", "update-logging"),
    Needle("SETUP.EXE", "installer-launch"),
)


def build_launcher_update_index(root: Path) -> dict[str, JsonValue]:
    binaries: list[dict[str, JsonValue]] = []
    missing: list[str] = []
    all_findings: list[tuple[str, Finding]] = []
    for spec in BINARY_SPECS:
        path = root / spec.relative_path
        if not path.exists():
            missing.append(spec.relative_path)
            continue
        entry, findings = _binary_entry(root, path, spec)
        binaries.append(entry)
        all_findings.extend((spec.relative_path, finding) for finding in findings)

    default_server = _default_server_address(all_findings)
    return {
        "sourceRoot": str(root),
        "summary": {
            "scannedBinaries": len(binaries),
            "missingBinaries": len(missing),
            "findings": len(all_findings),
            "defaultServerAddressFound": default_server is not None,
        },
        "defaultServerAddress": default_server,
        "binaries": binaries,
        "missingBinaries": missing,
        "serverImplication": (
            "launcher/update binaries can select SERVER.INI keys, legacy update transport, "
            "and the client executable before G7MTClient.exe runs"
        ),
        "evidence": "byte-precise ASCII scan of launcher/update PE files with raw-offset-to-VA mapping",
    }


def write_launcher_update_index(root: Path, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(
        json.dumps(build_launcher_update_index(root), ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def _binary_entry(root: Path, path: Path, spec: BinarySpec) -> tuple[dict[str, JsonValue], list[Finding]]:
    raw = path.read_bytes()
    image = _parse_pe_image(raw)
    findings = _findings(raw, image)
    return (
        {
            "path": path.relative_to(root).as_posix(),
            "role": spec.role,
            "findings": [finding.to_json() for finding in findings],
        },
        findings,
    )


def _findings(raw: bytes, image: PeImage) -> list[Finding]:
    findings: list[Finding] = []
    seen: set[tuple[int, str]] = set()
    for match in PRINTABLE_ASCII.finditer(raw):
        value = match.group().decode("ascii")
        category = _category_for_value(value)
        if category is None:
            continue
        key = (match.start(), value)
        if key in seen:
            continue
        seen.add(key)
        findings.append(
            Finding(
                category=category,
                value=value,
                raw_offset=match.start(),
                virtual_address=_raw_offset_to_virtual_address(image, match.start()),
            )
        )
    return sorted(findings, key=lambda finding: (finding.raw_offset, finding.value))


def _category_for_value(value: str) -> str | None:
    if IPV4_TEXT.match(value):
        return "default-server-address"
    for needle in NEEDLES:
        if needle.value == value:
            return needle.category
    return None


def _default_server_address(findings: list[tuple[str, Finding]]) -> dict[str, JsonValue] | None:
    for binary, finding in findings:
        if finding.category == "default-server-address":
            payload = finding.to_json()
            payload["binary"] = binary
            return payload
    return None


def _raw_offset_to_virtual_address(image: PeImage, raw_offset: int) -> int | None:
    for section in image.sections:
        raw_start = section.raw_pointer
        raw_end = section.raw_pointer + section.raw_size
        if raw_start <= raw_offset < raw_end:
            return image.image_base + section.virtual_address + raw_offset - raw_start
    return None


def _hex_or_none(value: int | None) -> str | None:
    if value is None:
        return None
    return f"0x{value:08x}"


def main() -> int:
    parser = argparse.ArgumentParser(description="Index LOGH VII launcher/update static markers.")
    parser.add_argument("root", type=Path)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()

    try:
        write_launcher_update_index(args.root, args.out)
    except (OSError, ValueError) as error:
        print(str(error), file=sys.stderr)
        return 1
    print(f"wrote {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
