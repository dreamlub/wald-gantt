-- 1. notes.status: inbox(기본) / reviewed / archived
ALTER TABLE notes
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'inbox'
    CHECK (status IN ('inbox', 'reviewed', 'archived'));

-- 2. review_candidates source CHECK에 'note' 추가
ALTER TABLE review_candidates
  DROP CONSTRAINT IF EXISTS review_candidates_source_check;

ALTER TABLE review_candidates
  ADD CONSTRAINT review_candidates_source_check
    CHECK (source IN ('history', 'daily_report', 'weekly', 'note'));
