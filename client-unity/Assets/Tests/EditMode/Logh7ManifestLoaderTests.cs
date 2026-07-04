using System.IO;
using NUnit.Framework;
using UnityEngine;

// StreamingAssets 매니페스트 로더 계약 테스트 (G028).
// 정책: canonical 승격은 cross-source 확인 전까지 차단 상태여야 하고,
// 수출 매니페스트가 가리키는 파일은 실제로 존재해야 한다.
public class Logh7ManifestLoaderTests
{
    private static string Root => Path.Combine(Application.streamingAssetsPath, "logh7");

    private static string ReadManifest(string relativePath)
    {
        string path = Path.Combine(Root, relativePath);
        Assert.IsTrue(File.Exists(path), $"manifest missing: {relativePath}");
        string text = File.ReadAllText(path);
        Assert.IsNotEmpty(text, $"manifest empty: {relativePath}");
        return text;
    }

    [Test]
    public void RequiredManifestsExistAndParse()
    {
        string[] required =
        {
            "logh7-unity-runtime-manifest.json",
            "logh7-unity-source-pack-manifest.json",
            "logh7-unity-asset-source-truth.json",
            "logh7-remaster-provenance-manifest.json",
            "logh7-ui-scene-remaster-gameplay-boundary.json",
            "logh7-gameplay-contract-boundary.json",
            "logh7-unity-streamingassets-export.json",
            Path.Combine("generated", "galaxy.json"),
            Path.Combine("generated", "logh7-record-candidate-crosscheck.json"),
        };
        foreach (string file in required)
        {
            string text = ReadManifest(file);
            StringAssert.StartsWith("{", text.TrimStart(), $"not a JSON object: {file}");
        }
    }

    [Test]
    public void CanonicalPromotionStaysBlockedUntilCrossSourceConfirmed()
    {
        foreach (string file in new[]
                 {
                     "logh7-unity-source-pack-manifest.json",
                     "logh7-unity-streamingassets-export.json",
                 })
        {
            string text = ReadManifest(file);
            StringAssert.Contains("blocked-until-cross-source-confirmed", text,
                $"canonical promotion must stay blocked: {file}");
        }
    }

    [Test]
    public void RuntimeManifestKeepsNormalEntryScene()
    {
        string text = ReadManifest("logh7-unity-runtime-manifest.json");
        StringAssert.Contains("boot-update-launcher", text,
            "normal entry scene must remain boot-update-launcher");
    }

    [Test]
    public void ExportedFilesActuallyExist()
    {
        string text = ReadManifest("logh7-unity-streamingassets-export.json");
        var export = JsonUtility.FromJson<ExportManifest>(text);
        Assert.IsNotNull(export.files, "export manifest has no files[]");
        Assert.AreEqual(export.summary.fileCount, export.files.Length,
            "summary.fileCount must match files[] length");
        foreach (ExportFile file in export.files)
        {
            Assert.IsTrue(File.Exists(Path.Combine(Root, file.path)),
                $"exported file missing on disk: {file.path}");
        }
    }

    [System.Serializable]
    private class ExportManifest
    {
        public ExportSummary summary;
        public ExportFile[] files;
    }

    [System.Serializable]
    private class ExportSummary
    {
        public int fileCount;
    }

    [System.Serializable]
    private class ExportFile
    {
        public string path;
    }
}
