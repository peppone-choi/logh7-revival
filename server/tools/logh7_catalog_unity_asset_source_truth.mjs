#!/usr/bin/env node
import { resolve } from "node:path";

import { writeUnityAssetSourceTruthManifest } from "../src/server/logh7-unity-asset-source-truth.mjs";

const args = parseArgs(process.argv.slice(2));
const manifest = writeUnityAssetSourceTruthManifest({
	outPath: args.out,
	unityOutPath: args.unityOut,
	workspaceRoot: args.workspaceRoot,
});

console.log(
	JSON.stringify(
		{
			id: manifest.id,
			out: args.out,
			unityOut: args.unityOut,
			manualDragAsSourceTruthAllowed: manifest.manualDragAsSourceTruthAllowed,
			sourceTruthInputCount: manifest.sourceTruthInputs.length,
			unityRuntimeConsumerCount: manifest.unityRuntimeConsumers.length,
			violationCount: manifest.violationCount,
		},
		null,
		2,
	),
);

function parseArgs(argv) {
	const args = {
		out: "content/generated/logh7-unity-asset-source-truth.json",
		unityOut: "../client-unity/Assets/StreamingAssets/logh7/logh7-unity-asset-source-truth.json",
		workspaceRoot: resolve(".."),
	};

	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		if (arg === "--out") {
			args.out = argv[index + 1] ?? args.out;
			index += 1;
		} else if (arg === "--unity-out") {
			args.unityOut = argv[index + 1] ?? args.unityOut;
			index += 1;
		} else if (arg === "--workspace-root") {
			args.workspaceRoot = resolve(argv[index + 1] ?? args.workspaceRoot);
			index += 1;
		} else {
			throw new Error(`unknown argument: ${arg}`);
		}
	}

	return args;
}
