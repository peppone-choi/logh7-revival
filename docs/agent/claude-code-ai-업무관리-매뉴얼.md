# Claude Code로 이 레포에서 일하는 법 — 사용자 매뉴얼

> 이 매뉴얼은 딩코딩코 「AI 네이티브 개발자」 강의 1~4주차의 방법론(프롬프트 설계·CLAUDE.md·커맨드·훅·스킬·MCP·검증 루프·서브에이전트)을 **LOGH VII Revival 레포의 실제 하네스에 맞춰 재구성**한 것입니다.
> 강의의 일반 예시(claude-squad·Terraform·Langfuse·Ralph Loop 등)는 이 레포에 없으므로 절차로 쓰지 않습니다. 여기에 나오는 모든 명령·경로·훅·스킬·에이전트는 이 저장소에 실제로 존재하는 것뿐입니다.
>
> 독자는 이 레포에서 Claude Code로 일을 시키는 **사용자(업무 지시자)**입니다. AI 내부 규칙을 나열하는 문서가 아니라, "무엇을 치고, 무엇을 확인하고, 무엇을 승인하는가"를 다룹니다.
> 자매 문서로 같은 방법론의 Codex 버전 [`codex-user-manual.md`](codex-user-manual.md)가 있습니다.

---

## 목차

| 장 | 내용 |
|---|---|
| **0. 한눈에 보는 시스템** | 이 레포의 5층 구조와 매니저 마인드 |
| **1. 시작 전 마인드셋** | 위임·협력·자동화 3단계, LLM 3한계, 페.목.형.제 |
| **2. 세션 시작** | 프로젝트 열기, SessionStart 훅, `.ai/task.md` EMPTY 규칙, `/start-task` |
| **3. 하루 업무 루틴** | Jira(LOGH7-*) → `/start-task` → `/implement` → 검증 → `/review` → `/checkpoint` |
| **4. 일 시키는 법** | 커맨드 7종, 서브에이전트 위임(model 명시), 에이전트 6종 |
| **5. 검증과 완료** | 검증 행렬, `npm test`, `verify-changes.sh`, 라이브 QA 증거 |
| **6. 승인 경계** | 사람이 승인해야 하는 것, ADR-LITE로 결정 기록 |
| **7. 세션 종료·인수인계** | `/checkpoint`, 상태 파일, 문서 현행화 게이트(Stop 훅) |
| **8. 문제가 생기면** | Blocked-Loop Rule, known-issues, 훅 차단, Instruction Conflict |
| **9. 부록** | 명령어 치트시트, 프롬프트 템플릿, 강의 일반론 참고 목록 |

---

## 0. 한눈에 보는 시스템 — 이 레포의 5층

이 프로젝트는 2008년 서비스 종료된 일본 MMO **은하영웅전설 VII**를 원본 클라이언트 + 자체 권위 서버로 되살립니다. 원본 클라이언트가 1차 제품이자 **호환 오라클**이라, "그럴듯하게 동작"이 아니라 "원본과 실제로 호환"을 증거로 증명해야 합니다. 그래서 하네스가 유독 검증·승인 중심입니다.

당신의 역할은 코드를 직접 짜는 실행자가 아니라, **AI 팀에게 일을 지시하고 증거로 검수하는 매니저**입니다. 시스템은 다섯 층입니다.

| 층 | 이 레포의 실체 | 역할 |
|---|---|---|
| ① 규칙 | 루트 `CLAUDE.md`, `.ai/task.md`, `.ai/decisions.md`, `.ai/key-facts.md` | 프로젝트 헌법과 지금 이 작업의 계약 |
| ② 재사용 부품 | 커맨드 7종(`.claude/commands/`), 훅 5종(`.claude/settings.json`), 스킬(`.agents/skills/`) | 반복 절차의 자동 실행 장치 |
| ③ 손과 발 | MCP(`.mcp.json` + `.claude/settings.local.json` allowlist): `code-review-graph`, `atlassian`(Jira) | AI가 외부 시스템을 조작하는 통로 |
| ④ 팀 | 에이전트 6종(`.claude/agents/`), `logh7-orchestrator` 스킬 | 역할별 AI 팀원을 위임으로 부리는 체계 |
| ⑤ 자동 루프 | `scripts/agent/verify-changes.sh`, 검증 행렬(`docs/agent/verification.md`), 문서 현행화 게이트 | 완료를 증거로 강제하는 장치 |

핵심 공식 하나만 기억하세요. **AI 에이전트 = LLM 모델 + 하네스(환경 설계)**. 모델은 못 바꿔도 하네스(규칙·도구·검증 체계)는 당신이 설계합니다. 이 다섯 층이 그 하네스입니다.

### 매 세션 자동으로 벌어지는 일 (사용자가 알아야 할 훅 5종)

이 레포는 `.claude/settings.json`에 훅 5개를 켜 둡니다. 당신이 아무것도 안 해도 아래가 자동으로 돕니다.

| 이벤트 | 훅 스크립트 | 사용자에게 보이는 효과 |
|---|---|---|
| SessionStart | `bootstrap-skills.sh` | 세션이 열릴 때 프로젝트 스킬 상태를 로컬 점검(네트워크·자동설치 없음) |
| UserPromptSubmit | `inject-key-facts.sh`, `turn-snapshot.sh` | 매 턴 `.ai/key-facts.md`(≤40줄) 자동 주입 + 턴 스냅샷 |
| PreToolUse | `protect-sensitive-files.sh` | 비밀 파일(`.env*`·`*.pem`·`*.key`·`credentials*`·`secrets*` 등) 읽기·쓰기 시도를 **차단** |
| PostToolUse | `verify-changes.sh` | 파일을 편집하면 구문 검사 + 이름 매칭 테스트를 자동 실행 |
| Stop | `stop-doc-gate.sh` | 파일을 바꾼 턴은 관련 문서·상태 파일을 갱신하기 전엔 턴이 끝나지 않음 |

즉 이 레포에서 Claude Code는 "혼자 조심하는" 게 아니라 **훅이 강제로 안전벨트를 채운** 상태로 일합니다. 8장에서 자세히 다룹니다.

---

## 1. 시작 전 마인드셋

### 1.1 위임 → 협력 → 자동화

| 단계 | 하는 일 | 이 레포의 예 |
|---|---|---|
| 위임 | 명확한 반복 작업을 통째로 맡긴다 | 문자열 추출, 라운드트립 테스트 작성, 문서 링크 점검 |
| 협력 | 판단이 필요한 작업을 주고받는다 | 프로토콜 해독, 서버 세션 설계, 근본 원인 디버깅 |
| 자동화 | 훅·검증 행렬이 사람 개입 없이 게이트를 지킨다 | PostToolUse 검증, stop-doc-gate, Blocked-Loop 차단 |

이 레포의 "자동화"는 무인 배포가 아니라 **완료 판정의 자동화**입니다. 배포·병합은 여전히 사람 승인입니다(6장).

### 1.2 LLM의 3가지 한계와 이 레포의 대응 장치

| 한계 | 증상 | 이 레포의 대응 |
|---|---|---|
| 확률적 앵무새 | 이해가 아닌 패턴 예측. 정밀 계산·바이너리 오프셋에 취약 | 추측을 사실로 승격 금지. RE 근거(FUN_xxx·VA 오프셋) 없이 프로토콜 구현 금지 |
| 금붕어 기억력 | 세션이 끝나면 잊는다. 긴 대화에선 중요한 제약이 묻힌다 | `.ai/key-facts.md` 매 턴 주입, 정본은 `.ai/`·`docs/` 파일, 재개는 `/checkpoint` 산출물 |
| 그럴듯한 거짓말 | 모르면 아는 척(환각), 검증 안 하고 "완료" 선언 | 라이브 검증 없이 완료 주장 금지. 과거 수치는 fresh gate가 아님 |

### 1.3 좋은 지시의 4요소 — "페.목.형.제"

모든 지시는 네 가지를 갖추면 품질이 급상승합니다.

1. **페르소나**: "죽은 게임 복원·자체 서버 호환성을 목적으로 하는 정적 분석가야" — 목적에 맞는 역할
2. **목표**: 무엇을 원하는지 한 문장으로
3. **형식**: 결과물 형태 지정 (변경 파일 목록, 종료 코드, Observed/Inferred 구분까지)
4. **제약조건**: 지켜야 할 규칙 (범위 밖 수정 금지, 근거 없는 오프셋 금지 등)

이 레포는 이 4요소를 [`docs/agent/prompt-pack.md`](prompt-pack.md)에서 **7섹션 표준**(Persona / Goal / Required Context / Output Format / Constraints / Stop Conditions / Template)으로 확장해 정본화했습니다. 커맨드 7종이 이 팩을 그대로 로드하므로(4장), 당신은 슬래시 명령만 쳐도 페.목.형.제가 자동으로 붙습니다.

프로젝트 예시로 옮긴 안전장치 한 문장:

> "이 게임 규칙은 CD 이미지와 공식 매뉴얼이 근거야. 자산 값이 확인 안 되면 지어내지 말고 UNKNOWN으로 표시하고 나한테 질문 목록으로 물어봐."

**기억하세요: 이 레포에서 완료는 자신감이 아니라 증거로 증명합니다.** "알아서 잘해줘"는 금지어입니다.

---

## 2. 세션 시작 — 프로젝트 열기부터 작업 계약까지

### 2.1 프로젝트 루트를 연다

Claude Code에서 저장소 루트(`CLAUDE.md`, `.ai/`, `docs/`, `scripts/`, `server/`가 보이는 곳)를 엽니다. 하위 폴더에서 시작해도 훅은 Git 루트를 찾지만, 루트가 파일 구조 확인에 편합니다.

세션이 열리면 SessionStart 훅(`bootstrap-skills.sh`)이 스킬 상태를 로컬 점검합니다. 수동으로 다시 보고 싶으면:

```bash
bash scripts/agent/bootstrap-skills.sh --check
```

- `OK`: 프로젝트가 요구하는 스킬(매니페스트 `scripts/agent/required-skills.tsv`)이 모두 있음
- `MISSING` / `STALE`: 스킬이 없거나 잠금 정보와 다름 → 자동 덮어쓰지 않고 검토 필요

새 외부 스킬 설치는 **사람 승인 후** `.agents/skills/`(skills.sh 표준)에만 합니다. 전역 설치·자동 덮어쓰기는 하지 않습니다.

### 2.2 첫 요청은 구현이 아니라 브리핑

긴 대화나 오래된 보고를 최신 사실로 믿지 않는 것이 이 레포의 원칙입니다. 세션을 열면 상태부터 복구하세요.

```
이 프로젝트의 현재 상태를 읽기 전용으로 브리핑해줘.
.ai/task.md, .ai/decisions.md, .ai/current-state.md, .ai/handoff.md, .ai/ownership.md와
docs/agent/README.md 라우터를 확인하고 현재 목표·열린 작업·블로커·다음 권장 작업만 알려줘.
파일과 외부 시스템은 수정하지 마.
```

Claude Code는 CLAUDE.md의 **Read Order**대로 맥락을 복구합니다: `.ai/task.md` → `.ai/decisions.md` → `docs/agent/README.md`(작업 유형별 문서 라우팅) → `.ai/current-state.md`·`.ai/handoff.md` → 해당 Runbook → 관련 코드·테스트.

### 2.3 `.ai/task.md`가 EMPTY면 구현 금지

이 레포의 절대 규칙입니다. **`.ai/task.md`가 비어 있으면 사람 승인 전에는 아무 구현도 하지 않습니다.** 대신 작업 계약 초안을 만들고 당신의 승인을 기다립니다.

작업 계약은 `/start-task`로 만듭니다. 이 커맨드는 코드를 수정하지 않고 계획만 세웁니다.

```
/start-task 두 계정으로 월드 진입까지 되는 서버 슬라이스를 만들고 싶어.
문제·사용자 가치·범위/비범위·측정 가능한 수용 기준·Allowed files·검증 계획·사람 승인 지점을
계약 초안으로 정리해줘. 아직 구현하지 마.
```

계약을 보고 다음을 확인한 뒤 승인합니다.

- 해결할 문제가 한 문장으로 명확한가?
- 범위와 비범위가 구분됐는가?
- 수정 가능한 파일이 실제 경로(Allowed files)로 제한됐는가?
- 수용 기준이 테스트나 라이브 관찰로 판정 가능한가?
- 로드맵 게이트(현재 M4 선행 P0→P1→P2) 순서를 건너뛰지 않는가?

충분하면 승인합니다. `.ai/task.md`의 Status를 ACTIVE로 만드는 것은 **사람 승인 사항**입니다.

```
이 계약을 승인해. Status를 ACTIVE로 바꾸고, 승인된 Allowed files 안에서만 구현해.
검증 통과 전엔 완료라고 하지 말고, push·PR·merge는 하지 마.
```

---

## 3. 하루 업무 루틴 — 티켓에서 완료까지

업무 상태의 정본은 Jira(사이트 `pepponechoi-jira.atlassian.net`, 프로젝트 **LOGH7**)입니다. Atlassian MCP가 현재 세션에 노출돼 있을 때 자연어로 백로그를 조회할 수 있습니다(활성화 전제와 계층 규칙은 [`lifecycle-planning.md`](lifecycle-planning.md)).

전형적인 하루는 아래 흐름입니다. 각 화살표가 실제 슬래시 명령입니다.

```
Jira LOGH7-* 티켓 확인 → /start-task → /analyze 또는 /implement
  → bash scripts/agent/verify-changes.sh --file <경로> (또는 cd server && npm test)
  → /review → /checkpoint
```

### 3.1 오늘 할 일 확인 (Jira)

```
Jira LOGH7 프로젝트에서 우선순위 높은 '해야 할 일'을 보여줘.
Epic→Story→Task→Sub-task로 묶고, 각 항목의 크기·블로커·완료 기준·연결된 GitHub Issue를 요약해.
아직 상태는 바꾸지 마.
```

Atlassian 커넥터가 이 세션에 없으면 Jira 상태를 추측하지 않고 로컬 `.ai/task.md`와 `docs/logh7-roadmap-current.md`(로드맵 정본)를 봅니다.

### 3.2 작업 시작 → 계약 고정

```
/start-task LOGH7-58을 시작해.
Jira 설명과 연결된 GitHub Issue를 확인하고, 목표·범위·비범위·Allowed files·수용 기준·검증 명령·승인 지점을
.ai/task.md 계약으로 정리해줘. 승인 전엔 구현하지 마.
```

### 3.3 조사할지 구현할지 고른다

- **읽기 전용 조사**가 필요하면 `/analyze` (영향 범위·유사 구현·대안 비교, 코드 수정 금지)
- **승인된 계획 구현**이면 `/implement` (최소 범위, 소유 파일만, 검증 포함)

```
/analyze 월드 진입 시 채팅 채널이 열리는 경로를 구현하지 말고 분석해.
codegraph→rg→Read 순으로 관련 파일·기존 테스트를 찾고, 영향 범위·대안 2개 이상·권장안·위험·
사람 결정 필요 항목을 보고해. 확인 불가 항목은 UNKNOWN. 코드 수정 금지.
```

```
/implement 승인된 LOGH7-58 계약을 구현해.
작은 회귀 테스트로 실패를 먼저 관찰하고 최소 수정한 뒤, 변경 파일별 검증을 실행하고 git diff를 직접 검토해.
```

### 3.4 검증 → 리뷰 → 체크포인트

```
/verify 현재 diff를 변경 유형별로 분류하고 docs/agent/verification.md 행렬대로 최소 검증을 실행해.
실행 명령과 종료 코드를 그대로 기록하고, 미실행 검증은 미실행으로 구분해.
```

```
/review 현재 diff를 .ai/task.md 수용 기준과 대조해 리뷰해.
BLOCKER/MAJOR/MINOR/QUESTION 순으로 실제 위험과 근거만 보고하고, 코드는 고치지 마.
```

```
/checkpoint 이 작업을 안전하게 중단할 수 있게 상태를 최신화해.
.ai/current-state.md·handoff.md·ownership.md를 갱신하고, 다음 한 단계와 소유 중인 파일을 기록해.
```

작업 브랜치 commit은 검증 통과 후 허용되지만(ADR-LITE-005), push·PR 생성·merge는 6장의 승인이 필요합니다.

---

## 4. 일 시키는 법 — 커맨드 7종과 에이전트 팀

### 4.1 커맨드 7종 (언제 무엇을 치는가)

7개 슬래시 명령은 `.claude/commands/`에 정의돼 있고, 각각 `docs/agent/prompt-pack.md`의 대응 팩(7섹션 표준)을 로드합니다. 당신은 명령만 치면 페.목.형.제가 자동으로 붙습니다.

| 커맨드 | 언제 쓰나 | 코드 수정 |
|---|---|---|
| `/start-task` | 새 작업 시작, 중단 작업 재개, 계약 초안 | 없음 |
| `/analyze` | 영향 범위·RE·프로토콜·대안 비교 조사 | 없음 |
| `/implement` | ACTIVE 계약과 소유권 확보 후 최소 구현 | 있음(Allowed files만) |
| `/debug` | 오류·테스트 실패·예상 밖 동작의 근본 원인 | 원인 확정 후만 |
| `/verify` | 구현 후, 완료 주장 전 fresh 검증 | 없음 |
| `/review` | 병합 전·다른 에이전트 결과 diff 리뷰 | 없음 |
| `/checkpoint` | 세션 종료·긴 작업 중단·에이전트 교체 | 상태 파일만 |

이 순서가 CLAUDE.md의 **Mandatory Work Loop**입니다: Explore → Plan → (범위 확인) → Implement minimally → Verify → Review diff → Update state → Report.

### 4.2 서브에이전트 위임 — 메인 세션은 Advisor 전용

이 레포에는 비용 규칙이 있습니다. **메인 세션(Fable)은 Advisor 전용**입니다 — 요구사항 분해·설계 결정·브리프 작성·검증·승인만 직접 하고, 긴 파일 읽기·전수 탐색·구현 노동은 서브에이전트에 위임합니다. 근거: [`collaboration-protocol.md`](collaboration-protocol.md).

위임할 때 **model 명시가 필수**입니다(생략하면 세션 모델을 상속해 잡무에 최고가 토큰을 씁니다). 라우팅은 둘 중 하나입니다.

- **opus**: 설계 결정(아키텍처·프로토콜·스키마), 다중 가설 근본원인 진단, 여러 파일·계층 추론 구현, 모호한 명세 확정, 최종 판정
- **haiku**: 그 외 전부 — 명확한 지침의 구현·수정·테스트, 명령 실행·조회·파일 스윕. 애매하면 haiku 먼저

병렬화는 **독립 조사·테스트·리뷰·문서화에만** 씁니다. 같은 기능을 두 에이전트가 병렬 구현하거나 같은 파일을 동시에 쓰지 않습니다(single-writer-per-file, `.ai/ownership.md`에 등록·해제).

좋은 브리프에 반드시 넣을 것: 파일 경로, 이미 확인한 사실, 왜(의도), 금지 범위(범위 밖 수정·작업트리 리셋·미지시 기능 금지), 완료 테스트.

### 4.3 도메인 작업은 `logh7-orchestrator`로 분해

로그인·로비·월드·채팅 같은 기능 요청이나 자산추출·RE·프로토콜·서버·한글화·라이브QA 작업은 `logh7-orchestrator` 스킬이 전문 에이전트 팀으로 분해·조율합니다. 단순 질문은 그냥 물어보면 됩니다.

### 4.4 에이전트 6종과 시키는 일

에이전트는 `.claude/agents/`에 이미 정의돼 있습니다(frontmatter에 model 없음 — 호출 시점에 opus/haiku 지정). 새로 만들 필요 없이 바로 위임하면 됩니다.

| 에이전트 | 담당 | 예시 지시 |
|---|---|---|
| **extract-miner** | CD/설치본에서 자산·데이터 추출, 정본 카탈로그(JSON) | "원본 CD에서 함선 스탯 테이블을 추출해 JSON 카탈로그로 만들고, 값의 출처(파일·오프셋)를 provenance로 붙여줘." |
| **re-analyst** | Ghidra 정적 분석, 함수·구조체·오프셋 근거 확정 | "죽은 게임 복원·자체 서버 호환 목적의 정적 분석이야. binary-triage로 개괄한 뒤 로그인 핸들러 FUN_xxx와 VA 오프셋을 Observed/Inferred 구분해 확정해. EXE hash·image base·sentinel이 lineage manifest와 불일치면 분석 대신 게이트 차단을 보고해." |
| **wire-engineer** | 클라↔서버 와이어 프로토콜 인코딩/디코딩 구현·검증 | "re-analyst가 확정한 레이아웃(근거 링크)만 써서 server/src/wire/에 로그인 메시지 인코더/디코더를 구현하고, 라운드트립 테스트로 검증해. 근거 없는 필드는 만들지 말고 질문으로 반환해." |
| **server-dev** | 권위적 게임 서버(Node.js) 구현 — 세션·명령·월드·영속성 | "승인된 계약 범위에서 로그인→로비 세션 전이를 TDD로 구현하고 cd server && npm test로 검증해." |
| **localizer** | 한글화 — cp932/cp949, GDI 폰트, String.txt, 채팅 한글 | "extract-miner 원문과 re-analyst 인코딩 오프셋을 확인하고 ko 문자열 팩을 만들어. CP932 자산을 임의로 UTF-8 변환하지 말고, grammar-checker·humanize-korean으로 검토한 뒤 되돌림 절차를 붙여." |
| **live-qa** | 원본 클라를 자체 서버에 붙여 실제 구동, 증거 수집 | "logh7-wine-live-qa 스킬의 필수 입력과 fail-closed 조건을 먼저 확인하고, 통과하면 로그인 시나리오를 구동해 스크린샷·서버로그를 증거로 남겨." |

---

## 5. 검증과 완료 — "라이브 검증 없이 완료 없음"

### 5.1 대원칙

AI는 테스트가 깨져 있어도 "완료했습니다"라고 말하곤 합니다. 이 레포는 **증거(테스트 출력·종료 코드·스크린샷) 없는 완료 주장을 완료로 인정하지 않습니다.** 과거 수치는 historical baseline일 뿐 fresh gate가 아닙니다.

### 5.2 실재하는 검증 명령

정본은 [`docs/agent/verification.md`](verification.md)입니다. 실재하는 것만 씁니다.

```bash
# 단일 파일 구문 + 이름 매칭 테스트 (PostToolUse 훅과 같은 로직)
bash scripts/agent/verify-changes.sh --file <경로>

# 서버 전체 + Python 테스트 (pytest 미설치면 Python은 SKIP 보고)
bash scripts/agent/verify-changes.sh --full

# 서버 전체 테스트 (node --test)
cd server && npm test

# 서버 구동 (포트 47900)
cd server && npm start
```

> 참고: `npm test`는 2026-07-16 기준 460개였지만, 이 숫자는 baseline입니다. 재실행 전에는 "460 통과"를 완료 근거로 재사용하지 않습니다.

### 5.3 변경 유형별 최소 검증 (행렬 요약)

모든 명령을 매번 돌리지 않습니다. 변경 유형에 맞는 최소 검증만 고릅니다.

| 변경 유형 | 최소 검증 | 완료 조건 |
|---|---|---|
| `server/src/**` 코드 | `verify-changes.sh --file`, 와이어·세션·영속성 경로면 `npm test` 전체 | 종료 코드 0 + `git diff` 직접 검토 |
| `server/tests/**` | 해당 테스트 파일 실행 | 실패 테스트 삭제·약화·skip 없음 |
| 와이어 프로토콜·클라이언트 가시 동작 | 위 테스트 전부 **+ 라이브 QA 증거** | 테스트 + 라이브 증거, 또는 "라이브 미검증" 명시 보고 |
| 문서(`docs/`·`*.md`) | 참조 경로·링크 실재 확인 | 링크 대상 파일 존재 |
| `.mcp.json` | JSON 파싱 | 파싱 통과 + 시크릿 값 기입 0 |

전체 행렬(마이그레이션·훅·스킬·워크플로 등)은 verification.md에 있습니다.

### 5.4 라이브 QA 증거 요구법

클라이언트에 보이는 변화는 자동 테스트만으로 완료라고 할 수 없습니다. 현재 binary hash와 **격리된 run 전용 WINEPREFIX**에서 수집한 라이브 증거가 필요합니다. live-qa 에이전트에게 시킬 때는 증거를 명시적으로 요구하세요.

```
live-qa로 로그인→로비 진입을 실제 구동해줘.
logh7-wine-live-qa SKILL의 필수 입력(REPO_ROOT·WINE_BIN·WINEPREFIX·CLIENT_EXE·LINEAGE_MANIFEST 등)을
모두 채우고 fail-closed 조건을 먼저 확인해. 하나라도 걸리면 실행하지 말고 blocked manifest를 남겨.
통과하면 스크린샷과 서버로그 경로를 증거로 보고하고, 서버 로그와 클라 화면을 교차비교해줘.
```

기본 `~/.wine` 사용, EXE hash·image base·sentinel 불일치 상태의 launch/attach/patch는 금지입니다. **fail-closed는 버그가 아니라 설계**입니다.

---

## 6. 승인 경계 — 사람이 결정하는 것

훅과 검증이 절차를 자동화해도, 아래는 **당신의 명시적 승인** 없이는 실행되지 않습니다(CLAUDE.md `Human Approval Required`, ADR-LITE-005).

| 자동으로 되는 범위 | 사람 승인 필요 |
|---|---|
| 읽기·검색·상태 조회 | 비밀 파일 읽기(승인으로도 불가 — 훅이 차단) |
| ACTIVE 계약의 Allowed files 수정 | 계약 밖 파일, 큰 범위 변경 |
| 관련 검증 명령 실행 | 테스트 삭제·약화·skip |
| 검증 통과 후 작업 브랜치 commit | **push, PR 생성, merge, main 직접 커밋, 히스토리 재작성** |
| 로컬 Markdown 계획 | 마이그레이션 적용, 라이브 데이터(`server/data/`) 삭제, docker volume 삭제 |
| 근거 수집·대안 비교 | 비가역 아키텍처·프로토콜·스키마 결정, 의존성 추가, **캐논 데이터 승격**, 외부 서비스 쓰기 |

`push`·`PR 생성`·`merge`는 서로 다른 외부 변경입니다. 한 동작의 승인이 다음 동작으로 자동 확대되지 않습니다. 여러 동작을 한 번에 승인하려면 범위를 명확히 말하세요.

```
현재 작업 브랜치의 검증된 변경만 commit하고 push해. 준비된 PR을 생성하되 merge는 하지 마.
```

### 결정은 ADR-LITE로 남긴다

비가역 결정은 `.ai/decisions.md`에 ADR-LITE로 기록합니다. **에이전트는 `proposed`까지만 적고, `approved`는 사람 승인일 때만** 붙습니다. 형식은 Date / Status / Decision / Context / Alternatives / Consequences / Approved by입니다(기존 ADR-LITE-001~005 참고).

```
이 프로토콜 프레이밍 결정을 .ai/decisions.md에 ADR-LITE로 초안 작성해.
Status는 proposed로 두고, 대안 2개와 결과를 적어. 내가 승인하면 approved로 바꿔.
```

---

## 7. 세션 종료와 인수인계

### 7.1 `/checkpoint`로 상태를 넘긴다

세션 종료·컨텍스트 리셋 전에는 `/checkpoint`로 다음 세 파일을 최신화합니다.

- `.ai/current-state.md` — 지금 verified 상태
- `.ai/handoff.md` — 이 파일만 읽어도 재개되도록 (Goal / Current result / Decisions / Files changed / Commands executed / Verification result / Known failures / Do not repeat / Remaining work / Recommended next action / Required human decisions / Files to read first)
- `.ai/ownership.md` — 소유 파일 해제/등록

인수인계의 핵심 규칙: **결정(승인됨)과 추측(Inferred)을 분리**, **실행한 검증과 미실행 검증을 분리**, **실패한 접근을 반드시 기록**. 대화 기록에 의존하지 않습니다.

### 7.2 문서 현행화 게이트 (Stop 훅이 왜 턴을 막는가)

파일을 바꾼 턴은 그냥 끝나지 않습니다. Stop 훅(`stop-doc-gate.sh`)이 관련 `docs/` 현행 문서, 루트 `AGENTS.md`·`CLAUDE.md`, `.ai/current-state.md`(설정된 머신에서는 옵시디언 볼트까지) 갱신을 강제합니다. 파생 원천(roadmap·known-issues·task.md)을 바꿨으면 `.ai/key-facts.md` 카드도 함께 갱신해야 합니다.

사용자 관점에서 이건 "코드는 바뀌는데 문서는 안 바뀌어 아무도 안 믿는 죽은 문서"를 막는 장치입니다. 반영할 게 정말 없으면 그 근거를 보고에 명시하면 게이트를 통과합니다. 갑자기 턴이 안 끝나면 대개 이 게이트가 문서 갱신을 기다리는 중입니다.

---

## 8. 문제가 생기면

### 8.1 Blocked-Loop Rule

같은 증상으로 **3회 실패**하거나 새 증거 없이 **조사만 2회 반복**하면, 같은 접근을 멈추고 블로커를 보고하는 것이 규칙입니다. 당신도 이렇게 끊어줄 수 있습니다.

```
같은 명령을 반복하지 마. 지금까지의 증거, 기각된 가설, 남은 가설, 가장 싼 다음 실험을 정리해.
도구·권한·환경이 블로커라면 필요한 사람 행동을 한 문장으로 알려줘.
```

미해결 문제·게이트 차단 현황은 `.ai/known-issues.md`가 정본입니다. "왜 라이브 검증이 안 되나?" 같은 물음은 여기부터 봅니다.

### 8.2 훅이 막는 것들

- **비밀 파일**(`.env*`·`*.pem`·`*.key`·`credentials*`·`secrets*` 등) 읽기·쓰기 → PreToolUse 훅이 차단. 승인으로도 우회하지 않습니다.
- **파일 편집 후** 구문 오류·이름 매칭 테스트 실패 → PostToolUse 검증이 잡습니다.
- **문서 미갱신 상태의 턴 종료** → Stop 게이트가 막습니다(7.2).

차단은 대개 버그가 아니라 안전벨트입니다. 특히 RE·라이브 QA의 fail-closed(hash·sentinel 불일치 시 중단)는 의도된 설계입니다.

### 8.3 문서와 코드가 충돌하면 — Instruction Conflict

문서와 코드가 충돌하면 **코드·테스트가 우선**입니다. 그리고 그 충돌을 Instruction Conflict로 보고합니다(`AGENTS.md` 형식). 오래된 역사 문서의 코드 경로는 2026-07-05 리셋 전 기준이라 불신합니다(분류는 `docs/logh7-document-index-current.md`).

```
지금 docs가 지시하는 경로와 실제 코드가 다르면 코드를 우선하고, 무엇이 어떻게 충돌하는지
Instruction Conflict로 보고해. 임의로 문서를 정답으로 삼지 마.
```

---

## 9. 부록

### 9.1 명령어 치트시트 (이 레포에 실존하는 것만)

| 명령 | 용도 |
|---|---|
| `/start-task` | 작업 계약 확인·문서 라우팅·계획 (코드 수정 없음) |
| `/analyze` | 영향 범위·유사 구현 조사 (코드 수정 금지) |
| `/implement` | 승인된 계획 최소 구현 + 검증 |
| `/debug` | 가설 기반 근본 원인 (확정 전 수정 금지) |
| `/verify` | 현재 diff 분류 후 검증 행렬 실행 |
| `/review` | 심각도별 diff 리뷰 |
| `/checkpoint` | `.ai/` 상태 파일 최신화 |
| `bash scripts/agent/verify-changes.sh --file <경로>` | 단일 파일 검증 |
| `bash scripts/agent/verify-changes.sh --full` | 서버 전체 + Python 검증 |
| `bash scripts/agent/bootstrap-skills.sh --check` | 스킬 매니페스트 로컬 점검 |
| `bash scripts/agent/test-codex-hooks.sh` | 훅·워크플로 회귀 |
| `cd server && npm test` | 서버 전체 테스트 |
| `cd server && npm start` | 서버 구동 (포트 47900) |

### 9.2 복사해서 쓰는 프롬프트 (이 레포 문맥)

- "이 프로젝트 현재 상태를 읽기 전용으로 브리핑해줘. `.ai/` 상태 파일과 문서 라우터만 보고 수정하지 마."
- "`.ai/task.md`가 EMPTY면 구현하지 말고 계약 초안만 만들어 내 승인을 기다려."
- "확인 안 되는 값은 지어내지 말고 UNKNOWN으로 표시하고 질문 목록으로 물어봐."
- "변경 파일별로 `verify-changes.sh --file`을 돌리고 종료 코드를 그대로 보여줘. 미실행 검증은 미실행으로 구분해."
- "이 diff를 `.ai/task.md` 수용 기준과 대조해 BLOCKER/MAJOR/MINOR/QUESTION으로 리뷰해. 코드는 고치지 마."
- "죽은 게임 복원·자체 서버 호환 목적의 RE야. EXE hash·sentinel이 lineage manifest와 불일치면 게이트 차단으로 보고해."
- "라이브 증거(스크린샷·서버로그) 없이 '정상 표시'라고 하지 마."
- "이 턴에서 파일을 바꿨으니 관련 `docs/` 현행 문서와 `.ai/current-state.md`도 함께 갱신해."

### 9.3 강의 일반론 중 이 레포 밖에서 유용한 것 (참고용 — 여기선 절차 아님)

아래는 강의 1~4주차에서 다룬 일반 기법입니다. 이 레포에는 도입돼 있지 않으므로 **레포 절차로 쓰지 마세요.** 다른 프로젝트나 개인 실험에서 참고할 수 있습니다.

- **Ralph Loop / `/loop` / Routines / Auto Mode** — 자동 반복·스케줄 실행. 이 레포는 대신 훅 5종 + 검증 행렬 + Blocked-Loop Rule로 완료를 강제합니다.
- **claude-squad** — tmux + git worktree 멀티 세션 관제. 이 레포는 `codex/*` 브랜치 + PR + single-writer-per-file 소유권으로 병렬을 관리합니다.
- **Terraform / CI 무중단 배포 / Langfuse** — IaC·LLM 관측. 이 레포의 관심사(원본 클라 호환)와 무관해 도입돼 있지 않습니다.
- **CodeRabbit / 서버 Sentry 배선** — `.coderabbit.yaml`과 env-guard된 Sentry 훅 자리는 저장소에 있으나 아직 Phase 3(미실측)입니다. 라이브 절차로 간주하지 마세요.
- **Playwright/Puppeteer E2E** — 웹 E2E. 이 레포의 제품은 Wine 위 원본 Windows 클라이언트라, E2E 대신 live-qa + `logh7-wine-live-qa` 스킬로 검증합니다.

일반 Claude Code 기능(`/clear`, Plan Mode(`Shift+Tab`×2), `/agents` 등)은 툴 자체의 기능이라 언제든 쓸 수 있지만, 이 레포의 커맨드 7종·에이전트 6종은 이미 정의돼 있으니 새로 만들 필요는 없습니다.

---

*근거: 딩코딩코 「AI 네이티브 개발자」 1~4주차 방법론을 이 저장소의 실제 `CLAUDE.md`, `docs/agent/`(README·prompt-pack·verification·collaboration-protocol·lifecycle-planning), `.ai/decisions.md`, `.claude/`(commands·agents·settings), `scripts/agent/`, `.mcp.json`에 대조해 재구성했습니다. 강의의 특정 제품·제출물 형식은 이식하지 않았습니다.*
