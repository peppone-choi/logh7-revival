#!/usr/bin/env node
import { resolve } from "node:path";

import { writeGalaxyTrustCrosscheckManifest } from "../src/server/logh7-galaxy-trust-crosscheck.mjs";

const args = parseArgs(process.argv.slice(2));
const manifest = writeGalaxyTrustCrosscheckManifest({
	outPath: args.out,
	workspaceRoot: args.workspaceRoot,
});

console.log(
	JSON.stringify(
		{
			id: manifest.id,
			out: args.out,
			groupCount: manifest.sourceGroups.length,
			promotionAllowed: manifest.trustPolicy.promotionAllowed,
			systemPositionsReportImmediately: manifest.mandatoryWatchCategories.some(
				(category) => category.id === "systemPositions" && category.reportImmediately,
			),
		},
		null,
		2,
	),
);

function parseArgs(argv) {
	const args = {
		out: "content/generated/logh7-galaxy-trust-crosscheck.json",
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
