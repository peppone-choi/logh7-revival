"""Apply client patch descriptors to a live G7MTClient.exe process memory.

This is a diagnostic tool for cases where Windows Code Integrity blocks a newly
built EXE hash. It does not modify the on-disk executable; it writes the same
descriptor bytes into the already-running canonical client process.
"""
from __future__ import annotations

import argparse
import json
import time
from pathlib import Path
from typing import Any, Final

IMAGE_BASE: Final = 0x00400000
ROOT: Final = Path(__file__).resolve().parents[1]
DEFAULT_SESSION: Final = ROOT / ".omo/ui-explorer/session"
PATCH_DIR: Final = ROOT / "tools/client_patches"


def _session_pid(session: Path) -> int:
    state = json.loads((session / "session.json").read_text(encoding="utf-8"))
    pid = int(state.get("clientPid") or 0)
    if pid <= 0:
        raise SystemExit(f"session has no live clientPid: {session}")
    return pid


def _load_patch(name: str) -> dict[str, Any]:
    path = PATCH_DIR / f"{name}.json"
    raw = json.loads(path.read_text(encoding="utf-8"))
    patches: list[dict[str, Any]] = []
    for site in raw.get("patches", []):
        original_hex = str(site.get("originalHex", "")).lower()
        patched_hex = str(site["patchedHex"]).lower()
        if not original_hex:
            raise ValueError(f"runtime patch descriptor {name} site {site.get('va')} missing originalHex")
        if len(original_hex) != len(patched_hex):
            raise ValueError(
                f"runtime patch descriptor {name} site {site.get('va')} originalHex/patchedHex length mismatch"
            )
        if len(patched_hex) % 2 != 0:
            raise ValueError(f"runtime patch descriptor {name} site {site.get('va')} has odd-length patchedHex")
        patches.append(
            {
                "va": int(str(site["va"]), 16),
                "originalHex": original_hex,
                "patchedHex": patched_hex,
                "note": site.get("note", ""),
            }
        )
    return {
        "name": raw.get("name", name),
        "patches": patches,
    }


def _build_js(patches: list[dict[str, Any]]) -> str:
    payload = json.dumps(patches)
    return f"""
const IMAGE_BASE = ptr('0x{IMAGE_BASE:x}');
const moduleBase = Process.getModuleByName('G7MTClient.exe').base;
const patchSets = {payload};

function emit(tag, payload) {{
  send({{ tag, t: Date.now(), moduleBase: moduleBase.toString(), ...(payload || {{}}) }});
}}
function hexBytes(bytes) {{
  return Array.prototype.map.call(bytes, b => ('0' + b.toString(16)).slice(-2)).join('');
}}
function toBytes(hex) {{
  const out = [];
  for (let i = 0; i < hex.length; i += 2) out.push(parseInt(hex.slice(i, i + 2), 16));
  return out;
}}

const planned = [];
let allBeforeOk = true;
for (const set of patchSets) {{
  for (const site of set.patches) {{
    const offset = ptr(site.va).sub(IMAGE_BASE);
    const address = moduleBase.add(offset);
    const bytes = toBytes(site.patchedHex);
    const original = site.originalHex || '';
    const before = hexBytes(new Uint8Array(address.readByteArray(bytes.length)));
    const beforeOk = original !== '' && before === original;
    const alreadyApplied = before === site.patchedHex;
    planned.push({{ set, site, address, bytes, original, before, beforeOk, alreadyApplied }});
    if (!beforeOk && !alreadyApplied) allBeforeOk = false;
  }}
}}

for (const item of planned) {{
    const set = item.set;
    const site = item.site;
    const address = item.address;
    const bytes = item.bytes;
const original = item.original;
const before = item.before;
const beforeOk = item.beforeOk;
const alreadyApplied = item.alreadyApplied;
let wrote = false;
let actual = before;
if (allBeforeOk && !alreadyApplied) {{
  Memory.protect(address, bytes.length, 'rwx');
  address.writeByteArray(bytes);
  wrote = true;
  actual = hexBytes(new Uint8Array(address.readByteArray(bytes.length)));
}}
    emit('patch-applied', {{
      name: set.name,
      va: '0x' + site.va.toString(16),
      address: address.toString(),
      original,
before,
beforeOk,
alreadyApplied,
bytes: site.patchedHex,
actual,
wrote,
ok: allBeforeOk && (beforeOk || alreadyApplied) && actual === site.patchedHex,
note: site.note,
}});
}}
emit('runtime-patch-complete', {{ patchSets: patchSets.map(p => p.name), preflightOk: allBeforeOk }});
"""


def apply_runtime_patches(pid: int, patch_names: list[str]) -> list[dict[str, Any]]:
    import frida  # type: ignore[import-not-found]

    patch_sets = [_load_patch(name) for name in patch_names]
    session = frida.attach(pid)
    events: list[dict[str, Any]] = []

    def on_message(message: dict[str, Any], _data: bytes | None) -> None:
        if message.get("type") == "send":
            events.append(message["payload"])
        else:
            events.append({"tag": "frida-message", "message": message})

    script = session.create_script(_build_js(patch_sets))
    script.on("message", on_message)
    script.load()
    time.sleep(0.5)
    script.unload()
    session.detach()
    return events


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--session", type=Path, default=DEFAULT_SESSION)
    parser.add_argument("--pid", type=int, default=None)
    parser.add_argument("--patch", action="append", required=True)
    parser.add_argument("--out", type=Path, default=None)
    args = parser.parse_args()

    pid = args.pid if args.pid is not None else _session_pid(args.session)
    events = apply_runtime_patches(pid, args.patch)
    text = json.dumps({"pid": pid, "events": events}, ensure_ascii=False, indent=2) + "\n"
    if args.out:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(text, encoding="utf-8")
    print(json.dumps({"pid": pid, "events": events}, ensure_ascii=True, indent=2))
    return 0 if all(event.get("ok", True) for event in events) else 1


if __name__ == "__main__":
    raise SystemExit(main())
