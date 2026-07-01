import tempfile
import unittest
from pathlib import Path

from client.tools.package_client import ClientPackageError, LAUNCHER_SOURCE, PACKAGE_OUT_ROOT, resolve_package_out


class ClientPackageClientTests(unittest.TestCase):
    def test_resolve_package_out_allows_named_directory_under_client_dist(self):
        out = resolve_package_out(PACKAGE_OUT_ROOT / "check-client")
        self.assertEqual(out, (PACKAGE_OUT_ROOT / "check-client").resolve())

    def test_resolve_package_out_rejects_client_dist_root(self):
        with self.assertRaises(ClientPackageError):
            resolve_package_out(PACKAGE_OUT_ROOT)

    def test_resolve_package_out_rejects_arbitrary_temp_path(self):
        with tempfile.TemporaryDirectory() as td:
            with self.assertRaises(ClientPackageError):
                resolve_package_out(Path(td) / "logh7-client")

    def test_client_package_launcher_has_display_mode_runtime_patch(self):
        launcher_source = LAUNCHER_SOURCE.read_text(encoding="utf-8")

        self.assertIn("ResolveDisplayMode", launcher_source)
        self.assertIn("ConfigureDgVoodooDisplayMode", launcher_source)
        self.assertIn("ApplyWindowDisplayMode", launcher_source)
        self.assertIn("GwlExStyle", launcher_source)
        self.assertIn("WatermarkDisplayDuration", launcher_source)
        self.assertIn("\"WatermarkDisplayDuration\", \"1\"", launcher_source)
        self.assertIn("dgVoodooWatermark", launcher_source)
        self.assertIn("RTTexturesForceScaleAndMSAA", launcher_source)
        self.assertIn('"ScalingMode", windowedPresentation ? "centered" : "stretched"', launcher_source)
        self.assertIn('"Resampling", windowedPresentation ? "pointsampled" : "lanczos-3"', launcher_source)
        self.assertIn("--display-mode", launcher_source)
        self.assertIn('private const string DefaultDisplayMode = "windowed";', launcher_source)
        self.assertIn('private const string DefaultCursorClip = "auto";', launcher_source)
        self.assertIn("ApplyCursorClip", launcher_source)
        self.assertIn("--cursor-clip", launcher_source)
        self.assertIn("BuildAppControlBlockedMessage", launcher_source)
        self.assertIn("AppendLauncherException", launcher_source)
        self.assertIn("launcher failed:", launcher_source)
        self.assertIn("--client-preflight", launcher_source)
        self.assertIn("--no-client-preflight", launcher_source)
        self.assertIn("RunClientPreflight", launcher_source)
        self.assertIn('!HasArg(args, "--server-smoke") && !HasArg(args, "--no-client-preflight")', launcher_source)
        self.assertIn("ConfigureKoreanMenuMode", launcher_source)
        self.assertIn('WriteProfileString("windows", "hangeulmenu", "hangeul")', launcher_source)
        self.assertIn('WriteProfileString("windows", "kanjimenu", "roman")', launcher_source)
        self.assertIn("CreateProcess", launcher_source)
        self.assertIn("CreateSuspended", launcher_source)
        self.assertIn("client launch preflight", launcher_source)
        self.assertIn("process created suspended", launcher_source)
        self.assertIn("Smart App Control blocked the game client", launcher_source)
        self.assertIn("CodeIntegrity", launcher_source)


if __name__ == "__main__":
    unittest.main()
