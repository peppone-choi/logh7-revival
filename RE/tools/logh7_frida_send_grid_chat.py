"""Synthesize CommandGridChat 0x0f1c send in a running LOGH VII client via Frida.

Static RE: FUN_004b5600 builds a 140-byte chat buffer from a wide-char message,
then calls FUN_004b78a0 to send opcode 0x0f1c. Calling FUN_004b5600 directly
bypasses the unknown chat-UI open path.

Usage:
  python -m tools.logh7_frida_send_grid_chat --cell 8700
  python -m tools.logh7_frida_send_grid_chat --msg "/grid 8700"
"""
from __future__ import annotations

import argparse
import json
import sys
import time

SEND_GRID_CHAT_VA = 0x004B5600
MAX_CHAT_CHARS = 0x41

JS_TEMPLATE = r"""
const mod = Process.getModuleByName('G7MTClient.exe');
const sendGridChat = new NativeFunction(ptr(%(va)d), 'void', ['pointer','uint8'], 'cdecl');

const message = %(msg_json)s;
const msg = Memory.allocUtf16String(message);
// FUN_004b5600 checks the UTF-16 code-unit count against 0x41, not byte length.
const unitLen = message.length;
if (unitLen > %(max_chars)d) {
  send({error: 'message too long: ' + unitLen});
} else {
  send({info: 'calling FUN_004b5600 with msg=' + message, codeUnits: unitLen});
  sendGridChat(msg, 0);
  send({ok: true});
}
"""


def utf16_code_units(text: str) -> int:
    return len(text.encode("utf-16-le")) // 2


def build_script_source(msg: str, *, va: int = SEND_GRID_CHAT_VA) -> str:
    units = utf16_code_units(msg)
    if units > MAX_CHAT_CHARS:
        raise ValueError(f"message is {units} UTF-16 units; client caps at {MAX_CHAT_CHARS}")
    return JS_TEMPLATE % {
        "va": va,
        "msg_json": json.dumps(msg, ensure_ascii=False),
        "max_chars": MAX_CHAT_CHARS,
    }


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cell", default="8700")
    parser.add_argument("--msg")
    args = parser.parse_args(argv)
    msg = args.msg if args.msg else f"/grid {args.cell}"
    try:
        script_source = build_script_source(msg)
    except ValueError as exc:
        print(str(exc), file=sys.stderr)
        return 2

    import frida  # type: ignore[import-not-found]  # noqa: PLC0415
    device = frida.get_local_device()
    # Find the game process.
    proc = None
    for p in device.enumerate_processes():
        if p.name.lower() == 'g7mtclient.exe':
            proc = p
            break
    if proc is None:
        print("G7MTClient.exe process not found", file=sys.stderr)
        return 1

    session = device.attach(proc.pid)
    script = session.create_script(script_source)

    def on_message(message, data):
        print(message.get('payload', message))

    script.on('message', on_message)
    script.load()
    time.sleep(0.5)
    session.detach()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
