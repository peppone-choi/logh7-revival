from __future__ import annotations

import ctypes
from ctypes import wintypes
from typing import Final, TypedDict

CLIENT_OBJECT_POINTER_VA: Final[int] = 0x007CCFFC
RUNTIME_MANAGER_POINTER_VA: Final[int] = 0x007C25F4
ACTIVATION_ROOT_OFFSET: Final[int] = 0x126718
SELECTOR1_REQUEST_GATE_OFFSET: Final[int] = 0x126710
SELECTOR1_MODE_OFFSET: Final[int] = 0x126711
SELECTOR1_POOL_OFFSET: Final[int] = 0x126718 + 0x0004
SELECTOR1_KEY_OFFSET: Final[int] = 0x04
SELECTOR1_RECORD_COUNT: Final[int] = 600
SELECTOR1_RECORD_STRIDE: Final[int] = 0x9EC
SS_LOGIN_OK_OFFSET: Final[int] = 0x35F252
CIPHER_READY_OFFSET: Final[int] = 0x358375
SESSION_READY_OFFSET: Final[int] = 0x35837D
CIPHER_GATE_OFFSET: Final[int] = 0x35837E
SS_GAME_LOGIN_OK_OFFSET: Final[int] = 0x358384
WORLD_INITIALIZED_OFFSET: Final[int] = 0x35F356
GRID_INITIALIZED_OFFSET: Final[int] = 0x35F357
TRANSPORT_QUEUE_COUNT_OFFSET: Final[int] = 0x357EC0
TRANSPORT_QUEUE_ENTRY_BASE_OFFSET: Final[int] = 0x357EC4
TRANSPORT_QUEUE_ENTRY_STRIDE: Final[int] = 12
TRANSPORT_QUEUE_MAX_CAPTURE: Final[int] = 8


class EntityRecord(TypedDict):
    index: int
    key: int
    keyHex: str


class TransportQueueEntry(TypedDict):
    index: int
    queuedInternalCode: int
    queuedInternalHex: str
    pairedInternalCode: int
    pairedInternalHex: str
    payloadOrContextPointerHex: str


def parse_transport_queue_entries(data: bytes, *, queued_count: int) -> list[TransportQueueEntry]:
    entries: list[TransportQueueEntry] = []
    capped_count = min(queued_count, TRANSPORT_QUEUE_MAX_CAPTURE)
    for index in range(capped_count):
        offset = index * TRANSPORT_QUEUE_ENTRY_STRIDE
        if len(data) < offset + TRANSPORT_QUEUE_ENTRY_STRIDE:
            break
        queued = int.from_bytes(data[offset : offset + 4], "little")
        paired = int.from_bytes(data[offset + 4 : offset + 8], "little")
        pointer = int.from_bytes(data[offset + 8 : offset + 12], "little")
        entries.append(
            {
                "index": index,
                "queuedInternalCode": queued,
                "queuedInternalHex": f"0x{queued:04x}",
                "pairedInternalCode": paired,
                "pairedInternalHex": f"0x{paired:04x}",
                "payloadOrContextPointerHex": f"0x{pointer:08x}",
            }
        )
    return entries


def parse_selector1_records(data: bytes, *, record_count: int = SELECTOR1_RECORD_COUNT) -> list[EntityRecord]:
    records: list[EntityRecord] = []
    for index in range(record_count):
        offset = index * SELECTOR1_RECORD_STRIDE
        if len(data) < offset + SELECTOR1_KEY_OFFSET + 4:
            break
        if data[offset] == 0:
            continue
        key = int.from_bytes(data[offset + SELECTOR1_KEY_OFFSET : offset + SELECTOR1_KEY_OFFSET + 4], "little")
        records.append({"index": index, "key": key, "keyHex": f"0x{key:08x}"})
    return records


def scan_live_selector1_keys(pid: int) -> dict[str, object]:
    process = _open_process(pid)
    try:
        runtime_manager = int.from_bytes(_read_process_memory(process, RUNTIME_MANAGER_POINTER_VA, 4), "little")
        client_object = int.from_bytes(_read_process_memory(process, CLIENT_OBJECT_POINTER_VA, 4), "little")
        if client_object == 0:
            return build_selector1_scan_result(
                pid=pid,
                client_object=client_object,
                runtime_manager_pointer=runtime_manager,
                records=[],
            )
        pool = _read_process_memory(process, client_object + SELECTOR1_POOL_OFFSET, SELECTOR1_RECORD_COUNT * SELECTOR1_RECORD_STRIDE)
        queue_count = int.from_bytes(_read_process_memory(process, client_object + TRANSPORT_QUEUE_COUNT_OFFSET, 4), "little")
        queue_data = _read_process_memory(
            process,
            client_object + TRANSPORT_QUEUE_ENTRY_BASE_OFFSET,
            min(queue_count, TRANSPORT_QUEUE_MAX_CAPTURE) * TRANSPORT_QUEUE_ENTRY_STRIDE,
        )
        return build_selector1_scan_result(
            pid=pid,
            client_object=client_object,
            activation_gate=_read_u8(process, client_object + ACTIVATION_ROOT_OFFSET),
            cipher_gate=_read_u8(process, client_object + CIPHER_GATE_OFFSET),
            ss_login_ok_flag=_read_u8(process, client_object + SS_LOGIN_OK_OFFSET),
            cipher_ready_flag=_read_u8(process, client_object + CIPHER_READY_OFFSET),
            session_ready_flag=_read_u8(process, client_object + SESSION_READY_OFFSET),
            ss_game_login_ok_flag=_read_u8(process, client_object + SS_GAME_LOGIN_OK_OFFSET),
            selector1_request_gate=_read_u8(process, client_object + SELECTOR1_REQUEST_GATE_OFFSET),
            selector1_mode=_read_u8(process, client_object + SELECTOR1_MODE_OFFSET),
            response_world_initialized=_read_u8(process, client_object + WORLD_INITIALIZED_OFFSET),
            response_grid_initialized=_read_u8(process, client_object + GRID_INITIALIZED_OFFSET),
            runtime_manager_pointer=runtime_manager,
            transport_queue_count=queue_count,
            transport_queue_entries=parse_transport_queue_entries(queue_data, queued_count=queue_count),
            records=parse_selector1_records(pool),
        )
    finally:
        ctypes.windll.kernel32.CloseHandle(process)


def build_selector1_scan_result(
    *,
    pid: int,
    client_object: int,
    records: list[EntityRecord],
    activation_gate: int = 0,
    cipher_gate: int = 0,
    ss_login_ok_flag: int = 0,
    cipher_ready_flag: int = 0,
    session_ready_flag: int = 0,
    ss_game_login_ok_flag: int = 0,
    selector1_request_gate: int = 0,
    selector1_mode: int = 0,
    response_world_initialized: int = 0,
    response_grid_initialized: int = 0,
    runtime_manager_pointer: int = 0,
    transport_queue_count: int = 0,
    transport_queue_entries: list[TransportQueueEntry] | None = None,
) -> dict[str, object]:
    queue_entries = transport_queue_entries if transport_queue_entries is not None else []
    return {
        "pid": pid,
        "clientObjectPointerHex": f"0x{client_object:08x}",
        "activationGate": activation_gate,
        "cipherGate": cipher_gate,
        "ssLoginOkFlag": ss_login_ok_flag,
        "cipherReadyFlag": cipher_ready_flag,
        "sessionReadyFlag": session_ready_flag,
        "ssGameLoginOkFlag": ss_game_login_ok_flag,
        "selector1RequestGate": selector1_request_gate,
        "selector1Mode": selector1_mode,
        "responseWorldInitialized": response_world_initialized,
        "responseGridInitialized": response_grid_initialized,
        "runtimeManagerPointerHex": f"0x{runtime_manager_pointer:08x}",
        "transportQueueCount": transport_queue_count,
        "transportQueueEntries": queue_entries,
        "selector": 1,
        "poolAddressHex": f"0x{client_object + SELECTOR1_POOL_OFFSET:08x}" if client_object != 0 else "0x00000000",
        "recordCount": SELECTOR1_RECORD_COUNT,
        "recordStrideBytes": SELECTOR1_RECORD_STRIDE,
        "activeRecords": records,
        "firstActiveKeyHex": records[0]["keyHex"] if records else None,
    }


def _open_process(pid: int) -> int:
    process_vm_read = 0x0010
    process_query_information = 0x0400
    handle = ctypes.windll.kernel32.OpenProcess(process_vm_read | process_query_information, False, pid)
    if handle == 0:
        raise OSError(f"OpenProcess failed for pid {pid}")
    return handle


def _read_u8(process: int, address: int) -> int:
    return _read_process_memory(process, address, 1)[0]


def _read_process_memory(process: int, address: int, size: int) -> bytes:
    buffer = ctypes.create_string_buffer(size)
    bytes_read = ctypes.c_size_t()
    ok = ctypes.windll.kernel32.ReadProcessMemory(
        wintypes.HANDLE(process),
        ctypes.c_void_p(address),
        buffer,
        size,
        ctypes.byref(bytes_read),
    )
    if ok == 0:
        raise OSError(f"ReadProcessMemory failed at 0x{address:08x}")
    return bytes(buffer.raw[: bytes_read.value])
