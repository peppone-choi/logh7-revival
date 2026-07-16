#!/usr/bin/env bash
# PostToolUse(Edit|Write) 훅 — 편집된 파일을 scripts/agent/verify-changes.sh --file 로 검증.
# 실패 시 exit 2 + stderr → 에이전트에 피드백. 로직 정본은 scripts/agent/ (Codex도 수동 실행).
# 무한 수정 루프 방지: 같은 파일 연속 실패 6회부터는 차단 대신 경고만 남긴다.
PROJECT_ROOT="${CLAUDE_PROJECT_DIR:-${CODEX_PROJECT_DIR:-.}}"
cd "$PROJECT_ROOT" 2>/dev/null || exit 0
HOOK_INPUT="$(cat)"
FILE=$(printf '%s' "$HOOK_INPUT" | python3 -c '
import json, sys
try:
    d = json.load(sys.stdin)
    print(d.get("tool_input", {}).get("file_path", ""))
except Exception:
    pass' 2>/dev/null)
[ -n "$FILE" ] || exit 0
[ -f "scripts/agent/verify-changes.sh" ] || exit 0

S=.claude/state; mkdir -p "$S"
KEY=$(printf '%s' "$FILE" | git hash-object --stdin 2>/dev/null || echo k)
CNT="$S/verify-fail-$KEY"

OUT=$(bash scripts/agent/verify-changes.sh --file "$FILE" 2>&1); rc=$?
if [ $rc -ne 0 ]; then
  n=$(cat "$CNT" 2>/dev/null || echo 0)
  echo $((n + 1)) > "$CNT"
  if [ "$n" -ge 5 ]; then
    echo "verify-changes: 같은 파일 검증 실패 6회째 — 자동 피드백 중단. Blocked-Loop Rule에 따라 접근을 바꾸고 사람에게 보고하라: $FILE" >&2
    exit 0
  fi
  echo "$OUT" >&2
  exit 2
fi
rm -f "$CNT" 2>/dev/null
exit 0
