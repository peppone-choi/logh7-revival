from __future__ import annotations

import argparse
import json
import re
import struct
from dataclasses import dataclass
from pathlib import Path
from typing import Final

from capstone import CS_ARCH_X86, CS_MODE_32, Cs

if __package__:
    from .logh7_child_codec import PeImage, _parse_pe_image, _virtual_address_to_offset
    from .logh7_disasm_range import VirtualRange, find_memory_range_references, load_function_ranges
else:
    from logh7_child_codec import PeImage, _parse_pe_image, _virtual_address_to_offset
    from logh7_disasm_range import VirtualRange, find_memory_range_references, load_function_ranges

DISPATCH_ENTRY_VA: Final[int] = 0x004BA316
DISPATCH_TAIL_VA: Final[int] = 0x004BDD33
UNHANDLED_VA: Final[int] = 0x004BDCEE
SMALL_TABLE_VA: Final[int] = 0x004BDE7C
SMALL_BASE_CODE: Final[int] = 0x0200
LARGE_INDEX_TABLE_VA: Final[int] = 0x004BDFD4
LARGE_TARGET_TABLE_VA: Final[int] = 0x004BDF28
LARGE_BASE_CODE: Final[int] = 0x033F
RANGE_0F_DISPATCH_VA: Final[int] = 0x004BCFEE
STATE_BLOCK_RANGE: Final[VirtualRange] = VirtualRange(0x009D2A30, 0x50)
DEFAULT_REDEX_EXPORT: Final[Path] = Path(__file__).resolve().parents[1] / ".omo" / "ghidra" / "export" / "G7MTClient"
CLIENT_STATE_WRITE_RE: Final[re.Pattern[str]] = re.compile(
    r"(?:byte|word|dword) ptr \[(?:esi|ecx|edx) \+ 0x([0-9a-f]+)\]"
)


@dataclass(frozen=True, slots=True)
class TrackedResponse:
    internal_code: int
    message_name: str
    route_kind: str
    handler_virtual_address: int
    state_writes: tuple[str, ...]
    table_virtual_address: int | None = None
    table_index: int | None = None
    route_evidence: str = ""

    def to_json(self) -> dict[str, object]:
        table_va = self.table_virtual_address
        table_index = self.table_index
        return {
            "internalCode": self.internal_code,
            "internalHex": f"0x{self.internal_code:04x}",
            "messageName": self.message_name,
            "routeKind": self.route_kind,
            "handlerVirtualAddress": self.handler_virtual_address,
            "handlerVirtualAddressHex": f"0x{self.handler_virtual_address:08x}",
            "tableVirtualAddress": table_va,
            "tableVirtualAddressHex": None if table_va is None else f"0x{table_va:08x}",
            "tableIndex": table_index,
            "stateWrites": list(self.state_writes),
            "routeEvidence": self.route_evidence,
        }


def build_inbound_response_dispatch_index(source: Path) -> dict[str, object]:
    data = source.read_bytes()
    image = _parse_pe_image(data)
    _expect_dispatch_markers(data, image)
    responses = [
        _small_table_response(data, image, 0x0200, "SSLoginOK"),
        _small_table_response(data, image, 0x0205, "SSGameLoginOK"),
        _large_index_response(data, image, 0x0400, "Post0030Candidate31"),
        _large_index_response(data, image, 0x0401, "Post0030Candidate32"),
        _large_index_response(data, image, 0x0402, "Post0030Candidate33"),
        _range_response(data, image, 0x0F01, "ResponseWorldInitialize", 0x004BD0C9),
        _range_response(data, image, 0x0F03, "ResponseGridInitialize", 0x004BD121),
    ]
    return {
        "source": str(source),
        "dispatchEntryVirtualAddress": DISPATCH_ENTRY_VA,
        "dispatchEntryVirtualAddressHex": f"0x{DISPATCH_ENTRY_VA:08x}",
        "dispatchTailVirtualAddress": DISPATCH_TAIL_VA,
        "dispatchTailVirtualAddressHex": f"0x{DISPATCH_TAIL_VA:08x}",
        "unhandledVirtualAddress": UNHANDLED_VA,
        "unhandledVirtualAddressHex": f"0x{UNHANDLED_VA:08x}",
        "trackedResponses": [response.to_json() for response in responses],
        "stateBlockRange": STATE_BLOCK_RANGE.to_json(),
        "stateBlockWriterCandidates": _state_block_writer_candidates(source),
        "negativeRuntimeEvidence": (
            "G075 proved 0x004b78a0/0x004b78ef did not record inbound server responses "
            "for the current 0x0001/0x0003/0x0013/0x0014 probe route"
        ),
        "evidence": "direct PE disassembly plus small/large internal dispatch table reads",
        "nextTracePoint": "hook decoded-response dispatch entry 0x004ba316 or its caller with accepted internal code and body pointer",
    }


def write_inbound_response_dispatch_index(source: Path, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(
        json.dumps(build_inbound_response_dispatch_index(source), ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def _read_u32(data: bytes, image: PeImage, virtual_address: int) -> int:
    return struct.unpack_from("<I", data, _virtual_address_to_offset(image, virtual_address))[0]


def _instructions(data: bytes, image: PeImage, virtual_address: int, size: int) -> list[tuple[str, str]]:
    offset = _virtual_address_to_offset(image, virtual_address)
    disassembler = Cs(CS_ARCH_X86, CS_MODE_32)
    return [(item.mnemonic, item.op_str) for item in disassembler.disasm(data[offset : offset + size], virtual_address)]


def _expect_dispatch_markers(data: bytes, image: PeImage) -> None:
    entry = _instructions(data, image, DISPATCH_ENTRY_VA, 64)
    range_0f = _instructions(data, image, RANGE_0F_DISPATCH_VA, 224)
    required_entry = {
        ("mov", "eax, dword ptr [ebp + 8]"),
        ("jmp", "dword ptr [eax*4 + 0x4bde7c]"),
    }
    required_range = {
        ("cmp", "eax, 0xf03"),
        ("je", "0x4bd121"),
        ("cmp", "eax, 0xf01"),
    }
    missing = sorted(required_entry - set(entry)) + sorted(required_range - set(range_0f))
    if missing:
        raise ValueError(f"inbound response dispatch markers missing: {missing}")


def _state_writes(data: bytes, image: PeImage, handler_va: int) -> tuple[str, ...]:
    writes: list[str] = []
    for mnemonic, op_str in _instructions(data, image, handler_va, 128):
        if mnemonic == "jmp" and op_str == f"0x{DISPATCH_TAIL_VA:x}":
            break
        if mnemonic != "mov":
            continue
        match = CLIENT_STATE_WRITE_RE.search(op_str)
        if match is None:
            continue
        writes.append(f"client+0x{int(match.group(1), 16):06x}")
    return tuple(dict.fromkeys(writes))


def _state_block_writer_candidates(source: Path) -> list[dict[str, str]]:
    if not DEFAULT_REDEX_EXPORT.exists():
        return []
    references = find_memory_range_references(
        source,
        scan_ranges=load_function_ranges(DEFAULT_REDEX_EXPORT),
        target_range=STATE_BLOCK_RANGE,
        access="write",
    )
    return [reference.to_json() for reference in references]


def _small_table_response(data: bytes, image: PeImage, internal_code: int, message_name: str) -> TrackedResponse:
    table_va = SMALL_TABLE_VA + (internal_code - SMALL_BASE_CODE) * 4
    handler_va = _read_u32(data, image, table_va)
    return TrackedResponse(
        internal_code=internal_code,
        message_name=message_name,
        route_kind="small-direct-table",
        handler_virtual_address=handler_va,
        state_writes=_state_writes(data, image, handler_va),
        table_virtual_address=table_va,
        route_evidence="dispatch entry subtracts 0x0201 and jumps through 0x004bde7c",
    )


def _large_index_response(data: bytes, image: PeImage, internal_code: int, message_name: str) -> TrackedResponse:
    switch_index = internal_code - LARGE_BASE_CODE
    index_va = LARGE_INDEX_TABLE_VA + switch_index
    table_index = data[_virtual_address_to_offset(image, index_va)]
    target_entry_va = LARGE_TARGET_TABLE_VA + table_index * 4
    handler_va = _read_u32(data, image, target_entry_va)
    return TrackedResponse(
        internal_code=internal_code,
        message_name=message_name,
        route_kind="large-index-table",
        handler_virtual_address=handler_va,
        state_writes=_state_writes(data, image, handler_va),
        table_virtual_address=target_entry_va,
        table_index=table_index,
        route_evidence="range 0x033f..0x0423 loads byte index from 0x004bdfd4 and target from 0x004bdf28",
    )


def _range_response(
    data: bytes,
    image: PeImage,
    internal_code: int,
    message_name: str,
    handler_va: int,
) -> TrackedResponse:
    return TrackedResponse(
        internal_code=internal_code,
        message_name=message_name,
        route_kind="range-compare",
        handler_virtual_address=handler_va,
        state_writes=_state_writes(data, image, handler_va),
        route_evidence="range compare block at 0x004bcfee checks 0x0f03 and 0x0f01 before falling to unhandled",
    )


def main() -> int:
    parser = argparse.ArgumentParser(description="Index LOGH VII inbound decoded-response dispatch routes.")
    parser.add_argument("source", type=Path)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    write_inbound_response_dispatch_index(args.source, args.out)
    print(f"wrote {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
