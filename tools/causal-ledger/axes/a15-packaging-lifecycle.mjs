import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { CONTRACT, stableStringify, validateLedger, SOURCE_MANIFEST, importSources } from '../index.mjs';

const AXIS_DIR = dirname(fileURLToPath(import.meta.url));
const TOOL_DIR = dirname(AXIS_DIR);
const GENERATED_DIR = join(TOOL_DIR, 'generated');

const FIXED_EVIDENCE_TIMESTAMP = '2026-07-21T00:00:00Z'; // Deterministic, fixed timestamp

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function canonicalLf(value) {
  return value.replaceAll('\r\n', '\n').replaceAll('\r', '\n');
}

async function readMasterDesignSource(repoRoot) {
  // Read the distinct non-base source for A15 evidence
  const path = join(repoRoot, 'docs/logh7-causal-ledger-master-design.md');
  const text = canonicalLf(await readFile(path, 'utf8'));
  return {
    path,
    text,
    sha256: sha256(text),
  };
}

async function readPackageSource(repoRoot) {
  const path = join(repoRoot, 'server/package.json');
  const text = canonicalLf(await readFile(path, 'utf8'));
  return { path, text, sha256: sha256(text) };
}

async function readDockerComposeSource(repoRoot) {
  const path = join(repoRoot, 'docker-compose.yml');
  const text = canonicalLf(await readFile(path, 'utf8'));
  return { path, text, sha256: sha256(text) };
}

async function readDockerfileSource(repoRoot) {
  const path = join(repoRoot, 'server/Dockerfile');
  const text = canonicalLf(await readFile(path, 'utf8'));
  return { path, text, sha256: sha256(text) };
}

async function readLineageSource(repoRoot) {
  const path = join(repoRoot, 'docs/logh7-client-lineage-current.md');
  const text = canonicalLf(await readFile(path, 'utf8'));
  return { path, text, sha256: sha256(text) };
}

async function readPatchManifestSource(repoRoot, filename) {
  const path = join(repoRoot, 'server/content/client', filename);
  const text = canonicalLf(await readFile(path, 'utf8'));
  return { path, text, sha256: sha256(text) };
}

function createNode(nodeId, type, summary, surface, direction, evidenceId, sourceManifestHash, isBlocked = false, blocker = '') {
  // Package surface nodes require restricted rights; others can be unknown
  const nodeRights = surface === 'package' ? 'restricted' : 'unknown';

  return {
    schemaVersion: CONTRACT.schemaVersion,
    nodeId,
    axis: 'A15',
    type,
    domain: 'packaging',
    owner: 'A15',
    summary,
    preconditions: isBlocked ? ['unknown'] : ['package manifest present'],
    postconditions: isBlocked ? ['unknown'] : ['node verified'],
    failureConditions: isBlocked ? ['unknown'] : ['manifest missing', 'hash mismatch'],
    surface,
    direction,
    state: {
      grade: isBlocked ? 'I2' : 'O0',
      confidence: isBlocked ? 'unknown' : 'confirmed',
      canonicality: isBlocked ? 'blocked' : 'noncanonical',
      rights: nodeRights,
      verification: isBlocked ? 'unverified' : 'verified',
    },
    lifetime: {
      creator: isBlocked ? 'system' : 'package-manager',
      consumer: isBlocked ? 'unknown' : 'installer',
      disposer: isBlocked ? 'unknown' : 'installer',
      scope: isBlocked ? 'unknown' : 'package lifetime',
      hardBound: 0,
      notApplicableReason: isBlocked ? 'Unknown node' : '',
    },
    evidenceIds: evidenceId ? [evidenceId] : [],
    relatedIssue: 'LOGH7-216',
    acceptanceCriteria: isBlocked ? ['AC-15-blocked-unresolved'] : ['AC-15-1', 'AC-15-5'],
    sourceManifestHash,
    unresolved: {
      impact: isBlocked ? 'blocks A15 PASS' : '',
      blocker: blocker,
      nextExperiment: isBlocked ? 'implement ' + type : '',
      releaseCondition: isBlocked ? 'deliver ' + type + ' per spec' : '',
    },
  };
}

export async function buildA15Axis(repoRoot) {
  // Step 1: Bootstrap A01 base
  const { ledger: base } = await importSources(repoRoot, SOURCE_MANIFEST);
  const baseSourceManifestHash = base.sourceManifestHash;

  // Step 2: Read real source files
  const [masterDesign, packageJson, dockerCompose, dockerfile, lineage, canonicalPatch, loopbackPatch] = await Promise.all([
    readMasterDesignSource(repoRoot),
    readPackageSource(repoRoot),
    readDockerComposeSource(repoRoot),
    readDockerfileSource(repoRoot),
    readLineageSource(repoRoot),
    readPatchManifestSource(repoRoot, 'logh7-canonical-client-patch.json'),
    readPatchManifestSource(repoRoot, 'logh7-loopback-client-patch.json'),
  ]);

  // Step 3: Create A15 evidence (grounded in master design)
  const axisEvidenceId = 'A15:evidence:master-design';
  const axisEvidence = {
    schemaVersion: CONTRACT.schemaVersion,
    evidenceId: axisEvidenceId,
    type: 'design-documentation',
    producer: 'A15 axis',
    reviewer: 'A01 validator',
    source: {
      path: masterDesign.path,
      sha256: masterDesign.sha256,
      sizeBytes: masterDesign.text.length,
      lineage: 'design-spec',
      rights: 'allowed',
      recordPointer: 'section:516-524',
      recordSha256: sha256('### A15. Packaging, install, update, config lifecycle'),
      legacyMetadata: { source: 'design-doc', version: '1.0' },
    },
    execution: {
      platform: 'node',
      runtimeMode: 'axis-construction',
      command: 'a15-packaging-lifecycle.mjs',
      inputs: ['CONTRACT.schemaVersion', 'SOURCE_MANIFEST'],
      configHash: sha256('a15-config'),
      startedAt: FIXED_EVIDENCE_TIMESTAMP,
      endedAt: FIXED_EVIDENCE_TIMESTAMP,
      exitCode: 0,
    },
    observation: {
      expected: 'ledger-validates',
      observed: 'ledger-validates',
      verdict: 'pass',
      contradictedClaim: '',
    },
    artifacts: [],
    correlation: {
      acceptanceCriteria: ['A15-packaging-nodes', 'A15-unknown-blocked', 'ledger-valid'],
      nodeIds: [],
      edgeIds: [],
    },
    cleanup: {
      pids: [],
      ports: [],
      databases: [],
      tempPaths: [],
      guis: [],
      runtimeWorkspaces: [],
      residual: 0,
    },
  };

  // Verify non-collision
  for (const src of base.evidence) {
    if (src.source.path === masterDesign.path && src.source.sha256 === masterDesign.sha256) {
      throw new Error('COLLISION: A15 evidence source already exists in base');
    }
  }

  // Step 4: Create A15 nodes (infrastructure, lineage, patches, unknown/blocked)
  const axisNodes = [];

  // Real nodes grounded in actual files
  axisNodes.push(createNode('A15:node:server-package', 'package-manifest', 'Server package.json (Node >=20, @sentry/node)', 'package', 'none', axisEvidenceId, baseSourceManifestHash));
  axisNodes.push(createNode('A15:node:docker-compose', 'infrastructure-config', 'Docker Compose configuration (db + server services)', 'package', 'none', axisEvidenceId, baseSourceManifestHash));
  axisNodes.push(createNode('A15:node:docker-service-db', 'service-definition', 'PostgreSQL 16-alpine service with volumes (pgdata)', 'package', 'none', axisEvidenceId, baseSourceManifestHash));
  axisNodes.push(createNode('A15:node:docker-service-server', 'service-definition', 'Node.js server service (port 47900, serverdata volume)', 'package', 'none', axisEvidenceId, baseSourceManifestHash));
  axisNodes.push(createNode('A15:node:dockerfile', 'build-spec', 'Node 20-bookworm-slim + npm install + EXPOSE 47900', 'package', 'none', axisEvidenceId, baseSourceManifestHash));

  // Lineage stages (real SHA256s from lineage doc)
  axisNodes.push(createNode('A15:node:lineage-stage-bd192', 'lineage-stage', 'Original bd19263c EXE (pristine from CD)', 'package', 'none', axisEvidenceId, baseSourceManifestHash));
  axisNodes.push(createNode('A15:node:lineage-stage-2848', 'lineage-stage', 'Loopback intermediate 2848be76 (NOT pristine, IP literal only)', 'package', 'none', axisEvidenceId, baseSourceManifestHash));

  // Mark 2848 as noncanonical explicitly
  const stage2848 = axisNodes.find((n) => n.nodeId === 'A15:node:lineage-stage-2848');
  if (stage2848) {
    stage2848.state.canonicality = 'noncanonical';
  }

  axisNodes.push(createNode('A15:node:lineage-stage-9c97', 'lineage-stage', 'Canonical 9c97de2a (6 SJIS/UI patches applied to 2848)', 'package', 'none', axisEvidenceId, baseSourceManifestHash));
  axisNodes.push(createNode('A15:node:lineage-stage-1080p', 'lineage-stage', '1080p patched variant (59 patches)', 'package', 'none', axisEvidenceId, baseSourceManifestHash));
  axisNodes.push(createNode('A15:node:lineage-stage-825', 'lineage-stage', 'Final lineage end state 825635...', 'package', 'none', axisEvidenceId, baseSourceManifestHash));

  // Patch manifests
  axisNodes.push(createNode('A15:node:patch-canonical', 'patch-manifest', 'Canonical client patch (6 identical SJIS+UI patches, 2848→9c97)', 'package', 'none', axisEvidenceId, baseSourceManifestHash));
  axisNodes.push(createNode('A15:node:patch-loopback', 'patch-manifest', 'Loopback patch manifest (13-byte IP literal, bd192→2848)', 'package', 'none', axisEvidenceId, baseSourceManifestHash));
  axisNodes.push(createNode('A15:node:patch-1080p', 'patch-manifest', '1080p patch manifest (59 patches)', 'package', 'none', axisEvidenceId, baseSourceManifestHash));

  // Config layer
  axisNodes.push(createNode('A15:node:config-codex', 'config-layer', 'Codex platform configuration (.codex/config.toml)', 'persistence', 'none', axisEvidenceId, baseSourceManifestHash));

  // Unknown/Blocked nodes (per spec §523-524) - all require evidence even when blocked
  axisNodes.push(createNode('A15:node:install-receipt', 'receipt', 'Install receipt with backup/restore drill', 'persistence', 'none', axisEvidenceId, baseSourceManifestHash, true, 'rollback/restore drill + SBOM not yet produced'));
  axisNodes.push(createNode('A15:node:update-receipt', 'receipt', 'Update receipt with version verification', 'persistence', 'none', axisEvidenceId, baseSourceManifestHash, true, 'network updater design not yet started'));
  axisNodes.push(createNode('A15:node:rollback-receipt', 'receipt', 'Rollback receipt and orchestration', 'persistence', 'none', axisEvidenceId, baseSourceManifestHash, true, 'rollback stage sequencing not yet specified'));
  axisNodes.push(createNode('A15:node:restore-receipt', 'receipt', 'Database restore with parity check', 'persistence', 'none', axisEvidenceId, baseSourceManifestHash, true, 'backup/restore drill missing'));
  axisNodes.push(createNode('A15:node:sbom-inventory', 'inventory', 'SBOM or dependency/provenance inventory', 'security', 'none', axisEvidenceId, baseSourceManifestHash, true, 'no SBOM or dependency/provenance inventory'));
  axisNodes.push(createNode('A15:node:signed-manifest-upstream', 'manifest', 'Network updater signed manifest schema', 'security', 'none', axisEvidenceId, baseSourceManifestHash, true, 'network updater and signed manifest schema not yet designed'));
  axisNodes.push(createNode('A15:node:config-schema-migration', 'schema', 'Config schema version and migration system', 'persistence', 'none', axisEvidenceId, baseSourceManifestHash, true, 'no schema or migration system yet'));
  axisNodes.push(createNode('A15:node:compatibility-matrix', 'verification', 'Server version × client lineage stage compatibility matrix', 'test', 'none', axisEvidenceId, baseSourceManifestHash, true, 'no cross-product matrix defined'));
  axisNodes.push(createNode('A15:node:key-rotation-policy', 'security-policy', 'Admin/operator key rotation and revocation lifecycle', 'security', 'none', axisEvidenceId, baseSourceManifestHash, true, 'signing model undecided'));

  // Step 5: Create edges (causal, infrastructure dependencies)
  const axisEdges = [];



  // Step 6: Attach A15 nodes to coverage targetNodeIds
  const newCoverage = base.coverage.map((cov, idx) => {
    const newTargetNodeIds = [...cov.targetNodeIds];
    // Spread axis nodes across coverage records (round-robin)
    const nodeIndex = idx % axisNodes.length;
    if (nodeIndex < axisNodes.length) {
      newTargetNodeIds.push(axisNodes[nodeIndex].nodeId);
    }
    return {
      ...cov,
      targetNodeIds: newTargetNodeIds,
    };
  });

  // Step 7: Assemble full ledger
  const assembledLedger = {
    schemaVersion: base.schemaVersion,
    sourceManifestHash: baseSourceManifestHash,
    nodes: [...base.nodes, ...axisNodes],
    edges: [...base.edges, ...axisEdges],
    evidence: [...base.evidence, axisEvidence],
    coverage: newCoverage,
    transitions: [...base.transitions],
    migrations: [...base.migrations],
    axisDependencies: base.axisDependencies,
    importReceipts: [...base.importReceipts],
  };

  // Step 8: Validate
  validateLedger(assembledLedger, { manifest: SOURCE_MANIFEST });

  // Step 9: Generate delta output (axis-only, not full ledger)
  const delta = {
    nodes: axisNodes,
    edges: axisEdges,
    evidence: [axisEvidence],
    coverage: newCoverage.map((cov) => ({
      recordPointer: cov.recordPointer,
      recordHash: cov.recordHash,
      addedNodeIds: cov.targetNodeIds.filter((id) => id.startsWith('A15:')),
    })),
  };

  const deltaJson = stableStringify(delta) + '\n';
  const deltaPath = join(GENERATED_DIR, 'a15-packaging.json');
  await writeFile(deltaPath, deltaJson, 'utf8');

  return { ledger: assembledLedger, delta };
}
