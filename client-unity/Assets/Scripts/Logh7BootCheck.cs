using System.Collections.Generic;
using System.IO;
using System.Linq;
using UnityEngine;

// Boot 씬의 무결성 체크 (G053).
// StreamingAssets 수출 매니페스트가 가리키는 파일이 전부 존재해야 boot-runtime grant 가능.
[System.Serializable]
public sealed class Logh7ExportFileEntry
{
    public string path;
    public long byteSize;
    public string sha256;
}

[System.Serializable]
public sealed class Logh7ExportSummary
{
    public int fileCount;
}

[System.Serializable]
public sealed class Logh7ExportManifest
{
    public string canonicalPromotion;
    public Logh7ExportSummary summary;
    public Logh7ExportFileEntry[] files;
}

public sealed class Logh7BootReport
{
    public bool RuntimeDataPresent;
    public string CanonicalPromotion;
    public int ExpectedFileCount;
    public List<string> MissingFiles = new List<string>();
}

public static class Logh7BootCheck
{
    public static Logh7BootReport Run(string streamingAssetsRoot = null)
    {
        string root = streamingAssetsRoot ?? Path.Combine(Application.streamingAssetsPath, "logh7");
        var report = new Logh7BootReport();
        string manifestPath = Path.Combine(root, "logh7-unity-streamingassets-export.json");
        if (!File.Exists(manifestPath))
        {
            report.MissingFiles.Add("logh7-unity-streamingassets-export.json");
            return report;
        }
        var manifest = JsonUtility.FromJson<Logh7ExportManifest>(File.ReadAllText(manifestPath));
        report.CanonicalPromotion = manifest.canonicalPromotion;
        report.ExpectedFileCount = manifest.summary?.fileCount ?? 0;
        report.MissingFiles = (manifest.files ?? new Logh7ExportFileEntry[0])
            .Where(f => !File.Exists(Path.Combine(root, f.path)))
            .Select(f => f.path)
            .ToList();
        report.RuntimeDataPresent = report.MissingFiles.Count == 0 && report.ExpectedFileCount > 0;
        return report;
    }
}
