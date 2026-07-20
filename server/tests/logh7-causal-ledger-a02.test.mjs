import { test } from 'node:test';
import * as assert from 'node:assert';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

import {
  CONTRACT,
  stableStringify,
  validateLedger,
  SchemaError,
  SOURCE_MANIFEST,
} from '../../tools/causal-ledger/index.mjs';
import { buildA02Ledger, assertAxisInvariant } from '../../tools/causal-ledger/axes/a02-input-ui-fsm.mjs';

const REPO_ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

test('A02 axis — client input, UI, FSM — RED: module loads and builds valid ledger', async (t) => {
  await t.test('buildA02Ledger is callable', () => {
    assert.strictEqual(typeof buildA02Ledger, 'function');
  });

  await t.test('builds a complete ledger bootstrapping A01 base', async () => {
    const ledger = await buildA02Ledger(REPO_ROOT);
    assert.strictEqual(typeof ledger, 'object');
    assert.strictEqual(Array.isArray(ledger.nodes), true);
    assert.strictEqual(Array.isArray(ledger.edges), true);
    assert.strictEqual(Array.isArray(ledger.evidence), true);
    assert.strictEqual(Array.isArray(ledger.coverage), true);
    assert.ok(ledger.nodes.length >= 4, 'should have at least 4 nodes (A01 base + A02)');
    assert.ok(ledger.evidence.length >= 4, 'should have at least 4 evidence records (A01 base + A02)');
  });

  await t.test('validateLedger returns true when passed manifest parameter', async () => {
    const ledger = await buildA02Ledger(REPO_ROOT);
    const result = validateLedger(ledger, { manifest: SOURCE_MANIFEST });
    assert.strictEqual(result, true);
  });

  await t.test('ledger has correct schemaVersion', async () => {
    const ledger = await buildA02Ledger(REPO_ROOT);
    assert.strictEqual(ledger.schemaVersion, CONTRACT.schemaVersion);
  });

  await t.test('ledger has sourceManifestHash matching SOURCE_MANIFEST', async () => {
    const ledger = await buildA02Ledger(REPO_ROOT);
    const expectedHash = sha256(stableStringify(SOURCE_MANIFEST));
    assert.strictEqual(ledger.sourceManifestHash, expectedHash);
  });

  await t.test('all A02 nodes have axis=A02 and valid surface', async () => {
    const ledger = await buildA02Ledger(REPO_ROOT);
    const a02Nodes = ledger.nodes.filter(n => n.nodeId.startsWith('A02:'));
    assert.ok(a02Nodes.length > 0, 'should have A02 nodes');
    for (const node of a02Nodes) {
      assert.strictEqual(node.axis, 'A02');
      assert.ok(['input', 'client-state'].includes(node.surface), `node ${node.nodeId} has valid surface`);
      assert.strictEqual(node.sourceManifestHash, ledger.sourceManifestHash);
    }
  });

  await t.test('nodes include both input-surface and client-state types', async () => {
    const ledger = await buildA02Ledger(REPO_ROOT);
    const a02Nodes = ledger.nodes.filter(n => n.nodeId.startsWith('A02:'));
    const surfaces = new Set(a02Nodes.map(n => n.surface));
    assert.ok(surfaces.has('input'), 'should have input surface nodes');
    assert.ok(surfaces.has('client-state'), 'should have client-state surface nodes');
  });

  await t.test('all A02 edges reference existing nodes', async () => {
    const ledger = await buildA02Ledger(REPO_ROOT);
    const nodeMap = new Map(ledger.nodes.map(n => [n.nodeId, n]));
    const a02Edges = ledger.edges.filter(e => e.edgeId.startsWith('A02:'));
    for (const edge of a02Edges) {
      assert.ok(nodeMap.has(edge.from), `edge ${edge.edgeId} from node exists`);
      assert.ok(nodeMap.has(edge.to), `edge ${edge.edgeId} to node exists`);
    }
  });

  await t.test('coverage records map ui-coordinate-audit sources to nodes', async () => {
    const ledger = await buildA02Ledger(REPO_ROOT);
    const a02NodeIds = new Set(ledger.nodes.filter(n => n.nodeId.startsWith('A02:')).map(n => n.nodeId));
    let a02NodesCovered = new Set();
    for (const cov of ledger.coverage) {
      for (const nodeId of cov.targetNodeIds) {
        if (a02NodeIds.has(nodeId)) {
          a02NodesCovered.add(nodeId);
        }
      }
    }
    assert.ok(a02NodesCovered.size > 0, 'A02 nodes should appear in coverage records');
    assert.strictEqual(a02NodesCovered.size, a02NodeIds.size, 'all A02 nodes should be covered');
  });

  await t.test('deterministic: two builds produce identical stableStringify output', async () => {
    const ledger1 = await buildA02Ledger(REPO_ROOT);
    const ledger2 = await buildA02Ledger(REPO_ROOT);
    const str1 = stableStringify(ledger1);
    const str2 = stableStringify(ledger2);
    assert.strictEqual(str1, str2, 'two builds must produce identical stringified output');
    assert.strictEqual(sha256(str1), sha256(str2), 'hash must be identical');
  });

  await t.test('A02 node IDs follow pattern A02:surface:*', async () => {
    const ledger = await buildA02Ledger(REPO_ROOT);
    const a02Nodes = ledger.nodes.filter(n => n.nodeId.startsWith('A02:'));
    for (const node of a02Nodes) {
      assert.match(node.nodeId, /^A02:(input|state):/, `node ID ${node.nodeId} follows pattern`);
    }
  });

  await t.test('A02 nodes are distributed across coverage records', async () => {
    const ledger = await buildA02Ledger(REPO_ROOT);
    const a02NodeIds = new Set(ledger.nodes.filter(n => n.nodeId.startsWith('A02:')).map(n => n.nodeId));
    const coverageWithA02 = ledger.coverage.filter(c => c.targetNodeIds.some(id => a02NodeIds.has(id)));
    assert.ok(coverageWithA02.length > 0, 'should have coverage records targeting A02 nodes');
  });

  await t.test('A02 evidence records reference ui-coordinate-audit source', async () => {
    const ledger = await buildA02Ledger(REPO_ROOT);
    const a02Evidence = ledger.evidence.filter(e => e.evidenceId.startsWith('run:ui-coordinate-audit:'));
    assert.ok(a02Evidence.length > 0, 'should have A02 evidence records from ui-coordinate-audit');
    for (const ev of a02Evidence) {
      assert.strictEqual(ev.source.path, 'server/content/generated/logh7-ui-coordinate-audit.json');
      assert.ok(ev.source.recordPointer.length > 0, 'evidence should have record pointer');
    }
  });

  await t.test('unknown/blocked nodes have unresolved blocker reason', async () => {
    const ledger = await buildA02Ledger(REPO_ROOT);
    const a02Nodes = ledger.nodes.filter(n => n.nodeId.startsWith('A02:'));
    const unknownNodes = a02Nodes.filter(n => n.state.confidence === 'unknown' || n.state.canonicality === 'blocked');
    for (const node of unknownNodes) {
      const hasBlocker = Object.values(node.unresolved).some(val => typeof val === 'string' && val.length > 0);
      assert.ok(hasBlocker, `unknown/blocked node ${node.nodeId} should have unresolved blocker`);
    }
  });

  await t.test('axisDependencies matches CONTRACT axisDependencies', async () => {
    const ledger = await buildA02Ledger(REPO_ROOT);
    assert.deepStrictEqual(ledger.axisDependencies, CONTRACT.axisDependencies);
  });

  await t.test('ledger has bootstrap migration', async () => {
    const ledger = await buildA02Ledger(REPO_ROOT);
    assert.ok(ledger.migrations.length > 0, 'should have migration records');
    const bootstrap = ledger.migrations.find(m => m.migrationId.includes('bootstrap'));
    assert.ok(bootstrap, 'should have bootstrap migration');
  });

  await t.test('ledger has all 4 importReceipts for frozen sources', async () => {
    const ledger = await buildA02Ledger(REPO_ROOT);
    assert.strictEqual(ledger.importReceipts.length, 4, 'should have exactly 4 import receipts (A01 frozen sources)');
    const sourceIds = new Set(ledger.importReceipts.map(r => r.sourceId));
    assert.ok(sourceIds.has('opcode'), 'should have opcode receipt');
    assert.ok(sourceIds.has('exe-re'), 'should have exe-re receipt');
    assert.ok(sourceIds.has('ui-render'), 'should have ui-render receipt');
    assert.ok(sourceIds.has('data-audit'), 'should have data-audit receipt');
  });
});

test('A02 axis — negative cases: invariant violations detected', async (t) => {
  await t.test('P3 marked as canonical should fail axis invariant', async () => {
    const ledger = await buildA02Ledger(REPO_ROOT);
    const badLedger = {
      ...ledger,
      nodes: [
        ...ledger.nodes,
        {
          schemaVersion: CONTRACT.schemaVersion,
          nodeId: 'A02:state:test-p3-canonical',
          axis: 'A02',
          type: 'fsm-state',
          domain: 'client-state',
          owner: 'A02 test',
          summary: 'test P3 canonical node (should fail)',
          preconditions: [],
          postconditions: [],
          failureConditions: [],
          surface: 'client-state',
          direction: 'none',
          state: { grade: 'P3', confidence: 'confirmed', canonicality: 'canonical', rights: 'unknown', verification: 'verified' },
          lifetime: { creator: 'test', consumer: 'test', disposer: 'test', scope: 'test', hardBound: 0, notApplicableReason: '' },
          evidenceIds: [],
          relatedIssue: 'TEST',
          acceptanceCriteria: [],
          sourceManifestHash: ledger.sourceManifestHash,
          unresolved: { impact: '', blocker: '', nextExperiment: '', releaseCondition: '' },
        },
      ],
    };

    assert.throws(() => {
      assertAxisInvariant(badLedger);
    }, (err) => {
      return err instanceof Error && err.message.includes('P3');
    }, 'P3 marked canonical should fail axis invariant');
  });

  await t.test('A02 node without evidenceIds should fail validation', async () => {
    const ledger = await buildA02Ledger(REPO_ROOT);
    const badLedger = {
      ...ledger,
      nodes: [
        ...ledger.nodes,
        {
          schemaVersion: CONTRACT.schemaVersion,
          nodeId: 'A02:input:test-no-evidence',
          axis: 'A02',
          type: 'input-surface',
          domain: 'client-input',
          owner: 'A02 test',
          summary: 'test input with no evidence (should fail)',
          preconditions: [],
          postconditions: [],
          failureConditions: [],
          surface: 'input',
          direction: 'local',
          state: { grade: 'R1', confidence: 'confirmed', canonicality: 'noncanonical', rights: 'allowed', verification: 'verified' },
          lifetime: { creator: 'test', consumer: 'test', disposer: 'test', scope: 'test', hardBound: 0, notApplicableReason: '' },
          evidenceIds: [],
          relatedIssue: 'TEST',
          acceptanceCriteria: [],
          sourceManifestHash: ledger.sourceManifestHash,
          unresolved: { impact: '', blocker: '', nextExperiment: '', releaseCondition: '' },
        },
      ],
    };

    assert.throws(() => {
      validateLedger(badLedger, { manifest: SOURCE_MANIFEST });
    }, SchemaError, 'node without evidenceIds should fail validation');
  });
});
