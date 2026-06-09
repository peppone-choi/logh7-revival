import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
TOOL = REPO_ROOT / "tools" / "logh7_pipeline.py"


def _directory_record(extent: int, size: int, name: bytes, *, flags: int = 0) -> bytes:
    record = bytearray(33 + len(name) + (0 if len(name) % 2 else 1))
    record[0] = len(record)
    record[2:6] = extent.to_bytes(4, "little")
    record[6:10] = extent.to_bytes(4, "big")
    record[10:14] = size.to_bytes(4, "little")
    record[14:18] = size.to_bytes(4, "big")
    record[25] = flags
    record[26:28] = (1).to_bytes(2, "little")
    record[28:30] = (1).to_bytes(2, "big")
    record[32] = len(name)
    record[33 : 33 + len(name)] = name
    return bytes(record)


def _write_sector(image: bytearray, sector: int, payload: bytes) -> None:
    start = sector * 2048
    image[start : start + len(payload)] = payload


def _fixture_iso(path: Path) -> None:
    image = bytearray(27 * 2048)
    root_sector = 20
    setup_sector = 21
    cab_sector = 22
    hdr_sector = 23
    subdir_sector = 24
    nested_sector = 25
    setup_ini = (
        "[Startup]\r\n"
        "AppName=銀河英雄伝説VII\r\n"
        "CompanyName=ボーステック株式会社\r\n"
        "[Languages]\r\n"
        "Default=0x0011\r\n"
        "count=1\r\n"
        "key0=0x0011\r\n"
    ).encode("cp932")
    data1 = b"InstallShield CAB placeholder"
    hdr = (
        b"<Support>\\Main Installation\\Script\x00Japanese Files\x00"
        b"G7MTClient.exe\x00Gin7UpdateClient.exe\x00update.ini\x00"
        b"constmsg.dat\x00messages_0.dat\x00http://www.gineiden.com\x00"
    )

    root_records = b"".join(
        [
            _directory_record(root_sector, 2048, b"\x00", flags=2),
            _directory_record(root_sector, 2048, b"\x01", flags=2),
            _directory_record(setup_sector, len(setup_ini), b"SETUP.INI;1"),
            _directory_record(cab_sector, len(data1), b"DATA1.CAB;1"),
            _directory_record(hdr_sector, len(hdr), b"DATA1.HDR;1"),
            _directory_record(subdir_sector, 2048, b"DIRECTX9", flags=2),
        ]
    )
    subdir_records = b"".join(
        [
            _directory_record(subdir_sector, 2048, b"\x00", flags=2),
            _directory_record(root_sector, 2048, b"\x01", flags=2),
            _directory_record(nested_sector, 6, b"DXSETUP.EXE;1"),
        ]
    )
    _write_sector(image, root_sector, root_records)
    _write_sector(image, subdir_sector, subdir_records)
    _write_sector(image, nested_sector, b"setup!")
    _write_sector(image, setup_sector, setup_ini)
    _write_sector(image, cab_sector, data1)
    _write_sector(image, hdr_sector, hdr)

    pvd = bytearray(2048)
    pvd[0] = 1
    pvd[1:6] = b"CD001"
    pvd[6] = 1
    pvd[8:40] = b"CD-RTOS CD-BRIDGE".ljust(32)
    pvd[40:72] = b"GINEIDEN7".ljust(32)
    pvd[156 : 156 + 34] = _directory_record(root_sector, 2048, b"\x00", flags=2)[:34]
    _write_sector(image, 16, pvd)

    terminator = bytearray(2048)
    terminator[0] = 255
    terminator[1:6] = b"CD001"
    terminator[6] = 1
    _write_sector(image, 17, terminator)
    path.write_bytes(image)


class Logh7PipelineTests(unittest.TestCase):
    def test_inspect_writes_localization_manifest_when_iso_contains_installshield_payload(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            temp_path = Path(temp)
            iso = temp_path / "fixture.iso"
            out = temp_path / "manifest.json"
            _fixture_iso(iso)

            result = subprocess.run(
                [sys.executable, str(TOOL), "inspect", str(iso), "--out", str(out)],
                cwd=REPO_ROOT,
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                check=False,
            )

            self.assertEqual(result.returncode, 0, result.stderr)
            manifest = json.loads(out.read_text(encoding="utf-8"))
            self.assertEqual(manifest["volume"]["identifier"], "GINEIDEN7")
            self.assertEqual(manifest["installer"]["setup_ini"]["encoding"], "cp932")
            self.assertEqual(manifest["installer"]["setup_ini"]["default_language"], "0x0011")
            self.assertIn("data1.cab", {entry["path"] for entry in manifest["entries"]})
            self.assertIn("directx9/dxsetup.exe", {entry["path"] for entry in manifest["entries"]})
            self.assertNotIn("directx9/.", {entry["path"] for entry in manifest["entries"]})
            self.assertIn("setup.ini", {item["path"] for item in manifest["localization_candidates"]})

    def test_inspect_rejects_missing_iso_without_writing_manifest(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            out = Path(temp) / "manifest.json"

            result = subprocess.run(
                [sys.executable, str(TOOL), "inspect", str(Path(temp) / "missing.iso"), "--out", str(out)],
                cwd=REPO_ROOT,
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                check=False,
            )

            self.assertNotEqual(result.returncode, 0)
            self.assertIn("does not exist", result.stderr)
            self.assertFalse(out.exists())

    def test_discover_server_writes_static_server_requirements(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            temp_path = Path(temp)
            iso = temp_path / "fixture.iso"
            out = temp_path / "server.json"
            _fixture_iso(iso)

            result = subprocess.run(
                [sys.executable, str(TOOL), "discover-server", str(iso), "--out", str(out)],
                cwd=REPO_ROOT,
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                check=False,
            )

            self.assertEqual(result.returncode, 0, result.stderr)
            discovery = json.loads(out.read_text(encoding="utf-8"))
            self.assertEqual(discovery["legacyServerStatus"], "static-evidence-only")
            self.assertIn("G7MTClient.exe", discovery["executables"])
            self.assertIn("Gin7UpdateClient.exe", discovery["executables"])
            self.assertIn("update.ini", discovery["configFiles"])
            self.assertIn("http://www.gineiden.com", discovery["urls"])


if __name__ == "__main__":
    unittest.main()
