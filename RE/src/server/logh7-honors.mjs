// 훈장(叙勲/勲章) — Phase B §B5 4.3.
// 캐논: 원작은 叙勲(훈장)이 未実装 → 계급 사다리 비교자의 "법칙3(훈장)"은 SKIP한다. 따라서 이 모듈은 훈장
// 상태(0x0356 decoration_bits 비트필드)만 다루고, 계급 서열 비교에는 쓰이지 않는다(law3 skip 준수).
// 어떤 훈장이 어느 비트인지 캐논 미상 → 비트 인덱스(0..31)는 **SERVER DESIGN**. 순수 비트 연산만 제공.

export const MAX_DECORATION_BITS = 32; // 0x0356 decoration_bits는 u32(32비트) 가정

const norm = (bits) => (Number(bits) || 0) >>> 0;
const validIndex = (index) => Number.isInteger(index) && index >= 0 && index < MAX_DECORATION_BITS;

/** 훈장 비트 부여(set). 잘못된 인덱스는 무시(원본 비트 반환). */
export function awardDecoration(bits, index) {
  if (!validIndex(index)) return norm(bits);
  return (norm(bits) | (1 << index)) >>> 0;
}

/** 훈장 비트 박탈(clear). */
export function revokeDecoration(bits, index) {
  if (!validIndex(index)) return norm(bits);
  return (norm(bits) & ~(1 << index)) >>> 0;
}

/** 특정 훈장 보유 여부. */
export function hasDecoration(bits, index) {
  if (!validIndex(index)) return false;
  return (norm(bits) & (1 << index)) !== 0;
}

/** 보유 훈장 개수(popcount). */
export function decorationCount(bits) {
  let v = norm(bits);
  let count = 0;
  while (v) {
    v &= v - 1;
    count += 1;
  }
  return count;
}

/** 보유 훈장 비트 인덱스 목록(오름차순). */
export function decorationList(bits) {
  const v = norm(bits);
  const out = [];
  for (let i = 0; i < MAX_DECORATION_BITS; i += 1) {
    if (v & (1 << i)) out.push(i);
  }
  return out;
}
