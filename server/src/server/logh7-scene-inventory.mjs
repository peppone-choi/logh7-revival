import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { LOGH7_ENTRY_SCENE_DEFINITIONS } from './logh7-unity-session-flow.mjs';

const SERVER_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const REPO_ROOT = join(SERVER_ROOT, '..');
const DEFAULT_OUT = join(SERVER_ROOT, 'content', 'generated', 'logh7-scene-inventory.json');

const SCENE_DEFINITIONS = [
  ...LOGH7_ENTRY_SCENE_DEFINITIONS,
  {
    id: 'fleet-operations',
    titleKo: '함대/작전/이동',
    unityScenePath: 'Assets/Scenes/Logh7_07_FleetOperations.unity',
    terms: ['Fleet', 'Operation', '艦隊', '作戦', '移動'],
  },
  {
    id: 'tactical-battle',
    titleKo: '전술 전투',
    unityScenePath: 'Assets/Scenes/Logh7_08_TacticalBattle.unity',
    terms: ['Battle', 'Tactical', '会戦', '戦闘', '攻撃'],
  },
  {
    id: 'planet-system-detail',
    titleKo: '항성/행성/성계 상세',
    unityScenePath: 'Assets/Scenes/Logh7_09_SystemPlanetDetail.unity',
    terms: ['Planet', 'Star', '惑星', '恒星', '星系'],
  },
  {
    id: 'organization-personnel',
    titleKo: '조직/인사/인물',
    unityScenePath: 'Assets/Scenes/Logh7_10_OrganizationPersonnel.unity',
    terms: ['Personnel', 'Officer', 'Rank', '人事', '階級', '任命'],
  },
  {
    id: 'economy-logistics',
    titleKo: '경제/보급/건설',
    unityScenePath: 'Assets/Scenes/Logh7_11_EconomyLogistics.unity',
    terms: ['Economy', 'Logistics', 'Supply', '補給', '建造', '開発'],
  },
  {
    id: 'diplomacy-intel',
    titleKo: '외교/정보',
    unityScenePath: 'Assets/Scenes/Logh7_12_DiplomacyIntel.unity',
    terms: ['Diplomacy', 'Intel', '外交', '情報', '諜報', 'フェザーン'],
  },
  {
    id: 'reports-mail-system',
    titleKo: '보고/메일/시스템 메시지',
    unityScenePath: 'Assets/Scenes/Logh7_13_ReportsMailSystem.unity',
    terms: ['Report', 'Mail', 'Message', '報告', 'メール', '通達'],
  },
  {
    id: 'settings-save-load',
    titleKo: '설정/저장/불러오기',
    unityScenePath: 'Assets/Scenes/Logh7_14_SettingsSaveLoad.unity',
    terms: ['Config', 'Save', 'Load', 'Option', '設定', '保存'],
  },
];

export const LOGH7_SCENE_INVENTORY_DEFAULTS = {
  outPath: DEFAULT_OUT,
};

export function buildSceneInventory({ workspaceRoot = REPO_ROOT } = {}) {
  const evidenceCorpus = collectEvidenceCorpus(workspaceRoot);
  const scenes = SCENE_DEFINITIONS.map((definition, index) => {
    const evidence = collectSceneEvidence(definition, evidenceCorpus);
    return {
      order: index,
      id: definition.id,
        titleKo: definition.titleKo,
        unityScenePath: definition.unityScenePath,
        sessionConcept: definition.sessionConcept ?? 'world-feature-session',
        stateModel: definition.stateModel ?? 'Logh7WorldSession',
        requires: definition.requires ?? ['world-session'],
        implementationStatus: 'placeholder-required',
      evidenceStatus: evidence.length > 0 ? 'source-hits-present' : 'planned-from-game-domain',
      evidence,
    };
  });

  return {
    id: 'logh7-scene-inventory',
    status: 'inventoried',
    policy:
      'Scene list is an implementation inventory. Each scene remains placeholder until EXE/live/manual evidence closes its UI and logic contract.',
    sourcePolicy: {
      originalExePolicy: 'oracle-only-not-product-runtime',
      unityMainRuntime: true,
    },
    summary: {
      sceneCount: scenes.length,
      evidenceBackedSceneCount: scenes.filter((scene) => scene.evidence.length > 0).length,
    },
    scenes,
  };
}

export function writeSceneInventory(path = DEFAULT_OUT, inventory) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(inventory, null, 2)}\n`);
}

function collectEvidenceCorpus(workspaceRoot) {
  const corpus = [];
  addTextFile(corpus, workspaceRoot, '.omo/ghidra/export/G7MTClient/strings.tsv', 'ghidra-strings');
  addTextFile(corpus, workspaceRoot, '.omo/ghidra/export/G7MTClient/symbols.tsv', 'ghidra-symbols');
  addTextFile(corpus, workspaceRoot, '.omo/ghidra/export/G7MTClient/functions.jsonl', 'ghidra-functions');
  const msgDatRoot = join(
    workspaceRoot,
    '.omo',
    'work',
    'logh7-cd-extract',
    'installshield-root',
  );
  for (const path of findFiles(msgDatRoot, (file) => /data[\\/]MsgDat[\\/].+\.dat$/i.test(file))) {
    addBinaryTextFile(corpus, workspaceRoot, path, 'msgdat-text');
  }
  return corpus;
}

function collectSceneEvidence(definition, corpus) {
  const evidence = [];
  for (const item of corpus) {
    for (const term of definition.terms) {
      const index = item.text.indexOf(term);
      if (index < 0) continue;
      evidence.push({
        source: item.source,
        role: item.role,
        term,
        context: item.text.slice(Math.max(0, index - 60), index + term.length + 80)
          .replace(/\s+/g, ' ')
          .trim(),
      });
      break;
    }
    if (evidence.length >= 8) break;
  }
  return evidence;
}

function addTextFile(corpus, workspaceRoot, relativePath, role) {
  const path = join(workspaceRoot, relativePath);
  if (!existsSync(path)) return;
  corpus.push({
    source: normalizePath(relative(workspaceRoot, path)),
    role,
    text: readFileSync(path, 'utf8'),
  });
}

function addBinaryTextFile(corpus, workspaceRoot, path, role) {
  const bytes = readFileSync(path);
  corpus.push({
    source: normalizePath(relative(workspaceRoot, path)),
    role,
    text: [
      bytes.toString('utf8'),
      bytes.toString('latin1'),
      new TextDecoder('shift_jis').decode(bytes),
    ].join('\n').replaceAll('\u0000', '\n'),
  });
}

function findFiles(root, predicate) {
  if (!existsSync(root)) return [];
  const found = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      found.push(...findFiles(path, predicate));
    } else if (entry.isFile() && predicate(path)) {
      found.push(path);
    }
  }
  return found;
}

function normalizePath(path) {
  return path.replaceAll('\\', '/');
}
