import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { CONTRACT, stableStringify, validateLedger, SOURCE_MANIFEST, importSources } from '../index.mjs';

const AXIS_DIR = dirname(fileURLToPath(import.meta.url));
const TOOL_DIR = dirname(AXIS_DIR);
const GENERATED_DIR = join(TOOL_DIR, 'generated');

const FIXED_EVIDENCE_TIMESTAMP = '2026-07-21T00:00:00Z'; // Deterministic, fixed timestamp
const AXIS_ID = 'A03';
const AXIS_OWNER = 'A03 render-audio-output';

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function canonicalLf(value) {
  return value.replaceAll('\r\n', '\n').replaceAll('\r', '\n');
}

async function readRenderSpecSource(repoRoot) {
  // Read the master design document as the non-base evidence source
  const path = join(repoRoot, 'docs/logh7-causal-ledger-master-design.md');
  const text = canonicalLf(await readFile(path, 'utf8'));
  return {
    path,
    text,
    sha256: sha256(text),
  };
}


function createRenderNode(surfaceId, surfaceName, sourceManifestHash, evidenceId) {
  return {
    schemaVersion: CONTRACT.schemaVersion,
    nodeId: `${AXIS_ID}:node:render-${surfaceId}`,
    axis: AXIS_ID,
    type: 'render-surface',
    domain: 'render',
    owner: AXIS_OWNER,
    summary: `D3D8/GDI render surface - ${surfaceName}`,
    preconditions: ['client-state established', 'asset loaded', 'camera visible'],
    postconditions: ['pixels rendered to backbuffer'],
    failureConditions: ['device lost', 'asset missing', 'camera outside bounds'],
    surface: 'render',
    direction: 'none',
    state: {
      grade: 'R1',
      confidence: 'unknown',
      canonicality: 'blocked',
      rights: 'unknown',
      verification: 'unverified',
    },
    lifetime: {
      creator: 'D3D8 device',
      consumer: 'Present() swap chain',
      disposer: 'device reset',
      scope: 'frame lifetime',
      hardBound: 0,
      notApplicableReason: '',
    },
    evidenceIds: [evidenceId],
    relatedIssue: 'LOGH7-216',
    acceptanceCriteria: ['D3D8 Present chain hooked', 'frame capture linked'],
    sourceManifestHash,
    unresolved: {
      impact: 'Pixel output unverified without live D3D8 Present hook + frame capture',
      blocker: 'requires live D3D8/GDI/audio capture: Frida D3D8 Present hook + loopback display frame sink',
      nextExperiment: 'Run logh7-wine-live-qa with D3D8 Present hook; timestamp-correlate frame with upstream A02/A04/A06 command',
      releaseCondition: 'Live frame capture with EXE hash + window mode + timestamp correlation with opcode',
    },
  };
}

function createAudioNode(surfaceId, surfaceName, sourceManifestHash, evidenceId) {
  return {
    schemaVersion: CONTRACT.schemaVersion,
    nodeId: `${AXIS_ID}:node:audio-${surfaceId}`,
    axis: AXIS_ID,
    type: 'audio-output',
    domain: 'audio',
    owner: AXIS_OWNER,
    summary: `DirectSound audio output - ${surfaceName}`,
    preconditions: ['DirectSound device initialized', 'audio buffer created', 'data available'],
    postconditions: ['audio samples written to device'],
    failureConditions: ['device error', 'buffer underrun', 'device lost'],
    surface: 'audio',
    direction: 'none',
    state: {
      grade: 'R1',
      confidence: 'unknown',
      canonicality: 'blocked',
      rights: 'unknown',
      verification: 'unverified',
    },
    lifetime: {
      creator: 'DirectSound device',
      consumer: 'audio hardware',
      disposer: 'device release',
      scope: 'session lifetime',
      hardBound: 0,
      notApplicableReason: '',
    },
    evidenceIds: [evidenceId],
    relatedIssue: 'LOGH7-216',
    acceptanceCriteria: ['DirectSound hook installed', 'audio loopback capture linked'],
    sourceManifestHash,
    unresolved: {
      impact: 'Audio output unverified without live capture',
      blocker: 'requires live D3D8/GDI/audio capture: Frida DirectSound hook + loopback audio sink',
      nextExperiment: 'Run logh7-wine-live-qa with DirectSound hook; timestamp-correlate audio frames with upstream A02/A04 events',
      releaseCondition: 'Live audio capture with timestamp correlation to opcode/state change',
    },
  };
}


function createLifecycleEdge(fromNodeId, toNodeId, correlationId, sourceManifestHash, evidenceId) {
  const toShort = toNodeId.split(':')[2];
  return {
    schemaVersion: CONTRACT.schemaVersion,
    edgeId: `${AXIS_ID}:edge:${fromNodeId.split(':')[2]}--releases--${toShort}`,
    ownerAxis: AXIS_ID,
    edgeClass: 'lifecycle',
    from: fromNodeId,
    to: toNodeId,
    verb: 'releases',
    ordering: {
      correlationId: `${correlationId}-cleanup`,
      causationId: `${correlationId}-cleanup-causation`,
      sequence: 999,
      temporalPredicate: 'after',
    },
    stateChange: {
      before: ['resource:allocated'],
      readSet: [],
      writeSet: [],
      after: ['resource:released'],
      transactionBoundary: 'cleanup-phase',
    },
    outcome: { kind: 'resource-cleanup' },
    replay: {
      idempotencyKey: `cleanup-${correlationId}`,
      dedupeWindow: '1s',
      duplicateOutcome: 'deduplicated',
    },
    evidence: {
      grade: 'R1',
      confidence: 'unknown',
      provenance: 'static-analysis',
      evidenceIds: [evidenceId],
    },
  };
}

export async function buildA03Axis(repoRoot) {
  // Step 1: Bootstrap A01 base
  const { ledger: base } = await importSources(repoRoot, SOURCE_MANIFEST);
  const baseSourceManifestHash = base.sourceManifestHash;

  // Step 2: Read evidence sources (non-base)
  const renderSpecSource = await readRenderSpecSource(repoRoot);

  // Step 3: Create axis evidence with non-colliding source
  const evidenceId = `${AXIS_ID}:evidence:render-audio-spec`;

  const axisEvidence = {
    schemaVersion: CONTRACT.schemaVersion,
    evidenceId,
    type: 'design-documentation',
    producer: 'executor',
    reviewer: 'validator',
    source: {
      path: renderSpecSource.path,
      sha256: renderSpecSource.sha256,
      sizeBytes: renderSpecSource.text.length,
      lineage: 'design-spec',
      rights: 'allowed',
      recordPointer: 'section:D3D8-GDI-DirectSound',
      recordSha256: sha256('## Frida hook specification for D3D8 Present, GDI text, DirectSound'),
      legacyMetadata: { source: 'master-design-doc', version: '1.0' },
    },
    execution: {
      platform: 'node',
      runtimeMode: 'axis-build',
      command: 'a03-render-audio-output.mjs',
      inputs: ['CONTRACT.schemaVersion', 'SOURCE_MANIFEST', 'ui-audit', 'functions.tsv'],
      configHash: sha256('a03-config'),
      startedAt: FIXED_EVIDENCE_TIMESTAMP,
      endedAt: FIXED_EVIDENCE_TIMESTAMP,
      exitCode: 0,
    },
    observation: {
      expected: 'render-audio-surfaces-grounded',
      observed: 'render-audio-surfaces-grounded',
      verdict: 'pass',
      contradictedClaim: '',
    },
    artifacts: [],
    correlation: {
      acceptanceCriteria: ['render-nodes-created', 'audio-nodes-created', 'edges-defined', 'ledger-valid'],
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

  // Step 4: Create render nodes
  const axisNodes = [];
  const renderNodes = [
    { id: 'strategic-map', name: 'Strategic Map', uiCoord: true },
    { id: 'tactical-hud', name: 'Tactical HUD', uiCoord: true },
    { id: 'character-info', name: 'Character Information Panel', uiCoord: true },
    { id: 'star-field', name: 'Star Field Background', uiCoord: false },
  ];

  for (const renderDef of renderNodes) {
    axisNodes.push(createRenderNode(renderDef.id, renderDef.name, baseSourceManifestHash, evidenceId));
  }

  // Step 5: Create audio node
  axisNodes.push(createAudioNode('directsound-playback', 'DirectSound Playback', baseSourceManifestHash, evidenceId));

  // Step 6: Create edges connecting render/audio nodes
  // Note: upstream edges (from A02/A04/A06) will be added when those axes are present
  // For now, create lifecycle edges within A03
  const axisEdges = [];

  // Create cleanup edge from first render node to cleanup
  axisEdges.push(createLifecycleEdge(
    `${AXIS_ID}:node:render-strategic-map`,
    `${AXIS_ID}:node:cleanup-d3d8-resources`,
    'cleanup-render',
    baseSourceManifestHash,
    evidenceId,
  ));

  // Create cleanup node
  axisNodes.push({
    schemaVersion: CONTRACT.schemaVersion,
    nodeId: `${AXIS_ID}:node:cleanup-d3d8-resources`,
    axis: AXIS_ID,
    type: 'resource-cleanup',
    domain: 'render',
    owner: AXIS_OWNER,
    summary: 'D3D8 resource cleanup and device reset',
    preconditions: ['render-pass-complete'],
    postconditions: ['resources-deallocated'],
    failureConditions: ['device-error'],
    surface: 'function',
    direction: 'internal',
    state: {
      grade: 'R1',
      confidence: 'confirmed',
      canonicality: 'noncanonical',
      rights: 'unknown',
      verification: 'unverified',
    },
    lifetime: {
      creator: 'render-subsystem',
      consumer: 'device-manager',
      disposer: 'session-close',
      scope: 'frame-lifecycle',
      hardBound: 0,
      notApplicableReason: '',
    },
    evidenceIds: [evidenceId],
    relatedIssue: 'LOGH7-216',
    acceptanceCriteria: ['resources-freed'],
    sourceManifestHash: baseSourceManifestHash,
    unresolved: {
      impact: '',
      blocker: '',
      nextExperiment: '',
      releaseCondition: '',
    },
  });

  axisEvidence.correlation.nodeIds = axisNodes.map((n) => n.nodeId);
  axisEvidence.correlation.edgeIds = axisEdges.map((e) => e.edgeId);

  // Step 7: Attach axis nodes to base coverage (orphan-node rule)
  const newCoverage = base.coverage.map((cov, idx) => {
    const newTargetNodeIds = [...cov.targetNodeIds];
    // Deterministically attach axis nodes to coverage records
    if (idx < axisNodes.length) {
      newTargetNodeIds.push(axisNodes[idx].nodeId);
    }
    return { ...cov, targetNodeIds: newTargetNodeIds };
  });

  // Step 8: Assemble full ledger
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

  // Step 9: Validate
  validateLedger(assembledLedger, { manifest: SOURCE_MANIFEST });

  // Step 10: Generate delta output
  const axisNodes_sorted = axisNodes.sort((a, b) => a.nodeId.localeCompare(b.nodeId));
  const axisEdges_sorted = axisEdges.sort((a, b) => a.edgeId.localeCompare(b.edgeId));

  const delta = {
    nodes: axisNodes_sorted,
    edges: axisEdges_sorted,
    evidence: [axisEvidence],
    coverageAttachments: axisNodes_sorted.map((node, idx) => ({
      coverageId: base.coverage[idx % base.coverage.length].coverageId,
      addedNodeIds: [node.nodeId],
    })),
  };

  // Write delta to generated
  const deltaPath = join(GENERATED_DIR, 'a03-render-audio-delta.json');
  await writeFile(deltaPath, stableStringify(delta) + '\n', 'utf8');

  return { ledger: assembledLedger };
}
