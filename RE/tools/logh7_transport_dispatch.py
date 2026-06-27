from __future__ import annotations

import json
import re
import struct
from dataclasses import dataclass
from pathlib import Path
from typing import Final

from capstone import CS_ARCH_X86, CS_MODE_32, Cs

if __package__:
    from .logh7_child_codec import _parse_pe_image, _virtual_address_to_offset
else:
    from logh7_child_codec import _parse_pe_image, _virtual_address_to_offset

DISPATCH_JUMP_TABLE_VA: Final[int] = 0x004B864C
DISPATCH_TAIL_VA: Final[int] = 0x004B78EF
STATE_GATE_FIELD: Final[str] = "cipher-enabled flag at client offset 0x35837e"
TRACKED_TRANSPORT_CODES: Final[tuple[int, ...]] = (
    0x0001,
    0x0003,
    0x0004,
    0x0013,
    0x0014,
    0x0030,
    0x0034,
    0x0035,
    0x0036,
)
IMMEDIATE_PATTERN: Final[re.Pattern[str]] = re.compile(r"0x[0-9a-f]+|-?\d+")


@dataclass(frozen=True, slots=True)
class TransportDispatchEntry:
    transport_code: int
    table_virtual_address: int
    target_virtual_address: int
    internal_code: int
    paired_internal_code: int | None
    state_gate: str | None
    side_effects: tuple[str, ...]

    def to_json(self) -> dict[str, int | str | list[str] | None]:
        paired = self.paired_internal_code
        return {
            "transportCode": self.transport_code,
            "transportHex": f"0x{self.transport_code:04x}",
            "tableVirtualAddress": self.table_virtual_address,
            "tableVirtualAddressHex": f"0x{self.table_virtual_address:08x}",
            "targetVirtualAddress": self.target_virtual_address,
            "targetVirtualAddressHex": f"0x{self.target_virtual_address:08x}",
            "internalCode": self.internal_code,
            "internalHex": f"0x{self.internal_code:04x}",
            "pairedInternalCode": paired,
            "pairedInternalHex": None if paired is None else f"0x{paired:04x}",
            "stateGate": self.state_gate,
            "sideEffects": list(self.side_effects),
        }


def _read_u32(data: bytes, offset: int) -> int:
    return struct.unpack_from("<I", data, offset)[0]


def _immediate(op_str: str) -> int:
    match = IMMEDIATE_PATTERN.search(op_str)
    if match is None:
        raise ValueError(f"instruction has no immediate: {op_str}")
    return int(match.group(0), 0)


def _target_for_code(data: bytes, image: object, code: int) -> tuple[int, int]:
    table_va = DISPATCH_JUMP_TABLE_VA + (code - 1) * 4
    table_offset = _virtual_address_to_offset(image, table_va)
    return table_va, _read_u32(data, table_offset)


def _analyze_handler(data: bytes, image: object, target_va: int) -> tuple[int, int | None, str | None, tuple[str, ...]]:
    offset = _virtual_address_to_offset(image, target_va)
    disassembler = Cs(CS_ARCH_X86, CS_MODE_32)
    ebx_value: int | None = None
    esi_value: int | None = None
    state_gate: str | None = None
    side_effects: list[str] = []
    for instruction in disassembler.disasm(data[offset : offset + 96], target_va):
        op_str = instruction.op_str
        if instruction.mnemonic == "mov" and op_str == "al, byte ptr [edi + 0x35837e]":
            state_gate = STATE_GATE_FIELD
        elif instruction.mnemonic == "call" and op_str == "dword ptr [0x66b668]":
            side_effects.append("stores timestamp/gettick result at client+0x357eac")
        elif instruction.mnemonic == "mov" and op_str.startswith("ebx, "):
            ebx_value = _immediate(op_str)
        elif instruction.mnemonic == "mov" and op_str.startswith("esi, "):
            if op_str == "esi, ebx":
                esi_value = ebx_value
            else:
                esi_value = _immediate(op_str)
        elif instruction.mnemonic == "jmp" and op_str == f"0x{DISPATCH_TAIL_VA:x}":
            break
        elif instruction.mnemonic == "ret":
            break
    if esi_value is None:
        raise ValueError(f"transport handler does not queue an internal code: 0x{target_va:08x}")
    return esi_value, ebx_value, state_gate, tuple(dict.fromkeys(side_effects))


def build_transport_dispatch_index(source: Path) -> dict[str, object]:
    data = source.read_bytes()
    image = _parse_pe_image(data)
    entries: list[TransportDispatchEntry] = []
    for code in TRACKED_TRANSPORT_CODES:
        table_va, target_va = _target_for_code(data, image, code)
        internal_code, paired_code, state_gate, side_effects = _analyze_handler(data, image, target_va)
        entries.append(
            TransportDispatchEntry(
                transport_code=code,
                table_virtual_address=table_va,
                target_virtual_address=target_va,
                internal_code=internal_code,
                paired_internal_code=paired_code,
                state_gate=state_gate,
                side_effects=side_effects,
            )
        )
    return {
        "source": str(source),
        "jumpTableVirtualAddress": DISPATCH_JUMP_TABLE_VA,
        "jumpTableVirtualAddressHex": f"0x{DISPATCH_JUMP_TABLE_VA:08x}",
        "dispatchTailVirtualAddress": DISPATCH_TAIL_VA,
        "dispatchTailVirtualAddressHex": f"0x{DISPATCH_TAIL_VA:08x}",
        "entries": [entry.to_json() for entry in entries],
        "evidence": "direct PE jump-table decode and handler disassembly",
    }


def write_transport_dispatch_index(source: Path, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(
        json.dumps(build_transport_dispatch_index(source), ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
