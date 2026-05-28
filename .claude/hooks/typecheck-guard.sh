#!/usr/bin/env bash
# Stop 훅 — 작업 종료 전 프로젝트 전체 TypeScript 타입 검사.
# 타입 에러가 남아 있으면 종료를 막고(decision: block) 모델에 피드백한다.
set -uo pipefail

cat >/dev/null   # stdin 소비

# 의존성 미설치(웹 세션 초기 등)면 조용히 통과
[ -x node_modules/.bin/tsc ] || exit 0

out=$(node_modules/.bin/tsc --noEmit 2>&1)
if [ $? -ne 0 ]; then
  reason=$(printf 'TypeScript 타입 에러가 남아 있습니다 — 종료 전 수정하세요:\n%s' "$out" | head -c 4000)
  jq -n --arg r "$reason" '{decision:"block", reason:$r}'
fi
exit 0
