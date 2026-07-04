using System.Collections;
using System.IO;
using System.Text;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.Networking;
using UnityEngine.TestTools;

// G056: 실서버 E2E — serve:session(127.0.0.1:8047)이 떠 있어야 한다.
// 하네스가 계정 fixture(.omo/work/logh7-dev-accounts.json: dev1)를 만들고 서버를 먼저 기동한다.
public class Logh7LoginE2ETests
{
    private const string Base = "http://127.0.0.1:8047";

    private static UnityWebRequest JsonPost(string url, string body)
    {
        var req = new UnityWebRequest(url, "POST");
        req.uploadHandler = new UploadHandlerRaw(Encoding.UTF8.GetBytes(body));
        req.downloadHandler = new DownloadHandlerBuffer();
        return req;
    }

    [UnityTest]
    public IEnumerator BootAndLoginRoundTripAgainstLiveServer()
    {
        using (var boot = UnityWebRequest.Get(Base + "/api/boot"))
        {
            yield return boot.SendWebRequest();
            Assert.AreEqual(UnityWebRequest.Result.Success, boot.result,
                "serve:session must be running on 127.0.0.1:8047 for this E2E test");
            string bootJson = boot.downloadHandler.text;

            using (var login = JsonPost(Base + "/api/login",
                "{\"accountId\":\"dev1\",\"password\":\"dev-pass-1\"}"))
            {
                yield return login.SendWebRequest();
                Assert.AreEqual(UnityWebRequest.Result.Success, login.result);
                string loginJson = login.downloadHandler.text;

                // 실서버 응답 그대로 Logh7LoginClient에 재생 — 클라 로직까지 관통 검증
                string manifestPath = Path.Combine(Application.streamingAssetsPath, "logh7", "logh7-unity-runtime-manifest.json");
                var flow = new Logh7SessionFlow(JsonUtility.FromJson<Logh7UnityRuntimeManifest>(File.ReadAllText(manifestPath)));
                Assert.IsTrue(flow.TryAdvance("boot-launcher"));
                var client = new Logh7LoginClient((path, body) => path == "/api/boot" ? bootJson : loginJson, flow);
                Assert.Greater(client.CheckBoot().fileCount, 0);
                var result = client.Login("dev1", "dev-pass-1");
                Assert.IsTrue(result.ok, loginJson);
                Assert.AreEqual("dev1", client.Session.accountId);
                Assert.IsTrue(flow.CanEnterScene("lobby"));
            }
        }
    }

    [UnityTest]
    public IEnumerator WrongPasswordIsRejectedByLiveServer()
    {
        using (var login = JsonPost(Base + "/api/login",
            "{\"accountId\":\"dev1\",\"password\":\"wrong\"}"))
        {
            yield return login.SendWebRequest();
            Assert.AreEqual(401, (int)login.responseCode);
        }
    }
}
