# /// script
# requires-python = ">=3.11"
# dependencies = ["frida"]
# ///
# --- How to run ---
# python tools/logh7_global_slot_watch.py --session .omo/ui-explorer/session --seconds 20
from __future__ import annotations

import argparse
import json
import time
from pathlib import Path
from typing import Final

ROOT: Final = Path(__file__).resolve().parents[1]
DEFAULT_SESSION: Final = ROOT / ".omo/ui-explorer/session"
DEFAULT_OUT: Final = ROOT / ".omo/ulw-loop/evidence/g006-c002-global-slot-watch-v30.jsonl"
DESCRIPTION: Final = "Attach a Frida watcher for LOGH VII global/BSS current-grid slots."


def build_js(
    *,
    sample_bytes: int = 64,
    poll_ms: int = 250,
    max_access_events: int = 4096,
    enable_memory_monitor: bool = True,
) -> str:
    monitor_enabled = "true" if enable_memory_monitor else "false"
    return f"""
const IMAGE_BASE = ptr('0x400000');
const mod = Process.getModuleByName('G7MTClient.exe');
const moduleBase = mod.base;
const SAMPLE_BYTES = {int(sample_bytes)};
const POLL_MS = {int(poll_ms)};
const MAX_ACCESS_EVENTS = {int(max_access_events)};
const ENABLE_MEMORY_MONITOR = {monitor_enabled};
let seq = 0;
let accessEvents = 0;
let lastSnapshotKey = null;
let monitorStopped = false;

function abs(vaText) {{ return moduleBase.add(ptr(vaText).sub(IMAGE_BASE)); }}

function safe(fn, fallback) {{
  try {{
    return fn();
  }} catch (_error) {{
    return fallback;
  }}
}}

function hex(value) {{
  if (value === null || value === undefined) return null;
  return safe(() => {{
    const p = ptr(value);
    return p.isNull() ? null : p.toString();
  }}, String(value));
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
  return safe(() => Thread.backtrace(context, Backtracer.FUZZY).slice(0, 8).map((frame) => hex(frame)), []);
}}

const watchPage = abs('0x007cd000');
const playerGlobal = abs('0x007ccffc');
const slot40 = abs('0x007cd040');
const guardSlot = abs('0x007cd048');
const rootGlobal = abs('0x007cd04c');
const slot50 = abs('0x007cd050');
const slot54 = abs('0x007cd054');

function pageOffset(address) {{ return safe(() => ptr(address).sub(watchPage).toInt32(), -1); }}

function rootFields(root) {{
  if (root.isNull()) return null;
  const raw = readS32(root.add(0x11178));
  return {{
    byte0: readU8(root),
    currentRaw11178: raw,
    currentX: raw === null ? null : raw % 100,
    currentY: raw === null ? null : Math.trunc(raw / 100),
    listCount1117c: readU32(root.add(0x1117c)),
    listHead11180Hex: bytesHex(root.add(0x11180), Math.min(SAMPLE_BYTES, 96)),
    gridHead0008Hex: bytesHex(root.add(0x8), SAMPLE_BYTES),
  }};
}}

function slotSnapshot(reason) {{
  const root = readPtr(rootGlobal);
  return {{
    reason,
    moduleBase: hex(moduleBase),
    watchPage: hex(watchPage),
    DAT_007ccffc: hex(readPtr(playerGlobal)),
    DAT_007cd040_u32: readU32(slot40),
    DAT_007cd048_u8: readU8(guardSlot),
    DAT_007cd04c: hex(root),
    DAT_007cd050: hex(readPtr(slot50)),
    DAT_007cd054: hex(readPtr(slot54)),
    rootFields: rootFields(root),
  }};
}}

function emit(tag, payload) {{ seq += 1; send({{ tag, seq, t: Date.now(), ...(payload || {{}}) }}); }}

function emitSnapshot(tag, extra) {{
  const snapshot = slotSnapshot(tag);
  const key = JSON.stringify(snapshot);
  const changed = lastSnapshotKey !== null && lastSnapshotKey !== key;
  lastSnapshotKey = key;
  emit(tag, {{ slotSnapshot: snapshot, slotSnapshotChanged: changed, ...(extra || {{}}) }});
}}

function installHook(vaText, name) {{
  try {{
    Interceptor.attach(abs(vaText), {{
      onEnter() {{
        this.bt = backtrace(this.context);
        emitSnapshot(name + '-enter', {{
          va: vaText,
          ret: hex(this.context.esp.readPointer()),
          backtrace: this.bt,
        }});
      }},
      onLeave(retval) {{
        emitSnapshot(name + '-leave', {{
          va: vaText,
          retval: retval.toInt32(),
          backtrace: this.bt || [],
        }});
      }},
    }});
    emitSnapshot('hook-installed', {{ name, va: vaText }});
  }} catch (error) {{
    emit('hook-failed', {{ name, va: vaText, error: String(error) }});
  }}
}}

function interestingAccess(details) {{
  const offset = pageOffset(details.address);
  return details.operation === 'write' || (offset >= 0x40 && offset < 0x60);
}}

function armMonitor(reason) {{
  if (!ENABLE_MEMORY_MONITOR || monitorStopped || accessEvents >= MAX_ACCESS_EVENTS) return;
  if (typeof MemoryAccessMonitor === 'undefined') {{
    monitorStopped = true;
    emit('memory-monitor-unavailable', {{ reason }});
    return;
  }}
  safe(() => MemoryAccessMonitor.disable(), null);
  try {{
    MemoryAccessMonitor.enable({{ base: watchPage, size: 0x1000 }}, {{
      onAccess(details) {{
        accessEvents += 1;
        if (interestingAccess(details) || accessEvents <= 16) {{
          emit('memory-access', {{
            accessEvents,
            operation: details.operation,
            from: hex(details.from),
            address: hex(details.address),
            pageOffset: pageOffset(details.address),
            threadId: details.threadId,
            backtrace: backtrace(details.context),
            slotSnapshot: slotSnapshot('memory-access'),
          }});
        }}
        if (accessEvents >= MAX_ACCESS_EVENTS) {{
          monitorStopped = true;
          emit('memory-monitor-max-reached', {{ accessEvents }});
          return;
        }}
        setTimeout(() => armMonitor('rearm'), 0);
      }},
    }});
  }} catch (error) {{
    monitorStopped = true;
    emit('memory-monitor-failed', {{ reason, error: String(error) }});
  }}
}}

installHook('0x004fef90', 'strategyLoop-004fef90');
installHook('0x004c8a90', 'expandedGridCaller-004c8a90');
installHook('0x004d3a40', 'expandedGridInit-004d3a40');
installHook('0x004e8540', 'rootGuardConsumer-004e8540');
installHook('0x004d6b70', 'currentRawBranch-004d6b70');
installHook('0x0057bbc0', 'listReader-0057bbc0');
emitSnapshot('watch-ready', {{ pollMs: POLL_MS, sampleBytes: SAMPLE_BYTES, maxAccessEvents: MAX_ACCESS_EVENTS }});
armMonitor('initial');

setInterval(function pollSlots() {{
  const snapshot = slotSnapshot('poll');
  const key = JSON.stringify(snapshot);
  if (lastSnapshotKey !== key) {{
    emitSnapshot('poll-change', {{ previousKey: lastSnapshotKey }});
  }}
}}, POLL_MS);
"""


def _session_pid(session_dir: Path) -> int:
    session_path = session_dir / "session.json"
    if not session_path.exists():
        raise FileNotFoundError(f"session file not found: {session_path}")
    state = json.loads(session_path.read_text(encoding="utf-8"))
    pid = int(state["clientPid"])
    if pid <= 0:
        raise ValueError(f"invalid clientPid in {session_path}: {pid}")
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
            out.write(
                json.dumps(
                    {
                        "fridaMessage": message,
                        "dataLength": 0 if data is None else len(data),
                    },
                    ensure_ascii=False,
                )
                + "\n"
            )
            out.flush()

        try:
            session = frida.attach(pid)
            script = session.create_script(
                build_js(
                    sample_bytes=args.sample_bytes,
                    poll_ms=args.poll_ms,
                    max_access_events=args.max_access_events,
                    enable_memory_monitor=not args.disable_memory_monitor,
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
    parser.add_argument("--pid", type=int, default=None, help="attach to this PID instead of reading session.json")
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    parser.add_argument("--seconds", type=float, default=20.0)
    parser.add_argument("--sample-bytes", type=int, default=64)
    parser.add_argument("--poll-ms", type=int, default=250)
    parser.add_argument("--max-access-events", type=int, default=4096)
    parser.add_argument("--disable-memory-monitor", action="store_true")
    return run(parser.parse_args())


if __name__ == "__main__":
    raise SystemExit(main())
