import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from tools.logh7_entity_pool_prerequisites import build_entity_pool_prerequisite_index

from tools.tests.test_logh7_pipeline import REPO_ROOT


CLIENT_EXE = REPO_ROOT / ".omo" / "work" / "logh7-installed" / "exe" / "G7MTClient.exe"


class Logh7EntityPoolPrerequisiteTests(unittest.TestCase):
    def test_indexes_world_flags_and_unit_prerequisites(self) -> None:
        index = build_entity_pool_prerequisite_index(CLIENT_EXE)

        self.assertEqual(index["activationRoot"], "client+0x126718")
        self.assertEqual(
            index["worldInitializationFlags"],
            [
                {
                    "messageName": "ResponseWorldInitialize",
                    "internalHex": "0x0f01",
                    "handlerVirtualAddressHex": "0x004bd0c9",
                    "stateWrite": "client+0x35f356 byte = body+0x00",
                },
                {
                    "messageName": "ResponseGridInitialize",
                    "internalHex": "0x0f03",
                    "handlerVirtualAddressHex": "0x004bd121",
                    "stateWrite": "client+0x35f357 byte = body+0x00",
                },
            ],
        )
        self.assertEqual(
            index["unitInformationPrerequisites"][0],
            {
                "messageName": "ResponseInformationUnit",
                "messageStringVirtualAddressHex": "0x00770678",
                "handlerVirtualAddressHex": "0x004bb110",
                "clientStateDestination": "client+0x41a364",
                "copiedDwords": 13201,
                "maxCountCheck": "word body+0x00 < 0x0259",
                "postCopyCallVirtualAddressHex": "0x004c2c80",
                "postCopyClass": 1,
            },
        )
        self.assertEqual(index["selector1Request"]["transportInternalHex"], "0x002e")
        self.assertEqual(index["selector1Request"]["keyEnumeration"], "client+0x12671c active records, 600 entries, stride 0x9ec")
        self.assertEqual(index["nextTracePoint"], "serve world/grid init and unit information before command OK probing")

    def test_cli_writes_entity_pool_prerequisite_index(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            out = Path(temp) / "entity-pool-prerequisites.json"

            result = subprocess.run(
                [sys.executable, "tools/logh7_entity_pool_prerequisites.py", str(CLIENT_EXE), "--out", str(out)],
                cwd=REPO_ROOT,
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                check=False,
            )

            self.assertEqual(result.returncode, 0, result.stderr)
            index = json.loads(out.read_text(encoding="utf-8"))
            self.assertEqual(index["unitInformationPrerequisites"][0]["postCopyClass"], 1)


if __name__ == "__main__":
    unittest.main()
