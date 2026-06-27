# /// script
# requires-python = ">=3.11"
# dependencies = ["frida"]
# ///
# --- How to run ---
# (ui_explorer로 월드 진입 후) python tools/logh7_command_table_watch.py --pid <clientPid> --seconds 20
#
# 런타임 전략 명령 테이블 [DAT_007ccffc]+0x3416d8 을 읽어 채워졌는지(rowCount>0) 실측한다.
# FUN_004c8700가 이 주소를 테이블 베이스로 반환(가드 byte @+0x3416d8). FUN_004c4a10가 staging→여기로 승격.
# FUN_004f5cb0는 card+0x14(command_count)/+0x16(factory ids)를, FUN_005312b0는 +0x20(명령 type, move=0x19/3f/40)을 읽는다.
from __future__ import annotations

import argparse
import json
import time
from pathlib import Path
from typing import Final

ROOT: Final = Path(__file__).resolve().parents[1]
DEFAULT_OUT: Final = ROOT / ".omo/ulw-loop/evidence/g006-c002-command-table-watch.jsonl"
DESCRIPTION: Final = "Read LOGH VII runtime strategic command table [DAT_007ccffc]+0x3416d8 (rowCount/ids/type)."


def build_js(*, poll_ms: int = 150) -> str:
    return f"""
const IMAGE_BASE = ptr('0x400000');
const moduleBase = Process.getModuleByName('G7MTClient.exe').base;
const POLL_MS = {int(poll_ms)};
let seq = 0;
let lastKey = null;
function abs(v) {{ return moduleBase.add(ptr(v).sub(IMAGE_BASE)); }}
function safe(fn, fb) {{ try {{ return fn(); }} catch (_e) {{ return fb; }} }}
function hex(v) {{ if (v == null) return null; return safe(() => {{ const p = ptr(v); return p.isNull() ? null : p.toString(); }}, String(v)); }}
function readPtr(a) {{ return safe(() => ptr(a).readPointer(), ptr('0x0')); }}
function readU8(a) {{ return safe(() => ptr(a).readU8(), null); }}
function readU16(a) {{ return safe(() => ptr(a).readU16(), null); }}
function readU32(a) {{ return safe(() => ptr(a).readU32(), null); }}
function bytesHex(a, n) {{ return safe(() => {{ const b = ptr(a).readByteArray(n); if (b === null) return null; return Array.prototype.map.call(new Uint8Array(b), (x) => x.toString(16).padStart(2,'0')).join(''); }}, null); }}
function emit(tag, p) {{ seq += 1; send({{ tag, seq, t: Date.now(), ...(p || {{}}) }}); }}

const DAT_007ccffc = abs('0x007ccffc'); // 월드매니저 베이스 포인터

function tableSnapshot(reason) {{
  const mgr = readPtr(DAT_007ccffc);
  if (mgr.isNull()) return {{ reason, present: false, mgr: '0x0' }};
  const tbl = mgr.add(0x3416d8); // FUN_004c8700 테이블 베이스(가드 byte)
  return {{
    reason,
    present: true,
    mgr: hex(mgr),
    guard_3416d8: readU8(tbl),       // FUN_004c4a10가 1로 세팅(promote 완료)
    field_3416dc: readU32(mgr.add(0x3416dc)),
    card0_count_14: readU8(tbl.add(0x14)),   // FUN_004f5cb0 command_count (rowCount)
    card0_id_16: readU16(tbl.add(0x16)),     // factory id0
    card0_id_18: readU16(tbl.add(0x18)),     // factory id1
    card0_type_20: readU16(tbl.add(0x20)),   // FUN_005312b0 명령 type (move=0x19/3f/40)
    card0_type_22: readU16(tbl.add(0x22)),
    dump_3416d8: bytesHex(tbl, 0x60),
  }};
}}

emit('watch-ready', {{ snapshot: tableSnapshot('watch-ready') }});
setInterval(function () {{
  const s = tableSnapshot('poll');
  const key = JSON.stringify([s.present, s.guard_3416d8, s.card0_count_14, s.card0_id_16, s.card0_type_20]);
  if (key !== lastKey) {{ emit('table-change', {{ snapshot: s }}); lastKey = key; }}
}}, POLL_MS);
"""


def _session_pid(session_dir: Path) -> int:
    state = json.loads((session_dir / "session.json").read_text(encoding="utf-8"))
    pid = int(state["clientPid"])
    if pid <= 0:
        raise ValueError(f"invalid clientPid in {session_dir / 'session.json'}")
    return pid


def run(args: argparse.Namespace) -> int:
    import frida

    pid = args.pid if args.pid is not None else _session_pid(args.session)
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
            script = session.create_script(build_js(poll_ms=args.poll_ms))
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
    parser.add_argument("--session", type=Path, default=ROOT / ".omo/ui-explorer/session")
    parser.add_argument("--pid", type=int, default=None)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    parser.add_argument("--seconds", type=float, default=20.0)
    parser.add_argument("--poll-ms", type=int, default=150)
    return run(parser.parse_args())


if __name__ == "__main__":
    raise SystemExit(main())
