import assert from "node:assert/strict";
import test from "node:test";

import {
	FLAGSHIP_ENERGY_CHANNELS,
	evaluateRetreatEnergyGate,
} from "../../src/server/logh7-flagship-energy-rules.mjs";

// 매뉴얼 p24(操艦パネル) 근거: 기함 에너지 6채널, 철퇴는 WARP 최대 배분 필요.
// 총 에너지량 수치는 매뉴얼에 명시 없음 → 수치 시뮬레이션은 구현하지 않는다.

test("energy channels follow manual p24", () => {
	assert.deepEqual(FLAGSHIP_ENERGY_CHANNELS, [
		"BEAM",
		"GUN",
		"SHIELD",
		"ENGINE",
		"WARP",
		"SENSOR",
	]);
});

test("retreat gate requires WARP at max allocation", () => {
	assert.deepEqual(evaluateRetreatEnergyGate({ warpAllocation: "max" }), {
		outcome: "retreat-energy-ready",
	});
	assert.deepEqual(evaluateRetreatEnergyGate({ warpAllocation: "partial" }), {
		outcome: "blocked-warp-not-max",
		requirement: "WARP allocation must be at maximum to warp out (manual p24)",
	});
	assert.deepEqual(evaluateRetreatEnergyGate({}), {
		outcome: "blocked-warp-not-max",
		requirement: "WARP allocation must be at maximum to warp out (manual p24)",
	});
});

test("retreat gate rejects unknown allocation values", () => {
	assert.equal(
		evaluateRetreatEnergyGate({ warpAllocation: "overdrive" }).outcome,
		"blocked-warp-not-max",
	);
});
