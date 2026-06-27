// W1 signup-first 오라클 (2026-06-26).
//
// 목표: "accept-any 우회"가 아니라 진짜 회원가입 흐름이 운영 경로에서 정합하는지 확정한다.
//   adminCreate(회원가입) → SQLite 영속 → 서버 실엔트리 팩토리(createServeAuthAccountStore,
//   strict 기본) 재적재 → 클라가 보낼 byte-exact GIN7 블롭으로 strict 로그인 성공.
//   미등록·오답·빈값은 모두 거부(핸드오프 #2 strict 빈값 이슈 연관).
//
// 여기서 핵심은 logh7-server.mjs의 createServeAuthAccountStore를 직접 호출한다는 점이다
// (직접 createAccountStore 조립이 아니라 운영 서버가 쓰는 그 팩토리). 이로써 회원가입 CLI 쓰기와
// 라이브 서버 strict 스토어가 같은 파일에서 상호운용함을 증명한다.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { adminCreate } from '../../src/server/logh7-admin.mjs';
import { createServeAuthAccountStore } from '../../src/server/logh7-server.mjs';
import { buildGin7Credential } from '../../src/server/logh7-gin7-credential.mjs';

function freshDb() {
  const dir = mkdtempSync(path.join(tmpdir(), 'logh7-signup-'));
  return { dir, db: path.join(dir, 'accounts.sqlite') };
}

test('signup-first: 가입 계정은 운영 strict 팩토리에서 byte-exact 클라 블롭으로 로그인 성공', () => {
  const { dir, db } = freshDb();
  try {
    // 1) 회원가입(out-of-band): admin CLI / 신청 포털이 하는 일.
    assert.equal(adminCreate(db, 'inei00', 'dummy').ok, true);

    // 2) 운영 서버 실엔트리가 적재하는 그 팩토리로 strict 스토어 구성(acceptAnyGin7=false 고정).
    const store = createServeAuthAccountStore({ accountDbPath: db });

    // 3) 실제 클라가 같은 id/password로 보낼 byte-exact 0x7000 블롭.
    const auth = store.authenticate(buildGin7Credential({ account: 'inei00', password: 'dummy' }));
    assert.deepEqual(auth, { ok: true, account: 'inei00', matchedBy: 'password' });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('signup-first: 미등록 계정은 strict 운영 팩토리에서 거부(일반 사유, anti-enumeration)', () => {
  const { dir, db } = freshDb();
  try {
    assert.equal(adminCreate(db, 'inei00', 'dummy').ok, true);
    const store = createServeAuthAccountStore({ accountDbPath: db });
    const ghost = store.authenticate(buildGin7Credential({ account: 'ghost', password: 'dummy' }));
    assert.equal(ghost.ok, false);
    assert.equal(ghost.reason, 'authentication failed');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('signup-first: 등록 계정 오답은 거부(미등록과 동일 일반 사유)', () => {
  const { dir, db } = freshDb();
  try {
    assert.equal(adminCreate(db, 'inei00', 'dummy').ok, true);
    const store = createServeAuthAccountStore({ accountDbPath: db });
    const wrong = store.authenticate(buildGin7Credential({ account: 'inei00', password: 'WRONG' }));
    const missing = store.authenticate(buildGin7Credential({ account: 'ghost', password: 'dummy' }));
    assert.equal(wrong.ok, false);
    assert.equal(wrong.reason, 'authentication failed');
    assert.equal(missing.reason, 'authentication failed'); // 두 사유가 동일해야(계정 존재 누출 방지)
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('signup-first 빈값: 빈 계정 id / 빈 password는 회원가입 단계에서 거부', () => {
  const { dir, db } = freshDb();
  try {
    assert.deepEqual(adminCreate(db, '', 'pw'), { ok: false, reason: 'account id is required' });
    assert.deepEqual(adminCreate(db, 'foo', ''), { ok: false, reason: 'password is required' });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('signup-first 빈값: 빈/쓰레기 자격증명 블롭은 strict 로그인에서 거부', () => {
  const { dir, db } = freshDb();
  try {
    assert.equal(adminCreate(db, 'inei00', 'dummy').ok, true);
    const store = createServeAuthAccountStore({ accountDbPath: db });
    // 빈 버퍼·쓰레기는 GIN7 형식 자체를 통과 못 함.
    assert.equal(store.authenticate(Buffer.alloc(0)).ok, false);
    assert.equal(store.authenticate(Buffer.from([1, 2, 3])).ok, false);
    // 빈 password로 만든 잘 형성된 블롭(다른 계정)도 미등록이라 거부.
    assert.equal(store.authenticate(buildGin7Credential({ account: 'inei00', password: '' })).ok, false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('signup-first strict 기본: account DB 미지정이면 가입 전엔 모든 자격증명 거부(accept-any 폴백 없음)', () => {
  // accountDbPath=null => strict 기본, 시드 없음 => 무엇도 통과 못 함.
  const store = createServeAuthAccountStore({ accountDbPath: null });
  const auth = store.authenticate(buildGin7Credential({ account: 'inei00', password: 'dummy' }));
  assert.equal(auth.ok, false);
  assert.equal(auth.reason, 'credential not registered');
});
