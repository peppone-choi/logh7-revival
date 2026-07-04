import assert from "node:assert/strict";
import test from "node:test";

import { createSessionHttpServer } from "../../src/server/logh7-session-http.mjs";
import { createSessionService, hashPassword } from "../../src/server/logh7-session-service.mjs";

// G057: lobby 계약 — 유효 토큰 필수, 계정별 캐릭터 슬롯 목록(초기 빈 목록) 반환.

async function withServer(fn) {
	const svc = createSessionService({
		accounts: [{ accountId: "emp1", passwordHash: hashPassword("pw-one") }],
	});
	const server = createSessionHttpServer({ sessionService: svc });
	await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
	const base = `http://127.0.0.1:${server.address().port}`;
	try {
		await fn(base);
	} finally {
		await new Promise((resolve) => server.close(resolve));
	}
}

test("GET /api/lobby requires a valid bearer token", async () => {
	await withServer(async (base) => {
		const noToken = await fetch(`${base}/api/lobby`);
		assert.equal(noToken.status, 401);
		const badToken = await fetch(`${base}/api/lobby`, {
			headers: { authorization: "Bearer deadbeef" },
		});
		assert.equal(badToken.status, 401);
	});
});

test("GET /api/lobby returns the account's character slots after login", async () => {
	await withServer(async (base) => {
		const login = await (await fetch(`${base}/api/login`, {
			method: "POST",
			body: JSON.stringify({ accountId: "emp1", password: "pw-one" }),
		})).json();
		const res = await fetch(`${base}/api/lobby`, {
			headers: { authorization: `Bearer ${login.token}` },
		});
		const body = await res.json();
		assert.equal(res.status, 200);
		assert.equal(body.ok, true);
		assert.equal(body.accountId, "emp1");
		assert.deepEqual(body.characterSlots, []);
	});
});
