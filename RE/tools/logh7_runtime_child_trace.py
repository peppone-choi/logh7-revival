from __future__ import annotations

import json
import struct
from dataclasses import dataclass
from pathlib import Path
from typing import Final

CHILD_TRACE_MAGIC: Final[bytes] = b"CLG2"
CHILD_TRACE_RECORD_BYTES: Final[int] = 176
CHILD_TRACE_BUFFER_BYTES: Final[int] = 64
CHILD_TRACE_KEY_BYTES: Final[int] = 64


@dataclass(frozen=True, slots=True)
class RuntimeChildTraceRecord:
    offset: int
    event: int
    caller: int
    codec: int
    input_pointer: int
    input_length: int
    output_holder_pointer: int
    capacity_pointer: int
    copy_length: int
    stored_key_pointer: int
    stored_key_length: int
    stored_key_copy_length: int
    buffer: bytes
    stored_key: bytes

    def to_json(self) -> dict[str, str | int]:
        value: dict[str, str | int] = {
            "offset": self.offset,
            "magic": CHILD_TRACE_MAGIC.decode("ascii"),
            "event": self.event,
            "eventName": _event_label(self.event),
            "callerHex": f"0x{self.caller:08x}",
            "callerLabel": _caller_label(self.caller),
            "codecHex": f"0x{self.codec:08x}",
            "inputPointerHex": f"0x{self.input_pointer:08x}",
            "inputLength": self.input_length,
            "outputHolderPointerHex": f"0x{self.output_holder_pointer:08x}",
            "capacityPointerHex": f"0x{self.capacity_pointer:08x}",
            "copyLength": self.copy_length,
            "bufferHex": self.buffer.hex(),
            "bufferAscii": _ascii_preview(self.buffer),
            "storedKeyPointerHex": f"0x{self.stored_key_pointer:08x}",
            "storedKeyLength": self.stored_key_length,
            "storedKeyCopyLength": self.stored_key_copy_length,
            "storedKeyImageHex": self.stored_key.hex(),
            "storedKeyRawXor17Hex": bytes(item ^ 0x17 for item in self.stored_key).hex(),
        }
        match self.event:
            case 5:
                value.update(
                    {
                        "outputPointerHex": f"0x{self.stored_key_pointer:08x}",
                        "outputLength": self.stored_key_length,
                        "returnValue": self.stored_key_copy_length,
                        "outputHex": self.buffer.hex(),
                    }
                )
            case 6:
                schedule_input = self.buffer[: min(self.input_length, len(self.buffer))]
                schedule_stored_key = self.buffer[len(schedule_input) :]
                value.update(
                    {
                        "scheduledPArrayPointerHex": f"0x{self.stored_key_pointer:08x}",
                        "scheduledPArrayBytes": self.stored_key_length,
                        "scheduledPArrayHeadHex": self.stored_key.hex(),
                        "scheduleInputHex": schedule_input.hex(),
                        "scheduleStoredKeyImageHex": schedule_stored_key.hex(),
                        "scheduleStoredKeyRawXor17Hex": bytes(item ^ 0x17 for item in schedule_stored_key).hex(),
                    }
                )
            case _:
                pass
        return value


def parse_runtime_child_trace_records(source: Path) -> tuple[RuntimeChildTraceRecord, ...]:
    raw = source.read_bytes()
    if len(raw) % CHILD_TRACE_RECORD_BYTES != 0:
        raise ValueError("runtime child trace size is not a multiple of 176-byte CLG2 records")
    records: list[RuntimeChildTraceRecord] = []
    for offset in range(0, len(raw), CHILD_TRACE_RECORD_BYTES):
        chunk = raw[offset : offset + CHILD_TRACE_RECORD_BYTES]
        if chunk[:4] != CHILD_TRACE_MAGIC:
            raise ValueError(f"runtime child trace record at offset {offset} has invalid CLG2 magic")
        fields = struct.unpack_from("<IIIIIIIIII", chunk, 8)
        copy_length = fields[6]
        stored_key_copy_length = fields[9]
        if copy_length > CHILD_TRACE_BUFFER_BYTES:
            raise ValueError(f"runtime child trace record at offset {offset} has invalid copy length")
        if stored_key_copy_length > CHILD_TRACE_KEY_BYTES:
            raise ValueError(f"runtime child trace record at offset {offset} has invalid stored key copy length")
        records.append(
            RuntimeChildTraceRecord(
                offset,
                chunk[4],
                *fields,
                chunk[48 : 48 + copy_length],
                chunk[112 : 112 + stored_key_copy_length],
            )
        )
    return tuple(records)


def write_runtime_child_trace_index(source: Path, destination: Path) -> None:
    records = parse_runtime_child_trace_records(source)
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(
        json.dumps(
            {
                "source": str(source),
                "recordBytes": CHILD_TRACE_RECORD_BYTES,
                "records": [record.to_json() for record in records],
            },
            ensure_ascii=False,
            indent=2,
            sort_keys=True,
        )
        + "\n",
        encoding="utf-8",
    )


def _caller_label(caller: int) -> str:
    match caller:
        case 0x006451B0:
            return "phase1OutboundEncode.callChildCodecEncode"
        case 0x006452CC:
            return "phase1OutboundEncode.returnAfterChildCodecEncode"
        case _:
            return "unknown"


def _event_label(event: int) -> str:
    match event:
        case 4:
            return "childCodecEncodeEntry"
        case 5:
            return "childCodecEncodePostCall"
        case 6:
            return "childCodecEncodeScheduleEntry"
        case _:
            return "unknown"


def _ascii_preview(raw: bytes) -> str:
    return "".join(chr(byte) if 0x20 <= byte <= 0x7E else "." for byte in raw)
