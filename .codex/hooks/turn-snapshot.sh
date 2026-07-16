#!/usr/bin/env bash
SCRIPT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PROJECT_ROOT="${CODEX_PROJECT_DIR:-${CLAUDE_PROJECT_DIR:-$SCRIPT_ROOT}}"
cd "$PROJECT_ROOT" 2>/dev/null || exit 0
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || exit 0

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
mkdir -p "$STATE_DIR"

EXCLUSIONS=(':(exclude)docs' ':(exclude)CLAUDE.md' ':(exclude)AGENTS.md'
            ':(exclude).claude/state' ':(exclude).codex/state' ':(exclude).ai')

{ git status --porcelain -- . "${EXCLUSIONS[@]}"; git diff -- . "${EXCLUSIONS[@]}"; git diff --cached -- . "${EXCLUSIONS[@]}"; git rev-parse HEAD; } 2>/dev/null \
  | git hash-object --stdin > "$STATE_DIR/work.hash"
{ git status --porcelain -- docs; git diff HEAD -- docs; } 2>/dev/null \
  | git hash-object --stdin > "$STATE_DIR/docs.hash"
git hash-object CLAUDE.md 2>/dev/null > "$STATE_DIR/claudemd.hash"
git hash-object AGENTS.md 2>/dev/null > "$STATE_DIR/agentsmd.hash"
git hash-object .ai/current-state.md 2>/dev/null > "$STATE_DIR/ai-state.hash"
NIAH_SOURCES=(docs/logh7-roadmap-current.md .ai/known-issues.md .ai/task.md)
{ for path in "${NIAH_SOURCES[@]}"; do printf '%s\n' "$path"; [ ! -f "$path" ] || git hash-object "$path"; done; git status --porcelain -- "${NIAH_SOURCES[@]}"; git diff HEAD -- "${NIAH_SOURCES[@]}"; } 2>/dev/null \
  | git hash-object --stdin > "$STATE_DIR/niah-sources.hash"
{ [ ! -f .ai/key-facts.md ] || git hash-object .ai/key-facts.md; git status --porcelain -- .ai/key-facts.md; git diff HEAD -- .ai/key-facts.md; } 2>/dev/null \
  | git hash-object --stdin > "$STATE_DIR/key-facts.hash"

VAULT="${LOGH7_VAULT_DIR:-}"
if [ -n "$VAULT" ] && [ -d "$VAULT" ]; then
  find "$VAULT" -type f -exec git hash-object -- {} + 2>/dev/null \
    | LC_ALL=C sort | git hash-object --stdin > "$STATE_DIR/vault.hash"
else
  : > "$STATE_DIR/vault.hash"
fi
rm -f "$STATE_DIR/stop-retries"
exit 0
