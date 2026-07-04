import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
	buildGalaxyTrustCrosscheckManifest,
	writeGalaxyTrustCrosscheckManifest,
} from "../../src/server/logh7-galaxy-trust-crosscheck.mjs";

test("galaxy trust crosscheck blocks existing galaxy data promotion before cross-source proof", () => {
	// given
	const manifest = buildGalaxyTrustCrosscheckManifest();

	// when
	const groupIds = manifest.sourceGroups.map((group) => group.id);
	const systemPositions = manifest.sourceGroups.find((group) => group.id === "systemPositions");
	const generatedCatalogs = manifest.sourceGroups.find((group) => group.id === "generatedCatalogs");

	// then
	assert.equal(manifest.id, "logh7-galaxy-trust-crosscheck");
	assert.equal(manifest.canonicalPromotion, "blocked-until-cross-source-confirmed");
	assert.equal(manifest.trustPolicy.promotionAllowed, false);
	assert.deepEqual(groupIds, [
		"systemPositions",
		"starColors",
		"planetLists",
		"passableCells",
		"generatedCatalogs",
	]);
	assert.equal(systemPositions.reportImmediately, true);
	assert.ok(
		systemPositions.sources.some((source) => source.path === "server/content/galaxy.json"),
	);
	assert.ok(
		systemPositions.sources.some(
			(source) => source.path === "docs/reference/gin7manual-saved-starchart.pdf",
		),
	);
	assert.ok(
		generatedCatalogs.sources.some(
			(source) =>
				source.path === "server/content/generated/logh7-current-content-crosscheck.json",
		),
	);
	assert.ok(
		manifest.sourceGroups.every((group) =>
			group.sources.every(
				(source) =>
					source.canonicalStatus === "suspect-cross-check-required" &&
					source.promotionAllowed === false,
			),
		),
	);
	assert.deepEqual(manifest.confirmedNewHiddenData.systemPositions, []);
});

test("galaxy trust crosscheck records malformed generated catalog as suspect unreadable", () => {
	// given
	const workspaceRoot = mkdtempSync(join(tmpdir(), "logh7-galaxy-trust-"));
	const generatedRoot = join(workspaceRoot, "server", "content", "generated");
	const outPath = join(generatedRoot, "logh7-galaxy-trust-crosscheck.json");
	mkdirSync(generatedRoot, { recursive: true });
	writeFileSync(join(generatedRoot, "logh7-current-content-crosscheck.json"), "{broken");

	try {
		// when
		const manifest = writeGalaxyTrustCrosscheckManifest({ outPath, workspaceRoot });
		const written = JSON.parse(readFileSync(outPath, "utf8"));
		const generatedCatalogs = manifest.sourceGroups.find(
			(group) => group.id === "generatedCatalogs",
		);
		const broken = generatedCatalogs.sources.find(
			(source) =>
				source.path === "server/content/generated/logh7-current-content-crosscheck.json",
		);

		// then
		assert.equal(broken.status, "unreadable");
		assert.equal(broken.canonicalStatus, "suspect-cross-check-required");
		assert.equal(broken.promotionAllowed, false);
		assert.equal(written.trustPolicy.promotionAllowed, false);
		assert.deepEqual(written.confirmedNewHiddenData.systemPositions, []);
	} finally {
		rmSync(workspaceRoot, { recursive: true, force: true });
	}
});
