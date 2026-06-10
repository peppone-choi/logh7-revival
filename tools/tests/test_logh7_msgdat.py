import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
TOOL = REPO_ROOT / "tools" / "logh7_pipeline.py"


class Logh7MsgDatTests(unittest.TestCase):
    def test_indexes_real_msgdat_magic_tokens_and_cp932_candidates(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            temp_path = Path(temp)
            source = temp_path / "MsgDat"
            out = temp_path / "msgdat-index.json"
            source.mkdir()
            (source / "messages_0.dat").write_bytes(
                b"HFWR\x00\x00\x00\x00$r10$$xcommand$\x93\xfa\x8e\x9e\x81\x45$xdate$"
            )
            (source / "g7sw.dat").write_bytes(b"GFWR\x00K0_0\x00M0a0L0D0")

            result = subprocess.run(
                [sys.executable, str(TOOL), "msgdat-index", str(source), "--out", str(out)],
                cwd=REPO_ROOT,
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                check=False,
            )

            self.assertEqual(result.returncode, 0, result.stderr)
            index = json.loads(out.read_text(encoding="utf-8"))
            by_path = {item["path"]: item for item in index["files"]}
            self.assertEqual(by_path["messages_0.dat"]["magic"], "HFWR")
            self.assertEqual(by_path["g7sw.dat"]["magic"], "GFWR")
            self.assertIn("$xcommand$", {token["value"] for token in by_path["messages_0.dat"]["tokens"]})
            self.assertIn(
                "\u65e5\u6642\u30fb",
                {candidate["text"] for candidate in by_path["messages_0.dat"]["textCandidates"]},
            )
            candidate = next(
                item
                for item in by_path["messages_0.dat"]["textCandidates"]
                if item["text"] == "\u65e5\u6642\u30fb"
            )
            raw = (source / "messages_0.dat").read_bytes()
            encoded = candidate["text"].encode("cp932")
            self.assertEqual(raw[candidate["offset"] : candidate["offset"] + len(encoded)], encoded)
            self.assertEqual(by_path["g7sw.dat"]["textCandidates"], [])

    def test_rejects_malformed_msgdat_magic(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            temp_path = Path(temp)
            source = temp_path / "MsgDat"
            out = temp_path / "msgdat-index.json"
            source.mkdir()
            (source / "broken.dat").write_bytes(b"NOPE\x00$xcommand$")

            result = subprocess.run(
                [sys.executable, str(TOOL), "msgdat-index", str(source), "--out", str(out)],
                cwd=REPO_ROOT,
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                check=False,
            )

            self.assertNotEqual(result.returncode, 0)
            self.assertIn("unsupported MsgDat magic", result.stderr)
            self.assertFalse(out.exists())


if __name__ == "__main__":
    unittest.main()
