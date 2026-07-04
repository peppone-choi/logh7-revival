import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SERVER_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DEFAULT_MDX_CATALOG_PATH = join(SERVER_ROOT, 'content', 'generated', 'logh7-mdx-catalog.json');
const NULL_GALAXY_PATH = 'strategy/Null_galaxy.mdx';
const STAR_NODE_RE = /^star_(\d{2})_([A-Z])$/;

export function loadMdxCatalog(path = DEFAULT_MDX_CATALOG_PATH) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function buildNullGalaxyTemplate({ catalog = loadMdxCatalog() } = {}) {
  const source = catalog.files?.find((file) => file.path === NULL_GALAXY_PATH);
  if (!source) {
    throw new Error(`${NULL_GALAXY_PATH} missing from MDX catalog`);
  }

  const stars = source.nodeNames
    .map((node) => parseStarNode(node))
    .filter((star) => star !== null);
  const nonStarTemplateNodes = source.nodeNames
    .filter((node) => parseStarNode(node) === null)
    .map(({ index, offset, name }) => ({ index, offset, name }));

  return {
    id: 'logh7-null-galaxy-template',
    source: {
      mdxCatalogId: catalog.id,
      mdxPath: source.path,
      mdxSha1: source.sha1,
      evidenceGrade: 'P0-extracted-asset',
      positionStatus: 'not-in-mdx',
      note: 'Null_galaxy.mdx provides star template node names and spectral classes only. Canonical star positions remain manual/PDF-derived evidence.',
    },
    headerNodeCount: source.header?.[0]?.count ?? null,
    starCount: stars.length,
    spectralClasses: summarizeSpectralClasses(stars),
    stars,
    nonStarTemplateNodes,
  };
}

export function writeNullGalaxyTemplate(path, template) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(template, null, 2)}\n`, 'utf8');
}

function parseStarNode(node) {
  const match = STAR_NODE_RE.exec(node.name);
  if (!match) {
    return null;
  }
  return {
    ordinal: Number.parseInt(match[1], 10),
    spectralClass: match[2],
    nodeName: node.name,
    mdxNodeIndex: node.index,
    mdxOffset: node.offset,
  };
}

function summarizeSpectralClasses(stars) {
  const counts = new Map();
  for (const star of stars) {
    counts.set(star.spectralClass, (counts.get(star.spectralClass) ?? 0) + 1);
  }
  return Object.fromEntries([...counts.entries()].sort(([left], [right]) => left.localeCompare(right)));
}
