import { test } from 'node:test';
import { strictEqual, ok } from 'node:assert';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CONTRACT,
  stableStringify,
  validateLedger,
  SOURCE_MANIFEST,
} from '../../tools/causal-ledger/index.mjs';
import { buildA09Ledger } from '../../tools/causal-ledger/axes/a09-lineage-failure-safety.mjs';

const REPO_ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

test('A09: Bootstrap and append axis records', async () => {
  const ledger = await buildA09Ledger(REPO_ROOT);
  
  strictEqual(typeof ledger, 'object');
  ok(Array.isArray(ledger.nodes));
  
  const a01Nodes = ledger.nodes.filter(n => n.axis === 'A01');
  strictEqual(a01Nodes.length, 4);
  
  const a09Nodes = ledger.nodes.filter(n => n.axis === 'A09');
  ok(a09Nodes.length >= 18, 'A09 has >=18 nodes');
});

test('A09: validateLedger passes', async () => {
  const ledger = await buildA09Ledger(REPO_ROOT);
  const result = validateLedger(ledger, { manifest: SOURCE_MANIFEST });
  strictEqual(result, true);
});

test('A09: CROSS-RUN determinism', async () => {
  const first = stableStringify(await buildA09Ledger(REPO_ROOT));
  const second = stableStringify(await buildA09Ledger(REPO_ROOT));
  strictEqual(first, second);
});

test('A09: Invariant - all nodes have coverage', async () => {
  const ledger = await buildA09Ledger(REPO_ROOT);
  
  const a09Nodes = ledger.nodes.filter(n => n.nodeId.startsWith('A09:'));
  ok(a09Nodes.length > 0);

  const coveredNodeIds = new Set();
  for (const cov of ledger.coverage) {
    for (const nodeId of cov.targetNodeIds) {
      coveredNodeIds.add(nodeId);
    }
  }

  for (const node of a09Nodes) {
    ok(coveredNodeIds.has(node.nodeId), 'node ' + node.nodeId + ' must have coverage');
  }
});