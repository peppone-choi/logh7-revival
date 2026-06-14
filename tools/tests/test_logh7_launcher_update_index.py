import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from tools.tests.test_logh7_pipeline import REPO_ROOT


TOOL = REPO_ROOT / "tools" / "logh7_launcher_update_index.py"
IMAGE_BASE = 0x00400000
SECTION_RVA = 0x1000
SECTION_RAW = 0x400
SECTION_SIZE = 0x500


def _write_u16(data: bytearray, offset: int, value: int) -> None:
    data[offset : offset + 2] = value.to_bytes(2, "little")


def _write_u32(data: bytearray, offset: int, value: int) -> None:
    data[offset : offset + 4] = value.to_bytes(4, "little")


def _fixture_pe(path: Path, markers: tuple[bytes, ...]) -> None:
    data = bytearray(SECTION_RAW + SECTION_SIZE)
    data[:2] = b"MZ"
    _write_u32(data, 0x3C, 0x80)
    data[0x80:0x84] = b"PE\0\0"
    _write_u16(data, 0x84, 0x014C)
    _write_u16(data, 0x86, 1)
    _write_u16(data, 0x94, 0xE0)
    optional = 0x98
    _write_u16(data, optional, 0x10B)
    _write_u32(data, optional + 16, SECTION_RVA)
    _write_u32(data, optional + 28, IMAGE_BASE)
    section = optional + 0xE0
    data[section : section + 8] = b".text\0\0\0"
    _write_u32(data, section + 8, SECTION_SIZE)
    _write_u32(data, section + 12, SECTION_RVA)
    _write_u32(data, section + 16, SECTION_SIZE)
    _write_u32(data, section + 20, SECTION_RAW)
    cursor = SECTION_RAW + 0x80
    for marker in markers:
        data[cursor : cursor + len(marker)] = marker
        cursor += len(marker) + 3
    path.write_bytes(bytes(data))


class Logh7LauncherUpdateIndexTests(unittest.TestCase):
    def test_indexes_launcher_update_server_and_replacement_markers(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            _fixture_pe(
                root / "Gin7UpdateClient.exe",
                (
                    b"202.8.80.179",
                    b"SERVER_PORT",
                    b"SERVER_ADDRESS",
                    b"%sSERVER.INI",
                    b"http://",
                    b"ProxyServer",
                    b".\\exe\\G7MTClient.exe",
                    b"Gin7UpdateClient.new",
                    b"UPDATE.LOG",
                ),
            )
            _fixture_pe(root / "G7Start.exe", (b"exe\\G7MTClient.exe", b"SETUP.EXE"))
            _fixture_pe(root / "BootFirst.exe", (b".\\Gin7UpdateClient.exe", b".\\Gin7UpdateClient.old"))
            out = root / "launcher-update-index.json"

            result = subprocess.run(
                [sys.executable, str(TOOL), str(root), "--out", str(out)],
                cwd=REPO_ROOT,
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                check=False,
            )

            self.assertEqual(result.returncode, 0, result.stderr)
            index = json.loads(out.read_text(encoding="utf-8"))
            self.assertEqual(index["summary"]["scannedBinaries"], 3)
            self.assertEqual(index["defaultServerAddress"]["value"], "202.8.80.179")
            self.assertEqual(index["defaultServerAddress"]["binary"], "Gin7UpdateClient.exe")
            by_path = {entry["path"]: entry for entry in index["binaries"]}
            self.assertEqual(by_path["Gin7UpdateClient.exe"]["role"], "update-client")
            categories = {finding["category"] for finding in by_path["Gin7UpdateClient.exe"]["findings"]}
            self.assertIn("server-config", categories)
            self.assertIn("update-transport", categories)
            self.assertIn("client-launch", categories)
            self.assertIn("update-replacement", categories)
            server_hit = next(
                finding for finding in by_path["Gin7UpdateClient.exe"]["findings"] if finding["value"] == "202.8.80.179"
            )
            self.assertEqual(server_hit["rawOffsetHex"], "0x00000480")
            self.assertEqual(server_hit["virtualAddressHex"], "0x00401080")
            bootstrap_values = {finding["value"] for finding in by_path["BootFirst.exe"]["findings"]}
            self.assertIn(".\\Gin7UpdateClient.exe", bootstrap_values)
            self.assertIn(".\\Gin7UpdateClient.old", bootstrap_values)


if __name__ == "__main__":
    unittest.main()
