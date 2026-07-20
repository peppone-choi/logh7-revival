import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { resolve, dirname } from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

// Import the build function
const { buildA15Axis } = await import('../../tools/causal-ledger/axes/a15-packaging-lifecycle.mjs');
// Import stableStringify from index
const { stableStringify, SchemaError } = await import('../../tools/causal-ledger/index.mjs');

test('A15 axis: bootstrap base and append axis records', async () => {
  // Build the ledger in-process
  const { ledger } = await buildA15Axis(REPO_ROOT);

  // Verify base is bootstrapped
  assert(ledger.schemaVersion === '1.0.0', 'schemaVersion should be 1.0.0');
  assert(ledger.sourceManifestHash, 'sourceManifestHash must exist');
  assert(Array.isArray(ledger.nodes), 'nodes must be an array');
  assert(Array.isArray(ledger.edges), 'edges must be an array');
  assert(Array.isArray(ledger.evidence), 'evidence must be an array');
  assert(Array.isArray(ledger.coverage), 'coverage must be an array');

  // Base A01 should have 4 nodes
  const baseNodes = ledger.nodes.filter((n) => n.axis !== 'A15');
  assert(baseNodes.length === 4, `Expected 4 base nodes, got ${baseNodes.length}`);

  // A15 nodes should exist (package, docker, lineage, patches, config, unknowns)
  const a15Nodes = ledger.nodes.filter((n) => n.axis === 'A15');
  assert(a15Nodes.length > 0, 'A15 nodes must be present');
  assert(a15Nodes.length >= 15, `Expected at least 15 A15 nodes, got ${a15Nodes.length}`);

  // Every A15 node must have all required keys
  for (const node of a15Nodes) {
    assert(node.schemaVersion, 'node.schemaVersion required');
    assert(node.nodeId, 'node.nodeId required');
    assert(node.axis === 'A15', 'node.axis must be A15');
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

  // Verify Unknown/Blocked nodes exist (per spec)
  const unblockedNodeIds = [
    'A15:node:install-receipt',
    'A15:node:update-receipt',
    'A15:node:rollback-receipt',
    'A15:node:restore-receipt',
    'A15:node:sbom-inventory',
    'A15:node:signed-manifest-upstream',
    'A15:node:config-schema-migration',
    'A15:node:compatibility-matrix',
    'A15:node:key-rotation-policy',
  ];

  for (const expectedId of unblockedNodeIds) {
    const found = a15Nodes.find((n) => n.nodeId === expectedId);
    assert(found, `Expected node ${expectedId} to exist`);
    assert(found.state.canonicality === 'blocked', `${expectedId} must have canonicality='blocked'`);
    assert(found.unresolved.blocker, `${expectedId} must have unresolved.blocker set`);
  }
});

test('A15 axis: validateLedger passes', async () => {
  const { validateLedger, SOURCE_MANIFEST } = await import('../../tools/causal-ledger/index.mjs');

  const { ledger } = await buildA15Axis(REPO_ROOT);

  // Must not throw
  assert.doesNotThrow(
    () => validateLedger(ledger, { manifest: SOURCE_MANIFEST }),
    'validateLedger must pass',
  );
});

test('A15 axis: cross-run determinism (byte-identical output)', async () => {
  // Build the axis in-process twice and compare with stable stringify
  const { ledger: ledger1 } = await buildA15Axis(REPO_ROOT);
  const { ledger: ledger2 } = await buildA15Axis(REPO_ROOT);

  const first = stableStringify(ledger1);
  const second = stableStringify(ledger2);

  assert.strictEqual(first, second, 'Two independent builds must produce identical output');
});

test('A15 axis: module contains no Date/random (determinism requirement)', async () => {
  const axisModulePath = resolve(REPO_ROOT, 'tools/causal-ledger/axes/a15-packaging-lifecycle.mjs');
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

test('A15 axis: negative fixture - server-package with no evidenceIds fails', async () => {
  const { validateLedger, SOURCE_MANIFEST, SchemaError } = await import('../../tools/causal-ledger/index.mjs');

  const { ledger: baseLedger } = await buildA15Axis(REPO_ROOT);

  // Create a deliberately malformed ledger with server-package node missing evidenceIds
  const malformedNode = {
    schemaVersion: '1.0.0',
    nodeId: 'A15:test:bad-package',
    axis: 'A15',
    type: 'package-manifest',
    domain: 'packaging',
    owner: 'A15',
    summary: 'Malformed server package node',
    preconditions: [],
    postconditions: [],
    failureConditions: [],
    surface: 'package',
    direction: 'none',
    state: {
      grade: 'O0',
      confidence: 'confirmed',
      canonicality: 'noncanonical',
      rights: 'unknown',
      verification: 'unverified',
    },
    lifetime: {
      creator: 'system',
      consumer: 'installer',
      disposer: 'installer',
      scope: 'install lifetime',
      hardBound: 0,
      notApplicableReason: '',
    },
    evidenceIds: [], // INVALID: must have evidence
    relatedIssue: 'A15-test',
    acceptanceCriteria: [],
    sourceManifestHash: baseLedger.sourceManifestHash,
    unresolved: { impact: '', blocker: '', nextExperiment: '', releaseCondition: '' },
  };

  const malformedLedger = {
    ...baseLedger,
    nodes: [...baseLedger.nodes, malformedNode],
  };

  assert.throws(
    () => validateLedger(malformedLedger, { manifest: SOURCE_MANIFEST }),
    'validateLedger must reject node with empty evidenceIds',
  );
});

test('A15 axis: negative fixture - dangling lineage stage fails', async () => {
  const { validateLedger, SOURCE_MANIFEST } = await import('../../tools/causal-ledger/index.mjs');

  const { ledger: baseLedger } = await buildA15Axis(REPO_ROOT);

  // Create a dangling edge that references a non-existent lineage stage
  const danglingEdge = {
    schemaVersion: '1.0.0',
    edgeId: 'A15:edge:lineage--causal--orphan',
    ownerAxis: 'A15',
    edgeClass: 'causal',
    from: 'A15:node:lineage-stage-9c97',
    to: 'A15:node:lineage-stage-nonexistent', // Does not exist
    verb: 'stages',
    ordering: {
      correlationId: 'lineage-001',
      causationId: 'lineage-cause-001',
      sequence: 1,
      temporalPredicate: 'before',
    },
    stateChange: {
      before: ['lineage:9c97'],
      readSet: [],
      writeSet: ['lineage:unknown'],
      after: ['lineage:unknown'],
      transactionBoundary: 'stage-transition',
    },
    outcome: { kind: 'dangling-target' },
    replay: {
      idempotencyKey: 'lineage-001',
      dedupeWindow: '0s',
      duplicateOutcome: 'error',
    },
    evidence: {
      grade: 'O0',
      confidence: 'confirmed',
      provenance: 'test',
      evidenceIds: [],
    },
  };

  const malformedLedger = {
    ...baseLedger,
    edges: [...baseLedger.edges, danglingEdge],
  };

  assert.throws(
    () => validateLedger(malformedLedger, { manifest: SOURCE_MANIFEST }),
    'validateLedger must reject edge with dangling target node',
  );
});
