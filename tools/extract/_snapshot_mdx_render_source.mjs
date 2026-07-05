import { createHash } from "node:crypto";
import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
	parseMdxHeader,
	parseMdxNodeNames,
} from "./logh7-mdx-catalog.mjs";

const SERVER_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const REPO_ROOT = join(SERVER_ROOT, "..");
const INSTALLED_ROOT = join(REPO_ROOT, ".omo", "work", "logh7-installed");
const OUTPUT_PATH = join(
	SERVER_ROOT,
	"content",
	"generated",
	"logh7-mdx-render-source-manifest.json",
);
const IMPERIAL_CREST_REFERENCE =
	"client-unity/Assets/ArtSource/reference/logh7-imperial-double-eagle-reference.jpg";
const IMPERIAL_CREST_MASK =
	"client-unity/Assets/ArtSource/reference/imperial-crest/logh7-imperial-double-eagle-mask-gold.png";
const FIRST_IMPERIAL_HULL = "data/model/Ship/GE/EH001.mdx";
const IMAGE_TIERS = ["Hi", "Lo", "Mid"];

export function buildMdxRenderSourceManifest({
	installedRoot = INSTALLED_ROOT,
	repoRoot = REPO_ROOT,
	targets = [FIRST_IMPERIAL_HULL],
} = {}) {
	const absoluteInstalledRoot = resolve(installedRoot);
	const absoluteRepoRoot = resolve(repoRoot);
	const targetRecords = targets.map((target) =>
		buildTargetRecord({ target, absoluteInstalledRoot, absoluteRepoRoot }),
	);

	return {
		id: "logh7-mdx-render-source-manifest",
		generatedAt: new Date().toISOString(),
		purpose:
			"Prepare original LOGH VII Imperial Ship/GE MDX data as remaster medal ship-art sources.",
		imperialCrest: {
			required: true,
			reference: IMPERIAL_CREST_REFERENCE,
			mask: IMPERIAL_CREST_MASK,
			policy:
				"Imperial medals must carry this crest source or an explicitly traced derivative.",
		},
		sourceRoot: normalizePath(relative(absoluteRepoRoot, absoluteInstalledRoot)),
		productionPolicy:
			"Do not use thumbnail silhouettes for final large medal ship art; render or extract original Ship/GE MDX sources first.",
		targets: targetRecords,
	};
}

export function writeMdxRenderSourceManifest({
	outPath = OUTPUT_PATH,
	manifest = buildMdxRenderSourceManifest(),
} = {}) {
	mkdirSync(dirname(outPath), { recursive: true });
	writeFileSync(outPath, `${JSON.stringify(manifest, null, 2)}\n`);
	return manifest;
}

function buildTargetRecord({ target, absoluteInstalledRoot, absoluteRepoRoot }) {
	const absoluteTarget = join(absoluteInstalledRoot, target);
	const bytes = readFileSync(absoluteTarget);
	const header = parseMdxHeader(bytes);
	const nodeCount = header[0]?.count ?? 0;
	const nodeNames = parseMdxNodeNames(bytes, nodeCount).map((node) => node.name);
	const strings = extractAsciiStrings(bytes);
	const authoringModelReferences = collectReferences(strings, /\.lwo$/i);
	const imageReferences = collectReferences(strings, /\.(bmp|tga|png|jpg|dds)$/i);
	const locatedTextureAssets = locateTextureAssets({
		absoluteInstalledRoot,
		imageReferences,
	});
	const missingTextureAssets = findMissingTextureAssets({
		imageReferences,
		locatedTextureAssets,
	});
	const missingAuthoringAssets = findMissingAuthoringAssets({
		absoluteInstalledRoot,
		authoringModelReferences,
	});

	return {
		file: normalizePath(target),
		sourcePath: normalizePath(relative(absoluteRepoRoot, absoluteTarget)),
		sha256: sha256(bytes),
		size: bytes.length,
		nodeCount,
		nodeNames,
		authoringModelReferences,
		imageReferences,
		locatedTextureAssets,
		missingTextureAssets,
		missingAuthoringAssets,
		renderability: classifyRenderability({
			locatedTextureAssets,
			missingAuthoringAssets,
			missingTextureAssets,
		}),
		productionGate:
			"Do not use thumbnail proof art for this hull until MDX geometry extraction or renderer output is verified.",
	};
}

function collectReferences(strings, extensionPattern) {
	const refs = strings
		.filter((value) => extensionPattern.test(value))
		.filter((value) => /^D\\/i.test(value) || /^scenes\\/i.test(value));
	return [...new Set(refs)];
}

function locateTextureAssets({
	absoluteInstalledRoot,
	imageReferences,
}) {
	const textureRoot = join(absoluteInstalledRoot, "data", "model", "images");
	const located = [];

	for (const tier of IMAGE_TIERS) {
		const tierRoot = join(textureRoot, tier);
		for (const imageReference of imageReferences) {
			const foundName = findFileCaseInsensitive(tierRoot, basename(imageReference));
			if (foundName === null) continue;
			const absolutePath = join(tierRoot, foundName);
			located.push({
				reference: imageReference,
				file: normalizePath(relative(absoluteInstalledRoot, absolutePath)),
				sha256: sha256(readFileSync(absolutePath)),
				size: statSync(absolutePath).size,
			});
		}
	}

	return located;
}

function findMissingTextureAssets({ imageReferences, locatedTextureAssets }) {
	const locatedReferences = new Set(
		locatedTextureAssets.map((asset) => asset.reference),
	);
	return imageReferences.filter((reference) => !locatedReferences.has(reference));
}

function findMissingAuthoringAssets({
	absoluteInstalledRoot,
	authoringModelReferences,
}) {
	return authoringModelReferences.filter(
		(reference) =>
			findFirstFileByBasename(absoluteInstalledRoot, basename(reference)) === null,
	);
}

function classifyRenderability({
	locatedTextureAssets,
	missingAuthoringAssets,
	missingTextureAssets,
}) {
	if (locatedTextureAssets.length === 0) return "mdx-source-present-textures-missing";
	if (missingAuthoringAssets.length > 0) {
		return "mdx-source-present-textures-found-authoring-lwo-missing";
	}
	if (missingTextureAssets.length > 0) {
		return "mdx-source-present-partial-textures-found";
	}
	return "mdx-source-present-textures-found";
}

function extractAsciiStrings(bytes) {
	const strings = [];
	let start = -1;

	for (let index = 0; index < bytes.length; index += 1) {
		const byte = bytes[index];
		const isAscii = byte >= 0x20 && byte <= 0x7e;
		if (isAscii && start === -1) start = index;
		if ((isAscii && index !== bytes.length - 1) || start === -1) continue;

		const end = isAscii ? index + 1 : index;
		if (end - start >= 4) strings.push(bytes.subarray(start, end).toString("ascii"));
		start = -1;
	}

	return strings;
}

function findFileCaseInsensitive(directory, targetName) {
	if (!existsSync(directory)) return null;
	const lowerTarget = targetName.toLowerCase();
	return (
		readdirSync(directory).find((entry) => entry.toLowerCase() === lowerTarget) ??
		null
	);
}

function findFirstFileByBasename(root, targetName) {
	const stack = [root];
	const lowerTarget = targetName.toLowerCase();

	while (stack.length > 0) {
		const current = stack.pop();
		for (const entry of readdirSync(current, { withFileTypes: true })) {
			const absolutePath = join(current, entry.name);
			if (entry.isDirectory()) {
				stack.push(absolutePath);
			} else if (entry.name.toLowerCase() === lowerTarget) {
				return absolutePath;
			}
		}
	}

	return null;
}

function sha256(bytes) {
	return createHash("sha256").update(bytes).digest("hex");
}

function normalizePath(path) {
	return path.split("\\").join("/");
}
