#!/usr/bin/env python3
import json
import tempfile
import unittest
from pathlib import Path

from tools.live import _m3_close_probe as probe
from tools.live._m3_close_probe import movement_state_evidence, movement_trace_gate


class NaturalMovementPlanTests(unittest.TestCase):
    def test_uses_authoritative_five_step_route_with_confirm_last(self) -> None:
        self.assertEqual(
            probe.natural_move_steps(),
            (
                ("authority-tab", (735, 580)),
                ("captain-card", (823, 482)),
                ("warp-command", (722, 282)),
                ("destination-cell", (512, 268)),
                ("confirm", (536, 487)),
            ),
        )


class RequiredResultGateTests(unittest.TestCase):
    def test_excludes_flagship_diagnostic_without_natural_move(self) -> None:
        gates = probe.required_result_gates(False)

        self.assertNotIn("flagshipInfo", gates)
        self.assertNotIn("naturalMove", gates)

    def test_requires_natural_move_without_flagship_diagnostic(self) -> None:
        gates = probe.required_result_gates(True)

        self.assertIn("naturalMove", gates)
        self.assertNotIn("flagshipInfo", gates)


class FlagshipDiagnosticRoutingTests(unittest.TestCase):
    def test_skips_flagship_diagnostic_during_natural_move(self) -> None:
        self.assertFalse(probe.should_probe_flagship(True))

    def test_runs_flagship_diagnostic_without_natural_move(self) -> None:
        self.assertTrue(probe.should_probe_flagship(False))


class NaturalMovementTraceGateTests(unittest.TestCase):
    def test_rejects_survival_without_move_codes(self) -> None:
        self.assertFalse(movement_trace_gate([]))

    def test_rejects_notify_before_request(self) -> None:
        events = [("resp", "0x0b07"), ("recv", "0x0b01")]

        self.assertFalse(movement_trace_gate(events))

    def test_accepts_request_then_notify(self) -> None:
        events = [
            ("recv", "0x0b01"),
            ("resp", "0x0b01"),
            ("resp", "0x0b07"),
        ]

        self.assertTrue(movement_trace_gate(events))


class NaturalMovementStateEvidenceTests(unittest.TestCase):
    def test_accepts_matching_server_and_persisted_destination_cell(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "trace.jsonl").write_text(
                json.dumps({
                    "event": "world-response-sent",
                    "kind": "move",
                    "codes": ["0x0b01", "0x0b07"],
                    "cell": 2597,
                }) + "\n",
                encoding="utf-8",
            )
            (root / "store.json").write_text(
                json.dumps({"accounts": {"inei00": [{"id": 1, "cell": 2597}]}}),
                encoding="utf-8",
            )

            evidence = movement_state_evidence(
                root / "trace.jsonl", root / "store.json", "inei00", 1,
            )

            self.assertEqual(evidence["pass"], True)
            self.assertEqual(evidence["destinationCell"], 2597)
            self.assertEqual(evidence["storeCell"], 2597)

    def test_rejects_store_cell_that_does_not_match_server_destination(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "trace.jsonl").write_text(
                json.dumps({
                    "event": "world-response-sent",
                    "kind": "move",
                    "codes": ["0x0b07"],
                    "cell": 2597,
                }) + "\n",
                encoding="utf-8",
            )
            (root / "store.json").write_text(
                json.dumps({"accounts": {"inei00": [{"id": 1, "cell": 2588}]}}),
                encoding="utf-8",
            )

            evidence = movement_state_evidence(
                root / "trace.jsonl", root / "store.json", "inei00", 1,
            )

            self.assertEqual(evidence["pass"], False)
            self.assertEqual(evidence["destinationCell"], 2597)
            self.assertEqual(evidence["storeCell"], 2588)


if __name__ == "__main__":
    unittest.main()
