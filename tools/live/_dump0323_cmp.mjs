import { buildInformationCharacterInner } from '../../server/src/server/logh7-world-records.mjs';
const inner = buildInformationCharacterInner({ characterId:1, gridUnitId:1, power:2, spot:1,
  lastname:'Reinhard', firstname:'Lohengramm', face:305419896, rank:13,
  abilities:[80,75,70,65,60,55,50,45], officerCount:0 });
const body = inner.subarray(6);
function row(off){ const h=[...body.subarray(off,off+16)].map(b=>b.toString(16).padStart(2,'0')).join(' '); return off.toString(16).padStart(4,'0')+'  '+h; }
console.log('inner.len=',inner.length,' body.len=',body.length);
console.log('msg32 header(6):',[...inner.subarray(0,6)].map(b=>b.toString(16).padStart(2,'0')).join(' '));
for(const o of [0x00,0x10,0x20,0x30]) console.log(row(o));
console.log('body 0x00 LE=',body.readUInt32LE(0),'0x04=',body[4],'0x1c LE=',body.readUInt32LE(0x1c));
console.log('body 0x20 LE=',body.readUInt32LE(0x20),'0x24 LE=',body.readUInt32LE(0x24),'0x28 LE=',body.readUInt32LE(0x28));
