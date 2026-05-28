-- daily_report_shares: 데일리 리포트 공개 공유 토큰
create table if not exists daily_report_shares (
  id          uuid primary key default gen_random_uuid(),
  token       text unique not null default encode(gen_random_bytes(18), 'hex'),
  report_date date not null,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  created_at  timestamptz not null default now()
);

-- report_date + workspace_id 조합은 1개 토큰만 (upsert용)
create unique index if not exists daily_report_shares_date_ws
  on daily_report_shares (report_date, workspace_id);

-- 공개 조회: 토큰으로 daily_reports 데이터 조회 (RLS 우회)
create or replace function get_shared_daily_report(p_token text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_date date;
  v_ws   uuid;
  v_row  record;
begin
  select report_date, workspace_id
    into v_date, v_ws
    from daily_report_shares
   where token = p_token;

  if not found then
    return null;
  end if;

  select dr.report_date, dr.content, dr.item_count, dr.brand_count, dr.analyzed_at
    into v_row
    from daily_reports dr
   where dr.report_date = v_date
     and dr.workspace_id = v_ws
   limit 1;

  if not found then
    return null;
  end if;

  return json_build_object(
    'report_date', v_row.report_date,
    'content',     v_row.content,
    'item_count',  v_row.item_count,
    'brand_count', v_row.brand_count,
    'analyzed_at', v_row.analyzed_at
  );
end;
$$;

-- 토큰 발급/조회 함수 (인증 사용자 전용)
create or replace function upsert_daily_report_share(p_date date, p_workspace_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text;
begin
  insert into daily_report_shares (report_date, workspace_id)
  values (p_date, p_workspace_id)
  on conflict (report_date, workspace_id) do nothing;

  select token into v_token
    from daily_report_shares
   where report_date = p_date
     and workspace_id = p_workspace_id;

  return v_token;
end;
$$;

-- 공개 조회 함수는 anon 역할도 호출 가능 (security definer로 RLS 우회)
grant execute on function get_shared_daily_report(text) to anon, authenticated;
-- 토큰 발급은 인증된 사용자만
grant execute on function upsert_daily_report_share(date, uuid) to authenticated;
