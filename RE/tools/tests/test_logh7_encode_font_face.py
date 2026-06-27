import subprocess
import sys
import unittest

from tools.logh7_encode_font_face import SLOT_LEN, build_descriptor, encode_face
from tools.tests.test_logh7_pipeline import REPO_ROOT


class Logh7EncodeFontFaceTests(unittest.TestCase):
    def test_pretendard_is_default_descriptor_face_when_generated(self) -> None:
        descriptor, _notes = build_descriptor("Pretendard")
        patch = descriptor["patches"][0]

        self.assertEqual(patch["patchedHex"], "50726574656e64617264000000000000")
        self.assertIn("font-cleartype", descriptor["desc"])
        self.assertNotIn("no charset/quality patch is required", descriptor["desc"])

    def test_encode_face_keeps_pretendard_inside_fixed_slot(self) -> None:
        encoded = encode_face("Pretendard")

        self.assertEqual(len(encoded), SLOT_LEN)
        self.assertEqual(encoded, b"Pretendard\x00\x00\x00\x00\x00\x00")

    def test_script_selftest_accepts_already_patched_reference_tree(self) -> None:
        result = subprocess.run(
            [sys.executable, "-m", "tools.logh7_encode_font_face", "--selftest"],
            cwd=REPO_ROOT,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=False,
        )

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn('"selftest": "PASS"', result.stdout)


if __name__ == "__main__":
    unittest.main()
