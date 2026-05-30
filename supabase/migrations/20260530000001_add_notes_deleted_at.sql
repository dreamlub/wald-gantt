-- 메모 소프트 삭제용 deleted_at 컬럼
ALTER TABLE notes ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;
CREATE INDEX IF NOT EXISTS notes_deleted_at_idx ON notes (user_id, deleted_at);
