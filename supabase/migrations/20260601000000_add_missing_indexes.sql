-- client_history.issue_id 인덱스 (이슈별 히스토리 필터 성능)
CREATE INDEX IF NOT EXISTS idx_client_history_issue_id
  ON client_history(issue_id)
  WHERE issue_id IS NOT NULL;

-- review_candidates 복합 인덱스 (status + 날짜순 필터 성능)
CREATE INDEX IF NOT EXISTS idx_review_candidates_workspace_status_date
  ON review_candidates(workspace_id, status, source_date DESC);
