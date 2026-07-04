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
	"logh7-formula-provenance-guard.json",
);
const SUSPECT = "suspect-cross-check-required";
const BLOCKED = "blocked-until-cross-source-confirmed";

const REQUIRED_EVIDENCE = [
	{
		id: "manual-full-read",
		source: "manual/OCR/image cross-check",
		requiredFor: ["commandPoint", "combat", "economy", "ai"],
	},
	{
		id: "ghidra-static",
		source: "Ghidra/static RE evidence",
		requiredFor: ["commandPoint", "combat", "economy", "ai"],
	},
	{
		id: "live-oracle",
		source: "legacy client live/oracle observation",
		requiredFor: ["commandPoint", "combat", "economy", "ai"],
	},
	{
		id: "wire-capture",
		source: "server-client packet/wire evidence",
		requiredFor: ["commandPoint", "combat", "economy", "ai"],
	},
];

const DOMAINS = [
	{
		id: "commandPoint",
		label: "CP / command admission",
		runtimeModules: ["server/src/server/logh7-command-cost.mjs"],
		sourceCandidates: [
			"server/content/manual/strategy-commands.json",
			"RE/.omo/work/ghidra",
			"RE/.omo/work/live",
		],
		formulas: [
			verifiedFormula(
				"strategy-command-cost-table",
				"Manual-extracted command CP/wait/duration table may be used as extracted source data, not as proof for unrelated admission formulas.",
				["server/content/manual/strategy-commands.json"],
			),
			unresolvedFormula(
				"substitution-cost-multiplier",
				"2x substitution handling still needs manual/OCR/live cross-check before canonical promotion.",
			),
			unresolvedFormula(
				"command-admission-side-effects",
				"CP payment timing, refunds, failure paths, and server-client admission side effects still need RE/live/wire proof.",
			),
		],
	},
	{
		id: "combat",
		label: "combat / damage / death",
		runtimeModules: [
			"server/src/server/logh7-combat-engine.mjs",
			"server/src/server/logh7-combat-death.mjs",
			"server/src/server/logh7-ship-stat-rules.mjs",
		],
		sourceCandidates: [
			"server/content/manual/ship-performance-verify.json",
			"server/content/ship-stats.json",
			"RE/.omo/work/ghidra",
			"RE/.omo/work/live",
		],
		formulas: [
			unresolvedFormula(
				"weapon-hit-damage-resolution",
				"Hit chance, damage scaling, armor/shield interaction, and critical effects are not canon until static/live evidence matches.",
			),
			unresolvedFormula(
				"ship-death-and-loss-resolution",
				"Death, retreat, loss, and commander casualty effects remain suspect until original client/server behavior is reproduced.",
			),
			unresolvedFormula(
				"ship-stat-derived-combat-values",
				"Derived combat values from ship stats remain suspect unless traced to original tables or observed live behavior.",
			),
		],
	},
	{
		id: "economy",
		label: "economy / tax / approval / security",
		runtimeModules: ["server/src/server/logh7-economy.mjs"],
		sourceCandidates: [
			"manual qualitative economy sections",
			"RE/.omo/work/ghidra",
			"RE/.omo/work/live",
		],
		formulas: [
			unresolvedFormula(
				"planet-tax-revenue",
				"Tax base, tax rate, leadership, and treasury formulas are tuning placeholders until original evidence is found.",
			),
			unresolvedFormula(
				"approval-security-regression",
				"Approval/security drift and public order effects are qualitative manual interpretations, not canonical formulas.",
			),
		],
	},
	{
		id: "ai",
		label: "NPC AI / strategic decision scoring",
		runtimeModules: [
			"server/src/server/logh7-npc-ai.mjs",
			"server/src/server/logh7-strategic-sim.mjs",
		],
		sourceCandidates: [
			"RE/.omo/work/ghidra",
			"RE/.omo/work/live",
			"RE/.omo/work/wire",
		],
		formulas: [
			unresolvedFormula(
				"npc-order-priority",
				"NPC order choice, target selection, and priority scoring are not canonical without static/live confirmation.",
			),
			unresolvedFormula(
				"strategic-sim-resolution",
				"Strategic simulation formulas and AI tick behavior remain suspect until original scene/wire behavior is reproduced.",
			),
		],
	},
];

export function buildFormulaProvenanceGuardManifest({
	workspaceRoot = WORKSPACE_ROOT,
} = {}) {
	const absoluteWorkspaceRoot = resolve(workspaceRoot);
	const domains = DOMAINS.map((domain) => summarizeDomain(absoluteWorkspaceRoot, domain));
	const unresolvedFormulaCount = domains.reduce(
		(total, domain) =>
			total +
			domain.formulas.filter((formula) => formula.status !== "verified").length,
		0,
	);

	return {
		id: "logh7-formula-provenance-guard",
		generatedAt: new Date().toISOString(),
		purpose:
			"Block unresolved CP/combat/economy/AI formulas from becoming canonical Unity/server behavior without manual, RE, live, and wire evidence.",
		canonicalPromotion: BLOCKED,
		canonicalFormulaRecords: [],
		unresolvedFormulaCount,
		requiredEvidence: REQUIRED_EVIDENCE,
		forbiddenRuntimeUse: {
			normalRuntimeFormulaPromotion: false,
			placeholderAsCanonical: false,
			diagnosticOnlyEvidenceAsRuntimeShortcut: false,
		},
		domains,
	};
}

export function writeFormulaProvenanceGuardManifest({
	outPath = DEFAULT_OUT,
	manifest,
	workspaceRoot = WORKSPACE_ROOT,
} = {}) {
	const resolvedManifest =
		manifest ?? buildFormulaProvenanceGuardManifest({ workspaceRoot });
	mkdirSync(dirname(outPath), { recursive: true });
	writeFileSync(outPath, `${JSON.stringify(resolvedManifest, null, 2)}\n`);
	return resolvedManifest;
}

function summarizeDomain(workspaceRoot, domain) {
	return {
		...domain,
		canonicalStatus: SUSPECT,
		promotionAllowed: false,
		runtimeModules: domain.runtimeModules.map((path) =>
			summarizePath(workspaceRoot, path),
		),
		sourceCandidates: domain.sourceCandidates.map((path) =>
			summarizePath(workspaceRoot, path),
		),
	};
}

function summarizePath(workspaceRoot, path) {
	const absolutePath = join(workspaceRoot, path);
	const base = {
		path,
		status: existsSync(absolutePath) ? "present" : "missing",
	};
	if (!existsSync(absolutePath) || !statSync(absolutePath).isFile()) return base;

	const bytes = readFileSync(absolutePath);
	return {
		...base,
		path: normalizePath(relative(workspaceRoot, absolutePath)),
		size: bytes.length,
		sha1: createHash("sha1").update(bytes).digest("hex"),
	};
}

function verifiedFormula(id, note, evidencePaths) {
	return {
		id,
		status: "verified",
		canonicalStatus: SUSPECT,
		promotionAllowed: true,
		evidencePaths,
		note,
	};
}

function unresolvedFormula(id, reason) {
	return {
		id,
		status: "unresolved",
		canonicalStatus: SUSPECT,
		promotionAllowed: false,
		reason,
	};
}

function normalizePath(path) {
	return path.split("\\").join("/");
}
