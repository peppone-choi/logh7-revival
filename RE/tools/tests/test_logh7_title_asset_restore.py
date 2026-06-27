from __future__ import annotations

import importlib.util
import tempfile
import unittest
from pathlib import Path

from tools.logh7_build_playable_client import restore_official_login_title


ROOT = Path(__file__).resolve().parents[2]


def _load_client_package_module():
    module_path = ROOT / "client" / "tools" / "package_client.py"
    spec = importlib.util.spec_from_file_location("client_package_client", module_path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load {module_path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class Logh7TitleAssetRestoreTests(unittest.TestCase):
    def test_deploy_restore_uses_official_original_logo_asset(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            menu = root / "data" / "image" / "gamemenu"
            menu.mkdir(parents=True)
            official = menu / "title_korea.original.tga"
            generated = menu / "title_korea.tga"
            alias = menu / "title.tga"
            official.write_bytes(b"official-original-logo")
            generated.write_bytes(b"generated-overlay")

            result = restore_official_login_title(root)

            self.assertTrue(result["restored"])
            self.assertEqual(generated.read_bytes(), b"official-original-logo")
            self.assertEqual(alias.read_bytes(), b"official-original-logo")

    def test_deploy_restore_fails_closed_when_official_asset_is_missing(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            menu = root / "data" / "image" / "gamemenu"
            menu.mkdir(parents=True)
            generated = menu / "title_korea.tga"
            generated.write_bytes(b"generated-overlay")

            with self.assertRaises(SystemExit):
                restore_official_login_title(root)
            self.assertEqual(generated.read_bytes(), b"generated-overlay")

    def test_client_package_restore_replaces_generated_overlay_entries(self) -> None:
        package_client = _load_client_package_module()
        with tempfile.TemporaryDirectory() as td:
            out = Path(td)
            menu = out / "data" / "image" / "gamemenu"
            menu.mkdir(parents=True)
            official = menu / "title_korea.original.tga"
            generated = menu / "title_korea.tga"
            alias = menu / "title.tga"
            official.write_bytes(b"official-original-logo")
            generated.write_bytes(b"generated-overlay")
            alias.write_bytes(b"generated-overlay")
            entries: list[dict[str, str]] = [
                package_client.entry_for_file(out, generated, "client runtime"),
                package_client.entry_for_file(out, alias, "client runtime"),
            ]

            package_client.restore_original_title_assets(out, entries)

            self.assertEqual(generated.read_bytes(), b"official-original-logo")
            self.assertEqual(alias.read_bytes(), b"official-original-logo")
            reasons = {entry["path"]: entry["reason"] for entry in entries}
            self.assertEqual(
                reasons["data/image/gamemenu/title_korea.tga"],
                "client runtime (official original-logo Korean title)",
            )
            self.assertEqual(
                reasons["data/image/gamemenu/title.tga"],
                "client runtime (official original-logo Korean title)",
            )

    def test_client_package_restore_fails_closed_when_official_asset_is_missing(self) -> None:
        package_client = _load_client_package_module()
        with tempfile.TemporaryDirectory() as td:
            out = Path(td)
            menu = out / "data" / "image" / "gamemenu"
            menu.mkdir(parents=True)
            generated = menu / "title_korea.tga"
            generated.write_bytes(b"generated-overlay")
            entries = [package_client.entry_for_file(out, generated, "client runtime")]

            with self.assertRaises(package_client.ClientPackageError):
                package_client.restore_original_title_assets(out, entries)
            self.assertEqual(generated.read_bytes(), b"generated-overlay")


if __name__ == "__main__":
    unittest.main()
