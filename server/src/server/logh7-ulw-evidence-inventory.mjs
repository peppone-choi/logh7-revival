import { createHash } from "node:crypto";
import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { dirname, extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const SERVER_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const WORKSPACE_ROOT = join(SERVER_ROOT, "..");
const DEFAULT_EVIDENCE_DIR = join(WORKSPACE_ROOT, ".omo", "ulw-loop", "evidence");
const DEFAULT_OUT = join(
	SERVER_ROOT,
	"content",
	"generated",
	"logh7-ulw-evidence-20260703-inventory.json",
);
const TARGET_DATE = "20260703";
const SELF_AUDIT_PREFIX = "g014-";
const PROMOTION_BLOCKED = "blocked-until-cross-source-confirmed";

export function buildUlwEvidenceInventoryManifest({
	evidenceDir = DEFAULT_EVIDENCE_DIR,
	targetEvidenceDate = TARGET_DATE,
	selfAuditExclusionPrefix = SELF_AUDIT_PREFIX,
	workspaceRoot = WORKSPACE_ROOT,
} = {}) {
	const evidencePath = normalizePath(relative(workspaceRoot, evidenceDir));
	if (!existsSync(evidenceDir)) {
		return {
			id: "logh7-ulw-evidence-inventory",
			generatedAt: new Date().toISOString(),
			targetEvidenceDate,
			targetGlob: `${evidencePath}/*${targetEvidenceDate}*`,
			selfAuditExclusionPrefix,
			canonicalPromotion: PROMOTION_BLOCKED,
			status: "missing",
			fileCount: 0,
			excludedSelfAuditFileCount: 0,
			totalBytes: 0,
			categoryCounts: buildCategoryCounts([]),
			files: [],
		};
	}

	const allMatchingFiles = readdirSync(evidenceDir)
		.filter((name) => name.includes(targetEvidenceDate))
		.sort((left, right) => left.localeCompare(right));
	const targetFiles = allMatchingFiles.filter(
		(name) => !name.startsWith(selfAuditExclusionPrefix),
	);
	const files = targetFiles.map((name) =>
		buildEvidenceFileEntry({
			name,
			evidenceDir,
			workspaceRoot,
		}),
	);

	return {
		id: "logh7-ulw-evidence-inventory",
		generatedAt: new Date().toISOString(),
		targetEvidenceDate,
		targetGlob: `${evidencePath}/*${targetEvidenceDate}*`,
		selfAuditExclusionPrefix,
		canonicalPromotion: PROMOTION_BLOCKED,
		status: "present",
		fileCount: files.length,
		excludedSelfAuditFileCount: allMatchingFiles.length - targetFiles.length,
		totalBytes: files.reduce((sum, file) => sum + file.size, 0),
		categoryCounts: buildCategoryCounts(files),
		files,
	};
}

export function writeUlwEvidenceInventoryManifest({
	outPath = DEFAULT_OUT,
	manifest = buildUlwEvidenceInventoryManifest(),
} = {}) {
	mkdirSync(dirname(outPath), { recursive: true });
	writeFileSync(outPath, `${JSON.stringify(manifest, null, 2)}\n`);
	return manifest;
}

function buildEvidenceFileEntry({ name, evidenceDir, workspaceRoot }) {
	const absolutePath = join(evidenceDir, name);
	const stat = statSync(absolutePath);
	const bytes = readFileSync(absolutePath);
	return {
		name,
		path: normalizePath(relative(workspaceRoot, absolutePath)),
		extension: extname(name).toLowerCase() || "(none)",
		category: classifyEvidenceFile(name),
		size: stat.size,
		sha256: createHash("sha256").update(bytes).digest("hex"),
	};
}

function buildCategoryCounts(files) {
	const counts = {
		cdExtraction: 0,
		hiddenData: 0,
		recordCandidates: 0,
		scenes: 0,
		serverTests: 0,
		unity: 0,
		tcfPortraits: 0,
		sourceArchive: 0,
		other: 0,
	};
	for (const file of files) {
		counts[file.category] += 1;
	}
	return counts;
}

function classifyEvidenceFile(name) {
	if (name.startsWith("cd-")) return "cdExtraction";
	if (name.startsWith("hidden-data-")) return "hiddenData";
	if (name.startsWith("record-candidate-")) return "recordCandidates";
	if (name.startsWith("scene-inventory-")) return "scenes";
	if (name.startsWith("server-test-")) return "serverTests";
	if (name.startsWith("unity-")) return "unity";
	if (name.startsWith("tcf-")) return "tcfPortraits";
	if (name.startsWith("source-")) return "sourceArchive";
	return "other";
}

function normalizePath(path) {
	return path.replaceAll("\\", "/");
}
