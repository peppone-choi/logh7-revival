import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateLedger, stableStringify, SchemaError, SOURCE_MANIFEST } from '../../tools/causal-ledger/index.mjs';
import { buildA06Ledger } from '../../tools/causal-ledger/axes/a06-data-assets-provenance.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

test('A06 - Data, assets, content ledger', async (t) => {
  await t.test('bootstraps A01 base and appends A06 axis records', async () => {
    const ledger = await buildA06Ledger(REPO_ROOT);

    // Base should have 4 importReceipts (from SOURCE_MANIFEST)
    assert.strictEqual(ledger.importReceipts.length, 4, 'ledger has exactly 4 importReceipts from base');

    // Base should have specific sourceIds
    const baseSourceIds = new Set(ledger.importReceipts.map(r => r.sourceId));
    assert.ok(baseSourceIds.has('opcode'), 'has opcode importReceipt');
    assert.ok(baseSourceIds.has('exe-re'), 'has exe-re importReceipt');
    assert.ok(baseSourceIds.has('ui-render'), 'has ui-render importReceipt');
    assert.ok(baseSourceIds.has('data-audit'), 'has data-audit importReceipt');
  });

  await t.test('appends ~170 A06 data nodes to base coverage', async () => {
    const auditPath = join(REPO_ROOT, 'server/content/generated/logh7-data-decode-audit.json');
    const auditData = JSON.parse(await readFile(auditPath, 'utf8'));
    assert.strictEqual(auditData.allJson.length, 170, 'audit source has 170 records');

    const ledger = await buildA06Ledger(REPO_ROOT);

    // Count A06 nodes (exclude A01 base nodes)
    const a06Nodes = ledger.nodes.filter(n => n.axis === 'A06');
    assert.strictEqual(a06Nodes.length, 170, '170 A06 data catalog nodes appended');

    // Base should have A01 nodes
    const a01Nodes = ledger.nodes.filter(n => n.axis === 'A01');
    assert.ok(a01Nodes.length > 0, 'base A01 nodes preserved');
  });

  await t.test('coverage frozen: no new coverage records added, nodes attached to existing ones', async () => {
    const ledger = await buildA06Ledger(REPO_ROOT);

    // Total coverage should remain the same (frozen at ~11793)
    const totalCoverage = ledger.coverage.length;
    assert.strictEqual(totalCoverage, 11793, 'total coverage count frozen at 11793 (no new records)');

    // data-audit coverage should have A06 nodes attached
    const dataAuditCoverage = ledger.coverage.filter(c => c.sourceId === 'data-audit');
    assert.strictEqual(dataAuditCoverage.length, 170, 'data-audit coverage count remains 170');

    // Verify A06 nodes are attached to data-audit coverage records
    const a06NodesInCoverage = new Set();
    dataAuditCoverage.forEach(cov => {
      cov.targetNodeIds.forEach(nid => {
        if (nid.startsWith('A06:')) {
          a06NodesInCoverage.add(nid);
        }
      });
    });

    assert.ok(a06NodesInCoverage.size > 0, 'A06 nodes are attached to coverage targetNodeIds');
  });

  await t.test('all A06 nodes have correct axis, prefix, and P3 state', async () => {
    const ledger = await buildA06Ledger(REPO_ROOT);
    const a06Nodes = ledger.nodes.filter(n => n.axis === 'A06');

    for (const node of a06Nodes) {
      assert.strictEqual(node.axis, 'A06', `node ${node.nodeId} has A06 axis`);
      assert.ok(node.nodeId.startsWith('A06:'), `node ${node.nodeId} starts with A06:`);
      assert.strictEqual(node.surface, 'data', `node ${node.nodeId} surface is data`);
      assert.strictEqual(node.direction, 'none', `node ${node.nodeId} direction is none`);
      assert.strictEqual(node.state.grade, 'P3', `node ${node.nodeId} grade is P3`);
      assert.strictEqual(node.state.canonicality, 'blocked', `node ${node.nodeId} canonicality is blocked`);
      assert.ok(node.unresolved.blocker.length > 0, `node ${node.nodeId} has blocker`);
    }
  });

  await t.test('validateLedger passes with base + appended axis', async () => {
    const ledger = await buildA06Ledger(REPO_ROOT);
    const result = validateLedger(ledger, { manifest: SOURCE_MANIFEST });
    assert.strictEqual(result, true, 'ledger with base + A06 validates');
  });

  await t.test('ledger build is deterministic (byte-identical on rebuild)', async () => {
    const build1 = await buildA06Ledger(REPO_ROOT);
    const str1 = stableStringify(build1);
    const hash1 = createHash('sha256').update(str1).digest('hex');

    const build2 = await buildA06Ledger(REPO_ROOT);
    const str2 = stableStringify(build2);
    const hash2 = createHash('sha256').update(str2).digest('hex');

    assert.strictEqual(hash1, hash2, 'two builds produce identical stable stringified output');
  });

  await t.test('A06 nodes are linked to existing data-audit coverage via targetNodeIds', async () => {
    const ledger = await buildA06Ledger(REPO_ROOT);
    const auditPath = join(REPO_ROOT, 'server/content/generated/logh7-data-decode-audit.json');
    const auditData = JSON.parse(await readFile(auditPath, 'utf8'));

    // Count how many data-audit coverage records have A06 nodes in targetNodeIds
    const dataAuditCoverage = ledger.coverage.filter(c => c.sourceId === 'data-audit');
    assert.strictEqual(dataAuditCoverage.length, auditData.allJson.length, '170 data-audit coverage records');

    let a06NodesLinked = 0;
    for (const coverage of dataAuditCoverage) {
      assert.strictEqual(coverage.sourceId, 'data-audit', `coverage ${coverage.coverageId} sources from audit`);
      // Each should have at least the base A01 node and the A06 node
      assert.ok(coverage.targetNodeIds.length >= 2, `coverage has base A01 node + A06 node attached`);
      const hasA06 = coverage.targetNodeIds.some(id => id.startsWith('A06:'));
      if (hasA06) a06NodesLinked++;
    }

    assert.ok(a06NodesLinked > 0, `${a06NodesLinked} data-audit coverage records have A06 nodes attached`);
  });

  await t.test('evidence includes run:data-audit:snapshot referenced by A06 nodes', async () => {
    const ledger = await buildA06Ledger(REPO_ROOT);
    const auditEvidence = ledger.evidence.filter(e => e.evidenceId === 'run:data-audit:snapshot');
    assert.strictEqual(auditEvidence.length, 1, 'exactly one run:data-audit:snapshot evidence record');
    
    const a06Nodes = ledger.nodes.filter(n => n.axis === 'A06');
    for (const node of a06Nodes.slice(0, 5)) {
      assert.ok(node.evidenceIds.includes('run:data-audit:snapshot'), `node references audit evidence`);
    }
  });

  await t.test('sourceManifestHash matches for all appended records', async () => {
    const ledger = await buildA06Ledger(REPO_ROOT);
    const a06Nodes = ledger.nodes.filter(n => n.axis === 'A06');

    for (const node of a06Nodes) {
      assert.strictEqual(node.sourceManifestHash, ledger.sourceManifestHash,
        `node ${node.nodeId} sourceManifestHash matches ledger hash`);
    }
  });

  await t.test('generates deterministic a06-report.json with summary counts', async () => {
    const ledger = await buildA06Ledger(REPO_ROOT);
    const reportPath = join(REPO_ROOT, 'tools/causal-ledger/generated/a06-report.json');
    const reportContent = await readFile(reportPath, 'utf8');
    const report = JSON.parse(reportContent);

    // Verify report structure
    assert.ok(report.axis === 'A06', 'report axis is A06');
    assert.ok(report.nodesSummary, 'report has nodesSummary');
    assert.ok(report.nodesSummary.totalNodes >= 170, 'report has at least 170 nodes');
    assert.ok(typeof report.nodesSummary.byGrade === 'object', 'report has byGrade counts');
    assert.ok(typeof report.nodesSummary.byCanonical === 'object', 'report has byCanonical counts');
    assert.ok(report.nodesSummary.blockedCount >= 0, 'report has blockedCount');

    // Verify P3 invariant: all A06 nodes should be P3 and blocked
    const a06Nodes = ledger.nodes.filter(n => n.axis === 'A06');
    const p3Count = a06Nodes.filter(n => n.state.grade === 'P3').length;
    const blockedCount = a06Nodes.filter(n => n.state.canonicality === 'blocked').length;
    
    assert.strictEqual(p3Count, a06Nodes.length, 'all A06 nodes are P3');
    assert.strictEqual(blockedCount, a06Nodes.length, 'all A06 nodes are blocked');
    assert.strictEqual(report.nodesSummary.blockedCount, blockedCount, 'report blockedCount matches actual count');
  });

  await t.test('NEGATIVE: P3 node with canonical canonicality violates P3 invariant', async () => {
    const ledger = await buildA06Ledger(REPO_ROOT);
    const malformed = JSON.parse(JSON.stringify(ledger));

    // Mutate first A06 node to have canonical state (violates P3 invariant)
    const a06Index = malformed.nodes.findIndex(n => n.axis === 'A06');
    if (a06Index >= 0) {
      malformed.nodes[a06Index].state.canonicality = 'canonical';
    }

    assert.throws(
      () => validateLedger(malformed, { manifest: SOURCE_MANIFEST }),
      SchemaError,
      'P3 node with canonical canonicality fails validation'
    );
  });

  await t.test('NEGATIVE: P3 node to canonical dependency edge is rejected', async () => {
    const ledger = await buildA06Ledger(REPO_ROOT);
    const malformed = JSON.parse(JSON.stringify(ledger));

    // Add a malicious dependency edge from A06 P3 node to an A01 canonical node
    const a06Node = malformed.nodes.find(n => n.axis === 'A06' && n.state.grade === 'P3');
    const a01Node = malformed.nodes.find(n => n.axis === 'A01');

    if (a06Node && a01Node) {
      malformed.edges.push({
        schemaVersion: '1.0.0',
        edgeId: 'A06:edge:malicious-p3-to-canonical',
        ownerAxis: 'A06',
        edgeClass: 'dependency',
        from: a06Node.nodeId,
        to: a01Node.nodeId,
        verb: 'depends-on',
        ordering: [],
        stateChange: { before: {}, readSet: [], writeSet: [], after: {}, transactionBoundary: '' },
        outcomes: { accepted: [], rejected: [], failed: [], retry: [], reconnect: [] },
        replay: { idempotencyKey: '', dedupeWindow: 0, duplicateOutcome: '' },
        evidence: { grade: 'O0', confidence: 'confirmed', provenance: '', evidenceIds: [] },
        validation: []
      });
    }

    assert.throws(
      () => validateLedger(malformed, { manifest: SOURCE_MANIFEST }),
      SchemaError,
      'P3 node to canonical dependency edge fails validation'
    );
  });
});


