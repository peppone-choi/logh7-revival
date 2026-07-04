using System;

[Serializable]
public sealed class Logh7UnityRuntimeManifest
{
    public string id;
    public Logh7RuntimePolicy runtime;
    public Logh7SessionFlowStep[] sessionFlow;
    public Logh7RuntimeStateModel[] runtimeStateModels;
}

[Serializable]
public sealed class Logh7RuntimePolicy
{
    public string mainClient;
    public string unityVersion;
    public string originalExePolicy;
    public string normalEntryScene;
}

[Serializable]
public sealed class Logh7SessionFlowStep
{
    public string id;
    public string sceneId;
    public string stateModel;
    public string[] grants;
    public string[] requires;
}

[Serializable]
public sealed class Logh7RuntimeStateModel
{
    public string id;
    public string authority;
    public string[] owns;
}

[Serializable]
public sealed class Logh7BootState
{
    public string sceneId;
    public bool runtimeDataPresent;
}

[Serializable]
public sealed class Logh7LoginSession
{
    public string accountId;
    public string endpoint;
}

[Serializable]
public sealed class Logh7LobbyState
{
    public string accountId;
    public Logh7CharacterSlot[] characterSlots;
}

[Serializable]
public sealed class Logh7CharacterSlot
{
    public string slotId;
    public string characterId;
    public bool occupied;
    // G058 서버 계약: 슬롯에 캐릭터 표시 정보 포함
    public string name;
    public string faction;
    public string faceId;
}

[Serializable]
public sealed class Logh7PlayerCharacter
{
    public string characterId;
    public string displayName;
    public string factionId;
    public string rankId;
}

[Serializable]
public sealed class Logh7CharacterAuthority
{
    public string accountId;
    public string selectedCharacterId;
    public bool worldAccessGranted;
}

[Serializable]
public sealed class Logh7WorldSession
{
    public string scenarioId;
    public string characterId;
    public string strategicMapSceneId;
}
