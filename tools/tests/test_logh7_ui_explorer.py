from __future__ import annotations

import argparse
import io
import json
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import MagicMock, patch

from tools.logh7_ui_explorer import (
    VK_NAMES,
    _VK_BACK,
    _WARMUP_DUMMY_CHAR,
    _build_type_sequence,
    _load_session,
    _process_alive,
    _save_session,
    _taskkill_pid,
    build_parser,
    cmd_click,
    cmd_key,
    cmd_shot,
    cmd_start,
    cmd_stop,
    main,
)


class UiExplorerTests(unittest.TestCase):
    def test_save_and_load_session_roundtrip(self) -> None:
        with TemporaryDirectory() as raw_dir:
            session = Path(raw_dir)
            state = {"clientPid": 4242, "hwnd": 1234}
            _save_session(session, state)
            self.assertEqual(_load_session(session), state)

    def test_taskkill_pid_skips_dead_process(self) -> None:
        with patch("tools.logh7_ui_explorer._process_alive", return_value=False), patch(
            "tools.logh7_ui_explorer.subprocess.run"
        ) as run_mock:
            self.assertFalse(_taskkill_pid(4242))
        run_mock.assert_not_called()

    def test_process_alive_uses_tasklist_on_windows(self) -> None:
        completed = MagicMock(returncode=0, stdout='"g7mtclient.exe","4242","Console","1","12,000 K"\n')
        with patch("tools.logh7_ui_explorer.sys.platform", "win32"), patch(
            "tools.logh7_ui_explorer.subprocess.run", return_value=completed
        ):
            self.assertTrue(_process_alive(4242))

    def test_start_launches_client_and_saves_session(self) -> None:
        with TemporaryDirectory() as raw_dir:
            root = Path(raw_dir)
            exe = root / "g7mtclient.exe"
            exe.write_bytes(b"stub")
            args = argparse.Namespace(
                session=root / "session",
                exe=exe,
                label="initial",
                settle=0.0,
                window_timeout=1.0,
                title_substring=None,
            )
            fake_process = MagicMock(pid=42796)
            with patch("tools.logh7_ui_explorer._require_windows"), patch(
                "tools.logh7_ui_explorer.subprocess.Popen", return_value=fake_process
            ), patch("tools.logh7_ui_explorer._wait_for_window", return_value=81234), patch(
                "tools.logh7_ui_explorer._observe", return_value={"label": "initial"}
            ), patch("sys.stdout", new=io.StringIO()) as stdout:
                self.assertEqual(cmd_start(args), 0)
            payload = json.loads(stdout.getvalue())
            self.assertEqual(payload["started"]["clientPid"], 42796)
            saved = _load_session(args.session)
            self.assertEqual(saved["hwnd"], 81234)
            self.assertEqual(saved["clientSelection"]["mode"], "explicit")
            self.assertEqual(saved["clientSelection"]["path"], str(exe.resolve()))

    def test_start_uses_default_strategy_ui_overlay_when_exe_is_omitted(self) -> None:
        with TemporaryDirectory() as raw_dir:
            root = Path(raw_dir)
            overlay = root / "exe-strategy-ui" / "G7MTClient.exe"
            overlay.parent.mkdir(parents=True)
            overlay.write_bytes(b"patched")
            args = argparse.Namespace(
                session=root / "session",
                exe=None,
                label="initial",
                settle=0.0,
                window_timeout=1.0,
                title_substring=None,
            )
            receipt = {
                "path": str(overlay),
                "sha256": "d1ef22",
                "mode": "reused",
                "manifestId": "logh7-strategy-ui-label-patch",
            }
            fake_process = MagicMock(pid=42796)
            with patch("tools.logh7_ui_explorer._require_windows"), patch(
                "tools.logh7_ui_explorer._prepare_default_client", return_value=(overlay, receipt)
            ) as prepare, patch(
                "tools.logh7_ui_explorer.subprocess.Popen", return_value=fake_process
            ) as popen, patch(
                "tools.logh7_ui_explorer._wait_for_window", return_value=81234
            ), patch(
                "tools.logh7_ui_explorer._observe", return_value={"label": "initial"}
            ), patch("sys.stdout", new=io.StringIO()):
                self.assertEqual(cmd_start(args), 0)

            prepare.assert_called_once_with()
            self.assertEqual(popen.call_args.args[0], [str(overlay.resolve())])
            saved = _load_session(args.session)
            self.assertEqual(saved["exe"], str(overlay.resolve()))
            self.assertEqual(saved["clientSelection"], receipt)

    def test_shot_uses_saved_session(self) -> None:
        with TemporaryDirectory() as raw_dir:
            session = Path(raw_dir)
            _save_session(session, {"clientPid": 1, "hwnd": 2})
            args = argparse.Namespace(session=session, label="login", settle=0.0)
            with patch(
                "tools.logh7_ui_explorer._observe",
                return_value={"label": "login", "screenshotPath": "shot.png"},
            ), patch("sys.stdout", new=io.StringIO()) as stdout:
                self.assertEqual(cmd_shot(args), 0)
            payload = json.loads(stdout.getvalue())
            self.assertEqual(payload["label"], "login")

    def test_key_named_key_path_records_action(self) -> None:
        with TemporaryDirectory() as raw_dir:
            session = Path(raw_dir)
            _save_session(session, {"clientPid": 1, "hwnd": 2})
            args = argparse.Namespace(
                session=session,
                key_name="ENTER",
                text=None,
                label=None,
                settle=0.0,
            )
            with patch("tools.logh7_ui_explorer._resolve_hwnd", return_value=2), patch(
                "tools.logh7_ui_explorer._send_named_key",
                return_value={"mode": "virtual-key", "key": "ENTER", "vk": VK_NAMES["ENTER"]},
            ), patch(
                "tools.logh7_ui_explorer._observe", return_value={"label": "key-enter"}
            ), patch("sys.stdout", new=io.StringIO()) as stdout:
                self.assertEqual(cmd_key(args), 0)
            payload = json.loads(stdout.getvalue())
            self.assertEqual(payload["action"]["key"], "ENTER")

    def test_key_text_path_records_action(self) -> None:
        with TemporaryDirectory() as raw_dir:
            session = Path(raw_dir)
            _save_session(session, {"clientPid": 1, "hwnd": 2})
            args = argparse.Namespace(
                session=session,
                key_name=None,
                text="abc",
                label=None,
                settle=0.0,
            )
            with patch("tools.logh7_ui_explorer._resolve_hwnd", return_value=2), patch(
                "tools.logh7_ui_explorer._send_text",
                return_value={"mode": "text", "text": "abc", "count": 3},
            ), patch(
                "tools.logh7_ui_explorer._observe", return_value={"label": "text-abc"}
            ), patch("sys.stdout", new=io.StringIO()) as stdout:
                self.assertEqual(cmd_key(args), 0)
            payload = json.loads(stdout.getvalue())
            self.assertEqual(payload["action"]["text"], "abc")

    def test_stop_kills_recorded_pid(self) -> None:
        with TemporaryDirectory() as raw_dir:
            session = Path(raw_dir)
            _save_session(session, {"clientPid": 4242, "hwnd": 2})
            args = argparse.Namespace(session=session)
            with patch("tools.logh7_ui_explorer._process_alive", return_value=True), patch(
                "tools.logh7_ui_explorer._taskkill_pid", return_value=True
            ), patch(
                "sys.stdout", new=io.StringIO()
            ) as stdout:
                self.assertEqual(cmd_stop(args), 0)
            payload = json.loads(stdout.getvalue())
            self.assertTrue(payload["clientStopped"])

    def test_stop_reports_success_when_client_already_gone(self) -> None:
        with TemporaryDirectory() as raw_dir:
            session = Path(raw_dir)
            _save_session(session, {"clientPid": 4242, "hwnd": 2})
            args = argparse.Namespace(session=session)
            with patch("tools.logh7_ui_explorer._process_alive", return_value=False), patch(
                "tools.logh7_ui_explorer._taskkill_pid"
            ) as kill_mock, patch("sys.stdout", new=io.StringIO()) as stdout:
                self.assertEqual(cmd_stop(args), 0)
            payload = json.loads(stdout.getvalue())
            self.assertTrue(payload["clientStopped"])
            kill_mock.assert_not_called()

    def test_build_parser_requires_subcommand(self) -> None:
        parser = build_parser()
        with patch("sys.stderr", new=io.StringIO()):
            with self.assertRaises(SystemExit):
                parser.parse_args([])

    def test_click_command_records_window_relative_coordinates(self) -> None:
        with TemporaryDirectory() as raw_dir:
            session = Path(raw_dir)
            _save_session(session, {"clientPid": 4242, "hwnd": 9})
            args = argparse.Namespace(session=session, x=321, y=390, label="login-click", settle=0)
            with patch("tools.logh7_ui_explorer._resolve_hwnd", return_value=9), patch(
                "tools.logh7_ui_explorer._click_window",
                return_value={"mode": "click", "x": 321, "y": 390},
            ), patch(
                "tools.logh7_ui_explorer._observe",
                return_value={"label": "login-click"},
            ), patch("sys.stdout", new=io.StringIO()) as stdout:
                self.assertEqual(cmd_click(args), 0)
            payload = json.loads(stdout.getvalue())
            self.assertEqual(payload["action"], {"mode": "click", "x": 321, "y": 390})

    def test_main_parses_help_surface_for_start(self) -> None:
        argv = [
            "logh7_ui_explorer",
            "--session",
            ".omo/ui-explorer/test",
            "start",
            "--exe",
            "client.exe",
        ]
        seen: list[argparse.Namespace] = []

        def fake_start(args: argparse.Namespace) -> int:
            seen.append(args)
            return 0

        with patch("tools.logh7_ui_explorer.cmd_start", side_effect=fake_start), patch(
            "sys.argv", argv
        ):
            self.assertEqual(main(), 0)
        self.assertEqual(seen[0].exe, Path("client.exe"))

    def test_type_sequence_prepends_self_cancelling_unicode_warmup(self) -> None:
        seq = _build_type_sequence("inei00")
        # 워밍업 1항: unicode 주입 더미 문자(파이프라인 워밍). SHIFT가 아니다.
        self.assertEqual(seq[0]["kind"], "warmup")
        self.assertTrue(seq[0]["unicode"])
        self.assertEqual(seq[0]["char"], _WARMUP_DUMMY_CHAR)
        self.assertEqual(seq[0]["scan"], ord(_WARMUP_DUMMY_CHAR))
        self.assertEqual(seq[0]["vk"], 0)
        # 워밍업 2항: 더미를 자기상쇄로 지우는 Backspace(VK_BACK, non-unicode).
        self.assertEqual(seq[1]["kind"], "warmup")
        self.assertFalse(seq[1]["unicode"])
        self.assertEqual(seq[1]["vk"], _VK_BACK)
        self.assertIsNone(seq[1]["char"])
        # 워밍업 직후 첫 실문자가 손실 없이 'i' 여야 한다(첫 글자 누락 회귀 방지).
        self.assertEqual(seq[2]["kind"], "char")
        self.assertEqual(seq[2]["char"], "i")

    def test_type_sequence_preserves_all_characters_in_order(self) -> None:
        text = "inei00"
        chars = [ev["char"] for ev in _build_type_sequence(text) if ev["kind"] == "char"]
        self.assertEqual("".join(chars), text)
        # 각 실문자는 유니코드 스캔코드로 매핑돼야 한다.
        for ev in _build_type_sequence(text):
            if ev["kind"] == "char":
                self.assertTrue(ev["unicode"])
                self.assertEqual(ev["scan"], ord(ev["char"]))
                self.assertEqual(ev["vk"], 0)

    def test_type_sequence_without_warmup_starts_at_first_char(self) -> None:
        seq = _build_type_sequence("ab", warmup=False)
        self.assertEqual([ev["kind"] for ev in seq], ["char", "char"])
        self.assertEqual(seq[0]["char"], "a")

    def test_main_allows_start_without_explicit_exe(self) -> None:
        seen: list[argparse.Namespace] = []

        def fake_start(args: argparse.Namespace) -> int:
            seen.append(args)
            return 0

        with patch("tools.logh7_ui_explorer.cmd_start", side_effect=fake_start), patch(
            "sys.argv", ["logh7_ui_explorer", "start"]
        ):
            self.assertEqual(main(), 0)
        self.assertIsNone(seen[0].exe)


if __name__ == "__main__":
    unittest.main()
