import assert from "node:assert/strict";
import test from "node:test";

import { buildGalaxyManualCrosscheck } from "../../src/server/logh7-galaxy-manual-crosscheck.mjs";

// G047: 매뉴얼 성계도 독립 재추출 vs galaxy.json 정량 대조 원장.
// 승격은 항상 차단(cross-source 확인 전) — 매뉴얼 축 단독으로 canonical이 되면 안 된다.

test("galaxy manual crosscheck ledger matches dots to cells without promotion", () => {
	const ledger = buildGalaxyManualCrosscheck();

	assert.equal(ledger.id, "logh7-galaxy-manual-crosscheck");
	assert.equal(ledger.canonicalPromotion, "blocked-until-cross-source-confirmed");
	assert.equal(ledger.status, "suspect-cross-check-required");

	// 현재 검출 evidence 기준의 정량 결과: 라벨 80(동맹40/제국39/페잔1),
	// dot 76, 정확 일치 68, 진영 불일치 0.
	assert.equal(ledger.chartLabelCounts.total, 80);
	assert.equal(ledger.summary.starDotCount, 76);
	assert.equal(ledger.summary.exactMatchCount, 68);
	assert.equal(ledger.summary.factionMismatchCount, 0);
	assert.equal(
		ledger.summary.exactMatchCount +
			ledger.summary.nearMissCount +
			ledger.summary.anomalousDotCount,
		ledger.summary.starDotCount,
	);

	// galaxy 85계 중 차트 라벨 부재 5계는 별도 증거 축이 필요함을 명시해야 한다.
	assert.equal(ledger.summary.galaxySystemCount, 85);
	assert.ok(ledger.chartAbsentSystems.length >= 5);
	for (const entry of ledger.chartAbsentSystems) {
		assert.equal(entry.needsOtherEvidenceAxis, true);
	}
});

test("galaxy manual crosscheck fails closed on malformed detection input", () => {
	const ledger = buildGalaxyManualCrosscheck({
		detection: { starDots: "not-an-array" },
	});
	assert.equal(ledger.status, "unreadable-detection-input");
	assert.equal(ledger.canonicalPromotion, "blocked-until-cross-source-confirmed");
	assert.equal(ledger.summary.exactMatchCount, 0);
});
