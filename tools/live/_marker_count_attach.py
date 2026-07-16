#!/usr/bin/env python3
"""라이브 클라에 붙어 전략맵 마커 카운트를 읽는다(읽기만).
usage: py -3 _marker_count_attach.py <pid>
"""
import sys, json, time
from pathlib import Path
import frida

pid = int(sys.argv[1])
js = (Path(__file__).resolve().parent / "_frida_marker_count.js").read_text(encoding="utf-8")

ready = {}
def on_message(m, _d):
    if m["type"] == "send" and isinstance(m["payload"], dict) and m["payload"].get("ev") == "ready":
        ready.update(m["payload"])
    elif m["type"] == "error":
        print("FRIDA-ERROR", m.get("description"))

session = frida.attach(pid)
script = session.create_script(js)
script.on("message", on_message)
script.load()
time.sleep(0.4)
print("READY", json.dumps(ready))
res = script.exports_sync.analyze()
print("ANALYZE", json.dumps(res, ensure_ascii=False))
session.detach()
