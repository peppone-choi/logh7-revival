from __future__ import annotations

import hashlib
import json
import os
import struct
import subprocess
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from tools.live import logh7_wine_live_qa as live_qa


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _write_json(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, sort_keys=True) + "\n", encoding="utf-8")


def _write_fake_pe(path: Path, *, timestamp: int = 0x65A1B2C3, image_base: int = 0x00400000) -> None:
    data = bytearray(0x400)
    data[:2] = b"MZ"
    pe_offset = 0x80
    struct.pack_into("<I", data, 0x3C, pe_offset)
    data[pe_offset : pe_offset + 4] = b"PE\0\0"
    struct.pack_into("<H", data, pe_offset + 4, 0x014C)
    struct.pack_into("<H", data, pe_offset + 6, 1)
    struct.pack_into("<I", data, pe_offset + 8, timestamp)
    struct.pack_into("<H", data, pe_offset + 20, 0x00E0)
    optional = pe_offset + 24
    struct.pack_into("<H", data, optional, 0x010B)
    struct.pack_into("<I", data, optional + 28, image_base)
    data[0x200:0x204] = bytes.fromhex("deadbeef")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)


class FakeLiveQaFixture:
    RUN_ID = "20260716T130000Z-test01"

    def __init__(self, root: Path) -> None:
        self.root = root
        self.repo = root / "repo"
        self.repo.mkdir()
        self.home = root / "home"
        self.home.mkdir()
        self.wine_bin_dir = root / "Wine Stable.app" / "Contents" / "Resources" / "wine" / "bin"
        self.wine_bin_dir.mkdir(parents=True)
        self.wine = self._fake_executable("wine")
        self.wineboot = self.wine_bin_dir / "wineboot"
        self.wineboot.symlink_to(self.wine.name)
        self.wineserver = self._fake_executable("wineserver")

        self.canonical = self.repo / "artifacts" / "canonical" / "G7MTClient.exe"
        self.working = self.repo / "work" / "working" / "G7MTClient.exe"
        self.backup = self.repo / "work" / "backup" / "G7MTClient.exe.bak"
        self.rollback = self.repo / "work" / "rollback" / "G7MTClient.exe.rollback"
        for path in (self.canonical, self.working, self.backup, self.rollback):
            _write_fake_pe(path)
        self.client_sha = _sha256(self.working)
        os.chmod(self.canonical, 0o444)

        self.graphic_config = self.working.parent / "GraphicConfig.txt"
        self.d3d8 = self.working.parent / "D3D8.dll"
        self.dgvoodoo_config = self.working.parent / "dgVoodoo.conf"
        self.graphic_config.write_bytes(b"Width=1920\nHeight=1080\n")
        self.d3d8.write_bytes(b"synthetic-d3d8-wrapper\n")
        self.dgvoodoo_config.write_bytes(b"FullScreenMode=false\n")
        self.data_root = self.working.parent.parent / "data"
        self.data_root.mkdir()
        data_entries = []
        for index in range(live_qa.EXPECTED_DATA_FILE_COUNT):
            relative = f"synthetic/file-{index:04d}.bin"
            data_file = self.data_root / relative
            data_file.parent.mkdir(parents=True, exist_ok=True)
            data_file.write_bytes(f"fixture-{index}\n".encode("ascii"))
            data_entries.append(
                {"path": relative, "sha256": _sha256(data_file), "size": data_file.stat().st_size}
            )

        self.patch_receipt = self.repo / "receipts" / "copy-stage.json"
        _write_json(self.patch_receipt, {"copied": True, "sourceSha256": self.client_sha})
        self.lineage_manifest = self.repo / "manifests" / "client-lineage.json"
        self.lineage = {
            "canonical": {
                "path": str(self.canonical),
                "readOnly": True,
                "sha256": self.client_sha,
            },
            "lineageStatus": "complete",
            "project": live_qa.PROJECT_ID,
            "schemaVersion": 1,
            "sentinel": live_qa.LINEAGE_SENTINEL,
            "stages": [
                {
                    "backup": {"path": str(self.backup), "sha256": self.client_sha},
                    "id": "canonical-working-copy",
                    "inputSha256": self.client_sha,
                    "outputSha256": self.client_sha,
                    "receipt": {"path": str(self.patch_receipt), "sha256": _sha256(self.patch_receipt)},
                    "rollback": {"path": str(self.rollback), "sha256": self.client_sha},
                }
            ],
            "working": {
                "imageBase": "0x00400000",
                "path": str(self.working),
                "peTimestamp": "0x65a1b2c3",
                "sentinels": [{"hex": "deadbeef", "offset": "0x200"}],
                "sha256": self.client_sha,
                "workingCopy": True,
            },
        }
        _write_json(self.lineage_manifest, self.lineage)

        self.data_tree_manifest = self.repo / "manifests" / "data-tree-manifest.json"
        _write_json(
            self.data_tree_manifest,
            {
                "fileCount": len(data_entries),
                "files": data_entries,
                "project": live_qa.PROJECT_ID,
                "provenance": {"method": "synthetic full inventory", "source": "unit fixture"},
                "root": str(self.data_root),
                "runId": self.RUN_ID,
                "schemaVersion": 1,
                "sentinel": live_qa.DATA_TREE_SENTINEL,
                "totalBytes": sum(entry["size"] for entry in data_entries),
                "treeSha256": live_qa._data_tree_digest(data_entries),
            },
        )
        self.runtime_support_manifest = self.repo / "manifests" / "runtime-support.json"
        _write_json(
            self.runtime_support_manifest,
            {
                "clientRelativePath": "working/G7MTClient.exe",
                "dataInventory": {
                    "path": str(self.data_tree_manifest),
                    "sha256": _sha256(self.data_tree_manifest),
                },
                "drive": {
                    "hostRoot": str(self.working.parent.parent),
                    "letter": "R:",
                    "windowsInstallRoot": "R:\\",
                },
                "files": [
                    {
                        "path": str(path),
                        "provenance": "synthetic unit fixture",
                        "role": role,
                        "sha256": _sha256(path),
                        "size": path.stat().st_size,
                    }
                    for role, path in (
                        ("graphic-config", self.graphic_config),
                        ("d3d8", self.d3d8),
                        ("dgvoodoo-config", self.dgvoodoo_config),
                    )
                ],
                "installedRoot": str(self.working.parent.parent),
                "profile": "1080p-dgvoodoo",
                "project": live_qa.PROJECT_ID,
                "provenance": {"method": "synthetic exact hashes", "source": "unit fixture"},
                "runId": self.RUN_ID,
                "schemaVersion": 1,
                "sentinel": live_qa.RUNTIME_SUPPORT_SENTINEL,
            },
        )

        self.run9_index = self.repo / "evidence" / "run9" / "index.json"
        run9_id = "run9-redacted"
        artifacts = []
        for kind in live_qa.RUN9_REQUIRED_KINDS:
            artifact = self.run9_index.parent / f"{kind}.json"
            _write_json(
                artifact,
                {
                    "kind": kind,
                    "project": live_qa.PROJECT_ID,
                    "runId": run9_id,
                    "schemaVersion": 1,
                    "verdict": "pass",
                },
            )
            artifacts.append({"kind": kind, "path": artifact.name, "sha256": _sha256(artifact)})
        _write_json(
            self.run9_index,
            {
                "artifacts": artifacts,
                "project": live_qa.PROJECT_ID,
                "runId": run9_id,
                "schemaVersion": 1,
                "verdict": "pass",
            },
        )

        self.prefix = root / "wine-prefixes" / self.RUN_ID
        live_qa.prepare_prefix_marker(self.prefix, self.repo.resolve(), self.RUN_ID)
        self.system_reg = self.prefix / "system.reg"
        self.write_prefix_architecture("win32")
        self.drive_c = self.prefix / "drive_c"
        self.drive_c.mkdir()
        self.dosdevices = self.prefix / "dosdevices"
        self.dosdevices.mkdir()
        (self.dosdevices / "c:").symlink_to(self.drive_c)
        (self.dosdevices / "z:").symlink_to("/")

    def _fake_executable(self, name: str) -> Path:
        path = self.wine_bin_dir / name
        # 테스트는 이 파일을 직접 실행하지 않고 subprocess를 mock한다.
        path.write_bytes(b"#!/bin/sh\nexit 99\n")
        os.chmod(path, 0o755)
        return path

    def write_prefix_architecture(self, architecture: str) -> None:
        self.system_reg.write_text(
            "WINE REGISTRY Version 2\n"
            ";; All keys relative to \\\\Machine\n"
            f"#arch={architecture}\n",
            encoding="utf-8",
        )

    @staticmethod
    def invoked(path: Path) -> str:
        return os.path.abspath(os.path.normpath(str(path)))

    def kwargs(self, **overrides: object) -> dict[str, object]:
        values: dict[str, object] = {
            "client_args": (),
            "client_exe": self.working,
            "client_timeout_seconds": 30,
            "execute": False,
            "home": self.home,
            "initialize_prefix": True,
            "lineage_manifest": self.lineage_manifest,
            "mode": "regression",
            "prepare_prefix": False,
            "repo_root": self.repo,
            "run9_evidence": self.run9_index,
            "run_id": self.RUN_ID,
            "runtime_support_manifest": self.runtime_support_manifest,
            "wine_bin_raw": str(self.wine),
            "wineboot_bin_raw": str(self.wineboot),
            "wineprefix_raw": str(self.prefix),
            "wineserver_bin_raw": str(self.wineserver),
        }
        values.update(overrides)
        return values

    def rewrite_lineage(self) -> None:
        _write_json(self.lineage_manifest, self.lineage)


class FakeWineRuntime:
    def __init__(self, fixture: FakeLiveQaFixture) -> None:
        self.fixture = fixture
        self.key_exists = False
        self.install_value: str | None = None
        self.extra_values: dict[str, str] = {}

    def __call__(self, argv: list[str], **_: object) -> subprocess.CompletedProcess[bytes]:
        return_code = 0
        stdout = b""
        if argv[1:3] == ["reg", "query"]:
            value_query = "/v" in argv
            present = self.install_value is not None if value_query else self.key_exists
            return_code = 0 if present else 1
            if present and value_query:
                stdout = (
                    f"    Install    REG_SZ    {self.install_value}\n".encode("utf-8")
                )
        elif argv[1:3] == ["reg", "add"]:
            self.key_exists = True
            self.install_value = argv[argv.index("/d") + 1]
        elif argv[1:3] == ["reg", "delete"]:
            if "/v" in argv:
                self.install_value = None
            else:
                self.key_exists = False
                self.install_value = None
                self.extra_values = {}
        elif argv[1:3] == ["reg", "export"]:
            backup = self.fixture.drive_c / Path(argv[-1].replace("\\", "/")).name
            _write_json(
                backup,
                {
                    "extraValues": self.extra_values,
                    "install": self.install_value,
                    "keyExists": self.key_exists,
                },
            )
        elif argv[1:3] == ["reg", "import"]:
            backup = self.fixture.drive_c / live_qa.REGISTRY_BACKUP_NAME
            saved = json.loads(backup.read_text(encoding="utf-8"))
            self.key_exists = saved["keyExists"]
            self.install_value = saved["install"]
            self.extra_values = saved["extraValues"]
        elif argv[1:] == ["--version"]:
            stdout = b"wine-11.0\n"
        return subprocess.CompletedProcess(
            args=argv,
            returncode=return_code,
            stdout=stdout,
            stderr=b"",
        )


class WineLiveQaTests(unittest.TestCase):
    def test_regression_preflight_is_ready_without_running_wine(self) -> None:
        with TemporaryDirectory() as raw_root:
            fixture = FakeLiveQaFixture(Path(raw_root))
            with patch.object(live_qa.subprocess, "run") as run_mock:
                receipt = live_qa.create_preflight_receipt(**fixture.kwargs())
            run_mock.assert_not_called()
            self.assertEqual(receipt["status"], "ready")
            self.assertEqual(receipt["overallVerdict"], "not-evaluated")
            self.assertFalse(receipt["fullPassEligible"])
            self.assertTrue(receipt["preflightOnly"])
            self.assertTrue(receipt["clientLineage"]["complete"])
            self.assertTrue(receipt["run9Baseline"]["verified"])
            self.assertEqual(receipt["blockedReasons"], [])
            for command in receipt["commands"]:
                self.assertEqual(command["environment"]["WINEPREFIX"], str(fixture.prefix.resolve()))
                if command["id"] == "wineboot-init":
                    self.assertEqual(command["environment"]["WINEARCH"], "win32")
                else:
                    self.assertNotIn("WINEARCH", command["environment"])

    def test_default_prefix_is_rejected_without_touch_or_subprocess(self) -> None:
        with TemporaryDirectory() as raw_root:
            fixture = FakeLiveQaFixture(Path(raw_root))
            default_prefix = fixture.home / ".wine"
            self.assertFalse(default_prefix.exists())
            with patch.object(live_qa.subprocess, "run") as run_mock:
                receipt = live_qa.create_preflight_receipt(
                    **fixture.kwargs(
                        wineprefix_raw=str(default_prefix),
                        prepare_prefix=True,
                        execute=True,
                    )
                )
            run_mock.assert_not_called()
            self.assertFalse(default_prefix.exists())
            self.assertIn(
                "default_wineprefix_forbidden",
                {reason["code"] for reason in receipt["blockedReasons"]},
            )

    def test_wine_environment_drops_ambient_injection_and_secret_keys(self) -> None:
        with TemporaryDirectory() as raw_root:
            fixture = FakeLiveQaFixture(Path(raw_root))
            contaminated = {
                "DYLD_INSERT_LIBRARIES": "/tmp/inject.dylib",
                "DYLD_LIBRARY_PATH": "/tmp/libs",
                "EXTRA_SECRET": "must-not-propagate",
                "HOME": str(fixture.home),
                "LANG": "ko_KR.UTF-8",
                "PATH": "/usr/bin:/bin",
                "WINEARCH": "win64",
                "WINEDEBUG": "+all",
                "WINEDLLPATH": "/tmp/wine-dll",
                "WINEDLLOVERRIDES": "d3d8=n",
                "WINELOADER": "/tmp/loader",
                "WINEPREFIX": "/tmp/ambient-prefix",
                "WINESERVER": "/tmp/wineserver",
            }
            with patch.dict(live_qa.os.environ, contaminated, clear=True):
                normal = live_qa._wine_environment(fixture.prefix.resolve(), initialize=False)
                initialize = live_qa._wine_environment(
                    fixture.prefix.resolve(),
                    initialize=True,
                )
                receipt = live_qa.create_preflight_receipt(**fixture.kwargs())
            forbidden = {
                "DYLD_INSERT_LIBRARIES",
                "DYLD_LIBRARY_PATH",
                "EXTRA_SECRET",
                "WINEDEBUG",
                "WINEDLLPATH",
                "WINEDLLOVERRIDES",
                "WINELOADER",
                "WINESERVER",
            }
            self.assertTrue(forbidden.isdisjoint(normal))
            self.assertEqual(normal["WINEPREFIX"], str(fixture.prefix.resolve()))
            self.assertNotIn("WINEARCH", normal)
            self.assertEqual(initialize["WINEPREFIX"], str(fixture.prefix.resolve()))
            self.assertEqual(initialize["WINEARCH"], "win32")
            self.assertEqual(initialize["PATH"], "/usr/bin:/bin")
            policy = receipt["environment"]["wineEnvironmentPolicy"]
            self.assertEqual(policy["strategy"], "allowlist")
            self.assertIn("WINESERVER", policy["removedExactKeys"])
            self.assertIn("DYLD_", policy["removedPrefixes"])

    def test_client_argument_secret_is_blocked_and_absent_from_receipt(self) -> None:
        with TemporaryDirectory() as raw_root:
            fixture = FakeLiveQaFixture(Path(raw_root))
            secret = "super-secret-token-value"
            receipt = live_qa.create_preflight_receipt(
                **fixture.kwargs(client_args=(f"--password={secret}",))
            )
            self.assertIn(
                "client_arguments_not_allowed",
                {reason["code"] for reason in receipt["blockedReasons"]},
            )
            self.assertEqual(receipt["commands"], [])
            serialized = live_qa._json_bytes(receipt).decode("utf-8")
            self.assertNotIn(secret, serialized)
            self.assertNotIn("--password", serialized)
            self.assertEqual(
                receipt["clientArgumentPolicy"],
                {"allowedArguments": [], "strategy": "deny-by-default"},
            )

    def test_unset_relative_and_repo_internal_prefixes_are_rejected(self) -> None:
        with TemporaryDirectory() as raw_root:
            fixture = FakeLiveQaFixture(Path(raw_root))
            cases = (
                (None, "wineprefix_unset"),
                ("relative-prefix", "wineprefix_not_absolute"),
                (str(fixture.repo / "internal-prefix"), "repo_internal_wineprefix_forbidden"),
            )
            for raw_prefix, expected_code in cases:
                with self.subTest(raw_prefix=raw_prefix):
                    receipt = live_qa.create_preflight_receipt(
                        **fixture.kwargs(wineprefix_raw=raw_prefix, prepare_prefix=True)
                    )
                    self.assertIn(
                        expected_code,
                        {reason["code"] for reason in receipt["blockedReasons"]},
                    )

    def test_bare_and_relative_wine_tools_are_rejected(self) -> None:
        with TemporaryDirectory() as raw_root:
            fixture = FakeLiveQaFixture(Path(raw_root))
            receipt = live_qa.create_preflight_receipt(
                **fixture.kwargs(
                    wine_bin_raw="wine",
                    wineboot_bin_raw="bin/wineboot",
                    wineserver_bin_raw="wineserver",
                )
            )
            codes = {reason["code"] for reason in receipt["blockedReasons"]}
            self.assertEqual(
                {"wine_bin_not_absolute", "wineboot_bin_not_absolute", "wineserver_bin_not_absolute"},
                codes,
            )
            self.assertEqual(receipt["commands"], [])

    def test_wine_tool_roles_cannot_be_swapped_by_resolved_target(self) -> None:
        with TemporaryDirectory() as raw_root:
            fixture = FakeLiveQaFixture(Path(raw_root))
            cases = (
                (
                    {"wine_bin_raw": str(fixture.wineboot)},
                    "wine_bin_invoked_name_mismatch",
                ),
                (
                    {"wineboot_bin_raw": str(fixture.wine)},
                    "wineboot_bin_invoked_name_mismatch",
                ),
                (
                    {"wineserver_bin_raw": str(fixture.wine)},
                    "wineserver_bin_invoked_name_mismatch",
                ),
            )
            for overrides, expected_code in cases:
                with self.subTest(expected_code=expected_code):
                    receipt = live_qa.create_preflight_receipt(
                        **fixture.kwargs(**overrides)
                    )
                    self.assertIn(
                        expected_code,
                        {reason["code"] for reason in receipt["blockedReasons"]},
                    )
                    self.assertEqual(receipt["commands"], [])

    def test_wineboot_multicall_symlink_keeps_invoked_name(self) -> None:
        with TemporaryDirectory() as raw_root:
            fixture = FakeLiveQaFixture(Path(raw_root))
            receipt = live_qa.create_preflight_receipt(**fixture.kwargs())
            self.assertEqual(receipt["status"], "ready")
            init_command = next(
                command for command in receipt["commands"] if command["id"] == "wineboot-init"
            )
            self.assertEqual(init_command["argv"][0], fixture.invoked(fixture.wineboot))
            self.assertTrue(init_command["argv"][0].endswith("/wineboot"))
            toolchain = receipt["wineToolchain"]
            self.assertEqual(
                toolchain["wineboot-bin"]["invokedPath"],
                fixture.invoked(fixture.wineboot),
            )
            self.assertEqual(
                toolchain["wineboot-bin"]["resolvedPath"],
                str(fixture.wine.resolve()),
            )
            resolved_parents = {
                str(Path(tool["resolvedPath"]).parent) for tool in toolchain.values()
            }
            self.assertEqual(len(resolved_parents), 1)
            self.assertNotIn(
                "wine_toolchain_distribution_mismatch",
                {reason["code"] for reason in receipt["blockedReasons"]},
            )

    def test_wineboot_retarget_between_commands_is_blocked_then_cleanup_runs(self) -> None:
        with TemporaryDirectory() as raw_root:
            fixture = FakeLiveQaFixture(Path(raw_root))
            replacement = fixture._fake_executable("replacement-wine-target")

            def fake_run(argv: list[str], **_: object) -> subprocess.CompletedProcess[bytes]:
                if argv[:2] == [fixture.invoked(fixture.wine), "--version"]:
                    fixture.wineboot.unlink()
                    fixture.wineboot.symlink_to(replacement.name)
                return subprocess.CompletedProcess(
                    args=argv,
                    returncode=0,
                    stdout=b"fake\n",
                    stderr=b"",
                )

            with patch.object(live_qa.subprocess, "run", side_effect=fake_run) as run_mock:
                receipt = live_qa.create_preflight_receipt(
                    **fixture.kwargs(execute=True, initialize_prefix=True)
                )
            self.assertEqual(run_mock.call_count, 2)
            self.assertEqual(run_mock.call_args_list[0].args[0][0], fixture.invoked(fixture.wine))
            self.assertEqual(
                run_mock.call_args_list[1].args[0][0],
                fixture.invoked(fixture.wineserver),
            )
            by_id = {item["id"]: item for item in receipt["execution"]}
            blocked = by_id["wineboot-init"]["launchBlocked"]
            self.assertEqual(blocked["code"], "wine_tool_changed_after_preflight")
            self.assertIn("resolvedPath", blocked["mismatches"])
            self.assertTrue(by_id["client"]["skipped"])
            self.assertEqual(by_id["wineserver-cleanup"]["returnCode"], 0)
            self.assertEqual(receipt["status"], "failed")

    def test_cleanup_binary_replacement_is_revalidated_and_not_spawned(self) -> None:
        with TemporaryDirectory() as raw_root:
            fixture = FakeLiveQaFixture(Path(raw_root))
            fake_runtime = FakeWineRuntime(fixture)

            def fake_run(argv: list[str], **_: object) -> subprocess.CompletedProcess[bytes]:
                if len(argv) >= 2 and argv[1].casefold().endswith(
                    "\\working\\g7mtclient.exe"
                ):
                    fixture.wineserver.write_bytes(b"changed-after-client\n")
                    os.chmod(fixture.wineserver, 0o755)
                return fake_runtime(argv)

            with patch.object(live_qa.subprocess, "run", side_effect=fake_run) as run_mock:
                receipt = live_qa.create_preflight_receipt(
                    **fixture.kwargs(execute=True, initialize_prefix=False)
                )
            self.assertEqual(run_mock.call_count, 9)
            self.assertTrue(
                all(call.args[0][0] != fixture.invoked(fixture.wineserver) for call in run_mock.call_args_list)
            )
            cleanup = next(
                item for item in receipt["execution"] if item["id"] == "wineserver-cleanup"
            )
            self.assertEqual(
                cleanup["launchBlocked"]["code"],
                "wine_tool_changed_after_preflight",
            )
            self.assertIn("sha256", cleanup["launchBlocked"]["mismatches"])
            self.assertEqual(receipt["status"], "failed")

    def test_broken_wineboot_symlink_is_rejected(self) -> None:
        with TemporaryDirectory() as raw_root:
            fixture = FakeLiveQaFixture(Path(raw_root))
            broken = fixture.root / "broken-bin" / "wineboot"
            broken.parent.mkdir()
            broken.symlink_to("missing-multicall-target")
            receipt = live_qa.create_preflight_receipt(
                **fixture.kwargs(wineboot_bin_raw=str(broken))
            )
            self.assertIn(
                "wineboot_bin_broken_symlink",
                {reason["code"] for reason in receipt["blockedReasons"]},
            )
            self.assertEqual(receipt["commands"], [])

    def test_foreign_marker_rejects_shared_prefix(self) -> None:
        with TemporaryDirectory() as raw_root:
            fixture = FakeLiveQaFixture(Path(raw_root))
            foreign = fixture.root / "wine-prefixes" / "foreign"
            live_qa.prepare_prefix_marker(foreign, fixture.repo.resolve(), "20260716T130000Z-other")
            receipt = live_qa.create_preflight_receipt(
                **fixture.kwargs(wineprefix_raw=str(foreign))
            )
            self.assertIn(
                "wineprefix_shared_or_foreign",
                {reason["code"] for reason in receipt["blockedReasons"]},
            )

    def test_uninitialized_execute_without_init_is_blocked_before_subprocess(self) -> None:
        with TemporaryDirectory() as raw_root:
            fixture = FakeLiveQaFixture(Path(raw_root))
            fixture.system_reg.unlink()
            with patch.object(live_qa.subprocess, "run") as run_mock:
                receipt = live_qa.create_preflight_receipt(
                    **fixture.kwargs(execute=True, initialize_prefix=False)
                )
            run_mock.assert_not_called()
            self.assertIn(
                "wineprefix_uninitialized_requires_init",
                {reason["code"] for reason in receipt["blockedReasons"]},
            )
            self.assertEqual(
                receipt["environment"]["prefixArchitecture"]["state"],
                "uninitialized",
            )
            self.assertEqual(
                receipt["environment"]["prefixArchitecture"]["expectedArch"],
                "win32",
            )

    def test_uninitialized_init_runs_wineboot_first_and_stops_on_wrong_arch(self) -> None:
        with TemporaryDirectory() as raw_root:
            fixture = FakeLiveQaFixture(Path(raw_root))
            fixture.system_reg.unlink()

            def fake_run(argv: list[str], **_: object) -> subprocess.CompletedProcess[bytes]:
                if argv[0] == fixture.invoked(fixture.wineboot):
                    fixture.write_prefix_architecture("win64")
                return subprocess.CompletedProcess(
                    args=argv,
                    returncode=0,
                    stdout=b"fake\n",
                    stderr=b"",
                )

            with patch.object(live_qa.subprocess, "run", side_effect=fake_run) as run_mock:
                receipt = live_qa.create_preflight_receipt(
                    **fixture.kwargs(execute=True, initialize_prefix=True)
                )

            command_ids = [command["id"] for command in receipt["commands"]]
            self.assertEqual(command_ids[:2], ["wineboot-init", "wine-version"])
            self.assertEqual(command_ids[-2:], ["registry-install-query-restored", "wineserver-cleanup"])
            self.assertIn("client", command_ids)
            self.assertEqual(run_mock.call_count, 2)
            first_call, cleanup_call = run_mock.call_args_list
            self.assertEqual(first_call.args[0][0], fixture.invoked(fixture.wineboot))
            self.assertEqual(first_call.kwargs["env"]["WINEARCH"], "win32")
            self.assertEqual(
                first_call.kwargs["env"]["WINEPREFIX"],
                str(fixture.prefix.resolve()),
            )
            self.assertEqual(cleanup_call.args[0][0], fixture.invoked(fixture.wineserver))
            self.assertNotIn("WINEARCH", cleanup_call.kwargs["env"])
            by_id = {item["id"]: item for item in receipt["execution"]}
            self.assertFalse(by_id["wineboot-init"]["architectureVerified"])
            self.assertEqual(
                by_id["wineboot-init"]["architectureAfter"]["detectedArch"],
                "win64",
            )
            self.assertTrue(by_id["wine-version"]["skipped"])
            self.assertTrue(by_id["client"]["skipped"])
            self.assertEqual(by_id["wineserver-cleanup"]["returnCode"], 0)
            self.assertEqual(receipt["status"], "failed")

    def test_launch_oserror_records_receipt_and_still_attempts_cleanup(self) -> None:
        with TemporaryDirectory() as raw_root:
            fixture = FakeLiveQaFixture(Path(raw_root))
            fixture.system_reg.unlink()
            launch_error = FileNotFoundError(
                2,
                "multicall vanished",
                fixture.invoked(fixture.wineboot),
            )
            cleanup_error = PermissionError(
                13,
                "cleanup denied",
                fixture.invoked(fixture.wineserver),
            )
            with patch.object(
                live_qa.subprocess,
                "run",
                side_effect=(launch_error, cleanup_error),
            ) as run_mock:
                receipt = live_qa.create_preflight_receipt(
                    **fixture.kwargs(execute=True, initialize_prefix=True)
                )
            self.assertEqual(run_mock.call_count, 2)
            first_call, cleanup_call = run_mock.call_args_list
            self.assertEqual(first_call.args[0][0], fixture.invoked(fixture.wineboot))
            self.assertEqual(cleanup_call.args[0][0], fixture.invoked(fixture.wineserver))
            self.assertEqual(
                cleanup_call.kwargs["env"]["WINEPREFIX"],
                str(fixture.prefix.resolve()),
            )
            by_id = {item["id"]: item for item in receipt["execution"]}
            self.assertEqual(by_id["wineboot-init"]["launchError"]["type"], "FileNotFoundError")
            self.assertTrue(by_id["wine-version"]["skipped"])
            self.assertTrue(by_id["client"]["skipped"])
            self.assertEqual(
                by_id["wineserver-cleanup"]["launchError"]["type"],
                "PermissionError",
            )
            self.assertEqual(receipt["status"], "failed")

    def test_existing_win64_prefix_is_blocked_before_subprocess(self) -> None:
        with TemporaryDirectory() as raw_root:
            fixture = FakeLiveQaFixture(Path(raw_root))
            fixture.write_prefix_architecture("win64")
            with patch.object(live_qa.subprocess, "run") as run_mock:
                receipt = live_qa.create_preflight_receipt(
                    **fixture.kwargs(execute=True, initialize_prefix=True)
                )
            run_mock.assert_not_called()
            self.assertIn(
                "wineprefix_win64_forbidden",
                {reason["code"] for reason in receipt["blockedReasons"]},
            )
            self.assertEqual(
                receipt["environment"]["prefixArchitecture"]["detectedArch"],
                "win64",
            )

    def test_existing_win32_prefix_is_ready_and_records_expected_architecture(self) -> None:
        with TemporaryDirectory() as raw_root:
            fixture = FakeLiveQaFixture(Path(raw_root))
            receipt = live_qa.create_preflight_receipt(
                **fixture.kwargs(initialize_prefix=False)
            )
            self.assertEqual(receipt["status"], "ready")
            architecture = receipt["environment"]["prefixArchitecture"]
            self.assertEqual(architecture["state"], "initialized")
            self.assertEqual(architecture["detectedArch"], "win32")
            self.assertEqual(architecture["expectedArch"], "win32")
            self.assertFalse(architecture["initializationRequired"])
            self.assertTrue(
                any(item["role"] == "wineprefix-system-reg" for item in receipt["files"])
            )

    def test_client_pe_and_sentinel_mismatch_fail_closed(self) -> None:
        with TemporaryDirectory() as raw_root:
            fixture = FakeLiveQaFixture(Path(raw_root))
            fixture.lineage["working"]["peTimestamp"] = "0x12345678"
            fixture.lineage["working"]["imageBase"] = "0x00500000"
            fixture.lineage["working"]["sentinels"] = [{"hex": "cafebabe", "offset": "0x200"}]
            fixture.rewrite_lineage()
            receipt = live_qa.create_preflight_receipt(**fixture.kwargs())
            codes = {reason["code"] for reason in receipt["blockedReasons"]}
            self.assertIn("client_pe_timestamp_mismatch", codes)
            self.assertIn("client_image_base_mismatch", codes)
            self.assertIn("client_sentinel_mismatch", codes)
            self.assertEqual(receipt["status"], "blocked")

    def test_lineage_manifest_sentinel_mismatch_is_blocked(self) -> None:
        with TemporaryDirectory() as raw_root:
            fixture = FakeLiveQaFixture(Path(raw_root))
            fixture.lineage["sentinel"] = "NOT-THE-LINEAGE-CONTRACT"
            fixture.rewrite_lineage()
            receipt = live_qa.create_preflight_receipt(**fixture.kwargs())
            self.assertIn(
                "lineage_manifest_sentinel_mismatch",
                {reason["code"] for reason in receipt["blockedReasons"]},
            )
            self.assertFalse(receipt["clientLineage"]["complete"])

    def test_regression_requires_run9_but_recovery_baseline_does_not_claim_pass(self) -> None:
        with TemporaryDirectory() as raw_root:
            fixture = FakeLiveQaFixture(Path(raw_root))
            regression = live_qa.create_preflight_receipt(
                **fixture.kwargs(run9_evidence=None)
            )
            self.assertIn(
                "run9_evidence_required",
                {reason["code"] for reason in regression["blockedReasons"]},
            )
            recovery = live_qa.create_preflight_receipt(
                **fixture.kwargs(mode="recovery-baseline", run9_evidence=None)
            )
            self.assertEqual(recovery["status"], "ready")
            self.assertEqual(recovery["overallVerdict"], "not-evaluated")
            self.assertEqual(recovery["verdictCeiling"], "recovery-baseline-only")
            self.assertFalse(recovery["fullPassEligible"])

    def test_recovery_baseline_requires_complete_lineage(self) -> None:
        with TemporaryDirectory() as raw_root:
            fixture = FakeLiveQaFixture(Path(raw_root))
            fixture.lineage["lineageStatus"] = "partial"
            fixture.rewrite_lineage()
            receipt = live_qa.create_preflight_receipt(
                **fixture.kwargs(mode="recovery-baseline", run9_evidence=None)
            )
            codes = {reason["code"] for reason in receipt["blockedReasons"]}
            self.assertIn("lineage_incomplete", codes)
            self.assertIn("recovery_baseline_requires_complete_lineage", codes)

    def test_lineage_artifact_hash_mismatch_marks_lineage_incomplete(self) -> None:
        with TemporaryDirectory() as raw_root:
            fixture = FakeLiveQaFixture(Path(raw_root))
            fixture.lineage["stages"][0]["receipt"]["sha256"] = "0" * 64
            fixture.rewrite_lineage()
            receipt = live_qa.create_preflight_receipt(**fixture.kwargs())
            self.assertIn(
                "lineage_stage_canonical_working_copy_receipt_sha256_mismatch",
                {reason["code"] for reason in receipt["blockedReasons"]},
            )
            self.assertFalse(receipt["clientLineage"]["complete"])

    def test_lineage_backup_and_rollback_hardlink_alias_is_blocked(self) -> None:
        with TemporaryDirectory() as raw_root:
            fixture = FakeLiveQaFixture(Path(raw_root))
            fixture.rollback.unlink()
            os.link(fixture.backup, fixture.rollback)
            receipt = live_qa.create_preflight_receipt(**fixture.kwargs())
            self.assertIn(
                "lineage_artifact_inode_reused",
                {reason["code"] for reason in receipt["blockedReasons"]},
            )
            self.assertFalse(receipt["clientLineage"]["complete"])

    def test_run9_artifact_hash_mismatch_marks_index_unverified(self) -> None:
        with TemporaryDirectory() as raw_root:
            fixture = FakeLiveQaFixture(Path(raw_root))
            index = json.loads(fixture.run9_index.read_text(encoding="utf-8"))
            index["artifacts"][0]["sha256"] = "0" * 64
            _write_json(fixture.run9_index, index)
            receipt = live_qa.create_preflight_receipt(**fixture.kwargs())
            self.assertIn(
                "run9_client_sha256_mismatch",
                {reason["code"] for reason in receipt["blockedReasons"]},
            )
            self.assertFalse(receipt["run9Baseline"]["verified"])

    def test_run9_hash_matched_dummy_json_is_semantically_rejected(self) -> None:
        with TemporaryDirectory() as raw_root:
            fixture = FakeLiveQaFixture(Path(raw_root))
            index = json.loads(fixture.run9_index.read_text(encoding="utf-8"))
            client_entry = next(
                artifact for artifact in index["artifacts"] if artifact["kind"] == "client"
            )
            client_artifact = fixture.run9_index.parent / client_entry["path"]
            _write_json(client_artifact, {"kind": "client", "verified": True})
            client_entry["sha256"] = _sha256(client_artifact)
            _write_json(fixture.run9_index, index)
            receipt = live_qa.create_preflight_receipt(**fixture.kwargs())
            codes = {reason["code"] for reason in receipt["blockedReasons"]}
            self.assertIn("run9_artifact_semantic_mismatch", codes)
            self.assertNotIn("run9_client_sha256_mismatch", codes)
            self.assertFalse(receipt["run9Baseline"]["verified"])
            self.assertEqual(receipt["status"], "blocked")

    def test_canonical_in_place_execution_is_forbidden(self) -> None:
        with TemporaryDirectory() as raw_root:
            fixture = FakeLiveQaFixture(Path(raw_root))
            fixture.lineage["working"]["path"] = str(fixture.canonical)
            fixture.rewrite_lineage()
            receipt = live_qa.create_preflight_receipt(
                **fixture.kwargs(client_exe=fixture.canonical)
            )
            self.assertIn(
                "canonical_in_place_forbidden",
                {reason["code"] for reason in receipt["blockedReasons"]},
            )

    def test_execute_path_uses_one_prefix_and_init_only_winearch(self) -> None:
        with TemporaryDirectory() as raw_root:
            fixture = FakeLiveQaFixture(Path(raw_root))
            fake_runtime = FakeWineRuntime(fixture)
            with patch.dict(
                live_qa.os.environ,
                {"WINEARCH": "win64", "WINEPREFIX": "/forbidden/ambient-prefix"},
                clear=False,
            ), patch.object(live_qa.subprocess, "run", side_effect=fake_runtime) as run_mock:
                receipt = live_qa.create_preflight_receipt(
                    **fixture.kwargs(execute=True)
                )
            self.assertEqual(receipt["status"], "executed")
            self.assertEqual(receipt["overallVerdict"], "not-evaluated")
            self.assertFalse(receipt["fullPassEligible"])
            init_result = next(
                item for item in receipt["execution"] if item["id"] == "wineboot-init"
            )
            self.assertTrue(init_result["architectureVerified"])
            self.assertEqual(init_result["architectureAfter"]["expectedArch"], "win32")
            self.assertEqual(init_result["architectureAfter"]["detectedArch"], "win32")
            self.assertEqual(run_mock.call_count, 11)
            calls = run_mock.call_args_list
            self.assertEqual(calls[0].args[0][0], fixture.invoked(fixture.wine))
            self.assertEqual(calls[1].args[0][0], fixture.invoked(fixture.wineboot))
            self.assertEqual(calls[-1].args[0][0], fixture.invoked(fixture.wineserver))
            for index, call in enumerate(calls):
                environment = call.kwargs["env"]
                self.assertEqual(environment["WINEPREFIX"], str(fixture.prefix.resolve()))
                if index == 1:
                    self.assertEqual(environment["WINEARCH"], "win32")
                else:
                    self.assertNotIn("WINEARCH", environment)

    def test_prefix_marker_claim_uses_exclusive_create(self) -> None:
        with TemporaryDirectory() as raw_root:
            fixture = FakeLiveQaFixture(Path(raw_root))
            new_prefix = fixture.root / "wine-prefixes" / "atomic-marker"
            real_open = os.open
            observed_flags: list[int] = []

            def spy_open(path: object, flags: int, mode: int = 0o777) -> int:
                if Path(path) == new_prefix / live_qa.PREFIX_MARKER_NAME:
                    observed_flags.append(flags)
                return real_open(path, flags, mode)

            with patch.object(live_qa.os, "open", side_effect=spy_open):
                live_qa.prepare_prefix_marker(
                    new_prefix,
                    fixture.repo.resolve(),
                    "20260716T140000Z-atom01",
                )
            self.assertEqual(len(observed_flags), 1)
            self.assertTrue(observed_flags[0] & os.O_EXCL)

    def test_same_prefix_execution_lock_blocks_second_execute_without_spawn(self) -> None:
        with TemporaryDirectory() as raw_root:
            fixture = FakeLiveQaFixture(Path(raw_root))
            lock, blocker, _ = live_qa.acquire_execution_lock(
                fixture.prefix,
                fixture.repo.resolve(),
                fixture.RUN_ID,
            )
            self.assertIsNotNone(lock)
            self.assertIsNone(blocker)
            assert lock is not None
            try:
                with patch.object(live_qa.subprocess, "run") as run_mock:
                    receipt = live_qa.create_preflight_receipt(
                        **fixture.kwargs(execute=True, initialize_prefix=False)
                    )
                run_mock.assert_not_called()
                self.assertEqual(receipt["status"], "blocked")
                self.assertIn(
                    "wineprefix_execution_lock_held",
                    {reason["code"] for reason in receipt["blockedReasons"]},
                )
                self.assertEqual(live_qa.receipt_exit_code(receipt), 2)
            finally:
                release = live_qa.release_execution_lock(lock)
                self.assertTrue(release["released"])

    def test_complete_data_inventory_rejects_missing_extra_and_changed_files(self) -> None:
        with TemporaryDirectory() as raw_root:
            fixture = FakeLiveQaFixture(Path(raw_root))
            target = fixture.data_root / "synthetic" / "file-0000.bin"
            original = target.read_bytes()
            target.unlink()
            missing = live_qa.create_preflight_receipt(**fixture.kwargs())
            self.assertIn(
                "runtime_support_data_tree_mismatch",
                {reason["code"] for reason in missing["blockedReasons"]},
            )
            target.write_bytes(original)
            extra = fixture.data_root / "synthetic" / "extra.bin"
            extra.write_bytes(b"extra\n")
            extra_receipt = live_qa.create_preflight_receipt(**fixture.kwargs())
            self.assertIn(
                "runtime_support_data_tree_mismatch",
                {reason["code"] for reason in extra_receipt["blockedReasons"]},
            )
            extra.unlink()
            target.write_bytes(b"changed\n")
            changed = live_qa.create_preflight_receipt(**fixture.kwargs())
            self.assertIn(
                "runtime_support_data_tree_mismatch",
                {reason["code"] for reason in changed["blockedReasons"]},
            )

    def test_runtime_support_change_before_client_blocks_spawn_and_restores(self) -> None:
        with TemporaryDirectory() as raw_root:
            fixture = FakeLiveQaFixture(Path(raw_root))
            fake_runtime = FakeWineRuntime(fixture)

            def mutate_after_active_query(
                argv: list[str], **kwargs: object
            ) -> subprocess.CompletedProcess[bytes]:
                completed = fake_runtime(argv, **kwargs)
                if argv[1:3] == ["reg", "query"] and "/v" in argv:
                    if fake_runtime.install_value == "R:\\":
                        fixture.graphic_config.write_bytes(b"changed after preflight\n")
                return completed

            with patch.object(
                live_qa.subprocess,
                "run",
                side_effect=mutate_after_active_query,
            ) as run_mock:
                receipt = live_qa.create_preflight_receipt(
                    **fixture.kwargs(execute=True, initialize_prefix=False)
                )
            client_result = next(item for item in receipt["execution"] if item["id"] == "client")
            self.assertEqual(
                client_result["launchBlocked"]["code"],
                "runtime_support_changed_after_preflight",
            )
            self.assertFalse(
                any(
                    len(call.args[0]) > 1
                    and str(call.args[0][1]).casefold().endswith("g7mtclient.exe")
                    for call in run_mock.call_args_list
                )
            )
            self.assertEqual(receipt["registryTransaction"]["state"], "failed")
            self.assertTrue(receipt["registryTransaction"]["restored"])
            self.assertEqual(receipt["status"], "failed")
            self.assertEqual(live_qa.receipt_exit_code(receipt), 1)

    def test_drive_mapping_stays_isolated_through_cleanup_then_restores(self) -> None:
        with TemporaryDirectory() as raw_root:
            fixture = FakeLiveQaFixture(Path(raw_root))
            fake_runtime = FakeWineRuntime(fixture)
            checked: list[str] = []

            def assert_mapping_during_spawn(
                argv: list[str], **kwargs: object
            ) -> subprocess.CompletedProcess[bytes]:
                if (
                    len(argv) > 1
                    and str(argv[1]).casefold().endswith("g7mtclient.exe")
                ) or argv[0] == fixture.invoked(fixture.wineserver):
                    self.assertFalse((fixture.dosdevices / "z:").exists())
                    self.assertEqual(
                        (fixture.dosdevices / "r:").resolve(strict=True),
                        fixture.working.parent.parent.resolve(),
                    )
                    checked.append("cleanup" if argv[0] == fixture.invoked(fixture.wineserver) else "client")
                return fake_runtime(argv, **kwargs)

            with patch.object(live_qa.subprocess, "run", side_effect=assert_mapping_during_spawn):
                receipt = live_qa.create_preflight_receipt(
                    **fixture.kwargs(execute=True, initialize_prefix=False)
                )
            self.assertEqual(checked, ["client", "cleanup"])
            self.assertTrue((fixture.dosdevices / "z:").is_symlink())
            self.assertFalse((fixture.dosdevices / "r:").exists())
            self.assertEqual(receipt["driveIsolation"]["state"], "released")

    def test_preexisting_registry_key_is_exactly_restored(self) -> None:
        with TemporaryDirectory() as raw_root:
            fixture = FakeLiveQaFixture(Path(raw_root))
            fake_runtime = FakeWineRuntime(fixture)
            fake_runtime.key_exists = True
            fake_runtime.install_value = "Q:\\legacy-install"
            fake_runtime.extra_values = {"Unrelated": "preserve-me"}
            with patch.object(live_qa.subprocess, "run", side_effect=fake_runtime):
                receipt = live_qa.create_preflight_receipt(
                    **fixture.kwargs(execute=True, initialize_prefix=False)
                )
            self.assertEqual(receipt["status"], "executed")
            self.assertEqual(receipt["registryTransaction"]["state"], "restored")
            self.assertTrue(
                receipt["registryTransaction"]["restoredExport"]["exactMatch"]
            )
            self.assertEqual(fake_runtime.install_value, "Q:\\legacy-install")
            self.assertEqual(fake_runtime.extra_values, {"Unrelated": "preserve-me"})
            self.assertFalse((fixture.drive_c / live_qa.REGISTRY_BACKUP_NAME).exists())
            self.assertFalse((fixture.drive_c / live_qa.REGISTRY_RESTORED_NAME).exists())

    def test_receipt_is_deterministic_for_identical_preflight(self) -> None:
        with TemporaryDirectory() as raw_root:
            fixture = FakeLiveQaFixture(Path(raw_root))
            first = live_qa.create_preflight_receipt(**fixture.kwargs())
            second = live_qa.create_preflight_receipt(**fixture.kwargs())
            self.assertEqual(first, second)
            self.assertEqual(live_qa._json_bytes(first), live_qa._json_bytes(second))


if __name__ == "__main__":
    unittest.main()
