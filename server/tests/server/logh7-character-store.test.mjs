import assert from "node:assert/strict";
import test from "node:test";

import { createCharacterStore } from "../../src/server/logh7-character-store.mjs";

// G058: 서버 권위 캐릭터 스토어.
// 근거: 매뉴얼 p8(서버당 제국/동맹 한쪽 진영만), face G군=플레이어 생성용(O군=원작 전용),
// 진짜게임 요구(계정 내 별개 이름의 복수 캐릭터).

function store(overrides = {}) {
	return createCharacterStore({
		serverFaction: "empire",
		// 테스트 픽스처: 실제 카탈로그 대신 최소 유효 얼굴 집합 주입
		validFaces: new Set(["gem:1", "gem:2", "gef:1"]),
		...overrides,
	});
}

test("creates a character with a valid G-group face and server faction", () => {
	const s = store();
	const res = s.createCharacter({ accountId: "emp1", name: "로엔그람", faction: "empire", faceId: "gem:1" });
	assert.equal(res.ok, true);
	assert.equal(res.character.name, "로엔그람");
	const slots = s.listCharacters("emp1");
	assert.equal(slots.length, 1);
	assert.equal(slots[0].occupied, true);
});

test("rejects the opposite faction per manual p8 server rule", () => {
	const s = store();
	const res = s.createCharacter({ accountId: "emp1", name: "양웬리", faction: "alliance", faceId: "gem:1" });
	assert.equal(res.ok, false);
	assert.equal(res.reason, "faction-not-served");
});

test("rejects non-player face ids", () => {
	const s = store();
	assert.equal(s.createCharacter({ accountId: "emp1", name: "a", faction: "empire", faceId: "oam:1" }).reason, "invalid-face");
	assert.equal(s.createCharacter({ accountId: "emp1", name: "a", faction: "empire", faceId: "gem:999" }).reason, "invalid-face");
});

test("rejects duplicate character names within an account", () => {
	const s = store();
	assert.equal(s.createCharacter({ accountId: "emp1", name: "키르히아이스", faction: "empire", faceId: "gem:1" }).ok, true);
	assert.equal(s.createCharacter({ accountId: "emp1", name: "키르히아이스", faction: "empire", faceId: "gem:2" }).reason, "duplicate-name");
});

test("rejects empty or oversized names", () => {
	const s = store();
	assert.equal(s.createCharacter({ accountId: "emp1", name: "", faction: "empire", faceId: "gem:1" }).reason, "invalid-name");
	assert.equal(s.createCharacter({ accountId: "emp1", name: "가".repeat(33), faction: "empire", faceId: "gem:1" }).reason, "invalid-name");
});

test("distinct accounts keep distinct slot lists", () => {
	const s = store();
	s.createCharacter({ accountId: "emp1", name: "A", faction: "empire", faceId: "gem:1" });
	assert.deepEqual(s.listCharacters("emp2"), []);
});
