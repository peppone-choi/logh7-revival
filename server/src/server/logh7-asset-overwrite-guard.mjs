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
	"logh7-asset-overwrite-guard.json",
);
const PROTECTED_ROOTS = [
	"client-unity/Assets/ArtSource/original",
	".omo/work/logh7-installed",
	"RE/.omo/work/logh7-cd-extract",
	"server/content/original-data",
	"RE/content/original-data",
];
const ALLOWED_REMASTER_ROOTS = [
	"client-unity/Assets/ArtSource/remaster",
	"client-unity/Assets/ArtSource/reference",
	"client-unity/Assets/ArtSource/concept",
];
const ARTIFACT_MANIFESTS = [
	["alliance-medal-upscale", "server/content/generated/logh7-alliance-medal-upscale-manifest.json"],
	["alliance-medal-redraw", "server/content/generated/logh7-alliance-medal-redraw-manifest.json"],
	[
		"alliance-foundation-medal-redraw",
		"server/content/generated/logh7-alliance-foundation-medal-redraw-manifest.json",
	],
	["imperial-medal-source-lock", "server/content/generated/logh7-imperial-medal-source-lock-manifest.json"],
	["imperial-crest-mask", "server/content/generated/logh7-imperial-crest-mask-manifest.json"],
	["empire-ship-reference", "server/content/generated/logh7-empire-ship-reference-manifest.json"],
];

export function buildAssetOverwriteGuardManifest({
	workspaceRoot = WORKSPACE_ROOT,
	artifactManifests = ARTIFACT_MANIFESTS,
	generatedAt = new Date().toISOString(),
} = {}) {
	const artifacts = artifactManifests.map(([id, path]) =>
		summarizeArtifact(workspaceRoot, id, path),
	);
	return {
		id: "logh7-asset-overwrite-guard",
		generatedAt,
		policy: "original-assets-read-only-remasters-reversible",
		protectedOriginalRoots: PROTECTED_ROOTS.map((path) => ({
			path,
			writePolicy: "read-only-fallback",
		})),
		allowedRemasterRoots: ALLOWED_REMASTER_ROOTS.map((path) => ({
			path,
			writePolicy: "remaster-output",
		})),
		remasterArtifacts: artifacts,
		violationCount: artifacts.reduce(
			(count, artifact) =>
				count + artifact.outputs.filter((output) => output.overwritesOriginal).length,
			0,
		),
	};
}

export function writeAssetOverwriteGuardManifest({
	outPath = DEFAULT_OUT,
	workspaceRoot = WORKSPACE_ROOT,
	artifactManifests = ARTIFACT_MANIFESTS,
	manifest,
} = {}) {
	const resolvedManifest =
		manifest ??
		buildAssetOverwriteGuardManifest({
			workspaceRoot: resolve(workspaceRoot),
			artifactManifests,
		});
	mkdirSync(dirname(outPath), { recursive: true });
	writeFileSync(outPath, `${JSON.stringify(resolvedManifest, null, 2)}\n`);
	return resolvedManifest;
}

function summarizeArtifact(workspaceRoot, id, path) {
	const absolutePath = resolve(workspaceRoot, path);
	const base = { id, path: normalizePath(path), outputs: [] };
	if (!existsSync(absolutePath)) return { ...base, status: "missing" };
	const bytes = readFileSync(absolutePath);
	try {
		const parsed = JSON.parse(bytes.toString("utf8"));
		return {
			...base,
			status: "present",
			size: statSync(absolutePath).size,
			sha1: createHash("sha1").update(bytes).digest("hex"),
			manifestId: parsed.id ?? null,
			outputs: collectOutputPaths(parsed).map((outputPath) =>
				summarizeOutput(workspaceRoot, outputPath),
			),
		};
	} catch (error) {
		return {
			...base,
			status: "unreadable",
			error: error instanceof Error ? error.message : String(error),
		};
	}
}

function collectOutputPaths(value) {
	const paths = [];
	visitOutputs(value, null, paths);
	return [...new Set(paths)];
}

function visitOutputs(value, key, paths) {
	if (Array.isArray(value)) {
		for (const item of value) visitOutputs(item, key, paths);
		return;
	}
	if (!value || typeof value !== "object") return;
	for (const [childKey, childValue] of Object.entries(value)) {
		if (typeof childValue === "string" && (childKey === "output" || childKey === "outputPath")) {
			paths.push(childValue);
		} else if (childKey === "outputs" && Array.isArray(childValue)) {
			for (const item of childValue) {
				if (item?.path) paths.push(item.path);
				visitOutputs(item, childKey, paths);
			}
		} else if (key === "entries" && typeof childValue === "object") {
			visitOutputs(childValue, childKey, paths);
		} else {
			visitOutputs(childValue, childKey, paths);
		}
	}
}

function summarizeOutput(workspaceRoot, outputPath) {
	const relativePath = normalizeToWorkspacePath(workspaceRoot, outputPath);
	const overwritesOriginal = PROTECTED_ROOTS.some((root) => isInsideRoot(relativePath, root));
	return {
		path: relativePath,
		overwritesOriginal,
		allowed: !overwritesOriginal,
	};
}

function normalizeToWorkspacePath(workspaceRoot, path) {
	const normalized = normalizePath(path);
	const normalizedRoot = normalizePath(workspaceRoot);
	if (normalized.startsWith(`${normalizedRoot}/`)) {
		return normalized.slice(normalizedRoot.length + 1);
	}
	return normalized;
}

function isInsideRoot(path, root) {
	return path === root || path.startsWith(`${root}/`);
}

function normalizePath(path) {
	return path.replace(/\\/g, "/");
}
