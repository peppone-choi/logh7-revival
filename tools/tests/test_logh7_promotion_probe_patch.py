import json
import struct
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from tools.logh7_promotion_probe_patch import (
    PROMOTION_MAGIC,
    PROMOTION_RECORD_BYTES,
    decode_promotion_probe_ring,
)
from tools.tests.test_logh7_pipeline import REPO_ROOT


CLIENT_EXE = REPO_ROOT / ".omo" / "work" / "logh7-installed" / "exe" / "G7MTClient.exe"
TEXT_SECTION_CHARACTERISTICS_OFFSET = 0x244


def _record(call_index: int, site_id: int, values: tuple[int, int, int, int, int, int]) -> bytes:
    record = bytearray(PROMOTION_RECORD_BYTES)
    record[0:4] = PROMOTION_MAGIC
    struct.pack_into("<IIIIIIII", record, 4, call_index, site_id, *values)
    return bytes(record)


class Logh7PromotionProbeRingTests(unittest.TestCase):
    def test_decodes_promotion_boundary_ring(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            ring = Path(temp) / "promotion-ring.bin"
            records = [
                _record(0, 1, (0x2001, 0x05393810, 0x05393828, 0x15D0004C, 0x00000004, 0)),
                _record(1, 2, (0x05393834, 0x15D0004C, 0x15D0004C, 0x00000004, 0x00012001, 0)),
                _record(2, 3, (0x00000000, 0x053928B8, 0x00002001, 0x00002001, 0, 0)),
                _record(3, 4, (0x00002001, 0x15D0004C, 0x12C53020, 0x00000000, 0, 0)),
            ]
            ring.write_bytes(struct.pack("<I", len(records)) + b"\0\0\0\0" + b"".join(records))

            decoded = decode_promotion_probe_ring(ring)

        self.assertEqual(decoded["counter"], 4)
        self.assertEqual(decoded["sitesSeen"], ["routerReturn", "dispatchFrame", "handlerLookup", "enqueue"])
        self.assertEqual(decoded["verdict"], "enqueue reached")
        self.assertEqual(decoded["records"][0]["innerCodeHex"], "0x2001")
        self.assertEqual(decoded["records"][2]["hit"], False)
        self.assertEqual(decoded["records"][3]["internalCodeHex"], "0x2001")

    def test_empty_ring_reports_no_promotion(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            ring = Path(temp) / "promotion-ring.bin"
            ring.write_bytes(struct.pack("<I", 0) + b"\0\0\0\0" + bytes(PROMOTION_RECORD_BYTES * 6))
            decoded = decode_promotion_probe_ring(ring)

        self.assertEqual(decoded["sitesSeen"], [])
        self.assertEqual(decoded["verdict"], "no promotion evidence")


@unittest.skipUnless(CLIENT_EXE.exists(), "installed G7MTClient.exe is required")
class Logh7PromotionProbePatchTests(unittest.TestCase):
    def test_writes_promotion_boundary_probe(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            temp_path = Path(temp)
            patched = temp_path / "G7MTClient.promotion-probe.exe"
            metadata = temp_path / "promotion-probe-patch.json"

            result = subprocess.run(
                [
                    sys.executable,
                    "-m",
                    "tools.logh7_promotion_probe_patch",
                    "patch",
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
            self.assertEqual(patch["recordFormat"]["magic"], PROMOTION_MAGIC.hex())
            self.assertEqual(patch["ringBuffer"]["recordCapacity"], 8)
            self.assertLessEqual(patch["trampoline"]["bytesUsed"], 811)
            self.assertEqual(
                [hook["target"] for hook in patch["hooks"]],
                ["routerDecodedReturn", "dispatchFrame", "handlerLookup", "decodedMessageEnqueue"],
            )
            self.assertEqual(
                [hook["virtualAddressHex"] for hook in patch["hooks"]],
                ["0x00613222", "0x0061231b", "0x00612348", "0x004b8850"],
            )

            raw = patched.read_bytes()
            self.assertEqual(raw[0x213222], 0xE9)
            self.assertEqual(raw[0x21231B], 0xE9)
            self.assertEqual(raw[0x212348], 0xE9)
            self.assertEqual(raw[0x0B8850], 0xE9)
            self.assertEqual(
                raw[TEXT_SECTION_CHARACTERISTICS_OFFSET : TEXT_SECTION_CHARACTERISTICS_OFFSET + 4],
                bytes.fromhex("200000e0"),
            )

    def test_writes_wrapping_promotion_boundary_probe(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            temp_path = Path(temp)
            patched = temp_path / "G7MTClient.promotion-probe-wrap.exe"
            metadata = temp_path / "promotion-probe-wrap-patch.json"

            result = subprocess.run(
                [
                    sys.executable,
                    "-m",
                    "tools.logh7_promotion_probe_patch",
                    "patch",
                    str(CLIENT_EXE),
                    "--out",
                    str(patched),
                    "--manifest-out",
                    str(metadata),
                    "--wrap",
                ],
                cwd=REPO_ROOT,
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                check=False,
            )

            self.assertEqual(result.returncode, 0, result.stderr)
            patch = json.loads(metadata.read_text(encoding="utf-8"))
            self.assertEqual(patch["ringBuffer"]["mode"], "wrap")
            self.assertEqual(patch["ringBuffer"]["recordCapacity"], 8)
            self.assertLessEqual(patch["trampoline"]["bytesUsed"], 811)


if __name__ == "__main__":
    unittest.main()
