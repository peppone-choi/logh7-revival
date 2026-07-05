# LOGH VII Revival

## 미션

2008년 서비스 종료된 일본 MMO **은하영웅전설 VII (LOGH VII)** 를 되살린다.
원본 클라이언트(archive.org CD)에 자체 구현 서버를 붙여 멀티플레이 온라인 게임으로 복원한다.

## 2026-07-05 전체 리셋

- 사용자 지시로 기존 작업트리 전체 삭제. `docs/`와 매뉴얼 PDF만 보존.
- 삭제 직전 전체 스냅샷: 커밋 `5bd249c` — 이전 코드/도구 복원은 `git checkout 5bd249c -- <path>`.
- 이전 사이클의 지식(와이어 프로토콜 해독, RE 결과, 갤럭시 데이터, 요구사항)은 `docs/`에 문서로 남아 있다. 코드는 전부 새로 작성한다.

## 소스 오브 트루스

- `artifacts/logh7-cd/Logh7.bin|.cue` — https://archive.org/details/logh-7 CD 이미지 (md5 검증 완료: `bf87c6a8...`/`8784...`, gitignored — 없으면 재다운로드)
- `docs/reference/*.pdf` — 공식 매뉴얼 5종 (게임 규칙의 근거)
- `docs/logh7-requirements-current.md`, `docs/logh7-architecture-operations-current.md` — 이전 사이클 지식 베이스 (역사적 참고 — 코드 경로 언급은 리셋 전 기준이므로 신뢰하지 말 것)
- `docs/logh7-document-index-current.md` — 구 문서 분류 인덱스

## 개발 규칙

- **CodeGraph 필수**: `.codegraph/`가 있으면 코드 위치/호출경로/영향범위 질문은 codegraph 먼저, rg로 확인.
- **Blocked-Loop Rule**: 같은 증상 3회 실패 또는 새 증거 없는 조사 2회면 접근을 전환하고 블로커 보고서를 쓴다.
- 코드 주석은 한글로 쓴다 (캐논 일본어 용어·바이너리 오프셋은 원문 유지).
- 라이브 검증 없이 완료 주장 금지. 테스트 출력·스크린샷 등 증거를 남긴다.

## 하네스: LOGH VII 부활

**목표:** 원본 클라이언트 + 자체 서버로 죽은 MMO를 멀티플레이 온라인 게임으로 복원.

**트리거:** logh7 관련 작업(자산추출/RE/프로토콜/서버/한글화/라이브QA) 요청 시 `logh7-orchestrator` 스킬 사용. 단순 질문은 직접 응답.

**설치된 스택:**
- 에이전트 팀: `.claude/agents/` (extract-miner, re-analyst, wire-engineer, server-dev, localizer, live-qa — 전원 opus)
- 스킬: binary-triage(RE), test-driven-development, verification-before-completion, systematic-debugging, humanize-korean, humanizer, grammar-checker, style-guide, karpathy-guidelines
- 플러그인: gptaku(insane-search/design/review/research 등 14종), harness
- 인덱스: codegraph(`.codegraph/`)

**변경 이력:**
| 날짜 | 변경 | 대상 | 사유 |
|---|---|---|---|
| 2026-07-05 | 초기 구성 | 전체 | 리셋 후 재시작 |
| 2026-07-05 | Advisor Strategy 도입 | agents frontmatter model 제거, 호출시 계층화 | 비용 대비 지능 최적화(claude.com/blog/the-advisor-strategy) |

## Fable 5 운영 전략

Anthropic Fable 5 프롬프팅 가이드 반영:
- **장기 자율성**: 충분한 정보가 모이면 바로 행동한다. 이미 정한 결정을 재논쟁하지 않고, 추구하지 않을 선택지를 나열하지 않는다.
- **effort 튜닝**: 대부분 high, 어려운 크리티컬 작업만 xhigh, 일상 작업은 medium/low.
- **과설계 금지**: 태스크가 요구하는 최소 구현. 버그 수정에 주변 정리 끼워넣지 말 것. 시스템 경계(사용자 입력/외부 API)에서만 검증, 내부 코드는 신뢰.
- **결과 우선 보고**: 첫 문장에 "무슨 일이 있었나/무엇을 찾았나". 읽기 쉬움 > 짧음. 화살표 사슬·약어·전문용어 남발 금지.
- **비동기 잡 선호**: 오래 걸리는 작업은 블로킹 대기 대신 background로 돌리고 재진입.
- **위임**: 독립 작업은 서브에이전트 병렬 위임. Worker 완료 보고는 diff/테스트로 직접 검증 후 승인.

## Advisor Strategy (claude.com/blog/the-advisor-strategy)

실행자-조언자 역전 구조로 비용 대비 지능 극대화. 큰 모델이 오케스트레이션하고 작은 모델에 위임하는 대신, 작은 모델이 실행을 주도하고 큰 모델은 판단만 조언한다:
- **실행자 계층화**: 기계적/반복 작업(전수 파싱, 인덱싱, 파일 스윕, 단순 대조 검증)은 sonnet(초경량은 haiku) 실행자로. 어려운 판단(RE 구조 해석, 프로토콜 설계, 근본원인 진단, 최종 판정)만 opus.
- **조언자 패턴**: 실행자가 막히면 태스크를 통째로 opus에 재위임하지 말고, 판단 질문만 추출해 opus 에이전트에 짧게 물어(계획 400~700토큰 수준) 그 지시로 실행자가 재개. 조언 호출 횟수 제한(태스크당 ~3회).
- **Workflow 적용**: agent() 호출 시 mechanical 스테이지는 `model: 'sonnet', effort: 'low'`, 판정/설계 스테이지만 opus 상위 effort.
- **에이전트 팀 적용**: `.claude/agents/` frontmatter의 `model: opus` 전원 지정을 폐기 — 역할별 실행 모델은 호출 시점에 계층화해 지정.
