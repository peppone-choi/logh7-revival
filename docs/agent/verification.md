# Verification

마지막 검증: 2026-07-16. 실재하는 명령만 기록한다. 실행하지 않은 검증을 통과로 기록하지 않는다.

## 실재 검증 명령

| 명령 | 대상 | 비고 |
|---|---|---|
| `bash scripts/agent/verify-changes.sh --file <경로>` | 단일 파일 구문 + 이름 매칭 테스트 | 훅과 동일 로직, Codex 수동 실행 가능 |
| `bash scripts/agent/verify-changes.sh --full` | 서버 전체 + Python 테스트 | pytest 미설치 시 Python은 SKIP으로 보고 |
| `cd server && npm test` | `node --test` 전체 (2026-07-16 기준 460개) | |
| `cd server && node --test tests/<파일>.test.mjs` | 특정 테스트만 | |
| `node --check <파일>` / `python3 -m py_compile <파일>` / `bash -n <파일>` | 구문만 | |
| `python3 -m pytest tools/tests -q` | Python 도구 테스트 | 기본 python3(3.14)에 pytest **미설치** — 실행 환경은 NEEDS_HUMAN_CONFIRMATION |

## 변경 유형별 최소 검증 행렬

| 변경 유형 | 최소 검증 | 추가 검증 조건 | 완료 조건 |
|---|---|---|---|
| `server/src/**` 코드 | `verify-changes.sh --file` | 와이어 인코딩·세션·영속성 경로 변경 시 `cd server && npm test` 전체 | 종료 코드 0 + `git diff` 직접 검토 |
| `server/tests/**` | 해당 테스트 파일 실행 | 공용 fixture 변경 시 전체 | 종료 코드 0, 실패 테스트 삭제·약화·skip 없음 |
| `tools/**.py` | `py_compile` + 이름 매칭 pytest | pytest 가능 환경에서 `tools/tests` 관련 파일 | 종료 코드 0 (pytest 불가 시 SKIP을 결과에 명기) |
| 와이어 프로토콜·클라이언트 가시 동작 | 위 테스트 전부 | **라이브 QA 증거** (원본 클라이언트 구동 로그·스크린샷) — 단 P0 게이트(run 전용 win32 WINEPREFIX, EXE hash fail-closed) 통과 전에는 라이브 실행 불가를 명시하고 중단 | 테스트 + 라이브 증거, 또는 "라이브 미검증" 명시 보고 |
| `server/migrations/*.sql` | SQL 구문 검토 + `migrations/README.md` 컨벤션 준수 | 적용은 자동 실행 금지 (PG는 skeleton) | 사람 승인 후에만 적용 |
| 문서 (`docs/`, `*.md`) | 참조 경로·링크 실재 확인 | — | 링크 대상 파일 존재 |
| 훅·스크립트 (`.claude/`, `.codex/`, `scripts/agent/`) | `bash -n` + 대표 입력 시뮬레이션 | settings JSON은 파싱 검사 | 시뮬레이션 출력 확인 |

## 보고 규칙

- 실행한 명령과 **종료 코드**를 그대로 기록한다. 실패 로그를 요약으로 숨기지 않는다.
- 실행하지 않은 검증은 "미실행"으로 구분한다. 환경 오류(도구 부재·게이트 차단)를 제품 성공으로 해석하지 않는다.
- 과거 수치(예: 460 pass, 16/16)는 historical baseline — exact 명령·환경으로 재실행 전에는 fresh gate가 아니다.
- UI·클라이언트 표시 변경은 시각 증거 없이 "정상"으로 판단하지 않는다. 시각 검증이 불가능하면 그 사실을 보고에 명시한다.
