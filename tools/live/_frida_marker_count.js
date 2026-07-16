'use strict';
// 전략맵 라이브 마커 카운트 — 진단 전용(읽기만, 무변조).
// 클라 렌더 게이트(FUN_004d3bd0)를 그대로 복제해 "실제로 그려질 마커 수"를 센다.
// 근거: docs/logh7-strategic-map-placement-re.md
//   clientBase = *(va 0x7ccffc)
//   live objectTable = clientBase + 0x2c1755  (record v = +v*3: [byte0=라벨, byte1=klass, byte2=변종])
//   live cellGrid     = clientBase + 0x2c03cc  (row*100+col, 값=팔레트 인덱스)
//   run-once 복사 가드 = clientBase + 0x2c03c0
//   렌더 게이트: cell값 v → objRec=objTable+v*3, byte1==3 이고 byte2∈{0..6,8} 이면 마커.

const PREF = ptr('0x400000');
const mod = Process.getModuleByName('g7mtclient.exe');
const base = mod.base;
function va(hex){ return base.add(ptr(hex).sub(PREF)); }
const GLOBAL_CLIENTBASE = va('0x7ccffc');

const O_GUARD    = 0x2c03c0;
const O_CELLGRID = 0x2c03cc;
const O_OBJTABLE = 0x2c1755;
const O_OBJCOUNT = 0x2c1754;

function rd(fn, dflt){ try { return fn(); } catch(e){ return dflt; } }

function analyze(){
  const cb = rd(() => GLOBAL_CLIENTBASE.readPointer(), null);
  if (!cb || cb.isNull()) return { ok:false, why:'clientBase null' };

  const guard = rd(() => cb.add(O_GUARD).readU32(), -1);
  const objCount = rd(() => cb.add(O_OBJCOUNT).readU8(), -1);

  // objectTable 스캔: byte1==3 인 오브젝트(=마커 팔레트 엔트리)
  const objBase = cb.add(O_OBJTABLE);
  const klass3 = [];
  const scanN = Math.min(Math.max(objCount, 0), 100);
  for (let v = 0; v < scanN; v++){
    const rec = objBase.add(v*3);
    const b0 = rd(() => rec.readU8(), 0);
    const b1 = rd(() => rec.add(1).readU8(), 0);
    const b2 = rd(() => rec.add(2).readU8(), 0);
    if (b1 === 3) klass3.push({ v:v, byte0:b0, byte1:b1, byte2:b2 });
  }

  // cellGrid 스캔: 비영 셀 + 렌더될 마커(byte1==3 && byte2∈{0..6,8})
  const cellBase = cb.add(O_CELLGRID);
  let nonzero = 0;
  const valueCells = {};   // 팔레트값 -> 셀 개수
  const markers = [];       // 실제 렌더될 마커 [col,row,v,byte2]
  for (let row = 0; row < 50; row++){
    for (let col = 0; col < 100; col++){
      const v = rd(() => cellBase.add(row*100+col).readU8(), 0);
      if (v === 0) continue;
      nonzero++;
      valueCells[v] = (valueCells[v]||0)+1;
      const rec = objBase.add(v*3);
      const b1 = rd(() => rec.add(1).readU8(), 0);
      const b2 = rd(() => rec.add(2).readU8(), 0);
      const drawable = (b1 === 3) && ((b2 <= 6) || (b2 === 8));
      if (drawable && markers.length < 200){
        markers.push({ col:col, row:row, v:v, byte0:rd(()=>rec.readU8(),0), byte2:b2 });
      }
    }
  }
  let markerCount = 0;
  for (let row = 0; row < 50; row++){
    for (let col = 0; col < 100; col++){
      const v = rd(() => cellBase.add(row*100+col).readU8(), 0);
      if (v === 0) continue;
      const rec = objBase.add(v*3);
      const b1 = rd(() => rec.add(1).readU8(), 0);
      const b2 = rd(() => rec.add(2).readU8(), 0);
      if ((b1 === 3) && ((b2 <= 6) || (b2 === 8))) markerCount++;
    }
  }

  return {
    ok:true,
    clientBase: cb.toString(),
    runOnceGuard: guard,              // 1 = 스테이징→라이브 복사 완료(맵 진입)
    objCount: objCount,               // 팔레트 오브젝트 총수(count byte)
    klass3Count: klass3.length,       // byte1==3 마커 팔레트 엔트리 수
    klass3Sample: klass3.slice(0, 20),
    nonzeroCells: nonzero,            // 값이 배치된 셀 수
    distinctValues: Object.keys(valueCells).length,
    valueCells: valueCells,
    renderedMarkerCount: markerCount, // ★실제 화면에 그려질 마커 수
    markerSample: markers.slice(0, 30),
  };
}

send({ ev:'ready', base:base.toString(), clientBase:rd(()=>GLOBAL_CLIENTBASE.readPointer().toString(),null) });
rpc.exports = { analyze: analyze };
