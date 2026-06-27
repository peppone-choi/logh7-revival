// LOGH VII — T37 캐논 항성 위치 복구 + 항행불가 투영 보정. ultracode.
// 발견: gin7manual 星系図(manual_saved.pdf p101)에 80개 항성 dot(벡터)+80 라벨박스+두 진영영역+회랑 구조가 정밀 존재.
// galaxy.json cx/cy는 라벨박스 근사(부정확). 정밀 dot로 교체 + 통과셀 맵으로 투영 보정.

export const meta = {
  name: 'logh7-galaxy-positions',
  description: 'gin7manual 星系図 p101서 캐논 항성 dot 정밀추출 + dot↔성계 매칭 + 통과셀 맵 + buildStrategicGalaxyGrid 투영 보정',
  whenToUse: '항성이 항행불가주역에 배치되는 문제를 캐논 星系図 좌표로 바로잡을 때',
  phases: [{ title: '추출' }, { title: '구현' }, { title: '검증' }],
}

const COMMON = [
  'LOGH VII revival(E:\\logh7-revival). 권위적 Node.js 서버.',
  '확정 발견(메인 에이전트 RE):',
  '- PDF: .omo/work/manual_saved.pdf, 星系図 = page 101(0-index 100). PyMuPDF(fitz) 사용가능. 렌더본 .omo/work/galaxy-extract/page101.png(1684x1190).',
  '- pg.get_drawings() 160개: 정확히 80개가 작은 점(rect.width<8 and rect.height<8 and rect.width>0.3) = 항성 dot. 나머지 80개(type fs, ~18x18pt, items 11) = 라벨박스(녹색=한진영/청록=타진영/노랑=페잔, faction을 색으로 인코딩).',
  '- 저장본: .omo/work/galaxy-extract/dots.json(80 dot 좌표, page frame).',
  '- dot X범위 123.7-447.2 = galaxy.json cx범위와 동일(같은 프레임 추정), dot Y 120.7-776.4 vs galaxy.json cy 63.3-719.1(라벨이 dot서 수직오프셋).',
  '- 단 naive 최근접 매칭은 일부 713px 빗나감 → 좌표프레임/오프셋 정밀 정합 필요. galaxy.json _source=星系図 special Text annotations(이름+rect 보유, 80성계). 라벨 텍스트는 page text layer엔 없음(annotations). pg.annots()로 이름+위치 추출 시도.',
  '- 차트 구조: 두 진영영역(좌/우)이 항행불가 흑색공간으로 분리, 좁은 회랑 2개(이젤론·페잔)로만 연결. 그리드(블루셀)=통과가능, 흑색=항행불가.',
  '- 서버 투영: src/server/logh7-login-protocol.mjs buildStrategicGalaxyGrid: col=2+round((x-minX)/spanX*95), row=2+round((y-minY)/spanY*45) + 충돌해소(col+1). 이 선형정규화가 두영역 갭/통과셀을 무시 → 항성이 흑색(항행불가)셀에 떨어짐.',
  '데이터등급: dot 위치/그리드구조=P1(공식 매뉴얼 星系図). 셀 배정 알고리즘=P0(클라 100x50 그리드).',
].join('\n')

const EXTRACT = {
  type: 'object', additionalProperties: false,
  properties: {
    summary: { type: 'string' },
    method: { type: 'string', description: '좌표프레임 정합 + dot↔성계명 매칭 방법(어떻게 frame을 맞췄고 매칭 정확도)' },
    matchQuality: { type: 'string', description: '80성계 중 신뢰 매칭 수 + 잔여 불확실' },
    passableMap: { type: 'string', description: '통과셀 맵/그리드 origin·cell크기를 어떻게 추출했나(블루셀 영역 or 그리드 벡터)' },
    artifactPath: { type: 'string', description: '산출 JSON 경로(성계명→정밀 dot + 캐논 그리드셀 + 통과셀맵)' },
    uncertainties: { type: 'array', items: { type: 'string' } },
  },
  required: ['summary', 'method', 'artifactPath'],
}
const IMPL = {
  type: 'object', additionalProperties: false,
  properties: { changed: { type: 'boolean' }, files: { type: 'array', items: { type: 'string' } },
    description: { type: 'string' }, localTest: { type: 'string' }, provenance: { type: 'string' } },
  required: ['changed', 'description'],
}
const VERDICT = { type: 'object', additionalProperties: false,
  properties: { pass: { type: 'boolean' }, problems: { type: 'array', items: { type: 'string' } }, neededLiveEvidence: { type: 'string' } },
  required: ['pass', 'problems'] }

// ---------- 추출 (좌표 정합 + 매칭 + 통과셀) ----------
phase('추출')
const extract = await agent(
  COMMON + '\n\n너는 정밀 추출 엔지니어다. 목표: page 101서 (1) 80 항성 dot 정밀좌표, (2) 각 dot↔성계명 매칭(galaxy.json 80성계 이름), (3) 통과셀 맵 + 그리드 origin/cell크기.\n'
  + '단계: (a) fitz로 page101의 dots(이미 dots.json)와 라벨박스(80 fs)와 텍스트주석(pg.annots() 또는 galaxy.json rect)을 같은 프레임으로 확보. '
  + 'galaxy.json cx/cy와 page dot의 프레임 관계를 실측으로 정합(회전/transpose/오프셋 후보를 테스트, X범위 일치 활용). '
  + '(b) 각 라벨박스를 최근접 dot에 페어링(같은프레임, 작은오프셋) + 라벨 색(faction)으로 교차검증 + galaxy.json faction과 대조해 성계명 배정. naive 매칭 713px 실패를 frame정합으로 해소. '
  + '(c) 그리드 구조: page101.png에서 블루 그리드셀 영역(통과가능) 경계 + 두 영역 + 회랑을 추출하거나, 그리드 벡터선으로 cell origin/size 산출 → 각 dot을 (col,row) 캐논셀로 변환(100x50). 흑색=항행불가셀 맵. '
  + '산출 JSON(.omo/work/galaxy-extract/canon-positions.json): [{name, dotX, dotY, col, row, faction}] + passableCells(통과셀 집합 또는 영역폴리곤). '
  + 'fitz/PIL/numpy 사용. 추측 최소, 실측 기반. EXTRACT 반환.',
  { label: '추출:캐논위치', phase: '추출', schema: EXTRACT, agentType: 'general-purpose' })

// ---------- 구현 (galaxy.json + 투영 보정) ----------
phase('구현')
const impl = await agent(
  COMMON + '\n\n너는 maker다. 추출 산출:\n' + JSON.stringify(extract, null, 1)
  + '\n\n구현: (1) content/galaxy.json 각 성계 cx/cy를 정밀 dot좌표로 갱신(또는 canonCol/canonRow 필드 추가) — _source에 星系図 dot 추출 provenance 명기. '
  + '(2) src/server/logh7-login-protocol.mjs buildStrategicGalaxyGrid를 보정: 캐논 col/row가 있으면 그걸 직접 사용(선형정규화 대신), 통과셀맵 밖(항행불가)으로 떨어지지 않게 + 충돌해소도 통과셀 안에서만. 캐논셀 없으면 기존 정규화 폴백. '
  + '(3) tests/server에 oracle 테스트: 알려진 수도/회랑(오딘 제국·하이네센 동맹·페잔 중립·이젤론)이 캐논셀에 오고 항행불가셀엔 성계 0개. '
  + '와이어 0x0313/0x0315 출력 형식 불변(셀 값만 캐논화). 회귀 0. IMPL 반환.',
  { label: '구현:투영보정', phase: '구현', schema: IMPL })

// ---------- 검증 ----------
phase('검증')
const test = await agent(COMMON + '\n\n너는 tester다. `npm run test:server` 실행, 결과 보고(passed/total/failed + 실패요약).',
  { label: '테스트', phase: '검증', schema: { type:'object', additionalProperties:false, properties:{ passed:{type:'boolean'}, total:{type:'number'}, failed:{type:'number'}, output:{type:'string'} }, required:['passed'] } })
const verdict = await agent(
  COMMON + '\n\n너는 verifier다. 캐논 위치 복구+투영보정을 적대검증:\n구현:' + JSON.stringify(impl) + '\n테스트:' + JSON.stringify(test)
  + '\n\n확인: (1) dot↔성계 매칭이 frame정합으로 신뢰가능한지(추측배정 아닌지), (2) 통과셀맵이 차트 두영역+회랑과 일치하는지, '
  + '(3) 보정 후 항행불가셀에 성계 0인지, 수도/회랑 위치가 캐논과 맞는지, (4) 와이어형식/충돌해소 회귀 0, (5) P1 매뉴얼 dot을 P0로 과장 안 함. 실클라 잔여는 neededLiveEvidence. VERDICT 반환.',
  { label: '검증:캐논위치', phase: '검증', schema: VERDICT, agentType: 'general-purpose' })

return { extract, impl, test, verdict, note: '메인: ui_explorer로 항성이 통과셀에만 렌더되는지 라이브 + galaxy-sim 인접그래프도 캐논셀로 재빌드.' }
