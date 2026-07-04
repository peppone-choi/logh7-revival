using System;
using System.Linq;
using UnityEngine;

// G059: 캐릭터 생성/선택 계약 소비자.
// 생성/목록은 서버 권위(POST /api/characters, GET /api/lobby).
// 선택은 서버가 준 슬롯 안에서만 가능하며 character-select 단계를 grant한다.
[Serializable]
public sealed class Logh7CharacterCreateResponse
{
    public bool ok;
    public Logh7CreatedCharacter character;
    public string reason;
}

[Serializable]
public sealed class Logh7CreatedCharacter
{
    public string characterId;
    public string name;
    public string faction;
    public string faceId;
}

[Serializable]
internal sealed class Logh7CharacterCreateBody
{
    public string name;
    public string faction;
    public string faceId;
}

public sealed class Logh7CharacterClient
{
    private readonly Func<string, string, string> transport;
    private readonly Logh7SessionFlow flow;

    public Logh7CharacterSlot[] Slots { get; private set; } = new Logh7CharacterSlot[0];
    public string SelectedCharacterId { get; private set; }

    public Logh7CharacterClient(Func<string, string, string> transport, Logh7SessionFlow flow)
    {
        this.transport = transport;
        this.flow = flow;
    }

    public Logh7CharacterCreateResponse CreateCharacter(string name, string faction, string faceId)
    {
        string body = JsonUtility.ToJson(new Logh7CharacterCreateBody { name = name, faction = faction, faceId = faceId });
        var response = JsonUtility.FromJson<Logh7CharacterCreateResponse>(transport("/api/characters", body));
        if (response.ok)
        {
            RefreshSlots();
        }
        return response;
    }

    public Logh7CharacterSlot[] RefreshSlots()
    {
        var lobby = JsonUtility.FromJson<Logh7LobbyResponse>(transport("/api/lobby", null));
        Slots = lobby.ok ? (lobby.characterSlots ?? new Logh7CharacterSlot[0]) : Slots;
        return Slots;
    }

    // 서버가 내려준 슬롯 중에서만 선택 가능; 성공 시 character-select 단계 grant.
    public bool SelectCharacter(string characterId)
    {
        if (!Slots.Any(s => s.characterId == characterId))
        {
            return false;
        }
        if (!flow.TryAdvance("character-select"))
        {
            return false;
        }
        SelectedCharacterId = characterId;
        return true;
    }
}
