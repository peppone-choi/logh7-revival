import unittest

from tools.logh7_frida_send_grid_chat import (
    MAX_CHAT_CHARS,
    build_script_source,
    utf16_code_units,
)


class Logh7FridaSendGridChatTests(unittest.TestCase):
    def test_utf16_code_units_counts_korean_as_one_unit_each(self) -> None:
        self.assertEqual(utf16_code_units("안녕"), 2)

    def test_utf16_code_units_counts_non_bmp_as_two_units(self) -> None:
        self.assertEqual(utf16_code_units("\U0001F600"), 2)

    def test_build_script_accepts_exact_client_limit(self) -> None:
        script = build_script_source("x" * MAX_CHAT_CHARS)
        self.assertIn("if (unitLen > 65)", script)
        self.assertIn('"xxxxxxxx', script)

    def test_build_script_rejects_over_client_limit(self) -> None:
        with self.assertRaisesRegex(ValueError, "client caps"):
            build_script_source("x" * (MAX_CHAT_CHARS + 1))

    def test_build_script_escapes_message_for_javascript(self) -> None:
        script = build_script_source('한글 "quote" \\ slash')
        self.assertIn('"한글 \\"quote\\" \\\\ slash"', script)


if __name__ == "__main__":
    unittest.main()
