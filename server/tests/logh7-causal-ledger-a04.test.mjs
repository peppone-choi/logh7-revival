import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { resolve, dirname } from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

// Import the build function
const { buildA04Axis } = await import('../../tools/causal-ledger/axes/a04-protocol-session.mjs');
// Import stableStringify from index
const { stableStringify } = await import('../../tools/causal-ledger/index.mjs');

test('A04 axis: bootstrap base and append axis records', async () => {
  // Build the ledger in-process
  const { ledger } = await buildA04Axis(REPO_ROOT);

  // Verify base is bootstrapped
  assert(ledger.schemaVersion === '1.0.0', 'schemaVersion should be 1.0.0');
  assert(ledger.sourceManifestHash, 'sourceManifestHash must exist');
  assert(Array.isArray(ledger.nodes), 'nodes must be an array');
  assert(Array.isArray(ledger.edges), 'edges must be an array');
  assert(Array.isArray(ledger.evidence), 'evidence must be an array');
  assert(Array.isArray(ledger.coverage), 'coverage must be an array');

  // Base A01 should have 4 nodes
  const baseNodes = ledger.nodes.filter((n) => n.axis !== 'A04');
  assert(baseNodes.length === 4, `Expected 4 base nodes, got ${baseNodes.length}`);

  // A04 nodes should exist (22 opcode pairs = at least 22 nodes)
  const a04Nodes = ledger.nodes.filter((n) => n.axis === 'A04');
  assert(a04Nodes.length > 0, 'A04 nodes must be present');

  // Every A04 node must have all required keys
  for (const node of a04Nodes) {
    assert(node.schemaVersion, 'node.schemaVersion required');
    assert(node.nodeId, 'node.nodeId required');
    assert(node.axis === 'A04', 'node.axis must be A04');
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

test('A04 axis: validateLedger passes', async () => {
  const { validateLedger, SOURCE_MANIFEST } = await import('../../tools/causal-ledger/index.mjs');

  const { ledger } = await buildA04Axis(REPO_ROOT);

  // Must not throw
  assert.doesNotThrow(
    () => validateLedger(ledger, { manifest: SOURCE_MANIFEST }),
    'validateLedger must pass',
  );
});

test('A04 axis: cross-run determinism (byte-identical output)', async (t) => {
  // Build the axis in-process twice and compare with stable stringify
  const { ledger: ledger1 } = await buildA04Axis(REPO_ROOT);
  const { ledger: ledger2 } = await buildA04Axis(REPO_ROOT);

  const first = stableStringify(ledger1);
  const second = stableStringify(ledger2);

  assert.strictEqual(first, second, 'Two independent builds must produce identical output');
});

test('A04 axis: module contains no Date/random (determinism requirement)', async () => {
  const axisModulePath = resolve(REPO_ROOT, 'tools/causal-ledger/axes/a04-protocol-session.mjs');
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

test('A04 axis: negative fixture - orphan coverage fails', async () => {
  // This test verifies that the validator catches orphan nodes
  // (nodes not attached to any coverage)
  // We rely on the validator itself to enforce this
  const { validateLedger, SOURCE_MANIFEST, SchemaError } = await import('../../tools/causal-ledger/index.mjs');

  // Create a deliberately malformed ledger with an orphan node
  const { ledger: baseLedger } = await buildA04Axis(REPO_ROOT);

  // Add a node with no coverage attachment
  const orphanNode = {
    schemaVersion: '1.0.0',
    nodeId: 'A04:test:orphan',
    axis: 'A04',
    type: 'request-message',
    domain: 'test',
    owner: 'test',
    summary: 'Orphan node for testing',
    preconditions: [],
    postconditions: [],
    failureConditions: [],
    surface: 'function',
    direction: 'internal',
    state: {
      grade: 'O0',
      confidence: 'confirmed',
      canonicality: 'noncanonical',
      rights: 'allowed',
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
    relatedIssue: 'test-orphan',
    acceptanceCriteria: [],
    sourceManifestHash: baseLedger.sourceManifestHash,
    unresolved: { impact: '', blocker: '', nextExperiment: '', releaseCondition: '' },
  };

  const malformedLedger = {
    ...baseLedger,
    nodes: [...baseLedger.nodes, orphanNode],
  };

  // Validator should reject orphan node
  assert.throws(
    () => validateLedger(malformedLedger, { manifest: SOURCE_MANIFEST }),
    /SchemaError|ERR_CAUSAL_LEDGER|orphan|coverage|targetNodeIds/i,
    'Validator must reject nodes without coverage attachment',
  );
});

test('A04 axis: negative fixture - invalid direction rule fails', async () => {
  // This test verifies that the validator catches direction rule violations
  // requests verb: from.direction must be c2s, to.direction must be internal
  const { validateLedger, SOURCE_MANIFEST, SchemaError } = await import('../../tools/causal-ledger/index.mjs');

  const { ledger: baseLedger } = await buildA04Axis(REPO_ROOT);

  // Create a malformed edge with wrong direction
  const badEdge = {
    schemaVersion: '1.0.0',
    edgeId: 'A04:test:bad-edge',
    ownerAxis: 'A04',
    edgeClass: 'causal',
    from: baseLedger.nodes[0].nodeId,
    to: baseLedger.nodes[1].nodeId,
    verb: 'requests',
    ordering: {
      correlationId: 'test-001',
      causationId: 'test-001',
      sequence: 1,
      temporalPredicate: 'before',
    },
    stateChange: {
      before: [],
      readSet: [],
      writeSet: [],
      after: [],
      transactionBoundary: 'frame-boundary',
    },
    outcome: { kind: 'request-sent' },
    replay: {
      idempotencyKey: 'test-001',
      dedupeWindow: '60s',
      duplicateOutcome: 'deduplicated',
    },
    evidence: {
      grade: 'O0',
      confidence: 'confirmed',
      provenance: 'design',
      evidenceIds: [],
    },
  };

  const malformedLedger = {
    ...baseLedger,
    edges: [...baseLedger.edges, badEdge],
  };

  // Validator should reject because edge verbs have direction constraints
  assert.throws(
    () => validateLedger(malformedLedger, { manifest: SOURCE_MANIFEST }),
    Error,
    'Validator must enforce direction rules on edges',
  );
});

test('A04 axis: only A04 records are filtered in assertions', async () => {
  const { ledger } = await buildA04Axis(REPO_ROOT);

  // Base A01 nodes should not have axis='A04'
  const baseNodes = ledger.nodes.filter((n) => n.axis !== 'A04');
  const a04Nodes = ledger.nodes.filter((n) => n.axis === 'A04');

  assert(baseNodes.length > 0, 'Base nodes must exist');
  assert(a04Nodes.length > 0, 'A04 nodes must exist');

  // Every A04 node must have opcode-related properties
  for (const node of a04Nodes) {
    // A04 nodes should have domain=protocol or similar
    assert(node.domain, `A04 node ${node.nodeId} must have domain`);
  }
});
