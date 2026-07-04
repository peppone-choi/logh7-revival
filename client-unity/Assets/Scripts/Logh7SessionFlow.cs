using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using UnityEngine;

// 세션 플로 게이트 머신 (G049).
// logh7-unity-runtime-manifest.json 의 sessionFlow(requires/grants)를 그대로 강제한다.
// 서버 권위 원칙: 이 머신은 클라 측 장면 전환 가드일 뿐, 실제 승인은 서버 응답이 부여한다.
// 데이터 타입은 Logh7SessionRuntimeModels.cs 의 Logh7UnityRuntimeManifest 계열을 재사용한다.
public class Logh7SessionFlow
{
    private readonly List<Logh7SessionFlowStep> steps;
    private readonly HashSet<string> granted = new HashSet<string>();

    public string NormalEntryScene { get; }

    public Logh7SessionFlow(Logh7UnityRuntimeManifest manifest)
    {
        if (manifest?.sessionFlow == null || manifest.sessionFlow.Length == 0)
        {
            throw new InvalidOperationException("runtime manifest has no sessionFlow");
        }
        steps = manifest.sessionFlow.ToList();
        NormalEntryScene = manifest.runtime?.normalEntryScene;
    }

    public static Logh7SessionFlow LoadFromStreamingAssets()
    {
        string path = Path.Combine(Application.streamingAssetsPath, "logh7", "logh7-unity-runtime-manifest.json");
        return new Logh7SessionFlow(JsonUtility.FromJson<Logh7UnityRuntimeManifest>(File.ReadAllText(path)));
    }

    public IReadOnlyCollection<string> Granted => granted;

    public bool CanAdvance(string flowId)
    {
        Logh7SessionFlowStep step = steps.FirstOrDefault(s => s.id == flowId);
        return step != null && (step.requires ?? Array.Empty<string>()).All(granted.Contains);
    }

    // 서버가 해당 단계를 승인했을 때 호출; 선행 grant가 없으면 거부한다.
    public bool TryAdvance(string flowId)
    {
        if (!CanAdvance(flowId))
        {
            return false;
        }
        Logh7SessionFlowStep step = steps.First(s => s.id == flowId);
        foreach (string grant in step.grants ?? Array.Empty<string>())
        {
            granted.Add(grant);
        }
        return true;
    }

    // 장면 진입 가드: 그 장면을 부여하는 단계 중 하나라도 이미 grant됐거나 지금 진입 가능해야 한다.
    public bool CanEnterScene(string sceneId)
    {
        if (sceneId == NormalEntryScene)
        {
            return true;
        }
        return steps.Where(s => s.sceneId == sceneId)
            .Any(s => (s.grants ?? Array.Empty<string>()).All(granted.Contains) || CanAdvance(s.id));
    }
}
