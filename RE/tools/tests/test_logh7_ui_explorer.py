from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from tools.tests.test_logh7_pipeline import REPO_ROOT
from tools.logh7_runtime_patch_apply import _build_js as _build_runtime_patch_apply_js
from tools.logh7_runtime_patch_apply import _load_patch as _load_runtime_patch_descriptor
from tools.logh7_ui_flow import CharacterFaction, CharacterFlowSpec, LoginSpec, run_create_character_flow, run_login_flow
from tools.logh7_ui_explorer import (
    COMMANDLINE_BOOTSTRAP_PORT,
    FORBIDDEN_DEFAULT_LOGH_FLAGS,
    _aspect_fit_rect,
    _cursor_clip_enabled,
    _effective_logh_env_receipt,
    _patch_dgvoodoo_display_mode,
    _register_pretendard_fonts,
    _resolve_server_root,
    _runtime_patch_receipt,
    _cleanup_failed_start,
    _client_preflight_with_launcher,
    _canonical_playable_source_receipt,
    _configure_korean_menu_mode,
    _spawn_runtime_patched_client,
    _strip_one_trailing_newline,
    _taskkill_pid,
    _text_action_report,
    _validate_commandline_bootstrap_port,
    _validate_runtime_patch_start_args,
    _windows_app_control_message,
    main,
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

    def test_standard_live_env_keeps_diagnostic_flags_opt_in(self) -> None:
        from tools.logh7_launch_config import (
            HARNESS_ONLY_SERVER_ENV_KEYS,
            LAUNCHER_ONLY_SERVER_ENV_KEYS,
            PORT,
            SHARED_LAUNCHER_ENV_KEYS,
            STANDARD_SERVER_ENV,
            standard_env_cli_args,
        )

        self.assertEqual(PORT, 47900)
        self.assertEqual(STANDARD_SERVER_ENV["LOGH_POSTLOAD_RICH_CHARACTER"], "1")
        self.assertNotIn("LOGH_PRESEED_PLAYER_CHAR", STANDARD_SERVER_ENV)
        self.assertEqual(STANDARD_SERVER_ENV["LOGH_POSTLOAD_ACTION_LIST_SEATS"], "1")
        self.assertEqual(STANDARD_SERVER_ENV["LOGH_ACTION_LIST_CATEGORY"], "0")
        self.assertEqual(STANDARD_SERVER_ENV["LOGH_COMMAND_TABLE_PRELOAD_PROBE"], "0")
        self.assertEqual(STANDARD_SERVER_ENV["LOGH_DEV_COMMAND_GRANT_ALL"], "0")
        self.assertEqual(STANDARD_SERVER_ENV["LOGH_STATIC_SHIPS"], "1")
        self.assertEqual(STANDARD_SERVER_ENV["LOGH_STATIC_TROOPS"], "0")
        self.assertEqual(STANDARD_SERVER_ENV["LOGH_STATIC_FIGHTERS"], "0")
        self.assertEqual(STANDARD_SERVER_ENV["LOGH_STATIC_ARMS"], "0")
        self.assertEqual(STANDARD_SERVER_ENV["LOGH_STATIC_POWER_DISTRIBUTION"], "0")
        self.assertEqual(STANDARD_SERVER_ENV["LOGH_STATIC_MASTER_PLAYABLE_SEED"], "0")
        self.assertEqual(HARNESS_ONLY_SERVER_ENV_KEYS, ("LOGH_ACCEPT_ANY_GIN7",))
        self.assertIn("LOGH_POSTLOAD_PLAYER_RECORD", SHARED_LAUNCHER_ENV_KEYS)
        self.assertIn("LOGH_SEED_CANON_NPCS", SHARED_LAUNCHER_ENV_KEYS)
        self.assertIn("LOGH_PLANET_BASE_RECORDS", SHARED_LAUNCHER_ENV_KEYS)
        self.assertIn("LOGH_ACCOUNT_DB", LAUNCHER_ONLY_SERVER_ENV_KEYS)
        self.assertIn("LOGH_SESSION_DB", LAUNCHER_ONLY_SERVER_ENV_KEYS)
        self.assertIn("--env", standard_env_cli_args())
        self.assertIn("LOGH_POSTLOAD_RICH_CHARACTER=1", standard_env_cli_args())
        self.assertIn("LOGH_PLANET_BASE_RECORDS=1", standard_env_cli_args())
        self.assertIn("LOGH_COMMAND_TABLE_PRELOAD_PROBE=0", standard_env_cli_args())
        self.assertIn("LOGH_DEV_COMMAND_GRANT_ALL=0", standard_env_cli_args())
        self.assertIn("LOGH_STATIC_TROOPS=0", standard_env_cli_args())

    def test_launcher_env_mirrors_shared_live_env_with_documented_deltas(self) -> None:
        from tools.logh7_launch_config import (
            HARNESS_ONLY_SERVER_ENV_KEYS,
            LAUNCHER_ONLY_SERVER_ENV_KEYS,
            SHARED_LAUNCHER_ENV_KEYS,
            STANDARD_SERVER_ENV,
        )

        launcher_source = (REPO_ROOT / "tools" / "launcher" / "LOGH7Launcher.cs").read_text(encoding="utf-8")
        literal_env = dict(
            re.findall(r'psi\.EnvironmentVariables\["([^"]+)"\]\s*=\s*"([^"]*)";', launcher_source)
        )
        launcher_keys = set(re.findall(r'psi\.EnvironmentVariables\["([^"]+)"\]', launcher_source))

        self.assertEqual(set(SHARED_LAUNCHER_ENV_KEYS) | set(HARNESS_ONLY_SERVER_ENV_KEYS), set(STANDARD_SERVER_ENV))
        for key in SHARED_LAUNCHER_ENV_KEYS:
            self.assertEqual(literal_env.get(key), STANDARD_SERVER_ENV[key], key)
        for key in HARNESS_ONLY_SERVER_ENV_KEYS:
            self.assertNotIn(key, launcher_keys)
        self.assertTrue(set(LAUNCHER_ONLY_SERVER_ENV_KEYS).issubset(launcher_keys))
        self.assertEqual(launcher_keys - set(SHARED_LAUNCHER_ENV_KEYS) - set(LAUNCHER_ONLY_SERVER_ENV_KEYS), set())

    def test_taskkill_pid_targets_only_recorded_live_pid(self) -> None:
        with patch("tools.logh7_ui_explorer._process_alive", side_effect=lambda pid: pid == 16040):
            with patch("tools.logh7_ui_explorer.subprocess.run") as run:
                self.assertTrue(_taskkill_pid(16040))
                self.assertFalse(_taskkill_pid(16041))

        run.assert_called_once_with(["taskkill", "/F", "/PID", "16040"], capture_output=True)

    def test_failed_start_cleanup_kills_client_then_server_pid(self) -> None:
        calls: list[int | None] = []

        def fake_taskkill(pid: int | None) -> bool:
            calls.append(pid)
            return pid is not None

        with patch("tools.logh7_ui_explorer._taskkill_pid", side_effect=fake_taskkill):
            receipt = _cleanup_failed_start(server_pid=16040, client_pid=4242)

        self.assertEqual(calls, [4242, 16040])
        self.assertEqual(receipt, {"clientKilled": True, "serverKilled": True})

    def test_korean_menu_mode_is_safe_noop_off_windows(self) -> None:
        with TemporaryDirectory() as raw_session:
            with patch("tools.logh7_ui_explorer.sys.platform", "linux"):
                receipt = _configure_korean_menu_mode(Path(raw_session))

        self.assertEqual(receipt["attempted"], False)
        self.assertEqual(receipt["reason"], "non-windows")
        self.assertEqual(receipt["hangeulmenu"], "hangeul")
        self.assertEqual(receipt["kanjimenu"], "roman")

    def test_windows_app_control_message_recognizes_winerror_4551(self) -> None:
        blocked = OSError("blocked")
        blocked.winerror = 4551

        message = _windows_app_control_message(Path("G7MTClient.exe"), blocked)

        self.assertIsNotNone(message)
        self.assertIn("Windows Application Control", message or "")
        self.assertIn("CodeIntegrity", message or "")
        self.assertIsNone(_windows_app_control_message(Path("G7MTClient.exe"), OSError("other")))

    def test_client_preflight_can_be_disabled_without_launching(self) -> None:
        with TemporaryDirectory() as raw_session:
            session = Path(raw_session)

            receipt = _client_preflight_with_launcher(session, Path("G7MTClient.exe"), enabled=False)

            self.assertEqual(receipt["attempted"], False)
            self.assertEqual(receipt["reason"], "disabled")
            self.assertTrue((session / "client-preflight.json").exists())

    def test_client_preflight_failure_stops_before_server_start(self) -> None:
        with TemporaryDirectory() as raw_session:
            root = Path(raw_session)
            installed = root / "installed"
            exe_dir = installed / "exe"
            exe_dir.mkdir(parents=True)
            launcher = installed / "LOGH7Launcher.exe"
            launcher.write_bytes(b"launcher")
            run_exe = exe_dir / "G7MTClient.exe"
            run_exe.write_bytes(b"client")
            completed = subprocess.CompletedProcess(
                [str(launcher), "--client-preflight"],
                1,
                stdout="",
                stderr="Smart App Control blocked the game client",
            )

            with (
                patch("tools.logh7_ui_explorer.CLIENT_DIR", exe_dir),
                patch("tools.logh7_ui_explorer.CLIENT_EXE", run_exe),
                patch("tools.logh7_ui_explorer.sys.platform", "win32"),
                patch("tools.logh7_ui_explorer.subprocess.run", return_value=completed),
            ):
                with self.assertRaisesRegex(SystemExit, "client preflight failed before server start"):
                    _client_preflight_with_launcher(root, run_exe)

            receipt = json.loads((root / "client-preflight.json").read_text(encoding="utf-8"))
            self.assertEqual(receipt["attempted"], True)
            self.assertEqual(receipt["exitCode"], 1)
            self.assertIn("Smart App Control", receipt["stderr"])

    def test_canonical_playable_source_receipt_rejects_sha_drift(self) -> None:
        canonical = Path("G7MTClient.playable.exe")
        expected = "3b4f634818ff0d2b2f59eb6ddacbe73c9bcbc9cda146b9cfdb9c5d1cb7b98573"

        with patch("tools.logh7_ui_explorer.sha256_file", return_value=expected):
            receipt = _canonical_playable_source_receipt(canonical)

        self.assertEqual(receipt["source"], str(canonical))
        self.assertEqual(receipt["sourceSha"], expected)
        self.assertEqual(receipt["sourceKind"], "canonical-playable")
        self.assertEqual(receipt["expectedSha"], expected)

        with patch("tools.logh7_ui_explorer.sha256_file", return_value="0" * 64):
            with self.assertRaisesRegex(SystemExit, "canonical playable source drift"):
                _canonical_playable_source_receipt(canonical)

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
        self.assertEqual(summary["steps"], 6)
        click_points = [(value, y) for action, value, y in driver.actions if action == "click"]
        self.assertEqual(click_points, [(452, 293), (374, 290), (376, 318), (352, 347)])

    def test_create_character_uses_current_native_lobby_coordinates(self) -> None:
        driver = RecordingDriver()
        spec = CharacterFlowSpec(
            session_row=1,
            faction=CharacterFaction.EMPIRE,
            lastname="Reinhard",
            firstname="Lohengramm",
            flagship="Brunhild",
        )

        result = run_create_character_flow(driver, spec, settle=0.0)

        clicks = [(x, y) for action, x, y in driver.actions if action == "click"]
        self.assertEqual(clicks[0], (574, 407))
        self.assertEqual(clicks[1], (1090, 425))
        self.assertEqual(clicks[2], (1090, 425))
        self.assertEqual(clicks[3], (1021, 464))
        self.assertEqual(clicks[4], (1184, 731))
        self.assertEqual(clicks[7], (1080, 462))
        self.assertEqual(clicks[8], (1080, 543))
        self.assertEqual(clicks[11], (444, 344))
        self.assertEqual(clicks[14], (781, 506))
        self.assertEqual(clicks[16], (1184, 731))
        self.assertEqual(clicks[17], (1015, 596))
        self.assertEqual(result.to_json()["steps"], 21)

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
        _validate_commandline_bootstrap_port(47912, client_driven_login=False, window_login=False)

        with self.assertRaisesRegex(SystemExit, str(COMMANDLINE_BOOTSTRAP_PORT)):
            _validate_commandline_bootstrap_port(47912, client_driven_login=True)
        with self.assertRaisesRegex(SystemExit, str(COMMANDLINE_BOOTSTRAP_PORT)):
            _validate_commandline_bootstrap_port(47912, client_driven_login=False, window_login=True)

    def test_cursor_clip_auto_policy_tracks_display_mode(self) -> None:
        self.assertFalse(_cursor_clip_enabled("windowed", "auto"))
        self.assertTrue(_cursor_clip_enabled("borderless", "auto"))
        self.assertTrue(_cursor_clip_enabled("fullscreen", "auto"))
        self.assertTrue(_cursor_clip_enabled("windowed", "on"))
        self.assertFalse(_cursor_clip_enabled("borderless", "off"))

    def test_start_accepts_repeatable_runtime_patch_cli_option_without_launching(self) -> None:
        seen: list[argparse.Namespace] = []

        def fake_start(args: argparse.Namespace) -> int:
            seen.append(args)
            return 0

        argv = [
            "logh7_ui_explorer",
            "start",
            "--no-login",
            "--runtime-patch",
            "font-atlas-antialias",
            "--runtime-patch",
            "font-atlas-face.json",
        ]
        with (
            patch.object(sys, "argv", argv),
            patch("tools.logh7_ui_explorer.cmd_start", side_effect=fake_start),
        ):
            self.assertEqual(main(), 0)

        self.assertEqual(seen[0].runtime_patch, ["font-atlas-antialias", "font-atlas-face.json"])
        self.assertEqual(seen[0].display_mode, "windowed")
        self.assertEqual(seen[0].cursor_clip, "auto")

    def test_runtime_patch_start_rejects_disk_mutating_probe_modes(self) -> None:
        base = argparse.Namespace(runtime_patch=["font-atlas-antialias"], patched_exe=None, lobby_unblock_patch=False)
        self.assertEqual(_validate_runtime_patch_start_args(base), ["font-atlas-antialias"])

        with self.assertRaisesRegex(SystemExit, "--patched-exe"):
            _validate_runtime_patch_start_args(
                argparse.Namespace(
                    runtime_patch=["font-atlas-antialias"],
                    patched_exe=Path("probe.exe"),
                    lobby_unblock_patch=False,
                )
            )
        with self.assertRaisesRegex(SystemExit, "--lobby-unblock-patch"):
            _validate_runtime_patch_start_args(
                argparse.Namespace(runtime_patch=["font-atlas-antialias"], patched_exe=None, lobby_unblock_patch=True)
            )

    def test_runtime_patch_receipt_summarizes_patch_bytes(self) -> None:
        events = [
            {
                "tag": "patch-applied",
                "name": "font-atlas-antialias",
                "va": "0x004b0b91",
                "original": "6a05",
                "before": "6a05",
                "beforeOk": True,
                "bytes": "6a04",
                "actual": "6a04",
                "wrote": True,
                "ok": True,
            },
            {"tag": "runtime-patch-complete", "patchSets": ["font-atlas-antialias"]},
        ]

        receipt = _runtime_patch_receipt(["font-atlas-antialias"], events)

        self.assertTrue(receipt["ok"])
        self.assertEqual(receipt["method"], "frida-spawn-resume")
        self.assertEqual(receipt["patchNames"], ["font-atlas-antialias"])
        self.assertEqual(receipt["bytes"][0]["bytes"], "6a04")
        self.assertEqual(receipt["events"], events)

        failed = _runtime_patch_receipt(
            ["font-atlas-antialias"],
            [{**events[0], "actual": "6a05", "ok": False}, events[1]],
        )
        self.assertFalse(failed["ok"])

        incomplete = _runtime_patch_receipt(["font-atlas-antialias"], [events[0]])
        self.assertFalse(incomplete["ok"])

    def test_runtime_patch_descriptor_loader_preserves_original_hex_guard(self) -> None:
        patch = _load_runtime_patch_descriptor("font-atlas-antialias")

        site = patch["patches"][0]
        self.assertEqual(site["originalHex"], "6a05")
        self.assertEqual(site["patchedHex"], "6a04")

        js = _build_runtime_patch_apply_js([patch])
        self.assertIn("allBeforeOk", js)
        self.assertIn("beforeOk", js)
        self.assertIn("alreadyApplied", js)
        self.assertIn("preflightOk", js)
        self.assertIn("wrote", js)
        self.assertIn("original", js)
        self.assertNotIn("original === '' ||", js)
        self.assertIn("!alreadyApplied", js)

    def test_runtime_patch_descriptor_loader_requires_original_hex_guard(self) -> None:
        with TemporaryDirectory() as raw_patch_dir:
            patch_dir = Path(raw_patch_dir)
            (patch_dir / "unguarded.json").write_text(
                json.dumps(
                    {
                        "name": "unguarded",
                        "patches": [
                            {
                                "va": "0x004b0b91",
                                "patchedHex": "6a04",
                            }
                        ],
                    }
                ),
                encoding="utf-8",
            )

            with patch("tools.logh7_runtime_patch_apply.PATCH_DIR", patch_dir):
                with self.assertRaisesRegex(ValueError, "missing originalHex"):
                    _load_runtime_patch_descriptor("unguarded")

    def test_runtime_patch_spawn_helper_loads_script_before_resume(self) -> None:
        actions: list[object] = []

        class FakeScript:
            def __init__(self) -> None:
                self.callback = None

            def on(self, event: str, callback) -> None:
                actions.append(("script.on", event))
                self.callback = callback

            def load(self) -> None:
                actions.append("script.load")
                if self.callback is None:
                    raise AssertionError("message callback was not registered")
                self.callback(
                    {
                        "type": "send",
                        "payload": {
                            "tag": "patch-applied",
                            "name": "font-atlas-antialias",
                            "va": "0x004b0b91",
                            "bytes": "6a04",
                            "actual": "6a04",
                            "ok": True,
                        },
                    },
                    None,
                )
                self.callback(
                    {
                        "type": "send",
                        "payload": {"tag": "runtime-patch-complete", "patchSets": ["font-atlas-antialias"]},
                    },
                    None,
                )

            def unload(self) -> None:
                actions.append("script.unload")

        class FakeSession:
            def create_script(self, source: str) -> FakeScript:
                actions.append(("create_script", source))
                return FakeScript()

            def detach(self) -> None:
                actions.append("session.detach")

        class FakeDevice:
            def spawn(self, argv: list[str], *, cwd: str) -> int:
                actions.append(("spawn", argv, cwd))
                return 4242

            def attach(self, pid: int) -> FakeSession:
                actions.append(("attach", pid))
                return FakeSession()

            def resume(self, pid: int) -> None:
                actions.append(("resume", pid))

            def kill(self, pid: int) -> None:
                actions.append(("kill", pid))

        class FakeFrida:
            def __init__(self) -> None:
                self.device = FakeDevice()

            def get_local_device(self) -> FakeDevice:
                actions.append("get_local_device")
                return self.device

        def patch_loader(names: list[str]) -> list[dict[str, object]]:
            actions.append(("patch_loader", list(names)))
            return [{"name": names[0], "patches": [{"va": 0x004B0B91, "patchedHex": "6a04", "note": ""}]}]

        def js_builder(patch_sets: list[dict[str, object]]) -> str:
            actions.append(("js_builder", patch_sets))
            return "runtime patch script"

        pid, receipt = _spawn_runtime_patched_client(
            Path("G7MTClient.exe"),
            Path("client-dir"),
            ["font-atlas-antialias"],
            frida_module=FakeFrida(),
            patch_loader=patch_loader,
            js_builder=js_builder,
            timeout=0.01,
        )

        self.assertEqual(pid, 4242)
        self.assertTrue(receipt["ok"])
        self.assertEqual(receipt["bytes"][0]["actual"], "6a04")
        self.assertLess(actions.index("script.load"), actions.index(("resume", 4242)))
        self.assertNotIn(("kill", 4242), actions)

    def test_runtime_patch_spawn_helper_kills_suspended_client_on_guard_failure(self) -> None:
        actions: list[object] = []

        class FakeScript:
            def __init__(self) -> None:
                self.callback = None

            def on(self, event: str, callback) -> None:
                actions.append(("script.on", event))
                self.callback = callback

            def load(self) -> None:
                actions.append("script.load")
                if self.callback is None:
                    raise AssertionError("message callback was not registered")
                self.callback(
                    {
                        "type": "send",
                        "payload": {
                            "tag": "patch-applied",
                            "name": "font-atlas-antialias",
                            "va": "0x004b0b91",
                            "original": "6a05",
                            "before": "6a04",
                            "beforeOk": False,
                            "bytes": "6a04",
                            "actual": "6a04",
                            "wrote": False,
                            "ok": False,
                        },
                    },
                    None,
                )
                self.callback(
                    {
                        "type": "send",
                        "payload": {"tag": "runtime-patch-complete", "patchSets": ["font-atlas-antialias"]},
                    },
                    None,
                )

            def unload(self) -> None:
                actions.append("script.unload")

        class FakeSession:
            def create_script(self, source: str) -> FakeScript:
                actions.append(("create_script", source))
                return FakeScript()

            def detach(self) -> None:
                actions.append("session.detach")

        class FakeDevice:
            def spawn(self, argv: list[str], *, cwd: str) -> int:
                actions.append(("spawn", argv, cwd))
                return 5252

            def attach(self, pid: int) -> FakeSession:
                actions.append(("attach", pid))
                return FakeSession()

            def resume(self, pid: int) -> None:
                actions.append(("resume", pid))

            def kill(self, pid: int) -> None:
                actions.append(("kill", pid))

        class FakeFrida:
            def __init__(self) -> None:
                self.device = FakeDevice()

            def get_local_device(self) -> FakeDevice:
                actions.append("get_local_device")
                return self.device

        with self.assertRaisesRegex(SystemExit, "--runtime-patch failed before client resume"):
            _spawn_runtime_patched_client(
                Path("G7MTClient.exe"),
                Path("client-dir"),
                ["font-atlas-antialias"],
                frida_module=FakeFrida(),
                patch_loader=lambda names: [{"name": names[0], "patches": []}],
                js_builder=lambda patch_sets: "runtime patch script",
                timeout=0.01,
            )

        self.assertIn(("kill", 5252), actions)
        self.assertNotIn(("resume", 5252), actions)

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
        self.assertEqual(receipt["targetAspect"], "16:9")

    def test_borderless_aspect_fits_16_9_on_taller_monitor(self) -> None:
        self.assertEqual(_aspect_fit_rect(0, 0, 1920, 1200), (0, 60, 1920, 1080))
        self.assertEqual(_aspect_fit_rect(0, 0, 1600, 1200), (0, 150, 1600, 900))

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
            self.assertRegex(text, r"WatermarkDisplayDuration\s+= 1")
            self.assertRegex(text, r"3DfxWatermark\s+= false")
            self.assertRegex(text, r"3DfxSplashScreen\s+= false")
            self.assertRegex(text, r"dgVoodooWatermark\s+= false")
            self.assertNotIn("FullscreenAttributes                = fake", text)

            windowed = _patch_dgvoodoo_display_mode(client_dir, "windowed")
            text = conf.read_text(encoding="utf-8")
            self.assertEqual(windowed["fullScreenMode"], "false")
            self.assertEqual(windowed["scalingMode"], "centered")
            self.assertEqual(windowed["resampling"], "pointsampled")
            self.assertEqual(windowed["windowedAttributes"], "")
            self.assertEqual(windowed["filtering"], "appdriven")
            self.assertEqual(windowed["antialiasing"], "off")
            self.assertRegex(text, r"ScalingMode\s+= centered")
            self.assertRegex(text, r"Resampling\s+= pointsampled")
            self.assertRegex(text, r"(?m)^WindowedAttributes\s+=\s*$")

            borderless = _patch_dgvoodoo_display_mode(client_dir, "borderless")
            self.assertEqual(borderless["fullscreenAttributes"], "fake")
            self.assertEqual(borderless["fullScreenMode"], "false")
            self.assertEqual(borderless["resampling"], "pointsampled")
            self.assertEqual(borderless["watermarkDisplayDuration"], "1")
            self.assertEqual(borderless["threeDfxWatermark"], "false")
            self.assertEqual(borderless["threeDfxSplashScreen"], "false")
            self.assertEqual(borderless["dgVoodooWatermark"], "false")
            self.assertEqual(borderless["filtering"], "appdriven")
            self.assertEqual(borderless["antialiasing"], "off")
            self.assertEqual(borderless["rtTexturesForceScaleAndMSAA"], "false")
            self.assertEqual(borderless["smoothedDepthSampling"], "false")
            self.assertRegex(conf.read_text(encoding="utf-8"), r"FullscreenAttributes\s+= fake")
            self.assertRegex(conf.read_text(encoding="utf-8"), r"WindowedAttributes\s+= borderless")
            self.assertRegex(conf.read_text(encoding="utf-8"), r"Resampling\s+= pointsampled")
            self.assertRegex(conf.read_text(encoding="utf-8"), r"Filtering\s+= appdriven")
            self.assertRegex(conf.read_text(encoding="utf-8"), r"Antialiasing\s+= off")

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
