create table if not exists brand_profiles (
  workspace_id  uuid not null references workspaces(id) on delete cascade,
  name          text not null,
  logo_url      text,
  lucide_icon   text,
  primary key (workspace_id, name)
);

alter table brand_profiles enable row level security;

create policy "workspace members can manage brand profiles"
  on brand_profiles for all
  using (
    workspace_id in (
      select workspace_id from workspace_members where user_id = auth.uid()
    )
  );
