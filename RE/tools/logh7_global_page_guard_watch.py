# /// script
# requires-python = ">=3.11"
# dependencies = ["frida"]
# ///
# --- How to run ---
# python tools/logh7_global_page_guard_watch.py --session .omo/ui-explorer/session --seconds 15
from __future__ import annotations

import argparse
import json
import time
from pathlib import Path
from typing import Final

ROOT: Final = Path(__file__).resolve().parents[1]
DEFAULT_SESSION: Final = ROOT / ".omo/ui-explorer/session"
DEFAULT_OUT: Final = ROOT / ".omo/ulw-loop/evidence/g006-c002-global-page-guard-watch.jsonl"
DESCRIPTION: Final = "Trap writes to the LOGH VII global page containing DAT_007cd04c."


def build_js(
    *,
    poll_ms: int = 25,
    max_faults: int = 256,
    watch_page: int = 0x007CD000,
    range_start: int = 0x007CD040,
    range_end: int = 0x007CD060,
) -> str:
    return f"""
const IMAGE_BASE = ptr('0x400000');
const moduleBase = Process.getModuleByName('G7MTClient.exe').base;
const WATCH_PAGE_VA = ptr('0x{watch_page:08x}');
const RANGE_START_VA = ptr('0x{range_start:08x}');
const RANGE_END_VA = ptr('0x{range_end:08x}');
const POLL_MS = {int(poll_ms)};
const MAX_FAULTS = {int(max_faults)};
let seq = 0;
let faultCount = 0;
let lastSlotKey = null;
let armed = false;

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

const watchPage = abs(WATCH_PAGE_VA);
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
    watchPage: hex(watchPage),
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
function pageContains(address) {{
  const p = ptr(address);
  return p.compare(watchPage) >= 0 && p.compare(watchPage.add(0x1000)) < 0;
}}
function targetContains(address) {{
  const p = ptr(address);
  return p.compare(rangeStart) >= 0 && p.compare(rangeEnd) < 0;
}}
function armPage(reason) {{
  if (faultCount >= MAX_FAULTS) return;
  const ok = Memory.protect(watchPage, 0x1000, 'r--');
  armed = ok;
  emit('guard-arm', {{ reason, ok, slotSnapshot: slotSnapshot('guard-arm') }});
}}
function disarmPage(reason) {{
  const ok = Memory.protect(watchPage, 0x1000, 'rw-');
  armed = false;
  return ok;
}}

Process.setExceptionHandler(function(details) {{
  const memory = details.memory || {{}};
  const memoryAddress = memory.address || null;
  if (memory.operation !== 'write' || memoryAddress === null || !pageContains(memoryAddress)) return false;
  faultCount += 1;
  const beforeHex = bytesHex(rangeStart, rangeEnd.sub(rangeStart).toInt32());
  const restored = disarmPage('fault');
  emit('page-write-fault', {{
    faultCount,
    type: details.type,
    operation: memory.operation,
    address: hex(details.address),
    memoryAddress: hex(memoryAddress),
    targetHit: targetContains(memoryAddress),
    beforeHex,
    restored,
    backtrace: backtrace(details.context),
    slotSnapshot: slotSnapshot('page-write-fault'),
  }});
  if (faultCount < MAX_FAULTS) setTimeout(() => armPage('rearm'), 0);
  return true;
}});

emit('watch-ready', {{ pollMs: POLL_MS, maxFaults: MAX_FAULTS, slotSnapshot: slotSnapshot('watch-ready') }});
emitSlotChange('initial');
armPage('initial');
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
                    max_faults=args.max_faults,
                    watch_page=args.watch_page,
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
    parser.add_argument("--seconds", type=float, default=15.0)
    parser.add_argument("--poll-ms", type=int, default=25)
    parser.add_argument("--max-faults", type=int, default=256)
    parser.add_argument("--watch-page", type=lambda value: int(value, 0), default=0x007CD000)
    parser.add_argument("--range-start", type=lambda value: int(value, 0), default=0x007CD040)
    parser.add_argument("--range-end", type=lambda value: int(value, 0), default=0x007CD060)
    return run(parser.parse_args())


if __name__ == "__main__":
    raise SystemExit(main())
