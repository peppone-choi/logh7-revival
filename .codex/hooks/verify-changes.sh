#!/usr/bin/env bash
SCRIPT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PROJECT_ROOT="${CODEX_PROJECT_DIR:-${CLAUDE_PROJECT_DIR:-$SCRIPT_ROOT}}"
cd "$PROJECT_ROOT" 2>/dev/null || exit 0
export PROJECT_ROOT
HOOK_INPUT="$(cat)"
PARSED=$(printf '%s' "$HOOK_INPUT" | python3 -c '
import json, os, re, sys
try:
    d = json.load(sys.stdin)
except Exception:
    d = {}
ti = d.get("tool_input", {}) or {}
root = os.environ["PROJECT_ROOT"]
cwd = d.get("cwd") or root
if not os.path.isabs(cwd):
    cwd = os.path.join(root, cwd)
paths = []
legacy = ti.get("file_path", "")
if legacy:
    paths.append(legacy)
if d.get("tool_name") == "apply_patch":
    command = ti.get("command", "")
    for match in re.finditer(
            r"^\*\*\* (?:Add|Update|Delete) File: (.+)$|^\*\*\* Move to: (.+)$",
            command,
            re.MULTILINE):
        paths.append(next(value for value in match.groups() if value).strip())
print(d.get("session_id") or "unknown")
for path in dict.fromkeys(paths):
    if not os.path.isabs(path):
        path = os.path.join(cwd, path)
    print(os.path.normpath(path))
' 2>/dev/null)
SESSION_ID="${PARSED%%$'\n'*}"
FILES="${PARSED#*$'\n'}"
[ "$FILES" != "$PARSED" ] || FILES=""
[ -n "$FILES" ] || exit 0
[ -f "scripts/agent/verify-changes.sh" ] || exit 0

SESSION_KEY=$(printf '%s' "$SESSION_ID" | git hash-object --stdin 2>/dev/null || printf unknown)
STATE_DIR=".codex/state/$SESSION_KEY"
mkdir -p "$STATE_DIR"
result=0

while IFS= read -r FILE; do
  [ -n "$FILE" ] || continue
  FILE_KEY=$(printf '%s' "$FILE" | git hash-object --stdin 2>/dev/null || printf file)
  COUNTER="$STATE_DIR/verify-fail-$FILE_KEY"
  OUT=$(bash scripts/agent/verify-changes.sh --file "$FILE" 2>&1)
  rc=$?
  if [ $rc -ne 0 ]; then
    count=$(cat "$COUNTER" 2>/dev/null || printf 0)
    printf '%s\n' $((count + 1)) > "$COUNTER"
    if [ "$count" -ge 5 ]; then
      printf 'verify-changes: same-file failure reached six attempts; change approach and report the blocker: %s\n' "$FILE" >&2
      continue
    fi
    printf '%s\n' "$OUT" >&2
    result=2
  else
    rm -f "$COUNTER" 2>/dev/null
  fi
done <<EOF
$FILES
EOF

exit "$result"
