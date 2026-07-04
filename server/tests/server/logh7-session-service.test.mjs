import assert from "node:assert/strict";
import test from "node:test";

import { createSessionService, hashPassword } from "../../src/server/logh7-session-service.mjs";

// G054: Unity 클라이언트용 첫 세션 서비스(HTTP/JSON 전송 전제의 순수 로직).
// 과거 교훈 반영: 익명/무조건 통과 금지(strict 기본), 계정당 세션 1개(takeover 기본),
// 오류 사유는 계정 존재 여부를 노출하지 않는 단일 사유로 통일.

function fixtureAccounts() {
	return [
		{ accountId: "emp1", passwordHash: hashPassword("secret-one") },
		{ accountId: "all1", passwordHash: hashPassword("secret-two") },
	];
}

test("login succeeds with correct credentials and issues a token", () => {
	const svc = createSessionService({ accounts: fixtureAccounts() });
	const res = svc.login({ accountId: "emp1", password: "secret-one" });
	assert.equal(res.ok, true);
	assert.equal(res.accountId, "emp1");
	assert.match(res.token, /^[a-f0-9]{48}$/);
});

test("login fails closed on wrong password and unknown account with the same reason", () => {
	const svc = createSessionService({ accounts: fixtureAccounts() });
	const bad = svc.login({ accountId: "emp1", password: "wrong" });
	const unknown = svc.login({ accountId: "nobody", password: "wrong" });
	assert.equal(bad.ok, false);
	assert.equal(unknown.ok, false);
	assert.equal(bad.reason, unknown.reason);
	assert.equal(bad.reason, "invalid-credentials");
});

test("second login for the same account takes over the previous session", () => {
	const svc = createSessionService({ accounts: fixtureAccounts() });
	const first = svc.login({ accountId: "emp1", password: "secret-one" });
	const second = svc.login({ accountId: "emp1", password: "secret-one" });
	assert.equal(second.ok, true);
	assert.equal(svc.resolveSession(first.token), null, "first session must be invalidated");
	assert.equal(svc.resolveSession(second.token)?.accountId, "emp1");
});

test("resolveSession rejects unknown or malformed tokens", () => {
	const svc = createSessionService({ accounts: fixtureAccounts() });
	assert.equal(svc.resolveSession("deadbeef"), null);
	assert.equal(svc.resolveSession(undefined), null);
});

test("service refuses empty account fixtures instead of accepting anyone", () => {
	assert.throws(() => createSessionService({ accounts: [] }));
});
