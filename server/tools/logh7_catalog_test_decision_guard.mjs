#!/usr/bin/env node
import { join } from "node:path";

import { writeTestDecisionGuardManifest } from "../src/server/logh7-test-decision-guard.mjs";

const args = parseArgs(process.argv.slice(2));
const manifest = writeTestDecisionGuardManifest({ outPath: args.out });

console.log(
	JSON.stringify(
		{
			id: manifest.id,
			out: args.out,
			nodeSurfaceCount: manifest.nodeSurfaces.length,
			nodeTestDecision: manifest.nodePolicy.testDecision,
			unityTestDecision: manifest.unityPolicy.testDecision,
			diagnosticShortcutsAllowedAsRuntime:
				manifest.normalRuntimeBoundary.diagnosticShortcutsAllowedAsRuntime,
		},
		null,
		2,
	),
);

function parseArgs(argv) {
	const args = {
		out: join("content", "generated", "logh7-test-decision-guard.json"),
	};

	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		if (arg === "--out") {
			args.out =
				argv[index + 1] ??
				join("content", "generated", "logh7-test-decision-guard.json");
			index += 1;
		} else {
			throw new Error(`unknown argument: ${arg}`);
		}
	}

	return args;
}
