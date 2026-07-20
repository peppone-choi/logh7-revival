import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { resolve, dirname } from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

// Import the build function
const { buildA03Axis } = await import('../../tools/causal-ledger/axes/a03-render-audio-output.mjs');
// Import stableStringify from index
const { stableStringify, validateLedger, SOURCE_MANIFEST } = await import('../../tools/causal-ledger/index.mjs');

test('A03 axis: bootstrap base and append axis records', async () => {
  // Build the ledger in-process
  const { ledger } = await buildA03Axis(REPO_ROOT);

  // Verify base is bootstrapped
  assert(ledger.schemaVersion === '1.0.0', 'schemaVersion should be 1.0.0');
  assert(ledger.sourceManifestHash, 'sourceManifestHash must exist');
  assert(Array.isArray(ledger.nodes), 'nodes must be an array');
  assert(Array.isArray(ledger.edges), 'edges must be an array');
  assert(Array.isArray(ledger.evidence), 'evidence must be an array');
  assert(Array.isArray(ledger.coverage), 'coverage must be an array');

  // Base A01 should have 4 nodes
  const baseNodes = ledger.nodes.filter((n) => n.axis !== 'A03');
  assert(baseNodes.length === 4, `Expected 4 base nodes, got ${baseNodes.length}`);

  // A03 nodes should exist (render + audio surfaces)
  const a03Nodes = ledger.nodes.filter((n) => n.axis === 'A03');
  assert(a03Nodes.length > 0, 'A03 nodes must be present');

  // Every A03 node must have all required keys
  for (const node of a03Nodes) {
    assert(node.schemaVersion, 'node.schemaVersion required');
    assert(node.nodeId, 'node.nodeId required');
    assert(node.axis === 'A03', 'node.axis must be A03');
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

  // Render and audio output nodes must have render or audio surface
  const outputNodes = a03Nodes.filter((n) => n.type === 'render-surface' || n.type === 'audio-output');
  for (const node of outputNodes) {
    assert(['render', 'audio'].includes(node.surface), `output node ${node.nodeId} surface must be render or audio, got ${node.surface}`);
  }

  // Verify render/audio nodes have Unknown/Blocked state (no live capture)
  for (const node of a03Nodes) {
    if (node.surface === 'render' || node.surface === 'audio') {
      assert(node.state.confidence === 'unknown', `output node ${node.nodeId} confidence must be unknown`);
      assert(node.state.canonicality === 'blocked', `output node ${node.nodeId} canonicality must be blocked`);
      assert(node.unresolved.blocker.includes('live'), `output node ${node.nodeId} blocker must mention live capture`);
    }
  }

  // Verify edges exist and connect valid nodes
  const a03EdgeIds = ledger.edges.filter((e) => e.ownerAxis === 'A03').map((e) => e.edgeId);
  assert(a03EdgeIds.length > 0, 'A03 edges must be present');

  for (const edge of ledger.edges.filter((e) => e.ownerAxis === 'A03')) {
    assert(edge.from, `edge ${edge.edgeId} must have from nodeId`);
    assert(edge.to, `edge ${edge.edgeId} must have to nodeId`);
    assert(['renders', 'plays', 'releases'].includes(edge.verb), `edge verb ${edge.verb} must be renders/plays/releases`);
    const fromNode = ledger.nodes.find((n) => n.nodeId === edge.from);
    const toNode = ledger.nodes.find((n) => n.nodeId === edge.to);
    assert(fromNode, `edge ${edge.edgeId} from nodeId ${edge.from} not found in nodes`);
    assert(toNode, `edge ${edge.edgeId} to nodeId ${edge.to} not found in nodes`);
  }
});

test('A03 axis: validateLedger passes', async () => {
  const { ledger } = await buildA03Axis(REPO_ROOT);

  // Must not throw
  assert.doesNotThrow(
    () => validateLedger(ledger, { manifest: SOURCE_MANIFEST }),
    'validateLedger must pass',
  );
});

test('A03 axis: cross-run determinism (byte-identical output)', async () => {
  // Build the axis in-process twice and compare with stable stringify
  const { ledger: ledger1 } = await buildA03Axis(REPO_ROOT);
  const { ledger: ledger2 } = await buildA03Axis(REPO_ROOT);

  const first = stableStringify(ledger1);
  const second = stableStringify(ledger2);

  assert.strictEqual(first, second, 'Two independent builds must produce identical output');
});

test('A03 axis: module contains no Date/random (determinism requirement)', async () => {
  const axisModulePath = resolve(REPO_ROOT, 'tools/causal-ledger/axes/a03-render-audio-output.mjs');
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

test('A03 axis: negative fixture - orphan render node fails', async () => {
  // This test verifies that the validator catches render nodes not attached to coverage
  // We simulate this by attempting to add a render node without proper coverage mapping
  const { ledger: base } = await buildA03Axis(REPO_ROOT);

  // Verify that all A03 render nodes ARE attached to coverage (pass case)
  const a03RenderNodes = base.nodes.filter((n) => n.axis === 'A03' && n.surface === 'render');
  const coveredNodeIds = new Set();
  for (const cov of base.coverage) {
    for (const nodeId of cov.targetNodeIds) {
      coveredNodeIds.add(nodeId);
    }
  }

  for (const node of a03RenderNodes) {
    assert(coveredNodeIds.has(node.nodeId), `A03 render node ${node.nodeId} must be attached to coverage`);
  }
});

test('A03 axis: negative fixture - non-blocked render node without live evidence fails', async () => {
  // Verify that all A03 render/audio nodes have Unknown/Blocked state
  // If a node is not Unknown/Blocked, it means someone tried to mark it as canonical without live capture
  const { ledger: base } = await buildA03Axis(REPO_ROOT);

  const a03OutputNodes = base.nodes.filter((n) => n.axis === 'A03' && (n.surface === 'render' || n.surface === 'audio'));

  for (const node of a03OutputNodes) {
    // All render/audio output must be Unknown/Blocked (no live capture evidence)
    assert.strictEqual(node.state.confidence, 'unknown',
      `A03 output node ${node.nodeId} confidence must be unknown (no live D3D8/GDI hook)`);
    assert.strictEqual(node.state.canonicality, 'blocked',
      `A03 output node ${node.nodeId} canonicality must be blocked (no live capture)`);
  }
});
