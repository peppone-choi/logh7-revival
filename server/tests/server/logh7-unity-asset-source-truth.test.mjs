import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
	buildUnityAssetSourceTruthManifest,
	writeUnityAssetSourceTruthManifest,
} from "../../src/server/logh7-unity-asset-source-truth.mjs";

test("Unity asset source truth blocks manual drag as authority", () => {
	const manifest = buildUnityAssetSourceTruthManifest();

	assert.equal(manifest.id, "logh7-unity-asset-source-truth");
	assert.equal(manifest.canonicalPromotion, "blocked-until-cross-source-confirmed");
	assert.equal(manifest.manualDragAsSourceTruthAllowed, false);
	assert.equal(manifest.violationCount, 0);
	assert.ok(
		manifest.sourceTruthInputs.some((input) =>
			input.path.endsWith("logh7-unity-source-pack-manifest.json"),
		),
	);
	assert.ok(
		manifest.sourceTruthInputs.some((input) =>
			input.path.endsWith("logh7-imperial-medal-source-lock-manifest.json"),
		),
	);
	assert.ok(
		manifest.sourceTruthInputs.some((input) =>
			input.path.endsWith("logh7-empire-ship-reference-manifest.json"),
		),
	);
	assert.ok(
		manifest.sourceTruthInputs.some((input) =>
			input.path.endsWith("logh7-imperial-crest-mask-manifest.json"),
		),
	);
	assert.ok(
		manifest.unityRuntimeConsumers.every((consumer) =>
			consumer.path.startsWith("client-unity/Assets/StreamingAssets/logh7/"),
		),
	);
	assert.ok(
		manifest.unityAssetRoles.every((role) => role.sourceTruthAllowed === false),
	);
	assert.ok(
		manifest.reproducibilityRules.some(
			(rule) => rule.id === "no-manual-inspector-drag-as-source-truth",
		),
	);
});

test("Unity asset source truth remains blocking when StreamingAssets are absent", () => {
	const workspaceRoot = mkdtempSync(join(tmpdir(), "logh7-unity-source-empty-"));
	mkdirSync(join(workspaceRoot, "client-unity", "Assets"), { recursive: true });

	const manifest = buildUnityAssetSourceTruthManifest({ workspaceRoot });

	assert.equal(manifest.manualDragAsSourceTruthAllowed, false);
	assert.equal(manifest.canonicalPromotion, "blocked-until-cross-source-confirmed");
	assert.ok(
		manifest.unityRuntimeConsumers.every((consumer) => consumer.status === "missing"),
	);
	assert.equal(manifest.violationCount, 0);
});

test("Unity asset source truth writes generated catalog", () => {
	const outDir = mkdtempSync(join(tmpdir(), "logh7-unity-source-truth-"));
	const outPath = join(outDir, "unity-source-truth.json");

	const manifest = writeUnityAssetSourceTruthManifest({ outPath });

	const parsed = JSON.parse(readFileSync(outPath, "utf8"));
	assert.equal(parsed.id, manifest.id);
	assert.equal(parsed.manualDragAsSourceTruthAllowed, false);
	assert.equal(parsed.unityRuntimeConsumers.length, 5);
	assert.equal(parsed.unityAssetRoles.length, 5);
});
