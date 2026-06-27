import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from tools.logh7_child_codec import child_codec_decode, child_codec_key_schedule, extract_child_codec_static_tables
from tools.logh7_command_ok_response_candidates import build_command_ok_response_candidates

from tools.tests.test_logh7_pipeline import REPO_ROOT, TOOL


CLIENT_EXE = REPO_ROOT / ".omo" / "work" / "logh7-installed" / "exe" / "G7MTClient.exe"
PHASE1_KEY_HEX = "32f512783e74ec29b4c045adba3497e8"


class Logh7CommandOkResponseCandidateTests(unittest.TestCase):
    def test_builds_zero_count_encrypted_candidate_frames(self) -> None:
        index = build_command_ok_response_candidates(CLIENT_EXE, bytes.fromhex(PHASE1_KEY_HEX))

        self.assertEqual(index["trigger"], "decoded client 0x0030 login/session-like body")
        self.assertEqual(index["candidateStatus"], "constructed from proven decoded layouts; runtime probe required")
        self.assertEqual(index["requestTransportHex"], "0x0030")
        self.assertEqual([entry["transportHex"] for entry in index["entries"]], ["0x0031", "0x0032", "0x0033"])

        tables = extract_child_codec_static_tables(CLIENT_EXE)
        scheduled = child_codec_key_schedule(tables, bytes.fromhex(PHASE1_KEY_HEX))
        expected_lengths = {"0x0031": 1052, "0x0032": 276, "0x0033": 1052}
        expected_declared_lengths = {"0x0031": 1058, "0x0032": 282, "0x0033": 1058}
        for entry in index["entries"]:
            frame = bytes.fromhex(entry["frameHex"])
            self.assertEqual(int.from_bytes(frame[:2], "big"), expected_declared_lengths[entry["transportHex"]])
            self.assertEqual(f"0x{int.from_bytes(frame[2:4], 'big'):04x}", entry["transportHex"])
            decoded = child_codec_decode(scheduled, frame[4:])[: expected_lengths[entry["transportHex"]]]
            self.assertEqual(decoded, bytes(expected_lengths[entry["transportHex"]]))
            self.assertEqual(entry["decodedBodyHex"], bytes(expected_lengths[entry["transportHex"]]).hex())

    def test_builds_one_entry_probe_frames_with_entity_key(self) -> None:
        index = build_command_ok_response_candidates(CLIENT_EXE, bytes.fromhex(PHASE1_KEY_HEX), entity_key=0x12345678)

        self.assertEqual(index["candidateStatus"], "constructed one-entry command OK probe; runtime probe required")
        tables = extract_child_codec_static_tables(CLIENT_EXE)
        scheduled = child_codec_key_schedule(tables, bytes.fromhex(PHASE1_KEY_HEX))
        for entry in index["entries"]:
            frame = bytes.fromhex(entry["frameHex"])
            decoded = child_codec_decode(scheduled, frame[4:])[: entry["decodedBodyBytes"]]
            self.assertEqual(decoded[0x0C], 1)
            self.assertEqual(int.from_bytes(decoded[0x10:0x14], "little"), 0x12345678)
            self.assertEqual(entry["decodedBodyProfile"]["primaryEntryCount"], 1)
            self.assertEqual(entry["decodedBodyProfile"]["entityLookupKeyHex"], "0x12345678")

    def test_pipeline_cli_writes_response_candidates(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            out = Path(temp) / "command-ok-response-candidates.json"

            result = subprocess.run(
                [
                    sys.executable,
                    str(TOOL),
                    "command-ok-response-candidates",
                    str(CLIENT_EXE),
                    "--phase1-key-hex",
                    PHASE1_KEY_HEX,
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
            self.assertEqual(index["entries"][1]["transportHex"], "0x0032")
            self.assertEqual(index["entries"][1]["decodedBodyBytes"], 276)

    def test_pipeline_cli_writes_one_entry_response_candidates(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            out = Path(temp) / "command-ok-response-candidates.json"

            result = subprocess.run(
                [
                    sys.executable,
                    str(TOOL),
                    "command-ok-response-candidates",
                    str(CLIENT_EXE),
                    "--phase1-key-hex",
                    PHASE1_KEY_HEX,
                    "--entity-key-hex",
                    "0x12345678",
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
            self.assertEqual(index["entries"][0]["decodedBodyProfile"]["entityLookupKeyHex"], "0x12345678")


if __name__ == "__main__":
    unittest.main()
