from __future__ import annotations

import argparse
import json
import struct
from pathlib import Path
from typing import Final

from capstone import CS_ARCH_X86, CS_MODE_32, Cs

if __package__:
    from .logh7_child_codec import PeImage, _parse_pe_image, _virtual_address_to_offset
else:
    from logh7_child_codec import PeImage, _parse_pe_image, _virtual_address_to_offset


ROUTER_VA: Final[int] = 0x006130A0
OPCODE_READ_CALL_VA: Final[int] = 0x006130F3
FAST_PATH_COMPARE_VA: Final[int] = 0x006130FB
FAST_PATH_BRANCH_VA: Final[int] = 0x00613101
EMPTY_MAP_CLEANUP_VA: Final[int] = 0x00613150
FAST_PATH_VA: Final[int] = 0x00613169
INNER_NTOHS_CALL_VA: Final[int] = 0x006131D1
INNER_31_COMPARE_VA: Final[int] = 0x006131D7
KEYSETUP_CALL_VA: Final[int] = 0x00613202
RECURSIVE_ROUTER_CALL_VA: Final[int] = 0x00613212
PENDING_STORE_VA: Final[int] = 0x00613222

CONSUMER_LOOP_VA: Final[int] = 0x006122C0
INITIAL_ROUTER_CALL_VA: Final[int] = 0x00612309
HANDLER_LOOKUP_CALL_VA: Final[int] = 0x00612343
HANDLER_DISPATCH_CALL_VA: Final[int] = 0x00612357
READER_ADVANCE_VA: Final[int] = 0x00612339
LOOP_ROUTER_CALL_VA: Final[int] = 0x00612393
HANDLER_LOOKUP_VA: Final[int] = 0x00612510

LOBBY_HANDLER_VTABLE_VA: Final[int] = 0x0066E080
LOGIN_PROCESSOR_HANDLE_VA: Final[int] = 0x004AC700
LOGIN_PROCESSOR_7001_BRANCH_VA: Final[int] = 0x004AC737
LOGIN_PROCESSOR_7001_TARGET_VA: Final[int] = 0x004AC7F3
LOGIN_PROCESSOR_7002_BRANCH_VA: Final[int] = 0x004AC73E
LOGIN_PROCESSOR_7002_TARGET_VA: Final[int] = 0x004AC758

Instruction = tuple[int, str, str]


def _hex(virtual_address: int) -> str:
    return f"0x{virtual_address:08x}"


def _instructions(data: bytes, image: PeImage, virtual_address: int, size: int) -> list[Instruction]:
    offset = _virtual_address_to_offset(image, virtual_address)
    disassembler = Cs(CS_ARCH_X86, CS_MODE_32)
    return [
        (instruction.address, instruction.mnemonic, instruction.op_str)
        for instruction in disassembler.disasm(data[offset : offset + size], virtual_address)
    ]


def _require(instructions: list[Instruction], address: int, mnemonic: str, op_str: str) -> None:
    if (address, mnemonic, op_str) not in instructions:
        raise ValueError(f"required instruction missing at {_hex(address)}: {mnemonic} {op_str}")


def _read_u32(data: bytes, image: PeImage, virtual_address: int) -> int:
    return struct.unpack_from("<I", data, _virtual_address_to_offset(image, virtual_address))[0]


def _verify_router(data: bytes, image: PeImage) -> None:
    instructions = _instructions(data, image, ROUTER_VA, 0x1B0)
    _require(instructions, OPCODE_READ_CALL_VA, "call", "0x614c70")
    _require(instructions, FAST_PATH_COMPARE_VA, "cmp", "word ptr [esp + 0x20], 0x30")
    _require(instructions, FAST_PATH_BRANCH_VA, "je", "0x613169")
    _require(instructions, 0x00613108, "mov", "esi, dword ptr [esi + 0x14]")
    _require(instructions, 0x00613151, "call", "0x614bb0")
    _require(instructions, 0x00613157, "call", "0x614b30")
    _require(instructions, INNER_NTOHS_CALL_VA, "call", "dword ptr [0x66b6c8]")
    _require(instructions, INNER_31_COMPARE_VA, "cmp", "ax, 0x31")
    _require(instructions, KEYSETUP_CALL_VA, "call", "dword ptr [ebp + 4]")
    _require(instructions, RECURSIVE_ROUTER_CALL_VA, "call", "0x6130a0")
    _require(instructions, 0x0061322C, "mov", "dword ptr [esi + 0x28], edi")
    _require(instructions, 0x0061322F, "mov", "byte ptr [esi + 0x30], 1")
    _require(instructions, 0x00613233, "mov", "word ptr [esi + 0x2c], dx")
    _require(instructions, 0x00613237, "mov", "dword ptr [eax], edi")


def _verify_consumer_loop(data: bytes, image: PeImage) -> None:
    loop = _instructions(data, image, CONSUMER_LOOP_VA, 0x120)
    _require(loop, INITIAL_ROUTER_CALL_VA, "call", "0x6130a0")
    _require(loop, READER_ADVANCE_VA, "add", "eax, edx")
    _require(loop, HANDLER_LOOKUP_CALL_VA, "call", "0x612510")
    _require(loop, HANDLER_DISPATCH_CALL_VA, "call", "dword ptr [edx + 8]")
    _require(loop, LOOP_ROUTER_CALL_VA, "call", "0x6130a0")

    lookup = _instructions(data, image, HANDLER_LOOKUP_VA, 0x20)
    _require(lookup, HANDLER_LOOKUP_VA, "mov", "ecx, dword ptr [ecx + 0x10]")
    _require(lookup, 0x0061251A, "call", "dword ptr [eax + 8]")


def _verify_lobby_parser(data: bytes, image: PeImage) -> None:
    if _read_u32(data, image, LOBBY_HANDLER_VTABLE_VA) != LOGIN_PROCESSOR_HANDLE_VA:
        raise ValueError("lobby handler vtable no longer points at LoginProcessorImp::handle_message")
    handler = _instructions(data, image, LOGIN_PROCESSOR_HANDLE_VA, 0x200)
    _require(handler, 0x004AC72A, "and", "eax, 0xffff")
    _require(handler, 0x004AC731, "sub", "ecx, 0x7001")
    _require(handler, LOGIN_PROCESSOR_7001_BRANCH_VA, "je", "0x4ac7f3")
    _require(handler, LOGIN_PROCESSOR_7002_BRANCH_VA, "je", "0x4ac758")
    _require(handler, 0x004AC75E, "mov", "al, byte ptr [ecx + 2]")
    _require(handler, 0x004AC808, "mov", "edx, dword ptr [ebx + 0xc]")
    _require(handler, 0x004AC88E, "mov", "cx, word ptr [ebx + 8]")


def build_inner_0030_chain_index(source: Path) -> dict[str, object]:
    data = source.read_bytes()
    image = _parse_pe_image(data)
    _verify_router(data, image)
    _verify_consumer_loop(data, image)
    _verify_lobby_parser(data, image)
    return {
        "source": str(source),
        "transportRouter": {
            "entryVirtualAddressHex": _hex(ROUTER_VA),
            "opcodeReadCallHex": _hex(OPCODE_READ_CALL_VA),
            "fastPathTransportHex": "0x0030",
            "fastPathCompareHex": _hex(FAST_PATH_COMPARE_VA),
            "fastPathBranchHex": _hex(FAST_PATH_BRANCH_VA),
            "fastPathTargetHex": _hex(FAST_PATH_VA),
            "non0030MapRoot": "manager+0x14",
            "emptyMapCleanupHex": _hex(EMPTY_MAP_CLEANUP_VA),
        },
        "innerFastPath": {
            "entryVirtualAddressHex": _hex(FAST_PATH_VA),
            "selectorOffsetField": "manager+0x12",
            "innerCodeSource": "ntohs(word[manager+0x18 + selectorOffset])",
            "innerNtohsCallHex": _hex(INNER_NTOHS_CALL_VA),
            "keysetupInnerHex": "0x0031",
            "keysetupCompareHex": _hex(INNER_31_COMPARE_VA),
            "keysetupCallHex": _hex(KEYSETUP_CALL_VA),
            "keysetupHandlerSource": "manager object vtable +0x04",
            "successFollowup": "recursive transport-router call",
            "recursiveRouterCallHex": _hex(RECURSIVE_ROUTER_CALL_VA),
        },
        "non31PendingPath": {
            "entryVirtualAddressHex": _hex(PENDING_STORE_VA),
            "pendingReaderField": "manager+0x24",
            "pendingPtrField": "manager+0x28",
            "pendingLenField": "manager+0x2c",
            "pendingFlagField": "manager+0x30",
            "returnValue": "address of manager+0x24 pending reader",
        },
        "consumerLoop": {
            "entryVirtualAddressHex": _hex(CONSUMER_LOOP_VA),
            "initialRouterCallHex": _hex(INITIAL_ROUTER_CALL_VA),
            "readerAdvanceHex": _hex(READER_ADVANCE_VA),
            "handlerLookupCallHex": _hex(HANDLER_LOOKUP_CALL_VA),
            "handlerLookupVirtualAddressHex": _hex(HANDLER_LOOKUP_VA),
            "handlerDispatchCallHex": _hex(HANDLER_DISPATCH_CALL_VA),
            "loopRouterCallHex": _hex(LOOP_ROUTER_CALL_VA),
            "meaning": "a non-null pending reader returned from 0x006130a0 is dispatched through the manager handler table, then the loop asks the router for the next buffered frame",
        },
        "postKeyLobbyParser": {
            "handlerVtableVirtualAddressHex": _hex(LOBBY_HANDLER_VTABLE_VA),
            "loginProcessorHandleVirtualAddressHex": _hex(LOGIN_PROCESSOR_HANDLE_VA),
            "messageInputCallHex": _hex(HANDLER_DISPATCH_CALL_VA),
            "handlerLookupCallHex": _hex(HANDLER_LOOKUP_CALL_VA),
            "supportedInnerMessageHexes": ["0x7001", "0x7002"],
            "messageCodeArgument": "[esp+0x40] low16 in LoginProcessorImp::handle_message",
            "bodyPointerArgument": "[esp+0x4c]",
            "code7001BodyReads": ["body+0x04", "body+0x08 uint16", "body+0x0c dword"],
            "code7002BodyReads": ["body+0x02 byte"],
            "g118RuntimeNegative": (
                "post-key 0x7001/0x7002 short-body sweep created one lobby message but failed with "
                "mtNetStreamInputBuffer operator >> (uint16_t): no data to input"
            ),
        },
        "nextRuntimeExperiment": {
            "name": "chained-0030-after-keysetup",
            "firstFrame": "transport 0x0030 whose inner[0:2] is forced to 0x0031, proven to return AL=1 at 0x00613202",
            "secondFrame": "immediate second transport 0x0030 with inner[0:2] != 0x0031 to exercise 0x00613222 pending store",
            "writePolicy": "send both encrypted 0x0030 transport frames in one same socket write so the recursive router can read the second frame from the buffered reader",
            "expectedProbe": "handler-input probe at 0x00612357 captures produced message type plus stream cursor/remaining bytes; pendingFlag=0 keeps the blocker before handler dispatch",
        },
        "evidence": "direct PE disassembly of 0x006130a0, the 0x0030 fast path, and the 0x006122c0 consumer loop",
    }


def write_inner_0030_chain_index(source: Path, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(
        json.dumps(build_inner_0030_chain_index(source), ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def main() -> int:
    parser = argparse.ArgumentParser(description="Index the LOGH VII transport-0x0030 inner follow-up chain.")
    parser.add_argument("source", type=Path)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    write_inner_0030_chain_index(args.source, args.out)
    print(f"wrote {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
