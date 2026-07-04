import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
	buildCurrentContentCrosscheckManifest,
	writeCurrentContentCrosscheckManifest,
} from "../../src/server/logh7-current-content-crosscheck.mjs";

test("current content crosscheck keeps current roots and generated catalogs suspect", () => {
	// given
	const manifest = buildCurrentContentCrosscheckManifest();

	// when
	const rootIds = manifest.sourceRoots.map((root) => root.id);
	const generated = manifest.generatedCatalogs;

	// then
	assert.equal(manifest.id, "logh7-current-content-crosscheck");
	assert.equal(manifest.canonicalPromotion, "blocked-until-cross-source-confirmed");
	assert.deepEqual(rootIds, [
		"serverContent",
		"reContent",
		"installedGame",
		"ghidraEvidence",
		"manualOcrEvidence",
		"liveEvidence",
		"wireEvidence",
	]);
	assert.ok(
		manifest.sourceRoots.every(
			(root) =>
				root.canonicalStatus === "suspect-cross-check-required" ||
				root.status === "missing",
		),
	);
	assert.ok(generated.count >= 20);
	assert.ok(
		generated.files.some(
			(file) =>
				file.path ===
				"server/content/generated/logh7-server-servable-data-family.json",
		),
	);
	assert.ok(
		generated.files.every(
			(file) => file.canonicalStatus === "suspect-cross-check-required",
		),
	);
	assert.deepEqual(manifest.mandatoryWatchCategories, [
		{
			id: "systemPositions",
			labelKo: "성계 위치",
			reportImmediately: true,
		},
		{
			id: "originalCharacterRoster",
			labelKo: "오리지널 캐릭터 로스터",
			reportImmediately: true,
		},
	]);
});

test("current content crosscheck records missing roots and malformed generated JSON without canonical promotion", () => {
	// given
	const workspaceRoot = mkdtempSync(join(tmpdir(), "logh7-crosscheck-"));
	const generatedRoot = join(workspaceRoot, "server", "content", "generated");
	const outPath = join(generatedRoot, "logh7-current-content-crosscheck.json");
	mkdirSync(generatedRoot, { recursive: true });
	writeFileSync(join(generatedRoot, "bad.json"), "{broken");

	try {
		// when
		const manifest = writeCurrentContentCrosscheckManifest({
			outPath,
			workspaceRoot,
		});

		// then
		assert.equal(manifest.canonicalPromotion, "blocked-until-cross-source-confirmed");
		assert.ok(
			manifest.sourceRoots.every(
				(root) => root.canonicalStatus === "suspect-cross-check-required",
			),
		);
		assert.ok(
			manifest.sourceRoots
				.filter((root) => root.id !== "serverContent")
				.every((root) => root.status === "missing"),
		);
		assert.deepEqual(
			manifest.generatedCatalogs.files.map((file) => ({
				path: file.path,
				status: file.status,
				canonicalStatus: file.canonicalStatus,
			})),
			[
				{
					path: "server/content/generated/bad.json",
					status: "unreadable",
					canonicalStatus: "suspect-cross-check-required",
				},
			],
		);
	} finally {
		rmSync(workspaceRoot, { force: true, recursive: true });
	}
});
