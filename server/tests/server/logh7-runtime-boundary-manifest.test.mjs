import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
	buildRuntimeBoundaryManifest,
	writeRuntimeBoundaryManifest,
} from "../../src/server/logh7-runtime-boundary-manifest.mjs";

const DIAGNOSTIC_IDS = [
	"G7MTClient.exe",
	"Frida",
	"ui_explorer",
	"preseed-flags",
	"patch-builders",
];

test("runtime boundary keeps legacy tools diagnostic-only and outside normal runtime", () => {
	// given
	const manifest = buildRuntimeBoundaryManifest();

	// when
	const diagnosticIds = manifest.diagnosticOnly.map((tool) => tool.id);
	const normalRuntimeIds = manifest.normalRuntime.map((surface) => surface.id);

	// then
	assert.equal(manifest.id, "logh7-runtime-boundary-manifest");
	assert.equal(manifest.productClient, "Unity 6000.5.2f1");
	assert.equal(manifest.policy, "diagnostic-only-shortcuts-never-normal-runtime");
	assert.deepEqual(normalRuntimeIds, [
		"operator-docker-compose-server",
		"unity-player-launcher",
	]);
	assert.deepEqual(diagnosticIds, DIAGNOSTIC_IDS);
	assert.ok(
		manifest.diagnosticOnly.every(
			(tool) =>
				tool.normalRuntimeAllowed === false &&
				tool.oracleUseAllowed === true &&
				tool.status === "oracle-only",
		),
	);
	assert.equal(manifest.preseedPolicy.normalRuntimeAllowed, false);
	assert.equal(manifest.patchPolicy.directPatchOperationsOnly, true);
});

test("runtime boundary records malformed runtime input without enabling diagnostics", () => {
	// given
	const workspaceRoot = mkdtempSync(join(tmpdir(), "logh7-runtime-boundary-"));
	const generatedRoot = join(workspaceRoot, "server", "content", "generated");
	const outPath = join(generatedRoot, "logh7-runtime-boundary-manifest.json");
	mkdirSync(generatedRoot, { recursive: true });
	writeFileSync(join(generatedRoot, "logh7-unity-bootstrap-manifest.json"), "{broken");

	try {
		// when
		const manifest = writeRuntimeBoundaryManifest({ outPath, workspaceRoot });
		const written = JSON.parse(readFileSync(outPath, "utf8"));
		const bootstrapInput = manifest.runtimeInputs.find(
			(input) => input.path === "server/content/generated/logh7-unity-bootstrap-manifest.json",
		);

		// then
		assert.equal(bootstrapInput.status, "unreadable");
		assert.equal(bootstrapInput.normalRuntimeAllowed, true);
		assert.equal(written.diagnosticOnly[0].normalRuntimeAllowed, false);
		assert.equal(written.policy, "diagnostic-only-shortcuts-never-normal-runtime");
	} finally {
		rmSync(workspaceRoot, { recursive: true, force: true });
	}
});
