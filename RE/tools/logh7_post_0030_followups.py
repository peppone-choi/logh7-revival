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


@dataclass(frozen=True, slots=True)
class FollowupTarget:
    transport_code: int
    internal_code: int
    message_name: str
    followup_va: int
    action_code: int
    entry_stride: int
    motion_apply_arguments: tuple[str, ...]
    motion_markers: tuple[tuple[str, str], ...]


FOLLOWUP_TARGETS: Final[tuple[FollowupTarget, ...]] = (
    FollowupTarget(
        0x0031,
        0x0400,
        "CommandMoveShip OK",
        0x004BE8F0,
        2,
        20,
        (
            "entity pointer from lookup(primaryEntry+0x00 dword)",
            "normalized primary path from normalizer(primary entry array)",
            "body+0x00 dword + body+0x04 dword",
            "body+0x0290 dword",
            "normalizer scratch vector",
            "body+0x0298 byte secondary count",
            "body+0x029c secondary array",
            "body+0x0294 dword",
            "entity+0x44 dword fallback",
            "entity+0x4c dword fallback",
        ),
        (
            ("mov", "edx, dword ptr [edi]"),
            ("mov", "ecx, dword ptr [esi + 0x290]"),
            ("mov", "ecx, dword ptr [esi + 0x294]"),
            ("mov", "cl, byte ptr [esi + 0x298]"),
            ("lea", "edx, [esi + 0x29c]"),
        ),
    ),
    FollowupTarget(
        0x0032,
        0x0401,
        "CommandTurnShip OK",
        0x004BEF70,
        3,
        8,
        (
            "entity pointer from lookup(primaryEntry+0x00 dword)",
            "normalized primary path from normalizer(primary entry array)",
            "body+0x00 dword + body+0x04 dword",
            "literal 0x3f800000 float",
            "stack vector from entity+0x14/entity+0x18/entity+0x1c",
            "literal waypoint count 1",
            "normalizer scratch vector",
            "body+0x0110 dword",
            "entity+0x44 dword fallback",
            "entity+0x4c dword fallback",
        ),
        (
            ("mov", "eax, dword ptr [edi]"),
            ("mov", "ecx, dword ptr [esi + 0x110]"),
            ("push", "0x3f800000"),
            ("push", "1"),
            ("mov", "ebx, dword ptr [eax + 0x14]"),
        ),
    ),
    FollowupTarget(
        0x0033,
        0x0402,
        "CommandParallelMoveShip OK",
        0x004BF320,
        4,
        20,
        (
            "entity pointer from lookup(primaryEntry+0x00 dword)",
            "normalized primary path from normalizer(primary entry array)",
            "body+0x00 dword + body+0x04 dword",
            "body+0x0290 dword",
            "normalizer scratch vector",
            "body+0x0298 byte secondary count",
            "body+0x029c secondary array",
            "body+0x0294 dword",
            "entity+0x44 dword fallback",
            "entity+0x4c dword fallback",
        ),
        (
            ("mov", "edx, dword ptr [edi]"),
            ("mov", "ecx, dword ptr [esi + 0x290]"),
            ("mov", "ecx, dword ptr [esi + 0x294]"),
            ("mov", "cl, byte ptr [esi + 0x298]"),
            ("lea", "edx, [esi + 0x29c]"),
        ),
    ),
)
ENTITY_LOOKUP_CALL: Final[int] = 0x004C7CD0
NORMALIZER_CALL: Final[int] = 0x004C8110
MOTION_APPLY_CALL: Final[int] = 0x004BF4C0
RESPONSE_STATUS: Final[str] = "follow-up consumes copied command body; no outbound response proven"


def build_post_0030_followup_effects(source: Path) -> dict[str, object]:
    data = source.read_bytes()
    image = _parse_pe_image(data)
    entries = [_entry(data, image, target) for target in FOLLOWUP_TARGETS]
    return {
        "source": str(source),
        "trigger": "candidate post-0x0030 command OK decoded bodies",
        "entries": entries,
        "evidence": "direct PE disassembly of candidate follow-up routines",
        "nextTracePoint": "derive command OK decoded body fields before enabling responses",
    }


def write_post_0030_followup_effects(source: Path, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(
        json.dumps(build_post_0030_followup_effects(source), ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def _entry(data: bytes, image: PeImage, target: FollowupTarget) -> dict[str, int | str | list[str]]:
    instructions = _instructions(data, image, target.followup_va, 384)
    _expect_activation_gate(target, instructions)
    _expect_call(target, instructions, ENTITY_LOOKUP_CALL)
    _expect_call(target, instructions, NORMALIZER_CALL)
    _expect_call(target, instructions, MOTION_APPLY_CALL)
    _expect_body_count_and_base(target, instructions)
    _expect_entry_stride(target, instructions)
    _expect_action_writes(target, instructions)
    _expect_motion_markers(target, instructions)
    return {
        "transportHex": f"0x{target.transport_code:04x}",
        "internalHex": f"0x{target.internal_code:04x}",
        "messageName": target.message_name,
        "followupVirtualAddressHex": f"0x{target.followup_va:08x}",
        "activationGate": "client+0x126718 byte",
        "entityLookupCallVirtualAddressHex": f"0x{ENTITY_LOOKUP_CALL:08x}",
        "normalizerCallVirtualAddressHex": f"0x{NORMALIZER_CALL:08x}",
        "motionApplyCallVirtualAddressHex": f"0x{MOTION_APPLY_CALL:08x}",
        "entityActionCode": target.action_code,
        "entityFlagWrites": ["entity+0x435 byte = 1", f"entity+0x62 byte = {target.action_code}"],
        "entryCountRead": "body+0x0c byte",
        "entryArrayBase": "body+0x10",
        "entryStrideBytes": target.entry_stride,
        "entityLookupKeyField": "primaryEntry+0x00 dword",
        "motionApplyArguments": list(target.motion_apply_arguments),
        "responseStatus": RESPONSE_STATUS,
    }


def _instructions(data: bytes, image: PeImage, virtual_address: int, size: int) -> list[tuple[int, str, str]]:
    offset = _virtual_address_to_offset(image, virtual_address)
    disassembler = Cs(CS_ARCH_X86, CS_MODE_32)
    return [
        (instruction.address, instruction.mnemonic, instruction.op_str)
        for instruction in disassembler.disasm(data[offset : offset + size], virtual_address)
    ]


def _expect_activation_gate(target: FollowupTarget, instructions: list[tuple[int, str, str]]) -> None:
    if _has_instruction(instructions, "mov", "al, byte ptr [ebx + 0x126718]") or _has_instruction(
        instructions, "mov", "cl, byte ptr [eax + 0x126718]"
    ):
        return
    raise ValueError(f"follow-up lacks activation gate: 0x{target.followup_va:08x}")


def _expect_call(target: FollowupTarget, instructions: list[tuple[int, str, str]], call_va: int) -> None:
    if _has_instruction(instructions, "call", f"0x{call_va:x}"):
        return
    raise ValueError(f"follow-up 0x{target.followup_va:08x} does not call 0x{call_va:08x}")


def _expect_body_count_and_base(target: FollowupTarget, instructions: list[tuple[int, str, str]]) -> None:
    has_count = any(
        mnemonic == "mov" and op_str in {"al, byte ptr [edi + 0xc]", "cl, byte ptr [eax + 0xc]", "cl, byte ptr [esi + 0xc]"}
        for _, mnemonic, op_str in instructions
    )
    has_base = any(
        mnemonic == "lea" and op_str in {"ebp, [edi + 0x10]", "edx, [eax + 0x10]", "edi, [esi + 0x10]"}
        for _, mnemonic, op_str in instructions
    )
    if has_count and has_base:
        return
    raise ValueError(f"follow-up does not read body entry count/base: 0x{target.followup_va:08x}")


def _expect_entry_stride(target: FollowupTarget, instructions: list[tuple[int, str, str]]) -> None:
    expected_operands = {f"edi, 0x{target.entry_stride:x}", f"edi, {target.entry_stride}", f"ebp, 0x{target.entry_stride:x}"}
    if any(mnemonic == "add" and op_str in expected_operands for _, mnemonic, op_str in instructions):
        return
    raise ValueError(f"follow-up does not use entry stride {target.entry_stride}: 0x{target.followup_va:08x}")


def _expect_action_writes(target: FollowupTarget, instructions: list[tuple[int, str, str]]) -> None:
    has_flag = _has_instruction(instructions, "mov", "byte ptr [eax + 0x435], 1")
    has_action = _has_instruction(instructions, "mov", f"byte ptr [eax + 0x62], {target.action_code}")
    if has_flag and has_action:
        return
    raise ValueError(f"follow-up does not write entity action {target.action_code}: 0x{target.followup_va:08x}")


def _expect_motion_markers(target: FollowupTarget, instructions: list[tuple[int, str, str]]) -> None:
    missing = [
        f"{mnemonic} {op_str}"
        for mnemonic, op_str in target.motion_markers
        if not _has_instruction(instructions, mnemonic, op_str)
    ]
    if missing:
        raise ValueError(f"follow-up motion arguments missing at 0x{target.followup_va:08x}: {missing}")
    _expect_call(target, instructions, MOTION_APPLY_CALL)


def _has_instruction(instructions: list[tuple[int, str, str]], mnemonic: str, op_str: str) -> bool:
    return any(item_mnemonic == mnemonic and item_op_str == op_str for _, item_mnemonic, item_op_str in instructions)
