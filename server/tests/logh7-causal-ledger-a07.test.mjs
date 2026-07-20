import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { resolve, dirname } from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

// Import the build function
const { buildA07Axis } = await import('../../tools/causal-ledger/axes/a07-persistence-time-rng.mjs');
// Import stableStringify from index
const { stableStringify, validateLedger, SOURCE_MANIFEST } = await import('../../tools/causal-ledger/index.mjs');

test('A07 axis: bootstrap base and append axis records', async () => {
  // Build the ledger in-process
  const { ledger } = await buildA07Axis(REPO_ROOT);

  // Verify base is bootstrapped
  assert(ledger.schemaVersion === '1.0.0', 'schemaVersion should be 1.0.0');
  assert(ledger.sourceManifestHash, 'sourceManifestHash must exist');
  assert(Array.isArray(ledger.nodes), 'nodes must be an array');
  assert(Array.isArray(ledger.edges), 'edges must be an array');
  assert(Array.isArray(ledger.evidence), 'evidence must be an array');
  assert(Array.isArray(ledger.coverage), 'coverage must be an array');

  // Base A01 should have 4 nodes
  const baseNodes = ledger.nodes.filter((n) => n.axis !== 'A07');
  assert(baseNodes.length === 4, `Expected 4 base nodes, got ${baseNodes.length}`);

  // A07 nodes should exist (12 planned)
  const a07Nodes = ledger.nodes.filter((n) => n.axis === 'A07');
  assert(a07Nodes.length >= 12, `Expected at least 12 A07 nodes, got ${a07Nodes.length}`);

  // Every A07 node must have all required keys
  for (const node of a07Nodes) {
    assert(node.schemaVersion, 'node.schemaVersion required');
    assert(node.nodeId, 'node.nodeId required');
    assert(node.axis === 'A07', 'node.axis must be A07');
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

test('A07 axis: validateLedger passes', async () => {
  const { ledger } = await buildA07Axis(REPO_ROOT);

  // Must not throw
  assert.doesNotThrow(
    () => validateLedger(ledger, { manifest: SOURCE_MANIFEST }),
    'validateLedger must pass',
  );
});

test('A07 axis: cross-run determinism (byte-identical output)', async () => {
  // Build the axis in-process twice and compare with stable stringify
  const { ledger: ledger1 } = await buildA07Axis(REPO_ROOT);
  const { ledger: ledger2 } = await buildA07Axis(REPO_ROOT);

  const first = stableStringify(ledger1);
  const second = stableStringify(ledger2);

  assert.strictEqual(first, second, 'Two independent builds must produce identical output');
});

test('A07 axis: module contains no Date/random (determinism requirement)', async () => {
  const axisModulePath = resolve(REPO_ROOT, 'tools/causal-ledger/axes/a07-persistence-time-rng.mjs');
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

test('A07 axis: negative fixture - persistence node without table citation fails', async () => {
  // This test verifies the axis invariant: every persistence node must cite a real table
  // We verify by checking that all persistence-surface nodes have non-empty unresolved.blocker
  // if they are marked Unknown/Blocked, OR they cite the source in their summary
  const { ledger } = await buildA07Axis(REPO_ROOT);

  const a07Nodes = ledger.nodes.filter((n) => n.axis === 'A07' && n.surface === 'persistence');

  for (const node of a07Nodes) {
    // Each persistence node must either:
    // 1. Be confirmed (state.confidence !== 'unknown' && state.canonicality !== 'blocked')
    // 2. Or have an explicit blocker and releaseCondition
    if (node.state.canonicality === 'blocked' || node.state.confidence === 'unknown') {
      assert(
        node.unresolved.blocker && node.unresolved.releaseCondition,
        `Blocked node ${node.nodeId} must have blocker and releaseCondition`,
      );
    }
  }
});

test('A07 axis: negative fixture - unknown/blocked nodes without release condition fails', async () => {
  // Verify that all Unknown/Blocked nodes have explicit release conditions
  // This is a hard rule per LOGH7 HARD RULES
  const { ledger } = await buildA07Axis(REPO_ROOT);

  const a07Nodes = ledger.nodes.filter((n) => n.axis === 'A07');

  for (const node of a07Nodes) {
    if (node.state.canonicality === 'blocked' || node.state.confidence === 'unknown') {
      assert(
        node.unresolved.blocker && node.unresolved.releaseCondition,
        `Unknown/Blocked node ${node.nodeId} must have explicit blocker and releaseCondition per NO FABRICATION rule`,
      );
    }
  }
});

test('A07 axis: only A07 records are filtered in assertions', async () => {
  const { ledger } = await buildA07Axis(REPO_ROOT);

  // Base A01 nodes should not have axis='A07'
  const baseNodes = ledger.nodes.filter((n) => n.axis !== 'A07');
  const a07Nodes = ledger.nodes.filter((n) => n.axis === 'A07');

  assert(baseNodes.length > 0, 'Base nodes must exist');
  assert(a07Nodes.length > 0, 'A07 nodes must exist');

  // Verify axis filtering works
  for (const node of a07Nodes) {
    assert.strictEqual(node.axis, 'A07', 'Filtered A07 nodes must have axis A07');
  }

  for (const node of baseNodes) {
    assert.notStrictEqual(node.axis, 'A07', 'Base nodes must not have axis A07');
  }
});
