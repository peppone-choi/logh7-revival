using System;
using UnityEngine;

// G060: world-entry 계약 소비자.
// 서버가 진입을 승인하면 character-authority → world-session을 순서대로 grant,
// 이후 strategic-map 진입이 가능해진다. 갤럭시 데이터는 suspect 라벨 그대로 표시용.
[Serializable]
public sealed class Logh7WorldEnterResponse
{
    public bool ok;
    public Logh7WorldSessionInfo worldSession;
    public string reason;
}

[Serializable]
public sealed class Logh7WorldSessionInfo
{
    public string characterId;
    public string faction;
    public string galaxySource;
    public string galaxyStatus;
    public int systemCount;
}

[Serializable]
internal sealed class Logh7WorldEnterBody
{
    public string characterId;
}

public sealed class Logh7WorldClient
{
    private readonly Func<string, string, string> transport;
    private readonly Logh7SessionFlow flow;

    public Logh7WorldSessionInfo World { get; private set; }

    public Logh7WorldClient(Func<string, string, string> transport, Logh7SessionFlow flow)
    {
        this.transport = transport;
        this.flow = flow;
    }

    public Logh7WorldEnterResponse EnterWorld(string characterId)
    {
        string body = JsonUtility.ToJson(new Logh7WorldEnterBody { characterId = characterId });
        var response = JsonUtility.FromJson<Logh7WorldEnterResponse>(transport("/api/world/enter", body));
        if (response.ok
            && flow.TryAdvance("character-authority")
            && flow.TryAdvance("world-session"))
        {
            World = response.worldSession;
            Logh7WorldSessionContext.Set(World); // 전략맵 씬이 소비
        }
        return response;
    }

    public bool EnterStrategicMap()
    {
        return World != null && flow.TryAdvance("strategic-map");
    }
}
