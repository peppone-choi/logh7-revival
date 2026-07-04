#!/usr/bin/env node
import {
	buildGameplayContractBoundary,
	writeGameplayContractBoundary,
} from "../src/server/logh7-gameplay-contract-boundary.mjs";

const args = parseArgs(process.argv.slice(2));
const manifest = buildGameplayContractBoundary({ workspaceRoot: args.workspaceRoot });
writeGameplayContractBoundary({
	outPath: args.out,
	unityOutPath: args.unityOut,
	manifest,
	workspaceRoot: args.workspaceRoot,
});

console.log(
	JSON.stringify(
		{
			id: manifest.id,
			out: args.out,
			unityOut: args.unityOut,
			implementedEvidenceBackedRuleCount: manifest.counts.implementedEvidenceBackedRuleCount,
			unresolvedFormulaLockCount: manifest.counts.unresolvedFormulaLockCount,
			canonicalPromotion: manifest.canonicalPromotion,
		},
		null,
		2,
	),
);

function parseArgs(argv) {
	const args = {
		out: "content/generated/logh7-gameplay-contract-boundary.json",
		unityOut: "../client-unity/Assets/StreamingAssets/logh7/logh7-gameplay-contract-boundary.json",
		workspaceRoot: "..",
	};
	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		if (arg === "--out") args.out = requireValue(argv, ++index, arg);
		else if (arg === "--unity-out") args.unityOut = requireValue(argv, ++index, arg);
		else if (arg === "--workspace-root") args.workspaceRoot = requireValue(argv, ++index, arg);
		else throw new Error(`unknown argument: ${arg}`);
	}
	return args;
}

function requireValue(argv, index, arg) {
	const value = argv[index];
	if (!value) throw new Error(`${arg} requires a value`);
	return value;
}
