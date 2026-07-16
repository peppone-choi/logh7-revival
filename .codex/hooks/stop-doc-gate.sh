#!/usr/bin/env bash
SCRIPT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PROJECT_ROOT="${CODEX_PROJECT_DIR:-${CLAUDE_PROJECT_DIR:-$SCRIPT_ROOT}}"
cd "$PROJECT_ROOT" 2>/dev/null || exit 0

HOOK_INPUT="$(cat)"
SESSION_ID=$(printf '%s' "$HOOK_INPUT" | python3 -c '
import json, sys
try:
    print(json.load(sys.stdin).get("session_id") or "unknown")
except Exception:
    print("unknown")
' 2>/dev/null)
SESSION_KEY=$(printf '%s' "$SESSION_ID" | git hash-object --stdin 2>/dev/null || printf unknown)
STATE_DIR=".codex/state/$SESSION_KEY"
[ -f "$STATE_DIR/work.hash" ] || exit 0

retries=$(cat "$STATE_DIR/stop-retries" 2>/dev/null || printf 0)
[ "$retries" -ge 2 ] 2>/dev/null && exit 0

EXCLUSIONS=(':(exclude)docs' ':(exclude)CLAUDE.md' ':(exclude)AGENTS.md'
            ':(exclude).claude/state' ':(exclude).codex/state' ':(exclude).ai')
work_now=$({ git status --porcelain -- . "${EXCLUSIONS[@]}"; git diff -- . "${EXCLUSIONS[@]}"; git diff --cached -- . "${EXCLUSIONS[@]}"; git rev-parse HEAD; } 2>/dev/null | git hash-object --stdin)
NIAH_SOURCES=(docs/logh7-roadmap-current.md .ai/known-issues.md .ai/task.md)
niah_now=$({ for path in "${NIAH_SOURCES[@]}"; do printf '%s\n' "$path"; [ ! -f "$path" ] || git hash-object "$path"; done; git status --porcelain -- "${NIAH_SOURCES[@]}"; git diff HEAD -- "${NIAH_SOURCES[@]}"; } 2>/dev/null | git hash-object --stdin)
work_changed=0
niah_changed=0
[ "$work_now" != "$(cat "$STATE_DIR/work.hash")" ] && work_changed=1
[ "$niah_now" != "$(cat "$STATE_DIR/niah-sources.hash" 2>/dev/null)" ] && niah_changed=1
[ "$work_changed" -eq 0 ] && [ "$niah_changed" -eq 0 ] && exit 0

docs_now=$({ git status --porcelain -- docs; git diff HEAD -- docs; } 2>/dev/null | git hash-object --stdin)
claudemd_now=$(git hash-object CLAUDE.md 2>/dev/null)
agentsmd_now=$(git hash-object AGENTS.md 2>/dev/null)

missing=""
if [ ! -d docs ] || [ "$docs_now" = "$(cat "$STATE_DIR/docs.hash")" ]; then
  missing="docs"
fi
if [ ! -f CLAUDE.md ] || [ "$claudemd_now" = "$(cat "$STATE_DIR/claudemd.hash")" ]; then
  missing="${missing:+$missing, }CLAUDE.md"
fi
if [ ! -f AGENTS.md ] || [ "$agentsmd_now" = "$(cat "$STATE_DIR/agentsmd.hash")" ]; then
  missing="${missing:+$missing, }AGENTS.md"
fi

if [ -f .ai/current-state.md ]; then
  ai_state_now=$(git hash-object .ai/current-state.md 2>/dev/null)
  [ "$ai_state_now" = "$(cat "$STATE_DIR/ai-state.hash" 2>/dev/null)" ] && missing="${missing:+$missing, }.ai/current-state.md"
else
  missing="${missing:+$missing, }.ai/current-state.md"
fi

VAULT="${LOGH7_VAULT_DIR:-}"
if [ -n "$VAULT" ] && [ -d "$VAULT" ]; then
  vault_now=$(find "$VAULT" -type f -exec git hash-object -- {} + 2>/dev/null \
    | LC_ALL=C sort | git hash-object --stdin)
  [ "$vault_now" = "$(cat "$STATE_DIR/vault.hash" 2>/dev/null)" ] && missing="${missing:+$missing, }LOGH7_VAULT_DIR"
fi

if [ "$niah_changed" -eq 1 ]; then
  keyfacts_now=$({ [ ! -f .ai/key-facts.md ] || git hash-object .ai/key-facts.md; git status --porcelain -- .ai/key-facts.md; git diff HEAD -- .ai/key-facts.md; } 2>/dev/null | git hash-object --stdin)
  [ "$keyfacts_now" = "$(cat "$STATE_DIR/key-facts.hash" 2>/dev/null)" ] && missing="${missing:+$missing, }.ai/key-facts.md"
fi

[ -z "$missing" ] && exit 0

printf '%s\n' $((retries + 1)) > "$STATE_DIR/stop-retries"
python3 - "$missing" <<'PY'
import json
import sys

missing = sys.argv[1]
reason = (
    "Files changed during this turn, but required current documentation is unchanged: "
    f"{missing}. Update the relevant docs, AGENTS.md, session state, and configured "
    "LOGH7 vault notes, or explicitly document why an update is unnecessary."
)
print(json.dumps({"decision": "block", "reason": reason}, ensure_ascii=False))
PY
exit 0
