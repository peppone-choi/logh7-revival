from __future__ import annotations

import json
import re
import struct
from dataclasses import dataclass
from pathlib import Path
from typing import Final

from capstone import CS_ARCH_X86, CS_MODE_32, Cs

if __package__:
    from .logh7_child_codec import _parse_pe_image, _virtual_address_to_offset
    from .logh7_transport_dispatch import build_transport_dispatch_index
else:
    from logh7_child_codec import _parse_pe_image, _virtual_address_to_offset
    from logh7_transport_dispatch import build_transport_dispatch_index

INTERNAL_SWITCH_TABLE_VA: Final[int] = 0x004BDE7C
INTERNAL_BASE_CODE: Final[int] = 0x0200
TRACKED_INTERNALS: Final[dict[int, str]] = {
    0x0200: "SSLoginOK",
    0x0205: "SSGameLoginOK",
}
TRACKED_TRANSPORTS: Final[dict[int, int]] = {
    0x0001: 0x0200,
    0x0003: 0x0205,
}
IMMEDIATE_PATTERN: Final[re.Pattern[str]] = re.compile(r"0x[0-9a-f]+|-?\d+")
INTERNAL_DISPATCH_TAIL_VA: Final[int] = 0x004BDD33
TRANSPORT_QUEUE_APPEND_VA: Final[int] = 0x004B852B
RUNTIME_MANAGER_GLOBAL: Final[int] = 0x007C25F4
QUEUE_COUNT_OFFSET: Final[int] = 0x357EC0
QUEUE_ENTRY_BASE_OFFSET: Final[int] = 0x357EC4
QUEUE_PAIRED_CODE_OFFSET: Final[int] = 0x357EC8
QUEUE_CONTEXT_OFFSET: Final[int] = 0x357ECC
QUEUE_ENTRY_STRIDE: Final[int] = 12
MAX_QUEUED_ENTRIES: Final[int] = 100


@dataclass(frozen=True, slots=True)
class SessionInternalHandler:
    internal_code: int
    message_name: str
    table_virtual_address: int
    target_virtual_address: int
    string_address: int | None
    state_writes: tuple[str, ...]

    def to_json(self) -> dict[str, int | str | list[str] | None]:
        string_address = self.string_address
        return {
            "internalCode": self.internal_code,
            "internalHex": f"0x{self.internal_code:04x}",
            "messageName": self.message_name,
            "tableVirtualAddress": self.table_virtual_address,
            "tableVirtualAddressHex": f"0x{self.table_virtual_address:08x}",
            "targetVirtualAddress": self.target_virtual_address,
            "targetVirtualAddressHex": f"0x{self.target_virtual_address:08x}",
            "stringAddress": string_address,
            "stringAddressHex": None if string_address is None else f"0x{string_address:08x}",
            "stateWrites": list(self.state_writes),
        }


@dataclass(frozen=True, slots=True)
class TransportQueueSchema:
    append_virtual_address: int
    runtime_manager_global: int
    count_offset: int
    entry_stride_bytes: int
    max_queued_entries: int
    first_entry_notification: str
    prerequisites: tuple[str, ...]

    def to_json(self) -> dict[str, object]:
        return {
            "appendVirtualAddress": self.append_virtual_address,
            "appendVirtualAddressHex": f"0x{self.append_virtual_address:08x}",
            "runtimeManagerGlobal": self.runtime_manager_global,
            "runtimeManagerGlobalHex": f"0x{self.runtime_manager_global:08x}",
            "countField": f"client+0x{self.count_offset:06x}",
            "entryStrideBytes": self.entry_stride_bytes,
            "entryFields": [
                {"offset": 0, "field": "queuedInternalCode"},
                {"offset": 4, "field": "pairedInternalCode"},
                {"offset": 8, "field": "payloadOrContextPointer"},
            ],
            "maxQueuedEntries": self.max_queued_entries,
            "firstEntryNotification": self.first_entry_notification,
            "prerequisites": list(self.prerequisites),
        }


def _read_u32(data: bytes, offset: int) -> int:
    return struct.unpack_from("<I", data, offset)[0]


def _immediate(op_str: str) -> int | None:
    match = IMMEDIATE_PATTERN.search(op_str)
    if match is None:
        return None
    return int(match.group(0), 0)


def _state_write_from_operand(op_str: str) -> str | None:
    if "byte ptr [" not in op_str:
        return None
    if not any(suffix in op_str for suffix in ("], 1", "], al", "], cl")):
        return None
    offset = _immediate(op_str)
    if offset is None or offset < 0x1000:
        return None
    return f"client+0x{offset:06x}"


def _handler_target(data: bytes, image: object, internal_code: int) -> tuple[int, int]:
    table_va = INTERNAL_SWITCH_TABLE_VA + (internal_code - INTERNAL_BASE_CODE) * 4
    return table_va, _read_u32(data, _virtual_address_to_offset(image, table_va))


def _analyze_internal_handler(
    data: bytes,
    image: object,
    internal_code: int,
    message_name: str,
) -> SessionInternalHandler:
    table_va, target_va = _handler_target(data, image, internal_code)
    offset = _virtual_address_to_offset(image, target_va)
    disassembler = Cs(CS_ARCH_X86, CS_MODE_32)
    string_address: int | None = None
    state_writes: list[str] = []
    for instruction in disassembler.disasm(data[offset : offset + 128], target_va):
        if instruction.mnemonic == "push" and string_address is None:
            string_address = _immediate(instruction.op_str)
        if instruction.mnemonic == "mov":
            write = _state_write_from_operand(instruction.op_str)
            if write is not None:
                state_writes.append(write)
        if instruction.mnemonic == "jmp" and instruction.op_str == f"0x{INTERNAL_DISPATCH_TAIL_VA:x}":
            break
        if instruction.mnemonic == "ret":
            break
    return SessionInternalHandler(
        internal_code=internal_code,
        message_name=message_name,
        table_virtual_address=table_va,
        target_virtual_address=target_va,
        string_address=string_address,
        state_writes=tuple(dict.fromkeys(state_writes)),
    )


def _analyze_transport_queue_schema(data: bytes, image: object) -> TransportQueueSchema:
    offset = _virtual_address_to_offset(image, TRANSPORT_QUEUE_APPEND_VA)
    disassembler = Cs(CS_ARCH_X86, CS_MODE_32)
    markers: set[str] = set()
    for instruction in disassembler.disasm(data[offset : offset + 224], TRANSPORT_QUEUE_APPEND_VA):
        op_str = instruction.op_str
        if instruction.mnemonic == "mov" and op_str == f"eax, dword ptr [edi + 0x{QUEUE_COUNT_OFFSET:x}]":
            markers.add("reads queue count")
        elif instruction.mnemonic == "mov" and op_str == "dword ptr [edi + ecx*4], esi":
            markers.add("stores queued internal code")
        elif instruction.mnemonic == "mov" and op_str == f"dword ptr [edi + edx*4 + 0x{QUEUE_PAIRED_CODE_OFFSET:x}], ebx":
            markers.add("stores paired internal code")
        elif instruction.mnemonic == "mov" and op_str == f"dword ptr [edi + edx*4 + 0x{QUEUE_CONTEXT_OFFSET:x}], eax":
            markers.add("stores payload context")
        elif instruction.mnemonic == "mov" and op_str == f"eax, dword ptr [0x{RUNTIME_MANAGER_GLOBAL:x}]":
            markers.add("reads runtime manager global")
        elif instruction.mnemonic == "call" and op_str == "dword ptr [edx + 0x18]":
            markers.add("notifies runtime manager")
        elif instruction.mnemonic == "cmp" and op_str == f"eax, 0x{MAX_QUEUED_ENTRIES:x}":
            markers.add("checks queue capacity")
        elif instruction.mnemonic == "ret":
            break
    required = {
        "reads queue count",
        "stores queued internal code",
        "stores paired internal code",
        "stores payload context",
        "reads runtime manager global",
        "notifies runtime manager",
    }
    missing = sorted(required - markers)
    if missing:
        raise ValueError(f"transport queue schema markers missing: {', '.join(missing)}")
    return TransportQueueSchema(
        append_virtual_address=TRANSPORT_QUEUE_APPEND_VA,
        runtime_manager_global=RUNTIME_MANAGER_GLOBAL,
        count_offset=QUEUE_COUNT_OFFSET,
        entry_stride_bytes=QUEUE_ENTRY_STRIDE,
        max_queued_entries=MAX_QUEUED_ENTRIES,
        first_entry_notification="calls runtime manager vtable+0x18",
        prerequisites=(
            "runtime manager global 0x007c25f4 must be non-null",
            "server frame must be queued with an internal response pair before dispatch tail can match it",
        ),
    )


def build_session_bootstrap_index(source: Path) -> dict[str, object]:
    data = source.read_bytes()
    image = _parse_pe_image(data)
    dispatch = build_transport_dispatch_index(source)
    transport_entries = []
    dispatch_by_code = {entry["transportCode"]: entry for entry in dispatch["entries"]}
    for transport_code, paired_internal in TRACKED_TRANSPORTS.items():
        entry = dict(dispatch_by_code[transport_code])
        entry["messageName"] = TRACKED_INTERNALS[paired_internal]
        transport_entries.append(entry)
    internal_handlers = [
        _analyze_internal_handler(data, image, code, name).to_json()
        for code, name in TRACKED_INTERNALS.items()
    ]
    return {
        "source": str(source),
        "transportResponses": transport_entries,
        "internalSwitchTableVirtualAddress": INTERNAL_SWITCH_TABLE_VA,
        "internalSwitchTableVirtualAddressHex": f"0x{INTERNAL_SWITCH_TABLE_VA:08x}",
        "internalHandlers": internal_handlers,
        "transportQueueSchema": _analyze_transport_queue_schema(data, image).to_json(),
        "evidence": "transport jump-table decode plus internal handler disassembly",
        "negativeRuntimeEvidence": "G033 raw and phase1-encrypted one-byte probes did not set session/cipher flags",
        "nextTracePoint": "instrument or emulate runtime-manager-backed queue append for low transport responses",
    }


def write_session_bootstrap_index(source: Path, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(
        json.dumps(build_session_bootstrap_index(source), ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
