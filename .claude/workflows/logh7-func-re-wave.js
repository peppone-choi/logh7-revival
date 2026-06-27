export const meta = {
  name: 'logh7-func-re-wave',
  description: 'LOGH VII 클라 함수 전수 RE 한 웨이브: 배치별 RE(maker)→적대적 검증(checker)→합성',
  phases: [
    { title: 'Document', detail: '배치별 함수 RE 문서화(목적/매개변수/반환/오프셋/옵코드)' },
    { title: 'Verify', detail: '배치별 적대적 검증(환각/매개변수누락/오프셋 오류 탐지)' },
    { title: 'Synthesize', detail: '원장 갱신 + 웨이브 요약 문서' },
  ],
}

// args: { bin, wave, startBatch, count, workDir, outDir, ledgerPath, repoRoot, reTargets }
const A = (typeof args === 'string') ? JSON.parse(args) : (args || {})
const bin = A.bin
const wave = A.wave
const startBatch = A.startBatch
const count = A.count
const workDir = A.workDir
const outDir = A.outDir
const ledgerPath = A.ledgerPath
const reTargets = A.reTargets || 0
const repoRoot = A.repoRoot

const pad = (n) => String(n).padStart(4, '0')
const batches = []
for (let i = startBatch; i < startBatch + count; i++) {
  batches.push({
    i,
    batchPath: `${workDir}/batch-${pad(i)}.jsonl`,
    outPath: `${outDir}/batch-${pad(i)}.json`,
  })
}

log(`웨이브 ${wave}: ${bin} 배치 ${startBatch}..${startBatch + count - 1} (${count}개) RE 시작. 전체 re_target=${reTargets}`)

const RE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    outPath: { type: 'string' },
    funcCount: { type: 'number' },
    documented: { type: 'number' },
    keyFindings: { type: 'array', items: { type: 'string' } },
    subsystemsTouched: { type: 'array', items: { type: 'string' } },
    opcodesFound: { type: 'array', items: { type: 'string' } },
  },
  required: ['outPath', 'documented', 'keyFindings'],
}

const VERIFY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    outPath: { type: 'string' },
    checked: { type: 'number' },
    verdict: { type: 'string', enum: ['pass', 'partial', 'fail'] },
    hallucinations: { type: 'array', items: { type: 'string' } },
    paramErrors: { type: 'array', items: { type: 'string' } },
    offsetErrors: { type: 'array', items: { type: 'string' } },
    note: { type: 'string' },
  },
  required: ['verdict', 'checked'],
}

const rePrompt = (b) => `당신은 LOGH VII 클라이언트(${bin}.exe)의 Ghidra 디컴파일을 정밀 리버스 엔지니어링한다. cwd는 ${repoRoot} 이다.

배치 파일을 Read하라: ${b.batchPath}
(JSONL, 각 줄 = {addr,name,sig,conv,size,callers,subsystems,dat_refs,str_refs,c}. c = 디컴파일된 C 본문.)

이 배치의 **모든 함수를 빠짐없이** 문서화하라. 함수 하나, 매개변수 하나, DAT 오프셋 하나, 옵코드 하나도 누락 금지. 추측과 디컴파일 근거를 반드시 구분하라(confidence).

각 함수에 대해:
- addr, name, calling_convention (thiscall이면 ecx=this 명시)
- purpose: 이 함수가 정확히 무엇을 하는가 (디컴파일 c 근거 1~4문장)
- parameters: **모든** 인자 배열 [{name,type,meaning}]. thiscall ecx(this)/fastcall edx 포함. 없으면 []
- return: 반환값 의미(void면 "void")
- key_data_refs: 참조하는 **모든** 전역 DAT_/PTR_/UNK_ [{addr,meaning}]. 클라 베이스 오프셋(+0x..)이면 명시
- key_callees: 주요 호출 [{addr,role}]
- opcodes: 처리/발신/비교하는 와이어 옵코드 0x.... 배열(없으면 [])
- subsystem: network|strategic|battle|render|ui|file|audio|input|crt|core|unknown
- category: game-logic|parser|builder|dispatcher|wrapper|accessor|state-machine|library
- confidence: "P0-decompile" | "P3-inferred"
- open_questions: []

교차참조 필요시 \`python -m tools.logh7_redex func 0x<addr>\` / \`calls 0x<addr>\` / \`xref <substr>\` 사용 가능(repo root). 저장소 광역 탐색 금지, 이 배치에만 집중.

결과를 ${b.outPath} 에 유효 JSON으로 Write: {"binary":"${bin}","batch":${b.i},"functions":[...]}.
StructuredOutput 반환: {outPath:"${b.outPath}", funcCount, documented, keyFindings[], subsystemsTouched[], opcodesFound[]}.`

const verifyPrompt = (b) => `적대적 검증자. maker가 ${b.outPath} 에 쓴 RE 문서를 신뢰하지 말고 반증하라. cwd ${repoRoot}.
원본 배치(디컴파일 c 포함): ${b.batchPath}. 대조용 \`python -m tools.logh7_redex func <addr>\` 사용 가능.
${b.outPath} 와 ${b.batchPath} 를 Read하고, 무작위로 함수 4~6개(적으면 전부)를 골라 검증:
- purpose가 디컴파일 c와 일치하는가? (날조/과장)
- parameters 개수와 의미가 실제 시그니처/본문 사용과 맞는가? (특히 **매개변수 누락**)
- key_data_refs의 DAT_ 주소가 실제 c에 존재하는가? (환각 주소)
- opcodes가 실제 비교/분기 상수로 c에 나오는가?
- confidence가 P0-decompile인데 실제로는 추론인 항목
모든 거짓/과장/누락을 적발하라. 반환: {outPath:"${b.outPath}", checked, verdict(pass|partial|fail), hallucinations[], paramErrors[], offsetErrors[], note}.`

const results = await pipeline(
  batches,
  (b) => agent(rePrompt(b), {
    label: `re:${bin}#${b.i}`, phase: 'Document',
    agentType: 'general-purpose', schema: RE_SCHEMA,
  }).then((re) => ({ re, b })),
  ({ re, b }) => re
    ? agent(verifyPrompt(b), {
        label: `verify:${bin}#${b.i}`, phase: 'Verify',
        agentType: 'logh7-loop-verifier', schema: VERIFY_SCHEMA,
      }).then((v) => ({ i: b.i, outPath: b.outPath, re, v }))
    : { i: b.i, outPath: b.outPath, re: null, v: null },
)

const ok = results.filter((r) => r && r.re)
const totalFuncs = ok.reduce((s, r) => s + (r.re?.documented || 0), 0)
const fails = ok.filter((r) => r.v?.verdict === 'fail')
const partials = ok.filter((r) => r.v?.verdict === 'partial')
log(`문서화 ${ok.length}/${count} 배치, 함수 ~${totalFuncs}개. verify fail=${fails.length} partial=${partials.length}`)

// 검증자 적발을 영속화(합성이 반드시 정정 반영하도록 prompt에 주입 + corrections.json 기록)
const corrections = ok
  .filter((r) => r.v && r.v.verdict !== 'pass')
  .map((r) => ({
    batch: r.i, outPath: r.outPath, verdict: r.v.verdict,
    hallucinations: (r.v.hallucinations || []).slice(0, 8),
    paramErrors: (r.v.paramErrors || []).slice(0, 8),
    offsetErrors: (r.v.offsetErrors || []).slice(0, 8),
    note: (r.v.note || '').slice(0, 400),
  }))
const correctionsJson = JSON.stringify(corrections)
const corrPath = `${outDir}/_wave-${pad(wave)}-verifier-corrections.json`

const synth = await agent(
  `LOGH VII 함수 RE 웨이브 ${wave} 합성(${bin}). cwd ${repoRoot}.
먼저 아래 검증자(adversarial) 적발 JSON을 ${corrPath} 에 그대로 Write로 저장하라(영속화):
${correctionsJson}
이 적발들은 maker 문서의 환각/매개변수오류/오프셋오류/과장이다. 합성 문서에 **반드시 정정 섹션으로 반영**하고, 해당 함수의 신뢰도를 낮춰 기술하라. 적발이 빈 배열이면 "검증자 hard-fail 0, partial은 자기-한정 confidence"로 명시.
이번 웨이브 출력: ${outDir}/batch-${pad(startBatch)}.json .. batch-${pad(startBatch + count - 1)}.json 를 모두 Read.
1) 원장 ${ledgerPath} 를 Read(없으면 {"binary":"${bin}","documented":{},"batches_done":[]})→갱신: 이번 웨이브 모든 함수 addr을 documented에 추가(값=name 또는 purpose 요약 1줄), batches_done에 ${startBatch}..${startBatch + count - 1} 추가(중복 제거). Write로 저장.
2) docs/logh7-function-re-${bin.toLowerCase()}-wave-${pad(wave)}.md 작성:
   - 커버리지: 이번 웨이브 함수수 / 누적 documented / 전체 re_target ${reTargets} 대비 %
   - 핵심 발견: 특히 옵코드 디스패처 FUN_004ba2b0 의 opcode→handler 표(가능한 만큼), 전략/입력/HUD/grid 게이트 함수들의 purpose+주요 parameters 요약
   - verify 적발 정정(hallucination/paramError/offsetError) 목록
   - fail/partial 배치 명시(정직하게)
   - 다음 웨이브 시작 배치 = ${startBatch + count}
정직 원칙: 검증 안 된 추론을 확정으로 적지 말 것. 반환: {ledgerPath, docPath, cumulativeDocumented, note}.`,
  { label: 'synth', phase: 'Synthesize', agentType: 'general-purpose' },
)

return {
  wave, bin,
  batchesRequested: count,
  batchesDocumented: ok.length,
  funcsDocumented: totalFuncs,
  verifyFails: fails.length,
  verifyPartials: partials.length,
  nextStartBatch: startBatch + count,
  synth,
}
