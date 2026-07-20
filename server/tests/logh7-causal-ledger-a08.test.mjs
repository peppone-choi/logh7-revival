import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Portable REPO_ROOT via import.meta.url
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

// Import validator and builder
const { validateLedger, stableStringify, SOURCE_MANIFEST, importSources } =
  await import(new URL('../../tools/causal-ledger/index.mjs', import.meta.url).href);

// Import A08 builder
const { buildA08Ledger } = await import(new URL('../../tools/causal-ledger/axes/a08-cqrs-resource-registry.mjs', import.meta.url).href);

test('A08 CQRS Resource Registry — RED phase', async (t) => {
  await t.test('A08 module builds without error', async () => {
    const ledger = await buildA08Ledger(REPO_ROOT);
    assert.ok(ledger, 'ledger built successfully');
    assert.ok(ledger.nodes, 'nodes present');
    assert.ok(ledger.edges, 'edges present');
    assert.ok(ledger.evidence, 'evidence present');
  });

  await t.test('A08 ledger validates against schema', async () => {
    const ledger = await buildA08Ledger(REPO_ROOT);
    // Should not throw
    validateLedger(ledger, { manifest: SOURCE_MANIFEST });
  });

  await t.test('A08 in-process determinism: two builds produce identical stringify', async () => {
    const build1 = stableStringify(await buildA08Ledger(REPO_ROOT));
    const build2 = stableStringify(await buildA08Ledger(REPO_ROOT));
    assert.strictEqual(build1, build2, 'determinism failed: builds differ');
  });

  await t.test('A08 axis nodes are marked as A08', async () => {
    const ledger = await buildA08Ledger(REPO_ROOT);
    const a08Nodes = ledger.nodes.filter(n => n.axis === 'A08');
    assert.ok(a08Nodes.length >= 10, `expected >=10 A08 nodes, got ${a08Nodes.length}`);
  });

  await t.test('A08 nodes have canonicality in {noncanonical, blocked}', async () => {
    const ledger = await buildA08Ledger(REPO_ROOT);
    const a08Nodes = ledger.nodes.filter(n => n.axis === 'A08');
    for (const node of a08Nodes) {
      assert.ok(
        node.state.canonicality === 'noncanonical' || node.state.canonicality === 'blocked',
        `node ${node.nodeId} has invalid canonicality: ${node.state.canonicality}`
      );
    }
  });

  await t.test('A08 blocked nodes have unresolved blocker field set', async () => {
    const ledger = await buildA08Ledger(REPO_ROOT);
    const a08Nodes = ledger.nodes.filter(n => n.axis === 'A08' && n.state.canonicality === 'blocked');
    for (const node of a08Nodes) {
      assert.ok(
        node.unresolved.blocker && node.unresolved.blocker.length > 0,
        `blocked node ${node.nodeId} must have non-empty blocker field`
      );
    }
  });

  await t.test('A08 all nodes are orphan-free (appear in coverage targetNodeIds)', async () => {
    const ledger = await buildA08Ledger(REPO_ROOT);
    const a08Nodes = new Set(ledger.nodes.filter(n => n.axis === 'A08').map(n => n.nodeId));
    const coveredNodeIds = new Set();
    for (const cov of ledger.coverage) {
      for (const nodeId of cov.targetNodeIds || []) {
        coveredNodeIds.add(nodeId);
      }
    }
    for (const nodeId of a08Nodes) {
      assert.ok(coveredNodeIds.has(nodeId), `A08 node ${nodeId} is orphan (not in coverage targetNodeIds)`);
    }
  });

  await t.test('A08 all edges reference existing nodes', async () => {
    const ledger = await buildA08Ledger(REPO_ROOT);
    const nodeIds = new Set(ledger.nodes.map(n => n.nodeId));
    const a08Edges = ledger.edges.filter(e => e.ownerAxis === 'A08');
    for (const edge of a08Edges) {
      assert.ok(nodeIds.has(edge.from), `A08 edge ${edge.edgeId} references missing from node ${edge.from}`);
      assert.ok(nodeIds.has(edge.to), `A08 edge ${edge.edgeId} references missing to node ${edge.to}`);
    }
  });

  await t.test('A08 negative fixture: tcp-frame-accumulator resource identified', async () => {
    const ledger = await buildA08Ledger(REPO_ROOT);
    const tcp = ledger.nodes.find(n => n.nodeId === 'A08:resource:tcp-frame-accumulator');
    assert.ok(tcp, 'tcp-frame-accumulator node must exist');
    assert.strictEqual(tcp.axis, 'A08');
    assert.ok(tcp.unresolved, 'unresolved field exists');
  });

  await t.test('A08 negative fixture: socket write pressure blocker if not implemented', async () => {
    const ledger = await buildA08Ledger(REPO_ROOT);
    const outbound = ledger.nodes.find(n => n.nodeId === 'A08:resource:outbound-frame-queue');
    assert.ok(outbound, 'outbound-frame-queue node must exist');
    // If pressure not implemented in actual code, should be marked Unknown/Blocked
    if (outbound.state.canonicality === 'blocked' || outbound.state.confidence === 'unknown') {
      assert.ok(outbound.unresolved.blocker, 'should have blocker explaining missing pressure');
    }
  });

  await t.test('A08 base ledger counts preserved (no modification of frozen A01)', async () => {
    const { ledger: base } = await importSources(REPO_ROOT, SOURCE_MANIFEST);
    const full = await buildA08Ledger(REPO_ROOT);

    // Base records should be identical
    const baseAxes = new Set(base.nodes.map(n => n.axis));
    baseAxes.delete('A08');
    const fullAxes = new Set(full.nodes.map(n => n.axis));

    // Count nodes by axis (excluding A08)
    for (const axis of baseAxes) {
      const baseCount = base.nodes.filter(n => n.axis === axis).length;
      const fullCount = full.nodes.filter(n => n.axis === axis).length;
      assert.strictEqual(baseCount, fullCount,
        `axis ${axis} node count changed: base=${baseCount}, full=${fullCount}`);
    }
  });

  await t.test('A08 sourceManifestHash preserved from base', async () => {
    const { ledger: base } = await importSources(REPO_ROOT, SOURCE_MANIFEST);
    const full = await buildA08Ledger(REPO_ROOT);

    assert.strictEqual(
      base.sourceManifestHash,
      full.sourceManifestHash,
      'sourceManifestHash must not change across A08 append'
    );
  });

  await t.test('A08 node IDs follow axis:category:identifier pattern', async () => {
    const ledger = await buildA08Ledger(REPO_ROOT);
    const a08Nodes = ledger.nodes.filter(n => n.axis === 'A08');
    const idPattern = /^A08:[a-z][a-z0-9-]*:[a-z0-9][a-z0-9._-]*$/;
    for (const node of a08Nodes) {
      assert.ok(
        idPattern.test(node.nodeId),
        `A08 nodeId ${node.nodeId} does not match pattern`
      );
    }
  });

  await t.test('A08 evidenceIds reference existing evidence records', async () => {
    const ledger = await buildA08Ledger(REPO_ROOT);
    const evidenceIds = new Set(ledger.evidence.map(e => e.evidenceId));
    const a08Nodes = ledger.nodes.filter(n => n.axis === 'A08');
    for (const node of a08Nodes) {
      for (const evId of node.evidenceIds || []) {
        assert.ok(evidenceIds.has(evId),
          `node ${node.nodeId} references missing evidence ${evId}`);
      }
    }
  });
});
