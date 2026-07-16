#!/usr/bin/env bash
set -u

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT" || exit 1

TMP="$(mktemp -d "${TMPDIR:-/tmp}/logh7-codex-hooks.XXXXXX")"
trap 'rm -rf "$TMP"' EXIT

passed=0
failed=0

pass() {
  passed=$((passed + 1))
  printf 'PASS: %s\n' "$1"
}

fail() {
  failed=$((failed + 1))
  printf 'FAIL: %s\n' "$1" >&2
}

if python3 -m json.tool .codex/hooks.json >/dev/null 2>&1; then
  pass "hooks.json parses"
else
  fail "hooks.json does not parse"
fi

bad_commands="$(python3 - .codex/hooks.json <<'PY'
import json
import sys

with open(sys.argv[1], encoding="utf-8") as handle:
    groups = json.load(handle).get("hooks", {})

for event, matchers in groups.items():
    for matcher in matchers:
        for hook in matcher.get("hooks", []):
            command = hook.get("command", "")
            if "git rev-parse --show-toplevel" not in command:
                print(f"{event}: {command}")
PY
)"
if [ -z "$bad_commands" ]; then
  pass "all hook commands resolve through the Git root"
else
  fail "relative hook command can break below repo root: $bad_commands"
fi

session_command="$(python3 - .codex/hooks.json <<'PY'
import json
import sys

data = json.load(open(sys.argv[1], encoding="utf-8"))
hooks = data["hooks"]["SessionStart"][0]["hooks"]
print(hooks[0]["command"])
PY
)"
case "$session_command" in
  *"--check"*) session_checks=1 ;;
  *) session_checks=0 ;;
esac
case "$session_command" in
  *"--once"*) session_once=1 ;;
  *) session_once=0 ;;
esac
if [ "$session_checks" -eq 1 ] && [ "$session_once" -eq 0 ]; then
  pass "SessionStart checks skills on every project open"
else
  fail "SessionStart uses a persistent once-only stamp: $session_command"
fi

for protected_name in .env .envrc terraform.tfstate terraform.tfstatebackup; do
  protected_payload="$(python3 - "$protected_name" <<'PY'
import json
import sys

path = sys.argv[1]
command = f"*** Begin Patch\n*** Add File: {path}\n+SECRET=x\n*** End Patch"
print(json.dumps({
    "session_id": "test-protect",
    "tool_name": "apply_patch",
    "tool_input": {"command": command},
}))
PY
)"
  protect_out="$(printf '%s' "$protected_payload" | CODEX_PROJECT_DIR="$ROOT" bash .codex/hooks/protect-sensitive-files.sh 2>&1)"
  protect_rc=$?
  if [ "$protect_rc" -eq 2 ]; then
    pass "apply_patch blocks protected path: $protected_name"
  else
    fail "apply_patch allowed protected path $protected_name (exit=$protect_rc, output=$protect_out)"
  fi
done

allowed_patch='{"session_id":"test-allow","tool_name":"apply_patch","tool_input":{"command":"*** Begin Patch\n*** Add File: .env.example\n+SAFE=x\n*** End Patch"}}'
allow_out="$(printf '%s' "$allowed_patch" | CODEX_PROJECT_DIR="$ROOT" bash .codex/hooks/protect-sensitive-files.sh 2>&1)"
allow_rc=$?
if [ "$allow_rc" -eq 0 ]; then
  pass ".env.example remains allowed"
else
  fail ".env.example was blocked (exit=$allow_rc, output=$allow_out)"
fi

inject_out="$(cd server && printf '%s' '{"session_id":"lower-cwd","cwd":"server"}' | env -u CODEX_PROJECT_DIR -u CLAUDE_PROJECT_DIR bash ../.codex/hooks/inject-key-facts.sh 2>&1)"
case "$inject_out" in
  *"[KEY-FACTS"*) pass "key facts inject below the repository root" ;;
  *) fail "key facts hook became a no-op below the repository root: $inject_out" ;;
esac

bad_shell="$TMP/broken.sh"
printf '#!/usr/bin/env bash\nif then\n' > "$bad_shell"
verify_payload="$(python3 - "$bad_shell" <<'PY'
import json
import sys

path = sys.argv[1]
patch = f"*** Begin Patch\n*** Update File: {path}\n@@\n-old\n+new\n*** End Patch"
print(json.dumps({
    "session_id": "test-verify",
    "tool_name": "apply_patch",
    "tool_input": {"command": patch},
    "tool_response": {"success": True},
}))
PY
)"
verify_out="$(printf '%s' "$verify_payload" | CODEX_PROJECT_DIR="$ROOT" bash .codex/hooks/verify-changes.sh 2>&1)"
verify_rc=$?
if [ "$verify_rc" -eq 2 ]; then
  pass "apply_patch paths receive changed-file verification"
else
  fail "changed-file verification did not run (exit=$verify_rc, output=$verify_out)"
fi

lower_fixture="$TMP/lower-fixture"
mkdir -p "$lower_fixture/.codex/hooks" "$lower_fixture/scripts/agent" "$lower_fixture/server"
cp .codex/hooks/verify-changes.sh "$lower_fixture/.codex/hooks/verify-changes.sh"
cp scripts/agent/verify-changes.sh "$lower_fixture/scripts/agent/verify-changes.sh"
printf '#!/usr/bin/env bash\nif then\n' > "$lower_fixture/server/broken.sh"
lower_payload="$(python3 - "$lower_fixture/server" <<'PY'
import json
import sys

cwd = sys.argv[1]
patch = "*** Begin Patch\n*** Update File: broken.sh\n@@\n-old\n+new\n*** End Patch"
print(json.dumps({
    "session_id": "lower-verify",
    "cwd": cwd,
    "tool_name": "apply_patch",
    "tool_input": {"command": patch},
}))
PY
)"
lower_out="$(cd "$lower_fixture/server" && printf '%s' "$lower_payload" | env -u CODEX_PROJECT_DIR -u CLAUDE_PROJECT_DIR bash ../.codex/hooks/verify-changes.sh 2>&1)"
lower_rc=$?
if [ "$lower_rc" -eq 2 ]; then
  pass "relative apply_patch paths resolve from hook input cwd"
else
  fail "relative apply_patch path resolved from the wrong directory (exit=$lower_rc, output=$lower_out)"
fi

fixture="$TMP/state-fixture"
mkdir -p "$fixture/.ai" "$fixture/docs"
git -C "$fixture" init -q
printf '# fixture\n' > "$fixture/AGENTS.md"
printf '# fixture\n' > "$fixture/CLAUDE.md"
printf '# state\n' > "$fixture/.ai/current-state.md"
printf '# task\n' > "$fixture/.ai/task.md"
printf '# issues\n' > "$fixture/.ai/known-issues.md"
printf '# facts\n' > "$fixture/.ai/key-facts.md"
printf '# roadmap\n' > "$fixture/docs/logh7-roadmap-current.md"
for session_id in state-a state-b; do
  printf '{"session_id":"%s","hook_event_name":"UserPromptSubmit"}' "$session_id" \
    | CODEX_PROJECT_DIR="$fixture" bash "$ROOT/.codex/hooks/turn-snapshot.sh" >/dev/null 2>&1
done

state_count=0
if [ -d "$fixture/.codex/state" ]; then
  state_count="$(find "$fixture/.codex/state" -mindepth 1 -maxdepth 1 -type d | wc -l | tr -d ' ')"
fi
if [ "$state_count" -eq 2 ] && [ ! -d "$fixture/.claude/state" ]; then
  pass "Codex hook state is isolated per session"
else
  fail "Codex state isolation failed (codex_state_dirs=$state_count)"
fi

mkdir -p "$fixture/.codex/hooks"
printf '#!/usr/bin/env bash\nexit 0\n' > "$fixture/.codex/hooks/example.sh"
stop_payload='{"session_id":"state-a","hook_event_name":"Stop","stop_hook_active":false}'
stop_out="$(printf '%s' "$stop_payload" | CODEX_PROJECT_DIR="$fixture" bash "$ROOT/.codex/hooks/stop-doc-gate.sh" 2>&1)"
stop_decision="$(printf '%s' "$stop_out" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("decision", ""))' 2>/dev/null)"
if [ "$stop_decision" = "block" ]; then
  pass "harness changes trigger the current-document gate"
else
  fail "harness change bypassed the document gate (output=$stop_out)"
fi

printf '{"session_id":"state-niah","hook_event_name":"UserPromptSubmit"}' \
  | CODEX_PROJECT_DIR="$fixture" bash "$ROOT/.codex/hooks/turn-snapshot.sh" >/dev/null 2>&1
printf '\nchanged\n' >> "$fixture/.ai/task.md"
niah_payload='{"session_id":"state-niah","hook_event_name":"Stop","stop_hook_active":false}'
niah_out="$(printf '%s' "$niah_payload" | CODEX_PROJECT_DIR="$fixture" bash "$ROOT/.codex/hooks/stop-doc-gate.sh" 2>&1)"
case "$niah_out" in
  *".ai/key-facts.md"*) pass "NIAH source changes require fresh key facts" ;;
  *) fail "NIAH source change bypassed key-facts freshness (output=$niah_out)" ;;
esac

workflow_skills="logh7-start-task logh7-analyze logh7-implement logh7-debug logh7-verify logh7-review logh7-checkpoint logh7-skill-manager"
for skill in $workflow_skills; do
  skill_file=".agents/skills/$skill/SKILL.md"
  if python3 - "$skill_file" "$skill" <<'PY'
import re
import sys
from pathlib import Path

path = Path(sys.argv[1])
name = sys.argv[2]
text = path.read_text(encoding="utf-8") if path.is_file() else ""
match = re.match(r"^---\n(.*?)\n---\n", text, re.S)
if not match:
    raise SystemExit(1)
frontmatter = match.group(1)
if not re.search(rf"^name:\s*{re.escape(name)}\s*$", frontmatter, re.M):
    raise SystemExit(1)
description = re.search(r"^description:\s*(.+)$", frontmatter, re.M)
if not description or "TODO" in description.group(1):
    raise SystemExit(1)
PY
  then
    pass "workflow skill has valid discovery metadata: $skill"
  else
    fail "workflow skill metadata is invalid: $skill_file"
  fi
done

install_out="$(bash scripts/agent/bootstrap-skills.sh --install vercel-labs/skills --skill example-skill --reviewed --dry-run 2>&1)"
install_rc=$?
install_tokens_ok="$(printf '%s' "$install_out" | python3 -c '
import shlex
import sys

expected = ["npx", "--yes", "skills", "add", "vercel-labs/skills", "--agent", "codex", "--skill", "example-skill", "--copy", "--yes"]
try:
    tokens = shlex.split(sys.stdin.read().strip())
except ValueError:
    tokens = []
print("yes" if tokens == expected and "-g" not in tokens and "--global" not in tokens else "no")
')"
if [ "$install_rc" -eq 0 ] && [ "$install_tokens_ok" = "yes" ]; then
  pass "skills.sh install is exact and project-scoped"
else
  fail "skills.sh project install command is unsafe (exit=$install_rc, output=$install_out)"
fi

for invalid_args in "--install -g/repo --skill safe" "--install owner/repo --skill -g"; do
  invalid_out="$(bash scripts/agent/bootstrap-skills.sh $invalid_args --reviewed --dry-run 2>&1)"
  invalid_rc=$?
  if [ "$invalid_rc" -ne 0 ]; then
    pass "skills.sh rejects option-like install input: $invalid_args"
  else
    fail "skills.sh accepted option-like install input: $invalid_args ($invalid_out)"
  fi
done

manifest_fixture="$TMP/manifest-fixture"
mkdir -p "$manifest_fixture/scripts/agent" "$manifest_fixture/.agents/skills"
cp scripts/agent/bootstrap-skills.sh "$manifest_fixture/scripts/agent/bootstrap-skills.sh"
printf '../escape\tcodex\ttest\n' > "$manifest_fixture/scripts/agent/required-skills.tsv"
manifest_out="$(cd "$manifest_fixture" && bash scripts/agent/bootstrap-skills.sh --check 2>&1)"
manifest_rc=$?
if [ "$manifest_rc" -ne 0 ]; then
  pass "bootstrap rejects traversal in the skill manifest"
else
  fail "bootstrap accepted an unsafe manifest name (output=$manifest_out)"
fi

printf '%s\n' '---'
printf 'Codex harness regression: %d passed, %d failed\n' "$passed" "$failed"
[ "$failed" -eq 0 ]
