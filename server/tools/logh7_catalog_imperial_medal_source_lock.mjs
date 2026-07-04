#!/usr/bin/env node
import { join } from "node:path";

import {
	buildImperialMedalSourceLock,
	writeImperialMedalSourceLock,
} from "../src/server/logh7-imperial-medal-source-lock.mjs";

const args = parseArgs(process.argv.slice(2));
const manifest = buildImperialMedalSourceLock();

if (args.out) {
	writeImperialMedalSourceLock(args.out, manifest);
} else {
	console.log(JSON.stringify(manifest, null, 2));
}

function parseArgs(argv) {
	const args = {
		out: undefined,
	};

	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		if (arg === "--out") {
			args.out =
				argv[index + 1] ??
				join("content", "generated", "logh7-imperial-medal-source-lock-manifest.json");
			index += 1;
		} else {
			throw new Error(`unknown argument: ${arg}`);
		}
	}

	return args;
}
