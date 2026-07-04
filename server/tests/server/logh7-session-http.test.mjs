import assert from "node:assert/strict";
import test from "node:test";

import { createSessionHttpServer } from "../../src/server/logh7-session-http.mjs";
import { createSessionService, hashPassword } from "../../src/server/logh7-session-service.mjs";

// G054: HTTP 계약 테스트 — 실 포트 왕복으로 boot/login 라우트를 잠근다.

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

test("GET /api/boot reports export summary with promotion blocked", async () => {
	await withServer(async (base) => {
		const res = await fetch(`${base}/api/boot`);
		const body = await res.json();
		assert.equal(res.status, 200);
		assert.equal(body.ok, true);
		assert.ok(body.fileCount > 0);
		assert.equal(body.canonicalPromotion, "blocked-until-cross-source-confirmed");
	});
});

test("POST /api/login round-trips success and failure", async () => {
	await withServer(async (base) => {
		const ok = await fetch(`${base}/api/login`, {
			method: "POST",
			body: JSON.stringify({ accountId: "emp1", password: "pw-one" }),
		});
		const okBody = await ok.json();
		assert.equal(ok.status, 200);
		assert.equal(okBody.ok, true);
		assert.match(okBody.token, /^[a-f0-9]{48}$/);

		const bad = await fetch(`${base}/api/login`, {
			method: "POST",
			body: JSON.stringify({ accountId: "emp1", password: "nope" }),
		});
		assert.equal(bad.status, 401);
		assert.equal((await bad.json()).reason, "invalid-credentials");

		const malformed = await fetch(`${base}/api/login`, { method: "POST", body: "{" });
		assert.equal(malformed.status, 400);
	});
});
