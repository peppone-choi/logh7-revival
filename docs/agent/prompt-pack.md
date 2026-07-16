# Prompt Pack

실제 작업 중 재사용하는 프롬프트 템플릿. 프롬프트를 작성할 때만 로드한다.
모든 템플릿은 Persona / Goal / Output Format / Constraints 4요소를 갖는다.

## Prompt: 기능 분석

### Persona
LOGH VII 서버 코드베이스를 처음 보는 유능한 시니어 엔지니어 (경험은 많지만 이 프로젝트 히스토리는 모름).
### Goal
구현 없이, 요청된 기능의 영향 범위와 실행 가능한 대안을 확정한다.
### Required Context
`.ai/task.md`(있으면), 대상 기능 한 줄 설명, `docs/agent/architecture.md`.
### Output Format
관련 파일 목록(경로) / 유사 구현·기존 테스트 / 영향 범위 / 대안 2개 이상(장단점) / 권장안 / 위험 / 사람 결정 필요 항목.
### Constraints
코드 수정 금지. codegraph 먼저, rg로 확인. Observed/Inferred 구분. 역사 문서 경로 불신.
### Stop Conditions
대안 비교에 필요한 사실이 저장소에서 확인 불가 → UNKNOWN으로 표시하고 질문 목록으로 종료.
### Template
```
[기능 분석] <기능 한 줄>
위 Persona로, <기능>을 구현하지 말고 분석하라.
codegraph→rg→Read 순으로 관련 파일·유사 구현·테스트를 찾고,
영향 범위, 대안 2+개, 권장안, 위험, 사람 결정 필요 항목을 Output Format대로 보고하라.
확인 불가 항목은 UNKNOWN. 코드 수정 금지.
```

## Prompt: 기능 구현

### Persona
승인된 계획을 정확히 수행하는 신중한 구현자.
### Goal
승인된 계획의 범위 안에서 최소 구현 + 검증까지 완료한다.
### Required Context
승인된 계획(또는 ACTIVE `.ai/task.md`), Allowed files, `docs/agent/coding-rules.md`.
### Output Format
변경 파일 목록 / 핵심 diff 요약 / 실행한 검증 명령과 종료 코드 / 미실행 검증 / 남은 일.
### Constraints
승인된 계획 없이는 시작 금지. 범위 밖 수정 금지. 기존 패턴 우선. 주석 한글. 완료 전 `git diff` 직접 검토.
### Stop Conditions
범위 밖 수정 필요 발견(계약 갱신 요청), 검증 같은 증상 3회 실패(Blocked-Loop).
### Template
```
[구현] <항목>
승인된 계획: <링크/인용>. Allowed files: <목록>.
위 범위 안에서만 최소 구현하고, bash scripts/agent/verify-changes.sh --file <경로>
(와이어·세션·영속성 경로면 cd server && npm test)로 검증하라.
완료 보고에 검증 명령·종료 코드·미실행 검증을 구분해 담아라.
```

## Prompt: 근본 원인 디버깅

### Persona
증상이 아니라 원인을 고치는 회의적인 디버거.
### Goal
근본 원인을 실험으로 확정한 뒤에만 수정하고, 회귀 검증까지 마친다.
### Required Context
증상(오류 출력 원문), 재현 명령, `docs/agent/failure-cases.md`.
### Output Format
증상 vs 근본 원인 구분 / 가설 3개+와 각 근거 / 가설별 확인·기각 실험과 결과 / 확정 원인 / 수정 / 회귀 검증 결과.
### Constraints
원인 확정 전 수정 금지. 실패 테스트 삭제·약화·skip 금지. 같은 증상 3회 실패 시 접근 전환.
### Stop Conditions
Blocked-Loop 도달 → 블로커 보고서 작성 후 중단.
### Template
```
[디버깅] <증상 한 줄>
재현: <명령>. 오류 원문: <붙여넣기>.
failure-cases.md에서 유사 패턴을 먼저 확인하고, 가설 3개 이상을 근거와 함께 세워
각각 확인/기각 실험을 실행하라. 근본 원인 확정 전에는 수정하지 마라.
수정 후 재현 케이스 + 관련 테스트로 회귀 검증하고 종료 코드를 보고하라.
```

## Prompt: 코드 리뷰

### Persona
근거 없는 지적을 하지 않는 적대적 리뷰어.
### Goal
diff에서 실제 위험이 있는 결함만 심각도별로 찾아낸다.
### Required Context
대상 diff, `.ai/task.md` 수용 기준, `docs/agent/coding-rules.md`.
### Output Format
심각도(BLOCKER/MAJOR/MINOR/QUESTION)별로 — 파일:위치 / 문제 / 실제 위험 / 재현 또는 근거 / 권장 수정 / 확신 수준(high/medium/low).
### Constraints
코드 수정 금지. 입증 불가 지적은 QUESTION으로. 취향과 결함 구분. 요구사항 대조 필수.
### Stop Conditions
diff가 계약 범위를 벗어나면 리뷰 중단하고 범위 이탈부터 보고.
### Template
```
[리뷰] <대상>
git diff와 .ai/task.md 수용 기준을 대조하고 coding-rules.md 기준으로 검토하라.
각 지적에 파일:위치·문제·실제 위험·근거·권장 수정·확신 수준을 붙여
BLOCKER/MAJOR/MINOR/QUESTION으로 분류하라. 근거 없는 지적 금지.
```

## Prompt: 작업 인수인계

### Persona
다음 에이전트가 대화 기록을 전혀 읽지 못한다고 가정하는 인수인계자.
### Goal
`.ai/handoff.md`만 읽고 작업을 그대로 재개할 수 있게 만든다.
### Required Context
이번 세션의 목표·결과·변경 파일·실행 명령·검증 결과.
### Output Format
`.ai/handoff.md` 구조 그대로 (Goal / Current result / Decisions already made / Files changed / Commands executed / Verification result / Known failures / Do not repeat / Remaining work / Recommended next action / Required human decisions / Files to read first).
### Constraints
결정(승인됨)과 추측(Inferred) 분리. 실행한 검증과 실행하지 않은 검증 분리. 실패한 접근 필수 기록.
### Stop Conditions
없음 — 세션 종료 전 항상 수행.
### Template
```
[인수인계]
.ai/handoff.md를 Output Format 구조로 갱신하라.
결정과 추측, 실행한/안 한 검증을 반드시 분리하고, 실패한 접근과
"다음에 읽을 파일"을 명시하라. .ai/current-state.md와 ownership.md도 함께 갱신하라.
```
