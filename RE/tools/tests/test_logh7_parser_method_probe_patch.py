import json
import struct
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from tools.logh7_parser_method_probe_patch import decode_parser_method_ring
from tools.tests.test_logh7_pipeline import REPO_ROOT


CLIENT_EXE = REPO_ROOT / ".omo" / "work" / "logh7-installed" / "exe" / "G7MTClient.exe"


def _record(
    *,
    call_index: int,
    vtable: int,
    method: int,
    input_ptr: int,
    payload_len: int,
    output_ptr: int,
) -> bytes:
    record = bytearray(64)
    record[0:4] = b"PMP1"
    struct.pack_into("<IIIIII", record, 4, call_index, vtable, method, input_ptr, payload_len, output_ptr)
    return bytes(record)


class Logh7ParserMethodRingTests(unittest.TestCase):
    def test_decodes_call_stack_arguments_for_parser_call(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            ring = Path(temp) / "parser-method-ring.bin"
            ring.write_bytes(
                struct.pack("<I", 1)
                + b"\0\0\0\0"
                + _record(
                    call_index=0,
                    vtable=0x0074572C,
                    method=0x00645DB0,
                    input_ptr=0x157293B8,
                    payload_len=18,
                    output_ptr=0x054728B8,
                )
            )

            decoded = decode_parser_method_ring(ring)

        record = decoded["records"][0]
        self.assertEqual(record["parserMethodHex"], "0x00645db0")
        self.assertEqual(record["inputPtrHex"], "0x157293b8")
        self.assertEqual(record["payloadLen"], 18)
        self.assertEqual(record["outputPtrHex"], "0x054728b8")


@unittest.skipUnless(CLIENT_EXE.exists(), "installed G7MTClient.exe is required")
class Logh7ParserMethodProbePatchTests(unittest.TestCase):
    def test_writes_parser_method_probe(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            patched = Path(temp) / "G7MTClient.parser-method.exe"
            metadata = Path(temp) / "parser-method.json"
            result = subprocess.run(
                [
                    sys.executable,
                    "-m",
                    "tools.logh7_parser_method_probe_patch",
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
            self.assertEqual(patch["hooks"][0]["virtualAddressHex"], "0x00613193")
            self.assertEqual(patch["hooks"][0]["originalHex"], "ff521884c0")
            self.assertEqual(patch["recordFormat"]["recordBytes"], 64)
            self.assertIn("inputPtr", patch["recordFormat"]["layout"])
            self.assertEqual(patched.read_bytes()[0x213193], 0xE9)


if __name__ == "__main__":
    unittest.main()
