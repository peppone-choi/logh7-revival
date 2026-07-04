#!/usr/bin/env node
import { join } from "node:path";

import { writeUlwEvidenceInventoryManifest } from "../src/server/logh7-ulw-evidence-inventory.mjs";

const args = parseArgs(process.argv.slice(2));
const manifest = writeUlwEvidenceInventoryManifest({
	outPath: args.out,
});

console.log(
	JSON.stringify(
		{
			id: manifest.id,
			out: args.out,
			targetEvidenceDate: manifest.targetEvidenceDate,
			fileCount: manifest.fileCount,
			excludedSelfAuditFileCount: manifest.excludedSelfAuditFileCount,
			totalBytes: manifest.totalBytes,
			status: manifest.status,
		},
		null,
		2,
	),
);

function parseArgs(argv) {
	const args = {
		out: join("content", "generated", "logh7-ulw-evidence-20260703-inventory.json"),
	};

	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		if (arg === "--out") {
			args.out =
				argv[index + 1] ??
				join("content", "generated", "logh7-ulw-evidence-20260703-inventory.json");
			index += 1;
		} else {
			throw new Error(`unknown argument: ${arg}`);
		}
	}

	return args;
}
