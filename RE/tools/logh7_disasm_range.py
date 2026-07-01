# /// script
# requires-python = ">=3.11"
# dependencies = ["capstone"]
# ///
from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Final, Iterable

from capstone import CS_AC_READ, CS_AC_WRITE, CS_ARCH_X86, CS_MODE_32, Cs
from capstone.x86_const import X86_OP_IMM, X86_OP_MEM, X86_OP_REG, X86_REG_INVALID

if __package__:
    from .logh7_child_codec import _parse_pe_image, _virtual_address_to_offset
else:
    from logh7_child_codec import _parse_pe_image, _virtual_address_to_offset


DEFAULT_SIZE: Final[int] = 0x80
DESCRIPTION: Final[str] = "Disassemble a virtual-address range from a LOGH VII PE image."
VOLATILE_REGISTERS: Final[frozenset[str]] = frozenset({"eax", "ecx", "edx"})


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
    reference_kind: str = "direct"
    function_start_va: int | None = None
    function_name: str | None = None

    def to_json(self) -> dict[str, str]:
        payload = {
            "address": f"0x{self.address:08x}",
            "mnemonic": self.mnemonic,
            "opStr": self.op_str,
            "targetVa": f"0x{self.target_va:08x}",
            "access": self.access,
            "referenceKind": self.reference_kind,
        }
        if self.function_start_va is not None:
            payload["functionStartVa"] = f"0x{self.function_start_va:08x}"
        if self.function_name is not None:
            payload["functionName"] = self.function_name
        return payload


@dataclass(frozen=True, slots=True)
class FunctionRange:
    start_va: int
    size: int
    name: str

    def to_json(self) -> dict[str, str]:
        return {
            "startVa": f"0x{self.start_va:08x}",
            "size": f"0x{self.size:x}",
            "name": self.name,
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
    offset, bounded_size = _bounded_file_slice(data, image, start_va, size)
    disassembler = Cs(CS_ARCH_X86, CS_MODE_32)
    return [
        Instruction(ins.address, ins.mnemonic, ins.op_str)
        for ins in disassembler.disasm(data[offset : offset + bounded_size], start_va)
    ]


def find_absolute_memory_references(
    source: Path,
    *,
    start_va: int,
    size: int,
    targets: frozenset[int],
    access: str = "all",
) -> list[MemoryReference]:
    """Find direct absolute memory refs in one selected range.

    Kept for backward compatibility with the original narrow helper.
    """
    data = source.read_bytes()
    image = _parse_pe_image(data)
    offset, bounded_size = _bounded_file_slice(data, image, start_va, size)
    disassembler = Cs(CS_ARCH_X86, CS_MODE_32)
    disassembler.detail = True
    references: list[MemoryReference] = []
    for instruction in disassembler.disasm(data[offset : offset + bounded_size], start_va):
        for operand in instruction.operands:
            if operand.type != X86_OP_MEM:
                continue
            if operand.mem.base != X86_REG_INVALID or operand.mem.index != X86_REG_INVALID:
                continue
            target_va = operand.mem.disp & 0xFFFFFFFF
            if target_va not in targets:
                continue
            access_name = _memory_access_name(operand.access)
            if not _access_matches(access_name, access):
                continue
            references.append(
                MemoryReference(
                    address=instruction.address,
                    mnemonic=instruction.mnemonic,
                    op_str=instruction.op_str,
                    target_va=target_va,
                    access=access_name,
                )
            )
    return references


def load_function_ranges(export: Path, *, max_function_size: int = 0x4000) -> list[FunctionRange]:
    functions_jsonl = export / "functions.jsonl"
    if not functions_jsonl.exists():
        raise FileNotFoundError(f"functions.jsonl not found: {functions_jsonl}")
    rows: list[tuple[int, str]] = []
    for line in functions_jsonl.read_text(encoding="utf-8", errors="replace").splitlines():
        if not line.strip():
            continue
        item = json.loads(line)
        rows.append((_parse_int(item["addr"]), str(item.get("name") or item["addr"])))
    rows.sort()
    ranges: list[FunctionRange] = []
    for index, (start_va, name) in enumerate(rows):
        next_va = rows[index + 1][0] if index + 1 < len(rows) else start_va + DEFAULT_SIZE
        size = next_va - start_va
        if size <= 0:
            size = DEFAULT_SIZE
        ranges.append(FunctionRange(start_va=start_va, size=min(size, max_function_size), name=name))
    return ranges


def find_memory_range_references(
    source: Path,
    *,
    scan_ranges: Iterable[FunctionRange | VirtualRange],
    target_range: VirtualRange,
    access: str = "all",
) -> list[MemoryReference]:
    """Find direct, simple tracked-register, and copy-destination refs.

    This is intentionally a candidate scanner, not a proof-grade data-flow
    analyzer. It catches the LOGH VII patterns that broad grep misses:
    `lea reg, [DAT]` / `mov reg, DAT` followed by `[reg+offset]`, plus
    `rep movs*` with a tracked EDI destination.
    """
    data = source.read_bytes()
    image = _parse_pe_image(data)
    disassembler = Cs(CS_ARCH_X86, CS_MODE_32)
    disassembler.detail = True
    references: list[MemoryReference] = []
    for scan_range in scan_ranges:
        start_va = scan_range.start_va
        size = scan_range.size
        function_start_va = scan_range.start_va if isinstance(scan_range, FunctionRange) else None
        function_name = scan_range.name if isinstance(scan_range, FunctionRange) else None
        try:
            offset, bounded_size = _bounded_file_slice(data, image, start_va, size)
        except ValueError:
            continue
        register_values: dict[str, int] = {}
        for instruction in disassembler.disasm(data[offset : offset + bounded_size], start_va):
            references.extend(
                _instruction_memory_range_references(
                    instruction,
                    target_range=target_range,
                    register_values=register_values,
                    access_filter=access,
                    function_start_va=function_start_va,
                    function_name=function_name,
                )
            )
            _update_register_tracker(instruction, register_values)
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
    parser.add_argument(
        "--xref-range",
        type=parse_virtual_range,
        default=None,
        help="memory address range to report, including simple register-relative candidates",
    )
    parser.add_argument("--access", choices=("all", "read", "write"), default="all")
    parser.add_argument("--all-functions", action="store_true", help="scan every function from --export functions.jsonl")
    parser.add_argument(
        "--export",
        type=Path,
        default=Path(".omo/ghidra/export/G7MTClient"),
        help="Ghidra redex export directory used with --all-functions",
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
            access=args.access,
        )
        return _emit_references(args, virtual_range, references, "references")
    if args.xref_range is not None:
        scan_ranges: list[FunctionRange | VirtualRange]
        if args.all_functions:
            scan_ranges = load_function_ranges(args.export)
        else:
            scan_ranges = [virtual_range]
        references = find_memory_range_references(
            args.source,
            scan_ranges=scan_ranges,
            target_range=args.xref_range,
            access=args.access,
        )
        return _emit_references(args, virtual_range, references, "rangeReferences")
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


def _emit_references(args: argparse.Namespace, virtual_range: VirtualRange, references: list[MemoryReference], key: str) -> int:
    if args.json:
        payload: dict[str, object] = {
            "source": str(args.source),
            "range": virtual_range.to_json(),
            "accessFilter": args.access,
            key: [reference.to_json() for reference in references],
        }
        if args.xref_range is not None:
            payload["xrefRange"] = args.xref_range.to_json()
        print(json.dumps(payload, ensure_ascii=False, indent=2))
        return 0
    for reference in references:
        function = ""
        if reference.function_start_va is not None:
            function = f"{reference.function_start_va:08x} {reference.function_name or ''} "
        print(
            f"{function}{reference.address:08x} {reference.access:<9} {reference.reference_kind:<16} "
            f"{reference.target_va:08x} {reference.mnemonic:<8} {reference.op_str}"
        )
    return 0


def _bounded_file_slice(data: bytes, image, start_va: int, size: int) -> tuple[int, int]:
    offset = _virtual_address_to_offset(image, start_va)
    rva = start_va - image.image_base
    for section in image.sections:
        section_size = max(section.virtual_size, section.raw_size)
        section_start = section.virtual_address
        if section_start <= rva < section_start + section_size:
            section_file_end = section.raw_pointer + section.raw_size
            return offset, max(0, min(size, section_file_end - offset, len(data) - offset))
    return offset, min(size, len(data) - offset)


def _instruction_memory_range_references(
    instruction,
    *,
    target_range: VirtualRange,
    register_values: dict[str, int],
    access_filter: str,
    function_start_va: int | None,
    function_name: str | None,
) -> list[MemoryReference]:
    references: list[MemoryReference] = []
    for operand in instruction.operands:
        if operand.type != X86_OP_MEM:
            continue
        resolved = _resolve_memory_operand(instruction, operand, register_values)
        if resolved is None:
            continue
        target_va, reference_kind = resolved
        byte_width = max(int(getattr(operand, "size", 0) or 1), 1)
        if not _ranges_overlap(target_va, byte_width, target_range.start_va, target_range.size):
            continue
        access_name = _memory_access_name(operand.access)
        if not _access_matches(access_name, access_filter):
            continue
        references.append(
            MemoryReference(
                address=instruction.address,
                mnemonic=instruction.mnemonic,
                op_str=instruction.op_str,
                target_va=target_va,
                access=access_name,
                reference_kind=reference_kind,
                function_start_va=function_start_va,
                function_name=function_name,
            )
        )
    if instruction.mnemonic.startswith("rep movs") or instruction.mnemonic.startswith("movs"):
        edi_target = register_values.get("edi")
        if edi_target is not None and _ranges_overlap(edi_target, 4, target_range.start_va, target_range.size):
            if _access_matches("write", access_filter):
                references.append(
                    MemoryReference(
                        address=instruction.address,
                        mnemonic=instruction.mnemonic,
                        op_str=instruction.op_str,
                        target_va=edi_target,
                        access="write",
                        reference_kind="copy-destination",
                        function_start_va=function_start_va,
                        function_name=function_name,
                    )
                )
    return references


def _resolve_memory_operand(instruction, operand, register_values: dict[str, int]) -> tuple[int, str] | None:
    mem = operand.mem
    if mem.index != X86_REG_INVALID:
        return None
    displacement = mem.disp & 0xFFFFFFFF
    if mem.base == X86_REG_INVALID:
        return displacement, "direct"
    base_name = instruction.reg_name(mem.base)
    if base_name in register_values:
        return (register_values[base_name] + mem.disp) & 0xFFFFFFFF, "tracked-register"
    return None


def _update_register_tracker(instruction, register_values: dict[str, int]) -> None:
    mnemonic = instruction.mnemonic
    if mnemonic == "call":
        for name in VOLATILE_REGISTERS:
            register_values.pop(name, None)
        return
    operands = list(instruction.operands)
    if not operands or operands[0].type != X86_OP_REG:
        return
    dest_name = instruction.reg_name(operands[0].reg)
    if mnemonic == "mov" and len(operands) >= 2:
        src = operands[1]
        if src.type == X86_OP_IMM:
            register_values[dest_name] = src.imm & 0xFFFFFFFF
        else:
            register_values.pop(dest_name, None)
        return
    if mnemonic == "lea" and len(operands) >= 2 and operands[1].type == X86_OP_MEM:
        resolved = _resolve_memory_operand(instruction, operands[1], register_values)
        if resolved is not None:
            register_values[dest_name] = resolved[0]
        else:
            register_values.pop(dest_name, None)
        return
    if mnemonic in {"add", "sub"} and len(operands) >= 2 and operands[1].type == X86_OP_IMM:
        current = register_values.get(dest_name)
        if current is not None:
            delta = operands[1].imm if mnemonic == "add" else -operands[1].imm
            register_values[dest_name] = (current + delta) & 0xFFFFFFFF
        return
    register_values.pop(dest_name, None)


def _ranges_overlap(left_start: int, left_size: int, right_start: int, right_size: int) -> bool:
    return left_start < right_start + right_size and right_start < left_start + left_size


def _access_matches(access_name: str, access_filter: str) -> bool:
    if access_filter == "all":
        return True
    if access_filter == "read":
        return access_name in {"read", "readwrite"}
    if access_filter == "write":
        return access_name in {"write", "readwrite"}
    raise ValueError(f"unknown access filter: {access_filter}")


if __name__ == "__main__":
    raise SystemExit(main())
