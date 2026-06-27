# /// script
# requires-python = ">=3.11"
# dependencies = ["frida"]
# ///
# --- How to run ---
# python tools/logh7_global_page_write_watch.py --session .omo/ui-explorer/session --seconds 30
from __future__ import annotations

import argparse
import json
import time
from pathlib import Path
from typing import Final

ROOT: Final = Path(__file__).resolve().parents[1]
DEFAULT_SESSION: Final = ROOT / ".omo/ui-explorer/session"
DEFAULT_OUT: Final = ROOT / ".omo/ulw-loop/evidence/g006-c002-global-page-write-watch.jsonl"
DESCRIPTION: Final = "Attach Frida copy/fill overlap hooks for LOGH VII DAT_007cd04c globals."


def build_js(
    *,
    poll_ms: int = 25,
    max_events: int = 4096,
    range_start: int = 0x007CD040,
    range_end: int = 0x007CD060,
) -> str:
    return f"""
const IMAGE_BASE = ptr('0x400000');
const moduleBase = Process.getModuleByName('G7MTClient.exe').base;
const RANGE_START_VA = ptr('0x{range_start:08x}');
const RANGE_END_VA = ptr('0x{range_end:08x}');
const POLL_MS = {int(poll_ms)};
const MAX_EVENTS = {int(max_events)};
let seq = 0;
let overlapEvents = 0;
let lastSlotKey = null;

function abs(vaPtr) {{ return moduleBase.add(vaPtr.sub(IMAGE_BASE)); }}
function safe(fn, fallback) {{ try {{ return fn(); }} catch (_error) {{ return fallback; }} }}
function hex(value) {{
  if (value === null || value === undefined) return null;
  return safe(() => {{ const p = ptr(value); return p.isNull() ? null : p.toString(); }}, String(value));
}}
function readPtr(address) {{ return safe(() => ptr(address).readPointer(), ptr('0x0')); }}
function readU8(address) {{ return safe(() => ptr(address).readU8(), null); }}
function readU32(address) {{ return safe(() => ptr(address).readU32(), null); }}
function readS32(address) {{ return safe(() => ptr(address).readS32(), null); }}
function bytesHex(address, count) {{
  return safe(() => {{
    const bytes = ptr(address).readByteArray(count);
    if (bytes === null) return null;
    return Array.prototype.map.call(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('');
  }}, null);
}}
function backtrace(context) {{
  return safe(() => Thread.backtrace(context, Backtracer.FUZZY).slice(0, 10).map((frame) => hex(frame)), []);
}}

const rangeStart = abs(RANGE_START_VA);
const rangeEnd = abs(RANGE_END_VA);
const rootGlobal = abs(ptr('0x007cd04c'));
const guardSlot = abs(ptr('0x007cd048'));
const slot40 = abs(ptr('0x007cd040'));

function rootFields(root) {{
  if (root.isNull()) return null;
  const raw = readS32(root.add(0x11178));
  return {{
    byte0: readU8(root),
    currentRaw11178: raw,
    listCount1117c: readU32(root.add(0x1117c)),
    gridHead0008Hex: bytesHex(root.add(0x8), 32),
  }};
}}
function slotSnapshot(reason) {{
  const root = readPtr(rootGlobal);
  return {{
    reason,
    rangeStart: hex(rangeStart),
    rangeEnd: hex(rangeEnd),
    DAT_007cd040_u32: readU32(slot40),
    DAT_007cd048_u8: readU8(guardSlot),
    DAT_007cd04c: hex(root),
    rootFields: rootFields(root),
    targetBytes: bytesHex(rangeStart, rangeEnd.sub(rangeStart).toInt32()),
  }};
}}
function emit(tag, payload) {{ seq += 1; send({{ tag, seq, t: Date.now(), ...(payload || {{}}) }}); }}
function emitSlotChange(source) {{
  const snapshot = slotSnapshot(source);
  const key = JSON.stringify(snapshot);
  if (lastSlotKey !== key) {{
    emit('slot-change', {{ source, previousKey: lastSlotKey, slotSnapshot: snapshot }});
    lastSlotKey = key;
  }}
}}
function overlaps(dest, size) {{
  if (dest === null || size === null || size <= 0) return false;
  const start = ptr(dest);
  const end = start.add(size);
  return start.compare(rangeEnd) < 0 && end.compare(rangeStart) > 0;
}}
function sizeArg(args, index) {{ return safe(() => args[index].toUInt32(), null); }}

function emitOverlap(name, dest, srcOrFill, size, context, beforeHex) {{
  if (overlapEvents >= MAX_EVENTS) return;
  overlapEvents += 1;
  emit('overlap-write', {{
    name,
    dest: hex(dest),
    srcOrFill: hex(srcOrFill),
    size,
    beforeHex,
    afterHex: bytesHex(rangeStart, rangeEnd.sub(rangeStart).toInt32()),
    backtrace: backtrace(context),
    slotSnapshot: slotSnapshot('overlap-write'),
  }});
}}
function installCopyHook(address, name, sizeIndex, srcIndex) {{
  try {{
    Interceptor.attach(address, {{
      onEnter(args) {{
        this.dest = args[0];
        this.srcOrFill = args[srcIndex];
        this.size = sizeArg(args, sizeIndex);
        this.hit = overlaps(this.dest, this.size);
        this.contextOnEnter = this.context;
        this.beforeHex = this.hit ? bytesHex(rangeStart, rangeEnd.sub(rangeStart).toInt32()) : null;
      }},
      onLeave() {{
        if (this.hit) emitOverlap(name, this.dest, this.srcOrFill, this.size, this.contextOnEnter, this.beforeHex);
      }},
    }});
    emit('hook-installed', {{ name, address: hex(address) }});
  }} catch (error) {{
    emit('hook-failed', {{ name, address: hex(address), error: String(error) }});
  }}
}}
function hookExport(moduleName, exportName, name, sizeIndex, srcIndex) {{
  const mod = safe(() => Process.getModuleByName(moduleName), null);
  if (mod === null) {{ emit('hook-skipped', {{ name, moduleName, exportName, reason: 'module-missing' }}); return; }}
  const addr = safe(() => mod.getExportByName(exportName), null);
  if (addr === null) {{ emit('hook-skipped', {{ name, moduleName, exportName, reason: 'export-missing' }}); return; }}
  installCopyHook(addr, name, sizeIndex, srcIndex);
}}
function hookInternal(vaText, name, sizeIndex, srcIndex) {{
  installCopyHook(abs(ptr(vaText)), name, sizeIndex, srcIndex);
}}

const modules = ['msvcrt.dll', 'ucrtbase.dll', 'ntdll.dll', 'kernel32.dll'];
for (const moduleName of modules) {{
  hookExport(moduleName, 'memcpy', moduleName + '!memcpy', 2, 1);
  hookExport(moduleName, 'memmove', moduleName + '!memmove', 2, 1);
  hookExport(moduleName, 'memset', moduleName + '!memset', 2, 1);
}}
hookInternal('0x00602a70', 'G7MTClient!_memset', 2, 1);
hookExport('kernel32.dll', 'lstrcpyA', 'kernel32!lstrcpyA', 2, 1);
hookExport('kernel32.dll', 'lstrcpynA', 'kernel32!lstrcpynA', 2, 1);
hookExport('ntdll.dll', 'RtlMoveMemory', 'ntdll!RtlMoveMemory', 2, 1);
hookExport('ntdll.dll', 'RtlCopyMemory', 'ntdll!RtlCopyMemory', 2, 1);
hookExport('ntdll.dll', 'RtlFillMemory', 'ntdll!RtlFillMemory', 1, 2);
hookExport('ntdll.dll', 'RtlZeroMemory', 'ntdll!RtlZeroMemory', 1, 1);
hookExport('kernel32.dll', 'RtlMoveMemory', 'kernel32!RtlMoveMemory', 2, 1);
hookExport('kernel32.dll', 'RtlCopyMemory', 'kernel32!RtlCopyMemory', 2, 1);
hookExport('kernel32.dll', 'RtlFillMemory', 'kernel32!RtlFillMemory', 1, 2);
hookExport('kernel32.dll', 'RtlZeroMemory', 'kernel32!RtlZeroMemory', 1, 1);
emit('watch-ready', {{ pollMs: POLL_MS, maxEvents: MAX_EVENTS, slotSnapshot: slotSnapshot('watch-ready') }});
emitSlotChange('initial');
setInterval(() => emitSlotChange('poll'), POLL_MS);
"""


def _session_pid(session_dir: Path) -> int:
    state = json.loads((session_dir / "session.json").read_text(encoding="utf-8"))
    pid = int(state["clientPid"])
    if pid <= 0:
        raise ValueError(f"invalid clientPid in {session_dir / 'session.json'}")
    return pid


def run(args: argparse.Namespace) -> int:
    import frida

    pid = args.pid if args.pid is not None else _session_pid(args.session)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    events = 0
    session = None
    script = None
    with args.out.open("a", encoding="utf-8") as out:

        def on_message(message, data) -> None:
            nonlocal events
            events += 1
            out.write(json.dumps({"fridaMessage": message, "dataLength": 0 if data is None else len(data)}) + "\n")
            out.flush()

        try:
            session = frida.attach(pid)
            script = session.create_script(
                build_js(
                    poll_ms=args.poll_ms,
                    max_events=args.max_events,
                    range_start=args.range_start,
                    range_end=args.range_end,
                )
            )
            script.on("message", on_message)
            script.load()
            time.sleep(args.seconds)
        finally:
            if script is not None:
                script.unload()
            if session is not None:
                session.detach()
    print(json.dumps({"attachedPid": pid, "out": str(args.out), "events": events}, ensure_ascii=False, indent=2))
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=DESCRIPTION)
    parser.add_argument("--session", type=Path, default=DEFAULT_SESSION)
    parser.add_argument("--pid", type=int, default=None)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    parser.add_argument("--seconds", type=float, default=30.0)
    parser.add_argument("--poll-ms", type=int, default=25)
    parser.add_argument("--max-events", type=int, default=4096)
    parser.add_argument("--range-start", type=lambda value: int(value, 0), default=0x007CD040)
    parser.add_argument("--range-end", type=lambda value: int(value, 0), default=0x007CD060)
    return run(parser.parse_args())


if __name__ == "__main__":
    raise SystemExit(main())
