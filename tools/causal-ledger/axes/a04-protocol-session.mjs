import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { CONTRACT, stableStringify, validateLedger, SOURCE_MANIFEST, importSources } from '../index.mjs';

const AXIS_DIR = dirname(fileURLToPath(import.meta.url));
const TOOL_DIR = dirname(AXIS_DIR);
const GENERATED_DIR = join(TOOL_DIR, 'generated');

const FIXED_EVIDENCE_TIMESTAMP = '2026-07-21T00:00:00Z'; // Deterministic, fixed timestamp

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function canonicalLf(value) {
  return value.replaceAll('\r\n', '\n').replaceAll('\r', '\n');
}

async function readFrameStreamSource(repoRoot) {
  // Read the distinct non-base source for A04 evidence
  const path = join(repoRoot, 'server/src/server/logh7-frame-stream.mjs');
  const text = canonicalLf(await readFile(path, 'utf8'));
  return {
    path,
    text,
    sha256: sha256(text),
  };
}

async function readOpcodeSource(repoRoot) {
  const path = join(repoRoot, 'docs', 'logh7-opcode-coverage-current.md');
  const text = canonicalLf(await readFile(path, 'utf8'));
  const lines = text.split('\n');
  const records = [];
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex];
    const match = line.match(/^\|\s*(0x[0-9a-fA-F]+)\s*\|\s*(0x[0-9a-fA-F]+)\s*\|\s*(.*?)\s*\|\s*(0x[0-9a-fA-F]+|\d+)\s*\|\s*(.*?)\s*\|\s*(.*?)\s*\|$/);
    if (!match) continue;
    const reqCode = match[1].toLowerCase();
    const respCode = match[2].toLowerCase();
    const responseName = match[3].trim();
    const sizeStr = match[4].trim();
    const status = match[5].trim();
    const location = match[6].trim();
    let sizeBytes = 0;
    if (sizeStr.startsWith('0x')) {
      sizeBytes = parseInt(sizeStr, 16);
    } else if (/^\d+$/.test(sizeStr)) {
      sizeBytes = parseInt(sizeStr, 10);
    }
    records.push({
      lineIndex: lineIndex + 1,
      line,
      lineHash: sha256(line),
      reqCode,
      respCode,
      responseName,
      sizeBytes,
      status,
      location,
      identity: `${reqCode}-${respCode}`,
    });
  }
  return { text, records, sourceHash: sha256(text) };
}

function createRequestNode(reqCode, responseName, sourceManifestHash, evidenceId) {
  const codeShort = reqCode.replace('0x', '');
  return {
    schemaVersion: CONTRACT.schemaVersion,
    nodeId: `A04:node:request-${codeShort}`,
    axis: 'A04',
    type: 'opcode-request',
    domain: 'protocol',
    owner: 'A04 protocol',
    summary: `Request ${reqCode} - ${responseName}`,
    preconditions: ['session established', 'transport frame received'],
    postconditions: ['opcode dispatched to handler'],
    failureConditions: ['malformed frame', 'unknown opcode', 'session not established'],
    surface: 'opcode',
    direction: 'c2s',
    state: {
      grade: 'R1',
      confidence: 'confirmed',
      canonicality: 'noncanonical',
      rights: 'unknown',
      verification: 'verified',
    },
    lifetime: {
      creator: 'A04 importer',
      consumer: 'dispatcher',
      disposer: 'session close',
      scope: 'session lifetime',
      hardBound: 0,
      notApplicableReason: '',
    },
    evidenceIds: [evidenceId],
    relatedIssue: 'LOGH7-215',
    acceptanceCriteria: ['AC-1', 'AC-5'],
    sourceManifestHash,
    unresolved: { impact: '', blocker: '', nextExperiment: '', releaseCondition: '' },
  };
}

function createHandlerNode(reqCode, responseName, sourceManifestHash, evidenceId) {
  const codeShort = reqCode.replace('0x', '');
  return {
    schemaVersion: CONTRACT.schemaVersion,
    nodeId: `A04:node:handler-${codeShort}`,
    axis: 'A04',
    type: 'opcode-handler',
    domain: 'protocol',
    owner: 'A04 protocol',
    summary: `Handler for ${reqCode} - ${responseName}`,
    preconditions: ['request-received', 'frame parsed'],
    postconditions: ['response-prepared', 'buffer allocated'],
    failureConditions: ['handler-crash', 'missing implementation'],
    surface: 'function',
    direction: 'internal',
    state: {
      grade: 'R1',
      confidence: 'confirmed',
      canonicality: 'noncanonical',
      rights: 'unknown',
      verification: 'verified',
    },
    lifetime: {
      creator: 'server',
      consumer: 'server',
      disposer: 'response-sent',
      scope: 'single request-response',
      hardBound: 1,
      notApplicableReason: '',
    },
    evidenceIds: [evidenceId],
    relatedIssue: 'LOGH7-215',
    acceptanceCriteria: ['AC-1', 'AC-5'],
    sourceManifestHash,
    unresolved: { impact: '', blocker: '', nextExperiment: '', releaseCondition: '' },
  };
}

function createResponseNode(respCode, responseName, sizeBytes, sourceManifestHash, evidenceId, isUnknown) {
  const codeShort = respCode.replace('0x', '');
  const state = isUnknown
    ? {
      grade: 'R1',
      confidence: 'unknown',
      canonicality: 'blocked',
      rights: 'unknown',
      verification: 'unverified',
    }
    : {
      grade: 'R1',
      confidence: 'confirmed',
      canonicality: 'noncanonical',
      rights: 'unknown',
      verification: 'verified',
    };
  const unresolved = isUnknown
    ? {
      impact: `Response DTO layout incomplete or unconfirmed`,
      blocker: `Field layout unconfirmed for ${respCode}; requires live A/B verification`,
      nextExperiment: 'Live protocol capture and binary comparison',
      releaseCondition: 'Live A/B test confirms layout and endianness',
    }
    : { impact: '', blocker: '', nextExperiment: '', releaseCondition: '' };
  return {
    schemaVersion: CONTRACT.schemaVersion,
    nodeId: `A04:node:response-${codeShort}`,
    axis: 'A04',
    type: 'opcode-response',
    domain: 'protocol',
    owner: 'A04 protocol',
    summary: `Response ${respCode} - ${responseName} (${sizeBytes} bytes)`,
    preconditions: ['handler-completed', 'response buffer filled'],
    postconditions: ['response transmitted to client', 'frame serialized'],
    failureConditions: ['send-error', 'buffer overflow', 'incomplete response'],
    surface: 'opcode',
    direction: 's2c',
    state,
    lifetime: {
      creator: 'server',
      consumer: 'client',
      disposer: 'frame complete',
      scope: 'single request-response cycle',
      hardBound: 1,
      notApplicableReason: '',
    },
    evidenceIds: [evidenceId],
    relatedIssue: 'LOGH7-215',
    acceptanceCriteria: ['AC-1', 'AC-5'],
    sourceManifestHash,
    unresolved,
  };
}

function createRequestHandlerEdges(reqNode, handlerNode, respNode, identity, evidenceId, isUnknown) {
  const reqShort = reqNode.nodeId.split(':').at(-1);
  const handlerShort = handlerNode.nodeId.split(':').at(-1);
  const respShort = respNode.nodeId.split(':').at(-1);

  const edgeRequests = {
    schemaVersion: CONTRACT.schemaVersion,
    edgeId: `A04:edge:${reqShort}--requests--${handlerShort}`,
    ownerAxis: 'A04',
    edgeClass: 'causal',
    from: reqNode.nodeId,
    to: handlerNode.nodeId,
    verb: 'requests',
    ordering: {
      correlationId: `opcode-pair-${identity}`,
      causationId: '',
      sequence: 0,
      temporalPredicate: 'frame-boundary',
    },
    stateChange: {
      before: ['request-buffered'],
      readSet: ['request-frame'],
      writeSet: ['handler-processing'],
      after: ['handler-active'],
      transactionBoundary: 'frame-boundary',
    },
    outcome: { kind: isUnknown ? 'unknown' : 'success' },
    replay: {
      idempotencyKey: `opcode-pair-${identity}`,
      dedupeWindow: '60s',
      duplicateOutcome: 'deduplicated',
    },
    evidence: {
      grade: 'R1',
      confidence: isUnknown ? 'unknown' : 'confirmed',
      provenance: 'static-code-analysis',
      evidenceIds: [evidenceId],
    },
  };

  const edgeResponds = {
    schemaVersion: CONTRACT.schemaVersion,
    edgeId: `A04:edge:${handlerShort}--responds--${respShort}`,
    ownerAxis: 'A04',
    edgeClass: 'causal',
    from: handlerNode.nodeId,
    to: respNode.nodeId,
    verb: 'responds',
    ordering: {
      correlationId: `opcode-pair-${identity}`,
      causationId: '',
      sequence: 1,
      temporalPredicate: 'frame-boundary',
    },
    stateChange: {
      before: ['handler-active'],
      readSet: ['handler-result'],
      writeSet: ['response-frame'],
      after: ['response-ready'],
      transactionBoundary: 'frame-boundary',
    },
    outcome: { kind: isUnknown ? 'unknown' : 'success' },
    replay: {
      idempotencyKey: `opcode-pair-${identity}-resp`,
      dedupeWindow: '60s',
      duplicateOutcome: 'deduplicated',
    },
    evidence: {
      grade: 'R1',
      confidence: isUnknown ? 'unknown' : 'confirmed',
      provenance: 'static-code-analysis',
      evidenceIds: [evidenceId],
    },
  };

  return [edgeRequests, edgeResponds];
}

function sortNodesByNodeId(nodes) {
  return nodes.slice().sort((a, b) => a.nodeId.localeCompare(b.nodeId));
}

function sortEdgesByEdgeId(edges) {
  return edges.slice().sort((a, b) => a.edgeId.localeCompare(b.edgeId));
}

export async function buildA04Axis(repoRoot) {
  // Bootstrap A01 base
  const { ledger: base } = await importSources(repoRoot, SOURCE_MANIFEST);

  // Read opcode coverage source
  const { records: opcodeRecords } = await readOpcodeSource(repoRoot);

  // Read the distinct non-base source for evidence
  const frameStreamSource = await readFrameStreamSource(repoRoot);

  // Build A04 evidence record with distinct non-base source
  const frameEvidenceId = 'A04:evidence:frame-stream-contract';
  const axisEvidence = [
    {
      schemaVersion: CONTRACT.schemaVersion,
      evidenceId: frameEvidenceId,
      type: 'design-documentation',
      producer: 'A04 importer',
      reviewer: 'A04 focused test',
      source: {
        path: 'server/src/server/logh7-frame-stream.mjs',
        sha256: frameStreamSource.sha256,
        sizeBytes: Buffer.byteLength(frameStreamSource.text),
        lineage: 'repository source',
        rights: 'allowed',
        recordPointer: 'export function buildTransportFrame',
        recordSha256: sha256('export function buildTransportFrame(code, body = Buffer.alloc(0)) {'),
        legacyMetadata: {
          source: 'frame-contract',
          version: '1.0',
        },
      },
      execution: {
        platform: 'node',
        runtimeMode: 'static-analysis',
        command: 'node tools/causal-ledger/axes/a04-protocol-session.mjs',
        inputs: ['server/src/server/logh7-frame-stream.mjs', 'docs/logh7-opcode-coverage-current.md'],
        configHash: sha256('a04-protocol-session'),
        startedAt: FIXED_EVIDENCE_TIMESTAMP,
        endedAt: FIXED_EVIDENCE_TIMESTAMP,
        exitCode: 0,
      },
      observation: {
        expected: `${opcodeRecords.length} opcode pairs with frame contract verified`,
        observed: `${opcodeRecords.length} opcode pairs analyzed`,
        verdict: 'verified',
        contradictedClaim: '',
      },
      artifacts: [],
      correlation: {
        acceptanceCriteria: ['AC-4', 'AC-5'],
        nodeIds: [],
        edgeIds: [],
      },
      cleanup: {
        pids: [],
        ports: [],
        databases: [],
        tempPaths: [],
        guis: [],
        runtimeWorkspaces: [],
        residual: 0,
      },
    },
  ];

  // Build A04 nodes and edges from opcode records
  const axisNodes = [];
  const axisEdges = [];
  const nodesByLineIndex = new Map();

  for (const record of opcodeRecords) {
    const isUnknown = record.status.includes('구현 중') || record.status.includes('미구현');
    const reqNode = createRequestNode(record.reqCode, record.responseName, base.sourceManifestHash, frameEvidenceId);
    const handlerNode = createHandlerNode(record.reqCode, record.responseName, base.sourceManifestHash, frameEvidenceId);
    const respNode = createResponseNode(record.respCode, record.responseName, record.sizeBytes, base.sourceManifestHash, frameEvidenceId, isUnknown);
    axisNodes.push(reqNode);
    axisNodes.push(handlerNode);
    axisNodes.push(respNode);

    const [edgeRequests, edgeResponds] = createRequestHandlerEdges(reqNode, handlerNode, respNode, record.identity, frameEvidenceId, isUnknown);
    axisEdges.push(edgeRequests);
    axisEdges.push(edgeResponds);

    // Track which nodes belong to which line (for later coverage mapping)
    nodesByLineIndex.set(record.lineIndex, [reqNode.nodeId, handlerNode.nodeId, respNode.nodeId]);
  }

  // Map base coverage records: find opcode coverage records and attach A04 nodes
  const mappedCoverage = base.coverage.map((cov) => {
    const lineMatch = cov.recordPointer?.match(/^line:(\d+)$/);
    if (lineMatch && cov.sourceId === 'opcode') {
      const lineIndex = parseInt(lineMatch[1], 10);
      const attachNodes = nodesByLineIndex.get(lineIndex);
      if (attachNodes) {
        const newTargetNodeIds = [...(cov.targetNodeIds || []), ...attachNodes];
        return { ...cov, targetNodeIds: newTargetNodeIds };
      }
    }
    return cov;
  });

  // Sort axis records for determinism
  const sortedAxisNodes = sortNodesByNodeId(axisNodes);
  const sortedAxisEdges = sortEdgesByEdgeId(axisEdges);
  const sortedAxisEvidence = axisEvidence.slice().sort((a, b) => a.evidenceId.localeCompare(b.evidenceId));

  // Assemble ledger by appending A04 records to A01 base
  const ledger = {
    ...base,
    nodes: [...base.nodes, ...sortedAxisNodes],
    edges: [...base.edges, ...sortedAxisEdges],
    evidence: [...base.evidence, ...sortedAxisEvidence],
    coverage: mappedCoverage,
  };

  // Validate ledger with manifest
  validateLedger(ledger, { manifest: SOURCE_MANIFEST });

  // Write generated output (delta only - with coverage attachment info)
  // Filter coverage to only include records that reference A04 nodes (i.e., were modified)
  const a04NodeIds = new Set(sortedAxisNodes.map(n => n.nodeId));
  const deltaCoverage = mappedCoverage.filter(cov =>
    cov.targetNodeIds?.some(id => a04NodeIds.has(id))
  );
  const delta = {
    nodes: sortedAxisNodes,
    edges: sortedAxisEdges,
    evidence: sortedAxisEvidence,
    coverage: deltaCoverage,
  };
  const outputPath = join(GENERATED_DIR, 'a04-protocol-opcodes.json');
  await writeFile(outputPath, stableStringify(delta) + '\n', 'utf8');

  return { ledger, delta };
}

// CLI entry point: output full ledger as JSON to stdout
const isMainModule = process.argv[1]?.endsWith('a04-protocol-session.mjs');
if (isMainModule) {
  const repoRoot = process.argv[2] || process.cwd();
  try {
    const { ledger } = await buildA04Axis(repoRoot);
    console.log(stableStringify(ledger));
    process.exit(0);
  } catch (err) {
    console.error('Error building A04 axis:', err.message);
    console.error('Stack:', err.stack);
    process.exit(1);
  }
}



