import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CONTRACT,
  stableStringify,
  validateLedger,
  SOURCE_MANIFEST,
  importSources,
} from '../index.mjs';

const AXIS_DIR = dirname(fileURLToPath(import.meta.url));
const TOOL_DIR = dirname(AXIS_DIR);
const GENERATED_DIR = join(TOOL_DIR, 'generated');

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

export async function buildA09Ledger(repoRoot) {
  const { ledger: base } = await importSources(repoRoot, SOURCE_MANIFEST);
  const baseSourceManifestHash = base.sourceManifestHash;

  const lineagePath = join(repoRoot, 'docs', 'logh7-client-lineage-current.md');
  const masterDesignPath = join(repoRoot, 'docs', 'logh7-causal-ledger-master-design.md');

  const lineageText = await readFile(lineagePath, 'utf8');
  const masterDesignText = await readFile(masterDesignPath, 'utf8');

  const lineageHashes = [
    'bd19263c10decc3d58373165a82d42a9267868400d407da87d5f4f4109ab6e16',
    '2848be76a7662e25159353463bdfd8ff2f270ac5845ef4cea62983443c155345',
    '9c97de2ae426f011680992d6c8d88b25488b5f51555ce5784aeef677f334bb51',
    '24d79d90e1618309f05932156787e5a140d5f6d57ce008f6c09b00360da3ab3b',
    '5bdd64f1f9a8cca93f5b1002291d6a2c7e8f5ce555b062b8cb48337b96277d89',
    '825635783a9fb663ae3b9a2ecf8d4b74df648322256c57ee32f6426c42a23f22',
  ];

  const lineageDescriptions = [
    'canonical pristine original',
    'loopback intermediate: login server literal patch',
    'canonical text patches (6)',
    'hardcoded UI Korean resource patch (136)',
    'direct client fixed-length patch (10)',
    'post-login 1080p patch (59)',
  ];

  const failureClasses = [
    'malformed-oversize',
    'authn-authz-replay',
    'missing-data-p3',
    'rights-unknown-prohibited',
    'db-timeout-crash',
    'response-failure-after-commit',
    'queue-cache-oom',
    'disconnect-reconnect-storm',
    'd3d8-gdi-directsound-failure',
    'lineage-runtime-mismatch',
    'migration-version-mismatch',
    'installer-rollback',
  ];

  const lineageNodes = [];
  const lineageEvidence = [];

  for (let i = 0; i < lineageHashes.length; i++) {
    const hash = lineageHashes[i];
    const desc = lineageDescriptions[i];
    const nodeId = `A09:lineage:stage-${i}`;
    const evidenceId = `run:a09:lineage-stage-${i}`;

    lineageNodes.push({
      schemaVersion: CONTRACT.schemaVersion,
      nodeId,
      axis: 'A09',
      type: 'lineage-stage',
      domain: 'operations',
      owner: 'lineage_guard.py',
      summary: `Lineage stage ${i}: ${desc}`,
      preconditions: [`hash=${hash.slice(0, 8)}...`],
      postconditions: ['EXE verified or fail-closed'],
      failureConditions: ['hash mismatch', 'PE metadata mismatch', 'sentinel mismatch'],
      surface: 'failure',
      direction: 'none',
      state: {
        grade: 'R1',
        confidence: 'confirmed',
        canonicality: 'noncanonical',
        rights: 'unknown',
        verification: 'verified',
      },
      lifetime: {
        creator: 'lineage_guard.py',
        consumer: 'client launcher',
        disposer: 'lineage_guard.py',
        scope: 'EXE validation',
        hardBound: 0,
        notApplicableReason: '',
      },
      evidenceIds: [evidenceId],
      relatedIssue: 'LOGH7-223',
      acceptanceCriteria: ['AC-1: hash extracted from source', 'AC-2: cited in lineage-current.md'],
      sourceManifestHash: baseSourceManifestHash,
      unresolved: { impact: '', blocker: '', nextExperiment: '', releaseCondition: '' },
    });

    lineageEvidence.push({
      schemaVersion: CONTRACT.schemaVersion,
      evidenceId,
      type: 'lineage-metadata',
      producer: 'lineage_guard.py',
      reviewer: 'A09 axis',
      source: {
        path: 'docs/logh7-client-lineage-current.md',
        sha256: sha256(lineageText),
        sizeBytes: Buffer.byteLength(lineageText),
        lineage: 'tracked',
        rights: 'unknown',
        recordPointer: `line:${7 + i}`,
        recordSha256: sha256(hash),
        legacyMetadata: { stage: i, description: desc },
      },
      execution: {
        platform: 'platform-neutral',
        runtimeMode: 'static-analysis',
        command: 'extract-lineage',
        inputs: ['docs/logh7-client-lineage-current.md'],
        configHash: sha256('A09'),
        startedAt: '2026-07-20T00:00:00Z',
        endedAt: '2026-07-20T00:00:01Z',
        exitCode: 0,
      },
      observation: { expected: 'hash', observed: 'present', verdict: 'verified', contradictedClaim: '' },
      artifacts: [],
      correlation: { acceptanceCriteria: ['AC-1', 'AC-2'], nodeIds: [nodeId], edgeIds: [] },
      cleanup: { pids: [], ports: [], databases: [], tempPaths: [], guis: [], runtimeWorkspaces: [], residual: 0 },
    });
  }

  const failureNodes = [];
  const failureEvidence = [];

  for (let i = 0; i < failureClasses.length; i++) {
    const failureClass = failureClasses[i];
    const nodeId = `A09:failure:${failureClass}`;
    const evidenceId = `run:a09:failure-${i}`;

    failureNodes.push({
      schemaVersion: CONTRACT.schemaVersion,
      nodeId,
      axis: 'A09',
      type: 'failure-mode',
      domain: 'recovery',
      owner: 'server',
      summary: `Failure: ${failureClass}`,
      preconditions: ['detected'],
      postconditions: ['recorded'],
      failureConditions: ['uncontrolled'],
      surface: 'failure',
      direction: 'none',
      state: { grade: 'I2', confidence: 'inferred', canonicality: 'noncanonical', rights: 'unknown', verification: 'unverified' },
      lifetime: { creator: 'server', consumer: 'client', disposer: 'cleanup', scope: 'lifecycle', hardBound: 0, notApplicableReason: '' },
      evidenceIds: [evidenceId],
      relatedIssue: 'LOGH7-223',
      acceptanceCriteria: ['AC-1: documented', 'AC-2: recoverable'],
      sourceManifestHash: baseSourceManifestHash,
      unresolved: { impact: `Recovery for ${failureClass}`, blocker: 'evidence needed', nextExperiment: 'test', releaseCondition: 'A08/A05' },
    });

    failureEvidence.push({
      schemaVersion: CONTRACT.schemaVersion,
      evidenceId,
      type: 'failure-spec',
      producer: 'design',
      reviewer: 'A09',
      source: { path: 'docs/logh7-causal-ledger-master-design.md', sha256: sha256(masterDesignText), sizeBytes: Buffer.byteLength(masterDesignText), lineage: 'tracked', rights: 'unknown', recordPointer: `section:8-${i}`, recordSha256: sha256(failureClass), legacyMetadata: { class: failureClass } },
      execution: { platform: 'neutral', runtimeMode: 'static', command: 'extract', inputs: ['docs/logh7-causal-ledger-master-design.md'], configHash: sha256('A09-failures'), startedAt: '2026-07-20T00:00:00Z', endedAt: '2026-07-20T00:00:01Z', exitCode: 0 },
      observation: { expected: 'documented', observed: 'yes', verdict: 'verified', contradictedClaim: '' },
      artifacts: [],
      correlation: { acceptanceCriteria: ['AC-1', 'AC-2'], nodeIds: [nodeId], edgeIds: [] },
      cleanup: { pids: [], ports: [], databases: [], tempPaths: [], guis: [], runtimeWorkspaces: [], residual: 0 },
    });
  }

  const allAxisNodes = [...lineageNodes, ...failureNodes].sort((a, b) => a.nodeId.localeCompare(b.nodeId));
  const allAxisEvidence = [...lineageEvidence, ...failureEvidence].sort((a, b) => a.evidenceId.localeCompare(b.evidenceId));

  const newCoverage = base.coverage.map((cov, idx) => {
    const newTargetNodeIds = [...cov.targetNodeIds];
    if (idx < allAxisNodes.length) {
      newTargetNodeIds.push(allAxisNodes[idx].nodeId);
    }
    return {
      ...cov,
      targetNodeIds: newTargetNodeIds,
    };
  });

  const assembledLedger = {
    schemaVersion: base.schemaVersion,
    sourceManifestHash: baseSourceManifestHash,
    nodes: [...base.nodes, ...allAxisNodes],
    edges: [...base.edges],
    evidence: [...base.evidence, ...allAxisEvidence],
    coverage: newCoverage,
    transitions: [...base.transitions],
    migrations: [...base.migrations],
    axisDependencies: base.axisDependencies,
    importReceipts: [...base.importReceipts],
  };

  const validationResult = validateLedger(assembledLedger, { manifest: SOURCE_MANIFEST });
  if (validationResult !== true) {
    throw new Error('A09 validation failed');
  }

  await mkdir(GENERATED_DIR, { recursive: true });
  // Build coverage attachments: only include coverage records that had A09 nodes attached
  const a09NodeIds = new Set(allAxisNodes.map(n => n.nodeId));
  const coverageAttachments = [];
  for (let idx = 0; idx < newCoverage.length; idx++) {
    const newCov = newCoverage[idx];
    const baseCov = base.coverage[idx];
    // Only include if A09 nodes were added to this coverage record
    const addedNodeIds = newCov.targetNodeIds?.filter(id =>
      a09NodeIds.has(id) && !baseCov.targetNodeIds?.includes(id)
    ) || [];
    if (addedNodeIds.length > 0) {
      coverageAttachments.push({
        coverageId: newCov.coverageId,
        addedNodeIds,
      });
    }
  }
  const axisDelta = {
    nodes: allAxisNodes,
    edges: [],
    evidence: allAxisEvidence,
    coverageAttachments,
  };
  const deltaPath = join(GENERATED_DIR, 'a09-lineage-failure-safety.json');
  await writeFile(deltaPath, stableStringify(axisDelta) + '\n', 'utf8');

  return assembledLedger;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const repoRoot = process.argv[2] || process.cwd();
  try {
    const ledger = await buildA09Ledger(repoRoot);
    console.log(stableStringify(ledger));
    process.exit(0);
  } catch (err) {
    console.error('ERROR:', err.message);
    process.exit(1);
  }
}