-- Review Inbox: 액션 후보 검토 큐
CREATE TABLE IF NOT EXISTS review_candidates (
  id                uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id      uuid        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  source            text        NOT NULL CHECK (source IN ('history', 'daily_report', 'weekly')),
  source_id         text        NOT NULL,
  source_date       date        NOT NULL,
  title             text        NOT NULL,
  memo              text,
  brand             text,
  priority          text        CHECK (priority IN ('high', 'medium', 'low')),
  due_date          date,
  estimated_minutes integer,
  evidence_count    integer     DEFAULT 1,
  status            text        NOT NULL DEFAULT 'pending'
                                CHECK (status IN ('pending', 'created', 'snoozed', 'ignored')),
  task_id           uuid        REFERENCES gantt_tasks(id) ON DELETE SET NULL,
  reviewed_at       timestamptz,
  created_at        timestamptz DEFAULT now(),
  UNIQUE (workspace_id, source, source_id)
);

CREATE INDEX IF NOT EXISTS review_candidates_workspace_status
  ON review_candidates (workspace_id, status);

CREATE INDEX IF NOT EXISTS review_candidates_source_date
  ON review_candidates (workspace_id, source_date DESC);

ALTER TABLE review_candidates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace members can access review_candidates"
  ON review_candidates FOR ALL
  USING (workspace_id IN (
    SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
  ));
