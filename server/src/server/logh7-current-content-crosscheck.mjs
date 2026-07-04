import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SERVER_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const WORKSPACE_ROOT = join(SERVER_ROOT, "..");
const OUTPUT_PATH = join(
	SERVER_ROOT,
	"content",
	"generated",
	"logh7-current-content-crosscheck.json",
);
const SUSPECT = "suspect-cross-check-required";
const PROMOTION = "blocked-until-cross-source-confirmed";
const SOURCE_ROOTS = [
	{
		id: "serverContent",
		path: "server/content",
		kind: "current server data and generated catalogs",
	},
	{
		id: "reContent",
		path: "RE/content",
		kind: "reverse-engineering workspace content",
	},
	{
		id: "installedGame",
		path: ".omo/work/logh7-installed",
		kind: "installed original game payload",
	},
	{
		id: "ghidraEvidence",
		path: "RE/.omo/work/ghidra",
		kind: "Ghidra reverse-engineering evidence",
	},
	{
		id: "manualOcrEvidence",
		path: "RE/.omo/work/manual",
		kind: "manual and OCR evidence",
	},
	{
		id: "liveEvidence",
		path: "RE/.omo/work/live",
		kind: "live client oracle evidence",
	},
	{
		id: "wireEvidence",
		path: "RE/.omo/work/wire",
		kind: "wire protocol evidence",
	},
];
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

export function buildCurrentContentCrosscheckManifest({
	workspaceRoot = WORKSPACE_ROOT,
} = {}) {
	const absoluteWorkspaceRoot = resolve(workspaceRoot);
	const sourceRoots = SOURCE_ROOTS.map((root) =>
		summarizeSourceRoot(absoluteWorkspaceRoot, root),
	);
	const generatedCatalogs = summarizeGeneratedCatalogs(absoluteWorkspaceRoot);

	return {
		id: "logh7-current-content-crosscheck",
		generatedAt: new Date().toISOString(),
		purpose:
			"Inventory current LOGH VII content evidence before any canonical promotion.",
		canonicalPromotion: PROMOTION,
		canonicalPromotionRule:
			"server/content, RE/content, installed data, generated catalogs, and diagnostic evidence stay suspect until a datum is cross-checked across independent authority sources.",
		mandatoryWatchCategories: WATCH_CATEGORIES,
		sourceRoots,
		generatedCatalogs,
	};
}

export function writeCurrentContentCrosscheckManifest({
	outPath = OUTPUT_PATH,
	manifest,
	workspaceRoot = WORKSPACE_ROOT,
} = {}) {
	const resolvedManifest =
		manifest ?? buildCurrentContentCrosscheckManifest({ workspaceRoot });
	mkdirSync(dirname(outPath), { recursive: true });
	writeFileSync(outPath, `${JSON.stringify(resolvedManifest, null, 2)}\n`);
	return resolvedManifest;
}

function summarizeSourceRoot(workspaceRoot, root) {
	const absolutePath = join(workspaceRoot, root.path);
	if (!existsSync(absolutePath)) {
		return {
			id: root.id,
			path: root.path,
			kind: root.kind,
			status: "missing",
			canonicalStatus: SUSPECT,
		};
	}

	const stats = countTree(absolutePath);
	return {
		id: root.id,
		path: normalizePath(relative(workspaceRoot, absolutePath)),
		kind: root.kind,
		status: "present",
		canonicalStatus: SUSPECT,
		fileCount: stats.fileCount,
		directoryCount: stats.directoryCount,
	};
}

function summarizeGeneratedCatalogs(workspaceRoot) {
	const generatedRoot = join(workspaceRoot, "server", "content", "generated");
	if (!existsSync(generatedRoot)) {
		return {
			path: "server/content/generated",
			status: "missing",
			count: 0,
			files: [],
		};
	}

	const files = readdirSync(generatedRoot)
		.filter((entry) => entry.endsWith(".json"))
		.sort((left, right) => left.localeCompare(right))
		.map((entry) => summarizeGeneratedFile(workspaceRoot, join(generatedRoot, entry)));
	return {
		path: "server/content/generated",
		status: "present",
		count: files.length,
		files,
	};
}

function summarizeGeneratedFile(workspaceRoot, absolutePath) {
	const base = {
		path: normalizePath(relative(workspaceRoot, absolutePath)),
		canonicalStatus: SUSPECT,
		size: statSync(absolutePath).size,
	};

	try {
		const source = JSON.parse(readFileSync(absolutePath, "utf8"));
		return {
			...base,
			status: "present",
			keys: Object.keys(source).slice(0, 12),
			counts: summarizeCounts(source),
		};
	} catch (error) {
		return {
			...base,
			status: "unreadable",
			error: error instanceof Error ? error.message : String(error),
		};
	}
}

function countTree(root) {
	const stack = [root];
	let fileCount = 0;
	let directoryCount = 0;

	while (stack.length > 0) {
		const current = stack.pop();
		for (const entry of readdirSync(current, { withFileTypes: true })) {
			const path = join(current, entry.name);
			if (entry.isDirectory()) {
				directoryCount += 1;
				stack.push(path);
			} else if (entry.isFile()) {
				fileCount += 1;
			}
		}
	}

	return { directoryCount, fileCount };
}

function summarizeCounts(source) {
	const counts = {};
	for (const key of ["files", "records", "families", "sourceRoots", "categories"]) {
		if (Array.isArray(source[key])) counts[`${key}Count`] = source[key].length;
	}
	for (const key of ["fileCount", "recordCount", "archiveCount", "count"]) {
		if (Number.isFinite(source[key])) counts[key] = source[key];
	}
	return counts;
}

function normalizePath(path) {
	return path.split("\\").join("/");
}
