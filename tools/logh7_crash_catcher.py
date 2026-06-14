"""Attach to the running LOGH VII client as a debugger and report the EXACT faulting
instruction address when it crashes -- the definitive crash localizer.

The DBWIN OutputDebugStringA marker approach (tools.logh7_ods_trace_patch) localizes the
crash to a function but floods on per-frame functions and is fooled by multiple call sites.
A real debugger catches the access-violation address directly. DebugActiveProcess works for
a same-user process WITHOUT admin (unlike WER LocalDumps, which needs HKLM write).

We pass first-chance exceptions back to the app (it has SEH); the SECOND-CHANCE access
violation (the one that actually kills the process) is the real crash -- we log its
ExceptionAddress (mapped to the Ghidra VA, base 0x400000) and the faulting data address.

Usage (attach to an already-running client, then drive it to crash):
  python -m tools.logh7_crash_catcher attach --pid <PID> --seconds 30 --out .omo/crash.json
"""
from __future__ import annotations

import argparse
import json
import time
from ctypes import Structure, Union, byref, c_byte, c_void_p, windll
from ctypes import wintypes
from pathlib import Path

kernel32 = windll.kernel32

DBG_CONTINUE = 0x00010002
DBG_EXCEPTION_NOT_HANDLED = 0x80010001
EXCEPTION_DEBUG_EVENT = 1
EXIT_PROCESS_DEBUG_EVENT = 5
EXCEPTION_ACCESS_VIOLATION = 0xC0000005
EXCEPTION_BREAKPOINT = 0x80000003
STATUS_WX86_BREAKPOINT = 0x4000001F
STATUS_WX86_SINGLE_STEP = 0x4000001E
EXCEPTION_SINGLE_STEP = 0x80000004


class EXCEPTION_RECORD(Structure):
    _fields_ = [
        ("ExceptionCode", wintypes.DWORD),
        ("ExceptionFlags", wintypes.DWORD),
        ("ExceptionRecord", c_void_p),
        ("ExceptionAddress", c_void_p),
        ("NumberParameters", wintypes.DWORD),
        ("ExceptionInformation", c_void_p * 15),
    ]


class EXCEPTION_DEBUG_INFO(Structure):
    _fields_ = [("ExceptionRecord", EXCEPTION_RECORD), ("dwFirstChance", wintypes.DWORD)]


class DEBUG_EVENT_U(Union):
    _fields_ = [("Exception", EXCEPTION_DEBUG_INFO), ("_raw", c_byte * 184)]


class DEBUG_EVENT(Structure):
    _fields_ = [
        ("dwDebugEventCode", wintypes.DWORD),
        ("dwProcessId", wintypes.DWORD),
        ("dwThreadId", wintypes.DWORD),
        ("u", DEBUG_EVENT_U),
    ]


def attach(pid: int, seconds: float, out: Path) -> int:
    if not kernel32.DebugActiveProcess(pid):
        raise OSError(f"DebugActiveProcess({pid}) failed: {kernel32.GetLastError()}")
    kernel32.DebugSetProcessKillOnExit(False)
    print(f"attached to pid {pid}; driving to crash (up to {seconds}s)...")

    code_names = {
        0xC0000005: "ACCESS_VIOLATION", 0xC00000FD: "STACK_OVERFLOW",
        0xC000001D: "ILLEGAL_INSTRUCTION", 0xC0000094: "INT_DIVIDE_BY_ZERO",
        0xC0000096: "PRIV_INSTRUCTION", 0xC0000017: "NO_MEMORY",
        0xC0000409: "STACK_BUFFER_OVERRUN", 0xE06D7363: "CPP_EXCEPTION",
        0x80000003: "BREAKPOINT", 0x4000001F: "WX86_BREAKPOINT",
    }
    benign = (EXCEPTION_BREAKPOINT, STATUS_WX86_BREAKPOINT, EXCEPTION_SINGLE_STEP, STATUS_WX86_SINGLE_STEP)
    event = DEBUG_EVENT()
    deadline = time.time() + seconds
    avs: list[dict[str, object]] = []
    event_code_counts: dict[int, int] = {}
    exc_code_counts: dict[str, int] = {}
    exited = False
    while time.time() < deadline and not exited:
        if not kernel32.WaitForDebugEvent(byref(event), 500):
            continue
        cont = DBG_CONTINUE
        code = event.dwDebugEventCode
        event_code_counts[code] = event_code_counts.get(code, 0) + 1
        if code == EXCEPTION_DEBUG_EVENT:
            rec = event.u.Exception.ExceptionRecord
            ec = rec.ExceptionCode & 0xFFFFFFFF
            first = bool(event.u.Exception.dwFirstChance)
            name = code_names.get(ec, f"0x{ec:08x}")
            if ec not in benign:
                exc_code_counts[name] = exc_code_counts.get(name, 0) + 1
            if ec in benign:
                cont = DBG_CONTINUE  # attach/loader breakpoints and single-steps: swallow
            else:
                # Record EVERY real exception (AV, stack overflow, illegal instr, ...). The crash =
                # the exception with no app handler (second chance), or the last before exit.
                addr = (rec.ExceptionAddress or 0) & 0xFFFFFFFF
                rw = rec.ExceptionInformation[0] or 0
                fault = rec.ExceptionInformation[1] or 0
                entry = {
                    "code": name,
                    "firstChance": first,
                    "exceptionAddressHex": f"0x{addr:08x}",
                    "ghidraVaHex": f"0x{addr:08x}",  # base 0x400000, no ASLR -> same
                    "access": {0: "read", 1: "write", 8: "execute"}.get(rw & 0xFFFFFFFF, str(rw)) if ec == EXCEPTION_ACCESS_VIOLATION else None,
                    "faultAddressHex": f"0x{fault & 0xFFFFFFFF:08x}" if ec == EXCEPTION_ACCESS_VIOLATION else None,
                    "threadId": event.dwThreadId,
                }
                avs.append(entry)
                tag = "first" if first else "SECOND(fatal)"
                print(f"  [{tag}] {name} @ {entry['exceptionAddressHex']} (tid {event.dwThreadId})")
                cont = DBG_EXCEPTION_NOT_HANDLED  # pass to app SEH; unhandled -> second chance -> terminate
        elif code == EXIT_PROCESS_DEBUG_EVENT:
            print("  process exited")
            exited = True
        kernel32.ContinueDebugEvent(event.dwProcessId, event.dwThreadId, cont)

    result = {
        "pid": pid,
        "exceptions": avs,
        "processExited": exited,
        "eventCodeCounts": {str(k): v for k, v in event_code_counts.items()},
        "exceptionCodeCounts": exc_code_counts,
    }
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"event code counts: {result['eventCodeCounts']}")
    print(f"exception code counts: {result['exceptionCodeCounts']}")
    fatal = [a for a in avs if not a["firstChance"]]
    if fatal:
        f = fatal[-1]
        print(f"CRASH (second-chance {f['code']}): {f['exceptionAddressHex']} -> Ghidra VA {f['ghidraVaHex']}")
    elif avs:
        print(f"only first-chance exceptions (app-handled); last {avs[-1]['code']} @ {avs[-1]['exceptionAddressHex']}")
    else:
        print("no exceptions captured (check eventCodeCounts: 0 events => debug attach not delivering)")
    print(f"-> {out}")
    return 0


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    sub = p.add_subparsers(dest="command", required=True)
    a = sub.add_parser("attach")
    a.add_argument("--pid", type=int, required=True)
    a.add_argument("--seconds", type=float, default=30.0)
    a.add_argument("--out", type=Path, default=Path(".omo/crash.json"))
    args = p.parse_args()
    return attach(args.pid, args.seconds, args.out)


if __name__ == "__main__":
    raise SystemExit(main())
