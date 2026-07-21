import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

// Import the build function
const { buildA10Axis } = await import('../../tools/causal-ledger/axes/a10-verification-synthesis.mjs');
// Import stableStringify and validator from index
const { stableStringify, validateLedger, SOURCE_MANIFEST } = await import('../../tools/causal-ledger/index.mjs');

test('A10 axis: bootstrap base and append axis records', async () => {
  // Build the ledger in-process
  const { ledger } = await buildA10Axis(REPO_ROOT);

  // Verify base is bootstrapped
  assert(ledger.schemaVersion === '1.0.0', 'schemaVersion should be 1.0.0');
  assert(ledger.sourceManifestHash, 'sourceManifestHash must exist');
  assert(Array.isArray(ledger.nodes), 'nodes must be an array');
  assert(Array.isArray(ledger.edges), 'edges must be an array');
  assert(Array.isArray(ledger.evidence), 'evidence must be an array');
  assert(Array.isArray(ledger.coverage), 'coverage must be an array');

  // A10 matrix nodes should exist (15 per axis A01-A15)
  const a10MatrixNodes = ledger.nodes.filter((n) => n.axis === 'A10' && n.type === 'verification-matrix');
  assert(a10MatrixNodes.length === 15, `Expected 15 verification-matrix nodes, got ${a10MatrixNodes.length}`);

  // A10 synthesis nodes should exist (Unknown/Blocked gaps)
  const a10SynthesisNodes = ledger.nodes.filter((n) => n.axis === 'A10' && n.type === 'synthesis-blocker');
  assert(a10SynthesisNodes.length >= 4, `Expected at least 4 synthesis-blocker nodes, got ${a10SynthesisNodes.length}`);

  // Every A10 node must have required keys
  for (const node of [...a10MatrixNodes, ...a10SynthesisNodes]) {
    assert(node.schemaVersion, 'node.schemaVersion required');
    assert(node.nodeId, 'node.nodeId required');
    assert(node.axis === 'A10', 'node.axis must be A10');
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

  // No A10 node should be canonical
  for (const node of [...a10MatrixNodes, ...a10SynthesisNodes]) {
    assert(node.state.canonicality !== 'canonical', `A10 node ${node.nodeId} must not be canonical`);
  }

  // Synthesis nodes must have unresolved fields populated
  for (const node of a10SynthesisNodes) {
    assert(node.unresolved.impact, `A10 synthesis node ${node.nodeId} requires impact`);
    assert(node.unresolved.blocker, `A10 synthesis node ${node.nodeId} requires blocker`);
    assert(node.unresolved.nextExperiment, `A10 synthesis node ${node.nodeId} requires nextExperiment`);
    assert(node.unresolved.releaseCondition, `A10 synthesis node ${node.nodeId} requires releaseCondition`);
  }
});

test('A10 axis: validateLedger passes', async () => {
  const { ledger } = await buildA10Axis(REPO_ROOT);

  // Must not throw
  assert.doesNotThrow(
    () => validateLedger(ledger, { manifest: SOURCE_MANIFEST }),
    'validateLedger must pass',
  );
});

test('A10 axis: cross-run determinism (byte-identical output)', async () => {
  // Build the axis in-process twice and compare with stable stringify
  const { ledger: ledger1 } = await buildA10Axis(REPO_ROOT);
  const { ledger: ledger2 } = await buildA10Axis(REPO_ROOT);

  const first = stableStringify(ledger1);
  const second = stableStringify(ledger2);

  assert.strictEqual(first, second, 'Two independent builds must produce identical output');
});

test('A10 axis: negative fixture - fabricated matrix node FAILS', async () => {
  const { ledger: base } = await buildA10Axis(REPO_ROOT);

  // Create a fabricated matrix node without proper evidence citation
  const fabricatedNode = {
    schemaVersion: '1.0.0',
    nodeId: 'A10:matrix:fabricated-a99',
    axis: 'A10',
    type: 'verification-matrix',
    domain: 'synthesis',
    owner: 'A10 independent-verification',
    summary: 'Fabricated A99 verification — claimed PASS without evidence',
    preconditions: [],
    postconditions: [],
    failureConditions: [],
    surface: 'test',
    direction: 'none',
    state: {
      grade: 'R1',
      confidence: 'confirmed',
      canonicality: 'noncanonical',
      rights: 'unknown',
      verification: 'verified', // Fabricated claim without proper evidence
    },
    lifetime: {
      creator: 'test',
      consumer: 'test',
      disposer: 'test',
      scope: 'synthesis',
      hardBound: 0,
      notApplicableReason: '',
    },
    evidenceIds: [], // Empty evidence - this should fail
    relatedIssue: 'LOGH7-999',
    acceptanceCriteria: [],
    sourceManifestHash: base.sourceManifestHash,
    unresolved: { impact: '', blocker: '', nextExperiment: '', releaseCondition: '' },
  };

  const badLedger = {
    ...base,
    nodes: [...base.nodes, fabricatedNode],
  };

  // This should fail validation due to missing evidence or improper fabrication pattern
  assert.throws(
    () => validateLedger(badLedger, { manifest: SOURCE_MANIFEST }),
    'Fabricated node without proper evidence must fail validation',
  );
});

test('A10 axis: negative fixture - synthesis blocker without resolution path FAILS', async () => {
  const { ledger: base } = await buildA10Axis(REPO_ROOT);

  // Create a synthesis node that is missing required unresolved fields
  const incompleteNode = {
    schemaVersion: '1.0.0',
    nodeId: 'A10:blocker:incomplete-gap',
    axis: 'A10',
    type: 'synthesis-blocker',
    domain: 'synthesis',
    owner: 'A10 independent-verification',
    summary: 'Incomplete blocker without resolution path',
    preconditions: [],
    postconditions: [],
    failureConditions: [],
    surface: 'test',
    direction: 'none',
    state: {
      grade: 'R1',
      confidence: 'unknown',
      canonicality: 'blocked',
      rights: 'unknown',
      verification: 'unverified',
    },
    lifetime: {
      creator: 'test',
      consumer: 'test',
      disposer: 'test',
      scope: 'synthesis',
      hardBound: 0,
      notApplicableReason: '',
    },
    evidenceIds: [],
    relatedIssue: 'LOGH7-999',
    acceptanceCriteria: [],
    sourceManifestHash: base.sourceManifestHash,
    unresolved: {
      impact: '', // Missing impact
      blocker: 'some-blocker',
      nextExperiment: 'some-experiment',
      releaseCondition: 'some-condition',
    },
  };

  const badLedger = {
    ...base,
    nodes: [...base.nodes, incompleteNode],
  };

  // This should fail because the blocker node is incomplete
  // (missing impact and potentially failing invariant checks)
  // Note: This test validates that incomplete unresolved records are caught
  // The validator might pass if it only checks schema presence, but
  // the fabrication guard should reject empty unresolved fields
  assert.throws(
    () => validateLedger(badLedger, { manifest: SOURCE_MANIFEST }),
    'Synthesis blocker without complete unresolved path must fail validation',
  );
});
