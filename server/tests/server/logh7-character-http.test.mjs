import assert from "node:assert/strict";
import test from "node:test";

import { createCharacterStore } from "../../src/server/logh7-character-store.mjs";
import { createSessionHttpServer } from "../../src/server/logh7-session-http.mjs";
import { createSessionService, hashPassword } from "../../src/server/logh7-session-service.mjs";

// G058: 캐릭터 생성 HTTP 계약 — 토큰 필수, 검증 실패 422, 생성 후 lobby에 반영.

async function withServer(fn) {
	const svc = createSessionService({
		accounts: [{ accountId: "emp1", passwordHash: hashPassword("pw-one") }],
	});
	const store = createCharacterStore({
		serverFaction: "empire",
		validFaces: new Set(["gem:1", "gem:2"]),
	});
	const server = createSessionHttpServer({ sessionService: svc, characterStore: store });
	await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
	const base = `http://127.0.0.1:${server.address().port}`;
	try {
		const login = await (await fetch(`${base}/api/login`, {
			method: "POST",
			body: JSON.stringify({ accountId: "emp1", password: "pw-one" }),
		})).json();
		await fn(base, login.token);
	} finally {
		await new Promise((resolve) => server.close(resolve));
	}
}

test("character creation requires a session token", async () => {
	await withServer(async (base) => {
		const res = await fetch(`${base}/api/characters`, {
			method: "POST",
			body: JSON.stringify({ name: "A", faction: "empire", faceId: "gem:1" }),
		});
		assert.equal(res.status, 401);
	});
});

test("creates a character and lists it in the lobby", async () => {
	await withServer(async (base, token) => {
		const headers = { authorization: `Bearer ${token}` };
		const create = await fetch(`${base}/api/characters`, {
			method: "POST", headers,
			body: JSON.stringify({ name: "로엔그람", faction: "empire", faceId: "gem:1" }),
		});
		const created = await create.json();
		assert.equal(create.status, 200);
		assert.equal(created.ok, true);
		assert.equal(created.character.name, "로엔그람");

		const lobby = await (await fetch(`${base}/api/lobby`, { headers })).json();
		assert.equal(lobby.characterSlots.length, 1);
		assert.equal(lobby.characterSlots[0].name, "로엔그람");
	});
});

test("validation failures return 422 with the store reason", async () => {
	await withServer(async (base, token) => {
		const headers = { authorization: `Bearer ${token}` };
		const res = await fetch(`${base}/api/characters`, {
			method: "POST", headers,
			body: JSON.stringify({ name: "양웬리", faction: "alliance", faceId: "gem:1" }),
		});
		assert.equal(res.status, 422);
		assert.equal((await res.json()).reason, "faction-not-served");
	});
});
