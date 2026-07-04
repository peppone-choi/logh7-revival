#!/usr/bin/env node
import { resolve } from "node:path";

import {
	buildRemasterProvenanceManifest,
	writeRemasterProvenanceManifest,
} from "../src/server/logh7-remaster-provenance-manifest.mjs";

const args = parseArgs(process.argv.slice(2));
const manifest = buildRemasterProvenanceManifest({ workspaceRoot: args.workspaceRoot });
writeRemasterProvenanceManifest({
	outPath: args.out,
	unityOutPath: args.unityOut,
	manifest,
	workspaceRoot: args.workspaceRoot,
});

console.log(JSON.stringify({
	id: manifest.id,
	out: args.out,
	unityOut: args.unityOut,
	packCount: manifest.packs.length,
	artifactCount: manifest.packs[0].artifacts.length,
}, null, 2));

function parseArgs(argv) {
	const args = {
		out: "content/generated/logh7-remaster-provenance-manifest.json",
		unityOut:
			"../client-unity/Assets/StreamingAssets/logh7/logh7-remaster-provenance-manifest.json",
		workspaceRoot: resolve(".."),
	};

	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		if (arg === "--out") {
			args.out = argv[index + 1];
			index += 1;
		} else if (arg === "--unity-out") {
			args.unityOut = argv[index + 1];
			index += 1;
		} else if (arg === "--workspace-root") {
			args.workspaceRoot = resolve(argv[index + 1]);
			index += 1;
		} else {
			throw new Error(`unknown argument: ${arg}`);
		}
	}

	return args;
}
