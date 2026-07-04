# LOGH VII Unity Client

Unity 6000.5.2f1 is the main product runtime. The legacy `G7MTClient.exe` is an oracle for scenes, UI, logic, resources, packets, and live checks; it is not the product runtime.

## Open

1. Open this folder as a Unity project: `client-unity/`.
2. Open `Assets/Scenes/Logh7_03_StrategicMap.unity` first, or use the scene list below.
3. Run `LOGH VII/Rebuild Galaxy Prototype Scene` in Unity if the prototype scene needs regeneration.

## Generated Scene Inventory

The initial scene list is generated from EXE/Ghidra/MsgDat evidence:

- `Assets/Scenes/Logh7_00_BootLauncher.unity`
- `Assets/Scenes/Logh7_01_Login.unity`
- `Assets/Scenes/Logh7_02_Lobby.unity`
- `Assets/Scenes/Logh7_03_StrategicMap.unity`
- `Assets/Scenes/Logh7_04_FleetOperations.unity`
- `Assets/Scenes/Logh7_05_TacticalBattle.unity`
- `Assets/Scenes/Logh7_06_SystemPlanetDetail.unity`
- `Assets/Scenes/Logh7_07_OrganizationPersonnel.unity`
- `Assets/Scenes/Logh7_08_EconomyLogistics.unity`
- `Assets/Scenes/Logh7_09_DiplomacyIntel.unity`
- `Assets/Scenes/Logh7_10_ReportsMailSystem.unity`
- `Assets/Scenes/Logh7_11_SettingsSaveLoad.unity`

Each scene is a placeholder until its UI and logic contract is closed with CD/manual/Ghidra/live/wire evidence.

## Data

Runtime data starts under `Assets/StreamingAssets/logh7/`. Existing generated catalogs are suspect inputs until promoted by cross-check.
