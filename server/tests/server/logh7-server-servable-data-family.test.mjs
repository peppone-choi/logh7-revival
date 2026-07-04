import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
	buildServerServableDataFamilyManifest,
	writeServerServableDataFamilyManifest,
} from "../../src/server/logh7-server-servable-data-family.mjs";

test("server data family manifest scopes every gameplay family as suspect until cross-check", () => {
	// given
	const manifest = buildServerServableDataFamilyManifest();

	// when
	const familyIds = manifest.families.map((family) => family.id);
	const systems = manifest.families.find((family) => family.id === "systems");
	const characters = manifest.families.find((family) => family.id === "characters");
	const ships = manifest.families.find((family) => family.id === "ships");
	const formulas = manifest.families.find((family) => family.id === "formulas");

	// then
	assert.equal(manifest.id, "logh7-server-servable-data-family");
	assert.deepEqual(familyIds, [
		"systems",
		"stars",
		"planets",
		"grids",
		"characters",
		"fleets",
		"ships",
		"commands",
		"operations",
		"tactics",
		"economy",
		"uiText",
		"reports",
		"launcherCommunity",
		"formulas",
	]);
	assert.ok(
		manifest.families.every(
			(family) => family.canonicalStatus === "suspect-cross-check-required",
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
	assert.ok(
		systems.sourceManifests.some(
			(source) => source.path === "server/content/generated/logh7-hidden-data-watchlist.json",
		),
	);
	assert.ok(
		systems.sourceManifests.some(
			(source) =>
				source.path === "server/content/generated/logh7-galaxy-trust-crosscheck.json",
		),
	);
	assert.ok(
		systems.sourceManifests.some(
			(source) =>
				source.path === "server/content/generated/logh7-runtime-boundary-manifest.json",
		),
	);
	assert.deepEqual(characters.watchCategories, ["originalCharacterRoster"]);
	assert.ok(
		ships.sourceManifests.some(
			(source) =>
				source.path ===
				"server/content/generated/logh7-mdx-render-source-manifest.json",
		),
	);
	assert.ok(
		formulas.sourceManifests.some(
			(source) =>
				source.path ===
				"server/content/generated/logh7-formula-provenance-guard.json",
		),
	);
});

test("server data family manifest records malformed source data without canonical promotion", () => {
	// given
	const workspaceRoot = mkdtempSync(join(tmpdir(), "logh7-data-family-"));
	const generatedRoot = join(workspaceRoot, "server", "content", "generated");
	const outPath = join(generatedRoot, "logh7-server-servable-data-family.json");
	mkdirSync(generatedRoot, { recursive: true });
	writeFileSync(join(generatedRoot, "logh7-hidden-data-watchlist.json"), "{broken");

	try {
		// when
		const manifest = writeServerServableDataFamilyManifest({
			outPath,
			workspaceRoot,
		});

		// then
		const systems = manifest.families.find((family) => family.id === "systems");
		const brokenSource = systems.sourceManifests.find(
			(source) =>
				source.path === "server/content/generated/logh7-hidden-data-watchlist.json",
		);
		assert.equal(brokenSource.status, "unreadable");
		assert.equal(systems.canonicalStatus, "suspect-cross-check-required");
		assert.equal(
			manifest.families.some((family) => family.canonicalStatus === "canonical"),
			false,
		);
	} finally {
		rmSync(workspaceRoot, { force: true, recursive: true });
	}
});
