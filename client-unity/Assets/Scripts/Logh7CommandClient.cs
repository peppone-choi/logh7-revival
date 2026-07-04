using System;
using System.Linq;
using UnityEngine;

// G065: 커맨드 윈도우 데이터 소비자 (GET /api/commands).
// 읽기 전용 카탈로그이며 가변 CP(kind!=fixed)는 unresolved 그대로 표시한다.
// 직무권한카드 기반 가용성 필터링은 직무/계급 슬라이스 이후.
[Serializable]
public sealed class Logh7CommandCost
{
    public string kind;
    public int cp;
}

[Serializable]
public sealed class Logh7CommandInfo
{
    public string id;
    public string categoryId;
    public string categoryJa;
    public string nameJa;
    public Logh7CommandCost cost;
}

[Serializable]
public sealed class Logh7CommandCatalogResponse
{
    public bool ok;
    public int commandCount;
    public Logh7CommandInfo[] commands;
    public string reason;
}

public sealed class Logh7CommandClient
{
    private readonly Func<string, string, string> transport;
    private readonly Logh7SessionFlow flow;

    public Logh7CommandInfo[] Commands { get; private set; } = new Logh7CommandInfo[0];

    public Logh7CommandClient(Func<string, string, string> transport, Logh7SessionFlow flow)
    {
        this.transport = transport;
        this.flow = flow;
    }

    // 커맨드 윈도우는 전략맵 표면 — world-session grant 없이는 로드하지 않는다.
    public Logh7CommandCatalogResponse LoadCatalog()
    {
        if (!flow.CanEnterScene("strategic-map"))
        {
            return new Logh7CommandCatalogResponse { ok = false, reason = "strategic-map-not-granted" };
        }
        var response = JsonUtility.FromJson<Logh7CommandCatalogResponse>(transport("/api/commands", null));
        if (response.ok)
        {
            Commands = response.commands ?? new Logh7CommandInfo[0];
        }
        return response;
    }

    public Logh7CommandInfo[] ByCategory(string categoryId)
    {
        return Commands.Where(c => c.categoryId == categoryId).ToArray();
    }
}
