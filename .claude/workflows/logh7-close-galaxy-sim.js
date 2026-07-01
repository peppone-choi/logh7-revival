// LOGH VII — 갭 닫기 배치1: 무유저 전략 갤럭시 시뮬 (T03/T04/T06/T11/T12/T22). ultracode.
// 응집 기능이라 구현은 의존순 직렬(신규 모듈 위주). 설계는 병렬, 검증은 적대적.

export const meta = {
  name: 'logh7-close-galaxy-sim',
  description: '무유저 전략 갤럭시 시뮬 구현: 인접그래프+전략함대시드+전략틱루프+사령관AI+성계소유변동+브로드캐스트',
  whenToUse: '유저 없이 진영전쟁이 자율 진행되는 전략 시뮬 갭을 닫을 때',
  phases: [{ title: '설계' }, { title: '구현' }, { title: '테스트' }, { title: '검증' }],
}

const COMMON = [
  'LOGH VII revival root is C:\\Users\\by0ng\\OneDrive\\Desktop\\logh7-revival. 권위적 Node.js 서버(server/src/server/*.mjs, ESM). 서버가 클라가 파싱하는 와이어를 emit.',
  'RE: `cd RE && python -m tools.logh7_redex func 0x<addr>`. 데이터등급 P0/P1/P2/P3 표기, 추측을 원본으로 승격 금지.',
  '확정 사실(logh7-gap-audit, docs/logh7-gap-backlog.md):',
  '- world-state.mjs: upsertFleet/moveFleet/listFleets/getFleet(:398-432) 전략함대 API + conquerSystem/setSystemOwner/factionSummary(:338-387) 소유 API가 정의됐으나 server/src/server에서 호출처 0(테스트 외). seedSystems(auth-server.mjs:459)만 부팅시 카논소유 1회.',
  '- auth-server.mjs: 유일 스케줄러 runNpcTickOnce(:497-514)는 전술 함선틱이고 `worldRelay.size()===0`이면 early-return → 접속 플레이어 없으면 아무것도 안 돎. setInterval 1건뿐(:512).',
  '- npc-ai.mjs: 전술공간(x/z 함선 사격/이동/후퇴)만. 전략(성계간 함대) 의사결정 없음. behaviorProfile(통솔/기동/신중) 존재.',
  '- content/galaxy.json: 80성계 {system, planets, faction(empire/alliance/neutral), cx, cy, is_corridor}. 인접/이웃 엣지 구조 없음.',
  '- character-roster: 카논 인물 8능력치(統率政治運用情報指揮機動攻撃防御)+계급/직위.',
  '원칙: 신규는 별도 모듈로(기존 최소수정). 순수+결정론(틱시드 명시)으로 단위테스트 가능하게. 게이트 LOGH_STRAT_SIM 기본 OFF. 무유저 구동(worldRelay 비종속).',
].join('\n')

const DESIGN = {
  type: 'object', additionalProperties: false,
  properties: { area: { type: 'string' }, summary: { type: 'string' },
    spec: { type: 'string', description: '구현 스펙(모듈/함수 시그니처/데이터흐름/오프셋/와이어)' },
    files: { type: 'array', items: { type: 'string' } }, risks: { type: 'array', items: { type: 'string' } } },
  required: ['area', 'spec'],
}
const IMPL = {
  type: 'object', additionalProperties: false,
  properties: { step: { type: 'string' }, changed: { type: 'boolean' }, files: { type: 'array', items: { type: 'string' } },
    description: { type: 'string' }, localTest: { type: 'string' }, provenance: { type: 'string' } },
  required: ['step', 'changed', 'description'],
}
const TEST = { type: 'object', additionalProperties: false,
  properties: { command: { type: 'string' }, passed: { type: 'boolean' }, total: { type: 'number' }, failed: { type: 'number' }, output: { type: 'string' } },
  required: ['command', 'passed'] }
const VERDICT = { type: 'object', additionalProperties: false,
  properties: { pass: { type: 'boolean' }, problems: { type: 'array', items: { type: 'string' } }, neededLiveEvidence: { type: 'string' } },
  required: ['pass', 'problems'] }

// ---------- 설계 (병렬 읽기전용) ----------
phase('설계')
const designs = await parallel([
  () => agent(COMMON + '\n\n너는 아키텍트다. 영역=전략 갤럭시 시뮬 코어. 설계하라: '
    + '(1) 전략 함대 시드(부팅시 각 진영 카논 시작성계에 NPC 함대 배치 — content/galaxy.json faction + 진영수도). '
    + '(2) strategicTick(worldState, graph, seed): 각 NPC 사령관이 인접 적/중립 성계 탐색 → 진군/교전/방어/증원/주둔 결정(behaviorProfile 통솔/기동/신중 + 카논능력치 기반) → moveFleet/conquerSystem 권위갱신. 순수+결정론. '
    + '(3) auth-server 배선: LOGH_STRAT_SIM=1 게이트, worldRelay 비종속 setInterval(기본 OFF), 결과를 접속클라에 broadcast(0x0325 유닛/0x031f 경제 주기 emit 또는 NotifyMovedShip). '
    + 'world-state.mjs 기존 API(upsertFleet/moveFleet/conquerSystem/setSystemOwner/factionSummary) 재사용. DESIGN 반환.',
    { label: '설계:시뮬코어', phase: '설계', schema: DESIGN, agentType: 'general-purpose' }),
  () => agent(COMMON + '\n\n너는 아키텍트다. 영역=갤럭시 인접/회랑 그래프. content/galaxy.json의 80성계 cx/cy + is_corridor로 '
    + '성계간 인접(이웃) 엣지를 구축하는 방법을 설계하라: 근접거리 기반 이웃 + 회랑(is_corridor) 연결 우선 + 항행불가 회피. '
    + '산출 = content/galaxy-adjacency.json(또는 모듈 생성기) {systemId: [neighborIds]} + 거리. 전략 라우팅(함대가 인접 성계로만 이동)에 쓰임. '
    + '원래 Task#2(성계가 항행불가주역에 배치) 회피도 고려. DESIGN 반환.',
    { label: '설계:인접그래프', phase: '설계', schema: DESIGN, agentType: 'general-purpose' }),
])
const [coreDesign, graphDesign] = designs

// ---------- 구현 (직렬 — 의존순, 공유파일 충돌 방지) ----------
phase('구현')
const impls = []
const steps = [
  { step: 'T06 인접그래프', design: graphDesign, extra:
    '위 설계대로 갤럭시 인접/회랑 그래프를 구현(생성기 도구 또는 content/galaxy-adjacency.json + 로더 모듈). 단위테스트(이웃 대칭성·회랑연결·항행불가회피).' },
  { step: 'T04+T11+T12 전략시뮬 코어', design: coreDesign, extra:
    '신규 server/src/server/logh7-strategic-sim.mjs: seedStrategicFleets(worldState, {galaxy}) + strategicTick(worldState, {graph, seed, profiles}). '
    + 'world-state upsertFleet/moveFleet/conquerSystem/setSystemOwner 재사용. 사령관 의사결정은 순수함수로 분리(테스트). '
    + '카논 능력치/직위 소싱은 기존 로스터, 추측 룰은 P3 태그. 단위테스트(시드/틱 결정론·소유변동·인접이동제약·무유저 동작).' },
  { step: 'T03+T22 틱루프+브로드캐스트 배선', design: coreDesign, extra:
    'auth-server.mjs에 LOGH_STRAT_SIM=1 게이트 전략 setInterval(기본 OFF, worldRelay 비종속) 추가 → strategicTick 주기 호출 → 변경 함대/소유를 접속클라에 broadcast(worldRelay 통해). '
    + '기존 runNpcTickOnce(전술)와 분리. 게이트 OFF시 회귀 0. 단위/통합 테스트.' },
]
for (const s of steps) {
  if (!s.design) { impls.push({ step: s.step, changed: false, description: '설계 누락(null) — 보류' }); continue }
  const r = await agent(COMMON + '\n\n너는 maker다. 단계=' + s.step + '. 설계:\n' + JSON.stringify(s.design, null, 1)
    + '\n\n지침: ' + s.extra + '\n구현 후 영향 테스트를 직접 돌려 localTest에 기록. IMPL 반환.',
    { label: '구현:' + s.step, phase: '구현', schema: IMPL })
  impls.push(r || { step: s.step, changed: false, description: 'maker 실패' })
  log('구현: ' + s.step + ' changed=' + (r ? r.changed : 'null'))
}

// ---------- 테스트 ----------
phase('테스트')
const test = await agent(COMMON + '\n\n너는 tester다. `cd server && node --test tests/server/*.test.mjs` 실행, TEST 반환. 실패시 실패명+메시지.',
  { label: '전체테스트', phase: '테스트', schema: TEST })

// ---------- 검증 (적대적) ----------
phase('검증')
const verdict = await agent(COMMON + '\n\n너는 verifier다. 무유저 전략 시뮬 구현을 적대적 검증:\n'
  + '구현:' + JSON.stringify(impls) + '\n테스트:' + JSON.stringify(test)
  + '\n\n확인: (1) LOGH_STRAT_SIM OFF시 회귀 0(기존 753 유지), (2) 무유저(worldRelay=0)서도 틱이 돌고 함대/소유가 시간축 변동, (3) 결정론(시드 고정시 재현), '
  + '(4) 추측 카논데이터를 P0로 과장 안 함, (5) world-state 권위 API 올바른 사용, (6) 인접제약(함대가 비인접 성계로 점프 안 함). 실클라 잔여는 neededLiveEvidence. VERDICT 반환.',
  { label: '검증:무유저시뮬', phase: '검증', schema: VERDICT, agentType: 'general-purpose' })

return { designs, impls, test, verdict,
  note: '메인: 753+ 테스트 재확인, LOGH_STRAT_SIM=1로 무유저 틱 로그/라이브 관측, docs/logh7-gap-backlog.md에서 T03/04/06/11/12/22 닫음 표기.' }
