// envelope-0030 자체검증 — 봉투 구조가 스펙(logh7-0030-protocol.md)대로인지 고정.
// 주의: 실클라 바이트 벡터(checksum 0x5517)는 리셋으로 evidence 소실 → 실측 대조는 라이브 검증(M2-B)에서.
// 여기서는 build↔parse 왕복·체크섬 거부·길이 가드의 내부 정합성만 증명한다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  build0030Body,
  parse0030Body,
  compute0030Checksum,
  frame0030,
  deframe0030,
  readInnerCode,
  TRANSPORT_CODE_0030,
} from '../src/server/logh7-envelope-0030.mjs';

test('build → parse 왕복: id/inner 보존', () => {
  const inner = Buffer.from([0x70, 0x00, 0x01, 0x02, 0x03]); // code 0x7000 + payload
  const body = build0030Body({ id: 7, inner });
  const parsed = parse0030Body(body);
  assert.equal(parsed.id, 7);
  assert.equal(parsed.innerLen, inner.length);
  assert.deepEqual(Buffer.from(parsed.inner), inner);
  assert.equal(readInnerCode(parsed.inner), 0x7000);
});

test('innerLen 이 홀수 tail(비-4배수)여도 체크섬 왕복', () => {
  // 6+innerLen 구간에 tail-byte 처리가 걸리도록 innerLen=3 (총 대상 9바이트 = dword2개+tail1)
  const body = build0030Body({ id: 0x11223344, inner: Buffer.from([0x00, 0x31, 0xab]) });
  assert.doesNotThrow(() => parse0030Body(body));
});

test('체크섬 변조 → parse throw', () => {
  const body = build0030Body({ id: 1, inner: Buffer.from([0xde, 0xad]) });
  body[0] ^= 0xff; // checksum 상위바이트 오염
  assert.throws(() => parse0030Body(body), /checksum/);
});

test('inner 바이트 변조 → 체크섬 불일치로 parse throw', () => {
  const body = build0030Body({ id: 1, inner: Buffer.from([0xde, 0xad, 0xbe]) });
  body[body.length - 1] ^= 0x01;
  assert.throws(() => parse0030Body(body), /checksum/);
});

test('innerLen 이 실제 가용치 초과 → parse throw', () => {
  const body = build0030Body({ id: 1, inner: Buffer.from([0x01, 0x02]) });
  body.writeUInt16BE(0xffff, 6); // innerLen 필드만 부풀림
  assert.throws(() => parse0030Body(body), /available/);
});

test('compute0030Checksum: 16비트 범위 + 결정적', () => {
  const body = build0030Body({ id: 0xcafebabe, inner: Buffer.from('GIN7test') });
  const innerLen = body.readUInt16BE(6);
  const c = compute0030Checksum(body, innerLen);
  assert.ok(c >= 0 && c <= 0xffff);
  assert.equal(c, compute0030Checksum(body, innerLen)); // 재현성
});

test('frame → deframe: len/code/encBody 복원', () => {
  const enc = Buffer.from([0xaa, 0xbb, 0xcc, 0xdd]); // 암호화 body 자리(여기선 임의)
  const frame = frame0030(enc);
  assert.equal(frame.readUInt16BE(0), 2 + enc.length);
  const { len, code, encBody } = deframe0030(frame);
  assert.equal(len, 2 + enc.length);
  assert.equal(code, TRANSPORT_CODE_0030);
  assert.deepEqual(Buffer.from(encBody), enc);
});
