using System.IO;
using NUnit.Framework;
using UnityEngine;

// Boot 무결성 체크 계약 (G053): 실제 StreamingAssets에서 통과, 파일 결손 시 차단.
public class Logh7BootCheckTests
{
    [Test]
    public void BootCheckPassesOnRealStreamingAssets()
    {
        var report = Logh7BootCheck.Run();
        Assert.IsTrue(report.RuntimeDataPresent, $"missing: {string.Join(",", report.MissingFiles)}");
        Assert.AreEqual("blocked-until-cross-source-confirmed", report.CanonicalPromotion);
        Assert.Greater(report.ExpectedFileCount, 0);
    }

    [Test]
    public void BootCheckFailsClosedOnMissingManifest()
    {
        string empty = Path.Combine(Path.GetTempPath(), "logh7-boot-test-empty");
        Directory.CreateDirectory(empty);
        var report = Logh7BootCheck.Run(empty);
        Assert.IsFalse(report.RuntimeDataPresent);
        Assert.Contains("logh7-unity-streamingassets-export.json", report.MissingFiles);
    }
}
