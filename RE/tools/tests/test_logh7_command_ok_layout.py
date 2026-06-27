import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from tools.logh7_command_ok_layout import build_command_ok_layout

from tools.tests.test_logh7_pipeline import REPO_ROOT, TOOL


CLIENT_EXE = REPO_ROOT / ".omo" / "work" / "logh7-installed" / "exe" / "G7MTClient.exe"


class Logh7CommandOkLayoutTests(unittest.TestCase):
    def test_indexes_command_ok_decoded_layouts(self) -> None:
        index = build_command_ok_layout(CLIENT_EXE)

        self.assertEqual(index["trigger"], "candidate 0x0031/0x0032/0x0033 command OK decoded bodies")
        self.assertEqual(
            index["entries"],
            [
                {
                    "transportHex": "0x0031",
                    "messageName": "CommandMoveShip OK",
                    "decodedBodyBytes": 1052,
                    "outputToStreamVirtualAddressHex": "0x00492930",
                    "inputFromStreamVirtualAddressHex": "0x0049a680",
                    "primaryArray": {
                        "countOffset": "0x000c",
                        "maxCount": 32,
                        "entryOffset": "0x0010",
                        "entrySizeBytes": 20,
                        "streamSlots": ["0x20", "0x1c", "0x1c", "0x1c", "0x1c"],
                    },
                    "postArrayScalars": [{"offset": "0x0290", "streamSlot": "0x1c"}, {"offset": "0x0294", "streamSlot": "0x1c"}],
                    "secondaryArray": {
                        "countOffset": "0x0298",
                        "maxCount": 32,
                        "entryOffset": "0x029c",
                        "entrySizeBytes": 12,
                        "streamSlots": ["0x1c", "0x1c", "0x1c"],
                    },
                    "layoutStatus": "decoded field offsets proven; semantic field names not yet proven",
                },
                {
                    "transportHex": "0x0032",
                    "messageName": "CommandTurnShip OK",
                    "decodedBodyBytes": 276,
                    "outputToStreamVirtualAddressHex": "0x00493030",
                    "inputFromStreamVirtualAddressHex": "0x0049b040",
                    "primaryArray": {
                        "countOffset": "0x000c",
                        "maxCount": 32,
                        "entryOffset": "0x0010",
                        "entrySizeBytes": 8,
                        "streamSlots": ["0x1c", "0x0c"],
                    },
                    "postArrayScalars": [{"offset": "0x0110", "streamSlot": "0x0c"}],
                    "secondaryArray": None,
                    "layoutStatus": "decoded field offsets proven; semantic field names not yet proven",
                },
                {
                    "transportHex": "0x0033",
                    "messageName": "CommandParallelMoveShip OK",
                    "decodedBodyBytes": 1052,
                    "outputToStreamVirtualAddressHex": "0x00493570",
                    "inputFromStreamVirtualAddressHex": "0x0049b6c0",
                    "primaryArray": {
                        "countOffset": "0x000c",
                        "maxCount": 32,
                        "entryOffset": "0x0010",
                        "entrySizeBytes": 20,
                        "streamSlots": ["0x20", "0x1c", "0x1c", "0x1c", "0x1c"],
                    },
                    "postArrayScalars": [{"offset": "0x0290", "streamSlot": "0x1c"}, {"offset": "0x0294", "streamSlot": "0x1c"}],
                    "secondaryArray": {
                        "countOffset": "0x0298",
                        "maxCount": 32,
                        "entryOffset": "0x029c",
                        "entrySizeBytes": 12,
                        "streamSlots": ["0x1c", "0x1c", "0x1c"],
                    },
                    "layoutStatus": "decoded field offsets proven; semantic field names not yet proven",
                },
            ],
        )
        self.assertEqual(index["nextTracePoint"], "construct and runtime-probe encrypted command OK bodies")

    def test_pipeline_cli_writes_command_ok_layout(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            out = Path(temp) / "command-ok-layout.json"

            result = subprocess.run(
                [sys.executable, str(TOOL), "command-ok-layout", str(CLIENT_EXE), "--out", str(out)],
                cwd=REPO_ROOT,
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                check=False,
            )

            self.assertEqual(result.returncode, 0, result.stderr)
            index = json.loads(out.read_text(encoding="utf-8"))
            self.assertEqual(index["entries"][0]["primaryArray"]["entrySizeBytes"], 20)


if __name__ == "__main__":
    unittest.main()
