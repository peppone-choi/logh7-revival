# Verification

마지막 검증: 2026-07-17. 실재하는 명령만 기록한다. 실행하지 않은 검증을 통과로 기록하지 않는다.

## 실재 검증 명령

| 명령 | 대상 | 비고 |
|---|---|---|
| `bash scripts/agent/verify-changes.sh --file <경로>` | 단일 파일 구문 + 이름 매칭 테스트 | Claude/Codex 후검증 공통 로직; 수동 fallback 가능 |
| `bash scripts/agent/test-codex-hooks.sh` | Codex 훅·워크플로 스킬·프로젝트 설치 회귀 | 하위 cwd, `apply_patch`, 민감 파일, 세션 격리, stop gate, 옵션 주입 포함 |
| `bash scripts/agent/bootstrap-skills.sh --check` | 프로젝트 스킬 매니페스트 로컬 점검 | SessionStart와 동일한 네트워크 없는 검사 |
| `codex --strict-config --version` | Codex 설정 파싱 | 경고와 종료 코드를 함께 기록 |
| `bash scripts/agent/verify-changes.sh --full` | 서버 전체 + Python 테스트 | pytest 미설치 시 Python은 SKIP으로 보고 |
| `cd server && npm test` | `node --test` 전체 (2026-07-16 기준 460개) | |
| `cd server && node --test tests/<파일>.test.mjs` | 특정 테스트만 | |
| `node --check <파일>` / `python3 -m py_compile <파일>` / `bash -n <파일>` | 구문만 | |
| `python3 -m pytest tools/tests -q` | Python 도구 테스트 | 기본 python3(3.14)에 pytest **미설치** — 실행 환경은 NEEDS_HUMAN_CONFIRMATION |
| `python3 -c "import yaml,sys; yaml.safe_load(open(sys.argv[1]))" <파일>` | YAML 구문 검증 (workflow·`.coderabbit.yaml`) | 이 머신 PyYAML 설치 확인됨(2026-07-16 실사) |
| `node -e "JSON.parse(require('fs').readFileSync('<파일>','utf8'))"` | JSON 구문 검증 (`.mcp.json` 등) | |

## 변경 유형별 최소 검증 행렬

| 변경 유형 | 최소 검증 | 추가 검증 조건 | 완료 조건 |
|---|---|---|---|
| `server/src/**` 코드 | `verify-changes.sh --file` | 와이어 인코딩·세션·영속성 경로 변경 시 `cd server && npm test` 전체 | 종료 코드 0 + `git diff` 직접 검토 |
| `server/tests/**` | 해당 테스트 파일 실행 | 공용 fixture 변경 시 전체 | 종료 코드 0, 실패 테스트 삭제·약화·skip 없음 |
| `tools/**.py` | `py_compile` + 이름 매칭 pytest | pytest 가능 환경에서 `tools/tests` 관련 파일 | 종료 코드 0 (pytest 불가 시 SKIP을 결과에 명기) |
| 와이어 프로토콜·클라이언트 가시 동작 | 위 테스트 전부 | **라이브 QA 증거** (원본 클라이언트 구동 로그·스크린샷) — 단 P0 게이트(run 전용 win32 WINEPREFIX, EXE hash fail-closed) 통과 전에는 라이브 실행 불가를 명시하고 중단 | 테스트 + 라이브 증거, 또는 "라이브 미검증" 명시 보고 |
| `server/migrations/*.sql` | SQL 구문 검토 + `migrations/README.md` 컨벤션 준수 | 적용은 자동 실행 금지 (PG는 skeleton) | 사람 승인 후에만 적용 |
| 문서 (`docs/`, `*.md`) | 참조 경로·링크 실재 확인 | — | 링크 대상 파일 존재 |
| Codex 훅·부트스트랩 (`.codex/`, `scripts/agent/`) | `bash -n` + `bash scripts/agent/test-codex-hooks.sh` + hooks JSON 파싱 | 하위 cwd 실제 payload와 SessionStart `--check` 확인. `.codex/hooks.json` 변경 후 사용자가 `/hooks` hash를 신뢰하고 새 task에서 활성 상태를 확인하기 전에는 라이브 미확인 | 모든 로컬 회귀 종료 코드 0 + 라이브 신뢰 여부 구분 |
| 프로젝트 스킬 (`.agents/skills/**`) | skill-creator `quick_validate.py` + `skills list --json` 프로젝트 발견 | 내부 참조 실재, TODO 부재, 외부 설치면 lock source/hash 확인 | validator 종료 코드 0 + project scope |
| `.github/workflows/*.yml` | YAML 파싱(`python3 -c "import yaml..."`) | GitHub Actions 첫 런 결과 확인 (push/PR 후 실측) | 파싱 통과 + 첫 런 로그·링크 기록 (미실행이면 미실행 명시) |
| `.coderabbit.yaml` | YAML 파싱 | CodeRabbit App 설치 완료 후 실제 PR 코멘트 출현 확인 | 파싱 통과 (PR 코멘트는 Phase 3 실측) |
| `.mcp.json` | JSON 파싱(`node -e "JSON.parse(...)"`) | `.claude/settings.local.json`의 `enabledMcpjsonServers` allowlist 상태 확인 | 파싱 통과 + 시크릿 값 기입 0 |
| 서버 Sentry 배선 (`server/src/presentation/main.mjs` 등 DSN env-guard) | `cd server && npm test` 전체 (`SENTRY_DSN` 미설정 상태) | `SENTRY_DSN` 설정 시 의도적 에러 1건 캡처 확인 (Phase 3 실측) | 종료 코드 0·회귀 0 + no-op 부팅 확인 |

## 보고 규칙

- 실행한 명령과 **종료 코드**를 그대로 기록한다. 실패 로그를 요약으로 숨기지 않는다.
- 실행하지 않은 검증은 "미실행"으로 구분한다. 환경 오류(도구 부재·게이트 차단)를 제품 성공으로 해석하지 않는다.
- 과거 수치(예: 460 pass, 16/16)는 historical baseline — exact 명령·환경으로 재실행 전에는 fresh gate가 아니다.
- UI·클라이언트 표시 변경은 시각 증거 없이 "정상"으로 판단하지 않는다. 시각 검증이 불가능하면 그 사실을 보고에 명시한다.
