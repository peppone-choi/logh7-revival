import json
import hashlib
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

try:
    from test_logh7_pipeline import REPO_ROOT, TOOL
except ModuleNotFoundError:
    from tools.tests.test_logh7_pipeline import REPO_ROOT, TOOL

from tools.logh7_player_runtime import player_launcher_manifest


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
            playable_client_fixture = temp_path / "G7MTClient.playable.exe"
            playable_client_fixture.write_bytes(
                client_fixture.replace(b"202.8.80.179", b"127.0.0.1\x00\x00\x00")
                + b"\x00menufix\x00dlgfix\x00earlygrid-ringclear\x00strat-camera-focus\x00font-face\x00font-cleartype"
            )
            playable_sha = hashlib.sha256(playable_client_fixture.read_bytes()).hexdigest()
            playable_client_fixture.with_name(f"{playable_client_fixture.stem}.playable-manifest.json").write_text(
                json.dumps(
                    {
                        "outSha256": playable_sha,
                        "stack": [
                            "menufix",
                            "dlgfix",
                            "earlygrid-ringclear",
                            "strat-camera-focus",
                            "font-face",
                            "font-cleartype",
                        ],
                    },
                    ensure_ascii=False,
                    indent=2,
                )
                + "\n",
                encoding="utf-8",
            )
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
                    "--playable-client",
                    str(playable_client_fixture),
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
            self.assertEqual(patched_client, playable_client_fixture.read_bytes())
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
            self.assertEqual(
                installed_manifest["runtime"]["playableClient"],
                {
                    "path": "exe/G7MTClient.exe",
                    "mode": "explicit-playable-client",
                    "source": str(playable_client_fixture),
                    "manifest": str(
                        playable_client_fixture.with_name(f"{playable_client_fixture.stem}.playable-manifest.json")
                    ),
                    "sha256": next(
                        entry["sha256"]
                        for entry in installed_manifest["entries"]
                        if entry["path"] == "exe/G7MTClient.exe"
                    ),
                    "expectedSha256": next(
                        entry["sha256"]
                        for entry in installed_manifest["entries"]
                        if entry["path"] == "exe/G7MTClient.exe"
                    ),
                    "stack": [
                        "menufix",
                        "dlgfix",
                        "earlygrid-ringclear",
                        "strat-camera-focus",
                        "font-face",
                        "font-cleartype",
                    ],
                    "requiredStack": [
                        "menufix",
                        "dlgfix",
                        "earlygrid-ringclear",
                        "strat-camera-focus",
                        "font-face",
                        "font-cleartype",
                    ],
                    "reason": "Launcher enables LOGH_STRAT_GRID_EARLY, which requires earlygrid-ringclear.",
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
            self.assertIn("LOGH7Launcher.exe", {entry["path"] for entry in installed_manifest["entries"]})
            self.assertIn("exe/D3D8.dll", {entry["path"] for entry in installed_manifest["entries"]})
            self.assertIn("exe/dgVoodoo.conf", {entry["path"] for entry in installed_manifest["entries"]})
            self.assertIn("logh7-runtime/src/server/logh7-server.mjs", {entry["path"] for entry in installed_manifest["entries"]})
            self.assertIn("logh7-runtime/content/logh7-content.db", {entry["path"] for entry in installed_manifest["entries"]})
            self.assertIn("logh7-runtime/content/scenarios/canon-801-07.json", {entry["path"] for entry in installed_manifest["entries"]})
            self.assertIn("logh7-runtime/content/roster/ability-seed.json", {entry["path"] for entry in installed_manifest["entries"]})
            self.assertIn("logh7-runtime/launcher/LOGH7Launcher.cs", {entry["path"] for entry in installed_manifest["entries"]})
            self.assertIn("tools/packaging/install-pretendard.ps1", {entry["path"] for entry in installed_manifest["entries"]})
            self.assertIn("LOGH7-FILE-LAYOUT.txt", {entry["path"] for entry in installed_manifest["entries"]})
            self.assertIn("WINDOWS-COMPATIBILITY.txt", {entry["path"] for entry in installed_manifest["entries"]})
            self.assertGreater((out / "LOGH7Launcher.exe").stat().st_size, 0)
            launcher_source = (
                out / "logh7-runtime" / "launcher" / "LOGH7Launcher.cs"
            ).read_text(encoding="utf-8")
            self.assertIn("serve-auth", launcher_source)
            self.assertIn("LOGH_LOBBY_RICH_CHARACTERS", launcher_source)
            self.assertIn("LOGH_LOBBY_EARLY_OK", launcher_source)
            self.assertIn("LOGH_STRAT_GALAXY", launcher_source)
            self.assertIn("LOGH_STRAT_GRID_EARLY", launcher_source)
            self.assertIn("LOGH_STRAT_TERRAIN", launcher_source)
            self.assertIn("LOGH_WORLD_IMPORT_BASES", launcher_source)
            self.assertIn("LOGH_FULL_UNIT_LOCATION", launcher_source)
            self.assertIn("LOGH_BASE_ECONOMY", launcher_source)
            self.assertIn("LOGH_STATIC_SHIPS", launcher_source)
            self.assertIn("LOGH_ADMIN_PORT", launcher_source)
            self.assertIn("LOGH_ADMIN_TOKEN", launcher_source)
            self.assertIn("LOGH_REPOSITORY_BACKEND", launcher_source)
            self.assertIn("LOGH_SQLITE_PATH", launcher_source)
            self.assertIn("InstallFonts", launcher_source)
            self.assertIn("ResolveDisplayMode", launcher_source)
            self.assertIn("ConfigureDgVoodooDisplayMode", launcher_source)
            self.assertIn("GwlExStyle", launcher_source)
            self.assertIn("dgVoodooWatermark", launcher_source)
            self.assertIn("WatermarkDisplayDuration", launcher_source)
            self.assertIn("--display-mode", launcher_source)
            self.assertIn("LOGH_POSTLOAD_RICH_CHARACTER", launcher_source)
            self.assertIn('private const string BootstrapAccount = "ginei00";', launcher_source)
            self.assertIn('private const string BootstrapPassword = "dummy";', launcher_source)
            self.assertIn("EnsureBootstrapAccount(paths);\n                    server = StartServer(paths);", launcher_source)
            self.assertIn("--password-stdin", launcher_source)
            self.assertNotIn('"admin", "create", account, password', launcher_source)
            self.assertIn("AppCompatFlags", (out / "setup-local.ps1").read_text(encoding="utf-8"))
            self.assertIn("LOGH7Launcher.exe", (out / "launch-client.ps1").read_text(encoding="utf-8"))
            self.assertEqual(
                installed_manifest["runtime"]["windowsCompatibility"]["scripts"],
                ["setup-local.ps1", "launch-client.ps1", "WINDOWS-COMPATIBILITY.txt"],
            )
            self.assertEqual(
                installed_manifest["runtime"]["playerLauncher"],
                {
                    "exe": "LOGH7Launcher.exe",
                    "clientExe": "exe/G7MTClient.exe",
                    "serverEntry": "logh7-runtime/src/server/logh7-server.mjs",
                    "stateDir": "logh7-runtime/state",
                    "accountDb": "logh7-runtime/state/accounts.sqlite",
                    "worldStateDb": "logh7-runtime/state/world-state.sqlite",
                    "signupCommand": "LOGH7Launcher.exe --signup",
                    "signupSmokeCommand": "LOGH7Launcher.exe --signup-smoke",
                    "adminUrl": "http://127.0.0.1:47910/admin/session-state",
                    "mode": "local-authoritative-server-plus-client",
                },
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

    def test_launcher_signup_path(self) -> None:
        launcher_source = (REPO_ROOT / "tools" / "launcher" / "LOGH7Launcher.cs").read_text(encoding="utf-8")
        manifest = player_launcher_manifest()

        self.assertEqual(manifest["accountDb"], "logh7-runtime/state/accounts.sqlite")
        self.assertEqual(manifest["worldStateDb"], "logh7-runtime/state/world-state.sqlite")
        self.assertEqual(manifest["signupCommand"], "LOGH7Launcher.exe --signup")
        self.assertEqual(manifest["signupSmokeCommand"], "LOGH7Launcher.exe --signup-smoke")
        self.assertEqual(manifest["adminUrl"], "http://127.0.0.1:47910/admin/session-state")
        self.assertIn("--signup", launcher_source)
        self.assertIn("--signup-smoke", launcher_source)
        self.assertIn("LOGH_ADMIN_PORT", launcher_source)
        self.assertIn("LOGH_ADMIN_TOKEN", launcher_source)
        self.assertIn("LOGH_REPOSITORY_BACKEND", launcher_source)
        self.assertIn("LOGH_SQLITE_PATH", launcher_source)
        self.assertIn("install-pretendard.ps1", launcher_source)
        self.assertIn("회원가입", launcher_source)
        self.assertIn("계정 등록이 완료되었습니다", launcher_source)
        self.assertIn("paths.AccountDb", launcher_source)
        self.assertIn('private const string BootstrapAccount = "ginei00";', launcher_source)
        self.assertIn('private const string BootstrapPassword = "dummy";', launcher_source)
        self.assertIn("EnsureBootstrapAccount(paths);\n                    server = StartServer(paths);", launcher_source)
        self.assertIn("\"admin\"", launcher_source)
        self.assertIn("\"create\"", launcher_source)
        self.assertIn("--password-stdin", launcher_source)
        self.assertIn("RedirectStandardInput", launcher_source)
        self.assertNotIn('"admin", "create", account, password', launcher_source)
        self.assertIn("\"exists\"", launcher_source)
        self.assertNotIn("LOGH_NPC_AI", launcher_source)
        self.assertNotIn("LOGH_RELAY", launcher_source)
        self.assertNotIn("LOGH_DUTY_CARDS_POSTLOAD", launcher_source)

    def test_build_installed_rejects_explicit_playable_without_ringclear(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            temp_path = Path(temp)
            extracted = temp_path / "extracted"
            install_root = extracted / "root"
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

            unringcleared = temp_path / "G7MTClient.playable.exe"
            unringcleared.write_bytes(client_fixture.replace(b"202.8.80.179", b"127.0.0.1\x00\x00\x00"))
            unringcleared_sha = hashlib.sha256(unringcleared.read_bytes()).hexdigest()
            unringcleared.with_name(f"{unringcleared.stem}.playable-manifest.json").write_text(
                json.dumps(
                    {
                        "outSha256": unringcleared_sha,
                        "stack": ["menufix", "dlgfix"],
                    },
                    ensure_ascii=False,
                    indent=2,
                )
                + "\n",
                encoding="utf-8",
            )

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
                    "--playable-client",
                    str(unringcleared),
                ],
                cwd=REPO_ROOT,
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                check=False,
            )

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("earlygrid-ringclear", result.stderr)


if __name__ == "__main__":
    unittest.main()
