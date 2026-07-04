import assert from "node:assert/strict";
import test from "node:test";

import { createCharacterStore } from "../../src/server/logh7-character-store.mjs";
import { createSessionHttpServer } from "../../src/server/logh7-session-http.mjs";
import { createSessionService, hashPassword } from "../../src/server/logh7-session-service.mjs";

// G060: world-entry 계약 — 본인 캐릭터로만 진입, 갤럭시 데이터는 suspect 라벨 유지.

async function withServer(fn) {
	const svc = createSessionService({
		accounts: [{ accountId: "emp1", passwordHash: hashPassword("pw-one") }],
	});
	const store = createCharacterStore({
		serverFaction: "empire",
		validFaces: new Set(["gem:1"]),
	});
	const server = createSessionHttpServer({ sessionService: svc, characterStore: store });
	await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
	const base = `http://127.0.0.1:${server.address().port}`;
	try {
		const login = await (await fetch(`${base}/api/login`, {
			method: "POST",
			body: JSON.stringify({ accountId: "emp1", password: "pw-one" }),
		})).json();
		await fn(base, login.token, store);
	} finally {
		await new Promise((resolve) => server.close(resolve));
	}
}

test("world entry requires a session token and an owned character", async () => {
	await withServer(async (base, token) => {
		const noToken = await fetch(`${base}/api/world/enter`, {
			method: "POST",
			body: JSON.stringify({ characterId: "x" }),
		});
		assert.equal(noToken.status, 401);

		const unknown = await fetch(`${base}/api/world/enter`, {
			method: "POST",
			headers: { authorization: `Bearer ${token}` },
			body: JSON.stringify({ characterId: "not-mine" }),
		});
		assert.equal(unknown.status, 422);
		assert.equal((await unknown.json()).reason, "character-not-owned");
	});
});

test("world entry returns a suspect-labeled world session for an owned character", async () => {
	await withServer(async (base, token, store) => {
		const created = store.createCharacter({
			accountId: "emp1", name: "로엔그람", faction: "empire", faceId: "gem:1",
		});
		const res = await fetch(`${base}/api/world/enter`, {
			method: "POST",
			headers: { authorization: `Bearer ${token}` },
			body: JSON.stringify({ characterId: created.character.characterId }),
		});
		const body = await res.json();
		assert.equal(res.status, 200);
		assert.equal(body.ok, true);
		assert.equal(body.worldSession.characterId, created.character.characterId);
		assert.equal(body.worldSession.faction, "empire");
		assert.equal(body.worldSession.galaxyStatus, "suspect-cross-check-required");
		assert.equal(body.worldSession.galaxySource, "streaming-assets:generated/galaxy.json");
		assert.ok(body.worldSession.systemCount >= 80, "system count from real galaxy.json");
	});
});
