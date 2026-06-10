import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from tools.tests.test_logh7_pipeline import REPO_ROOT, TOOL


class Logh7PacketTraceTests(unittest.TestCase):
    def test_analyzes_gameplay_trace_packets_from_pipeline_cli(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            temp_path = Path(temp)
            trace = temp_path / "gameplay.jsonl"
            out = temp_path / "packet-analysis.json"
            trace.write_text(
                "\n".join(
                    json.dumps(item)
                    for item in [
                        {"event": "connection", "connectionId": 1, "remoteAddress": "127.0.0.1"},
                        {
                            "event": "payload",
                            "connectionId": 1,
                            "byteLength": 28,
                            "hex": "001a0034668a7c86bad8b03c1f041f54704a2ff7594eff5d65f1b6dc",
                        },
                        {
                            "event": "response",
                            "connectionId": 1,
                            "response": {
                                "kind": "configured-phase3-candidate",
                                "byteLength": 20,
                                "hex": "001200356783362eee69aec7e7eca218faa2b528",
                            },
                        },
                        {
                            "event": "payload",
                            "connectionId": 1,
                            "byteLength": 12,
                            "hex": "000a003629af89de470c6280",
                        },
                        {
                            "event": "payload",
                            "connectionId": 1,
                            "byteLength": 52,
                            "hex": (
                                "00320030590ca783b7cecfa3797058413770ac8d752dd02709b1ee545a3107fcabf0"
                                "a2d83d54a1fcb9bcd135d389f3b40cdb78ef"
                            ),
                        },
                        {"event": "close", "connectionId": 1},
                    ]
                )
                + "\n",
                encoding="utf-8",
            )

            result = subprocess.run(
                [sys.executable, str(TOOL), "gameplay-trace-analyze", str(trace), "--out", str(out)],
                cwd=REPO_ROOT,
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                check=False,
            )

            self.assertEqual(result.returncode, 0, result.stderr)
            analysis = json.loads(out.read_text(encoding="utf-8"))
            self.assertEqual(analysis["summary"]["payloadPackets"], 3)
            self.assertEqual(analysis["summary"]["responsePackets"], 1)
            self.assertEqual(analysis["packets"][0]["direction"], "client-to-server")
            self.assertEqual(analysis["packets"][0]["frame"]["kind"], "observed-login-request")
            self.assertEqual(analysis["packets"][0]["frame"]["messageCodeHex"], "0x0034")
            self.assertEqual(analysis["packets"][1]["direction"], "server-to-client")
            self.assertEqual(analysis["packets"][1]["frame"]["messageCodeHex"], "0x0035")
            self.assertEqual(analysis["packets"][2]["frame"]["kind"], "observed-post-phase3-client-packet")
            self.assertEqual(analysis["packets"][2]["frame"]["messageCodeHex"], "0x0036")
            self.assertEqual(analysis["packets"][3]["frame"]["kind"], "observed-post-handshake-client-packet")
            self.assertEqual(analysis["packets"][3]["frame"]["messageCodeHex"], "0x0030")

    def test_reports_command_ok_response_probe_without_followup(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            temp_path = Path(temp)
            trace = temp_path / "command-ok-probe.jsonl"
            out = temp_path / "packet-analysis.json"
            command_ok_frame = f"04220031{'00' * 1056}"
            trace.write_text(
                "\n".join(
                    json.dumps(item)
                    for item in [
                        {"event": "connection", "connectionId": 1, "remoteAddress": "127.0.0.1"},
                        {
                            "event": "payload",
                            "connectionId": 1,
                            "byteLength": 52,
                            "hex": (
                                "00320030590ca783b7cecfa3797058413770ac8d752dd02709b1ee545a3107fcabf0"
                                "a2d83d54a1fcb9bcd135d389f3b40cdb78ef"
                            ),
                        },
                        {
                            "event": "response",
                            "connectionId": 1,
                            "response": {
                                "kind": "configured-command-ok-candidate",
                                "byteLength": 1060,
                                "hex": command_ok_frame,
                            },
                        },
                        {"event": "close", "connectionId": 1},
                    ]
                )
                + "\n",
                encoding="utf-8",
            )

            result = subprocess.run(
                [sys.executable, str(TOOL), "gameplay-trace-analyze", str(trace), "--out", str(out)],
                cwd=REPO_ROOT,
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                check=False,
            )

            self.assertEqual(result.returncode, 0, result.stderr)
            analysis = json.loads(out.read_text(encoding="utf-8"))
            self.assertEqual(analysis["summary"]["commandOkResponseCandidates"], 1)
            self.assertEqual(analysis["summary"]["postCommandOkClientPackets"], 0)
            self.assertEqual(analysis["probeFindings"]["commandOkCandidateRuntimeProbe"], "no client packet after command OK candidate")
            self.assertEqual(analysis["packets"][1]["frame"]["kind"], "command-ok-response-candidate")
            self.assertEqual(analysis["packets"][1]["frame"]["messageCodeHex"], "0x0031")
            self.assertEqual(analysis["packets"][1]["frame"]["decodedBodyBytes"], 1052)

    def test_reports_session_bootstrap_probe_without_followup(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            temp_path = Path(temp)
            trace = temp_path / "session-bootstrap-probe.jsonl"
            out = temp_path / "packet-analysis.json"
            trace.write_text(
                "\n".join(
                    json.dumps(item)
                    for item in [
                        {"event": "connection", "connectionId": 1, "remoteAddress": "127.0.0.1"},
                        {
                            "event": "payload",
                            "connectionId": 1,
                            "byteLength": 52,
                            "hex": (
                                "00320030590ca783b7cecfa3797058413770ac8d752dd02709b1ee545a3107fcabf0"
                                "a2d83d54a1fcb9bcd135d389f3b40cdb78ef"
                            ),
                        },
                        {
                            "event": "response",
                            "response": {
                                "kind": "dynamic-session-bootstrap-candidate",
                                "byteLength": 12,
                                "hex": "000a00016abdf6ddf8000105",
                            },
                        },
                        {
                            "event": "response",
                            "connectionId": 1,
                            "response": {
                                "kind": "dynamic-session-bootstrap-candidate",
                                "byteLength": 12,
                                "hex": "000a00036abdf6ddf8000105",
                            },
                        },
                        {"event": "close", "connectionId": 1},
                    ]
                )
                + "\n",
                encoding="utf-8",
            )

            result = subprocess.run(
                [sys.executable, str(TOOL), "gameplay-trace-analyze", str(trace), "--out", str(out)],
                cwd=REPO_ROOT,
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                check=False,
            )

            self.assertEqual(result.returncode, 0, result.stderr)
            analysis = json.loads(out.read_text(encoding="utf-8"))
            self.assertEqual(analysis["summary"]["sessionBootstrapResponseCandidates"], 2)
            self.assertEqual(analysis["summary"]["postSessionBootstrapClientPackets"], 0)
            self.assertEqual(
                analysis["probeFindings"]["sessionBootstrapCandidateRuntimeProbe"],
                "no client packet after session bootstrap candidate",
            )
            self.assertEqual(analysis["packets"][1]["connectionId"], 0)
            self.assertEqual(analysis["packets"][1]["frame"]["kind"], "session-bootstrap-response-candidate")
            self.assertEqual(analysis["packets"][1]["frame"]["messageName"], "SSLoginOK")
            self.assertEqual(analysis["packets"][1]["frame"]["handlerInternalHex"], "0x0200")
            self.assertEqual(analysis["packets"][2]["frame"]["messageName"], "SSGameLoginOK")
            self.assertEqual(analysis["packets"][2]["frame"]["handlerInternalHex"], "0x0205")


if __name__ == "__main__":
    unittest.main()
