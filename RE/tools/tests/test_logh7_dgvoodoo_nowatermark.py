from __future__ import annotations

import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from tools.logh7_dgvoodoo_nowatermark import build_conf, verify


class Logh7DgVoodooNoWatermarkTests(unittest.TestCase):
    def test_generator_keeps_no_logo_borderless_sharp_preset(self) -> None:
        with TemporaryDirectory() as raw_dir:
            stock = Path(raw_dir) / "dgVoodoo.conf"
            stock.write_text(
                "\r\n".join(
                    [
                        "Version                              = 0x287",
                        "FullScreenMode                       = true",
                        "ScalingMode                          = stretched",
                        "Resampling                           = lanczos-3",
                        "WatermarkDisplayDuration             = 0",
                        "WindowedAttributes                   = ",
                        "FullscreenAttributes                 = fullscreensize",
                        "3DfxWatermark                        = true",
                        "3DfxSplashScreen                     = true",
                        "Filtering                            = 16",
                        "Antialiasing                         = 4x",
                        "dgVoodooWatermark                    = true",
                        "RTTexturesForceScaleAndMSAA          = true",
                        "SmoothedDepthSampling                = true",
                        "",
                    ]
                ),
                encoding="latin1",
            )

            checks = verify(build_conf(stock))

        self.assertEqual(checks["watermarkOff"], "PASS")
        self.assertEqual(checks["sharpBorderless"], "PASS")
        self.assertEqual(checks["dgVoodooWatermark"], "false")
        self.assertEqual(checks["3DfxSplashScreen"], "false")
        self.assertEqual(checks["WatermarkDisplayDuration"], "1")
        self.assertEqual(checks["FullScreenMode"], "false")
        self.assertEqual(checks["ScalingMode"], "centered")
        self.assertEqual(checks["Resampling"], "pointsampled")
        self.assertEqual(checks["WindowedAttributes"], "borderless")
        self.assertEqual(checks["FullscreenAttributes"], "fake")
        self.assertEqual(checks["Filtering"], "appdriven")
        self.assertEqual(checks["Antialiasing"], "off")
        self.assertEqual(checks["RTTexturesForceScaleAndMSAA"], "false")
        self.assertEqual(checks["SmoothedDepthSampling"], "false")


if __name__ == "__main__":
    unittest.main()
