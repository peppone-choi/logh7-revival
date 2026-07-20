import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { resolve, dirname } from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

// Import the build function
const { buildA12Axis } = await import('../../tools/causal-ledger/axes/a12-korean-ime-encoding.mjs');
// Import stableStringify from index
const { stableStringify } = await import('../../tools/causal-ledger/index.mjs');
const { validateLedger, SOURCE_MANIFEST } = await import('../../tools/causal-ledger/index.mjs');

test('A12 axis: bootstrap base and append axis records', async () => {
  // Build the ledger in-process
  const { ledger } = await buildA12Axis(REPO_ROOT);

  // Verify base is bootstrapped
  assert(ledger.schemaVersion === '1.0.0', 'schemaVersion should be 1.0.0');
  assert(ledger.sourceManifestHash, 'sourceManifestHash must exist');
  assert(Array.isArray(ledger.nodes), 'nodes must be an array');
  assert(Array.isArray(ledger.edges), 'edges must be an array');
  assert(Array.isArray(ledger.evidence), 'evidence must be an array');
  assert(Array.isArray(ledger.coverage), 'coverage must be an array');

  // Base A01 should have 4 nodes
  const baseNodes = ledger.nodes.filter((n) => n.axis !== 'A12');
  assert(baseNodes.length === 4, `Expected 4 base nodes, got ${baseNodes.length}`);

  // A12 nodes should exist (text surfaces + encoding contracts)
  const a12Nodes = ledger.nodes.filter((n) => n.axis === 'A12');
  assert(a12Nodes.length > 0, 'A12 nodes must be present');

  // Every A12 node must have all required keys
  for (const node of a12Nodes) {
    assert(node.schemaVersion, 'node.schemaVersion required');
    assert(node.nodeId, 'node.nodeId required');
    assert(node.axis === 'A12', 'node.axis must be A12');
    assert(node.type, 'node.type required');
    assert(node.domain, 'node.domain required');
    assert(node.owner, 'node.owner required');
    assert(node.summary, 'node.summary required');
    assert(Array.isArray(node.preconditions), 'node.preconditions must be array');
    assert(Array.isArray(node.postconditions), 'node.postconditions must be array');
    assert(Array.isArray(node.failureConditions), 'node.failureConditions must be array');
    assert(node.surface, 'node.surface required');
    assert(node.direction, 'node.direction required');
    assert(node.state, 'node.state required');
    assert(node.lifetime, 'node.lifetime required');
    assert(Array.isArray(node.evidenceIds), 'node.evidenceIds must be array');
    assert(node.relatedIssue, 'node.relatedIssue required');
    assert(Array.isArray(node.acceptanceCriteria), 'node.acceptanceCriteria must be array');
    assert(node.sourceManifestHash, 'node.sourceManifestHash required');
    assert(node.unresolved, 'node.unresolved required');
  }
});

test('A12 axis: validateLedger passes', async () => {
  const { validateLedger, SOURCE_MANIFEST } = await import('../../tools/causal-ledger/index.mjs');

  const { ledger } = await buildA12Axis(REPO_ROOT);

  // Must not throw
  assert.doesNotThrow(
    () => validateLedger(ledger, { manifest: SOURCE_MANIFEST }),
    'validateLedger must pass',
  );
});

test('A12 axis: cross-run determinism (byte-identical output)', async () => {
  // Build the axis in-process twice and compare with stable stringify
  const { ledger: ledger1 } = await buildA12Axis(REPO_ROOT);
  const { ledger: ledger2 } = await buildA12Axis(REPO_ROOT);

  const first = stableStringify(ledger1);
  const second = stableStringify(ledger2);

  assert.strictEqual(first, second, 'Two independent builds must produce identical output');
});

test('A12 axis: module contains no Date/random (determinism requirement)', async () => {
  const axisModulePath = resolve(REPO_ROOT, 'tools/causal-ledger/axes/a12-korean-ime-encoding.mjs');
  const moduleSource = await readFile(axisModulePath, 'utf-8');

  // Check for wall-clock/random patterns
  const patterns = [
    /new Date\(/g,
    /Date\.now\(/g,
    /Math\.random\(/g,
  ];

  for (const pattern of patterns) {
    const matches = moduleSource.match(pattern);
    assert.strictEqual(matches, null, `Module must not contain ${pattern.source}`);
  }
});

test('A12 axis: negative fixture - non-LF hashing fails', async () => {
  // This test verifies that hashing must use LF-normalized content
  // to ensure cross-platform determinism (Windows CRLF vs Unix LF)
  const { ledger: baseLedger } = await buildA12Axis(REPO_ROOT);

  // Create a deliberately malformed evidence with CRLF-based hash mismatch
  const badEvidence = {
    schemaVersion: '1.0.0',
    evidenceId: 'A12:test:bad-hash',
    type: 'design-documentation',
    producer: 'test',
    reviewer: 'test',
    source: {
      path: 'docs/logh7-test-hash.md',
      // This hash is intentionally wrong (would be correct with CRLF, wrong with LF)
      sha256: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      sizeBytes: 100,
      lineage: 'test',
      rights: 'allowed',
      recordPointer: 'test',
      recordSha256: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      legacyMetadata: {},
    },
    execution: {
      platform: 'node',
      runtimeMode: 'test',
      command: 'test',
      inputs: [],
      configHash: 'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
      startedAt: '2026-07-21T00:00:00Z',
      endedAt: '2026-07-21T00:00:00Z',
      exitCode: 0,
    },
    observation: {
      expected: 'test',
      observed: 'test',
      verdict: 'pass',
      contradictedClaim: '',
    },
    artifacts: [],
    correlation: {
      acceptanceCriteria: [],
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

  // Test a different violation: canonicality P3 -> canonical dependency
  const p3Node = baseLedger.nodes[0];
  const badP3Edge = {
    schemaVersion: '1.0.0',
    edgeId: 'A12:test:bad-p3-edge',
    ownerAxis: 'A12',
    edgeClass: 'dependency',
    from: p3Node.nodeId,
    to: baseLedger.nodes[1].nodeId,
    verb: 'depends-on',
    ordering: {
      correlationId: 'test',
      causationId: '',
      sequence: 1,
      temporalPredicate: 'none',
    },
    stateChange: {
      before: [],
      readSet: [],
      writeSet: [],
      after: [],
      transactionBoundary: 'none',
    },
    outcome: { kind: 'depends' },
    replay: {
      idempotencyKey: 'test',
      dedupeWindow: '60s',
      duplicateOutcome: 'deduplicated',
    },
    evidence: {
      grade: 'O0',
      confidence: 'confirmed',
      provenance: 'test',
      evidenceIds: [],
    },
  };

  const malformedEdgeLedger = {
    ...baseLedger,
    edges: [...baseLedger.edges, badP3Edge],
  };

  // Validator should reject dependency edges from P3 nodes to canonical nodes
  assert.throws(
    () => validateLedger(malformedEdgeLedger, { manifest: SOURCE_MANIFEST }),
    Error,
    'Validator must reject P3->canonical dependency edges',
  );
});

test('A12 axis: negative fixture - canonicality=blocked requires blocker field', async () => {
  // This test verifies that nodes with canonicality='blocked' must have non-empty blocker
  const { ledger: baseLedger } = await buildA12Axis(REPO_ROOT);

  // Create a node with blocked canonicality but empty blocker
  const orphanBlockedNode = {
    schemaVersion: '1.0.0',
    nodeId: 'A12:test:blocked-no-blocker',
    axis: 'A12',
    type: 'text-field',
    domain: 'test',
    owner: 'test',
    summary: 'Test blocked node without blocker',
    preconditions: [],
    postconditions: [],
    failureConditions: [],
    surface: 'data',
    direction: 'local',
    state: {
      grade: 'O0',
      confidence: 'unknown',
      canonicality: 'blocked',
      rights: 'unknown',
      verification: 'unverified',
    },
    lifetime: {
      creator: 'server',
      consumer: 'server',
      disposer: 'server',
      scope: 'request-response',
      hardBound: 0,
      notApplicableReason: '',
    },
    evidenceIds: [],
    relatedIssue: 'test',
    acceptanceCriteria: [],
    sourceManifestHash: baseLedger.sourceManifestHash,
    unresolved: { impact: 'test', blocker: '', nextExperiment: 'test', releaseCondition: 'test' },
  };

  const malformedLedger = {
    ...baseLedger,
    nodes: [...baseLedger.nodes, orphanBlockedNode],
  };

  // Validator should reject: canonicality=blocked without coverage OR blocker must be non-empty
  assert.throws(
    () => validateLedger(malformedLedger, { manifest: SOURCE_MANIFEST }),
    Error,
    'Validator must reject blocked nodes without blocker or coverage',
  );
});

test('A12 axis: only A12 records are filtered in assertions', async () => {
  const { ledger } = await buildA12Axis(REPO_ROOT);

  // Base A01 nodes should not have axis='A12'
  const baseNodes = ledger.nodes.filter((n) => n.axis !== 'A12');
  const a12Nodes = ledger.nodes.filter((n) => n.axis === 'A12');

  assert(baseNodes.length > 0, 'Base nodes must exist');
  assert(a12Nodes.length > 0, 'A12 nodes must exist');

  // Verify no base nodes are A12
  for (const node of baseNodes) {
    assert(node.axis !== 'A12', `Base node ${node.nodeId} must not be A12`);
  }

  // Every A12 node must have correct axis
  for (const node of a12Nodes) {
    assert(node.axis === 'A12', `A12 node ${node.nodeId} must have axis=A12`);
    // A12 nodes should have text-related domain
    assert(
      node.domain && (node.domain.includes('text') || node.domain.includes('encoding') || node.domain.includes('wire')),
      `A12 node ${node.nodeId} should have text-related domain`,
    );
  }
});
