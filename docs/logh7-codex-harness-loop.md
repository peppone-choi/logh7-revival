# LOGH VII Codex Harness Loop

작성일: 2026-07-06

## 목적

Claude용 하네스 역할 정의(`.claude/agents`)를 Codex에서도 사용한다. 차이는 모델명과 실행 방식뿐이다. 목표는 매 턴을 다음 루프로 강제하는 것이다.

1. 계획 및 범위 고정
2. RE/문서/PDF/데이터 근거 확인
3. 최소 구현
4. 테스트
5. 실클라이언트 라이브 확인
6. 실패 시 원인별로 RE/구현/좌표/데이터 트랙에 되돌림

라이브 확인 없이 완료를 주장하지 않는다.

## 역할

| 역할 | Codex agent | 모델 기준 |
|---|---|---|
| 자산/데이터 전수 추출 | `.codex/agents/extract-miner.toml` | `gpt-5.3-codex-spark` 또는 `gpt-5.4-mini` |
| EXE/바이너리 RE | `.codex/agents/re-analyst.toml` | 판단은 메인 `gpt-5.5`; 기계적 스윕은 `gpt-5.4-mini` |
| 와이어 프로토콜 | `.codex/agents/wire-engineer.toml` | `gpt-5.4` |
| 서버 구현 | `.codex/agents/server-dev.toml` | `gpt-5.4` 또는 `gpt-5.4-mini` |
| 한글화 | `.codex/agents/localizer.toml` | `gpt-5.4-mini`, 품질 판단은 메인 |
| 라이브 QA | `.codex/agents/live-qa.toml` | `gpt-5.4-mini`, 판정은 메인 |

메인 세션은 Advisor다. Worker 완료 보고는 diff, 테스트, 산출물, 라이브 증거로 직접 확인한다.

## 고정 게이트

### 문서 현행화 (2026-07-14 추가)

파일을 변경한 턴은 ①관련 `docs/` 문서, ②CLAUDE.md(현재 상태·규칙), ③옵시디언 볼트 `E:/obsidian-tech-vault/1. 프로젝트/은하영웅전설 7 리바이벌/`의 관련 노트 갱신까지 마쳐야 완료다. Claude Code 쪽은 Stop 훅이 물리적으로 강제한다:

- `.claude/hooks/turn-snapshot.sh` (UserPromptSubmit) — 턴 시작 시 작업트리·docs·CLAUDE.md·볼트 상태 스냅샷
- `.claude/hooks/stop-doc-gate.sh` (Stop) — 실작업이 있었는데 셋 중 하나라도 그대로면 종료 차단 (턴당 최대 2회, 볼트는 존재하는 머신에서만 검사)
- 순수 질답 턴(파일 무변경)은 통과. 정말 반영할 내용이 없으면 그 근거를 보고에 명시한다.

Codex 쪽은 동일 규칙을 이 문서와 AGENTS.md 지침으로 따른다.

### 데이터

- `node tools/extract/audit_data_decode.mjs`
- `server/content/generated/logh7-data-decode-audit.json`
- 기존 JSON은 정본이 아니다. 원천/해시/재생성/소비 검증을 통과해야 서버 입력으로 승격한다.

### 문서/PDF 요구사항

- `node tools/extract/audit_docs_requirements.mjs`
- `server/content/generated/logh7-docs-requirements-audit.json`
- `docs/`와 `docs/reference/*.pdf`의 모든 기능 요소는 구현 후보로 추적한다.

### EXE 전체 기능 RE

- `node tools/extract/audit_exe_re_coverage.mjs`
- `server/content/generated/logh7-exe-re-coverage-audit.json`
- 함수 주소, 디컴파일/라이브 경로, 소비 데이터, 서버 구현, 테스트 증거가 연결될 때만 완료로 본다.

### UI 좌표

- `node tools/extract/audit_ui_coordinates.mjs`
- `server/content/generated/logh7-ui-coordinate-audit.json`
- 좌표는 EXE 해시, 창 모드, client rect, 클릭 전후 스크린샷/로그가 없으면 승격하지 않는다.

## 루프 실행 규칙

1. `docs/logh7-roadmap-current.md`에서 다음 미완료 게이트를 고른다.
2. 관련 legacy evidence와 현재 코드/JSON을 재확인한다.
3. 불명확한 판단은 메인 Advisor가 직접 한다.
4. 기계적 스윕/추출/단순 검증은 Worker에 위임한다.
5. 서버 구현은 가장 작은 코드로 넣되, wire/data 경계 검증은 생략하지 않는다.
6. `npm test` 또는 해당 추출기 검증을 돌린다.
7. 라이브 확인이 필요한 기능은 `live-qa`로 실클라 증거를 남긴다.
8. 실패하면 같은 증상 3회 전에 원인 축을 바꾼다: RE, 데이터, UI 좌표, 서버 구현, 라이브 환경.

## 현재 우선순위

1. 데이터/문서/PDF/EXE/UI 감사 산출물을 계속 갱신한다.
2. `login-transport`를 0x0030 봉투에서 handshake/child-codec/login 세션으로 확장한다.
3. 캐릭터 작성/삭제/선택 wire codec을 복구한다.
4. 로비/월드 진입 후 전략맵 기초 state를 보낸다.
5. UI 좌표는 live QA 전용 산출물로만 수정한다.

## 2026-07-06 루프 증거

- Ghidra `FUN_00614460` decompile 근거로 child-codec raw buffer는 8바이트 배수만 처리한다. 현재 구현은 `encryptBuffer`/`decryptBuffer`의 독립 8바이트 블록 루프까지만 포함하며, 블록 dword byte order는 x86 little-endian이다. 패딩과 상위 프레이밍은 아직 추가하지 않는다.
- 검증: `node --test --test-reporter=dot` in `server` 통과, `node tools/patch/exe-patch.mjs validate --manifest server/content/generated/logh7-exe-patch-manifest.json --exe artifacts/logh7-install/____________s___/____/exe/g7mtclient.exe --dry-run` 통과.
- Wireshark/dumpcap smoke: `.omo/captures/codex-smoke-20260706-codec-buffer/capture.pcapng` 및 `capture.manifest.json`.
