// 현지화 무결성 가드 (사용자 백로그: "클라 깨지는 텍스트 전부 수정"). cp949 한글이 cp932로 오판독돼 생긴
// mojibake가 추출 콘텐츠에 재유입되지 않도록 고정한다. docs/logh7-localization-audit.md의 P0 토큰 기준.
// 추출 파이프라인(tools/logh7_msgdat.py _correct_cp949_misread)이 회귀하면 본 가드가 잡는다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => readFileSync(join(REPO, rel), 'utf8');

// 고신뢰(P0) mojibake 지문 → 검증된 cp949 복원(audit (b) P0 표). 추출 회귀 시 이 지문이 다시 나타난다.
const HIGH_CONFIDENCE = [
  { moji: 'ｻ邀箍ｪ', ko: '사기값' },
  { moji: 'ｻ邀籠｡', ko: '사기치' },
  { moji: 'ﾀ邁昞ｮ', ko: '재고량' },
];
// 사용자-대면 추출 콘텐츠 파일(번역 데이터 아닌 추출 산출물).
const CONTENT_FILES = [
  'content/extracted/msgdat-full.json',
  'content/extracted/text-classified.json',
  'content/localization/constmsg-ko.json',
  'content/extracted/strings-index.json',
];

test('현지화: 고신뢰 mojibake 지문이 추출 콘텐츠에 잔존하지 않는다(cp949 복원 회귀 가드)', () => {
  for (const f of CONTENT_FILES) {
    const text = read(f);
    for (const { moji } of HIGH_CONFIDENCE) {
      assert.equal(text.includes(moji), false, `${f}: mojibake "${moji}" 잔존 — cp949 추출 회귀`);
    }
  }
});

test('현지화: 검증된 한글 토큰이 마스터 추출(msgdat-full)에 정확히 존재', () => {
  const text = read('content/extracted/msgdat-full.json');
  // audit (b): 사기값 1, 사기치 3중복(1707/1716/1857), 재고량 2중복(2160/2168). msgdat-full은 추가 1건 더 포함.
  assert.ok(text.includes('사기값'), '사기값 복원됨');
  assert.ok(text.includes('사기치'), '사기치 복원됨');
  assert.ok(text.includes('재고량'), '재고량 복원됨');
});

test('현지화: #1301(ﾀ釥邱ｮ)은 byte-손상 의심으로 보존 — 잔존 mojibake가 이 1건뿐인지 고정', () => {
  // audit (b): #1301은 원바이트 손상 가능성(medium) → 재추출 전 임의 복원 금지. 그래서 이 토큰은 의도적
  // 보존이며, "잔존 mojibake = 정확히 #1301 1건"임을 고정한다. 다른 mojibake가 생기면(이 외 토큰) 회귀.
  const text = read('content/extracted/text-classified.json');
  assert.equal((text.match(/ﾀ釥邱ｮ/g) || []).length, 1, '#1301 보존(정확히 1건)');
  for (const { moji } of HIGH_CONFIDENCE) {
    assert.equal(text.includes(moji), false, `text-classified: 고신뢰 mojibake "${moji}" 제거됨`);
  }
});
