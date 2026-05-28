-- 앱에서 시간 배치한 태스크를 구글 캘린더 이벤트와 연결 (앱→구글 동기화)
ALTER TABLE gantt_tasks ADD COLUMN IF NOT EXISTS google_event_id text;
COMMENT ON COLUMN gantt_tasks.google_event_id IS '연결된 구글 캘린더 이벤트 ID (앱→구글 단방향 동기화)';
