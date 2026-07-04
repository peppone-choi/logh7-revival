#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const args = parseArgs(process.argv.slice(2));
const inventory = JSON.parse(readFileSync(args.inventory, 'utf8'));
for (const scene of inventory.scenes) {
  const path = join(args.unityRoot, scene.unityScenePath);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, buildUnitySceneYaml(scene));
  writeFileSync(`${path}.txt`, buildSceneNote(scene));
}

const registryPath = join(
  args.unityRoot,
  'Assets',
  'StreamingAssets',
  'logh7',
  'logh7-scene-inventory.json',
);
mkdirSync(dirname(registryPath), { recursive: true });
writeFileSync(registryPath, `${JSON.stringify(inventory, null, 2)}\n`);
console.log(JSON.stringify({
  status: 'exported',
  sceneCount: inventory.scenes.length,
  registryPath,
}, null, 2));

function buildUnitySceneYaml(scene) {
  return `%YAML 1.1
%TAG !u! tag:unity3d.com,2011:
--- !u!29 &1
OcclusionCullingSettings:
  m_ObjectHideFlags: 0
--- !u!104 &2
RenderSettings:
  m_ObjectHideFlags: 0
  m_Fog: 0
  m_AmbientSkyColor: {r: 0.02, g: 0.025, b: 0.035, a: 1}
--- !u!157 &3
LightmapSettings:
  m_ObjectHideFlags: 0
--- !u!196 &4
NavMeshSettings:
  m_ObjectHideFlags: 0
--- !u!1 &1000
GameObject:
  m_ObjectHideFlags: 0
  m_Name: ${scene.id} - ${scene.titleKo}
  m_TagString: Untagged
  m_IsActive: 1
--- !u!4 &1001
Transform:
  m_ObjectHideFlags: 0
  m_GameObject: {fileID: 1000}
  m_LocalPosition: {x: 0, y: 0, z: 0}
  m_LocalRotation: {x: 0, y: 0, z: 0, w: 1}
  m_LocalScale: {x: 1, y: 1, z: 1}
`;
}

function buildSceneNote(scene) {
  return [
    `LOGH VII scene placeholder: ${scene.titleKo}`,
    `id: ${scene.id}`,
    `status: ${scene.implementationStatus}`,
    `evidence: ${scene.evidenceStatus}`,
    '',
    'Evidence hits:',
    ...scene.evidence.map((hit) => `- ${hit.role} ${hit.source} term=${hit.term}`),
    '',
  ].join('\n');
}

function parseArgs(argv) {
  const args = {
    inventory: 'server/content/generated/logh7-scene-inventory.json',
    unityRoot: 'client-unity',
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--inventory') {
      args.inventory = argv[index + 1];
      index += 1;
    } else if (arg === '--unity-root') {
      args.unityRoot = resolve(argv[index + 1]);
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}
