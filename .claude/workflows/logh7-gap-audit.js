// LOGH VII — 종합 갭 감사 (ultracode). 미구현/미작동 갭을 도메인별 병렬 발굴 → 마스터 태스크 목록 합성.
// 읽기전용 서베이(파일 미수정). 결과를 메인이 docs/logh7-gap-backlog.md 로 정리한다.

export const meta = {
  name: 'logh7-gap-audit',
  description: 'LOGH VII 전 도메인 갭(미구현/미작동) 병렬 발굴 + 마스터 태스크 목록 합성',
  whenToUse: '구현 못 한 갭을 전부 찾아 닫는 작업의 기준 백로그를 만들 때',
  phases: [{ title: '갭 발굴' }, { title: '합성' }],
}

const COMMON = [
  'LOGH VII revival(E:\\logh7-revival). 권위적 Node.js 서버(src/server/*.mjs)가 디컴파일 G7MTClient.exe가 파싱하는 와이어를 emit.',
  'RE 조회: `python tools/logh7_redex.py func 0x<addr>` / `grep "<sym>"`. RE 인덱스 .omo/ghidra/export/G7MTClient/.',
  '먼저 읽어 현 상태/기존계획 파악(중복 금지): docs/logh7-goal-roadmap.md, docs/logh7-loop-state.md, docs/logh7-current-work-register-2026-06-17.md, AGENTS.md.',
  '데이터 등급 P0(클라/와이어 확정)/P1(매뉴얼·PDF)/P2(IV-EX·넷마블)/P3(절차/플레이스홀더).',
  '너는 READ-ONLY 갭 서베이어다. 파일 수정 금지. 네 도메인에서 "구현 안 됨/작동 안 함/플레이스홀더/미검증"인 구체 갭만 증거와 함께 수집한다.',
  '각 갭: 무엇이 빠졌나, 증거(파일:라인 또는 함수 VA), 심각도(blocker=플레이 막음/high/med/low), 대략 공수(S/M/L), 의존성.',
  '이미 된 것(744+ 테스트, 한글화, 데이터추출, cave 인코딩 등)을 갭으로 재나열하지 말 것 — 진짜 미구현만.',
].join('\n')

const GAP = {
  type: 'object', additionalProperties: false,
  properties: {
    domain: { type: 'string' },
    summary: { type: 'string' },
    gaps: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        properties: {
          title: { type: 'string' },
          what: { type: 'string', description: '무엇이 빠졌나/안 되나' },
          evidence: { type: 'string', description: '파일:라인 또는 함수 VA 인용' },
          severity: { type: 'string', enum: ['blocker', 'high', 'med', 'low'] },
          effort: { type: 'string', enum: ['S', 'M', 'L'] },
          dependsOn: { type: 'string' },
        },
        required: ['title', 'what', 'severity', 'effort'],
      },
    },
  },
  required: ['domain', 'summary', 'gaps'],
}

const MASTER = {
  type: 'object', additionalProperties: false,
  properties: {
    criticalPath: { type: 'array', items: { type: 'string' }, description: '플레이/무유저 구동을 막는 blocker 순서' },
    tasks: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          domain: { type: 'string' },
          severity: { type: 'string', enum: ['blocker', 'high', 'med', 'low'] },
          effort: { type: 'string', enum: ['S', 'M', 'L'] },
          dependsOn: { type: 'string' },
          why: { type: 'string' },
        },
        required: ['id', 'title', 'domain', 'severity', 'effort'],
      },
    },
    themes: { type: 'array', items: { type: 'string' } },
  },
  required: ['tasks', 'criticalPath'],
}

phase('갭 발굴')

const domains = [
  { key: 'inworld-command', label: '갭:인월드명령/함대배치', prompt:
    '도메인=인월드 전략 명령 + 함대 배치/이동. 조사: P0-02 0x0b01(CommandSelectGrid)은 cave로 cur 채워 카메라 센터까지 라이브확정됐으나 '
    + '실제 0x0b01 outbound는 move-UI 제스처(함대 선택→이동모드) 미발화(클릭이 0x0300 info만). 또 서버 fleetCell 기본=(50,25)=2550=임의 항성(플레이어 함대가 거기 있으면 안 됨). '
    + '갭 발굴: (a) 0x0b01을 내는 전략 move-UI 제스처/모드(FUN_004d6310 호출 조건, HUD 이동버튼)를 RE로 미확정, (b) 진영별 카논 시작 함대 배치 셀이 서버에 없음(매뉴얼 content/manual/* + gin7manualsaved.pdf에서 오딘/하이네센 등 시작 배치 추출 필요), '
    + '(c) cave가 하드코딩 2550 대신 실제 own-fleet 셀(--cell-mem, own char-id@+0x3584a0→+0x36a8b4→flagship+0x24→0x41a368+0x08) 미사용, (d) in-world 함대조작(0x0400 이동/0x0423·0x0424 broadcast) 라이브 미검증. src/server/logh7-login-session.mjs, logh7-command-engine.mjs 참조.' },
  { key: 'strategic-ai', label: '갭:전략NPC AI', prompt:
    '도메인=전략 NPC AI(유저 없이 돌아가는 갤럭시). 현 logh7-npc-ai.mjs는 전술공간(x/z 함선 사격/이동/후퇴, runNpcTick)만. '
    + '갭: NPC 사령관이 갤럭시 그리드(80성계)서 함대 이동·적탐색·교전결정·영토방어·증원·내정을 자율 수행하는 전략 시뮬 전무. '
    + '서버 권위적이라 NPC는 0x0b01 없이 world-state 직접 조작 가능. 발굴: 전략틱 루프, 사령관 의사결정(카논스탯/직위 기반), 함대-성계 이동, 진영 전쟁 진행, 무유저 구동 진입점. logh7-world-state.mjs, logh7-strategy.mjs, logh7-npc-ai.mjs 참조.' },
  { key: 'content-impl', label: '갭:컨텐츠구현', prompt:
    '도메인=컨텐츠 구현/배선. 워크플로가 경제0x031f(LOGH_BASE_ECONOMY)·함선0x30b(LOGH_STATIC_SHIPS)·작위titlename을 게이트뒤 구현(753테스트). '
    + '갭: (a) 이 게이트들이 기본 OFF+라이브 미검증, (b) 진급(功績→rank) 트리거·봉토/작위 수여 opcode 라우팅 미배선(2차보류), (c) 인사발령·직위권한 게임플레이 미연결, (d) 0x0337 이중배정(battle-engine vs base-economy) 충돌. '
    + 'src/server/logh7-imperial-titles.mjs, logh7-personnel.mjs, logh7-base-economy.mjs, docs/logh7-post-permissions.md 참조.' },
  { key: 'ui-values', label: '갭:UI값표시', prompt:
    '도메인=UI 값 표시(HUD/패널이 실제 수치를 제대로 보여주기). 갭: (a) 0x031f 경제레코드 다수 필드가 PROVISIONAL 오프셋(라벨 미해결)이라 population/food/approval 등이 0 유지→패널 빈값(src/server/logh7-base-record.mjs:70-78). '
    + '(b) 각 HUD 패널(함대스탯/캐릭터능력치/행성경제/날짜·재정)이 어느 와이어레코드의 어느 필드를 읽는지 매핑+그 필드가 실데이터인지 RE로 검증 필요. (c) 행성명/인물명 등 텍스트 필드가 실제 표시되는지. '
    + '클라 파서(0x031f=FUN_00414c70, 0x0323=FUN_00419300) vs 서버 빌더 오프셋 대조로 "0/garbage로 뜨는 패널" 발굴. docs/logh7-info-records-wire.md 참조.' },
  { key: 'fonts', label: '갭:폰트', prompt:
    '도메인=폰트. 한글화는 cp949 String.txt+charset로 완료됐으나 사용자가 "폰트가 너무 심심+옛날포맷"이라 더 나은 폰트 원함. '
    + 'RE: CreateFontA가 FUN_004aec70/FUN_004b0960에서 face=*(param_1+0x60)/구조체 필드로 데이터주도 호출(하드코딩 아님). 발굴: (a) face name이 어디서 오는지(전역/리소스/config) 추적해 더 예쁜 한글폰트로 교체하는 법, '
    + '(b) 폰트 번들(임베드) + face name 패치 vs 시스템폰트 설치, (c) charset(HANGEUL 0x81)·품질(ANTIALIASED)·크기 핸들링, (d) 일/한 폰트 분기. logh7-font-* 문서/메모 참조.' },
  { key: 'remaster', label: '갭:리마스터/해상도', prompt:
    '도메인=리마스터/해상도. 해상도 감지+프리셋·로비B패치(lobby-res.json)·워터마크off·PathB(widescreen-ui.json)·텍스처파이프라인은 준비됨. '
    + '갭: (a) 로비B/PathB/워터마크 라이브 시각검증 미완(1920×1080 실적용), (b) 풀-16:9 HUD/로비 = 4:3 앵커라 uniform스케일시 필러박스 → HUD 앵커 와이드 재배치(FUN_004ea610 RECT 멤버) 미구현, (c) .tga 에셋 AI 업스케일 실행+배치 미완, (d) 게임내 전술/전략 뷰 스케일 일관성. '
    + 'tools/logh7_graphics_config.py, logh7_texture_pipeline.py, docs/logh7-graphics-remaster.md 참조.' },
  { key: 'localization', label: '갭:현지화/텍스트', prompt:
    '도메인=현지화/텍스트. 전체번역(20.dat)·글로벌949·메뉴한글은 됨. 갭: (a) 하드코딩 바이너리 UI 문자열(153개 .rsrc, hardcoded-ui-ja.json) 현지화 적용 미완, (b) 로그인 Win32 다이얼로그 리소스 한글화 적용 검증, '
    + '(c) 동적 생성 문자열(날짜·수치 포맷)·신규 컨텐츠(작위명 등) 번역 누락, (d) 일↔한 텍스트만 교체 파이프라인 일반화. tools/logh7_binary_strings.py, content/localization/* 참조.' },
  { key: 'modding', label: '갭:모딩/확장', prompt:
    '도메인=모딩/확장성(패러독스급). mod-loader·content-caps·imperial-titles·예제mod·TCF패커는 됨. 갭: (a) 초상화 신규 슬롯 라이브 생성(face-atlas-expand) 미적용, '
    + '(b) 클라측 데이터(String.txt/model/galaxy) 외부화 모딩 미흡, (c) 커스텀 국가/시나리오 데이터주도 미완, (d) 모드 문서/스키마. src/server/logh7-mod-loader.mjs, tools/logh7_tcf_pack.py 참조.' },
  { key: 'server-correctness', label: '갭:서버데이터정합', prompt:
    '도메인=서버 데이터 정합/RE확정성. 갭: PROVISIONAL/추측 오프셋이나 수치가 기본값으로 남은 곳, P2/P3가 P0처럼 쓰인 곳, 와이어 레이아웃 미확정 레코드, '
    + 'opcode 충돌(0x0337), 미구현 핸들러 분기. src/server/*.mjs 전반 + docs/logh7-info-records-wire.md, logh7-implementation-specs.md 대조로 "RE로 닫아야 할" 항목 발굴.' },
]

const surveys = await parallel(domains.map((d) => () =>
  agent(COMMON + '\n\n' + d.prompt + '\n\nGAP을 반환하라(구체 갭 위주, 추측 최소).',
    { label: d.label, phase: '갭 발굴', schema: GAP, agentType: 'general-purpose' })))
const valid = surveys.filter(Boolean)
log('갭 발굴 완료: ' + valid.map((s) => (s.domain || '?') + '=' + (s.gaps ? s.gaps.length : 0)).join(', '))

phase('합성')
const master = await agent(
  COMMON + '\n\n너는 합성자다. 아래 도메인별 갭 서베이를 통합해 마스터 태스크 목록을 만든다:\n'
    + JSON.stringify(valid, null, 1).slice(0, 60000)
    + '\n\n중복 병합, 의존성 정리, 심각도×공수로 우선순위. criticalPath=무유저 구동+플레이가능을 막는 blocker 순서. '
    + '각 task: 안정 id, 제목, 도메인, 심각도, 공수, 의존성, why. MASTER를 반환하라.',
  { label: '합성:마스터태스크', phase: '합성', schema: MASTER, agentType: 'general-purpose' })

return { surveys: valid, master, note: '메인 에이전트가 docs/logh7-gap-backlog.md로 정리하고 criticalPath부터 닫는다.' }
