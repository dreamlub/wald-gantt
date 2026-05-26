-- 브랜드 별칭 테이블: 같은 브랜드인데 다르게 분류된 이름을 정식 이름으로 통합
create table if not exists brand_aliases (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  alias_name text not null,
  canonical_name text not null,
  created_at timestamptz not null default now(),

  constraint uq_brand_alias unique (workspace_id, alias_name)
);

-- RLS
alter table brand_aliases enable row level security;

create policy "Users can manage their workspace aliases"
  on brand_aliases for all
  using (
    workspace_id in (
      select workspace_id from workspace_members where user_id = auth.uid()
    )
  );

-- 인덱스
create index if not exists idx_brand_aliases_workspace
  on brand_aliases (workspace_id);
