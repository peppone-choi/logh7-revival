using UnityEngine;

// boot-update-launcher 씬 런타임 (G053).
// 무결성 체크 통과 시에만 세션 플로 boot-launcher 단계를 grant하고 다음 씬(login)을 안내한다.
public sealed class Logh7BootRuntime : MonoBehaviour
{
    public string StatusLine { get; private set; } = "booting";
    public string NextSceneId { get; private set; }

    private void Start()
    {
        Logh7BootReport report = Logh7BootCheck.Run();
        var flow = Logh7SessionFlow.LoadFromStreamingAssets();
        if (report.RuntimeDataPresent && flow.TryAdvance("boot-launcher"))
        {
            NextSceneId = "login";
            StatusLine = $"boot ok | files={report.ExpectedFileCount} | promotion={report.CanonicalPromotion} | next={NextSceneId}";
        }
        else
        {
            NextSceneId = null;
            StatusLine = $"boot blocked | missing={string.Join(",", report.MissingFiles)}";
        }
        Debug.Log($"LOGH7_BOOT:{StatusLine}");
    }

    private void OnGUI()
    {
        GUI.Label(new Rect(20, 20, 1200, 60), $"LOGH VII Boot | {StatusLine}");
    }
}
