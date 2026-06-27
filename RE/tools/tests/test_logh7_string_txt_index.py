import tempfile
import unittest
from pathlib import Path

from tools.logh7_string_txt_index import StringIndexError, build_index_document


class Logh7StringTxtIndexTests(unittest.TestCase):
    def test_detects_cp949_runtime_fragment_and_cp932_original_reference(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            runtime = root / "String.txt"
            backup = root / "String.txt.original"
            original_ref = root / "String.txt.jpbak"
            runtime_bytes = "吸出し start\r\n\r\n타이틀\r\n로그인에 실패했습니다.\r\n".encode("cp949")
            original_bytes = "吸出し start\r\n\r\nタイトル\r\nログインに失敗しました。\r\n".encode("cp932")
            runtime.write_bytes(runtime_bytes)
            backup.write_bytes(runtime_bytes)
            original_ref.write_bytes(original_bytes)

            doc, names = build_index_document(runtime, backup, original_ref)

        self.assertEqual(doc["_encoding"], "cp949")
        self.assertEqual(doc["_runtimeStringKind"], "localized-runtime-fragment")
        self.assertEqual(doc["_diff_vs_backup"]["byte_identical"], True)
        self.assertEqual(doc["_original_reference"]["encoding"], "cp932")
        self.assertEqual(doc["_counts"]["records"], 4)
        self.assertEqual(doc["strings"][2]["text"], "타이틀")
        self.assertEqual(doc["strings"][3]["category"], "message_template")
        self.assertEqual(names["count"], 0)

    def test_rejects_known_bad_assignment_string_artifact(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            runtime = root / "String.txt"
            backup = root / "String.txt.original"
            bad = "吸出し start\r\n당신은통일황제에 임명되어, 기함으로 다음 함선을 배치받았습니다.\r\n"
            runtime.write_bytes(bad.encode("cp949"))
            backup.write_bytes(bad.encode("cp949"))

            with self.assertRaisesRegex(StringIndexError, "contaminated assignment text"):
                build_index_document(runtime, backup, None)


if __name__ == "__main__":
    unittest.main()
