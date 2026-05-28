-- client_history 성능 인덱스
-- occurred_at DESC 정렬 + deleted_at IS NULL 필터가 모든 쿼리에 공통으로 사용됨

-- 주 조회 인덱스: workspace_id + occurred_at 범위 쿼리 + 정렬
CREATE INDEX IF NOT EXISTS idx_ch_workspace_occurred
  ON client_history (workspace_id, occurred_at DESC)
  WHERE deleted_at IS NULL;

-- 브랜드 필터 인덱스
CREATE INDEX IF NOT EXISTS idx_ch_workspace_brand
  ON client_history (workspace_id, brand_name)
  WHERE deleted_at IS NULL;

-- priority 필터 인덱스
CREATE INDEX IF NOT EXISTS idx_ch_workspace_priority
  ON client_history (workspace_id, priority)
  WHERE deleted_at IS NULL;
