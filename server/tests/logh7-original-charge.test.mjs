// logh7-original-charge.test.mjs — 0x1006 오리지널 캐릭터 추첨(charge) 왕복
//
// 빈 계정 → item2 オリジナルキャラクター抽選 → 0x1006 → 캐릭터 획득 →
// 0x2003 재요청 → 0x2004 body[0]≥1 로 로비 해제. 이 흐름의 서버측을 검증한다.
// 근거: docs/logh7-m2-character-creation-flow.md §4·§5

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { handleLobbyInner } from '../src/server/logh7-lobby-session.mjs';
import { createCharacterStore } from '../src/server/logh7-character-store.mjs';
import {
  CODE_CMD_ORIGINAL_CHARGE,
  CODE_LOBBY_REQ_INFO_CHAR,
  CODE_LOBBY_RESP_INFO_CHAR,
  decodeOriginalCharReq,
} from '../src/server/logh7-character-codec.mjs';
import {
  ORIGINAL_CANDIDATE_IDS,
  getOriginalCandidate,
} from '../src/server/logh7-original-candidates.mjs';
// scenario-session 이 후보 풀을 그대로 실어주는지(정합) 확인용 재수출.
import { ORIGINAL_CANDIDATE_IDS as SESSION_CANDIDATE_IDS } from '../src/server/codec/scenario-session.mjs';

function makeTmpStore() {
  const dir = mkdtempSync(join(tmpdir(), 'logh7-orig-'));
  return createCharacterStore(join(dir, 'chars.json'));
}

/** C→S inner: [u16 BE code][body] */
function makeInner(code, body = Buffer.alloc(0)) {
  const buf = Buffer.allocUnsafe(2 + body.length);
  buf.writeUInt16BE(code, 0);
  body.copy(buf, 2);
  return buf;
}

/** C→S 0x1006 body: [u32LE count][u32LE id×5] (24B 고정) */
function makeOriginalChargeBody(ids) {
  const body = Buffer.alloc(24);
  body.writeUInt32LE(ids.length, 0);
  for (let i = 0; i < ids.length && i < 5; i++) {
    body.writeUInt32LE(ids[i] >>> 0, 4 + i * 4);
  }
  return body;
}

function readResponseCode(resp) {
  assert.equal(resp.readUInt32LE(0), 0, 'message32 prefix must be 0');
  return resp.readUInt16BE(4);
}

// ─── 후보 풀 정합 ────────────────────────────────────────────────────────────

test('0x2006 세션 후보 id 풀 == 오리지널 후보 풀 (정합)', () => {
  assert.ok(ORIGINAL_CANDIDATE_IDS.length >= 1, '후보가 최소 1개는 있어야 함');
  assert.deepEqual(SESSION_CANDIDATE_IDS, ORIGINAL_CANDIDATE_IDS,
    'scenario-session 이 광고하는 후보 id 는 후보 풀과 동일해야 함');
});

// ─── 디코드: 확정 레이아웃 [count][id×5] ─────────────────────────────────────

test('decodeOriginalCharReq — count + charIds 파싱 (확정 레이아웃)', () => {
  const candId = ORIGINAL_CANDIDATE_IDS[0];
  const inner = makeInner(CODE_CMD_ORIGINAL_CHARGE, makeOriginalChargeBody([candId]));
  const { count, charIds } = decodeOriginalCharReq(inner);
  assert.equal(count, 1);
  assert.deepEqual(charIds, [candId]);
});

// ─── (a) 빈 계정에 0x1006 charge → 스토어에 캐릭터 1개 ────────────────────────

test('0x1006 charge — 빈 계정에 후보 캐릭터 1개 생성·영속', () => {
  const store = makeTmpStore();
  assert.equal(store.getCharacters('acc1').length, 0, '시작은 빈 계정');

  const candId = ORIGINAL_CANDIDATE_IDS[0];
  const inner = makeInner(CODE_CMD_ORIGINAL_CHARGE, makeOriginalChargeBody([candId]));
  handleLobbyInner(inner, 'acc1', store);

  const chars = store.getCharacters('acc1');
  assert.equal(chars.length, 1, 'charge 후 캐릭터 1개');
  assert.equal(chars[0].candidateId, candId, '후보 id 로 매핑된 캐릭터');
  const cand = getOriginalCandidate(candId);
  assert.equal(chars[0].power, cand.power, '후보 풀의 진영이 실림');
});

// ─── (b) 0x1006 응답 = 24B 형식 echo ─────────────────────────────────────────

test('0x1006 응답 — code 0x1006 + body 24B echo', () => {
  const store = makeTmpStore();
  const candId = ORIGINAL_CANDIDATE_IDS[0];
  const inner = makeInner(CODE_CMD_ORIGINAL_CHARGE, makeOriginalChargeBody([candId]));
  const resp = handleLobbyInner(inner, 'acc1', store);

  assert.equal(readResponseCode(resp), CODE_CMD_ORIGINAL_CHARGE);
  assert.equal(resp.length, 6 + 24, 'message32 inner = 6 헤더 + 24 body');
  assert.equal(resp.readUInt32LE(6), 1, 'echo count=1');
  assert.equal(resp.readUInt32LE(10), candId, 'echo id0=후보id');
});

// ─── (c) charge 후 0x2003 → 0x2004 body[0]==1 + 그 캐릭터 ─────────────────────

test('charge 후 0x2003 → 0x2004 body[0]==1 (로비 해제 트리거)', () => {
  const store = makeTmpStore();
  const candId = ORIGINAL_CANDIDATE_IDS[0];

  // charge
  handleLobbyInner(
    makeInner(CODE_CMD_ORIGINAL_CHARGE, makeOriginalChargeBody([candId])),
    'acc1', store,
  );

  // 0x2003 재요청 → 0x2004
  const resp = handleLobbyInner(makeInner(CODE_LOBBY_REQ_INFO_CHAR), 'acc1', store);
  assert.equal(readResponseCode(resp), CODE_LOBBY_RESP_INFO_CHAR);
  const body = resp.subarray(6);
  assert.equal(body[0], 1, '0x2004 body[0] = 캐릭터 count 1 → 로비 잠금 해제');
});

// ─── 다중 선택 + 미지의 id 무시 ──────────────────────────────────────────────

test('0x1006 charge — count=2 두 후보 charge', () => {
  const store = makeTmpStore();
  const ids = ORIGINAL_CANDIDATE_IDS.slice(0, 2);
  handleLobbyInner(
    makeInner(CODE_CMD_ORIGINAL_CHARGE, makeOriginalChargeBody(ids)),
    'acc1', store,
  );
  assert.equal(store.getCharacters('acc1').length, ids.length);
});

test('0x1006 charge — 후보 풀에 없는 id 는 무시(스토어 미변경)', () => {
  const store = makeTmpStore();
  const bogus = 0x7fffffff;
  const resp = handleLobbyInner(
    makeInner(CODE_CMD_ORIGINAL_CHARGE, makeOriginalChargeBody([bogus])),
    'acc1', store,
  );
  // 형식(24B)만 맞으면 클라는 성공 처리 → 응답은 여전히 24B echo
  assert.equal(resp.length, 6 + 24);
  assert.equal(store.getCharacters('acc1').length, 0, '미지의 후보는 charge 안 됨');
});
