from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Final

from capstone import CS_ARCH_X86, CS_MODE_32, Cs

if __package__:
    from .logh7_child_codec import _parse_pe_image, _virtual_address_to_offset
else:
    from logh7_child_codec import _parse_pe_image, _virtual_address_to_offset


MEMBER_SLOT_ENTRY_VA: Final[int] = 0x00402880
MEMBER_SLOT_SCAN_BYTES: Final[int] = 0x180


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
    raise ValueError(f"member slot instruction missing at 0x{address:08x}: {mnemonic} {op_str}")


def build_runtime_manager_member_slot_schema(source: Path) -> dict[str, object]:
    instructions = _instructions(source, MEMBER_SLOT_ENTRY_VA, MEMBER_SLOT_SCAN_BYTES)
    expected = (
        (0x00402880, "mov", "eax, dword ptr fs:[0]"),
        (0x0040289F, "mov", "esi, ecx"),
        (0x004028A1, "mov", "eax, dword ptr [esi]"),
        (0x004028A3, "push", "4"),
        (0x004028A5, "call", "dword ptr [eax + 8]"),
        (0x004028A8, "mov", "edi, dword ptr [esp + 0xd8]"),
        (0x004028B5, "mov", "word ptr [ebp + 6], di"),
        (0x004028C2, "mov", "ecx, dword ptr [esp + 0xdc]"),
        (0x004028CC, "lea", "ecx, [esi + 4]"),
        (0x004028CF, "call", "0x404980"),
        (0x004028D6, "jne", "0x4029b8"),
        (0x004028E7, "push", "0x75e888"),
        (0x004028ED, "call", "0x5fe8f3"),
        (0x00402920, "call", "0x4033d0"),
        (0x00402964, "call", "0x5fe804"),
        (0x00402969, "mov", "eax, dword ptr [0x66bfe4]"),
        (0x00402995, "call", "0x403160"),
        (0x004029C0, "call", "0x6123d0"),
        (0x004029CA, "call", "dword ptr [eax + 0xc]"),
        (0x004029E5, "ret", "0xc"),
    )
    for address, mnemonic, op_str in expected:
        _require_instruction(instructions, address=address, mnemonic=mnemonic, op_str=op_str)
    return {
        "role": "member44 vtable slot 0x14 side-effect path reached from runtime manager state trigger",
        "entryVirtualAddressHex": f"0x{MEMBER_SLOT_ENTRY_VA:08x}",
        "thisRegister": "ecx",
        "prologueKind": "seh-frame",
        "allocationCallVirtualAddressHex": "0x004028a5",
        "allocationVtableSlotHex": "0x00000008",
        "allocatedHandleWriteOffsetHex": "0x00000006",
        "arg1StackOffsetAfterPrologueHex": "0x000000d4",
        "arg2StackOffsetAfterPrologueHex": "0x000000d8",
        "arg3StackOffsetAfterPrologueHex": "0x000000dc",
        "observedArg2LiteralHex": "0x00007000",
        "preDispatchGuardCallVirtualAddressHex": "0x004028cf",
        "preDispatchGuardTargetHex": "0x00404980",
        "successJumpVirtualAddressHex": "0x004028d6",
        "successTargetVirtualAddressHex": "0x004029b8",
        "stringFormatCallVirtualAddressHex": "0x004028ed",
        "stringFormatTargetHex": "0x005fe8f3",
        "formatStringVirtualAddressHex": "0x0075e888",
        "scratchStringBuilderCallVirtualAddressHex": "0x00402920",
        "scratchStringBuilderTargetHex": "0x004033d0",
        "payloadObjectInitCallVirtualAddressHex": "0x00402964",
        "payloadObjectInitTargetHex": "0x005fe804",
        "globalArgumentReadVirtualAddressHex": "0x00402969",
        "globalArgumentVirtualAddressHex": "0x0066bfe4",
        "dispatchCallVirtualAddressHex": "0x00402995",
        "dispatchCallTargetHex": "0x00403160",
        "cleanupCallVirtualAddressHex": "0x004029c0",
        "cleanupCallTargetHex": "0x006123d0",
        "virtualCleanupCallVirtualAddressHex": "0x004029ca",
        "virtualCleanupVtableSlotHex": "0x0000000c",
        "returnVirtualAddressHex": "0x004029e5",
        "returnBytes": 12,
        "runtimeObservation": "G060 observed thisEcX, arg1, literal arg2=0x7000, arg3, and returnAddress=0x004ac45c",
        "nextTracePoint": "instrument return/effects at 0x004029b8/0x004029e5 or the dispatch call at 0x00402995",
    }
