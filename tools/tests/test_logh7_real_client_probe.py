import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from tools.logh7_process_memory import find_ring_follow_address
from tools.logh7_real_client_world_init_probe import build_world_init_probe_server_command
from tools.logh7_real_client_probe import _wait_for_trace, build_dynamic_probe_manifest, summarize_probe_analysis
from tools.logh7_window_login import login


class Logh7RealClientProbeTests(unittest.TestCase):
    def test_login_continues_when_foreground_activation_is_denied(self) -> None:
        class FakeWin32Gui:
            def __init__(self) -> None:
                self.messages: list[tuple[int, int, int, int]] = []

            def SetForegroundWindow(self, _hwnd: int) -> None:
                raise OSError("foreground denied")

            def GetWindowRect(self, _hwnd: int) -> tuple[int, int, int, int]:
                return (10, 20, 660, 553)

            def PostMessage(self, hwnd: int, message: int, value: int, extra: int) -> None:
                self.messages.append((hwnd, message, value, extra))

        class FakeWin32Api:
            def __init__(self) -> None:
                self.cursor_positions: list[tuple[int, int]] = []
                self.mouse_events: list[int] = []

            def SetCursorPos(self, position: tuple[int, int]) -> None:
                self.cursor_positions.append(position)

            def mouse_event(self, event: int, _x: int, _y: int, _data: int, _extra: int) -> None:
                self.mouse_events.append(event)

        class FakeWin32Con:
            MOUSEEVENTF_LEFTDOWN = 2
            MOUSEEVENTF_LEFTUP = 4
            WM_CHAR = 258

        fake_api = FakeWin32Api()
        fake_gui = FakeWin32Gui()

        login(fake_api, FakeWin32Con, fake_gui, 1234)

        typed_text = "".join(chr(value) for _hwnd, message, value, _extra in fake_gui.messages if message == 258)
        self.assertEqual(typed_text, "ginei00dummy")
        self.assertEqual(len(fake_api.cursor_positions), 3)

    def test_builds_dynamic_probe_manifest(self) -> None:
        manifest = build_dynamic_probe_manifest(
            client_exe=Path("E:/game/exe/G7MTClient.exe"),
            port=47900,
            evidence="g025-real-client-dynamic-probe.json",
        )

        gameplay = manifest["server"]["gameplay"]
        self.assertEqual(gameplay["PORT"], 47900)
        self.assertEqual(gameplay["dynamicProbe"]["commandOkResponseCode"], 49)
        self.assertEqual(
            gameplay["dynamicProbe"]["transportKeyHex"],
            "7b41344331333734382d303135392d346335342d414542332d3144363835373537363142337d",
        )
        self.assertEqual(gameplay["dynamicProbe"]["decipherKeyHex"], "5859")
        self.assertEqual(gameplay["dynamicProbe"]["evidence"], "g025-real-client-dynamic-probe.json")

    def test_builds_dynamic_probe_manifest_for_selected_command_ok_code(self) -> None:
        manifest = build_dynamic_probe_manifest(
            client_exe=Path("E:/game/exe/G7MTClient.exe"),
            port=47900,
            evidence="g026-real-client-dynamic-probe-0032.json",
            command_ok_response_code=0x0032,
            command_ok_entity_key=0x12345678,
        )

        gameplay = manifest["server"]["gameplay"]
        self.assertEqual(gameplay["dynamicProbe"]["commandOkResponseCode"], 50)
        self.assertEqual(gameplay["dynamicProbe"]["commandOkEntityKey"], 0x12345678)
        self.assertEqual(gameplay["dynamicProbe"]["evidence"], "g026-real-client-dynamic-probe-0032.json")

    def test_cli_script_runs_as_direct_file(self) -> None:
        result = subprocess.run(
            [sys.executable, "tools/logh7_real_client_probe_cli.py", "--help"],
            check=False,
            capture_output=True,
            text=True,
        )

        self.assertEqual(result.returncode, 0)
        self.assertIn("--command-ok-response-code", result.stdout)
        self.assertIn("--command-ok-entity-key", result.stdout)

    def test_wait_for_trace_raises_when_command_ok_never_arrives(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            trace_path = Path(temp) / "trace.jsonl"

            with self.assertRaises(TimeoutError):
                _wait_for_trace(trace_path, 0)

    def test_summarizes_dynamic_probe_analysis(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            analysis_path = Path(temp) / "analysis.json"
            analysis_path.write_text(
                json.dumps(
                    {
                        "summary": {
                            "payloadPackets": 3,
                            "responsePackets": 2,
                            "commandOkResponseCandidates": 1,
                            "postCommandOkClientPackets": 0,
                        },
                        "probeFindings": {
                            "commandOkCandidateRuntimeProbe": "no client packet after command OK candidate",
                        },
                    }
                ),
                encoding="utf-8",
            )

            summary = summarize_probe_analysis(analysis_path)

        self.assertEqual(summary["payloadPackets"], 3)
        self.assertEqual(summary["commandOkResponseCandidates"], 1)
        self.assertEqual(summary["postCommandOkClientPackets"], 0)
        self.assertEqual(summary["commandOkFinding"], "no client packet after command OK candidate")

    def test_world_init_probe_command_selects_bootstrap_timing(self) -> None:
        command = build_world_init_probe_server_command(
            port=47900,
            trace_out=Path("E:/trace.jsonl"),
            client_exe=Path("E:/game/exe/G7MTClient.exe"),
            bootstrap_timing="after-0030",
            bootstrap_encoding="raw",
            bootstrap_body_hex="01000000",
        )

        self.assertIn("--bootstrap-timing", command)
        self.assertEqual(command[command.index("--bootstrap-timing") + 1], "after-0030")
        self.assertEqual(command[command.index("--bootstrap-encoding") + 1], "raw")
        self.assertEqual(command[command.index("--bootstrap-body-hex") + 1], "01000000")

    def test_finds_follow_address_from_ring_record(self) -> None:
        ring = bytearray(8 + 64 * 4)
        ring[0:4] = (1).to_bytes(4, "little")
        record = 8
        ring[record : record + 4] = b"SRP1"
        ring[record + 4] = 2
        ring[record + 5] = 2
        ring[record + 16 : record + 20] = (0x05313CE0).to_bytes(4, "little")

        address = find_ring_follow_address(bytes(ring), record_bytes=64, address_offset=16)

        self.assertEqual(address, 0x05313CE0)


if __name__ == "__main__":
    unittest.main()
