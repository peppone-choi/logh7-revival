"""Capture Win32 OutputDebugStringA output system-wide (a minimal DebugView clone).

The LOGH VII client is extremely verbose with OutputDebugStringA debug traces
("Start time = %d", "ResponseTime OK", "FieldMake OK", "World Encount OK", ...). When
the world build crashes, the LAST captured line pinpoints exactly how far it got -- a
crash-surviving diagnostic that needs NO code patching (we read the global DBWIN shared
buffer, not the client's memory, so it survives the client dying).

Only ONE capturer can own DBWIN_BUFFER at a time, and a running debugger pre-empts it.
Run this in the background BEFORE driving the client, then read the output file.

Usage:
  python -m tools.logh7_dbwin_capture run --seconds 30 --out .omo/dbwin.log [--pid N]
"""
from __future__ import annotations

import argparse
import ctypes
import struct
import time
from ctypes import wintypes
from pathlib import Path

kernel32 = ctypes.windll.kernel32

PAGE_READWRITE = 0x04
FILE_MAP_READ = 0x0004
SYNCHRONIZE = 0x00100000
EVENT_MODIFY_STATE = 0x0002
WAIT_OBJECT_0 = 0x0
WAIT_TIMEOUT = 0x102
INVALID_HANDLE_VALUE = ctypes.c_void_p(-1)
DBWIN_BUFFER_BYTES = 4096

for _fn, _ret, _args in (
    ("CreateFileMappingW", wintypes.HANDLE,
     (wintypes.HANDLE, wintypes.LPVOID, wintypes.DWORD, wintypes.DWORD, wintypes.DWORD, wintypes.LPCWSTR)),
    ("MapViewOfFile", wintypes.LPVOID,
     (wintypes.HANDLE, wintypes.DWORD, wintypes.DWORD, wintypes.DWORD, ctypes.c_size_t)),
    ("CreateEventW", wintypes.HANDLE,
     (wintypes.LPVOID, wintypes.BOOL, wintypes.BOOL, wintypes.LPCWSTR)),
    ("OpenEventW", wintypes.HANDLE, (wintypes.DWORD, wintypes.BOOL, wintypes.LPCWSTR)),
    ("SetEvent", wintypes.BOOL, (wintypes.HANDLE,)),
    ("WaitForSingleObject", wintypes.DWORD, (wintypes.HANDLE, wintypes.DWORD)),
):
    getattr(kernel32, _fn).restype = _ret
    getattr(kernel32, _fn).argtypes = _args


def _make_event(name: str) -> wintypes.HANDLE:
    handle = kernel32.CreateEventW(None, False, False, name)
    if not handle:
        handle = kernel32.OpenEventW(EVENT_MODIFY_STATE | SYNCHRONIZE, False, name)
    if not handle:
        raise OSError(f"could not create/open event {name}: {ctypes.get_last_error()}")
    return handle


def run(seconds: float, out: Path, pid_filter: int | None) -> int:
    buffer_ready = _make_event("DBWIN_BUFFER_READY")
    data_ready = _make_event("DBWIN_DATA_READY")
    mapping = kernel32.CreateFileMappingW(INVALID_HANDLE_VALUE, None, PAGE_READWRITE, 0, DBWIN_BUFFER_BYTES, "DBWIN_BUFFER")
    if not mapping:
        raise OSError(f"could not create DBWIN_BUFFER mapping: {ctypes.get_last_error()}")
    view = kernel32.MapViewOfFile(mapping, FILE_MAP_READ, 0, 0, DBWIN_BUFFER_BYTES)
    if not view:
        raise OSError(f"could not map DBWIN_BUFFER view: {ctypes.get_last_error()}")

    out.parent.mkdir(parents=True, exist_ok=True)
    count = 0
    deadline = time.time() + seconds
    with out.open("w", encoding="utf-8") as sink:
        sink.write(f"# DBWIN capture start (pid_filter={pid_filter}, seconds={seconds})\n")
        sink.flush()
        while time.time() < deadline:
            kernel32.SetEvent(buffer_ready)
            status = kernel32.WaitForSingleObject(data_ready, 200)
            if status != WAIT_OBJECT_0:
                continue
            raw = ctypes.string_at(view, DBWIN_BUFFER_BYTES)
            pid = struct.unpack_from("<I", raw, 0)[0]
            text = raw[4:].split(b"\x00", 1)[0].decode("ascii", "replace").rstrip("\r\n")
            if pid_filter is not None and pid != pid_filter:
                continue
            stamp = f"{time.time():.3f}"
            sink.write(f"{stamp}\t{pid}\t{text}\n")
            sink.flush()
            count += 1
    print(f"captured {count} debug lines -> {out}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    runner = sub.add_parser("run")
    runner.add_argument("--seconds", type=float, default=30.0)
    runner.add_argument("--out", type=Path, default=Path(".omo/dbwin.log"))
    runner.add_argument("--pid", type=int, default=None)
    args = parser.parse_args()
    return run(args.seconds, args.out, args.pid)


if __name__ == "__main__":
    raise SystemExit(main())
