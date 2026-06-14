"""Re-encode (localize) LOGH VII MsgDat HFWR containers byte-safely.

The companion decoder ``tools/logh7_msgdat.py`` proved the HFWR layout:

    [16-byte header] [aligned offset table] [NUL-terminated CP932 records]

Empirically (tools probe, 2026-06-14) the offset-table entries are **record
indices** (group / command-id boundaries), not byte offsets: for every file the
table is monotonic in ``[0, textPointerCount]`` and its last value equals
``textPointerCount``. The client therefore locates record N by walking NUL
terminators from the payload start -- exactly like the decoder. That means a
translated record may change byte length without invalidating the offset table,
as long as record **count**, **order**, and **NUL termination** are preserved.

This module rebuilds an HFWR file from its original bytes plus a translation map
``{record_id: korean_text}``. Untranslated records keep their original bytes
verbatim (so a no-translation round-trip is byte-exact). Translated records are
re-encoded to CP949 (the Hangul ANSI code page the client reads once the font
charset is patched to ``HANGEUL_CHARSET``; see
``tools/logh7_japanese_font_patch.py``).
"""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Final

if __package__ in {None, ""}:
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

HFWR_MAGIC: Final = b"HFWR"
GFWR_MAGIC: Final = b"GFWR"
HEADER_BYTES: Final = 16
DEFAULT_ENCODING: Final = "cp949"


class MsgDatEncodeError(Exception):
    """Raised when an HFWR container cannot be parsed or re-encoded safely."""


def _read_u32(raw: bytes, offset: int) -> int:
    return int.from_bytes(raw[offset : offset + 4], "little")


def _aligned_dword_count(count: int) -> int:
    return (count + 3) & ~3


@dataclass(frozen=True, slots=True)
class HfwrContainer:
    """Parsed HFWR file: preserved header + offset table, plus record byte slices."""

    header: bytes  # 16 bytes, verbatim
    offset_table_region: bytes  # aligned offset table, verbatim (incl. padding)
    records: tuple[bytes, ...]  # record payloads WITHOUT the NUL terminator
    text_pointer_count: int
    offset_table_count: int

    @property
    def payload_offset(self) -> int:
        return HEADER_BYTES + len(self.offset_table_region)


def parse_hfwr(raw: bytes) -> HfwrContainer:
    if raw[:4] != HFWR_MAGIC:
        raise MsgDatEncodeError(f"not an HFWR container (magic={raw[:4]!r})")
    if len(raw) < HEADER_BYTES:
        raise MsgDatEncodeError("HFWR file shorter than its 16-byte header")
    text_pointer_count = _read_u32(raw, 8)
    offset_table_count = _read_u32(raw, 12)
    aligned = _aligned_dword_count(offset_table_count)
    payload_offset = HEADER_BYTES + aligned * 4
    if payload_offset > len(raw):
        raise MsgDatEncodeError("HFWR offset table extends past end of file")
    header = raw[:HEADER_BYTES]
    offset_table_region = raw[HEADER_BYTES:payload_offset]
    records: list[bytes] = []
    cursor = payload_offset
    for record_id in range(text_pointer_count):
        end = raw.find(b"\x00", cursor)
        if end < 0:
            raise MsgDatEncodeError(f"HFWR record {record_id} is missing a NUL terminator")
        records.append(raw[cursor:end])
        cursor = end + 1
    return HfwrContainer(
        header=header,
        offset_table_region=offset_table_region,
        records=tuple(records),
        text_pointer_count=text_pointer_count,
        offset_table_count=offset_table_count,
    )


def build_hfwr(container: HfwrContainer, records: list[bytes]) -> bytes:
    if len(records) != container.text_pointer_count:
        raise MsgDatEncodeError(
            f"record count changed: header textPointerCount={container.text_pointer_count} "
            f"but got {len(records)} records (count must be preserved)"
        )
    for record_id, record in enumerate(records):
        if b"\x00" in record:
            raise MsgDatEncodeError(f"record {record_id} contains an embedded NUL byte")
    out = bytearray()
    out += container.header
    out += container.offset_table_region
    for record in records:
        out += record
        out += b"\x00"
    return bytes(out)


def encode_record(text: str, *, encoding: str = DEFAULT_ENCODING) -> bytes:
    try:
        encoded = text.encode(encoding)
    except UnicodeEncodeError as error:
        raise MsgDatEncodeError(f"text not representable in {encoding}: {text!r} ({error})") from error
    if b"\x00" in encoded:
        raise MsgDatEncodeError(f"encoded text contains a NUL byte: {text!r}")
    return encoded


def localize_hfwr(
    raw: bytes,
    translations: dict[int, str],
    *,
    encoding: str = DEFAULT_ENCODING,
) -> bytes:
    """Return new HFWR bytes with ``translations`` (record_id -> text) applied.

    Untranslated records keep their original bytes verbatim, so an empty
    ``translations`` map reproduces ``raw`` byte-for-byte.
    """

    container = parse_hfwr(raw)
    unknown = [rid for rid in translations if not 0 <= rid < container.text_pointer_count]
    if unknown:
        raise MsgDatEncodeError(
            f"translation record ids out of range [0,{container.text_pointer_count}): {sorted(unknown)[:10]}"
        )
    records: list[bytes] = []
    for record_id, original in enumerate(container.records):
        if record_id in translations:
            records.append(encode_record(translations[record_id], encoding=encoding))
        else:
            records.append(original)
    return build_hfwr(container, records)


def localize_hfwr_file(
    source: Path,
    destination: Path,
    translations: dict[int, str],
    *,
    encoding: str = DEFAULT_ENCODING,
) -> dict[str, object]:
    raw = source.read_bytes()
    out = localize_hfwr(raw, translations, encoding=encoding)
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_bytes(out)
    return {
        "source": str(source),
        "destination": str(destination),
        "encoding": encoding,
        "recordCount": parse_hfwr(raw).text_pointer_count,
        "translatedRecords": len(translations),
        "sourceBytes": len(raw),
        "outputBytes": len(out),
        "identity": out == raw,
    }


def _load_translations(path: Path) -> dict[int, str]:
    data = json.loads(path.read_text(encoding="utf-8"))
    raw_map = data.get("translations", data) if isinstance(data, dict) else data
    if not isinstance(raw_map, dict):
        raise MsgDatEncodeError("translation file must be a JSON object of {record_id: text}")
    result: dict[int, str] = {}
    for key, value in raw_map.items():
        if key.startswith("_"):
            continue
        result[int(key)] = str(value)
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description="Localize a LOGH VII HFWR MsgDat file to CP949.")
    parser.add_argument("source", type=Path, help="original .dat (HFWR)")
    parser.add_argument("--out", type=Path, required=True, help="localized .dat output")
    parser.add_argument(
        "--translations",
        type=Path,
        required=True,
        help='JSON {"translations": {"<record_id>": "한국어"}}',
    )
    parser.add_argument("--encoding", default=DEFAULT_ENCODING)
    args = parser.parse_args()
    try:
        translations = _load_translations(args.translations)
        result = localize_hfwr_file(args.source, args.out, translations, encoding=args.encoding)
    except (OSError, ValueError, MsgDatEncodeError) as error:
        print(str(error), file=sys.stderr)
        return 1
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
