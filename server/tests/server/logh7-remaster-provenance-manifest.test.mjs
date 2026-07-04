import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
	buildRemasterProvenanceManifest,
	writeRemasterProvenanceManifest,
} from "../../src/server/logh7-remaster-provenance-manifest.mjs";

test("remaster provenance manifest keeps remaster-hd reversible and fallback-backed", () => {
	// given
	const manifest = buildRemasterProvenanceManifest();

	// when
	const pack = manifest.packs[0];

	// then
	assert.equal(manifest.id, "logh7-remaster-provenance-manifest");
	assert.equal(manifest.canonicalPromotion, "blocked-until-cross-source-confirmed");
	assert.equal(pack.id, "remaster-hd");
	assert.equal(pack.enabledByDefault, false);
	assert.equal(pack.reversible, true);
	assert.equal(pack.manifestDriven, true);
	assert.equal(pack.conflictCheckRequired, true);
	assert.equal(pack.provenanceLabelRequired, true);
	assert.equal(pack.originalFallbackRequired, true);
	assert.deepEqual(
		pack.artifacts.map((artifact) => artifact.id),
		[
			"alliance-medal-upscale",
			"alliance-medal-redraw",
				"imperial-medal-source-lock",
				"imperial-crest-mask",
				"empire-ship-reference",
				"asset-overwrite-guard",
			"unity-source-pack",
		],
	);
	assert.deepEqual(pack.provenanceRequirementIds, [
		"sourceHashes",
		"tool",
		"prompt",
		"settings",
		"reviewer",
		"outputHash",
		"rollback",
		"qaEvidence",
	]);
	assert.ok(
		pack.artifacts.every(
			(artifact) =>
				artifact.reversible === true &&
				artifact.conflictCheckRequired === true &&
				artifact.provenanceLabelRequired === true &&
				artifact.originalFallbackRequired === true &&
				artifact.enabledByDefault === false,
		),
	);
	assert.ok(
		pack.artifacts.every((artifact) =>
			pack.provenanceRequirementIds.every((id) => Object.hasOwn(artifact.provenance, id)),
		),
	);
	assert.ok(
		pack.artifacts.every((artifact) =>
			/^[a-f0-9]{64}$/.test(artifact.provenance.outputHash.sha256),
		),
	);
	const imperialCrestMask = pack.artifacts.find((artifact) => artifact.id === "imperial-crest-mask");
	assert.equal(
		imperialCrestMask.provenance.sourceHashes[0].sha256,
		"822276b190c3e83729de39c14e4e9fc06c2eb8b39a56225bdcbe16f147134e9e",
	);
	assert.deepEqual(
		imperialCrestMask.provenance.outputAssets.map((asset) => asset.path),
		[
			"client-unity/Assets/ArtSource/reference/imperial-crest/logh7-imperial-double-eagle-mask-gold.png",
			"client-unity/Assets/ArtSource/reference/imperial-crest/logh7-imperial-double-eagle-mask-silver.png",
			"client-unity/Assets/ArtSource/reference/imperial-crest/logh7-imperial-double-eagle-mask-white.png",
		],
	);
	assert.ok(
		imperialCrestMask.provenance.outputAssets.every((asset) =>
			/^[a-f0-9]{64}$/.test(asset.sha256),
		),
	);
	const empireShipReference = pack.artifacts.find((artifact) => artifact.id === "empire-ship-reference");
	assert.equal(empireShipReference.provenance.sourceHashes.status, undefined);
	assert.ok(
		empireShipReference.provenance.sourceHashes.some(
			(sourceHash) =>
				sourceHash.path === ".omo/work/logh7-installed/data/image/Thumbnail/Ship/iu008.tga" &&
				sourceHash.sha256 === "d92982521bf4109fd770f436c366254949a555d046332d4fd23cd00ca3144106",
		),
	);
	assert.equal(
		manifest.streamingAssetsTarget,
		"client-unity/Assets/StreamingAssets/logh7/logh7-remaster-provenance-manifest.json",
	);
});

test("remaster provenance manifest records malformed artifact metadata without enabling the pack", () => {
	// given
	const workspaceRoot = mkdtempSync(join(tmpdir(), "logh7-remaster-provenance-"));
	const generatedRoot = join(workspaceRoot, "server", "content", "generated");
	const outPath = join(generatedRoot, "logh7-remaster-provenance-manifest.json");
	mkdirSync(generatedRoot, { recursive: true });
	writeFileSync(join(generatedRoot, "logh7-alliance-medal-upscale-manifest.json"), "{broken");

	try {
		// when
		const manifest = writeRemasterProvenanceManifest({
			outPath,
			workspaceRoot,
		});
		const written = JSON.parse(readFileSync(outPath, "utf8"));

		// then
		const pack = manifest.packs[0];
		const broken = pack.artifacts.find((artifact) => artifact.id === "alliance-medal-upscale");
		assert.equal(pack.enabledByDefault, false);
		assert.equal(broken.status, "unreadable");
		assert.equal(broken.canonicalStatus, "suspect-cross-check-required");
		assert.equal(broken.provenance.sourceHashes.status, "unreadable");
		assert.match(broken.provenance.outputHash.sha256, /^[a-f0-9]{64}$/);
		assert.equal(broken.provenance.rollback.strategy, "disable-artifact-use-original-fallback");
		assert.equal(written.packs[0].enabledByDefault, false);
	} finally {
		rmSync(workspaceRoot, { force: true, recursive: true });
	}
});
