using System.IO;
using NUnit.Framework;
using UnityEngine;

// G059: 캐릭터 클라이언트 계약 — 서버 슬롯 밖 선택 불가, lobby 선행 grant 필수.
public class Logh7CharacterClientTests
{
    private const string SlotJson =
        "{\"ok\":true,\"accountId\":\"emp1\",\"characterSlots\":[{\"characterId\":\"c-1\",\"name\":\"로엔그람\",\"faction\":\"empire\",\"faceId\":\"gem:1\",\"occupied\":true}]}";

    private static Logh7SessionFlow FlowAtLobby()
    {
        string path = Path.Combine(Application.streamingAssetsPath, "logh7", "logh7-unity-runtime-manifest.json");
        var flow = new Logh7SessionFlow(JsonUtility.FromJson<Logh7UnityRuntimeManifest>(File.ReadAllText(path)));
        Assert.IsTrue(flow.TryAdvance("boot-launcher"));
        Assert.IsTrue(flow.TryAdvance("login-session"));
        Assert.IsTrue(flow.TryAdvance("lobby-session"));
        return flow;
    }

    [Test]
    public void CreateRefreshesSlotsAndSelectGrantsCharacterSelect()
    {
        var flow = FlowAtLobby();
        var client = new Logh7CharacterClient(
            (path, body) => path == "/api/characters"
                ? "{\"ok\":true,\"character\":{\"characterId\":\"c-1\",\"name\":\"로엔그람\",\"faction\":\"empire\",\"faceId\":\"gem:1\"}}"
                : SlotJson,
            flow);
        var created = client.CreateCharacter("로엔그람", "empire", "gem:1");
        Assert.IsTrue(created.ok);
        Assert.AreEqual(1, client.Slots.Length);
        Assert.AreEqual("로엔그람", client.Slots[0].name);
        Assert.IsTrue(client.SelectCharacter("c-1"));
        Assert.AreEqual("c-1", client.SelectedCharacterId);
        Assert.IsTrue(flow.CanEnterScene("world-entry"));
    }

    [Test]
    public void SelectingUnknownCharacterFails()
    {
        var flow = FlowAtLobby();
        var client = new Logh7CharacterClient((p, b) => SlotJson, flow);
        client.RefreshSlots();
        Assert.IsFalse(client.SelectCharacter("c-999"));
        Assert.IsNull(client.SelectedCharacterId);
    }

    [Test]
    public void ValidationFailureSurfacesReasonAndGrantsNothing()
    {
        var flow = FlowAtLobby();
        var client = new Logh7CharacterClient(
            (p, b) => p == "/api/characters"
                ? "{\"ok\":false,\"reason\":\"invalid-face\"}"
                : "{\"ok\":true,\"accountId\":\"emp1\",\"characterSlots\":[]}",
            flow);
        var res = client.CreateCharacter("A", "empire", "oam:1");
        Assert.IsFalse(res.ok);
        Assert.AreEqual("invalid-face", res.reason);
        Assert.AreEqual(0, client.Slots.Length);
    }
}
