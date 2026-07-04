import { createHash } from "node:crypto";
import {
	existsSync,
	mkdirSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { basename, dirname, extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const SERVER_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const REPO_ROOT = join(SERVER_ROOT, "..");
const MODEL_SHIP_CATALOG = join(
	SERVER_ROOT,
	"content",
	"extracted",
	"model-ship.json",
);
const OUTPUT_PATH = join(
	SERVER_ROOT,
	"content",
	"generated",
	"logh7-imperial-medal-source-lock-manifest.json",
);
const INSTALLED_ROOT = join(REPO_ROOT, ".omo", "work", "logh7-installed");
const CREST_REFERENCE =
	"client-unity/Assets/ArtSource/reference/logh7-imperial-double-eagle-reference.jpg";
const CREST_MASK =
	"client-unity/Assets/ArtSource/reference/imperial-crest/logh7-imperial-double-eagle-mask-gold.png";
const THUMBNAIL_PROOF =
	"client-unity/Assets/ArtSource/reference/empire-ships/iu008-original-thumbnail-transparent.png";
const THUMBNAIL_SOURCE =
	".omo/work/logh7-installed/data/image/Thumbnail/Ship/iu008.tga";
const PROTOTYPE_OUTPUT =
	"client-unity/Assets/ArtSource/remaster/imperial-medal-prototypes-1024/779-expeditionary-campaign-source-locked-crest-ship-prototype.png";
const CORRECTED_PROTOTYPE_OUTPUT =
	"client-unity/Assets/ArtSource/remaster/imperial-medal-prototypes-1024/779-expeditionary-campaign-source-locked-crest-ship-v2.png";
const CREST_PRIMARY_PROTOTYPE_OUTPUT =
	"client-unity/Assets/ArtSource/remaster/imperial-medal-prototypes-1024/767-grand-double-eagle-order-source-locked-crest-v2.png";

export function buildImperialMedalSourceLock({
	modelShipCatalogPath = MODEL_SHIP_CATALOG,
	installedRoot = INSTALLED_ROOT,
} = {}) {
	const modelRecords = JSON.parse(readFileSync(modelShipCatalogPath, "utf8"));
	const empireRecords = modelRecords.filter((record) => record.faction === "empire");
	const empireGeRecords = empireRecords.filter((record) =>
		record.file.startsWith("data/model/Ship/GE/"),
	);
	const empireGeMdxRecords = empireGeRecords.filter((record) =>
		record.file.toLowerCase().endsWith(".mdx"),
	);
	const empireGeMdsRecords = empireGeRecords.filter((record) =>
		record.file.toLowerCase().endsWith(".mds"),
	);
	const renderQueue = buildRenderQueue(empireGeMdxRecords, installedRoot);

	return {
		id: "logh7-imperial-medal-source-lock-manifest",
		generatedAt: new Date().toISOString(),
		purpose:
			"Lock Imperial medal ship motifs to original LOGH VII Empire ship data before remaster production.",
		sourceLock: {
			imperialCrestRequired: true,
			crestReference: CREST_REFERENCE,
			crestMask: CREST_MASK,
			empireShipDataRequired: true,
			empireModelCatalog: normalizePath(relative(REPO_ROOT, modelShipCatalogPath)),
			empireModelRecordCount: empireRecords.length,
			empireGeFileRecordCount: empireGeRecords.length,
			empireGeMdxRecordCount: empireGeMdxRecords.length,
			empireGeMdsRecordCount: empireGeMdsRecords.length,
			renderQueueCount: renderQueue.length,
			empireGeRoot: ".omo/work/logh7-installed/data/model/Ship/GE/",
			thumbnailRoot: ".omo/work/logh7-installed/data/image/Thumbnail/Ship/",
			finalLargeShipMotifRequired: true,
			centralImperialCrestMaskRequired: true,
			thumbnailPolicy:
				"Decoded thumbnails are proof-only composition references; do not upscale them into final large ship medal art.",
			largeShipArtGate:
				"Final large ship motifs must use original Ship/GE MDX render/extract output.",
			visualCompositionPolicy:
				"Imperial medal concepts must keep the double-eagle crest visibly legible; ship-medal concepts must use original Empire ship data, never invented ship silhouettes.",
		},
		proofThumbnail: {
			stem: "iu008",
			source: THUMBNAIL_SOURCE,
			sourceSha256: hashIfPresent(join(REPO_ROOT, THUMBNAIL_SOURCE)),
			transparentReference: THUMBNAIL_PROOF,
			transparentReferenceSha256: hashIfPresent(join(REPO_ROOT, THUMBNAIL_PROOF)),
			usage: "proof-only until replaced by MDX render/extract output",
		},
		prototype: {
			medalId: 779,
			nameKo: "원정부대 종군기장",
			output: PROTOTYPE_OUTPUT,
			outputSha256: hashIfPresent(join(REPO_ROOT, PROTOTYPE_OUTPUT)),
			correctedOutput: CORRECTED_PROTOTYPE_OUTPUT,
			correctedOutputSha256: hashIfPresent(join(REPO_ROOT, CORRECTED_PROTOTYPE_OUTPUT)),
			crestPrimaryOutput: CREST_PRIMARY_PROTOTYPE_OUTPUT,
			crestPrimaryOutputSha256: hashIfPresent(
				join(REPO_ROOT, CREST_PRIMARY_PROTOTYPE_OUTPUT),
			),
			visualRequirements: {
				imperialCrestPlacement: "large-visible-faction-mark",
				shipMotifSource: "original-empire-ship-data",
				finalLargeShipMotifSource: "original-ship-ge-mdx-render",
				centralCrestMask: CREST_MASK,
				thumbnailUse: "proof-only",
				generatedShipSilhouettesAllowed: false,
				generatedCrestAllowed: false,
			},
			status: "source-locked proof sample; ship motif still thumbnail-derived",
		},
		renderQueue,
	};
}

export function writeImperialMedalSourceLock(
	outPath = OUTPUT_PATH,
	manifest = buildImperialMedalSourceLock(),
) {
	mkdirSync(dirname(outPath), { recursive: true });
	writeFileSync(outPath, `${JSON.stringify(manifest, null, 2)}\n`);
	return manifest;
}

function buildRenderQueue(records, installedRoot) {
	const groups = new Map();
	for (const record of records) {
		const hullId = extractHullId(record.name);
		if (!hullId) continue;
		const item = buildRenderCandidate(record, installedRoot);
		groups.set(hullId, [...(groups.get(hullId) ?? []), item]);
	}

	return [...groups.entries()]
		.sort(([left], [right]) => left.localeCompare(right))
		.map(([hullId, candidates]) => {
			const sortedCandidates = candidates.toSorted(
				(left, right) => detailRank(left.detailTier) - detailRank(right.detailTier),
			);
			return {
				hullId,
				status: "pending-mdx-render",
				selectedMdx: sortedCandidates[0],
				candidates: sortedCandidates,
			};
		});
}

function buildRenderCandidate(record, installedRoot) {
	const sourcePath = normalizePath(join(".omo", "work", "logh7-installed", record.file));
	const absolutePath = join(installedRoot, record.file);
	return {
		name: record.name,
		file: record.file,
		sourcePath,
		sourceSha256: hashIfPresent(absolutePath),
		detailTier: inferDetailTier(record.name),
		nodeCount: record.node_count,
		nodes: record.nodes,
		assets: record.assets,
	};
}

function extractHullId(name) {
	const match = name.toUpperCase().match(/[A-Z]+(\d+)$/);
	return match?.[1] ?? null;
}

function inferDetailTier(name) {
	const prefix = basename(name, extname(name)).slice(0, 2).toUpperCase();
	if (prefix === "EH") return "high";
	if (prefix === "EM") return "medium";
	if (prefix === "EL") return "low";
	return "other";
}

function detailRank(tier) {
	if (tier === "high") return 0;
	if (tier === "medium") return 1;
	if (tier === "low") return 2;
	return 3;
}

function hashIfPresent(path) {
	if (!existsSync(path)) return null;
	return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function normalizePath(path) {
	return path.split("\\").join("/");
}
