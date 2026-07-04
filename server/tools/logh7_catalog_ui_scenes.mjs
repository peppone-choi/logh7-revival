#!/usr/bin/env node
import {
	buildUiSceneCatalog,
	writeUiSceneCatalog,
} from "../src/server/logh7-ui-scene-catalog.mjs";

const args = parseArgs(process.argv.slice(2));
const catalog = buildUiSceneCatalog({ workspaceRoot: args.workspaceRoot });
writeUiSceneCatalog({
	outPath: args.out,
	unityOutPath: args.unityOut,
	catalog,
	workspaceRoot: args.workspaceRoot,
});

console.log(
	JSON.stringify(
		{
			id: catalog.id,
			out: args.out,
			unityOut: args.unityOut,
			surfaceCount: catalog.summary.surfaceCount,
			missingSceneCount: catalog.summary.missingSceneCount,
			liveTraceSurfaceCount: catalog.summary.liveTraceSurfaceCount,
			canonicalPromotion: catalog.canonicalPromotion,
		},
		null,
		2,
	),
);

function parseArgs(argv) {
	const args = {
		out: "content/generated/logh7-ui-scene-catalog.json",
		unityOut: "../client-unity/Assets/StreamingAssets/logh7/logh7-ui-scene-catalog.json",
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
