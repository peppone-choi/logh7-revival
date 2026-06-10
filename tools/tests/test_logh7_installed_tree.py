import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from test_logh7_pipeline import REPO_ROOT, TOOL


class Logh7InstalledTreeTests(unittest.TestCase):
    def test_build_installed_copies_detected_install_root_and_iso_launcher(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            temp_path = Path(temp)
            extracted = temp_path / "extracted"
            install_root = extracted / "garbled" / "root"
            iso_root = temp_path / "iso-root"
            out = temp_path / "installed"
            manifest = temp_path / "installed-manifest.json"
            (install_root / "exe").mkdir(parents=True)
            (install_root / "data" / "MsgDat").mkdir(parents=True)
            iso_root.mkdir()
            (install_root / "update.ini").write_bytes(b"[UPDATE]\r\nVERSION=131\r\nBASE_DIR=.\\\r\n")
            (install_root / "Gin7UpdateClient.exe").write_bytes(b"updater")
            client_fixture = b"\x00".join(
                [
                    b"client",
                    b"ginei00",
                    b"47900",
                    b"202.8.80.179",
                    b"usage : >robot <login-server address> <login-server port> <session-server name>",
                    b"LobbyLoginRequest",
                    b"SSLoginRequest",
                    b"RequestWorldInitialize",
                ]
            )
            (install_root / "exe" / "G7MTClient.exe").write_bytes(client_fixture)
            (install_root / "data" / "MsgDat" / "constmsg.dat").write_bytes(b"messages")
            (iso_root / "g7start.exe").write_bytes(b"launcher")
            (iso_root / "dsetup.dll").write_bytes(b"directx-setup-runtime")
            (iso_root / "dsetup32.dll").write_bytes(b"directx-setup32-runtime")

            result = subprocess.run(
                [
                    sys.executable,
                    str(TOOL),
                    "build-installed",
                    str(extracted),
                    "--iso-root",
                    str(iso_root),
                    "--out",
                    str(out),
                    "--manifest-out",
                    str(manifest),
                ],
                cwd=REPO_ROOT,
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                check=False,
            )

            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual((out / "G7Start.exe").read_bytes(), b"launcher")
            self.assertEqual((out / "DSETUP.dll").read_bytes(), b"directx-setup-runtime")
            self.assertEqual((out / "DSETUP32.dll").read_bytes(), b"directx-setup32-runtime")
            patched_client = (out / "exe" / "G7MTClient.exe").read_bytes()
            self.assertNotIn(b"202.8.80.179", patched_client)
            self.assertIn(b"127.0.0.1\x00\x00\x00", patched_client)
            self.assertEqual((out / "data" / "MsgDat" / "constmsg.dat").read_bytes(), b"messages")
            installed_manifest = json.loads(manifest.read_text(encoding="utf-8"))
            self.assertEqual(installed_manifest["installRoot"], str(install_root))
            self.assertEqual(
                installed_manifest["server"]["update"],
                {
                    "VERSION": 131,
                    "BASE_DIR": ".\\",
                    "SERVER_ADDRESS": "127.0.0.1",
                    "SERVER_PORT": 4787,
                    "PORT": 47900,
                },
            )
            self.assertEqual(
                installed_manifest["server"]["gameplay"],
                {
                    "MODE": "tcp-capture-stub",
                    "HOST": "127.0.0.1",
                    "PORT": 47900,
                    "LEGACY_ADDRESS": "202.8.80.179",
                    "CLIENT_LITERAL": "ginei00",
                },
            )
            self.assertEqual(installed_manifest["server"]["clientProtocol"]["defaults"]["account"], "ginei00")
            self.assertEqual(installed_manifest["server"]["clientProtocol"]["defaults"]["loginServerPort"], 47900)
            self.assertEqual(installed_manifest["server"]["clientProtocol"]["defaults"]["loginServerAddress"], "127.0.0.1")
            self.assertEqual(
                installed_manifest["runtime"]["clientAddressPatch"],
                {
                    "path": "exe/G7MTClient.exe",
                    "legacyAddress": "202.8.80.179",
                    "localAddress": "127.0.0.1",
                    "reason": "Real login UI sent the first observed packet only after this generated-client redirect.",
                },
            )
            self.assertIn(
                "LobbyLoginRequest",
                installed_manifest["server"]["clientProtocol"]["messageGroups"]["login"],
            )
            self.assertIn(
                "SSLoginRequest",
                installed_manifest["server"]["clientProtocol"]["messageGroups"]["session"],
            )
            self.assertIn(
                "RequestWorldInitialize",
                installed_manifest["server"]["clientProtocol"]["messageGroups"]["world"],
            )
            self.assertIn("G7Start.exe", {entry["path"] for entry in installed_manifest["entries"]})
            self.assertIn("DSETUP.dll", {entry["path"] for entry in installed_manifest["entries"]})
            self.assertIn("DSETUP32.dll", {entry["path"] for entry in installed_manifest["entries"]})
            self.assertIn("exe/G7MTClient.exe", {entry["path"] for entry in installed_manifest["entries"]})
            self.assertIn("setup-local.ps1", {entry["path"] for entry in installed_manifest["entries"]})
            self.assertIn("launch-client.ps1", {entry["path"] for entry in installed_manifest["entries"]})
            self.assertIn("WINDOWS-COMPATIBILITY.txt", {entry["path"] for entry in installed_manifest["entries"]})
            self.assertIn("AppCompatFlags", (out / "setup-local.ps1").read_text(encoding="utf-8"))
            self.assertIn("String.txt.original", (out / "launch-client.ps1").read_text(encoding="utf-8"))
            self.assertEqual(
                installed_manifest["runtime"]["windowsCompatibility"]["scripts"],
                ["setup-local.ps1", "launch-client.ps1", "WINDOWS-COMPATIBILITY.txt"],
            )
            self.assertEqual(
                installed_manifest["runtime"]["launcherDependencies"],
                [
                    {
                        "path": "DSETUP.dll",
                        "source": str(iso_root / "dsetup.dll"),
                        "reason": "G7Start.exe imports DSETUP.dll",
                    },
                    {
                        "path": "DSETUP32.dll",
                        "source": str(iso_root / "dsetup32.dll"),
                        "reason": "DirectX setup runtime paired with DSETUP.dll",
                    },
                ],
            )


if __name__ == "__main__":
    unittest.main()
