#!/usr/bin/env bash
# 공통 변경 검증 — Claude 훅과 Codex 수동 실행이 같은 로직을 쓴다 (정본: 이 파일).
# 사용법:
#   scripts/agent/verify-changes.sh --file <경로>    # 구문 검사 + 이름 매칭 관련 테스트(최대 3개)
#   scripts/agent/verify-changes.sh --syntax <경로>  # 구문 검사만
#   scripts/agent/verify-changes.sh --full           # 전체: server npm test + tools pytest
# 종료 코드: 0 통과(또는 검사 대상 아님/도구 부재 SKIP), 1 실패(원인은 stdout/stderr).
set -u
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT" || exit 1

rel() { printf '%s' "${1#"$ROOT"/}"; }

syntax_check() {
  local f="$1"
  [ -f "$f" ] || return 0
  case "$f" in
    *.mjs|*.js|*.cjs) node --check "$f" ;;
    *.py) python3 -m py_compile "$f" ;;
    *.json) python3 -c 'import json,sys; json.load(open(sys.argv[1]))' "$f" ;;
    *.sh) bash -n "$f" ;;
    *) return 0 ;;
  esac
}

related_tests() {
  # 이름 줄기 매칭 — 휴리스틱이라 누락 가능. 전체 게이트는 --full이 담당한다.
  local f="$1" base stem
  base="$(basename "$f")"
  case "$f" in
    server/tests/*.test.mjs) echo "$f" ;;
    server/*.mjs|server/*.js)
      stem="${base%.*}"
      ls server/tests/*"$stem"*.test.mjs 2>/dev/null | head -3 ;;
    tools/*.py)
      stem="${base%.py}"
      ls tools/tests/*"$stem"*.py 2>/dev/null | head -3 ;;
  esac
}

run_tests() {
  # $@: 테스트 파일들 (저장소 상대경로)
  local rc=0 t
  for t in "$@"; do
    case "$t" in
      server/tests/*.test.mjs)
        (cd server && node --test "${t#server/}") || rc=1 ;;
      tools/tests/*.py)
        if python3 -m pytest --version >/dev/null 2>&1; then
          python3 -m pytest -q "$t" || rc=1
        else
          echo "SKIP: pytest 미설치 — $t 미실행 (검증 미실행으로 기록할 것)"
        fi ;;
    esac
  done
  return $rc
}

case "${1:-}" in
  --syntax)
    f="$(rel "${2:?경로 필요}")"
    syntax_check "$f" || { echo "구문 검사 실패: $f"; exit 1; }
    ;;
  --file)
    f="$(rel "${2:?경로 필요}")"
    syntax_check "$f" || { echo "구문 검사 실패: $f"; exit 1; }
    tests="$(related_tests "$f")"
    if [ -n "$tests" ]; then
      # shellcheck disable=SC2086
      run_tests $tests || { echo "관련 테스트 실패 (수정 대상: $f)"; exit 1; }
    fi
    ;;
  --full)
    rc=0
    (cd server && npm test) || rc=1
    if python3 -m pytest --version >/dev/null 2>&1; then
      python3 -m pytest -q tools/tests || rc=1
    else
      echo "SKIP: pytest 미설치 — tools/tests 미실행 (검증 미실행으로 기록할 것)"
    fi
    exit $rc
    ;;
  *)
    echo "사용법: $0 --file <경로> | --syntax <경로> | --full" >&2
    exit 1
    ;;
esac
exit 0
