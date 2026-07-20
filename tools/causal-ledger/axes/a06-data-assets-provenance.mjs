import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { CONTRACT, stableStringify, validateLedger, SOURCE_MANIFEST, importSources } from '../index.mjs';

const FIXED_TIMESTAMP = '2026-07-20T22:00:00.000Z';

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function makeSlug(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').substring(0, 50);
}

function makeUnresolvedFields(record) {
  const impactParts = [];
  if (record.parseOk) impactParts.push('JSON parses successfully');
  if (record.evidenceKeyCount > 0) impactParts.push(`${record.evidenceKeyCount} evidence key(s)`);
  if (record.pathRefCount > 0) impactParts.push(`${record.pathRefCount} internal reference(s)`);
  const impact = impactParts.length > 0 ? `Audit record: ${impactParts.join(', ')}.` : 'Audit record processed.';

  const blockerParts = [];
  blockerParts.push(`trust=${record.trust}`);
  if (record.brokenPathRefCount > 0) blockerParts.push(`${record.brokenPathRefCount} broken reference(s)`);
  blockerParts.push('rights judgment deferred to A13');
  blockerParts.push('consumer validation deferred to A03/A05/A07');
  const blocker = `${blockerParts.join('; ')}.`;

  return {
    impact,
    blocker,
    nextExperiment: 'Cross-validate with gameplay intent in A11 (game rules validation).',
    releaseCondition: 'A13 rights allowlist + A03 render consumer edge + A05 command consumer edge + A07 persistence consumer edge.',
  };
}

function mapConfidenceFromTrust(trust) {
  // Map trust field to confidence enum per spec fixture
  if (trust === 'source-described' || trust === 'generated-source-hash-backed') {
    return 'confirmed';
  } else if (trust === 'extracted-source-described' || trust === 'extracted-broken-reference-review' || trust === 'extracted-needs-redecode') {
    return 'inferred';
  } else if (trust === 'broken-reference-review' || trust === 'needs-redecode' || trust === 'generated-broken-reference-review') {
    return 'unknown';
  }
  return 'unknown'; // default
}

function generateReportFromLedger(ledger) {
  // Filter to only A06 nodes
  const a06Nodes = ledger.nodes.filter(n => n.axis === 'A06');

  // Count by grade
  const byGrade = {};
  const byCanonical = {};
  let blockedCount = 0;

  for (const node of a06Nodes) {
    // Count by grade
    const grade = node.state.grade;
    byGrade[grade] = (byGrade[grade] || 0) + 1;

    // Count by canonicality
    const canonical = node.state.canonicality;
    byCanonical[canonical] = (byCanonical[canonical] || 0) + 1;

    // Count blocked (state.canonicality === 'blocked')
    if (node.state.canonicality === 'blocked') {
      blockedCount++;
    }
  }

  return {
    axis: 'A06',
    timestamp: FIXED_TIMESTAMP,
    nodesSummary: {
      totalNodes: a06Nodes.length,
      byGrade,
      byCanonical,
      blockedCount,
    },
  };
}

export async function buildA06Ledger(repoRoot) {
  // Step 1: Bootstrap the frozen A01 base with 4 importReceipts and existing coverage
  const { ledger: base } = await importSources(repoRoot, SOURCE_MANIFEST);

  // Step 2: Load audit source
  const auditPath = join(repoRoot, 'server/content/generated/logh7-data-decode-audit.json');
  const auditRaw = JSON.parse(await readFile(auditPath, 'utf8'));
  const auditRecords = auditRaw.allJson || [];

  // Step 3: Build A06 axis records grounded in audit data
  const axisNodes = [];
  const axisNodeIds = new Set();
  const axisEdges = [];
  const axisTransitions = [];

  // Use the same sourceManifestHash as base
  const sourceManifestHash = base.sourceManifestHash;

  // Get the data-audit importReceipt from base to reuse its sourceHash
  const dataAuditReceipt = base.importReceipts.find(r => r.sourceId === 'data-audit');
  if (!dataAuditReceipt) {
    throw new Error('base must have data-audit importReceipt');
  }

  // Map audit index -> nodeId for later matching with coverage
  const nodeIdByAuditIndex = {};

  for (let i = 0; i < auditRecords.length; i++) {
    const record = auditRecords[i];
    const slug = makeSlug(record.path);
    let nodeId = `A06:data:${slug}`;

    // Ensure unique node IDs
    if (axisNodeIds.has(nodeId)) {
      let counter = 1;
      while (axisNodeIds.has(`${nodeId}-${counter}`)) counter++;
      nodeId = `${nodeId}-${counter}`;
    }
    axisNodeIds.add(nodeId);
    nodeIdByAuditIndex[i] = nodeId;

    const confidence = mapConfidenceFromTrust(record.trust);

    axisNodes.push({
      schemaVersion: CONTRACT.schemaVersion,
      nodeId,
      axis: 'A06',
      type: 'data-record',
      domain: 'persistence',
      owner: 'audit-data-decode',
      summary: `Data catalog entry: ${record.path}`,
      preconditions: [],
      postconditions: [],
      failureConditions: [],
      surface: 'data',
      direction: 'none',
      state: {
        grade: 'P3',
        confidence,
        canonicality: 'blocked',
        rights: 'unknown',
        verification: 'unverified',
      },
      lifetime: {
        creator: 'audit-data-decode',
        consumer: '',
        disposer: '',
        scope: 'A06-catalog',
        hardBound: 0,
        notApplicableReason: 'data record lifetime managed by source system',
      },
      evidenceIds: ['run:data-audit:snapshot'],
      relatedIssue: 'A06-data-catalog-import',
      acceptanceCriteria: [
        'audit record exists in source manifest',
        'path resolves within archive or install tree',
        'JSON structure is parseable',
      ],
      sourceManifestHash,
      unresolved: makeUnresolvedFields(record),
    });
  }

  // Sort axis records by ID for determinism
  axisNodes.sort((a, b) => a.nodeId.localeCompare(b.nodeId));

  // NOTE: Do NOT create new evidence record - reuse existing 'run:data-audit:snapshot' from base
  // The A06 nodes reference this existing evidence, linking them to the audit source

  // Step 4: Map existing base coverage and attach A06 nodes to data-audit records
  // DO NOT create new coverage records - the count must remain frozen
  const mappedCoverage = base.coverage.map((cov) => {
    // Match data-audit coverage records by recordPointer index
    if (cov.sourceId === 'data-audit') {
      const match = cov.recordPointer.match(/\/allJson\/(\d+)/);
      if (match) {
        const auditIndex = parseInt(match[1], 10);
        const correspondingNodeId = nodeIdByAuditIndex[auditIndex];
        if (correspondingNodeId) {
          // Append corresponding A06 node to this coverage record's targetNodeIds
          return {
            ...cov,
            targetNodeIds: [...cov.targetNodeIds, correspondingNodeId]
          };
        }
      }
    }
    return cov;
  });

  // Step 5: Assemble by APPENDING to base
  const ledger = {
    ...base,
    nodes: [...base.nodes, ...axisNodes],
    edges: [...base.edges, ...axisEdges],
    evidence: base.evidence,  // Reuse existing evidence (no new records)
    coverage: mappedCoverage,
    transitions: [...base.transitions, ...axisTransitions],
  };

  // Step 6: Validate the assembled ledger
  validateLedger(ledger, { manifest: SOURCE_MANIFEST });


  // Step 6b: Write delta (A06 nodes/edges/transitions only)
  const a06NodeIds = new Set(axisNodes.map(n => n.nodeId));
  const deltaCoverage = mappedCoverage.filter(cov =>
    cov.targetNodeIds?.some(id => a06NodeIds.has(id))
  );
  const deltaLedger = {
    nodes: axisNodes,
    edges: axisEdges,
    transitions: axisTransitions,
    coverage: deltaCoverage,
  };
  const ledgerPath = join(repoRoot, 'tools/causal-ledger/generated/a06-ledger.json');
  const ledgerDir = dirname(ledgerPath);
  await mkdir(ledgerDir, { recursive: true });
  await writeFile(ledgerPath, stableStringify(deltaLedger) + '\n', 'utf8');
  // Step 7: Generate and write report
  const report = generateReportFromLedger(ledger);
  const reportPath = join(repoRoot, 'tools/causal-ledger/generated/a06-report.json');
  const reportDir = dirname(reportPath);
  await mkdir(reportDir, { recursive: true });
  await writeFile(reportPath, stableStringify(report) + '\n', 'utf8');

  return ledger;
}
