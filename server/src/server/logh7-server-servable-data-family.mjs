import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SERVER_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const WORKSPACE_ROOT = join(SERVER_ROOT, "..");
const OUTPUT_PATH = join(
	SERVER_ROOT,
	"content",
	"generated",
	"logh7-server-servable-data-family.json",
);
const CANONICAL_STATUS = "suspect-cross-check-required";
const WATCH_CATEGORIES = [
	{
		id: "systemPositions",
		labelKo: "성계 위치",
		reportImmediately: true,
	},
	{
		id: "originalCharacterRoster",
		labelKo: "오리지널 캐릭터 로스터",
		reportImmediately: true,
	},
];
const FAMILY_DEFINITIONS = [
	{
		id: "systems",
		watchCategories: ["systemPositions"],
		sourcePaths: [
			"server/content/galaxy.json",
			"server/content/galaxy-passable-cells.json",
			"server/content/generated/logh7-null-galaxy-template.json",
			"server/content/generated/logh7-hidden-data-watchlist.json",
			"server/content/generated/logh7-galaxy-trust-crosscheck.json",
			"server/content/generated/logh7-runtime-boundary-manifest.json",
		],
	},
	{
		id: "stars",
		watchCategories: ["systemPositions"],
		sourcePaths: [
			"server/content/galaxy.json",
			"server/content/generated/logh7-null-galaxy-template.json",
			"server/content/generated/logh7-mdx-catalog.json",
		],
	},
	{
		id: "planets",
		watchCategories: ["systemPositions"],
		sourcePaths: [
			"server/content/generated/logh7-hidden-data-watchlist.json",
			"server/content/generated/logh7-record-candidate-crosscheck.json",
		],
	},
	{
		id: "grids",
		sourcePaths: [
			"server/content/galaxy-passable-cells.json",
			"server/content/generated/logh7-strategy-command-catalog.json",
			"server/content/generated/logh7-logistics-allocation-catalog.json",
		],
	},
	{
		id: "characters",
		watchCategories: ["originalCharacterRoster"],
		sourcePaths: [
			"server/content/generated/logh7-face-portrait-catalog.json",
			"server/content/generated/logh7-face-tcf-catalog.json",
			"server/content/generated/logh7-rank-promotion-catalog.json",
			"server/content/generated/logh7-hidden-data-watchlist.json",
		],
	},
	{
		id: "fleets",
		sourcePaths: [
			"server/content/generated/logh7-ship-stat-catalog.json",
			"server/content/generated/logh7-logistics-allocation-catalog.json",
			"server/content/generated/logh7-operation-catalog.json",
		],
	},
	{
		id: "ships",
		sourcePaths: [
			"server/content/generated/logh7-ship-stat-catalog.json",
			"server/content/generated/logh7-mdx-catalog.json",
			"server/content/generated/logh7-mdx-render-source-manifest.json",
			"server/content/generated/logh7-empire-ship-reference-manifest.json",
			"server/content/generated/logh7-imperial-medal-source-lock-manifest.json",
		],
	},
	{
		id: "commands",
		sourcePaths: [
			"server/content/generated/logh7-strategy-command-catalog.json",
			"server/content/generated/logh7-operation-catalog.json",
		],
	},
	{
		id: "operations",
		sourcePaths: [
			"server/content/generated/logh7-operation-catalog.json",
			"server/content/generated/logh7-logistics-allocation-catalog.json",
		],
	},
	{
		id: "tactics",
		sourcePaths: [
			"server/content/generated/logh7-scene-inventory.json",
			"server/content/generated/logh7-ship-stat-catalog.json",
			"server/content/generated/logh7-strategy-command-catalog.json",
		],
	},
	{
		id: "economy",
		sourcePaths: [
			"server/content/generated/logh7-logistics-allocation-catalog.json",
			"server/content/generated/logh7-operation-catalog.json",
		],
	},
	{
		id: "uiText",
		sourcePaths: [
			"server/content/generated/logh7-scene-inventory.json",
			"server/content/generated/logh7-record-candidate-crosscheck.json",
			"server/content/generated/logh7-cd-media-manifest.json",
		],
	},
	{
		id: "reports",
		sourcePaths: [
			"server/content/generated/logh7-hidden-data-watchlist.json",
			"server/content/generated/logh7-operation-catalog.json",
		],
	},
	{
		id: "launcherCommunity",
		sourcePaths: [
			"server/content/generated/logh7-unity-bootstrap-manifest.json",
			"server/content/generated/logh7-cd-media-manifest.json",
			"server/content/generated/logh7-scene-inventory.json",
		],
	},
	{
		id: "formulas",
		sourcePaths: [
			"server/content/generated/logh7-formula-provenance-guard.json",
			"server/content/generated/logh7-strategy-command-catalog.json",
			"server/content/generated/logh7-ship-stat-catalog.json",
			"server/content/generated/logh7-operation-catalog.json",
		],
	},
];

export function buildServerServableDataFamilyManifest({
	workspaceRoot = WORKSPACE_ROOT,
} = {}) {
	const absoluteWorkspaceRoot = resolve(workspaceRoot);
	const families = FAMILY_DEFINITIONS.map((definition) =>
		buildFamily(definition, absoluteWorkspaceRoot),
	);

	return {
		id: "logh7-server-servable-data-family",
		generatedAt: new Date().toISOString(),
		purpose:
			"Scope server-servable LOGH VII data families without promoting suspect generated data to canonical.",
		canonicalPromotionRule:
			"All current generated catalogs remain suspect until CD/manual/Ghidra/live/wire cross-check promotes a specific datum.",
		mandatoryWatchCategories: WATCH_CATEGORIES,
		families,
	};
}

export function writeServerServableDataFamilyManifest({
	outPath = OUTPUT_PATH,
	manifest,
	workspaceRoot = WORKSPACE_ROOT,
} = {}) {
	const resolvedManifest =
		manifest ?? buildServerServableDataFamilyManifest({ workspaceRoot });
	mkdirSync(dirname(outPath), { recursive: true });
	writeFileSync(outPath, `${JSON.stringify(resolvedManifest, null, 2)}\n`);
	return resolvedManifest;
}

function buildFamily(definition, workspaceRoot) {
	const sourceManifests = definition.sourcePaths.map((sourcePath) =>
		summarizeSourceManifest(workspaceRoot, sourcePath),
	);

	return {
		id: definition.id,
		canonicalStatus: CANONICAL_STATUS,
		watchCategories: definition.watchCategories ?? [],
		sourceManifests,
	};
}

function summarizeSourceManifest(workspaceRoot, sourcePath) {
	const absolutePath = join(workspaceRoot, sourcePath);
	if (!existsSync(absolutePath)) return { path: sourcePath, status: "missing" };

	try {
		const source = JSON.parse(readFileSync(absolutePath, "utf8"));
		return {
			path: normalizePath(relative(workspaceRoot, absolutePath)),
			status: "present",
			size: statSync(absolutePath).size,
			keys: Object.keys(source).slice(0, 12),
			counts: summarizeCounts(source),
		};
	} catch (error) {
		return {
			path: normalizePath(relative(workspaceRoot, absolutePath)),
			status: "unreadable",
			error: error instanceof Error ? error.message : String(error),
		};
	}
}

function summarizeCounts(source) {
	const counts = {};
	for (const key of ["families", "files", "records", "systems", "characters"]) {
		if (Array.isArray(source[key])) counts[`${key}Count`] = source[key].length;
	}
	for (const key of ["fileCount", "recordCount", "archiveCount", "starCount"]) {
		if (Number.isFinite(source[key])) counts[key] = source[key];
	}
	if (source.totals && typeof source.totals === "object") counts.totals = source.totals;
	return counts;
}

function normalizePath(path) {
	return path.split("\\").join("/");
}
