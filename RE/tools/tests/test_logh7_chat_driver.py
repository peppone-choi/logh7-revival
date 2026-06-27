import unittest

from tools.logh7_chat_driver import (
    MAX_CHAT_CHARS,
    VK_RETURN,
    VK_TAB,
    KeyEvent,
    plan_chat_key_events,
)


class Logh7ChatDriverTests(unittest.TestCase):
    def test_plan_opens_with_tab_and_closes_with_enter(self) -> None:
        events = plan_chat_key_events("hi")
        self.assertEqual(events[0], KeyEvent("vk", VK_TAB, False))
        self.assertEqual(events[1], KeyEvent("vk", VK_TAB, True))
        self.assertEqual(events[-2], KeyEvent("vk", VK_RETURN, False))
        self.assertEqual(events[-1], KeyEvent("vk", VK_RETURN, True))

    def test_plan_types_each_char_down_and_up_as_unicode(self) -> None:
        events = plan_chat_key_events("AB")
        # TAB down/up (2) + 2 chars * 2 (4) + RETURN down/up (2) = 8 events.
        self.assertEqual(len(events), 8)
        char_events = events[2:-2]
        self.assertEqual(
            char_events,
            [
                KeyEvent("unicode", ord("A"), False),
                KeyEvent("unicode", ord("A"), True),
                KeyEvent("unicode", ord("B"), False),
                KeyEvent("unicode", ord("B"), True),
            ],
        )

    def test_plan_uses_utf16_code_units_for_multibyte_text(self) -> None:
        # Korean "안" is one BMP code unit; "녕" likewise. Two chars -> two unicode down/up pairs.
        events = plan_chat_key_events("안녕")
        char_events = events[2:-2]
        self.assertEqual(len(char_events), 4)
        self.assertEqual(char_events[0], KeyEvent("unicode", ord("안"), False))
        self.assertEqual(char_events[2], KeyEvent("unicode", ord("녕"), False))

    def test_plan_rejects_overlong_message(self) -> None:
        with self.assertRaises(ValueError):
            plan_chat_key_events("x" * (MAX_CHAT_CHARS + 1))

    def test_plan_accepts_message_at_exact_cap(self) -> None:
        events = plan_chat_key_events("x" * MAX_CHAT_CHARS)
        # 2 (TAB) + cap*2 + 2 (RETURN)
        self.assertEqual(len(events), 2 + MAX_CHAT_CHARS * 2 + 2)

    def test_non_bmp_char_counts_as_two_units_toward_cap(self) -> None:
        # An emoji (non-BMP) is a surrogate pair = 2 UTF-16 units. 33 emoji = 66 units > 65 cap.
        with self.assertRaises(ValueError):
            plan_chat_key_events("\U0001F600" * 33)


if __name__ == "__main__":
    unittest.main()
