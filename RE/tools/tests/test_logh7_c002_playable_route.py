import argparse
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from tools import logh7_c002_playable_route as route


class _FakeResponse:
    def __init__(self, payload: bytes) -> None:
        self._payload = payload

    def __enter__(self):
        return self

    def __exit__(self, *_exc):
        return False

    def read(self) -> bytes:
        return self._payload


class C002PlayableRouteAdminTests(unittest.TestCase):
    def _args(self, session: Path) -> argparse.Namespace:
        return argparse.Namespace(
            session=session,
            server_root=route.DEFAULT_SERVER_ROOT,
            port=47900,
            display_mode="windowed",
            start_settle=0.1,
            admin_snapshot=True,
            admin_port=0,
            admin_token="c002-playable-route-token",
            admin_url=None,
            admin_timeout=0.1,
            admin_command_tail=20,
            server_env=[],
            dev_grid_fallback=True,
            dev_grid_fallback_system="バーラト",
            dev_grid_fallback_cell=None,
        )

    def test_start_command_enables_ephemeral_admin_snapshot(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            args = self._args(Path(tmp))
            command = route._start_command(args)

        self.assertIn("--env", command)
        self.assertIn("LOGH_ADMIN_PORT=0", command)
        self.assertIn("LOGH_ADMIN_TOKEN=c002-playable-route-token", command)
        self.assertIn("LOGH_DEV_GRID_MOVE_FALLBACK_CELL=2115", command)

    def test_start_command_preserves_extra_server_env(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            args = self._args(Path(tmp))
            args.server_env = ["LOGH_TEST_FLAG=1"]
            command = route._start_command(args)

        self.assertIn("LOGH_TEST_FLAG=1", command)

    def test_start_command_can_disable_dev_grid_fallback(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            args = self._args(Path(tmp))
            args.dev_grid_fallback = False
            command = route._start_command(args)

        self.assertNotIn("LOGH_DEV_GRID_MOVE_FALLBACK_CELL=2115", command)

    def test_fetch_admin_snapshot_keeps_session_readiness_summary(self) -> None:
        payload = {
            "counts": {"commandRecords": 1},
            "world": {
                "recentCommands": [{"innerCode": 0x0B01}],
                "commandTargets": {"characters": [{"id": 11}], "outfits": [{"id": 1001}]},
                "devCommandCatalog": {
                    "factoryAnchors": [{"factoryIdHex": "0x002b"}],
                    "cards": [{}, {}],
                },
                "devCommandReadiness": {
                    "totalCards": 2,
                    "totalCommands": 81,
                    "executableCommands": 81,
                    "blockedCommands": 0,
                    "unknownTargetCommands": 0,
                },
            },
            "sessions": [
                {
                    "sessionId": 1,
                    "commandRecords": 1,
                    "commandTargets": {"characters": [{"id": 11}], "outfits": [{"id": 1001}]},
                    "devCommandCatalog": {"factoryAnchors": [{"factoryIdHex": "0x002b"}]},
                    "devCommandReadiness": {
                        "totalCards": 2,
                        "totalCommands": 81,
                        "executableCommands": 81,
                        "blockedCommands": 0,
                        "unknownTargetCommands": 0,
                    },
                }
            ],
        }
        with tempfile.TemporaryDirectory() as tmp:
            args = self._args(Path(tmp))
            args.admin_url = "http://127.0.0.1:1/admin/session-state"
            with patch.object(route.urllib.request, "urlopen", return_value=_FakeResponse(json.dumps(payload).encode("utf-8"))):
                snapshot = route._fetch_admin_snapshot(args, Path(tmp))

        self.assertEqual(snapshot["commandRecords"], 1)
        self.assertEqual(snapshot["worldReadiness"]["executableCommands"], 81)
        self.assertEqual(snapshot["worldReadiness"]["targetCounts"]["characters"], 1)
        self.assertEqual(snapshot["worldFactoryAnchors"], ["0x002b"])
        self.assertEqual(snapshot["sessions"][0]["readiness"]["executableCommands"], 81)
        self.assertEqual(snapshot["sessions"][0]["readiness"]["targetCounts"]["outfits"], 1)
        self.assertEqual(snapshot["sessions"][0]["factoryAnchors"], ["0x002b"])

    def test_factory_provenance_records_static_anchors(self) -> None:
        provenance = route._factory_provenance("0x002b,0x0041")

        self.assertTrue(provenance["devOnly"])
        self.assertEqual(provenance["unknownFactoryIds"], [])
        anchors = {anchor["factoryId"]: anchor for anchor in provenance["anchors"]}
        self.assertEqual(anchors["0x002b"]["function"], "FUN_00581c80")
        self.assertEqual(anchors["0x002b"]["request"], "0x0b01")
        self.assertEqual(anchors["0x002b"]["response"], "0x0b07")
        self.assertEqual(anchors["0x0041"]["function"], "FUN_00584c90")

    def test_route_verification_accepts_proven_live_shape(self) -> None:
        summary = {
            "devOnly": True,
            "factoryProvenance": route._factory_provenance("0x002b,0x0041"),
            "steps": [
                {"name": "start", "returncode": 0},
                {"name": "game-start", "returncode": 0},
                {"name": "select-character", "returncode": 0},
                {"name": "inject-dispatch-command", "returncode": 0},
                {"name": "target-grid-cell", "returncode": 0},
                {"name": "confirm-command", "returncode": 0},
                {"name": "wait-trace-0x0b01", "returncode": 0},
                {"name": "wait-trace-0x0b07", "returncode": 0},
                {"name": "stop-at-end", "returncode": 0},
            ],
            "adminSnapshot": {
                "ok": True,
                "recentCommands": [{"innerCode": 0x0B01, "accept": True, "effect": "fleet-grid-move"}],
                "worldReadiness": {"totalCommands": 81, "executableCommands": 81},
                "worldFactoryAnchors": ["0x002b", "0x0041"],
                "sessions": [{"sessionId": 1, "readiness": {"totalCommands": 81, "executableCommands": 81}}],
            },
        }

        verification = route._route_verification(summary)

        self.assertTrue(verification["ok"])
        self.assertEqual(verification["errors"], [])
        self.assertTrue(verification["proven"]["accepted0b01"])
        self.assertIn("0x002b", verification["proven"]["factoryAnchors"])

    def test_route_verification_accepts_successful_stop_retry(self) -> None:
        summary = {
            "devOnly": True,
            "factoryProvenance": route._factory_provenance("0x002b,0x0041"),
            "steps": [
                {"name": "start", "returncode": 0},
                {"name": "game-start", "returncode": 0},
                {"name": "select-character", "returncode": 0},
                {"name": "inject-dispatch-command", "returncode": 0},
                {"name": "target-grid-cell", "returncode": 0},
                {"name": "confirm-command", "returncode": 0},
                {"name": "wait-trace-0x0b01", "returncode": 0},
                {"name": "wait-trace-0x0b07", "returncode": 0},
                {"name": "stop-at-end", "returncode": 1},
                {"name": "stop-at-end-retry-2", "returncode": 0},
            ],
            "adminSnapshot": {
                "ok": True,
                "recentCommands": [{"innerCode": 0x0B01, "accept": True, "effect": "fleet-grid-move"}],
                "worldReadiness": {"totalCommands": 81, "executableCommands": 81},
                "worldFactoryAnchors": ["0x002b", "0x0041"],
                "sessions": [{"sessionId": 1, "readiness": {"totalCommands": 81, "executableCommands": 81}}],
            },
        }

        verification = route._route_verification(summary)

        self.assertTrue(verification["ok"])
        self.assertEqual(verification["errors"], [])
        self.assertIn("0x002b", verification["proven"]["adminFactoryAnchors"])

    def test_route_verification_flags_missing_authoritative_command(self) -> None:
        summary = {
            "devOnly": True,
            "factoryProvenance": route._factory_provenance("0x002b,0x0041"),
            "steps": [
                {"name": "start", "returncode": 0},
                {"name": "game-start", "returncode": 0},
                {"name": "select-character", "returncode": 0},
                {"name": "inject-dispatch-command", "returncode": 0},
                {"name": "target-grid-cell", "returncode": 0},
                {"name": "confirm-command", "returncode": 0},
                {"name": "wait-trace-0x0b01", "returncode": 0},
                {"name": "wait-trace-0x0b07", "returncode": 0},
                {"name": "stop-at-end", "returncode": 0},
            ],
            "adminSnapshot": {
                "ok": True,
                "recentCommands": [],
                "worldReadiness": {"totalCommands": 81, "executableCommands": 81},
            },
        }

        verification = route._route_verification(summary)

        self.assertFalse(verification["ok"])
        self.assertIn("no accepted 0x0b01 fleet-grid-move in admin recentCommands", verification["errors"])

    def test_dev_grid_fallback_cell_resolves_bharat_from_content(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            args = self._args(Path(tmp))
            args.server_root = route.DEFAULT_SERVER_ROOT

            self.assertEqual(route._dev_grid_fallback_cell(args), 2115)

    def test_admin_session_state_url_parses_ui_explorer_server_log(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            session = Path(tmp)
            (session / "server.log").write_text(
                "LOGH7 authoritative login server listening on 127.0.0.1:47900 "
                "[admin: http://127.0.0.1:49321/admin]\n",
                encoding="utf-8",
            )
            args = self._args(session)

            self.assertEqual(
                route._admin_session_state_url(args),
                "http://127.0.0.1:49321/admin/session-state",
            )

    def test_admin_session_state_url_uses_explicit_url_for_no_start_runs(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            args = self._args(Path(tmp))
            args.admin_url = "http://127.0.0.1:48888/admin/session-state"

            self.assertEqual(route._admin_session_state_url(args), args.admin_url)


if __name__ == "__main__":
    unittest.main()
