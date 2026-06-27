#!/usr/bin/env python3
"""C002 mode-field read-only probe — 클린 mode 토글 가부 판정.

월드 진입한 실클라에서 DAT_007ccffc(게임클라) + mode 오프셋들을 읽는다(쓰기 없음):
  +0x126710 dword (byte1=mode byte +0x126711), +0x126718(mode0 grid active),
  +0x2a58f8(mode2 grid active). mode2(전략)에서 [0x126718]이 이미 채워졌으면
  mode byte만 1프레임 토글로 FUN_0050d230 consume이 깨끗하게 돌 수 있다(zero-fill 불요).

사용: python -m tools.logh7_c002_mode_probe [--seconds 3]
"""
from __future__ import annotations
import argparse
import json
import subprocess
import time
import frida

JS = r"""
var mod = Process.enumerateModules()[0];
var IMAGE = ptr('0x400000');
function va(a){ return mod.base.add(ptr(a).sub(IMAGE)); }
rpc.exports = {
  snap: function(){
    var out = { base: null };
    try {
      var h = va('0x7ccffc').readU32();
      if (!h) return { base: 0, note: 'DAT_007ccffc null (not in world)' };
      out.base = ptr(h).toString();
      var b = ptr(h);
      out.dword_126710 = b.add(0x126710).readU32();
      out.mode_byte_126711 = b.add(0x126711).readU8();
      out.mode0_active_126718 = b.add(0x126718).readU32();
      out.mode2_active_2a58f8 = b.add(0x2a58f8).readU32();
      // mode0 grid 영역 일부(채워졌는지 비-zero 스캔, 0x126718부터 64 dword)
      var nz0 = 0;
      for (var i=0;i<64;i++){ if (b.add(0x126718 + i*4).readU32() !== 0) nz0++; }
      out.mode0_region_nonzero_of64 = nz0;
      var nz2 = 0;
      for (var j=0;j<64;j++){ if (b.add(0x2a58f8 + j*4).readU32() !== 0) nz2++; }
      out.mode2_region_nonzero_of64 = nz2;
    } catch(e){ out.err = String(e); }
    return out;
  },
  // R1: C002 종결 read-only 스냅샷. 셀렉터/selectedChar = DAT_007ccffc base,
  // own_cell = DAT_007cd04c base(redex 확인: 0x11178 참조 전부 007cd04c, 셀렉터와 별개 객체).
  // 둘 다 read-only — 게임 상태 무변경.
  r1snap: function(){
    var out = {};
    try {
      var hc = va('0x7ccffc').readU32();      // strategy/world 객체 (selector + selectedChar)
      var hd = va('0x7cd04c').readU32();       // own_cell 객체
      out.DAT_007ccffc = hc ? ptr(hc).toString() : 0;
      out.DAT_007cd04c = hd ? ptr(hd).toString() : 0;
      if (hc) {
        var c = ptr(hc);
        out.selector_35f35a   = c.add(0x35f35a).readU8();   // !=0 → mode0, 0 → mode2 (FUN_004b68f0)
        out.grid_dword_35f358 = c.add(0x35f358).readU32();  // byte[2]=selector (FUN_004ba2b0 간접 라이터)
        out.selectedChar_3584a0 = c.add(0x3584a0).readU32(); // 0x0204 own-fleet 3-way 매칭키 (FUN_004c2a80)
        out.mode_byte_126711  = c.add(0x126711).readU8();    // 0/2 = case0(consume)/case2(enqueue)
        out.poller_126718     = c.add(0x126718).readU32();   // mode0 grid active
        // 디스패처 latch 바이트들 (FUN_004b68f0: 0x358374~0x358380, advance 단계 확인)
        var latch = [];
        for (var k=0x358374; k<=0x358380; k++){ latch.push(c.add(k).readU8()); }
        out.dispatch_latch_358374_80 = latch;
      } else { out.note = 'DAT_007ccffc null — 월드 미진입'; }
      if (hd) {
        out.own_cell_11178 = ptr(hd).add(0x11178).readU32();  // writer 0건(server force만) — 자연값 캡처
      }
    } catch(e){ out.err = String(e); }
    return out;
  }
};
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
    ap.add_argument("--seconds", type=float, default=3.0)
    ap.add_argument("--r1", action="store_true",
                    help="C002 R1 스냅샷(셀렉터/selectedChar/own_cell, dual-base) 출력")
    args = ap.parse_args()
    pid = find_pid()
    if not pid:
        print(json.dumps({"error": "no pid"})); return 1
    sess = frida.attach(pid)
    sc = sess.create_script(JS)
    sc.load()
    time.sleep(args.seconds)
    if args.r1:
        print(json.dumps(sc.exports_sync.r1snap(), ensure_ascii=False, indent=1))
        try:
            sess.detach()
        except Exception:
            pass
        return 0
    snap = sc.exports_sync.snap()
    # 판정
    if snap.get("base") and snap.get("base") != 0:
        mb = snap.get("mode_byte_126711")
        m0 = snap.get("mode0_active_126718")
        nz0 = snap.get("mode0_region_nonzero_of64", 0)
        snap["verdict"] = (
            f"mode={mb} (2=전략). mode0_active={m0}, mode0_region_nonzero={nz0}/64. "
            + ("→ mode0 grid 이미 채워짐: 클린 mode-byte 토글 viable(zero-fill 불요)"
               if (m0 or nz0 > 0) else
               "→ mode0 grid 비어있음: 단순 토글 시 FUN_0050d230 게이트 [0x126718] false 위험")
        )
    print(json.dumps(snap, ensure_ascii=False, indent=1))
    try:
        sess.detach()
    except Exception:
        pass
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
