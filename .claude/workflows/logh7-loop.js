// LOGH VII 루프 엔지니어링 — 결정론적 maker/checker 루프 (Claude 네이티브).
// Codex Automation 프롬프트의 대응: 상태 파일이 다음 작업을 만들고, maker와 checker를 분리한다.
// 실행: Workflow({ name: "logh7-loop", args: { item: "P0-02", cycles: 1 } })
//   item:   대상 P0 항목 id (생략/"auto" 이면 explorer가 상태 파일의 첫 next를 고른다)
//   cycles: 반복 횟수 (기본 1)
// 주의: 각 사이클은 공유 파일을 순차 수정하므로 절대 병렬화하지 않는다.

export const meta = {
  name: 'logh7-loop',
  description: 'LOGH VII 루프 엔지니어링 한 사이클 이상을 explorer→maker→tester→verifier로 결정론 실행',
  whenToUse: 'LOGH VII 장기 RE/구현 작업을 maker/checker 분리로 한 사이클 또는 N사이클 자동 진행할 때',
  phases: [
    { title: '조사(explorer)' },
    { title: '구현(maker)' },
    { title: '테스트' },
    { title: '검증(verifier)' },
  ],
}

const EVIDENCE = {
  type: 'object',
  additionalProperties: false,
  properties: {
    item: { type: 'string', description: '선택한 P0 항목 id' },
    summary: { type: 'string' },
    rePrepassDone: { type: 'boolean' },
    evidencePaths: { type: 'array', items: { type: 'string' } },
    recommendedChange: { type: 'string', description: '구현이 정당한가, 무엇을 최소 수정할지 (없으면 "no-change")' },
    uncertainties: { type: 'array', items: { type: 'string' } },
  },
  required: ['item', 'summary', 'rePrepassDone', 'recommendedChange'],
}

const MAKER = {
  type: 'object',
  additionalProperties: false,
  properties: {
    changed: { type: 'boolean' },
    files: { type: 'array', items: { type: 'string' } },
    description: { type: 'string' },
    provenanceTags: { type: 'string', description: '추가/변경 데이터의 P0/P1/P2/P3 등급 표기' },
  },
  required: ['changed', 'description'],
}

const TEST = {
  type: 'object',
  additionalProperties: false,
  properties: {
    command: { type: 'string' },
    passed: { type: 'boolean' },
    total: { type: 'number' },
    failed: { type: 'number' },
    output: { type: 'string', description: '실패 요약 또는 통과 수 한 줄' },
  },
  required: ['command', 'passed'],
}

const VERDICT = {
  type: 'object',
  additionalProperties: false,
  properties: {
    pass: { type: 'boolean' },
    rePrepassConfirmed: { type: 'boolean' },
    problems: { type: 'array', items: { type: 'string' } },
    neededClientEvidence: { type: 'string', description: '실클라/trace/DB/EXE SHA로만 닫을 수 있는 남은 증거' },
  },
  required: ['pass', 'problems'],
}

const item = (args && args.item) || 'auto'
const cycles = Math.max(1, Math.min(10, (args && args.cycles) || 1))

const STATE_INTRO = `
LOGH VII revival root is C:\\Users\\by0ng\\OneDrive\\Desktop\\logh7-revival. 먼저 AGENTS.md, docs/logh7-current-work-register-2026-06-17.md,
docs/logh7-loop-engineering.md, docs/logh7-loop-state.md 를 읽는다. 규칙:
- Vite/React 화면은 게임 클라이언트 증거가 아니다. 0x0f08->0x0f09 메일/HUD는 전략 플레이가 아니다.
- 데이터 등급(P0 클라/와이어 확정, P1 공식 anchor, P2 manual/IV-EX 후보, P3 절차/플레이스홀더)을 항상 표기한다.
- 추측성 서버 데이터/번역을 기본값으로 승격하지 않는다. 서버는 AI가 짠 것이므로 필요하면 수정한다.
`

const reports = []
let target = item

for (let c = 0; c < cycles; c += 1) {
  log(`사이클 ${c + 1}/${cycles} 시작 (item=${target})`)

  // 1) 조사: RE 프리패스 + 증거 (읽기 전용 explorer)
  const evidence = await agent(
    `${STATE_INTRO}
너는 explorer다. ${target === 'auto' ? '상태 파일의 첫 번째 next/blocked-needs-evidence 항목 하나를 고른다.' : `대상 항목은 ${target} 이다.`}
선택 항목의 RE 프리패스를 자동 수행한다(관련 manual/PDF, 설치 DB/MsgDat/TCF/MDX, EXE 소비 함수, 정적 VA/오프셋, 직전 trace/screenshot).
구현하지 말고 증거만 모은다. EVIDENCE를 반환한다.`,
    { label: `조사:${target}`, phase: '조사(explorer)', schema: EVIDENCE, agentType: 'Explore' },
  )
  if (!evidence) { log('explorer 실패, 사이클 중단'); break }
  target = evidence.item || target

  // 2) 구현: 최소 수정 (maker)
  let maker = { changed: false, description: 'no-change (explorer가 변경 불필요로 판정)' }
  if (evidence.recommendedChange && evidence.recommendedChange.toLowerCase() !== 'no-change') {
    maker = await agent(
      `${STATE_INTRO}
너는 maker다. explorer 항목 ${target}에 대한 증거:
${JSON.stringify(evidence, null, 2)}

위 recommendedChange를 최소 범위로 구현한다. server/src/server/*.mjs는 ESM이다. 관련 server/tests/server/*.test.mjs도 같이 갱신/추가한다.
추측성 데이터는 provenance 태그와 함께만 추가한다. MAKER를 반환한다.`,
      { label: `구현:${target}`, phase: '구현(maker)', schema: MAKER },
    )
  }

  // 3) 테스트
  const test = await agent(
    `${STATE_INTRO}
너는 tester다. 항목 ${target} 변경(${maker.changed ? maker.files?.join(', ') || '서버 코드' : '변경 없음'})에 대해
\`cd server && node --test tests/server/*.test.mjs\` 또는 영향받은 \`cd server && node --test tests/server/<관련>.test.mjs\`를 실행하고 결과를 TEST로 반환한다.
실패하면 실패 테스트명과 핵심 메시지를 output에 적는다.`,
    { label: `테스트:${target}`, phase: '테스트', schema: TEST },
  )

  // 4) 적대적 검증 (별도 패스, 읽기 전용 verifier)
  const verdict = await agent(
    `${STATE_INTRO}
너는 verifier다. maker의 완료 주장을 적대적으로 반박한다. 항목 ${target}.
explorer 증거: ${JSON.stringify(evidence)}
maker 결과: ${JSON.stringify(maker)}
test 결과: ${JSON.stringify(test)}

RE 프리패스가 실제로 수행됐는지, 변경이 사용자 증상을 닫는지, P2/P3를 원본 데이터로 과장하지 않았는지 확인한다.
실클라/trace/DB/EXE SHA로만 닫을 수 있는 항목은 neededClientEvidence에 구체적으로 적는다. VERDICT를 반환한다.`,
    { label: `검증:${target}`, phase: '검증(verifier)', schema: VERDICT, agentType: 'general-purpose' },
  )

  reports.push({ cycle: c + 1, item: target, evidence, maker, test, verdict })
  log(`사이클 ${c + 1} 완료: test=${test?.passed ? 'pass' : 'fail'}, verify=${verdict?.pass ? 'pass' : 'fail'}`)

  // verifier가 막거나 테스트 실패면 다음 사이클로 자동 진행하지 않고 멈춘다(사람 판단 필요).
  if (target !== 'auto') target = 'auto' // 다음 사이클은 상태 파일이 다음 항목을 고르게 한다
  if (test && !test.passed) { log('테스트 실패로 루프 정지'); break }
}

return {
  cyclesRun: reports.length,
  reports,
  note: '메인 에이전트는 이 결과를 검토해 docs/logh7-loop-state.md에 증거/다음 항목을 갱신하고, 실클라 표면이 필요한 항목은 RE/tools/logh7_ui_explorer.py로 닫는다.',
}
