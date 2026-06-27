from __future__ import annotations

import argparse
import json
import struct
from pathlib import Path
from typing import Final

from capstone import CS_ARCH_X86, CS_MODE_32, Cs

if __package__:
    from .logh7_child_codec import _parse_pe_image, _virtual_address_to_offset
else:
    from logh7_child_codec import _parse_pe_image, _virtual_address_to_offset


TARGET_INSTRUCTION_VA: Final[int] = 0x004AD7E0
SETUP_CONSTRUCTOR_VA: Final[int] = 0x004AD780
SETUP_CONSTRUCTOR_CALL_VA: Final[int] = 0x004AD756
ALLOCATOR_WRAPPER_VA: Final[int] = 0x004AD710
ALLOCATOR_WRAPPER_CALL_VA: Final[int] = 0x004AD3E6
SESSION_BOOTSTRAP_VA: Final[int] = 0x004AD120
SESSION_BOOTSTRAP_CALL_VA: Final[int] = 0x004B64A7
ROBOT_BOOTSTRAP_VA: Final[int] = 0x004B6480
ROBOT_API_ENTRY_VA: Final[int] = 0x0051BD70
ROBOT_API_TAIL_JUMP_VA: Final[int] = 0x0051BDAD
ARGV_TABLE_VA: Final[int] = 0x0076EE04
ARGV_SLOT_SCAN_START_VA: Final[int] = 0x007C0B4C
SESSION_MAP_GLOBAL_VA: Final[int] = 0x007C2478
SESSION_MAP_STORE_VA: Final[int] = 0x004AD3F0
SESSION_MAP_CLEANUP_CALL_VA: Final[int] = 0x0051B91A
FULL_MAP_FACTORY_CALL_VA: Final[int] = 0x004AD864
FULL_MAP_FACTORY_TARGET_VA: Final[int] = 0x00612030
FULL_MAP_HANDLER_TABLE_VTABLE_VA: Final[int] = 0x0066E0F0
EMPTY_MAP_FUNCTION_VA: Final[int] = 0x004AC070
EMPTY_MAP_FACTORY_CALL_VA: Final[int] = 0x004AC0C9

Instruction = tuple[int, str, str]


def _hex(virtual_address: int) -> str:
    return f"0x{virtual_address:08x}"


def _instructions(data: bytes, image, virtual_address: int, size: int) -> list[Instruction]:
    offset = _virtual_address_to_offset(image, virtual_address)
    disassembler = Cs(CS_ARCH_X86, CS_MODE_32)
    return [
        (ins.address, ins.mnemonic, ins.op_str)
        for ins in disassembler.disasm(data[offset : offset + size], virtual_address)
    ]


def _require(instructions: list[Instruction], address: int, mnemonic: str, op_str: str) -> None:
    if (address, mnemonic, op_str) not in instructions:
        raise ValueError(f"required instruction missing at {_hex(address)}: {mnemonic} {op_str}")


def _direct_branches(data: bytes, image, target: int) -> list[dict[str, str]]:
    branches: list[tuple[int, int]] = []
    for section in image.sections:
        start = section.raw_pointer
        for offset in range(start, max(start, start + section.raw_size - 5)):
            opcode = data[offset]
            if opcode not in (0xE8, 0xE9):
                continue
            source = image.image_base + section.virtual_address + (offset - start)
            destination = (source + 5 + struct.unpack_from("<i", data, offset + 1)[0]) & 0xFFFFFFFF
            if destination == target:
                branches.append((source, opcode))
    result: list[dict[str, str]] = []
    for source, opcode in sorted(branches):
        key = "callVirtualAddressHex" if opcode == 0xE8 else "jumpVirtualAddressHex"
        result.append({key: _hex(source), "targetVirtualAddressHex": _hex(target)})
    return result


def _u32_at_va(data: bytes, image, virtual_address: int) -> int:
    return struct.unpack_from("<I", data, _virtual_address_to_offset(image, virtual_address))[0]


def _c_string_at_va(data: bytes, image, virtual_address: int) -> str:
    offset = _virtual_address_to_offset(image, virtual_address)
    raw = data[offset : offset + 0x100]
    terminator = raw.find(b"\0")
    if terminator >= 0:
        raw = raw[:terminator]
    return raw.decode("cp932")


def _static_argv(data: bytes, image) -> list[dict[str, str | int]]:
    entries: list[dict[str, str | int]] = []
    for index in range(6):
        pointer = _u32_at_va(data, image, ARGV_TABLE_VA + index * 4)
        entries.append(
            {
                "index": index,
                "pointerVirtualAddressHex": _hex(pointer),
                "text": _c_string_at_va(data, image, pointer),
            }
        )
    return entries


def _verify_robot_api(data: bytes, image) -> None:
    instructions = _instructions(data, image, ROBOT_API_ENTRY_VA, 0x50)
    _require(instructions, ROBOT_API_ENTRY_VA, "mov", "ecx, dword ptr [0x7ccffc]")
    _require(instructions, ROBOT_API_TAIL_JUMP_VA, "jmp", "0x4b6480")


def _verify_robot_bootstrap(data: bytes, image) -> None:
    instructions = _instructions(data, image, ROBOT_BOOTSTRAP_VA, 0x50)
    _require(instructions, 0x004B6480, "mov", "ecx, 0x76ee08")
    _require(instructions, 0x004B6485, "mov", "eax, 0x7c0b4c")
    _require(instructions, 0x004B64A0, "push", "0x76ee04")
    _require(instructions, 0x004B64A5, "push", "5")
    _require(instructions, SESSION_BOOTSTRAP_CALL_VA, "call", "0x4ad120")


def _verify_session_bootstrap(data: bytes, image) -> None:
    instructions = _instructions(data, image, SESSION_BOOTSTRAP_VA, 0x320)
    _require(instructions, 0x004AD146, "cmp", "dword ptr [ebp + 8], 5")
    _require(instructions, ALLOCATOR_WRAPPER_CALL_VA, "call", "0x4ad710")
    _require(instructions, SESSION_MAP_STORE_VA, "mov", "dword ptr [0x7c2478], ecx")


def _verify_allocator(data: bytes, image) -> None:
    instructions = _instructions(data, image, ALLOCATOR_WRAPPER_VA, 0x70)
    _require(instructions, 0x004AD726, "push", "0x48")
    _require(instructions, SETUP_CONSTRUCTOR_CALL_VA, "call", "0x4ad780")


def _verify_constructor(data: bytes, image) -> None:
    instructions = _instructions(data, image, SETUP_CONSTRUCTOR_VA, 0x100)
    _require(instructions, TARGET_INSTRUCTION_VA, "mov", "dword ptr [esi + 8], edi")
    _require(instructions, 0x004AD817, "mov", "dword ptr [ebp + 0x18], 0x66e0f0")
    _require(instructions, 0x004AD847, "push", "eax")
    _require(instructions, 0x004AD848, "push", "3")
    _require(instructions, FULL_MAP_FACTORY_CALL_VA, "call", "0x612030")


def _verify_empty_map(data: bytes, image) -> None:
    instructions = _instructions(data, image, EMPTY_MAP_FUNCTION_VA, 0x70)
    _require(instructions, 0x004AC0B7, "push", "eax")
    _require(instructions, 0x004AC0B8, "push", "4")
    _require(instructions, EMPTY_MAP_FACTORY_CALL_VA, "call", "0x612030")


def _verify_markers(data: bytes, image) -> None:
    _verify_robot_api(data, image)
    _verify_robot_bootstrap(data, image)
    _verify_session_bootstrap(data, image)
    _verify_allocator(data, image)
    _verify_constructor(data, image)
    _verify_empty_map(data, image)


def _entry(data: bytes, image, virtual_address: int) -> dict[str, object]:
    return {
        "entryVirtualAddressHex": _hex(virtual_address),
        "directCallers": _direct_branches(data, image, virtual_address),
    }


def _trigger_chain() -> list[dict[str, str]]:
    chain = (
        (ROBOT_API_ENTRY_VA, ROBOT_API_TAIL_JUMP_VA, ROBOT_BOOTSTRAP_VA),
        (ROBOT_BOOTSTRAP_VA, SESSION_BOOTSTRAP_CALL_VA, SESSION_BOOTSTRAP_VA),
        (SESSION_BOOTSTRAP_VA, ALLOCATOR_WRAPPER_CALL_VA, ALLOCATOR_WRAPPER_VA),
        (ALLOCATOR_WRAPPER_VA, SETUP_CONSTRUCTOR_CALL_VA, SETUP_CONSTRUCTOR_VA),
    )
    return [
        {"fromVirtualAddressHex": _hex(source), "edgeVirtualAddressHex": _hex(edge), "toVirtualAddressHex": _hex(target)}
        for source, edge, target in chain
    ]


def build_session_setup_trigger_index(source: Path) -> dict[str, object]:
    data = source.read_bytes()
    image = _parse_pe_image(data)
    _verify_markers(data, image)
    return {
        "targetInstructionVirtualAddressHex": _hex(TARGET_INSTRUCTION_VA),
        "conclusion": (
            "0x004ad7e0 is reached by the robot/autoclient bootstrap chain, "
            "not by a direct post-login response handler."
        ),
        "currentRuntimeStatus": (
            "G113 RST1 runtime evidence proved this trigger chain is reached during the normal "
            "GUI-driven login probe; the active blocker is now the post-0x31 lobby message body, "
            "not absence of the full handler-map setup."
        ),
        "robotApiEntry": _entry(data, image, ROBOT_API_ENTRY_VA)
        | {"tailJumpVirtualAddressHex": _hex(ROBOT_API_TAIL_JUMP_VA)},
        "robotBootstrap": _entry(data, image, ROBOT_BOOTSTRAP_VA)
        | {
            "argcLiteral": 5,
            "argvTableVirtualAddressHex": _hex(ARGV_TABLE_VA),
            "argvSlotScanStartVirtualAddressHex": _hex(ARGV_SLOT_SCAN_START_VA),
            "staticArgv": _static_argv(data, image),
        },
        "sessionBootstrap": _entry(data, image, SESSION_BOOTSTRAP_VA) | {"minimumArgc": 5},
        "allocatorWrapper": _entry(data, image, ALLOCATOR_WRAPPER_VA) | {"allocationSizeHex": "0x00000048"},
        "setupConstructor": _entry(data, image, SETUP_CONSTRUCTOR_VA),
        "sessionMapGlobal": {
            "globalVirtualAddressHex": _hex(SESSION_MAP_GLOBAL_VA),
            "storeVirtualAddressHex": _hex(SESSION_MAP_STORE_VA),
            "cleanupCallVirtualAddressHex": _hex(SESSION_MAP_CLEANUP_CALL_VA),
        },
        "fullHandlerMap": {
            "factoryCallVirtualAddressHex": _hex(FULL_MAP_FACTORY_CALL_VA),
            "factoryTargetVirtualAddressHex": _hex(FULL_MAP_FACTORY_TARGET_VA),
            "handlerCount": 3,
            "descriptorExpression": "ebp+0x14",
            "handlerTableVtableHex": _hex(FULL_MAP_HANDLER_TABLE_VTABLE_VA),
        },
        "emptyMapContrast": {
            "functionEntryVirtualAddressHex": _hex(EMPTY_MAP_FUNCTION_VA),
            "factoryCallVirtualAddressHex": _hex(EMPTY_MAP_FACTORY_CALL_VA),
            "handlerCount": 4,
            "descriptorCanBeNull": True,
        },
        "triggerChain": _trigger_chain(),
        "nextRuntimeProbe": (
            "instrument handler input at 0x00612357 and the post-key lobby parser around "
            "0x004ac700 to capture the message type and stream bytes required after G117/G118."
        ),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Index the trigger chain for the full LOGH7 session setup map.")
    parser.add_argument("source", type=Path)
    parser.add_argument("--out", type=Path)
    args = parser.parse_args()
    text = json.dumps(build_session_setup_trigger_index(args.source), ensure_ascii=False, indent=2) + "\n"
    if args.out is None:
        print(text, end="")
        return 0
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(text, encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
