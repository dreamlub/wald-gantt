@AGENTS.md

## File size limit
**500줄 초과 금지.** 파일이 500줄을 넘으면 컴포넌트·함수·훅으로 분리한다. 예외 없음.

## 작업 기록 워크플로우 (메모리 의존 금지)
기억에만 의존하면 작업내역이 샌다. 일감과 작업내역은 **개인 Obsidian vault**에 남긴다(로컬·비공개·무료). 공개 repo에는 개인 트래킹을 작성하지 않는다.
- **일감 → Obsidian Kanban** ("할 일"): Kanban 플러그인 보드로 백로그·진행·완료 트래킹. 새 작업은 보드 카드로 먼저 등록.
- **작업내역 → Obsidian 노트** ("한 일"): 의미 있는 변경을 끝낸 세션 종료 시 날짜·요약을 노트에 추가.
- 원격 환경의 에이전트는 로컬 vault에 직접 접근할 수 없다. 세션 종료 시 **작업내역 요약(마크다운)을 사용자에게 제공**해 vault에 붙여넣게 한다. (vault를 private git repo로 두면 그 repo에서 작업할 때 에이전트도 직접 기록 가능.)
- 과거 `DEVLOG.md`(대용량)는 히스토리 보존용으로 그대로 두고, 신규 내역은 Obsidian에 남긴다.

## 타임존 원칙 (위반 시 데이터 오염)
- `client_history.occurred_at` → **순수 UTC** 저장. `to_timestamp(parent_ts::float)` 그대로 사용. `+ INTERVAL '9 hours'` 절대 금지.
- KST 변환은 API/쿼리 레이어에서만: `AT TIME ZONE 'Asia/Seoul'` 또는 날짜 필터에 `+09:00` suffix.
- JS에서 날짜 슬라이스 시 UTC 기준이므로 `toKSTDate()` 변환 후 슬라이스.
- 위반 사례: 과거 에이전트가 +9h를 저장값에 직접 삽입해 166건 오염 발생.
