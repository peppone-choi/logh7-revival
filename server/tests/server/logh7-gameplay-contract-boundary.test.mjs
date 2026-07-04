import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
	buildGameplayContractBoundary,
	writeGameplayContractBoundary,
} from "../../src/server/logh7-gameplay-contract-boundary.mjs";

test("gameplay contract boundary separates implemented rules from unresolved formula locks", () => {
	const manifest = buildGameplayContractBoundary();
	const commandCostRule = manifest.implementedEvidenceBackedRules.find(
		(rule) => rule.id === "strategy-command-cost-table",
	);

	assert.equal(manifest.id, "logh7-gameplay-contract-boundary");
	assert.equal(manifest.canonicalPromotion, "blocked-until-cross-source-confirmed");
	assert.equal(manifest.guardrails.unresolvedFormulaPromotionAllowed, false);
	assert.equal(manifest.guardrails.placeholderAsCanonicalAllowed, false);
	assert.equal(manifest.guardrails.diagnosticShortcutAsRuntimeAllowed, false);
	assert.equal(manifest.formulaGuard.status, "present");
	assert.equal(manifest.serverDataFamily.status, "present");
	assert.equal(commandCostRule.status, "implemented-evidence-backed");
	assert.equal(commandCostRule.promotionAllowed, true);
	assert.ok(commandCostRule.runtimeModules.some((source) => source.path === "server/src/server/logh7-command-cost.mjs"));
	assert.ok(commandCostRule.evidencePaths.some((source) => source.path === "server/content/manual/strategy-commands.json"));
	assert.equal(manifest.unresolvedFormulaLocks.length, manifest.formulaGuard.unresolvedFormulaCount);
	assert.ok(manifest.unresolvedFormulaLocks.length >= 8);
	assert.ok(manifest.unresolvedFormulaLocks.every((formula) => formula.promotionAllowed === false));
	assert.ok(manifest.unresolvedFormulaLocks.some((formula) => formula.domainId === "combat"));
	assert.ok(manifest.unresolvedFormulaLocks.some((formula) => formula.domainId === "economy"));
	assert.ok(manifest.unresolvedFormulaLocks.some((formula) => formula.domainId === "ai"));
});

test("gameplay contract boundary fails closed when formula guard is unreadable", () => {
	const workspaceRoot = mkdtempSync(join(tmpdir(), "logh7-gameplay-contract-"));
	try {
		const brokenPath = join(workspaceRoot, "broken-formula-guard.json");
		writeFileSync(brokenPath, "{");

		const manifest = buildGameplayContractBoundary({
			workspaceRoot,
			formulaGuardPath: "broken-formula-guard.json",
		});

		assert.equal(manifest.formulaGuard.status, "unreadable");
		assert.equal(manifest.guardrails.unresolvedFormulaPromotionAllowed, false);
		assert.deepEqual(manifest.implementedEvidenceBackedRules, []);
		assert.deepEqual(manifest.unresolvedFormulaLocks, []);
	} finally {
		rmSync(workspaceRoot, { force: true, recursive: true });
	}
});

test("gameplay contract boundary writes the server manifest", () => {
	const workspaceRoot = mkdtempSync(join(tmpdir(), "logh7-gameplay-contract-"));
	try {
		const outPath = join(workspaceRoot, "server.json");

		const manifest = writeGameplayContractBoundary({
			outPath,
		});

		assert.equal(manifest.id, "logh7-gameplay-contract-boundary");
		assert.deepEqual(JSON.parse(readFileSync(outPath, "utf8")), manifest);
	} finally {
		rmSync(workspaceRoot, { force: true, recursive: true });
	}
});
