#!/usr/bin/env bash
set -euo pipefail

# LOGH VII Revival 프로젝트 스킬 부트스트랩.
# SessionStart는 네트워크 없는 --check만 실행한다. 외부 스킬은 출처와 내용을 검토한 뒤
# --reviewed를 명시한 온디맨드 호출에서만 Codex 프로젝트 범위로 설치한다.

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
INSTALL_PACKAGE=""
INSTALL_SKILL=""
DRY_RUN=0
REVIEWED=0

usage() {
  cat <<'EOF'
사용법: bootstrap-skills.sh [--check|--sync] [--once] [--strict] [--force]
       bootstrap-skills.sh --status
       bootstrap-skills.sh --search <query>
       bootstrap-skills.sh --install <owner/repo> --skill <name> --reviewed [--dry-run]

로컬 전용:
  --check   매니페스트와 프로젝트 스킬을 비교한다. 네트워크를 사용하지 않는다.
  --sync    canonical 스킬을 Claude 프로젝트 로드 경로에 복사한다.
  --once    저장소 스탬프가 없을 때 한 번만 로컬 점검한다. SessionStart에서는 사용하지 않는다.
  --strict  MISSING 또는 STALE이 있으면 실패한다.
  --force   --sync에서 STALE Claude 복사본도 교체한다.

수동 네트워크 모드:
  --status          skills.sh 기준 프로젝트 설치 상태를 조회한다.
  --search <query>  skills.sh 후보를 검색한다. 설치하지 않는다.
  --install         검토한 후보 하나를 Codex 프로젝트 범위에만 복사 설치한다.
  --reviewed        호출자가 후보의 출처, SKILL.md, 스크립트와 권한을 검토했음을 확인한다.
  --dry-run         실행할 프로젝트 범위 설치 명령만 출력한다.

전역 설치(-g, --global)와 기존 프로젝트 스킬 덮어쓰기는 허용하지 않는다.
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
      [ -n "$SEARCH_QUERY" ] || { echo "[bootstrap-skills] ERROR: --search requires a query" >&2; exit 1; }
      ;;
    --install)
      shift
      INSTALL_PACKAGE="${1:-}"
      [ -n "$INSTALL_PACKAGE" ] || { echo "[bootstrap-skills] ERROR: --install requires owner/repo" >&2; exit 1; }
      ;;
    --skill)
      shift
      INSTALL_SKILL="${1:-}"
      [ -n "$INSTALL_SKILL" ] || { echo "[bootstrap-skills] ERROR: --skill requires a name" >&2; exit 1; }
      ;;
    --reviewed) REVIEWED=1 ;;
    --dry-run) DRY_RUN=1 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "[bootstrap-skills] ERROR: unknown option: $1" >&2; exit 1 ;;
  esac
  shift
done

SAFE_SEGMENT_RE='^[A-Za-z0-9]([A-Za-z0-9._-]*[A-Za-z0-9])?$'

is_safe_name() {
  [[ "$1" =~ $SAFE_SEGMENT_RE ]]
}

is_safe_package() {
  local package="$1" owner repo
  [[ "$package" == */* ]] || return 1
  owner="${package%%/*}"
  repo="${package#*/}"
  [[ "$repo" != */* ]] || return 1
  is_safe_name "$owner" && is_safe_name "$repo"
}

validate_skill_file() {
  python3 - "$1" "$2" <<'PY'
import re
import sys
from pathlib import Path

path = Path(sys.argv[1])
expected_name = sys.argv[2]
text = path.read_text(encoding="utf-8") if path.is_file() else ""
match = re.match(r"^---\n(.*?)\n---\n", text, re.S)
if not match:
    raise SystemExit(1)
frontmatter = match.group(1)
if not re.search(rf"^name:\s*{re.escape(expected_name)}\s*$", frontmatter, re.M):
    raise SystemExit(1)
description = re.search(r"^description:\s*(.+)$", frontmatter, re.M)
if not description or "TODO" in description.group(1):
    raise SystemExit(1)
PY
}

if [ -n "$INSTALL_PACKAGE" ]; then
  [ -n "$INSTALL_SKILL" ] || { echo "[bootstrap-skills] ERROR: --install requires --skill <name>" >&2; exit 1; }
  [ "$REVIEWED" -eq 1 ] || { echo "[bootstrap-skills] ERROR: vetted installs require --reviewed" >&2; exit 1; }
  is_safe_package "$INSTALL_PACKAGE" || { echo "[bootstrap-skills] ERROR: invalid owner/repo: $INSTALL_PACKAGE" >&2; exit 1; }
  is_safe_name "$INSTALL_SKILL" || { echo "[bootstrap-skills] ERROR: invalid skill name: $INSTALL_SKILL" >&2; exit 1; }

  printf 'npx --yes skills add %s --agent codex --skill %s --copy --yes\n' "$INSTALL_PACKAGE" "$INSTALL_SKILL"
  [ "$DRY_RUN" -eq 1 ] && exit 0

  [ ! -e "$CANONICAL_DIR/$INSTALL_SKILL" ] || {
    echo "[bootstrap-skills] ERROR: existing project skill will not be overwritten: $CANONICAL_DIR/$INSTALL_SKILL" >&2
    exit 1
  }
  command -v npx >/dev/null 2>&1 || { echo "[bootstrap-skills] ERROR: npx is required" >&2; exit 1; }
  npx --yes skills add "$INSTALL_PACKAGE" --agent codex --skill "$INSTALL_SKILL" --copy --yes

  validate_skill_file "$CANONICAL_DIR/$INSTALL_SKILL/SKILL.md" "$INSTALL_SKILL" || {
    echo "[bootstrap-skills] ERROR: installed SKILL.md failed frontmatter validation" >&2
    exit 1
  }
  node - "$LOCK_FILE" "$INSTALL_SKILL" "$INSTALL_PACKAGE" <<'NODE'
const fs = require("fs");
const [lockPath, name, source] = process.argv.slice(2);
const lock = JSON.parse(fs.readFileSync(lockPath, "utf8"));
const entry = (lock.skills || {})[name];
if (!entry || entry.source !== source || !entry.computedHash) process.exit(1);
NODE
  npx --yes skills list --json >/dev/null
  echo "[bootstrap-skills] verified project install: $INSTALL_SKILL <- $INSTALL_PACKAGE"
  exit 0
fi

if [ -n "$INSTALL_SKILL" ] || [ "$REVIEWED" -eq 1 ] || [ "$DRY_RUN" -eq 1 ]; then
  echo "[bootstrap-skills] ERROR: --skill, --reviewed and --dry-run require --install" >&2
  exit 1
fi

if [ "$STATUS_MODE" -eq 1 ]; then
  [ -z "$SEARCH_QUERY" ] || { echo "[bootstrap-skills] ERROR: choose --status or --search" >&2; exit 1; }
  command -v npx >/dev/null 2>&1 || { echo "[bootstrap-skills] ERROR: npx is required" >&2; exit 1; }
  npx --yes skills list --json
  exit $?
fi

if [ -n "$SEARCH_QUERY" ]; then
  command -v npx >/dev/null 2>&1 || { echo "[bootstrap-skills] ERROR: npx is required" >&2; exit 1; }
  npx --yes skills find "$SEARCH_QUERY"
  status=$?
  echo "검토 후 프로젝트 설치: bash scripts/agent/bootstrap-skills.sh --install <owner/repo> --skill <name> --reviewed"
  exit "$status"
fi

[ "$FORCE" -eq 0 ] || [ "$MODE" = "sync" ] || {
  echo "[bootstrap-skills] ERROR: --force requires --sync" >&2
  exit 1
}

if [ "$ONCE" -eq 1 ] && [ -f "$STAMP_FILE" ]; then
  echo "[bootstrap-skills] repository stamp exists; skipping legacy --once check"
  exit 0
fi

[ -f "$MANIFEST" ] || { echo "[bootstrap-skills] ERROR: missing manifest: $MANIFEST" >&2; exit 1; }

missing_count=0
stale_count=0
unknown_count=0
ok_count=0

dirs_differ() {
  ! diff -rq "$1" "$2" >/dev/null 2>&1
}

check_claude_target() {
  local name="$1" canonical="$2" target=".claude/skills/$1"
  if [ ! -d "$target" ]; then
    missing_count=$((missing_count + 1))
    echo "  [MISSING] $name -> Claude ($target)"
    if [ "$MODE" = "sync" ]; then
      mkdir -p .claude/skills
      cp -R "$canonical" "$target"
      echo "    [sync] copied $canonical -> $target"
    fi
    return
  fi
  if dirs_differ "$canonical" "$target"; then
    stale_count=$((stale_count + 1))
    echo "  [STALE] $name -> Claude"
    if [ "$MODE" = "sync" ]; then
      if [ "$FORCE" -eq 1 ]; then
        rm -rf "$target"
        cp -R "$canonical" "$target"
        echo "    [sync --force] replaced $target"
      else
        echo "    [sync] skipped; --force is required to replace a stale copy"
      fi
    fi
  else
    ok_count=$((ok_count + 1))
  fi
}

echo "=== bootstrap-skills.sh (mode=$MODE) ==="
while IFS=$'\t' read -r name target reference || [ -n "${name:-}" ]; do
  [ -n "${name:-}" ] || continue
  case "$name" in \#*) continue ;; esac
  is_safe_name "$name" || {
    echo "[bootstrap-skills] ERROR: unsafe skill name in manifest: $name" >&2
    exit 1
  }

  canonical="$CANONICAL_DIR/$name"
  if [ "$target" = "candidate" ]; then
    unknown_count=$((unknown_count + 1))
    if [ -d "$canonical" ]; then
      echo "  [CANDIDATE->REVIEW] $name exists; consider promoting the manifest target ($reference)"
    else
      echo "  [CANDIDATE] $name is not installed; use the skill manager to search and vet it ($reference)"
    fi
    continue
  fi

  if [ ! -d "$canonical" ]; then
    unknown_count=$((unknown_count + 1))
    echo "  [UNKNOWN] missing canonical skill: $name ($reference)"
    continue
  fi
  validate_skill_file "$canonical/SKILL.md" "$name" || {
    echo "[bootstrap-skills] ERROR: invalid canonical SKILL.md: $canonical/SKILL.md" >&2
    exit 1
  }

  case "$target" in
    claude|both) check_claude_target "$name" "$canonical" ;;
    codex) ok_count=$((ok_count + 1)) ;;
    *) echo "[bootstrap-skills] ERROR: invalid manifest target '$target' for $name" >&2; exit 1 ;;
  esac
done < "$MANIFEST"

lock_stale_count=0
lock_stale_names=""
if [ -f "$LOCK_FILE" ]; then
  command -v node >/dev/null 2>&1 || { echo "[bootstrap-skills] ERROR: node is required to validate $LOCK_FILE" >&2; exit 1; }
  lock_report="$(node - "$LOCK_FILE" <<'NODE'
const fs = require("fs");
const lock = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const prefixes = [".claude/skills/", ".codex/skills/", ".agents/skills/", "agent/skills/"];
const stale = [];
for (const [name, info] of Object.entries(lock.skills || {})) {
  const path = info.skillPath || "";
  if (prefixes.some((prefix) => path.startsWith(prefix)) && !fs.existsSync(path)) stale.push(name);
}
process.stdout.write(`${stale.length}\t${stale.join(",")}`);
NODE
)" || { echo "[bootstrap-skills] ERROR: invalid $LOCK_FILE" >&2; exit 1; }
  lock_stale_count="${lock_report%%$'\t'*}"
  lock_stale_names="${lock_report#*$'\t'}"
fi

echo "---"
echo "summary: OK=$ok_count MISSING=$missing_count STALE=$stale_count UNKNOWN/CANDIDATE=$unknown_count"
if [ "$lock_stale_count" -eq 0 ]; then
  echo "skills-lock.json stale paths: 0"
else
  echo "skills-lock.json stale paths: $lock_stale_count ($lock_stale_names)"
fi
echo "==========================================="

if [ "$ONCE" -eq 1 ]; then
  mkdir -p "$STAMP_DIR"
  date -u +"%Y-%m-%dT%H:%M:%SZ" > "$STAMP_FILE"
fi

if [ "$STRICT" -eq 1 ] && { [ "$missing_count" -gt 0 ] || [ "$stale_count" -gt 0 ]; }; then
  exit 1
fi

exit 0
