# /// script
# requires-python = ">=3.11"
# dependencies = ["capstone"]
# ///
from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Final

from capstone import CS_AC_READ, CS_AC_WRITE, CS_ARCH_X86, CS_MODE_32, Cs
from capstone.x86_const import X86_OP_MEM, X86_REG_INVALID

if __package__:
    from .logh7_child_codec import _parse_pe_image, _virtual_address_to_offset
else:
    from logh7_child_codec import _parse_pe_image, _virtual_address_to_offset


DEFAULT_SIZE: Final[int] = 0x80
DESCRIPTION: Final[str] = "Disassemble a virtual-address range from a LOGH VII PE image."


@dataclass(frozen=True, slots=True)
class Instruction:
    address: int
    mnemonic: str
    op_str: str

    def to_json(self) -> dict[str, str]:
        return {
            "address": f"0x{self.address:08x}",
            "mnemonic": self.mnemonic,
            "opStr": self.op_str,
        }


@dataclass(frozen=True, slots=True)
class MemoryReference:
    address: int
    mnemonic: str
    op_str: str
    target_va: int
    access: str

    def to_json(self) -> dict[str, str]:
        return {
            "address": f"0x{self.address:08x}",
            "mnemonic": self.mnemonic,
            "opStr": self.op_str,
            "targetVa": f"0x{self.target_va:08x}",
            "access": self.access,
        }


@dataclass(frozen=True, slots=True)
class VirtualRange:
    start_va: int
    size: int

    def to_json(self) -> dict[str, str]:
        return {"startVa": f"0x{self.start_va:08x}", "size": f"0x{self.size:x}"}


def parse_virtual_range(value: str) -> VirtualRange:
    start_text, sep, end_text = value.partition(":")
    start = _parse_int(start_text)
    if not sep:
        return VirtualRange(start, DEFAULT_SIZE)
    if end_text.startswith("+"):
        size = _parse_int(end_text[1:])
    else:
        end = _parse_int(end_text)
        size = end - start
    if size <= 0:
        raise argparse.ArgumentTypeError(f"range size must be positive: {value}")
    return VirtualRange(start, size)


def disassemble_range(source: Path, *, start_va: int, size: int) -> list[Instruction]:
    data = source.read_bytes()
    image = _parse_pe_image(data)
    offset = _virtual_address_to_offset(image, start_va)
    disassembler = Cs(CS_ARCH_X86, CS_MODE_32)
    return [
        Instruction(ins.address, ins.mnemonic, ins.op_str)
        for ins in disassembler.disasm(data[offset : offset + size], start_va)
    ]


def find_absolute_memory_references(
    source: Path,
    *,
    start_va: int,
    size: int,
    targets: frozenset[int],
) -> list[MemoryReference]:
    data = source.read_bytes()
    image = _parse_pe_image(data)
    offset = _virtual_address_to_offset(image, start_va)
    disassembler = Cs(CS_ARCH_X86, CS_MODE_32)
    disassembler.detail = True
    references: list[MemoryReference] = []
    for instruction in disassembler.disasm(data[offset : offset + size], start_va):
        for operand in instruction.operands:
            if operand.type != X86_OP_MEM:
                continue
            if operand.mem.base != X86_REG_INVALID or operand.mem.index != X86_REG_INVALID:
                continue
            target_va = operand.mem.disp & 0xFFFFFFFF
            if target_va not in targets:
                continue
            references.append(
                MemoryReference(
                    address=instruction.address,
                    mnemonic=instruction.mnemonic,
                    op_str=instruction.op_str,
                    target_va=target_va,
                    access=_memory_access_name(operand.access),
                )
            )
    return references


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=DESCRIPTION)
    parser.add_argument("source", type=Path)
    parser.add_argument("--range", dest="virtual_range", type=parse_virtual_range, required=True)
    parser.add_argument(
        "--xref",
        dest="xrefs",
        action="append",
        type=_parse_int,
        default=[],
        help="absolute memory address to report from the selected range",
    )
    parser.add_argument("--json", action="store_true", help="write JSON instead of text lines")
    return parser


def main() -> int:
    args = build_parser().parse_args()
    virtual_range: VirtualRange = args.virtual_range
    xrefs = frozenset(args.xrefs)
    if xrefs:
        references = find_absolute_memory_references(
            args.source,
            start_va=virtual_range.start_va,
            size=virtual_range.size,
            targets=xrefs,
        )
        if args.json:
            print(
                json.dumps(
                    {
                        "source": str(args.source),
                        "range": virtual_range.to_json(),
                        "references": [reference.to_json() for reference in references],
                    },
                    ensure_ascii=False,
                    indent=2,
                ),
            )
            return 0
        for reference in references:
            print(
                f"{reference.address:08x} {reference.access:<9} "
                f"{reference.target_va:08x} {reference.mnemonic:<8} {reference.op_str}"
            )
        return 0
    instructions = disassemble_range(args.source, start_va=virtual_range.start_va, size=virtual_range.size)
    if args.json:
        print(
            json.dumps(
                {
                    "source": str(args.source),
                    "range": virtual_range.to_json(),
                    "instructions": [instruction.to_json() for instruction in instructions],
                },
                ensure_ascii=False,
                indent=2,
            ),
        )
        return 0
    for instruction in instructions:
        print(f"{instruction.address:08x} {instruction.mnemonic:<8} {instruction.op_str}")
    return 0


def _parse_int(value: str) -> int:
    try:
        return int(value, 0)
    except ValueError as exc:
        raise argparse.ArgumentTypeError(f"invalid integer: {value}") from exc


def _memory_access_name(access: int) -> str:
    read = (access & CS_AC_READ) != 0
    write = (access & CS_AC_WRITE) != 0
    if read and write:
        return "readwrite"
    if read:
        return "read"
    if write:
        return "write"
    return "unknown"


if __name__ == "__main__":
    raise SystemExit(main())
