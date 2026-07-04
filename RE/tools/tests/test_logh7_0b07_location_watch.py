import subprocess
import sys
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]


class Logh70b07LocationWatchTests(unittest.TestCase):
    def test_build_js_watches_location_candidates_without_writes(self) -> None:
        from tools.logh7_0b07_location_watch import build_js

        script = build_js(sample_units=3, sample_slots=5)

        self.assertIn("0x004bee20", script)
        self.assertIn("0x00517cd0", script)
        self.assertIn("0x00501e30", script)
        self.assertIn("0x005751b0", script)
        self.assertIn("0x004d6a80", script)
        self.assertIn("0x41a364", script)
        self.assertIn("0x41a368", script)
        self.assertIn("0x36a5dc", script)
        self.assertIn("0x36a8b4", script)
        self.assertIn("0x009d2a7c", script)
        self.assertIn("0x009d2a74", script)
        self.assertIn("recordUnitEntries", script)
        # dual-decode: primary @0x13 BE (LIVE-confirmed) + alt @0x14 LE (discredited static-only).
        self.assertIn("readU32BE", script)
        self.assertIn("0x13 + i * 8", script)
        self.assertIn("0x14 + i * 8", script)
        self.assertIn("altLE14", script)
        self.assertIn("findUnitRecord", script)
        self.assertIn("targetState", script)
        self.assertIn("0x2c03cc", script)
        self.assertIn("0x2c1755", script)
        self.assertIn("spotKey40FromSource20", script)
        self.assertIn("spotAux44FromSource24", script)
        self.assertIn("seatCount270", script)
        self.assertIn("SAMPLE_UNITS = 3", script)
        self.assertIn("SAMPLE_SLOTS = 5", script)
        self.assertNotIn("writeU8(", script)
        self.assertNotIn("writeU16(", script)
        self.assertNotIn("writeU32(", script)
        self.assertNotIn("writeS32(", script)
        self.assertNotIn("Memory.write", script)

    def test_location_signature_focuses_on_stateful_fields(self) -> None:
        from tools.logh7_0b07_location_watch import location_signature

        state = {
            "clientBase": "0x1000",
            "gridActive2a58f8": 1,
            "fieldMode126711": 2,
            "ownCell11178": 2588,
            "selectResult": {"phase009d2a7c": 2},
            "selectState": {"p18SelectedX": 88},
            "units": {
                "count": 1,
                "samples": [
                    {"index": 0, "id00": 77, "u08": 1, "u0c": 2, "u10": 3, "u40": 4, "u44": 5, "u48": 6, "raw58": "aa"}
                ],
            },
            "character": {
                "focusChar3584a0": 1,
                "count36a5dc": 1,
                "samples": [{"index": 0, "id00": 1, "spot1c": 11, "spotOwner20": 12, "unit24": 77, "raw64": "bb"}],
            },
            "playerInfo": {
                "pointerAtClientBase08": "0x2000",
                "currentByPointer08": {"index": 0, "id24": 1, "spotKey40FromSource20": 2588, "raw96": "cc"},
                "focusMatch": {"index": 0, "id24": 1, "spotAux44FromSource24": 9, "seatCount270": 1, "raw96": "dd"},
                "activeSample": [{"index": 0, "id24": 1, "field48FromSource28": 3, "raw96": "ee"}],
            },
            "target": {
                "record": {"unitCount12": 1, "entries": [{"unitId": 77, "position": 2597}]},
                "entries": [
                    {
                        "unitId": 77,
                        "recordPosition": 2597,
                        "unitRow": {"index": 0, "id00": 77, "u0c": 2588, "raw58": "aa"},
                        "playerInfoByUnitId": {"index": 0, "id24": 77, "spotKey40FromSource20": 2588, "raw96": "ff"},
                        "cells": [{"cell": 2588, "cellValue": 12, "object0": 1}],
                    }
                ],
            },
        }

        sig = location_signature(state)

        self.assertEqual(sig["units"]["samples"][0]["id00"], 77)
        self.assertEqual(sig["character"]["samples"][0]["unit24"], 77)
        self.assertEqual(sig["playerInfo"]["currentByPointer08"]["spotKey40FromSource20"], 2588)
        self.assertEqual(sig["target"]["entries"][0]["unitId"], 77)
        self.assertNotIn("moduleBase", sig)

    def test_static_re_contract_is_reported_with_verdicts(self) -> None:
        from tools.logh7_0b07_location_watch import RE_CONFIRMED_0B07, classify_watch_events

        layout = RE_CONFIRMED_0B07["recordLayout"]
        self.assertEqual(layout["recordLocation"], "clientBase+0x437714")
        self.assertEqual(layout["size"], 0x244)
        self.assertEqual(layout["unitCountOffset"], 0x12)
        # Layout LIVE-RESOLVED = @0x13 BE (clean A/B 2026-06-29). @0x14 LE kept as discredited alt.
        self.assertTrue(layout["layoutResolved"])
        self.assertEqual(layout["primaryEntryOffset"], 0x13)
        self.assertEqual(layout["primaryByteOrder"], "big-endian")
        self.assertEqual(layout["altEntryOffset"], 0x14)
        self.assertEqual(layout["altByteOrder"], "little-endian")
        self.assertEqual(layout["unitEntryStride"], 8)
        # FUN_0044b460 is explicitly NOT promoted as the runtime parser.
        self.assertNotIn("parser", layout)
        self.assertIn("FUN_0044b460", layout["note"])
        # Transport evidence + live-resolution note are reported.
        self.assertIn("transportEvidence", RE_CONFIRMED_0B07)
        self.assertIn("liveResolution", RE_CONFIRMED_0B07)
        self.assertFalse(RE_CONFIRMED_0B07["staticPersistentWriterKnown"])
        self.assertIn("FUN_005751b0", " ".join(RE_CONFIRMED_0B07["consumerPath"]))

        result = classify_watch_events([])

        self.assertEqual(result["verdictCode"], "record-missing")
        self.assertEqual(result["knownConsumerEffect"], "selectgrid-result-fsm")
        self.assertFalse(result["staticPersistentWriterKnown"])
        self.assertTrue(result["reEvidence"]["recordLayout"]["layoutResolved"])

    def test_decode_move_record_both_candidate_layouts(self) -> None:
        """Clean live A/B (2026-06-29) resolved the layout as @0x13 BIG-ENDIAN. The default decode
        (@0x13 BE) yields the server intent (unitId=1, cell=2597); the discredited static-only
        alternate (@0x14 little-endian) reproduces the garbage (65536) seen before the live capture."""
        from tools.logh7_0b07_location_watch import decode_move_record

        # .omo/ui-explorer/0b07-location-watch-r2-20260629/0b07-location.jsonl rawHead (first 0x40B).
        raw = (
            "000000000000000000000000000000000000010000000100000a25"
            "00010000000100000001000000010000000100310008090000030000000100000009090000"
        )
        # Default = LIVE-confirmed @0x13 big-endian -> server intent (1, 2597).
        primary = decode_move_record(raw)
        self.assertEqual(primary["unitCount"], 1)
        self.assertEqual(primary["entries"][0]["unitId"], 1)
        self.assertEqual(primary["entries"][0]["cell"], 2597)
        self.assertEqual(primary["entryOffset"], 0x13)
        self.assertEqual(primary["byteOrder"], "big")

        # Discredited static-only alt = @0x14 little-endian -> the pre-live garbage.
        alt = decode_move_record(raw, entry_offset=0x14, byte_order="little")
        self.assertEqual(alt["entries"][0]["unitId"], 65536)

    def test_classifies_watch_events(self) -> None:
        from tools.logh7_0b07_location_watch import classify_watch_events

        base_state = {
            "clientBase": "0x1000",
            "units": {"count": 1, "samples": [{"index": 0, "id00": 77, "u08": 1, "raw58": "aa"}]},
            "playerInfo": {"activeSample": []},
            "character": {"samples": []},
            "target": {
                "record": {"unitCount12": 1, "entries": [{"unitId": 77, "position": 2597}]},
                "entries": [
                    {
                        "unitId": 77,
                        "recordPosition": 2597,
                        "unitRow": {"index": 0, "id00": 77, "u08": 1, "raw58": "aa"},
                        "playerInfoByUnitId": {"index": 0, "id24": 77, "spotKey40FromSource20": 2588, "raw96": "aa"},
                        "cells": [{"cell": 2588, "cellValue": 1, "object0": 2}],
                    }
                ],
            },
        }
        moved_state = {
            **base_state,
            "units": {"count": 1, "samples": [{"index": 0, "id00": 77, "u08": 2, "raw58": "bb"}]},
            "target": {
                "record": {"unitCount12": 1, "entries": [{"unitId": 77, "position": 2597}]},
                "entries": [
                    {
                        "unitId": 77,
                        "recordPosition": 2597,
                        "unitRow": {"index": 0, "id00": 77, "u08": 2, "raw58": "bb"},
                        "playerInfoByUnitId": {"index": 0, "id24": 77, "spotKey40FromSource20": 2597, "raw96": "bb"},
                        "cells": [{"cell": 2597, "cellValue": 3, "object0": 4}],
                    }
                ],
            },
        }
        transient_state = {**base_state, "selectResult": {"phase009d2a7c": 2}}

        cases = [
            ([{"event": "poll", "state": base_state}], "record-missing"),
            ([{"event": "poll", "state": base_state}, {"event": "bee20-enter", "state": base_state}], "dispatch-missing"),
            (
                [
                    {"event": "poll", "state": base_state},
                    {"event": "bee20-enter", "state": base_state},
                    {"event": "dispatch-b07", "state": base_state},
                ],
                "enqueue-missing",
            ),
            (
                [
                    {"event": "poll", "state": base_state},
                    {"event": "bee20-enter", "state": base_state},
                    {"event": "dispatch-b07", "state": base_state},
                    {"event": "enqueue-16", "state": base_state},
                ],
                "result-node-missing",
            ),
            (
                [
                    {"event": "poll", "state": base_state},
                    {"event": "bee20-enter", "state": base_state},
                    {"event": "dispatch-b07", "state": base_state},
                    {"event": "enqueue-16", "state": base_state},
                    {"event": "result-node-enter", "state": base_state},
                    {"event": "final-poll", "state": base_state},
                ],
                "applied-no-location-change",
            ),
            (
                [
                    {"event": "poll", "state": base_state},
                    {"event": "bee20-enter", "state": base_state},
                    {"event": "dispatch-b07", "state": base_state},
                    {"event": "enqueue-16", "state": base_state},
                    {"event": "result-node-enter", "state": base_state},
                    {"event": "final-poll", "state": moved_state},
                ],
                "applied-location-state-changed",
            ),
            (
                [
                    {"event": "poll", "state": base_state},
                    {"event": "bee20-enter", "state": base_state},
                    {"event": "dispatch-b07", "state": base_state},
                    {"event": "enqueue-16", "state": base_state},
                    {"event": "result-node-enter", "state": base_state},
                    {"event": "final-poll", "state": transient_state},
                ],
                "applied-transient-selectgrid-change",
            ),
        ]

        for events, expected in cases:
            with self.subTest(expected=expected):
                result = classify_watch_events(events)
                self.assertEqual(result["verdictCode"], expected)

    def test_cli_help_does_not_require_frida_or_live_client(self) -> None:
        result = subprocess.run(
            [sys.executable, "tools/logh7_0b07_location_watch.py", "--help"],
            cwd=REPO_ROOT,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=False,
        )

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("--seconds", result.stdout)
        self.assertIn("--session", result.stdout)
        self.assertIn("--timeline-out", result.stdout)


if __name__ == "__main__":
    unittest.main()
