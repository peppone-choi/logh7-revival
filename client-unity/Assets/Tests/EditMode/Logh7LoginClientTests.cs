using System.IO;
using NUnit.Framework;
using UnityEngine;

// G055: 로그인 클라이언트 계약 테스트 — 서버 응답 JSON 형태(G054 계약)를 그대로 사용.
public class Logh7LoginClientTests
{
    private static Logh7SessionFlow FlowAfterBoot()
    {
        string path = Path.Combine(Application.streamingAssetsPath, "logh7", "logh7-unity-runtime-manifest.json");
        var flow = new Logh7SessionFlow(JsonUtility.FromJson<Logh7UnityRuntimeManifest>(File.ReadAllText(path)));
        Assert.IsTrue(flow.TryAdvance("boot-launcher"));
        return flow;
    }

    [Test]
    public void SuccessfulLoginGrantsLoginSession()
    {
        var flow = FlowAfterBoot();
        var client = new Logh7LoginClient(
            (path, body) => path == "/api/login"
                ? "{\"ok\":true,\"accountId\":\"emp1\",\"token\":\"aa\"}"
                : "{\"ok\":true,\"fileCount\":14,\"canonicalPromotion\":\"blocked-until-cross-source-confirmed\"}",
            flow);
        Assert.AreEqual(14, client.CheckBoot().fileCount);
        var res = client.Login("emp1", "pw");
        Assert.IsTrue(res.ok);
        Assert.AreEqual("emp1", client.Session.accountId);
        Assert.IsTrue(flow.CanEnterScene("lobby"));
    }

    [Test]
    public void FailedLoginDoesNotGrant()
    {
        var flow = FlowAfterBoot();
        var client = new Logh7LoginClient(
            (path, body) => "{\"ok\":false,\"reason\":\"invalid-credentials\"}",
            flow);
        var res = client.Login("emp1", "bad");
        Assert.IsFalse(res.ok);
        Assert.AreEqual("invalid-credentials", res.reason);
        Assert.IsNull(client.Session);
        Assert.IsFalse(flow.CanEnterScene("lobby"));
    }

    [Test]
    public void LoginWithoutBootGrantIsRejectedByFlow()
    {
        string path = Path.Combine(Application.streamingAssetsPath, "logh7", "logh7-unity-runtime-manifest.json");
        var flow = new Logh7SessionFlow(JsonUtility.FromJson<Logh7UnityRuntimeManifest>(File.ReadAllText(path)));
        var client = new Logh7LoginClient((p, b) => "{\"ok\":true,\"accountId\":\"emp1\",\"token\":\"aa\"}", flow);
        var res = client.Login("emp1", "pw");
        Assert.IsTrue(res.ok, "server said ok");
        Assert.IsNull(client.Session, "flow must reject login-session before boot grant");
    }
}
