import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from tools.tests.test_logh7_pipeline import REPO_ROOT


CLIENT_EXE = REPO_ROOT / ".omo" / "work" / "logh7-installed" / "exe" / "G7MTClient.exe"
TEXT_SECTION_CHARACTERISTICS_OFFSET = 0x244


@unittest.skipUnless(CLIENT_EXE.exists(), "installed G7MTClient.exe is required")
class Logh7FactoryProbePatchTests(unittest.TestCase):
    def test_writes_handler_map_factory_argument_ring_probe(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            patched = Path(temp) / "G7MTClient.factory-probe.exe"
            metadata = Path(temp) / "factory-probe-patch.json"

            result = subprocess.run(
                [
                    sys.executable,
                    "-m",
                    "tools.logh7_factory_probe_patch",
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
            patch = json.loads(metadata.read_text(encoding="utf-8"))
            self.assertEqual(patch["recordFormat"]["magic"], "46504231")  # "FPB1"
            self.assertEqual(patch["recordFormat"]["recordBytes"], 64)
            self.assertEqual(patch["ringBuffer"]["recordCapacity"], 4)
            self.assertLessEqual(patch["trampoline"]["bytesUsed"], 811)

            hook = patch["hooks"][0]
            self.assertEqual(hook["target"], "handlerMapFactoryEntry")
            self.assertEqual(hook["virtualAddressHex"], "0x00612030")
            self.assertEqual(hook["continuationHex"], "0x00612035")
            self.assertEqual(hook["originalHex"], "8b54241453")

            raw = patched.read_bytes()
            self.assertEqual(raw[0x212030], 0xE9)  # hook jmp installed at the factory entry
            self.assertEqual(
                raw[TEXT_SECTION_CHARACTERISTICS_OFFSET : TEXT_SECTION_CHARACTERISTICS_OFFSET + 4],
                bytes.fromhex("200000e0"),
            )
            self.assertIn(b"FPB1", raw[0x26ACD5 : 0x26ACD5 + 811])

    def test_factory_entry_bytes_unchanged_in_source(self) -> None:
        # Regression lock: the probe hardcodes the factory prologue bytes; if the
        # client binary drifts the patch must refuse rather than corrupt the entry.
        from tools.logh7_child_codec import _parse_pe_image, _virtual_address_to_offset

        data = CLIENT_EXE.read_bytes()
        image = _parse_pe_image(data)
        off = _virtual_address_to_offset(image, 0x00612030)
        self.assertEqual(data[off : off + 5].hex(), "8b54241453")


if __name__ == "__main__":
    unittest.main()
