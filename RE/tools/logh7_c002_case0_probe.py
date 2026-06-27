"""C002 own-fleet 렌더 case0 진단 probe (read-only, 최소 hook).

FUN_0058d140(case0 own-fleet 스프라이트 렌더)이 라이브서 호출되는지 + 6 AND 게이트 핵심값
(own_cell, active char ptr)을 read-only로 캡처한다. 쓰기 없음 = 화면 무손상.

조건(docs/logh7-ownfleet-render-fix-2026-06-26.md): case0이 호출돼도 G1~G6 중 하나 false면 미렌더.
이 probe는 ① case0 호출 횟수(0이면 state-machine이 case0 미진입=상류 문제)
② own_cell(DAT_007cd04c+0x11178=row*100+col) ③ active char ptr(DAT_007ccffc+8) 를 본다.
"""
import json
import sys
import time

import frida

JS = r"""
var IMAGE = ptr('0x400000');
var mod = Process.findModuleByName('G7MTClient.exe');
function va(a){ return mod.base.add(ptr(a).sub(IMAGE)); }
var cap = { case0N: 0, fef90N: 0, fef90ecx: null };
try { Interceptor.attach(va('0x58d140'), { onEnter: function(){ cap.case0N++; } }); } catch(e){ cap.case0err = ''+e; }
try { Interceptor.attach(va('0x4fef90'), { onEnter: function(){ cap.fef90N++; if(!cap.fef90ecx) cap.fef90ecx = this.context.ecx.toString(); } }); } catch(e){ cap.fef90err = ''+e; }
rpc.exports = {
  snap: function(){
    var out = { case0N: cap.case0N, fef90N: cap.fef90N, fef90ecx: cap.fef90ecx, case0err: cap.case0err||null };
    try { var d = va('0x7cd04c').readU32(); out.d7cd04c = '0x'+d.toString(16);
          out.owncell = d ? ptr(d).add(0x11178).readU32() : null;
          out.owncell_colrow = (out.owncell!=null) ? [out.owncell % 100, Math.floor(out.owncell/100)] : null;
    } catch(e){ out.owncell = 'ERR:'+e; }
    try { var w = va('0x7ccffc').readU32(); out.d7ccffc = '0x'+w.toString(16);
          out.charptr = w ? ('0x'+ptr(w).add(8).readU32().toString(16)) : null;
    } catch(e){ out.charptr = 'ERR:'+e; }
    return JSON.stringify(out);
  }
};
"""


def main():
    dur = int(sys.argv[1]) if len(sys.argv) > 1 else 8
    try:
        session = frida.attach("G7MTClient.exe")
    except Exception as e:  # noqa: BLE001
        print(json.dumps({"error": f"attach failed: {e}"}))
        return 1
    script = session.create_script(JS)
    script.load()
    time.sleep(dur)
    try:
        snap = json.loads(script.exports_sync.snap())
    except Exception as e:  # noqa: BLE001
        snap = {"error": f"snap failed: {e}"}
    print(json.dumps(snap, ensure_ascii=False))
    try:
        session.detach()
    except Exception:  # noqa: BLE001
        pass
    return 0


if __name__ == "__main__":
    sys.exit(main())
