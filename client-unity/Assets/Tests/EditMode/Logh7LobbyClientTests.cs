using System.IO;
using NUnit.Framework;
using UnityEngine;

// G057: lobby 클라이언트 계약 — login-session 선행 grant 없이는 진입 불가.
public class Logh7LobbyClientTests
{
    private static Logh7SessionFlow LoadFlow()
    {
        string path = Path.Combine(Application.streamingAssetsPath, "logh7", "logh7-unity-runtime-manifest.json");
        return new Logh7SessionFlow(JsonUtility.FromJson<Logh7UnityRuntimeManifest>(File.ReadAllText(path)));
    }

    [Test]
    public void LobbyEntryAfterLoginGrantsLobbySession()
    {
        var flow = LoadFlow();
        Assert.IsTrue(flow.TryAdvance("boot-launcher"));
        Assert.IsTrue(flow.TryAdvance("login-session"));
        var client = new Logh7LobbyClient(
            (p, b) => "{\"ok\":true,\"accountId\":\"emp1\",\"characterSlots\":[]}", flow);
        var res = client.EnterLobby();
        Assert.IsTrue(res.ok);
        Assert.AreEqual("emp1", client.State.accountId);
        Assert.AreEqual(0, client.State.characterSlots.Length);
        Assert.IsTrue(flow.CanEnterScene("character-select"));
    }

    [Test]
    public void LobbyEntryWithoutLoginIsRejected()
    {
        var flow = LoadFlow();
        Assert.IsTrue(flow.TryAdvance("boot-launcher"));
        var client = new Logh7LobbyClient(
            (p, b) => "{\"ok\":true,\"accountId\":\"emp1\",\"characterSlots\":[]}", flow);
        client.EnterLobby();
        Assert.IsNull(client.State, "lobby-session must be rejected without login-session grant");
    }

    [Test]
    public void InvalidSessionResponseGrantsNothing()
    {
        var flow = LoadFlow();
        Assert.IsTrue(flow.TryAdvance("boot-launcher"));
        Assert.IsTrue(flow.TryAdvance("login-session"));
        var client = new Logh7LobbyClient(
            (p, b) => "{\"ok\":false,\"reason\":\"invalid-session\"}", flow);
        var res = client.EnterLobby();
        Assert.IsFalse(res.ok);
        Assert.IsNull(client.State);
    }
}
