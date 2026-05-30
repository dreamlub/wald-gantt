-- 완료 태스크 스냅샷: 아카이브 시점의 데이터를 보존
-- gantt_tasks는 30일 후 영구 삭제되지만 이 테이블은 통계용으로 유지
CREATE TABLE task_completions (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID        NOT NULL,
  task_id         UUID        NOT NULL,
  title           TEXT        NOT NULL,
  assignee        TEXT,
  type            TEXT        NOT NULL DEFAULT 'mine',
  priority        SMALLINT    NOT NULL DEFAULT 0,
  labels          TEXT[]      NOT NULL DEFAULT '{}',
  projects        JSONB       NOT NULL DEFAULT '[]', -- [{id, name}]
  start_date      DATE,
  due_date        DATE,
  completed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 동일 task_id 중복 스냅샷 방지
CREATE UNIQUE INDEX ON task_completions (task_id);

CREATE INDEX ON task_completions (workspace_id, completed_at);
CREATE INDEX ON task_completions (workspace_id, assignee);
