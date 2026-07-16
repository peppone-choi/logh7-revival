import * as WR from '../../server/src/server/logh7-world-records.mjs';
const { buildInformationUnitInner, buildWorldEntryInners, buildGridInitializeSpawnInners, readMsg32Code } = WR;

function countBytes(inner, label) {
  const buf = Buffer.isBuffer(inner) ? inner : Buffer.from(inner);
  // msg32: [u32LE 0][u16BE code @4]; body@6; count@ body+0 = buf offset 6
  let code = null; try { code = readMsg32Code(buf); } catch {}
  const cnt = buf.subarray(6, 8);
  const hex = [...cnt].map(b=>b.toString(16).padStart(2,'0')).join(' ');
  console.log(`${label}: code=0x${(code??0).toString(16)} count@6=[${hex}] LEread=${buf.readUInt16LE(6)} BEread=${buf.readUInt16BE(6)} totalLen=${buf.length}`);
}

// 1) minimal (no fleets)
countBytes(buildInformationUnitInner({ unitId:1 }), 'A minimal   ');
// 2) fleets 25
const fleets = Array.from({length:25},(_,i)=>({id:i+1,faction:2,commander:i===0?1:0,cell:0,owner:0,boats:[]}));
countBytes(buildInformationUnitInner({ unitId:1, commander:1, fleets }), 'B fleets(25)');
// 3) real world-enter builder — find the 0x0325 inner
try {
  const arr = buildWorldEntryInners({ characterId:1, gridUnitId:1, unitCell:0, power:2, spot:1, fleets, abilities:[80,75,70,65,60,55,50,45] });
  const u = (arr||[]).find(x=>{try{return readMsg32Code(x)===0x325}catch{return false}});
  if (u) countBytes(u, 'C worldEnter'); else console.log('C worldEnter: no 0x0325 inner found; codes=', (arr||[]).map(x=>{try{return '0x'+readMsg32Code(x).toString(16)}catch{return '?'}}));
} catch(e){ console.log('C worldEnter ERR', e.message); }
// 4) grid-init-spawn builder
try {
  const arr = buildGridInitializeSpawnInners({ characterId:1, gridUnitId:1, unitCell:0, power:2, spot:1, fleets, commander:1 });
  const u = (arr||[]).find(x=>{try{return readMsg32Code(x)===0x325}catch{return false}});
  if (u) countBytes(u, 'D gridSpawn '); else console.log('D gridSpawn: no 0x0325 inner; codes=', (arr||[]).map(x=>{try{return '0x'+readMsg32Code(x).toString(16)}catch{return '?'}}));
} catch(e){ console.log('D gridSpawn ERR', e.message); }
