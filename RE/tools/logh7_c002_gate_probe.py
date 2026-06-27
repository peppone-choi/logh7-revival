#!/usr/bin/env python3
"""C002 돌파 — own-fleet selectable 렌더 case0 6-AND 게이트(FUN_0058d140 G1~G6) 라이브 read-only 진단.

docs/logh7-ownfleet-render-fix-2026-06-26.md §1 게이트:
  G2 charptr=*(base+8)!=0,!=-0x24 / G3 DAT_007cd04c!=-0x11174 / G5 own_cell col<100&row<50
  / G6 PLAYER_INFO slot0(base+0xc, stride 0x370) 매칭(slot[0]!=0 && slot+0x24==id → slot+0xa4).
어느 게이트가 false라 own-fleet이 미렌더(=클릭불가=C002 막힘)인지 확정한다. 메모리 읽기만(force/call 없음).

사용: python -m tools.logh7_c002_gate_probe
"""
from __future__ import annotations
import json
import subprocess
import frida

JS = r"""
var mod = Process.enumerateModules()[0];
var IMAGE = ptr('0x400000');
function va(a){ return mod.base.add(ptr(a).sub(IMAGE)); }
rpc.exports = { gates: function(){
  var out = {};
  var h = va('0x7ccffc').readU32();
  if(!h){ out.base = 0; out.note='DAT_007ccffc null (not in world)'; return out; }
  var b = ptr(h); out.base = b.toString();
  // G2: active char-record ptr = *(base+8)
  var cp = b.add(8).readU32();
  out.G2_charptr = '0x'+cp.toString(16);
  out.G2_valid = (cp!==0 && cp!==0xffffffdc);
  if(cp){ try{ out.G2_deref = '0x'+ptr(cp).readU32().toString(16); }catch(e){ out.G2_deref='ERR'; } }
  // G3: DAT_007cd04c
  var d = va('0x7cd04c').readU32();
  out.G3_dat7cd04c = '0x'+d.toString(16);
  out.G3_valid = (d!==0 && d!==0xfffeee8c);
  out.G3_eq_base_plus0x50 = (d === ((h+0x50)>>>0));
  // G5: own_cell
  if(d){
    var oc = ptr(d).add(0x11178).readU32();
    out.G5_owncell = oc;
    out.G5_col = oc%100; out.G5_row = Math.floor(oc/100);
    out.G5_colrow_ok = (oc%100<100 && Math.floor(oc/100)<50);
  }
  // G6 전제: PLAYER_INFO slot0 = base+0xc, stride 0x370
  var s0 = b.add(0xc);
  out.slot0_first = '0x'+s0.readU32().toString(16);
  out.slot0_id    = '0x'+s0.add(0x24).readU32().toString(16);
  out.slot0_a4    = '0x'+s0.add(0xa4).readU32().toString(16);
  out.slot0_populated = (s0.readU32()!==0);
  // PLAYER_INFO 슬롯 스캔(첫 24개) — 채워진 슬롯 + id
  var pop=[];
  for(var i=0;i<24;i++){
    var s=b.add(0xc + i*0x370);
    var f=s.readU32();
    if(f!==0) pop.push([i, '0x'+s.add(0x24).readU32().toString(16), '0x'+s.add(0xa4).readU32().toString(16)]);
  }
  out.populated_slots = pop;
  out.populated_count = pop.length;
  return out;
}};
"""


def find_pid():
    out = subprocess.run(["tasklist", "/FI", "IMAGENAME eq G7MTClient.exe", "/FO", "CSV", "/NH"],
                         capture_output=True, text=True, timeout=10).stdout
    for line in out.splitlines():
        if "G7MTClient" in line:
            return int(line.split(",")[1].strip().strip('"'))
    return None


def main():
    pid = find_pid()
    if not pid:
        print(json.dumps({"error": "no pid (G7MTClient not running)"})); return 1
    sess = frida.attach(pid)
    sc = sess.create_script(JS)
    sc.load()
    g = sc.exports_sync.gates()
    # 판정
    if g.get("base") and g.get("base") != 0:
        fails = []
        if not g.get("G2_valid"): fails.append("G2(char ptr)")
        if not g.get("G3_valid"): fails.append("G3(own_cell page)")
        if not g.get("G5_colrow_ok"): fails.append("G5(own_cell col/row)")
        if not g.get("slot0_populated"): fails.append("G6(PLAYER_INFO slot0 비어있음)")
        g["likely_failing_gates"] = fails or ["메모리 게이트 전부 통과 — G1/G4/G6 함수결과 별도 확인(FUN_0050cf40(0x6b)/FUN_004b5b50/FUN_004c7290)"]
    print(json.dumps(g, ensure_ascii=False, indent=1))
    try:
        sess.detach()
    except Exception:
        pass
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
