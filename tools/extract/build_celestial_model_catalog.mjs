// MDX 모델 로컬 변환과 검증된 전략맵 정합만 묶는 천체 시각 카탈로그.
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const REPO_ROOT = resolve(dirname(SCRIPT_PATH), '..', '..');
const args = process.argv.slice(2);
const getArg = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
};
const MODELS_PATH = getArg('--models', join(REPO_ROOT, 'server', 'content', 'generated', 'models.json'));
const ALIGNMENT_PATH = getArg('--alignment', join(REPO_ROOT, 'server', 'content', 'extracted', 'model-galaxy-alignment.json'));
const GALAXY_PATH = getArg('--galaxy', join(REPO_ROOT, 'server', 'content', 'galaxy.json'));
const OUT = getArg('--out', join(REPO_ROOT, 'server', 'content', 'generated', 'logh7-celestial-model-catalog.json'));

const models = JSON.parse(readFileSync(MODELS_PATH, 'utf8'));
const alignment = JSON.parse(readFileSync(ALIGNMENT_PATH, 'utf8'));
const galaxy = JSON.parse(readFileSync(GALAXY_PATH, 'utf8'));
const FAMILY_CODES = ['ds', 'fs', 'p', 'y'];

function staticTrs(file) {
  const transform = file.nodes[0]?.model_local_transform;
  if (transform?.staticTrsStatus !== 'static') return null;
  return {
    coordinateSpace: 'model_local',
    translation: transform.translation,
    rotation: transform.rotation,
    scale: transform.scale,
  };
}

function buildFamilies() {
  const grouped = new Map(FAMILY_CODES.map((code) => [code, new Map()]));
  for (const file of models.files.filter((item) => item.path.startsWith('planets/') && item.path.endsWith('.mdx'))) {
    const filename = file.path.slice(file.path.lastIndexOf('/') + 1, -4);
    const baseModel = filename.replace(/_(?:low|mid)$/i, '');
    const match = baseModel.match(/^(ds|fs|p|y)\d+$/i);
    if (match === null) continue;
    const code = match[1].toLowerCase();
    const family = grouped.get(code);
    if (!family.has(baseModel)) family.set(baseModel, []);
    family.get(baseModel).push({
      variant: filename === baseModel ? 'base' : filename.slice(baseModel.length + 1),
      path: file.path,
      sha256: file.sha256,
      nodeCount: file.node_count,
      modelLocalStaticTrs: staticTrs(file),
    });
  }

  return FAMILY_CODES.map((code) => {
    const baseModels = [...grouped.get(code).entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([id, variants]) => ({
        id,
        gameplayJoin: null,
        variants: variants.sort((left, right) => left.path.localeCompare(right.path)),
      }));
    return {
      code,
      baseModelCount: baseModels.length,
      coordinateSpace: 'model_local',
      gameplayJoin: null,
      baseModels,
    };
  });
}

function classifyGalaxyNode(node) {
  if (node.class === 'galaxy_star') return 'star';
  if (node.class === 'galaxy_blackhole') return 'blackhole';
  if (node.class === 'galaxy_neutron_star') return 'neutronStar';
  throw new Error(`null_galaxy 미지원 노드 종류: ${node.name}/${node.class}`);
}

function buildNullGalaxy() {
  const file = models.files.find((item) => item.path === 'strategy/null_galaxy.mdx');
  if (file === undefined) throw new Error('strategy/null_galaxy.mdx가 models.json에 없다');
  const pairs = new Map(alignment.pairs.map((pair) => [pair.mdx_index, pair]));
  const gridWidth = galaxy._canon_grid?.width;
  if (!Number.isInteger(gridWidth)) throw new Error('galaxy.json 정본 그리드 폭이 없다');

  const nodes = file.nodes.map((node) => {
    const transform = node.model_local_transform;
    if (transform?.staticTrsStatus !== 'static') {
      throw new Error(`null_galaxy 정적 TRS 결손: ${node.name}`);
    }
    const kind = classifyGalaxyNode(node);
    const mdxIndex = node.index + 1;
    const pair = pairs.get(mdxIndex) ?? null;
    if ((kind === 'star') !== (pair !== null)) {
      throw new Error(`null_galaxy 정합 수 불일치: ${node.name}`);
    }
    const systemRecord = pair === null ? null : galaxy.systems[pair.galaxy_system_arrayidx];
    if (pair !== null && systemRecord?.system !== pair.galaxy_system) {
      throw new Error(`정합 성계명 불일치: ${node.name}/${pair.galaxy_system}`);
    }
    const cell = systemRecord === null
      ? null
      : systemRecord.canonRow * gridWidth + systemRecord.canonCol;
    const nameParts = node.name?.split('_') ?? [];
    return {
      sourceNodeIndex: node.index,
      mdxIndex,
      name: node.name,
      kind,
      spectralClass: kind === 'star' ? nameParts[2] ?? null : null,
      parentIndex: node.parentIndex,
      modelLocalTranslation: transform.translation,
      modelLocalRotation: transform.rotation,
      modelLocalScale: transform.scale,
      flatModelCoordinates: [transform.translation[0], transform.translation[2]],
      system: systemRecord?.system ?? null,
      cell,
      strategicJoin: pair === null ? null : {
        authority: 'null_galaxy_alignment',
        systemArrayIndex: pair.galaxy_system_arrayidx,
        canonCol: systemRecord.canonCol,
        canonRow: systemRecord.canonRow,
        residualNorm: pair.residual_norm,
      },
    };
  });
  const count = (kind) => nodes.filter((node) => node.kind === kind).length;
  const maxResidualNorm = Math.max(...alignment.pairs.map((pair) => pair.residual_norm));
  return {
    modelPath: file.path,
    sourceSha256: file.sha256,
    coordinateSpace: 'model_local',
    counts: {
      total: nodes.length,
      star: count('star'),
      blackhole: count('blackhole'),
      neutronStar: count('neutronStar'),
      alignmentPairs: alignment.pairs.length,
    },
    flattening: {
      sourceChannels: ['Tx', 'Tz'],
      note: 'MDX 모델 로컬 X/Z 평면 투영이며 전술 월드 좌표가 아니다.',
    },
    alignment: {
      authority: 'server/content/extracted/model-galaxy-alignment.json',
      maxResidualNorm,
      acceptanceThreshold: 0.05,
    },
    nodes,
  };
}

const catalog = {
  id: 'logh7-celestial-model-catalog',
  generatedAt: models.generatedAt,
  generator: {
    path: 'tools/extract/build_celestial_model_catalog.mjs',
    sha256: createHash('sha256')
      .update(readFileSync(SCRIPT_PATH, 'utf8').replace(/\r\n/g, '\n'))
      .digest('hex'),
  },
  scope: 'MDX 모델 로컬 시각 자산. 전략 성계 연결은 기존 79개 정합만 허용하며 전술/월드 배치를 뜻하지 않는다.',
  sources: {
    models: 'server/content/generated/models.json',
    alignment: 'server/content/extracted/model-galaxy-alignment.json',
    galaxy: 'server/content/galaxy.json',
  },
  families: buildFamilies(),
  nullGalaxy: buildNullGalaxy(),
};

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, `${JSON.stringify(catalog, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  out: OUT,
  familyCounts: Object.fromEntries(catalog.families.map((family) => [family.code, family.baseModelCount])),
  nullGalaxy: catalog.nullGalaxy.counts,
  maxResidualNorm: catalog.nullGalaxy.alignment.maxResidualNorm,
}, null, 2));
