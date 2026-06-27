# /// script
# requires-python = ">=3.11"
# dependencies = ["frida"]
# ///
# --- How to run ---
# python tools/logh7_root_init_watch.py --session .omo/ui-explorer/session --seconds 12
from __future__ import annotations

import argparse
import json
import time
from pathlib import Path
from typing import Final

ROOT: Final = Path(__file__).resolve().parents[1]
DEFAULT_SESSION: Final = ROOT / ".omo/ui-explorer/session"
DEFAULT_OUT: Final = ROOT / ".omo/ulw-loop/evidence/g006-c002-root-init-watch.jsonl"
DESCRIPTION: Final = "Trace LOGH VII DAT_007cd04c root assignment and initializer boundaries."


def build_js(*, sample_bytes: int = 64, poll_ms: int = 100) -> str:
    return f"""
const IMAGE_BASE = ptr('0x400000');
const moduleBase = Process.getModuleByName('G7MTClient.exe').base;
const SAMPLE_BYTES = {int(sample_bytes)};
const POLL_MS = {int(poll_ms)};
let seq = 0;
let lastPollKey = null;

function abs(vaText) {{ return moduleBase.add(ptr(vaText).sub(IMAGE_BASE)); }}
function safe(fn, fallback) {{ try {{ return fn(); }} catch (_error) {{ return fallback; }} }}
function hex(value) {{
  if (value === null || value === undefined) return null;
  return safe(() => {{ const p = ptr(value); return p.isNull() ? null : p.toString(); }}, String(value));
}}
function readPtr(address) {{ return safe(() => ptr(address).readPointer(), ptr('0x0')); }}
function readU8(address) {{ return safe(() => ptr(address).readU8(), null); }}
function readU32(address) {{ return safe(() => ptr(address).readU32(), null); }}
function readS32(address) {{ return safe(() => ptr(address).readS32(), null); }}
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

const rootState = abs('0x007cd048');
const rootGlobal = abs('0x007cd04c');
const slot40 = abs('0x007cd040');
const managerGlobal = abs('0x007c1b4c');

function rootFields(root) {{
  if (root.isNull()) return null;
  const raw = readS32(root.add(0x11178));
  return {{
    byte0: readU8(root),
    currentRaw11178: raw,
    currentX: raw === null ? null : raw % 100,
    currentY: raw === null ? null : Math.trunc(raw / 100),
    listCount1117c: readU32(root.add(0x1117c)),
    listHead11180Hex: bytesHex(root.add(0x11180), Math.min(SAMPLE_BYTES, 96)),
    gridHead0008Hex: bytesHex(root.add(0x8), SAMPLE_BYTES),
  }};
}}
function managerSnapshot() {{
  const manager = readPtr(managerGlobal);
  if (manager.isNull()) return {{ DAT_007c1b4c: null, field2a418_u32: null, field2a418_ptr: null }};
  return {{
    DAT_007c1b4c: hex(manager),
    field2a418_u32: readU32(manager.add(0x2a418)),
    field2a418_ptr: hex(readPtr(manager.add(0x2a418))),
  }};
}}
function commandCreateOutfitFields(source) {{
  if (source.isNull()) return null;
  const sourceVtable = readPtr(source);
  return {{
    source: hex(source),
    sourceVtable: hex(sourceVtable),
    sourceIdentityTag: String(hex(sourceVtable)) + ':' + String(readU32(source.add(0x320))),
    sourceHeadHex: bytesHex(source, Math.min(SAMPLE_BYTES, 64)),
    source31c: readU8(source.add(0x31c)),
    source31d: readU8(source.add(0x31d)),
    source31e: readU8(source.add(0x31e)),
    source319: readU8(source.add(0x319)),
    source31a: readU8(source.add(0x31a)),
    source31b: readU8(source.add(0x31b)),
    currentSource320: readU32(source.add(0x320)),
    source321: readU8(source.add(0x321)),
  }};
}}
function mainStateFields(mainState) {{
  if (mainState.isNull()) return null;
  const strategyRoot2a58f8 = mainState.add(0x2a58f8);
  const currentSourcePtr8 = readPtr(mainState.add(0x8));
  return {{
    mainState: hex(mainState),
    'mainState+8': hex(mainState.add(0x8)),
    currentSourcePtr8: hex(currentSourcePtr8),
    currentSourceFields: commandCreateOutfitFields(currentSourcePtr8),
    mode126710_u32: readU32(mainState.add(0x126710)),
    modeByte126711: readU8(mainState.add(0x126711)),
    field126714_u32: readU32(mainState.add(0x126714)),
    strategyRoot2a58f8: hex(strategyRoot2a58f8),
    strategyFlag2a58f8: readU8(strategyRoot2a58f8),
    strategyCurrent2b6a70: readS32(mainState.add(0x2b6a70)),
    strategyBaseFlag2b6a6c: readU8(mainState.add(0x2b6a6c)),
    sourceBase3facf4Hex: bytesHex(mainState.add(0x3facf4), Math.min(SAMPLE_BYTES, 64)),
    copiedBase2b6a74Hex: bytesHex(mainState.add(0x2b6a74), Math.min(SAMPLE_BYTES, 64)),
    sourceInstitution3fb2f8Hex: bytesHex(mainState.add(0x3fb2f8), Math.min(SAMPLE_BYTES, 64)),
    copiedInstitution2b7078Hex: bytesHex(mainState.add(0x2b7078), Math.min(SAMPLE_BYTES, 64)),
    rootBlockFields: rootFields(strategyRoot2a58f8),
  }};
}}
function snapshot(reason, extraRoot, mainStateA, mainStateB) {{
  const globalRoot = readPtr(rootGlobal);
  const rootParam2 = extraRoot || ptr('0x0');
  return {{
    reason,
    DAT_007cd040_u32: readU32(slot40),
    DAT_007cd048_u8: readU8(rootState),
    DAT_007cd04c: hex(globalRoot),
    rootStateBytes: bytesHex(rootState, 0x70),
    targetBytes: bytesHex(abs('0x007cd040'), 0x20),
    manager: managerSnapshot(),
    globalRootFields: rootFields(globalRoot),
    rootParam2Fields: rootFields(rootParam2),
    mainStateFields: mainStateFields(mainStateA || ptr('0x0')),
    alternateMainStateFields: mainStateFields(mainStateB || ptr('0x0')),
  }};
}}
function callContext(context) {{
  const rootStateParam1 = safe(() => context.ecx, ptr('0x0'));
  const rootParam2 = stackPtr(context, 1);
  return {{
    ret: hex(stackPtr(context, 0)),
    ecx: hex(context.ecx),
    edx: hex(context.edx),
    rootStateParam1: hex(rootStateParam1),
    rootParam2: hex(rootParam2),
    stackArg2: hex(stackPtr(context, 2)),
    stackArg3: hex(stackPtr(context, 3)),
    backtrace: backtrace(context),
  }};
}}
function installHook(vaText, name) {{
  try {{
    Interceptor.attach(abs(vaText), {{
      onEnter() {{
        this.call = callContext(this.context);
        this.rootParam2Ptr = stackPtr(this.context, 1);
        this.ecxPtr = safe(() => this.context.ecx, ptr('0x0'));
        this.stackArg2Ptr = stackPtr(this.context, 2);
        emit(name + '-enter', {{
          va: vaText,
          call: this.call,
          sourceFields: commandCreateOutfitFields(this.rootParam2Ptr),
          slotSnapshot: snapshot(name + '-enter', this.rootParam2Ptr, this.ecxPtr, this.stackArg2Ptr),
        }});
      }},
      onLeave(retval) {{
        emit(name + '-leave', {{
          va: vaText,
          retval: hex(retval),
          call: this.call,
          sourceFields: commandCreateOutfitFields(this.rootParam2Ptr || ptr('0x0')),
          retvalFields: commandCreateOutfitFields(retval),
          slotSnapshot: snapshot(
            name + '-leave',
            this.rootParam2Ptr || ptr('0x0'),
            this.ecxPtr || ptr('0x0'),
            this.stackArg2Ptr || ptr('0x0')
          ),
        }});
      }},
    }});
    emit('hook-installed', {{ name, va: vaText, slotSnapshot: snapshot('hook-installed', ptr('0x0'), ptr('0x0'), ptr('0x0')) }});
  }} catch (error) {{
    emit('hook-failed', {{ name, va: vaText, error: String(error) }});
  }}
}}

[
  ['0x004b5bb0', 'mainStateAccessor-004b5bb0'], ['0x004c45f0', 'strategyRootPrepare-004c45f0'],
  ['0x004c8a10', 'rootAssign-004c8a10'], ['0x004d3bd0', 'postRootLoad-004d3bd0'],
  ['0x004c8bc0', 'rootTableInit-004c8bc0'], ['0x004d3a40', 'expandedGridInit-004d3a40'],
  ['0x004b64c0', 'strategyModeBranch-004b64c0'], ['0x004c4170', 'fieldImport-004c4170'],
  ['0x0048fb80', 'commandCreateOutfitParser-0048fb80'], ['0x0048ffd0', 'commandCreateOutfitTextParser-0048ffd0'],
  ['0x0040a700', 'candidateSourceFactoryA-0040a700'], ['0x004a49c0', 'candidateSourceFactoryB-004a49c0'],
  ['0x004b6000', 'mainStateConstructor-004b6000'], ['0x004b5bd0', 'sourceDirect31eSetter-004b5bd0'],
  ['0x004b5cf0', 'sourceRelated324Setter-004b5cf0'], ['0x004b5db0', 'sourceRelated31eSetter-004b5db0'],
  ['0x004b5e80', 'sourceRelated358Setter-004b5e80'],
].forEach(([va, name]) => installHook(va, name));
emit('watch-ready', {{ pollMs: POLL_MS, sampleBytes: SAMPLE_BYTES, slotSnapshot: snapshot('watch-ready', ptr('0x0'), ptr('0x0'), ptr('0x0')) }});

setInterval(function pollSlots() {{
  const current = snapshot('poll', ptr('0x0'), ptr('0x0'), ptr('0x0'));
  const key = JSON.stringify(current);
  if (lastPollKey !== key) {{
    emit('poll-change', {{ previousKey: lastPollKey, slotSnapshot: current }});
    lastPollKey = key;
  }}
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
            script = session.create_script(build_js(sample_bytes=args.sample_bytes, poll_ms=args.poll_ms))
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
    parser.add_argument("--session", type=Path, default=DEFAULT_SESSION)
    parser.add_argument("--pid", type=int, default=None)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    parser.add_argument("--seconds", type=float, default=15.0)
    parser.add_argument("--sample-bytes", type=int, default=64)
    parser.add_argument("--poll-ms", type=int, default=100)
    return run(parser.parse_args())


if __name__ == "__main__":
    raise SystemExit(main())
