#!/usr/bin/env node
import { join } from "node:path";

import {
	buildServerServableDataFamilyManifest,
	writeServerServableDataFamilyManifest,
} from "../src/server/logh7-server-servable-data-family.mjs";

const args = parseArgs(process.argv.slice(2));
const manifest = buildServerServableDataFamilyManifest();

if (args.out) {
	writeServerServableDataFamilyManifest({ outPath: args.out, manifest });
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
			join("content", "generated", "logh7-server-servable-data-family.json");
		index += 1;
	}

	return args;
}
