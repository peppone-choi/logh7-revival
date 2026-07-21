from __future__ import annotations

import argparse
import hashlib
import io
import json
import struct
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


def _write_min_pe(
    path: Path,
    *,
    image_base: int = 0x00400000,
    sentinel_hex: str = "deadbeef",
    sentinel_offset: int = 0x100,
) -> None:
    """inspect_pe가 파싱 가능한 최소 PE32 파일을 만든다(sentinel 바이트 포함)."""
    buf = bytearray(512)
    buf[0:2] = b"MZ"
    pe_off = 0x80
    struct.pack_into("<I", buf, 0x3C, pe_off)
    buf[pe_off : pe_off + 4] = b"PE\0\0"
    struct.pack_into("<I", buf, pe_off + 8, 0x65A1B2C3)  # timestamp
    optional_off = pe_off + 24
    struct.pack_into("<H", buf, optional_off, 0x10B)  # PE32 magic
    struct.pack_into("<I", buf, optional_off + 28, image_base)
    sentinel = bytes.fromhex(sentinel_hex)
    buf[sentinel_offset : sentinel_offset + len(sentinel)] = sentinel
    path.write_bytes(bytes(buf))


def _lineage_manifest(exe: Path, *, sha256: str, image_base: str, sentinel_hex: str, sentinel_offset: str) -> dict:
    return {
        "schemaVersion": 1,
        "working": {
            "path": str(exe),
            "sha256": sha256,
            "imageBase": image_base,
            "sentinels": [{"hex": sentinel_hex, "offset": sentinel_offset}],
        },
    }


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

    def test_process_alive_uses_openprocess_on_windows(self) -> None:
        fake_kernel = MagicMock()
        fake_kernel.OpenProcess.return_value = 0x100  # non-null handle
        with patch("tools.logh7_ui_explorer.sys.platform", "win32"), patch(
            "tools.logh7_ui_explorer.ctypes.windll.kernel32", fake_kernel
        ):
            self.assertTrue(_process_alive(4242))
        fake_kernel.OpenProcess.assert_called()
        fake_kernel.CloseHandle.assert_called_with(0x100)

    def test_process_alive_tasklist_fallback_decodes_bytes(self) -> None:
        completed = MagicMock(
            returncode=0,
            stdout=b'"g7mtclient.exe","4242","Console","1","12,000 K"\n',
        )
        fake_kernel = MagicMock()
        fake_kernel.OpenProcess.return_value = 0  # force fallback
        with patch("tools.logh7_ui_explorer.sys.platform", "win32"), patch(
            "tools.logh7_ui_explorer.ctypes.windll.kernel32", fake_kernel
        ), patch("tools.logh7_ui_explorer.subprocess.run", return_value=completed):
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

    def _run_start_with_manifest(self, root: Path, exe: Path, manifest: dict):
        (root / "manifests").mkdir(parents=True, exist_ok=True)
        manifest_path = root / "manifests" / "client-lineage.json"
        manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
        args = argparse.Namespace(
            session=root / "session",
            exe=exe,
            label="initial",
            settle=0.0,
            window_timeout=1.0,
            title_substring=None,
            lineage_manifest=manifest_path,
        )
        fake_process = MagicMock(pid=42796)
        with patch("tools.logh7_ui_explorer._require_windows"), patch(
            "tools.logh7_ui_explorer.subprocess.Popen", return_value=fake_process
        ) as popen, patch(
            "tools.logh7_ui_explorer._wait_for_window", return_value=81234
        ), patch(
            "tools.logh7_ui_explorer._observe", return_value={"label": "initial"}
        ), patch("sys.stdout", new=io.StringIO()) as stdout:
            code = cmd_start(args)
        return code, popen, stdout.getvalue(), args.session

    def test_start_blocks_on_sha256_mismatch(self) -> None:
        with TemporaryDirectory() as raw_dir:
            root = Path(raw_dir)
            exe = root / "g7mtclient.exe"
            _write_min_pe(exe)
            manifest = _lineage_manifest(
                exe,
                sha256="0" * 64,  # deliberately wrong hash
                image_base="0x00400000",
                sentinel_hex="deadbeef",
                sentinel_offset="0x100",
            )
            code, popen, output, session = self._run_start_with_manifest(root, exe, manifest)
            self.assertEqual(code, 3)
            popen.assert_not_called()
            payload = json.loads(output)
            self.assertTrue(payload["blocked"])
            failing = {entry["check"] for entry in payload["verdict"]["mismatches"]}
            self.assertIn("sha256", failing)
            self.assertTrue((session / "lineage-blocked.json").is_file())

    def test_start_blocks_on_image_base_mismatch(self) -> None:
        with TemporaryDirectory() as raw_dir:
            root = Path(raw_dir)
            exe = root / "g7mtclient.exe"
            _write_min_pe(exe, image_base=0x00400000)
            actual_sha = hashlib.sha256(exe.read_bytes()).hexdigest()
            manifest = _lineage_manifest(
                exe,
                sha256=actual_sha,
                image_base="0x00500000",  # PE actually reports 0x00400000
                sentinel_hex="deadbeef",
                sentinel_offset="0x100",
            )
            code, popen, output, _ = self._run_start_with_manifest(root, exe, manifest)
            self.assertEqual(code, 3)
            popen.assert_not_called()
            payload = json.loads(output)
            failing = {entry["check"] for entry in payload["verdict"]["mismatches"]}
            self.assertIn("imageBase", failing)

    def test_start_blocks_on_sentinel_mismatch(self) -> None:
        with TemporaryDirectory() as raw_dir:
            root = Path(raw_dir)
            exe = root / "g7mtclient.exe"
            _write_min_pe(exe, sentinel_hex="deadbeef", sentinel_offset=0x100)
            actual_sha = hashlib.sha256(exe.read_bytes()).hexdigest()
            manifest = _lineage_manifest(
                exe,
                sha256=actual_sha,
                image_base="0x00400000",
                sentinel_hex="cafebabe",  # file has deadbeef at 0x100
                sentinel_offset="0x100",
            )
            code, popen, output, _ = self._run_start_with_manifest(root, exe, manifest)
            self.assertEqual(code, 3)
            popen.assert_not_called()
            payload = json.loads(output)
            failing = {entry["check"] for entry in payload["verdict"]["mismatches"]}
            self.assertIn("sentinel[0]", failing)

    def test_start_launches_when_lineage_matches(self) -> None:
        with TemporaryDirectory() as raw_dir:
            root = Path(raw_dir)
            exe = root / "g7mtclient.exe"
            _write_min_pe(exe, image_base=0x00400000, sentinel_hex="deadbeef", sentinel_offset=0x100)
            actual_sha = hashlib.sha256(exe.read_bytes()).hexdigest()
            manifest = _lineage_manifest(
                exe,
                sha256=actual_sha,
                image_base="0x00400000",
                sentinel_hex="deadbeef",
                sentinel_offset="0x100",
            )
            code, popen, output, session = self._run_start_with_manifest(root, exe, manifest)
            self.assertEqual(code, 0)
            popen.assert_called_once()
            self.assertEqual(popen.call_args.args[0], [str(exe.resolve())])
            self.assertFalse((session / "lineage-blocked.json").exists())
            payload = json.loads(output)
            self.assertEqual(payload["started"]["clientPid"], 42796)

    def test_start_launches_when_exe_matches_authorized_patch_node(self) -> None:
        # v2 authorizedNodes 매니페스트: 승인된 패치 노드에 완전 매치하면 launch.
        with TemporaryDirectory() as raw_dir:
            root = Path(raw_dir)
            exe = root / "g7mtclient.exe"
            _write_min_pe(exe, image_base=0x00400000, sentinel_hex="deadbeef", sentinel_offset=0x100)
            actual_sha = hashlib.sha256(exe.read_bytes()).hexdigest()
            manifest = {
                "schemaVersion": 2,
                "authorizedNodes": [
                    {
                        "nodeId": "original",
                        "kind": "original",
                        "sha256": "1" * 64,  # 원본은 다른 hash — 이 EXE와 안 맞음
                        "imageBase": "0x00400000",
                        "sentinels": [{"hex": "deadbeef", "offset": "0x100"}],
                    },
                    {
                        "nodeId": "patch_v1",
                        "kind": "patch",
                        "parentHash": "1" * 64,
                        "sha256": actual_sha,
                        "imageBase": "0x00400000",
                        "sentinels": [{"hex": "deadbeef", "offset": "0x100"}],
                        "capabilityProfile": "layer3-notifybase-render",
                        "provenance": "patch for Layer3 NotifyBaseParameter UI binding",
                        "approvalRef": "LOGH7-212",
                    },
                ],
            }
            code, popen, output, session = self._run_start_with_manifest(root, exe, manifest)
            self.assertEqual(code, 0)
            popen.assert_called_once()
            self.assertFalse((session / "lineage-blocked.json").exists())

    def test_start_blocks_unknown_hash_against_authorized_nodes(self) -> None:
        # 핵심 fail-closed: 어느 인가 노드에도 안 맞는 미상 EXE는 차단.
        with TemporaryDirectory() as raw_dir:
            root = Path(raw_dir)
            exe = root / "g7mtclient.exe"
            _write_min_pe(exe, image_base=0x00400000, sentinel_hex="deadbeef", sentinel_offset=0x100)
            manifest = {
                "schemaVersion": 2,
                "authorizedNodes": [
                    {
                        "nodeId": "original",
                        "kind": "original",
                        "sha256": "1" * 64,  # 둘 다 이 EXE와 다른 hash
                        "imageBase": "0x00400000",
                        "sentinels": [{"hex": "deadbeef", "offset": "0x100"}],
                    },
                    {
                        "nodeId": "patch_v1",
                        "kind": "patch",
                        "parentHash": "1" * 64,
                        "sha256": "2" * 64,
                        "imageBase": "0x00400000",
                        "sentinels": [{"hex": "deadbeef", "offset": "0x100"}],
                        "capabilityProfile": "layer3",
                        "provenance": "p",
                        "approvalRef": "LOGH7-212",
                    },
                ],
            }
            code, popen, output, session = self._run_start_with_manifest(root, exe, manifest)
            self.assertEqual(code, 3)
            popen.assert_not_called()
            payload = json.loads(output)
            self.assertTrue(payload["blocked"])
            self.assertIsNone(payload["verdict"]["matchedNode"])
            self.assertTrue((session / "lineage-blocked.json").is_file())

    def test_start_blocks_patch_node_without_approval(self) -> None:
        # hash는 맞지만 approval_ref 없는 패치 노드는 인가되지 않아 차단.
        with TemporaryDirectory() as raw_dir:
            root = Path(raw_dir)
            exe = root / "g7mtclient.exe"
            _write_min_pe(exe, image_base=0x00400000, sentinel_hex="deadbeef", sentinel_offset=0x100)
            actual_sha = hashlib.sha256(exe.read_bytes()).hexdigest()
            manifest = {
                "schemaVersion": 2,
                "authorizedNodes": [
                    {
                        "nodeId": "patch_v1",
                        "kind": "patch",
                        "sha256": actual_sha,  # 정확히 이 EXE
                        "imageBase": "0x00400000",
                        "sentinels": [{"hex": "deadbeef", "offset": "0x100"}],
                        # capabilityProfile/provenance/approvalRef 누락 → 미인가
                    },
                ],
            }
            code, popen, output, session = self._run_start_with_manifest(root, exe, manifest)
            self.assertEqual(code, 3)
            popen.assert_not_called()
            payload = json.loads(output)
            self.assertIsNone(payload["verdict"]["matchedNode"])

    def test_empty_authorized_nodes_falls_back_to_working(self) -> None:
        # MINOR-2: authorizedNodes:[] + 유효 working이면 빈 리스트를 v2 부재로
        # 취급해 working으로 판정한다(빈 리스트가 정상 클라를 조용히 차단하지 않음).
        with TemporaryDirectory() as raw_dir:
            root = Path(raw_dir)
            exe = root / "g7mtclient.exe"
            _write_min_pe(exe, image_base=0x00400000, sentinel_hex="deadbeef", sentinel_offset=0x100)
            actual_sha = hashlib.sha256(exe.read_bytes()).hexdigest()
            manifest = _lineage_manifest(
                exe,
                sha256=actual_sha,
                image_base="0x00400000",
                sentinel_hex="deadbeef",
                sentinel_offset="0x100",
            )
            manifest["authorizedNodes"] = []  # 빈 v2 블록 — working으로 폴백해야 함
            code, popen, output, session = self._run_start_with_manifest(root, exe, manifest)
            self.assertEqual(code, 0)
            popen.assert_called_once()
            self.assertFalse((session / "lineage-blocked.json").exists())

    def test_empty_authorized_nodes_without_working_blocked(self) -> None:
        # authorizedNodes:[] 인데 working도 없으면 distinct reason으로 차단.
        with TemporaryDirectory() as raw_dir:
            root = Path(raw_dir)
            exe = root / "g7mtclient.exe"
            _write_min_pe(exe, image_base=0x00400000, sentinel_hex="deadbeef", sentinel_offset=0x100)
            manifest = {"schemaVersion": 2, "authorizedNodes": []}
            code, popen, output, session = self._run_start_with_manifest(root, exe, manifest)
            self.assertEqual(code, 3)
            popen.assert_not_called()
            payload = json.loads(output)
            self.assertIn("empty", payload["verdict"]["reason"])

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
