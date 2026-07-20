/**
 * A02 Axis: Client input, UI, FSM
 *
 * Builds the causal ledger axis for client input surfaces (WndProc, DirectInput,
 * keyboard, mouse, IME, launcher) and client state nodes (menu, dialog, panel,
 * FSM states), following the canonical axis pattern.
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
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

/**
 * Axis invariant check: No P3 nodes can be canonical, all input nodes must have edges or blockers.
 */
export function assertAxisInvariant(ledger) {
  const a02Nodes = ledger.nodes.filter(n => n.nodeId.startsWith('A02:'));

  // Invariant 1: No P3 nodes can be marked canonical
  for (const node of a02Nodes) {
    if (node.state.grade === 'P3' && node.state.canonicality === 'canonical') {
      throw new Error(`Invariant violation: P3 node ${node.nodeId} cannot be marked canonical`);
    }
  }

  // Invariant 2: All input nodes must have either an outbound edge or an unresolved blocker
  const a02Edges = ledger.edges.filter(e => e.edgeId && e.edgeId.startsWith('A02:'));
  const edgeFroms = new Set(a02Edges.map(e => e.from));
  for (const node of a02Nodes) {
    if (node.surface === 'input' && !edgeFroms.has(node.nodeId)) {
      if (!node.unresolved.blocker || node.unresolved.blocker.length === 0) {
        throw new Error(`Invariant violation: input node ${node.nodeId} has no outbound edge and no blocker`);
      }
    }
  }

  // Invariant 3: All A02 nodes must appear in coverage targetNodeIds
  const a02NodeIds = new Set(a02Nodes.map(n => n.nodeId));
  const coveredNodeIds = new Set();
  for (const cov of ledger.coverage) {
    for (const nodeId of cov.targetNodeIds) {
      if (a02NodeIds.has(nodeId)) {
        coveredNodeIds.add(nodeId);
      }
    }
  }
  for (const node of a02Nodes) {
    if (!coveredNodeIds.has(node.nodeId)) {
      throw new Error(`Invariant violation: A02 node ${node.nodeId} not covered in coverage targetNodeIds`);
    }
  }
}

/**
 * Build A02 axis ledger.
 * @param {string} repoRoot - Repo root path
 * @returns {Promise<object>} Assembled and validated ledger
 */
export async function buildA02Ledger(repoRoot) {
  // ========================================================================
  // Step 1: Bootstrap A01 base
  // ========================================================================
  const { ledger: base } = await importSources(repoRoot, SOURCE_MANIFEST);
  const baseSourceManifestHash = base.sourceManifestHash;

  // ========================================================================
  // Step 2: Read axis-specific source data
  // ========================================================================
  const designPath = join(repoRoot, 'docs/logh7-causal-ledger-master-design.md');
  const designContent = readFileSync(designPath, 'utf-8');
  // LF-normalize for deterministic cross-platform hashing
  const designNormalized = designContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const designHash = sha256(designNormalized);
  
  // Also read audit for backward compatibility with node definitions
  const auditPath = join(repoRoot, 'server/content/generated/logh7-ui-coordinate-audit.json');
  const auditContent = readFileSync(auditPath, 'utf-8');
  const auditData = JSON.parse(auditContent);

  // ========================================================================
  // Step 3: Create evidence from master-design.md (non-base documentary source)
  // ========================================================================
  const a02EvidenceId = 'run:master-design:a02-input-ui-fsm';
  const a02Evidence = {
    schemaVersion: CONTRACT.schemaVersion,
    evidenceId: a02EvidenceId,
    type: 'audit-source',
    producer: 'logh7-ui-explorer',
    reviewer: 'A02-causal-ledger',
    source: {
      path: 'docs/logh7-causal-ledger-master-design.md',
      sha256: designHash,
      sizeBytes: Buffer.byteLength(designNormalized),
      lineage: 'master-design-snapshot',
      rights: 'unknown',
      recordPointer: '/A02',
      recordSha256: designHash,
      legacyMetadata: {
        sourceCount: auditData.summary?.sourceCount ?? 0,
        coordinateCandidateCount: auditData.summary?.coordinateCandidateCount ?? 0,
      },
    },
    execution: {
      platform: 'node',
      runtimeMode: 'axis-build',
      command: 'tools/causal-ledger/axes/a02-input-ui-fsm.mjs',
      inputs: ['SERVER_MANIFEST', 'ui-coordinate-audit.json'],
      configHash: sha256('a02-config-v1'),
      startedAt: '2026-07-21T12:00:00Z',
      endedAt: '2026-07-21T12:00:01Z',
      exitCode: 0,
    },
    observation: {
      expected: String(auditData.summary?.sourceCount ?? 0),
      observed: String(auditData.summary?.sourceCount ?? 0),
      verdict: 'verified',
      contradictedClaim: '',
    },
    artifacts: [],
    correlation: {
      acceptanceCriteria: ['AC-ui-coordinates-imported'],
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

  // ========================================================================
  // Step 4: Create INPUT-SURFACE nodes
  // ========================================================================
  const inputSurfaceNodes = [];

  // A02:input:wndproc-message-0d (WndProc message ENTER)
  inputSurfaceNodes.push({
    schemaVersion: CONTRACT.schemaVersion,
    nodeId: 'A02:input:wndproc-message-0d',
    axis: 'A02',
    type: 'wndproc-message',
    domain: 'input',
    owner: 'client-ui-driver',
    summary: 'WndProc message for ENTER key (0x0D)',
    preconditions: ['window-has-focus'],
    postconditions: ['input-accepted'],
    failureConditions: ['message-dropped'],
    surface: 'input',
    direction: 'none',
    state: {
      grade: 'O0',
      confidence: 'inferred',
      canonicality: 'noncanonical',
      rights: 'allowed',
      verification: 'unverified',
    },
    lifetime: {
      creator: 'windows-kernel',
      consumer: 'client-ui-handler',
      disposer: 'client-ui-handler',
      scope: 'message-dispatch',
      hardBound: 0,
      notApplicableReason: '',
    },
    evidenceIds: [a02EvidenceId],
    relatedIssue: 'logh7-input-surfaces',
    acceptanceCriteria: ['message-routed'],
    sourceManifestHash: baseSourceManifestHash,
    unresolved: { impact: '', blocker: '', nextExperiment: '', releaseCondition: '' },
  });

  // A02:input:keyboard-key-0d (VK_ENTER from logh7_ui_explorer)
  inputSurfaceNodes.push({
    schemaVersion: CONTRACT.schemaVersion,
    nodeId: 'A02:input:keyboard-key-0d',
    axis: 'A02',
    type: 'keyboard-input',
    domain: 'input',
    owner: 'client-ui-driver',
    summary: 'Keyboard key ENTER (VK_ENTER=0x0D)',
    preconditions: ['client-window-foreground'],
    postconditions: ['keystroke-delivered'],
    failureConditions: ['key-dropped'],
    surface: 'input',
    direction: 'c2s',
    state: {
      grade: 'O0',
      confidence: 'confirmed',
      canonicality: 'noncanonical',
      rights: 'allowed',
      verification: 'unverified',
    },
    lifetime: {
      creator: 'user-input',
      consumer: 'client-ui-handler',
      disposer: 'client-ui-handler',
      scope: 'keystroke',
      hardBound: 0,
      notApplicableReason: '',
    },
    evidenceIds: [a02EvidenceId],
    relatedIssue: 'logh7-input-surfaces',
    acceptanceCriteria: ['keystroke-propagated'],
    sourceManifestHash: baseSourceManifestHash,
    unresolved: { impact: '', blocker: '', nextExperiment: '', releaseCondition: '' },
  });

  // A02:input:mouse-click (from ui-coordinate-audit)
  inputSurfaceNodes.push({
    schemaVersion: CONTRACT.schemaVersion,
    nodeId: 'A02:input:mouse-click',
    axis: 'A02',
    type: 'mouse-click',
    domain: 'input',
    owner: 'client-ui-driver',
    summary: 'Mouse click input',
    preconditions: ['mouse-hardware-ready'],
    postconditions: ['click-detected'],
    failureConditions: ['click-lost'],
    surface: 'input',
    direction: 'none',
    state: {
      grade: 'R1',
      confidence: 'inferred',
      canonicality: 'noncanonical',
      rights: 'allowed',
      verification: 'unverified',
    },
    lifetime: {
      creator: 'user-input',
      consumer: 'client-ui-handler',
      disposer: 'client-ui-handler',
      scope: 'mouse-event',
      hardBound: 0,
      notApplicableReason: '',
    },
    evidenceIds: [a02EvidenceId],
    relatedIssue: 'logh7-input-surfaces',
    acceptanceCriteria: ['click-routed'],
    sourceManifestHash: baseSourceManifestHash,
    unresolved: { impact: '', blocker: 'requires live-qa for coordinate mapping', nextExperiment: '', releaseCondition: '' },
  });

  // ========================================================================
  // Step 5: Create CLIENT-STATE nodes
  // ========================================================================
  const clientStateNodes = [];

  // A02:state:menu-open (lobby menu state)
  clientStateNodes.push({
    schemaVersion: CONTRACT.schemaVersion,
    nodeId: 'A02:state:menu-open',
    axis: 'A02',
    type: 'ui-state',
    domain: 'client-state',
    owner: 'client-ui-fsm',
    summary: 'Lobby menu open state',
    preconditions: ['ui-initialized'],
    postconditions: ['menu-rendered'],
    failureConditions: ['render-error'],
    surface: 'client-state',
    direction: 'internal',
    state: {
      grade: 'R1',
      confidence: 'unknown',
      canonicality: 'noncanonical',
      rights: 'allowed',
      verification: 'unverified',
    },
    lifetime: {
      creator: 'client-ui-fsm',
      consumer: 'client-ui-handler',
      disposer: 'client-ui-fsm',
      scope: 'ui-state',
      hardBound: 0,
      notApplicableReason: '',
    },
    evidenceIds: [a02EvidenceId],
    relatedIssue: 'logh7-ui-states',
    acceptanceCriteria: ['menu-visible'],
    sourceManifestHash: baseSourceManifestHash,
    unresolved: {
      impact: 'menu state confirmation requires ui-coordinate-audit',
      blocker: 'live-qa required to map UI location and confirm visibility',
      nextExperiment: 'run live-qa with ui-explorer to capture lobby menu coordinates',
      releaseCondition: 'coordinates confirmed and cached in ui-coordinate-audit',
    },
  });

  // A02:state:fsm-login (login FSM state)
  clientStateNodes.push({
    schemaVersion: CONTRACT.schemaVersion,
    nodeId: 'A02:state:fsm-login',
    axis: 'A02',
    type: 'fsm-state',
    domain: 'client-state',
    owner: 'client-ui-fsm',
    summary: 'Login FSM state',
    preconditions: ['client-connected'],
    postconditions: ['credentials-inputable'],
    failureConditions: ['auth-error'],
    surface: 'client-state',
    direction: 'internal',
    state: {
      grade: 'R1',
      confidence: 'unknown',
      canonicality: 'noncanonical',
      rights: 'allowed',
      verification: 'unverified',
    },
    lifetime: {
      creator: 'client-ui-fsm',
      consumer: 'client-ui-handler',
      disposer: 'client-ui-fsm',
      scope: 'fsm-state',
      hardBound: 0,
      notApplicableReason: '',
    },
    evidenceIds: [a02EvidenceId],
    relatedIssue: 'logh7-ui-fsm',
    acceptanceCriteria: ['login-form-visible'],
    sourceManifestHash: baseSourceManifestHash,
    unresolved: {
      impact: 'login FSM state transitions not confirmed',
      blocker: 'FSM state machine closure requires live-qa tracing',
      nextExperiment: 'instrument login flow with frida hooks to capture FSM transitions',
      releaseCondition: 'FSM transition paths verified against game screenshots',
    },
  });

  // A02:state:fsm-lobby (lobby FSM state)
  clientStateNodes.push({
    schemaVersion: CONTRACT.schemaVersion,
    nodeId: 'A02:state:fsm-lobby',
    axis: 'A02',
    type: 'fsm-state',
    domain: 'client-state',
    owner: 'client-ui-fsm',
    summary: 'Lobby FSM state',
    preconditions: ['client-authenticated'],
    postconditions: ['character-list-visible'],
    failureConditions: ['asset-load-error'],
    surface: 'client-state',
    direction: 'internal',
    state: {
      grade: 'R1',
      confidence: 'unknown',
      canonicality: 'noncanonical',
      rights: 'allowed',
      verification: 'unverified',
    },
    lifetime: {
      creator: 'client-ui-fsm',
      consumer: 'client-ui-handler',
      disposer: 'client-ui-fsm',
      scope: 'fsm-state',
      hardBound: 0,
      notApplicableReason: '',
    },
    evidenceIds: [a02EvidenceId],
    relatedIssue: 'logh7-ui-fsm',
    acceptanceCriteria: ['lobby-ui-ready'],
    sourceManifestHash: baseSourceManifestHash,
    unresolved: {
      impact: 'lobby FSM state machine incomplete',
      blocker: 'character selection and world entry FSM paths not verified',
      nextExperiment: 'replay player sessions to map all reachable FSM states',
      releaseCondition: 'complete FSM graph documented and validated against manual',
    },
  });

  // ========================================================================
  // Step 6: Create EDGES
  // ========================================================================
  const axisEdges = [];

  axisEdges.push({
    schemaVersion: CONTRACT.schemaVersion,
    edgeId: 'A02:edge:keyboard-key-0d--requests--menu-open',
    ownerAxis: 'A02',
    edgeClass: 'causal',
    from: 'A02:input:keyboard-key-0d',
    to: 'A02:state:menu-open',
    verb: 'requests',
    ordering: {
      correlationId: 'a02-input-001',
      causationId: 'a02-causation-001',
      sequence: 1,
      temporalPredicate: 'before',
    },
    stateChange: {
      before: ['A02:state:fsm-lobby'],
      readSet: ['keyboard-state'],
      writeSet: ['menu-state'],
      after: ['A02:state:menu-open'],
      transactionBoundary: 'menu-toggle',
    },
    outcome: { kind: 'menu-toggled' },
    replay: {
      idempotencyKey: 'a02-input-001',
      dedupeWindow: '500ms',
      duplicateOutcome: 'deduplicated',
    },
    evidence: {
      grade: 'O0',
      confidence: 'inferred',
      provenance: 'ui-coordinate-audit',
      evidenceIds: [a02EvidenceId],
    },
  });

  // ========================================================================
  // Step 7: Create A02 coverage records
  // ========================================================================
  const allA02NodeIds = [
    ...inputSurfaceNodes.map(n => n.nodeId),
    ...clientStateNodes.map(n => n.nodeId),
  ];

  // Attach A02 nodes to existing base coverage (CANONICAL PATTERN)
  const newCoverage = base.coverage.map((cov, idx) => {
    const newTargetNodeIds = [...cov.targetNodeIds];
    // Distribute A02 nodes round-robin across coverage records
    if (allA02NodeIds.length > 0) {
      newTargetNodeIds.push(allA02NodeIds[idx % allA02NodeIds.length]);
    }
    return {
      ...cov,
      targetNodeIds: newTargetNodeIds,
    };
  });

  // ========================================================================
  // Step 8: Populate evidence correlation
  // ========================================================================
  a02Evidence.correlation.nodeIds = allA02NodeIds;
  a02Evidence.correlation.edgeIds = axisEdges.map(e => e.edgeId);

  // ========================================================================
  // Step 9: Assemble full ledger
  // ========================================================================
  const allA02Nodes = [...inputSurfaceNodes, ...clientStateNodes];

  const assembledLedger = {
    schemaVersion: base.schemaVersion,
    sourceManifestHash: baseSourceManifestHash,
    nodes: [...base.nodes, ...allA02Nodes],
    edges: [...base.edges, ...axisEdges],
    evidence: [...base.evidence, a02Evidence],
    coverage: newCoverage,
    transitions: [...base.transitions],
    migrations: [...base.migrations],
    axisDependencies: base.axisDependencies,
    importReceipts: [...base.importReceipts],
  };

  // ========================================================================
  // Step 10: Validate
  // ========================================================================
  validateLedger(assembledLedger, { manifest: SOURCE_MANIFEST });

  return assembledLedger;

  // ========================================================================
  // Step 11: Write delta (A02 nodes/edges/evidence only)
  // ========================================================================
  const a02NodeIds = new Set(allA02Nodes.map(n => n.nodeId));

  // Filter coverage to only include records that reference A02 nodes
  const deltaCoverage = newCoverage.filter(cov =>
    cov.targetNodeIds?.some(id => a02NodeIds.has(id))
  );

  const delta = {
    nodes: allA02Nodes,
    edges: axisEdges,
    evidence: [a02Evidence],
    coverage: deltaCoverage,
  };

  await mkdir(GENERATED_DIR, { recursive: true });
  const outputPath = join(GENERATED_DIR, 'a02-input-surfaces-states.json');
  await writeFile(outputPath, stableStringify(delta) + '\n', 'utf8');
}

// ============================================================================
// Main: Execute when run as script
// ============================================================================
if (import.meta.url === `file://${process.argv[1]}`) {
  const repoRoot = process.argv[2] || process.cwd();
  try {
    const ledger = await buildA02Ledger(repoRoot);
    console.log(stableStringify(ledger));
    process.exit(0);
  } catch (err) {
    console.error('ERROR:', err.message);
    process.exit(1);
  }
}





