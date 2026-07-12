// logh7-account-auth.mjs — 로그인 계정 검증 (fail-closed)
//
// 운영 경로: server/data/logh7-accounts.json (유저/서버 실데이터 경로와 동일)
// 형식: { "accounts": [ { "accountId": "inei00", "password": "dummy" }, ... ] }
// 또는 배열 단독. 비밀번호는 개발용 평문 비교(상수시간) — 프로덕션 scrypt 는 후속.

import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { timingSafeEqual } from 'node:crypto';

import { parseGin7CredentialInner, LOGIN_INNER_CODE } from './logh7-gin7-credential.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
/** 출하 서버 기본 계정 DB — 테스트 전용 경로가 아니라 실 서버 data/ */
export const DEFAULT_ACCOUNTS_PATH = join(HERE, '..', '..', 'data', 'logh7-accounts.json');
export const DEFAULT_CHARACTERS_PATH = join(HERE, '..', '..', 'data', 'logh7-characters.json');

/**
 * 계정 파일 로드. 없으면 기본 개발 계정(inei00/dummy) 시드.
 * @param {string} [accountsPath]
 * @param {{seedIfMissing?: boolean}} [options]
 * @returns {{ accounts: Array<{accountId:string,password:string}>, path: string }}
 */
export function loadAccountRegistry(accountsPath = DEFAULT_ACCOUNTS_PATH, { seedIfMissing = true } = {}) {
  const path = accountsPath;
  if (!existsSync(path)) {
    if (!seedIfMissing) {
      throw new Error(`accounts file required: ${path}`);
    }
    mkdirSync(dirname(path), { recursive: true });
    const seed = {
      accounts: [{ accountId: 'inei00', password: 'dummy' }],
      _note: 'LOGH VII revival dev accounts — replace passwords before any public deploy',
    };
    writeFileSync(path, JSON.stringify(seed, null, 2), 'utf8');
    return { accounts: seed.accounts.slice(), path };
  }
  const raw = JSON.parse(readFileSync(path, 'utf8'));
  const list = Array.isArray(raw) ? raw : raw.accounts;
  if (!Array.isArray(list)) {
    throw new Error(`invalid accounts file: ${path}`);
  }
  return {
    accounts: list.map((a) => ({
      accountId: String(a.accountId ?? a.account ?? ''),
      password: String(a.password ?? ''),
    })),
    path,
  };
}

function safeEqualString(a, b) {
  const ba = Buffer.from(String(a), 'utf8');
  const bb = Buffer.from(String(b), 'utf8');
  // 길이 다르면 패딩 비교로 타이밍 누수 완화 (완전하진 않음)
  if (ba.length !== bb.length) {
    const n = Math.max(ba.length, bb.length, 1);
    const pa = Buffer.alloc(n);
    const pb = Buffer.alloc(n);
    ba.copy(pa);
    bb.copy(pb);
    timingSafeEqual(pa, pb);
    return false;
  }
  return timingSafeEqual(ba, bb);
}

/**
 * GIN7 inner 를 파싱하고 계정 레지스트리와 대조.
 * @returns {{ ok: true, account: string, password: string } | { ok: false, reason: string, account?: string }}
 */
export function verifyGin7Login(inner, accountsPath = DEFAULT_ACCOUNTS_PATH) {
  let credential;
  try {
    credential = parseGin7CredentialInner(inner);
  } catch (error) {
    return { ok: false, reason: 'malformed-credential', detail: error.message };
  }
  if (credential.code !== LOGIN_INNER_CODE || credential.magic !== 'GIN7') {
    return { ok: false, reason: 'malformed-credential', account: credential.account };
  }
  if (!credential.account || credential.account.length === 0) {
    return { ok: false, reason: 'empty-account' };
  }
  const { accounts } = loadAccountRegistry(accountsPath);
  const entry = accounts.find((a) => a.accountId === credential.account);
  if (!entry) {
    // 존재 여부 노출 최소화: 동일 사유
    return { ok: false, reason: 'invalid-credentials', account: credential.account };
  }
  if (!safeEqualString(entry.password, credential.password)) {
    return { ok: false, reason: 'invalid-credentials', account: credential.account };
  }
  return { ok: true, account: credential.account, password: credential.password };
}
