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
            hfwr_records = [
                "$r10$$xcommand$日時・$xdate$",
                "パスワードが一致しません。",
            ]
            hfwr_payload = b"\x00".join(record.encode("cp932") for record in hfwr_records) + b"\x00"
            hfwr_table = b"\x00\x00\x00\x00" * 4
            (source / "messages_0.dat").write_bytes(
                b"HFWR"
                + b"\x00\x00\x00\x00"
                + len(hfwr_records).to_bytes(4, "little")
                + (1).to_bytes(4, "little")
                + hfwr_table
                + hfwr_payload
            )
            gfwr_words = ["気違い", "阿呆"]
            gfwr_payload = b"".join(
                len(word).to_bytes(4, "little") + word.encode("utf-16le") for word in gfwr_words
            )
            (source / "g7sw.dat").write_bytes(
                b"GFWR" + b"\x00\x00\x00\x00" + b"\x00\x00\x00\x00" + len(gfwr_words).to_bytes(4, "little") + gfwr_payload
            )

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
            self.assertEqual(by_path["messages_0.dat"]["layout"]["textPointerCount"], 2)
            self.assertEqual(by_path["messages_0.dat"]["layout"]["offsetTableCount"], 1)
            self.assertEqual(
                [(record["id"], record["text"]) for record in by_path["messages_0.dat"]["records"]],
                [(0, "$r10$$xcommand$日時・$xdate$"), (1, "パスワードが一致しません。")],
            )
            self.assertEqual(
                [(record["id"], record["text"]) for record in by_path["g7sw.dat"]["records"]],
                [(0, "気違い"), (1, "阿呆")],
            )
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
