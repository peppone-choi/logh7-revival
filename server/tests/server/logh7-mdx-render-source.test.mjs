import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
	buildMdxRenderSourceManifest,
	writeMdxRenderSourceManifest,
} from "../../src/server/logh7-mdx-render-source.mjs";

test("MDX render source manifest pins the first Imperial hull to original GE data", () => {
	// given
	const manifest = buildMdxRenderSourceManifest();

	// when
	const firstTarget = manifest.targets[0];

	// then
	assert.equal(manifest.id, "logh7-mdx-render-source-manifest");
	assert.equal(
		manifest.imperialCrest.reference,
		"client-unity/Assets/ArtSource/reference/logh7-imperial-double-eagle-reference.jpg",
	);
	assert.equal(firstTarget.file, "data/model/Ship/GE/EH001.mdx");
	assert.equal(
		firstTarget.sha256,
		"31bc4de737d411c9c78192f63709207d5a9a58d44177bb8df78fd0a993acfbb2",
	);
	assert.equal(firstTarget.nodeCount, 23);
	assert.deepEqual(firstTarget.nodeNames.slice(0, 6), [
		"EH001x:Layer1",
		"ENGINE_01",
		"ENGINE_02",
		"ENGINE_03",
		"ENGINE_04",
		"FR_01",
	]);
	assert.deepEqual(firstTarget.authoringModelReferences, [
		"D\\objects\\EH001\\EH001x.lwo",
	]);
	assert.deepEqual(firstTarget.imageReferences, [
		"D\\images\\EH001.bmp",
		"D\\images\\meca_tile2.bmp",
		"D\\images\\EH001_bump.tga",
	]);
	assert.deepEqual(
		firstTarget.locatedTextureAssets.map((asset) => asset.file),
		[
			"data/model/images/Hi/EH001.BMP",
			"data/model/images/Hi/meca_tile2.bmp",
			"data/model/images/Lo/EH001.bmp",
			"data/model/images/Lo/meca_tile2.bmp",
			"data/model/images/Mid/EH001.bmp",
			"data/model/images/Mid/meca_tile2.bmp",
		],
	);
	assert.deepEqual(firstTarget.missingTextureAssets, ["D\\images\\EH001_bump.tga"]);
	assert.deepEqual(firstTarget.missingAuthoringAssets, [
		"D\\objects\\EH001\\EH001x.lwo",
	]);
	assert.equal(firstTarget.renderability, "mdx-source-present-textures-found-authoring-lwo-missing");
	assert.match(firstTarget.productionGate, /Do not use thumbnail/i);
});

test("MDX render source manifest writes the generated artifact", () => {
	// given
	const outDir = mkdtempSync(join(tmpdir(), "logh7-mdx-render-source-"));
	const outPath = join(outDir, "mdx-render-source.json");

	try {
		// when
		const manifest = writeMdxRenderSourceManifest({ outPath });
		const written = JSON.parse(readFileSync(outPath, "utf8"));

		// then
		assert.equal(written.id, manifest.id);
		assert.equal(written.targets[0].file, "data/model/Ship/GE/EH001.mdx");
	} finally {
		rmSync(outDir, { force: true, recursive: true });
	}
});
