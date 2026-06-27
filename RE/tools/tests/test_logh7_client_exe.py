from __future__ import annotations

import hashlib
import json
import tempfile
import unittest
from pathlib import Path

from tools.logh7_client_exe import (
    ClientLaunchMode,
    COMMANDLINE_BOOTSTRAP_PATCH,
    PLAYABLE_CLIENT_SHA256,
    playable_manifest_path,
    playable_manifest_stack,
    choose_ui_explorer_launch,
    label_for_sha,
    verify_client_sha,
)
from tools.logh7_build_playable_client import DEFAULT_STACK
from tools.logh7_build_playable_client import CANONICAL_KOREAN_MSGDAT_DIR
from tools.logh7_build_playable_client import RESOURCE_LOCALIZATION_MAP


def _sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


class Logh7ClientExeSelectionTests(unittest.TestCase):
    def test_canonical_playable_stack_includes_early_grid_ringclear(self) -> None:
        self.assertEqual(
            DEFAULT_STACK,
            [
                "menufix",
                "dlgfix",
                "earlygrid-ringclear",
                "strat-camera-focus",
                "hud-msgdat-groupfix",
                "hud-character-status-msgdatfix",
                "mission-msgdat-subidfix",
                "sector-label-hardcoded-ko",
                "tactical-grid-msgdat-boundaryfix",
                "galaxy-screen-starname-msgdat-boundaryfix",
                "galaxy-screen-grid-format-msgdat-boundaryfix",
                "hud-hardcoded-stat-labels-ko",
                "font-face",
                "font-cleartype",
                "login-title-ko",
                "login-blank-password-local-ok",
                "lobby-res",
                "lobby-native-layout",
            ],
        )
        self.assertEqual(
            PLAYABLE_CLIENT_SHA256,
            "992dc7e25c4d7c3c982f1d2e6d9de904c733208ae9b28ddab162ef51aa076a0c",
        )
        self.assertEqual(label_for_sha(PLAYABLE_CLIENT_SHA256), "canonical-playable")

    def test_canonical_playable_build_localizes_resources_and_msgdat(self) -> None:
        self.assertEqual(RESOURCE_LOCALIZATION_MAP.name, "hardcoded-ui-ko.json")
        self.assertEqual(CANONICAL_KOREAN_MSGDAT_DIR.name, "MsgDat")

    def test_canonical_playable_manifest_contains_native_stack_without_rejected_stretch_patch(self) -> None:
        manifest = json.loads(playable_manifest_path().read_text(encoding="utf-8"))
        self.assertEqual(manifest["outSha256"], PLAYABLE_CLIENT_SHA256)
        self.assertEqual(manifest["stack"], DEFAULT_STACK)
        self.assertEqual(
            manifest["stack"][-5:],
            [
                "font-cleartype",
                "login-title-ko",
                "login-blank-password-local-ok",
                "lobby-res",
                "lobby-native-layout",
            ],
        )
        self.assertNotIn("lobby-fullscreen-display", manifest["stack"])
        applied = {patch["name"] for patch in manifest["patches"]}
        self.assertIn("hud-msgdat-groupfix", applied)
        self.assertIn("hud-character-status-msgdatfix", applied)
        self.assertIn("mission-msgdat-subidfix", applied)
        self.assertIn("sector-label-hardcoded-ko", applied)
        self.assertIn("tactical-grid-msgdat-boundaryfix", applied)
        self.assertIn("galaxy-screen-starname-msgdat-boundaryfix", applied)
        self.assertIn("galaxy-screen-grid-format-msgdat-boundaryfix", applied)
        self.assertIn("hud-hardcoded-stat-labels-ko", applied)
        self.assertIn("font-cleartype", applied)
        self.assertIn("login-title-ko", applied)
        self.assertNotIn("login-native-layout", applied)
        self.assertNotIn(COMMANDLINE_BOOTSTRAP_PATCH, applied)
        self.assertIn("login-blank-password-local-ok", applied)
        self.assertIn("lobby-res", applied)
        self.assertIn("lobby-native-layout", applied)

    def test_playable_manifest_stack_reads_patch_names(self) -> None:
        self.assertNotIn(COMMANDLINE_BOOTSTRAP_PATCH, playable_manifest_stack())

    def test_chooses_canonical_playable_when_no_override(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            playable = Path(temp) / "G7MTClient.playable.exe"
            playable.write_bytes(b"playable")

            plan = choose_ui_explorer_launch(
                no_patch=False,
                patched_exe=None,
                lobby_unblock_patch=False,
                canonical_playable_exe=playable,
            )

        self.assertEqual(plan.mode, ClientLaunchMode.CANONICAL_PLAYABLE)
        self.assertEqual(plan.source, playable)
        self.assertTrue(plan.uses_backup)

    def test_no_patch_preserves_installed_exe(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            playable = Path(temp) / "G7MTClient.playable.exe"
            playable.write_bytes(b"playable")

            plan = choose_ui_explorer_launch(
                no_patch=True,
                patched_exe=None,
                lobby_unblock_patch=False,
                canonical_playable_exe=playable,
            )

        self.assertEqual(plan.mode, ClientLaunchMode.NO_PATCH)
        self.assertIsNone(plan.source)
        self.assertFalse(plan.uses_backup)

    def test_explicit_patch_overrides_canonical_playable(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            temp_path = Path(temp)
            playable = temp_path / "G7MTClient.playable.exe"
            explicit = temp_path / "probe.exe"
            playable.write_bytes(b"playable")
            explicit.write_bytes(b"probe")

            plan = choose_ui_explorer_launch(
                no_patch=False,
                patched_exe=explicit,
                lobby_unblock_patch=False,
                canonical_playable_exe=playable,
            )

        self.assertEqual(plan.mode, ClientLaunchMode.EXPLICIT_EXE)
        self.assertEqual(plan.source, explicit)
        self.assertTrue(plan.uses_backup)

    def test_verifies_against_session_start_sha_not_vanilla_constant(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            client = Path(temp) / "G7MTClient.exe"
            client.write_bytes(b"playable")
            expected_sha = _sha256(b"playable")

            status = verify_client_sha(client, expected_sha256=expected_sha)

        self.assertEqual(status.sha256, expected_sha)
        self.assertTrue(status.verified)
        self.assertEqual(label_for_sha(status.sha256), status.label)


if __name__ == "__main__":
    unittest.main()
