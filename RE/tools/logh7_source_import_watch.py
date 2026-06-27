# /// script
# requires-python = ">=3.11"
# dependencies = ["frida"]
# ///
# --- How to run ---
# python tools/logh7_source_import_watch.py --session .omo/ui-explorer/session --seconds 12
from __future__ import annotations

import argparse
import json
import time
from pathlib import Path
from typing import Final

ROOT: Final = Path(__file__).resolve().parents[1]
DEFAULT_SESSION: Final = ROOT / ".omo/ui-explorer/session"
DEFAULT_OUT: Final = ROOT / ".omo/ulw-loop/evidence/g006-c002-source-import-watch.jsonl"


def build_js(*, sample_bytes: int = 64) -> str:
    return f"""
const IMAGE_BASE = ptr('0x400000');
const moduleBase = Process.getModuleByName('G7MTClient.exe').base;
const SAMPLE_BYTES = {int(sample_bytes)};
let seq = 0;

function abs(vaText) {{ return moduleBase.add(ptr(vaText).sub(IMAGE_BASE)); }}
function safe(fn, fallback) {{ try {{ return fn(); }} catch (_error) {{ return fallback; }} }}
function hex(value) {{
  if (value === null || value === undefined) return null;
  return safe(() => {{ const p = ptr(value); return p.isNull() ? null : p.toString(); }}, String(value));
}}
function readPtr(address) {{ return safe(() => ptr(address).readPointer(), ptr('0x0')); }}
function readU8(address) {{ return safe(() => ptr(address).readU8(), null); }}
function readU16(address) {{ return safe(() => ptr(address).readU16(), null); }}
function readU32(address) {{ return safe(() => ptr(address).readU32(), null); }}
function bytesHex(address, count) {{
  return safe(() => {{
    const bytes = ptr(address).readByteArray(count);
    if (bytes === null) return null;
    return Array.prototype.map.call(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('');
  }}, null);
}}
function stackPtr(context, index) {{
  return safe(() => ptr(context.esp).add(index * 4).readPointer(), ptr('0x0'));
}}
function backtrace(context) {{
  return safe(() => Thread.backtrace(context, Backtracer.FUZZY).slice(0, 10).map((frame) => hex(frame)), []);
}}
function emit(tag, payload) {{ seq += 1; send({{ tag, seq, t: Date.now(), ...(payload || {{}}) }}); }}

function pointerValue(value) {{ return safe(() => ptr(value).toUInt32(), 0); }}
function predictedSource(mainState, modeArg) {{
  const mode = pointerValue(modeArg);
  if (mainState.isNull()) return ptr('0x0');
  if (mode === 1) return mainState.add(0x80e8c);
  if (mode === 0) return mainState.add(0x0c);
  return ptr('0x0');
}}
function sourceFields(source) {{
  if (source.isNull()) return null;
  return {{
    source: hex(source),
    sourceHeadHex: bytesHex(source, Math.min(SAMPLE_BYTES, 64)),
    source31e: readU8(source.add(0x31e)),
    source358: readU32(source.add(0x358)),
    predictedSource320: readU32(source.add(0x320)),
    source318Hex: bytesHex(source.add(0x318), Math.min(SAMPLE_BYTES, 0x58)),
  }};
}}
function recordFields(record) {{
  if (record.isNull()) return null;
  return {{
    record: hex(record),
    recordHeadHex: bytesHex(record, Math.min(SAMPLE_BYTES, 64)),
    recordId0: readU32(record),
    primaryUnit24: readU32(record.add(0x24)),
    recordByte06: readU8(record.add(6)),
    optionalRecordPlus08: readU32(record.add(8)),
    recordPlus40: readU32(record.add(0x40)),
  }};
}}
function unitContext(mainState, primaryRecord, optionalRecord) {{
  if (mainState.isNull()) return null;
  const unitBase = mainState.add(0x41a368);
  const unitDelta = optionalRecord.isNull() ? null : safe(() => optionalRecord.sub(unitBase).toInt32(), null);
  return {{
    unitCount41a364: readU16(mainState.add(0x41a364)),
    primaryUnit24: primaryRecord.isNull() ? null : readU32(primaryRecord.add(0x24)),
    unitBase: hex(unitBase),
    optionalUnitIndex: unitDelta === null ? null : unitDelta / 0x58,
    unit0: recordFields(unitBase),
    unit1: recordFields(unitBase.add(0x58)),
  }};
}}
function characterRecordFields(record) {{
  if (record.isNull()) return null;
  return {{
    record: hex(record),
    headHex: bytesHex(record, Math.min(SAMPLE_BYTES, 64)),
    id0: readU32(record),
    power04: readU8(record.add(4)),
    spot1c: readU32(record.add(0x1c)),
    spotOwner20: readU32(record.add(0x20)),
    unit24: readU32(record.add(0x24)),
  }};
}}
function unitTableFields(record) {{
  if (record.isNull()) return null;
  const unitBase = record.add(4);
  return {{
    record: hex(record),
    headHex: bytesHex(record, Math.min(SAMPLE_BYTES, 96)),
    count: readU16(record),
    unit0: recordFields(unitBase),
    unit1: recordFields(unitBase.add(0x58)),
  }};
}}
function importFields(context) {{
  const mainState = safe(() => context.ecx, ptr('0x0'));
  const modeArg = stackPtr(context, 1);
  const primaryRecord = stackPtr(context, 2);
  const optionalRecord = stackPtr(context, 3);
  const source = predictedSource(mainState, modeArg);
  return {{
    ret: hex(stackPtr(context, 0)),
    ecx: hex(context.ecx),
    edx: hex(context.edx),
    modeArg: hex(modeArg),
    primaryRecord: recordFields(primaryRecord),
    optionalRecord: recordFields(optionalRecord),
    predictedSource: hex(source),
    mainSlot8Before: hex(readPtr(mainState.add(8))),
    mainSlot8Address: hex(mainState.add(8)),
    unitContext: unitContext(mainState, primaryRecord, optionalRecord),
    sourceFields: sourceFields(source),
    backtrace: backtrace(context),
  }};
}}
function wrapperFields(context) {{
  const mainState = safe(() => context.ecx, ptr('0x0'));
  const modeArg = stackPtr(context, 1);
  const source = predictedSource(mainState, modeArg);
  return {{
    ret: hex(stackPtr(context, 0)),
    ecx: hex(context.ecx),
    modeArg: hex(modeArg),
    predictedSource: hex(source),
    mainSlot8Before: hex(readPtr(mainState.add(8))),
    mainSlot8Address: hex(mainState.add(8)),
    sourceFields: sourceFields(source),
    backtrace: backtrace(context),
  }};
}}
function callsiteFields(context) {{
  const mainState = safe(() => context.ecx, ptr('0x0'));
  const pendingModeArg = stackPtr(context, 0);
  const source = predictedSource(mainState, pendingModeArg);
  return {{
    ecx: hex(context.ecx),
    pendingModeArg: hex(pendingModeArg),
    predictedSource: hex(source),
    mainSlot8Before: hex(readPtr(mainState.add(8))),
    sourceFields: sourceFields(source),
    backtrace: backtrace(context),
  }};
}}
function optionalCopyFields(context) {{
  const source = safe(() => context.ecx, ptr('0x0'));
  const optionalRecord = safe(() => context.ebx, ptr('0x0'));
  return {{
    ecxSource: hex(source),
    ebxOptionalRecord: hex(optionalRecord),
    sourceFields: sourceFields(source),
    optionalRecord: recordFields(optionalRecord),
    source320MatchesOptional08: readU32(source.add(0x320)) === readU32(optionalRecord.add(8)),
    backtrace: backtrace(context),
  }};
}}
function parserEntryFields(context, reader) {{
  const record = stackPtr(context, 1);
  return {{ ret: hex(stackPtr(context, 0)), record: hex(record), before: reader(record), backtrace: backtrace(context) }};
}}
function installEntryExit(vaText, name, reader) {{
  Interceptor.attach(abs(vaText), {{
    onEnter() {{
      this.fields = reader(this.context);
      emit(name + '-enter', {{ va: vaText, fields: this.fields }});
    }},
    onLeave(retval) {{
      emit(name + '-leave', {{ va: vaText, retval: hex(retval), fields: this.fields }});
    }},
  }});
  emit('hook-installed', {{ name, va: vaText }});
}}
function installParser(vaText, name, reader) {{
  Interceptor.attach(abs(vaText), {{
    onEnter() {{
      this.record = stackPtr(this.context, 1);
      emit(name + '-enter', {{ va: vaText, fields: parserEntryFields(this.context, reader) }});
    }},
    onLeave(retval) {{
      emit(name + '-leave', {{ va: vaText, retval: hex(retval), fields: reader(this.record) }});
    }},
  }});
  emit('hook-installed', {{ name, va: vaText }});
}}
function installInstruction(vaText, name, reader) {{
  Interceptor.attach(abs(vaText), {{
    onEnter() {{ emit(name + '-hit', {{ va: vaText, fields: reader(this.context) }}); }},
  }});
  emit('hook-installed', {{ name, va: vaText }});
}}

installInstruction('0x004b780e', 'sourceImportCallsite-004b780e', callsiteFields);
installParser('0x004301d0', 'characterRecordParser-004301d0', characterRecordFields);
installParser('0x00419ca0', 'unitTableParser-00419ca0', unitTableFields);
installEntryExit('0x004c2a80', 'sourceImportWrapper-004c2a80', wrapperFields);
installEntryExit('0x004c2c80', 'sourceImportCopy-004c2c80', importFields);
installInstruction('0x004c2f18', 'sourceOptionalCopyAfter-004c2f18', optionalCopyFields);
emit('watch-ready', {{ sampleBytes: SAMPLE_BYTES }});
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
    session = script = None
    with args.out.open("a", encoding="utf-8") as out:

        def on_message(message, data) -> None:
            nonlocal events
            events += 1
            out.write(json.dumps({"fridaMessage": message, "dataLength": 0 if data is None else len(data)}) + "\n")
            out.flush()

        try:
            session = frida.attach(pid)
            script = session.create_script(build_js(sample_bytes=args.sample_bytes))
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
    parser = argparse.ArgumentParser(description="Trace LOGH VII source import copies.")
    parser.add_argument("--session", type=Path, default=DEFAULT_SESSION)
    parser.add_argument("--pid", type=int, default=None)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    parser.add_argument("--seconds", type=float, default=15.0)
    parser.add_argument("--sample-bytes", type=int, default=64)
    return run(parser.parse_args())


if __name__ == "__main__":
    raise SystemExit(main())
