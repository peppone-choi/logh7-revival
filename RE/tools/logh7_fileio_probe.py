#!/usr/bin/env python3
"""클라 파일 I/O 실측 — NOW LOADING 등 블로킹 로드가 기다리는 리소스 파일 식별.

CreateFileA/W를 hook해 주어진 윈도우 동안 클라가 여는 모든 파일명+횟수를 캡처.
NOW LOADING(전술 배틀필드 로드) 정체 중 실행하면, 반복 열거나 실패하는 파일 = 막힌 리소스.
읽기 전용(파일 안 건드림).

사용: python -m tools.logh7_fileio_probe [--seconds 6]
"""
from __future__ import annotations
import argparse
import json
import subprocess
import time
import frida

JS = r"""
var files = {};
var hookErrors = [];
rpc.exports = { dump: function(){ return { files: files, hookErrors: hookErrors }; } };
function getExp(dll, name){
  try { var m = Process.getModuleByName(dll); if (m){ var p = (m.findExportByName?m.findExportByName(name):null) || (m.getExportByName?m.getExportByName(name):null); if(p) return p; } } catch(e){}
  try { if (Module.getGlobalExportByName) return Module.getGlobalExportByName(name); } catch(e){}
  return null;
}
function hook(name, dll, reader){
  try {
    var p = getExp(dll, name);
    if (!p) { hookErrors.push(name+':notfound'); return; }
    Interceptor.attach(p, { onEnter: function(args){
      try { var n = reader(args[0]); if (n) files[n] = (files[n]||0)+1; } catch(e){}
    }});
  } catch(e){ hookErrors.push(name+':'+e); }
}
hook('CreateFileA', 'kernel32.dll', function(a){ return a.readAnsiString(); });
hook('CreateFileW', 'kernel32.dll', function(a){ return '(W)'+a.readUtf16String(); });
hook('fopen', 'msvcrt.dll', function(a){ return '(fopen)'+a.readAnsiString(); });
hook('recv', 'ws2_32.dll', function(a){ return '(recv-socket)'; });
hook('WSARecv', 'ws2_32.dll', function(a){ return '(WSARecv)'; });
// 게임 수신 디스패처 FUN_004ba2b0 — NOW LOADING 중 도착 wire 옵코드
try {
  var mod = Process.enumerateModules()[0];
  var IMAGE = ptr('0x400000');
  Interceptor.attach(mod.base.add(ptr('0x4ba2b0').sub(IMAGE)), { onEnter: function(args){
    try { var op = args[0].toInt32() >>> 0; files['(wire-op)0x'+op.toString(16)] = (files['(wire-op)0x'+op.toString(16)]||0)+1; } catch(e){}
  }});
} catch(e){ hookErrors.push('wire-disp:'+e); }
"""


def find_pid():
    out = subprocess.run(["tasklist", "/FI", "IMAGENAME eq G7MTClient.exe", "/FO", "CSV", "/NH"],
                         capture_output=True, text=True, timeout=10).stdout
    for line in out.splitlines():
        if "G7MTClient" in line:
            return int(line.split(",")[1].strip().strip('"'))
    return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--seconds", type=float, default=6.0)
    args = ap.parse_args()
    pid = find_pid()
    if not pid:
        print(json.dumps({"error": "no pid"})); return 1
    sess = frida.attach(pid)
    sc = sess.create_script(JS)
    sc.load()
    time.sleep(args.seconds)
    dumped = sc.exports_sync.dump()
    files = dumped.get("files", {})
    hook_errors = dumped.get("hookErrors", [])
    # 게임 리소스 후보(data/ image/ model/ tactics/ battle/ .bmp/.mdx/.tga 등)만 추려 정렬
    interesting = {k: v for k, v in files.items()
                   if any(s in k.lower() for s in ['data', 'image', 'model', 'tactic', 'battle',
                                                   'field', '.bmp', '.mdx', '.tga', '.dat', '.txt',
                                                   'strategy', 'lens', 'effect', 'spot', 'window'])}
    top = sorted(files.items(), key=lambda kv: -kv[1])[:25]
    print(json.dumps({
        "total_unique": len(files),
        "hook_errors": hook_errors,
        "interesting_resources": dict(sorted(interesting.items(), key=lambda kv: -kv[1])),
        "top_by_count": top,
    }, ensure_ascii=False, indent=1))
    try:
        sess.detach()
    except Exception:
        pass
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
