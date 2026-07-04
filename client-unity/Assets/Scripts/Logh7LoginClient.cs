using System;
using UnityEngine;

// G055: 세션 서버(/api/boot, /api/login) 계약 소비자.
// 전송은 주입식(테스트=페이크, 런타임=UnityWebRequest 예정). 성공 시에만 login-session grant.
[Serializable]
public sealed class Logh7BootResponse
{
    public bool ok;
    public int fileCount;
    public string canonicalPromotion;
}

[Serializable]
public sealed class Logh7LoginResponse
{
    public bool ok;
    public string accountId;
    public string token;
    public string reason;
}

[Serializable]
internal sealed class Logh7LoginRequestBody
{
    public string accountId;
    public string password;
}

public sealed class Logh7LoginClient
{
    // (path, jsonBody|null) -> 응답 JSON 문자열. 실패는 예외로 표현.
    private readonly Func<string, string, string> transport;
    private readonly Logh7SessionFlow flow;

    public Logh7LoginSession Session { get; private set; }

    public Logh7LoginClient(Func<string, string, string> transport, Logh7SessionFlow flow)
    {
        this.transport = transport;
        this.flow = flow;
    }

    public Logh7BootResponse CheckBoot()
    {
        return JsonUtility.FromJson<Logh7BootResponse>(transport("/api/boot", null));
    }

    public Logh7LoginResponse Login(string accountId, string password)
    {
        string body = JsonUtility.ToJson(new Logh7LoginRequestBody { accountId = accountId, password = password });
        var response = JsonUtility.FromJson<Logh7LoginResponse>(transport("/api/login", body));
        if (response.ok && flow.TryAdvance("login-session"))
        {
            Session = new Logh7LoginSession { accountId = response.accountId, endpoint = "/api/login" };
        }
        return response;
    }
}
