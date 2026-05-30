-- issues 테이블 — MCP로 직접 생성한 것을 역추적해서 기록 (2026-05-30)
-- 브랜드별 슬랙 메시지를 Claude가 이슈/프로젝트/결정으로 분류한 결과를 저장
-- seed: POST /api/issues/seed  조회: GET /api/issues

CREATE TABLE IF NOT EXISTS issues (
  id               uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id     uuid        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  brand_name       text        NOT NULL,
  title            text        NOT NULL,
  type             text        NOT NULL CHECK (type IN ('issue', 'project', 'decision')),
  priority         text        CHECK (priority IN ('high', 'medium', 'low')),
  status           text        NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  body             text,
  action           text,
  first_seen       timestamptz,
  last_seen        timestamptz,
  parent_issue_id  uuid        REFERENCES issues(id) ON DELETE SET NULL,
  created_at       timestamptz DEFAULT now()
);

-- 브랜드별 조회 (메인 쿼리 패턴)
CREATE INDEX IF NOT EXISTS idx_issues_workspace_brand
  ON issues (workspace_id, brand_name);

-- 상태별 필터
CREATE INDEX IF NOT EXISTS idx_issues_workspace_status
  ON issues (workspace_id, status);

-- last_seen 정렬 (active/quiet/dormant 계산 기반)
CREATE INDEX IF NOT EXISTS idx_issues_last_seen
  ON issues (workspace_id, last_seen DESC);

-- 트리 뷰용 부모-자식 조회
CREATE INDEX IF NOT EXISTS idx_issues_parent
  ON issues (parent_issue_id)
  WHERE parent_issue_id IS NOT NULL;

ALTER TABLE issues ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace members can access issues"
  ON issues FOR ALL
  USING (workspace_id IN (
    SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
  ))
  WITH CHECK (workspace_id IN (
    SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
  ));

-- client_history에 issue_id 역참조 컬럼 추가 (seed 시 메시지에 링크)
ALTER TABLE client_history
  ADD COLUMN IF NOT EXISTS issue_id uuid REFERENCES issues(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ch_issue_id
  ON client_history (issue_id)
  WHERE issue_id IS NOT NULL;
