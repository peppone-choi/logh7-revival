import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const SERVER_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const REPO_ROOT = join(SERVER_ROOT, '..');
const DEFAULT_OUT = join(
  SERVER_ROOT,
  'content',
  'generated',
  'logh7-unity-bootstrap-manifest.json',
);

const GENERATED_INPUTS = [
  ['logh7-cd-media', 'server/content/generated/logh7-cd-media-manifest.json', 'source-authority-evidence'],
 ['logh7-hidden-data-classification', 'server/content/generated/logh7-hidden-data-classification.json', 'hidden-data-evidence'],
 ['logh7-hidden-data-watchlist', 'server/content/generated/logh7-hidden-data-watchlist.json', 'mandatory-watch-report'],
 ['logh7-runtime-boundary', 'server/content/generated/logh7-runtime-boundary-manifest.json', 'runtime-boundary-policy'],
 ['logh7-record-candidate-scan', 'server/content/generated/logh7-record-candidate-scan.json', 'record-surface-candidates'],
  ['logh7-record-candidate-crosscheck', 'server/content/generated/logh7-record-candidate-crosscheck.json', 'record-surface-crosscheck'],
  ['logh7-mdx-catalog', 'server/content/generated/logh7-mdx-catalog.json', 'asset-catalog'],
  ['logh7-face-tcf-catalog', 'server/content/generated/logh7-face-tcf-catalog.json', 'asset-catalog'],
  ['logh7-face-portrait-catalog', 'server/content/generated/logh7-face-portrait-catalog.json', 'asset-catalog'],
  ['logh7-null-galaxy-template', 'server/content/generated/logh7-null-galaxy-template.json', 'suspect-galaxy-template'],
  ['logh7-ship-stat-catalog', 'server/content/generated/logh7-ship-stat-catalog.json', 'game-data-catalog'],
  ['logh7-strategy-command-catalog', 'server/content/generated/logh7-strategy-command-catalog.json', 'game-data-catalog'],
  ['logh7-operation-catalog', 'server/content/generated/logh7-operation-catalog.json', 'game-data-catalog'],
  ['logh7-rank-promotion-catalog', 'server/content/generated/logh7-rank-promotion-catalog.json', 'game-data-catalog'],
  ['logh7-logistics-allocation-catalog', 'server/content/generated/logh7-logistics-allocation-catalog.json', 'game-data-catalog'],
];

export const LOGH7_UNITY_BOOTSTRAP_MANIFEST_DEFAULTS = {
  outPath: DEFAULT_OUT,
};

export function buildUnityBootstrapManifest({
  workspaceRoot = REPO_ROOT,
  generatedInputs = GENERATED_INPUTS,
} = {}) {
  const serverOut = join(workspaceRoot, 'server', 'content', 'generated', 'logh7-unity-bootstrap-manifest.json');
  const unityOut = join(
    workspaceRoot,
    'client-unity',
    'Assets',
    'StreamingAssets',
    'logh7',
    'logh7-unity-bootstrap-manifest.json',
  );

  return {
    id: 'logh7-unity-bootstrap-manifest',
    status: 'bootstrap-contract',
    generatedAt: new Date().toISOString(),
    unity: {
      version: '6000.5.2f1',
      projectRoot: 'client-unity',
      streamingAssetsTarget: normalizePath(relative(workspaceRoot, unityOut)),
      firstRuntimeConsumer: 'Assets/StreamingAssets/logh7/logh7-unity-bootstrap-manifest.json',
    },
    authority: {
      source: 'verified-archive-bin-cue',
      cdMediaManifest: 'server/content/generated/logh7-cd-media-manifest.json',
      rule: 'Only CD/manual/Ghidra/live/wire cross-checked facts can become canonical.',
    },
    runtime: {
      mainClient: 'Unity',
      originalExePolicy: 'oracle-only-not-product-runtime',
      originalExeUses: [
        'scene-ui-logic-reference',
        'packet-wire-reference',
        'resource-layout-reference',
        'live-manual-qa-oracle',
      ],
      forbiddenNormalRuntime: [
        'direct-G7MTClient-player-workflow',
        'diagnostic-preseed-flags',
        'binary-patch-product-runtime',
      ],
    },
    canonicalPromotion: {
      defaultState: 'suspect-until-cross-checked',
      suspectInputs: [
        'server/content',
        'RE/content',
        'installed-client-data',
        'generated-catalogs',
        'manual-raster-derived-galaxy-positions',
        'previous-star-planet-analysis',
      ],
      requiredEvidenceClasses: [
        'CD filesystem or raw/slack source',
        'InstallShield payload source',
        'manual/OCR or original text source',
        'Ghidra/decompile or live/wire consumer proof where runtime behavior matters',
      ],
    },
    remasterPacks: {
      policy: 'optional-reversible-manifest-driven',
      originalFallbackRequired: true,
      conflictCheckRequired: true,
      provenanceLabelRequired: true,
    },
    generatedInputs: generatedInputs.map(([id, path, role]) => inspectGeneratedInput({
      id,
      path,
      role,
      workspaceRoot,
    })),
    outputs: {
      serverManifest: normalizePath(relative(workspaceRoot, serverOut)),
      unityStreamingAssetsManifest: normalizePath(relative(workspaceRoot, unityOut)),
    },
  };
}

export function writeUnityBootstrapManifest({
  outPath = DEFAULT_OUT,
  manifest,
}) {
  mkdirSync(dirname(outPath), { recursive: true });
  const bytes = `${JSON.stringify(manifest, null, 2)}\n`;
  writeFileSync(outPath, bytes);
}

function inspectGeneratedInput({ id, path, role, workspaceRoot }) {
  const absPath = join(workspaceRoot, path);
  if (!existsSync(absPath)) {
    return {
      id,
      role,
      path,
      status: 'missing',
      canonicalState: 'suspect-input',
    };
  }
  const bytes = readFileSync(absPath);
  let manifestId = null;
  let manifestStatus = null;
  try {
    const parsed = JSON.parse(bytes.toString('utf8'));
    manifestId = parsed.id ?? null;
    manifestStatus = parsed.status ?? parsed.media?.status ?? null;
  } catch {
    manifestStatus = 'unparseable-json';
  }
  return {
    id,
    role,
    path,
    status: 'present',
    canonicalState: id === 'logh7-cd-media' ? 'authority-evidence' : 'suspect-input',
    bytes: statSync(absPath).size,
    sha1: createHash('sha1').update(bytes).digest('hex'),
    manifestId,
    manifestStatus,
  };
}

function normalizePath(path) {
  return path.replaceAll('\\', '/');
}
