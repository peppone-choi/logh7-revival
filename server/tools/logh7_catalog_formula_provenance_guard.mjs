#!/usr/bin/env node
import { resolve } from "node:path";

import { writeFormulaProvenanceGuardManifest } from "../src/server/logh7-formula-provenance-guard.mjs";

const args = parseArgs(process.argv.slice(2));
const manifest = writeFormulaProvenanceGuardManifest({
	outPath: args.out,
	workspaceRoot: args.workspaceRoot,
});

console.log(
	JSON.stringify(
		{
			id: manifest.id,
			out: args.out,
			domainCount: manifest.domains.length,
			unresolvedFormulaCount: manifest.unresolvedFormulaCount,
			canonicalPromotion: manifest.canonicalPromotion,
		},
		null,
		2,
	),
);

function parseArgs(argv) {
	const args = {
		out: "content/generated/logh7-formula-provenance-guard.json",
		workspaceRoot: resolve(".."),
	};

	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		if (arg === "--out") {
			args.out = argv[index + 1] ?? args.out;
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
