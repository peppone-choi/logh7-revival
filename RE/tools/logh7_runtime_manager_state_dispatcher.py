from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Final

from capstone import CS_ARCH_X86, CS_MODE_32, Cs

if __package__:
    from .logh7_child_codec import _parse_pe_image, _virtual_address_to_offset
else:
    from logh7_child_codec import _parse_pe_image, _virtual_address_to_offset


DISPATCHER_VA: Final[int] = 0x004AC350
ZERO_FLAG_DISPATCHER_VA: Final[int] = 0x004AC2C0


@dataclass(frozen=True, slots=True)
class InstructionView:
    address: int
    mnemonic: str
    op_str: str


def _instructions(source: Path, virtual_address: int, size: int) -> list[InstructionView]:
    data = source.read_bytes()
    image = _parse_pe_image(data)
    offset = _virtual_address_to_offset(image, virtual_address)
    disassembler = Cs(CS_ARCH_X86, CS_MODE_32)
    return [
        InstructionView(address=ins.address, mnemonic=ins.mnemonic, op_str=ins.op_str)
        for ins in disassembler.disasm(data[offset : offset + size], virtual_address)
    ]


def _require_instruction(
    instructions: list[InstructionView],
    *,
    address: int,
    mnemonic: str,
    op_str: str,
) -> None:
    for instruction in instructions:
        if instruction.address == address and instruction.mnemonic == mnemonic and instruction.op_str == op_str:
            return
    raise ValueError(f"state dispatcher instruction missing at 0x{address:08x}: {mnemonic} {op_str}")


def _verify_flag_three_dispatcher(source: Path) -> None:
    instructions = _instructions(source, DISPATCHER_VA, 0xE0)
    expected = (
        (0x004AC357, "mov", "edi, dword ptr [esp + 0x24]"),
        (0x004AC35B, "mov", "al, byte ptr [edi + 0xaa]"),
        (0x004AC36C, "call", "0x6122a0"),
        (0x004AC37D, "mov", "ebp, 3"),
        (0x004AC382, "call", "0x6122b0"),
        (0x004AC38B, "mov", "eax, dword ptr [edi + 0x24]"),
        (0x004AC398, "mov", "eax, dword ptr [esi + 0x10]"),
        (0x004AC3A4, "mov", "dword ptr [edx], ebp"),
        (0x004AC3BB, "mov", "edx, dword ptr [esi + 0xc]"),
        (0x004AC3BE, "push", "edx"),
        (0x004AC3BF, "call", "eax"),
        (0x004AC3C1, "mov", "eax, dword ptr [esi + 0x10]"),
        (0x004AC406, "mov", "byte ptr [edi + 0xaa], 0"),
        (0x004AC421, "call", "0x6122c0"),
    )
    for address, mnemonic, op_str in expected:
        _require_instruction(instructions, address=address, mnemonic=mnemonic, op_str=op_str)


def _verify_flag_zero_dispatcher(source: Path) -> None:
    instructions = _instructions(source, ZERO_FLAG_DISPATCHER_VA, 0x90)
    expected = (
        (0x004AC2C7, "mov", "ebp, dword ptr [edi + 0x34]"),
        (0x004AC2D2, "mov", "eax, dword ptr [esi + 0x10]"),
        (0x004AC2D9, "mov", "ecx, dword ptr [esi + 0xc]"),
        (0x004AC2DC, "push", "0"),
        (0x004AC2DE, "push", "ecx"),
        (0x004AC2DF, "call", "eax"),
        (0x004AC31D, "mov", "al, byte ptr [edi + 0xa8]"),
        (0x004AC327, "mov", "al, byte ptr [edi + 0xa9]"),
    )
    for address, mnemonic, op_str in expected:
        _require_instruction(instructions, address=address, mnemonic=mnemonic, op_str=op_str)


def build_runtime_manager_state_dispatcher_schema(source: Path) -> dict[str, object]:
    _verify_flag_three_dispatcher(source)
    _verify_flag_zero_dispatcher(source)
    return {
        "role": "dispatches runtime manager callback-list entries with flag payloads",
        "entryVirtualAddressHex": f"0x{DISPATCHER_VA:08x}",
        "activeGateOffsetHex": "0x000000aa",
        "stateCallbackListOffsetHex": "0x00000024",
        "callbackContextOffsetHex": "0x0000000c",
        "callbackPointerOffsetHex": "0x00000010",
        "payloadFlagLiteral": 3,
        "payloadFlagStoreVirtualAddressHex": "0x004ac3a4",
        "callbackInvokeVirtualAddressHex": "0x004ac3bf",
        "returnAddressAfterCallbackHex": "0x004ac3c1",
        "member40StatusCallVirtualAddressHex": "0x004ac36c",
        "member40StatusTargetHex": "0x006122a0",
        "member40ResetCallVirtualAddressHex": "0x004ac382",
        "member40ResetTargetHex": "0x006122b0",
        "activeGateClearVirtualAddressHex": "0x004ac406",
        "statusTwoHelperCallVirtualAddressHex": "0x004ac421",
        "statusTwoHelperTargetHex": "0x006122c0",
        "pairedZeroFlagDispatcher": {
            "entryVirtualAddressHex": f"0x{ZERO_FLAG_DISPATCHER_VA:08x}",
            "stateCallbackListOffsetHex": "0x00000034",
            "payloadFlagLiteral": 0,
            "callbackInvokeVirtualAddressHex": "0x004ac2df",
            "returnAddressAfterCallbackHex": "0x004ac2e1",
            "postDispatchGateOffsetsHex": ["0x000000a8", "0x000000a9"],
        },
        "runtimeObservation": "G054 observed returnAddress=0x004ac3c1 flagArg=3",
        "nextTracePoint": "instrument dispatcher gates at manager+0xa8/+0xa9/+0xaa or list offsets +0x24/+0x34",
    }
