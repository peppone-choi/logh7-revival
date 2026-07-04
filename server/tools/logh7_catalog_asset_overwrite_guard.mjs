#!/usr/bin/env node
import { resolve } from "node:path";

import { writeAssetOverwriteGuardManifest } from "../src/server/logh7-asset-overwrite-guard.mjs";

const args = parseArgs(process.argv.slice(2));
const manifest = writeAssetOverwriteGuardManifest({
	outPath: args.out,
	workspaceRoot: args.workspaceRoot,
});

console.log(
	JSON.stringify(
		{
			id: manifest.id,
			out: args.out,
			protectedOriginalRoots: manifest.protectedOriginalRoots.length,
			allowedRemasterRoots: manifest.allowedRemasterRoots.length,
			artifactCount: manifest.remasterArtifacts.length,
			violationCount: manifest.violationCount,
		},
		null,
		2,
	),
);

function parseArgs(argv) {
	const args = {
		out: "content/generated/logh7-asset-overwrite-guard.json",
		workspaceRoot: resolve(".."),
	};
	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		if (arg === "--out") {
			args.out = argv[index + 1];
			index += 1;
		} else if (arg === "--workspace-root") {
			args.workspaceRoot = resolve(argv[index + 1]);
			index += 1;
		}
	}
	return args;
}
