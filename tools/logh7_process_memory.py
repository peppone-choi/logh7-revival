from __future__ import annotations

import ctypes
from pathlib import Path
from typing import Any

from tools.logh7_live_entity_scan import _open_process, _read_process_memory


def dump_client_memory(
    result: dict[str, Any],
    pid: int,
    destination: Path,
    address: int | None,
    size: int,
) -> None:
    if address is None or size <= 0:
        result["memoryDumpSkipped"] = "missing address or size"
        return
    try:
        data = read_client_memory(pid, address, size)
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(data)
        result["memoryDump"] = {
            "path": str(destination),
            "addressHex": f"0x{address:08x}",
            "bytes": len(data),
        }
    except OSError as error:
        result["memoryDumpError"] = str(error)


def dump_follow_memory(
    result: dict[str, Any],
    pid: int,
    *,
    ring_dump: Path,
    destination: Path,
    record_bytes: int,
    address_offset: int,
    size: int,
) -> None:
    try:
        address = find_ring_follow_address(
            ring_dump.read_bytes(),
            record_bytes=record_bytes,
            address_offset=address_offset,
        )
        data = read_client_memory(pid, address, size)
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(data)
        result["followMemoryDump"] = {
            "path": str(destination),
            "addressHex": f"0x{address:08x}",
            "bytes": len(data),
            "recordBytes": record_bytes,
            "addressOffset": address_offset,
        }
    except (OSError, ValueError) as error:
        result["followMemoryDumpError"] = str(error)


def read_client_memory(pid: int, address: int, size: int) -> bytes:
    process = _open_process(pid)
    try:
        return _read_process_memory(process, address, size)
    finally:
        ctypes.windll.kernel32.CloseHandle(process)


def find_ring_follow_address(ring_data: bytes, *, record_bytes: int, address_offset: int) -> int:
    if len(ring_data) < 8 or record_bytes <= 0:
        raise ValueError("ring dump is too small or record size is invalid")
    for offset in range(8, len(ring_data) - record_bytes + 1, record_bytes):
        record = ring_data[offset : offset + record_bytes]
        if record[:4] == b"SRP1":
            address = int.from_bytes(record[address_offset : address_offset + 4], "little")
            if address == 0:
                raise ValueError("ring follow address is zero")
            return address
    raise ValueError("no SRP1 record found in ring dump")
