create table if not exists workspace_api_keys (
  workspace_id uuid not null references workspaces(id) on delete cascade,
  key_name     text not null,
  key_value    text not null,
  updated_at   timestamptz not null default now(),
  primary key (workspace_id, key_name)
);

alter table workspace_api_keys enable row level security;

create policy "workspace members can manage api keys"
  on workspace_api_keys for all
  using (
    workspace_id in (
      select workspace_id from workspace_members where user_id = auth.uid()
    )
  );
