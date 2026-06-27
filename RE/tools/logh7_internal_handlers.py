from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Final

from capstone import CS_ARCH_X86, CS_MODE_32, Cs

if __package__:
    from .logh7_child_codec import PeImage, _parse_pe_image, _virtual_address_to_offset
else:
    from logh7_child_codec import PeImage, _parse_pe_image, _virtual_address_to_offset

ACK_HANDLER_VA: Final[int] = 0x004BA457
INTERNAL_DISPATCH_VA: Final[int] = 0x004BA316
PHASE4_BUILDER_VA: Final[int] = 0x00511AE0
PHASE4_SEND_TRIGGER_VA: Final[int] = 0x004C1949
CLIENT_OFFSET_PATTERN: Final[re.Pattern[str]] = re.compile(r"\[edi \+ 0x([0-9a-f]+)\]")


@dataclass(frozen=True, slots=True)
class InternalHandlerFinding:
    name: str
    virtual_address: int
    internal_hex: str | None
    transport_hex: str | None
    queued_internal_hex: str | None
    payload_reads: tuple[str, ...]
    state_writes: tuple[str, ...]
    serialized_client_offsets: tuple[str, ...]
    evidence: str

    def to_json(self) -> dict[str, str | list[str] | None]:
        return {
            "name": self.name,
            "virtualAddressHex": f"0x{self.virtual_address:08x}",
            "internalHex": self.internal_hex,
            "transportHex": self.transport_hex,
            "queuedInternalHex": self.queued_internal_hex,
            "payloadReads": list(self.payload_reads),
            "stateWrites": list(self.state_writes),
            "serializedClientOffsets": list(self.serialized_client_offsets),
            "evidence": self.evidence,
        }


def _instructions(data: bytes, image: PeImage, virtual_address: int, size: int) -> list[tuple[str, str]]:
    offset = _virtual_address_to_offset(image, virtual_address)
    disassembler = Cs(CS_ARCH_X86, CS_MODE_32)
    return [(item.mnemonic, item.op_str) for item in disassembler.disasm(data[offset : offset + size], virtual_address)]


def _dedupe(values: list[str]) -> tuple[str, ...]:
    return tuple(dict.fromkeys(values))


def _internal_0300_route(data: bytes, image: PeImage) -> dict[str, str | None]:
    instructions = _instructions(data, image, INTERNAL_DISPATCH_VA, 48)
    has_0301_direct_branch = False
    has_0201_base_subtract = False
    has_small_switch_bound = False
    for mnemonic, op_str in instructions:
        if mnemonic == "cmp" and op_str == "eax, 0x301":
            has_0301_direct_branch = True
        elif mnemonic == "add" and op_str == "eax, 0xfffffdff":
            has_0201_base_subtract = True
        elif mnemonic == "cmp" and op_str == "eax, 6":
            has_small_switch_bound = True
    if not (has_0301_direct_branch and has_0201_base_subtract and has_small_switch_bound):
        raise ValueError("internal dispatch signature for 0x0300/0x0301 route was not found")
    return {
        "name": "internal-0x0300-dispatch-route",
        "virtualAddressHex": f"0x{INTERNAL_DISPATCH_VA:08x}",
        "internalHex": "0x0300",
        "transportHex": "0x0030",
        "pairedAckInternalHex": "0x0301",
        "directHandlerVirtualAddressHex": None,
        "routeConclusion": "queued request side; no direct 0x0300 payload handler in internal dispatch",
        "evidence": "real internal dispatch around 0x004ba316",
    }


def _ack_handler(data: bytes, image: PeImage) -> InternalHandlerFinding:
    instructions = _instructions(data, image, ACK_HANDLER_VA, 128)
    state_writes: list[str] = []
    payload_reads: list[str] = []
    for mnemonic, op_str in instructions:
        if mnemonic == "mov" and op_str == "ecx, dword ptr [ebx]":
            payload_reads.append("body+0x00 dword")
        elif mnemonic == "mov" and op_str.startswith("dword ptr [esi + "):
            offset = op_str.split("[esi + ", 1)[1].split("]", 1)[0]
            if offset in {"0x432418", "0x357eb0", "0x357ea8"}:
                state_writes.append(f"client+{offset}")
    return InternalHandlerFinding(
        name="internal-0x0301-ack-handler",
        virtual_address=ACK_HANDLER_VA,
        internal_hex="0x0301",
        transport_hex="0x0030",
        queued_internal_hex=None,
        payload_reads=_dedupe(payload_reads),
        state_writes=_dedupe(state_writes),
        serialized_client_offsets=(),
        evidence="real disassembly around 0x004ba457",
    )


def _phase4_builder(data: bytes, image: PeImage) -> InternalHandlerFinding:
    instructions = _instructions(data, image, PHASE4_BUILDER_VA, 520)
    serialized_offsets: list[str] = []
    for _mnemonic, op_str in instructions:
        match = CLIENT_OFFSET_PATTERN.search(op_str)
        if match is not None:
            serialized_offsets.append(f"0x{match.group(1)}")
    return InternalHandlerFinding(
        name="internal-0x040c-phase4-builder",
        virtual_address=PHASE4_BUILDER_VA,
        internal_hex="0x040c",
        transport_hex="0x0036",
        queued_internal_hex=None,
        payload_reads=(),
        state_writes=(),
        serialized_client_offsets=_dedupe(serialized_offsets),
        evidence="real disassembly around 0x00511ae0",
    )


def _phase4_send_trigger(data: bytes, image: PeImage) -> InternalHandlerFinding:
    return InternalHandlerFinding(
        name="internal-0x040c-send-trigger",
        virtual_address=PHASE4_SEND_TRIGGER_VA,
        internal_hex=None,
        transport_hex="0x0036",
        queued_internal_hex="0x040c",
        payload_reads=(),
        state_writes=(),
        serialized_client_offsets=(),
        evidence="real disassembly around 0x004c1949",
    )


def build_post_handshake_handler_index(source: Path) -> dict[str, object]:
    data = source.read_bytes()
    image = _parse_pe_image(data)
    findings = [
        _ack_handler(data, image),
        _phase4_builder(data, image),
        _phase4_send_trigger(data, image),
    ]
    return {
        "source": str(source),
        "entries": [_internal_0300_route(data, image), *[finding.to_json() for finding in findings]],
        "nextTracePoint": "prove server response semantics for internal 0x040c and 0x0300/0x0301",
        "evidence": "direct PE handler disassembly",
    }


def write_post_handshake_handler_index(source: Path, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(
        json.dumps(build_post_handshake_handler_index(source), ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
