#!/usr/bin/env python3
"""문자열 매니저(0x2217400) group/index 테이블 read-only 덤프 — 진영명 소비처 확정용.

FUN_00522010(this=0x2217400, group, index) = group→[start,end) 범위로 flat 문자열포인터배열 인덱싱.
this+0x2974=count, +0x297c=groupTable(int[group]→start), +0x2980=strPtrArray(char*[]).
함수 호출 없이 동일 로직을 순수 메모리 read로 재현(무위험). cp932 디코드는 파이썬에서.

목적: group 0x5f(기지패널 분류 switch +0x175) idx 0~3, group 0x4e(+0x04==2/3 token 0x2d/0x2e)가
실제 진영명(中立/帝国/同盟)인지 확정 → 서버 faction 투영 안전화(소비처 RE).

사용: python -m tools.logh7_strgroup_dump --groups 0x5f,0x4e
"""
from __future__ import annotations
import argparse, json, subprocess, time, frida

JS = r"""
var mod = Process.enumerateModules()[0];
var IMAGE = ptr('0x400000');
function va(a){ return mod.base.add(ptr(a).sub(IMAGE)); }
rpc.exports = {
  ready: function(){
    try { var M=va('0x2217400'); return JSON.stringify({
      count: M.add(0x2974).readU32(), gt: M.add(0x297c).readU32(), sa: M.add(0x2980).readU32() }); }
    catch(e){ return JSON.stringify({err:String(e)}); }
  },
  dump: function(group){
    try {
      var M=va('0x2217400');
      var count=M.add(0x2974).readU32();
      var gt=M.add(0x297c).readU32(), sa=M.add(0x2980).readU32();
      if(!gt || !sa) return JSON.stringify({err:'table null', count:count, gt:gt, sa:sa});
      if(group >= count) return JSON.stringify({err:'group>=count', group:group, count:count});
      var start=ptr(gt).add(group*4).readU32();
      var end=ptr(gt).add(group*4+4).readU32();
      var n=end-start; var out=[];
      for(var i=0;i<n && i<80;i++){
        var sp=ptr(sa).add((start+i)*4).readU32();
        var hex='';
        if(sp){ var p=ptr(sp); for(var b=0;b<60;b++){ var c=p.add(b).readU8(); if(c===0)break; hex+=('0'+c.toString(16)).slice(-2); } }
        out.push({i:i, hex:hex});
      }
      return JSON.stringify({group:group, count:count, start:start, end:end, n:n, entries:out});
    } catch(e){ return JSON.stringify({err:String(e)}); }
  }
};
"""

def find_pid():
    out=subprocess.run(["tasklist","/FI","IMAGENAME eq G7MTClient.exe","/FO","CSV","/NH"],capture_output=True,text=True,timeout=10).stdout
    for line in out.splitlines():
        if "G7MTClient" in line: return int(line.split(",")[1].strip().strip('"'))
    return None

def dec(hexstr, enc="cp949"):
    if not hexstr: return ""
    try: return bytes.fromhex(hexstr).decode(enc, errors="replace")
    except Exception: return f"<{hexstr}>"

def main():
    ap=argparse.ArgumentParser(); ap.add_argument("--groups", default="0x5f,0x4e")
    ap.add_argument("--wait", type=float, default=0.0, help="seconds to wait for table load before dumping")
    ap.add_argument("--enc", default="cp949", help="string encoding (cp949 localized / cp932 original)")
    ap.add_argument("--scan", default=None, help="comma-separated substrings to find across ALL groups (e.g. 제국,동맹,중립,帝国,同盟,中立)")
    a=ap.parse_args()
    pid=find_pid()
    if not pid: print(json.dumps({"error":"no pid"})); return 1
    s=frida.attach(pid); sc=s.create_script(JS); sc.load(); rpc=sc.exports_sync
    # wait for the string table to be populated
    deadline=time.time()+max(a.wait, 0)
    rd=json.loads(rpc.ready())
    while (rd.get("gt",0)==0 or rd.get("sa",0)==0) and time.time()<deadline:
        time.sleep(1.0); rd=json.loads(rpc.ready())
    print("table:", json.dumps(rd, ensure_ascii=False))
    count=rd.get("count",0)
    if a.scan:
        needles=[s for s in a.scan.split(",") if s]
        print(f"\n=== SCAN all {count} groups for {needles} (enc={a.enc}) ===")
        for g in range(count):
            r=json.loads(rpc.dump(g))
            for e in r.get("entries",[]):
                t=dec(e["hex"], a.enc)
                if any(n in t for n in needles):
                    print(f"  group {hex(g)} idx {e['i']}(={hex(e['i'])})  {t!r}")
        return 0
    for g in [int(x,0) for x in a.groups.split(",")]:
        r=json.loads(rpc.dump(g))
        if "entries" in r:
            print(f"\n=== group {hex(g)}  start={r['start']} n={r['n']} (count={r['count']}) enc={a.enc} ===")
            for e in r["entries"]:
                print(f"  [{e['i']:>3} / {hex(e['i'])}]  {dec(e['hex'], a.enc)!r}")
        else:
            print(f"\n=== group {hex(g)}: {json.dumps(r, ensure_ascii=False)}")
    try: s.detach()
    except Exception: pass
    return 0

if __name__=="__main__": raise SystemExit(main())
