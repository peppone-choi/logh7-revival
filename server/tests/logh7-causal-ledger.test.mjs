import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
  CONTRACT,
  LIMITS,
  SOURCE_MANIFEST,
  SchemaError,
  buildLedger,
  importSources,
  stableStringify,
  validateLedger,
  validateManifest,
} from '../../tools/causal-ledger/index.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const HASH = 'a'.repeat(64);
const recordCommitment = (items) => createHash('sha256').update(stableStringify(items.map(({ recordPointer, recordHash }) => ({ recordPointer, recordHash })).sort((left, right) => left.recordPointer.localeCompare(right.recordPointer) || left.recordHash.localeCompare(right.recordHash)))).digest('hex');
const RECORDS_HASH = recordCommitment([{ recordPointer: '/0', recordHash: HASH }]);
const FIXTURE_MANIFEST = { manifestVersion: '1.0.0', hashMode: 'sha256-utf8-canonical-lf', sources: [{ sourceId: 'fixture', adapter: 'json-array', path: 'fixture.json', sha256: HASH, recordsHash: RECORDS_HASH, selector: 'items', expectedRecords: 1, auxiliary: [] }] };
const FIXTURE_MANIFEST_HASH = createHash('sha256').update(stableStringify(FIXTURE_MANIFEST)).digest('hex');

function evidence(evidenceId = 'run:test:0001') {
  return {
    schemaVersion: '1.0.0', evidenceId, type: 'audit-source', producer: 'test', reviewer: 'reviewer',
    source: { path: 'fixture.json', sha256: HASH, sizeBytes: 2, lineage: 'fixture', rights: 'allowed', recordPointer: '/', recordSha256: HASH, legacyMetadata: { adapter: 'json-array', selector: 'items', expectedRecords: 1, auxiliary: [] } },
    execution: { platform: 'test', runtimeMode: 'node', command: 'node --test', inputs: [], configHash: HASH, startedAt: '2026-07-20T00:00:00.000Z', endedAt: '2026-07-20T00:00:00.000Z', exitCode: 0 },
    observation: { expected: 'valid', observed: 'valid', verdict: 'verified', contradictedClaim: '' },
    artifacts: [],
    correlation: { acceptanceCriteria: ['AC-1'], nodeIds: ['A01:source:fixture'], edgeIds: [] },
    cleanup: { pids: [], ports: [], databases: [], tempPaths: [], guis: [], runtimeWorkspaces: [], residual: 0 },
  };
}

function node(nodeId = 'A01:source:fixture') {
  return {
    schemaVersion: '1.0.0', nodeId, axis: 'A01', type: 'source-record', domain: 'ledger', owner: 'ledger/schema owner', summary: 'fixture',
    preconditions: [], postconditions: [], failureConditions: [], surface: 'data', direction: 'none',
    state: { grade: 'R1', confidence: 'confirmed', canonicality: 'noncanonical', rights: 'allowed', verification: 'verified' },
    lifetime: { creator: 'test', consumer: 'test', disposer: 'test', scope: 'test', hardBound: 1, notApplicableReason: '' },
    evidenceIds: ['run:test:0001'], relatedIssue: 'LOGH7-214', acceptanceCriteria: ['AC-1'], sourceManifestHash: FIXTURE_MANIFEST_HASH,
    unresolved: { impact: '', blocker: '', nextExperiment: '', releaseCondition: '' },
  };
}

function coverage(nodeId = 'A01:source:fixture') {
  return {
    schemaVersion: '1.0.0', coverageId: `A01:coverage:${nodeId.split(':').at(-1)}`, ownerAxis: 'A01', sourceId: 'fixture', sourceHash: HASH,
    recordPointer: '/0', recordHash: HASH, targetNodeIds: [nodeId], evidenceIds: ['run:test:0001'], status: 'imported', reason: '', legacyMetadata: {},
  };
}

function validLedger() {
  return {
    schemaVersion: '1.0.0', sourceManifestHash: FIXTURE_MANIFEST_HASH,
    nodes: [node()], edges: [], evidence: [evidence()], coverage: [coverage()], transitions: [],
    migrations: [{ schemaVersion: '1.0.0', migrationId: 'A01:migration:bootstrap', sourceVersion: '0.0.0', targetVersion: '1.0.0', transform: 'identity-bootstrap', beforeHash: HASH, afterHash: FIXTURE_MANIFEST_HASH, rollback: 'discard-generated-ledger' }],
    axisDependencies: structuredClone(CONTRACT.axisDependencies), importReceipts: [receipt()],
  };
}

function receipt() {
  return { sourceId: 'fixture', path: 'fixture.json', hashMode: 'sha256-utf8-canonical-lf', sourceHash: HASH, recordsHash: RECORDS_HASH, source: 1, imported: 1, excluded: 0, rejected: 0, loss: 0, selector: 'items', auxiliary: [] };
}

function dependencyEdge(from, to) {
  return {
    schemaVersion: '1.0.0', edgeId: `A01:edge:${from.split(':').at(-1)}--depends-on--${to.split(':').at(-1)}`, ownerAxis: 'A01', edgeClass: 'dependency', from, to, verb: 'depends-on',
    ordering: { correlationId: 'c', causationId: 'c', sequence: 1, temporalPredicate: 'before' },
    stateChange: { before: [], readSet: [], writeSet: [], after: [], transactionBoundary: 'none' }, outcome: { kind: 'accepted' },
    replay: { idempotencyKey: '', dedupeWindow: '', duplicateOutcome: '' },
    evidence: { grade: 'R1', confidence: 'confirmed', provenance: 'fixture', evidenceIds: ['run:test:0001'] },
  };
}

function transition(nodeId, transitionId, from, to) {
  return {
    schemaVersion: '1.0.0', transitionId, nodeId, from, to, evidenceIds: ['run:test:0001'], sourceManifestHash: FIXTURE_MANIFEST_HASH,
    reviewer: 'reviewer', approvalRef: 'approval', at: '2026-07-20T00:00:00.000Z', reason: 'test',
  };
}

function transitionState(state) {
  const { grade, confidence, canonicality, verification } = state;
  return { grade, confidence, canonicality, verification };
}

function validateFixture(ledger, options = {}) {
  return validateLedger(ledger, { manifest: FIXTURE_MANIFEST, ...options });
}

function expectReason(reason, mutate) {
  const ledger = validLedger();
  mutate(ledger);
  assert.throws(() => validateFixture(ledger), (error) => {
    assert.equal(error instanceof SchemaError, true);
    assert.equal(error.code, 'ERR_CAUSAL_LEDGER_SCHEMA');
    assert.equal(error.details.reason, reason);
    assert.deepEqual(Object.keys(error.details).sort().filter((key) => key !== 'id'), ['path', 'reason']);
    return true;
  });
}

test('1.0.0 계약과 승인된 DAG를 기계 판독 형태로 고정한다', () => {
  assert.equal(CONTRACT.schemaVersion, '1.0.0');
  assert.deepEqual(Object.keys(CONTRACT.axisDependencies), ['D0', 'A01', 'A02', 'A03', 'A04', 'A05', 'A06', 'A07', 'A08', 'A09', 'A10', 'A11', 'A12', 'A13', 'A14', 'A15']);
  for (const axis of Object.keys(CONTRACT.axisDependencies).slice(2)) assert.equal(CONTRACT.axisDependencies[axis].includes('A01'), true);
  assert.deepEqual(CONTRACT.axisDependencies.A10, ['A01', 'A02', 'A03', 'A04', 'A05', 'A06', 'A07', 'A08', 'A09', 'A11', 'A12', 'A13', 'A14', 'A15']);
  assert.throws(() => { CONTRACT.axisDependencies.A02 = []; }, TypeError);
  assert.throws(() => { SOURCE_MANIFEST.sources[0].expectedRecords = 0; }, TypeError);
  assert.equal(validateFixture(validLedger()), true);
});

test('필수 schema 위반을 구조화 오류로 fail-closed한다', () => {
  const cases = [
    ['json-unsafe', (x) => { x.nodes[0].summary = Number.NaN; }],
    ['unknown-key', (x) => { x.nodes[0].extra = true; }],
    ['duplicate-id', (x) => { x.evidence[0].evidenceId = x.nodes[0].nodeId; }],
    ['missing-owner', (x) => { x.nodes[0].owner = ''; }],
    ['missing-provenance', (x) => { x.evidence[0].source.sha256 = ''; }],
    ['missing-acceptance-criteria', (x) => { x.nodes[0].acceptanceCriteria = []; }],
    ['missing-acceptance-criteria', (x) => { x.evidence[0].correlation.acceptanceCriteria = []; }],
    ['missing-evidence', (x) => { x.nodes[0].evidenceIds = []; }],
    ['dangling-evidence', (x) => { x.nodes[0].evidenceIds = ['run:test:missing']; }],
    ['orphan-node', (x) => { x.coverage = []; }],
    ['orphan-coverage', (x) => { x.coverage[0].targetNodeIds = ['A01:source:missing']; }],
    ['dependency-self', (x) => { x.axisDependencies.A01 = ['A01']; }],
    ['dependency-unknown', (x) => { x.axisDependencies.A01 = ['AXX']; }],
    ['dependency-cycle', (x) => { x.axisDependencies.D0 = ['A01']; }],
    ['dag-drift', (x) => { x.axisDependencies.A02 = []; }],
    ['dependency-self', (x) => { x.edges.push(dependencyEdge(x.nodes[0].nodeId, x.nodes[0].nodeId)); }],
    ['dependency-cycle', (x) => {
      const right = node('A01:source:right'); x.nodes.push(right); x.coverage[0].targetNodeIds.push(right.nodeId);
      x.edges.push(dependencyEdge(x.nodes[0].nodeId, right.nodeId), dependencyEdge(right.nodeId, x.nodes[0].nodeId));
    }],
    ['invalid-id', (x) => { const right = node('A01:source:right'); x.nodes.push(right); x.coverage[0].targetNodeIds.push(right.nodeId); const edge = dependencyEdge(x.nodes[0].nodeId, right.nodeId); edge.edgeId = 'A01:edge:malformed'; x.edges.push(edge); }],
  ];
  for (const [reason, mutate] of cases) expectReason(reason, mutate);
});

test('byte cap, sparse array, semver, ID 축과 receipt 정합을 강제한다', () => {
  expectReason('json-unsafe', (x) => { x.nodes[0].preconditions = new Array(2); x.nodes[0].preconditions[1] = 'present'; });
  expectReason('input-cap', (x) => { x.nodes[0].summary = 'x'.repeat(LIMITS.maxBytes); });
  expectReason('invalid-semver', (x) => { x.migrations[0].sourceVersion = 'latest'; });
  expectReason('invalid-semver', (x) => { x.migrations[0].sourceVersion = '01.0.0'; });
  expectReason('migration-missing', (x) => { x.migrations = []; });
  expectReason('migration-chain-mismatch', (x) => { x.migrations[0].targetVersion = '9.0.0'; });
  expectReason('migration-chain-mismatch', (x) => { x.migrations[0].afterHash = 'b'.repeat(64); });
  expectReason('id-axis-mismatch', (x) => { x.nodes[0].axis = 'A02'; });
  expectReason('source-manifest-mismatch', (x) => { x.nodes[0].sourceManifestHash = 'b'.repeat(64); });
  for (const key of ['path', 'sha256', 'redaction', 'retention', 'freshness']) expectReason('invalid-artifact', (x) => { x.evidence[0].artifacts = [{ path: 'fixture.json', sha256: HASH, redaction: 'none', retention: 'test-only', freshness: 'fresh' }]; x.evidence[0].artifacts[0][key] = ''; });
  expectReason('missing-provenance', (x) => { x.importReceipts = []; });
  expectReason('import-receipt-mismatch', (x) => { x.importReceipts[0].hashMode = 'md5'; });
  expectReason('import-receipt-mismatch', (x) => { x.importReceipts = [receipt()]; x.coverage[0].status = 'excluded'; });
  expectReason('import-receipt-mismatch', (x) => { x.importReceipts = [receipt()]; x.coverage[0].sourceHash = 'b'.repeat(64); });
  expectReason('import-receipt-mismatch', (x) => { x.importReceipts[0].path = 'other.json'; });
  expectReason('import-receipt-mismatch', (x) => { x.importReceipts[0].selector = 'other'; });
  expectReason('import-receipt-mismatch', (x) => { x.importReceipts[0].auxiliary = [{ selector: 'extra', count: 1, reason: 'invented' }]; });

  const artifactLedger = validLedger();
  artifactLedger.evidence[0].artifacts = [{ path: 'fixture.json', sha256: HASH, redaction: 'none', retention: 'test-only', freshness: 'fresh' }];
  assert.throws(() => validateFixture(artifactLedger), (error) => error.details.reason === 'artifact-unverified');
  assert.equal(validateFixture(artifactLedger, { artifactVerifier: () => ({ exists: true, sha256: HASH, freshness: 'fresh' }) }), true);
  for (const [reason, observed] of [
    ['artifact-missing', { exists: false }],
    ['artifact-hash-mismatch', { exists: true, sha256: 'b'.repeat(64), freshness: 'fresh' }],
    ['stale-lineage', { exists: true, sha256: HASH, freshness: 'stale', stale: true }],
  ]) assert.throws(() => validateFixture(artifactLedger, { artifactVerifier: () => observed }), (error) => error.details.reason === reason);
});

test('dangling endpoint, direction, P3 오염과 canonical 전이를 거부한다', () => {
  expectReason('dangling-endpoint', (x) => {
    x.edges.push({ schemaVersion: '1.0.0', edgeId: 'A01:edge:fixture--requests--missing', ownerAxis: 'A01', edgeClass: 'causal', from: x.nodes[0].nodeId, to: 'A01:source:missing', verb: 'requests', ordering: { correlationId: 'c', causationId: 'c', sequence: 1, temporalPredicate: 'after' }, stateChange: { before: [], readSet: [], writeSet: [], after: [], transactionBoundary: 'none' }, outcome: { kind: 'accepted' }, replay: { idempotencyKey: '', dedupeWindow: '', duplicateOutcome: '' }, evidence: { grade: 'R1', confidence: 'confirmed', provenance: 'fixture', evidenceIds: ['run:test:0001'] } });
  });
  expectReason('invalid-direction', (x) => {
    const right = node('A01:source:right'); right.direction = 's2c'; x.nodes.push(right); x.coverage.push(coverage(right.nodeId));
    x.nodes[0].direction = 's2c';
    x.edges.push({ schemaVersion: '1.0.0', edgeId: 'A01:edge:fixture--requests--right', ownerAxis: 'A01', edgeClass: 'causal', from: x.nodes[0].nodeId, to: right.nodeId, verb: 'requests', ordering: { correlationId: 'c', causationId: 'c', sequence: 1, temporalPredicate: 'after' }, stateChange: { before: [], readSet: [], writeSet: [], after: [], transactionBoundary: 'none' }, outcome: { kind: 'accepted' }, replay: { idempotencyKey: '', dedupeWindow: '', duplicateOutcome: '' }, evidence: { grade: 'R1', confidence: 'confirmed', provenance: 'fixture', evidenceIds: ['run:test:0001'] } });
  });
  expectReason('p3-canonical', (x) => { x.nodes[0].state.grade = 'P3'; x.nodes[0].state.canonicality = 'canonical'; });
  for (const mutate of [
    (x) => { x.nodes[0].state.grade = 'I2'; x.nodes[0].state.canonicality = 'canonical'; },
    (x) => { x.nodes[0].state.confidence = 'unknown'; x.nodes[0].state.canonicality = 'canonical'; },
    (x) => { x.nodes[0].state.verification = 'contradicted'; x.nodes[0].state.canonicality = 'canonical'; },
  ]) expectReason('canonical-state-forbidden', mutate);
  expectReason('package-rights-blocked', (x) => { x.nodes[0].surface = 'package'; x.nodes[0].state.rights = 'unknown'; });
  expectReason('canonical-transition-missing', (x) => { x.nodes[0].state.canonicality = 'canonical'; });
  expectReason('p3-canonical-dependency', (x) => {
    const right = node('A01:source:right'); right.state.canonicality = 'canonical'; x.nodes.push(right); x.coverage.push(coverage(right.nodeId)); x.nodes[0].state.grade = 'P3';
    x.nodes[0].unresolved = { impact: 'taint', blocker: 'canonical dependency', nextExperiment: 'find O0/R1 source', releaseCondition: 'superseding node' };
    x.edges.push({ schemaVersion: '1.0.0', edgeId: 'A01:edge:fixture--depends-on--right', ownerAxis: 'A01', edgeClass: 'dependency', from: x.nodes[0].nodeId, to: right.nodeId, verb: 'depends-on', ordering: { correlationId: 'c', causationId: 'c', sequence: 1, temporalPredicate: 'before' }, stateChange: { before: [], readSet: [], writeSet: [], after: [], transactionBoundary: 'none' }, outcome: { kind: 'accepted' }, replay: { idempotencyKey: '', dedupeWindow: '', duplicateOutcome: '' }, evidence: { grade: 'R1', confidence: 'confirmed', provenance: 'fixture', evidenceIds: ['run:test:0001'] } });
  });
  for (const grade of ['I2', 'P3']) expectReason('canonical-transition-forbidden', (x) => { x.transitions.push(transition(x.nodes[0].nodeId, `A01:transition:${grade.toLowerCase()}`, { grade, confidence: 'inferred', canonicality: 'noncanonical', verification: 'partial' }, { grade, confidence: 'confirmed', canonicality: 'canonical', verification: 'verified' })); });
  for (const [confidence, verification] of [['unknown', 'verified'], ['confirmed', 'contradicted']]) expectReason('canonical-transition-forbidden', (x) => { x.transitions.push(transition(x.nodes[0].nodeId, `A01:transition:${confidence}-${verification}`, { grade: 'R1', confidence: 'confirmed', canonicality: 'noncanonical', verification: 'verified' }, { grade: 'R1', confidence, canonicality: 'canonical', verification })); });
  for (const key of ['reviewer', 'approvalRef']) expectReason('canonical-transition-approval-missing', (x) => {
    const item = transition(x.nodes[0].nodeId, `A01:transition:missing-${key.toLowerCase()}`, { grade: 'R1', confidence: 'confirmed', canonicality: 'noncanonical', verification: 'verified' }, { grade: 'R1', confidence: 'confirmed', canonicality: 'canonical', verification: 'verified' });
    item[key] = ''; x.transitions.push(item);
  });
  for (const key of ['evidenceIds', 'reviewer', 'approvalRef', 'at', 'reason']) expectReason('transition-evidence-missing', (x) => {
    const state = transitionState(x.nodes[0].state); const item = transition(x.nodes[0].nodeId, `A01:transition:missing-${key.toLowerCase()}`, state, state);
    item[key] = key === 'evidenceIds' ? [] : ''; x.transitions.push(item);
  });
  expectReason('id-axis-mismatch', (x) => { const state = transitionState(x.nodes[0].state); x.transitions.push(transition(x.nodes[0].nodeId, 'A02:transition:wrong-axis', state, state)); });
  expectReason('transition-state-mismatch', (x) => { x.transitions.push(transition(x.nodes[0].nodeId, 'A01:transition:wrong-final', transitionState(x.nodes[0].state), { grade: 'R1', confidence: 'confirmed', canonicality: 'blocked', verification: 'verified' })); });
  expectReason('transition-state-mismatch', (x) => {
    const current = transitionState(x.nodes[0].state); const blocked = { ...current, canonicality: 'blocked' };
    x.transitions.push(transition(x.nodes[0].nodeId, 'A01:transition:first', current, blocked), transition(x.nodes[0].nodeId, 'A01:transition:second', current, current));
  });

  const canonical = validLedger();
  canonical.nodes[0].state.canonicality = 'canonical';
  canonical.transitions.push(transition(canonical.nodes[0].nodeId, 'A01:transition:canonical', { grade: 'R1', confidence: 'confirmed', canonicality: 'noncanonical', verification: 'verified' }, { grade: 'R1', confidence: 'confirmed', canonicality: 'canonical', verification: 'verified' }));
  assert.equal(validateFixture(canonical), true);
});

test('오류에 원시 입력값을 노출하지 않는다', () => {
  const secret = 'SECRET-RAW-VALUE';
  const ledger = validLedger(); ledger.nodes[0].summary = Number.NaN; ledger.nodes[0].unresolved.impact = secret;
  assert.throws(() => validateFixture(ledger), (error) => {
    assert.equal(JSON.stringify(error).includes(secret), false);
    assert.equal(error.message.includes(secret), false);
    return true;
  });
});

test('12,000-node graph를 비재귀로 검증하고 cap 초과를 거부한다', () => {
  const ledger = validLedger(); ledger.nodes = []; ledger.coverage = []; ledger.edges = [];
  for (let i = 0; i < 12_000; i += 1) {
    const id = `A01:source:n-${i}`; ledger.nodes.push(node(id)); ledger.coverage.push(coverage(id));
    if (i > 0) ledger.edges.push(dependencyEdge(`A01:source:n-${i - 1}`, id));
  }
  ledger.importReceipts[0].source = 12_000; ledger.importReceipts[0].imported = 12_000;
  ledger.importReceipts[0].recordsHash = recordCommitment(ledger.coverage);
  ledger.evidence[0].source.legacyMetadata.expectedRecords = 12_000;
  ledger.evidence[0].correlation.nodeIds = [];
  const graphManifest = structuredClone(FIXTURE_MANIFEST); graphManifest.sources[0].expectedRecords = 12_000; graphManifest.sources[0].recordsHash = ledger.importReceipts[0].recordsHash;
  const graphManifestHash = createHash('sha256').update(stableStringify(graphManifest)).digest('hex');
  ledger.sourceManifestHash = graphManifestHash; ledger.migrations[0].afterHash = graphManifestHash;
  for (const item of ledger.nodes) item.sourceManifestHash = graphManifestHash;
  assert.equal(validateLedger(ledger, { manifest: graphManifest }), true);
  const overCap = validLedger(); overCap.nodes = []; overCap.coverage = [];
  for (let i = 0; i <= LIMITS.maxNodes; i += 1) overCap.nodes.push(node(`A01:source:cap-${i}`));
  assert.throws(() => validateFixture(overCap), (error) => error.details.reason === 'input-cap');
});

test('네 source snapshot을 loss 0으로 import하고 원시 레코드 hash를 고정한다', async () => {
  const { ledger, report } = await importSources(REPO_ROOT);
  assert.deepEqual(report.sources.map(({ sourceId, source, imported, excluded, rejected, loss }) => ({ sourceId, source, imported, excluded, rejected, loss })), [
    { sourceId: 'opcode', source: 22, imported: 22, excluded: 0, rejected: 0, loss: 0 },
    { sourceId: 'exe-re', source: 11593, imported: 11593, excluded: 0, rejected: 0, loss: 0 },
    { sourceId: 'ui-render', source: 8, imported: 8, excluded: 0, rejected: 0, loss: 0 },
    { sourceId: 'data-audit', source: 170, imported: 170, excluded: 0, rejected: 0, loss: 0 },
  ]);
  assert.equal(ledger.coverage.length, 11_793);
  assert.equal(new Set(ledger.coverage.map((item) => item.recordHash)).size > 11_500, true);
  const opcodeLines = (await readFile(join(REPO_ROOT, 'docs/logh7-opcode-coverage-current.md'), 'utf8')).replaceAll('\r\n', '\n').split('\n');
  const opcodeLineIndex = opcodeLines.findIndex((line) => /^\|\s*0x[0-9a-f]+\s*\|\s*0x[0-9a-f]+\s*\|/i.test(line));
  const opcodeRecord = ledger.coverage.find((item) => item.sourceId === 'opcode' && item.recordPointer === `line:${opcodeLineIndex + 1}`);
  assert.equal(opcodeRecord.recordHash, createHash('sha256').update(opcodeLines[opcodeLineIndex]).digest('hex'));
  assert.equal(ledger.coverage.every((item) => /^\/.+|line:\d+$/.test(item.recordPointer)), true);
  assert.deepEqual(report.sources.find((item) => item.sourceId === 'ui-render').auxiliary, [
    { selector: 'uiCatalogImages', count: 116, reason: 'outside primary source denominator' },
    { selector: 'nextLiveQaChecklist', count: 6, reason: 'outside primary source denominator' },
  ]);
  assert.deepEqual(report.sources.find((item) => item.sourceId === 'data-audit').auxiliary, [
    { selector: 'sourceRoots', count: 9, reason: 'outside primary source denominator' },
    { selector: 'featureGates', count: 11, reason: 'outside primary source denominator' },
    { selector: 'reviewQueue', count: 60, reason: 'outside primary source denominator' },
  ]);
  assert.deepEqual(report.sources, ledger.importReceipts);
  assert.equal(validateLedger(ledger), true);
  const manifestDrift = structuredClone(ledger); manifestDrift.importReceipts[0].path = 'invented.md'; manifestDrift.evidence[0].source.path = 'invented.md';
  assert.throws(() => validateLedger(manifestDrift), (error) => error.details.reason === 'import-receipt-mismatch');
  const evidenceDrift = structuredClone(ledger); evidenceDrift.coverage.find((item) => item.sourceId === 'opcode').evidenceIds = ['run:exe-re:snapshot'];
  assert.throws(() => validateLedger(evidenceDrift), (error) => error.details.reason === 'import-receipt-mismatch');
  const recordDrift = structuredClone(ledger); recordDrift.coverage[0].recordHash = 'b'.repeat(64);
  assert.throws(() => validateLedger(recordDrift), (error) => error.details.reason === 'import-receipt-mismatch');
  const unknownManifest = structuredClone(ledger); unknownManifest.sourceManifestHash = 'b'.repeat(64); unknownManifest.migrations.at(-1).afterHash = unknownManifest.sourceManifestHash;
  for (const item of unknownManifest.nodes) item.sourceManifestHash = unknownManifest.sourceManifestHash;
  assert.throws(() => validateLedger(unknownManifest), (error) => error.details.reason === 'source-manifest-mismatch');
});

test('같은 입력은 byte-identical ledger/report를 생성한다', async () => {
  const first = await buildLedger(REPO_ROOT); const second = await buildLedger(REPO_ROOT);
  assert.equal(first.ledgerBytes, second.ledgerBytes);
  assert.equal(first.reportBytes, second.reportBytes);
  assert.equal(first.ledgerBytes, `${stableStringify(JSON.parse(first.ledgerBytes))}\n`);
});

test('artifact 부재, source hash mismatch, record drift를 실패시킨다', async () => {
  const badVersion = structuredClone(SOURCE_MANIFEST); badVersion.manifestVersion = '01.0.0';
  assert.throws(() => validateManifest(badVersion), (error) => error.details.reason === 'invalid-semver');
  const badHashMode = structuredClone(SOURCE_MANIFEST); badHashMode.hashMode = 'sha256';
  assert.throws(() => validateManifest(badHashMode), (error) => error.details.reason === 'record-drift');
  const unknownManifestKey = structuredClone(SOURCE_MANIFEST); unknownManifestKey.sources[0].extra = true;
  assert.throws(() => validateManifest(unknownManifestKey), (error) => error.details.reason === 'unknown-key');
  const badAuxiliary = structuredClone(SOURCE_MANIFEST); badAuxiliary.sources[2].auxiliary[0].count += 1;
  await assert.rejects(importSources(REPO_ROOT, badAuxiliary), (error) => error.details.reason === 'record-drift');
  const temp = await mkdtemp(join(tmpdir(), 'logh7-ledger-'));
  try {
    await assert.rejects(importSources(temp), (error) => error.details.reason === 'artifact-missing');
    const source = join(REPO_ROOT, 'docs/logh7-opcode-coverage-current.md');
    const bad = join(temp, 'docs/logh7-opcode-coverage-current.md');
    await mkdir(dirname(bad), { recursive: true });
    await writeFile(bad, `${await readFile(source, 'utf8')}\nDRIFT\n`, 'utf8');
    await assert.rejects(importSources(temp), (error) => error.details.reason === 'source-hash-mismatch');

    const complete = await mkdtemp(join(tmpdir(), 'logh7-ledger-drift-'));
    try {
      for (const item of SOURCE_MANIFEST.sources) {
        const destination = join(complete, ...item.path.split('/'));
        await mkdir(dirname(destination), { recursive: true });
        await copyFile(join(REPO_ROOT, ...item.path.split('/')), destination);
      }
      const opcodePath = join(complete, 'docs/logh7-opcode-coverage-current.md');
      const drifted = `${(await readFile(opcodePath, 'utf8')).replaceAll('\r\n', '\n')}\n| 0xffff | 0xfffe | Drift | 0x1 | test | test:1 |\n`;
      await writeFile(opcodePath, drifted, 'utf8');
      const manifest = structuredClone(SOURCE_MANIFEST);
      manifest.sources[0].sha256 = createHash('sha256').update(drifted).digest('hex');
      await assert.rejects(importSources(complete, manifest), (error) => error.details.reason === 'record-drift');
    } finally { await rm(complete, { recursive: true, force: true }); }
  } finally { await rm(temp, { recursive: true, force: true }); }
});
