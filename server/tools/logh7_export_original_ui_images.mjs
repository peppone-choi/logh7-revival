#!/usr/bin/env node
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { exportOriginalUiImages } from "../src/server/logh7-original-ui-image-export.mjs";

const SERVER_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_WORKSPACE_ROOT = join(SERVER_ROOT, "..");
const DEFAULT_MANIFEST = join(
	SERVER_ROOT,
	"content",
	"generated",
	"logh7-original-ui-image-manifest.json",
);

const args = parseArgs(process.argv.slice(2));
const manifest = exportOriginalUiImages({
	workspaceRoot: args.workspaceRoot,
	manifestPath: args.manifest,
	write: true,
});

console.log(
	JSON.stringify(
		{
			id: manifest.id,
			manifest: args.manifest,
			summary: manifest.summary,
			canonicalPromotion: manifest.canonicalPromotion,
			items: manifest.items.map((item) => ({
				id: item.id,
				status: item.status,
				reason: item.reason,
				outputPath: item.outputPath,
				outputSha256: item.outputSha256,
			})),
		},
		null,
		2,
	),
);

function parseArgs(argv) {
	const args = {
		workspaceRoot: DEFAULT_WORKSPACE_ROOT,
		manifest: DEFAULT_MANIFEST,
	};
	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		if (arg === "--workspace-root") args.workspaceRoot = resolve(requireValue(argv, ++index, arg));
		else if (arg === "--manifest") args.manifest = resolve(requireValue(argv, ++index, arg));
		else throw new Error(`unknown argument: ${arg}`);
	}
	return args;
}

function requireValue(argv, index, flag) {
	const value = argv[index];
	if (!value) throw new Error(`missing value for ${flag}`);
	return value;
}
