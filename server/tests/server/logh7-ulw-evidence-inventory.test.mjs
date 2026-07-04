import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

async function loadEvidenceInventoryModule() {
	try {
		return await import("../../src/server/logh7-ulw-evidence-inventory.mjs");
	} catch (error) {
		assert.fail(`expected LOGH7 ULW evidence inventory module: ${error.message}`);
	}
}

test("ULW evidence inventory catalogs 20260703 evidence without self audit files", async () => {
	// given
	const { buildUlwEvidenceInventoryManifest } = await loadEvidenceInventoryModule();

	// when
	const manifest = buildUlwEvidenceInventoryManifest();
	const paths = manifest.files.map((file) => file.path);

	// then
	assert.equal(manifest.id, "logh7-ulw-evidence-inventory");
	assert.equal(manifest.targetEvidenceDate, "20260703");
	assert.equal(manifest.canonicalPromotion, "blocked-until-cross-source-confirmed");
	assert.equal(manifest.targetGlob, ".omo/ulw-loop/evidence/*20260703*");
	assert.equal(manifest.selfAuditExclusionPrefix, "g014-");
	assert.equal(manifest.fileCount, 52);
	assert.ok(manifest.totalBytes > 36_000_000);
	assert.ok(paths.includes(".omo/ulw-loop/evidence/cd-extract-tool-20260703.log"));
	assert.ok(paths.includes(".omo/ulw-loop/evidence/hidden-data-scan-20260703.log"));
	assert.ok(paths.includes(".omo/ulw-loop/evidence/unity-scene-resource-re-20260703.md"));
	assert.ok(manifest.files.every((file) => !file.name.startsWith("g014-")));
	assert.equal(manifest.categoryCounts.cdExtraction, 9);
	assert.equal(manifest.categoryCounts.hiddenData, 7);
	assert.equal(manifest.categoryCounts.recordCandidates, 10);
	assert.equal(manifest.categoryCounts.unity, 5);
	assert.equal(manifest.categoryCounts.serverTests, 6);
});

test("ULW evidence inventory records missing and excluded evidence boundaries", async () => {
	// given
	const { buildUlwEvidenceInventoryManifest } = await loadEvidenceInventoryModule();
	const evidenceDir = mkdtempSync(join(tmpdir(), "logh7-ulw-evidence-"));
	writeFileSync(join(evidenceDir, "cd-extract-tool-20260703.log"), "ok\n");
	writeFileSync(join(evidenceDir, "g014-self-audit-20260703.log"), "self\n");

	// when
	const manifest = buildUlwEvidenceInventoryManifest({ evidenceDir });
	const missing = buildUlwEvidenceInventoryManifest({
		evidenceDir: join(evidenceDir, "missing"),
	});

	// then
	assert.equal(manifest.status, "present");
	assert.equal(manifest.fileCount, 1);
	assert.equal(manifest.excludedSelfAuditFileCount, 1);
	assert.equal(manifest.files[0].name, "cd-extract-tool-20260703.log");
	assert.equal(missing.status, "missing");
	assert.equal(missing.fileCount, 0);
	assert.equal(missing.excludedSelfAuditFileCount, 0);
	assert.deepEqual(missing.files, []);
});

test("ULW evidence inventory writes generated artifact", async () => {
	// given
	const { writeUlwEvidenceInventoryManifest } = await loadEvidenceInventoryModule();
	const outDir = mkdtempSync(join(tmpdir(), "logh7-ulw-evidence-out-"));
	const outPath = join(outDir, "ulw-evidence.json");

	// when
	const manifest = writeUlwEvidenceInventoryManifest({ outPath });

	// then
	const parsed = JSON.parse(readFileSync(outPath, "utf8"));
	assert.equal(parsed.id, manifest.id);
	assert.equal(parsed.fileCount, 52);
	assert.equal(parsed.selfAuditExclusionPrefix, "g014-");
});
