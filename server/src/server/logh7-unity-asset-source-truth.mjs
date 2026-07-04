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
	"logh7-unity-asset-source-truth.json",
);
const SUSPECT = "suspect-cross-check-required";
const BLOCKED = "blocked-until-cross-source-confirmed";

const SOURCE_TRUTH_INPUTS = [
	["cdMedia", "server/content/generated/logh7-cd-media-manifest.json"],
	["currentContentCrosscheck", "server/content/generated/logh7-current-content-crosscheck.json"],
	["serverServableDataFamily", "server/content/generated/logh7-server-servable-data-family.json"],
	["assetOverwriteGuard", "server/content/generated/logh7-asset-overwrite-guard.json"],
	["remasterProvenance", "server/content/generated/logh7-remaster-provenance-manifest.json"],
	["unitySourcePack", "server/content/generated/logh7-unity-source-pack-manifest.json"],
	["empireShipReference", "server/content/generated/logh7-empire-ship-reference-manifest.json"],
	["imperialCrestMask", "server/content/generated/logh7-imperial-crest-mask-manifest.json"],
	["imperialMedalSourceLock", "server/content/generated/logh7-imperial-medal-source-lock-manifest.json"],
];

const UNITY_RUNTIME_CONSUMERS = [
	"client-unity/Assets/StreamingAssets/logh7/logh7-unity-runtime-manifest.json",
	"client-unity/Assets/StreamingAssets/logh7/logh7-unity-bootstrap-manifest.json",
	"client-unity/Assets/StreamingAssets/logh7/logh7-unity-source-pack-manifest.json",
	"client-unity/Assets/StreamingAssets/logh7/logh7-remaster-provenance-manifest.json",
	"client-unity/Assets/StreamingAssets/logh7/logh7-unity-asset-source-truth.json",
];

const UNITY_ASSET_ROLES = [
	{
		id: "prototype-scenes",
		path: "client-unity/Assets/Scenes",
		role: "Unity scene implementation surface",
	},
	{
		id: "scripts",
		path: "client-unity/Assets/Scripts",
		role: "Unity runtime code",
	},
	{
		id: "editor-tools",
		path: "client-unity/Assets/Editor",
		role: "Unity editor generation tools",
	},
	{
		id: "artsource-remaster",
		path: "client-unity/Assets/ArtSource/remaster",
		role: "optional reversible remaster output",
	},
	{
		id: "artsource-reference",
		path: "client-unity/Assets/ArtSource/reference",
		role: "reference/proof assets with provenance",
	},
];

export function buildUnityAssetSourceTruthManifest({
	workspaceRoot = WORKSPACE_ROOT,
} = {}) {
	const absoluteWorkspaceRoot = resolve(workspaceRoot);
	const sourceTruthInputs = SOURCE_TRUTH_INPUTS.map(([id, path]) =>
		summarizePath(absoluteWorkspaceRoot, id, path),
	);
	const unityRuntimeConsumers = UNITY_RUNTIME_CONSUMERS.map((path) =>
		summarizePath(absoluteWorkspaceRoot, null, path),
	);
	const unityAssetRoles = UNITY_ASSET_ROLES.map((role) => ({
		...role,
		...summarizePath(absoluteWorkspaceRoot, null, role.path),
		sourceTruthAllowed: false,
		manualDragAllowed: false,
	}));
	const violations = unityAssetRoles.filter((role) => role.sourceTruthAllowed);

	return {
		id: "logh7-unity-asset-source-truth",
		generatedAt: new Date().toISOString(),
		purpose:
			"Prevent manually dragged Unity assets from becoming source truth; Unity consumes manifest-driven original fallback and reversible remaster packs.",
		canonicalPromotion: BLOCKED,
		manualDragAsSourceTruthAllowed: false,
		manualAuthorityClaims: [],
		violationCount: violations.length,
		sourceTruthInputs,
		unityRuntimeConsumers,
		unityAssetRoles,
		reproducibilityRules: [
			{
				id: "no-manual-inspector-drag-as-source-truth",
				rule: "Unity Inspector/Project-window drag-and-drop may create prototype scenes, but cannot be cited as data authority.",
			},
			{
				id: "streamingassets-manifest-consumption",
				rule: "Runtime data must be consumed through Assets/StreamingAssets/logh7 manifests generated from server/content and evidence catalogs.",
			},
			{
				id: "artsource-output-provenance",
				rule: "ArtSource remaster/reference/concept files are outputs or proof references and must remain manifest-driven with original fallback.",
			},
		],
		canonicalStatus: SUSPECT,
	};
}

export function writeUnityAssetSourceTruthManifest({
	outPath = DEFAULT_OUT,
	manifest,
	workspaceRoot = WORKSPACE_ROOT,
} = {}) {
	const resolvedManifest =
		manifest ?? buildUnityAssetSourceTruthManifest({ workspaceRoot });
	writeJson(outPath, resolvedManifest);
	return resolvedManifest;
}

function summarizePath(workspaceRoot, id, path) {
	const absolutePath = join(workspaceRoot, path);
	const exists = existsSync(absolutePath);
	const base = {
		...(id ? { id } : {}),
		path,
		status: exists ? "present" : "missing",
	};

	if (!exists) return base;

	const stats = statSync(absolutePath);
	if (!stats.isFile()) {
		return {
			...base,
			kind: "directory",
			childCount: 0,
		};
	}

	const bytes = readFileSync(absolutePath);
	return {
		...base,
		path: normalizePath(relative(workspaceRoot, absolutePath)),
		kind: "file",
		size: bytes.length,
		sha1: createHash("sha1").update(bytes).digest("hex"),
	};
}

function writeJson(path, value) {
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function normalizePath(path) {
	return path.split("\\").join("/");
}
