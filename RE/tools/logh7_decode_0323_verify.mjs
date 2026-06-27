// 0x0323 ResponseInformationCharacter 바이트레벨 왕복 검증.
// 서버 빌더(buildInformationCharacterRecordInner)로 실필드를 채운 레코드를 생성하고,
// RE 확정 오프셋(docs/logh7-info-records-wire.md)으로 다시 디코드해 입력==디코드 바이트 정합을 확인.
// = "서버 송신 데이터 생성/연결" + "수신 데이터(클라 파서가 읽는 오프셋) 바이트 검증".
import { buildInformationCharacterRecordInner } from '../src/server/logh7-login-protocol.mjs';

const input = {
  characterId: 2, gridUnitId: 1, power: 1, spot: 2588, spotOwner: 1,
  fame: 5000, pcp: 85, mcp: 88, money: 1000000, influence: 50, stamina: 100,
  // 統率/政治/運用/情報(PCP) + 指揮/機動/攻撃/防御(MCP)
  abilities: [95, 72, 90, 88, 99, 85, 96, 80],
};
const inner = buildInformationCharacterRecordInner(input);
const p = inner.subarray(6); // 6B 헤더 뒤 = 레코드 payload

const u8 = (o) => p.readUInt8(o);
const u16 = (o) => p.readUInt16LE(o);
const u32 = (o) => p.readUInt32LE(o);

const checks = [
  ['id @0x00 (u32)', u32(0x00), input.characterId],
  ['power/陣営 @0x04 (u8)', u8(0x04), input.power],
  ['fame @0x10 (u32)', u32(0x10), input.fame],
  ['spot/현재성계 @0x1c (u32)', u32(0x1c), input.spot],
  ['spotOwner @0x20 (u32)', u32(0x20), input.spotOwner],
  ['flagship/gridUnit @0x24 (u32)', u32(0x24), input.gridUnitId],
  ['pcp @0x50 (u32)', u32(0x50), input.pcp],
  ['mcp @0x54 (u32)', u32(0x54), input.mcp],
  ['money @0x68 (u32)', u32(0x68), input.money],
  ['ability0 統率 @0x188 (u16)', u16(0x188), input.abilities[0]],
  ['ability3 情報 @0x194 (u16)', u16(0x188 + 3 * 4), input.abilities[3]],
  ['ability4 指揮 @0x198 (u16)', u16(0x188 + 4 * 4), input.abilities[4]],
  ['ability7 防御 @0x1a4 (u16)', u16(0x188 + 7 * 4), input.abilities[7]],
  ['influence @0x1a8 (u8)', u8(0x1a8), input.influence],
  ['stamina/체력 @0x1a9 (u8)', u8(0x1a9), input.stamina],
];

let pass = 0;
console.log(`0x0323 record total bytes (payload) = ${p.length} (expect 724=0x2d4): ${p.length === 0x2d4 ? 'OK' : 'MISMATCH'}`);
console.log('field byte-level verification (server-built vs RE client-parser offset):');
for (const [name, got, exp] of checks) {
  const ok = got === exp;
  if (ok) pass += 1;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}: got=${got} expect=${exp}`);
}
console.log(`\n${pass}/${checks.length} fields byte-correct; record size ${p.length === 0x2d4 ? 'correct' : 'WRONG'}`);
// 핵심 영역 hex
const hex = (o, n) => Buffer.from(p.subarray(o, o + n)).toString('hex');
console.log(`\nhex @0x00 (id..power): ${hex(0x00, 8)}`);
console.log(`hex @0x188 (ability_8, 16B): ${hex(0x188, 16)}`);
console.log(`hex @0x1a8 (influence,stamina): ${hex(0x1a8, 4)}`);
