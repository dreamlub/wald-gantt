-- issue_relations 테이블 — 이슈 간 비계층(다대다) 관계 (2026-05-30)
-- parent_issue_id = 계층 관계(트리·실선), issue_relations = 비계층 관계(점선)
-- 방향 규칙: from_issue_id → to_issue_id 는 항상 "from이 to에 영향을 준다"로 고정
--   causes    : from이 to를 유발함
--   blocks    : from이 to를 막고 있음
--   recurs_as : from이 to로 재발함
--   continues : from이 to로 이어짐(연속)
--   related   : 단순 연관 (무방향이나 from 기준 1행으로 저장)

CREATE TABLE IF NOT EXISTS issue_relations (
  id             uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id   uuid        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  from_issue_id  uuid        NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  to_issue_id    uuid        NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  relation_type  text        NOT NULL CHECK (relation_type IN ('causes', 'blocks', 'recurs_as', 'continues', 'related')),
  note           text,
  created_at     timestamptz DEFAULT now(),
  -- 같은 방향·타입의 중복 관계 방지
  UNIQUE (from_issue_id, to_issue_id, relation_type),
  -- 자기 자신과의 관계 금지
  CHECK (from_issue_id <> to_issue_id)
);

-- from 기준 조회 (한 이슈가 영향을 주는 대상들)
CREATE INDEX IF NOT EXISTS idx_issue_relations_from
  ON issue_relations (from_issue_id);

-- to 기준 조회 (한 이슈에 영향을 주는 원인들)
CREATE INDEX IF NOT EXISTS idx_issue_relations_to
  ON issue_relations (to_issue_id);

-- 워크스페이스 전체 관계 일괄 조회 (Timeline 로딩)
CREATE INDEX IF NOT EXISTS idx_issue_relations_workspace
  ON issue_relations (workspace_id);

ALTER TABLE issue_relations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace members can access issue_relations"
  ON issue_relations FOR ALL
  USING (workspace_id IN (
    SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
  ))
  WITH CHECK (workspace_id IN (
    SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
  ));
