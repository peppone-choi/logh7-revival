// 기함 에너지 배분 룰 (매뉴얼 p24 操艦パネル, P1).
// 총 에너지량 수치는 매뉴얼에 명시가 없으므로 배분 시뮬레이션은 구현하지 않는다.
// 명시된 규칙만 게이트로 제공: 철퇴(warp-out)는 WARP 채널 최대 배분이 필요.

export const FLAGSHIP_ENERGY_CHANNELS = Object.freeze([
	"BEAM",
	"GUN",
	"SHIELD",
	"ENGINE",
	"WARP",
	"SENSOR",
]);

export function evaluateRetreatEnergyGate({ warpAllocation } = {}) {
	if (warpAllocation === "max") {
		return { outcome: "retreat-energy-ready" };
	}
	return {
		outcome: "blocked-warp-not-max",
		requirement: "WARP allocation must be at maximum to warp out (manual p24)",
	};
}
