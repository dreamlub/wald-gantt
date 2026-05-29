-- 캘린더 전용 이벤트 (할일과 분리). 빈 시간대 클릭으로 생성 → 구글 캘린더 동기화
create table if not exists calendar_events (
  id               uuid primary key default gen_random_uuid(),
  workspace_id     uuid not null references workspaces(id) on delete cascade,
  title            text not null default '',
  scheduled_at     timestamptz not null,
  duration_minutes integer not null default 60,
  google_event_id  text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

alter table calendar_events enable row level security;

create policy "workspace members can manage calendar events"
  on calendar_events for all
  using (
    workspace_id in (
      select workspace_id from workspace_members where user_id = auth.uid()
    )
  );

create index if not exists idx_calendar_events_workspace
  on calendar_events (workspace_id, scheduled_at);
