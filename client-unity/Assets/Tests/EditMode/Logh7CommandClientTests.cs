using System.IO;
using NUnit.Framework;
using UnityEngine;

// G065: 커맨드 클라이언트 — world-session grant 필수, 카탈로그 파싱/카테고리 필터.
public class Logh7CommandClientTests
{
    private const string CatalogJson =
        "{\"ok\":true,\"commandCount\":2,\"commands\":[" +
        "{\"id\":\"operations-001\",\"categoryId\":\"operations\",\"categoryJa\":\"作戦コマンド\",\"nameJa\":\"ワープ航行\",\"cost\":{\"kind\":\"fixed\",\"cp\":40}}," +
        "{\"id\":\"politics-003\",\"categoryId\":\"politics\",\"categoryJa\":\"政治コマンド\",\"nameJa\":\"演説\",\"cost\":{\"kind\":\"variable-cost-unresolved\",\"cp\":0}}]}";

    private static Logh7SessionFlow FullyGrantedFlow()
    {
        string path = Path.Combine(Application.streamingAssetsPath, "logh7", "logh7-unity-runtime-manifest.json");
        var flow = new Logh7SessionFlow(JsonUtility.FromJson<Logh7UnityRuntimeManifest>(File.ReadAllText(path)));
        foreach (string id in new[] { "boot-launcher", "login-session", "lobby-session", "character-select", "character-authority", "world-session", "strategic-map" })
        {
            Assert.IsTrue(flow.TryAdvance(id));
        }
        return flow;
    }

    [Test]
    public void LoadsCatalogAndFiltersByCategory()
    {
        var client = new Logh7CommandClient((p, b) => CatalogJson, FullyGrantedFlow());
        var res = client.LoadCatalog();
        Assert.IsTrue(res.ok);
        Assert.AreEqual(2, client.Commands.Length);
        var ops = client.ByCategory("operations");
        Assert.AreEqual(1, ops.Length);
        Assert.AreEqual("ワープ航行", ops[0].nameJa);
        Assert.AreEqual(40, ops[0].cost.cp);
        Assert.AreEqual("variable-cost-unresolved", client.ByCategory("politics")[0].cost.kind);
    }

    [Test]
    public void CatalogIsBlockedWithoutWorldSession()
    {
        string path = Path.Combine(Application.streamingAssetsPath, "logh7", "logh7-unity-runtime-manifest.json");
        var flow = new Logh7SessionFlow(JsonUtility.FromJson<Logh7UnityRuntimeManifest>(File.ReadAllText(path)));
        var client = new Logh7CommandClient((p, b) => CatalogJson, flow);
        var res = client.LoadCatalog();
        Assert.IsFalse(res.ok);
        Assert.AreEqual("strategic-map-not-granted", res.reason);
        Assert.AreEqual(0, client.Commands.Length);
    }
}
