# /// script
# requires-python = ">=3.11"
# dependencies = ["frida"]
# ///
# --- How to run ---
# python tools/logh7_current_grid_watch.py --session .omo/ui-explorer/session --seconds 20
from __future__ import annotations

import argparse
import json
import time
from pathlib import Path
from typing import Final

ROOT: Final = Path(__file__).resolve().parents[1]
DEFAULT_SESSION: Final = ROOT / ".omo/ui-explorer/session"
DEFAULT_OUT: Final = ROOT / ".omo/ulw-loop/evidence/g006-c002-current-grid-watch-v29.jsonl"
DESCRIPTION: Final = "Attach a Frida current-grid watcher to a live LOGH VII UI explorer session."


def build_js(*, sample_bytes: int = 64, poll_ms: int = 250) -> str:
    return f"""
const IMAGE_BASE = ptr('0x400000');
const mod = Process.getModuleByName('G7MTClient.exe');
const moduleBase = mod.base;
const SAMPLE_BYTES = {int(sample_bytes)};
const POLL_MS = {int(poll_ms)};
let seq = 0;
let lastKey = null;

function abs(vaText) {{
  return moduleBase.add(ptr(vaText).sub(IMAGE_BASE));
}}

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

function readPtr(address) {{
  if (address === null || address === undefined) return ptr('0x0');
  return safe(() => ptr(address).readPointer(), ptr('0x0'));
}}

function readU32(address) {{
  return safe(() => ptr(address).readU32(), null);
}}

function readS32(address) {{
  return safe(() => ptr(address).readS32(), null);
}}

function readF32(address) {{
  return safe(() => ptr(address).readFloat(), null);
}}

function bytesHex(address, count) {{
  return safe(() => {{
    const bytes = ptr(address).readByteArray(count);
    if (bytes === null) return null;
    return Array.prototype.map.call(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('');
  }}, null);
}}

function backtrace(context) {{
  return safe(
    () => Thread.backtrace(context, Backtracer.FUZZY).slice(0, 8).map((frame) => hex(frame)),
    []
  );
}}

const rootGlobal = abs('0x007cd04c');
const cameraX = abs('0x00c5153c');
const cameraY = abs('0x00c51540');
const cameraZ = abs('0x00c51544');

function currentGridSnapshot(reason) {{
  const root = readPtr(rootGlobal);
  if (root.isNull()) {{
    return {{ reason, root: null }};
  }}
  const raw = readS32(root.add(0x11178));
  return {{
    reason,
    root: hex(root),
    currentRaw: raw,
    currentX: raw === null ? null : raw % 100,
    currentY: raw === null ? null : Math.trunc(raw / 100),
    listCount1117c: readU32(root.add(0x1117c)),
    listHead11180Hex: bytesHex(root.add(0x11180), Math.min(SAMPLE_BYTES, 96)),
    gridSample0008Hex: bytesHex(root.add(0x8), SAMPLE_BYTES),
    camera: {{
      x: readF32(cameraX),
      y: readF32(cameraY),
      z: readF32(cameraZ),
    }},
  }};
}}

function snapshotKey(snapshot) {{
  return JSON.stringify([
    snapshot.root,
    snapshot.currentRaw,
    snapshot.listCount1117c,
    snapshot.listHead11180Hex,
    snapshot.gridSample0008Hex,
    snapshot.camera,
  ]);
}}

function emitSnapshot(tag, extra) {{
  const snapshot = currentGridSnapshot(tag);
  const key = snapshotKey(snapshot);
  const previous = lastKey;
  lastKey = key;
  seq += 1;
  send({{
    tag,
    seq,
    t: Date.now(),
    moduleBase: hex(moduleBase),
    currentGridSnapshot: snapshot,
    rawChanged: previous !== null && previous !== key,
    ...(extra || {{}}),
  }});
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
    seq += 1;
    send({{ tag: 'hook-failed', seq, t: Date.now(), name, va: vaText, error: String(error) }});
  }}
}}

installHook('0x004d3a40', 'expandedGridInit-004d3a40');
installHook('0x004d4e90', 'focusFromCurrentRaw-004d4e90');
installHook('0x004d5030', 'selectGridSeed-004d5030');
installHook('0x0057bbc0', 'listReader-0057bbc0');
installHook('0x0058d140', 'currentRawConsumer-0058d140');
installHook('0x0058ee70', 'currentRawConsumer-0058ee70');
emitSnapshot('watch-ready', {{ rootGlobal: hex(rootGlobal), pollMs: POLL_MS, sampleBytes: SAMPLE_BYTES }});

setInterval(function pollCurrentGrid() {{
  const snapshot = currentGridSnapshot('poll');
  const key = snapshotKey(snapshot);
  if (lastKey !== key) {{
    emitSnapshot('poll-change', {{ previousKey: lastKey }});
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
    import frida  # type: ignore[import-not-found]

    pid = args.pid if args.pid is not None else _session_pid(args.session)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    events = 0
    out = args.out.open("a", encoding="utf-8")
    session = None
    script = None

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
        script = session.create_script(build_js(sample_bytes=args.sample_bytes, poll_ms=args.poll_ms))
        script.on("message", on_message)
        script.load()
        time.sleep(args.seconds)
    finally:
        if script is not None:
            script.unload()
        if session is not None:
            session.detach()
        out.close()

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
    return run(parser.parse_args())


if __name__ == "__main__":
    raise SystemExit(main())
