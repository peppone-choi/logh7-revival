import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from tools.logh7_post_0030_followups import build_post_0030_followup_effects

from tools.tests.test_logh7_pipeline import REPO_ROOT, TOOL


CLIENT_EXE = REPO_ROOT / ".omo" / "work" / "logh7-installed" / "exe" / "G7MTClient.exe"


class Logh7Post0030FollowupTests(unittest.TestCase):
    def test_indexes_candidate_followup_effects(self) -> None:
        index = build_post_0030_followup_effects(CLIENT_EXE)

        self.assertEqual(index["trigger"], "candidate post-0x0030 command OK decoded bodies")
        self.assertEqual(
            index["entries"],
            [
                {
                    "transportHex": "0x0031",
                    "internalHex": "0x0400",
                    "messageName": "CommandMoveShip OK",
                    "followupVirtualAddressHex": "0x004be8f0",
                    "activationGate": "client+0x126718 byte",
                    "entityLookupCallVirtualAddressHex": "0x004c7cd0",
                    "normalizerCallVirtualAddressHex": "0x004c8110",
                    "motionApplyCallVirtualAddressHex": "0x004bf4c0",
                    "entityActionCode": 2,
                    "entityFlagWrites": ["entity+0x435 byte = 1", "entity+0x62 byte = 2"],
                    "entryCountRead": "body+0x0c byte",
                    "entryArrayBase": "body+0x10",
                    "entryStrideBytes": 20,
                    "entityLookupKeyField": "primaryEntry+0x00 dword",
                    "motionApplyArguments": [
                        "entity pointer from lookup(primaryEntry+0x00 dword)",
                        "normalized primary path from normalizer(primary entry array)",
                        "body+0x00 dword + body+0x04 dword",
                        "body+0x0290 dword",
                        "normalizer scratch vector",
                        "body+0x0298 byte secondary count",
                        "body+0x029c secondary array",
                        "body+0x0294 dword",
                        "entity+0x44 dword fallback",
                        "entity+0x4c dword fallback",
                    ],
                    "responseStatus": "follow-up consumes copied command body; no outbound response proven",
                },
                {
                    "transportHex": "0x0032",
                    "internalHex": "0x0401",
                    "messageName": "CommandTurnShip OK",
                    "followupVirtualAddressHex": "0x004bef70",
                    "activationGate": "client+0x126718 byte",
                    "entityLookupCallVirtualAddressHex": "0x004c7cd0",
                    "normalizerCallVirtualAddressHex": "0x004c8110",
                    "motionApplyCallVirtualAddressHex": "0x004bf4c0",
                    "entityActionCode": 3,
                    "entityFlagWrites": ["entity+0x435 byte = 1", "entity+0x62 byte = 3"],
                    "entryCountRead": "body+0x0c byte",
                    "entryArrayBase": "body+0x10",
                    "entryStrideBytes": 8,
                    "entityLookupKeyField": "primaryEntry+0x00 dword",
                    "motionApplyArguments": [
                        "entity pointer from lookup(primaryEntry+0x00 dword)",
                        "normalized primary path from normalizer(primary entry array)",
                        "body+0x00 dword + body+0x04 dword",
                        "literal 0x3f800000 float",
                        "stack vector from entity+0x14/entity+0x18/entity+0x1c",
                        "literal waypoint count 1",
                        "normalizer scratch vector",
                        "body+0x0110 dword",
                        "entity+0x44 dword fallback",
                        "entity+0x4c dword fallback",
                    ],
                    "responseStatus": "follow-up consumes copied command body; no outbound response proven",
                },
                {
                    "transportHex": "0x0033",
                    "internalHex": "0x0402",
                    "messageName": "CommandParallelMoveShip OK",
                    "followupVirtualAddressHex": "0x004bf320",
                    "activationGate": "client+0x126718 byte",
                    "entityLookupCallVirtualAddressHex": "0x004c7cd0",
                    "normalizerCallVirtualAddressHex": "0x004c8110",
                    "motionApplyCallVirtualAddressHex": "0x004bf4c0",
                    "entityActionCode": 4,
                    "entityFlagWrites": ["entity+0x435 byte = 1", "entity+0x62 byte = 4"],
                    "entryCountRead": "body+0x0c byte",
                    "entryArrayBase": "body+0x10",
                    "entryStrideBytes": 20,
                    "entityLookupKeyField": "primaryEntry+0x00 dword",
                    "motionApplyArguments": [
                        "entity pointer from lookup(primaryEntry+0x00 dword)",
                        "normalized primary path from normalizer(primary entry array)",
                        "body+0x00 dword + body+0x04 dword",
                        "body+0x0290 dword",
                        "normalizer scratch vector",
                        "body+0x0298 byte secondary count",
                        "body+0x029c secondary array",
                        "body+0x0294 dword",
                        "entity+0x44 dword fallback",
                        "entity+0x4c dword fallback",
                    ],
                    "responseStatus": "follow-up consumes copied command body; no outbound response proven",
                },
            ],
        )
        self.assertEqual(index["nextTracePoint"], "derive command OK decoded body fields before enabling responses")

    def test_pipeline_cli_writes_post_0030_followups(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            out = Path(temp) / "followups.json"

            result = subprocess.run(
                [
                    sys.executable,
                    str(TOOL),
                    "post-0030-followup-effects",
                    str(CLIENT_EXE),
                    "--out",
                    str(out),
                ],
                cwd=REPO_ROOT,
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                check=False,
            )

            self.assertEqual(result.returncode, 0, result.stderr)
            index = json.loads(out.read_text(encoding="utf-8"))
            self.assertEqual(index["entries"][1]["entityActionCode"], 3)


if __name__ == "__main__":
    unittest.main()
