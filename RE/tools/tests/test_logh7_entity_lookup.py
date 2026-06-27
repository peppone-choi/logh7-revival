import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from tools.logh7_entity_lookup import build_entity_lookup_index

from tools.tests.test_logh7_pipeline import REPO_ROOT


CLIENT_EXE = REPO_ROOT / ".omo" / "work" / "logh7-installed" / "exe" / "G7MTClient.exe"


class Logh7EntityLookupTests(unittest.TestCase):
    def test_indexes_entity_lookup_pools(self) -> None:
        index = build_entity_lookup_index(CLIENT_EXE)

        self.assertEqual(index["lookupVirtualAddressHex"], "0x004c7cd0")
        self.assertEqual(index["activationRoot"], "client+0x126718")
        self.assertEqual(index["commandOkSelector"], 1)
        self.assertEqual(
            index["pools"],
            [
                {
                    "selector": 0,
                    "poolBase": "client+0x126718+0x174124",
                    "activeFlagField": "record+0x00 byte",
                    "keyField": "record+0x04 dword",
                    "filterFields": ["record+0x0d byte", "record+0x0e byte", "record+0x0f byte"],
                    "recordCount": 10,
                    "recordStrideBytes": 2252,
                    "returnPointer": "record base",
                },
                {
                    "selector": 1,
                    "poolBase": "client+0x126718+0x0004",
                    "activeFlagField": "record+0x00 byte",
                    "keyField": "record+0x04 dword",
                    "filterFields": ["record+0x09 byte", "record+0x0a byte", "record+0x0b byte"],
                    "recordCount": 600,
                    "recordStrideBytes": 2540,
                    "returnPointer": "record base",
                },
                {
                    "selector": 2,
                    "poolBase": "client+0x126718+0x17991c",
                    "activeFlagField": "record+0x00 byte",
                    "keyField": "record+0x04 dword",
                    "filterFields": ["record+0x0d byte", "record+0x0e byte", "record+0x0f byte"],
                    "recordCount": 10,
                    "recordStrideBytes": 2272,
                    "returnPointer": "record base",
                },
            ],
        )
        self.assertEqual(index["commandOkEntityKeySource"], "selector 1 keyField: client+0x126718+0x0008 plus recordStrideBytes*n")

    def test_cli_writes_entity_lookup_index(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            out = Path(temp) / "entity-lookup.json"

            result = subprocess.run(
                [sys.executable, "tools/logh7_entity_lookup.py", str(CLIENT_EXE), "--out", str(out)],
                cwd=REPO_ROOT,
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                check=False,
            )

            self.assertEqual(result.returncode, 0, result.stderr)
            index = json.loads(out.read_text(encoding="utf-8"))
            self.assertEqual(index["pools"][1]["keyField"], "record+0x04 dword")


if __name__ == "__main__":
    unittest.main()
