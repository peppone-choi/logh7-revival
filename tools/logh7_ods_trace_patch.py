"""Code-cave OutputDebugStringA trace probe: emit a marker at each of several function
entries so the Win32 debug stream (captured by tools.logh7_dbwin_capture) records the
execution path up to a silent crash. The LAST marker before the client dies pinpoints the
faulting function -- a crash-surviving diagnostic that needs no debugger and no readable
ring buffer (OutputDebugString output is captured live, so it survives the process dying).

Each hooked function entry jumps to a trampoline that does:
    pushfd; pushad
    push <marker string VA>
    call dword [OutputDebugStringA IAT]
    popad; popfd
    <replayed original prologue bytes>
    jmp <entry + hookLen>
All trampolines and their NUL-terminated marker strings live in one runtime code cave.

Usage:
  python -m tools.logh7_ods_trace_patch patch <exe> --out <patched> --manifest-out <json>
"""
from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Final

from tools.logh7_child_codec import _parse_pe_image, _virtual_address_to_offset
from tools.logh7_runtime_patch_targets import (
    enable_section_write_for_virtual_address,
    extract_runtime_probe_imports,
    find_runtime_probe_code_cave,
)
from tools.logh7_x86_patch import X86Builder, hook_jump

# (name, entry VA, hookLen = bytes of the prologue to displace+replay, expected prologue hex).
# Prologue lengths are clean instruction boundaries verified from the PE (no rel jmp/call inside).
TRACE_POINTS: Final[list[tuple[str, int, int, str]]] = [
    # G154: crash is INSIDE grid1 (FUN_004f6f60, a HUD/screen renderer) on its 2nd call (grid3
    # 50d230 never fired). G155 experiment: with FUN_004f6f60 early-returned (skip patch), watch
    # whether the FSM now reaches tick (FUN_004b6e00) = world loaded past the crash.
    ("grid4_50cf10", 0x0050CF10, 5, "5356578bf9"),
    ("tick_4b6e00", 0x004B6E00, 6, "558bec83e4f8"),
]


@dataclass(frozen=True, slots=True)
class OdsTracePatch:
    hooks: list[dict[str, object]]
    odsImportHex: str

    def to_json(self) -> dict[str, object]:
        return {"outputDebugStringAImportHex": self.odsImportHex, "hooks": self.hooks}


def apply_ods_trace_patch(source: Path, out: Path, manifest_out: Path) -> OdsTracePatch:
    raw = bytearray(source.read_bytes())
    image = _parse_pe_image(bytes(raw))
    imports = extract_runtime_probe_imports(source)
    ods_iat = int(imports["OutputDebugStringA"], 16)
    cave = find_runtime_probe_code_cave(source)
    enable_section_write_for_virtual_address(raw, cave.virtual_address)

    # Validate prologues and gather hook offsets up front.
    points = []
    for name, va, hook_len, expected in TRACE_POINTS:
        offset = _virtual_address_to_offset(image, va)
        actual = bytes(raw[offset : offset + hook_len]).hex()
        if actual != expected:
            raise ValueError(f"prologue drift at {name} 0x{va:08x}: expected {expected}, got {actual}")
        points.append((name, va, hook_len, expected, offset))

    # Layout: trampolines first (sequentially), then the NUL-terminated marker strings.
    # Two passes: pass 1 sizes each trampoline (string VAs unknown yet -> use a placeholder of
    # the final size), pass 2 emits with the resolved string VAs. Trampoline size is independent
    # of the (fixed-width u32) string VA, so a single deterministic layout works.
    marker_bytes = {name: (f"L7P:{name}\n").encode("ascii") + b"\x00" for name, *_ in TRACE_POINTS}

    # Compute trampoline sizes (constant regardless of operands).
    def tramp_size(hook_len: int) -> int:
        # pushfd+pushad(2) push imm32(5) call[mem](6) popad+popfd(2) replay(hook_len) jmp rel32(5)
        return 2 + 5 + 6 + 2 + hook_len + 5

    tramp_va = {}
    cursor = cave.virtual_address
    for name, va, hook_len, _expected, _off in points:
        tramp_va[name] = cursor
        cursor += tramp_size(hook_len)
    string_va = {}
    for name in marker_bytes:
        string_va[name] = cursor
        cursor += len(marker_bytes[name])
    if cursor - cave.virtual_address > cave.length_bytes:
        raise ValueError(f"ODS trace probe ({cursor - cave.virtual_address} bytes) exceeds cave {cave.length_bytes}")

    blob = X86Builder(cave.virtual_address)
    for name, va, hook_len, expected, _off in points:
        assert blob.data and (cave.virtual_address + len(blob.data) == tramp_va[name]) or not blob.data or True
        start = cave.virtual_address + len(blob.data)
        if start != tramp_va[name]:
            raise ValueError("trampoline layout drift")
        blob.append(b"\x9c\x60")  # pushfd; pushad
        blob.append(b"\x68")
        blob.u32(string_va[name])  # push <marker VA>
        blob.append(b"\xff\x15")
        blob.u32(ods_iat)  # call dword [OutputDebugStringA]
        blob.append(b"\x61\x9d")  # popad; popfd
        blob.append(bytes.fromhex(expected))  # replay prologue
        blob.jmp_rel32(va + hook_len)  # continue after the displaced prologue
    for name in marker_bytes:
        if cave.virtual_address + len(blob.data) != string_va[name]:
            raise ValueError("string layout drift")
        blob.append(marker_bytes[name])

    patched = bytearray(raw)
    patched[cave.file_offset : cave.file_offset + len(blob.data)] = bytes(blob.data)

    hooks_meta = []
    for name, va, hook_len, expected, offset in points:
        hook_bytes = hook_jump(va, tramp_va[name], hook_len)
        patched[offset : offset + hook_len] = hook_bytes
        hooks_meta.append({
            "name": name,
            "virtualAddressHex": f"0x{va:08x}",
            "hookBytesHex": hook_bytes.hex(),
            "trampolineHex": f"0x{tramp_va[name]:08x}",
            "marker": f"L7P:{name}",
        })

    out.write_bytes(bytes(patched))
    patch = OdsTracePatch(hooks_meta, f"0x{ods_iat:08x}")
    manifest_out.write_text(json.dumps(patch.to_json(), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return patch


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    sub = p.add_subparsers(dest="command", required=True)
    pp = sub.add_parser("patch")
    pp.add_argument("source", type=Path)
    pp.add_argument("--out", type=Path, required=True)
    pp.add_argument("--manifest-out", type=Path, required=True)
    args = p.parse_args()
    patch = apply_ods_trace_patch(args.source, args.out, args.manifest_out)
    print(json.dumps(patch.to_json(), ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
