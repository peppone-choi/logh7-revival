import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SERVER_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const WORKSPACE_ROOT = join(SERVER_ROOT, "..");
const DEFAULT_OUT = join(SERVER_ROOT, "content", "generated", "logh7-ui-scene-catalog.json");
const BLOCKED = "blocked-until-cross-source-confirmed";
const SCENE_INVENTORY_PATH = "server/content/generated/logh7-scene-inventory.json";

const SURFACE_DEFINITIONS = [
	{
		id: "launcher",
		sceneIds: ["boot-update-launcher"],
		requiredEvidenceChannels: ["exe-launcher", "ghidra-strings", "cd-extract"],
		runtimePhase: "operator-player-entry",
	},
	{
		id: "login",
		sceneIds: ["login"],
		requiredEvidenceChannels: ["ghidra-strings", "wire-login", "live-trace"],
		runtimePhase: "network-session-entry",
		liveTraceRecords: ["0x7000"],
	},
	{
		id: "lobby",
		sceneIds: ["lobby"],
		requiredEvidenceChannels: ["ghidra-strings", "wire-lobby", "live-trace"],
		runtimePhase: "pre-game-session",
		liveTraceRecords: ["0x0020", "0x2005", "0x2006"],
	},
	{
		id: "character",
		sceneIds: ["character-select"],
		relatedSceneIds: ["character-create"],
		requiredEvidenceChannels: ["ghidra-strings", "msgdat-text", "live-trace"],
		runtimePhase: "player-character-selection",
		liveTraceRecords: ["0x1008"],
	},
	{
		id: "world",
		sceneIds: ["world-entry"],
		requiredEvidenceChannels: ["ghidra-functions", "wire-world", "live-trace"],
		runtimePhase: "world-loaded",
		liveTraceRecords: ["0x0f02"],
	},
	{
		id: "strategic",
		sceneIds: ["strategic-map"],
		requiredEvidenceChannels: ["ghidra-functions", "manual-map", "live-trace"],
		runtimePhase: "strategic-map",
		liveTraceRecords: ["0x0313", "0x0315"],
	},
	{
		id: "select-grid",
		sceneIds: ["strategic-map"],
		requiredEvidenceChannels: ["ghidra-functions", "wire-select-grid", "live-trace"],
		runtimePhase: "strategic-grid-command",
		liveTraceRecords: ["0x0b01"],
	},
	{
		id: "info",
		sceneIds: ["reports-mail-system"],
		relatedSceneIds: ["planet-system-detail", "organization-personnel"],
		requiredEvidenceChannels: ["msgdat-text", "manual", "ghidra-strings"],
		runtimePhase: "information-panels",
	},
	{
		id: "tactics",
		sceneIds: ["fleet-operations"],
		requiredEvidenceChannels: ["manual-operations", "ghidra-strings", "wire-command"],
		runtimePhase: "fleet-command-planning",
	},
	{
		id: "battle",
		sceneIds: ["tactical-battle"],
		requiredEvidenceChannels: ["ghidra-functions", "manual-combat", "live-trace"],
		runtimePhase: "tactical-battle",
	},
];

export function buildUiSceneCatalog({ workspaceRoot = WORKSPACE_ROOT } = {}) {
	const root = resolve(workspaceRoot);
	const sceneInventoryInput = summarizeInput(root, "sceneInventory", SCENE_INVENTORY_PATH);
	if (sceneInventoryInput.status !== "present") {
		return buildUnavailableCatalog(sceneInventoryInput);
	}
	const sceneInventory = sceneInventoryInput.parsed;
	const sceneIds = new Set(sceneInventory.scenes?.map((scene) => scene.id) ?? []);
	const sceneMap = new Map((sceneInventory.scenes ?? []).map((scene) => [scene.id, scene]));
	const surfaces = SURFACE_DEFINITIONS.map((definition) =>
		buildSurface(definition, sceneIds, sceneMap),
	);

	return {
		id: "logh7-ui-scene-catalog",
		generatedAt: new Date().toISOString(),
		canonicalPromotion: BLOCKED,
		streamingAssetsTarget: "client-unity/Assets/StreamingAssets/logh7/logh7-ui-scene-catalog.json",
		inputs: [stripParsed(sceneInventoryInput)],
		runtimePolicy: {
			unityMainRuntime: true,
			originalClientRole: "oracle-and-data-mining-only",
			diagnosticShortcutsNormalRuntimeAllowed: false,
		},
		summary: summarizeSurfaces(surfaces),
		surfaces,
	};
}

export function writeUiSceneCatalog({
	outPath = DEFAULT_OUT,
	catalog,
	workspaceRoot = WORKSPACE_ROOT,
} = {}) {
	const resolvedCatalog = catalog ?? buildUiSceneCatalog({ workspaceRoot });
	writeJson(outPath, resolvedCatalog);
	return resolvedCatalog;
}

function buildUnavailableCatalog(sceneInventoryInput) {
	return {
		id: "logh7-ui-scene-catalog",
		generatedAt: new Date().toISOString(),
		canonicalPromotion: BLOCKED,
		streamingAssetsTarget: "client-unity/Assets/StreamingAssets/logh7/logh7-ui-scene-catalog.json",
		inputs: [stripParsed(sceneInventoryInput)],
		runtimePolicy: {
			unityMainRuntime: true,
			originalClientRole: "oracle-and-data-mining-only",
			diagnosticShortcutsNormalRuntimeAllowed: false,
		},
		summary: {
			surfaceCount: 0,
			requiredSurfaceCount: SURFACE_DEFINITIONS.length,
			missingSceneCount: SURFACE_DEFINITIONS.length,
			liveTraceSurfaceCount: 0,
		},
		surfaces: [],
	};
}

function buildSurface(definition, sceneIds, sceneMap) {
	const relatedSceneIds = definition.relatedSceneIds ?? [];
	const missingSceneIds = [...definition.sceneIds, ...relatedSceneIds].filter(
		(sceneId) => !sceneIds.has(sceneId),
	);
	const evidenceStatuses = definition.sceneIds.map(
		(sceneId) => sceneMap.get(sceneId)?.evidenceStatus ?? "missing",
	);
	return {
		id: definition.id,
		sceneIds: definition.sceneIds,
		relatedSceneIds,
		runtimePhase: definition.runtimePhase,
		requiredEvidenceChannels: definition.requiredEvidenceChannels,
		evidenceStatus: evidenceStatuses.every((status) => status === "source-hits-present")
			? "source-hits-present"
			: "needs-cross-check",
		liveTraceRecords: definition.liveTraceRecords ?? [],
		liveTraceRecord: definition.liveTraceRecords?.[0] ?? null,
		implementationStatus:
			missingSceneIds.length === 0 ? "cataloged-placeholder-required" : "missing-scene",
		missingSceneIds,
	};
}

function summarizeSurfaces(surfaces) {
	return {
		surfaceCount: surfaces.length,
		requiredSurfaceCount: SURFACE_DEFINITIONS.length,
		missingSceneCount: surfaces.filter((surface) => surface.missingSceneIds.length > 0).length,
		liveTraceSurfaceCount: surfaces.filter((surface) => surface.liveTraceRecords.length > 0)
			.length,
		sourceHitSurfaceCount: surfaces.filter(
			(surface) => surface.evidenceStatus === "source-hits-present",
		).length,
	};
}

function summarizeInput(workspaceRoot, id, path) {
	const absolutePath = join(workspaceRoot, path);
	if (!existsSync(absolutePath)) return { id, path, status: "missing" };
	try {
		return {
			id,
			path,
			status: "present",
			parsed: JSON.parse(readFileSync(absolutePath, "utf8")),
		};
	} catch (error) {
		return { id, path, status: "unreadable", error: error.message };
	}
}

function stripParsed(input) {
	const { parsed: _parsed, ...rest } = input;
	return rest;
}

function writeJson(path, value) {
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}
