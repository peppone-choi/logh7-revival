import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SERVER_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DEFAULT_OUT = join(
	SERVER_ROOT,
	"content",
	"generated",
	"logh7-test-decision-guard.json",
);
const PROMOTION_BLOCKED = "blocked-until-cross-source-confirmed";
const NODE_TEST_DECISION = "tdd-required-before-behavior-change";
const UNITY_TEST_DECISION = "tests-after-first-loader-scene-surface";

const NODE_SURFACES = [
	{
		id: "cd-media-extraction",
		kind: "extraction",
		module: "server/src/server/logh7-cd-media.mjs",
		test: "server/tests/server/logh7-cd-media.test.mjs",
		catalogScript: "server/tools/logh7_catalog_cd_media.mjs",
	},
	{
		id: "hidden-data-scan",
		kind: "inventory",
		module: "server/src/server/logh7-hidden-data-scan.mjs",
		test: "server/tests/server/logh7-hidden-data-scan.test.mjs",
		catalogScript: "server/tools/logh7_scan_hidden_data.mjs",
	},
	{
		id: "hidden-data-classification",
		kind: "cross-check",
		module: "server/src/server/logh7-hidden-data-classification.mjs",
		test: "server/tests/server/logh7-hidden-data-classification.test.mjs",
		catalogScript: "server/tools/logh7_classify_hidden_data.mjs",
	},
	{
		id: "hidden-data-watchlist",
		kind: "cross-check",
		module: "server/src/server/logh7-hidden-data-watchlist.mjs",
		test: "server/tests/server/logh7-hidden-data-watchlist.test.mjs",
		catalogScript: "server/tools/logh7_report_hidden_data_watchlist.mjs",
	},
	{
		id: "current-content-crosscheck",
		kind: "cross-check",
		module: "server/src/server/logh7-current-content-crosscheck.mjs",
		test: "server/tests/server/logh7-current-content-crosscheck.test.mjs",
		catalogScript: "server/tools/logh7_catalog_current_content_crosscheck.mjs",
	},
	{
		id: "unity-source-pack",
		kind: "inventory",
		module: "server/src/server/logh7-unity-source-pack-manifest.mjs",
		test: "server/tests/server/logh7-unity-source-pack-manifest.test.mjs",
		catalogScript: "server/tools/logh7_catalog_unity_source_pack.mjs",
	},
];

const REQUIRED_NODE_EVIDENCE = [
	"red-test-log",
	"green-test-log",
	"generated-manifest-json",
	"catalog-regeneration-log",
];

export function buildTestDecisionGuardManifest() {
	return {
		id: "logh7-test-decision-guard",
		generatedAt: new Date().toISOString(),
		purpose:
			"Freeze G013 test policy for LOGH VII data extraction, inventory, cross-check, and Unity loader scene work.",
		canonicalPromotion: PROMOTION_BLOCKED,
		nodePolicy: {
			testDecision: NODE_TEST_DECISION,
			redEvidenceRequired: true,
			greenEvidenceRequired: true,
			appliesBefore: "any behavior change or new catalog rule",
			rationale:
				"Node extraction, inventory, and cross-check modules decide data authority, so tests-after would only validate a possibly wrong promotion path.",
		},
		nodeSurfaces: NODE_SURFACES.map((surface) => ({
			...surface,
			testDecision: NODE_TEST_DECISION,
			requiredEvidence: REQUIRED_NODE_EVIDENCE,
			canonicalPromotion: PROMOTION_BLOCKED,
		})),
		unityPolicy: {
			testDecision: UNITY_TEST_DECISION,
			firstRuntimeSurfaceRequired: true,
			testsBeforeSurfaceRequired: false,
			testsAfterSurfaceRequired: true,
			reason:
				"Unity C# loader and scene tests become meaningful after the first manifest-consuming runtime surface exists; until then, record tests-after evidence against the actual loader/scene surface.",
		},
		normalRuntimeBoundary: {
			diagnosticShortcutsAllowedAsRuntime: false,
			legacyClientRole: "oracle-diagnostics-only",
			playerRuntime: "Unity 6000.5.2f1 player/launcher",
			operatorRuntime: "Docker Compose server path",
		},
		enforcementRules: [
			{
				id: "node-data-change-red-first",
				rule: "Any Node extraction, inventory, or cross-check behavior change must capture failing RED evidence before implementation.",
			},
			{
				id: "node-data-change-green-before-catalog",
				rule: "Catalog regeneration and generated JSON updates follow GREEN evidence, not the other way around.",
			},
			{
				id: "unity-loader-tests-after-first-surface",
				rule: "Unity C# loader and scene tests may be tests-after only until a first real loader/scene surface exists, then must target that surface.",
			},
		],
	};
}

export function writeTestDecisionGuardManifest({
	outPath = DEFAULT_OUT,
	manifest = buildTestDecisionGuardManifest(),
} = {}) {
	mkdirSync(dirname(outPath), { recursive: true });
	writeFileSync(outPath, `${JSON.stringify(manifest, null, 2)}\n`);
	return manifest;
}
