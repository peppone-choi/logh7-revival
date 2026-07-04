import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

async function loadGuardModule() {
	try {
		return await import("../../src/server/logh7-test-decision-guard.mjs");
	} catch (error) {
		assert.fail(`expected LOGH7 test decision guard module: ${error.message}`);
	}
}

test("test decision guard requires TDD for Node extraction inventory crosscheck modules", async () => {
	// given
	const { buildTestDecisionGuardManifest } = await loadGuardModule();

	// when
	const manifest = buildTestDecisionGuardManifest();
	const nodeSurfaceIds = manifest.nodeSurfaces.map((surface) => surface.id);

	// then
	assert.equal(manifest.id, "logh7-test-decision-guard");
	assert.equal(manifest.canonicalPromotion, "blocked-until-cross-source-confirmed");
	assert.equal(manifest.nodePolicy.testDecision, "tdd-required-before-behavior-change");
	assert.equal(manifest.nodePolicy.redEvidenceRequired, true);
	assert.equal(manifest.nodePolicy.greenEvidenceRequired, true);
	assert.deepEqual(nodeSurfaceIds, [
		"cd-media-extraction",
		"hidden-data-scan",
		"hidden-data-classification",
		"hidden-data-watchlist",
		"current-content-crosscheck",
		"unity-source-pack",
	]);
	assert.ok(
		manifest.nodeSurfaces.every(
			(surface) => surface.testDecision === "tdd-required-before-behavior-change",
		),
	);
	assert.ok(
		manifest.nodeSurfaces.every((surface) =>
			surface.requiredEvidence.includes("red-test-log"),
		),
	);
});

test("test decision guard keeps Unity C# loader scene surface tests-after until runtime surface exists", async () => {
	// given
	const { buildTestDecisionGuardManifest } = await loadGuardModule();

	// when
	const manifest = buildTestDecisionGuardManifest();

	// then
	assert.equal(manifest.unityPolicy.testDecision, "tests-after-first-loader-scene-surface");
	assert.equal(manifest.unityPolicy.firstRuntimeSurfaceRequired, true);
	assert.equal(manifest.unityPolicy.testsBeforeSurfaceRequired, false);
	assert.equal(manifest.unityPolicy.testsAfterSurfaceRequired, true);
	assert.match(manifest.unityPolicy.reason, /Unity C# loader/);
	assert.equal(manifest.normalRuntimeBoundary.diagnosticShortcutsAllowedAsRuntime, false);
});

test("test decision guard writes generated artifact", async () => {
	// given
	const { writeTestDecisionGuardManifest } = await loadGuardModule();
	const outDir = mkdtempSync(join(tmpdir(), "logh7-test-decision-guard-"));
	const outPath = join(outDir, "test-decision-guard.json");

	// when
	const manifest = writeTestDecisionGuardManifest({ outPath });

	// then
	const parsed = JSON.parse(readFileSync(outPath, "utf8"));
	assert.equal(parsed.id, manifest.id);
	assert.equal(parsed.nodeSurfaces.length, 6);
	assert.equal(parsed.unityPolicy.testDecision, "tests-after-first-loader-scene-surface");
});
