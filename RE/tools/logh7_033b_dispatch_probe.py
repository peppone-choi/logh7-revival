#!/usr/bin/env python3
"""Read-only live probe for 0x033b tactical UnitShip dispatch.

This answers the current tactical NO DATA blocker:

1. Does the client dispatcher FUN_004ba2b0 receive 0x033b?
2. If yes, what payload count/first unit id does it see?
3. After the dispatcher returns, did clientBase+0x4271a8 receive a non-zero count?

The probe uses function-boundary Frida hooks only. It does not write process memory.
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


DEFAULT_WATCH_CODES = (0x033B, 0x0325, 0x0323, 0x0349, 0x0341, 0x0343, 0x0B0A, 0x042F, 0x0F1F)


JS = r"""
var mod = Process.enumerateModules()[0];
var IMAGE = ptr('0x400000');
var WATCH_CODES = __WATCH_CODES__;
var MAX_EVENTS = __MAX_EVENTS__;
var events = [];
var counts = {};
var errors = [];
var requestSelector = null;

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
    var p = ptr(v);
    return p.isNull() ? null : p.toString();
  }, String(v));
}

function argU32(ctx, n) {
  return safe(function () { return ctx.esp.add(n * 4).readU32(); }, 0);
}

function argPtr(ctx, n) {
  return ptr(argU32(ctx, n));
}

function readPtr(a) {
  return safe(function () { return ptr(a).readPointer(); }, ptr('0x0'));
}

function readU8(a) {
  return safe(function () { return ptr(a).readU8(); }, null);
}

function readU16(a) {
  return safe(function () { return ptr(a).readU16(); }, null);
}

function readU32(a) {
  return safe(function () { return ptr(a).readU32(); }, null);
}

function bytesHex(a, len) {
  return safe(function () {
    var raw = ptr(a).readByteArray(len);
    var bytes = new Uint8Array(raw);
    var out = [];
    for (var i = 0; i < bytes.length; i++) {
      out.push(('0' + (bytes[i] & 0xff).toString(16)).slice(-2));
    }
    return out.join('');
  }, null);
}

function watchCode(code) {
  for (var i = 0; i < WATCH_CODES.length; i++) {
    if (WATCH_CODES[i] === code) return true;
  }
  return false;
}

function clientBase() {
  return readPtr(va('0x007ccffc'));
}

function clientState() {
  var base = clientBase();
  if (base.isNull()) return { clientBase: null };
  return {
    clientBase: hex(base),
    modeByte: readU8(base.add(0x126711)),
    tacticalPoolHead: readU8(base.add(0x126718)),
    tacticsInfoCount: readU16(base.add(0x4271a8)),
    tacticsInfoFirstId: readU32(base.add(0x4271ac)),
    unitTableCount: readU16(base.add(0x41a364)),
    tacticalEntryFlag: readU8(base.add(0x35f35a)),
    fieldImportProgress: readU32(base.add(0x357e88)),
    lastModeByte: readU8(base.add(0x358382)),
    commandPhaseFlag: readU8(base.add(0x35837e)),
    requestQueueCount: readU32(base.add(0x357ec0)),
    requestQueue0Code: readU16(base.add(0x357ec4)),
    requestQueue0Expected: readU16(base.add(0x357ec8)),
    requestQueue0Payload: readU32(base.add(0x357ecc)),
    transportObject: hex(readPtr(va('0x007c25f4')))
  };
}

function pushEvent(event) {
  event.t = Date.now();
  events.push(event);
  if (events.length > MAX_EVENTS) events.shift();
  counts[event.event] = (counts[event.event] || 0) + 1;
  if (event.codeHex) counts[event.event + ':' + event.codeHex] = (counts[event.event + ':' + event.codeHex] || 0) + 1;
  send(event);
}

try {
  Interceptor.attach(va('0x00404210'), {
    onEnter: function () {
      this.obj = this.context.ecx;
      this.stream = argPtr(this.context, 1);
    },
    onLeave: function (retval) {
      var code = readU16(this.obj.add(6));
      if (!watchCode(code)) return;
      var streamTotal = readU32(this.stream.add(8));
      var bodyBytes = streamTotal === null ? null : Math.max(0, streamTotal - 6);
      pushEvent({
        event: 'message32-input-leave',
        code: code,
        codeHex: '0x' + ('0000' + code.toString(16)).slice(-4),
        obj: hex(this.obj),
        stream: hex(this.stream),
        streamTotal: streamTotal,
        bodyBytes: bodyBytes,
        inlineCapacity: readU32(this.obj.add(0xc)),
        inlineBuffer: hex(readPtr(this.obj.add(0x14))),
        retval: hex(retval),
        state: clientState()
      });
    }
  });
} catch (e) {
  errors.push({ hook: '0x00404210', error: String(e) });
}

try {
  Interceptor.attach(va('0x004b78a0'), {
    onEnter: function () {
      var selector = argU32(this.context, 2) & 0xffff;
      this.selector = selector;
      this.watch = (selector === 0x27 || selector === 0x2b || selector === 0x2e);
      if (!this.watch) return;
      pushEvent({
        event: 'request-selector-enter',
        selector: selector,
        selectorHex: '0x' + ('0000' + selector.toString(16)).slice(-4),
        param2: argU32(this.context, 1) & 0xff,
        param4: argU32(this.context, 3) >>> 0,
        state: clientState()
      });
    },
    onLeave: function (retval) {
      if (!this.watch) return;
      pushEvent({
        event: 'request-selector-leave',
        selector: this.selector,
        selectorHex: '0x' + ('0000' + this.selector.toString(16)).slice(-4),
        retval: hex(retval),
        state: clientState()
      });
  }
});
} catch (e) {
  errors.push({ hook: '0x004b78a0', error: String(e) });
}

function attachStateHook(addr, name, argCount) {
  try {
    Interceptor.attach(va(addr), {
      onEnter: function () {
        this.name = name;
        var args = [];
        for (var i = 1; i <= argCount; i++) {
          args.push(argU32(this.context, i) >>> 0);
        }
        pushEvent({
          event: name + '-enter',
          thisPtr: hex(this.context.ecx),
          args: args,
          state: clientState()
        });
      },
      onLeave: function (retval) {
        pushEvent({
          event: this.name + '-leave',
          retval: hex(retval),
          state: clientState()
        });
      }
    });
  } catch (e) {
    errors.push({ hook: addr + ':' + name, error: String(e) });
  }
}

attachStateHook('0x004b68f0', 'field-import-loop-004b68f0', 0);
attachStateHook('0x004c32a0', 'build-tactical-pool-004c32a0', 1);
attachStateHook('0x004b63c0', 'set-field-mode-004b63c0', 2);
attachStateHook('0x004c4170', 'strategic-field-import-004c4170', 0);
attachStateHook('0x004b6e00', 'tactical-frame-loop-004b6e00', 0);

try {
  Interceptor.attach(va('0x004ae0d0'), {
    onEnter: function () {
      var code = argU32(this.context, 1) & 0xffff;
      this.code = code;
      this.watch = watchCode(code);
      if (!this.watch) return;
      var payload = argPtr(this.context, 3);
      pushEvent({
        event: 'raw-message-enter',
        code: code,
        codeHex: '0x' + ('0000' + code.toString(16)).slice(-4),
        thisPtr: hex(this.context.ecx),
        param3: argU32(this.context, 2) >>> 0,
        payloadPtr: hex(payload),
        payloadHeadHex: bytesHex(payload, 32),
        state: clientState()
      });
    }
  });
} catch (e) {
  errors.push({ hook: '0x004ae0d0', error: String(e) });
}

try {
  Interceptor.attach(va('0x004ba2b0'), {
    onEnter: function () {
      var code = argU32(this.context, 1) & 0xffff;
      this.code = code;
      this.watch = watchCode(code);
      if (!this.watch) return;
      this.payload = argPtr(this.context, 2);
      var event = {
        event: 'dispatch-enter',
        code: code,
        codeHex: '0x' + ('0000' + code.toString(16)).slice(-4),
        thisPtr: hex(this.context.ecx),
        payloadPtr: hex(this.payload),
        state: clientState()
      };
      if (code === 0x033b) {
        event.payloadCount = readU16(this.payload);
        event.payloadFirstId = readU32(this.payload.add(4));
        event.payloadHeadHex = bytesHex(this.payload, 32);
      }
      pushEvent(event);
    },
    onLeave: function (retval) {
      if (!this.watch) return;
      var event = {
        event: 'dispatch-leave',
        code: this.code,
        codeHex: '0x' + ('0000' + this.code.toString(16)).slice(-4),
        retval: hex(retval),
        state: clientState()
      };
      if (this.code === 0x033b) {
        event.afterCount = event.state ? event.state.tacticsInfoCount : null;
        event.afterFirstId = event.state ? event.state.tacticsInfoFirstId : null;
      }
      pushEvent(event);
    }
  });
} catch (e) {
  errors.push({ hook: '0x004ba2b0', error: String(e) });
}

try {
  Interceptor.attach(va('0x004b8b00'), {
    onEnter: function () {
      var code = argU32(this.context, 1) & 0xffff;
      this.code = code;
      this.watch = watchCode(code);
      if (!this.watch) return;
      this.countPtr = argPtr(this.context, 3);
      this.sizePtr = argPtr(this.context, 4);
      pushEvent({
        event: 'classifier-enter',
        code: code,
        codeHex: '0x' + ('0000' + code.toString(16)).slice(-4),
        bodyPtr: hex(argPtr(this.context, 2)),
        countPtr: hex(this.countPtr),
        sizePtr: hex(this.sizePtr),
        state: clientState()
      });
    },
    onLeave: function (retval) {
      if (!this.watch) return;
      pushEvent({
        event: 'classifier-leave',
        code: this.code,
        codeHex: '0x' + ('0000' + this.code.toString(16)).slice(-4),
        ret: retval.toInt32(),
        retHex: hex(retval),
        outCountOrDelay: readU32(this.countPtr),
        outSize: readU32(this.sizePtr),
        state: clientState()
      });
    }
  });
} catch (e) {
  errors.push({ hook: '0x004b8b00', error: String(e) });
}

try {
  Interceptor.attach(va('0x004b8850'), {
    onEnter: function () {
      var code = argU32(this.context, 1) & 0xffff;
      this.code = code;
      this.watch = watchCode(code);
      if (!this.watch) return;
      this.payload = argPtr(this.context, 2);
      pushEvent({
        event: 'recv-enqueue-enter',
        code: code,
        codeHex: '0x' + ('0000' + code.toString(16)).slice(-4),
        thisPtr: hex(this.context.ecx),
        payloadPtr: hex(this.payload),
        payloadHeadHex: bytesHex(this.payload, 32),
        state: clientState()
      });
    },
    onLeave: function (retval) {
      if (!this.watch) return;
      pushEvent({
        event: 'recv-enqueue-leave',
        code: this.code,
        codeHex: '0x' + ('0000' + this.code.toString(16)).slice(-4),
        ret: retval.toInt32(),
        retHex: hex(retval),
        state: clientState()
      });
    }
  });
} catch (e) {
  errors.push({ hook: '0x004b8850', error: String(e) });
}

try {
  Interceptor.attach(va('0x00421f80'), {
    onEnter: function () {
      var record = argPtr(this.context, 1);
      pushEvent({
        event: '033b-parser-enter',
        recordPtr: hex(record),
        recordCount: readU16(record),
        recordFirstId: readU32(record.add(4)),
        recordHeadHex: bytesHex(record, 32),
        state: clientState()
      });
    },
    onLeave: function (retval) {
      pushEvent({
        event: '033b-parser-leave',
        retval: hex(retval),
        state: clientState()
      });
    }
  });
} catch (e) {
  errors.push({ hook: '0x00421f80', error: String(e) });
}

rpc.exports = {
  invokeSelector: function (selector, param2, param4, payloadBytes) {
    var base = clientBase();
    if (base.isNull()) {
      return { ok: false, error: 'clientBase null', state: clientState() };
    }
    if (requestSelector === null) {
      requestSelector = new NativeFunction(
        va('0x004b78a0'),
        'uint',
        ['pointer', 'uint8', 'uint', 'uint'],
        'thiscall'
      );
    }
    var before = clientState();
    var ret = null;
    var err = null;
    var payloadPtr = ptr(param4 >>> 0);
    if ((param4 >>> 0) === 0 && payloadBytes > 0) {
      payloadPtr = Memory.alloc(payloadBytes >>> 0);
      payloadPtr.writeByteArray(new Uint8Array(payloadBytes >>> 0));
    }
    try {
      ret = requestSelector(base, param2 & 0xff, selector >>> 0, payloadPtr.toUInt32()) >>> 0;
    } catch (e) {
      err = String(e);
    }
    var event = {
      event: 'invoke-selector',
      selector: selector >>> 0,
      selectorHex: '0x' + ('0000' + (selector >>> 0).toString(16)).slice(-4),
      param2: param2 & 0xff,
      param4: param4 >>> 0,
      payloadPtr: hex(payloadPtr),
      payloadBytes: payloadBytes >>> 0,
      ret: ret,
      retHex: ret === null ? null : '0x' + ret.toString(16),
      error: err,
      before: before,
      after: clientState()
    };
    pushEvent(event);
    return event;
  },
dumpStateJson: function () {
if (__DUMP_LITERAL__) return "{\"ping\":1}";
try {
var snapshot = {
counts: counts,
errors: errors,
state: null,
events: events
};
try {
snapshot.state = clientState();
} catch (e) {
snapshot.state = { error: String(e) };
}
return JSON.stringify(snapshot);
} catch (e) {
return JSON.stringify({ dumpError: String(e), counts: counts, errors: errors, state: null, eventsLength: events.length });
}
}
};
"""


def _build_js(watch_codes: list[int], max_events: int) -> str:
    return (
        JS.replace("__WATCH_CODES__", json.dumps([code & 0xFFFF for code in watch_codes]))
        .replace("__MAX_EVENTS__", str(max(16, int(max_events))))
        .replace("__DUMP_LITERAL__", "false")
    )


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


def _parse_codes(value: str | None) -> list[int]:
    if not value:
        return list(DEFAULT_WATCH_CODES)
    codes: list[int] = []
    for part in value.replace(",", " ").split():
        codes.append(int(part, 0) & 0xFFFF)
    return codes


def _summarize(result: dict[str, Any]) -> dict[str, Any]:
    events = result.get("events") if isinstance(result.get("events"), list) else []
    dispatch_033b = [e for e in events if e.get("event") == "dispatch-enter" and e.get("code") == 0x033B]
    leave_033b = [e for e in events if e.get("event") == "dispatch-leave" and e.get("code") == 0x033B]
    parser_enter = [e for e in events if e.get("event") == "033b-parser-enter"]
    state = result.get("state") if isinstance(result.get("state"), dict) else {}
    if not dispatch_033b:
        verdict = "033b-dispatch-missing"
    elif not parser_enter:
        verdict = "033b-dispatch-no-parser"
    elif not leave_033b:
        verdict = "033b-no-leave"
    elif int(state.get("tacticsInfoCount") or 0) <= 0:
        verdict = "033b-copied-zero-or-not-copied"
    else:
        verdict = "033b-copied-nonzero"
    return {
        "verdictCode": verdict,
        "dispatch033b": len(dispatch_033b),
        "parserEnter": len(parser_enter),
        "dispatch033bLeave": len(leave_033b),
        "finalState": state,
        "first033b": dispatch_033b[0] if dispatch_033b else None,
        "last033bLeave": leave_033b[-1] if leave_033b else None,
    }


def run_probe(
    *,
    pid: int,
    seconds: float,
    interval: float,
    watch_codes: list[int],
    max_events: int,
    timeline_out: Path | None,
    invoke_selector: int | None = None,
    invoke_delay: float = 0.5,
    invoke_param2: int = 1,
    invoke_param4: int = 0,
    invoke_payload_bytes: int = 0,
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
        try:
            timeline.write(json.dumps({"message": message, "dataLength": 0 if data is None else len(data)}, ensure_ascii=False) + "\n")
            timeline.flush()
        except ValueError:
            return

    script = session.create_script(_build_js(watch_codes, max_events))
    script.on("message", on_message)
    script.load()
    rpc = script.exports_sync
    try:
        invocation = None
        if invoke_selector is not None:
            time.sleep(max(0.0, invoke_delay))
            invocation = rpc.invoke_selector(
                invoke_selector & 0xFFFF,
                invoke_param2 & 0xFF,
                invoke_param4 & 0xFFFFFFFF,
                max(0, int(invoke_payload_bytes)),
            )
        started = time.time()
        while time.time() - started < seconds:
            time.sleep(max(0.05, interval))
        result_json = rpc.dump_state_json()
        result = json.loads(result_json) if result_json else {}
        if invocation is not None:
            result["invocation"] = invocation
    finally:
        if timeline is not None:
            timeline.close()
        try:
            session.detach()
        except Exception:
            pass
    result["pid"] = pid
    result["summary"] = _summarize(result)
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pid", type=int)
    parser.add_argument("--session", type=Path, help="ui_explorer session dir; used when --pid is omitted")
    parser.add_argument("--image-name", default="G7MTClient.exe")
    parser.add_argument("--seconds", type=float, default=20.0)
    parser.add_argument("--interval", type=float, default=0.25)
    parser.add_argument("--watch-codes", help="comma/space-separated opcode list; default tactical entry set")
    parser.add_argument("--max-events", type=int, default=256)
    parser.add_argument("--invoke-selector", type=lambda value: int(value, 0), help="optional FUN_004b78a0 selector to invoke after hooks load")
    parser.add_argument("--invoke-delay", type=float, default=0.5)
    parser.add_argument("--invoke-param2", type=lambda value: int(value, 0), default=1)
    parser.add_argument("--invoke-param4", type=lambda value: int(value, 0), default=0)
    parser.add_argument("--invoke-payload-bytes", type=lambda value: int(value, 0), default=0)
    parser.add_argument("--out", type=Path)
    parser.add_argument("--timeline-out", type=Path)
    args = parser.parse_args()

    pid = args.pid
    if pid is None and args.session is not None:
        pid = session_pid(args.session)
    if pid is None:
        pid = find_pid(args.image_name)
    if not pid:
        print(json.dumps({"error": "no pid", "imageName": args.image_name}, ensure_ascii=False, indent=2))
        return 1

    timeline_out = args.timeline_out
    if timeline_out is None and args.out is not None:
        timeline_out = args.out.with_suffix(".jsonl")
    result = run_probe(
        pid=pid,
        seconds=args.seconds,
        interval=args.interval,
        watch_codes=_parse_codes(args.watch_codes),
        max_events=args.max_events,
        timeline_out=timeline_out,
        invoke_selector=args.invoke_selector,
        invoke_delay=args.invoke_delay,
        invoke_param2=args.invoke_param2,
        invoke_param4=args.invoke_param4,
        invoke_payload_bytes=args.invoke_payload_bytes,
    )
    encoded = json.dumps(result, ensure_ascii=False, indent=2)
    if args.out is not None:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(encoded + "\n", encoding="utf-8")
    print(encoded)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
