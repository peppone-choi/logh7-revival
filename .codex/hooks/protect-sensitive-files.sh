#!/usr/bin/env bash
# PreToolUse 훅 — 비밀/민감 파일 접근 차단 (Read/Edit/Write/NotebookEdit/Bash).
# exit 2 = 차단(stderr가 에이전트에 전달). 스키마는 exit-code 방식(버전 간 가장 안정적)을 쓴다.
# 보호 목록 근거: .ai/decisions.md ADR-LITE-003 (표준 목록).
SCRIPT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PROJECT_ROOT="${CODEX_PROJECT_DIR:-${CLAUDE_PROJECT_DIR:-$SCRIPT_ROOT}}"
cd "$PROJECT_ROOT" 2>/dev/null || exit 0
HOOK_INPUT="$(cat)"
export HOOK_INPUT
python3 - <<'PY'
import json, os, re, sys

try:
    d = json.loads(os.environ.get("HOOK_INPUT") or "{}")
except Exception:
    sys.exit(0)

tool = d.get("tool_name", "")
ti = d.get("tool_input", {}) or {}

# basename 기준 보호 패턴. .env.example/.env.sample/.env.template은 허용.
PROT = re.compile(
    r"^(\.env.*|.*\.pem|.*\.key|credentials.*|secrets.*|terraform\.tfstate.*)$", re.I)
ALLOW = re.compile(r"^\.env\.(example|sample|template)$", re.I)

def protected(path):
    b = os.path.basename(path.rstrip("/"))
    return bool(PROT.match(b)) and not ALLOW.match(b)

hits = set()
if tool in ("Read", "Edit", "Write", "NotebookEdit"):
    p = ti.get("file_path") or ti.get("notebook_path") or ""
    if p and protected(p):
        hits.add(p)
elif tool == "apply_patch":
    command = ti.get("command", "")
    for path in re.findall(
            r"^\*\*\* (?:Add|Update|Delete) File: (.+)$|^\*\*\* Move to: (.+)$",
            command,
            re.MULTILINE):
        candidate = next((value for value in path if value), "").strip()
        if candidate and protected(candidate):
            hits.add(candidate)
elif tool == "Bash":
    for tok in re.findall(r"""[^\s"';|&()<>]+""", ti.get("command", "")):
        if protected(tok):
            hits.add(tok)

if hits:
    sys.stderr.write(
        "protect-sensitive-files: 차단 — 민감 파일 접근: %s. 비밀값은 읽거나 출력하지 않는다. "
        "설정 예시가 필요하면 .env.example 등 안전한 대체 파일을 사용하라.\n"
        % ", ".join(sorted(hits)))
    sys.exit(2)
sys.exit(0)
PY
exit $?
