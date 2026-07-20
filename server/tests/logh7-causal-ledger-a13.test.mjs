#!/usr/bin/env node
/**
 * A13: Rights, redistribution, clean-room provenance
 * TDD Test for A13 axis ledger records
 *
 * Assertions:
 * (a) Axis build bootstraps A01 base and appends A13 records
 * (b) validateLedger passes with manifest
 * (c) Cross-run determinism: two separate node processes produce byte-identical output
 * (d) Negative fixtures where axis invariant is violated
 * (e) Filter assertions to axis==='A13' only
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve('C:/Users/user/orca/workspaces/logh7-revival/216-실제-구현');
const AXIS_ID = 'A13';

async function importAxisModule() {
  const axisModulePath = join(REPO_ROOT, 'tools/causal-ledger/axes/a13-rights-and-redistribution.mjs');
  return import(`file://${axisModulePath}`);
}

async function runAxisBuildInProcess() {
  return new Promise((resolve, reject) => {
    const axisModulePath = join(REPO_ROOT, 'tools/causal-ledger/axes/a13-rights-and-redistribution.mjs');
    const proc = spawn('node', [axisModulePath], {
      cwd: REPO_ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Build failed with exit code ${code}: ${stderr}`));
      } else {
        try {
          const result = JSON.parse(stdout);
          resolve(result);
        } catch (e) {
          reject(new Error(`Failed to parse build output: ${e.message}`));
        }
      }
    });

    proc.on('error', (err) => {
      reject(err);
    });
  });
}

test('A13 axis: bootstrap base and append records', async () => {
  const { buildA13Ledger } = await importAxisModule();

  const ledger = await buildA13Ledger(REPO_ROOT);

  assert.ok(ledger.nodes, 'ledger.nodes exists');
  assert.ok(Array.isArray(ledger.nodes), 'ledger.nodes is an array');

  const baseNodes = ledger.nodes.filter((n) => n.axis !== AXIS_ID);
  const axisNodes = ledger.nodes.filter((n) => n.axis === AXIS_ID);

  assert.ok(baseNodes.length > 0, 'base nodes preserved');
  assert.ok(axisNodes.length > 0, `A13 axis nodes present: ${axisNodes.length}`);

  assert.equal(
    axisNodes.length,
    4,
    `A13 should define exactly 4 artifact-rights nodes (opcode, exe-re, ui, data-audit), got ${axisNodes.length}`
  );
});

test('A13 axis: validateLedger passes with manifest', async () => {
  const { buildA13Ledger } = await importAxisModule();
  
  const validatorPath = join(REPO_ROOT, 'tools/causal-ledger/index.mjs');
  const validatorModule = await import(`file://${validatorPath}`);
  const { validateLedger, SOURCE_MANIFEST } = validatorModule;

  const ledger = await buildA13Ledger(REPO_ROOT);

  const result = validateLedger(ledger, { manifest: SOURCE_MANIFEST });
  assert.ok(result, 'validateLedger returned true');
});

test('A13 axis: cross-run determinism (two separate processes)', async () => {
  const build1Promise = runAxisBuildInProcess();
  const build2Promise = runAxisBuildInProcess();

  const [result1, result2] = await Promise.all([build1Promise, build2Promise]);

  const stringify1 = JSON.stringify(result1);
  const stringify2 = JSON.stringify(result2);

  assert.equal(stringify1, stringify2, 'Two separate builds produce identical output (determinism-ok)');
});

test('A13 axis: negative fixture - rights=unknown + canonicality=canonical violates schema', async () => {
  const validatorPath = join(REPO_ROOT, 'tools/causal-ledger/index.mjs');
  const validatorModule = await import(`file://${validatorPath}`);
  const { validateLedger, SOURCE_MANIFEST } = validatorModule;

  const { buildA13Ledger } = await importAxisModule();

  const baseLedger = await buildA13Ledger(REPO_ROOT);

  const invalidNode = {
    ...baseLedger.nodes[0],
    nodeId: 'A13:invalid:rights-unknown-canonical',
    state: {
      ...baseLedger.nodes[0].state,
      rights: 'unknown',
      canonicality: 'canonical',
    },
  };

  const invalidLedger = {
    ...baseLedger,
    nodes: [...baseLedger.nodes, invalidNode],
  };

  assert.throws(
    () => validateLedger(invalidLedger, { manifest: SOURCE_MANIFEST }),
    'Schema should reject canonicality=canonical for A13'
  );
});

test('A13 axis: negative fixture - dangling evidenceIds', async () => {
  const validatorPath = join(REPO_ROOT, 'tools/causal-ledger/index.mjs');
  const validatorModule = await import(`file://${validatorPath}`);
  const { validateLedger, SOURCE_MANIFEST } = validatorModule;

  const { buildA13Ledger } = await importAxisModule();

  const baseLedger = await buildA13Ledger(REPO_ROOT);

  const a13Node = baseLedger.nodes.find((n) => n.axis === AXIS_ID);
  assert.ok(a13Node, 'A13 node exists');

  const invalidNode = {
    ...a13Node,
    evidenceIds: ['run:nonexistent:evidence-that-does-not-exist'],
  };

  const invalidLedger = {
    ...baseLedger,
    nodes: baseLedger.nodes.map((n) => (n.nodeId === a13Node.nodeId ? invalidNode : n)),
  };

  assert.throws(
    () => validateLedger(invalidLedger, { manifest: SOURCE_MANIFEST }),
    'Schema should reject dangling evidenceIds'
  );
});

test('A13 axis: filter to axis-specific records before asserting properties', async () => {
  const { buildA13Ledger } = await importAxisModule();

  const ledger = await buildA13Ledger(REPO_ROOT);

  const a13Nodes = ledger.nodes.filter((n) => n.axis === AXIS_ID);
  const a13Edges = ledger.edges.filter((e) => e.ownerAxis === AXIS_ID);

  assert.ok(a13Nodes.length >= 4, `A13 nodes: ${a13Nodes.length} >= 4`);

  for (const node of a13Nodes) {
    assert.ok(node.state, `Node ${node.nodeId} has state`);
    assert.ok(node.state.rights !== undefined, `Node ${node.nodeId} has rights field`);

    assert.notEqual(
      node.state.canonicality,
      'canonical',
      `A13 node ${node.nodeId} must not be canonical (no reviewer authority)`
    );

    if (node.state.rights === 'unknown') {
      assert.equal(
        node.state.canonicality,
        'blocked',
        `A13 node ${node.nodeId} with unknown rights must be canonicality=blocked`
      );
    }
  }

  for (const node of a13Nodes) {
    assert.ok(
      Array.isArray(node.evidenceIds) && node.evidenceIds.length > 0,
      `A13 node ${node.nodeId} must have non-empty evidenceIds`
    );
  }

  for (const node of a13Nodes) {
    for (const evId of node.evidenceIds) {
      const ev = ledger.evidence.find((e) => e.evidenceId === evId);
      assert.ok(ev, `Evidence ${evId} referenced by node ${node.nodeId} must exist`);
    }
  }
});

test('A13 axis: module source contains no Date/random calls (determinism)', async () => {
  const fs = await import('node:fs/promises');
  const axisModulePath = join(REPO_ROOT, 'tools/causal-ledger/axes/a13-rights-and-redistribution.mjs');

  const source = await fs.readFile(axisModulePath, 'utf8');

  const hasBadCalls =
    /new\s+Date\s*\(/.test(source) ||
    /Date\.now\s*\(/.test(source) ||
    /Math\.random\s*\(/.test(source);

  assert.ok(
    !hasBadCalls,
    'A13 module must contain zero "new Date(", "Date.now(", "Math.random(" for determinism'
  );
});
