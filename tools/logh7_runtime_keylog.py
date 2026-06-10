from __future__ import annotations

import json
import struct
from dataclasses import dataclass
from pathlib import Path
from typing import Final

KEYLOG_V2_MAGIC: Final[bytes] = b"KLG2"
KEYLOG_V2_RECORD_BYTES: Final[int] = 92


@dataclass(frozen=True, slots=True)
class RuntimeKeylogRecord:
    offset: int
    event: int
    return_address: int
    codec: int
    key_pointer: int
    key_length: int
    copy_length: int
    key: bytes

    def to_json(self) -> dict[str, str | int]:
        return {
            "offset": self.offset,
            "magic": KEYLOG_V2_MAGIC.decode("ascii"),
            "event": self.event,
            "eventName": _event_label(self.event),
            "returnAddressHex": f"0x{self.return_address:08x}",
            "helperReturn": _helper_return_label(self.return_address),
            "codecHex": f"0x{self.codec:08x}",
            "keyPointerHex": f"0x{self.key_pointer:08x}",
            "keyLength": self.key_length,
            "copyLength": self.copy_length,
            "keyHex": self.key.hex(),
            "keyAscii": _ascii_preview(self.key),
        }


def parse_runtime_keylog_records(source: Path) -> tuple[RuntimeKeylogRecord, ...]:
    raw = source.read_bytes()
    if len(raw) % KEYLOG_V2_RECORD_BYTES != 0:
        raise ValueError("runtime keylog size is not a multiple of 92-byte KLG2 records")
    records: list[RuntimeKeylogRecord] = []
    for offset in range(0, len(raw), KEYLOG_V2_RECORD_BYTES):
        chunk = raw[offset : offset + KEYLOG_V2_RECORD_BYTES]
        if chunk[:4] != KEYLOG_V2_MAGIC:
            raise ValueError(f"runtime keylog record at offset {offset} has invalid KLG2 magic")
        return_address, codec, key_pointer, key_length, copy_length = struct.unpack_from("<IIIII", chunk, 8)
        if copy_length > 64:
            raise ValueError(f"runtime keylog record at offset {offset} has invalid copy length")
        records.append(
            RuntimeKeylogRecord(
                offset=offset,
                event=chunk[4],
                return_address=return_address,
                codec=codec,
                key_pointer=key_pointer,
                key_length=key_length,
                copy_length=copy_length,
                key=chunk[28 : 28 + copy_length],
            )
        )
    return tuple(records)


def write_runtime_keylog_index(source: Path, destination: Path) -> None:
    records = parse_runtime_keylog_records(source)
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(
        json.dumps(
            {
                "source": str(source),
                "recordBytes": KEYLOG_V2_RECORD_BYTES,
                "records": [record.to_json() for record in records],
            },
            ensure_ascii=False,
            indent=2,
            sort_keys=True,
        )
        + "\n",
        encoding="utf-8",
    )


def _helper_return_label(return_address: int) -> str:
    match return_address:
        case 0x006140EF:
            return "keySetupWrapper.storeKeyReturn"
        case 0x0061285C:
            return "loginGuidKeySetup.returnAfterKeySetup"
        case 0x00612D0B:
            return "loginSessionKeySetup.returnAfterKeySetup"
        case 0x006451A2:
            return "phase1OutboundRead.returnAfterKeyRead"
        case 0x00645483:
            return "phase2InboundApply.returnAfterKeySetup"
        case 0x00645944:
            return "phase3Apply.returnAfterKeySetup"
        case _:
            return "unknown"


def _event_label(event: int) -> str:
    match event:
        case 1:
            return "keyStoreHelperEntry"
        case 2:
            return "keySetupWrapperEntry"
        case 3:
            return "keyReadHelperEntry"
        case _:
            return "unknown"


def _ascii_preview(raw: bytes) -> str:
    return "".join(chr(byte) if 0x20 <= byte <= 0x7E else "." for byte in raw)
