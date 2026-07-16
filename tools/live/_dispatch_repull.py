#!/usr/bin/env python3
"""정지된 클라(pid 인자)에 재-attach 해 recv 큐/디스패치 요약을 raw 로 덤프.
usage: python _dispatch_repull.py <pid> <out.json>"""
import sys, json, time
from pathlib import Path
import frida

pid = int(sys.argv[1]); out = Path(sys.argv[2])
js = (Path(__file__).resolve().parent / "_frida_dispatch_probe.js").read_text(encoding="utf-8")
got = {}
def on_msg(m,_d):
    if m["type"]=="send": got.setdefault("ready",[]).append(m["payload"])
    elif m["type"]=="error": got.setdefault("err",[]).append(m.get("description"))
s = frida.attach(pid)
sc = s.create_script(js); sc.on("message", on_msg); sc.load(); time.sleep(0.4)
recv = sc.exports_sync.recv(48)
summ = sc.exports_sync.summary()
out.write_text(json.dumps({"recv":recv,"summary":summ,"ready":got.get("ready")}, ensure_ascii=False, indent=2), encoding="utf-8")
print("clientBase", recv.get("clientBase"), "selfId", recv.get("selfId"))
nz = [e for e in recv["entries"] if e["code32"]!="0x0" or e["size"] not in (0,-1)]
print("non-zero recv entries:", len(nz))
for e in recv["entries"]:
    print(f"  [{e['i']:2d}] code={e['code']:>7} code32={e['code32']:>10} size={e['size']}")
s.detach()
