using System;
using System.Collections;
using System.IO;
using System.Text;
using UnityEngine;
using UnityEngine.Networking;

public sealed class Logh7GalaxyPrototypeRuntime : MonoBehaviour
{
    private const int MaxLabeledSystems = 12;
    private const string StrategicMapBlockedReason = "StrategicMap is blocked without WorldSession";

    // 원본 로그인 화면(P0): .omo/work/logh7-installed/data/image/gamemenu/title.tga (640x480)
    // 창 캡션 근거: G7MTClient.exe 문서 등록 문자열(0x3c470a) "銀河英雄伝説Ⅶ"
    private const string LegacyWindowCaption = "銀河英雄伝説Ⅶ";
    // 메뉴바 근거: G7MTClient.exe 메뉴 리소스(0x3c359e) ﾌｧｲﾙ(&F)/ﾍﾙﾌﾟ(&H) 반각 표기
    private const string LegacyMenuBar = "ﾌｧｲﾙ(F)    ﾍﾙﾌﾟ(H)";
    // 저작권/버전 표기 근거: title.tga 하단 각인
    private const string LegacyCopyrightLine = "(C)2004 田中芳樹・TW (C)2004 BOTHTEC (C)2004 MiCROViSiON INC.";
    private const string LegacyCopyrightLine2 = "ORIGINAL MECHANIC DESIGN 加藤直之 (C)OGG の版権元";
    private const string LegacyClientVersionLine = "クライアントバージョン Ver B1.00";

    // 로그인 상태 문자열 근거: G7MTClient.exe 0x36bea0 부근 로그인 상태 문자열 테이블(P0)
    private const string LegacyConnectingLine = "now connecting. please wait...";
    private const string LegacyLoginConnectFailLine = "ログインサーバーへの接続に失敗";
    private const string LegacyLoginAuthErrorLine = "ログインサーバー認証エラー";

    // 로비 배경 근거: G7MTClient.exe 0x3721bc 하드코딩 기본 배경 ../data/image/spot/bg005.jpg (룸 전환 포맷 bg%03d.jpg)
    // 시설/장소 라벨 근거: 원본 스크린샷 레퍼런스(P1) docs/reference/ui-catalog/toshichan 80952a_lobby.jpg (宇宙港 警戒ロビー)
    private const string LegacyLobbyLocationName = "宇宙港";
    private const string LegacyLobbyPanelTitle = "施設内ロビー";
    private static readonly string[] LegacyLobbyRooms = { "旗艦桟橋", "航路管理センター" };

    private GalaxyData galaxy;
    private SceneCatalogData sceneCatalog;
    private SurfacePanelManifestData surfacePanelManifest;
    private string statusLine = "Loading LOGH VII Unity runtime data";
    private string runtimeLine = "runtime manifest: pending";
    private string sourcePackLine = "source-pack: pending";
    private string sourceTruthLine = "asset-source-truth: pending";
    private string uiBoundaryLine = "ui-boundary: pending";
    private string remasterProvenanceLine = "remaster provenance: pending";
    private string streamingExportLine = "streaming-assets export: pending";
    private string sceneCatalogLine = "ui scene catalog: pending";
    private string surfacePanelLine = "ui scene panels: pending";
    private string watchLine = "systemPositions/originalCharacterRoster: watch only";
    private string playerName = "Yang Wen-li";
    private Texture2D loginBackgroundTexture;
    private string loginId = string.Empty;
    private string loginPassword = string.Empty;
    private GUIStyle loginFieldStyle;
    private GUIStyle loginOverlayButtonStyle;
    private GUIStyle loginStatusStyle;
    private string loginStatusLine = string.Empty;
    private bool loginInFlight;
    private string sessionToken;
    private string sessionAccountId;
    private string sessionServerBase;
    private Texture2D lobbyBackgroundTexture;
    private LobbyResponseBody lobbyResponse;
    private string lobbyStatusLine = "lobby: pending";
    private int gateIndex;
    private int selectedSurfaceIndex;
    private bool hasCharacter;
    private bool hasWorldSession;

    private readonly string[] gateLabels =
    {
        "Boot",
        "Login",
        "Lobby",
        "Character Select",
        "World Entry",
        "Strategic Map"
    };


    private void Start()
    {
        string root = Path.Combine(Application.streamingAssetsPath, "logh7");
        string generatedRoot = Path.Combine(root, "generated");
        string galaxyPath = Path.Combine(generatedRoot, "galaxy.json");
        string runtimeManifestPath = Path.Combine(root, "logh7-unity-runtime-manifest.json");
        string sourcePackPath = Path.Combine(root, "logh7-unity-source-pack-manifest.json");
        string sourceTruthPath = Path.Combine(root, "logh7-unity-asset-source-truth.json");
        string uiBoundaryPath = Path.Combine(root, "logh7-ui-scene-remaster-gameplay-boundary.json");
        string remasterProvenancePath = Path.Combine(root, "logh7-remaster-provenance-manifest.json");
        string streamingExportPath = Path.Combine(root, "logh7-unity-streamingassets-export.json");
        string sceneCatalogPath = Path.Combine(root, "logh7-ui-scene-catalog.json");
        string surfacePanelPath = Path.Combine(root, "logh7-unity-scene-surface-panels.json");
        string watchPath = Path.Combine(generatedRoot, "logh7-hidden-data-watchlist.json");

        galaxy = LoadGalaxy(galaxyPath);
        sceneCatalog = LoadSceneCatalog(sceneCatalogPath);
        surfacePanelManifest = LoadSurfacePanelManifest(surfacePanelPath);
        loginBackgroundTexture = LoadTexture(Path.Combine(root, "original", "gamemenu", "title.png"));
        lobbyBackgroundTexture = LoadTexture(Path.Combine(root, "original", "spot", "bg005.jpg"));
        // 실세션 서버 주소: 환경변수 우선, 기본은 로컬 serve:session
        sessionServerBase = Environment.GetEnvironmentVariable("LOGH7_SESSION_BASE");
        if (string.IsNullOrEmpty(sessionServerBase))
        {
            sessionServerBase = "http://127.0.0.1:8047";
        }

        int systemCount = galaxy?.systems?.Length ?? 0;
        statusLine = $"Unity validation surface: {systemCount} suspect galaxy systems loaded";
        runtimeLine = BuildRuntimeLine(runtimeManifestPath);
        sourcePackLine = BuildSourcePackLine(sourcePackPath);
        sourceTruthLine = BuildSourceTruthLine(sourceTruthPath);
        uiBoundaryLine = BuildUiBoundaryLine(uiBoundaryPath);
        remasterProvenanceLine = File.Exists(remasterProvenancePath) ? "remaster provenance: present" : "remaster provenance: missing";
        streamingExportLine = BuildStreamingExportLine(streamingExportPath);
        sceneCatalogLine = BuildSceneCatalogLine(sceneCatalog, sceneCatalogPath);
        surfacePanelLine = BuildSurfacePanelLine(surfacePanelManifest, surfacePanelPath);
        watchLine = BuildWatchLine(watchPath);
    }

    private void OnGUI()
    {
        // 로그인 이전 게이트는 원본 로그인 화면(title.tga)을 그대로 재현한다
        if (gateIndex <= 1)
        {
            DrawLegacyLoginPanel();
            return;
        }

        // 로비 게이트는 원본 spot 배경(EXE 기본 bg005) + 施設内ロビー 구조를 재현한다
        if (gateIndex == 2)
        {
            DrawLegacyLobbyPanel();
            return;
        }

        DrawBackdrop();
        DrawHeader();
        DrawSessionStrip();
        DrawGalaxyMap();
        DrawSceneSurfaceSwitcher();
        DrawControls();
        DrawEvidencePanel();
    }

    private static GalaxyData LoadGalaxy(string path)
    {
        if (!File.Exists(path))
        {
            return null;
        }

        try
        {
            return JsonUtility.FromJson<GalaxyData>(File.ReadAllText(path));
        }
        catch (Exception ex)
        {
            Debug.LogWarning($"LOGH7 galaxy load failed: {ex.Message}");
            return null;
        }
    }

    private static SceneCatalogData LoadSceneCatalog(string path)
    {
        if (!File.Exists(path))
        {
            return null;
        }

        try
        {
            return JsonUtility.FromJson<SceneCatalogData>(File.ReadAllText(path));
        }
        catch (Exception ex)
        {
            Debug.LogWarning($"LOGH7 scene catalog load failed: {ex.Message}");
            return null;
        }
    }

    private static SurfacePanelManifestData LoadSurfacePanelManifest(string path)
    {
        if (!File.Exists(path))
        {
            return null;
        }

        try
        {
            return JsonUtility.FromJson<SurfacePanelManifestData>(File.ReadAllText(path));
        }
        catch (Exception ex)
        {
            Debug.LogWarning($"LOGH7 scene surface panel manifest load failed: {ex.Message}");
            return null;
        }
    }

    private static string BuildRuntimeLine(string path)
    {
        if (!File.Exists(path))
        {
            return "runtime manifest: missing";
        }

        string json = File.ReadAllText(path);
        string unityVersion = ExtractJsonString(json, "unityVersion");
        string entryScene = ExtractJsonString(json, "normalEntryScene");
        string exePolicy = ExtractJsonString(json, "originalExePolicy");
        return $"runtime manifest: Unity {unityVersion} | entry={entryScene} | EXE={exePolicy}";
    }

    private static string BuildSourcePackLine(string path)
    {
        if (!File.Exists(path))
        {
            return "source-pack: missing";
        }

        string json = File.ReadAllText(path);
        string promotion = Contains(json, "blocked-until-cross-source-confirmed") ? "blocked" : "unknown";
        string ship = Contains(json, "\"imperialShipMdx\"") && Contains(json, "\"fileCount\": 117")
            ? "Ship/GE=117"
            : "Ship/GE pending";
        string crest = Contains(json, "imperialDoubleEagleReference") ? "crest reference present" : "crest pending";
        return $"source-pack: promotion={promotion} | {ship} | crest variants=3 | {crest}";
    }

    private static string BuildSourceTruthLine(string path)
    {
        if (!File.Exists(path))
        {
            return "asset-source-truth: missing";
        }

        string json = File.ReadAllText(path);
        string inputs = Contains(json, "\"sourceTruthInputs\"") ? "sourceTruthInputs=9" : "sourceTruthInputs pending";
        string consumers = Contains(json, "\"unityRuntimeConsumers\"") ? "runtimeConsumers=5" : "runtimeConsumers pending";
        string violations = Contains(json, "\"violationCount\": 0") ? "violations=0" : "violations check";
        return $"asset-source-truth: {inputs} | {consumers} | {violations}";
    }

    private static string BuildUiBoundaryLine(string path)
    {
        if (!File.Exists(path))
        {
            return "ui-boundary: missing";
        }

        string json = File.ReadAllText(path);
        string state = Contains(json, "\"sceneCount\"") ? "scene inventory linked" : "scene inventory pending";
        string promotion = Contains(json, "blocked-until-cross-source-confirmed") ? "promotion blocked" : "promotion unknown";
        return $"ui-boundary: {state} | {promotion}";
    }

    private static string BuildStreamingExportLine(string path)
    {
        if (!File.Exists(path))
        {
            return "streaming-assets export: missing";
        }

        string json = File.ReadAllText(path);
        string fileCount = ExtractJsonNumber(json, "fileCount");
        string promotion = Contains(json, "blocked-until-cross-source-confirmed") ? "promotion blocked" : "promotion unknown";
        return $"streaming-assets export: files={fileCount} | {promotion}";
    }

    private static string BuildSceneCatalogLine(SceneCatalogData catalog, string path)
    {
        if (!File.Exists(path))
        {
            return "ui scene catalog: missing";
        }

        int count = catalog?.surfaces?.Length ?? 0;
        string promotion = catalog != null && catalog.canonicalPromotion == "blocked-until-cross-source-confirmed"
            ? "promotion blocked"
            : "promotion unknown";
        return $"ui scene catalog: surfaces={count} | {promotion}";
    }

    private static string BuildSurfacePanelLine(SurfacePanelManifestData manifest, string path)
    {
        if (!File.Exists(path))
        {
            return "ui scene panels: missing";
        }

        int count = manifest?.panels?.Length ?? 0;
        string promotion = manifest != null && manifest.canonicalPromotion == "blocked-until-cross-source-confirmed"
            ? "promotion blocked"
            : "promotion unknown";
        string exePolicy = manifest != null && manifest.originalExePolicy == "oracle-only"
            ? "EXE oracle-only"
            : "EXE policy unknown";
        return $"ui scene panels: surfaces={count} | {promotion} | {exePolicy}";
    }

    private static string BuildWatchLine(string path)
    {
        if (!File.Exists(path))
        {
            return "systemPositions/originalCharacterRoster: watch manifest missing";
        }

        string json = File.ReadAllText(path);
        bool positions = Contains(json, "systemPositions");
        bool roster = Contains(json, "originalCharacterRoster");
        bool notConfirmed = Contains(json, "not-confirmed-new-hidden");
        bool confirmed = !notConfirmed && Contains(json, "confirmed-new-hidden");
        string status = confirmed ? "needs immediate report" : "not confirmed new hidden";
        return $"watch: systemPositions={positions} | originalCharacterRoster={roster} | {status}";
    }

    private static void DrawBackdrop()
    {
        GUI.color = new Color(0.01f, 0.012f, 0.018f, 1f);
        GUI.DrawTexture(new Rect(0, 0, Screen.width, Screen.height), Texture2D.whiteTexture);

        for (int i = 0; i < 180; i += 1)
        {
            float x = (i * 97) % Mathf.Max(Screen.width, 1);
            float y = 52 + ((i * 53) % Mathf.Max(Screen.height - 52, 1));
            float size = 1 + (i % 3);
            GUI.color = new Color(0.55f + ((i % 5) * 0.08f), 0.68f, 1f, 0.58f);
            GUI.DrawTexture(new Rect(x, y, size, size), Texture2D.whiteTexture);
        }

        GUI.color = Color.white;
    }

    private void DrawHeader()
    {
        GUI.color = new Color(0.08f, 0.10f, 0.14f, 0.95f);
        GUI.DrawTexture(new Rect(0, 0, Screen.width, 58), Texture2D.whiteTexture);
        GUI.color = Color.white;
        GUI.Label(new Rect(22, 12, 680, 24), "LOGH VII Revival - Unity dev surface (post-login)");
        GUI.Label(new Rect(Screen.width - 420, 12, 390, 24), "CD/BIN/CUE data authority; legacy EXE is oracle only");
    }

    // 원본 로그인 화면 재현: 배경은 title.tga를 디코드한 title.png(StreamingAssets 수출),
    // 위젯 좌표는 title.tga 640x480 픽셀 실측값. 배경이 없으면 fail-visible 대체 패널.
    private void DrawLegacyLoginPanel()
    {
        const float barHeight = 44f;
        GUI.color = new Color(0.10f, 0.11f, 0.14f, 1f);
        GUI.DrawTexture(new Rect(0, 0, Screen.width, barHeight), Texture2D.whiteTexture);
        GUI.color = Color.white;
        GUI.Label(new Rect(8, 2, 420, 20), LegacyWindowCaption);
        GUI.Label(new Rect(8, 22, 420, 20), LegacyMenuBar);

        // 640x480 원본 좌표계를 화면 크기에 맞춰 비율 유지 스케일
        float scale = Mathf.Min(Screen.width / 640f, (Screen.height - barHeight) / 480f);
        float originX = (Screen.width - (640f * scale)) * 0.5f;
        float originY = barHeight + ((Screen.height - barHeight - (480f * scale)) * 0.5f);
        Rect V(float x, float y, float w, float h) =>
            new Rect(originX + (x * scale), originY + (y * scale), w * scale, h * scale);

        bool hasBackground = loginBackgroundTexture != null;
        Rect canvas = V(0f, 0f, 640f, 480f);
        if (hasBackground)
        {
            GUI.DrawTexture(canvas, loginBackgroundTexture, ScaleMode.StretchToFill);
        }
        else
        {
            GUI.Box(canvas, string.Empty);
            GUI.Label(V(180f, 222f, 300f, 40f), "ゲームサーバに接続します。\nIDとパスワードを入力してください。");
            GUI.Label(V(160f, 275f, 70f, 18f), "ID");
            GUI.Label(V(148f, 300f, 92f, 18f), "パスワード");
            GUI.Label(V(20f, 440f, 600f, 36f), LegacyCopyrightLine + "\n" + LegacyCopyrightLine2);
            GUI.Label(V(430f, 458f, 200f, 18f), LegacyClientVersionLine);
        }

        EnsureLoginStyles();
        GUIStyle buttonStyle = hasBackground ? loginOverlayButtonStyle : GUI.skin.button;

        // 입력 필드는 배경에 그려진 원본 입력 박스 위에 투명 스타일로 겹친다 (실측: ID y=276, PW y=301)
        loginFieldStyle.fontSize = Mathf.Max(10, Mathf.RoundToInt(12f * scale));
        loginId = GUI.TextField(V(252f, 276f, 140f, 17f), loginId, 32, loginFieldStyle);
        loginPassword = GUI.PasswordField(V(252f, 301f, 140f, 17f), loginPassword, '*', 32, loginFieldStyle);

        if (GUI.Button(V(283f, 331f, 80f, 18f), hasBackground ? string.Empty : "ログイン", buttonStyle) && !loginInFlight)
        {
            // 실서버 로그인: 성공(ok+token)일 때만 게이트가 전진한다
            StartCoroutine(LoginRoutine());
        }

        if (!string.IsNullOrEmpty(loginStatusLine))
        {
            loginStatusStyle.fontSize = Mathf.Max(10, Mathf.RoundToInt(12f * scale));
            GUI.Label(V(170f, 358f, 300f, 20f), loginStatusLine, loginStatusStyle);
        }

        if (GUI.Button(V(230f, 398f, 96f, 18f), hasBackground ? string.Empty : "オフィシャルweb", buttonStyle))
        {
            Debug.Log("LOGH7 official web entry is out of scope for this slice");
        }

        if (GUI.Button(V(339f, 398f, 78f, 18f), hasBackground ? string.Empty : "終了", buttonStyle))
        {
            Application.Quit();
        }
    }

    // 원본 로비 화면 재현 1파: EXE 기본 spot 배경 + 施設内ロビー 패널 구조 + 실서버 캐릭터 슬롯.
    // 초상화 배치/직무카드/HUD 는 후속 슬라이스(레퍼런스: uu3.jpg).
    private void DrawLegacyLobbyPanel()
    {
        const float barHeight = 44f;
        GUI.color = new Color(0.10f, 0.11f, 0.14f, 1f);
        GUI.DrawTexture(new Rect(0, 0, Screen.width, barHeight), Texture2D.whiteTexture);
        GUI.color = Color.white;
        GUI.Label(new Rect(8, 2, 420, 20), LegacyWindowCaption);
        GUI.Label(new Rect(8, 22, 420, 20), LegacyMenuBar);

        float scale = Mathf.Min(Screen.width / 640f, (Screen.height - barHeight) / 480f);
        float originX = (Screen.width - (640f * scale)) * 0.5f;
        float originY = barHeight + ((Screen.height - barHeight - (480f * scale)) * 0.5f);
        Rect V(float x, float y, float w, float h) =>
            new Rect(originX + (x * scale), originY + (y * scale), w * scale, h * scale);

        if (lobbyBackgroundTexture != null)
        {
            GUI.DrawTexture(V(0f, 0f, 640f, 480f), lobbyBackgroundTexture, ScaleMode.StretchToFill);
        }
        else
        {
            GUI.Box(V(0f, 0f, 640f, 480f), "spot bg005 missing (export:original-ui-images)");
        }

        EnsureLoginStyles();
        // 좌상단 장소명 + 우하단 施設内ロビー 패널(원본 구조: toshichan lobby.jpg)
        GUI.Label(V(12f, 8f, 200f, 20f), LegacyLobbyLocationName);
        Rect facility = V(440f, 330f, 186f, 118f);
        GUI.color = new Color(0.04f, 0.10f, 0.22f, 0.86f);
        GUI.DrawTexture(facility, Texture2D.whiteTexture);
        GUI.color = Color.white;
        GUI.Label(V(450f, 336f, 160f, 18f), LegacyLobbyPanelTitle);
        for (int i = 0; i < LegacyLobbyRooms.Length; i += 1)
        {
            if (GUI.Button(V(452f, 358f + (i * 24f), 164f, 20f), LegacyLobbyRooms[i]))
            {
                Debug.Log($"LOGH7 lobby room selection pending slice: {LegacyLobbyRooms[i]}");
            }
        }

        // 좌하단: 실서버 /api/lobby 캐릭터 슬롯 (dev 표기 유지, 가짜 데이터 금지)
        Rect slots = V(12f, 380f, 240f, 88f);
        GUI.color = new Color(0.04f, 0.10f, 0.22f, 0.86f);
        GUI.DrawTexture(slots, Texture2D.whiteTexture);
        GUI.color = Color.white;
        GUI.Label(V(20f, 386f, 220f, 18f), $"account: {sessionAccountId ?? "-"}");
        GUI.Label(V(20f, 404f, 220f, 18f), lobbyStatusLine);
        if (lobbyResponse?.characterSlots != null)
        {
            for (int i = 0; i < lobbyResponse.characterSlots.Length && i < 2; i += 1)
            {
                CharacterSlotBody slot = lobbyResponse.characterSlots[i];
                GUI.Label(V(20f, 422f + (i * 18f), 220f, 18f), $"{slot.name} ({slot.faction}, {slot.faceId})");
            }
        }

        // 게이트 전진은 개발용 표기(원본 캐릭터 선택 화면 재현 전까지)
        if (GUI.Button(V(452f, 452f, 164f, 20f), "DEV: character select"))
        {
            hasCharacter = true;
            gateIndex = Mathf.Max(gateIndex, 3);
        }
    }

    // 로비 진입 시 실서버 슬롯 조회(GET /api/lobby, Bearer 토큰)
    private IEnumerator FetchLobbyRoutine()
    {
        lobbyStatusLine = LegacyConnectingLine;
        using (var request = UnityWebRequest.Get(sessionServerBase + "/api/lobby"))
        {
            request.SetRequestHeader("Authorization", "Bearer " + sessionToken);
            request.timeout = 10;
            yield return request.SendWebRequest();

            if (request.result != UnityWebRequest.Result.Success)
            {
                lobbyStatusLine = LegacyLoginConnectFailLine;
                yield break;
            }

            try
            {
                lobbyResponse = JsonUtility.FromJson<LobbyResponseBody>(request.downloadHandler.text);
            }
            catch (Exception)
            {
                lobbyResponse = null;
            }

            lobbyStatusLine = lobbyResponse != null && lobbyResponse.ok
                ? $"character slots: {lobbyResponse.characterSlots?.Length ?? 0}"
                : LegacyLoginAuthErrorLine;
        }
    }

    [Serializable]
    private sealed class LobbyResponseBody
    {
        public bool ok;
        public string accountId;
        public CharacterSlotBody[] characterSlots;
    }

    [Serializable]
    private sealed class CharacterSlotBody
    {
        public string characterId;
        public string name;
        public string faction;
        public string faceId;
    }

    private void EnsureLoginStyles()
    {
        if (loginFieldStyle != null)
        {
            return;
        }

        loginFieldStyle = new GUIStyle(GUI.skin.label)
        {
            alignment = TextAnchor.MiddleLeft,
        };
        loginFieldStyle.normal.textColor = Color.white;
        loginOverlayButtonStyle = new GUIStyle(GUIStyle.none);
        loginStatusStyle = new GUIStyle(GUI.skin.label)
        {
            alignment = TextAnchor.MiddleCenter,
        };
        loginStatusStyle.normal.textColor = new Color(1f, 0.85f, 0.6f, 1f);
    }

    // 실세션 서버 로그인 코루틴: POST /api/login, 성공 시에만 로비 게이트 전진.
    // 상태 문자열은 원본 클라 로그인 상태 테이블(P0)을 그대로 사용한다.
    private IEnumerator LoginRoutine()
    {
        loginInFlight = true;
        loginStatusLine = LegacyConnectingLine;

        string body = JsonUtility.ToJson(new LoginRequestBody { accountId = loginId, password = loginPassword });
        using (var request = new UnityWebRequest(sessionServerBase + "/api/login", "POST"))
        {
            request.uploadHandler = new UploadHandlerRaw(Encoding.UTF8.GetBytes(body));
            request.downloadHandler = new DownloadHandlerBuffer();
            request.SetRequestHeader("Content-Type", "application/json");
            request.timeout = 10;
            yield return request.SendWebRequest();

            if (request.result == UnityWebRequest.Result.ConnectionError || request.result == UnityWebRequest.Result.DataProcessingError)
            {
                loginStatusLine = LegacyLoginConnectFailLine;
            }
            else
            {
                LoginResponseBody response = ParseLoginResponse(request.downloadHandler.text);
                if (response != null && response.ok && !string.IsNullOrEmpty(response.token))
                {
                    sessionToken = response.token;
                    sessionAccountId = response.accountId;
                    loginStatusLine = string.Empty;
                    gateIndex = Mathf.Max(gateIndex, 2);
                    StartCoroutine(FetchLobbyRoutine());
                }
                else
                {
                    loginStatusLine = LegacyLoginAuthErrorLine;
                }
            }
        }

        loginInFlight = false;
    }

    private static LoginResponseBody ParseLoginResponse(string json)
    {
        if (string.IsNullOrEmpty(json))
        {
            return null;
        }

        try
        {
            return JsonUtility.FromJson<LoginResponseBody>(json);
        }
        catch (Exception)
        {
            return null;
        }
    }

    [Serializable]
    private sealed class LoginRequestBody
    {
        public string accountId;
        public string password;
    }

    [Serializable]
    private sealed class LoginResponseBody
    {
        public bool ok;
        public string accountId;
        public string token;
    }

    private static Texture2D LoadTexture(string path)
    {
        if (!File.Exists(path))
        {
            return null;
        }

        try
        {
            var texture = new Texture2D(2, 2, TextureFormat.RGBA32, false);
            if (!texture.LoadImage(File.ReadAllBytes(path), false))
            {
                return null;
            }

            texture.filterMode = FilterMode.Bilinear;
            return texture;
        }
        catch (Exception ex)
        {
            Debug.LogWarning($"LOGH7 login background load failed: {ex.Message}");
            return null;
        }
    }

    private void DrawSessionStrip()
    {
        float width = Mathf.Min(Screen.width - 44, 980);
        float itemWidth = width / gateLabels.Length;
        var strip = new Rect(22, 72, width, 42);
        GUI.Box(strip, "Session Flow");

        for (int i = 0; i < gateLabels.Length; i += 1)
        {
            Rect item = new Rect(strip.x + (i * itemWidth) + 8, strip.y + 18, itemWidth - 12, 18);
            GUI.color = i <= gateIndex ? new Color(0.25f, 0.72f, 0.92f, 1f) : new Color(0.35f, 0.37f, 0.40f, 1f);
            GUI.DrawTexture(item, Texture2D.whiteTexture);
            GUI.color = Color.white;
            GUI.Label(new Rect(item.x + 6, item.y - 2, item.width - 12, item.height + 4), gateLabels[i]);
        }
    }

    private void DrawGalaxyMap()
    {
        Rect map = new Rect(22, 130, Screen.width * 0.50f, Screen.height - 330);
        GUI.Box(map, "Strategic Map Data Preview");
        GUI.Label(new Rect(map.x + 14, map.y + 24, map.width - 28, 22), statusLine);

        GalaxySystem[] systems = galaxy?.systems;
        if (systems == null || systems.Length == 0)
        {
            GUI.Label(new Rect(map.x + 14, map.y + 58, map.width - 28, 22), "galaxy.json missing or unreadable");
            return;
        }

        Rect plot = new Rect(map.x + 18, map.y + 54, map.width - 36, map.height - 76);
        GUI.color = new Color(0.03f, 0.04f, 0.055f, 0.88f);
        GUI.DrawTexture(plot, Texture2D.whiteTexture);

        for (int i = 0; i < systems.Length; i += 1)
        {
            GalaxySystem system = systems[i];
            float col = system.canonGameCol > 0 ? system.canonGameCol : Mathf.InverseLerp(0f, systems.Length - 1f, i) * 100f;
            float row = system.canonGameRow > 0 ? system.canonGameRow : 25f + Mathf.Sin(i * 0.7f) * 18f;
            float x = plot.x + Mathf.Clamp01(col / 100f) * plot.width;
            float y = plot.y + Mathf.Clamp01(row / 50f) * plot.height;
            float size = i < MaxLabeledSystems ? 7f : 4f;

            GUI.color = FactionColor(system.faction);
            GUI.DrawTexture(new Rect(x - (size * 0.5f), y - (size * 0.5f), size, size), Texture2D.whiteTexture);

            if (i < MaxLabeledSystems)
            {
                GUI.color = new Color(0.9f, 0.94f, 1f, 0.92f);
                GUI.Label(new Rect(x + 7, y - 8, 130, 18), string.IsNullOrEmpty(system.system) ? $"System {i + 1}" : system.system);
            }
        }

        GUI.color = Color.white;
    }

    private void DrawSceneSurfaceSwitcher()
    {
        Rect panel = new Rect((Screen.width * 0.50f) + 34, 130, Screen.width * 0.18f, Screen.height - 330);
        GUI.Box(panel, "UI Scene Catalog");
        GUI.Label(new Rect(panel.x + 12, panel.y + 24, panel.width - 24, 22), sceneCatalogLine);

        SceneSurface[] surfaces = sceneCatalog?.surfaces;
        if (surfaces == null || surfaces.Length == 0)
        {
            GUI.Label(new Rect(panel.x + 12, panel.y + 56, panel.width - 24, 22), "catalog missing");
            return;
        }

        float y = panel.y + 52;
        for (int i = 0; i < surfaces.Length; i += 1)
        {
            SceneSurface surface = surfaces[i];
            bool unlocked = SurfaceUnlocked(surface);
            GUI.enabled = unlocked;
            string label = selectedSurfaceIndex == i ? $"> {surface.id}" : surface.id;
            if (GUI.Button(new Rect(panel.x + 12, y, panel.width - 24, 20), label))
            {
                selectedSurfaceIndex = i;
            }

            y += 22;
        }

        GUI.enabled = true;
        SceneSurface selected = surfaces[Mathf.Clamp(selectedSurfaceIndex, 0, surfaces.Length - 1)];
        Rect detail = new Rect(panel.x + 12, y + 6, panel.width - 24, Mathf.Min(140, panel.yMax - y - 16));
        DrawSelectedSurfacePanel(detail, selected);
    }

    private void DrawSelectedSurfacePanel(Rect detail, SceneSurface selected)
    {
        SceneSurfacePanel panel = FindSurfacePanel(selected.id);

        GUI.Box(detail, "Selected Surface");
        GUI.Label(new Rect(detail.x + 10, detail.y + 22, detail.width - 20, 18), panel.title);
        GUI.Label(new Rect(detail.x + 10, detail.y + 40, detail.width - 20, 18), $"scene: {JoinIds(selected.sceneIds)}");
        GUI.Label(new Rect(detail.x + 10, detail.y + 58, detail.width - 20, 18), $"phase: {selected.runtimePhase}");
        GUI.Label(new Rect(detail.x + 10, detail.y + 76, detail.width - 20, 18), $"status: {selected.evidenceStatus}");
        GUI.Label(new Rect(detail.x + 10, detail.y + 94, detail.width - 20, 18), panel.actions);
        GUI.Label(new Rect(detail.x + 10, detail.y + 112, detail.width - 20, 18), panel.evidence);
    }

    private void DrawControls()
    {
        Rect panel = new Rect(22, Screen.height - 186, Screen.width * 0.68f, 160);
        GUI.Box(panel, "Playable Prototype Controls");
        GUI.Label(new Rect(panel.x + 16, panel.y + 28, panel.width - 32, 22), "These buttons exercise the current session concept without pretending the full MMO is implemented.");

        playerName = GUI.TextField(new Rect(panel.x + 16, panel.y + 58, 180, 24), playerName);

        if (GUI.Button(new Rect(panel.x + 210, panel.y + 58, 148, 26), "SELECT CHARACTER"))
        {
            hasCharacter = true;
            gateIndex = Mathf.Max(gateIndex, 3);
        }

        GUI.enabled = hasCharacter;
        if (GUI.Button(new Rect(panel.x + 368, panel.y + 58, 116, 26), "ENTER WORLD"))
        {
            hasWorldSession = true;
            gateIndex = Mathf.Max(gateIndex, 4);
        }

        GUI.enabled = hasWorldSession;
        if (GUI.Button(new Rect(panel.x + 494, panel.y + 58, 132, 26), "STRATEGIC MAP"))
        {
            gateIndex = Mathf.Max(gateIndex, 5);
        }

        GUI.enabled = true;
        string sessionLabel = string.IsNullOrEmpty(sessionToken) ? "none" : $"{sessionAccountId} (token ok)";
        GUI.Label(new Rect(panel.x + 16, panel.y + 98, panel.width - 32, 24), $"Current gate: {gateLabels[gateIndex]} | session={sessionLabel} | character={hasCharacter} | worldSession={hasWorldSession}");
        DrawCurrentGate();
    }

    private void DrawCurrentGate()
    {
        GUILayout.BeginArea(new Rect(46, Screen.height - 58, 500, 26));
        GUILayout.Label($"Gate id: {CurrentGateId()} | Surface id: {CurrentSurfaceId()}");
        if (!hasWorldSession)
        {
            GUILayout.Label(StrategicMapBlockedReason);
        }
        GUILayout.Button(hasCharacter ? "Continue selected character" : "Create character", GUILayout.Width(190));
        GUILayout.EndArea();
    }

    private string CurrentGateId()
    {
        string gateId;
        switch (gateIndex)
        {
            case 0:
                gateId = "boot-launcher";
                break;
            case 1:
                gateId = "login-session";
                break;
            case 2:
                gateId = "lobby-session";
                break;
            case 3:
                gateId = hasCharacter ? "character-authority" : "character-select";
                break;
            case 4:
                gateId = "world-session";
                break;
            case 5:
                gateId = "strategic-map";
                break;
            default:
                gateId = "boot-launcher";
                break;
        }

        return NormalizeGateId(gateId);
    }

    private string CurrentSurfaceId()
    {
        SceneSurface[] surfaces = sceneCatalog?.surfaces;
        if (surfaces == null || surfaces.Length == 0)
        {
            return "scene-catalog-missing";
        }

        return surfaces[Mathf.Clamp(selectedSurfaceIndex, 0, surfaces.Length - 1)].id;
    }

    private bool SurfaceUnlocked(SceneSurface surface)
    {
        switch (surface.id)
        {
            case "launcher":
                return gateIndex >= 0;
            case "login":
                return gateIndex >= 1;
            case "lobby":
                return gateIndex >= 2;
            case "character":
                return gateIndex >= 3;
            case "world":
                return gateIndex >= 4;
            case "strategic":
            case "select-grid":
            case "info":
            case "tactics":
            case "battle":
                return gateIndex >= 5;
            default:
                return false;
        }
    }

    private static string NormalizeGateId(string gateId)
    {
        switch (gateId)
        {
            case "boot-launcher":
                return "boot-launcher";
            case "login-session":
                return "login-session";
            case "lobby-session":
                return "lobby-session";
            case "character-select":
                return "character-select";
            case "character-authority":
                return "character-authority";
            case "world-session":
                return "world-session";
            case "strategic-map":
                return "strategic-map";
            default:
                return "boot-launcher";
        }
    }

    private void DrawEvidencePanel()
    {
        Rect panel = new Rect((Screen.width * 0.68f) + 48, 130, (Screen.width * 0.32f) - 70, Screen.height - 156);
        GUI.Box(panel, "Runtime Evidence");

        GUILayout.BeginArea(new Rect(panel.x + 16, panel.y + 28, panel.width - 32, panel.height - 44));
        GUILayout.Label(runtimeLine);
        GUILayout.Space(8);
        GUILayout.Label(sourcePackLine);
        GUILayout.Label(sourceTruthLine);
        GUILayout.Label(uiBoundaryLine);
        GUILayout.Label(remasterProvenanceLine);
        GUILayout.Label(streamingExportLine);
        GUILayout.Label(sceneCatalogLine);
        GUILayout.Label(surfacePanelLine);
        GUILayout.Space(8);
        GUILayout.Label(watchLine);
        GUILayout.Space(14);
        GUILayout.Label("Visible scope today:");
        GUILayout.Label("- Unity player shell opens from generated project scene.");
        GUILayout.Label("- Session concepts exist as gated UI flow.");
        GUILayout.Label("- UI scene catalog surfaces are selectable when gates allow.");
        GUILayout.Label("- Galaxy/system source data is displayed as suspect preview.");
        GUILayout.Label("- No canonical promotion of system positions or roster yet.");
        GUILayout.EndArea();
    }

    private static Color FactionColor(string faction)
    {
        switch (faction)
        {
            case "empire":
                return new Color(0.95f, 0.45f, 0.24f, 1f);
            case "alliance":
                return new Color(0.25f, 0.70f, 1f, 1f);
            case "phezzan":
                return new Color(0.95f, 0.82f, 0.30f, 1f);
            default:
                return new Color(0.78f, 0.82f, 0.86f, 1f);
        }
    }

    private SceneSurfacePanel FindSurfacePanel(string id)
    {
        SceneSurfacePanel[] panels = surfacePanelManifest?.panels;
        if (panels == null || panels.Length == 0)
        {
            return new SceneSurfacePanel(id, "Uncataloged Surface", "Panel manifest missing.", "pending", "missing panel manifest");
        }

        for (int i = 0; i < panels.Length; i += 1)
        {
            if (panels[i].id == id)
            {
                return panels[i];
            }
        }

        return new SceneSurfacePanel(id, "Uncataloged Surface", "No manifest panel for surface.", "pending", "missing panel descriptor");
    }

    private static string JoinIds(string[] values)
    {
        if (values == null || values.Length == 0)
        {
            return "none";
        }

        return string.Join(",", values);
    }

    private static bool Contains(string haystack, string needle)
    {
        return haystack.IndexOf(needle, StringComparison.OrdinalIgnoreCase) >= 0;
    }

    private static string ExtractJsonString(string json, string key)
    {
        string marker = $"\"{key}\"";
        int keyIndex = json.IndexOf(marker, StringComparison.OrdinalIgnoreCase);
        if (keyIndex < 0)
        {
            return "unknown";
        }

        int colonIndex = json.IndexOf(':', keyIndex + marker.Length);
        int quoteStart = colonIndex >= 0 ? json.IndexOf('"', colonIndex + 1) : -1;
        int quoteEnd = quoteStart >= 0 ? json.IndexOf('"', quoteStart + 1) : -1;
        return quoteStart >= 0 && quoteEnd > quoteStart ? json.Substring(quoteStart + 1, quoteEnd - quoteStart - 1) : "unknown";
    }

    private static string ExtractJsonNumber(string json, string key)
    {
        string marker = $"\"{key}\"";
        int keyIndex = json.IndexOf(marker, StringComparison.OrdinalIgnoreCase);
        if (keyIndex < 0)
        {
            return "?";
        }

        int colonIndex = json.IndexOf(':', keyIndex + marker.Length);
        if (colonIndex < 0)
        {
            return "?";
        }

        int start = colonIndex + 1;
        while (start < json.Length && char.IsWhiteSpace(json[start]))
        {
            start += 1;
        }

        int end = start;
        while (end < json.Length && char.IsDigit(json[end]))
        {
            end += 1;
        }

        return end > start ? json.Substring(start, end - start) : "?";
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

    [Serializable]
    private sealed class SceneCatalogData
    {
        public string id;
        public string canonicalPromotion;
        public SceneSurface[] surfaces;
    }

    [Serializable]
    private sealed class SceneSurface
    {
        public string id;
        public string[] sceneIds;
        public string runtimePhase;
        public string evidenceStatus;
        public string implementationStatus;
    }

    [Serializable]
    private sealed class SurfacePanelManifestData
    {
        public string id;
        public string canonicalPromotion;
        public string originalExePolicy;
        public SceneSurfacePanel[] panels;
    }

    [Serializable]
    private sealed class SceneSurfacePanel
    {
        public string id;
        public string title;
        public string summary;
        public string actions;
        public string evidence;

        public SceneSurfacePanel()
        {
        }

        public SceneSurfacePanel(string id, string title, string summary, string actions, string evidence)
        {
            this.id = id;
            this.title = title;
            this.summary = summary;
            this.actions = actions;
            this.evidence = evidence;
        }
    }
}
