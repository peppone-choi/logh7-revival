import * as WR from '../../server/src/server/logh7-world-records.mjs';
const { buildInformationCharacterInner, readMsg32Code } = WR;
// enterWorld 파라미터 근사: characterId=1, gridUnitId=1(=unitId)
const inner = buildInformationCharacterInner({ characterId:1, gridUnitId:1, power:2, spot:1, abilities:[80,75,70,65,60,55,50,45] });
const buf = Buffer.isBuffer(inner)?inner:Buffer.from(inner);
const body = buf.subarray(6); // msg32 6B 헤더 후 payload
function hx(off,n){ return [...body.subarray(off,off+n)].map(b=>b.toString(16).padStart(2,'0')).join(' '); }
console.log('code=0x'+readMsg32Code(buf).toString(16), 'bodyLen=', body.length);
console.log('id   @0x00:', hx(0x00,4), 'LE=', body.readUInt32LE(0x00), 'BE=', body.readUInt32BE(0x00));
console.log('@0x1c spot:', hx(0x1c,4));
console.log('@0x20     :', hx(0x20,4), 'LE=', body.readUInt32LE(0x20), 'BE=', body.readUInt32BE(0x20));
console.log('flagship@0x24:', hx(0x24,4), 'LE=', body.readUInt32LE(0x24), 'BE=', body.readUInt32BE(0x24));
