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
import sys
import time

import frida  # type: ignore[import-not-found]

SEND_GRID_CHAT_VA = 0x004B5600

JS = r"""
const mod = Process.getModuleByName('G7MTClient.exe');
const sendGridChat = new NativeFunction(ptr(%(va)d), 'void', ['pointer','uint8'], 'cdecl');

const msg = Memory.allocUtf16String('%(msg)s');
// Ensure the string length in bytes fits the 0x41 limit checked by the client.
const byteLen = (%(msg)s.length + 1) * 2;
if (byteLen > 0x41) {
  send({error: 'message too long: ' + byteLen});
} else {
  send({info: 'calling FUN_004b5600 with msg=' + '%(msg)s'});
  sendGridChat(msg, 0);
  send({ok: true});
}
"""


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cell", default="8700")
    parser.add_argument("--msg")
    args = parser.parse_args(argv)
    msg = args.msg if args.msg else f"/grid {args.cell}"

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
    script_source = JS % {'va': SEND_GRID_CHAT_VA, 'msg': msg}
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
