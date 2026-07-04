// G054: Unity 클라이언트용 세션 서비스 (전송 무관 순수 로직).
// 보안 원칙: scrypt 해시, 상수시간 비교, 계정 존재 비노출 단일 오류 사유,
// 계정당 세션 1개(takeover 기본), 익명/전원 통과 모드 없음.
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const SCRYPT_KEYLEN = 32;

export function hashPassword(password, salt = randomBytes(16).toString("hex")) {
	const key = scryptSync(String(password), salt, SCRYPT_KEYLEN);
	return `${salt}:${key.toString("hex")}`;
}

function verifyPassword(password, passwordHash) {
	const [salt, expectedHex] = String(passwordHash).split(":");
	if (!salt || !expectedHex) {
		return false;
	}
	const expected = Buffer.from(expectedHex, "hex");
	const actual = scryptSync(String(password), salt, SCRYPT_KEYLEN);
	return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function createSessionService({ accounts } = {}) {
	if (!Array.isArray(accounts) || accounts.length === 0) {
		throw new Error("session service requires explicit account fixtures; anonymous mode is not supported");
	}
	const byId = new Map(accounts.map((a) => [a.accountId, a]));
	const sessionsByToken = new Map();
	const tokenByAccount = new Map();

	return {
		login({ accountId, password } = {}) {
			const account = byId.get(accountId);
			// 계정 미존재도 동일 사유/유사 비용으로 처리 (열거 방지)
			const ok = account ? verifyPassword(password, account.passwordHash) : (verifyPassword(password, "00:00"), false);
			if (!ok) {
				return { ok: false, reason: "invalid-credentials" };
			}
			const previous = tokenByAccount.get(accountId);
			if (previous) {
				sessionsByToken.delete(previous); // takeover 기본
			}
			const token = randomBytes(24).toString("hex");
			sessionsByToken.set(token, { accountId, createdAt: Date.now() });
			tokenByAccount.set(accountId, token);
			return { ok: true, accountId, token };
		},
		resolveSession(token) {
			if (typeof token !== "string") {
				return null;
			}
			return sessionsByToken.get(token) ?? null;
		},
	};
}
