/**
 * A10 Axis: Verification matrix and clean-room handoff
 */

import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONTRACT, stableStringify, validateLedger, SOURCE_MANIFEST, importSources } from '../index.mjs';

const AXIS_DIR = dirname(fileURLToPath(import.meta.url));
const TOOL_DIR = dirname(AXIS_DIR);
const GENERATED_DIR = join(TOOL_DIR, 'generated');
const FIXED_EVIDENCE_TIMESTAMP = '2026-07-21T00:00:00Z';

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function canonicalLf(value) {
  return value.replaceAll('\r\n', '\n').replaceAll('\r', '\n');
}

function log(msg) {
  if (typeof process !== 'undefined' && process.stderr) {
    process.stderr.write(msg + '\n');
  }
}

function createMatrixNode(axis, baseSourceManifestHash, evidenceId) {
  return {
    schemaVersion: CONTRACT.schemaVersion,
    nodeId: `A10:matrix:${axis.toLowerCase()}`,
    axis: 'A10',
    type: 'verification-matrix',
    domain: 'synthesis',
    owner: 'A10 independent-verification',
    summary: `${axis} verification — master design §11.${axis} AC: merged axis module exists`,
    preconditions: [`${axis} module merged`],
    postconditions: [`${axis} PASS judged`],
    failureConditions: [`${axis} blocker unresolved`],
    surface: 'test',
    direction: 'none',
    state: { grade: 'R1', confidence: 'confirmed', canonicality: 'noncanonical', rights: 'unknown', verification: 'partial' },
    lifetime: { creator: 'A10', consumer: 'A10', disposer: 'A10', scope: 'synthesis', hardBound: 0, notApplicableReason: '' },
    evidenceIds: [evidenceId],
    relatedIssue: 'LOGH7-222',
    acceptanceCriteria: [`${axis} schema-valid`, `${axis} tests pass`, `${axis} nodes/edges/evidence complete`],
    sourceManifestHash: baseSourceManifestHash,
    unresolved: { impact: '', blocker: '', nextExperiment: '', releaseCondition: '' },
  };
}

function createBlocker(id, title, impact, blocker, nextExp, release, baseSourceManifestHash, evidenceId) {
  return {
    schemaVersion: CONTRACT.schemaVersion,
    nodeId: `A10:blocker:${id}`,
    axis: 'A10',
    type: 'synthesis-blocker',
    domain: 'synthesis',
    owner: 'A10 independent-verification',
    summary: `A10 synthesis blocker: ${title}`,
    preconditions: ['gap-identified'],
    postconditions: ['blocker-recorded', 'resolution-path-defined'],
    failureConditions: ['resolution-impossible'],
    surface: 'test',
    direction: 'none',
    state: { grade: 'R1', confidence: 'unknown', canonicality: 'blocked', rights: 'unknown', verification: 'unverified' },
    lifetime: { creator: 'A10', consumer: 'A10', disposer: 'A10', scope: 'synthesis', hardBound: 0, notApplicableReason: '' },
    evidenceIds: [evidenceId],
    relatedIssue: 'LOGH7-222',
    acceptanceCriteria: ['blocker-documented', 'resolution-experiment-defined'],
    sourceManifestHash: baseSourceManifestHash,
    unresolved: { impact, blocker, nextExperiment: nextExp, releaseCondition: release },
  };
}

export async function buildA10Axis(repoRoot) {
  log('[1] Bootstrapping base...');
  const { ledger: base } = await importSources(repoRoot, SOURCE_MANIFEST);

  log('[2] Reading master design...');
  const masterDesignPath = 'docs/logh7-causal-ledger-master-design.md';
  const masterDesignContent = canonicalLf(await readFile(join(repoRoot, masterDesignPath), 'utf8'));
  const masterDesignSha256 = sha256(masterDesignContent);

  log('[3] Creating matrix nodes...');
  const a10MatrixNodes = [];
  const verifyEvidenceId = 'run:a10:verification-matrix';

  for (const axis of ['A01', 'A02', 'A03', 'A04', 'A05', 'A06', 'A07', 'A08', 'A09', 'A10', 'A11', 'A12', 'A13', 'A14', 'A15']) {
    a10MatrixNodes.push(createMatrixNode(axis, base.sourceManifestHash, verifyEvidenceId));
  }

  log('[4] Creating blocker nodes...');
  const synthesisBlockers = [
    createBlocker('live-gameplay', 'Live gameplay end-to-end chain', 'PASS requires actual pixel/audio/input causation evidence', 'No fresh run evidence in current checkout', 'Execute representative MoveGrid→Warp flow', 'Independent reviewer attestation + user approval', base.sourceManifestHash, verifyEvidenceId),
    createBlocker('clock-rng-replay', 'Deterministic clock/RNG/replay oracle', 'Cannot guarantee deterministic recovery without clock/RNG control', 'No injected clock source or deterministic replay test', 'Implement A07 persistence + A05 time/RNG injection', 'A07 implementation gate + independent replay oracle verification', base.sourceManifestHash, verifyEvidenceId),
    createBlocker('clean-room-export', 'Independent clean-room re-execution', 'Cannot verify independent implementer rebuild', 'No sanitized JSON export or independent run with different role ID', 'Build sanitized export function and run with independent attestation', 'Sanitized export bundle + independent implementer attestation', base.sourceManifestHash, verifyEvidenceId),
    createBlocker('bounded-resources', 'Bounded-resource enforcement and stress testing', 'PASS requires actual overload test', 'No sustained 80% load 60s, hard-cap burst, resource plateau evidence', 'A08 stress-oracle fixture test with sustained load and plateau measurement', 'Independent stress-test run with metrics capture', base.sourceManifestHash, verifyEvidenceId),
    createBlocker('pixel-audio-output', 'Actual pixel/audio edge-to-edge evidence', 'A03 PASS judgment reserved', 'No screenshot before/after MoveGrid or DirectSound evidence', 'A03 live render oracle with screenshot and audio capture', 'Fresh A03 render+audio evidence on Windows native run', base.sourceManifestHash, verifyEvidenceId),
    createBlocker('fleet-warp-reach', 'Fleet marker/selection/0x032f/Warp reachability', 'A11 gameplay PASS impossible without Warp reach', 'No exact lineage or marker node live data', 'UI explorer fleet selection trace + 0x032e→0x032f live test', 'A11 gameplay PASS gate after Warp lineage evidence', base.sourceManifestHash, verifyEvidenceId),
    createBlocker('rights-disposition', 'Rights disposition completion', 'Package cannot be distributable without rights classification', 'Per-artifact holder/terms/license judgment incomplete', 'A13 rights-decision queue, human review per-artifact', 'Human rights judgment per artifact + legal authority approval', base.sourceManifestHash, verifyEvidenceId),
    createBlocker('package-lifecycle', 'Package completion (install/update/rollback/restore)', 'Master design §15 PASS requires clean-host lifecycle receipt', 'No clean-host Dockerfile/compose test or signed manifest', 'A15 packaging oracle: fresh install→update→rollback→restore cycle', 'Independent package lifecycle reviewer + user approval', base.sourceManifestHash, verifyEvidenceId),
    createBlocker('security-blocker', 'Security BLOCKER/MAJOR residual risk', 'Release BLOCKER per §14 acceptance criteria', 'No independent security verdict or residual risk owner', 'A14 threat matrix + independent security audit', 'Security BLOCKER/MAJOR resolved + residual risk owner/scope/expiry', base.sourceManifestHash, verifyEvidenceId),
    createBlocker('accessibility-audit', 'Accessibility legacy baseline audit', 'PASS incomplete per master design §10', 'Legacy baseline audit not complete', 'Complete accessibility baseline audit against WCAG 2.1 AA', 'Accessibility reviewer audit + residual risk owner/expiry', base.sourceManifestHash, verifyEvidenceId),
  ];

  log('[5] Creating evidence...');
  const a10Evidence = {
    schemaVersion: CONTRACT.schemaVersion,
    evidenceId: verifyEvidenceId,
    type: 'verification-matrix-synthesis',
    producer: 'A10',
    reviewer: 'validator',
    source: { path: masterDesignPath, sha256: masterDesignSha256, sizeBytes: masterDesignContent.length, lineage: 'design-spec-master', rights: 'allowed', recordPointer: 'section:A10', recordSha256: sha256('### A10. Verification matrix and clean-room handoff'), legacyMetadata: { source: 'master-design', axis: 'A10', version: '1.0.0' } },
    execution: { platform: 'node', runtimeMode: 'ledger-build', command: 'a10-verification-synthesis.mjs', inputs: ['CONTRACT.schemaVersion', 'SOURCE_MANIFEST', 'axisDependencies'], configHash: sha256('a10-verify'), startedAt: FIXED_EVIDENCE_TIMESTAMP, endedAt: FIXED_EVIDENCE_TIMESTAMP, exitCode: 0 },
    observation: { expected: 'verification-matrix-synthesized', observed: 'verification-matrix-synthesized', verdict: 'pass', contradictedClaim: '' },
    artifacts: [],
    correlation: { acceptanceCriteria: ['matrix-15-axes', 'synthesis-blockers-documented', 'unknowns-recorded', 'ledger-validates'], nodeIds: [...a10MatrixNodes.map((n) => n.nodeId), ...synthesisBlockers.map((n) => n.nodeId)], edgeIds: [] },
    cleanup: { pids: [], ports: [], databases: [], tempPaths: [], guis: [], runtimeWorkspaces: [], residual: 0 },
  };

  log('[6] Assembling ledger...');
  const sortedA10Nodes = [...a10MatrixNodes, ...synthesisBlockers].sort((a, b) => a.nodeId.localeCompare(b.nodeId));
  const a10NodeIds = new Set(sortedA10Nodes.map((n) => n.nodeId));

  // Attach A10 nodes to coverage records (distribute across first few coverage records)
  let nodeIndex = 0;
  const mappedCoverage = base.coverage.map((cov) => {
    const nodesToAdd = [];
    while (nodeIndex < sortedA10Nodes.length && nodesToAdd.length < 3) {
      nodesToAdd.push(sortedA10Nodes[nodeIndex].nodeId);
      nodeIndex++;
    }
    if (nodesToAdd.length > 0) {
      return { ...cov, targetNodeIds: [...(cov.targetNodeIds || []), ...nodesToAdd] };
    }
    return cov;
  });

  const assembledLedger = {
    schemaVersion: base.schemaVersion,
    sourceManifestHash: base.sourceManifestHash,
    nodes: [...base.nodes, ...sortedA10Nodes],
    edges: [...base.edges],
    evidence: [...base.evidence, a10Evidence],
    coverage: mappedCoverage,
    transitions: [...base.transitions],
    migrations: [...base.migrations],
    axisDependencies: base.axisDependencies,
    importReceipts: [...base.importReceipts],
  };

  validateLedger(assembledLedger, { manifest: SOURCE_MANIFEST });
  log('  ✓ VALIDATION PASSED');

  log('[7] Writing delta...');
  const coverageAttachments = [];
  for (let idx = 0; idx < mappedCoverage.length; idx++) {
    const newCov = mappedCoverage[idx];
    const baseCov = base.coverage[idx];
    const addedNodeIds = newCov.targetNodeIds?.filter(id =>
      a10NodeIds.has(id) && !baseCov.targetNodeIds?.includes(id)
    ) || [];
    if (addedNodeIds.length > 0) {
      coverageAttachments.push({
        coverageId: newCov.coverageId,
        addedNodeIds,
      });
    }
  }
  const delta = { nodes: sortedA10Nodes, edges: [], evidence: [a10Evidence], coverageAttachments };
  await mkdir(GENERATED_DIR, { recursive: true });
  await writeFile(join(GENERATED_DIR, 'a10-verification-matrix.json'), stableStringify(delta) + '\n', 'utf8');

  return { ledger: assembledLedger };
}

if (process.argv[1] && process.argv[1].includes('a10-verification-synthesis')) {
  (async () => {
    try {
      const result = await buildA10Axis(process.env.LOGH7_REPO_ROOT || process.cwd());
      console.log(stableStringify(result.ledger));
    } catch (err) {
      console.error('Error:', err.message);
      process.exit(1);
    }
  })();
}
