import assert from "node:assert/strict";
import test from "node:test";

import { createSessionHttpServer } from "../../src/server/logh7-session-http.mjs";
import { createSessionService, hashPassword } from "../../src/server/logh7-session-service.mjs";

// G064: 커맨드 카탈로그 서빙 — 토큰 필수, 생성된 81커맨드 카탈로그를 그대로 서빙(권위=카탈로그).

async function withServer(fn) {
	const svc = createSessionService({
		accounts: [{ accountId: "emp1", passwordHash: hashPassword("pw-one") }],
	});
	const server = createSessionHttpServer({ sessionService: svc });
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

test("GET /api/commands requires a token", async () => {
	await withServer(async (base) => {
		assert.equal((await fetch(`${base}/api/commands`)).status, 401);
	});
});

test("GET /api/commands serves the generated 81-command catalog", async () => {
	await withServer(async (base, token) => {
		const res = await fetch(`${base}/api/commands`, {
			headers: { authorization: `Bearer ${token}` },
		});
		const body = await res.json();
		assert.equal(res.status, 200);
		assert.equal(body.ok, true);
		assert.equal(body.commandCount, 81);
		assert.equal(body.commands.length, 81);
		const warp = body.commands.find((c) => c.id === "operations-001");
		assert.equal(warp.nameJa, "ワープ航行");
		assert.equal(warp.cost.kind, "fixed");
		assert.equal(warp.cost.cp, 40);
		// 매뉴얼이 수치를 안 준 가변 CP는 unresolved로 정직 유지
		assert.ok(body.commands.some((c) => c.cost.kind !== "fixed"));
	});
});
