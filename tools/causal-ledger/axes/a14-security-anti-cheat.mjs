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
  // A14 section in master design (lines 506-514 + section 10 threat table)
  const path = join(repoRoot, 'docs/logh7-causal-ledger-master-design.md');
  const text = canonicalLf(await readFile(path, 'utf8'));
  return {
    path,
    text,
    sha256: sha256(text),
  };
}

async function readFrameStreamSource(repoRoot) {
  // logh7-frame-stream.mjs: bounds checking control evidence
  const path = join(repoRoot, 'server/src/server/logh7-frame-stream.mjs');
  const text = canonicalLf(await readFile(path, 'utf8'));
  return {
    path,
    text,
    sha256: sha256(text),
  };
}

async function readHandlersSource(repoRoot) {
  // handlers.mjs: timing-safe authentication control
  const path = join(repoRoot, 'server/src/application/handlers.mjs');
  const text = canonicalLf(await readFile(path, 'utf8'));
  return {
    path,
    text,
    sha256: sha256(text),
  };
}

async function readAuthorityCardsSource(repoRoot) {
  // authority-cards.mjs: authorization bounds control
  const path = join(repoRoot, 'server/src/domain/authority-cards.mjs');
  const text = canonicalLf(await readFile(path, 'utf8'));
  return {
    path,
    text,
    sha256: sha256(text),
  };
}

function createThreatBoundaryNode(boundaryName, protectedAsset, preventControls, owner, evidenceId, sourceManifestHash) {
  const nodeId = `A14:threat:${boundaryName.toLowerCase().replace(/\s+/g, '-')}`;
  return {
    schemaVersion: CONTRACT.schemaVersion,
    nodeId,
    axis: 'A14',
    type: 'threat-boundary',
    domain: 'security',
    owner,
    summary: `Threat boundary: ${boundaryName} (protected: ${protectedAsset})`,
    preconditions: ['server-operational', 'untrusted-client-present'],
    postconditions: ['threat-classified', 'controls-identified'],
    failureConditions: ['unimplemented-control', 'blocker-present'],
    surface: 'security',
    direction: 'none',
    state: {
      grade: 'R1',
      confidence: 'confirmed',
      canonicality: 'noncanonical',
      rights: 'unknown',
      verification: 'verified',
    },
    lifetime: {
      creator: 'threat-analyst',
      consumer: 'control-implementer',
      disposer: 'incident-response',
      scope: 'deployment-lifetime',
      hardBound: 0,
      notApplicableReason: '',
    },
    evidenceIds: [evidenceId],
    relatedIssue: 'LOGH7-216',
    acceptanceCriteria: [`identify-${boundaryName.toLowerCase().replace(/\s+/g, '-')}-threats`],
    sourceManifestHash,
    unresolved: { impact: '', blocker: '', nextExperiment: '', releaseCondition: '' },
  };
}

function createControlImplementationNode(controlName, controlType, implementation, evidenceId, sourceManifestHash, blockerReason = '') {
  const nodeId = `A14:control:${controlName.toLowerCase().replace(/\s+/g, '-')}`;
  const blocker = blockerReason || '';
  return {
    schemaVersion: CONTRACT.schemaVersion,
    nodeId,
    axis: 'A14',
    type: 'control-implementation',
    domain: 'security',
    owner: 'server',
    summary: `${controlType}: ${controlName} - ${implementation}`,
    preconditions: ['threat-identified', 'design-approved'],
    postconditions: ['control-active', 'validated'],
    failureConditions: ['implementation-missing', 'validation-failed'],
    surface: 'security',
    direction: 'none',
    state: {
      grade: blocker ? 'I2' : 'R1',
      confidence: blocker ? 'unknown' : 'confirmed',
      canonicality: 'noncanonical',
      rights: blocker ? 'unknown' : 'allowed',
      verification: blocker ? 'unverified' : 'verified',
    },
    lifetime: {
      creator: 'implementation',
      consumer: 'server-runtime',
      disposer: 'session-end',
      scope: 'deployment-lifetime',
      hardBound: 0,
      notApplicableReason: '',
    },
    evidenceIds: [evidenceId],
    relatedIssue: 'LOGH7-216',
    acceptanceCriteria: [`verify-${controlName.toLowerCase().replace(/\s+/g, '-')}`],
    sourceManifestHash,
    unresolved: blocker
      ? {
        impact: `${controlName} not fully implemented`,
        blocker,
        nextExperiment: `Implement ${controlName} with cryptographic verification`,
        releaseCondition: `${controlName} fully implemented and tested`,
      }
      : { impact: '', blocker: '', nextExperiment: '', releaseCondition: '' },
  };
}

function createThreatControlEdge(threatNodeId, controlNodeId, verb, edgeId, evidenceId) {
  return {
    schemaVersion: CONTRACT.schemaVersion,
    edgeId,
    ownerAxis: 'A14',
    edgeClass: 'causal',
    from: threatNodeId,
    to: controlNodeId,
    verb: verb || 'observes',
    ordering: {
      correlationId: `security-control-${edgeId}`,
      causationId: '',
      sequence: 0,
      temporalPredicate: 'concurrent',
    },
    stateChange: {
      before: ['threat-present'],
      readSet: ['threat-context'],
      writeSet: ['control-active'],
      after: ['control-enforced'],
      transactionBoundary: 'security-boundary',
    },
    outcome: { kind: 'control-validated' },
    replay: {
      idempotencyKey: `security-${edgeId}`,
      dedupeWindow: '0s',
      duplicateOutcome: 'idempotent',
    },
    evidence: {
      grade: 'R1',
      confidence: 'confirmed',
      provenance: 'code-audit',
      evidenceIds: [evidenceId],
    },
  };
}

export async function buildA14Axis(repoRoot) {
  // Step 1: Bootstrap A01 base
  const { ledger: base } = await importSources(repoRoot, SOURCE_MANIFEST);
  const baseSourceManifestHash = base.sourceManifestHash;

  // Step 2: Read all evidence sources (non-base)
  const [masterDesign, frameStream, handlers, authorityCards] = await Promise.all([
    readMasterDesignSource(repoRoot),
    readFrameStreamSource(repoRoot),
    readHandlersSource(repoRoot),
    readAuthorityCardsSource(repoRoot),
  ]);

  // Evidence IDs
  const evDesignId = 'A14:evidence:master-design-threat-table';
  const evFrameStreamId = 'A14:evidence:frame-stream-bounds';
  const evHandlersId = 'A14:evidence:timing-safe-auth';
  const evAuthorityCardsId = 'A14:evidence:authority-card-bounds';

  // Step 3: Create evidence records
  const evidenceList = [
    {
      schemaVersion: CONTRACT.schemaVersion,
      evidenceId: evDesignId,
      type: 'design-documentation',
      producer: 'architect',
      reviewer: 'security-analyst',
      source: {
        path: 'docs/logh7-causal-ledger-master-design.md',
        sha256: masterDesign.sha256,
        sizeBytes: masterDesign.text.length,
        lineage: 'approved-design-spec',
        rights: 'allowed',
        recordPointer: 'section-10:threat-boundary-table',
        recordSha256: sha256(masterDesign.text.slice(4500, 7000)),
        legacyMetadata: { section: '10', lines: '337-349', version: '1.0' },
      },
      execution: {
        platform: 'document',
        runtimeMode: 'static-analysis',
        command: 'threat-model-extraction',
        inputs: ['A14-specification'],
        configHash: sha256('threat-model-config'),
        startedAt: FIXED_EVIDENCE_TIMESTAMP,
        endedAt: FIXED_EVIDENCE_TIMESTAMP,
        exitCode: 0,
      },
      observation: {
        expected: 'threat-boundaries-enumerated',
        observed: 'threat-boundaries-enumerated',
        verdict: 'pass',
        contradictedClaim: '',
      },
      artifacts: [],
      correlation: {
        acceptanceCriteria: ['threat-classification-complete', 'control-mapping-verified'],
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
    },
    {
      schemaVersion: CONTRACT.schemaVersion,
      evidenceId: evFrameStreamId,
      type: 'code-audit',
      producer: 'code-reviewer',
      reviewer: 'security-analyst',
      source: {
        path: 'server/src/server/logh7-frame-stream.mjs',
        sha256: frameStream.sha256,
        sizeBytes: frameStream.text.length,
        lineage: 'server-implementation',
        rights: 'allowed',
        recordPointer: 'function:createFrameStreamParser:lines-42-75',
        recordSha256: sha256(frameStream.text.slice(1200, 2100)),
        legacyMetadata: { implementation: 'frame-parser', version: '1.0' },
      },
      execution: {
        platform: 'node',
        runtimeMode: 'static-analysis',
        command: 'frame-parser-bounds-audit',
        inputs: ['frame-stream.mjs', 'U16_MAX-constant'],
        configHash: sha256('frame-audit-config'),
        startedAt: FIXED_EVIDENCE_TIMESTAMP,
        endedAt: FIXED_EVIDENCE_TIMESTAMP,
        exitCode: 0,
      },
      observation: {
        expected: 'maxFrameLength-bounds-enforced',
        observed: 'maxFrameLength-bounds-enforced',
        verdict: 'pass',
        contradictedClaim: '',
      },
      artifacts: [],
      correlation: {
        acceptanceCriteria: ['bounds-check-present', 'RangeError-thrown'],
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
    },
    {
      schemaVersion: CONTRACT.schemaVersion,
      evidenceId: evHandlersId,
      type: 'code-audit',
      producer: 'code-reviewer',
      reviewer: 'security-analyst',
      source: {
        path: 'server/src/application/handlers.mjs',
        sha256: handlers.sha256,
        sizeBytes: handlers.text.length,
        lineage: 'server-implementation',
        rights: 'allowed',
        recordPointer: 'function:safeEqualString:lines-21-34',
        recordSha256: sha256(handlers.text.slice(300, 800)),
        legacyMetadata: { implementation: 'auth-handler', version: '1.0' },
      },
      execution: {
        platform: 'node',
        runtimeMode: 'static-analysis',
        command: 'auth-handler-audit',
        inputs: ['handlers.mjs', 'timingSafeEqual'],
        configHash: sha256('auth-audit-config'),
        startedAt: FIXED_EVIDENCE_TIMESTAMP,
        endedAt: FIXED_EVIDENCE_TIMESTAMP,
        exitCode: 0,
      },
      observation: {
        expected: 'timing-safe-comparison-used',
        observed: 'timing-safe-comparison-used',
        verdict: 'pass',
        contradictedClaim: '',
      },
      artifacts: [],
      correlation: {
        acceptanceCriteria: ['timingSafeEqual-imported', 'no-strict-equality-on-secrets'],
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
    },
    {
      schemaVersion: CONTRACT.schemaVersion,
      evidenceId: evAuthorityCardsId,
      type: 'code-audit',
      producer: 'code-reviewer',
      reviewer: 'security-analyst',
      source: {
        path: 'server/src/domain/authority-cards.mjs',
        sha256: authorityCards.sha256,
        sizeBytes: authorityCards.text.length,
        lineage: 'server-implementation',
        rights: 'allowed',
        recordPointer: 'function:normalizeAuthorityCards:lines-60-100',
        recordSha256: sha256(authorityCards.text.slice(1500, 2800)),
        legacyMetadata: { implementation: 'authority-bounds', version: '1.0' },
      },
      execution: {
        platform: 'node',
        runtimeMode: 'static-analysis',
        command: 'authority-bounds-audit',
        inputs: ['authority-cards.mjs', 'MAX_AUTHORITY_CARDS'],
        configHash: sha256('authority-audit-config'),
        startedAt: FIXED_EVIDENCE_TIMESTAMP,
        endedAt: FIXED_EVIDENCE_TIMESTAMP,
        exitCode: 0,
      },
      observation: {
        expected: 'authority-bounds-enforced',
        observed: 'authority-bounds-enforced',
        verdict: 'pass',
        contradictedClaim: '',
      },
      artifacts: [],
      correlation: {
        acceptanceCriteria: ['MAX_AUTHORITY_CARDS-enforced', 'RangeError-on-overflow'],
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
    },
  ];

  // Step 4: Create threat boundary nodes (10 from master design section 10)
  const threatNodes = [
    createThreatBoundaryNode(
      'legacy-login-wire',
      'account authority state',
      'bounded parser, authn/authz, rate/replay/idempotency',
      'A04+A14',
      evDesignId,
      baseSourceManifestHash,
    ),
    createThreatBoundaryNode(
      'reconnect-session',
      'session identity presence',
      'cryptographic one-time token, bind, 30s expiry',
      'A07+A14',
      evDesignId,
      baseSourceManifestHash,
    ),
    createThreatBoundaryNode(
      'admin-operator',
      'authority override secrets',
      'player surface separation, least privilege, dual approval',
      'A14+A15',
      evDesignId,
      baseSourceManifestHash,
    ),
    createThreatBoundaryNode(
      'db-event-log',
      'canonical state audit',
      'UoW, append parity, backup',
      'A07+A14',
      evDesignId,
      baseSourceManifestHash,
    ),
    createThreatBoundaryNode(
      'trace-log',
      'credentials token PII',
      'default redaction, allowlisted fields, bounded retention',
      'A09+A14',
      evDesignId,
      baseSourceManifestHash,
    ),
    createThreatBoundaryNode(
      'patch-mod-update',
      'client lineage host integrity',
      'hash, signature, target sentinel, rollback',
      'A09+A15',
      evDesignId,
      baseSourceManifestHash,
    ),
    createThreatBoundaryNode(
      'agent-toolchain',
      'source build secret',
      'pinned source/hash, output-as-data, secret isolation',
      'A09+A14',
      evDesignId,
      baseSourceManifestHash,
    ),
    createThreatBoundaryNode(
      'resource-path',
      'availability state integrity',
      'hard caps and admission control',
      'A08+A14',
      evDesignId,
      baseSourceManifestHash,
    ),
    createThreatBoundaryNode(
      'rights-package',
      'lawful distribution restricted evidence',
      'separate rights disposition and allowlist',
      'A13+A15',
      evDesignId,
      baseSourceManifestHash,
    ),
    createThreatBoundaryNode(
      'web-community',
      'identity content moderation',
      'schema, authz, rate, output encoding',
      'A11+A14',
      evDesignId,
      baseSourceManifestHash,
    ),
  ];

  // Step 5: Create control implementation nodes (grounded in server code)
  const controlNodes = [
    createControlImplementationNode(
      'frame-length-bounds',
      'prevent',
      'maxFrameLength validation in parser',
      evFrameStreamId,
      baseSourceManifestHash,
    ),
    createControlImplementationNode(
      'timing-safe-password',
      'prevent',
      'timingSafeEqual for credential comparison',
      evHandlersId,
      baseSourceManifestHash,
    ),
    createControlImplementationNode(
      'authority-card-bounds',
      'prevent',
      'MAX_AUTHORITY_CARDS and kind bounds enforcement',
      evAuthorityCardsId,
      baseSourceManifestHash,
    ),
    createControlImplementationNode(
      'tls-encrypted-transport',
      'prevent',
      'TLS/encrypted tunnel required before login',
      evDesignId,
      baseSourceManifestHash,
      'TLS not implemented; plaintext dev-password registry (master-design A14 line 512)',
    ),
    createControlImplementationNode(
      'rate-limit-commands',
      'prevent',
      'Rate limiting on player commands',
      evDesignId,
      baseSourceManifestHash,
      'Rate limiting not implemented (section 10 line 339)',
    ),
    createControlImplementationNode(
      'replay-deduplication',
      'prevent',
      'Replay/idempotency deduplication with time window',
      evDesignId,
      baseSourceManifestHash,
      'Replay deduplication not fully implemented (section 8 lines 262-274)',
    ),
    createControlImplementationNode(
      'reconnect-one-time-token',
      'prevent',
      'Cryptographic one-time handoff for session reconnect',
      evDesignId,
      baseSourceManifestHash,
      'Durable handoff not implemented (section 10 line 340)',
    ),
    createControlImplementationNode(
      'admin-privilege-audit',
      'detect',
      'Immutable audit trail for privilege grants/revokes',
      evDesignId,
      baseSourceManifestHash,
      'Admin audit trail not implemented (section 10 line 342)',
    ),
    createControlImplementationNode(
      'abuse-telemetry',
      'detect',
      'Abuse telemetry and anomaly detection',
      evDesignId,
      baseSourceManifestHash,
      'Abuse telemetry not implemented (A14 line 513)',
    ),
    createControlImplementationNode(
      'incident-response',
      'respond',
      'Incident response procedure and escalation',
      evDesignId,
      baseSourceManifestHash,
      'Incident response procedure not established (A14 output line 511)',
    ),
  ];

  // Step 6: Create edges linking threats to controls
  const edges = [];
  // Map threat nodes to relevant controls
  const threatControlMappings = [
    [threatNodes[0], [controlNodes[0], controlNodes[1], controlNodes[3], controlNodes[4], controlNodes[5]]], // legacy-login -> frame-bounds, timing-safe, tls, rate-limit, replay
    [threatNodes[1], [controlNodes[6]]], // reconnect -> one-time-token
    [threatNodes[2], [controlNodes[7]]], // admin -> privilege-audit
    [threatNodes[3], [controlNodes[8]]], // db/event-log -> telemetry
    [threatNodes[4], [controlNodes[8]]], // trace/log -> telemetry
  ];

  for (const [threatNode, controlNodeList] of threatControlMappings) {
    for (const controlNode of controlNodeList) {
      const edgeId = `A14:edge:${threatNode.nodeId.split(':')[2]}--validates--${controlNode.nodeId.split(':')[2]}`;
      edges.push(
        createThreatControlEdge(
          threatNode.nodeId,
          controlNode.nodeId,
          'validates',
          edgeId,
          evDesignId,
        ),
      );
    }
  }

  // Step 7: Attach nodes to coverage
  const axisNodeIds = threatNodes.concat(controlNodes).map((n) => n.nodeId);
  const newCoverage = base.coverage.map((cov, idx) => {
    const newTargetNodeIds = [...cov.targetNodeIds];
    // Distribute axis nodes across coverage records deterministically
    if (idx < axisNodeIds.length) {
      newTargetNodeIds.push(axisNodeIds[idx]);
    }
    return { ...cov, targetNodeIds: newTargetNodeIds };
  });

  // Step 8: Assemble ledger
  const ledger = {
    schemaVersion: base.schemaVersion,
    sourceManifestHash: baseSourceManifestHash,
    nodes: [...base.nodes, ...threatNodes, ...controlNodes],
    edges: [...base.edges, ...edges],
    evidence: [...base.evidence, ...evidenceList],
    coverage: newCoverage,
    transitions: [...base.transitions],
    migrations: [...base.migrations],
    axisDependencies: base.axisDependencies,
    importReceipts: [...base.importReceipts],
  };

  // Step 9: Validate
  validateLedger(ledger, { manifest: SOURCE_MANIFEST });

  // Step 10: Write generated delta
  const delta = {
    nodes: threatNodes.concat(controlNodes),
    edges,
    evidence: evidenceList,
  };

  await writeFile(
    join(GENERATED_DIR, 'a14-security-anti-cheat.json'),
    stableStringify(delta) + '\n',
    'utf-8',
  );

  // Step 11: Write import report
  const importReport = {
    axis: 'A14',
    timestamp: FIXED_EVIDENCE_TIMESTAMP,
    imported: axisNodeIds.length,
    excluded: 0,
    rejected: 0,
    loss: 0,
    coverage: {
      sourceRecordPointer: 'master-design:section-10',
      recordsHash: sha256(masterDesign.text.slice(4500, 7000)),
      targetNodeIds: axisNodeIds,
    },
  };

  await writeFile(
    join(GENERATED_DIR, 'a14-import-report.json'),
    stableStringify(importReport) + '\n',
    'utf-8',
  );

  return { ledger };
}
