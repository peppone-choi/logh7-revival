import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const TOOL_DIR = dirname(fileURLToPath(import.meta.url));
const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'));

function deepFreeze(root) {
  const stack = [root];
  while (stack.length) {
    const value = stack.pop();
    if (value === null || typeof value !== 'object' || Object.isFrozen(value)) continue;
    Object.freeze(value);
    for (const child of Object.values(value)) stack.push(child);
  }
  return root;
}

export const CONTRACT = deepFreeze(await readJson(join(TOOL_DIR, 'schema.json')));
export const LIMITS = CONTRACT.limits;
export const SOURCE_MANIFEST = deepFreeze(await readJson(join(TOOL_DIR, 'source-manifest.json')));
const HASH_PATTERN = /^[0-9a-f]{64}$/;
const ID_PATTERN = /^(?:A(?:0[1-9]|1[0-5])|run):[a-z][a-z0-9-]*:[a-z0-9][a-z0-9._-]*$/;
const SEMVER_PATTERN = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/;
const HASH_MODE = 'sha256-utf8-canonical-lf';
const ADAPTERS = ['opcode-markdown', 'function-tsv', 'json-array'];

export class SchemaError extends Error {
  constructor(path, reason, id) {
    super('ERR_CAUSAL_LEDGER_SCHEMA');
    this.name = 'SchemaError';
    this.code = 'ERR_CAUSAL_LEDGER_SCHEMA';
    this.details = id === undefined ? { path, reason } : { path, reason, id };
  }
}

function fail(path, reason, id) {
  throw new SchemaError(path, reason, id);
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function sorted(value) {
  if (Array.isArray(value)) return value.map(sorted);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sorted(value[key])]));
  }
  return value;
}

export function stableStringify(value) {
  return JSON.stringify(sorted(value));
}

function assertJsonSafe(root) {
  const active = new WeakSet();
  const stack = [{ value: root, path: '$', depth: 0, exit: false }];
  while (stack.length) {
    const { value, path, depth, exit } = stack.pop();
    if (exit) { active.delete(value); continue; }
    if (depth > LIMITS.maxDepth) fail(path, 'input-cap');
    if (value === null || typeof value === 'string' || typeof value === 'boolean') continue;
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) fail(path, 'json-unsafe');
      continue;
    }
    if (typeof value !== 'object') fail(path, 'json-unsafe');
    if (active.has(value)) fail(path, 'json-unsafe');
    active.add(value);
    if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) fail(path, 'json-unsafe');
    if (Array.isArray(value) && Object.keys(value).length !== value.length) fail(path, 'json-unsafe');
    stack.push({ value, path, depth, exit: true });
    for (const key of Object.keys(value)) stack.push({ value: value[key], path: `${path}/${key}`, depth: depth + 1, exit: false });
  }
}

function exactKeys(value, keyName, path) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) fail(path, 'invalid-type');
  const expected = CONTRACT.keys[keyName];
  for (const key of expected) if (!Object.hasOwn(value, key)) fail(`${path}/${key}`, 'missing-field');
  for (const key of Object.keys(value)) if (!expected.includes(key)) fail(`${path}/${key}`, 'unknown-key');
}

function string(value, path, reason = 'invalid-type') {
  if (typeof value !== 'string') fail(path, reason);
}

function nonempty(value, path, reason) {
  if (typeof value !== 'string' || value.length === 0) fail(path, reason);
}

function array(value, path) {
  if (!Array.isArray(value)) fail(path, 'invalid-type');
}

function enumValue(value, enumName, path) {
  if (!CONTRACT.enums[enumName].includes(value)) fail(path, 'invalid-enum');
}

function hash(value, path, reason = 'missing-provenance') {
  if (typeof value !== 'string' || !HASH_PATTERN.test(value)) fail(path, reason);
}

function id(value, path) {
  if (typeof value !== 'string' || !ID_PATTERN.test(value)) fail(path, 'invalid-id');
}

function validateState(value, path) {
  exactKeys(value, 'state', path);
  enumValue(value.grade, 'grade', `${path}/grade`);
  enumValue(value.confidence, 'confidence', `${path}/confidence`);
  enumValue(value.canonicality, 'canonicality', `${path}/canonicality`);
  enumValue(value.rights, 'rights', `${path}/rights`);
  enumValue(value.verification, 'verification', `${path}/verification`);
  if (value.grade === 'P3' && value.canonicality === 'canonical') fail(path, 'p3-canonical');
  if (value.canonicality === 'canonical' && (value.grade === 'I2' || ['unknown', 'provisional'].includes(value.confidence) || value.verification === 'contradicted')) fail(path, 'canonical-state-forbidden');
}

function validateNode(value, path) {
  exactKeys(value, 'node', path);
  if (value.schemaVersion !== CONTRACT.schemaVersion) fail(`${path}/schemaVersion`, 'schema-version');
  id(value.nodeId, `${path}/nodeId`);
  enumValue(value.axis, 'axis', `${path}/axis`);
  if (!value.nodeId.startsWith(`${value.axis}:`)) fail(`${path}/nodeId`, 'id-axis-mismatch', value.nodeId);
  for (const key of ['type', 'domain', 'summary', 'relatedIssue']) nonempty(value[key], `${path}/${key}`, 'missing-field');
  nonempty(value.owner, `${path}/owner`, 'missing-owner');
  for (const key of ['preconditions', 'postconditions', 'failureConditions']) array(value[key], `${path}/${key}`);
  enumValue(value.surface, 'surface', `${path}/surface`);
  enumValue(value.direction, 'direction', `${path}/direction`);
  validateState(value.state, `${path}/state`);
  if (value.surface === 'package' && ['unknown', 'prohibited'].includes(value.state.rights)) fail(`${path}/state/rights`, 'package-rights-blocked');
  exactKeys(value.lifetime, 'lifetime', `${path}/lifetime`);
  for (const key of ['creator', 'consumer', 'disposer', 'scope', 'notApplicableReason']) string(value.lifetime[key], `${path}/lifetime/${key}`);
  if (!Number.isInteger(value.lifetime.hardBound) || value.lifetime.hardBound < 0) fail(`${path}/lifetime/hardBound`, 'invalid-type');
  array(value.evidenceIds, `${path}/evidenceIds`);
  if (value.evidenceIds.length === 0) fail(`${path}/evidenceIds`, 'missing-evidence');
  array(value.acceptanceCriteria, `${path}/acceptanceCriteria`);
  if (value.acceptanceCriteria.length === 0) fail(`${path}/acceptanceCriteria`, 'missing-acceptance-criteria');
  hash(value.sourceManifestHash, `${path}/sourceManifestHash`);
  exactKeys(value.unresolved, 'unresolved', `${path}/unresolved`);
  for (const key of CONTRACT.keys.unresolved) string(value.unresolved[key], `${path}/unresolved/${key}`);
  if ((value.state.grade === 'P3' || ['unknown', 'provisional'].includes(value.state.confidence)) &&
      ['impact', 'blocker', 'nextExperiment', 'releaseCondition'].some((key) => value.unresolved[key].length === 0)) fail(`${path}/unresolved`, 'missing-unresolved-contract');
}

function validateEdge(value, path) {
  exactKeys(value, 'edge', path);
  if (value.schemaVersion !== CONTRACT.schemaVersion) fail(`${path}/schemaVersion`, 'schema-version');
  id(value.edgeId, `${path}/edgeId`);
  enumValue(value.ownerAxis, 'axis', `${path}/ownerAxis`);
  if (!value.edgeId.startsWith(`${value.ownerAxis}:`)) fail(`${path}/edgeId`, 'id-axis-mismatch', value.edgeId);
  enumValue(value.edgeClass, 'edgeClass', `${path}/edgeClass`);
  id(value.from, `${path}/from`); id(value.to, `${path}/to`);
  enumValue(value.verb, 'verb', `${path}/verb`);
  const expectedEdgeId = `${value.ownerAxis}:edge:${value.from.split(':').at(-1)}--${value.verb}--${value.to.split(':').at(-1)}`;
  if (value.edgeId !== expectedEdgeId) fail(`${path}/edgeId`, 'invalid-id', value.edgeId);
  exactKeys(value.ordering, 'ordering', `${path}/ordering`);
  for (const key of ['correlationId', 'causationId', 'temporalPredicate']) string(value.ordering[key], `${path}/ordering/${key}`);
  if (!Number.isInteger(value.ordering.sequence)) fail(`${path}/ordering/sequence`, 'invalid-type');
  exactKeys(value.stateChange, 'stateChange', `${path}/stateChange`);
  for (const key of ['before', 'readSet', 'writeSet', 'after']) array(value.stateChange[key], `${path}/stateChange/${key}`);
  string(value.stateChange.transactionBoundary, `${path}/stateChange/transactionBoundary`);
  exactKeys(value.outcome, 'outcome', `${path}/outcome`); nonempty(value.outcome.kind, `${path}/outcome/kind`, 'missing-field');
  exactKeys(value.replay, 'replay', `${path}/replay`);
  for (const key of CONTRACT.keys.replay) string(value.replay[key], `${path}/replay/${key}`);
  exactKeys(value.evidence, 'edgeEvidence', `${path}/evidence`);
  enumValue(value.evidence.grade, 'grade', `${path}/evidence/grade`);
  enumValue(value.evidence.confidence, 'confidence', `${path}/evidence/confidence`);
  nonempty(value.evidence.provenance, `${path}/evidence/provenance`, 'missing-provenance');
  array(value.evidence.evidenceIds, `${path}/evidence/evidenceIds`);
  if (value.evidence.evidenceIds.length === 0) fail(`${path}/evidence/evidenceIds`, 'missing-evidence');
}

function validateEvidence(value, path, artifactVerifier) {
  exactKeys(value, 'evidence', path);
  if (value.schemaVersion !== CONTRACT.schemaVersion) fail(`${path}/schemaVersion`, 'schema-version');
  id(value.evidenceId, `${path}/evidenceId`);
  for (const key of ['type', 'producer', 'reviewer']) nonempty(value[key], `${path}/${key}`, 'missing-owner');
  exactKeys(value.source, 'source', `${path}/source`);
  nonempty(value.source.path, `${path}/source/path`, 'missing-provenance');
  hash(value.source.sha256, `${path}/source/sha256`); hash(value.source.recordSha256, `${path}/source/recordSha256`);
  if (!Number.isInteger(value.source.sizeBytes) || value.source.sizeBytes < 0) fail(`${path}/source/sizeBytes`, 'invalid-type');
  for (const key of ['lineage', 'recordPointer']) nonempty(value.source[key], `${path}/source/${key}`, 'missing-provenance');
  enumValue(value.source.rights, 'rights', `${path}/source/rights`);
  if (value.source.legacyMetadata === null || typeof value.source.legacyMetadata !== 'object' || Array.isArray(value.source.legacyMetadata)) fail(`${path}/source/legacyMetadata`, 'invalid-type');
  exactKeys(value.execution, 'execution', `${path}/execution`);
  for (const key of ['platform', 'runtimeMode', 'command', 'configHash', 'startedAt', 'endedAt']) string(value.execution[key], `${path}/execution/${key}`);
  array(value.execution.inputs, `${path}/execution/inputs`);
  if (!Number.isInteger(value.execution.exitCode)) fail(`${path}/execution/exitCode`, 'invalid-type');
  exactKeys(value.observation, 'observation', `${path}/observation`);
  for (const key of CONTRACT.keys.observation) string(value.observation[key], `${path}/observation/${key}`);
  array(value.artifacts, `${path}/artifacts`);
  value.artifacts.forEach((artifact, index) => {
    const artifactPath = `${path}/artifacts/${index}`;
    exactKeys(artifact, 'artifact', artifactPath);
    nonempty(artifact.path, `${artifactPath}/path`, 'invalid-artifact');
    hash(artifact.sha256, `${artifactPath}/sha256`, 'invalid-artifact');
    for (const key of ['redaction', 'retention', 'freshness']) nonempty(artifact[key], `${artifactPath}/${key}`, 'invalid-artifact');
    if (typeof artifactVerifier !== 'function') fail(artifactPath, 'artifact-unverified');
    const observed = artifactVerifier(artifact);
    if (observed?.exists !== true) fail(artifactPath, 'artifact-missing');
    if (observed.sha256 !== artifact.sha256) fail(artifactPath, 'artifact-hash-mismatch');
    if (observed.freshness !== artifact.freshness || observed.stale === true) fail(artifactPath, 'stale-lineage');
  });
  exactKeys(value.correlation, 'correlation', `${path}/correlation`);
  for (const key of CONTRACT.keys.correlation) array(value.correlation[key], `${path}/correlation/${key}`);
  if (value.correlation.acceptanceCriteria.length === 0) fail(`${path}/correlation/acceptanceCriteria`, 'missing-acceptance-criteria');
  exactKeys(value.cleanup, 'cleanup', `${path}/cleanup`);
  for (const key of CONTRACT.keys.cleanup.filter((key) => key !== 'residual')) array(value.cleanup[key], `${path}/cleanup/${key}`);
  if (!Number.isInteger(value.cleanup.residual) || value.cleanup.residual < 0) fail(`${path}/cleanup/residual`, 'invalid-type');
}

function validateCoverage(value, path) {
  exactKeys(value, 'coverage', path);
  if (value.schemaVersion !== CONTRACT.schemaVersion) fail(`${path}/schemaVersion`, 'schema-version');
  id(value.coverageId, `${path}/coverageId`); enumValue(value.ownerAxis, 'axis', `${path}/ownerAxis`);
  if (!value.coverageId.startsWith(`${value.ownerAxis}:`)) fail(`${path}/coverageId`, 'id-axis-mismatch', value.coverageId);
  nonempty(value.sourceId, `${path}/sourceId`, 'missing-provenance'); hash(value.sourceHash, `${path}/sourceHash`);
  nonempty(value.recordPointer, `${path}/recordPointer`, 'missing-provenance'); hash(value.recordHash, `${path}/recordHash`);
  array(value.targetNodeIds, `${path}/targetNodeIds`); array(value.evidenceIds, `${path}/evidenceIds`);
  if (value.targetNodeIds.length === 0) fail(`${path}/targetNodeIds`, 'orphan-coverage');
  if (value.evidenceIds.length === 0) fail(`${path}/evidenceIds`, 'missing-evidence');
  enumValue(value.status, 'coverageStatus', `${path}/status`); string(value.reason, `${path}/reason`);
  if (value.legacyMetadata === null || typeof value.legacyMetadata !== 'object' || Array.isArray(value.legacyMetadata)) fail(`${path}/legacyMetadata`, 'invalid-type');
}

function validateTransition(value, path) {
  exactKeys(value, 'transition', path);
  if (value.schemaVersion !== CONTRACT.schemaVersion) fail(`${path}/schemaVersion`, 'schema-version');
  id(value.transitionId, `${path}/transitionId`); id(value.nodeId, `${path}/nodeId`);
  for (const key of ['from', 'to']) {
    exactKeys(value[key], 'transitionState', `${path}/${key}`);
    enumValue(value[key].grade, 'grade', `${path}/${key}/grade`);
    enumValue(value[key].confidence, 'confidence', `${path}/${key}/confidence`);
    enumValue(value[key].canonicality, 'canonicality', `${path}/${key}/canonicality`);
    enumValue(value[key].verification, 'verification', `${path}/${key}/verification`);
  }
  array(value.evidenceIds, `${path}/evidenceIds`); hash(value.sourceManifestHash, `${path}/sourceManifestHash`);
  for (const key of ['reviewer', 'approvalRef', 'at', 'reason']) string(value[key], `${path}/${key}`);
  if (value.evidenceIds.length === 0 || ['reviewer', 'approvalRef', 'at', 'reason'].some((key) => value[key].length === 0)) {
    if (value.to.canonicality === 'canonical' && (!value.reviewer || !value.approvalRef)) fail(path, 'canonical-transition-approval-missing');
    fail(path, 'transition-evidence-missing');
  }
  if (value.to.canonicality === 'canonical') {
    if (['I2', 'P3'].includes(value.from.grade) || ['I2', 'P3'].includes(value.to.grade) || ['unknown', 'provisional'].includes(value.from.confidence) || ['unknown', 'provisional'].includes(value.to.confidence) || value.from.verification === 'contradicted' || value.to.verification === 'contradicted') fail(path, 'canonical-transition-forbidden');
    if (!value.reviewer || !value.approvalRef || value.evidenceIds.length === 0) fail(path, 'canonical-transition-approval-missing');
  }
}

function validateMigration(value, path) {
  exactKeys(value, 'migration', path);
  if (value.schemaVersion !== CONTRACT.schemaVersion) fail(`${path}/schemaVersion`, 'schema-version');
  id(value.migrationId, `${path}/migrationId`);
  for (const key of ['sourceVersion', 'targetVersion', 'transform', 'rollback']) nonempty(value[key], `${path}/${key}`, 'missing-field');
  if (!SEMVER_PATTERN.test(value.sourceVersion) || !SEMVER_PATTERN.test(value.targetVersion)) fail(path, 'invalid-semver', value.migrationId);
  hash(value.beforeHash, `${path}/beforeHash`); hash(value.afterHash, `${path}/afterHash`);
}

function validateReceipt(value, path) {
  exactKeys(value, 'receipt', path);
  for (const key of ['sourceId', 'path', 'hashMode', 'selector']) nonempty(value[key], `${path}/${key}`, 'missing-provenance');
  hash(value.sourceHash, `${path}/sourceHash`); hash(value.recordsHash, `${path}/recordsHash`);
  if (value.hashMode !== HASH_MODE) fail(`${path}/hashMode`, 'import-receipt-mismatch', value.sourceId);
  for (const key of ['source', 'imported', 'excluded', 'rejected', 'loss']) if (!Number.isInteger(value[key]) || value[key] < 0) fail(`${path}/${key}`, 'invalid-type');
  array(value.auxiliary, `${path}/auxiliary`);
  value.auxiliary.forEach((item, index) => {
    exactKeys(item, 'auxiliary', `${path}/auxiliary/${index}`);
    nonempty(item.selector, `${path}/auxiliary/${index}/selector`, 'missing-field');
    if (!Number.isInteger(item.count) || item.count < 0) fail(`${path}/auxiliary/${index}/count`, 'invalid-type');
    nonempty(item.reason, `${path}/auxiliary/${index}/reason`, 'missing-field');
  });
  if (value.source !== value.imported + value.excluded + value.rejected || value.loss !== value.source - value.imported - value.excluded - value.rejected) fail(path, 'import-loss');
}

export function validateManifest(manifest) {
  assertJsonSafe(manifest);
  exactKeys(manifest, 'manifest', '$/manifest');
  if (!SEMVER_PATTERN.test(manifest.manifestVersion)) fail('$/manifest/manifestVersion', 'invalid-semver');
  if (manifest.hashMode !== HASH_MODE) fail('$/manifest/hashMode', 'record-drift');
  array(manifest.sources, '$/manifest/sources');
  if (manifest.sources.length === 0) fail('$/manifest/sources', 'missing-provenance');
  const sourceIds = new Set();
  manifest.sources.forEach((source, index) => {
    const path = `$/manifest/sources/${index}`;
    exactKeys(source, 'manifestSource', path);
    for (const key of ['sourceId', 'path', 'selector']) nonempty(source[key], `${path}/${key}`, 'missing-provenance');
    if (sourceIds.has(source.sourceId)) fail('$/manifest/sources', 'duplicate-id', source.sourceId);
    sourceIds.add(source.sourceId);
    if (!ADAPTERS.includes(source.adapter)) fail(`${path}/adapter`, 'invalid-enum');
    hash(source.sha256, `${path}/sha256`); hash(source.recordsHash, `${path}/recordsHash`);
    if (!Number.isInteger(source.expectedRecords) || source.expectedRecords < 1) fail(`${path}/expectedRecords`, 'invalid-type');
    array(source.auxiliary, `${path}/auxiliary`);
    source.auxiliary.forEach((item, auxiliaryIndex) => {
      const auxiliaryPath = `${path}/auxiliary/${auxiliaryIndex}`;
      exactKeys(item, 'auxiliary', auxiliaryPath);
      nonempty(item.selector, `${auxiliaryPath}/selector`, 'missing-field');
      if (!Number.isInteger(item.count) || item.count < 0) fail(`${auxiliaryPath}/count`, 'invalid-type');
      nonempty(item.reason, `${auxiliaryPath}/reason`, 'missing-field');
    });
  });
  return true;
}

function validateDag(dependencies) {
  const axes = Object.keys(CONTRACT.axisDependencies);
  for (const [axis, deps] of Object.entries(dependencies)) {
    if (!axes.includes(axis)) fail(`$/axisDependencies/${axis}`, 'dependency-unknown', axis);
    if (!Array.isArray(deps)) fail(`$/axisDependencies/${axis}`, 'invalid-type', axis);
    for (const dependency of deps) {
      if (!axes.includes(dependency)) fail(`$/axisDependencies/${axis}`, 'dependency-unknown', dependency);
      if (dependency === axis) fail(`$/axisDependencies/${axis}`, 'dependency-self', axis);
    }
  }
  const incoming = new Map(axes.map((axis) => [axis, 0]));
  const outgoing = new Map(axes.map((axis) => [axis, []]));
  for (const [axis, deps] of Object.entries(dependencies)) for (const dependency of deps) { incoming.set(axis, incoming.get(axis) + 1); outgoing.get(dependency).push(axis); }
  const queue = axes.filter((axis) => incoming.get(axis) === 0);
  let visited = 0;
  for (let index = 0; index < queue.length; index += 1) {
    const axis = queue[index]; visited += 1;
    for (const next of outgoing.get(axis)) { incoming.set(next, incoming.get(next) - 1); if (incoming.get(next) === 0) queue.push(next); }
  }
  if (visited !== axes.length) fail('$/axisDependencies', 'dependency-cycle');
  if (stableStringify(dependencies) !== stableStringify(CONTRACT.axisDependencies)) fail('$/axisDependencies', 'dag-drift');
}

function validateDependencyEdges(edges, nodeIds) {
  const dependencyEdges = edges.filter((edge) => edge.edgeClass === 'dependency');
  const incoming = new Map([...nodeIds].map((nodeId) => [nodeId, 0]));
  const outgoing = new Map([...nodeIds].map((nodeId) => [nodeId, []]));
  for (const edge of dependencyEdges) {
    if (edge.from === edge.to) fail('$/edges', 'dependency-self', edge.edgeId);
    incoming.set(edge.to, incoming.get(edge.to) + 1); outgoing.get(edge.from).push(edge.to);
  }
  const queue = [...nodeIds].filter((nodeId) => incoming.get(nodeId) === 0);
  let visited = 0;
  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index]; visited += 1;
    for (const next of outgoing.get(current)) { incoming.set(next, incoming.get(next) - 1); if (incoming.get(next) === 0) queue.push(next); }
  }
  if (visited !== nodeIds.size) fail('$/edges', 'dependency-cycle');
}

function coverageCommitment(items) {
  const records = items.map(({ recordPointer, recordHash }) => ({ recordPointer, recordHash }))
    .sort((left, right) => left.recordPointer.localeCompare(right.recordPointer) || left.recordHash.localeCompare(right.recordHash));
  return sha256(stableStringify(records));
}

export function validateLedger(ledger, { artifactVerifier, manifest = SOURCE_MANIFEST } = {}) {
  assertJsonSafe(ledger);
  validateManifest(manifest);
  if (Buffer.byteLength(stableStringify(ledger)) > LIMITS.maxBytes) fail('$', 'input-cap');
  exactKeys(ledger, 'ledger', '$');
  if (ledger.schemaVersion !== CONTRACT.schemaVersion) fail('$/schemaVersion', 'schema-version');
  hash(ledger.sourceManifestHash, '$/sourceManifestHash');
  if (ledger.sourceManifestHash !== sha256(stableStringify(manifest))) fail('$/sourceManifestHash', 'source-manifest-mismatch');
  for (const key of ['nodes', 'edges', 'evidence', 'coverage', 'transitions', 'migrations', 'importReceipts']) array(ledger[key], `$/${key}`);
  if (ledger.nodes.length > LIMITS.maxNodes || ledger.nodes.length + ledger.edges.length + ledger.evidence.length + ledger.coverage.length + ledger.transitions.length + ledger.migrations.length > LIMITS.maxRecords) fail('$', 'input-cap');
  ledger.nodes.forEach((value, index) => validateNode(value, `$/nodes/${index}`));
  ledger.edges.forEach((value, index) => validateEdge(value, `$/edges/${index}`));
  ledger.evidence.forEach((value, index) => validateEvidence(value, `$/evidence/${index}`, artifactVerifier));
  ledger.coverage.forEach((value, index) => validateCoverage(value, `$/coverage/${index}`));
  ledger.transitions.forEach((value, index) => validateTransition(value, `$/transitions/${index}`));
  ledger.migrations.forEach((value, index) => validateMigration(value, `$/migrations/${index}`));
  ledger.importReceipts.forEach((value, index) => validateReceipt(value, `$/importReceipts/${index}`));
  if (ledger.migrations.length === 0) fail('$/migrations', 'migration-missing');
  for (let index = 1; index < ledger.migrations.length; index += 1) {
    const previous = ledger.migrations[index - 1]; const current = ledger.migrations[index];
    if (current.sourceVersion !== previous.targetVersion || current.beforeHash !== previous.afterHash) fail(`$/migrations/${index}`, 'migration-chain-mismatch', current.migrationId);
  }
  const latestMigration = ledger.migrations.at(-1);
  if (latestMigration.targetVersion !== CONTRACT.schemaVersion || latestMigration.afterHash !== ledger.sourceManifestHash) fail('$/migrations', 'migration-chain-mismatch', latestMigration.migrationId);

  const allIds = new Set();
  for (const [collection, key] of [['nodes', 'nodeId'], ['edges', 'edgeId'], ['evidence', 'evidenceId'], ['coverage', 'coverageId'], ['transitions', 'transitionId'], ['migrations', 'migrationId']]) {
    for (const item of ledger[collection]) { if (allIds.has(item[key])) fail(`$/${collection}`, 'duplicate-id', item[key]); allIds.add(item[key]); }
  }
  const nodeMap = new Map(ledger.nodes.map((item) => [item.nodeId, item]));
  const evidenceIds = new Set(ledger.evidence.map((item) => item.evidenceId));
  const evidenceMap = new Map(ledger.evidence.map((item) => [item.evidenceId, item]));
  const edgeIds = new Set(ledger.edges.map((item) => item.edgeId));
  const requireEvidence = (ids, path) => { for (const evidenceId of ids) if (!evidenceIds.has(evidenceId)) fail(path, 'dangling-evidence', evidenceId); };
  for (const node of ledger.nodes) {
    if (node.sourceManifestHash !== ledger.sourceManifestHash) fail('$/nodes', 'source-manifest-mismatch', node.nodeId);
    requireEvidence(node.evidenceIds, '$/nodes');
  }
  for (const edge of ledger.edges) {
    if (!nodeMap.has(edge.from) || !nodeMap.has(edge.to)) fail('$/edges', 'dangling-endpoint', edge.edgeId);
    requireEvidence(edge.evidence.evidenceIds, '$/edges');
    const rule = CONTRACT.directionRules[edge.verb];
    if (rule && (nodeMap.get(edge.from).direction !== rule[0] || nodeMap.get(edge.to).direction !== rule[1])) fail('$/edges', 'invalid-direction', edge.edgeId);
    if (edge.edgeClass === 'dependency' && nodeMap.get(edge.from).state.grade === 'P3' && nodeMap.get(edge.to).state.canonicality === 'canonical') fail('$/edges', 'p3-canonical-dependency', edge.edgeId);
  }
  const coveredNodes = new Set();
  for (const item of ledger.coverage) {
    requireEvidence(item.evidenceIds, '$/coverage');
    for (const nodeId of item.targetNodeIds) { if (!nodeMap.has(nodeId)) fail('$/coverage', 'orphan-coverage', item.coverageId); coveredNodes.add(nodeId); }
  }
  for (const nodeId of nodeMap.keys()) if (!coveredNodes.has(nodeId)) fail('$/nodes', 'orphan-node', nodeId);
  for (const transition of ledger.transitions) {
    if (transition.sourceManifestHash !== ledger.sourceManifestHash) fail('$/transitions', 'source-manifest-mismatch', transition.transitionId);
    if (!nodeMap.has(transition.nodeId)) fail('$/transitions', 'dangling-endpoint', transition.transitionId);
    const node = nodeMap.get(transition.nodeId);
    if (!transition.transitionId.startsWith(`${node.axis}:`)) fail('$/transitions', 'id-axis-mismatch', transition.transitionId);
    requireEvidence(transition.evidenceIds, '$/transitions');
  }
  const stateView = ({ grade, confidence, canonicality, verification }) => ({ grade, confidence, canonicality, verification });
  for (const node of ledger.nodes) {
    const transitions = ledger.transitions.filter((transition) => transition.nodeId === node.nodeId);
    for (let index = 1; index < transitions.length; index += 1) {
      if (stableStringify(transitions[index].from) !== stableStringify(transitions[index - 1].to)) fail('$/transitions', 'transition-state-mismatch', transitions[index].transitionId);
    }
    if (transitions.length > 0 && stableStringify(transitions.at(-1).to) !== stableStringify(stateView(node.state))) fail('$/transitions', 'transition-state-mismatch', transitions.at(-1).transitionId);
  }
  for (const item of ledger.nodes) if (item.state.canonicality === 'canonical' && !ledger.transitions.some((transition) => transition.nodeId === item.nodeId && transition.to.canonicality === 'canonical')) fail('$/nodes', 'canonical-transition-missing', item.nodeId);
  for (const item of ledger.evidence) {
    for (const nodeId of item.correlation.nodeIds) if (!nodeMap.has(nodeId)) fail('$/evidence', 'dangling-endpoint', item.evidenceId);
    for (const edgeId of item.correlation.edgeIds) if (!edgeIds.has(edgeId)) fail('$/evidence', 'dangling-endpoint', item.evidenceId);
  }
  if (ledger.importReceipts.length === 0) fail('$/importReceipts', 'missing-provenance');
  {
    const receipts = new Map();
    for (const receipt of ledger.importReceipts) {
      if (receipts.has(receipt.sourceId)) fail('$/importReceipts', 'duplicate-id', receipt.sourceId);
      receipts.set(receipt.sourceId, receipt);
    }
    for (const item of ledger.coverage) {
      const receipt = receipts.get(item.sourceId);
      if (!receipt || receipt.sourceHash !== item.sourceHash) fail('$/coverage', 'import-receipt-mismatch', item.coverageId);
    }
    for (const receipt of receipts.values()) {
      const items = ledger.coverage.filter((item) => item.sourceId === receipt.sourceId);
      const counts = Object.fromEntries(CONTRACT.enums.coverageStatus.map((status) => [status, items.filter((item) => item.status === status).length]));
      if (items.length !== receipt.source || counts.imported !== receipt.imported || counts.excluded !== receipt.excluded || counts.rejected !== receipt.rejected) fail('$/importReceipts', 'import-receipt-mismatch', receipt.sourceId);
      const sourceEvidence = ledger.evidence.filter((entry) => entry.source.path === receipt.path && entry.source.sha256 === receipt.sourceHash);
      if (sourceEvidence.length !== 1) fail('$/importReceipts', 'import-receipt-mismatch', receipt.sourceId);
      const metadata = sourceEvidence[0].source.legacyMetadata;
      if (metadata.selector !== receipt.selector || metadata.expectedRecords !== receipt.source || stableStringify(metadata.auxiliary) !== stableStringify(receipt.auxiliary)) fail('$/importReceipts', 'import-receipt-mismatch', receipt.sourceId);
      if (coverageCommitment(items) !== receipt.recordsHash) fail('$/importReceipts', 'import-receipt-mismatch', receipt.sourceId);
      for (const item of items) {
        const linked = item.evidenceIds.map((evidenceId) => evidenceMap.get(evidenceId)).filter(Boolean);
        if (!linked.some((entry) => entry.source.path === receipt.path && entry.source.sha256 === receipt.sourceHash)) fail('$/coverage', 'import-receipt-mismatch', item.coverageId);
      }
    }
    if (receipts.size !== manifest.sources.length) fail('$/importReceipts', 'import-receipt-mismatch');
    for (const source of manifest.sources) {
      const receipt = receipts.get(source.sourceId);
      if (!receipt || receipt.path !== source.path || receipt.hashMode !== manifest.hashMode || receipt.sourceHash !== source.sha256 || receipt.recordsHash !== source.recordsHash || receipt.selector !== source.selector || receipt.source !== source.expectedRecords || stableStringify(receipt.auxiliary) !== stableStringify(source.auxiliary)) fail('$/importReceipts', 'import-receipt-mismatch', source.sourceId);
    }
  }
  validateDag(ledger.axisDependencies);
  validateDependencyEdges(ledger.edges, new Set(nodeMap.keys()));
  return true;
}

function canonicalLf(value) {
  return value.replaceAll('\r\n', '\n').replaceAll('\r', '\n');
}

async function readSource(repoRoot, source) {
  const path = join(repoRoot, ...source.path.split('/'));
  let info;
  try { info = await stat(path); } catch { fail(`$/${source.sourceId}`, 'artifact-missing', source.sourceId); }
  if (info.size > LIMITS.maxBytes) fail(`$/${source.sourceId}`, 'input-cap', source.sourceId);
  const text = canonicalLf(await readFile(path, 'utf8'));
  if (sha256(text) !== source.sha256) fail(`$/${source.sourceId}`, 'source-hash-mismatch', source.sourceId);
  return text;
}

function opcodeRecords(text) {
  const records = [];
  for (const [index, line] of text.split('\n').entries()) {
    const match = line.match(/^\|\s*(0x[0-9a-f]+)\s*\|\s*(0x[0-9a-f]+)\s*\|\s*(.*?)\s*\|\s*(.*?)\s*\|\s*(.*?)\s*\|\s*(.*?)\s*\|$/i);
    if (!match) continue;
    records.push({ identity: `${match[1].toLowerCase()}-${match[2].toLowerCase()}`, pointer: `line:${index + 1}`, raw: line, legacyMetadata: { status: match[5] } });
  }
  return records;
}

function tsvRecords(text) {
  return text.split('\n').map((raw, index) => ({ raw, index })).filter(({ raw }) => raw.length > 0).map(({ raw, index }) => {
    const [address, name, sizeBytes] = raw.split('\t');
    if (!address || !name || !/^\d+$/.test(sizeBytes)) fail(`$/exe-re/line:${index + 1}`, 'record-drift');
    return { identity: address.toLowerCase().replace(/^0x/, ''), pointer: `line:${index + 1}`, raw, legacyMetadata: { name, sizeBytes: Number(sizeBytes) } };
  });
}

function jsonArrayRecords(text, selector) {
  const key = new RegExp(`"${selector}"\\s*:`).exec(text);
  if (!key) fail(`$/${selector}`, 'record-drift');
  const arrayStart = text.indexOf('[', key.index + key[0].length);
  if (arrayStart < 0) fail(`$/${selector}`, 'record-drift');
  const records = [];
  let cursor = arrayStart + 1;
  while (cursor < text.length) {
    while (/\s|,/.test(text[cursor])) cursor += 1;
    if (text[cursor] === ']') break;
    if (text[cursor] !== '{') fail(`$/${selector}/${records.length}`, 'record-drift');
    const start = cursor;
    let depth = 0; let inString = false; let escaped = false;
    for (; cursor < text.length; cursor += 1) {
      const char = text[cursor];
      if (inString) {
        if (escaped) escaped = false; else if (char === '\\') escaped = true; else if (char === '"') inString = false;
      } else if (char === '"') inString = true;
      else if (char === '{') depth += 1;
      else if (char === '}' && --depth === 0) { cursor += 1; break; }
    }
    const raw = text.slice(start, cursor);
    let value;
    try { value = JSON.parse(raw); } catch { fail(`$/${selector}/${records.length}`, 'record-drift'); }
    const identity = typeof value.path === 'string' ? value.path : String(records.length);
    const line = text.slice(0, start).split('\n').length;
    const legacyMetadata = selector === 'sources' ? { grade: value.grade ?? '' } : { trust: value.trust ?? '' };
    records.push({ identity, pointer: `/${selector}/${records.length}#line:${line}`, raw, legacyMetadata });
  }
  return records;
}

function sourceNode(source, sourceHash, manifestHash, evidenceId) {
  return {
    schemaVersion: CONTRACT.schemaVersion, nodeId: `A01:source:${source.sourceId}`, axis: 'A01', type: 'audit-source', domain: 'ledger', owner: 'ledger/schema owner', summary: `${source.sourceId} pinned source snapshot`,
    preconditions: ['source hash match'], postconditions: ['lossless import receipt'], failureConditions: ['artifact missing', 'hash mismatch', 'record drift'], surface: source.sourceId === 'exe-re' ? 'function' : source.sourceId === 'opcode' ? 'opcode' : source.sourceId === 'ui-render' ? 'render' : 'data', direction: 'none',
    state: { grade: 'R1', confidence: 'confirmed', canonicality: 'noncanonical', rights: 'unknown', verification: 'verified' },
    lifetime: { creator: 'A01 importer', consumer: 'A02-A15', disposer: 'A01 migration', scope: 'repository snapshot', hardBound: source.expectedRecords, notApplicableReason: '' },
    evidenceIds: [evidenceId], relatedIssue: 'LOGH7-214', acceptanceCriteria: ['AC-1', 'AC-4', 'AC-5'], sourceManifestHash: manifestHash,
    unresolved: { impact: 'snapshot completeness does not imply producer-current completeness', blocker: 'rights and semantic classification remain independent', nextExperiment: 'consumer axes add semantic nodes', releaseCondition: 'independent consumer evidence' },
  };
}

function sourceEvidence(source, text, evidenceId, nodeId) {
  return {
    schemaVersion: CONTRACT.schemaVersion, evidenceId, type: 'audit-source', producer: 'A01 importer', reviewer: 'A01 focused test',
    source: { path: source.path, sha256: source.sha256, sizeBytes: Buffer.byteLength(text), lineage: 'tracked repository snapshot', rights: 'unknown', recordPointer: '/', recordSha256: source.sha256, legacyMetadata: { adapter: source.adapter, selector: source.selector, expectedRecords: source.expectedRecords, auxiliary: structuredClone(source.auxiliary) } },
    execution: { platform: 'platform-neutral', runtimeMode: 'node', command: 'node tools/causal-ledger/cli.mjs', inputs: [source.path], configHash: source.sha256, startedAt: 'not-applicable', endedAt: 'not-applicable', exitCode: 0 },
    observation: { expected: String(source.expectedRecords), observed: String(source.expectedRecords), verdict: 'verified', contradictedClaim: '' }, artifacts: [],
    correlation: { acceptanceCriteria: ['AC-4', 'AC-5'], nodeIds: [nodeId], edgeIds: [] },
    cleanup: { pids: [], ports: [], databases: [], tempPaths: [], guis: [], runtimeWorkspaces: [], residual: 0 },
  };
}

export async function importSources(repoRoot, manifest = SOURCE_MANIFEST) {
  validateManifest(manifest);
  const manifestHash = sha256(stableStringify(manifest));
  const nodes = []; const evidence = []; const coverage = []; const importReceipts = []; const reportSources = [];
  for (const source of manifest.sources) {
    const text = await readSource(repoRoot, source);
    const records = source.adapter === 'opcode-markdown' ? opcodeRecords(text) : source.adapter === 'function-tsv' ? tsvRecords(text) : jsonArrayRecords(text, source.selector);
    if (records.length !== source.expectedRecords || new Set(records.map((record) => record.identity)).size !== records.length) fail(`$/${source.sourceId}`, 'record-drift', source.sourceId);
    const parsed = source.adapter === 'json-array' ? JSON.parse(text) : {};
    for (const item of source.auxiliary) if (!Array.isArray(parsed[item.selector]) || parsed[item.selector].length !== item.count) fail(`$/${source.sourceId}/${item.selector}`, 'record-drift', source.sourceId);
    const recordItems = records.map((record) => ({ recordPointer: record.pointer, recordHash: sha256(record.raw) }));
    const recordsHash = coverageCommitment(recordItems);
    if (recordsHash !== source.recordsHash) fail(`$/${source.sourceId}`, 'record-drift', source.sourceId);
    const nodeId = `A01:source:${source.sourceId}`; const evidenceId = `run:${source.sourceId}:snapshot`;
    nodes.push(sourceNode(source, source.sha256, manifestHash, evidenceId)); evidence.push(sourceEvidence(source, text, evidenceId, nodeId));
    for (const record of records) {
      const slug = source.sourceId === 'exe-re' ? record.identity : sha256(record.identity).slice(0, 24);
      coverage.push({ schemaVersion: CONTRACT.schemaVersion, coverageId: `A01:coverage:${source.sourceId}-${slug}`, ownerAxis: 'A01', sourceId: source.sourceId, sourceHash: source.sha256, recordPointer: record.pointer, recordHash: sha256(record.raw), targetNodeIds: [nodeId], evidenceIds: [evidenceId], status: 'imported', reason: '', legacyMetadata: record.legacyMetadata });
    }
    const auxiliary = structuredClone(source.auxiliary);
    const receipt = { sourceId: source.sourceId, path: source.path, hashMode: manifest.hashMode, sourceHash: source.sha256, recordsHash, source: records.length, imported: records.length, excluded: 0, rejected: 0, loss: 0, selector: source.selector, auxiliary };
    importReceipts.push(receipt); reportSources.push({ ...receipt });
  }
  coverage.sort((left, right) => left.coverageId.localeCompare(right.coverageId));
  const ledger = {
    schemaVersion: CONTRACT.schemaVersion, sourceManifestHash: manifestHash, nodes, edges: [], evidence, coverage, transitions: [],
    migrations: [{ schemaVersion: CONTRACT.schemaVersion, migrationId: 'A01:migration:bootstrap', sourceVersion: '0.0.0', targetVersion: CONTRACT.schemaVersion, transform: 'deterministic-source-import', beforeHash: '0'.repeat(64), afterHash: manifestHash, rollback: 'discard tools/causal-ledger/generated' }],
    axisDependencies: structuredClone(CONTRACT.axisDependencies), importReceipts,
  };
  const report = { schemaVersion: CONTRACT.schemaVersion, sourceManifestHash: manifestHash, sources: reportSources };
  validateLedger(ledger, { manifest });
  return { ledger, report };
}

export async function buildLedger(repoRoot) {
  const { ledger, report } = await importSources(repoRoot);
  return { ledger, report, ledgerBytes: `${stableStringify(ledger)}\n`, reportBytes: `${stableStringify(report)}\n` };
}
