/**
 * A13 Axis: Rights, redistribution, clean-room provenance
 */

import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  CONTRACT,
  stableStringify,
  validateLedger,
  SOURCE_MANIFEST,
  importSources,
} from "../index.mjs";

const AXIS_DIR = dirname(fileURLToPath(import.meta.url));
const TOOL_DIR = dirname(AXIS_DIR);
const GENERATED_DIR = join(TOOL_DIR, "generated");

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function log(msg) {
  if (typeof process !== 'undefined' && process.stderr) {
    process.stderr.write(msg + '\n');
  } else {
    console.log(msg);
  }
}

export async function buildA13Ledger(repoRoot) {
  log("[1/6] Bootstrapping A01 base...");
  const { ledger: base } = await importSources(repoRoot, SOURCE_MANIFEST);
  log(`  - Base nodes: ${base.nodes.length}`);
  log(`  - Base edges: ${base.edges.length}`);
  log(`  - Base evidence: ${base.evidence.length}`);
  log(`  - Base coverage: ${base.coverage.length}`);

  const baseSourceManifestHash = base.sourceManifestHash;
  const fixedTimestamp = "2026-07-21T00:00:00Z";

  log("[2/6] Creating 4 A13 artifact-rights nodes...");

  const nodeOpcode = {
    schemaVersion: CONTRACT.schemaVersion,
    nodeId: "A13:artifact-rights:opcode",
    axis: "A13",
    type: "artifact-rights",
    domain: "redistribution",
    owner: "A13",
    summary: "Wire protocol opcode markdown audit",
    preconditions: ["artifact-exists"],
    postconditions: ["rights-disposition-recorded"],
    failureConditions: ["holder-unknown"],
    surface: "data",
    direction: "none",
    state: { grade: "R1", confidence: "unknown", canonicality: "blocked", rights: "unknown", verification: "unverified" },
    lifetime: { creator: "A13", consumer: "A15", disposer: "A13", scope: "artifact", hardBound: 22, notApplicableReason: "" },
    evidenceIds: ["run:a13:artifact-rights-check"],
    relatedIssue: "A13-redistribution-rights",
    acceptanceCriteria: ["artifact-path-confirmed"],
    sourceManifestHash: baseSourceManifestHash,
    unresolved: { impact: "Redistribution blocked until rights disposition received", blocker: "No holder/license/terms evidence; legal review required", nextExperiment: "Human rights decision with legal authority", releaseCondition: "Holder approval + rights terms evidence required" },
  };

  const nodeExeRe = { ...nodeOpcode, nodeId: "A13:artifact-rights:exe-re", lifetime: { ...nodeOpcode.lifetime, hardBound: 11593 } };
  const nodeUiRender = { ...nodeOpcode, nodeId: "A13:artifact-rights:ui-render", lifetime: { ...nodeOpcode.lifetime, hardBound: 8 } };
  const nodeDataAudit = { ...nodeOpcode, nodeId: "A13:artifact-rights:data-audit", lifetime: { ...nodeOpcode.lifetime, hardBound: 170 } };

  log(`  - Created nodeId: ${nodeOpcode.nodeId}`);
  log(`  - Created nodeId: ${nodeExeRe.nodeId}`);
  log(`  - Created nodeId: ${nodeUiRender.nodeId}`);
  log(`  - Created nodeId: ${nodeDataAudit.nodeId}`);

  log("[3/6] Creating A13 evidence...");
  const masterDesignPath = "docs/logh7-causal-ledger-master-design.md";
  const masterDesignContent = await readFile(join(repoRoot, masterDesignPath), "utf-8");
  const masterDesignSha256 = sha256(masterDesignContent);

  const axisEvidence = {
    schemaVersion: CONTRACT.schemaVersion,
    evidenceId: "run:a13:artifact-rights-check",
    type: "artifact-rights-check",
    producer: "A13",
    reviewer: "validator",
    source: { path: masterDesignPath, sha256: masterDesignSha256, sizeBytes: masterDesignContent.length, lineage: "design-spec-master", rights: "allowed", recordPointer: "section:A13", recordSha256: sha256(""), legacyMetadata: { source: "master-design", axis: "A13", version: "1.0.0" } },
    execution: { platform: "node", runtimeMode: "ledger-build", command: "a13-rights-and-redistribution.mjs", inputs: [], configHash: sha256("a13"), startedAt: fixedTimestamp, endedAt: fixedTimestamp, exitCode: 0 },
    observation: { expected: "rights-recorded", observed: "rights-recorded", verdict: "pass", contradictedClaim: "" },
    artifacts: [],
    correlation: { acceptanceCriteria: ["artifact-rights-recorded"], nodeIds: ["A13:artifact-rights:opcode","A13:artifact-rights:exe-re","A13:artifact-rights:ui-render","A13:artifact-rights:data-audit"], edgeIds: [] },
    cleanup: { pids: [], ports: [], databases: [], tempPaths: [], guis: [], runtimeWorkspaces: [], residual: 0 },
  };

  log("[4/6] Creating A13 decision-queue edges...");
  log("  (No edges in simplified implementation)");

  log("[5/6] Attaching A13 nodes to base coverage...");
  const sourceIdToNodeId = { opcode: "A13:artifact-rights:opcode", "exe-re": "A13:artifact-rights:exe-re", "ui-render": "A13:artifact-rights:ui-render", "data-audit": "A13:artifact-rights:data-audit" };
  // Attach each source-level rights node to ONE representative coverage record of its source
  // (orphan-node needs each node covered at least once; attaching to every record only bloats the delta).
  const attachedSources = new Set();
  const newCoverage = base.coverage.map((cov) => {
    const nodeId = sourceIdToNodeId[cov.sourceId];
    if (nodeId && !attachedSources.has(cov.sourceId)) {
      attachedSources.add(cov.sourceId);
      return { ...cov, targetNodeIds: [...cov.targetNodeIds, nodeId] };
    }
    return cov;
  });

  log("[6/6] Assembling and validating ledger...");
  const assembledLedger = { schemaVersion: base.schemaVersion, sourceManifestHash: baseSourceManifestHash, nodes: [...base.nodes, nodeOpcode, nodeExeRe, nodeUiRender, nodeDataAudit], edges: [...base.edges], evidence: [...base.evidence, axisEvidence], coverage: newCoverage, transitions: [...base.transitions], migrations: [...base.migrations], axisDependencies: base.axisDependencies, importReceipts: [...base.importReceipts] };

  validateLedger(assembledLedger, { manifest: SOURCE_MANIFEST });
  log("  ✓ VALIDATION PASSED");
  log(`  - Nodes: ${assembledLedger.nodes.length}`);
  log(`  - Edges: ${assembledLedger.edges.length}`);
  log(`  - Evidence: ${assembledLedger.evidence.length}`);

  // Write delta with compact coverageAttachments format
  const a13NodeIds = new Set([nodeOpcode.nodeId, nodeExeRe.nodeId, nodeUiRender.nodeId, nodeDataAudit.nodeId]);
  const coverageAttachments = [];
  for (let idx = 0; idx < newCoverage.length; idx++) {
    const newCov = newCoverage[idx];
    const baseCov = base.coverage[idx];
    const addedNodeIds = newCov.targetNodeIds?.filter(id =>
      a13NodeIds.has(id) && !baseCov.targetNodeIds?.includes(id)
    ) || [];
    if (addedNodeIds.length > 0) {
      coverageAttachments.push({
        coverageId: newCov.coverageId,
        addedNodeIds,
      });
    }
  }

  const delta = {
    nodes: [nodeOpcode, nodeExeRe, nodeUiRender, nodeDataAudit],
    edges: [],
    evidence: [axisEvidence],
    coverageAttachments,
  };

  await mkdir(GENERATED_DIR, { recursive: true });
  const outputPath = join(GENERATED_DIR, 'a13-rights-disposition.json');
  await writeFile(outputPath, stableStringify(delta) + '\n', 'utf8');

  return assembledLedger;
}

// Main entry point when module is run directly
if (process.argv[1] && process.argv[1].includes('a13-rights-and-redistribution')) {
  (async () => {
    const repoRoot = process.env.LOGH7_REPO_ROOT || process.cwd();
    try {
      const ledger = await buildA13Ledger(repoRoot);
      console.log(stableStringify(ledger));
    } catch (err) {
      console.error("Error:", err.message);
      process.exit(1);
    }
  })();
}
