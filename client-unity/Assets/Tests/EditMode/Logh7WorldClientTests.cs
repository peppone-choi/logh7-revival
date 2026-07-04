using System.IO;
using NUnit.Framework;
using UnityEngine;

// G060: 월드 클라이언트 — 전체 정상 체인 끝에서 strategic-map까지 도달, 건너뛰기 거부.
public class Logh7WorldClientTests
{
    private const string OkJson =
        "{\"ok\":true,\"worldSession\":{\"characterId\":\"c-1\",\"faction\":\"empire\",\"galaxySource\":\"streaming-assets:generated/galaxy.json\",\"galaxyStatus\":\"suspect-cross-check-required\",\"systemCount\":85}}";

    private static Logh7SessionFlow FlowAt(string upTo)
    {
        string path = Path.Combine(Application.streamingAssetsPath, "logh7", "logh7-unity-runtime-manifest.json");
        var flow = new Logh7SessionFlow(JsonUtility.FromJson<Logh7UnityRuntimeManifest>(File.ReadAllText(path)));
        string[] order = { "boot-launcher", "login-session", "lobby-session", "character-select" };
        foreach (string id in order)
        {
            Assert.IsTrue(flow.TryAdvance(id));
            if (id == upTo) break;
        }
        return flow;
    }

    [Test]
    public void WorldEntryCompletesChainToStrategicMap()
    {
        var flow = FlowAt("character-select");
        var client = new Logh7WorldClient((p, b) => OkJson, flow);
        var res = client.EnterWorld("c-1");
        Assert.IsTrue(res.ok);
        Assert.AreEqual(85, client.World.systemCount);
        Assert.AreEqual("suspect-cross-check-required", client.World.galaxyStatus);
        Assert.IsTrue(client.EnterStrategicMap());
        Assert.IsTrue(flow.CanEnterScene("strategic-map"));
    }

    [Test]
    public void WorldEntryWithoutCharacterSelectIsRejected()
    {
        var flow = FlowAt("lobby-session");
        var client = new Logh7WorldClient((p, b) => OkJson, flow);
        var res = client.EnterWorld("c-1");
        Assert.IsTrue(res.ok, "server said ok");
        Assert.IsNull(client.World, "flow must reject world entry before character-select");
        Assert.IsFalse(client.EnterStrategicMap());
    }

    [Test]
    public void ServerRejectionGrantsNothing()
    {
        var flow = FlowAt("character-select");
        var client = new Logh7WorldClient(
            (p, b) => "{\"ok\":false,\"reason\":\"character-not-owned\"}", flow);
        var res = client.EnterWorld("c-x");
        Assert.IsFalse(res.ok);
        Assert.IsNull(client.World);
    }
}
