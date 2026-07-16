#!/usr/bin/env bash
# 턴 시작 시 작업트리 상태 스냅샷 — Stop 문서 게이트(stop-doc-gate.sh)의 비교 기준.
# UserPromptSubmit 훅: stdout은 컨텍스트로 주입되므로 아무것도 출력하지 않는다.
cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || exit 0
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || exit 0
mkdir -p .claude/state

# 실작업 범위 = 문서·설정을 뺀 나머지 (docs/, CLAUDE.md, AGENTS.md, .claude/ 제외)
EXCL=(':(exclude)docs' ':(exclude).claude' ':(exclude)CLAUDE.md' ':(exclude)AGENTS.md')

{ git status --porcelain -- . "${EXCL[@]}"; git diff -- . "${EXCL[@]}"; git diff --cached -- . "${EXCL[@]}"; git rev-parse HEAD; } 2>/dev/null \
  | sha1sum | cut -d' ' -f1 > .claude/state/work.hash
{ git status --porcelain -- docs; git diff HEAD -- docs; } 2>/dev/null \
  | sha1sum | cut -d' ' -f1 > .claude/state/docs.hash
sha1sum CLAUDE.md 2>/dev/null | cut -d' ' -f1 > .claude/state/claudemd.hash

# 옵시디언 볼트 프로젝트 노트 (mtime 목록 해시 — 볼트는 git 밖)
VAULT="/e/obsidian-tech-vault/1. 프로젝트/은하영웅전설 7 리바이벌"
if [ -d "$VAULT" ]; then
  find "$VAULT" -type f -printf '%T@ %p\n' 2>/dev/null | sort | sha1sum | cut -d' ' -f1 > .claude/state/vault.hash
else
  : > .claude/state/vault.hash
fi
rm -f .claude/state/stop-retries
exit 0
