"""Tests for tools/logh7_codepage949_recipe.py using a self-contained synthetic PE.

No real EXE is required: a minimal MZ + PE header + one .text section is built in memory so
the VA→file-offset math resolves for the planted callsite and strict-flag virtual addresses.
"""

from __future__ import annotations

import json
import struct
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

if __package__ in {None, ""}:
    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from tools.logh7_child_codec import _parse_pe_image, _virtual_address_to_offset
from tools.logh7_codepage949_recipe import (
    CALLSITE_PATTERN,
    CAVE_VA,
    EXPECTED_CALLSITE_COUNT,
    IMAGE_BASE,
    MBTOWC_SLOT_VA,
    RETARGET_TO_HEX,
    STRICT_FLAG_ORIGINAL_HEX,
    STRICT_FLAG_PATCHED_HEX,
    STRICT_FLAG_VAS,
    build_recipe,
    build_trampoline,
)

REPO_ROOT = Path(__file__).resolve().parents[2]

# Deterministic golden: 4-byte shadow cell (-> CAVE_VA+4) + 41-byte trampoline.
GOLDEN_TRAMPOLINE_HEX = (
    "d9ac6600"  # shadow cell dd 0x0066acd9 (CAVE_VA + 4)
    "837c240400"  # cmp dword[esp+4], 0
    "7414"  # je  L949
    "817c2404a4030000"  # cmp dword[esp+4], 932
    "740a"  # je  L949
    "817c2404e9fd0000"  # cmp dword[esp+4], 65001
    "7508"  # jne LPASS
    "c7442404b5030000"  # L949:  mov dword[esp+4], 949
    "ff2570b16600"  # LPASS: jmp dword[0x66b170]
)

# Section layout: raw pointer == virtual address (RVA), so VA - IMAGE_BASE == file offset.
_TEXT_RVA = 0x00001000
_TEXT_RAW_PTR = 0x00001000
_TEXT_VIRTUAL_SIZE = 0x0026D000  # covers CAVE_VA (RVA 0x26acd5) and the slot region
_TEXT_RAW_SIZE = 0x0026D000


def _build_synthetic_pe() -> bytes:
    """Build a minimal one-section PE32 whose .text maps VA->file as VA-IMAGE_BASE."""
    image_size = _TEXT_RAW_PTR + _TEXT_RAW_SIZE
    data = bytearray(image_size)

    # DOS header: "MZ" + e_lfanew at 0x3C.
    data[0:2] = b"MZ"
    pe_offset = 0x80
    struct.pack_into("<I", data, 0x3C, pe_offset)

    # PE signature + COFF file header.
    data[pe_offset : pe_offset + 4] = b"PE\0\0"
    machine = 0x014C  # IMAGE_FILE_MACHINE_I386
    section_count = 1
    optional_header_size = 0xE0  # standard PE32 optional header size
    struct.pack_into("<H", data, pe_offset + 4, machine)
    struct.pack_into("<H", data, pe_offset + 6, section_count)
    struct.pack_into("<H", data, pe_offset + 20, optional_header_size)

    # Optional header: magic (PE32) + ImageBase at optional_header + 28.
    optional_header = pe_offset + 24
    struct.pack_into("<H", data, optional_header, 0x010B)  # PE32
    struct.pack_into("<I", data, optional_header + 28, IMAGE_BASE)

    # Section table (1 entry, 40 bytes) immediately after the optional header.
    section_table = optional_header + optional_header_size
    name = b".text".ljust(8, b"\0")
    data[section_table : section_table + 8] = name
    struct.pack_into("<I", data, section_table + 8, _TEXT_VIRTUAL_SIZE)
    struct.pack_into("<I", data, section_table + 12, _TEXT_RVA)
    struct.pack_into("<I", data, section_table + 16, _TEXT_RAW_SIZE)
    struct.pack_into("<I", data, section_table + 20, _TEXT_RAW_PTR)

    return bytes(data)


# Callsite virtual addresses planted into the synthetic image (2 of them).
_PLANTED_CALLSITE_VAS = (0x00500100, 0x005AB200)


def _plant(image_bytes: bytes) -> bytes:
    """Plant callsite patterns and strict-flag bytes at known VAs in the synthetic image."""
    data = bytearray(image_bytes)
    image = _parse_pe_image(image_bytes)
    for va in _PLANTED_CALLSITE_VAS:
        offset = _virtual_address_to_offset(image, va)
        data[offset : offset + len(CALLSITE_PATTERN)] = CALLSITE_PATTERN
    for va in STRICT_FLAG_VAS:
        offset = _virtual_address_to_offset(image, va)
        data[offset : offset + 2] = bytes.fromhex(STRICT_FLAG_ORIGINAL_HEX)
    return bytes(data)


class TrampolineTests(unittest.TestCase):
    def test_trampoline_assembles_to_golden_hex(self) -> None:
        self.assertEqual(build_trampoline().hex(), GOLDEN_TRAMPOLINE_HEX)

    def test_trampoline_shadow_cell_points_at_body(self) -> None:
        blob = build_trampoline()
        cell = struct.unpack_from("<I", blob, 0)[0]
        self.assertEqual(cell, CAVE_VA + 4)

    def test_trampoline_total_length_is_forty_five(self) -> None:
        self.assertEqual(len(build_trampoline()), 45)

    def test_trampoline_tail_jumps_to_real_slot(self) -> None:
        blob = build_trampoline()
        self.assertEqual(blob[-6:], b"\xff\x25" + struct.pack("<I", MBTOWC_SLOT_VA))


class SyntheticPeTests(unittest.TestCase):
    def setUp(self) -> None:
        self.image_bytes = _plant(_build_synthetic_pe())

    def test_va_to_offset_matches_image_base_delta(self) -> None:
        image = _parse_pe_image(self.image_bytes)
        for va in (*_PLANTED_CALLSITE_VAS, *STRICT_FLAG_VAS, CAVE_VA):
            self.assertEqual(_virtual_address_to_offset(image, va), va - IMAGE_BASE)

    def test_callsite_scan_finds_planted_callsites(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            exe = Path(temp) / "synthetic.exe"
            exe.write_bytes(self.image_bytes)
            recipe = build_recipe(exe)
        self.assertTrue(recipe["exePresent"])
        callsites = recipe["iatTrampoline"]["callsites"]
        found_vas = {site["virtualAddressHex"] for site in callsites}
        for va in _PLANTED_CALLSITE_VAS:
            self.assertIn(f"0x{va:08x}", found_vas)
        self.assertEqual(recipe["iatTrampoline"]["callsiteCount"], len(_PLANTED_CALLSITE_VAS))

    def test_callsite_count_mismatch_is_warned_not_fatal(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            exe = Path(temp) / "synthetic.exe"
            exe.write_bytes(self.image_bytes)
            recipe = build_recipe(exe)
        # Only 2 planted vs expected 22 -> a WARNING note, but the recipe is still produced.
        self.assertNotEqual(len(_PLANTED_CALLSITE_VAS), EXPECTED_CALLSITE_COUNT)
        self.assertIn("WARNING", recipe["iatTrampoline"]["callsiteNote"])

    def test_strict_flag_patch_is_same_length_and_correct(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            exe = Path(temp) / "synthetic.exe"
            exe.write_bytes(self.image_bytes)
            recipe = build_recipe(exe)
        patches = recipe["strictFlagPatches"]["patches"]
        self.assertEqual(len(patches), len(STRICT_FLAG_VAS))
        for patch in patches:
            self.assertEqual(patch["originalHex"], STRICT_FLAG_ORIGINAL_HEX)
            self.assertEqual(patch["patchedHex"], STRICT_FLAG_PATCHED_HEX)
            self.assertEqual(
                len(bytes.fromhex(patch["originalHex"])),
                len(bytes.fromhex(patch["patchedHex"])),
            )
        self.assertEqual(STRICT_FLAG_PATCHED_HEX, "6a01")

    def test_strict_flag_file_offset_matches_pe_parse(self) -> None:
        image = _parse_pe_image(self.image_bytes)
        with tempfile.TemporaryDirectory() as temp:
            exe = Path(temp) / "synthetic.exe"
            exe.write_bytes(self.image_bytes)
            recipe = build_recipe(exe)
        offsets = {patch["va"]: patch["fileOffsetHex"] for patch in recipe["strictFlagPatches"]["patches"]}
        for va in STRICT_FLAG_VAS:
            expected = _virtual_address_to_offset(image, va)
            self.assertEqual(offsets[f"0x{va:08x}"], f"0x{expected:08x}")

    def test_drift_guard_raises_on_mutated_strict_byte(self) -> None:
        image = _parse_pe_image(self.image_bytes)
        mutated = bytearray(self.image_bytes)
        offset = _virtual_address_to_offset(image, STRICT_FLAG_VAS[0])
        mutated[offset] = 0x90  # corrupt the 0x6a opcode -> drift
        with tempfile.TemporaryDirectory() as temp:
            exe = Path(temp) / "synthetic.exe"
            exe.write_bytes(bytes(mutated))
            with self.assertRaises(ValueError) as ctx:
                build_recipe(exe)
        self.assertIn("drift", str(ctx.exception))

    def test_retarget_changes_only_the_disp32(self) -> None:
        # The retarget keeps the ff15 opcode and only swaps the displacement to the cave VA.
        self.assertTrue(RETARGET_TO_HEX.startswith("ff15"))
        self.assertEqual(
            RETARGET_TO_HEX,
            "ff15" + struct.pack("<I", CAVE_VA).hex(),
        )


class ExeAbsentSpecTests(unittest.TestCase):
    def test_absent_mode_emits_valid_spec(self) -> None:
        recipe = build_recipe(None)
        self.assertFalse(recipe["exePresent"])
        self.assertEqual(recipe["imageBase"], f"0x{IMAGE_BASE:08x}")
        self.assertEqual(recipe["iatTrampoline"]["trampolineHex"], GOLDEN_TRAMPOLINE_HEX)
        self.assertIsNone(recipe["iatTrampoline"]["callsiteCount"])
        self.assertEqual(recipe["iatTrampoline"]["callsites"], [])
        self.assertIn("require the EXE", recipe["iatTrampoline"]["callsiteNote"])
        self.assertEqual(
            recipe["iatTrampoline"]["expectedCallsiteCount"], EXPECTED_CALLSITE_COUNT
        )
        # strict-flag patches are still fully specified (same-length) using file hints.
        patches = recipe["strictFlagPatches"]["patches"]
        self.assertEqual(len(patches), len(STRICT_FLAG_VAS))
        for patch in patches:
            self.assertEqual(patch["patchedHex"], STRICT_FLAG_PATCHED_HEX)
        # producer force is documented-but-off.
        self.assertFalse(recipe["producerForce"]["enabled"])
        self.assertIn("instructions", recipe)

    def test_absent_mode_for_missing_path(self) -> None:
        recipe = build_recipe(Path("/nonexistent/G7MTClient.exe"))
        self.assertFalse(recipe["exePresent"])

    def test_recipe_is_deterministic(self) -> None:
        first = json.dumps(build_recipe(None), ensure_ascii=False, sort_keys=True)
        second = json.dumps(build_recipe(None), ensure_ascii=False, sort_keys=True)
        self.assertEqual(first, second)


class CliTests(unittest.TestCase):
    def test_cli_exe_absent_emits_valid_json(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            out = Path(temp) / "recipe949.json"
            result = subprocess.run(
                [
                    sys.executable,
                    str(REPO_ROOT / "tools" / "logh7_codepage949_recipe.py"),
                    "--out",
                    str(out),
                ],
                cwd=REPO_ROOT,
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                check=False,
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            text = out.read_text(encoding="utf-8")
            payload = json.loads(text)
            self.assertEqual(payload["tool"], "logh7_codepage949_recipe")
            self.assertFalse(payload["exePresent"])
            self.assertEqual(payload["iatTrampoline"]["trampolineHex"], GOLDEN_TRAMPOLINE_HEX)
            self.assertTrue(text.endswith("\n"))


if __name__ == "__main__":
    unittest.main()
