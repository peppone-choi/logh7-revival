from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Final

from capstone import CS_ARCH_X86, CS_MODE_32, Cs

if __package__:
    from .logh7_child_codec import PeImage, _parse_pe_image, _virtual_address_to_offset
else:
    from logh7_child_codec import PeImage, _parse_pe_image, _virtual_address_to_offset


@dataclass(frozen=True, slots=True)
class PayloadLayoutTarget:
    transport_code: int
    internal_code: int
    handler_va: int


PAYLOAD_LAYOUT_TARGETS: Final[tuple[PayloadLayoutTarget, ...]] = (
    PayloadLayoutTarget(0x0031, 0x0400, 0x004BB5D9),
    PayloadLayoutTarget(0x0032, 0x0401, 0x004BB63A),
    PayloadLayoutTarget(0x0033, 0x0402, 0x004BB670),
)
RESPONSE_STATUS: Final[str] = "layout only; body field semantics not yet proven"


def build_post_0030_payload_layout(source: Path) -> dict[str, object]:
    data = source.read_bytes()
    image = _parse_pe_image(data)
    entries = [_entry(data, image, target) for target in PAYLOAD_LAYOUT_TARGETS]
    return {
        "source": str(source),
        "trigger": "decoded client 0x0030 login/session-like body",
        "entries": entries,
        "evidence": "direct PE disassembly of candidate internal handlers",
        "nextTracePoint": "derive encrypted body construction for 0x0031/0x0032/0x0033",
    }


def write_post_0030_payload_layout(source: Path, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(
        json.dumps(build_post_0030_payload_layout(source), ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def _entry(data: bytes, image: PeImage, target: PayloadLayoutTarget) -> dict[str, int | str]:
    instructions = _instructions(data, image, target.handler_va, 80)
    message_name = _message_name(data, image, instructions)
    destination = _client_destination(instructions)
    copied_dwords = _copied_dwords(instructions)
    followup_call = _followup_call(instructions)
    dispatch_flag = _dispatch_flag(instructions)
    if not _copies_from_decoded_body(instructions):
        raise ValueError(f"handler does not copy from ebx decoded body: 0x{target.handler_va:08x}")
    if not _reads_body_length_or_status(instructions):
        raise ValueError(f"handler does not read body+0x08 dword: 0x{target.handler_va:08x}")
    return {
        "transportHex": f"0x{target.transport_code:04x}",
        "internalHex": f"0x{target.internal_code:04x}",
        "handlerVirtualAddressHex": f"0x{target.handler_va:08x}",
        "messageName": message_name,
        "decodedBodySource": "decoded body pointer in ebx",
        "lengthOrStatusRead": "body+0x08 dword",
        "clientStateDestination": f"client+0x{destination:x}",
        "copiedDwords": copied_dwords,
        "copiedBytes": copied_dwords * 4,
        "followupCallVirtualAddressHex": f"0x{followup_call:08x}",
        "dispatchFlag": dispatch_flag,
        "responseStatus": RESPONSE_STATUS,
    }


def _instructions(data: bytes, image: PeImage, virtual_address: int, size: int) -> list[tuple[int, str, str]]:
    offset = _virtual_address_to_offset(image, virtual_address)
    disassembler = Cs(CS_ARCH_X86, CS_MODE_32)
    return [
        (instruction.address, instruction.mnemonic, instruction.op_str)
        for instruction in disassembler.disasm(data[offset : offset + size], virtual_address)
    ]


def _message_name(data: bytes, image: PeImage, instructions: list[tuple[int, str, str]]) -> str:
    for _address, mnemonic, op_str in instructions:
        if mnemonic != "push" or not op_str.startswith("0x77"):
            continue
        string_va = int(op_str, 0)
        offset = _virtual_address_to_offset(image, string_va)
        raw = data[offset : offset + 96].split(b"\0", 1)[0]
        return raw.decode("ascii")
    raise ValueError("handler does not reference a message literal")


def _client_destination(instructions: list[tuple[int, str, str]]) -> int:
    for _address, mnemonic, op_str in instructions:
        if mnemonic != "lea" or not op_str.startswith("eax, ["):
            continue
        if "+ 0x" not in op_str:
            continue
        return int(op_str.rsplit("+ ", 1)[1].rstrip("]"), 0)
    raise ValueError("handler does not compute a client-state destination")


def _copied_dwords(instructions: list[tuple[int, str, str]]) -> int:
    for _address, mnemonic, op_str in instructions:
        if mnemonic == "mov" and op_str.startswith("ecx, 0x"):
            return int(op_str.removeprefix("ecx, "), 0)
    raise ValueError("handler does not set a rep movsd count")


def _followup_call(instructions: list[tuple[int, str, str]]) -> int:
    for _address, mnemonic, op_str in reversed(instructions):
        if mnemonic == "call" and op_str != "0x5923a0":
            return int(op_str, 0)
    raise ValueError("handler does not call a follow-up routine")


def _dispatch_flag(instructions: list[tuple[int, str, str]]) -> int:
    for _address, mnemonic, op_str in instructions:
        if mnemonic == "push" and op_str in {"0", "1"}:
            return int(op_str, 0)
    raise ValueError("handler does not push a dispatch flag")


def _copies_from_decoded_body(instructions: list[tuple[int, str, str]]) -> bool:
    saw_source = False
    for _address, mnemonic, op_str in instructions:
        if mnemonic == "mov" and op_str == "esi, ebx":
            saw_source = True
        elif saw_source and mnemonic == "rep movsd" and op_str == "dword ptr es:[edi], dword ptr [esi]":
            return True
    return False


def _reads_body_length_or_status(instructions: list[tuple[int, str, str]]) -> bool:
    return any(mnemonic == "mov" and op_str.startswith(("eax, dword ptr [ebx + 8]", "ecx, dword ptr [ebx + 8]")) for _, mnemonic, op_str in instructions)
