import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SERVER_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const WORKSPACE_ROOT = join(SERVER_ROOT, "..");
const DEFAULT_OUT = join(SERVER_ROOT, "content", "generated", "logh7-gameplay-contract-boundary.json");
const DEFAULT_FORMULA_GUARD = "server/content/generated/logh7-formula-provenance-guard.json";
const DEFAULT_SERVER_DATA_FAMILY = "server/content/generated/logh7-server-servable-data-family.json";
const BLOCKED = "blocked-until-cross-source-confirmed";

export function buildGameplayContractBoundary({
	workspaceRoot = WORKSPACE_ROOT,
	formulaGuardPath = DEFAULT_FORMULA_GUARD,
	serverDataFamilyPath = DEFAULT_SERVER_DATA_FAMILY,
} = {}) {
	const absoluteWorkspaceRoot = resolve(workspaceRoot);
	const formulaGuard = readJsonManifest(absoluteWorkspaceRoot, formulaGuardPath);
	const serverDataFamily = readJsonManifest(absoluteWorkspaceRoot, serverDataFamilyPath);
	const implementedEvidenceBackedRules =
		formulaGuard.status === "present" ? collectImplementedRules(absoluteWorkspaceRoot, formulaGuard.data) : [];
	const unresolvedFormulaLocks =
		formulaGuard.status === "present" ? collectUnresolvedFormulaLocks(formulaGuard.data) : [];

	return {
		id: "logh7-gameplay-contract-boundary",
		generatedAt: new Date().toISOString(),
		canonicalPromotion: BLOCKED,
		purpose:
			"Expose implemented evidence-backed gameplay rules while locking unresolved formulas out of normal runtime promotion.",
		normalRuntimeBoundary: {
			serverAuthority: "Docker Compose LOGH VII replacement server path",
			clientRuntime: "Unity player/launcher path",
			legacyClientUse: "oracle-and-data-mining-only",
		},
		guardrails: {
			unresolvedFormulaPromotionAllowed: false,
			placeholderAsCanonicalAllowed: false,
			diagnosticShortcutAsRuntimeAllowed: false,
		},
		formulaGuard: summarizeFormulaGuard(formulaGuard),
		serverDataFamily: summarizeServerDataFamily(serverDataFamily),
		implementedEvidenceBackedRules,
		unresolvedFormulaLocks,
		counts: {
			implementedEvidenceBackedRuleCount: implementedEvidenceBackedRules.length,
			unresolvedFormulaLockCount: unresolvedFormulaLocks.length,
		},
	};
}

export function writeGameplayContractBoundary({
	outPath = DEFAULT_OUT,
	manifest,
	workspaceRoot = WORKSPACE_ROOT,
} = {}) {
	const resolvedManifest = manifest ?? buildGameplayContractBoundary({ workspaceRoot });
	writeJson(outPath, resolvedManifest);
	return resolvedManifest;
}

function collectImplementedRules(workspaceRoot, formulaGuard) {
	return formulaGuard.domains.flatMap((domain) =>
		domain.formulas
			.filter((formula) => formula.status === "verified")
			.map((formula) => ({
				id: formula.id,
				domainId: domain.id,
				domainLabel: domain.label,
				status: "implemented-evidence-backed",
				canonicalStatus: formula.canonicalStatus,
				promotionAllowed: formula.promotionAllowed === true,
				note: formula.note ?? null,
				runtimeModules: domain.runtimeModules,
				evidencePaths: (formula.evidencePaths ?? []).map((path) => summarizePath(workspaceRoot, path)),
			})),
	);
}

function collectUnresolvedFormulaLocks(formulaGuard) {
	return formulaGuard.domains.flatMap((domain) =>
		domain.formulas
			.filter((formula) => formula.status !== "verified")
			.map((formula) => ({
				id: formula.id,
				domainId: domain.id,
				domainLabel: domain.label,
				status: formula.status,
				canonicalStatus: formula.canonicalStatus,
				promotionAllowed: false,
				reason: formula.reason ?? "requires cross-source proof before runtime promotion",
				runtimeModules: domain.runtimeModules,
				requiredEvidenceIds: requiredEvidenceIdsForDomain(formulaGuard.requiredEvidence, domain.id),
			})),
	);
}

function requiredEvidenceIdsForDomain(requiredEvidence, domainId) {
	return requiredEvidence
		.filter(
			(evidence) =>
				evidence.requiredFor === true ||
				(Array.isArray(evidence.requiredFor) && evidence.requiredFor.includes(domainId)),
		)
		.map((evidence) => evidence.id);
}

function readJsonManifest(workspaceRoot, manifestPath) {
	const absolutePath = resolve(workspaceRoot, manifestPath);
	const base = { path: normalizePath(relative(workspaceRoot, absolutePath)) };
	if (!existsSync(absolutePath)) return { ...base, status: "missing" };

	try {
		const bytes = readFileSync(absolutePath);
		const data = JSON.parse(bytes.toString("utf8"));
		return {
			...base,
			status: "present",
			size: bytes.length,
			sha256: createHash("sha256").update(bytes).digest("hex"),
			data,
		};
	} catch (error) {
		return {
			...base,
			status: "unreadable",
			error: error instanceof Error ? error.message : String(error),
		};
	}
}

function summarizeFormulaGuard(formulaGuard) {
	if (formulaGuard.status !== "present") return formulaGuard;
	return {
		path: formulaGuard.path,
		status: formulaGuard.status,
		size: formulaGuard.size,
		sha256: formulaGuard.sha256,
		id: formulaGuard.data.id,
		canonicalPromotion: formulaGuard.data.canonicalPromotion,
		unresolvedFormulaCount: formulaGuard.data.unresolvedFormulaCount,
		domainCount: formulaGuard.data.domains.length,
	};
}

function summarizeServerDataFamily(serverDataFamily) {
	if (serverDataFamily.status !== "present") return serverDataFamily;
	return {
		path: serverDataFamily.path,
		status: serverDataFamily.status,
		size: serverDataFamily.size,
		sha256: serverDataFamily.sha256,
		id: serverDataFamily.data.id,
		canonicalPromotion: serverDataFamily.data.canonicalPromotion ?? serverDataFamily.data.status ?? null,
		familyCount: serverDataFamily.data.families?.length ?? 0,
	};
}

function summarizePath(workspaceRoot, path) {
	const absolutePath = resolve(workspaceRoot, path);
	const base = { path: normalizePath(relative(workspaceRoot, absolutePath)) };
	if (!existsSync(absolutePath) || !statSync(absolutePath).isFile()) return { ...base, status: "missing" };
	const bytes = readFileSync(absolutePath);
	return {
		...base,
		status: "present",
		size: bytes.length,
		sha256: createHash("sha256").update(bytes).digest("hex"),
	};
}

function writeJson(path, value) {
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function normalizePath(path) {
	return path.split("\\").join("/");
}
