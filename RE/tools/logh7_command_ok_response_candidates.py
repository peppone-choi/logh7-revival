from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Final

if __package__:
    from .logh7_child_codec import ChildCodecStaticTables
    from .logh7_child_codec import child_codec_encode, child_codec_key_schedule, extract_child_codec_static_tables
    from .logh7_cipher import build_transport_frame
else:
    from logh7_child_codec import ChildCodecStaticTables
    from logh7_child_codec import child_codec_encode, child_codec_key_schedule, extract_child_codec_static_tables
    from logh7_cipher import build_transport_frame


REQUEST_TRANSPORT_CODE: Final[int] = 0x0030
CANDIDATE_STATUS: Final[str] = "constructed from proven decoded layouts; runtime probe required"
ONE_ENTRY_STATUS: Final[str] = "constructed one-entry command OK probe; runtime probe required"


@dataclass(frozen=True, slots=True)
class CommandOkResponseTarget:
    transport_code: int
    message_name: str
    decoded_body_bytes: int
    layout_evidence: str


TARGETS: Final[tuple[CommandOkResponseTarget, ...]] = (
    CommandOkResponseTarget(0x0031, "CommandMoveShip OK", 1052, "g021-command-ok-layout.json"),
    CommandOkResponseTarget(0x0032, "CommandTurnShip OK", 276, "g021-command-ok-layout.json"),
    CommandOkResponseTarget(0x0033, "CommandParallelMoveShip OK", 1052, "g021-command-ok-layout.json"),
)


def build_zero_count_decoded_body(decoded_body_bytes: int) -> bytes:
    if decoded_body_bytes <= 0:
        raise ValueError("command OK decoded body length must be positive")
    return bytes(decoded_body_bytes)


def build_one_entry_decoded_body(decoded_body_bytes: int, entity_key: int) -> bytes:
    decoded = bytearray(build_zero_count_decoded_body(decoded_body_bytes))
    decoded[0x0C] = 1
    decoded[0x10:0x14] = entity_key.to_bytes(4, "little")
    return bytes(decoded)


def build_command_ok_response_candidates(source: Path, phase1_key: bytes, *, entity_key: int | None = None) -> dict[str, object]:
    if len(phase1_key) == 0:
        raise ValueError("phase1 key must not be empty")
    tables = extract_child_codec_static_tables(source)
    scheduled = child_codec_key_schedule(tables, phase1_key)
    status = ONE_ENTRY_STATUS if entity_key is not None else CANDIDATE_STATUS
    return {
        "source": str(source),
        "trigger": "decoded client 0x0030 login/session-like body",
        "requestTransportHex": f"0x{REQUEST_TRANSPORT_CODE:04x}",
        "phase1KeyHex": phase1_key.hex(),
        "candidateStatus": status,
        "entries": [_entry(scheduled, target, entity_key=entity_key) for target in TARGETS],
        "nextTracePoint": "runtime-probe configured command OK response candidates against the real client",
    }


def write_command_ok_response_candidates(
    source: Path,
    destination: Path,
    *,
    phase1_key_hex: str,
    entity_key_hex: str | None = None,
) -> None:
    phase1_key = bytes.fromhex(phase1_key_hex)
    entity_key = int(entity_key_hex, 0) if entity_key_hex is not None else None
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(
        json.dumps(build_command_ok_response_candidates(source, phase1_key, entity_key=entity_key), ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def _entry(
    scheduled_tables: ChildCodecStaticTables,
    target: CommandOkResponseTarget,
    *,
    entity_key: int | None,
) -> dict[str, int | str | dict[str, int | str]]:
    decoded_body = (
        build_zero_count_decoded_body(target.decoded_body_bytes)
        if entity_key is None
        else build_one_entry_decoded_body(target.decoded_body_bytes, entity_key)
    )
    encoded_body = child_codec_encode(scheduled_tables, decoded_body)
    frame = build_transport_frame(target.transport_code, encoded_body)
    profile = _decoded_body_profile(entity_key)
    status = ONE_ENTRY_STATUS if entity_key is not None else CANDIDATE_STATUS
    return {
        "transportHex": f"0x{target.transport_code:04x}",
        "messageName": target.message_name,
        "decodedBodyBytes": target.decoded_body_bytes,
        "decodedBodyHex": decoded_body.hex(),
        "decodedBodyProfile": profile,
        "encodedBodyBytes": len(encoded_body),
        "frameDeclaredPayloadLength": len(encoded_body) + 2,
        "frameHex": frame.hex(),
        "layoutEvidence": target.layout_evidence,
        "candidateStatus": status,
    }


def _decoded_body_profile(entity_key: int | None) -> dict[str, int | str]:
    if entity_key is None:
        return {"primaryEntryCount": 0, "entityLookupKeyHex": "none"}
    return {"primaryEntryCount": 1, "entityLookupKeyHex": f"0x{entity_key:08x}"}
