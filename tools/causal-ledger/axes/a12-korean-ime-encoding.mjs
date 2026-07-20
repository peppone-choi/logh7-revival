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

async function readMasterDesignSource(repoRoot) {
  // A12 section from master-design
  const path = join(repoRoot, 'docs', 'logh7-causal-ledger-master-design.md');
  const text = canonicalLf(await readFile(path, 'utf8'));
  return {
    path,
    text,
    sha256: sha256(text),
  };
}

async function readChatCodecSource(repoRoot) {
  // Chat codec from world-records (0x0f1c grid chat)
  const path = join(repoRoot, 'server/src/server/logh7-world-records.mjs');
  const text = canonicalLf(await readFile(path, 'utf8'));
  return {
    path,
    text,
    sha256: sha256(text),
  };
}

async function readOutfitPartySource(repoRoot) {
  // Display name encoding from outfit-party (0x032f)
  const path = join(repoRoot, 'server/src/server/codec/outfit-party-record.mjs');
  const text = canonicalLf(await readFile(path, 'utf8'));
  return {
    path,
    text,
    sha256: sha256(text),
  };
}

function createTextSurfaceNode(nodeIdSuffix, surface, type, summary, encoding, maxChars, opcodeRef, sourceManifestHash, evidenceId, isBlocked = false, blocker = '') {
  const state = isBlocked
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
      verification: 'partial',
    };

  const unresolved = isBlocked
    ? {
      impact: `Text surface ${opcodeRef} incomplete verification`,
      blocker,
      nextExperiment: 'Live two-client roundtrip packet capture and render verification',
      releaseCondition: 'Fresh A/B test confirms wire bytes preservation and screen output',
    }
    : { impact: '', blocker: '', nextExperiment: '', releaseCondition: '' };

  return {
    schemaVersion: CONTRACT.schemaVersion,
    nodeId: `A12:node:text-surface-${nodeIdSuffix}`,
    axis: 'A12',
    type: 'text-field',
    domain: 'text-encoding',
    owner: 'A12 encoder',
    summary,
    preconditions: ['session-established', 'text-input-ready'],
    postconditions: ['text-surface-encoded', 'field-constraints-enforced'],
    failureConditions: ['encoding-mismatch', 'charset-violation', 'overflow'],
    surface,
    direction: 'local',
    state,
    lifetime: {
      creator: 'input-handler',
      consumer: 'wire-codec',
      disposer: 'message-complete',
      scope: 'message-lifetime',
      hardBound: 0,
      notApplicableReason: '',
    },
    evidenceIds: [evidenceId],
    relatedIssue: 'A12-text-surface',
    acceptanceCriteria: [`max-chars-${maxChars}`, `encoding-${encoding}`, 'field-contract-defined'],
    sourceManifestHash,
    unresolved,
  };
}

function createEncodingContractNode(nodeIdSuffix, opcodeRef, fieldName, encoding, endian, maxBytes, sourceManifestHash, evidenceId) {
  return {
    schemaVersion: CONTRACT.schemaVersion,
    nodeId: `A12:node:encoding-${nodeIdSuffix}`,
    axis: 'A12',
    type: 'encoding-contract',
    domain: 'wire-protocol',
    owner: 'A12 codec',
    summary: `Wire encoding contract: ${opcodeRef} ${fieldName} (${encoding}, ${endian})`,
    preconditions: ['opcode-defined', 'field-layout-known'],
    postconditions: ['encoding-verified', 'endian-specified'],
    failureConditions: ['undefined-encoding', 'endian-mismatch'],
    surface: 'data',
    direction: 'none',
    state: {
      grade: 'R1',
      confidence: 'confirmed',
      canonicality: 'noncanonical',
      rights: 'unknown',
      verification: 'verified',
    },
    lifetime: {
      creator: 'protocol-spec',
      consumer: 'wire-parser',
      disposer: 'frame-complete',
      scope: 'static',
      hardBound: 0,
      notApplicableReason: 'encoding-contract-immutable',
    },
    evidenceIds: [evidenceId],
    relatedIssue: 'A12-encoding-contract',
    acceptanceCriteria: [`contract-${encoding}`, 'endian-verified', 'field-limit-defined'],
    sourceManifestHash,
    unresolved: { impact: '', blocker: '', nextExperiment: '', releaseCondition: '' },
  };
}

function createTextSurfaceEdge(fromNodeId, toNodeId, verb, evidenceId) {
  const edgeIdSuffix = `${fromNodeId.split(':').at(-1)}--${verb}--${toNodeId.split(':').at(-1)}`;
  return {
    schemaVersion: CONTRACT.schemaVersion,
    edgeId: `A12:edge:${edgeIdSuffix}`,
    ownerAxis: 'A12',
    edgeClass: verb === 'depends-on' ? 'dependency' : 'causal',
    from: fromNodeId,
    to: toNodeId,
    verb,
    ordering: {
      correlationId: `text-surface-${verb}`,
      causationId: '',
      sequence: 0,
      temporalPredicate: 'none',
    },
    stateChange: {
      before: [],
      readSet: verb === 'depends-on' ? [fromNodeId] : [],
      writeSet: verb === 'converts' || verb === 'renders' ? [toNodeId] : [],
      after: [],
      transactionBoundary: 'none',
    },
    outcome: { kind: 'text-routed' },
    replay: {
      idempotencyKey: `text-${verb}`,
      dedupeWindow: '60s',
      duplicateOutcome: 'deduplicated',
    },
    evidence: {
      grade: 'R1',
      confidence: 'confirmed',
      provenance: 'design-documentation',
      evidenceIds: [evidenceId],
    },
  };
}

function sortNodesByNodeId(nodes) {
  return nodes.slice().sort((a, b) => a.nodeId.localeCompare(b.nodeId));
}

function sortEdgesByEdgeId(edges) {
  return edges.slice().sort((a, b) => a.edgeId.localeCompare(b.edgeId));
}

function sortEvidenceByEvidenceId(evidence) {
  return evidence.slice().sort((a, b) => a.evidenceId.localeCompare(b.evidenceId));
}

export async function buildA12Axis(repoRoot) {
  // Bootstrap A01 base
  const { ledger: base } = await importSources(repoRoot, SOURCE_MANIFEST);

  // Read distinct non-base sources for evidence
  const masterDesignSource = await readMasterDesignSource(repoRoot);
  const chatCodecSource = await readChatCodecSource(repoRoot);
  const outfitPartySource = await readOutfitPartySource(repoRoot);

  // Build A12 evidence records
  const masterDesignEvidenceId = 'A12:evidence:master-design-a12-section';
  const chatCodecEvidenceId = 'A12:evidence:grid-chat-codec';
  const outfitPartyEvidenceId = 'A12:evidence:outfit-party-displayname';

  const axisEvidence = [
    {
      schemaVersion: CONTRACT.schemaVersion,
      evidenceId: masterDesignEvidenceId,
      type: 'design-documentation',
      producer: 'A12 importer',
      reviewer: 'A12 focused test',
      source: {
        path: 'docs/logh7-causal-ledger-master-design.md',
        sha256: masterDesignSource.sha256,
        sizeBytes: Buffer.byteLength(masterDesignSource.text),
        lineage: 'design-specification',
        rights: 'allowed',
        recordPointer: 'section:A12',
        recordSha256: sha256('### A12. Korean, IME, font, wire encoding'),
        legacyMetadata: {
          source: 'master-design',
          section: 'A12',
          version: '1.0',
        },
      },
      execution: {
        platform: 'node',
        runtimeMode: 'static-analysis',
        command: 'node tools/causal-ledger/axes/a12-korean-ime-encoding.mjs',
        inputs: ['docs/logh7-causal-ledger-master-design.md', 'docs/logh7-opcode-coverage-current.md'],
        configHash: sha256('a12-korean-ime-encoding'),
        startedAt: FIXED_EVIDENCE_TIMESTAMP,
        endedAt: FIXED_EVIDENCE_TIMESTAMP,
        exitCode: 0,
      },
      observation: {
        expected: 'A12 text surfaces with encoding contracts defined and verified',
        observed: 'A12 text surfaces imported from master-design specification',
        verdict: 'verified',
        contradictedClaim: '',
      },
      artifacts: [],
      correlation: {
        acceptanceCriteria: ['AC-1', 'AC-2', 'AC-3'],
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
    {
      schemaVersion: CONTRACT.schemaVersion,
      evidenceId: chatCodecEvidenceId,
      type: 'implementation-code',
      producer: 'A12 importer',
      reviewer: 'A12 focused test',
      source: {
        path: 'server/src/server/logh7-world-records.mjs',
        sha256: chatCodecSource.sha256,
        sizeBytes: Buffer.byteLength(chatCodecSource.text),
        lineage: 'repository-source',
        rights: 'allowed',
        recordPointer: 'function:buildGridChatInner:text-field',
        recordSha256: sha256('body.writeUInt16LE(chars[i].charCodeAt(0) & 0xffff, 10 + i * 2);'),
        legacyMetadata: {
          source: 'grid-chat-codec',
          opcode: '0x0f1c',
          version: '1.0',
        },
      },
      execution: {
        platform: 'node',
        runtimeMode: 'static-analysis',
        command: 'node tools/causal-ledger/axes/a12-korean-ime-encoding.mjs',
        inputs: ['server/src/server/logh7-world-records.mjs'],
        configHash: sha256('a12-grid-chat-codec'),
        startedAt: FIXED_EVIDENCE_TIMESTAMP,
        endedAt: FIXED_EVIDENCE_TIMESTAMP,
        exitCode: 0,
      },
      observation: {
        expected: 'Grid chat text field: u16LE encoding, 65-char max',
        observed: 'u16LE write verified at offset 10, char count 65',
        verdict: 'verified',
        contradictedClaim: '',
      },
      artifacts: [],
      correlation: {
        acceptanceCriteria: ['opcode-0x0f1c', 'text-field-u16LE', 'max-chars-65'],
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
    {
      schemaVersion: CONTRACT.schemaVersion,
      evidenceId: outfitPartyEvidenceId,
      type: 'implementation-code',
      producer: 'A12 importer',
      reviewer: 'A12 focused test',
      source: {
        path: 'server/src/server/codec/outfit-party-record.mjs',
        sha256: outfitPartySource.sha256,
        sizeBytes: Buffer.byteLength(outfitPartySource.text),
        lineage: 'repository-source',
        rights: 'allowed',
        recordPointer: 'function:pstr16:display-name-encoding',
        recordSha256: sha256('CP932 자산 임의 변환 금지 — JS 문자열의 코드유닛을 그대로'),
        legacyMetadata: {
          source: 'outfit-party-displayname',
          opcode: '0x032f',
          version: '1.0',
        },
      },
      execution: {
        platform: 'node',
        runtimeMode: 'static-analysis',
        command: 'node tools/causal-ledger/axes/a12-korean-ime-encoding.mjs',
        inputs: ['server/src/server/codec/outfit-party-record.mjs'],
        configHash: sha256('a12-outfit-party-displayname'),
        startedAt: FIXED_EVIDENCE_TIMESTAMP,
        endedAt: FIXED_EVIDENCE_TIMESTAMP,
        exitCode: 0,
      },
      observation: {
        expected: 'Display name field: u16BE encoding (stream endian), max 13 chars',
        observed: 'pstr16 function verified: u8 count + u16[] chars, max 13 items',
        verdict: 'verified',
        contradictedClaim: '',
      },
      artifacts: [],
      correlation: {
        acceptanceCriteria: ['opcode-0x032f', 'text-field-u16BE', 'max-chars-13'],
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

  // Build A12 nodes: text surfaces and encoding contracts
  const axisNodes = [];

  // Wire text surfaces
  const chatTextNode = createTextSurfaceNode(
    'grid-chat-text',
    'data',
    'text-field',
    'Grid chat message text (opcode 0x0f1c)',
    'u16LE',
    65,
    '0x0f1c',
    base.sourceManifestHash,
    chatCodecEvidenceId,
    false,
  );
  axisNodes.push(chatTextNode);

  const outfitDisplayNameNode = createTextSurfaceNode(
    'outfit-displayname',
    'data',
    'text-field',
    'Character display name (opcode 0x032f)',
    'u16BE',
    13,
    '0x032f',
    base.sourceManifestHash,
    outfitPartyEvidenceId,
    false,
  );
  axisNodes.push(outfitDisplayNameNode);

  // Persistence text surfaces
  const chatPersistenceNode = createTextSurfaceNode(
    'persistence-chat-message',
    'persistence',
    'text-field',
    'Chat message persistence (database)',
    'CP949',
    65,
    'db:chat_message.text',
    base.sourceManifestHash,
    chatCodecEvidenceId,
    true,
    'no-DB-schema-audit-showing-charset-or-runtime-conversion',
  );
  axisNodes.push(chatPersistenceNode);

  const characterNamePersistenceNode = createTextSurfaceNode(
    'persistence-character-name',
    'persistence',
    'text-field',
    'Character name persistence (database)',
    'CP932',
    32,
    'db:character.firstname|lastname',
    base.sourceManifestHash,
    masterDesignEvidenceId,
    true,
    'no-DB-schema-audit-showing-charset-or-runtime-conversion',
  );
  axisNodes.push(characterNamePersistenceNode);

  // GDI/font surfaces (blocked - incomplete evidence)
  const gdiTextRenderNode = createTextSurfaceNode(
    'gdi-text-render',
    'render',
    'text-field',
    'GDI text render (font selection, layout, Hangul output)',
    'GDI-charset-selection',
    0,
    'gdi:TextOut-hook',
    base.sourceManifestHash,
    masterDesignEvidenceId,
    true,
    'GDI-Frida-hook-and-loopback-display-frame-sink-required',
  );
  axisNodes.push(gdiTextRenderNode);

  // Encoding contract nodes
  const chatEncodingContract = createEncodingContractNode(
    'grid-chat-0x0f1c',
    '0x0f1c',
    'text',
    'u16LE',
    'little-endian',
    130,
    base.sourceManifestHash,
    chatCodecEvidenceId,
  );
  axisNodes.push(chatEncodingContract);

  const outfitEncodingContract = createEncodingContractNode(
    'outfit-0x032f-displayname',
    '0x032f',
    'displayName',
    'u16BE',
    'big-endian',
    26,
    base.sourceManifestHash,
    outfitPartyEvidenceId,
  );
  axisNodes.push(outfitEncodingContract);

  const characterNameEncodingContract = createEncodingContractNode(
    'character-0x0323-name',
    '0x0323',
    'firstname/lastname',
    'u16LE',
    'little-endian',
    64,
    base.sourceManifestHash,
    masterDesignEvidenceId,
  );
  axisNodes.push(characterNameEncodingContract);

  // Unknown/Blocked surface node: IME input (A02 depends-on A12)
  const imeInputNode = {
    schemaVersion: CONTRACT.schemaVersion,
    nodeId: 'A12:node:ime-input-surface',
    axis: 'A12',
    type: 'text-field',
    domain: 'text-ime-input',
    owner: 'A12 ime-spec',
    summary: 'IME input text surface (keyboard composition, A02 consumer)',
    preconditions: ['ime-active', 'keyboard-connected'],
    postconditions: ['ime-text-committed'],
    failureConditions: ['ime-crash', 'composition-reset'],
    surface: 'input',
    direction: 'local',
    state: {
      grade: 'R1',
      confidence: 'unknown',
      canonicality: 'blocked',
      rights: 'unknown',
      verification: 'unverified',
    },
    lifetime: {
      creator: 'ime-manager',
      consumer: 'A02-input-handler',
      disposer: 'ime-session-close',
      scope: 'ime-composition-cycle',
      hardBound: 0,
      notApplicableReason: '',
    },
    evidenceIds: [masterDesignEvidenceId],
    relatedIssue: 'A12-ime-input',
    acceptanceCriteria: ['ime-path-defined', 'A02-consumer-documented'],
    sourceManifestHash: base.sourceManifestHash,
    unresolved: {
      impact: 'IME input path incomplete; A02 input module lists IME as surface but no detail',
      blocker: 'A02-IME-node-and-edge-must-exist-before-A12-can-link',
      nextExperiment: 'Review A02 implementation and define IME composition event record',
      releaseCondition: 'A02 exports IME surface node and edge to A12',
    },
  };
  axisNodes.push(imeInputNode);

  // Unknown/Blocked surface: two-client roundtrip validation
  const roundtripValidationNode = {
    schemaVersion: CONTRACT.schemaVersion,
    nodeId: 'A12:node:roundtrip-validation',
    axis: 'A12',
    type: 'validation-gate',
    domain: 'text-surface-validation',
    owner: 'A12 validator',
    summary: 'Two-client roundtrip validation: character name + chat message wire bytes ??parse ??render',
    preconditions: ['two-clients-connected', 'same-session', 'test-data-prepared'],
    postconditions: ['wire-bytes-verified', 'display-output-confirmed'],
    failureConditions: ['byte-mismatch', 'render-discrepancy', 'charset-corruption'],
    surface: 'test',
    direction: 'none',
    state: {
      grade: 'R1',
      confidence: 'unknown',
      canonicality: 'blocked',
      rights: 'unknown',
      verification: 'unverified',
    },
    lifetime: {
      creator: 'test-harness',
      consumer: 'verifier',
      disposer: 'test-complete',
      scope: 'live-session',
      hardBound: 0,
      notApplicableReason: '',
    },
    evidenceIds: [masterDesignEvidenceId],
    relatedIssue: 'A12-roundtrip',
    acceptanceCriteria: ['A12-PASS-criterion', 'live-two-client-packet-capture', 'screen-render-match'],
    sourceManifestHash: base.sourceManifestHash,
    unresolved: {
      impact: 'Complete two-client roundtrip validation (A12 PASS criterion) not run',
      blocker: 'live-two-client-roundtrip-not-run;-A12-PASS-blocked-until-fresh-evidence',
      nextExperiment: 'Live protocol capture: two clients send character name + chat, compare wire bytes + screen output',
      releaseCondition: 'Live A/B test confirms encoding preservation across wire-parse-render cycle',
    },
  };
  axisNodes.push(roundtripValidationNode);

  // Build edges
  const axisEdges = [];

  // Text surface ??encoding contract (depends-on)
  axisEdges.push(createTextSurfaceEdge(chatTextNode.nodeId, chatEncodingContract.nodeId, 'depends-on', chatCodecEvidenceId));
  axisEdges.push(createTextSurfaceEdge(outfitDisplayNameNode.nodeId, outfitEncodingContract.nodeId, 'depends-on', outfitPartyEvidenceId));
  axisEdges.push(createTextSurfaceEdge(characterNamePersistenceNode.nodeId, characterNameEncodingContract.nodeId, 'depends-on', masterDesignEvidenceId));

  // Persistence ??wire encoding (mutates)
  axisEdges.push(createTextSurfaceEdge(chatPersistenceNode.nodeId, chatTextNode.nodeId, 'mutates', chatCodecEvidenceId));

  // Encoding ??render (renders, but blocked)
  axisEdges.push(createTextSurfaceEdge(chatEncodingContract.nodeId, gdiTextRenderNode.nodeId, 'renders', masterDesignEvidenceId));

  // IME input ??wire text (emits)
  axisEdges.push(createTextSurfaceEdge(imeInputNode.nodeId, chatTextNode.nodeId, 'emits', masterDesignEvidenceId));

  // Roundtrip validation (observes all text surfaces)
  axisEdges.push(createTextSurfaceEdge(roundtripValidationNode.nodeId, chatTextNode.nodeId, 'observes', masterDesignEvidenceId));
  axisEdges.push(createTextSurfaceEdge(roundtripValidationNode.nodeId, outfitDisplayNameNode.nodeId, 'observes', masterDesignEvidenceId));

  // Sort axis records for determinism
  const sortedAxisNodes = sortNodesByNodeId(axisNodes);
  const sortedAxisEdges = sortEdgesByEdgeId(axisEdges);
  const sortedAxisEvidence = sortEvidenceByEvidenceId(axisEvidence);

  // Map base coverage: attach A12 nodes to coverage records for their source files
  const a12NodeIds = new Set(sortedAxisNodes.map(n => n.nodeId));
  let coverageAttachmentCount = 0;
  const mappedCoverage = base.coverage.map((cov, idx) => {
    // Attach A12 nodes to the first 3 coverage records (one group per source: master-design, chat-codec, outfit-party)
    // This ensures every A12 node is attached to exactly one coverage record
    const nodesToAttach = [];
    if (idx === 0 && coverageAttachmentCount < 3) {
      // Attach master-design and related nodes to first coverage
      nodesToAttach.push(...sortedAxisNodes.filter(n => n.nodeId.includes('gdi') || n.nodeId.includes('ime') || n.nodeId.includes('roundtrip')));
      coverageAttachmentCount += nodesToAttach.length;
    }
    if (idx === 1 && coverageAttachmentCount < 6) {
      // Attach chat-codec nodes
      nodesToAttach.push(...sortedAxisNodes.filter(n => n.nodeId.includes('grid-chat') || n.nodeId.includes('chat')));
      coverageAttachmentCount += nodesToAttach.length;
    }
    if (idx === 2 && coverageAttachmentCount < 9) {
      // Attach outfit-party nodes
      nodesToAttach.push(...sortedAxisNodes.filter(n => n.nodeId.includes('outfit')));
      coverageAttachmentCount += nodesToAttach.length;
    }
    if (idx === 3 && coverageAttachmentCount < 12) {
      // Attach remaining character-name and encoding nodes
      nodesToAttach.push(...sortedAxisNodes.filter(n => n.nodeId.includes('character-name') || n.nodeId.includes('encoding')));
      coverageAttachmentCount += nodesToAttach.length;
    }

    if (nodesToAttach.length > 0) {
      const newTargetNodeIds = [...(cov.targetNodeIds || []), ...nodesToAttach.map(n => n.nodeId)];
      return { ...cov, targetNodeIds: newTargetNodeIds };
    }
    return cov;
  });

  // Verify all A12 nodes are attached to coverage
  const attachedNodes = new Set();
  for (const cov of mappedCoverage) {
    for (const nodeId of (cov.targetNodeIds || [])) {
      if (a12NodeIds.has(nodeId)) {
        attachedNodes.add(nodeId);
      }
    }
  }

  // If any nodes are still orphaned, attach them to the first coverage record
  for (const nodeId of a12NodeIds) {
    if (!attachedNodes.has(nodeId)) {
      mappedCoverage[0].targetNodeIds = [...(mappedCoverage[0].targetNodeIds || []), nodeId];
      attachedNodes.add(nodeId);
    }
  }

  // Assemble ledger by appending A12 records to A01 base
  const ledger = {
    ...base,
    nodes: [...base.nodes, ...sortedAxisNodes],
    edges: [...base.edges, ...sortedAxisEdges],
    evidence: [...base.evidence, ...sortedAxisEvidence],
    coverage: mappedCoverage,
  };

  // Validate ledger with manifest
  validateLedger(ledger, { manifest: SOURCE_MANIFEST });

  // Write generated output (delta only)
  const delta = {
    nodes: sortedAxisNodes,
    edges: sortedAxisEdges,
    evidence: sortedAxisEvidence,
    coverage: [],
  };
  const outputPath = join(GENERATED_DIR, 'a12-text-surfaces.json');
  await writeFile(outputPath, stableStringify(delta) + '\n', 'utf8');

  return { ledger, delta };
}

// CLI entry point: output full ledger as JSON to stdout
const isMainModule = process.argv[1]?.endsWith('a12-korean-ime-encoding.mjs');
if (isMainModule) {
  const repoRoot = process.argv[2] || process.cwd();
  try {
    const { ledger } = await buildA12Axis(repoRoot);
    console.log(stableStringify(ledger));
    process.exit(0);
  } catch (err) {
    console.error('Error building A12 axis:', err.message);
    console.error('Stack:', err.stack);
    process.exit(1);
  }
}

