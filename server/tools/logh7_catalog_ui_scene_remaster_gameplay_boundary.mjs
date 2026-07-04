#!/usr/bin/env node
import {
	buildUiSceneRemasterGameplayBoundary,
	writeUiSceneRemasterGameplayBoundary,
} from "../src/server/logh7-ui-scene-remaster-gameplay-boundary.mjs";

const args = parseArgs(process.argv.slice(2));
const manifest = buildUiSceneRemasterGameplayBoundary({ workspaceRoot: args.workspaceRoot });
writeUiSceneRemasterGameplayBoundary({
	outPath: args.out,
	unityOutPath: args.unityOut,
	manifest,
	workspaceRoot: args.workspaceRoot,
});

console.log(JSON.stringify({
	id: manifest.id,
	out: args.out,
	unityOut: args.unityOut,
	sceneCount: manifest.uiSceneCatalog.sceneCount ?? 0,
	remasterPacks: manifest.remasterPackSchema.packIds?.length ?? 0,
	empireShipRawMdxCount: manifest.originalAssetContracts.empireShips.rawMdxCount ?? 0,
	imperialCrestOutputCount: manifest.originalAssetContracts.imperialCrest.outputCount ?? 0,
	operationPurposeCount: manifest.gameplayContractBoundary.operationPurposeCount ?? 0,
	canonicalPromotion: manifest.canonicalPromotion,
}, null, 2));

function parseArgs(argv) {
	const args = {
		out: "content/generated/logh7-ui-scene-remaster-gameplay-boundary.json",
		unityOut:
			"../client-unity/Assets/StreamingAssets/logh7/logh7-ui-scene-remaster-gameplay-boundary.json",
		workspaceRoot: "..",
	};
	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		if (arg === "--out") args.out = requireValue(argv, ++index, arg);
		else if (arg === "--unity-out") args.unityOut = requireValue(argv, ++index, arg);
		else if (arg === "--workspace-root") args.workspaceRoot = requireValue(argv, ++index, arg);
		else throw new Error(`unknown argument: ${arg}`);
	}
	return args;
}

function requireValue(argv, index, flag) {
	const value = argv[index];
	if (!value) throw new Error(`missing value for ${flag}`);
	return value;
}
