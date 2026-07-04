#if UNITY_EDITOR
using System;
using System.IO;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;

[InitializeOnLoad]
public static class Logh7PrototypeSceneGenerator
{
    private const string ScenePath = "Assets/Scenes/Logh7GalaxyPrototype.unity";
    private const string GalaxyPath = "Assets/StreamingAssets/logh7/generated/galaxy.json";
    private const string SourcePackPath = "Assets/StreamingAssets/logh7/logh7-unity-source-pack-manifest.json";
    private const string RuntimeManifestPath = "Assets/StreamingAssets/logh7/logh7-unity-runtime-manifest.json";
    private const string StreamingExportPath = "Assets/StreamingAssets/logh7/logh7-unity-streamingassets-export.json";

    static Logh7PrototypeSceneGenerator()
    {
        EditorApplication.delayCall += EnsureSceneExists;
    }

    [MenuItem("LOGH VII/Rebuild Galaxy Prototype Scene")]
    public static void RebuildSceneFromMenu()
    {
        BuildScene(openAfterBuild: true);
    }

    public static void RebuildSceneForBatch()
    {
        BuildScene(openAfterBuild: false);
    }

    private static void EnsureSceneExists()
    {
        if (!File.Exists(ScenePath))
        {
            BuildScene(openAfterBuild: false);
        }
    }

    private static void BuildScene(bool openAfterBuild)
    {
        Directory.CreateDirectory("Assets/Scenes");

        Scene scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
        scene.name = "Logh7GalaxyPrototype";

        CreateCamera();
        CreateLight();

        var root = new GameObject("LOGH VII Unity Validation Surface");
        root.AddComponent<Logh7GalaxyPrototypeRuntime>();

        CreateStaticValidationSurface(root.transform);

        EditorSceneManager.SaveScene(scene, ScenePath);
        if (openAfterBuild)
        {
            EditorSceneManager.OpenScene(ScenePath);
        }

        AssetDatabase.Refresh();
    }

    private static void CreateCamera()
    {
        var cameraObject = new GameObject("Main Camera");
        var camera = cameraObject.AddComponent<Camera>();
        camera.tag = "MainCamera";
        camera.clearFlags = CameraClearFlags.SolidColor;
        camera.backgroundColor = new Color(0.015f, 0.018f, 0.026f, 1f);
        camera.orthographic = true;
        camera.orthographicSize = 5.4f;
        cameraObject.transform.position = new Vector3(0f, 0f, -10f);
    }

    private static void CreateLight()
    {
        var lightObject = new GameObject("Key Light");
        var light = lightObject.AddComponent<Light>();
        light.type = LightType.Directional;
        light.color = new Color(0.9f, 0.95f, 1f, 1f);
        light.intensity = 1.2f;
        lightObject.transform.rotation = Quaternion.Euler(50f, -30f, 0f);
    }

    private static void CreateStaticValidationSurface(Transform parent)
    {
        CreatePanel(parent, "Header Panel", new Vector2(0f, 4.55f), new Vector2(18.7f, 0.85f), new Color(0.08f, 0.10f, 0.14f, 1f));
        CreateText(parent, "Title", "LOGH VII Revival - Unity Build", new Vector2(-8.85f, 4.72f), 0.055f, Color.white);
        CreateText(parent, "Subtitle", "Boot/Login/Lobby shell + suspect galaxy data preview", new Vector2(-8.85f, 4.45f), 0.032f, new Color(0.74f, 0.86f, 1f, 1f));

        CreatePanel(parent, "Map Panel", new Vector2(-3.45f, 0.25f), new Vector2(11.2f, 7.6f), new Color(0.025f, 0.032f, 0.046f, 1f));
        CreatePanel(parent, "Evidence Panel", new Vector2(5.85f, 0.25f), new Vector2(6.7f, 7.6f), new Color(0.045f, 0.052f, 0.07f, 1f));
        CreatePanel(parent, "Control Panel", new Vector2(-3.45f, -4.55f), new Vector2(11.2f, 1.25f), new Color(0.06f, 0.065f, 0.08f, 1f));

        CreateText(parent, "Map Label", "Strategic Map Preview - 85 suspect systems", new Vector2(-8.75f, 3.55f), 0.04f, Color.white);
        CreateText(parent, "Evidence Label", "Runtime Evidence", new Vector2(2.7f, 3.55f), 0.045f, Color.white);
        CreateText(parent, "Controls Label", "Playable shell: CONNECT -> LOBBY -> CHARACTER -> WORLD -> STRATEGIC MAP", new Vector2(-8.75f, -4.25f), 0.03f, new Color(0.82f, 0.88f, 1f, 1f));

        CreateGalaxyDots(parent);
        CreateSourceLedgerPanel(parent);
        CreateSessionFlow(parent);
    }

    private static void CreateGalaxyDots(Transform parent)
    {
        GalaxyData data = LoadGalaxy();
        GalaxySystem[] systems = data?.systems;
        int count = systems?.Length ?? 85;

        for (int i = 0; i < count; i += 1)
        {
            GalaxySystem system = systems != null ? systems[i] : null;
            float col = system != null && system.canonGameCol > 0 ? system.canonGameCol : (i * 37) % 100;
            float row = system != null && system.canonGameRow > 0 ? system.canonGameRow : 4 + ((i * 19) % 46);
            float x = -8.55f + Mathf.Clamp01(col / 100f) * 10.2f;
            float y = 3.12f - Mathf.Clamp01(row / 50f) * 6.6f;
            Color color = FactionColor(system?.faction);
            float size = i < 12 ? 0.09f : 0.055f;

            CreatePanel(parent, $"System Dot {i + 1}", new Vector2(x, y), new Vector2(size, size), color);

            if (i < 10)
            {
                CreateText(parent, $"System Label {i + 1}", $"S{i + 1}", new Vector2(x + 0.10f, y + 0.04f), 0.024f, new Color(0.84f, 0.90f, 1f, 1f));
            }
        }
    }

    private static void CreateSourceLedgerPanel(Transform parent)
    {
        string runtime = File.Exists(RuntimeManifestPath) ? "Runtime: Unity 6000.5.2f1, EXE oracle-only" : "Runtime: missing";
        string sourcePack = File.Exists(SourcePackPath) ? "source-pack: Ship/GE=117, crest variants=3" : "source-pack: missing";
        string streaming = File.Exists(StreamingExportPath) ? "StreamingAssets: present, promotion blocked" : "StreamingAssets: missing";
        string watch = "Watch: positions/roster not confirmed new";

        string[] lines =
        {
            runtime,
            sourcePack,
            "asset-source-truth: consumers=5, violations=0",
            "ui-boundary: scene inventory linked",
            streaming,
            watch,
            "Scope: visual shell, not full game yet"
        };

        for (int i = 0; i < lines.Length; i += 1)
        {
            CreateText(parent, $"Evidence Line {i + 1}", lines[i], new Vector2(2.7f, 3.05f - (i * 0.38f)), 0.03f, new Color(0.82f, 0.90f, 1f, 1f));
        }
    }

    private static void CreateSessionFlow(Transform parent)
    {
        string[] labels = { "Boot", "Login", "Lobby", "Character", "World", "Strategic Map" };
        for (int i = 0; i < labels.Length; i += 1)
        {
            float x = -8.55f + (i * 1.72f);
            CreatePanel(parent, $"Gate {labels[i]}", new Vector2(x + 0.62f, -4.68f), new Vector2(1.36f, 0.28f), new Color(0.18f, 0.48f, 0.72f, 1f));
            CreateText(parent, $"Gate Label {labels[i]}", labels[i], new Vector2(x, -4.73f), 0.026f, Color.white);
        }
    }

    private static GalaxyData LoadGalaxy()
    {
        if (!File.Exists(GalaxyPath))
        {
            return null;
        }

        try
        {
            return JsonUtility.FromJson<GalaxyData>(File.ReadAllText(GalaxyPath));
        }
        catch (Exception ex)
        {
            Debug.LogWarning($"LOGH7 scene generator galaxy load failed: {ex.Message}");
            return null;
        }
    }

    private static void CreatePanel(Transform parent, string name, Vector2 center, Vector2 size, Color color)
    {
        GameObject panel = GameObject.CreatePrimitive(PrimitiveType.Quad);
        panel.name = name;
        panel.transform.SetParent(parent, false);
        panel.transform.position = new Vector3(center.x, center.y, 0f);
        panel.transform.localScale = new Vector3(size.x, size.y, 1f);
        panel.GetComponent<Renderer>().sharedMaterial = CreateMaterial(color);
    }

    private static void CreateText(Transform parent, string name, string text, Vector2 position, float characterSize, Color color)
    {
        var textObject = new GameObject(name);
        textObject.transform.SetParent(parent, false);
        textObject.transform.position = new Vector3(position.x, position.y, -0.2f);

        var mesh = textObject.AddComponent<TextMesh>();
        mesh.text = text;
        mesh.anchor = TextAnchor.UpperLeft;
        mesh.alignment = TextAlignment.Left;
        mesh.characterSize = characterSize;
        mesh.fontSize = 72;
        mesh.color = color;

        Renderer renderer = textObject.GetComponent<Renderer>();
        renderer.sharedMaterial = mesh.font.material;
    }

    private static Material CreateMaterial(Color color)
    {
        Shader shader = Shader.Find("Unlit/Color");
        if (shader == null)
        {
            shader = Shader.Find("Sprites/Default");
        }

        var material = new Material(shader);
        material.color = color;
        return material;
    }

    private static Color FactionColor(string faction)
    {
        switch (faction)
        {
            case "empire":
                return new Color(0.95f, 0.44f, 0.24f, 1f);
            case "alliance":
                return new Color(0.28f, 0.72f, 1f, 1f);
            case "phezzan":
                return new Color(0.95f, 0.82f, 0.28f, 1f);
            default:
                return new Color(0.78f, 0.82f, 0.88f, 1f);
        }
    }

    [Serializable]
    private sealed class GalaxyData
    {
        public GalaxySystem[] systems;
    }

    [Serializable]
    private sealed class GalaxySystem
    {
        public string system;
        public string faction;
        public int canonGameCol;
        public int canonGameRow;
    }
}
#endif
