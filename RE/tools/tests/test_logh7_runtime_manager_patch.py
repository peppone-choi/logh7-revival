import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from tools.tests.test_logh7_pipeline import REPO_ROOT, TOOL


CLIENT_EXE = REPO_ROOT / ".omo" / "work" / "logh7-installed" / "exe" / "G7MTClient.exe"
TEXT_SECTION_CHARACTERISTICS_OFFSET = 0x244


class Logh7RuntimeManagerPatchTests(unittest.TestCase):
    def test_writes_guarded_runtime_manager_store_patch_from_pipeline_cli(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            patched = Path(temp) / "G7MTClient.runtime-manager.exe"
            metadata = Path(temp) / "runtime-manager-patch.json"

            result = subprocess.run(
                [
                    sys.executable,
                    str(TOOL),
                    "runtime-manager-log-patch",
                    str(CLIENT_EXE),
                    "--out",
                    str(patched),
                    "--manifest-out",
                    str(metadata),
                ],
                cwd=REPO_ROOT,
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                check=False,
            )

            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertTrue(patched.is_file())
            patch = json.loads(metadata.read_text(encoding="utf-8"))
            self.assertEqual(patch["logPath"], "logh7_runtime_manager.bin")
            self.assertEqual(patch["hook"]["target"], "runtimeManagerGlobalStore")
            self.assertEqual(patch["hook"]["virtualAddressHex"], "0x004ad94f")
            self.assertEqual(patch["hook"]["fileOffsetHex"], "0x000ad94f")
            self.assertEqual(patch["hook"]["originalHex"], "892df4257c00")
            self.assertEqual(patch["recordFormat"]["magic"], "524d4731")
            self.assertEqual(patch["recordFormat"]["recordBytes"], 32)
            self.assertIn("managerPointer", patch["recordFormat"]["layout"])
            self.assertIn("returnAddress", patch["recordFormat"]["layout"])

            raw = patched.read_bytes()
            self.assertEqual(raw[0x0AD94F], 0xE9)
            self.assertEqual(
                raw[TEXT_SECTION_CHARACTERISTICS_OFFSET : TEXT_SECTION_CHARACTERISTICS_OFFSET + 4],
                bytes.fromhex("200000e0"),
            )
            self.assertIn(b"logh7_runtime_manager.bin\x00", raw[0x26ACD5 : 0x26ACD5 + 811])
            self.assertIn(b"RMG1", raw[0x26ACD5 : 0x26ACD5 + 811])

    def test_writes_guarded_runtime_manager_clear_patch_from_pipeline_cli(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            patched = Path(temp) / "G7MTClient.runtime-manager-clear.exe"
            metadata = Path(temp) / "runtime-manager-clear-patch.json"

            result = subprocess.run(
                [
                    sys.executable,
                    str(TOOL),
                    "runtime-manager-clear-log-patch",
                    str(CLIENT_EXE),
                    "--out",
                    str(patched),
                    "--manifest-out",
                    str(metadata),
                ],
                cwd=REPO_ROOT,
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                check=False,
            )

            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertTrue(patched.is_file())
            patch = json.loads(metadata.read_text(encoding="utf-8"))
            self.assertEqual(patch["logPath"], "logh7_runtime_manager_clear.bin")
            self.assertEqual(patch["hook"]["target"], "runtimeManagerGlobalClear")
            self.assertEqual(patch["hook"]["virtualAddressHex"], "0x004adb09")
            self.assertEqual(patch["hook"]["fileOffsetHex"], "0x000adb09")
            self.assertEqual(patch["hook"]["originalHex"], "c705f4257c0000000000")
            self.assertEqual(patch["recordFormat"]["magic"], "524d4331")
            self.assertEqual(patch["recordFormat"]["recordBytes"], 32)
            self.assertIn("globalBefore", patch["recordFormat"]["layout"])
            self.assertIn("returnAddress", patch["recordFormat"]["layout"])

            raw = patched.read_bytes()
            self.assertEqual(raw[0x0ADB09], 0xE9)
            self.assertEqual(
                raw[TEXT_SECTION_CHARACTERISTICS_OFFSET : TEXT_SECTION_CHARACTERISTICS_OFFSET + 4],
                bytes.fromhex("200000e0"),
            )
            self.assertIn(b"logh7_runtime_manager_clear.bin\x00", raw[0x26ACD5 : 0x26ACD5 + 811])
            self.assertIn(b"RMC1", raw[0x26ACD5 : 0x26ACD5 + 811])

    def test_writes_guarded_runtime_manager_destructor_patch_from_pipeline_cli(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            patched = Path(temp) / "G7MTClient.runtime-manager-destructor.exe"
            metadata = Path(temp) / "runtime-manager-destructor-patch.json"

            result = subprocess.run(
                [
                    sys.executable,
                    str(TOOL),
                    "runtime-manager-destructor-log-patch",
                    str(CLIENT_EXE),
                    "--out",
                    str(patched),
                    "--manifest-out",
                    str(metadata),
                ],
                cwd=REPO_ROOT,
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                check=False,
            )

            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertTrue(patched.is_file())
            patch = json.loads(metadata.read_text(encoding="utf-8"))
            self.assertEqual(patch["logPath"], "logh7_runtime_manager_destructor.bin")
            self.assertEqual(patch["hook"]["target"], "runtimeManagerDestructorEntry")
            self.assertEqual(patch["hook"]["virtualAddressHex"], "0x004adaa0")
            self.assertEqual(patch["hook"]["fileOffsetHex"], "0x000adaa0")
            self.assertEqual(patch["hook"]["originalHex"], "568bf1e818000000")
            self.assertEqual(patch["hook"]["replayedCallTargetHex"], "0x004adac0")
            self.assertEqual(patch["recordFormat"]["magic"], "44544531")
            self.assertEqual(patch["recordFormat"]["recordBytes"], 32)
            self.assertIn("managerThis", patch["recordFormat"]["layout"])
            self.assertIn("deleteFlag", patch["recordFormat"]["layout"])
            self.assertIn("currentGlobal", patch["recordFormat"]["layout"])

            raw = patched.read_bytes()
            self.assertEqual(raw[0x0ADAA0], 0xE9)
            self.assertEqual(
                raw[TEXT_SECTION_CHARACTERISTICS_OFFSET : TEXT_SECTION_CHARACTERISTICS_OFFSET + 4],
                bytes.fromhex("200000e0"),
            )
            self.assertIn(b"logh7_runtime_manager_destructor.bin\x00", raw[0x26ACD5 : 0x26ACD5 + 811])
            self.assertIn(b"DTE1", raw[0x26ACD5 : 0x26ACD5 + 811])

    def test_writes_guarded_runtime_manager_cleanup_patch_from_pipeline_cli(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            patched = Path(temp) / "G7MTClient.runtime-manager-cleanup.exe"
            metadata = Path(temp) / "runtime-manager-cleanup-patch.json"

            result = subprocess.run(
                [
                    sys.executable,
                    str(TOOL),
                    "runtime-manager-cleanup-log-patch",
                    str(CLIENT_EXE),
                    "--out",
                    str(patched),
                    "--manifest-out",
                    str(metadata),
                ],
                cwd=REPO_ROOT,
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                check=False,
            )

            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertTrue(patched.is_file())
            patch = json.loads(metadata.read_text(encoding="utf-8"))
            self.assertEqual(patch["logPath"], "logh7_runtime_manager_cleanup.bin")
            self.assertEqual(patch["hook"]["target"], "runtimeManagerCleanupLoopEntry")
            self.assertEqual(patch["hook"]["virtualAddressHex"], "0x004adce0")
            self.assertEqual(patch["hook"]["fileOffsetHex"], "0x000adce0")
            self.assertEqual(patch["hook"]["originalHex"], "5556578b7c2410")
            self.assertEqual(patch["recordFormat"]["magic"], "434c5031")
            self.assertEqual(patch["recordFormat"]["recordBytes"], 32)
            self.assertIn("managerArg", patch["recordFormat"]["layout"])
            self.assertIn("selfDeleteGate", patch["recordFormat"]["layout"])
            self.assertIn("listCount", patch["recordFormat"]["layout"])

            raw = patched.read_bytes()
            self.assertEqual(raw[0x0ADCE0], 0xE9)
            self.assertEqual(
                raw[TEXT_SECTION_CHARACTERISTICS_OFFSET : TEXT_SECTION_CHARACTERISTICS_OFFSET + 4],
                bytes.fromhex("200000e0"),
            )
            self.assertIn(b"logh7_runtime_manager_cleanup.bin\x00", raw[0x26ACD5 : 0x26ACD5 + 811])
            self.assertIn(b"CLP1", raw[0x26ACD5 : 0x26ACD5 + 811])

    def test_writes_guarded_runtime_manager_callback_patch_from_pipeline_cli(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            patched = Path(temp) / "G7MTClient.runtime-manager-callback.exe"
            metadata = Path(temp) / "runtime-manager-callback-patch.json"

            result = subprocess.run(
                [
                    sys.executable,
                    str(TOOL),
                    "runtime-manager-callback-log-patch",
                    str(CLIENT_EXE),
                    "--out",
                    str(patched),
                    "--manifest-out",
                    str(metadata),
                ],
                cwd=REPO_ROOT,
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                check=False,
            )

            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertTrue(patched.is_file())
            patch = json.loads(metadata.read_text(encoding="utf-8"))
            self.assertEqual(patch["logPath"], "logh7_runtime_manager_callback.bin")
            self.assertEqual(patch["hook"]["target"], "runtimeManagerRegisteredCallback")
            self.assertEqual(patch["hook"]["virtualAddressHex"], "0x004add60")
            self.assertEqual(patch["hook"]["fileOffsetHex"], "0x000add60")
            self.assertEqual(patch["hook"]["originalHex"], "558bec6aff")
            self.assertEqual(patch["recordFormat"]["magic"], "43424b31")
            self.assertEqual(patch["recordFormat"]["recordBytes"], 36)
            self.assertIn("contextArg", patch["recordFormat"]["layout"])
            self.assertIn("flagArg", patch["recordFormat"]["layout"])
            self.assertIn("callbackState30", patch["recordFormat"]["layout"])
            self.assertIn("member40", patch["recordFormat"]["layout"])

            raw = patched.read_bytes()
            self.assertEqual(raw[0x0ADD60], 0xE9)
            self.assertEqual(
                raw[TEXT_SECTION_CHARACTERISTICS_OFFSET : TEXT_SECTION_CHARACTERISTICS_OFFSET + 4],
                bytes.fromhex("200000e0"),
            )
            self.assertIn(b"logh7_runtime_manager_callback.bin\x00", raw[0x26ACD5 : 0x26ACD5 + 811])
            self.assertIn(b"CBK1", raw[0x26ACD5 : 0x26ACD5 + 811])


if __name__ == "__main__":
    unittest.main()
