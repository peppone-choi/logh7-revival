#!/usr/bin/env python3
"""Probe tactical active-unit rows vs render-object rows around the 0x004c9b0b crash.

This is read-only. It attaches Frida hooks to the running legacy client and records
the ids flowing through FUN_004c32a0, FUN_004c96c0, and FUN_004c9a80.
"""

from __future__ import annotations

import argparse
import csv
import importlib
import io
import json
import subprocess
import time
from pathlib import Path
from typing import Any


JS = r"""
const mod = Process.enumerateModules()[0];
const IMAGE = ptr("0x400000");
const MAX_EVENTS = __MAX_EVENTS__;
const events = [];
const counts = {};
const errors = [];
let lastLookup = null;
let lastCurrentId = null;
let lastCurrentUnitId = null;

function va(a) {
  return mod.base.add(ptr(a).sub(IMAGE));
}

function safe(fn, fallback) {
  try {
    return fn();
  } catch (e) {
    return fallback;
  }
}

function hex(v) {
  if (v === null || v === undefined) return null;
  return safe(function () {
    const p = ptr(v);
    return p.isNull() ? null : p.toString();
  }, String(v));
}

function argU32(ctx, n) {
  return safe(function () {
    return ctx.esp.add(n * 4).readU32();
  }, 0);
}

function argPtr(ctx, n) {
  return ptr(argU32(ctx, n));
}

function readPtr(a) {
  return safe(function () {
    return ptr(a).readPointer();
  }, ptr("0x0"));
}

function readU8(a) {
  return safe(function () {
    return ptr(a).readU8();
  }, null);
}

function readU16(a) {
  return safe(function () {
    return ptr(a).readU16();
  }, null);
}

function readU32(a) {
  return safe(function () {
    return ptr(a).readU32();
  }, null);
}

function readF32(a) {
return safe(function () {
return ptr(a).readFloat();
}, null);
}

function u32ToF32(v) {
return safe(function () {
const b = Memory.alloc(4);
b.writeU32(v >>> 0);
return b.readFloat();
}, null);
}

function bytesHex(a, len) {
  return safe(function () {
    return Array.prototype.map.call(
      new Uint8Array(ptr(a).readByteArray(len)),
      function (b) { return ("0" + b.toString(16)).slice(-2); }
    ).join("");
  }, null);
}

function clientBase() {
  return readPtr(va("0x007ccffc"));
}

function pushEvent(event) {
  event.t = Date.now();
  events.push(event);
  if (events.length > MAX_EVENTS) events.shift();
  counts[event.event] = (counts[event.event] || 0) + 1;
  send(event);
}

function tacticalEntry(entry) {
  return {
    ptr: hex(entry),
    active: readU8(entry),
    id: readU32(entry.add(4)),
    flag09: readU8(entry.add(9)),
    side0d: readU8(entry.add(0x0d)),
    side0e: readU8(entry.add(0x0e)),
    side0f: readU8(entry.add(0x0f)),
    targetId: readU32(entry.add(0x5c)),
    needsMove: readU8(entry.add(0x60)),
    needsPositionUpdate: readU8(entry.add(0x61)),
    lastTick: readU32(entry.add(100)),
    status435: readU8(entry.add(0x435)),
    visible5ba: readU8(entry.add(0x5ba)),
    field95e: readU8(entry.add(0x95e)),
x: readF32(entry.add(0x14)),
y_or_raw18: readF32(entry.add(0x18)),
z_or_y: readF32(entry.add(0x1c)),
heading_or_raw20: readF32(entry.add(0x20)),
currentLinkId24: readU32(entry.add(0x24)),
currentLinkF24: readF32(entry.add(0x24)),
flaggedCurrentId96c: readU32(entry.add(0x96c))
};
}

function renderEntry(entry) {
  return {
    ptr: hex(entry),
    active: readU8(entry),
    id: readU32(entry.add(4)),
    flag08: readU8(entry.add(8)),
    flag09: readU8(entry.add(9)),
    flag0a: readU8(entry.add(10)),
    flag0b: readU8(entry.add(11)),
    count14: readU32(entry.add(0x14)),
    count1c: readU32(entry.add(0x1c)),
    shipKind: readU16(entry.add(0x8bc)),
    x: readF32(entry.add(0x88c)),
    y: readF32(entry.add(0x890)),
    z: readF32(entry.add(0x894)),
    x2: readF32(entry.add(0x898)),
    y2: readF32(entry.add(0x89c)),
    z2: readF32(entry.add(0x8a0))
  };
}

function scanTacticalPool(base, limit) {
  const pool = base.add(0x126718);
  const out = [];
  for (let i = 0; i < 600 && out.length < limit; i++) {
    const entry = pool.add(4 + i * 0x9ec);
    if (readU8(entry) !== 0) {
      const row = tacticalEntry(entry);
      row.index = i;
      out.push(row);
    }
  }
  return out;
}

function scanRenderPool(limit) {
  const root = va("0x007db3c8");
  const out = [];
  for (let i = 0; i < 600 && out.length < limit; i++) {
    const entry = root.add(i * 0xb4c);
    if (readU8(entry) !== 0) {
      const row = renderEntry(entry);
      row.index = i;
      out.push(row);
    }
  }
  return out;
}

function scanUnitTable(base, limit) {
  const count = readU16(base.add(0x41a364)) || 0;
  const out = [];
  const root = base.add(0x41a368);
  for (let i = 0; i < count && i < limit; i++) {
    const row = root.add(i * 0x58);
    out.push({
      index: i,
      id: readU32(row),
      faction04: readU8(row.add(4)),
      flag06: readU8(row.add(6)),
      commander08: readU32(row.add(8)),
      cell0c: readU32(row.add(0x0c)),
      owner44: readU8(row.add(0x44)),
      mapSection48: readU16(row.add(0x48)),
      headHex: bytesHex(row, 0x58)
    });
  }
  return out;
}

function scanTacticsInfo(base, limit) {
  const count = readU16(base.add(0x4271a8)) || 0;
  const out = [];
  const root = base.add(0x4271ac);
  for (let i = 0; i < count && i < limit; i++) {
    const row = root.add(i * 0x34);
    out.push({
      index: i,
      id: readU32(row),
      controllable04: readU32(row.add(4)),
      field08: readU32(row.add(8)),
      x: readF32(row.add(0x0c)),
      y: readF32(row.add(0x10)),
      z: readF32(row.add(0x14)),
      heading: readF32(row.add(0x18)),
      headHex: bytesHex(row, 0x34)
    });
  }
  return out;
}

function snapshot() {
  const base = clientBase();
  if (base.isNull()) {
    return { clientBase: null };
  }
  return {
    clientBase: hex(base),
    selectedCharId: readU32(base.add(0x3584a0)),
    modeByte: readU8(base.add(0x126711)),
    tacticalPoolHead: readU8(base.add(0x126718)),
    tacticsInfoCount: readU16(base.add(0x4271a8)),
    unitTableCount: readU16(base.add(0x41a364)),
    characterCount: readU32(base.add(0x36a5dc)),
    lastCurrentId: lastCurrentId,
    lastCurrentUnitId: lastCurrentUnitId,
    lastLookup: lastLookup,
    tacticsInfo: scanTacticsInfo(base, 8),
    unitTable: scanUnitTable(base, 8),
    tacticalPool: scanTacticalPool(base, 12),
    renderPool: scanRenderPool(12)
  };
}

function hook(addr, name, callbacks) {
  try {
    Interceptor.attach(va(addr), callbacks);
    pushEvent({ event: "hook-installed", name: name, addr: addr });
  } catch (e) {
    errors.push({ hook: name, addr: addr, error: String(e) });
  }
}

hook("0x004c32a0", "build-tactical-pool", {
  onEnter: function () {
    this.base = this.context.ecx;
    this.param2 = argU32(this.context, 1) & 0xff;
    pushEvent({
      event: "c32a0-enter",
      thisPtr: hex(this.base),
      param2: this.param2,
      state: snapshot()
    });
  },
  onLeave: function () {
    pushEvent({
      event: "c32a0-leave",
      thisPtr: hex(this.base),
      param2: this.param2,
      state: snapshot()
    });
  }
});

hook("0x004c46a0", "create-tactical-entry", {
  onEnter: function () {
    this.args = [];
    for (let i = 1; i <= 8; i++) this.args.push(argU32(this.context, i));
    pushEvent({
      event: "c46a0-enter",
      ecx: hex(this.context.ecx),
      args: this.args,
      stackHeadHex: bytesHex(this.context.esp, 64)
    });
  },
  onLeave: function (retval) {
    const p = ptr(retval);
    pushEvent({
      event: "c46a0-leave",
      ret: hex(p),
      entry: p.isNull() ? null : tacticalEntry(p),
      state: snapshot()
    });
  }
});

hook("0x004c1d20", "set-tactical-current-link", {
onEnter: function () {
this.entry = argPtr(this.context, 1);
this.xRaw = argU32(this.context, 2);
this.yRaw = argU32(this.context, 3);
this.currentId = argU32(this.context, 4);
this.parent = argPtr(this.context, 5);
this.kind = argU32(this.context, 6) & 0xff;
pushEvent({
event: "c1d20-enter",
entryPtr: hex(this.entry),
xRaw: this.xRaw,
x: u32ToF32(this.xRaw),
yRaw: this.yRaw,
y: u32ToF32(this.yRaw),
currentId: this.currentId,
parentPtr: hex(this.parent),
kind: this.kind,
before: this.entry.isNull() ? null : tacticalEntry(this.entry)
});
},
onLeave: function () {
pushEvent({
event: "c1d20-leave",
entryPtr: hex(this.entry),
currentId: this.currentId,
kind: this.kind,
after: this.entry.isNull() ? null : tacticalEntry(this.entry)
});
}
});

hook("0x004be490", "pool-post-add", {
  onEnter: function () {
    const pool = argPtr(this.context, 1);
    const entry = argPtr(this.context, 2);
    pushEvent({
      event: "be490-enter",
      poolPtr: hex(pool),
      entryPtr: hex(entry),
      poolHead: readU8(pool),
      entry: entry.isNull() ? null : tacticalEntry(entry)
    });
  },
  onLeave: function (retval) {
    pushEvent({ event: "be490-leave", ret: retval.toInt32(), state: snapshot() });
  }
});

hook("0x004be560", "tactical-frame-update", {
  onEnter: function () {
    pushEvent({
      event: "be560-enter",
      poolPtr: hex(argPtr(this.context, 1)),
      state: snapshot()
    });
  }
});

hook("0x004c9a80", "position-update", {
  onEnter: function () {
    const entry = argPtr(this.context, 1);
    this.entry = entry;
    pushEvent({
      event: "c9a80-enter",
      entryPtr: hex(entry),
      entry: entry.isNull() ? null : tacticalEntry(entry),
      state: snapshot()
    });
  },
  onLeave: function () {
    pushEvent({
      event: "c9a80-leave",
      entryPtr: hex(this.entry),
      state: snapshot()
    });
  }
});

hook("0x004c96c0", "lookup-render-object", {
  onEnter: function () {
    this.lookupId = argU32(this.context, 1);
    pushEvent({
      event: "c96c0-enter",
      lookupId: this.lookupId,
      state: snapshot()
    });
  },
  onLeave: function (retval) {
    const p = ptr(retval);
    lastLookup = {
      lookupId: this.lookupId,
      ret: hex(p),
      isNull: p.isNull(),
      render: p.isNull() ? null : renderEntry(p)
    };
    pushEvent({
      event: "c96c0-leave",
      lookupId: this.lookupId,
      ret: hex(p),
      isNull: p.isNull(),
      render: p.isNull() ? null : renderEntry(p),
      state: p.isNull() ? snapshot() : null
    });
  }
});

hook("0x004b5b80", "current-id", {
  onEnter: function () {
    this.ecx = this.context.ecx;
  },
  onLeave: function (retval) {
    lastCurrentId = retval.toUInt32();
    pushEvent({ event: "b5b80-leave", ecx: hex(this.ecx), ret: lastCurrentId });
  }
});

hook("0x004b5c00", "current-unit-id", {
  onEnter: function () {
    this.ecx = this.context.ecx;
  },
  onLeave: function (retval) {
    lastCurrentUnitId = retval.toUInt32();
    pushEvent({ event: "b5c00-leave", ecx: hex(this.ecx), ret: lastCurrentUnitId });
  }
});

hook("0x004c7fc0", "find-current-tactical-entry", {
  onEnter: function () {
    this.pool = argPtr(this.context, 1);
    this.id = argU32(this.context, 2);
    this.mode = argU32(this.context, 3) & 0xff;
  },
  onLeave: function (retval) {
    const p = ptr(retval);
    pushEvent({
      event: "c7fc0-leave",
      poolPtr: hex(this.pool),
      id: this.id,
      mode: this.mode,
      ret: hex(p),
      entry: p.isNull() ? null : tacticalEntry(p)
    });
  }
});

hook("0x004c7cd0", "find-tactical-entry-by-id", {
  onEnter: function () {
    this.pool = argPtr(this.context, 1);
    this.id = argU32(this.context, 2);
    this.mode = argU32(this.context, 3) & 0xff;
    this.a = argU32(this.context, 4) & 0xff;
    this.b = argU32(this.context, 5) & 0xff;
    this.c = argU32(this.context, 6) & 0xff;
  },
  onLeave: function (retval) {
    const p = ptr(retval);
    pushEvent({
      event: "c7cd0-leave",
      poolPtr: hex(this.pool),
      id: this.id,
      mode: this.mode,
      a: this.a,
      b: this.b,
      c: this.c,
      ret: hex(p),
      entry: p.isNull() ? null : tacticalEntry(p)
    });
  }
});

rpc.exports = {
  dump: function () {
    return JSON.stringify({
      counts: counts,
      errors: errors,
      state: snapshot(),
      events: events
    });
  }
};
"""


def _build_js(max_events: int) -> str:
    return JS.replace("__MAX_EVENTS__", str(max(64, int(max_events))))


def find_pid(image_name: str = "G7MTClient.exe") -> int | None:
    out = subprocess.run(
        ["tasklist", "/FI", f"IMAGENAME eq {image_name}", "/FO", "CSV", "/NH"],
        capture_output=True,
        text=True,
        timeout=10,
        check=False,
    ).stdout
    for row in csv.reader(io.StringIO(out)):
        if len(row) >= 2 and image_name.lower() in row[0].lower():
            return int(row[1])
    return None


def session_pid(session_dir: Path) -> int:
    state = json.loads((session_dir / "session.json").read_text(encoding="utf-8"))
    pid = int(state["clientPid"])
    if pid <= 0:
        raise ValueError(f"invalid clientPid in {session_dir / 'session.json'}: {pid}")
    return pid


def summarize(result: dict[str, Any]) -> dict[str, Any]:
    events = result.get("events") if isinstance(result.get("events"), list) else []
    nulls = [e for e in events if e.get("event") == "c96c0-leave" and e.get("isNull")]
    c32 = [e for e in events if e.get("event") == "c32a0-leave"]
    c46 = [e for e in events if e.get("event") == "c46a0-leave"]
    c9 = [e for e in events if e.get("event") == "c9a80-enter"]
    state = result.get("state") if isinstance(result.get("state"), dict) else {}
    tactical_ids = [
        row.get("id")
        for row in state.get("tacticalPool", [])
        if isinstance(row, dict) and row.get("id") is not None
    ]
    render_ids = [
        row.get("id")
        for row in state.get("renderPool", [])
        if isinstance(row, dict) and row.get("id") is not None
    ]
    if nulls:
        verdict = "lookup-null"
    elif c9:
        verdict = "position-update-observed"
    elif c46:
        verdict = "pool-build-without-position-update"
    elif c32:
        verdict = "pool-builder-observed"
    else:
        verdict = "no-tactical-builder-observed"
    return {
        "verdictCode": verdict,
        "c32a0Leave": len(c32),
        "c46a0Leave": len(c46),
        "c9a80Enter": len(c9),
        "lookupNulls": len(nulls),
        "firstLookupNull": nulls[0] if nulls else None,
        "tacticalIds": tactical_ids,
        "renderIds": render_ids,
        "missingRenderIds": [i for i in tactical_ids if i not in render_ids],
        "lastCurrentId": state.get("lastCurrentId"),
        "lastCurrentUnitId": state.get("lastCurrentUnitId"),
    }


def run_probe(
    *,
    pid: int,
    seconds: float,
    interval: float,
    max_events: int,
    timeline_out: Path | None,
) -> dict[str, Any]:
    frida = importlib.import_module("frida")
    session = frida.attach(pid)
    timeline = None
    if timeline_out is not None:
        timeline_out.parent.mkdir(parents=True, exist_ok=True)
        timeline = timeline_out.open("w", encoding="utf-8")

    def on_message(message: dict[str, Any], data: bytes | None) -> None:
        if timeline is None or timeline.closed:
            return
        timeline.write(
            json.dumps(
                {"message": message, "dataLength": 0 if data is None else len(data)},
                ensure_ascii=False,
            )
            + "\n"
        )
        timeline.flush()

    script = session.create_script(_build_js(max_events))
    script.on("message", on_message)
    script.load()
    rpc = script.exports_sync
    result: dict[str, Any] = {}
    try:
        started = time.time()
        while time.time() - started < seconds:
            time.sleep(max(0.05, interval))
        raw = rpc.dump()
        result = json.loads(raw)
    except Exception as error:  # Frida loses the RPC channel if the client crashes.
        result = {"probeError": str(error)}
    finally:
        if timeline is not None:
            timeline.close()
        try:
            session.detach()
        except Exception:
            pass
    result["pid"] = pid
    result["summary"] = summarize(result)
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pid", type=int)
    parser.add_argument("--session", type=Path)
    parser.add_argument("--image-name", default="G7MTClient.exe")
    parser.add_argument("--seconds", type=float, default=20.0)
    parser.add_argument("--interval", type=float, default=0.25)
    parser.add_argument("--max-events", type=int, default=512)
    parser.add_argument("--out", type=Path)
    parser.add_argument("--timeline-out", type=Path)
    args = parser.parse_args()

    pid = args.pid
    if pid is None and args.session is not None:
        pid = session_pid(args.session)
    if pid is None:
        pid = find_pid(args.image_name)
    if not pid:
        print(json.dumps({"error": "no pid", "imageName": args.image_name}, indent=2))
        return 1

    result = run_probe(
        pid=pid,
        seconds=args.seconds,
        interval=args.interval,
        max_events=args.max_events,
        timeline_out=args.timeline_out,
    )
    if args.out is not None:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
