@AGENTS.md

## File size limit
**500줄 초과 금지.** 파일이 500줄을 넘으면 컴포넌트·함수·훅으로 분리한다. 예외 없음.

## 타임존 원칙 (위반 시 데이터 오염)
- `client_history.occurred_at` → **순수 UTC** 저장. `to_timestamp(parent_ts::float)` 그대로 사용. `+ INTERVAL '9 hours'` 절대 금지.
- KST 변환은 API/쿼리 레이어에서만: `AT TIME ZONE 'Asia/Seoul'` 또는 날짜 필터에 `+09:00` suffix.
- JS에서 날짜 슬라이스 시 UTC 기준이므로 `toKSTDate()` 변환 후 슬라이스.
- 위반 사례: 과거 에이전트가 +9h를 저장값에 직접 삽입해 166건 오염 발생.
