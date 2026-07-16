# LOGH VII Revival

## 미션

2008년 서비스 종료된 일본 MMO **은하영웅전설 VII (LOGH VII)** 를 되살린다.
원본 클라이언트(archive.org CD)에 자체 구현 서버를 붙여 멀티플레이 온라인 게임으로 복원한다.

## 2026-07-05 전체 리셋

- 사용자 지시로 기존 작업트리 전체 삭제. `docs/`와 매뉴얼 PDF만 보존.
- 삭제 직전 전체 스냅샷: 커밋 `5bd249c` — 이전 코드/도구 복원은 `git checkout 5bd249c -- <path>`.
- 이전 사이클의 지식(와이어 프로토콜 해독, RE 결과, 갤럭시 데이터, 요구사항)은 `docs/`에 문서로 남아 있다. 코드는 전부 새로 작성한다.

## 현재 상태 (2026-07-16)

- **M1 로그인→로비 / M0.5 갤럭시 데이터 / M2 첫 캐릭터 획득 / M3 월드 진입·멀티플레이 영속 — 라이브 완료.** M3는 run9에서 두 계정 동시 월드 진입·이동 브로드캐스트·재로그인/서버 재시작 영속성 8/8 통과 (`.omo/live-qa/m3-two-client-persistence-1080p-cp932-20260714-run9/`).
- **M4 전략맵 커맨드 부분 진행**: production SQLite runtime의 `EnterWorld`·`MoveGrid`가 동기 CQRS/UoW를 거치며, 성공한 `0x0b01`만 위치와 `GridMoved` 1건을 함께 커밋한다. 81개 카탈로그 중 factory 확인 2개이며 나머지 command outcome·비용·timer/job은 미구현이다.
- **M6 한글화 부분** (창 제목·메뉴만, CP932 유지), M5 전술·M7 운영 대기. 전체 진척 대표값 ~35%.
- 클라이언트는 CD 마운트 없이 직접 실행 + 1080p + 한글 패치 경로 정비 완료. run9/run3 JSON store는 라이브 QA 하네스이고 production SQLite CQRS 증거와 분리한다. PostgreSQL은 아직 skeleton이며 동기 bridge를 async-capable하게 바꾼 뒤 연결한다.
- 마일스톤 상세·데이터 승격 규칙은 `docs/logh7-roadmap-current.md`가 정본 — 이 절은 요약만 유지한다.

## 소스 오브 트루스

- **정본 소스 EXE (RE·패치 입력, 2026-07-10 확정):** `artifacts/logh7-install/…/exe/g7mtclient.exe` — **sha256 `9c97de2ae426f011680992d6c8d88b25488b5f51555ce5784aeef677f334bb51`**. 정적 RE와 guarded patch는 이 원본 바이트를 기준으로 검증한다. 다른 사본(`g7mtclient-sjis.exe` 등)은 `artifacts/_exe-archive-nonCanonical/`로 격리한다.
- **run9/run3 라이브 EXE:** 위 정본 소스에 direct-client·1080p·한글 guarded patch를 적용한 **sha256 `825635783a9fb663ae3b9a2ecf8d4b74df648322256c57ee32f6426c42a23f22`** 결과물이다. 라이브 QA는 이 결과물을 실제 구동하며, 매 실행에서 source/output 해시와 패치 매니페스트를 함께 확인한다.
- `artifacts/logh7-cd/Logh7.bin|.cue` — https://archive.org/details/logh-7 CD 이미지 (md5 검증 완료: `bf87c6a8...`/`8784...`, gitignored — 없으면 재다운로드)
- `docs/reference/*.pdf` — 공식 매뉴얼 5종 (게임 규칙의 근거)
- `docs/logh7-reference-haul.md` — 트랙별 외부 레포·도구·방법론 수집본 (MHServerEmu 등). 착수 전 관련 트랙 확인 필수 — 단, 캐논 데이터 근거로 승격하거나 외부 코드를 복사하지 말고 라이선스를 지킨다.
- `docs/logh7-requirements-current.md`, `docs/logh7-architecture-operations-current.md` — 이전 사이클 지식 베이스 (역사적 참고 — 코드 경로 언급은 리셋 전 기준이므로 신뢰하지 말 것)
- `docs/logh7-document-index-current.md` — 구 문서 분류 인덱스

## 개발 규칙

- **CodeGraph 필수**: `.codegraph/`가 있으면 코드 위치/호출경로/영향범위 질문은 codegraph 먼저, rg로 확인.
- **참고 목록 필수**: LOGH VII 작업은 `docs/logh7-reference-haul.md`의 해당 트랙을 먼저 읽고 방법론을 차용한다. 참고 레포는 gitignored `reference/` 아래에 클론하며, 설계 참고만 하고 라이선스가 다른 코드를 서버에 직접 이식하지 않는다.
- **Blocked-Loop Rule**: 같은 증상 3회 실패 또는 새 증거 없는 조사 2회면 접근을 전환하고 블로커 보고서를 쓴다.
- 코드 주석은 한글로 쓴다 (캐논 일본어 용어·바이너리 오프셋은 원문 유지).
- 라이브 검증 없이 완료 주장 금지. 테스트 출력·스크린샷 등 증거를 남긴다.
- **문서 현행화 게이트 (2026-07-14)**: 파일을 변경한 턴은 ①관련 `docs/` 문서, ②CLAUDE.md(현재 상태·규칙), ③옵시디언 볼트 `E:/obsidian-tech-vault/1. 프로젝트/은하영웅전설 7 리바이벌/`의 관련 노트(현재 상태·로드맵·핸드오프)까지 갱신해야 끝난 것이다. Stop 훅(`.claude/hooks/stop-doc-gate.sh`)이 미갱신 종료를 물리적으로 차단한다(볼트는 존재하는 머신에서만 검사). 정말 반영할 내용이 없으면 그 근거를 사용자 보고에 명시한다.

## 하네스: LOGH VII 부활

**목표:** 원본 클라이언트 + 자체 서버로 죽은 MMO를 멀티플레이 온라인 게임으로 복원.

**트리거:** logh7 관련 작업(자산추출/RE/프로토콜/서버/한글화/라이브QA) 요청 시 `logh7-orchestrator` 스킬 사용. 단순 질문은 직접 응답.

**설치된 스택:**
- 에이전트 팀: `.claude/agents/` (extract-miner, re-analyst, wire-engineer, server-dev, localizer, live-qa — frontmatter model 없음, 실행 모델은 호출 시점에 지정)
- 스킬: logh7-orchestrator, ghidra, protocol-reverse-engineering, rev-frida, find-skills, test-driven-development, verification-before-completion, systematic-debugging
- 플러그인: oh-my-claudecode, gptaku(pumasi/insane-loop/insane-harness/insane-review)
- 인덱스: codegraph(`.codegraph/`)

**변경 이력:**
| 날짜 | 변경 | 대상 | 사유 |
|---|---|---|---|
| 2026-07-05 | 초기 구성 | 전체 | 리셋 후 재시작 |
| 2026-07-05 | Advisor Strategy 도입 | agents frontmatter model 제거, 호출시 계층화 | 비용 대비 지능 최적화(claude.com/blog/the-advisor-strategy) |
| 2026-07-09 | Fable 오케스트레이션 4계층 전역 설치 | `~/.claude/fable/` (지침·deep-reasoner/runner·sonnet→Opus 리매핑·PreToolUse 강제 게이트), 토글 `fable on/off/status` | successwiki.io 가이드 적용 — 권고를 물리 차단으로 |
| 2026-07-09 | 플러그인·스킬 추가 | oh-my-claudecode, gptaku(pumasi/insane-loop/insane-harness/insane-review), 프로젝트 스킬(ghidra/protocol-reverse-engineering/rev-frida/find-skills) | 오케스트레이션·RE 도구 보강 |
| 2026-07-14 | 참고 레포 트랙 도입 | `docs/logh7-reference-haul.md` + gitignored `reference/` | MHServerEmu 등 방법론 차용, 코드 이식 금지 |

## Fable 5 운영 전략

**비용 최우선.** Fable 5 = Opus 4.8의 2배($10/$50 per 1M). 예산이 빠듯하므로 Fable 토큰 소비를 최소화한다:
- **Fable은 오케스트레이터 전용**: Fable 세션에서 긴 파일 읽기·전수 탐색·구현 노동 금지. 탐색/구현/테스트는 전부 서브에이전트(opus/haiku)로 위임하고, Fable 컨텍스트에는 결론만 돌려받는다.
- **effort 기본 low~medium**: Fable은 low에서도 Opus 4.8 최고 설정급. 기본 high 금지 — 정말 어려운 판단만 high, xhigh/max는 크리티컬 단독 판단에만.
- **안티 오버플래닝**: 정보가 모이면 계획 재작성 없이 바로 실행. 같은 스텝 반복 = 토큰 2배.
- **미니멀 프롬프팅**: 구모델용 장황한 규칙·반복 지시는 Fable에 독. 짧고 결론부터.
- **금지 주제 회피**: 해킹/공격 코드·위험 생물학·모델 내부 작동 질문은 거절+Opus 다운그레이드를 유발 — RE 작업은 "죽은 게임 복원·자체 서버 호환성" 목적을 항상 명시해 방어적 맥락을 유지한다.

Anthropic Fable 5 프롬프팅 가이드 반영:
- **장기 자율성**: 충분한 정보가 모이면 바로 행동한다. 이미 정한 결정을 재논쟁하지 않고, 추구하지 않을 선택지를 나열하지 않는다.
- **effort 튜닝**: 기본 low~medium(위 비용 규칙), 어려운 판단만 high 이상.
- **과설계 금지**: 태스크가 요구하는 최소 구현. 버그 수정에 주변 정리 끼워넣지 말 것. 시스템 경계(사용자 입력/외부 API)에서만 검증, 내부 코드는 신뢰.
- **결과 우선 보고**: 첫 문장에 "무슨 일이 있었나/무엇을 찾았나". 읽기 쉬움 > 짧음. 화살표 사슬·약어·전문용어 남발 금지.
- **비동기 잡 선호**: 오래 걸리는 작업은 블로킹 대기 대신 background로 돌리고 재진입.

## Advisor Strategy (claude.com/blog/the-advisor-strategy)

메인 세션(Fable)은 Advisor다 — 요구사항 분석·작업 분해·설계 결정·브리프 작성·결과 검증·최종 승인만 직접 하고, 구현 노동은 전부 서브에이전트에 위임한다.

**라우팅 — Sonnet 등급 폐지, Opus 아니면 Haiku** (2026-07-09, 토큰 예산 압박). 위임 시점에 복잡도만 보고 가른다:
- **opus**: 설계 결정(아키텍처·프로토콜·스키마), 근본원인 진단(가설이 여러 개인 버그), 여러 파일·계층 맥락 추론이 필요한 구현, 명세가 모호해 무엇을 만들지부터 정해야 하는 작업, 최종 판정. 순수 사고는 `deep-reasoner`(effort max), 구현이 섞이면 opus 실행 에이전트.
- **haiku**: 그 외 전부 — 지침이 명확한 구현·수정·리팩터링·테스트(`worker`), 명령 실행·빌드·조회·전수 파싱·파일 스윕(`runner`).
- 애매하면 haiku 먼저. 실패를 기다렸다 올리는 게 아니라 위임 전에 복잡도로 가른다. **model 명시 필수** — 생략하면 세션 모델(Fable)을 상속해 가장 비싼 토큰이 잡무에 쓰인다.

**조언자 패턴**: 실행자가 막히면 태스크를 통째로 opus에 재위임하지 말고, 판단 질문만 추출해 `deep-reasoner`에 짧게 물어(400~700토큰 수준) 그 지시로 실행자가 재개. 태스크당 조언 3회 이내.

**브리프 기준**: 이미 파악한 컨텍스트(파일 경로·프로젝트 컨벤션·알려진 함정·완료 기준)와 "왜(의도)"를 담아 재탐색·추측 작업을 막고, 하지 말 것(범위 밖 파일 수정·작업트리 리셋·안 시킨 기능 추가 금지)을 명시한다. 독립 작업은 병렬 위임.

**검증 경계**: Worker의 완료 보고를 그대로 믿지 말고 diff와 테스트로 직접 확인한 뒤 승인한다. 검증 실패는 수정 브리프로 재위임. 직접 수정은 위임 오버헤드가 더 큰 사소한 마무리(한두 줄)에만 허용.

**Workflow·전역 적용**: Workflow agent() 호출도 실행 스테이지는 `model: 'haiku', effort: 'low'~'medium'`, 판정/설계 스테이지만 opus 상위 effort. `fable on`이면 `ANTHROPIC_DEFAULT_SONNET_MODEL=claude-haiku-4-5`로 sonnet 고정 서브에이전트(OMC 실행 에이전트 등)까지 haiku로 강등된다.
