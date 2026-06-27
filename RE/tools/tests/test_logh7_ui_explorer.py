from __future__ import annotations

import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from tools.tests.test_logh7_pipeline import REPO_ROOT
from tools.logh7_ui_flow import LoginSpec, run_login_flow
from tools.logh7_ui_explorer import (
    COMMANDLINE_BOOTSTRAP_PORT,
    FORBIDDEN_DEFAULT_LOGH_FLAGS,
    _effective_logh_env_receipt,
    _patch_dgvoodoo_display_mode,
    _register_pretendard_fonts,
    _resolve_server_root,
    _strip_one_trailing_newline,
    _text_action_report,
    _validate_commandline_bootstrap_port,
)
from tools.logh7_window_login import _type_text, _type_text_with_key_events


class RecordingDriver:
    def __init__(self) -> None:
        self.actions: list[tuple[str, str | int, int | None]] = []

    def click(self, x: int, y: int, *, label: str, settle: float) -> dict[str, str | int | float]:
        self.actions.append(("click", x, y))
        return {"label": label, "x": x, "y": y, "settle": settle}

    def text(self, value: str, *, label: str, settle: float) -> dict[str, str | float]:
        self.actions.append(("text", value, None))
        return {"label": label, "value": value, "settle": settle}


class Logh7UiExplorerTests(unittest.TestCase):
    def test_early_strategic_grid_is_not_forbidden_with_playable_ringclear(self) -> None:
        self.assertNotIn("LOGH_STRAT_GRID_EARLY", FORBIDDEN_DEFAULT_LOGH_FLAGS)

    def test_parameterized_login_uses_supplied_account_and_password(self) -> None:
        # Given: a login flow with non-default account credentials.
        driver = RecordingDriver()
        spec = LoginSpec(account="p001flow", password="FlowPw17")

        # When: the login automation is generated.
        result = run_login_flow(driver, spec, settle=0.0)

        typed_values = [value for action, value, _y in driver.actions if action == "text"]
        self.assertEqual(typed_values, ["p001flow", "FlowPw17"])
        self.assertNotIn("ginei00", typed_values)
        self.assertNotIn("dummy", typed_values)
        summary = result.to_json()
        self.assertEqual(summary["account"], "p001flow")
        self.assertEqual(summary["steps"], 5)

    def test_type_text_uses_key_events_for_full_ascii_text(self) -> None:
        class FakeWin32Con:
            KEYEVENTF_KEYUP = 2
            VK_SHIFT = 16

        class FakeWin32Api:
            def __init__(self) -> None:
                self.events: list[tuple[int, int]] = []

            def VkKeyScan(self, char: str) -> int:
                vk = ord(char.upper())
                shift = 1 if char.isupper() else 0
                return vk | (shift << 8)

            def keybd_event(self, vk: int, _scan: int, flags: int, _extra: int) -> None:
                self.events.append((vk, flags))

        fake_api = FakeWin32Api()

        with patch("tools.logh7_window_login.time.sleep", return_value=None):
            used_key_events = _type_text_with_key_events(FakeWin32Con, "p001flow", win32api_module=fake_api)

        self.assertEqual(used_key_events, True)
        key_downs = [vk for vk, flags in fake_api.events if flags == 0 and vk != FakeWin32Con.VK_SHIFT]
        self.assertEqual("".join(chr(vk).lower() for vk in key_downs), "p001flow")
        self.assertEqual(key_downs[0], ord("P"))

    def test_type_text_falls_back_to_wm_char_when_key_events_are_unavailable(self) -> None:
        class FakeWin32Con:
            WM_CHAR = 258

        class FakeWin32Gui:
            def __init__(self) -> None:
                self.messages: list[tuple[int, int, int, int]] = []

            def PostMessage(self, hwnd: int, message: int, value: int, extra: int) -> None:
                self.messages.append((hwnd, message, value, extra))

        fake_gui = FakeWin32Gui()

        with (
            patch("tools.logh7_window_login._type_text_with_key_events", return_value=False),
            patch("tools.logh7_window_login.time.sleep", return_value=None),
        ):
            _type_text(FakeWin32Con, fake_gui, 1234, "p001flow")

        posted_values = [value for _hwnd, message, value, _extra in fake_gui.messages if message == FakeWin32Con.WM_CHAR]
        self.assertEqual("".join(chr(value) for value in posted_values), "p001flow")

    def test_type_text_repeats_first_character_for_live_client_focus_swallow(self) -> None:
        class FakeWin32Con:
            KEYEVENTF_KEYUP = 2
            VK_SHIFT = 16

        class FakeWin32Api:
            def __init__(self) -> None:
                self.events: list[tuple[int, int]] = []

            def VkKeyScan(self, char: str) -> int:
                return ord(char.upper())

            def keybd_event(self, vk: int, _scan: int, flags: int, _extra: int) -> None:
                self.events.append((vk, flags))

        class FakeWin32Gui:
            def PostMessage(self, _hwnd: int, _message: int, _value: int, _extra: int) -> None:
                raise AssertionError("key event path should be used")

        fake_api = FakeWin32Api()

        with patch("tools.logh7_window_login.time.sleep", return_value=None):
            _type_text(FakeWin32Con, FakeWin32Gui(), 1234, "p001flow", fake_api, compensate_first=True)

        key_downs = [vk for vk, flags in fake_api.events if flags == 0 and vk != FakeWin32Con.VK_SHIFT]
        self.assertEqual("".join(chr(vk).lower() for vk in key_downs), "pp001flow")

    def test_start_receipt_records_effective_logh_env_without_os_env_dump(self) -> None:
        receipt = _effective_logh_env_receipt(
            {
                "PATH": "not-for-evidence",
                "LOGH_ACCOUNT_DB": ".omo/work/p0-01-accounts.sqlite",
                "LOGH_WORLD_PLAYER": "1",
                "LOGH_RELAY": "1",
            }
        )

        self.assertEqual(
            receipt["effectiveLoghEnv"],
            {
                "LOGH_ACCOUNT_DB": ".omo/work/p0-01-accounts.sqlite",
                "LOGH_RELAY": "1",
                "LOGH_WORLD_PLAYER": "1",
            },
        )
        self.assertEqual(receipt["forbiddenDefaultLoghFlags"]["present"], {"LOGH_RELAY": "1"})
        self.assertIn("LOGH_NPC_AI", receipt["forbiddenDefaultLoghFlags"]["absent"])
        self.assertNotIn("PATH", receipt["effectiveLoghEnv"])

    def test_commandline_bootstrap_rejects_non_hardcoded_port(self) -> None:
        _validate_commandline_bootstrap_port(COMMANDLINE_BOOTSTRAP_PORT, client_driven_login=True)
        _validate_commandline_bootstrap_port(47912, client_driven_login=False)

        with self.assertRaisesRegex(SystemExit, str(COMMANDLINE_BOOTSTRAP_PORT)):
            _validate_commandline_bootstrap_port(47912, client_driven_login=True)

    def test_pretendard_registration_reports_missing_fonts_without_failing_start(self) -> None:
        with TemporaryDirectory() as raw_session:
            receipt = _register_pretendard_fonts(Path(raw_session), [Path(raw_session) / "missing-fonts"])

        self.assertEqual(receipt["attempted"], False)
        self.assertEqual(receipt["reason"], "fonts-not-found")

    def test_pretendard_registration_writes_addfontresource_receipt(self) -> None:
        with TemporaryDirectory() as raw_session:
            session = Path(raw_session)
            fonts = session / "fonts"
            fonts.mkdir()
            (fonts / "invalid.ttf").write_bytes(b"not-a-real-font")

            receipt = _register_pretendard_fonts(session, [fonts])

            self.assertEqual(receipt["attempted"], True)
            self.assertEqual(receipt["method"], "AddFontResourceExW")
            self.assertEqual(receipt["fontCount"], 1)
            log_path = Path(str(receipt["log"]))
            self.assertIn("method=AddFontResourceExW", log_path.read_text(encoding="utf-8"))

    def test_pretendard_registration_default_roots_include_installed_root_fonts(self) -> None:
        from tools.logh7_ui_explorer import CLIENT_DIR

        roots = [CLIENT_DIR.parent / "fonts", CLIENT_DIR.parents[1] / "fonts", REPO_ROOT / "client/fonts"]

        self.assertIn(REPO_ROOT / ".omo" / "work" / "logh7-installed" / "fonts", roots)

    def test_borderless_fullscreen_receipt_reports_no_menu_and_popup_style(self) -> None:
        from tools.logh7_ui_explorer import _force_borderless_fullscreen

        class FakeApi:
            def MonitorFromWindow(self, hwnd: int, flags: int) -> int:
                self.args = (hwnd, flags)
                return 7

            def GetMonitorInfo(self, monitor: int) -> dict[str, tuple[int, int, int, int]]:
                self.monitor = monitor
                return {"Monitor": (0, 0, 1920, 1080)}

        class FakeCon:
            GWL_STYLE = -16
            GWL_EXSTYLE = -20
            WS_POPUP = 0x80000000
            WS_VISIBLE = 0x10000000
            WS_EX_DLGMODALFRAME = 0x00000001
            WS_EX_TOOLWINDOW = 0x00000080
            WS_EX_WINDOWEDGE = 0x00000100
            WS_EX_CLIENTEDGE = 0x00000200
            WS_EX_STATICEDGE = 0x00020000
            WS_EX_APPWINDOW = 0x00040000
            HWND_TOP = 0
            SWP_FRAMECHANGED = 0x20
            SWP_SHOWWINDOW = 0x40

        class FakeGui:
            def __init__(self) -> None:
                self.style = 0x10CF0000
                self.ex_style = 0x00020381
                self.menu = 1
                self.window_rect = (12, 34, 812, 634)

            def GetWindowLong(self, hwnd: int, index: int) -> int:
                if index == FakeCon.GWL_EXSTYLE:
                    return self.ex_style
                return self.style

            def SetMenu(self, hwnd: int, menu: int) -> None:
                self.menu = menu

            def SetWindowLong(self, hwnd: int, index: int, style: int) -> None:
                if index == FakeCon.GWL_EXSTYLE:
                    self.ex_style = style
                    return
                self.style = style

            def SetWindowPos(self, hwnd: int, insert_after: int, x: int, y: int, width: int, height: int, flags: int) -> None:
                self.window_rect = (x, y, x + width, y + height)

            def GetMenu(self, hwnd: int) -> int:
                return self.menu

            def GetWindowRect(self, hwnd: int) -> tuple[int, int, int, int]:
                return self.window_rect

            def GetClientRect(self, hwnd: int) -> tuple[int, int, int, int]:
                return (0, 0, 1920, 1080)

        receipt = _force_borderless_fullscreen(FakeApi(), FakeCon(), FakeGui(), 123)

        self.assertEqual(receipt["newStyleHex"], "0x90000000")
        self.assertEqual(receipt["newExStyleHex"], "0x00040000")
        self.assertFalse(receipt["hasMenu"])
        self.assertEqual(receipt["windowRect"], [0, 0, 1920, 1080])

    def test_dgvoodoo_display_mode_switches_fullscreen_attributes(self) -> None:
        with TemporaryDirectory() as raw_dir:
            client_dir = Path(raw_dir)
            conf = client_dir / "dgVoodoo.conf"
            conf.write_text(
                "FullScreenMode                      = false\n"
                "ScalingMode                         = centered\n"
                "FullscreenAttributes                = fake\n",
                encoding="utf-8",
            )

            fullscreen = _patch_dgvoodoo_display_mode(client_dir, "fullscreen")
            text = conf.read_text(encoding="utf-8")

            self.assertTrue(fullscreen["attempted"])
            self.assertRegex(text, r"FullScreenMode\s+= true")
            self.assertRegex(text, r"FullscreenAttributes\s+= fullscreensize")
            self.assertRegex(text, r"WatermarkDisplayDuration\s+= 0")
            self.assertRegex(text, r"3DfxWatermark\s+= false")
            self.assertRegex(text, r"3DfxSplashScreen\s+= false")
            self.assertRegex(text, r"dgVoodooWatermark\s+= false")
            self.assertNotIn("FullscreenAttributes                = fake", text)

            borderless = _patch_dgvoodoo_display_mode(client_dir, "borderless")
            self.assertEqual(borderless["fullscreenAttributes"], "fake")
            self.assertRegex(conf.read_text(encoding="utf-8"), r"FullscreenAttributes\s+= fake")

    def test_server_root_must_contain_auth_server_entrypoint(self) -> None:
        with TemporaryDirectory() as raw_root:
            server_root = Path(raw_root)
            server_entry = server_root / "src/server/logh7-server.mjs"
            server_entry.parent.mkdir(parents=True)
            server_entry.write_text("// test server entry\n", encoding="utf-8")

            self.assertEqual(_resolve_server_root(server_root), server_root.resolve())

        with TemporaryDirectory() as raw_root:
            with self.assertRaises(SystemExit):
                _resolve_server_root(Path(raw_root))

    def test_password_text_action_redacts_raw_password(self) -> None:
        report = _text_action_report("login-password-text", "FlowPw17", "FlowPw17", compensate_first=False)

        self.assertEqual(report["type"], "text")
        self.assertEqual(report["redacted"], True)
        self.assertEqual(report["valueLength"], 8)
        self.assertEqual(report["sentKeyEventLength"], 8)
        self.assertNotIn("value", report)
        self.assertNotIn("sentKeyEvents", report)

    def test_password_stdin_strips_only_one_trailing_newline(self) -> None:
        self.assertEqual(_strip_one_trailing_newline("FlowPw17\n"), "FlowPw17")
        self.assertEqual(_strip_one_trailing_newline("FlowPw17\r\n"), "FlowPw17")
        self.assertEqual(_strip_one_trailing_newline("FlowPw17"), "FlowPw17")
        self.assertEqual(_strip_one_trailing_newline("FlowPw17\n\n"), "FlowPw17\n")


if __name__ == "__main__":
    unittest.main()
