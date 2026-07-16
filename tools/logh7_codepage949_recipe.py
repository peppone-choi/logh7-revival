"""Emit a "force text-conversion code page 932→949" patch recipe for G7MTClient.exe.

The LOGH VII client converts UI text from **code page 932 (Shift-JIS)** to UTF-16 via
`kernel32!MultiByteToWideChar` (MBToWC). Forcing the conversion code page to **949 (CP949)**
makes every Korean-localized string convert correctly even on a host whose system ANSI code
page is not 949. Live `frida --force-cp 949` already proved this exact behavior (ret>0 for KO).

This module is a **recipe builder**, not a patcher. It produces a deterministic JSON recipe
that the Windows session applies with two already-existing stdlib tools:

  * the IAT-trampoline + callsite-retarget family via ``tools.logh7_x86_patch.X86Builder``
    (different-length / code-cave writes), and
  * the same-length strict-flag relax family via ``tools/logh7_codepage_patch.py``
    (drift-checked same-length byte patches).

Two verified patch families are combined (request §3/§B):

  ① IAT trampoline (guaranteed) — force cp 932→949 at the kernel32 boundary.
     The single MBToWC IAT slot at VA 0x66b170 is loader-resolved (unbound), so the slot
     *value* can't be patched. Instead every ``call dword[0x66b170]`` callsite
     (bytes ``ff 15 70 b1 66 00``) has its disp32 retargeted 0x66b170→0x66acd5 (same length).
     0x66acd5 is an unreferenced zero code cave at .text end holding a 4-byte shadow-slot CELL
     (= VA of the trampoline body) followed by a ~41-byte trampoline that rewrites the cp
     argument [esp+4] to 949 when it is 0/932/65001 and then ``jmp dword[0x66b170]`` into the
     real resolved MBToWC. ``call dword[0x66acd5]`` therefore calls the trampoline.

  ② strict-flag relax (companion, same-length) — remove ``MB_ERR_INVALID_CHARS(0x08)`` so a
     bad/untranslated byte sequence degrades to U+FFFD instead of a hard ret=0 (blank). Sites
     ``6a 09``→``6a 01`` at VA 0x6003f5 and VA 0x60047e (VA 0x600454 is already 0x01 — skip).

  ③ producer DAT-global force at VA 0x609c5d — runtime-SKIP'd by a global!=0 guard; included
     as documented-but-DISABLED for reference only.

CLI:
  python3 tools/logh7_codepage949_recipe.py [EXE_PATH] --out recipe.json

When EXE_PATH is given the recipe is finalized against the real binary (VA→file via PE parse,
callsite enumeration, drift-guarded originalHex). When EXE_PATH is absent the SPEC recipe is
emitted with known VAs, expected original bytes, and the assembled trampoline so the Windows
session can finalize it against the real EXE.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

if __package__ in {None, ""}:
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from tools.logh7_child_codec import PeImage, _parse_pe_image, _virtual_address_to_offset
from tools.logh7_x86_patch import X86Builder

TOOL_NAME = "logh7_codepage949_recipe"
IMAGE_BASE = 0x00400000

# ── ① IAT trampoline ────────────────────────────────────────────────────────
MBTOWC_SLOT_VA = 0x0066B170          # kernel32!MultiByteToWideChar IAT slot
CAVE_VA = 0x0066ACD5                 # unreferenced zero region at .text end
SHADOW_CELL_VA = CAVE_VA             # 4-byte cell holding the trampoline body VA
CALLSITE_PATTERN = b"\xff\x15\x70\xb1\x66\x00"   # call dword[0x66b170]
RETARGET_FROM_HEX = "ff15 70b16600".replace(" ", "")
RETARGET_TO_HEX = "ff15 d5ac6600".replace(" ", "")  # call dword[0x66acd5]
EXPECTED_CALLSITE_COUNT = 22

# Code pages the trampoline rewrites to 949.
CP_PASSTHROUGH_NONE = 0x0000         # 0 (process default)
CP_SHIFT_JIS = 0x03A4                # 932
CP_UTF8 = 0xFDE9                     # 65001
CP_KOREAN = 0x03B5                   # 949

# ── ② strict-flag relax (same-length 6a 09 -> 6a 01) ────────────────────────
STRICT_FLAG_VAS = (0x006003F5, 0x0060047E)   # VA 0x600454 is already 0x01 — DO NOT touch
STRICT_FLAG_ORIGINAL_HEX = "6a09"
STRICT_FLAG_PATCHED_HEX = "6a01"
# File offsets observed in the shipped EXE (request §B). The section's raw pointer differs
# from its VA by 2, so these are NOT VA-0x400000; reported only as informational hints for
# the EXE-absent spec. When the EXE is present the real offset is computed via PE parse.
STRICT_FLAG_FILE_HINTS = {0x006003F5: 0x002003F3, 0x0060047E: 0x0020047C}

# ── ③ producer DAT-global force (documented, DISABLED) ──────────────────────
PRODUCER_FORCE_VA = 0x00609C5D


def build_trampoline() -> bytes:
    """Assemble the shadow cell + trampoline at ``CAVE_VA`` deterministically.

    Layout::

        +0  shadow cell : dd (CAVE_VA + 4)            ; callsites call dword[cell]
        +4  cmp dword[esp+4], 0                        ; 83 7C 24 04 00
            je  L949                                   ; 74 xx
            cmp dword[esp+4], 0x3A4 (932)              ; 81 7C 24 04 A4 03 00 00
            je  L949                                   ; 74 xx
            cmp dword[esp+4], 0xFDE9 (65001)           ; 81 7C 24 04 E9 FD 00 00
            jne LPASS                                  ; 75 xx
        L949:  mov dword[esp+4], 0x3B5 (949)           ; C7 44 24 04 B5 03 00 00
        LPASS: jmp dword[0x66b170]                     ; FF 25 70 B1 66 00
    """
    builder = X86Builder(CAVE_VA)
    builder.u32(CAVE_VA + 4)                               # shadow cell -> body VA
    builder.append(b"\x83\x7c\x24\x04\x00")                # cmp dword[esp+4], 0
    je_none = builder.je_rel8_placeholder()
    builder.append(b"\x81\x7c\x24\x04\xa4\x03\x00\x00")    # cmp dword[esp+4], 932
    je_sjis = builder.je_rel8_placeholder()
    builder.append(b"\x81\x7c\x24\x04\xe9\xfd\x00\x00")    # cmp dword[esp+4], 65001
    jne_pass = builder.jne_rel8_placeholder()
    l949_va = builder.current_va
    builder.append(b"\xc7\x44\x24\x04\xb5\x03\x00\x00")    # mov dword[esp+4], 949
    lpass_va = builder.current_va
    builder.append(b"\xff\x25")                            # jmp dword[disp32]
    builder.u32(MBTOWC_SLOT_VA)
    builder.patch_rel8(je_none, l949_va)
    builder.patch_rel8(je_sjis, l949_va)
    builder.patch_rel8(jne_pass, lpass_va)
    return bytes(builder.data)


def _scan_callsites(raw: bytes, image: PeImage) -> list[dict]:
    """Find every ``call dword[0x66b170]`` callsite in the mapped image."""
    callsites: list[dict] = []
    start = 0
    while True:
        index = raw.find(CALLSITE_PATTERN, start)
        if index < 0:
            break
        va = _file_offset_to_va(image, index)
        callsites.append({
            "fileOffsetHex": f"0x{index:08x}",
            "virtualAddressHex": (f"0x{va:08x}" if va is not None else None),
        })
        start = index + 1
    return callsites


def _file_offset_to_va(image: PeImage, file_offset: int) -> int | None:
    for section in image.sections:
        section_size = max(section.virtual_size, section.raw_size)
        if section.raw_pointer <= file_offset < section.raw_pointer + section_size:
            return image.image_base + section.virtual_address + (file_offset - section.raw_pointer)
    return None


def _strict_flag_patches(image: PeImage | None, raw: bytes | None) -> dict:
    patches: list[dict] = []
    for va in STRICT_FLAG_VAS:
        if image is not None and raw is not None:
            offset = _virtual_address_to_offset(image, va)
            actual = bytes(raw[offset : offset + 2]).hex()
            if actual != STRICT_FLAG_ORIGINAL_HEX:
                raise ValueError(
                    f"strict-flag drift at 0x{va:08x} (file 0x{offset:08x}): "
                    f"expected {STRICT_FLAG_ORIGINAL_HEX} but found {actual}"
                )
            file_offset_hex = f"0x{offset:08x}"
        else:
            file_offset_hex = f"0x{STRICT_FLAG_FILE_HINTS[va]:08x}"
        patches.append({
            "va": f"0x{va:08x}",
            "fileOffsetHex": file_offset_hex,
            "originalHex": STRICT_FLAG_ORIGINAL_HEX,
            "patchedHex": STRICT_FLAG_PATCHED_HEX,
            "note": "remove MB_ERR_INVALID_CHARS(0x08): MB_PRECOMPOSED|MB_ERR_INVALID_CHARS(0x09) -> MB_PRECOMPOSED(0x01)",
        })
    return {"patches": patches}


def build_recipe(exe_path: Path | None) -> dict:
    """Build the full recipe dict. Deterministic for a given EXE (or EXE-absent)."""
    trampoline_hex = build_trampoline().hex()

    image: PeImage | None = None
    raw: bytes | None = None
    exe_present = exe_path is not None and exe_path.exists()
    callsites: list[dict] = []
    callsite_note = (
        "originalHex/callsite enumeration require the EXE; "
        "run on the Windows session to finalize"
    )

    if exe_present:
        raw = bytearray(exe_path.read_bytes())
        image = _parse_pe_image(bytes(raw))
        if image.image_base != IMAGE_BASE:
            raise ValueError(
                f"unexpected image base 0x{image.image_base:08x}; expected 0x{IMAGE_BASE:08x}"
            )
        callsites = _scan_callsites(bytes(raw), image)
        if len(callsites) != EXPECTED_CALLSITE_COUNT:
            callsite_note = (
                f"WARNING: found {len(callsites)} callsites of {RETARGET_FROM_HEX} "
                f"(expected {EXPECTED_CALLSITE_COUNT}); verify before applying"
            )
        else:
            callsite_note = (
                f"found {len(callsites)} callsites of {RETARGET_FROM_HEX} "
                f"(== expected {EXPECTED_CALLSITE_COUNT})"
            )
        cave_offset = _virtual_address_to_offset(image, CAVE_VA)
        cave_file_hex: str | None = f"0x{cave_offset:08x}"
    else:
        cave_file_hex = f"0x{CAVE_VA - IMAGE_BASE:08x}"

    recipe = {
        "tool": TOOL_NAME,
        "exePresent": exe_present,
        "imageBase": f"0x{IMAGE_BASE:08x}",
        "iatTrampoline": {
            "slotVa": f"0x{MBTOWC_SLOT_VA:08x}",
            "caveVa": f"0x{CAVE_VA:08x}",
            "caveFileOffsetHex": cave_file_hex,
            "shadowCellVa": f"0x{SHADOW_CELL_VA:08x}",
            "callsitePattern": RETARGET_FROM_HEX,
            "callsiteCount": (len(callsites) if exe_present else None),
            "expectedCallsiteCount": EXPECTED_CALLSITE_COUNT,
            "callsites": callsites,
            "callsiteNote": callsite_note,
            "trampolineHex": trampoline_hex,
            "trampolineVa": f"0x{CAVE_VA + 4:08x}",
            "forcedCodePage": CP_KOREAN,
            "rewrittenFromCodePages": [CP_PASSTHROUGH_NONE, CP_SHIFT_JIS, CP_UTF8],
            "retarget": {
                "fromHex": RETARGET_FROM_HEX,
                "toHex": RETARGET_TO_HEX,
            },
        },
        "strictFlagPatches": _strict_flag_patches(image, bytes(raw) if raw is not None else None),
        "producerForce": {
            "enabled": False,
            "va": f"0x{PRODUCER_FORCE_VA:08x}",
            "note": (
                "DISABLED: producer DAT-global force is runtime-SKIP'd by a "
                "cmp [0x3350674],0; jnz guard (global already 932 at menu time). "
                "Documented for reference only; do not apply without neutralizing the guard."
            ),
        },
        "instructions": [
            "1) IAT trampoline: with tools.logh7_x86_patch.X86Builder, write the trampolineHex "
            f"bytes at caveVa ({CAVE_VA:#010x}); then retarget every callsite of callsitePattern "
            f"({RETARGET_FROM_HEX}) by replacing its disp32 {RETARGET_FROM_HEX} -> {RETARGET_TO_HEX} "
            "(same length). Each retargeted callsite then calls the shadow cell at shadowCellVa, "
            "which dispatches into the trampoline.",
            "2) strict-flag relax: apply strictFlagPatches with tools/logh7_codepage_patch.py "
            "(same-length, drift-checked). It rewrites 6a 09 -> 6a 01 at the two strict sites.",
            "3) producerForce is DISABLED; do not apply.",
            "4) Live-verify on Windows: confirm KO strings convert (MBToWC ret>0) and no drift "
            "errors on apply.",
        ],
    }
    return recipe


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Emit a code page 932->949 force-conversion patch recipe for G7MTClient.exe.",
    )
    parser.add_argument(
        "exe_path",
        type=Path,
        nargs="?",
        default=None,
        help="optional path to G7MTClient.exe; when present the recipe is finalized against it",
    )
    parser.add_argument("--out", type=Path, required=True, help="output recipe JSON path")
    args = parser.parse_args()

    try:
        recipe = build_recipe(args.exe_path)
    except (OSError, ValueError, KeyError) as error:
        print(str(error), file=sys.stderr)
        return 1

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(recipe, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(recipe, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
