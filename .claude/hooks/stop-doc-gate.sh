#!/usr/bin/env bash
# Stop 문서 게이트: 실작업(코드 등 문서 외 파일 변경)이 있었던 턴은
# docs/ 문서와 CLAUDE.md 현행화까지 마쳐야 종료할 수 있다.
# 순수 질답 턴(파일 무변경)은 통과. 무한루프 방지: 턴당 최대 2회 차단.
cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || exit 0
S=.claude/state
[ -f "$S/work.hash" ] || exit 0

n=$(cat "$S/stop-retries" 2>/dev/null || echo 0)
[ "$n" -ge 2 ] 2>/dev/null && exit 0

EXCL=(':(exclude)docs' ':(exclude).claude' ':(exclude)CLAUDE.md' ':(exclude)AGENTS.md')
work_now=$({ git status --porcelain -- . "${EXCL[@]}"; git diff -- . "${EXCL[@]}"; git diff --cached -- . "${EXCL[@]}"; git rev-parse HEAD; } 2>/dev/null | sha1sum | cut -d' ' -f1)
[ "$work_now" = "$(cat "$S/work.hash")" ] && exit 0  # 이번 턴 실작업 없음 → 통과

docs_now=$({ git status --porcelain -- docs; git diff HEAD -- docs; } 2>/dev/null | sha1sum | cut -d' ' -f1)
md_now=$(sha1sum CLAUDE.md 2>/dev/null | cut -d' ' -f1)

missing=""
[ "$docs_now" = "$(cat "$S/docs.hash")" ] && missing="docs/ 관련 문서"
[ "$md_now" = "$(cat "$S/claudemd.hash")" ] && missing="${missing:+$missing, }CLAUDE.md"

# 옵시디언 볼트 프로젝트 노트 — 볼트가 존재하는 머신에서만 검사
VAULT="/e/obsidian-tech-vault/1. 프로젝트/은하영웅전설 7 리바이벌"
if [ -d "$VAULT" ]; then
  vault_now=$(find "$VAULT" -type f -printf '%T@ %p\n' 2>/dev/null | sort | sha1sum | cut -d' ' -f1)
  [ "$vault_now" = "$(cat "$S/vault.hash" 2>/dev/null)" ] && missing="${missing:+$missing, }옵시디언 볼트(1. 프로젝트/은하영웅전설 7 리바이벌)"
fi
[ -z "$missing" ] && exit 0

echo $((n+1)) > "$S/stop-retries"
printf '{"decision":"block","reason":"작업 미완료: 이번 턴에서 파일이 변경됐지만 [%s]가 갱신되지 않았다. 이 프로젝트에서 일은 문서 현행화까지 해야 끝난다. (1) 이번 작업 결과를 관련 docs/ 문서(로드맵·핸드오프·RE 정본 등)에 반영하고 (2) CLAUDE.md 현재 상태/규칙을 갱신하고 (3) 옵시디언 볼트 E:/obsidian-tech-vault/1. 프로젝트/은하영웅전설 7 리바이벌/ 의 관련 노트(현재 상태·로드맵·핸드오프)를 갱신하라. 정말 반영할 내용이 없다면 그 근거를 사용자 보고에 명시하라."}' "$missing"
exit 0
