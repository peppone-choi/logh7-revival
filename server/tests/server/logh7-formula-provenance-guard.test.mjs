import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
	buildFormulaProvenanceGuardManifest,
	writeFormulaProvenanceGuardManifest,
} from "../../src/server/logh7-formula-provenance-guard.mjs";

test("formula provenance guard blocks unresolved CP combat economy AI formulas", () => {
	const manifest = buildFormulaProvenanceGuardManifest();

	assert.equal(manifest.id, "logh7-formula-provenance-guard");
	assert.equal(manifest.canonicalPromotion, "blocked-until-cross-source-confirmed");
	assert.deepEqual(
		manifest.domains.map((domain) => domain.id),
		["commandPoint", "combat", "economy", "ai"],
	);
	assert.equal(manifest.canonicalFormulaRecords.length, 0);
	assert.ok(manifest.unresolvedFormulaCount >= 8);
	assert.ok(
		manifest.domains.every(
			(domain) => domain.canonicalStatus === "suspect-cross-check-required",
		),
	);
	assert.ok(
		manifest.domains.every((domain) =>
			domain.formulas.every((formula) =>
				formula.status === "verified"
					? formula.promotionAllowed === true
					: formula.promotionAllowed === false,
			),
		),
	);
	assert.ok(
		manifest.domains
			.find((domain) => domain.id === "combat")
			.formulas.some((formula) => formula.status === "unresolved"),
	);
	assert.ok(
		manifest.requiredEvidence.some((evidence) => evidence.id === "ghidra-static"),
	);
	assert.ok(
		manifest.requiredEvidence.some((evidence) => evidence.id === "live-oracle"),
	);
});

test("formula provenance guard writes a generated catalog", () => {
	const outDir = mkdtempSync(join(tmpdir(), "logh7-formula-provenance-"));
	const outPath = join(outDir, "formula-guard.json");

	const manifest = writeFormulaProvenanceGuardManifest({ outPath });

	const parsed = JSON.parse(readFileSync(outPath, "utf8"));
	assert.equal(parsed.id, manifest.id);
	assert.equal(parsed.unresolvedFormulaCount, manifest.unresolvedFormulaCount);
	assert.equal(parsed.domains.length, 4);
	assert.equal(parsed.forbiddenRuntimeUse.normalRuntimeFormulaPromotion, false);
});

test("formula provenance guard stays blocking when source files are missing", () => {
	const workspaceRoot = mkdtempSync(join(tmpdir(), "logh7-formula-empty-"));

	const manifest = buildFormulaProvenanceGuardManifest({ workspaceRoot });

	assert.equal(manifest.canonicalPromotion, "blocked-until-cross-source-confirmed");
	assert.equal(manifest.unresolvedFormulaCount, 9);
	assert.equal(manifest.canonicalFormulaRecords.length, 0);
	assert.ok(
		manifest.domains.every((domain) =>
			domain.runtimeModules.every((source) => source.status === "missing"),
		),
	);
	assert.ok(
		manifest.domains.every((domain) => domain.promotionAllowed === false),
	);
});
