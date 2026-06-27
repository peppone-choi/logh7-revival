# /// script
# requires-python = ">=3.11"
# dependencies = ["frida"]
# ///
# --- How to run ---
# (ui_explorer 월드 진입 후) python tools/logh7_promote_timing_watch.py --pid <clientPid> --seconds 25
#
# 명령 테이블 원샷 promote(FUN_004c4a10) 진입 시점의 staging 상태를 읽어, 명령 데이터(0x305/0x307)가
# promote **전에 staging됐는지** 실측한다(타이밍 레이스 판정). staging: [DAT_007ccffc]+0x3e0c8c(0x305 카드
# body 직카피)·+0x3e5e96(0x307 count). 0x305 카드: body[0]=count@0, card0 command_count@body0x16.
from __future__ import annotations

import argparse
import json
import time
from pathlib import Path
from typing import Final

ROOT: Final = Path(__file__).resolve().parents[1]
DEFAULT_OUT: Final = ROOT / ".omo/ulw-loop/evidence/g006-c002-promote-timing.jsonl"
DESCRIPTION: Final = "Read staging at command-table promote (FUN_004c4a10) entry to judge the one-shot timing race."


def build_js() -> str:
    return """
const IMAGE_BASE = ptr('0x400000');
const moduleBase = Process.getModuleByName('G7MTClient.exe').base;
let seq = 0;
function abs(v) { return moduleBase.add(ptr(v).sub(IMAGE_BASE)); }
function safe(fn, fb) { try { return fn(); } catch (_e) { return fb; } }
function hex(v) { if (v == null) return null; return safe(() => { const p = ptr(v); return p.isNull() ? null : p.toString(); }, String(v)); }
function readPtr(a) { return safe(() => ptr(a).readPointer(), ptr('0x0')); }
function readU8(a) { return safe(() => ptr(a).readU8(), null); }
function readU16(a) { return safe(() => ptr(a).readU16(), null); }
function bytesHex(a, n) { return safe(() => { const b = ptr(a).readByteArray(n); if (b === null) return null; return Array.prototype.map.call(new Uint8Array(b), (x) => x.toString(16).padStart(2,'0')).join(''); }, null); }
function emit(tag, p) { seq += 1; send({ tag, seq, t: Date.now(), ...(p || {}) }); }

const DAT_007ccffc = abs('0x007ccffc');

function stagingState(label) {
  const mgr = readPtr(DAT_007ccffc);
  if (mgr.isNull()) return { label, mgr: '0x0' };
  const s305 = mgr.add(0x3e0c8c);
  return {
    label,
    mgr: hex(mgr),
    guard_3416d8: readU8(mgr.add(0x3416d8)),
    staging305_count0: readU16(s305),
    staging305_cmdcount16: readU8(s305.add(0x16)),  // card0 command_count (body+0x16)
    staging305_id18: readU16(s305.add(0x18)),
    staging305_dump: bytesHex(s305, 0x30),
    staging307_count: readU16(mgr.add(0x3e5e96)),
    runtime_cat0count_1e: readU8(mgr.add(0x3416d8 + 0x1e)),  // FUN_004f5cb0 cat0 rowCount
  };
}

// FUN_004ba2b0 dispatcher: 0x305/0x307 수신 순간 로깅(staging 직후 상태).
try {
  Interceptor.attach(abs('0x004ba2b0'), {
    onEnter(args) {
      const code = this.context.edx ? (this.context.edx.toInt32() & 0xffff) : null;  // param_2=code (fastcall edx? best-effort)
    },
  });
} catch (e) {}

// promote 진입/이탈 시 staging + runtime 상태.
try {
  Interceptor.attach(abs('0x004c4a10'), {
    onEnter() { emit('promote-enter-004c4a10', { state: stagingState('promote-enter') }); },
    onLeave() { emit('promote-leave-004c4a10', { state: stagingState('promote-leave') }); },
  });
  emit('hook-installed', { fn: 'promote-004c4a10' });
} catch (e) { emit('hook-failed', { err: String(e) }); }

// 폴링: staging305 cmdcount / runtime cat0 변화 추적.
let lastKey = null;
setInterval(function () {
  const s = stagingState('poll');
  const key = JSON.stringify([s.guard_3416d8, s.staging305_cmdcount16, s.runtime_cat0count_1e, s.staging307_count]);
  if (key !== lastKey) { emit('state-change', { state: s }); lastKey = key; }
}, 200);
"""


def run(args: argparse.Namespace) -> int:
    import frida

    pid = args.pid
    args.out.parent.mkdir(parents=True, exist_ok=True)
    events = 0
    session = None
    script = None
    with args.out.open("a", encoding="utf-8") as out:

        def on_message(message, data) -> None:
            nonlocal events
            events += 1
            out.write(json.dumps({"fridaMessage": message, "dataLength": 0 if data is None else len(data)}) + "\n")
            out.flush()

        try:
            session = frida.attach(pid)
            script = session.create_script(build_js())
            script.on("message", on_message)
            script.load()
            time.sleep(args.seconds)
        finally:
            if script is not None:
                script.unload()
            if session is not None:
                session.detach()
    print(json.dumps({"attachedPid": pid, "out": str(args.out), "events": events}, ensure_ascii=False, indent=2))
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=DESCRIPTION)
    parser.add_argument("--pid", type=int, required=True)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    parser.add_argument("--seconds", type=float, default=25.0)
    return run(parser.parse_args())


if __name__ == "__main__":
    raise SystemExit(main())
