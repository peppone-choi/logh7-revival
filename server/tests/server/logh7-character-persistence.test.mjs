import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createCharacterStore } from "../../src/server/logh7-character-store.mjs";

// G062: 캐릭터 스토어 JSON 파일 영속 — 재기동 후에도 슬롯 유지, 파손 파일은 fail-closed.

function tempPath() {
	return join(mkdtempSync(join(tmpdir(), "logh7-chars-")), "characters.json");
}

test("characters survive a store restart via persistPath", () => {
	const persistPath = tempPath();
	const a = createCharacterStore({
		serverFaction: "empire",
		validFaces: new Set(["gem:1"]),
		persistPath,
	});
	const created = a.createCharacter({ accountId: "emp1", name: "로엔그람", faction: "empire", faceId: "gem:1" });
	assert.equal(created.ok, true);

	const b = createCharacterStore({
		serverFaction: "empire",
		validFaces: new Set(["gem:1"]),
		persistPath,
	});
	const slots = b.listCharacters("emp1");
	assert.equal(slots.length, 1);
	assert.equal(slots[0].name, "로엔그람");
	assert.equal(slots[0].characterId, created.character.characterId);
	rmSync(persistPath, { force: true });
});

test("persisted file is valid JSON keyed by account", () => {
	const persistPath = tempPath();
	const s = createCharacterStore({
		serverFaction: "empire",
		validFaces: new Set(["gem:1"]),
		persistPath,
	});
	s.createCharacter({ accountId: "emp1", name: "A", faction: "empire", faceId: "gem:1" });
	const raw = JSON.parse(readFileSync(persistPath, "utf8"));
	assert.ok(Array.isArray(raw.accounts.emp1));
	rmSync(persistPath, { force: true });
});

test("corrupt persist file fails closed at startup", () => {
	const persistPath = tempPath();
	writeFileSync(persistPath, "{corrupt", "utf8");
	assert.throws(() => createCharacterStore({
		serverFaction: "empire",
		validFaces: new Set(["gem:1"]),
		persistPath,
	}));
	rmSync(persistPath, { force: true });
});
