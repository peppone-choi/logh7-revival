using System;
using UnityEngine;

// G057: lobby 계약 소비자. 유효 로그인 세션 전제, 성공 시 lobby-session grant.
[Serializable]
public sealed class Logh7LobbyResponse
{
    public bool ok;
    public string accountId;
    public Logh7CharacterSlot[] characterSlots;
    public string reason;
}

public sealed class Logh7LobbyClient
{
    private readonly Func<string, string, string> transport;
    private readonly Logh7SessionFlow flow;

    public Logh7LobbyState State { get; private set; }

    public Logh7LobbyClient(Func<string, string, string> transport, Logh7SessionFlow flow)
    {
        this.transport = transport;
        this.flow = flow;
    }

    public Logh7LobbyResponse EnterLobby()
    {
        var response = JsonUtility.FromJson<Logh7LobbyResponse>(transport("/api/lobby", null));
        if (response.ok && flow.TryAdvance("lobby-session"))
        {
            State = new Logh7LobbyState
            {
                accountId = response.accountId,
                characterSlots = response.characterSlots ?? new Logh7CharacterSlot[0],
            };
        }
        return response;
    }
}
