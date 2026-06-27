// LOGH VII — "전부 밀어붙여" 종합 워크플로 (ultracode).
// Phase 1: 5개 전선 RE 팬아웃(읽기전용 병렬) → Phase 2: 서버 구현(직렬, 파일충돌 방지)
// → Phase 3: 전체 테스트 → Phase 4: 적대적 검증(병렬).
// 라이브 클라가 필요한 EXE 작업(code-cave 인코딩/Path B 위젯패치 실검증)은 워크플로가 SPEC만 산출하고
// 메인 에이전트가 직렬로 ui_explorer/Frida로 닫는다(서브에이전트는 단일 라이브클라를 못 돈다).

export const meta = {
  name: 'logh7-push-all',
  description: 'LOGH VII 전 전선 동시 추진: code-cave/PathB RE + 경제/함선/작위 서버구현 + 적대적검증',
  whenToUse: '플레이가능+리마스터+컨텐츠 다전선을 한 번에 소진적으로 추진할 때(라이브 EXE는 메인이 직렬 마감)',
  phases: [
    { title: 'RE조사' },
    { title: '구현' },
    { title: '테스트' },
    { title: '검증' },
  ],
}

const COMMON = [
  'LOGH VII revival 저장소(E:\\logh7-revival). 권위적 Node.js 서버(src/server/*.mjs, ESM)가 디컴파일된',
  'G7MTClient.exe가 파싱하는 와이어 레코드를 emit한다. RE 인덱스: .omo/ghidra/export/G7MTClient/.',
  '조회: `python tools/logh7_redex.py func 0x<addr>` (디컴파일) / `python tools/logh7_redex.py grep "<sym>"` (호출자/참조).',
  '데이터 등급 표기 필수: P0(클라/와이어 바이너리 확정) P1(공식 manual/PDF) P2(IV-EX/넷마블 후보) P3(절차/플레이스홀더). 추측을 P0로 승격 금지.',
  '',
  '확정된 핵심 사실(라이브 검증됨):',
  '- 전략명령 0x0b01: FUN_004c4170(__fastcall ecx=mainState) onEnter서 source=*(mainState+8), src320=*(source+0x320).',
  '  positive-control(tools/logh7_p0_02_focus_pc.py)이 src320=0일 때 홈셀(2550)을 source+0x320에 write하니',
  '  mainState+0x126714=2550, mode +0x126711=2, root *(DAT_007cd04c+0x11178)=2550, FUN_004d6310 검증기 PASS(이전 항상 -256).',
  '  즉 메커니즘 증명됨. 1바이트 클라패치(FUN_004c2c80 case0x325 mode 1->0)는 월드진입을 깨서 배제. 서버전용 경로도 배제',
  '  (FUN_004c2c80 mode=0 호출자는 reset 함수 FUN_004c2a80뿐). FUN_004c2c80: mode=0->inline source(param_1+0xc),',
  '  다른 mode->slot 배열(stride 0x370, base +0xc). 디스패처 FUN_004ba2b0 case 0x325가 mode=1로 유닛전달.',
  '- 서버 기존 조각: logh7-base-record.mjs buildResponseInformationBaseInner(0x031f, 파서 FUN_00414c70서 byte-exact);',
  '  logh7-info-records-static.mjs buildStaticInformationUnitShipInner(LOGH_STATIC_SHIPS 게이트, line~746 return);',
  '  logh7-imperial-titles.mjs(fiefIncome/applyGrantFief/validateGrantTitle). 현재 744 테스트 통과.',
].join('\n')

const RE_SPEC = {
  type: 'object', additionalProperties: false,
  properties: {
    front: { type: 'string' },
    summary: { type: 'string' },
    keyFindings: { type: 'string', description: '확정 VA/오프셋/opcode/필드 — 인용(함수주소/디컴파일 라인) 포함' },
    evidencePaths: { type: 'array', items: { type: 'string' } },
    recommendedChange: { type: 'string', description: '최소 구현/패치 스펙. 라이브-EXE면 patch 사이트 VA+originalHex+patchedHex 또는 cave 바이트 의사코드' },
    feasibility: { type: 'string', enum: ['ready', 'needs-live-verify', 'blocked', 'no-change'] },
    uncertainties: { type: 'array', items: { type: 'string' } },
  },
  required: ['front', 'summary', 'keyFindings', 'recommendedChange', 'feasibility'],
}

const IMPL = {
  type: 'object', additionalProperties: false,
  properties: {
    front: { type: 'string' },
    changed: { type: 'boolean' },
    files: { type: 'array', items: { type: 'string' } },
    description: { type: 'string' },
    testsAdded: { type: 'string' },
    localTestResult: { type: 'string', description: '구현 직후 돌린 node --test 결과 한 줄' },
    provenanceTags: { type: 'string' },
  },
  required: ['front', 'changed', 'description'],
}

const TEST = {
  type: 'object', additionalProperties: false,
  properties: {
    command: { type: 'string' }, passed: { type: 'boolean' },
    total: { type: 'number' }, failed: { type: 'number' },
    output: { type: 'string' },
  },
  required: ['command', 'passed'],
}

const VERDICT = {
  type: 'object', additionalProperties: false,
  properties: {
    front: { type: 'string' }, pass: { type: 'boolean' },
    rePrepassConfirmed: { type: 'boolean' },
    problems: { type: 'array', items: { type: 'string' } },
    neededLiveEvidence: { type: 'string', description: '실클라/trace/EXE SHA로만 닫을 수 있는 잔여' },
  },
  required: ['front', 'pass', 'problems'],
}

// ---------- Phase 1: RE 팬아웃 (읽기전용 병렬) ----------
phase('RE조사')

const reJobs = [
  {
    key: 'cave-source', label: 'RE:cave-source',
    prompt: COMMON + '\n\n너는 RE explorer다. 전선=code-cave 데이터소스(M1-1). '
      + 'positive-control은 홈셀 2550을 하드코딩했지만, 프로덕션 cave는 *실제 플레이어 자기-유닛 셀*을 읽어야 한다. '
      + 'FUN_004c4170 진입 시점에 플레이어 자기-함대/유닛의 그리드셀(row*100+col)을 안정적으로 읽을 수 있는 위치를 RE로 확정하라: '
      + '(a) 디스패처 case 0x325가 mode=1로 FUN_004c2c80에 넘긴 유닛이 착지하는 슬롯의 정확한 VA/오프셋(거기 +0x08이 셀), '
      + '(b) 플레이어 own-fleet/own-unit을 가리키는 전역(DAT_*)이 있는지, '
      + '(c) 그 값이 FUN_004c4170 onEnter 시점에 이미 채워져 있는지(타이밍). '
      + 'FUN_004c2c80, FUN_004ba2b0 case 0x325, FUN_004d6310(셀 비교 대상), 0x325 유닛 레코드 +0x08을 추적하라. '
      + 'recommendedChange에 cave가 읽을 정확한 [base+offset] 또는 전역 VA와, src320=0일 때 그 값을 source+0x320에 쓰는 의사코드를 적어라.',
  },
  {
    key: 'cave-hook', label: 'RE:cave-hook',
    prompt: COMMON + '\n\n너는 RE explorer다. 전선=code-cave 주입지점/메커니즘(M1-1). '
      + 'FUN_004c4170(0x004c4170) 진입에 detour를 걸어 "src320==0이면 플레이어셀 기록"을 실행하려 한다. '
      + '확정하라: (a) EXE 내 사용 가능한 code-cave(함수 사이 정렬 패딩 0xCC/0x00 구간)의 파일오프셋+VA와 크기, '
      + '(b) 후킹 방법(FUN_004c4170 프롤로그를 5바이트 jmp로 덮고 cave에서 원래 명령 복원 후 로직 실행 후 복귀; 또는 그 함수를 호출하는 call 사이트를 cave로 리다이렉트), '
      + 'FUN_004c4170 프롤로그 첫 명령 바이트(redex로 디스어셈 불가하면 .text 파일오프셋에서 바이트 확인: 설치 EXE는 ImageBase 0x400000, .text 파일오프셋=VA-0x400000 근사). '
      + 'recommendedChange에 detour 사이트 VA, 덮을 바이트 길이, cave 위치 후보, 어셈블리 스케치를 적어라. 위험(스택/레지스터 보존)도 명시.',
  },
  {
    key: 'pathB-widescreen', label: 'RE:pathB',
    prompt: COMMON + '\n\n너는 RE explorer다. 전선=리마스터 Path B 네이티브 16:9(M3-1). '
      + 'UI 위젯이 가로세로 독립 스케일로 늘어지는 근원 FUN_004ea460을 RE하라. X스케일과 Y스케일이 각각 어디서 계산/적용되는지, '
      + '둘을 동일(uniform, 예: 둘 다 Y스케일 사용 → 레터/필러박스)하게 만드는 최소 패치를 찾아라. '
      + 'tools/client_patches/widescreen-ui.json(기존 스펙)과 docs/logh7-graphics-remaster.md를 먼저 읽어라. '
      + 'recommendedChange에 patch 사이트 VA, originalHex, patchedHex 후보(검증 가능한 단일/소수 바이트)와 그 수식 근거를 적어라. feasibility 판정.',
  },
  {
    key: 'economy-0x031f', label: 'RE:economy',
    prompt: COMMON + '\n\n너는 RE explorer다. 전선=내정 경제 라이브(M2-1). '
      + 'src/server/logh7-base-record.mjs(buildResponseInformationBaseInner, 0x031f)와 logh7-base-economy.mjs, docs/logh7-info-records-wire.md를 읽어라. '
      + '서버가 0x031f를 *언제* emit해야 하는지(어느 클라 요청 opcode가 base-info를 요구하는지; 0x031e 요청? 디스패처 case 799=0x031f) RE로 확정하고, '
      + '현재 핸들러(logh7-login-session.mjs / logh7-info-records.mjs의 0x031e->0x031f 경로)에서 무엇이 빠졌는지 짚어라. '
      + 'recommendedChange에 "어느 요청 분기에서 buildResponseInformationBaseInner를 어떤 게이트(LOGH_*)로 emit하고, bases 인자를 어느 월드상태에서 채우는가"를 구현 가능한 수준으로 적어라.',
  },
  {
    key: 'shipclass-0x030a', label: 'RE:shipclass',
    prompt: COMMON + '\n\n너는 RE explorer다. 전선=함선마스터 정적 emit(M2-2). '
      + 'src/server/logh7-info-records-static.mjs(buildStaticInformationUnitShipInner, +4바이트 버그 수정됨)와 logh7-login-session.mjs를 읽어라. '
      + '클라가 0x030a로 함선클래스 마스터(0x30b)를 요청하는 분기를 RE로 확정하라(디스패처/요청 opcode). '
      + 'recommendedChange에 "login-session(또는 해당 핸들러)의 0x030a 요청 분기에서 LOGH_STATIC_SHIPS 게이트로 0x30b를 emit하고 shipClasses를 어디서 가져오는가"를 적어라.',
  },
  {
    key: 'titles-promotion', label: 'RE:titles',
    prompt: COMMON + '\n\n너는 RE/매뉴얼 explorer다. 전선=작위/봉토/진급(M2-3). '
      + 'src/server/logh7-imperial-titles.mjs, content/manual/imperial-titles.json, content/roster/canon-character-posts.json, docs/logh7-post-permissions.md를 읽어라. '
      + '게임플레이 트리거를 확정하라: (a) 진급(功績→rank)이 어느 값/메시지로 클라에 반영되는지(0x0323 캐릭터레코드 rank/계급 필드 오프셋, docs/logh7-info-records-wire.md), '
      + '(b) 신규 유저 직위 발령이 어디로 가는지, (c) 작위/봉토 부여가 어떤 와이어로 표현되는지. '
      + 'recommendedChange에 imperial-titles.mjs를 월드상태/캐릭터레코드에 배선하는 최소 구현(어떤 필드를 0x0323에 반영, 어떤 게이트)을 적어라.',
  },
]

const re = await parallel(reJobs.map((j) => () => agent(j.prompt, { label: j.label, phase: 'RE조사', schema: RE_SPEC })))
const reByKey = {}
reJobs.forEach((j, i) => { reByKey[j.key] = re[i] })
log('RE 완료: ' + reJobs.map((j, i) => j.key + '=' + (re[i] ? re[i].feasibility : 'null')).join(', '))

// ---------- Phase 2: 서버 구현 (직렬 — 실 워크스페이스 파일충돌 방지) ----------
phase('구현')

const implJobs = [
  {
    key: 'economy-0x031f', front: '경제 0x031f 라이브 emit',
    re: reByKey['economy-0x031f'],
    extra: 'buildResponseInformationBaseInner의 bases 인자는 월드상태의 행성/기지 경제(population/food/budget/defense)에서 채운다. '
      + '값 등급을 태그하라(좌표/이름 P1, 수치 P2/P3). 0x0337과 충돌 금지(그건 ResponseTacticsCharacter).',
  },
  {
    key: 'shipclass-0x030a', front: '함선클래스 0x30b 정적 emit',
    re: reByKey['shipclass-0x030a'],
    extra: 'LOGH_STATIC_SHIPS 게이트 유지. shipClasses는 기존 함선스탯 소스(content/ship-stats.json 등)에서. 0x030b 빌더는 이미 +4바이트 수정됨 — 호출만 배선.',
  },
  {
    key: 'titles-promotion', front: '작위/봉토/진급 배선',
    re: reByKey['titles-promotion'],
    extra: 'imperial-titles.mjs의 순수함수를 월드상태/캐릭터레코드 빌드에 연결. 0x0323 rank/계급 필드는 RE 확정 오프셋만 사용. 추측 진급식은 P3 태그.',
  },
]

const impls = []
for (const job of implJobs) {
  if (!job.re || job.re.feasibility === 'blocked' || job.re.recommendedChange === 'no-change') {
    impls.push({ front: job.front, changed: false, description: 'RE가 blocked/no-change 판정 — 구현 보류. RE 요약: ' + (job.re ? job.re.summary : 'null') })
    log('구현 보류: ' + job.key)
    continue
  }
  const r = await agent(
    COMMON + '\n\n너는 maker다. 전선=' + job.front + '. RE 스펙:\n' + JSON.stringify(job.re, null, 2)
      + '\n\n추가 지침: ' + job.extra
      + '\n\n위 recommendedChange를 최소 범위로 src/server/*.mjs(ESM)에 구현하고, tests/server/*.test.mjs에 oracle/단위 테스트를 추가/갱신하라. '
      + '구현 직후 영향받은 파일에 `node --test tests/server/<관련>.test.mjs`를 돌려 통과를 확인하고 localTestResult에 적어라. '
      + '와이어 바이트 오프셋은 RE 확정값만 사용. 추측 수치는 provenance 태그 필수. IMPL을 반환하라.',
    { label: '구현:' + job.key, phase: '구현', schema: IMPL },
  )
  impls.push(r || { front: job.front, changed: false, description: 'maker 실패(null)' })
  log('구현 완료: ' + job.key + ' changed=' + (r ? r.changed : 'null'))
}

// ---------- Phase 3: 전체 테스트 ----------
phase('테스트')
const test = await agent(
  COMMON + '\n\n너는 tester다. `npm run test:server`를 실행하고 결과를 TEST로 반환하라. '
    + '실패가 있으면 실패 테스트명과 핵심 메시지를 output에 적어라. 통과면 총 통과 수를 output에 적어라.',
  { label: '전체테스트', phase: '테스트', schema: TEST },
)

// ---------- Phase 4: 적대적 검증 (병렬, 읽기전용) ----------
phase('검증')
const verifyTasks = []
for (const im of impls) {
  if (!im.changed) continue
  verifyTasks.push(() => agent(
    COMMON + '\n\n너는 verifier다. maker의 완료주장을 적대적으로 반박하라. 전선=' + im.front + '. '
      + 'maker 결과:\n' + JSON.stringify(im, null, 2) + '\n전체테스트:\n' + JSON.stringify(test)
      + '\n\nRE 오프셋이 실제 확정값인지(임의값 아닌지), 변경이 0x0337 등 다른 레코드와 충돌 안 하는지, '
      + 'P2/P3를 원본으로 과장 안 했는지, 게이트가 기본 OFF인지 확인하라. 실클라/trace로만 닫을 잔여는 neededLiveEvidence에 적어라. VERDICT 반환.',
    { label: '검증:' + im.front, phase: '검증', schema: VERDICT },
  ))
}
// 라이브-EXE 스펙(cave/PathB) feasibility 적대 검증
for (const k of ['cave-source', 'cave-hook', 'pathB-widescreen']) {
  const spec = reByKey[k]
  if (!spec) continue
  verifyTasks.push(() => agent(
    COMMON + '\n\n너는 verifier다. 라이브-EXE 스펙을 적대적으로 검증하라. 전선=' + k + '. '
      + 'RE 스펙:\n' + JSON.stringify(spec, null, 2)
      + '\n\n제시된 VA/오프셋/바이트가 실제 디컴파일/바이너리와 일치하는지 redex로 재확인하고, '
      + '패치 사이트의 originalHex가 설치 EXE에서 실제로 그 값인지, cave 데이터소스 타이밍이 맞는지, 부작용(다른 0x325 전달/스케일 사용처)을 점검하라. '
      + 'pass=스펙이 라이브 실험에 바로 쓸 만큼 견고한가. 미진점은 problems/neededLiveEvidence에 구체적으로. VERDICT 반환.',
    { label: '검증:' + k, phase: '검증', schema: VERDICT },
  ))
}
const verdicts = await parallel(verifyTasks)

return {
  re: reByKey,
  impls,
  test,
  verdicts: verdicts.filter(Boolean),
  liveEXEspecs: {
    caveSource: reByKey['cave-source'],
    caveHook: reByKey['cave-hook'],
    pathB: reByKey['pathB-widescreen'],
  },
  note: '메인 에이전트: (1) 검증 통과한 서버구현을 채택하고 전체 744+ 테스트 재확인, '
    + '(2) liveEXEspecs로 code-cave 인코딩→ui_explorer/Frida 라이브 0x0b01 검증, Path B 패치→라이브 스케일 검증을 직렬 수행, '
    + '(3) docs/logh7-loop-state.md와 docs/logh7-goal-roadmap.md 갱신.',
}
