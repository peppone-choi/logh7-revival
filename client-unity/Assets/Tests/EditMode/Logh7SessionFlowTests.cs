using System.IO;
using NUnit.Framework;
using UnityEngine;

// 세션 플로 게이트 머신 계약 테스트 (G049).
// 실제 StreamingAssets 매니페스트로 정상 순서를 강제하고, 건너뛰기를 거부하는지 잠근다.
public class Logh7SessionFlowTests
{
    private static Logh7SessionFlow Load()
    {
        string path = Path.Combine(Application.streamingAssetsPath, "logh7", "logh7-unity-runtime-manifest.json");
        var manifest = JsonUtility.FromJson<Logh7UnityRuntimeManifest>(File.ReadAllText(path));
        return new Logh7SessionFlow(manifest);
    }

    [Test]
    public void NormalEntrySceneIsBootUpdateLauncher()
    {
        Assert.AreEqual("boot-update-launcher", Load().NormalEntryScene);
    }

    [Test]
    public void FullNormalOrderAdvances()
    {
        var flow = Load();
        string[] order =
        {
            "boot-launcher", "login-session", "lobby-session",
            "character-select", "character-authority", "world-session", "strategic-map",
        };
        foreach (string id in order)
        {
            Assert.IsTrue(flow.TryAdvance(id), $"step must advance in normal order: {id}");
        }
        Assert.IsTrue(flow.CanEnterScene("strategic-map"));
    }

    [Test]
    public void SkippingGatesIsRejected()
    {
        var flow = Load();
        Assert.IsFalse(flow.TryAdvance("strategic-map"), "strategic-map without world-session must be rejected");
        Assert.IsFalse(flow.TryAdvance("login-session"), "login without boot-runtime must be rejected");
        Assert.IsFalse(flow.CanEnterScene("strategic-map"));
        Assert.IsTrue(flow.CanEnterScene("boot-update-launcher"), "entry scene is always enterable");
    }
}
