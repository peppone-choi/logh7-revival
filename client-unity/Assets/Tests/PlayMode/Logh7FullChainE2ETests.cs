using System.Collections;
using System.IO;
using System.Text;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.Networking;
using UnityEngine.TestTools;

// G061: 풀체인 E2E — 실서버(127.0.0.1:8047)로
// boot → login → 캐릭터 생성 → 로비 슬롯 → 선택 → 월드 진입 → 전략맵 grant까지 관통.
public class Logh7FullChainE2ETests
{
    private const string Base = "http://127.0.0.1:8047";

    private static UnityWebRequest JsonPost(string url, string body, string token = null)
    {
        var req = new UnityWebRequest(url, "POST");
        req.uploadHandler = new UploadHandlerRaw(Encoding.UTF8.GetBytes(body));
        req.downloadHandler = new DownloadHandlerBuffer();
        if (token != null)
        {
            req.SetRequestHeader("Authorization", "Bearer " + token);
        }
        return req;
    }

    private static UnityWebRequest JsonGet(string url, string token)
    {
        var req = UnityWebRequest.Get(url);
        req.SetRequestHeader("Authorization", "Bearer " + token);
        return req;
    }

    [UnityTest]
    public IEnumerator FullNormalChainReachesStrategicMap()
    {
        string manifestPath = Path.Combine(Application.streamingAssetsPath, "logh7", "logh7-unity-runtime-manifest.json");
        var flow = new Logh7SessionFlow(JsonUtility.FromJson<Logh7UnityRuntimeManifest>(File.ReadAllText(manifestPath)));

        // boot
        using (var boot = UnityWebRequest.Get(Base + "/api/boot"))
        {
            yield return boot.SendWebRequest();
            Assert.AreEqual(UnityWebRequest.Result.Success, boot.result, "serve:session must be running");
            Assert.IsTrue(flow.TryAdvance("boot-launcher"));
        }

        // login
        string token;
        using (var login = JsonPost(Base + "/api/login", "{\"accountId\":\"dev1\",\"password\":\"dev-pass-1\"}"))
        {
            yield return login.SendWebRequest();
            Assert.AreEqual(UnityWebRequest.Result.Success, login.result);
            var res = JsonUtility.FromJson<Logh7LoginResponse>(login.downloadHandler.text);
            Assert.IsTrue(res.ok);
            token = res.token;
            Assert.IsTrue(flow.TryAdvance("login-session"));
        }

        // 캐릭터 생성 (매 실행 유니크 이름 — 서버는 계정 내 중복 이름 거부)
        string name = "E2E" + System.Guid.NewGuid().ToString("N").Substring(0, 8);
        string characterId;
        using (var create = JsonPost(Base + "/api/characters",
            "{\"name\":\"" + name + "\",\"faction\":\"empire\",\"faceId\":\"gem:1\"}", token))
        {
            yield return create.SendWebRequest();
            Assert.AreEqual(UnityWebRequest.Result.Success, create.result, create.downloadHandler.text);
            var res = JsonUtility.FromJson<Logh7CharacterCreateResponse>(create.downloadHandler.text);
            Assert.IsTrue(res.ok, create.downloadHandler.text);
            characterId = res.character.characterId;
        }

        // 로비 슬롯 → 선택
        using (var lobby = JsonGet(Base + "/api/lobby", token))
        {
            yield return lobby.SendWebRequest();
            Assert.AreEqual(UnityWebRequest.Result.Success, lobby.result);
            Assert.IsTrue(flow.TryAdvance("lobby-session"));
            var res = JsonUtility.FromJson<Logh7LobbyResponse>(lobby.downloadHandler.text);
            Assert.IsTrue(System.Array.Exists(res.characterSlots, s => s.characterId == characterId));
            Assert.IsTrue(flow.TryAdvance("character-select"));
        }

        // 월드 진입 → 전략맵
        using (var world = JsonPost(Base + "/api/world/enter",
            "{\"characterId\":\"" + characterId + "\"}", token))
        {
            yield return world.SendWebRequest();
            Assert.AreEqual(UnityWebRequest.Result.Success, world.result, world.downloadHandler.text);
            var res = JsonUtility.FromJson<Logh7WorldEnterResponse>(world.downloadHandler.text);
            Assert.IsTrue(res.ok);
            Assert.AreEqual("suspect-cross-check-required", res.worldSession.galaxyStatus);
            Assert.GreaterOrEqual(res.worldSession.systemCount, 80);
            Assert.IsTrue(flow.TryAdvance("character-authority"));
            Assert.IsTrue(flow.TryAdvance("world-session"));
            Assert.IsTrue(flow.TryAdvance("strategic-map"));
            Assert.IsTrue(flow.CanEnterScene("strategic-map"));
        }
    }
}
