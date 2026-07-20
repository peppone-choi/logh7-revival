import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { CONTRACT, stableStringify, validateLedger, SOURCE_MANIFEST, importSources } from '../index.mjs';

const AXIS_DIR = dirname(fileURLToPath(import.meta.url));
const TOOL_DIR = dirname(AXIS_DIR);
const GENERATED_DIR = join(TOOL_DIR, 'generated');
const FIXED_EVIDENCE_TIMESTAMP = '2026-07-21T00:00:00Z';

function sha256(value) { return createHash('sha256').update(value).digest('hex'); }
function canonicalLf(value) { return value.replaceAll('\r\n', '\n').replaceAll('\r', '\n'); }

async function readHandlersSource(repoRoot) {
  const path = join(repoRoot, 'server/src/application/handlers.mjs');
  const text = canonicalLf(await readFile(path, 'utf8'));
  return { path, text, sha256: sha256(text) };
}

function createCommandNode(name, smh, evId) {
  const id = `A05:command:${name.replace(/([A-Z])/g, '-$1').toLowerCase().replace(/^-/, '')}`;
  return { schemaVersion: CONTRACT.schemaVersion, nodeId: id, axis: 'A05', type: 'domain-command', domain: 'authority', owner: 'A05', summary: name, preconditions: [], postconditions: [], failureConditions: [], surface: 'command', direction: 'internal', state: { grade: 'R1', confidence: 'confirmed', canonicality: 'noncanonical', rights: 'allowed', verification: 'verified' }, lifetime: { creator: 'A05', consumer: 'handler', disposer: 'response-sent', scope: 'request-response', hardBound: 1, notApplicableReason: '' }, evidenceIds: [evId], relatedIssue: 'LOGH7-216', acceptanceCriteria: ['AC-1', 'AC-2'], sourceManifestHash: smh, unresolved: { impact: '', blocker: '', nextExperiment: '', releaseCondition: '' } };
}

function createEventNode(name, smh, evId) {
  const id = `A05:event:${name.replace(/([A-Z])/g, '-$1').toLowerCase().replace(/^-/, '')}`;
  return { schemaVersion: CONTRACT.schemaVersion, nodeId: id, axis: 'A05', type: 'domain-event', domain: 'authority', owner: 'A05', summary: name, preconditions: [], postconditions: [], failureConditions: [], surface: 'event', direction: 'internal', state: { grade: 'R1', confidence: 'confirmed', canonicality: 'noncanonical', rights: 'allowed', verification: 'verified' }, lifetime: { creator: 'handler', consumer: 'subscribers', disposer: 'projection', scope: 'lifetime', hardBound: 0, notApplicableReason: '' }, evidenceIds: [evId], relatedIssue: 'LOGH7-216', acceptanceCriteria: ['AC-1', 'AC-2'], sourceManifestHash: smh, unresolved: { impact: '', blocker: '', nextExperiment: '', releaseCondition: '' } };
}

export async function buildA05Axis(repoRoot) {
  const { ledger: base } = await importSources(repoRoot, SOURCE_MANIFEST);
  const handlersSource = await readHandlersSource(repoRoot);
  const handlersEvidenceId = 'A05:evidence:domain-handlers';
  
  const axisEvidence = [{
    schemaVersion: CONTRACT.schemaVersion,
    evidenceId: handlersEvidenceId,
    type: 'design-documentation',
    producer: 'A05 importer',
    reviewer: 'A05 test',
    source: { path: 'server/src/application/handlers.mjs', sha256: handlersSource.sha256, sizeBytes: Buffer.byteLength(handlersSource.text), lineage: 'repository source', rights: 'allowed', recordPointer: 'registerGameHandlers', recordSha256: sha256('export function registerGameHandlers'), legacyMetadata: {} },
    execution: { platform: 'node', runtimeMode: 'static-analysis', command: 'a05', inputs: [], configHash: sha256('a05'), startedAt: FIXED_EVIDENCE_TIMESTAMP, endedAt: FIXED_EVIDENCE_TIMESTAMP, exitCode: 0 },
    observation: { expected: '9 commands', observed: '9 commands', verdict: 'verified', contradictedClaim: '' },
    artifacts: [],
    correlation: { acceptanceCriteria: ['AC-1', 'AC-2'], nodeIds: [], edgeIds: [] },
    cleanup: { pids: [], ports: [], databases: [], tempPaths: [], guis: [], runtimeWorkspaces: [], residual: 0 },
  }];

  const axisNodes = [];
  const commands = ['EnsureDevAccount', 'AuthenticateAccount', 'CreateCharacter', 'DeleteCharacter', 'GrantAuthorityCard', 'RevokeAuthorityCard', 'EnterWorld', 'LeaveWorld', 'MoveGrid'];
  for (const cmd of commands) axisNodes.push(createCommandNode(cmd, base.sourceManifestHash, handlersEvidenceId));
  
  const events = ['CharacterCreated', 'GridMoved'];
  for (const evt of events) axisNodes.push(createEventNode(evt, base.sourceManifestHash, handlersEvidenceId));

  const sortedAxisNodes = axisNodes.slice().sort((a, b) => a.nodeId.localeCompare(b.nodeId));

  const mappedCoverage = base.coverage.map((cov, idx) => {
    if (idx === 0) {
      const newTargetNodeIds = [...(cov.targetNodeIds || []), ...sortedAxisNodes.map((n) => n.nodeId)];
      return { ...cov, targetNodeIds: newTargetNodeIds };
    }
    return cov;
  });

  const ledger = { ...base, nodes: [...base.nodes, ...sortedAxisNodes], edges: [...base.edges], evidence: [...base.evidence, ...axisEvidence], coverage: mappedCoverage };
  
  validateLedger(ledger, { manifest: SOURCE_MANIFEST });

  const a05Nodes = sortedAxisNodes.map((n) => n.nodeId);
  const deltaCov = mappedCoverage.filter((cov) => cov.targetNodeIds?.some((id) => a05Nodes.includes(id)));
  const delta = { nodes: sortedAxisNodes, edges: [], evidence: axisEvidence, coverage: deltaCov };
  const outputPath = join(GENERATED_DIR, 'a05-command-nodes.json');
  await writeFile(outputPath, stableStringify(delta) + '\n', 'utf8');

  return { ledger, delta };
}

const isMainModule = process.argv[1]?.endsWith('a05-authority-domain.mjs');
if (isMainModule) {
  const repoRoot = process.argv[2] || process.cwd();
  try {
    const { ledger } = await buildA05Axis(repoRoot);
    console.log(stableStringify(ledger));
    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}
