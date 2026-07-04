import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SERVER_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const WORKSPACE_ROOT = join(SERVER_ROOT, "..");
const DEFAULT_OUT = join(
	SERVER_ROOT,
	"content",
	"generated",
	"logh7-remaster-provenance-manifest.json",
);
const SUSPECT = "suspect-cross-check-required";
const PROVENANCE_REQUIREMENT_IDS = [
	"sourceHashes",
	"tool",
	"prompt",
	"settings",
	"reviewer",
	"outputHash",
	"rollback",
	"qaEvidence",
];
const ARTIFACTS = [
	["alliance-medal-upscale", "server/content/generated/logh7-alliance-medal-upscale-manifest.json"],
	["alliance-medal-redraw", "server/content/generated/logh7-alliance-medal-redraw-manifest.json"],
	["imperial-medal-source-lock", "server/content/generated/logh7-imperial-medal-source-lock-manifest.json"],
	["imperial-crest-mask", "server/content/generated/logh7-imperial-crest-mask-manifest.json"],
	["empire-ship-reference", "server/content/generated/logh7-empire-ship-reference-manifest.json"],
	["asset-overwrite-guard", "server/content/generated/logh7-asset-overwrite-guard.json"],
	["unity-source-pack", "server/content/generated/logh7-unity-source-pack-manifest.json"],
];

export function buildRemasterProvenanceManifest({
	workspaceRoot = WORKSPACE_ROOT,
} = {}) {
	const absoluteWorkspaceRoot = resolve(workspaceRoot);
	const artifacts = ARTIFACTS.map(([id, path]) =>
		summarizeArtifact(absoluteWorkspaceRoot, id, path),
	);

	return {
		id: "logh7-remaster-provenance-manifest",
		generatedAt: new Date().toISOString(),
		canonicalPromotion: "blocked-until-cross-source-confirmed",
		streamingAssetsTarget:
			"client-unity/Assets/StreamingAssets/logh7/logh7-remaster-provenance-manifest.json",
		packs: [
			{
				id: "remaster-hd",
				enabledByDefault: false,
				reversible: true,
				manifestDriven: true,
				conflictCheckRequired: true,
				provenanceLabelRequired: true,
				originalFallbackRequired: true,
				provenanceSchemaVersion: 1,
				provenanceRequirementIds: PROVENANCE_REQUIREMENT_IDS,
				artifacts,
			},
		],
	};
}

export function writeRemasterProvenanceManifest({
	outPath = DEFAULT_OUT,
	manifest,
	workspaceRoot = WORKSPACE_ROOT,
} = {}) {
	const resolvedManifest =
		manifest ?? buildRemasterProvenanceManifest({ workspaceRoot });
	writeJson(outPath, resolvedManifest);
	return resolvedManifest;
}

function summarizeArtifact(workspaceRoot, id, path) {
	const absolutePath = join(workspaceRoot, path);
	const base = {
		id,
		path,
		enabledByDefault: false,
		reversible: true,
		conflictCheckRequired: true,
		provenanceLabelRequired: true,
		originalFallbackRequired: true,
		canonicalStatus: SUSPECT,
	};

	if (!existsSync(absolutePath)) {
		return {
			...base,
			status: "missing",
			provenance: buildMissingProvenance(path),
		};
	}

	const bytes = readFileSync(absolutePath);
	const outputHash = {
		kind: "manifest-file-sha256",
		path: normalizePath(relative(workspaceRoot, absolutePath)),
		sha256: createHash("sha256").update(bytes).digest("hex"),
	};
	try {
		const parsed = JSON.parse(bytes.toString("utf8"));
		return {
			...base,
			path: normalizePath(relative(workspaceRoot, absolutePath)),
			status: "present",
			manifestId: parsed.id ?? null,
			manifestStatus: parsed.status ?? parsed.canonicalPromotion ?? null,
			size: statSync(absolutePath).size,
			sha1: createHash("sha1").update(bytes).digest("hex"),
			sha256: outputHash.sha256,
			provenance: buildProvenanceEnvelope({ id, parsed, outputHash }),
		};
	} catch (error) {
		return {
			...base,
			path: normalizePath(relative(workspaceRoot, absolutePath)),
			status: "unreadable",
			error: error instanceof Error ? error.message : String(error),
			size: statSync(absolutePath).size,
			sha256: outputHash.sha256,
			provenance: buildUnreadableProvenance(outputHash),
		};
	}
}

function buildProvenanceEnvelope({ id, parsed, outputHash }) {
	return {
		sourceHashes: collectSourceHashes(parsed),
		tool: collectTool(id, parsed),
		prompt: collectPrompt(parsed),
		settings: collectSettings(parsed),
		reviewer: collectReviewer(parsed),
		outputHash,
		outputAssets: collectOutputAssets(parsed),
		rollback: {
			strategy: "disable-artifact-use-original-fallback",
			originalFallbackRequired: true,
			conflictCheckRequired: true,
		},
		qaEvidence: collectQaEvidence(parsed),
	};
}

function buildMissingProvenance(path) {
	return {
		sourceHashes: { status: "missing", path },
		tool: { status: "missing" },
		prompt: { status: "missing" },
		settings: { status: "missing" },
		reviewer: { status: "missing" },
		outputHash: { kind: "missing", path, sha256: null },
		rollback: {
			strategy: "disable-artifact-use-original-fallback",
			originalFallbackRequired: true,
			conflictCheckRequired: true,
		},
		qaEvidence: { status: "missing" },
	};
}

function buildUnreadableProvenance(outputHash) {
	return {
		sourceHashes: { status: "unreadable" },
		tool: { status: "unreadable" },
		prompt: { status: "unreadable" },
		settings: { status: "unreadable" },
		reviewer: { status: "unreadable" },
		outputHash,
		rollback: {
			strategy: "disable-artifact-use-original-fallback",
			originalFallbackRequired: true,
			conflictCheckRequired: true,
		},
		qaEvidence: { status: "unreadable" },
	};
}

function collectSourceHashes(parsed) {
	const hashes = [];
	if (parsed.sourceSha256) {
		hashes.push({
			path: parsed.source?.path ?? parsed.source ?? null,
			sha256: parsed.sourceSha256,
			source: "manifest-sourceSha256",
		});
	}
	if (Array.isArray(parsed.inputs)) {
		for (const input of parsed.inputs) {
			if (input.sha256) hashes.push({ path: input.path ?? null, sha256: input.sha256, source: input.id });
			else if (input.sha1) hashes.push({ path: input.path ?? null, sha1: input.sha1, source: input.id });
		}
	}
	if (Array.isArray(parsed.entries)) {
		for (const entry of parsed.entries) {
			if (entry.sourceSha256) {
				hashes.push({
					path: entry.source?.path ?? entry.source ?? null,
					sha256: entry.sourceSha256,
					source: entry.stem ? `entries.${entry.stem}` : "entries.sourceSha256",
				});
			}
		}
	}
	if (parsed.sourceDir) hashes.push({ path: parsed.sourceDir, source: "sourceDir", status: "hash-pending" });
	if (parsed.sourceSheet) hashes.push({ path: parsed.sourceSheet, source: "sourceSheet", status: "hash-pending" });
	if (parsed.sourceLock?.requiredReference) {
		hashes.push({
			path: parsed.sourceLock.requiredReference,
			source: "sourceLock.requiredReference",
			status: "hash-pending",
		});
	}
	return hashes.length > 0 ? hashes : { status: "missing" };
}

function collectOutputAssets(parsed) {
	if (!Array.isArray(parsed.outputs)) return { status: "not-declared" };
	return parsed.outputs.map((output) => ({
		path: output.path ?? null,
		sha256: output.sha256 ?? null,
		dimensions: output.dimensions ?? null,
	}));
}

function collectTool(id, parsed) {
	return {
		status: parsed.method || parsed.tool ? "present" : "pending",
		id,
		method: parsed.method ?? null,
		tool: parsed.tool ?? null,
	};
}

function collectPrompt(parsed) {
	return parsed.prompt
		? { status: "present", value: parsed.prompt }
		: { status: "pending", required: true };
}

function collectSettings(parsed) {
	const settings = parsed.settings ?? {
		scale: parsed.scale ?? null,
		qualityNote: parsed.qualityNote ?? null,
	};
	return { status: Object.values(settings).some((value) => value !== null) ? "present" : "pending", values: settings };
}

function collectReviewer(parsed) {
	return parsed.reviewer
		? { status: "present", value: parsed.reviewer }
		: { status: "pending", required: true };
}

function collectQaEvidence(parsed) {
	return parsed.qaEvidence
		? { status: "present", value: parsed.qaEvidence }
		: { status: "pending", required: true };
}

function writeJson(path, value) {
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function normalizePath(path) {
	return path.split("\\").join("/");
}
