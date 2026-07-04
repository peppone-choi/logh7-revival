using System.IO;
using NUnit.Framework;
using UnityEngine;

// G063: 월드 세션 컨텍스트 — 서버 승인 시에만 세팅되고 씬 간 전달된다.
public class Logh7WorldSessionContextTests
{
    private const string OkJson =
        "{\"ok\":true,\"worldSession\":{\"characterId\":\"c-1\",\"faction\":\"empire\",\"galaxySource\":\"streaming-assets:generated/galaxy.json\",\"galaxyStatus\":\"suspect-cross-check-required\",\"systemCount\":85}}";

    [SetUp]
    public void ClearContext()
    {
        Logh7WorldSessionContext.Clear();
    }

    [Test]
    public void ApprovedWorldEntrySetsContext()
    {
        string path = Path.Combine(Application.streamingAssetsPath, "logh7", "logh7-unity-runtime-manifest.json");
        var flow = new Logh7SessionFlow(JsonUtility.FromJson<Logh7UnityRuntimeManifest>(File.ReadAllText(path)));
        foreach (string id in new[] { "boot-launcher", "login-session", "lobby-session", "character-select" })
        {
            Assert.IsTrue(flow.TryAdvance(id));
        }
        var client = new Logh7WorldClient((p, b) => OkJson, flow);
        client.EnterWorld("c-1");
        Assert.IsNotNull(Logh7WorldSessionContext.Current);
        Assert.AreEqual("empire", Logh7WorldSessionContext.Current.faction);
    }

    [Test]
    public void RejectedEntryLeavesContextEmpty()
    {
        string path = Path.Combine(Application.streamingAssetsPath, "logh7", "logh7-unity-runtime-manifest.json");
        var flow = new Logh7SessionFlow(JsonUtility.FromJson<Logh7UnityRuntimeManifest>(File.ReadAllText(path)));
        var client = new Logh7WorldClient((p, b) => OkJson, flow); // grant 없음 → flow가 거부
        client.EnterWorld("c-1");
        Assert.IsNull(Logh7WorldSessionContext.Current);
    }
}
