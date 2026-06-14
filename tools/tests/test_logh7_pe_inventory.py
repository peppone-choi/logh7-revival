import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from tools.tests.test_logh7_pipeline import REPO_ROOT, TOOL


IMAGE_BASE = 0x00400000
SECTION_RVA = 0x1000
SECTION_RAW = 0x400
SECTION_SIZE = 0x200


def _write_u16(data: bytearray, offset: int, value: int) -> None:
    data[offset : offset + 2] = value.to_bytes(2, "little")


def _write_u32(data: bytearray, offset: int, value: int) -> None:
    data[offset : offset + 4] = value.to_bytes(4, "little")


def _fixture_pe(path: Path, *, image_base: int = IMAGE_BASE, entry_rva: int = SECTION_RVA) -> None:
    data = bytearray(SECTION_RAW + SECTION_SIZE)
    data[:2] = b"MZ"
    _write_u32(data, 0x3C, 0x80)
    data[0x80:0x84] = b"PE\0\0"
    _write_u16(data, 0x84, 0x014C)
    _write_u16(data, 0x86, 1)
    _write_u16(data, 0x94, 0xE0)
    _write_u16(data, 0x96, 0x010F)
    optional = 0x98
    _write_u16(data, optional, 0x10B)
    _write_u32(data, optional + 16, entry_rva)
    _write_u32(data, optional + 28, image_base)
    _write_u16(data, optional + 68, 2)
    _write_u32(data, optional + 92, 16)
    section = optional + 0xE0
    data[section : section + 8] = b".text\0\0\0"
    _write_u32(data, section + 8, SECTION_SIZE)
    _write_u32(data, section + 12, SECTION_RVA)
    _write_u32(data, section + 16, SECTION_SIZE)
    _write_u32(data, section + 20, SECTION_RAW)
    path.write_bytes(bytes(data))


class Logh7PeInventoryTests(unittest.TestCase):
    def test_indexes_exe_and_dll_files_for_reverse_engineering_triage(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root / "exe").mkdir()
            _fixture_pe(root / "G7Start.exe")
            _fixture_pe(root / "exe" / "G7MTClient.exe")
            _fixture_pe(root / "DSETUP.dll", image_base=0x10000000)
            (root / "readme.txt").write_text("not a PE", encoding="utf-8")
            out = root / "pe-inventory.json"

            result = subprocess.run(
                [sys.executable, str(TOOL), "pe-inventory", str(root), "--out", str(out)],
                cwd=REPO_ROOT,
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                check=False,
            )

            self.assertEqual(result.returncode, 0, result.stderr)
            inventory = json.loads(out.read_text(encoding="utf-8"))
            self.assertEqual(inventory["summary"]["peFiles"], 3)
            by_path = {entry["path"]: entry for entry in inventory["peFiles"]}
            self.assertEqual(by_path["exe/G7MTClient.exe"]["priority"], "high")
            self.assertEqual(by_path["exe/G7MTClient.exe"]["role"], "main game client")
            self.assertEqual(by_path["G7Start.exe"]["role"], "launcher")
            self.assertEqual(by_path["DSETUP.dll"]["imageBaseHex"], "0x10000000")
            self.assertEqual(by_path["DSETUP.dll"]["machineHex"], "0x014c")


if __name__ == "__main__":
    unittest.main()
