import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
	buildImperialMedalSourceLock,
	writeImperialMedalSourceLock,
} from "../../src/server/logh7-imperial-medal-source-lock.mjs";

test("imperial medal source lock separates GE MDX render inputs from proof thumbnails", () => {
	// given
	const manifest = buildImperialMedalSourceLock();

	// when
	const sourceLock = manifest.sourceLock;

	// then
	assert.equal(manifest.id, "logh7-imperial-medal-source-lock-manifest");
	assert.equal(sourceLock.empireModelRecordCount, 121);
	assert.equal(sourceLock.empireGeFileRecordCount, 120);
	assert.equal(sourceLock.empireGeMdxRecordCount, 117);
	assert.equal(sourceLock.empireGeMdsRecordCount, 3);
	assert.equal(sourceLock.renderQueueCount, 39);
	assert.match(sourceLock.largeShipArtGate, /MDX render\/extract/);
	assert.match(sourceLock.thumbnailPolicy, /proof-only/);
	assert.match(sourceLock.visualCompositionPolicy, /double-eagle crest visibly legible/);
	assert.match(sourceLock.visualCompositionPolicy, /original Empire ship data/);
	assert.equal(manifest.renderQueue[0].hullId, "001");
	assert.equal(manifest.renderQueue[0].selectedMdx.file, "data/model/Ship/GE/EH001.mdx");
	assert.equal(manifest.proofThumbnail.stem, "iu008");
	assert.equal(manifest.prototype.visualRequirements.generatedShipSilhouettesAllowed, false);
	assert.equal(manifest.prototype.visualRequirements.generatedCrestAllowed, false);
	assert.equal(
		manifest.prototype.visualRequirements.finalLargeShipMotifSource,
		"original-ship-ge-mdx-render",
	);
	assert.equal(
		manifest.prototype.visualRequirements.centralCrestMask,
		"client-unity/Assets/ArtSource/reference/imperial-crest/logh7-imperial-double-eagle-mask-gold.png",
	);
	assert.equal(manifest.prototype.visualRequirements.thumbnailUse, "proof-only");
	assert.equal(manifest.sourceLock.finalLargeShipMotifRequired, true);
	assert.equal(manifest.sourceLock.centralImperialCrestMaskRequired, true);
	assert.equal(
		manifest.prototype.correctedOutput,
		"client-unity/Assets/ArtSource/remaster/imperial-medal-prototypes-1024/779-expeditionary-campaign-source-locked-crest-ship-v2.png",
	);
	assert.equal(
		manifest.prototype.crestPrimaryOutput,
		"client-unity/Assets/ArtSource/remaster/imperial-medal-prototypes-1024/767-grand-double-eagle-order-source-locked-crest-v2.png",
	);
});

test("imperial medal source lock writes generated artifact", () => {
	// given
	const outDir = mkdtempSync(join(tmpdir(), "logh7-imperial-medal-source-lock-"));
	const outPath = join(outDir, "source-lock.json");

	// when
	const manifest = writeImperialMedalSourceLock(outPath);

	// then
	const parsed = JSON.parse(readFileSync(outPath, "utf8"));
	assert.equal(parsed.id, manifest.id);
	assert.equal(parsed.sourceLock.empireGeMdxRecordCount, 117);
	assert.equal(parsed.prototype.visualRequirements.imperialCrestPlacement, "large-visible-faction-mark");
	assert.equal(parsed.renderQueue.length, 39);
});
