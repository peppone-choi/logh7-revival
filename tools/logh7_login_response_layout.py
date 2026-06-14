#!/usr/bin/env python3
"""Reconstruct the SSLoginOK/SSGameLoginOK inbound response path from G7MTClient.exe.

This locks down, by direct static disassembly of the real client, the complete
chain a server login response must traverse to be accepted -- the chain that
runtime probing (G077/G078) proved the current server frames never reach:

    decode router 0x004ae0d0  (per-internal-code gate; default path appends)
      -> append(code, body, len) 0x004b8850
         -> decoded-message queue at client+0x003552b8
            (capacity 0x1f4 entries, stride 0x14: code u16 @+0x003552bc,
             length @+0x003552c4, body pointer @+0x003552c8)
      -> drain loop calls dispatch 0x004ba2b0 (__thiscall: ecx=client,
         [ebp+8]=internal code, [ebp+0xc]=body pointer)
         -> dispatch entry 0x004ba316 jumps through small table 0x004bde7c
            -> 0x0200 SSLoginOK   handler 0x004ba347
            -> 0x0205 SSGameLoginOK handler 0x004ba3af

For each login response it extracts the decoded-body bytes the handler reads and
the client-state flags it sets, then derives the minimal body the server must
send. All addresses are asserted against the binary so any client drift fails
loudly. The disassembly is read-only.
"""
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
    from .logh7_login_response_promotion import (
        DECODE_ROUTER_APPEND_CALL_VA,
        DECODE_ROUTER_VA,
        decode_router_json,
        expect_decode_router_markers,
        promotion_gap_json,
    )
else:
    from logh7_child_codec import PeImage, _parse_pe_image, _virtual_address_to_offset
    from logh7_login_response_promotion import (
        DECODE_ROUTER_APPEND_CALL_VA,
        DECODE_ROUTER_VA,
        decode_router_json,
        expect_decode_router_markers,
        promotion_gap_json,
    )


# --- Queue (decoded-message ring drained into the dispatcher) -----------------
QUEUE_BASE_OFFSET: Final[int] = 0x003552B8
QUEUE_CODE_OFFSET: Final[int] = 0x003552BC
QUEUE_LENGTH_OFFSET: Final[int] = 0x003552C4
QUEUE_BODY_OFFSET: Final[int] = 0x003552C8
QUEUE_ENTRY_STRIDE: Final[int] = 0x14
QUEUE_CAPACITY: Final[int] = 0x1F4

ENQUEUE_VA: Final[int] = 0x004B8850
ENQUEUE_CODE_WRITE_VA: Final[int] = 0x004B8909

# --- Drain -> dispatch --------------------------------------------------------
DISPATCH_FN_VA: Final[int] = 0x004BA2B0
DISPATCH_CALL_VA: Final[int] = 0x004B8A78
DISPATCH_ENTRY_VA: Final[int] = 0x004BA316
DISPATCH_TABLE_VA: Final[int] = 0x004BDE7C
DISPATCH_BASE_CODE: Final[int] = 0x0200
DISPATCH_TAIL_VA: Final[int] = 0x004BDD33

STATE_WRITE_RE: Final[re.Pattern[str]] = re.compile(
    r"(?:byte|word|dword) ptr \[(?:esi|ecx|edx) \+ 0x([0-9a-f]+)\]"
)
BODY_READ_RE: Final[re.Pattern[str]] = re.compile(
    r"^([a-z]+), byte ptr \[ebx(?: \+ 0x([0-9a-f]+))?\]$"
)


@dataclass(frozen=True, slots=True)
class LoginResponse:
    internal_code: int
    message_name: str
    handler_va: int
    debug_label: str
    body_reads: tuple[dict[str, int], ...]
    state_writes: tuple[str, ...]
    login_flags_set: tuple[str, ...]
    min_body_length: int

    def to_json(self) -> dict[str, object]:
        return {
            "internalCode": self.internal_code,
            "internalHex": f"0x{self.internal_code:04x}",
            "messageName": self.message_name,
            "handlerVirtualAddressHex": f"0x{self.handler_va:08x}",
            "debugLabel": self.debug_label,
            "bodyReads": list(self.body_reads),
            "stateWrites": list(self.state_writes),
            "loginFlagsSet": list(self.login_flags_set),
            "minBodyLength": self.min_body_length,
        }


def _instructions(data: bytes, image: PeImage, virtual_address: int, size: int) -> list[tuple[int, str, str]]:
    offset = _virtual_address_to_offset(image, virtual_address)
    disassembler = Cs(CS_ARCH_X86, CS_MODE_32)
    return [(i.address, i.mnemonic, i.op_str) for i in disassembler.disasm(data[offset : offset + size], virtual_address)]


def _read_u32(data: bytes, image: PeImage, virtual_address: int) -> int:
    return struct.unpack_from("<I", data, _virtual_address_to_offset(image, virtual_address))[0]


def _read_cstring(data: bytes, image: PeImage, virtual_address: int) -> str:
    offset = _virtual_address_to_offset(image, virtual_address)
    end = data.index(b"\0", offset)
    return data[offset:end].decode("ascii", "replace")


def _expect(present: bool, label: str, missing: list[str]) -> None:
    if not present:
        missing.append(label)


def _verify_chain(data: bytes, image: PeImage) -> None:
    """Assert the structural markers of the queue/dispatch chain are intact."""
    missing: list[str] = []
    producer = {(m, o) for _, m, o in _instructions(data, image, ENQUEUE_VA, 0xD0)}
    consumer = {(m, o) for _, m, o in _instructions(data, image, DISPATCH_CALL_VA - 0x30, 0x40)}
    entry = {(m, o) for _, m, o in _instructions(data, image, DISPATCH_ENTRY_VA, 0x40)}
    router_instructions = _instructions(data, image, DECODE_ROUTER_VA, 0xC0)
    router = {(m, o) for _, m, o in router_instructions}

    _expect(("mov", "word ptr [eax + 0x3552bc], cx") in producer, "producer writes queue code @0x3552bc", missing)
    _expect(("mov", "dword ptr [eax + 0x3552c4], ecx") in producer, "producer writes queue length @0x3552c4", missing)
    _expect(("mov", "ax, word ptr [ebp + 0x3552bc]") in consumer, "consumer reads queue code @0x3552bc", missing)
    _expect(("call", f"0x{DISPATCH_FN_VA:x}") in consumer, "consumer calls dispatch 0x004ba2b0", missing)
    _expect(("mov", "eax, dword ptr [ebp + 8]") in entry, "dispatch reads internal code [ebp+8]", missing)
    _expect(("jmp", f"dword ptr [eax*4 + 0x{DISPATCH_TABLE_VA:x}]") in entry, "dispatch jumps small table 0x004bde7c", missing)
    _expect(("call", f"0x{ENQUEUE_VA:x}") in router, "decode router appends via 0x004b8850", missing)
    expect_decode_router_markers(router_instructions, missing, enqueue_va=ENQUEUE_VA)

    if missing:
        raise ValueError(f"login response chain markers drifted: {sorted(missing)}")


def _handler_va(data: bytes, image: PeImage, internal_code: int) -> int:
    table_va = DISPATCH_TABLE_VA + (internal_code - DISPATCH_BASE_CODE) * 4
    return _read_u32(data, image, table_va)


def _analyze_handler(data: bytes, image: PeImage, internal_code: int, message_name: str) -> LoginResponse:
    handler_va = _handler_va(data, image, internal_code)
    debug_label = ""
    body_reads: list[dict[str, int]] = []
    state_writes: list[str] = []
    flags: list[str] = []

    for index, (_, mnemonic, op_str) in enumerate(_instructions(data, image, handler_va, 0x80)):
        if mnemonic == "jmp" and op_str == f"0x{DISPATCH_TAIL_VA:x}":
            break
        if mnemonic == "push" and op_str.startswith("0x") and not debug_label:
            try:
                label = _read_cstring(data, image, int(op_str, 16))
            except (ValueError, IndexError):
                label = ""
            if label.isascii() and label.strip() and all(0x20 <= ord(c) < 0x7F for c in label):
                debug_label = label
        if mnemonic == "mov":
            body = BODY_READ_RE.match(op_str)
            if body is not None:
                body_reads.append({"bodyOffset": int(body.group(2), 16) if body.group(2) else 0, "size": 1})
            write = STATE_WRITE_RE.search(op_str)
            if write is not None:
                client_field = f"client+0x{int(write.group(1), 16):06x}"
                state_writes.append(client_field)
                if op_str.rstrip().endswith(", 1"):
                    flags.append(client_field)

    state_writes = list(dict.fromkeys(state_writes))
    flags = list(dict.fromkeys(flags))
    max_read = max((r["bodyOffset"] + r["size"] for r in body_reads), default=0)
    return LoginResponse(
        internal_code=internal_code,
        message_name=message_name,
        handler_va=handler_va,
        debug_label=debug_label,
        body_reads=tuple(body_reads),
        state_writes=tuple(state_writes),
        login_flags_set=tuple(flags),
        min_body_length=max_read,
    )


def build_login_response_layout(source: Path) -> dict[str, object]:
    data = source.read_bytes()
    image = _parse_pe_image(data)
    _verify_chain(data, image)
    responses = [
        _analyze_handler(data, image, 0x0200, "SSLoginOK"),
        _analyze_handler(data, image, 0x0205, "SSGameLoginOK"),
    ]
    return {
        "source": str(source),
        "queue": {
            "baseOffsetHex": f"0x{QUEUE_BASE_OFFSET:08x}",
            "codeOffsetHex": f"0x{QUEUE_CODE_OFFSET:08x}",
            "lengthOffsetHex": f"0x{QUEUE_LENGTH_OFFSET:08x}",
            "bodyPointerOffsetHex": f"0x{QUEUE_BODY_OFFSET:08x}",
            "entryStride": QUEUE_ENTRY_STRIDE,
            "capacity": QUEUE_CAPACITY,
            "enqueueVirtualAddressHex": f"0x{ENQUEUE_VA:08x}",
            "decodeRouterVirtualAddressHex": f"0x{DECODE_ROUTER_VA:08x}",
        },
        "decodeRouter": decode_router_json(enqueue_va=ENQUEUE_VA),
        "dispatch": {
            "functionVirtualAddressHex": f"0x{DISPATCH_FN_VA:08x}",
            "callingConvention": "thiscall(ecx=client, [ebp+8]=internalCode u16, [ebp+0xc]=bodyPointer)",
            "entryVirtualAddressHex": f"0x{DISPATCH_ENTRY_VA:08x}",
            "smallTableVirtualAddressHex": f"0x{DISPATCH_TABLE_VA:08x}",
            "tailVirtualAddressHex": f"0x{DISPATCH_TAIL_VA:08x}",
        },
        "loginResponses": [response.to_json() for response in responses],
        "promotionGap": promotion_gap_json(
            enqueue_va=ENQUEUE_VA,
            dispatch_call_va=DISPATCH_CALL_VA,
            dispatch_entry_va=DISPATCH_ENTRY_VA,
        ),
        "acceptanceSpec": (
            "to flip the client into the logged-in state the server frame must decode to internal "
            "code 0x0200 (SSLoginOK) with at least 1 body byte, then 0x0205 (SSGameLoginOK) with at "
            "least 1 body byte; the decode router 0x004ae0d0 appends them to the queue at "
            "client+0x003552b8 and the dispatcher routes them to 0x004ba347/0x004ba3af which set the "
            "ssLoginOk/ssGameLoginOk state flags"
        ),
        "negativeRuntimeEvidence": (
            "G077/G078 real-client probes showed ssLoginOkFlag/ssGameLoginOkFlag stayed 0: current "
            "server frames never reach this queue, so the gap is the decode->enqueue stage above 0x004ae0d0"
        ),
        "evidence": "direct PE disassembly of the decode router, enqueue producer, drain/dispatch, and login handlers",
    }


def write_login_response_layout(source: Path, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(
        json.dumps(build_login_response_layout(source), ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def main() -> int:
    parser = argparse.ArgumentParser(description="Reconstruct LOGH VII SSLoginOK/SSGameLoginOK inbound response path.")
    parser.add_argument("source", type=Path)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    write_login_response_layout(args.source, args.out)
    print(f"wrote {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
