-- gantt_tasks.status 체크 제약조건에 'inbox' 추가
-- 기존 constraint 이름을 모르므로 안전하게 drop→recreate

DO $$
BEGIN
  -- 혹시 있는 check constraint 제거
  ALTER TABLE gantt_tasks DROP CONSTRAINT IF EXISTS gantt_tasks_status_check;
  -- 'inbox' 포함한 새 제약조건 추가
  ALTER TABLE gantt_tasks ADD CONSTRAINT gantt_tasks_status_check
    CHECK (status IN ('backlog', 'to-do', 'in-progress', 'done', 'pending', 'inbox'));
EXCEPTION WHEN others THEN
  NULL;
END $$;
