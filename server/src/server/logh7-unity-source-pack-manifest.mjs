import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { inventorySourceRoots } from "./logh7-source-corpus.mjs";

const SERVER_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const WORKSPACE_ROOT = join(SERVER_ROOT, "..");
const DEFAULT_OUT = join(
	SERVER_ROOT,
	"content",
	"generated",
	"logh7-unity-source-pack-manifest.json",
);
const SUSPECT = "suspect-cross-check-required";
const PROMOTION_BLOCKED = "blocked-until-cross-source-confirmed";
const INPUTS = [
	[
		"cdMedia",
		"server/content/generated/logh7-cd-media-manifest.json",
	],
	[
		"sourceRootRegistry",
		"server/content/original-data/logh7-source-roots.json",
	],
	[
		"currentContentCrosscheck",
		"server/content/generated/logh7-current-content-crosscheck.json",
	],
	[
		"serverServableDataFamily",
		"server/content/generated/logh7-server-servable-data-family.json",
	],
	[
		"runtimeBoundary",
		"server/content/generated/logh7-runtime-boundary-manifest.json",
	],
	[
		"unityRuntimeManifest",
		"client-unity/Assets/StreamingAssets/logh7/logh7-unity-runtime-manifest.json",
	],
	[
		"unityBootstrapManifest",
		"client-unity/Assets/StreamingAssets/logh7/logh7-unity-bootstrap-manifest.json",
	],
];
const ORIGINAL_ASSET_FAMILIES = [
	{
		id: "imperialShipMdx",
		path: ".omo/work/logh7-installed/data/model/Ship/GE",
		format: "MDX",
		required: true,
		policy:
			"Use extracted Empire Ship/GE MDX as the canonical fallback before generated or remastered ship art.",
	},
	{
		id: "fieldShipMarkSheet",
		path: ".omo/work/logh7-installed/data/image/Field/ShipMark.tga",
		format: "TGA",
		required: true,
		policy:
			"Use the original ShipMark sheet as source evidence for field/faction markings before redraws.",
	},
	{
		id: "imperialDoubleEagleReference",
		path: "client-unity/Assets/ArtSource/reference/logh7-imperial-double-eagle-reference.jpg",
		format: "JPG",
		required: true,
		policy:
			"Imperial crest art must stay source-locked to this reference or a derived mask; generated approximations are invalid.",
	},
	{
		id: "imperialDoubleEagleMasks",
		paths: [
			"client-unity/Assets/ArtSource/reference/imperial-crest/logh7-imperial-double-eagle-mask-gold.png",
			"client-unity/Assets/ArtSource/reference/imperial-crest/logh7-imperial-double-eagle-mask-silver.png",
			"client-unity/Assets/ArtSource/reference/imperial-crest/logh7-imperial-double-eagle-mask-white.png",
		],
		format: "PNG",
		required: true,
		policy:
			"Use these exact masks for Imperial medals and faction marks unless newer source-locked masks are generated from the same reference.",
	},
];

export function buildUnitySourcePackManifest({
	workspaceRoot = WORKSPACE_ROOT,
} = {}) {
	const absoluteWorkspaceRoot = resolve(workspaceRoot);
	const inputs = INPUTS.map(([id, path]) => summarizeInput(absoluteWorkspaceRoot, id, path));
	const sourceRootRegistry = readInputJson(inputs, "sourceRootRegistry");
	const crosscheck = readInputJson(inputs, "currentContentCrosscheck");
	const promotion = crosscheck?.canonicalPromotion ?? PROMOTION_BLOCKED;
	const sourceRoots = Array.isArray(crosscheck?.sourceRoots) ? crosscheck.sourceRoots : [];
	const sourceRootInventory = sourceRootRegistry
		? inventorySourceRoots({ registry: sourceRootRegistry, workspaceRoot: absoluteWorkspaceRoot })
		: {
				id: "logh7-source-roots-inventory",
				status: "unavailable",
				roots: [],
			};

	return {
		id: "logh7-unity-source-pack-manifest",
		generatedAt: new Date().toISOString(),
		unity: {
			version: "6000.5.2f1",
			consumer: "client-unity/Assets/StreamingAssets/logh7/",
		},
		streamingAssetsTarget:
			"client-unity/Assets/StreamingAssets/logh7/logh7-unity-source-pack-manifest.json",
		canonicalPromotion: promotion,
		inputs,
		verifiedRecords: [],
		originalFallbackPack: {
			id: "original-fallback",
			required: true,
			canonicalStatus: SUSPECT,
			sourceRoots,
			sourceRootInventory,
			requiredAssetFamilies: ORIGINAL_ASSET_FAMILIES.map((family) =>
				summarizeAssetFamily(absoluteWorkspaceRoot, family),
				),
			policy:
				"Use original extracted assets as fallback for every remaster or mod replacement; do not treat suspect data as canonical.",
		},
		remasterPacks: [
			{
				id: "remaster-hd",
				enabledByDefault: false,
				reversible: true,
				manifestDriven: true,
				conflictCheckRequired: true,
				provenanceLabelRequired: true,
				canonicalFallbackRequired: true,
			},
		],
	};
}

export function writeUnitySourcePackManifest({
	outPath = DEFAULT_OUT,
	manifest,
	workspaceRoot = WORKSPACE_ROOT,
} = {}) {
	const resolvedManifest =
		manifest ?? buildUnitySourcePackManifest({ workspaceRoot });
	writeJson(outPath, resolvedManifest);
	return resolvedManifest;
}

function summarizeAssetFamily(workspaceRoot, family) {
	if (Array.isArray(family.paths)) {
		const files = family.paths.map((path) => summarizeAssetPath(workspaceRoot, path, family.format));
		return {
			...family,
			canonicalStatus: SUSPECT,
			status: files.every((file) => file.status === "present") ? "present" : "missing",
			files,
		};
	}

	const summary = summarizeAssetPath(workspaceRoot, family.path, family.format);
	return {
		...family,
		canonicalStatus: SUSPECT,
		status: summary.status,
		fileCount: summary.fileCount,
		byteSize: summary.byteSize,
		sha256: summary.sha256,
	};
}

function summarizeAssetPath(workspaceRoot, path, format) {
	const absolutePath = join(workspaceRoot, path);
	if (!existsSync(absolutePath)) {
		return { path, status: "missing" };
	}

	const stats = statSync(absolutePath);
	if (stats.isDirectory()) {
		const extension = format ? `.${format.toLowerCase()}` : undefined;
		return {
			path,
			status: "present",
			fileCount: countFiles(absolutePath, extension),
		};
	}

	const bytes = readFileSync(absolutePath);
	return {
		path,
		status: "present",
		fileCount: 1,
		byteSize: stats.size,
		sha256: createHash("sha256").update(bytes).digest("hex"),
	};
}

function countFiles(path, extension) {
	let count = 0;
	for (const entry of readdirSync(path, { withFileTypes: true })) {
		const entryPath = join(path, entry.name);
		if (entry.isDirectory()) {
			count += countFiles(entryPath, extension);
			continue;
		}
		if (!entry.isFile()) continue;
		if (!extension || entry.name.toLowerCase().endsWith(extension)) {
			count += 1;
		}
	}
	return count;
}

function summarizeInput(workspaceRoot, id, path) {
	const absolutePath = join(workspaceRoot, path);
	if (!existsSync(absolutePath)) {
		return { id, path, status: "missing", canonicalStatus: SUSPECT };
	}

	const bytes = readFileSync(absolutePath);
	const base = {
		id,
		path: normalizePath(relative(workspaceRoot, absolutePath)),
		canonicalStatus: SUSPECT,
		size: statSync(absolutePath).size,
		sha1: createHash("sha1").update(bytes).digest("hex"),
	};

	try {
		const parsed = JSON.parse(bytes.toString("utf8"));
		return {
			...base,
			status: "present",
			manifestId: parsed.id ?? null,
			manifestStatus: parsed.status ?? parsed.canonicalPromotion ?? null,
			parsed,
		};
	} catch (error) {
		return {
			...base,
			status: "unreadable",
			error: error instanceof Error ? error.message : String(error),
		};
	}
}

function readInputJson(inputs, id) {
	return inputs.find((input) => input.id === id && input.status === "present")?.parsed;
}

function writeJson(path, value) {
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, `${JSON.stringify(stripInternalFields(value), null, 2)}\n`);
}

function stripInternalFields(value) {
	if (Array.isArray(value)) return value.map(stripInternalFields);
	if (value && typeof value === "object") {
		return Object.fromEntries(
			Object.entries(value)
				.filter(([key]) => key !== "parsed")
				.map(([key, item]) => [key, stripInternalFields(item)]),
		);
	}
	return value;
}

function normalizePath(path) {
	return path.split("\\").join("/");
}
