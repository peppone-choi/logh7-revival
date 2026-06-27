# /// script
# requires-python = ">=3.11"
# dependencies = ["frida"]
# ///
# --- How to run ---
# python tools/logh7_heap_slot_watch.py --session .omo/ui-explorer/session --seconds 60
from __future__ import annotations

import argparse
import json
import time
from pathlib import Path
from typing import Final

ROOT: Final = Path(__file__).resolve().parents[1]
DEFAULT_SESSION: Final = ROOT / ".omo/ui-explorer/session"
DEFAULT_OUT: Final = ROOT / ".omo/ulw-loop/evidence/g006-c002-heap-slot-watch-v31.jsonl"
DESCRIPTION: Final = "Attach Frida allocator hooks and DAT_007cd04c slot polling to LOGH VII."


def build_js(*, poll_ms: int = 25, min_size: int = 0x10000, max_size: int = 0x20000) -> str:
    return f"""
const IMAGE_BASE = ptr('0x400000');
const moduleBase = Process.getModuleByName('G7MTClient.exe').base;
const POLL_MS = {int(poll_ms)};
const MIN_SIZE = {int(min_size)};
const MAX_SIZE = {int(max_size)};
let seq = 0;
let lastSlotKey = null;

function abs(vaText) {{ return moduleBase.add(ptr(vaText).sub(IMAGE_BASE)); }}
function safe(fn, fallback) {{ try {{ return fn(); }} catch (_error) {{ return fallback; }} }}
function hex(value) {{
  if (value === null || value === undefined) return null;
  return safe(() => {{ const p = ptr(value); return p.isNull() ? null : p.toString(); }}, String(value));
}}
function readPtr(address) {{ return safe(() => ptr(address).readPointer(), ptr('0x0')); }}
function readU8(address) {{ return safe(() => ptr(address).readU8(), null); }}
function readU32(address) {{ return safe(() => ptr(address).readU32(), null); }}
function readS32(address) {{ return safe(() => ptr(address).readS32(), null); }}
function backtrace(context) {{
  return safe(() => Thread.backtrace(context, Backtracer.FUZZY).slice(0, 10).map((frame) => hex(frame)), []);
}}

const rootGlobal = abs('0x007cd04c');
const guardSlot = abs('0x007cd048');
const slot40 = abs('0x007cd040');
const playerGlobal = abs('0x007ccffc');

function rootFields(root) {{
  if (root.isNull()) return null;
  const raw = readS32(root.add(0x11178));
  return {{
    byte0: readU8(root),
    currentRaw11178: raw,
    listCount1117c: readU32(root.add(0x1117c)),
    gridHead0008: safe(() => root.add(0x8).readByteArray(16), null) === null ? null : 'readable',
  }};
}}

function slotSnapshot(reason) {{
  const root = readPtr(rootGlobal);
  return {{
    reason,
    DAT_007ccffc: hex(readPtr(playerGlobal)),
    DAT_007cd040_u32: readU32(slot40),
    DAT_007cd048_u8: readU8(guardSlot),
    DAT_007cd04c: hex(root),
    rootFields: rootFields(root),
  }};
}}

function emit(tag, payload) {{ seq += 1; send({{ tag, seq, t: Date.now(), ...(payload || {{}}) }}); }}
function sizeOfArg(args, index) {{ return safe(() => args[index].toUInt32(), null); }}
function ptrDiff(a, b) {{
  if (a === null || b === null) return null;
  return safe(() => ptr(a).sub(ptr(b)).toInt32(), null);
}}
function isInteresting(size) {{ return size !== null && size >= MIN_SIZE && size <= MAX_SIZE; }}

function emitSlotChange(tag) {{
  const snapshot = slotSnapshot(tag);
  const key = JSON.stringify(snapshot);
  if (lastSlotKey !== key) {{
    emit('slot-change', {{ source: tag, previousKey: lastSlotKey, slotSnapshot: snapshot }});
    lastSlotKey = key;
  }}
}}

function emitAllocation(name, size, retval, context, argsSummary) {{
  const snapshot = slotSnapshot('allocation');
  const root = snapshot.DAT_007cd04c;
  const retHex = hex(retval);
  const diffToRoot = ptrDiff(retHex, root);
  const rootMatch = root !== null && retHex === root;
  const shouldEmit = isInteresting(size) || rootMatch || diffToRoot === 0;
  if (!shouldEmit) return;
  emit('allocation', {{
    name,
    size,
    retval: retHex,
    rootMatch,
    diffToRoot,
    args: argsSummary || null,
    backtrace: backtrace(context),
    slotSnapshot: snapshot,
  }});
}}

function hookInternal(vaText, name, sizeIndex) {{
  try {{
    Interceptor.attach(abs(vaText), {{
      onEnter(args) {{
        this.size = sizeOfArg(args, sizeIndex);
        this.argsSummary = [hex(args[0]), hex(args[1]), hex(args[2])];
        this.contextOnEnter = this.context;
      }},
      onLeave(retval) {{ emitAllocation(name, this.size, retval, this.contextOnEnter, this.argsSummary); }},
    }});
    emit('hook-installed', {{ name, va: vaText }});
  }} catch (error) {{
    emit('hook-failed', {{ name, va: vaText, error: String(error) }});
  }}
}}

function hookExport(moduleName, exportName, name, sizeIndex) {{
  const mod = safe(() => Process.getModuleByName(moduleName), null);
  if (mod === null) {{ emit('hook-skipped', {{ name, moduleName, exportName, reason: 'module-missing' }}); return; }}
  const addr = safe(() => mod.getExportByName(exportName), null);
  if (addr === null) {{ emit('hook-skipped', {{ name, moduleName, exportName, reason: 'export-missing' }}); return; }}
  try {{
    Interceptor.attach(addr, {{
      onEnter(args) {{
        this.size = sizeOfArg(args, sizeIndex);
        this.argsSummary = [hex(args[0]), hex(args[1]), hex(args[2]), hex(args[3])];
        this.contextOnEnter = this.context;
      }},
      onLeave(retval) {{ emitAllocation(name, this.size, retval, this.contextOnEnter, this.argsSummary); }},
    }});
    emit('hook-installed', {{ name, moduleName, exportName, address: hex(addr) }});
  }} catch (error) {{
    emit('hook-failed', {{ name, moduleName, exportName, error: String(error) }});
  }}
}}

hookInternal('0x00648d42', 'newLike-00648d42', 0);
hookInternal('0x005ffab7', 'malloc-005ffab7', 0);
hookInternal('0x005ffac9', 'nhMalloc-005ffac9', 0);
hookInternal('0x005ffaf5', 'heapAllocWrapper-005ffaf5', 0);
hookInternal('0x005ffc34', 'heapAllocZeroWrapper-005ffc34', 0);
hookExport('kernel32.dll', 'HeapAlloc', 'kernel32-HeapAlloc', 2);
hookExport('kernel32.dll', 'VirtualAlloc', 'kernel32-VirtualAlloc', 1);
emit('watch-ready', {{ pollMs: POLL_MS, minSize: MIN_SIZE, maxSize: MAX_SIZE, slotSnapshot: slotSnapshot('watch-ready') }});
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
            script = session.create_script(build_js(poll_ms=args.poll_ms, min_size=args.min_size, max_size=args.max_size))
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
    parser.add_argument("--seconds", type=float, default=60.0)
    parser.add_argument("--poll-ms", type=int, default=25)
    parser.add_argument("--min-size", type=lambda value: int(value, 0), default=0x10000)
    parser.add_argument("--max-size", type=lambda value: int(value, 0), default=0x20000)
    return run(parser.parse_args())


if __name__ == "__main__":
    raise SystemExit(main())
