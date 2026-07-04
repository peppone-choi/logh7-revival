// G047: 매뉴얼 성계도(101p판 p101) 독립 재추출 결과와 galaxy.json의 정량 대조 원장.
// 매뉴얼 축 단독으로는 canonical 승격 불가 — CD/RE/live 축 정합 전까지 항상 차단.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SERVER_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DETECTION_PATH = join(SERVER_ROOT, "content", "extracted", "logh7-manual-starchart-detection.json");
const GALAXY_PATH = join(SERVER_ROOT, "content", "galaxy.json");

// 근접 오차 허용(셀 단위): 검출기 가림 바이어스로 인한 서브셀 흔들림까지를 near-miss로 분류
const NEAR_MISS_MAX_CELLS = 1.7;

function readJson(path) {
	return JSON.parse(readFileSync(path, "utf8"));
}

export function buildGalaxyManualCrosscheck(overrides = {}) {
	const base = {
		id: "logh7-galaxy-manual-crosscheck",
		status: "suspect-cross-check-required",
		canonicalPromotion: "blocked-until-cross-source-confirmed",
		policy: "manual-chart axis alone cannot promote system positions; CD/RE/live-wire axes must independently agree",
	};

	let detection;
	let galaxy;
	try {
		detection = overrides.detection ?? readJson(DETECTION_PATH);
		galaxy = overrides.galaxy ?? readJson(GALAXY_PATH);
		if (!Array.isArray(detection.starDots) || !Array.isArray(galaxy.systems)) {
			throw new Error("malformed detection or galaxy input");
		}
	} catch {
		return {
			...base,
			status: "unreadable-detection-input",
			summary: { starDotCount: 0, exactMatchCount: 0, nearMissCount: 0, anomalousDotCount: 0, factionMismatchCount: 0, galaxySystemCount: 0 },
			chartLabelCounts: { total: 0 },
			matchedSystems: [],
			nearMisses: [],
			anomalousDots: [],
			chartAbsentSystems: [],
		};
	}

	const { pitchPx, originPx } = detection.gridFit;
	const [ox, oy] = originPx;
	const bySystemCell = new Map(galaxy.systems.map((s) => [`${s.canonCol},${s.canonRow}`, s]));

	const matchedSystems = [];
	const nearMisses = [];
	const anomalousDots = [];
	const matchedNames = new Set();

	for (const dot of detection.starDots) {
		const col = (dot.x - ox) / pitchPx;
		const row = (dot.y - oy) / pitchPx;
		const ci = Math.round(col);
		const ri = Math.round(row);
		const exact = bySystemCell.get(`${ci},${ri}`);
		if (exact && Math.abs(col - ci) < 0.5 && Math.abs(row - ri) < 0.5) {
			matchedNames.add(exact.system);
			matchedSystems.push({
				system: exact.system,
				cell: [ci, ri],
				dotFaction: dot.faction,
				galaxyFaction: exact.faction,
				factionMatch: dot.faction === exact.faction,
				residualCells: Number((Math.abs(col - ci) + Math.abs(row - ri)).toFixed(3)),
			});
			continue;
		}
		// 최근접 성계까지의 셀 거리로 near-miss/이상치 분류
		let best = null;
		for (const s of galaxy.systems) {
			const d = Math.abs(col - s.canonCol) + Math.abs(row - s.canonRow);
			if (!best || d < best.distanceCells) best = { system: s.system, distanceCells: d };
		}
		const entry = {
			dotCell: [ci, ri],
			faction: dot.faction,
			nearestSystem: best?.system ?? null,
			distanceCells: best ? Number(best.distanceCells.toFixed(2)) : null,
		};
		if (best && best.distanceCells <= NEAR_MISS_MAX_CELLS) nearMisses.push(entry);
		else anomalousDots.push(entry);
	}

	const chartAbsentSystems = galaxy.systems
		.filter((s) => !matchedNames.has(s.system))
		.map((s) => ({
			system: s.system,
			cell: [s.canonCol, s.canonRow],
			nearMissCandidate: nearMisses.some((n) => n.nearestSystem === s.system),
			needsOtherEvidenceAxis: true,
		}));

	const labelCounts = detection.labelCounts ?? { total: 0 };

	return {
		...base,
		generatedAt: detection.generatedAt ?? null,
		detectionProvenance: detection.provenance ?? null,
		gridFit: detection.gridFit,
		chartLabelCounts: labelCounts,
		summary: {
			galaxySystemCount: galaxy.systems.length,
			starDotCount: detection.starDots.length,
			exactMatchCount: matchedSystems.length,
			nearMissCount: nearMisses.length,
			anomalousDotCount: anomalousDots.length,
			factionMismatchCount: matchedSystems.filter((m) => !m.factionMatch).length,
			chartAbsentSystemCount: chartAbsentSystems.length,
		},
		matchedSystems,
		nearMisses,
		anomalousDots,
		chartAbsentSystems,
	};
}

export function writeGalaxyManualCrosscheck(outPath) {
	const ledger = buildGalaxyManualCrosscheck();
	const target = outPath ?? join(SERVER_ROOT, "content", "generated", "logh7-galaxy-manual-crosscheck.json");
	writeFileSync(target, JSON.stringify(ledger, null, 1), "utf8");
	return { target, ledger };
}
