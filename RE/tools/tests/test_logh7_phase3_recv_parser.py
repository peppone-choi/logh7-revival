import json
import subprocess
import sys
import unittest

from tools.logh7_phase3_recv_parser import build_phase3_recv_parser_index
from tools.tests.test_logh7_pipeline import REPO_ROOT


CLIENT_EXE = REPO_ROOT / ".omo" / "work" / "logh7-installed" / "exe" / "G7MTClient.exe"


class Logh7Phase3RecvParserTests(unittest.TestCase):
    def test_indexes_phase3_recv_context_parser_from_real_client(self) -> None:
        index = build_phase3_recv_parser_index(CLIENT_EXE)

        self.assertEqual(index["phase3RecvCallsite"]["virtualAddressHex"], "0x00645992")
        self.assertEqual(index["phase3RecvCallsite"]["returnAddressHex"], "0x00645998")
        self.assertEqual(index["postRecv"]["storesReturnMinusOneTo"], "phase-object+0x20")
        self.assertEqual(index["postRecv"]["decodeInputExpression"], "ebp+0x04")
        self.assertEqual(index["postRecv"]["decodeHelperVirtualAddressHex"], "0x00648d42")
        self.assertEqual(index["runtimeContext"]["g071PreLenMinusPreBufferHex"], "0x00000068")
        self.assertEqual(index["runtimeContext"]["g071PreBufferPlus68ObservedDwordHex"], "0x16a1a046")

        transport = index["transportBuild"]
        self.assertEqual(transport["payloadLengthRegister"], "ebp")
        self.assertEqual(transport["wireLengthRegister"], "ebp-0x02")
        self.assertEqual(transport["decodedBufferRegister"], "esi")
        self.assertEqual(transport["destinationBufferRegister"], "ebx")
        self.assertEqual(transport["lengthEndianCall"], "htons")
        self.assertEqual(transport["checksumEndianCall"], "htons")
        self.assertEqual(transport["sinkVtableSlotHex"], "0x0000000c")
        self.assertEqual(
            index["serverSchemaImplication"],
            "phase3 response must decode to a payload whose decoded byte count drives ebp; recv context +0x68 is live parser state, not a raw socket byte buffer",
        )

    def test_writes_phase3_recv_parser_index_from_standalone_cli(self) -> None:
        out = REPO_ROOT / ".omo" / "ulw-loop" / "evidence" / "g072-phase3-recv-parser-cli-test.json"

        result = subprocess.run(
            [sys.executable, "-m", "tools.logh7_phase3_recv_parser", str(CLIENT_EXE), "--out", str(out)],
            cwd=REPO_ROOT,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=False,
        )

        self.assertEqual(result.returncode, 0, result.stderr)
        index = json.loads(out.read_text(encoding="utf-8"))
        self.assertEqual(index["source"], str(CLIENT_EXE))
        self.assertEqual(index["phase3RecvCallsite"]["virtualAddressHex"], "0x00645992")


if __name__ == "__main__":
    unittest.main()
