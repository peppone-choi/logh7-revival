import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FACTION_CAPITAL } from '../../src/server/logh7-login-session.mjs';

// 진영 수도 시작 셀이 page-101 별점 재추출 좌표(content/galaxy.json canonCol/canonRow)와
// 표류하지 않도록 잠근다. 2026-06-21 정정 이전 (86,25)/(12,21) 같은 stale 좌표가 다시 끼면 실패한다.
const galaxy = JSON.parse(readFileSync(new URL('../../content/galaxy.json', import.meta.url), 'utf8'));
const sysByName = (name) => galaxy.systems.find((s) => s.system === name);

test('FACTION_CAPITAL 시작 셀이 galaxy.json 캐논 dot과 일치한다 (재추출 stale 방지)', () => {
  const valhalla = sysByName('ヴァルハラ'); // 제국 수도 オーディン
  const barlat = sysByName('バーラト'); // 동맹 수도 ハイネセン
  assert.ok(valhalla, 'ヴァルハラ가 galaxy.json에 존재한다');
  assert.ok(barlat, 'バーラト가 galaxy.json에 존재한다');
  assert.equal(valhalla.faction, 'empire');
  assert.equal(barlat.faction, 'alliance');
  assert.equal(FACTION_CAPITAL.empire.col, valhalla.canonCol);
  assert.equal(FACTION_CAPITAL.empire.row, valhalla.canonRow);
  assert.equal(FACTION_CAPITAL.alliance.col, barlat.canonCol);
  assert.equal(FACTION_CAPITAL.alliance.row, barlat.canonRow);
});

test('진영 수도 cellId(row*100+col)가 cave 인코딩과 정합한다', () => {
  const valhalla = sysByName('ヴァルハラ');
  const barlat = sysByName('バーラト');
  const empireCell = FACTION_CAPITAL.empire.row * 100 + FACTION_CAPITAL.empire.col;
  const allianceCell = FACTION_CAPITAL.alliance.row * 100 + FACTION_CAPITAL.alliance.col;
  assert.equal(empireCell, valhalla.canonRow * 100 + valhalla.canonCol);
  assert.equal(allianceCell, barlat.canonRow * 100 + barlat.canonCol);
  // strat-camera-focus cave는 제국 부트스트랩(power1) 기준 이 셀(2588=0xA1C)을 source+0x320에 기록한다.
  assert.equal(empireCell, 2588);
  assert.equal(allianceCell, 2014);
});
