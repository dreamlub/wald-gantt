-- notes 테이블에 링크(태스크/프로젝트 연결) 컬럼 추가
ALTER TABLE notes
  ADD COLUMN IF NOT EXISTS links JSONB NOT NULL DEFAULT '[]'::jsonb;
