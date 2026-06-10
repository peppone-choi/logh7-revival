from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Final

from capstone import CS_ARCH_X86, CS_MODE_32, Cs

if __package__:
    from .logh7_child_codec import _parse_pe_image, _virtual_address_to_offset
else:
    from logh7_child_codec import _parse_pe_image, _virtual_address_to_offset


CLEANUP_LOOP_VA: Final[int] = 0x004ADCE0
REGISTERED_CALLBACK_VA: Final[int] = 0x004ADD60
REGISTERED_CALLBACK_PUSH_VA: Final[int] = 0x004AD97B
VIRTUAL_DESTRUCTOR_CALL_VA: Final[int] = 0x004ADD4E
VIRTUAL_DESTRUCTOR_RETURN_VA: Final[int] = 0x004ADD50


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
    raise ValueError(f"cleanup instruction missing at 0x{address:08x}: {mnemonic} {op_str}")


def build_runtime_manager_cleanup_loop_schema(source: Path) -> dict[str, str]:
    instructions = _instructions(source, CLEANUP_LOOP_VA, 0x80)
    _require_instruction(instructions, address=CLEANUP_LOOP_VA, mnemonic="push", op_str="ebp")
    _require_instruction(instructions, address=0x004ADCE7, mnemonic="mov", op_str="ebp, dword ptr [edi + 0x24]")
    _require_instruction(instructions, address=0x004ADCF2, mnemonic="mov", op_str="eax, dword ptr [esi + 0x10]")
    _require_instruction(instructions, address=0x004ADCF9, mnemonic="mov", op_str="ecx, dword ptr [esi + 0xc]")
    _require_instruction(instructions, address=0x004ADCFF, mnemonic="call", op_str="eax")
    _require_instruction(instructions, address=0x004ADD3D, mnemonic="mov", op_str="al, byte ptr [edi + 0x32]")
    _require_instruction(instructions, address=VIRTUAL_DESTRUCTOR_CALL_VA, mnemonic="call", op_str="dword ptr [edx]")
    _require_instruction(instructions, address=0x004ADD53, mnemonic="ret", op_str="")
    return {
        "role": "manager callback-list cleanup and optional self-delete",
        "entryVirtualAddressHex": f"0x{CLEANUP_LOOP_VA:08x}",
        "listHeadOffsetHex": "0x00000024",
        "callbackContextOffsetHex": "0x0000000c",
        "callbackPointerOffsetHex": "0x00000010",
        "callbackInvokeVirtualAddressHex": "0x004adcff",
        "selfDeleteGateOffsetHex": "0x00000032",
        "virtualDestructorCallVirtualAddressHex": f"0x{VIRTUAL_DESTRUCTOR_CALL_VA:08x}",
        "virtualDestructorReturnAddressHex": f"0x{VIRTUAL_DESTRUCTOR_RETURN_VA:08x}",
        "registeredCallbackVirtualAddressHex": f"0x{REGISTERED_CALLBACK_VA:08x}",
        "registeredCallbackPushVirtualAddressHex": f"0x{REGISTERED_CALLBACK_PUSH_VA:08x}",
    }
