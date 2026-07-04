import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
	buildUiSceneRemasterGameplayBoundary,
	writeUiSceneRemasterGameplayBoundary,
} from "../../src/server/logh7-ui-scene-remaster-gameplay-boundary.mjs";

test("UI scene/remaster/gameplay boundary manifest links current generated contracts", () => {
	const manifest = buildUiSceneRemasterGameplayBoundary();

	assert.equal(manifest.id, "logh7-ui-scene-remaster-gameplay-boundary");
	assert.equal(manifest.canonicalPromotion, "blocked-until-cross-source-confirmed");
	assert.equal(manifest.uiSceneCatalog.sceneCount, 15);
	assert.equal(manifest.uiSceneCatalog.evidenceBackedSceneCount, 15);
	assert.ok(manifest.uiSceneCatalog.sceneIds.includes("strategic-map"));
	assert.deepEqual(manifest.remasterPackSchema.packIds, ["remaster-hd"]);
	assert.equal(manifest.remasterPackSchema.enabledByDefault, false);
	assert.equal(manifest.remasterPackSchema.reversible, true);
	assert.equal(manifest.remasterPackSchema.originalFallbackRequired, true);
	assert.ok(manifest.remasterPackSchema.artifactIds.includes("imperial-crest-mask"));
	assert.ok(manifest.remasterPackSchema.artifactIds.includes("empire-ship-reference"));
	assert.equal(manifest.originalAssetContracts.empireShips.rawMdxCount, 117);
	assert.equal(manifest.originalAssetContracts.empireShips.rawSidecarCount, 3);
	assert.equal(manifest.originalAssetContracts.empireShips.thumbnailCount, 79);
	assert.equal(manifest.originalAssetContracts.empireShips.referenceEntryCount, 6);
	assert.equal(
		manifest.originalAssetContracts.empireShips.manifestId,
		"logh7-empire-ship-reference-manifest",
	);
	assert.equal(
		manifest.originalAssetContracts.imperialCrest.manifestId,
		"logh7-imperial-double-eagle-mask-manifest",
	);
	assert.equal(manifest.originalAssetContracts.imperialCrest.outputCount, 3);
	assert.deepEqual(manifest.originalAssetContracts.imperialCrest.variantIds, [
		"gold",
		"silver",
		"white",
	]);
	assert.equal(manifest.gameplayContractBoundary.normalRuntimeAllowedCount, 2);
	assert.equal(manifest.gameplayContractBoundary.diagnosticNormalRuntimeAllowedCount, 0);
	assert.equal(manifest.gameplayContractBoundary.operationPurposeCount, 3);
	assert.equal(manifest.gameplayContractBoundary.commandPointCostKind, "variable-unresolved");
});

test("UI scene/remaster/gameplay boundary records malformed inputs without promotion", () => {
	const workspaceRoot = mkdtempSync(join(tmpdir(), "logh7-ui-boundary-"));
	try {
		writeJson(join(workspaceRoot, "server/content/generated/logh7-scene-inventory.json"), "{");
	writeJson(join(workspaceRoot, "server/content/generated/logh7-remaster-provenance-manifest.json"), {
		id: "logh7-remaster-provenance-manifest",
		packs: [],
	});

		const manifest = buildUiSceneRemasterGameplayBoundary({ workspaceRoot });

		assert.equal(manifest.canonicalPromotion, "blocked-until-cross-source-confirmed");
	assert.equal(manifest.inputs.find((input) => input.id === "sceneInventory").status, "unreadable");
	assert.equal(manifest.uiSceneCatalog.status, "unavailable");
	assert.equal(manifest.gameplayContractBoundary.status, "unavailable");
	assert.equal(manifest.originalAssetContracts.empireShips.status, "manifest-missing");
	assert.equal(manifest.originalAssetContracts.imperialCrest.status, "manifest-missing");
	} finally {
		rmSync(workspaceRoot, { recursive: true, force: true });
	}
});

test("UI scene/remaster/gameplay boundary writes the server generated copy", () => {
	const workspaceRoot = mkdtempSync(join(tmpdir(), "logh7-ui-boundary-write-"));
	try {
		writeMinimalInputs(workspaceRoot);
		const outPath = join(
			workspaceRoot,
			"server/content/generated/logh7-ui-scene-remaster-gameplay-boundary.json",
		);

		const manifest = writeUiSceneRemasterGameplayBoundary({
			workspaceRoot,
			outPath,
		});
		const serverCopy = JSON.parse(readFileSync(outPath, "utf8"));

		assert.equal(manifest.id, "logh7-ui-scene-remaster-gameplay-boundary");
		assert.equal(serverCopy.id, manifest.id);
		assert.equal(serverCopy.canonicalPromotion, manifest.canonicalPromotion);
		assert.deepEqual(serverCopy.uiSceneCatalog, manifest.uiSceneCatalog);
		assert.deepEqual(serverCopy.remasterPackSchema, manifest.remasterPackSchema);
		assert.deepEqual(serverCopy.gameplayContractBoundary, manifest.gameplayContractBoundary);
	} finally {
		rmSync(workspaceRoot, { recursive: true, force: true });
	}
});

function writeMinimalInputs(workspaceRoot) {
	writeJson(join(workspaceRoot, "server/content/generated/logh7-scene-inventory.json"), {
		id: "logh7-scene-inventory",
		summary: { sceneCount: 1, evidenceBackedSceneCount: 1 },
		scenes: [{ id: "boot-update-launcher" }],
	});
	writeJson(join(workspaceRoot, "server/content/generated/logh7-remaster-provenance-manifest.json"), {
		id: "logh7-remaster-provenance-manifest",
		packs: [
			{
				id: "remaster-hd",
				enabledByDefault: false,
				reversible: true,
				manifestDriven: true,
				originalFallbackRequired: true,
				artifacts: [],
			},
		],
	});
	writeJson(join(workspaceRoot, "server/content/generated/logh7-runtime-boundary-manifest.json"), {
		id: "logh7-runtime-boundary-manifest",
		normalRuntime: [{ normalRuntimeAllowed: true }],
		diagnosticOnly: [{ normalRuntimeAllowed: false }],
	});
	writeJson(join(workspaceRoot, "server/content/generated/logh7-operation-catalog.json"), {
		id: "logh7-operation-catalog",
		purposes: [],
		planFields: [],
		restrictions: [],
		commandPointCost: { kind: "variable-unresolved" },
	});
}

function writeJson(path, value) {
	mkdirSync(join(path, ".."), { recursive: true });
	const text = typeof value === "string" ? value : `${JSON.stringify(value, null, 2)}\n`;
	writeFileSync(path, text);
}
