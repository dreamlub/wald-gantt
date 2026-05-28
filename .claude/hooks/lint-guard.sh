#!/usr/bin/env bash
# PostToolUse(Write|Edit) 훅 — 방금 수정한 TS/TSX 파일을 즉시 검사한다.
#  (1) 500줄 초과 금지 (CLAUDE.md 규칙)
#  (2) ESLint 에러 + 경고 (React 19 react-hooks/set-state-in-effect, no-unused-vars 등)
# 문제가 있으면 exit 2 로 모델에 피드백하여 바로 고치게 한다.
set -uo pipefail

input=$(cat)
f=$(printf '%s' "$input" | jq -r '.tool_input.file_path // .tool_response.filePath // empty')
[ -z "$f" ] && exit 0

case "$f" in
  *.ts|*.tsx) ;;
  *) exit 0 ;;
esac
[ -f "$f" ] || exit 0

problems=""

# (1) 500줄 초과
lines=$(wc -l < "$f" | tr -d ' ')
if [ "$lines" -gt 500 ]; then
  problems+="📏 ${f} 가 ${lines}줄입니다 — 500줄 초과 금지(CLAUDE.md). 컴포넌트·훅·유틸로 분리하세요."$'\n'
fi

# (2) ESLint (--max-warnings 0 으로 경고도 차단)
if [ -x node_modules/.bin/eslint ]; then
  lint_out=$(node_modules/.bin/eslint --max-warnings 0 "$f" 2>&1)
  if [ $? -ne 0 ]; then
    problems+="🔍 ESLint (${f}):"$'\n'"${lint_out}"$'\n'
  fi
fi

if [ -n "$problems" ]; then
  printf '%s' "$problems" >&2
  exit 2
fi
exit 0
