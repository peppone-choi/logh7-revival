import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SERVER_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const WORKSPACE_ROOT = join(SERVER_ROOT, "..");
const DEFAULT_OUT = join(
	SERVER_ROOT,
	"content",
	"generated",
	"logh7-ui-scene-remaster-gameplay-boundary.json",
);
const BLOCKED = "blocked-until-cross-source-confirmed";
const INPUTS = [
	["sceneInventory", "server/content/generated/logh7-scene-inventory.json"],
	["remasterProvenance", "server/content/generated/logh7-remaster-provenance-manifest.json"],
	["runtimeBoundary", "server/content/generated/logh7-runtime-boundary-manifest.json"],
	["operationCatalog", "server/content/generated/logh7-operation-catalog.json"],
	["empireShipReference", "server/content/generated/logh7-empire-ship-reference-manifest.json"],
	["imperialCrestMask", "server/content/generated/logh7-imperial-crest-mask-manifest.json"],
];

export function buildUiSceneRemasterGameplayBoundary({
	workspaceRoot = WORKSPACE_ROOT,
} = {}) {
	const root = resolve(workspaceRoot);
	const inputs = INPUTS.map(([id, path]) => summarizeInput(root, id, path));
	const parsed = Object.fromEntries(
		inputs.filter((input) => input.status === "present").map((input) => [input.id, input.parsed]),
	);

	return {
		id: "logh7-ui-scene-remaster-gameplay-boundary",
		generatedAt: new Date().toISOString(),
		canonicalPromotion: BLOCKED,
		streamingAssetsTarget:
			"client-unity/Assets/StreamingAssets/logh7/logh7-ui-scene-remaster-gameplay-boundary.json",
		inputs,
		uiSceneCatalog: summarizeScenes(parsed.sceneInventory),
		remasterPackSchema: summarizeRemaster(parsed.remasterProvenance),
		originalAssetContracts: summarizeOriginalAssets(root, {
			empireShipReference: parsed.empireShipReference,
			imperialCrestMask: parsed.imperialCrestMask,
			remasterProvenance: parsed.remasterProvenance,
		}),
		gameplayContractBoundary: summarizeGameplay(
			parsed.runtimeBoundary,
			parsed.operationCatalog,
		),
		policy:
			"Unity UI scenes consume scene/remaster/gameplay contracts as suspect import data; remaster packs stay optional and gameplay formulas remain unpromoted until cross-source proof.",
	};
}

export function writeUiSceneRemasterGameplayBoundary({
	outPath = DEFAULT_OUT,
	manifest,
	workspaceRoot = WORKSPACE_ROOT,
} = {}) {
	const resolved = manifest ?? buildUiSceneRemasterGameplayBoundary({ workspaceRoot });
	writeJson(outPath, resolved);
	return resolved;
}

function summarizeScenes(sceneInventory) {
	if (!sceneInventory?.scenes) return { status: "unavailable" };
	return {
		status: "present",
		sceneCount: sceneInventory.summary?.sceneCount ?? sceneInventory.scenes.length,
		evidenceBackedSceneCount: sceneInventory.summary?.evidenceBackedSceneCount ?? 0,
		sceneIds: sceneInventory.scenes.map((scene) => scene.id),
		placeholderRequiredCount: sceneInventory.scenes.filter(
			(scene) => scene.implementationStatus === "placeholder-required",
		).length,
	};
}

function summarizeRemaster(remaster) {
	const pack = remaster?.packs?.find((item) => item.id === "remaster-hd");
	if (!pack) return { status: "unavailable", packIds: remaster?.packs?.map((item) => item.id) ?? [] };
	return {
		status: "present",
		packIds: remaster.packs.map((item) => item.id),
		enabledByDefault: Boolean(pack.enabledByDefault),
		reversible: Boolean(pack.reversible),
		manifestDriven: Boolean(pack.manifestDriven),
		originalFallbackRequired: Boolean(pack.originalFallbackRequired),
		artifactCount: Array.isArray(pack.artifacts) ? pack.artifacts.length : 0,
		artifactIds: Array.isArray(pack.artifacts)
			? pack.artifacts.map((artifact) => artifact.id).sort()
			: [],
	};
}

function summarizeOriginalAssets(
	workspaceRoot,
	{ empireShipReference, imperialCrestMask, remasterProvenance },
) {
	const artifactIds = new Set(
		remasterProvenance?.packs
			?.flatMap((pack) => pack.artifacts ?? [])
			.map((artifact) => artifact.id) ?? [],
	);
	const empireShips = summarizeEmpireShips(workspaceRoot, empireShipReference, artifactIds);
	const imperialCrest = summarizeImperialCrest(imperialCrestMask, artifactIds);
	return {
		status:
			empireShips.status === "present" && imperialCrest.status === "present"
				? "present"
				: "partial",
		sourceAuthority: "original-cd-assets-first",
		generationPolicy:
			"Use original Empire Ship/GE MDX, ship thumbnails, and supplied imperial crest mask before any generated remaster substitute; generated assets remain optional overlays with original fallback.",
		empireShips,
		imperialCrest,
	};
}

function summarizeEmpireShips(workspaceRoot, empireShipReference, artifactIds) {
	const modelDir = ".omo/work/logh7-installed/data/model/Ship/GE";
	const thumbnailDir = ".omo/work/logh7-installed/data/image/Thumbnail/Ship";
	const modelFiles = countImmediateFiles(join(workspaceRoot, modelDir));
	const thumbnailFiles = countImmediateFiles(join(workspaceRoot, thumbnailDir));
	if (!empireShipReference) {
		return {
			status: "manifest-missing",
			modelDir,
			thumbnailDir,
			rawMdxCount: countByExtension(modelFiles, ".mdx"),
			rawSidecarCount: countByExtension(modelFiles, ".mds"),
			thumbnailCount: countByExtension(thumbnailFiles, ".tga"),
			remasterArtifactPresent: artifactIds.has("empire-ship-reference"),
		};
	}
	return {
		status: "present",
		manifestId: empireShipReference.id ?? null,
		modelDir,
		thumbnailDir,
		rawMdxCount: countByExtension(modelFiles, ".mdx"),
		rawSidecarCount: countByExtension(modelFiles, ".mds"),
		thumbnailCount: countByExtension(thumbnailFiles, ".tga"),
		referenceEntryCount: empireShipReference.entries?.length ?? 0,
		contactSheetPath: empireShipReference.contactSheet?.path ?? null,
		remasterArtifactPresent: artifactIds.has("empire-ship-reference"),
		mappingStatus: "thumbnail-to-ship-stat-crossmap-pending",
	};
}

function summarizeImperialCrest(imperialCrestMask, artifactIds) {
	if (!imperialCrestMask) {
		return {
			status: "manifest-missing",
			remasterArtifactPresent: artifactIds.has("imperial-crest-mask"),
		};
	}
	const outputs = imperialCrestMask.outputs ?? [];
	return {
		status: "present",
		manifestId: imperialCrestMask.id ?? null,
		source: imperialCrestMask.source ?? null,
		method: imperialCrestMask.method ?? null,
		outputCount: outputs.length,
		variantIds: outputs.map((output) => crestVariantId(output.path)).filter(Boolean).sort(),
		remasterArtifactPresent: artifactIds.has("imperial-crest-mask"),
	};
}

function summarizeGameplay(runtimeBoundary, operationCatalog) {
	if (!runtimeBoundary || !operationCatalog) return { status: "unavailable" };
	const normalRuntime = runtimeBoundary.normalRuntime ?? [];
	const diagnostics = runtimeBoundary.diagnosticOnly ?? [];
	return {
		status: "present",
		normalRuntimeAllowedCount: normalRuntime.filter((item) => item.normalRuntimeAllowed).length,
		diagnosticNormalRuntimeAllowedCount: diagnostics.filter((item) => item.normalRuntimeAllowed).length,
		operationPurposeCount: operationCatalog.purposes?.length ?? 0,
		planFieldCount: operationCatalog.planFields?.length ?? 0,
		restrictionCount: operationCatalog.restrictions?.length ?? 0,
		commandPointCostKind: operationCatalog.commandPointCost?.kind ?? "unknown",
	};
}

function countImmediateFiles(dirPath) {
	if (!existsSync(dirPath)) return [];
	return readdirSync(dirPath, { withFileTypes: true })
		.filter((entry) => entry.isFile())
		.map((entry) => entry.name);
}

function countByExtension(fileNames, extension) {
	const wanted = extension.toLowerCase();
	return fileNames.filter((fileName) => fileName.toLowerCase().endsWith(wanted)).length;
}

function crestVariantId(path) {
	const match = /-mask-([a-z]+)\.png$/i.exec(path ?? "");
	return match?.[1] ?? null;
}

function summarizeInput(workspaceRoot, id, path) {
	const absolutePath = join(workspaceRoot, path);
	if (!existsSync(absolutePath)) return { id, path, status: "missing" };
	const bytes = readFileSync(absolutePath);
	try {
		const parsed = JSON.parse(bytes.toString("utf8"));
		return {
			id,
			path: normalizePath(relative(workspaceRoot, absolutePath)),
			status: "present",
			manifestId: parsed.id ?? null,
			size: statSync(absolutePath).size,
			sha1: createHash("sha1").update(bytes).digest("hex"),
			parsed,
		};
	} catch (error) {
		return {
			id,
			path: normalizePath(relative(workspaceRoot, absolutePath)),
			status: "unreadable",
			error: error instanceof Error ? error.message : String(error),
		};
	}
}

function writeJson(path, value) {
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, `${JSON.stringify(stripInternal(value), null, 2)}\n`);
}

function stripInternal(value) {
	if (Array.isArray(value)) return value.map(stripInternal);
	if (!value || typeof value !== "object") return value;
	return Object.fromEntries(
		Object.entries(value)
			.filter(([key]) => key !== "parsed")
			.map(([key, item]) => [key, stripInternal(item)]),
	);
}

function normalizePath(path) {
	return path.split("\\").join("/");
}
