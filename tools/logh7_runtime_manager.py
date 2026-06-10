from __future__ import annotations

import json
import struct
from dataclasses import dataclass
from pathlib import Path
from typing import Final

from capstone import CS_ARCH_X86, CS_MODE_32, Cs

if __package__:
    from .logh7_child_codec import _parse_pe_image, _virtual_address_to_offset
    from .logh7_runtime_manager_callback import build_runtime_manager_callback_gate_schema
    from .logh7_runtime_manager_cleanup import build_runtime_manager_cleanup_loop_schema
    from .logh7_runtime_manager_member_slot import build_runtime_manager_member_slot_schema
else:
    from logh7_child_codec import _parse_pe_image, _virtual_address_to_offset
    from logh7_runtime_manager_callback import build_runtime_manager_callback_gate_schema
    from logh7_runtime_manager_cleanup import build_runtime_manager_cleanup_loop_schema
    from logh7_runtime_manager_member_slot import build_runtime_manager_member_slot_schema


RUNTIME_MANAGER_GLOBAL: Final[int] = 0x007C25F4
RUNTIME_MANAGER_FLAG: Final[int] = 0x007C25F8
CONSTRUCTOR_WINDOW_VA: Final[int] = 0x004AD900
CONSTRUCTOR_STORE_VA: Final[int] = 0x004AD94F
DESTRUCTOR_WRAPPER_VA: Final[int] = 0x004ADAA0
DESTRUCTOR_BODY_VA: Final[int] = 0x004ADAC0
DESTRUCTOR_CLEAR_VA: Final[int] = 0x004ADB09
MANAGER_VTABLE_VA: Final[int] = 0x0066E0FC
DISPATCH_TAIL_VA: Final[int] = 0x004B78EF
QUEUE_APPEND_ENTRY_VA: Final[int] = 0x004B852B
SCAN_BYTES: Final[int] = 0x260


@dataclass(frozen=True, slots=True)
class InstructionView:
    address: int
    mnemonic: str
    op_str: str

    def to_json(self) -> dict[str, str]:
        return {
            "addressHex": f"0x{self.address:08x}",
            "mnemonic": self.mnemonic,
            "opStr": self.op_str,
        }


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
) -> InstructionView:
    for instruction in instructions:
        if instruction.address == address and instruction.mnemonic == mnemonic and instruction.op_str == op_str:
            return instruction
    raise ValueError(f"required instruction missing at 0x{address:08x}: {mnemonic} {op_str}")


def _find_previous_push(instructions: list[InstructionView], address: int) -> int:
    previous_push: int | None = None
    for instruction in instructions:
        if instruction.address >= address:
            break
        if instruction.mnemonic == "push" and instruction.op_str.startswith("0x"):
            previous_push = int(instruction.op_str, 16)
    if previous_push is None:
        raise ValueError(f"previous push immediate missing before 0x{address:08x}")
    return previous_push


def _u32_at_va(source: Path, virtual_address: int) -> int:
    data = source.read_bytes()
    image = _parse_pe_image(data)
    offset = _virtual_address_to_offset(image, virtual_address)
    return struct.unpack_from("<I", data, offset)[0]


def _constructor_schema(instructions: list[InstructionView]) -> dict[str, object]:
    _require_instruction(
        instructions,
        address=CONSTRUCTOR_STORE_VA,
        mnemonic="mov",
        op_str="dword ptr [0x7c25f4], ebp",
    )
    _require_instruction(
        instructions,
        address=0x004AD962,
        mnemonic="mov",
        op_str="byte ptr [0x7c25f8], 0",
    )
    callbacks = []
    for address in (0x004AD94A, 0x004AD97B, 0x004AD9C1):
        instruction = _require_instruction(
            instructions,
            address=address,
            mnemonic="push",
            op_str=f"0x{_find_previous_push(instructions, address + 1):x}",
        )
        callbacks.append(
            {
                "pushVirtualAddressHex": f"0x{address:08x}",
                "callbackVirtualAddressHex": f"0x{int(instruction.op_str, 16):08x}",
            }
        )
    return {
        "globalStoreVirtualAddressHex": f"0x{CONSTRUCTOR_STORE_VA:08x}",
        "storedRegister": "ebp",
        "allocationCallVirtualAddressHex": "0x00612570",
        "allocationSizeHex": f"0x{_find_previous_push(instructions, 0x004AD945):08x}",
        "flagClearVirtualAddressHex": "0x004ad962",
        "postRegisterCallbacks": callbacks,
    }


def _destructor_schema(source: Path) -> dict[str, object]:
    wrapper_instructions = _instructions(source, DESTRUCTOR_WRAPPER_VA, 0x20)
    body_instructions = _instructions(source, DESTRUCTOR_BODY_VA, 0x80)
    _require_instruction(wrapper_instructions, address=DESTRUCTOR_WRAPPER_VA, mnemonic="push", op_str="esi")
    _require_instruction(wrapper_instructions, address=0x004ADAA3, mnemonic="call", op_str="0x4adac0")
    _require_instruction(
        body_instructions,
        address=0x004ADAF6,
        mnemonic="mov",
        op_str="ecx, dword ptr [edi + 0x40]",
    )
    _require_instruction(body_instructions, address=0x004ADB01, mnemonic="call", op_str="0x403c50")
    _require_instruction(
        body_instructions,
        address=DESTRUCTOR_CLEAR_VA,
        mnemonic="mov",
        op_str="dword ptr [0x7c25f4], 0",
    )
    return {
        "entryKind": "virtual-destructor-wrapper",
        "wrapperVirtualAddressHex": f"0x{DESTRUCTOR_WRAPPER_VA:08x}",
        "bodyVirtualAddressHex": f"0x{DESTRUCTOR_BODY_VA:08x}",
        "directBodyCalls": [
            {
                "callVirtualAddressHex": "0x004adaa3",
                "targetVirtualAddressHex": f"0x{DESTRUCTOR_BODY_VA:08x}",
                "role": "wrapper calls destructor body before optional object free",
            }
        ],
        "preClearShutdownCall": {
            "sourceRegister": "edi+0x40",
            "callVirtualAddressHex": "0x004adb01",
            "targetVirtualAddressHex": "0x00403c50",
            "role": "member shutdown call runs immediately before global clear",
        },
        "globalClearVirtualAddressHex": f"0x{DESTRUCTOR_CLEAR_VA:08x}",
        "globalClearValue": 0,
    }


def _vtable_bindings(source: Path) -> list[dict[str, str]]:
    slot0 = _u32_at_va(source, MANAGER_VTABLE_VA)
    if slot0 != DESTRUCTOR_WRAPPER_VA:
        raise ValueError(
            f"runtime manager vtable slot0 drift: expected 0x{DESTRUCTOR_WRAPPER_VA:08x}, got 0x{slot0:08x}"
        )
    return [
        {
            "objectField": "manager+0x00",
            "vtableVirtualAddressHex": f"0x{MANAGER_VTABLE_VA:08x}",
            "slot0VirtualAddressHex": f"0x{slot0:08x}",
            "slot0Role": "virtual destructor wrapper",
        }
    ]


def _dispatch_tail_schema(source: Path) -> dict[str, str]:
    instructions = _instructions(source, DISPATCH_TAIL_VA, 0x20)
    _require_instruction(instructions, address=DISPATCH_TAIL_VA, mnemonic="mov", op_str="eax, dword ptr [0x7c25f4]")
    _require_instruction(instructions, address=0x004B78F4, mnemonic="test", op_str="eax, eax")
    _require_instruction(instructions, address=0x004B78F9, mnemonic="jne", op_str="0x4b852b")
    return {
        "dispatchTailVirtualAddressHex": f"0x{DISPATCH_TAIL_VA:08x}",
        "runtimeManagerGlobalHex": f"0x{RUNTIME_MANAGER_GLOBAL:08x}",
        "appendEntryVirtualAddressHex": f"0x{QUEUE_APPEND_ENTRY_VA:08x}",
        "branch": "jne append only when runtime manager global is non-null",
    }


def build_runtime_manager_index(source: Path) -> dict[str, object]:
    instructions = _instructions(source, CONSTRUCTOR_WINDOW_VA, SCAN_BYTES)
    constructor = _constructor_schema(instructions)
    return {
        "source": str(source),
        "runtimeManagerGlobalHex": f"0x{RUNTIME_MANAGER_GLOBAL:08x}",
        "runtimeManagerFlagHex": f"0x{RUNTIME_MANAGER_FLAG:08x}",
        "constructor": constructor,
        "destructor": _destructor_schema(source),
        "vtableBindings": _vtable_bindings(source),
        "cleanupLoop": build_runtime_manager_cleanup_loop_schema(source),
        "registeredCallbackGate": build_runtime_manager_callback_gate_schema(source),
        "stateTriggerMemberSlotEffect": build_runtime_manager_member_slot_schema(source),
        "dispatchTailPrerequisite": _dispatch_tail_schema(source),
        "evidence": "real PE disassembly of runtime manager global set/clear and dispatch tail branch",
        "nextTracePoint": "instrument state trigger member slot 0x00402880 return/effects or 0x004ac430 payload-2 path",
    }


def write_runtime_manager_index(source: Path, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(
        json.dumps(build_runtime_manager_index(source), ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
