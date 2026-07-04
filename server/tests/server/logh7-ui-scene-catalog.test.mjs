import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
	buildUiSceneCatalog,
	writeUiSceneCatalog,
} from "../../src/server/logh7-ui-scene-catalog.mjs";

test("UI scene catalog maps mandatory client surfaces to evidence-backed scenes", () => {
	const catalog = buildUiSceneCatalog();

	assert.equal(catalog.id, "logh7-ui-scene-catalog");
	assert.equal(catalog.canonicalPromotion, "blocked-until-cross-source-confirmed");
	assert.equal(catalog.summary.surfaceCount, 10);
	assert.equal(catalog.summary.missingSceneCount, 0);
	assert.deepEqual(
		catalog.surfaces.map((surface) => surface.id),
		[
			"launcher",
			"login",
			"lobby",
			"character",
			"world",
			"strategic",
			"select-grid",
			"info",
			"tactics",
			"battle",
		],
	);
	const surfaces = new Map(catalog.surfaces.map((surface) => [surface.id, surface]));
	assert.deepEqual(surfaces.get("launcher").sceneIds, ["boot-update-launcher"]);
	assert.deepEqual(surfaces.get("character").relatedSceneIds, ["character-create"]);
	assert.deepEqual(surfaces.get("select-grid").sceneIds, ["strategic-map"]);
	assert.equal(surfaces.get("select-grid").liveTraceRecord, "0x0b01");
	assert.ok(surfaces.get("select-grid").requiredEvidenceChannels.includes("live-trace"));
	assert.deepEqual(surfaces.get("info").sceneIds, ["reports-mail-system"]);
	assert.ok(surfaces.get("info").relatedSceneIds.includes("planet-system-detail"));
	assert.deepEqual(surfaces.get("tactics").sceneIds, ["fleet-operations"]);
	assert.deepEqual(surfaces.get("battle").sceneIds, ["tactical-battle"]);
	assert.ok(catalog.inputs.some((input) => input.id === "sceneInventory" && input.status === "present"));
});

test("UI scene catalog fails closed when scene inventory is unreadable", () => {
	const workspaceRoot = mkdtempSync(join(tmpdir(), "logh7-ui-scenes-"));
	try {
		const sceneInventoryPath = join(
			workspaceRoot,
			"server/content/generated/logh7-scene-inventory.json",
		);
		mkdirSync(join(sceneInventoryPath, ".."), { recursive: true });
		writeFileSync(sceneInventoryPath, "{broken");

		const catalog = buildUiSceneCatalog({ workspaceRoot });

		assert.equal(catalog.canonicalPromotion, "blocked-until-cross-source-confirmed");
		assert.equal(catalog.inputs.find((input) => input.id === "sceneInventory").status, "unreadable");
		assert.equal(catalog.summary.surfaceCount, 0);
		assert.equal(catalog.summary.missingSceneCount, 10);
		assert.deepEqual(catalog.surfaces, []);
	} finally {
		rmSync(workspaceRoot, { recursive: true, force: true });
	}
});

test("UI scene catalog writes the server generated copy", () => {
	const workspaceRoot = mkdtempSync(join(tmpdir(), "logh7-ui-scenes-write-"));
	try {
		writeMinimalSceneInventory(workspaceRoot);
		const outPath = join(
			workspaceRoot,
			"server/content/generated/logh7-ui-scene-catalog.json",
		);

		const catalog = writeUiSceneCatalog({ workspaceRoot, outPath });
		const serverCopy = JSON.parse(readFileSync(outPath, "utf8"));

		assert.equal(catalog.id, "logh7-ui-scene-catalog");
		assert.deepEqual(serverCopy, catalog);
		assert.equal(catalog.streamingAssetsTarget, "client-unity/Assets/StreamingAssets/logh7/logh7-ui-scene-catalog.json");
	} finally {
		rmSync(workspaceRoot, { recursive: true, force: true });
	}
});

function writeMinimalSceneInventory(workspaceRoot) {
	const path = join(workspaceRoot, "server/content/generated/logh7-scene-inventory.json");
	mkdirSync(join(path, ".."), { recursive: true });
	writeFileSync(
		path,
		`${JSON.stringify({
			id: "logh7-scene-inventory",
			scenes: [
				{ id: "boot-update-launcher", evidenceStatus: "source-hits-present" },
				{ id: "login", evidenceStatus: "source-hits-present" },
				{ id: "lobby", evidenceStatus: "source-hits-present" },
				{ id: "character-select", evidenceStatus: "source-hits-present" },
				{ id: "character-create", evidenceStatus: "source-hits-present" },
				{ id: "world-entry", evidenceStatus: "source-hits-present" },
				{ id: "strategic-map", evidenceStatus: "source-hits-present" },
				{ id: "fleet-operations", evidenceStatus: "source-hits-present" },
				{ id: "tactical-battle", evidenceStatus: "source-hits-present" },
				{ id: "planet-system-detail", evidenceStatus: "source-hits-present" },
				{ id: "organization-personnel", evidenceStatus: "source-hits-present" },
				{ id: "reports-mail-system", evidenceStatus: "source-hits-present" },
			],
		}, null, 2)}\n`,
	);
}
