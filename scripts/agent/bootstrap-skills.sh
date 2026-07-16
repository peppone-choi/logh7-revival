#!/usr/bin/env bash
set -euo pipefail

# LOGH VII Revival — 프로젝트 단위 스킬 부트스트랩 (Claude Code + Codex 공통)
#
# canonical 저장소(.agents/skills/ — skills.sh 프로젝트 스코프 규약, `npx skills list --json`로
# 실증)를 기준으로 Claude Code(.claude/skills/) 로드 경로의 누락(MISSING)/불일치(STALE)/
# 미설치(UNKNOWN·CANDIDATE)를 scripts/agent/required-skills.tsv 매니페스트대로 점검한다.
# Codex는 .codex/agents/*.toml이 .agents/skills/<name>(canonical)을 직접 참조하므로
# 물리 복사가 필요 없다(실증 — 2026-07-17 보정, 이전에는 .codex/skills/까지 복사했으나 폐기) —
# canonical 경로 실존만 확인한다. 이미 .agents/skills/에 있는 스킬만 안전하게 로컬 동기화하며,
# 신규 외부 스킬 설치는 항상 안내만 한다 — 사람 승인 없는 자동 설치 금지(CLAUDE.md
# "의존성 추가 승인 필요" 규칙).
#
# --check/--sync/--once/--strict는 매니페스트+로컬 디렉터리 비교만 수행한다 — 네트워크·npx
# 호출 없음(SessionStart 훅에서 fresh 머신에도 안전). skills.sh 레지스트리 조회·검색은
# --status/--search 수동 모드로 분리되어 있으며, 이 모드들만 `npx skills`를 호출한다.

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

MANIFEST="scripts/agent/required-skills.tsv"
CANONICAL_DIR=".agents/skills"
STAMP_DIR=".omc/state"
STAMP_FILE="$STAMP_DIR/skills-bootstrap.stamp"
LOCK_FILE="skills-lock.json"

MODE="check"
ONCE=0
STRICT=0
FORCE=0
STATUS_MODE=0
SEARCH_QUERY=""

usage() {
  cat <<'EOF'
사용법: bootstrap-skills.sh [--check|--sync] [--once] [--strict] [--force]
       bootstrap-skills.sh --status
       bootstrap-skills.sh --search <query>

로컬 전용 (네트워크·npx 호출 없음 — SessionStart 훅에서 안전):
  --check   (기본) 매니페스트 기준 MISSING/STALE/UNKNOWN 리포트만 출력. exit 0 (fail-open)
  --sync    canonical(.agents/skills/)에 있고 .claude/skills/에 없는 스킬만 디렉터리 복사(cp -R).
            Codex는 canonical을 직접 참조하므로 .codex/skills/는 건드리지 않는다.
            내용이 다른 STALE 스킬은 경고만 하고 건너뜀(--force 없이는 덮어쓰지 않음)
  --once    스탬프(.omc/state/skills-bootstrap.stamp)가 있으면 skip.
            없으면 1회 점검을 실행한 뒤 스탬프를 기록한다 (세션/설치당 1회 스윕용)
  --strict  MISSING 또는 STALE 갭이 하나라도 있으면 exit 1 (기본은 항상 exit 0 — 훅에서
            fail-open으로 쓰기 위함)
  --force   (--sync 전용, 기본 비활성) STALE 스킬도 canonical 내용으로 덮어씀

수동 전용 (npx로 skills.sh 레지스트리 네트워크 호출 — 훅에서 절대 사용 금지):
  --status        `npx skills list --json` 조회로 skills.sh 관점 설치 상태 출력
  --search <query> `npx skills find <query>` 검색 결과 출력 + 설치 안내
                   (설치는 절대 자동 실행하지 않음 — 사람 승인 후 아래 명령을 직접 실행)
                   npx skills add <owner/repo> -a claude-code codex -s <skill> -y

이 스크립트는 이미 .agents/skills/에 존재하는 스킬의 Claude 쪽 로컬 동기화만 담당한다.
target=candidate(매니페스트) 스킬은 canonical에도 없는 게 정상이며 항상 안내만 하고
자동 설치하지 않는다.
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --check) MODE="check" ;;
    --sync) MODE="sync" ;;
    --once) ONCE=1 ;;
    --strict) STRICT=1 ;;
    --force) FORCE=1 ;;
    --status) STATUS_MODE=1 ;;
    --search)
      shift
      SEARCH_QUERY="${1:-}"
      if [ -z "$SEARCH_QUERY" ]; then
        echo "[bootstrap-skills] ERROR: --search 뒤에 검색어가 필요함" >&2
        exit 1
      fi
      ;;
    -h|--help) usage; exit 0 ;;
    *) echo "[bootstrap-skills] 경고: 알 수 없는 옵션 '$1' 무시" >&2 ;;
  esac
  shift
done

# --status/--search는 로컬 점검(--check/--sync/--once)과 별개인 수동 전용 모드 —
# skills.sh 레지스트리에 npx로 네트워크 접근한다. 조회/검색만 하고 절대 설치하지 않는다.
if [ "$STATUS_MODE" -eq 1 ]; then
  if ! command -v npx >/dev/null 2>&1; then
    echo "[bootstrap-skills] ERROR: npx 없음 — Node.js 필요 (--status는 skills.sh 네트워크 조회)" >&2
    exit 1
  fi
  echo "[bootstrap-skills] --status: npx skills list --json (skills.sh 레지스트리 관점, 네트워크 호출)"
  npx -y skills list --json
  exit $?
fi

if [ -n "$SEARCH_QUERY" ]; then
  if ! command -v npx >/dev/null 2>&1; then
    echo "[bootstrap-skills] ERROR: npx 없음 — Node.js 필요 (--search는 skills.sh 네트워크 조회)" >&2
    exit 1
  fi
  echo "[bootstrap-skills] --search '$SEARCH_QUERY': npx skills find (skills.sh 레지스트리 관점, 네트워크 호출)"
  npx -y skills find "$SEARCH_QUERY"
  status=$?
  echo ""
  echo "설치는 사람 승인 후에만 직접 실행: npx skills add <owner/repo> -a claude-code codex -s ${SEARCH_QUERY} -y"
  exit "$status"
fi

# 두 디렉터리가 내용까지 동일한지 확인한다. `diff -rq`는 재귀 비교를 단일 프로세스로
# 처리해, 파일마다 해시 프로세스를 새로 띄우는 방식보다 스킬 수가 많을 때 훨씬 빠르다
# (실측: 20개 스킬 기준 파일별 shasum 방식 1분40초대 -> diff -rq 방식 수 초대).
dirs_differ() {
  local a="$1" b="$2"
  ! diff -rq "$a" "$b" >/dev/null 2>&1
}

if [ "$ONCE" -eq 1 ] && [ -f "$STAMP_FILE" ]; then
  echo "[bootstrap-skills] 스탬프 존재($STAMP_FILE) — 이미 1회 스윕 완료, skip"
  exit 0
fi

if [ ! -f "$MANIFEST" ]; then
  echo "[bootstrap-skills] ERROR: 매니페스트 없음: $MANIFEST" >&2
  exit 1
fi

missing_count=0
stale_count=0
unknown_count=0
ok_count=0

check_target() {
  local name="$1" target_dir="$2" target_label="$3" canonical_path="$4"
  local t="$target_dir/$name"

  if [ ! -d "$t" ]; then
    missing_count=$((missing_count + 1))
    echo "  [MISSING] $name -> $target_label ($t 없음)"
    if [ "$MODE" = "sync" ]; then
      mkdir -p "$target_dir"
      cp -R "$canonical_path" "$t"
      echo "    [sync] 복사 완료: $canonical_path -> $t"
    fi
    return 0
  fi

  if dirs_differ "$canonical_path" "$t"; then
    stale_count=$((stale_count + 1))
    echo "  [STALE] $name -> $target_label ($t 내용이 canonical과 다름)"
    if [ "$MODE" = "sync" ]; then
      if [ "$FORCE" -eq 1 ]; then
        rm -rf "$t"
        cp -R "$canonical_path" "$t"
        echo "    [sync --force] 덮어씀: $canonical_path -> $t"
      else
        echo "    [sync] 건너뜀 — 덮어쓰려면 --force 필요(이번 실행엔 미사용 권장)"
      fi
    fi
  else
    ok_count=$((ok_count + 1))
  fi
}

echo "=== bootstrap-skills.sh (mode=$MODE) ==="
while IFS=$'\t' read -r name target reference || [ -n "${name:-}" ]; do
  [ -z "${name:-}" ] && continue
  case "$name" in
    \#*) continue ;;
  esac

  canonical_path="$CANONICAL_DIR/$name"

  if [ "$target" = "candidate" ]; then
    unknown_count=$((unknown_count + 1))
    if [ -d "$canonical_path" ]; then
      echo "  [CANDIDATE->검토] $name: canonical에 이미 존재 — 매니페스트 target 승격 검토 ($reference)"
    else
      echo "  [CANDIDATE] $name: 미설치(문서화된 설치 후보). 탐색: npx skills find ${name} — 사람 승인 후에만 add ($reference)"
    fi
    continue
  fi

  if [ ! -d "$canonical_path" ]; then
    unknown_count=$((unknown_count + 1))
    echo "  [UNKNOWN] $name: canonical($canonical_path)에 없음. 탐색: npx skills find ${name} — 사람 승인 필요 ($reference)"
    continue
  fi

  case "$target" in
    claude|both) check_target "$name" ".claude/skills" "Claude" "$canonical_path" ;;
    codex)
      # Codex는 .codex/agents/*.toml이 canonical(.agents/skills/<name>)을 직접 참조한다 —
      # 물리 복사가 필요 없으므로(실증, 2026-07-17 보정) .codex/skills/는 확인·동기화 대상이 아니다.
      # canonical 존재는 위 UNKNOWN 분기에서 이미 확인됨 → 참조 경로 OK로만 카운트.
      ok_count=$((ok_count + 1))
      ;;
    *)
      echo "  [경고] 알 수 없는 target '$target' (skill=$name)" >&2
      ;;
  esac
done < "$MANIFEST"

# skills-lock.json은 읽기만 한다 — stale(기록된 로컬 경로가 실제로는 없는) 항목 개수만 리포트.
# skillPath가 로컬 스킬 디렉터리 접두사로 시작하는 경우만 검사 대상(업스트림 소스 상대경로는 제외).
lock_stale_count=0
lock_stale_names=""
if [ -f "$LOCK_FILE" ] && command -v node >/dev/null 2>&1; then
  lock_report="$(node -e '
const fs = require("fs");
const prefixes = [".claude/skills/", ".codex/skills/", ".agents/skills/", "agent/skills/"];
const lock = JSON.parse(fs.readFileSync("skills-lock.json", "utf8"));
const stale = [];
for (const [name, info] of Object.entries(lock.skills || {})) {
  const p = info.skillPath || "";
  if (prefixes.some((pre) => p.startsWith(pre)) && !fs.existsSync(p)) {
    stale.push(name);
  }
}
process.stdout.write(stale.length + "\t" + stale.join(","));
' 2>/dev/null || printf '0\t')"
  lock_stale_count="${lock_report%%$'\t'*}"
  lock_stale_names="${lock_report#*$'\t'}"
fi

echo "---"
echo "요약: OK=$ok_count MISSING=$missing_count STALE=$stale_count UNKNOWN/CANDIDATE=$unknown_count"
if [ "$lock_stale_count" != "0" ]; then
  echo "skills-lock.json stale 경로(기록됨 vs 실제 없음): ${lock_stale_count}건 (${lock_stale_names}) — 수정하지 않음, 확인만"
else
  echo "skills-lock.json stale 경로: 0건"
fi
echo "==========================================="

if [ "$ONCE" -eq 1 ]; then
  mkdir -p "$STAMP_DIR"
  date -u +"%Y-%m-%dT%H:%M:%SZ" > "$STAMP_FILE"
  echo "[bootstrap-skills] 스탬프 기록: $STAMP_FILE"
fi

if [ "$STRICT" -eq 1 ] && { [ "$missing_count" -gt 0 ] || [ "$stale_count" -gt 0 ]; }; then
  exit 1
fi

exit 0
