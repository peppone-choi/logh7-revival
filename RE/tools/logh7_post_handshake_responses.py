from __future__ import annotations

import json
import struct
from pathlib import Path
from typing import Final

from capstone import CS_ARCH_X86, CS_MODE_32, Cs

if __package__:
    from .logh7_child_codec import PeImage, _parse_pe_image, _virtual_address_to_offset
else:
    from logh7_child_codec import PeImage, _parse_pe_image, _virtual_address_to_offset

TRANSPORT_JUMP_TABLE_VA: Final[int] = 0x004B864C
INTERNAL_SWITCH_INDEX_TABLE_VA: Final[int] = 0x004BDFD4
INTERNAL_SWITCH_TARGET_TABLE_VA: Final[int] = 0x004BDF28
INTERNAL_SWITCH_BASE: Final[int] = 0x033F
STATE_GATE_FIELD: Final[str] = "cipher-enabled flag at client offset 0x35837e"
POST_0030_CANDIDATES: Final[tuple[tuple[int, int], ...]] = (
    (0x0031, 0x0400),
    (0x0032, 0x0401),
    (0x0033, 0x0402),
)


def build_post_handshake_response_candidates(source: Path) -> dict[str, object]:
    data = source.read_bytes()
    image = _parse_pe_image(data)
    candidates = [
        _candidate(data, image, transport_code=transport_code, internal_code=internal_code)
        for transport_code, internal_code in POST_0030_CANDIDATES
    ]
    return {
        "source": str(source),
        "trigger": "decoded client 0x0030 login/session-like body",
        "candidates": candidates,
        "evidence": "direct PE transport jump-table and internal switch-table decode",
        "nextTracePoint": "reverse payload layout for internal 0x0400/0x0401/0x0402",
    }


def write_post_handshake_response_candidates(source: Path, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(
        json.dumps(build_post_handshake_response_candidates(source), ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def _candidate(data: bytes, image: PeImage, *, transport_code: int, internal_code: int) -> dict[str, str]:
    transport_target = _transport_target(data, image, transport_code)
    queued_internal = _queued_internal_code(data, image, transport_target)
    if queued_internal != internal_code:
        raise ValueError(
            f"transport 0x{transport_code:04x} queues 0x{queued_internal:04x}, not 0x{internal_code:04x}"
        )
    internal_handler = _internal_handler_target(data, image, internal_code)
    return {
        "transportHex": f"0x{transport_code:04x}",
        "internalHex": f"0x{internal_code:04x}",
        "transportTargetVirtualAddressHex": f"0x{transport_target:08x}",
        "internalHandlerVirtualAddressHex": f"0x{internal_handler:08x}",
        "stateGate": STATE_GATE_FIELD,
        "responseStatus": "candidate only; payload schema not yet proven",
    }


def _transport_target(data: bytes, image: PeImage, transport_code: int) -> int:
    table_va = TRANSPORT_JUMP_TABLE_VA + (transport_code - 1) * 4
    return struct.unpack_from("<I", data, _virtual_address_to_offset(image, table_va))[0]


def _queued_internal_code(data: bytes, image: PeImage, target_va: int) -> int:
    disassembler = Cs(CS_ARCH_X86, CS_MODE_32)
    target_offset = _virtual_address_to_offset(image, target_va)
    saw_gate = False
    for instruction in disassembler.disasm(data[target_offset : target_offset + 64], target_va):
        if instruction.mnemonic == "mov" and instruction.op_str == "al, byte ptr [edi + 0x35837e]":
            saw_gate = True
        if instruction.mnemonic == "mov" and instruction.op_str.startswith("esi, "):
            if not saw_gate:
                raise ValueError(f"transport handler lacks cipher gate before queue: 0x{target_va:08x}")
            return int(instruction.op_str.removeprefix("esi, "), 0)
    raise ValueError(f"transport handler does not queue an internal code: 0x{target_va:08x}")


def _internal_handler_target(data: bytes, image: PeImage, internal_code: int) -> int:
    switch_index = internal_code - INTERNAL_SWITCH_BASE
    if switch_index < 0:
        raise ValueError(f"internal code is below switch base: 0x{internal_code:04x}")
    index_offset = _virtual_address_to_offset(image, INTERNAL_SWITCH_INDEX_TABLE_VA + switch_index)
    table_index = data[index_offset]
    target_offset = _virtual_address_to_offset(image, INTERNAL_SWITCH_TARGET_TABLE_VA + table_index * 4)
    return struct.unpack_from("<I", data, target_offset)[0]
