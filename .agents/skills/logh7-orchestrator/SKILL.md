---
name: logh7-orchestrator
description: "LOGH VII(은하영웅전설 VII) 부활 프로젝트의 작업 오케스트레이터. 죽은 MMO를 자체 서버로 되살리는 모든 작업 — CD 자산추출, 바이너리 RE, 와이어 프로토콜, 권위적 서버 구현, 한글화, 라이브 QA — 을 전문 에이전트 팀으로 분해·조율한다. 트리거: 'logh7 작업', '서버 구현', '프로토콜 해독', '자산 추출', '한글화', '라이브 검증', '이 부분 다시/재실행/수정/보완', 로그인·로비·월드·채팅 기능 요청. 단순 질문은 직접 응답."
---

# LOGH VII 부활 오케스트레이터

죽은 일본 MMO 은하영웅전설 VII를 원본 클라이언트(archive.org CD) + 자체 구현 서버로 멀티플레이 온라인 게임으로 복원한다.

## Phase 0: 컨텍스트 확인
- 세 시작 문서를 먼저 읽는다: `docs/logh7-restart-plan-2026-07-05.md`, `docs/logh7-requirements-current.md`, `docs/logh7-architecture-operations-current.md`.
- `.codegraph/`가 있으면 코드 위치/호출경로/영향범위는 codegraph 먼저.
- 기존 산출물(`server/`) 존재 여부로 초기/후속/부분 재실행 판별.
- ⚠️ docs의 코드 경로 언급은 리셋(2026-07-05) 전 기준 — 역사적 발견은 신뢰하되 파일 경로는 재확인.

## 에이전트 팀 (`.Codex/agents/`) — Advisor Strategy 적용
모델은 호출 시점에 계층화: 기계적 실행(파싱/스윕/단순검증)=sonnet, 판단(RE해석/설계/근본원인)=opus. 실행자가 막히면 opus 조언자에 판단 질문만 짧게 물어 재개(태스크당 ~3회). 상세는 루트 AGENTS.md "Advisor Strategy".
| 에이전트 | 역할 | 주요 스킬 |
|---|---|---|
| extract-miner | CD 자산·데이터 추출 → 정본 카탈로그 | — |
| re-analyst | Ghidra 바이너리 RE | binary-triage |
| wire-engineer | 와이어 프로토콜 코덱 | test-driven-development |
| server-dev | 권위적 Node.js 서버 | test-driven-development, verification-before-completion |
| localizer | 한글화(인코딩/폰트/문자열) | grammar-checker, humanize-korean |
| live-qa | 실클라 라이브 검증 | verification-before-completion, systematic-debugging |

## 실행 모드
파이프라인 + 하이브리드. 데이터 흐름:
```
extract-miner ─┐
re-analyst ────┼─▶ wire-engineer ─▶ server-dev ─▶ live-qa ─(버그 라우팅)─▶ 담당 에이전트
localizer ─────┘                                        │
                                                        └─▶ localizer(인게임 한글 검증)
```
- 독립 수집(추출·RE·현지화 원문)은 서브에이전트 병렬. 통합·검증은 순차.
- 모델 지정: 기계적 스테이지 `model: "sonnet"`(effort low), 판단 스테이지만 `model: "opus"`.

## 마일스톤 (순서)
1. CD 추출 + 정본 카탈로그 (extract-miner)
2. 프로토콜 재확정: 프레이밍·암호화·로그인 (re-analyst → wire-engineer)
3. 로그인 서버 → 실클라 로그인 성공 (server-dev → live-qa)
4. 로비 → 월드 진입
5. 인월드 멀티플레이(이동·채팅) 권위적 처리
6. 한글화 인게임 검증 (localizer → live-qa)

## 데이터 전달 / 에러 핸들링
- 파일 기반(정본 JSON/코덱) + 반환값 기반. 중간 산출물은 보존.
- 에러 1회 재시도 후 실패 시 누락 명시하고 진행. 상충 데이터는 출처 병기.
- Blocked-Loop Rule: 같은 증상 3회 실패 또는 새 증거 없는 조사 2회 → 접근 전환 + 블로커 리포트.

## 완료 게이트
구현만으로 완료 아님. 구현 + 라이브 검증(증거) + 리뷰 + docs 갱신까지.

## 테스트 시나리오
- 정상: "로그인 서버 붙여서 실클라 로그인 되게 해줘" → Phase 0 → server-dev 구현 → live-qa 실검증 증거.
- 에러: RE 근거 없는 프로토콜 추측이 3회 막힘 → 좌표/추측 중단, DPI/정적 RE로 전환 후 블로커 리포트.
