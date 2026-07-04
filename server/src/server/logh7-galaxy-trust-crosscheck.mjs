import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SERVER_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const WORKSPACE_ROOT = join(SERVER_ROOT, "..");
const DEFAULT_OUT = join(
	SERVER_ROOT,
	"content",
	"generated",
	"logh7-galaxy-trust-crosscheck.json",
);
const SUSPECT = "suspect-cross-check-required";
const BLOCKED = "blocked-until-cross-source-confirmed";
const SOURCE_GROUPS = [
	{
		id: "systemPositions",
		labelKo: "성계 위치",
		reportImmediately: true,
		sources: [
			"server/content/galaxy.json",
			"RE/content/galaxy.json",
			"server/content/galaxy-raster-star-centers.json",
			"RE/content/galaxy-raster-star-centers.json",
			"docs/reference/gin7manual-saved-starchart.pdf",
		],
	},
	{
		id: "starColors",
		labelKo: "항성 색상",
		reportImmediately: false,
		sources: [
			"server/content/extracted/model-galaxy-stars.json",
			"RE/content/extracted/model-galaxy-stars.json",
			"server/content/generated/logh7-null-galaxy-template.json",
		],
	},
	{
		id: "planetLists",
		labelKo: "행성 목록",
		reportImmediately: false,
		sources: [
			"server/content/galaxy.json",
			"RE/content/galaxy.json",
			"server/content/extracted/model-planets.json",
			"RE/content/extracted/model-planets.json",
			"server/content/names/planets-ko.json",
		],
	},
	{
		id: "passableCells",
		labelKo: "통행 가능 셀",
		reportImmediately: false,
		sources: [
			"server/content/galaxy-passable-cells.json",
			"RE/content/galaxy-passable-cells.json",
			"server/content/galaxy-adjacency.json",
			"RE/content/galaxy-adjacency.json",
		],
	},
	{
		id: "generatedCatalogs",
		labelKo: "생성 카탈로그",
		reportImmediately: false,
		sources: [
			"server/content/generated/logh7-current-content-crosscheck.json",
			"server/content/generated/logh7-server-servable-data-family.json",
			"server/content/generated/logh7-hidden-data-watchlist.json",
		],
	},
];

export function buildGalaxyTrustCrosscheckManifest({
	workspaceRoot = WORKSPACE_ROOT,
	generatedAt = new Date().toISOString(),
} = {}) {
	return {
		id: "logh7-galaxy-trust-crosscheck",
		generatedAt,
		purpose:
			"Prevent existing galaxy positions, star colors, planet lists, passable cells, and generated catalogs from being treated as canonical before cross-source proof.",
		canonicalPromotion: BLOCKED,
		trustPolicy: {
			promotionAllowed: false,
			requiredEvidence: [
				"originalCdExtract",
				"manualPdfStarChart",
				"reverseEngineeringEvidence",
				"liveClientOrWireEvidence",
			],
			rule: "Existing generated or derived galaxy data remains suspect until cross-source confirmation is recorded.",
		},
		mandatoryWatchCategories: [
			{
				id: "systemPositions",
				labelKo: "성계 위치",
				reportImmediately: true,
			},
		],
		sourceGroups: SOURCE_GROUPS.map((group) => ({
			id: group.id,
			labelKo: group.labelKo,
			reportImmediately: group.reportImmediately,
			canonicalStatus: SUSPECT,
			promotionAllowed: false,
			sources: group.sources.map((sourcePath) => summarizeSource(workspaceRoot, sourcePath)),
		})),
		confirmedNewHiddenData: {
			systemPositions: [],
			starColors: [],
			planetLists: [],
			passableCells: [],
		},
	};
}

export function writeGalaxyTrustCrosscheckManifest({
	outPath = DEFAULT_OUT,
	workspaceRoot = WORKSPACE_ROOT,
	manifest,
} = {}) {
	const resolvedManifest =
		manifest ?? buildGalaxyTrustCrosscheckManifest({ workspaceRoot: resolve(workspaceRoot) });
	mkdirSync(dirname(outPath), { recursive: true });
	writeFileSync(outPath, `${JSON.stringify(resolvedManifest, null, 2)}\n`);
	return resolvedManifest;
}

function summarizeSource(workspaceRoot, sourcePath) {
	const absolutePath = resolve(workspaceRoot, sourcePath);
	const base = {
		path: normalizePath(sourcePath),
		canonicalStatus: SUSPECT,
		promotionAllowed: false,
	};
	if (!existsSync(absolutePath)) return { ...base, status: "missing" };

	const bytes = readFileSync(absolutePath);
	const summary = {
		...base,
		status: "present",
		size: statSync(absolutePath).size,
		sha1: createHash("sha1").update(bytes).digest("hex"),
	};
	if (extname(sourcePath).toLowerCase() !== ".json") return summary;

	try {
		const parsed = JSON.parse(bytes.toString("utf8"));
		return {
			...summary,
			manifestId: parsed.id ?? null,
			manifestStatus: parsed.status ?? parsed.canonicalPromotion ?? null,
			recordCount: countRecords(parsed),
		};
	} catch (error) {
		return {
			...base,
			status: "unreadable",
			error: error instanceof Error ? error.message : String(error),
		};
	}
}

function countRecords(parsed) {
	if (Array.isArray(parsed)) return parsed.length;
	if (Array.isArray(parsed.systems)) return parsed.systems.length;
	if (Array.isArray(parsed.stars)) return parsed.stars.length;
	if (Array.isArray(parsed.records)) return parsed.records.length;
	if (Array.isArray(parsed.families)) return parsed.families.length;
	if (parsed.generatedCatalogs?.count) return parsed.generatedCatalogs.count;
	if (parsed._count) return parsed._count;
	return null;
}

function normalizePath(path) {
	return path.replace(/\\/g, "/");
}
