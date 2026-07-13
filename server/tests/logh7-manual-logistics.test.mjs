// logh7-manual-logistics.test.mjs — 공식 매뉴얼 물류 정본 데이터 계약

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const CONTENT = join(dirname(fileURLToPath(import.meta.url)), '..', 'content', 'manual');
const logistics = JSON.parse(readFileSync(join(CONTENT, 'logistics-economy.json'), 'utf8'));

test('할당 권한: 통합작전본부 제3차장은 네 부대 종류를 모두 담당한다', () => {
  const row = logistics.allocation.authorityTable.rows[2];

  assert.deepEqual(row.role, {
    ja: '統合作戦本部第三次長',
    en: 'Joint Operations HQ 3rd Deputy Chief',
    ko: '통합작전본부 제3차장',
  });
  assert.deepEqual(
    [row['艦隊'], row['巡察隊'], row['輸送艦隊'], row['地上部隊']],
    [true, true, true, true],
  );
  assert.equal(Object.hasOwn(row, '_uncertain'), false);
  assert.equal(Object.hasOwn(row, 'uncertainNote'), false);
});
