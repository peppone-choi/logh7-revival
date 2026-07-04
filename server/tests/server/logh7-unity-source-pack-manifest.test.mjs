import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
	buildUnitySourcePackManifest,
	writeUnitySourcePackManifest,
} from "../../src/server/logh7-unity-source-pack-manifest.mjs";

test("Unity source pack manifest separates original fallback and reversible remaster packs", () => {
	// given
	const manifest = buildUnitySourcePackManifest();

	// when
	const inputIds = manifest.inputs.map((input) => input.id);

	// then
	assert.equal(manifest.id, "logh7-unity-source-pack-manifest");
	assert.equal(manifest.unity.version, "6000.5.2f1");
	assert.equal(manifest.canonicalPromotion, "blocked-until-cross-source-confirmed");
	assert.deepEqual(inputIds, [
		"cdMedia",
		"sourceRootRegistry",
		"currentContentCrosscheck",
		"serverServableDataFamily",
		"runtimeBoundary",
		"unityRuntimeManifest",
		"unityBootstrapManifest",
	]);
	assert.equal(manifest.verifiedRecords.length, 0);
	assert.equal(manifest.originalFallbackPack.required, true);
	assert.equal(manifest.originalFallbackPack.canonicalStatus, "suspect-cross-check-required");
	assert.ok(
		manifest.originalFallbackPack.sourceRoots.some(
			(root) => root.id === "installedGame" && root.status === "present",
		),
	);
	assert.ok(
		manifest.originalFallbackPack.sourceRootInventory.roots.some(
			(root) => root.id === "cd-extract-iso-filesystem" && root.status === "present",
		),
	);
	assert.ok(
		manifest.originalFallbackPack.sourceRootInventory.roots.some(
			(root) =>
				root.id === "cd-extract-installshield-payload" &&
				root.status === "present" &&
				root.fileCount > 0,
		),
	);
	assert.deepEqual(manifest.remasterPacks, [
		{
			id: "remaster-hd",
			enabledByDefault: false,
			reversible: true,
			manifestDriven: true,
			conflictCheckRequired: true,
			provenanceLabelRequired: true,
			canonicalFallbackRequired: true,
		},
	]);
	assert.equal(
		manifest.streamingAssetsTarget,
		"client-unity/Assets/StreamingAssets/logh7/logh7-unity-source-pack-manifest.json",
	);
});

test("Unity source pack manifest keeps Imperial ships and crest as original source assets", () => {
	// given
	const manifest = buildUnitySourcePackManifest();

	// when
	const families = new Map(
		manifest.originalFallbackPack.requiredAssetFamilies.map((family) => [
			family.id,
			family,
		]),
	);

	// then
	assert.deepEqual([...families.keys()], [
		"imperialShipMdx",
		"fieldShipMarkSheet",
		"imperialDoubleEagleReference",
		"imperialDoubleEagleMasks",
	]);
	assert.equal(families.get("imperialShipMdx").path, ".omo/work/logh7-installed/data/model/Ship/GE");
	assert.equal(families.get("imperialShipMdx").format, "MDX");
	assert.equal(families.get("imperialShipMdx").status, "present");
	assert.ok(families.get("imperialShipMdx").fileCount >= 100);
	assert.equal(
		families.get("fieldShipMarkSheet").path,
		".omo/work/logh7-installed/data/image/Field/ShipMark.tga",
	);
	assert.equal(families.get("fieldShipMarkSheet").status, "present");
	// client-unity/ (and its ArtSource reference images) was permanently removed 2026-07-04 (G070);
	// these families now report missing rather than a live present read.
	assert.equal(
		families.get("imperialDoubleEagleReference").path,
		"client-unity/Assets/ArtSource/reference/logh7-imperial-double-eagle-reference.jpg",
	);
	assert.equal(families.get("imperialDoubleEagleReference").status, "missing");
	assert.deepEqual(families.get("imperialDoubleEagleMasks").paths, [
		"client-unity/Assets/ArtSource/reference/imperial-crest/logh7-imperial-double-eagle-mask-gold.png",
		"client-unity/Assets/ArtSource/reference/imperial-crest/logh7-imperial-double-eagle-mask-silver.png",
		"client-unity/Assets/ArtSource/reference/imperial-crest/logh7-imperial-double-eagle-mask-white.png",
	]);
	assert.equal(families.get("imperialDoubleEagleMasks").status, "missing");
});

test("Unity source pack manifest records malformed inputs without verified records", () => {
	// given
	const workspaceRoot = mkdtempSync(join(tmpdir(), "logh7-unity-source-pack-"));
	const generatedRoot = join(workspaceRoot, "server", "content", "generated");
	const outPath = join(generatedRoot, "logh7-unity-source-pack-manifest.json");
	mkdirSync(generatedRoot, { recursive: true });
	writeFileSync(join(generatedRoot, "logh7-current-content-crosscheck.json"), "{broken");
	writeJson(join(generatedRoot, "logh7-server-servable-data-family.json"), {
		id: "logh7-server-servable-data-family",
		families: [],
	});

	try {
		// when
		const manifest = writeUnitySourcePackManifest({
			outPath,
			workspaceRoot,
		});
		const written = JSON.parse(readFileSync(outPath, "utf8"));

		// then
		const crosscheck = manifest.inputs.find((input) => input.id === "currentContentCrosscheck");
		assert.equal(crosscheck.status, "unreadable");
		assert.equal(manifest.verifiedRecords.length, 0);
		assert.equal(manifest.originalFallbackPack.canonicalStatus, "suspect-cross-check-required");
		assert.equal(written.id, manifest.id);
	} finally {
		rmSync(workspaceRoot, { force: true, recursive: true });
	}
});

function writeJson(path, value) {
	mkdirSync(join(path, ".."), { recursive: true });
	writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}
