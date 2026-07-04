#if UNITY_EDITOR
using System;
using System.IO;
using UnityEditor;
using UnityEngine;

public static class Logh7ValidationSceneCapture
{
    private const string EvidencePath = "../.omo/ulw-loop/evidence/codex-unity-validation-scene-screenshot-20260704.png";
    private const string LegacyEvidencePath = "../.omo/ulw-loop/evidence/g015-unity-validation-scene-screenshot-20260704.png";

    [MenuItem("LOGH VII/Capture Validation Scene Evidence")]
    public static void CaptureEvidence()
    {
        Logh7PrototypeSceneGenerator.RebuildSceneForBatch();

        Camera camera = Camera.main ?? UnityEngine.Object.FindFirstObjectByType<Camera>();
        if (camera == null)
        {
            throw new InvalidOperationException("No camera found for LOGH VII validation scene capture.");
        }

        string outputPath = Path.GetFullPath(Path.Combine(Application.dataPath, "..", EvidencePath));
        string outputDirectory = Path.GetDirectoryName(outputPath);
        if (!string.IsNullOrEmpty(outputDirectory))
        {
            Directory.CreateDirectory(outputDirectory);
        }

        RenderTexture previousTarget = camera.targetTexture;
        RenderTexture previousActive = RenderTexture.active;
        var target = new RenderTexture(1920, 1080, 24, RenderTextureFormat.ARGB32);
        var screenshot = new Texture2D(1920, 1080, TextureFormat.RGBA32, false);

        try
        {
            camera.targetTexture = target;
            RenderTexture.active = target;
            camera.Render();
            screenshot.ReadPixels(new Rect(0, 0, 1920, 1080), 0, 0);
            screenshot.Apply();
            File.WriteAllBytes(outputPath, screenshot.EncodeToPNG());
            Debug.Log($"LOGH7_VALIDATION_SCREENSHOT:{outputPath}");
        }
        finally
        {
            camera.targetTexture = previousTarget;
            RenderTexture.active = previousActive;
            UnityEngine.Object.DestroyImmediate(screenshot);
            UnityEngine.Object.DestroyImmediate(target);
        }
    }
}
#endif
