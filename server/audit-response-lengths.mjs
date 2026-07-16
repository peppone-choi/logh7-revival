#!/usr/bin/env node
/**
 * LOGH VII 서버 정적정보 워크 응답 감사
 * 클라이언트 프레이밍 테이블(코드→고정크기)과 서버 emit 길이 비교
 */

import {
  buildResponseTimeInner,
  buildEmptyWalkerInner,
  buildStaticInformationGridTypeInner,
  buildStaticInformationGridInner,
  buildInformationCharacterInner,
  DEFAULT_SECTOR_GRID_TYPES,
  STATIC_INFO_BODY_SIZES,
  msg32Body,
  readMsg32Code,
} from './src/server/logh7-world-records.mjs';

// 클라이언트 기대값 (RE 확정, 이게 정답)
const CLIENT_EXPECTED = {
  0x0301: 4,
  0x0305: 20994,  // 0x520a
  0x0307: 58802,  // 0xe5b2
  0x0309: 1372,   // 0x55c
  0x030b: 28004,  // 0x6d64
  0x030d: 388,    // 0x184
  0x030f: 52,     // 0x34
  0x0311: 432,    // 0x1b0
  0x0313: 5004,   // 0x138c
  0x0315: 5004,   // 0x138c
  0x031d: 20996,  // 0x520c
  0x0323: 724,    // 0x2d4
};

// 빌더 팩토리
function buildResponse(code) {
  switch (code) {
    case 0x0301:
      return buildResponseTimeInner();
    case 0x0305:
    case 0x0307:
    case 0x0309:
    case 0x030b:
    case 0x030d:
    case 0x030f:
    case 0x0311:
    case 0x031d:
      return buildEmptyWalkerInner(code);
    case 0x0313:
      return buildStaticInformationGridTypeInner({ objects: DEFAULT_SECTOR_GRID_TYPES });
    case 0x0315:
      return buildStaticInformationGridInner({ cells: [] });
    case 0x0323:
      return buildInformationCharacterInner({ characterId: 1, gridUnitId: 1 });
    default:
      return null;
  }
}

// 감사 실행
const codes = [0x0301, 0x0305, 0x0307, 0x0309, 0x030b, 0x030d, 0x030f, 0x0311, 0x0313, 0x0315, 0x031d, 0x0323];
const results = [];
const mismatches = [];

console.log('\n─── LOGH VII 정적정보 워크 응답 길이 감사 ───\n');

for (const code of codes) {
  const inner = buildResponse(code);
  if (!inner) {
    console.error(`❌ 빌더 실패: 0x${code.toString(16).padStart(4, '0')}`);
    continue;
  }

  const innerLen = inner.length;                     // (a) msg32 inner 전체
  const bodyLen = msg32Body(inner).length;            // (b) body-only
  const declaredLen = STATIC_INFO_BODY_SIZES[code];   // (c) 선언값
  const expectedLen = CLIENT_EXPECTED[code];          // 클라 기대값

  const codeHex = `0x${code.toString(16).padStart(4, '0')}`;
  const match = bodyLen === expectedLen ? '✓' : '✗';

  results.push({
    code: codeHex,
    clientExpected: expectedLen,
    emitBody: bodyLen,
    emitInner: innerLen,
    declared: declaredLen,
    match,
  });

  if (bodyLen !== expectedLen) {
    mismatches.push({
      code: codeHex,
      expectedLen,
      actualBodyLen: bodyLen,
      actualInnerLen: innerLen,
      declaredLen,
    });
  }
}

// 표 출력
console.log('코드     | 클라기대값 | emit body | emit inner | 선언값 | 일치');
console.log('---------|-----------|-----------|-----------|--------|----');

for (const r of results) {
  const declared = r.declared !== undefined ? r.declared.toString() : '-';
  console.log(
    `${r.code} | ${String(r.clientExpected).padStart(9)} | ${String(r.emitBody).padStart(9)} | ${String(r.emitInner).padStart(10)} | ${declared.padStart(6)} | ${r.match}`,
  );
}

// 불일치 상세 분석
if (mismatches.length > 0) {
  console.log('\n─── 불일치하는 코드 ───\n');
  for (const m of mismatches) {
    console.log(`${m.code}:`);
    console.log(`  클라 기대값:  ${m.expectedLen} (0x${m.expectedLen.toString(16).padStart(4, '0')})`);
    console.log(`  emit body:    ${m.actualBodyLen} (0x${m.actualBodyLen.toString(16).padStart(4, '0')})`);
    console.log(`  emit inner:   ${m.actualInnerLen} (0x${m.actualInnerLen.toString(16).padStart(4, '0')})`);
    console.log(`  선언값:        ${m.declaredLen !== undefined ? m.declaredLen + ' (0x' + m.declaredLen.toString(16) + ')' : '-'}`);
    console.log();
  }
} else {
  console.log('\n✓ 모든 응답 길이가 클라 기대값과 일치합니다.\n');
}

// 길이 해석 검증
console.log('─── 길이 해석 결론 ───');
console.log('클라 테이블이 기대하는 것은: body-only 길이 (msg32 6바이트 헤더 제외)');
console.log('(msg32 = [u32 LE 0][u16 BE code][body], 헤더 = 첫 6바이트)\n');
