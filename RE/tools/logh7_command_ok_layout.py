from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Final

from capstone import CS_ARCH_X86, CS_MODE_32, Cs

if __package__:
    from .logh7_child_codec import PeImage, _parse_pe_image, _virtual_address_to_offset
else:
    from logh7_child_codec import PeImage, _parse_pe_image, _virtual_address_to_offset


LAYOUT_STATUS: Final[str] = "decoded field offsets proven; semantic field names not yet proven"


@dataclass(frozen=True, slots=True)
class StreamField:
    offset: int
    stream_slot: str

    def to_json(self) -> dict[str, str]:
        return {"offset": f"0x{self.offset:04x}", "streamSlot": self.stream_slot}


@dataclass(frozen=True, slots=True)
class ArrayLayout:
    count_offset: int
    max_count: int
    entry_offset: int
    entry_size: int
    stream_slots: tuple[str, ...]

    def to_json(self) -> dict[str, int | str | list[str]]:
        return {
            "countOffset": f"0x{self.count_offset:04x}",
            "maxCount": self.max_count,
            "entryOffset": f"0x{self.entry_offset:04x}",
            "entrySizeBytes": self.entry_size,
            "streamSlots": list(self.stream_slots),
        }


@dataclass(frozen=True, slots=True)
class CommandOkTarget:
    transport_code: int
    message_name: str
    decoded_body_bytes: int
    output_to_stream_va: int
    input_from_stream_va: int
    primary_array: ArrayLayout
    post_array_scalars: tuple[StreamField, ...]
    secondary_array: ArrayLayout | None
    output_markers: tuple[tuple[str, str], ...]
    input_markers: tuple[tuple[str, str], ...]


MOVE_ARRAY: Final[ArrayLayout] = ArrayLayout(
    count_offset=0x000C,
    max_count=32,
    entry_offset=0x0010,
    entry_size=20,
    stream_slots=("0x20", "0x1c", "0x1c", "0x1c", "0x1c"),
)
MOVE_SECONDARY: Final[ArrayLayout] = ArrayLayout(
    count_offset=0x0298,
    max_count=32,
    entry_offset=0x029C,
    entry_size=12,
    stream_slots=("0x1c", "0x1c", "0x1c"),
)
MOVE_SCALARS: Final[tuple[StreamField, ...]] = (StreamField(0x0290, "0x1c"), StreamField(0x0294, "0x1c"))
MOVE_OUTPUT_MARKERS: Final[tuple[tuple[str, str], ...]] = (
    ("mov", "al, byte ptr [ebp + 0xc]"),
    ("cmp", "al, 0x20"),
    ("call", "dword ptr [edx + 0x28]"),
    ("lea", "edi, [ebp + 0x14]"),
    ("add", "edi, 0x14"),
    ("mov", "eax, dword ptr [ebp + 0x290]"),
    ("mov", "eax, dword ptr [ebp + 0x294]"),
    ("mov", "al, byte ptr [ebp + 0x298]"),
    ("lea", "edi, [ebp + 0x2a0]"),
    ("add", "edi, 0xc"),
)
MOVE_INPUT_MARKERS: Final[tuple[tuple[str, str], ...]] = (
    ("lea", "edi, [ebp + 0x14]"),
    ("add", "edi, 0x14"),
    ("lea", "eax, [ebp + 0x290]"),
    ("lea", "eax, [ebp + 0x294]"),
    ("lea", "ebx, [ebp + 0x298]"),
    ("call", "dword ptr [edx + 0x24]"),
    ("cmp", "al, 0x20"),
    ("lea", "edi, [ebp + 0x2a0]"),
    ("add", "edi, 0xc"),
)
TURN_ARRAY: Final[ArrayLayout] = ArrayLayout(
    count_offset=0x000C,
    max_count=32,
    entry_offset=0x0010,
    entry_size=8,
    stream_slots=("0x1c", "0x0c"),
)
TURN_SCALARS: Final[tuple[StreamField, ...]] = (StreamField(0x0110, "0x0c"),)
TURN_OUTPUT_MARKERS: Final[tuple[tuple[str, str], ...]] = (
    ("mov", "al, byte ptr [ebp + 0xc]"),
    ("cmp", "al, 0x20"),
    ("call", "dword ptr [edx + 0x28]"),
    ("lea", "edi, [ebp + 0x14]"),
    ("add", "edi, 8"),
    ("mov", "eax, dword ptr [ebp + 0x110]"),
)
TURN_INPUT_MARKERS: Final[tuple[tuple[str, str], ...]] = (
    ("lea", "ebp, [edi + 0xc]"),
    ("call", "dword ptr [edx + 0x24]"),
    ("cmp", "al, 0x20"),
    ("add", "edi, 8"),
    ("add", "edi, 0x110"),
    ("call", "dword ptr [edx + 0xc]"),
)


TARGETS: Final[tuple[CommandOkTarget, ...]] = (
    CommandOkTarget(0x0031, "CommandMoveShip OK", 1052, 0x00492930, 0x0049A680, MOVE_ARRAY, MOVE_SCALARS, MOVE_SECONDARY, MOVE_OUTPUT_MARKERS, MOVE_INPUT_MARKERS),
    CommandOkTarget(0x0032, "CommandTurnShip OK", 276, 0x00493030, 0x0049B040, TURN_ARRAY, TURN_SCALARS, None, TURN_OUTPUT_MARKERS, TURN_INPUT_MARKERS),
    CommandOkTarget(0x0033, "CommandParallelMoveShip OK", 1052, 0x00493570, 0x0049B6C0, MOVE_ARRAY, MOVE_SCALARS, MOVE_SECONDARY, MOVE_OUTPUT_MARKERS, MOVE_INPUT_MARKERS),
)


def build_command_ok_layout(source: Path) -> dict[str, object]:
    data = source.read_bytes()
    image = _parse_pe_image(data)
    return {
        "source": str(source),
        "trigger": "candidate 0x0031/0x0032/0x0033 command OK decoded bodies",
        "entries": [_entry(data, image, target) for target in TARGETS],
        "evidence": "direct PE disassembly of matching input/output stream routines",
        "nextTracePoint": "construct and runtime-probe encrypted command OK bodies",
    }


def write_command_ok_layout(source: Path, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(
        json.dumps(build_command_ok_layout(source), ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def _entry(data: bytes, image: PeImage, target: CommandOkTarget) -> dict[str, object]:
    _expect_markers(target, _instructions(data, image, target.output_to_stream_va, 912), target.output_markers, "output")
    _expect_markers(target, _instructions(data, image, target.input_from_stream_va, 912), target.input_markers, "input")
    secondary = target.secondary_array.to_json() if target.secondary_array is not None else None
    return {
        "transportHex": f"0x{target.transport_code:04x}",
        "messageName": target.message_name,
        "decodedBodyBytes": target.decoded_body_bytes,
        "outputToStreamVirtualAddressHex": f"0x{target.output_to_stream_va:08x}",
        "inputFromStreamVirtualAddressHex": f"0x{target.input_from_stream_va:08x}",
        "primaryArray": target.primary_array.to_json(),
        "postArrayScalars": [field.to_json() for field in target.post_array_scalars],
        "secondaryArray": secondary,
        "layoutStatus": LAYOUT_STATUS,
    }


def _instructions(data: bytes, image: PeImage, virtual_address: int, size: int) -> list[tuple[int, str, str]]:
    offset = _virtual_address_to_offset(image, virtual_address)
    disassembler = Cs(CS_ARCH_X86, CS_MODE_32)
    return [
        (instruction.address, instruction.mnemonic, instruction.op_str)
        for instruction in disassembler.disasm(data[offset : offset + size], virtual_address)
    ]


def _expect_markers(
    target: CommandOkTarget,
    instructions: list[tuple[int, str, str]],
    markers: tuple[tuple[str, str], ...],
    side: str,
) -> None:
    missing = [f"{mnemonic} {op_str}" for mnemonic, op_str in markers if not _has_instruction(instructions, mnemonic, op_str)]
    if missing:
        address = target.output_to_stream_va if side == "output" else target.input_from_stream_va
        raise ValueError(f"{target.message_name} {side} layout markers missing at 0x{address:08x}: {missing}")


def _has_instruction(instructions: list[tuple[int, str, str]], mnemonic: str, op_str: str) -> bool:
    return any(item_mnemonic == mnemonic and item_op_str == op_str for _, item_mnemonic, item_op_str in instructions)
