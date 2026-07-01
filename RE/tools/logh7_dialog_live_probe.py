from __future__ import annotations

import argparse
import json
import time
from pathlib import Path
from typing import Any

import frida


RVA_DIALOG_OPEN = 0x14ED00  # VA 0x0054ed00
RVA_DIALOG_TYPE = 0x170340  # VA 0x00570340
RVA_DIALOG_TEXT4 = 0x170650  # VA 0x00570650
RVA_DIALOG_TEXT5 = 0x1706E0  # VA 0x005706e0


def _js(sample_limit: int, backtrace_depth: int) -> str:
    return f"""
const mainModule = Process.enumerateModules()[0];
const sampleLimit = {sample_limit};
const backtraceDepth = {backtrace_depth};
let seq = 0;
let emitted = 0;

function addr(rva) {{
  return mainModule.base.add(rva);
}}

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
    .map((one) => one.toString());
}}

function emit(payload) {{
  if (emitted >= sampleLimit) return;
  emitted += 1;
  send(Object.assign({{ seq: ++seq, t: Date.now(), moduleBase: mainModule.base.toString() }}, payload));
}}

function hookText(tag, rva) {{
  const target = addr(rva);
  Interceptor.attach(target, {{
    onEnter(args) {{
      const textPtr = args[0];
      const text = readBytes(textPtr, 160);
      emit({{
        tag,
        target: target.toString(),
        textPtr: textPtr.toString(),
        text: text.text,
        textHex: text.hex,
        thisEcx: this.context.ecx.toString(),
        returnVa: this.returnAddress.toString(),
        backtrace: bt(this.context),
      }});
    }},
  }});
}}

Interceptor.attach(addr({RVA_DIALOG_OPEN}), {{
  onEnter(args) {{
    const title = readBytes(args[1], 160);
    const body = readBytes(args[2], 160);
    emit({{
      tag: "dialog-open-0054ed00",
      target: addr({RVA_DIALOG_OPEN}).toString(),
      dialogType: args[0].toInt32(),
      titlePtr: args[1].toString(),
      title: title.text,
      titleHex: title.hex,
      bodyPtr: args[2].toString(),
      body: body.text,
      bodyHex: body.hex,
      thisEcx: this.context.ecx.toString(),
      returnVa: this.returnAddress.toString(),
      backtrace: bt(this.context),
    }});
  }},
}});

Interceptor.attach(addr({RVA_DIALOG_TYPE}), {{
  onEnter(args) {{
    emit({{
      tag: "dialog-type-00570340",
      target: addr({RVA_DIALOG_TYPE}).toString(),
      dialogType: args[0].toInt32(),
      thisEcx: this.context.ecx.toString(),
      returnVa: this.returnAddress.toString(),
      backtrace: bt(this.context),
    }});
  }},
}});

hookText("dialog-text4-00570650", {RVA_DIALOG_TEXT4});
hookText("dialog-text5-005706e0", {RVA_DIALOG_TEXT5});

send({{
  tag: "dialog-probe-ready",
  seq: ++seq,
  t: Date.now(),
  moduleBase: mainModule.base.toString(),
  dialogOpen: addr({RVA_DIALOG_OPEN}).toString(),
  text4: addr({RVA_DIALOG_TEXT4}).toString(),
  text5: addr({RVA_DIALOG_TEXT5}).toString(),
  sampleLimit,
  backtraceDepth,
}});
"""


def main() -> int:
    parser = argparse.ArgumentParser(description="Attach to G7MTClient and log generic dialog text setters.")
    parser.add_argument("--pid", type=int, required=True)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--duration", type=float, default=10.0)
    parser.add_argument("--sample-limit", type=int, default=200)
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
