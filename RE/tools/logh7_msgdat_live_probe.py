from __future__ import annotations

import argparse
import json
import time
from pathlib import Path
from typing import Any

import frida


LOOKUP_RVA = 0x122010  # VA 0x00522010 in non-ASLR LOGH VII client.
GROUP_FIRST_RVA = 0x1229D0  # VA 0x005229d0, group-first-string helper.


def _js(sample_limit: int, backtrace_depth: int) -> str:
    return f"""
const mainModule = Process.enumerateModules()[0];
const lookupTarget = mainModule.base.add({LOOKUP_RVA});
const groupFirstTarget = mainModule.base.add({GROUP_FIRST_RVA});
const sampleLimit = {sample_limit};
const backtraceDepth = {backtrace_depth};
let seq = 0;
let emitted = 0;

function readBytes(ptrValue, limit) {{
  if (ptrValue.isNull()) return {{ hex: "", text: "" }};
  const bytes = [];
  for (let i = 0; i < limit; i += 1) {{
    let b = 0;
    try {{
      b = Memory.readU8(ptrValue.add(i));
    }} catch (_) {{
      break;
    }}
    if (b === 0) break;
    bytes.push(b);
  }}
  let hex = "";
  let text = "";
  for (const b of bytes) {{
    hex += ("0" + b.toString(16)).slice(-2);
    text += (b >= 0x20 && b <= 0x7e) ? String.fromCharCode(b) : ".";
  }}
  return {{ hex, text }};
}}

function bt(context) {{
  return Thread.backtrace(context, Backtracer.ACCURATE)
    .slice(0, backtraceDepth)
    .map((addr) => addr.toString());
}}

send({{
  tag: "lookup-ready",
  seq: ++seq,
  t: Date.now(),
  moduleBase: mainModule.base.toString(),
  lookupTarget: lookupTarget.toString(),
  groupFirstTarget: groupFirstTarget.toString(),
  sampleLimit,
  backtraceDepth,
}});

Interceptor.attach(lookupTarget, {{
  onEnter(args) {{
    this.group = args[0].toInt32();
    this.subId = args[1].toInt32();
    this.arg3 = args[2].toInt32();
    this.thisEcx = this.context.ecx;
    this.returnVa = this.returnAddress;
    this.backtrace = bt(this.context);
  }},
  onLeave(retval) {{
    if (emitted >= sampleLimit) return;
    emitted += 1;
    const result = readBytes(retval, 96);
    send({{
      tag: "msgdat-00522010-leave",
      seq: ++seq,
      t: Date.now(),
      moduleBase: mainModule.base.toString(),
      group: this.group,
      subId: this.subId,
      arg3: this.arg3,
      thisEcx: this.thisEcx.toString(),
      returnVa: this.returnVa.toString(),
      retval: retval.toString(),
      resultText: result.text,
      resultHex: result.hex,
      backtrace: this.backtrace,
    }});
  }},
}});

Interceptor.attach(groupFirstTarget, {{
  onEnter(args) {{
    this.group = args[0].toInt32();
    this.thisEcx = this.context.ecx;
    this.returnVa = this.returnAddress;
    this.backtrace = bt(this.context);
  }},
  onLeave(retval) {{
    if (emitted >= sampleLimit) return;
    emitted += 1;
    const result = readBytes(retval, 96);
    send({{
      tag: "msgdat-005229d0-leave",
      seq: ++seq,
      t: Date.now(),
      moduleBase: mainModule.base.toString(),
      group: this.group,
      thisEcx: this.thisEcx.toString(),
      returnVa: this.returnVa.toString(),
      retval: retval.toString(),
      resultText: result.text,
      resultHex: result.hex,
      backtrace: this.backtrace,
    }});
  }},
}});
"""


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Attach to G7MTClient and log MsgDat lookup helpers."
    )
    parser.add_argument("--pid", type=int, required=True)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--duration", type=float, default=8.0)
    parser.add_argument("--sample-limit", type=int, default=320)
    parser.add_argument("--backtrace-depth", type=int, default=10)
    args = parser.parse_args()

    samples: list[dict[str, Any]] = []

    def on_message(message: dict[str, Any], _data: bytes | None) -> None:
        if message.get("type") == "send" and isinstance(message.get("payload"), dict):
            samples.append(message["payload"])
        elif message.get("type") == "error":
            samples.append({"tag": "frida-error", "message": message})

    session = frida.attach(args.pid)
    script = session.create_script(_js(args.sample_limit, args.backtrace_depth))
    script.on("message", on_message)
    script.load()
    time.sleep(max(0.0, args.duration))
    script.unload()
    session.detach()

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(samples, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"out": str(args.out), "samples": len(samples)}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
