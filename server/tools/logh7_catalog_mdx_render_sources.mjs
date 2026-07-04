#!/usr/bin/env node
import { join } from "node:path";

import {
	buildMdxRenderSourceManifest,
	writeMdxRenderSourceManifest,
} from "../src/server/logh7-mdx-render-source.mjs";

const args = parseArgs(process.argv.slice(2));
const manifest = buildMdxRenderSourceManifest();

if (args.out) {
	writeMdxRenderSourceManifest({ outPath: args.out, manifest });
} else {
	console.log(JSON.stringify(manifest, null, 2));
}

function parseArgs(argv) {
	const args = {
		out: undefined,
	};

	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		if (arg !== "--out") throw new Error(`unknown argument: ${arg}`);
		args.out =
			argv[index + 1] ??
			join("content", "generated", "logh7-mdx-render-source-manifest.json");
		index += 1;
	}

	return args;
}
