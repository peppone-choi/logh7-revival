from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Final

from capstone import CS_ARCH_X86, CS_MODE_32, Cs

if __package__:
    from .logh7_child_codec import PeImage, _parse_pe_image, _virtual_address_to_offset
else:
    from logh7_child_codec import PeImage, _parse_pe_image, _virtual_address_to_offset


JsonValue = str | int | bool | None | list["JsonValue"] | dict[str, "JsonValue"]
PHASE3_RECV_VA: Final[int] = 0x00645992
PHASE3_POST_RECV_VA: Final[int] = 0x00645998
PHASE3_SCAN_BYTES: Final[int] = 0xE0
G071_PRELEN_MINUS_PREBUFFER: Final[int] = 0x68
G071_PREBUFFER_PLUS68_DWORD: Final[int] = 0x16A1A046


@dataclass(frozen=True, slots=True)
class InstructionView:
    address: int
    mnemonic: str
    op_str: str


def build_phase3_recv_parser_index(source: Path) -> dict[str, JsonValue]:
    data = source.read_bytes()
    image = _parse_pe_image(data)
    instructions = _instructions(data, image, PHASE3_RECV_VA, PHASE3_SCAN_BYTES)
    _require_markers(instructions, _phase3_markers())
    _require_htons_calls(instructions)
    return {
        "source": str(source),
        "purpose": "phase3 recv context and parser-path schema for server response work",
        "phase3RecvCallsite": {
            "virtualAddressHex": f"0x{PHASE3_RECV_VA:08x}",
            "returnAddressHex": f"0x{PHASE3_POST_RECV_VA:08x}",
            "winsockImport": "recv ordinal 14 via IAT 0x0066b6b0",
            "runtimeEvidence": "G070/G071 SRP1 siteId=2 preserved full trace while capturing recv pre/post args",
        },
        "postRecv": {
            "storesReturnMinusOneTo": "phase-object+0x20",
            "decodeInputExpression": "ebp+0x04",
            "decodeHelperVirtualAddressHex": "0x00648d42",
            "decodeHelperRole": "allocates/returns decoded phase3 payload buffer from recv context input",
        },
        "runtimeContext": {
            "g071Evidence": ".omo/ulw-loop/evidence/g071-socket-recv-phase3-follow-analysis.json",
            "g071PreBufferRole": "phase3 recv context object, not raw socket byte buffer",
            "g071PreLenMinusPreBufferHex": f"0x{G071_PRELEN_MINUS_PREBUFFER:08x}",
            "g071PreBufferPlus68ObservedDwordHex": f"0x{G071_PREBUFFER_PLUS68_DWORD:08x}",
            "g071ObservedOffset70Hex": "0x0000000a",
        },
        "transportBuild": {
            "payloadLengthRegister": "ebp",
            "wireLengthRegister": "ebp-0x02",
            "decodedBufferRegister": "esi",
            "destinationBufferRegister": "ebx",
            "lengthEndianCall": "htons",
            "checksumEndianCall": "htons",
            "checksumAlgorithm": "xor dwords and trailing bytes, then fold high 16 bits into low 16 bits",
            "sinkCallVirtualAddressHex": "0x00645a53",
            "sinkVtableSlotHex": "0x0000000c",
        },
        "serverSchemaImplication": (
            "phase3 response must decode to a payload whose decoded byte count drives ebp; "
            "recv context +0x68 is live parser state, not a raw socket byte buffer"
        ),
        "nextRuntimeProbe": "hook or emulate the 0x00645a53 sink arguments after decoded length/checksum are built",
    }


def write_phase3_recv_parser_index(source: Path, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(
        json.dumps(build_phase3_recv_parser_index(source), ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def _instructions(data: bytes, image: PeImage, virtual_address: int, size: int) -> list[InstructionView]:
    offset = _virtual_address_to_offset(image, virtual_address)
    disassembler = Cs(CS_ARCH_X86, CS_MODE_32)
    return [
        InstructionView(address=instruction.address, mnemonic=instruction.mnemonic, op_str=instruction.op_str)
        for instruction in disassembler.disasm(data[offset : offset + size], virtual_address)
    ]


def _phase3_markers() -> tuple[InstructionView, ...]:
    return (
        InstructionView(0x00645992, "call", "dword ptr [0x66b6b0]"),
        InstructionView(0x00645998, "dec", "eax"),
        InstructionView(0x00645999, "mov", "dword ptr [edi + 0x20], eax"),
        InstructionView(0x0064599C, "lea", "eax, [ebp + 4]"),
        InstructionView(0x006459A4, "call", "0x648d42"),
        InstructionView(0x006459D6, "lea", "ebx, [eax + 2]"),
        InstructionView(0x006459E2, "lea", "edi, [ebx + 2]"),
        InstructionView(0x006459E7, "mov", "word ptr [ebx], ax"),
        InstructionView(0x006459ED, "rep movsd", "dword ptr es:[edi], dword ptr [esi]"),
        InstructionView(0x006459FA, "rep movsb", "byte ptr es:[edi], byte ptr [esi]"),
        InstructionView(0x006459FC, "lea", "eax, [ebp - 2]"),
        InstructionView(0x00645A12, "xor", "edx, eax"),
        InstructionView(0x00645A24, "inc", "esi"),
        InstructionView(0x00645A30, "push", "ecx"),
        InstructionView(0x00645A3F, "mov", "word ptr [esi], ax"),
        InstructionView(0x00645A53, "call", "dword ptr [eax + 0xc]"),
    )


def _require_markers(instructions: list[InstructionView], markers: tuple[InstructionView, ...]) -> None:
    observed = {(instruction.address, instruction.mnemonic, instruction.op_str) for instruction in instructions}
    missing = [
        f"0x{marker.address:08x}: {marker.mnemonic} {marker.op_str}"
        for marker in markers
        if (marker.address, marker.mnemonic, marker.op_str) not in observed
    ]
    if missing:
        raise ValueError(f"phase3 recv parser markers missing: {missing}")


def _require_htons_calls(instructions: list[InstructionView]) -> None:
    htons_calls = [
        instruction.address
        for instruction in instructions
        if instruction.mnemonic == "call" and instruction.op_str == "dword ptr [0x66b6e8]"
    ]
    if htons_calls != [0x006459DA, 0x00645A31]:
        raise ValueError(f"phase3 recv parser htons callsites drifted: {[hex(address) for address in htons_calls]}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Index LOGH VII phase3 recv parser context.")
    parser.add_argument("source", type=Path)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    write_phase3_recv_parser_index(args.source, args.out)
    print(f"wrote {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
