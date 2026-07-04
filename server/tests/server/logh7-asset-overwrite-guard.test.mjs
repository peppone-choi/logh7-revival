import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
	buildAssetOverwriteGuardManifest,
	writeAssetOverwriteGuardManifest,
} from "../../src/server/logh7-asset-overwrite-guard.mjs";

test("asset overwrite guard keeps original assets read-only and remasters separate", () => {
	// given
	const manifest = buildAssetOverwriteGuardManifest();

	// when
	const protectedRoots = manifest.protectedOriginalRoots.map((root) => root.path);
	const remasterRoots = manifest.allowedRemasterRoots.map((root) => root.path);

	// then
	assert.equal(manifest.id, "logh7-asset-overwrite-guard");
	assert.equal(manifest.policy, "original-assets-read-only-remasters-reversible");
	assert.ok(protectedRoots.includes("client-unity/Assets/ArtSource/original"));
	assert.ok(protectedRoots.includes(".omo/work/logh7-installed"));
	assert.ok(remasterRoots.includes("client-unity/Assets/ArtSource/remaster"));
	assert.ok(
		manifest.protectedOriginalRoots.every(
			(root) => root.writePolicy === "read-only-fallback",
		),
	);
	assert.equal(manifest.violationCount, 0);
	assert.ok(
		manifest.remasterArtifacts.every((artifact) =>
			artifact.outputs.every((output) => output.overwritesOriginal === false),
		),
	);
});

test("asset overwrite guard reports remaster output under original root as violation", () => {
	// given
	const workspaceRoot = mkdtempSync(join(tmpdir(), "logh7-asset-guard-"));
	const generatedRoot = join(workspaceRoot, "server", "content", "generated");
	const outPath = join(generatedRoot, "logh7-asset-overwrite-guard.json");
	mkdirSync(generatedRoot, { recursive: true });
	writeFileSync(
		join(generatedRoot, "bad-remaster-manifest.json"),
		JSON.stringify({
			id: "bad-remaster",
			entries: [
				{
					source: "client-unity/Assets/ArtSource/original/medals/m_f001.png",
					output: "client-unity/Assets/ArtSource/original/medals/m_f001_4x.png",
				},
			],
		}),
	);

	try {
		// when
		const manifest = writeAssetOverwriteGuardManifest({
			outPath,
			workspaceRoot,
			artifactManifests: [["bad-remaster", "server/content/generated/bad-remaster-manifest.json"]],
		});
		const written = JSON.parse(readFileSync(outPath, "utf8"));
		const badArtifact = manifest.remasterArtifacts.find((artifact) => artifact.id === "bad-remaster");

		// then
		assert.equal(manifest.violationCount, 1);
		assert.equal(badArtifact.outputs[0].overwritesOriginal, true);
		assert.equal(badArtifact.outputs[0].allowed, false);
		assert.equal(written.violationCount, 1);
	} finally {
		rmSync(workspaceRoot, { recursive: true, force: true });
	}
});
