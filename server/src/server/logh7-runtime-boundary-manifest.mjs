import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SERVER_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const WORKSPACE_ROOT = join(SERVER_ROOT, "..");
const DEFAULT_OUT = join(
	SERVER_ROOT,
	"content",
	"generated",
	"logh7-runtime-boundary-manifest.json",
);
const RUNTIME_INPUTS = [
	["unityBootstrapManifest", "server/content/generated/logh7-unity-bootstrap-manifest.json"],
	["unityRuntimeManifest", "client-unity/Assets/StreamingAssets/logh7/logh7-unity-runtime-manifest.json"],
	["unitySourcePackManifest", "server/content/generated/logh7-unity-source-pack-manifest.json"],
	["serverDataFamilyManifest", "server/content/generated/logh7-server-servable-data-family.json"],
];
const NORMAL_RUNTIME = [
	{
		id: "operator-docker-compose-server",
		owner: "operator",
		entrypoint: "Docker Compose server path",
		normalRuntimeAllowed: true,
	},
	{
		id: "unity-player-launcher",
		owner: "player",
		entrypoint: "Unity 6000.5.2f1 player/launcher path",
		normalRuntimeAllowed: true,
	},
];
const DIAGNOSTIC_ONLY = [
	["G7MTClient.exe", "original scene/UI/protocol/resource oracle"],
	["Frida", "live instrumentation oracle"],
	["ui_explorer", "live UI diagnostic driver"],
	["preseed-flags", "diagnostic bootstrap bypass only"],
	["patch-builders", "direct patch construction and verification only"],
];

export function buildRuntimeBoundaryManifest({
	workspaceRoot = WORKSPACE_ROOT,
	generatedAt = new Date().toISOString(),
} = {}) {
	return {
		id: "logh7-runtime-boundary-manifest",
		generatedAt,
		productClient: "Unity 6000.5.2f1",
		policy: "diagnostic-only-shortcuts-never-normal-runtime",
		normalRuntime: NORMAL_RUNTIME,
		diagnosticOnly: DIAGNOSTIC_ONLY.map(([id, oracleUse]) => ({
			id,
			oracleUse,
			status: "oracle-only",
			oracleUseAllowed: true,
			normalRuntimeAllowed: false,
		})),
		preseedPolicy: {
			normalRuntimeAllowed: false,
			allowedOnlyFor: "explicit bypass diagnostics",
		},
		patchPolicy: {
			directPatchOperationsOnly: true,
			normalRuntimeAllowed: false,
			requiredEvidence: ["originalSignature", "targetHash", "changedBytes", "rollback", "liveQa"],
		},
		runtimeInputs: RUNTIME_INPUTS.map(([id, path]) => summarizeInput(workspaceRoot, id, path)),
	};
}

export function writeRuntimeBoundaryManifest({
	outPath = DEFAULT_OUT,
	workspaceRoot = WORKSPACE_ROOT,
	manifest,
} = {}) {
	const resolvedManifest =
		manifest ?? buildRuntimeBoundaryManifest({ workspaceRoot: resolve(workspaceRoot) });
	mkdirSync(dirname(outPath), { recursive: true });
	writeFileSync(outPath, `${JSON.stringify(resolvedManifest, null, 2)}\n`);
	return resolvedManifest;
}

function summarizeInput(workspaceRoot, id, path) {
	const absolutePath = resolve(workspaceRoot, path);
	const base = {
		id,
		path: normalizePath(path),
		normalRuntimeAllowed: true,
	};
	if (!existsSync(absolutePath)) return { ...base, status: "missing" };
	const bytes = readFileSync(absolutePath);
	try {
		const parsed = JSON.parse(bytes.toString("utf8"));
		return {
			...base,
			status: "present",
			size: statSync(absolutePath).size,
			sha1: createHash("sha1").update(bytes).digest("hex"),
			manifestId: parsed.id ?? null,
			manifestStatus: parsed.status ?? parsed.canonicalPromotion ?? null,
		};
	} catch (error) {
		return {
			...base,
			status: "unreadable",
			error: error instanceof Error ? error.message : String(error),
		};
	}
}

function normalizePath(path) {
	return path.replace(/\\/g, "/");
}
