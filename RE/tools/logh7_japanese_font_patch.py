from __future__ import annotations

import argparse
import json
import shutil
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Final

if __package__ in {None, ""}:
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from tools.logh7_child_codec import PeImage, _parse_pe_image, _virtual_address_to_offset


JsonValue = str | int | bool | list["JsonValue"] | dict[str, "JsonValue"]

SHIFTJIS_CHARSET: Final[int] = 0x80
HANGEUL_CHARSET: Final[int] = 0x81
CHARSETS: Final[dict[str, int]] = {
    "shiftjis": SHIFTJIS_CHARSET,
    "hangeul": HANGEUL_CHARSET,
}
PATCH_SITES: Final[tuple[int, ...]] = (0x004AEDEB, 0x004B0B97)
EXPECTED_ORIGINAL: Final[bytes] = b"\x6a\x01"


@dataclass(frozen=True, slots=True)
class JapaneseFontPatchSite:
    virtual_address: int
    file_offset: int
    original_hex: str
    patched_hex: str

    def to_json(self) -> dict[str, JsonValue]:
        return {
            "virtualAddressHex": f"0x{self.virtual_address:08x}",
            "fileOffsetHex": f"0x{self.file_offset:08x}",
            "originalHex": self.original_hex,
            "patchedHex": self.patched_hex,
        }


@dataclass(frozen=True, slots=True)
class JapaneseFontPatch:
    sites: tuple[JapaneseFontPatchSite, ...]
    charset_name: str
    charset_value: int

    def to_json(self) -> dict[str, JsonValue]:
        return {
            "charset": self.charset_name,
            "charsetValue": self.charset_value,
            "sites": [site.to_json() for site in self.sites],
        }


def apply_japanese_font_patch(
    source: Path, destination: Path, manifest_out: Path, *, charset_name: str = "shiftjis"
) -> JapaneseFontPatch:
    raw = bytearray(source.read_bytes())
    image = _parse_pe_image(raw)
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, destination)
    patched = bytearray(destination.read_bytes())
    charset_value = _parse_charset(charset_name)

    sites: list[JapaneseFontPatchSite] = []
    for virtual_address in PATCH_SITES:
        file_offset = _virtual_address_to_offset(image, virtual_address)
        original = _read_original(raw, image, virtual_address)
        patched[file_offset : file_offset + 2] = bytes((0x6A, charset_value))
        sites.append(
            JapaneseFontPatchSite(
                virtual_address=virtual_address,
                file_offset=file_offset,
                original_hex=original.hex(),
                patched_hex=patched[file_offset : file_offset + 2].hex(),
            )
        )

    destination.write_bytes(patched)
    patch = JapaneseFontPatch(tuple(sites), _charset_label(charset_name), charset_value)
    manifest_out.parent.mkdir(parents=True, exist_ok=True)
    manifest_out.write_text(json.dumps(patch.to_json(), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return patch


def _parse_charset(charset_name: str) -> int:
    normalized = charset_name.strip().lower()
    if normalized not in CHARSETS:
        raise ValueError(f"unsupported font charset: {charset_name}")
    return CHARSETS[normalized]


def _charset_label(charset_name: str) -> str:
    normalized = charset_name.strip().lower()
    match normalized:
        case "shiftjis":
            return "SHIFTJIS_CHARSET"
        case "hangeul":
            return "HANGEUL_CHARSET"
        case _:
            raise ValueError(f"unsupported font charset: {charset_name}")


def _read_original(raw: bytearray, image: PeImage, virtual_address: int) -> bytes:
    file_offset = _virtual_address_to_offset(image, virtual_address)
    original = bytes(raw[file_offset : file_offset + len(EXPECTED_ORIGINAL)])
    if original != EXPECTED_ORIGINAL:
        raise ValueError(f"font charset bytes drift at 0x{virtual_address:08x}: {original.hex()}")
    return original


def main() -> int:
    parser = argparse.ArgumentParser(description="Patch LOGH VII client font charset.")
    parser.add_argument("source", type=Path)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--manifest-out", type=Path, required=True)
    parser.add_argument("--charset", choices=sorted(CHARSETS), default="shiftjis")
    args = parser.parse_args()

    try:
        patch = apply_japanese_font_patch(args.source, args.out, args.manifest_out, charset_name=args.charset)
    except (OSError, ValueError) as error:
        print(str(error), file=sys.stderr)
        return 1
    print(json.dumps(patch.to_json(), ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
