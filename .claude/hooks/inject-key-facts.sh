#!/usr/bin/env bash
# 매 턴 NIAH 키팩트 카드 재주입 — UserPromptSubmit 훅. stdout은 컨텍스트로 주입된다.
# fail-open 계약: 카드 부재·읽기 실패 등 전 실패 경로에서 exit 0 + 빈 stdout. 프롬프트 block 금지.
PROJECT_ROOT="${CLAUDE_PROJECT_DIR:-${CODEX_PROJECT_DIR:-.}}"
cd "$PROJECT_ROOT" 2>/dev/null || exit 0

CARD=".ai/key-facts.md"
[ -f "$CARD" ] && [ -r "$CARD" ] || exit 0

content=$(head -n 40 "$CARD" 2>/dev/null) || exit 0
[ -n "$content" ] || exit 0

printf '[KEY-FACTS — 자동 재주입]\n%s\n' "$content"
exit 0
